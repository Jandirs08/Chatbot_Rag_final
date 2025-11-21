from utils.logging_utils import get_logger
from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import JSONResponse
from database.whatsapp_session_repository import WhatsAppSessionRepository
from utils.whatsapp.formatter import format_text
from utils.whatsapp.client import WhatsAppClient
from config import settings
import httpx

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
    except Exception:
        pass

    wa_id = str(form.get("From", "")).strip().strip("`\"'")
    text = str(form.get("Body", "")).strip()

    if not wa_id:
        try:
            logger.info("[WhatsApp] webhook ignored: wa_id ausente")
        except Exception:
            pass
        return JSONResponse(status_code=200, content={"status": "ignored"})
    if not isinstance(text, str) or not str(text).strip():
        try:
            logger.info(f"[WhatsApp] webhook ignored: texto vacío wa_id={wa_id}")
        except Exception:
            pass
        return JSONResponse(status_code=200, content={"status": "ignored"})

    try:
        logger.info(f"[WhatsApp] wa_id recibido: {wa_id}")
        repo = WhatsAppSessionRepository(getattr(request.app.state, "mongodb_client", None))
        conversation_id = await repo.get_or_create(wa_id)
        await repo.touch(wa_id)
        logger.info(f"[WhatsApp] conversación resuelta: {conversation_id}")
    except Exception:
        conversation_id = None
        try:
            logger.warning("[WhatsApp] no se pudo obtener/crear conversación")
        except Exception:
            pass

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
        except Exception:
            pass
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
            except Exception:
                pass
        except Exception as e:
            try:
                logger.warning(f"[WhatsApp] error en envío: {e}")
            except Exception:
                pass
    except Exception as e:
        try:
            logger.error(f"[WhatsApp] error generando respuesta del bot: {e}")
        except Exception:
            pass
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