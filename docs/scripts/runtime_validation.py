import os
import sys
import json
import time
from datetime import datetime

import httpx


def write_line(f, text=""):
    f.write(text + "\n")
    f.flush()


def main():
    base_url = os.environ.get("API_BASE_URL", "http://localhost:8000/api/v1")
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@example.com")
    admin_password = os.environ.get("ADMIN_PASSWORD", "admin123")

    out_dir = os.path.join(os.path.dirname(__file__), "output")
    os.makedirs(out_dir, exist_ok=True)
    ts = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    out_path = os.path.join(out_dir, f"validation_{ts}.txt")

    with open(out_path, "w", encoding="utf-8") as f:
        write_line(f, f"[INFO] API_BASE_URL={base_url}")

        try:
            with httpx.Client(timeout=30.0) as client:
                # Login
                write_line(f, "\n== Login ==")
                login_resp = client.post(
                    f"{base_url}/auth/login",
                    json={"email": admin_email, "password": admin_password},
                )
                write_line(f, f"Status: {login_resp.status_code}")
                try:
                    write_line(f, json.dumps(login_resp.json(), indent=2, ensure_ascii=False))
                except Exception:
                    write_line(f, login_resp.text)
                if login_resp.status_code != 200:
                    write_line(f, "[ERROR] Login failed")
                    return 1
                token = login_resp.json().get("access_token")
                headers = {"Authorization": f"Bearer {token}"}

                # Runtime BEFORE
                write_line(f, "\n== Runtime BEFORE ==")
                rt_before = client.get(f"{base_url}/bot/runtime", headers=headers)
                write_line(f, f"Status: {rt_before.status_code}")
                rb = None
                try:
                    rb = rt_before.json()
                    write_line(f, json.dumps(rb, indent=2, ensure_ascii=False))
                except Exception:
                    write_line(f, rt_before.text)

                # Apply PUT temperature
                write_line(f, "\n== PUT temperature 0.3 ==")
                put_temp = client.put(
                    f"{base_url}/bot/config",
                    headers=headers,
                    json={"temperature": 0.3},
                )
                write_line(f, f"Status: {put_temp.status_code}")
                try:
                    write_line(f, json.dumps(put_temp.json(), indent=2, ensure_ascii=False))
                except Exception:
                    write_line(f, put_temp.text)

                # Apply PUT name + extras (UTF-8)
                write_line(f, "\n== PUT bot_name + ui_prompt_extra ==")
                put_extras = client.put(
                    f"{base_url}/bot/config",
                    headers=headers,
                    json={
                        "bot_name": "Asesor Académico",
                        "ui_prompt_extra": "Mantén respuestas concisas y amables.",
                    },
                )
                write_line(f, f"Status: {put_extras.status_code}")
                try:
                    write_line(f, json.dumps(put_extras.json(), indent=2, ensure_ascii=False))
                except Exception:
                    write_line(f, put_extras.text)

                # Runtime AFTER
                write_line(f, "\n== Runtime AFTER ==")
                rt_after = client.get(f"{base_url}/bot/runtime", headers=headers)
                write_line(f, f"Status: {rt_after.status_code}")
                ra = None
                try:
                    ra = rt_after.json()
                    write_line(f, json.dumps(ra, indent=2, ensure_ascii=False))
                except Exception:
                    write_line(f, rt_after.text)

                # Summary: evidencia de cambios aplicados
                write_line(f, "\n== Summary ==")
                try:
                    temp_before = rb.get("temperature") if isinstance(rb, dict) else None
                    temp_after = ra.get("temperature") if isinstance(ra, dict) else None
                    bot_before = rb.get("bot_name") if isinstance(rb, dict) else None
                    bot_after = ra.get("bot_name") if isinstance(ra, dict) else None
                    ui_len_before = rb.get("ui_prompt_extra_len") if isinstance(rb, dict) else None
                    ui_len_after = ra.get("ui_prompt_extra_len") if isinstance(ra, dict) else None
                    eff_len_before = rb.get("effective_personality_len") if isinstance(rb, dict) else None
                    eff_len_after = ra.get("effective_personality_len") if isinstance(ra, dict) else None

                    summary = {
                        "temperature": {"before": temp_before, "after": temp_after, "changed": temp_before != temp_after},
                        "bot_name": {"before": bot_before, "after": bot_after, "changed": bot_before != bot_after},
                        "ui_prompt_extra_len": {"before": ui_len_before, "after": ui_len_after, "changed": ui_len_before != ui_len_after},
                        "effective_personality_len": {"before": eff_len_before, "after": eff_len_after, "changed": eff_len_before != eff_len_after},
                        "notes": [
                            "Modo complemento: la base de core/prompt.py se mantiene y se suman extras desde UI.",
                            "system_prompt persistido (si aparece en PUT) no se usa como base en runtime.",
                        ],
                    }
                    write_line(f, json.dumps(summary, indent=2, ensure_ascii=False))
                except Exception as e:
                    write_line(f, f"[WARN] No se pudo generar resumen: {e}")

                # Chat precise (SSE)
                write_line(f, "\n== Chat precise (SSE) ==")
                precise_payload = {
                    "input": "Explica en dos líneas qué es una beca.",
                    "conversation_id": "py_preciso",
                }
                with client.stream(
                    "POST",
                    f"{base_url}/chat/stream_log",
                    json=precise_payload,
                ) as s:
                    for chunk in s.iter_text():
                        write_line(f, chunk.strip())

                # Chat creative (SSE)
                write_line(f, "\n== Chat creative (SSE) ==")
                creative_payload = {
                    "input": "Escribe un párrafo creativo sobre estudiar con becas.",
                    "conversation_id": "py_creativo",
                }
                with client.stream(
                    "POST",
                    f"{base_url}/chat/stream_log",
                    json=creative_payload,
                ) as s:
                    for chunk in s.iter_text():
                        write_line(f, chunk.strip())

        except Exception as e:
            write_line(f, f"[ERROR] Exception: {e}")
            return 2

    print(out_path)
    return 0


if __name__ == "__main__":
    code = main()
    sys.exit(code)