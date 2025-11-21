import logging
import httpx

from utils.logging_utils import get_logger
from config import settings


class WhatsAppClient:
    def __init__(self):
        self.logger = get_logger(self.__class__.__name__)
        self.account_sid = getattr(settings, "twilio_account_sid", None)
        self.auth_token = getattr(settings, "twilio_auth_token", None)
        from_number_raw = getattr(settings, "twilio_whatsapp_from", None)
        self.from_number = str(from_number_raw or "").strip().strip("`\"'")
        api_base_raw = getattr(settings, "twilio_api_base", "https://api.twilio.com")
        self.api_base = str(api_base_raw).strip().strip("`\"'")

    async def send_text(self, wa_id: str, text: str) -> bool:
        if not self.account_sid or not self.auth_token or not self.from_number:
            try:
                self.logger.warning("WhatsAppClient no configurado: credenciales Twilio ausentes")
            except Exception:
                pass
            return False


        url = f"{self.api_base.rstrip('/')}/2010-04-01/Accounts/{self.account_sid}/Messages.json"
        headers = {"Content-Type": "application/x-www-form-urlencoded"}
        data = {
            "From": self.from_number,
            "To": wa_id,
            "Body": text,
        }

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.post(url, data=data, headers=headers, auth=(self.account_sid, self.auth_token))
            if 200 <= resp.status_code < 300:
                return True
            try:
                self.logger.warning(f"WhatsApp send_text fallo: status={resp.status_code} body={resp.text}")
                try:
                    j = resp.json()
                    code = j.get("code")
                    msg = j.get("message")
                    more = j.get("more_info")
                    self.logger.warning(f"Twilio error code={code} message={msg} more_info={more}")
                except Exception:
                    pass
            except Exception:
                pass
            return False
        except Exception as e:
            try:
                self.logger.error(f"WhatsApp send_text error: {e}")
            except Exception:
                pass
            return False