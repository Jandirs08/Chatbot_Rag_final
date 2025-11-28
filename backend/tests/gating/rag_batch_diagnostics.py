#!/usr/bin/env python3
"""
Batch RAG Diagnostics – Works with real backend SSE.
Robust: no assumptions, no sseclient, no decode errors.
"""

import argparse
import json
import os
import uuid
import requests
from datetime import datetime


API_URL = "http://localhost:8000/api/v1/chat/"


def run_single_query(question: str):
    """Send one question to backend."""
    conv_id = str(uuid.uuid4())

    payload = {
        "input": question,
        "conversation_id": conv_id,
        "debug_mode": True,
        "enable_verification": False,
    }

    print(f"\n🔎 Enviando: {question}")

    try:
        resp = requests.post(API_URL, json=payload, stream=True, timeout=50)
        resp.raise_for_status()
    except Exception as e:
        return {
            "question": question,
            "error": f"HTTP error: {e}",
            "response": None,
            "debug": None
        }

    text_output = ""
    debug_block = None
    event_debug_mode = False

    try:
        for raw in resp.iter_lines():
            if not raw:
                continue

            line = raw.decode("utf-8")

            # ---- Normal chunk ----
            if line.startswith("data: "):
                content = line.replace("data: ", "")
                try:
                    obj = json.loads(content)
                    if "stream" in obj:
                        text_output += str(obj["stream"])
                except:
                    pass

            # ---- Debug event begins ----
            elif line.startswith("event: debug"):
                event_debug_mode = True

            # ---- Next data: ... line belongs to debug ----
            elif event_debug_mode and line.startswith("data: "):
                dbg_str = line.replace("data: ", "")
                try:
                    debug_block = json.loads(dbg_str)
                except:
                    debug_block = dbg_str
                event_debug_mode = False

            # ---- End of debug event ----
            elif line.startswith("event: end"):
                break

    except Exception as e:
        return {
            "question": question,
            "error": f"SSE stream error: {e}",
            "response": text_output.strip() or None,
            "debug": debug_block
        }

    return {
        "question": question,
        "error": None,
        "response": text_output.strip() or None,
        "debug": debug_block
    }


def load_questions(path: str):
    with open(path, "r", encoding="utf-8") as f:
        return [q.strip() for q in f.readlines() if q.strip()]


def save_results(results, out_dir):
    os.makedirs(out_dir, exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    path = os.path.join(out_dir, f"rag_batch_report_{ts}.json")

    with open(path, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2, ensure_ascii=False)

    print(f"\n📁 Reporte guardado: {path}")
    return path


def main():
    parser = argparse.ArgumentParser(description="Batch RAG diagnostics")
    parser.add_argument("--file", required=True)
    parser.add_argument("--out", default="/app/reports")
    args = parser.parse_args()

    print("🚀 Ejecutando batch RAG diagnostics...\n")

    questions = load_questions(args.file)
    results = [run_single_query(q) for q in questions]

    save_results(results, args.out)
    print("\n🎉 Batch finalizado.")


if __name__ == "__main__":
    main()
