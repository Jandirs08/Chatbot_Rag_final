from utils.logging_utils import get_logger
from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import JSONResponse
from database.whatsapp_session_repository import WhatsAppSessionRepository
from utils.whatsapp.formatter import format_text
from utils.whatsapp.client import WhatsAppClient
from config import settings
import httpx
import re
import hmac
import hashlib
import base64

logger = get_logger(__name__)
router = APIRouter(tags=["whatsapp"])

@router.post("/webhook")
async def whatsapp_webhook(request: Request):
    try:
        form = await request.form()
    except Exception:
        raise HTTPException(status_code=400, detail="Formulario malformado")

    try:
        logger.info("[WhatsApp] webhook start")
    except Exception as e:
        logger.error(f"[WhatsApp] fallo al registrar inicio de webhook: {e}")

    try:
        sig_header = request.headers.get("X-Twilio-Signature")
        token = getattr(settings, "twilio_auth_token", None)
        if token and sig_header:
            url = str(request.url)
            items = sorted([(str(k), str(v)) for k, v in dict(form).items()])
            payload = url + "".join([k + v for k, v in items])
            digest = hmac.new(token.encode("utf-8"), payload.encode("utf-8"), hashlib.sha1).digest()
            expected = base64.b64encode(digest).decode("utf-8")
            if expected != sig_header:
                try:
                    logger.warning("[WhatsApp] firma inválida en webhook")
                except Exception as le:
                    logger.error(f"[WhatsApp] fallo al loggear firma inválida: {le}")
                raise HTTPException(status_code=403, detail="Firma inválida")
        elif token:
            raise HTTPException(status_code=400, detail="Encabezado de firma ausente")
    except HTTPException:
        raise
    except Exception as e:
        try:
            logger.error(f"[WhatsApp] error validando firma: {e}")
        except Exception as le:
            logger.error(f"[WhatsApp] fallo al loggear error de firma: {le}")
        raise HTTPException(status_code=400, detail="Error validando firma")

    wa_id = str(form.get("From", "")).strip().strip("`\"'")
    text = str(form.get("Body", "")).strip()

    wa_pattern = r"^whatsapp:\+\d{6,15}$"
    if not wa_id or not re.match(wa_pattern, wa_id):
        try:
            logger.error(f"[WhatsApp] wa_id inválido: '{wa_id}'")
        except Exception as e:
            logger.error(f"[WhatsApp] fallo al loggear wa_id inválido: {e}")
        return JSONResponse(status_code=400, content={"detail": "Parámetro 'wa_id' inválido"})
    if not isinstance(text, str) or not text.strip():
        try:
            logger.error(f"[WhatsApp] texto inválido (vacío) para wa_id={wa_id}")
        except Exception as e:
            logger.error(f"[WhatsApp] fallo al loggear texto vacío: {e}")
        return JSONResponse(status_code=400, content={"detail": "Parámetro 'text' inválido: vacío"})
    if re.search(r"[\x00-\x08\x0B\x0C\x0E-\x1F]", text):
        try:
            logger.error(f"[WhatsApp] texto contiene caracteres no permitidos para wa_id={wa_id}")
        except Exception as e:
            logger.error(f"[WhatsApp] fallo al loggear texto no permitido: {e}")
        return JSONResponse(status_code=400, content={"detail": "Parámetro 'text' contiene caracteres no permitidos"})

    try:
        logger.info(f"[WhatsApp] wa_id recibido: {wa_id}")
        repo = WhatsAppSessionRepository(getattr(request.app.state, "mongodb_client", None))
        conversation_id = await repo.get_or_create(wa_id)
        await repo.touch(wa_id)
        logger.info(f"[WhatsApp] conversación resuelta: {conversation_id}")
    except Exception as e:
        conversation_id = None
        try:
            logger.error(f"[WhatsApp] error al obtener/crear conversación: {e}")
        except Exception as le:
            logger.error(f"[WhatsApp] fallo al loggear error de conversación: {le}")

    response_preview = None
    try:
        chat_manager = request.app.state.chat_manager
        response_text = await chat_manager.generate_response(
            input_text=str(text),
            conversation_id=conversation_id,
            source="whatsapp",
        )
        try:
            logger.info(f"[WhatsApp] preview generado len={len(response_text)} first50={str(response_text)[:50]}")
        except Exception as e:
            logger.error(f"[WhatsApp] fallo al loggear preview: {e}")
        response_preview = (response_text or "")[:100]
        try:
            formatted_text = format_text(response_text)
            client = WhatsAppClient()
            ok = await client.send_text(wa_id, formatted_text)
            try:
                if ok:
                    logger.info("[WhatsApp] envío OK")
                else:
                    logger.warning("[WhatsApp] envío falló (False)")
            except Exception as e:
                logger.error(f"[WhatsApp] fallo al loggear resultado de envío: {e}")
        except Exception as e:
            try:
                logger.error(f"[WhatsApp] error en envío: {e}")
            except Exception as le:
                logger.error(f"[WhatsApp] fallo al loggear error de envío: {le}")
    except Exception as e:
        try:
            logger.error(f"[WhatsApp] error generando respuesta del bot: {e}")
        except Exception as le:
            logger.error(f"[WhatsApp] fallo al loggear error del bot: {le}")
        response_preview = None

    return JSONResponse(status_code=200, content={"status": "ok", "conversation_id": conversation_id, "response_preview": response_preview})

