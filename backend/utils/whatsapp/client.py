import httpx
import asyncio
import random

from utils.logging_utils import get_logger
from config import settings


class WhatsAppClient:
    def __init__(self):
        self.logger = get_logger(self.__class__.__name__)
        self.account_sid = getattr(settings, "twilio_account_sid", None)
        self.auth_token = getattr(settings, "twilio_auth_token", None)
        from_number_raw = getattr(settings, "twilio_whatsapp_from", None)
        self.from_number = str(from_number_raw or "").strip().strip("`\"'")
        api_base_raw = getattr(
            settings,
            "twilio_api_base",
            "https://api.twilio.com",
        )
        self.api_base = str(api_base_raw).strip().strip("`\"'")

    async def send_text(self, wa_id: str, text: str) -> bool:
        if not self.account_sid or not self.auth_token or not self.from_number:
            try:
                self.logger.warning(
                    "WhatsAppClient no configurado: credenciales Twilio ausentes"
                )
            except Exception as e:
                self.logger.error(
                    f"WhatsAppClient fallo al loggear credenciales ausentes: {e}"
                )
            return False

        url = f"{self.api_base.rstrip('/')}/2010-04-01/Accounts/{self.account_sid}/Messages.json"
        headers = {"Content-Type": "application/x-www-form-urlencoded"}
        data = {"From": self.from_number, "To": wa_id, "Body": text}

        max_attempts = 5
        attempt = 0
        while attempt < max_attempts:
            try:
                async with httpx.AsyncClient(timeout=10.0) as client:
                    resp = await client.post(
                        url,
                        data=data,
                        headers=headers,
                        auth=(self.account_sid, self.auth_token),
                    )
                if 200 <= resp.status_code < 300:
                    return True
                if resp.status_code in (401, 403):
                    try:
                        self.logger.error(f"WhatsApp send_text fallo no-retriable: status={resp.status_code}")
                    except Exception:
                        pass
                    return False
                if resp.status_code == 429:
                    attempt += 1
                    if attempt >= max_attempts:
                        try:
                            self.logger.error("WhatsApp send_text rate limited tras reintentos (HTTP 429)")
                        except Exception:
                            pass
                        return False
                    base_delay = 2 ** (attempt - 1)
                    jitter = random.uniform(0, base_delay * 0.3)
                    delay = base_delay + jitter
                    try:
                        self.logger.warning(f"WhatsApp send_text rate limit 429, reintento {attempt}/{max_attempts} en {delay:.2f}s")
                    except Exception:
                        pass
                    await asyncio.sleep(delay)
                    continue
                if 500 <= resp.status_code < 600:
                    attempt += 1
                    if attempt >= max_attempts:
                        try:
                            self.logger.error(f"WhatsApp send_text fallo tras reintentos: status={resp.status_code}")
                        except Exception:
                            pass
                        return False
                    delay = 2 ** (attempt - 1)
                    try:
                        self.logger.warning(f"WhatsApp send_text reintento {attempt}/{max_attempts} en {delay}s")
                    except Exception:
                        pass
                    await asyncio.sleep(delay)
                    continue
                try:
                    self.logger.error(f"WhatsApp send_text fallo: status={resp.status_code} body={resp.text}")
                    try:
                        j = resp.json()
                        code = j.get("code")
                        msg = j.get("message")
                        more = j.get("more_info")
                        self.logger.error(f"Twilio error code={code} message={msg} more_info={more}")
                        if code == 20429:
                            attempt += 1
                            if attempt >= max_attempts:
                                try:
                                    self.logger.error("WhatsApp send_text rate limited tras reintentos (Twilio code 20429)")
                                except Exception:
                                    pass
                                return False
                            base_delay = 2 ** (attempt - 1)
                            jitter = random.uniform(0, base_delay * 0.3)
                            delay = base_delay + jitter
                            try:
                                self.logger.warning(f"WhatsApp send_text rate limit 20429, reintento {attempt}/{max_attempts} en {delay:.2f}s")
                            except Exception:
                                pass
                            await asyncio.sleep(delay)
                            continue
                    except Exception as je:
                        self.logger.error(f"Error parseando respuesta de Twilio: {je}")
                except Exception as le:
                    self.logger.error(f"Fallo al loggear error de Twilio: {le}")
                return False
            except Exception as e:
                attempt += 1
                if attempt >= max_attempts:
                    try:
                        self.logger.error(f"WhatsApp send_text error tras reintentos: {e}")
                    except Exception:
                        pass
                    return False
                base_delay = 2 ** (attempt - 1)
                jitter = random.uniform(0, base_delay * 0.3)
                delay = base_delay + jitter
                try:
                    self.logger.warning(f"WhatsApp send_text excepción, reintento {attempt}/{max_attempts} en {delay:.2f}s: {e}")
                except Exception:
                    pass
                await asyncio.sleep(delay)

    async def send_text_diagnostics(self, wa_id: str, text: str) -> dict:
        if not self.account_sid or not self.auth_token or not self.from_number:
            return {"ok": False, "status": 400, "body": {"message": "Credenciales Twilio incompletas"}}

        url = f"{self.api_base.rstrip('/')}/2010-04-01/Accounts/{self.account_sid}/Messages.json"
        headers = {"Content-Type": "application/x-www-form-urlencoded"}
        data = {"From": self.from_number, "To": wa_id, "Body": text}
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.post(url, data=data, headers=headers, auth=(self.account_sid, self.auth_token))
            body = None
            try:
                body = resp.json()
            except Exception:
                body = (resp.text or "")[:500]
            return {"ok": 200 <= resp.status_code < 300, "status": resp.status_code, "body": body}
        except Exception as e:
            return {"ok": False, "status": 500, "body": {"message": str(e)}}
