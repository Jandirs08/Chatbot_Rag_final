import logging
import os
from typing import Optional, Dict, Any
from jinja2 import Environment, FileSystemLoader, select_autoescape
from config import settings

logger = logging.getLogger(__name__)

class EmailService:
    def __init__(self, templates_dir: Optional[str] = None):
        base_dir = templates_dir or os.path.join(os.path.dirname(os.path.dirname(__file__)), "templates")
        self.env = Environment(loader=FileSystemLoader(base_dir), autoescape=select_autoescape(["html", "xml"]))
        self.api_key = None
        try:
            self.api_key = settings.resend_api_key.get_secret_value() if settings.resend_api_key else None
        except Exception:
            self.api_key = None
        self.email_from = getattr(settings, "email_from", None) or "no-reply@example.com"

    def render(self, template_name: str, context: Dict[str, Any]) -> str:
        template = self.env.get_template(template_name)
        return template.render(**context)

    async def send(self, to_email: str, subject: str, template_name: str, context: Dict[str, Any]) -> bool:
        html = self.render(template_name, context)
        if not self.api_key:
            try:
                logger.info(f"[DEV] Email to {to_email} | subject={subject}")
                logger.info(html)
                return True
            except Exception:
                return False
        try:
            import resend
            resend.api_key = self.api_key
            payload = {"from": self.email_from, "to": to_email, "subject": subject, "html": html}
            r = resend.Emails.send(payload)
            ok = bool(r)
            return ok
        except Exception as e:
            logger.error(f"Resend error: {e}")
            return False

    async def send_reset_password(self, to_email: str, link: str) -> bool:
        subject = "Restablecer contraseña"
        try:
            if not self.api_key:
                logger.info(f"[DEV] Reset link: {link}")
        except Exception:
            pass
        return await self.send(to_email, subject, "reset_password.html", {"link": link})