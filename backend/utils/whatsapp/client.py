import logging
from typing import Optional
import httpx

from utils.logging_utils import get_logger
from config import settings


class WhatsAppClient:
    def __init__(self, base_url: Optional[str] = None, token: Optional[str] = None, phone_number_id: Optional[str] = None):
        self.logger = get_logger(self.__class__.__name__)
        self.base_url = base_url if base_url is not None else getattr(settings, "whatsapp_api_base_url", None)
        self.token = token if token is not None else getattr(settings, "whatsapp_token", None)
        self.phone_number_id = phone_number_id if phone_number_id is not None else getattr(settings, "whatsapp_phone_number_id", None)

    async def send_text(self, wa_id: str, text: str) -> bool:
        if not self.base_url or not self.token:
            try:
                self.logger.warning("WhatsAppClient no configurado: base_url o token ausentes")
            except Exception:
                pass
            return False

        url = f"{str(self.base_url).rstrip('/')}/messages"
        headers = {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json",
        }
        payload = {
            "to": wa_id,
            "type": "text",
            "text": {"body": text},
        }

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.post(url, json=payload, headers=headers)
            if 200 <= resp.status_code < 300:
                return True
            try:
                self.logger.error(f"WhatsApp send_text fallo: status={resp.status_code} body={resp.text}")
            except Exception:
                pass
            return False
        except Exception as e:
            try:
                self.logger.error(f"WhatsApp send_text error: {e}")
            except Exception:
                pass
            return False