from utils.logging_utils import get_logger
from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import JSONResponse
from database.whatsapp_session_repository import WhatsAppSessionRepository
from utils.whatsapp.formatter import format_text
from utils.whatsapp.client import WhatsAppClient

logger = get_logger(__name__)
router = APIRouter(tags=["whatsapp"])

@router.post("/webhook")
async def whatsapp_webhook(request: Request):
    try:
        data = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="JSON malformado")

    try:
        logger.info("[WhatsApp] webhook start")
    except Exception:
        pass

    wa_id = None
    text = None

    try:
        if isinstance(data, dict):
            if "entry" in data:
                entry = data.get("entry") or []
                if entry:
                    changes = (entry[0] or {}).get("changes") or []
                    if changes:
                        value = (changes[0] or {}).get("value") or {}
                        messages = value.get("messages") or []
                        if messages:
                            msg = messages[0] or {}
                            text = (msg.get("text") or {}).get("body") or msg.get("body")
                            wa_id = msg.get("from") or msg.get("author")
            if not wa_id and "from" in data and "text" in data:
                wa_id = data.get("from")
                text = data.get("text")
    except Exception:
        pass

    if not wa_id:
        try:
            logger.info("[WhatsApp] webhook ignored: wa_id ausente")
        except Exception:
            pass
        return JSONResponse(status_code=200, content={"status": "ignored"})
    if not isinstance(text, str) or not text.strip():
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
            input_text=text,
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