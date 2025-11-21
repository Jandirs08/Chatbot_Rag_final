from utils.logging_utils import get_logger
from fastapi import APIRouter, Request, HTTPException, Depends, BackgroundTasks, status
from fastapi.responses import JSONResponse
from starlette.datastructures import FormData
from database.whatsapp_session_repository import WhatsAppSessionRepository
from utils.whatsapp.formatter import format_text
from utils.whatsapp.client import WhatsAppClient
from config import settings
from twilio.request_validator import RequestValidator
import httpx
import re

logger = get_logger(__name__)
router = APIRouter(tags=["whatsapp"])

# --- 1. DEPENDENCIA DE SEGURIDAD (VALIDACIÓN TWILIO) ---
async def validate_twilio_request(request: Request) -> FormData:
    """
    Valida criptográficamente que la petición viene de Twilio.
    """
    try:
        form = await request.form()
    except Exception:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Formulario malformado")

    signature = request.headers.get("X-Twilio-Signature")
    if not signature:
        # En PROD esto es obligatorio. En local sin túnel seguro puede fallar.
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Firma Twilio ausente")

    # Recuperar token usando getattr como solicitaste
    raw_token = getattr(settings, "twilio_auth_token", None)
    token_value = None
    try:
        token_value = raw_token.get_secret_value() if hasattr(raw_token, "get_secret_value") else raw_token
    except Exception:
        token_value = raw_token

    token_str = str(token_value or "").strip().strip("`\"'")
    if not token_str:
        logger.error("Twilio Auth Token no configurado")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Error config servidor")

    url = str(request.url).strip().strip("`\"'")
    validator = RequestValidator(token_str)
    params = dict(form)
    
    try:
        valid = validator.validate(url, params, signature)
    except Exception:
        valid = False

    if not valid:
        logger.warning(f"Firma inválida desde {request.client.host}")
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Firma Twilio inválida")

    return form

# --- 2. LÓGICA EN SEGUNDO PLANO (DB -> LLM -> WHATSAPP) ---
async def process_conversation(wa_id: str, text: str, app_state):
    """
    Procesa el mensaje sin bloquear el webhook.
    """
    try:
        logger.info(f"[Background] Procesando mensaje de: {wa_id}")

        # 2.1 Gestión de Sesión
        try:
            repo = WhatsAppSessionRepository(getattr(app_state, "mongodb_client", None))
            conversation_id = await repo.get_or_create(wa_id)
            await repo.touch(wa_id)
        except Exception as e:
            logger.error(f"[Background] Fallo DB Session: {e}")
            raise e # Si no hay DB, saltamos al bloque de error final

        # 2.2 Generación de respuesta (RAG/LLM)
        chat_manager = getattr(app_state, "chat_manager", None)
        response_text = await chat_manager.generate_response(
            input_text=str(text),
            conversation_id=conversation_id,
            source="whatsapp",
        )

        # 2.3 Enviar respuesta
        formatted_text = format_text(response_text)
        client = WhatsAppClient()
        ok = await client.send_text(wa_id, formatted_text)
        
        if ok:
            logger.info(f"[Background] Respondido a {wa_id}")
        else:
            logger.warning(f"[Background] Fallo envío Twilio a {wa_id}")

    except Exception as e:
        logger.error(f"[Background] Error CRÍTICO procesando mensaje: {e}")
        # --- PUNTO 3: FEEDBACK DE ERROR AL USUARIO ---
        try:
            client = WhatsAppClient()
            await client.send_text(wa_id, "⚠️ Lo siento, tuve un error interno procesando tu mensaje. Por favor intenta de nuevo.")
        except Exception:
            logger.error("[Background] No se pudo enviar mensaje de error al usuario.")

async def send_media_warning(wa_id: str):
    """Respuesta automática para mensajes multimedia"""
    try:
        client = WhatsAppClient()
        await client.send_text(wa_id, "📷 Veo que enviaste una imagen o audio. Por ahora solo puedo leer texto. ¿Me lo escribes?")
    except Exception as e:
        logger.error(f"Error enviando warning multimedia: {e}")

# --- 3. WEBHOOK PRINCIPAL ---
@router.post("/webhook")
async def whatsapp_webhook(
    request: Request, 
    background_tasks: BackgroundTasks,
    form: FormData = Depends(validate_twilio_request)
):
    try:
        # --- PUNTO 1: FILTRAR STATUS CALLBACKS ---
        # Twilio envía actualizaciones de estado (sent, delivered, read) al mismo webhook si está configurado así.
        message_status = form.get("MessageStatus")
        if message_status in ["sent", "delivered", "read", "failed", "undelivered"]:
            logger.debug(f"[Webhook] Status update: {message_status}")
            return JSONResponse(status_code=200, content={"status": "acknowledged"})

        wa_id = str(form.get("From", "")).strip().strip("`\"'")
        text = str(form.get("Body", "")).strip()

        # Validación ID
        if not wa_id or not re.match(r"^whatsapp:\+\d{6,15}$", wa_id):
            logger.warning(f"[Webhook] ID inválido: {wa_id}")
            return JSONResponse(status_code=400, content={"detail": "ID inválido"})

        # --- PUNTO 2: MANEJO MULTIMEDIA ---
        num_media = form.get("NumMedia", "0")
        if num_media and int(num_media) > 0:
            logger.info(f"[Webhook] Multimedia recibido de {wa_id}. Ignorando contenido.")
            # Encolar aviso amable
            background_tasks.add_task(send_media_warning, wa_id)
            return JSONResponse(status_code=200, content={"status": "media_ignored"})

        # Validación Texto Vacío
        if not text:
            logger.info(f"[Webhook] Texto vacío de {wa_id}")
            return JSONResponse(status_code=200, content={"status": "empty_text"})

        # --- ENCOLAR TAREA PRINCIPAL ---
        background_tasks.add_task(process_conversation, wa_id, text, request.app.state)
        
        return JSONResponse(status_code=200, content={"status": "queued"})

    except Exception as e:
        logger.error(f"[Webhook] Error inesperado: {e}")
        return JSONResponse(status_code=500, content={"detail": "Error interno"})

# --- ENDPOINTS DE UTILIDAD (TEST / DIAG) ---
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