@router.get("/test")
async def whatsapp_test():
    try:
        sid = getattr(settings, "twilio_account_sid", None)
        token = getattr(settings, "twilio_auth_token", None)
        api_base = str(getattr(settings, "twilio_api_base", "https://api.twilio.com")).strip().strip("`\"'")
        from_ = str(getattr(settings, "twilio_whatsapp_from", "")).strip().strip("`\"'")
        if not sid or not token:
            return {"status": "error", "message": "Credenciales incompletas"}
        if not from_ or not from_.startswith("whatsapp:+"):
            return {"status": "error", "message": "TWILIO_WHATSAPP_FROM debe ser 'whatsapp:+NNNN'"}
        if not str(sid).startswith("AC"):
            return {"status": "error", "message": "TWILIO_ACCOUNT_SID debe empezar con 'AC'"}
        url = f"{api_base.rstrip('/')}/2010-04-01/Accounts/{sid}.json"
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(url, auth=(sid, token))
        if 200 <= resp.status_code < 300:
            return {"status": "ok"}
        details = None
        try:
            details = resp.json()
        except Exception:
            details = {"raw": (resp.text or "")[:300]}
        return {"status": "error", "message": f"HTTP {resp.status_code}", "twilio": details}
    except Exception:
        return {"status": "error"}

@router.get("/diag")
async def whatsapp_diag():
    try:
        sid = getattr(settings, "twilio_account_sid", None) or ""
        token = getattr(settings, "twilio_auth_token", None) or ""
        from_ = getattr(settings, "twilio_whatsapp_from", None) or ""
        api_base = str(getattr(settings, "twilio_api_base", "https://api.twilio.com")).strip().strip("`\"'")
        masked_sid = sid[:4] + "..." + sid[-6:] if len(sid) >= 10 else sid
        masked_token = ("***" + token[-6:]) if len(token) >= 6 else token
        return {
            "loaded": bool(sid and token and from_),
            "sid": masked_sid,
            "token": masked_token,
            "from": from_,
            "api_base": api_base,
        }
    except Exception:
        return {"loaded": False}

@router.get("/send-test")
async def whatsapp_send_test(request: Request):
    try:
        params = dict(request.query_params)
        to = str(params.get("to", "")).strip().strip("`\"'")
        if to.startswith("whatsapp: ") and not to.startswith("whatsapp:+"):
            to = to.replace("whatsapp: ", "whatsapp:+", 1)
        text = str(params.get("text", "Hola desde send-test")).strip()
        if not to or not to.startswith("whatsapp:+"):
            return {"status": "error", "message": "Parámetro 'to' debe ser 'whatsapp:+NNNN'"}
        client = WhatsAppClient()
        result = await client.send_text_diagnostics(to, text or "Hola")
        if result.get("ok"):
            return {"status": "ok", "twilio": result}
        return {"status": "error", "twilio": result}
    except Exception as e:
        return {"status": "error", "message": str(e)}