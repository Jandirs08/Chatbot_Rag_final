from utils.logging_utils import get_logger
from fastapi import APIRouter, Request, HTTPException, BackgroundTasks, Depends
from fastapi.responses import JSONResponse
from database.whatsapp_session_repository import WhatsAppSessionRepository
from database.conversation_repository import ConversationRepository
from database.failed_message_repository import FailedMessageRepository
from database.mongodb import get_mongodb_client
from services.classification import classify_conversation
from utils.whatsapp.formatter import format_text
from utils.whatsapp.client import WhatsAppClient
from utils.whatsapp.idempotency import claim_message
from utils.whatsapp.rate_limit import check_and_increment, should_notify_once
from config import settings
from core.tools import registry as tool_registry
import httpx
import re
from auth import require_admin

# Intentar importar validación de Twilio
try:
    from twilio.request_validator import RequestValidator
    _HAS_TWILIO = True
except Exception:
    _HAS_TWILIO = False

logger = get_logger(__name__)
router = APIRouter(tags=["whatsapp"])

# --- HELPERS ---

def log_error(message: str, wa_id: str = None, exc_info: bool = False) -> None:
    """Helper para logs de error en el webhook de WhatsApp."""
    msg = message if not wa_id else f"{message} para wa_id={wa_id}"
    logger.error(msg, exc_info=exc_info)

async def _run_classification(conversation_id: str, app_state) -> None:
    try:
        mongodb_client = getattr(app_state, "mongodb_client", None) or get_mongodb_client()
        result = await classify_conversation(conversation_id, mongodb_client.db, settings)
        if result is None:
            return
        conv_repo = ConversationRepository(mongodb_client)
        await conv_repo.set_classification(
            conversation_id,
            category=result.category,
            urgency=result.urgency,
            ai_summary=result.summary,
            lead_score=result.lead_score,
            purchase_intent=result.purchase_intent,
            product_interests=result.product_interests,
            recommended_action=result.recommended_action,
            confidence=result.confidence,
            msg_count_at_classify=result.msg_count_at_classify,
        )
    except Exception as e:
        logger.error(f"[Classification] Background task error for conv={conversation_id}: {e}")


def _agentic_path_enabled() -> bool:
    return (
        bool(getattr(settings, "enable_agentic_handoff", False) or getattr(settings, "enable_agentic_rag", False))
        and tool_registry.has_tools()
    )


async def process_message_background(
    text: str,
    wa_id: str,
    app_state,
    conversation_id: str,
    message_sid: str = "",
):
    """
    Procesa el mensaje en segundo plano (LLM + Envío a WhatsApp).
    Esto evita que el webhook de Twilio haga timeout.
    """
    try:
        mongodb_client = getattr(app_state, "mongodb_client", None) or get_mongodb_client()
        conv_repo = ConversationRepository(mongodb_client)
        conv = await conv_repo.get_or_create("whatsapp", wa_id, conversation_id)

        # HandOff guard: if conversation is in human/pending mode, skip LLM
        if conv and conv.get("mode") in ("human", "pending"):
            logger.info(f"[HandOff] conv={conversation_id} mode={conv.get('mode')}, skipping LLM")
            client = WhatsAppClient()
            await client.send_text(
                wa_id,
                "Tu consulta está siendo atendida por un asesor. En breve te contactarán.",
            )
            return

        # 1. Generar respuesta con el LLM. Web y WhatsApp comparten el mismo
        # flujo agentic cuando las tools estan habilitadas.
        chat_manager = app_state.chat_manager
        if _agentic_path_enabled():
            agentic_result = await chat_manager.generate_agentic_response(
                input_text=text,
                conversation_id=conversation_id,
                source="whatsapp",
                app_state=app_state,
            )
            response_text = agentic_result.text
            if agentic_result.terminal_event == "lead_form":
                await conv_repo.set_mode(conversation_id, "pending")
        else:
            response_text = await chat_manager.generate_response(
                input_text=text,
                conversation_id=conversation_id,
                source="whatsapp",
            )

        if not response_text:
            response_text = "No pude completar tu consulta en este momento. Por favor, intenta nuevamente."

        # 2. Formatear y enviar
        formatted_text = format_text(response_text)
        client = WhatsAppClient()

        ok = await client.send_text(wa_id, formatted_text)

        if ok:
            logger.info(f"[Background] Mensaje enviado OK a {wa_id}")
        else:
            logger.warning(f"[Background] Falló el envío a {wa_id}")

        await _run_classification(conversation_id, app_state)

    except Exception as e:
        log_error(f"CRITICAL: Error en proceso de fondo (LLM/Send): {e}", wa_id, exc_info=True)
        try:
            mongodb_client = getattr(app_state, "mongodb_client", None) or get_mongodb_client()
            dlq = FailedMessageRepository(mongodb_client)
            await dlq.record(
                wa_id=wa_id,
                text=text,
                conversation_id=conversation_id,
                message_sid=message_sid,
                error=str(e),
            )
        except Exception as dlq_exc:
            logger.error(
                "DLQ record failed — mensaje perdido para wa_id=%s: %s",
                wa_id,
                dlq_exc,
                exc_info=True,
            )

# --- ENDPOINTS ---

@router.post("/webhook")
async def whatsapp_webhook(request: Request, background_tasks: BackgroundTasks):
    """
    Recibe el webhook de Twilio, valida la firma y encola el procesamiento.
    Responde < 200ms para evitar reintentos.
    """
    # 1. Obtener Formulario
    try:
        form = await request.form()
    except Exception as e:
        log_error(f"Error al obtener parámetros del form: {e}")
        raise HTTPException(status_code=400, detail="Formulario malformado")

    # 2. Validar Firma de Twilio (Seguridad)
    sig = request.headers.get("X-Twilio-Signature")
    if not sig:
        return JSONResponse(status_code=403, content={"detail": "Firma Twilio ausente"})

    if not _HAS_TWILIO:
        log_error("Librería Twilio no instalada/detectada")
        raise HTTPException(status_code=500, detail="Error interno de validación")

    token = getattr(settings, "twilio_auth_token", None)
    if not token:
        log_error("TWILIO_AUTH_TOKEN no configurado en settings")
        raise HTTPException(status_code=500, detail="Error de configuración")

    # --- FIX PARA PROXY/HTTPS ---
    # Si estás en Railway/Render/AWS, 'request.url' suele ser http:// pero Twilio firmó https://
    url_str = str(request.url)
    forwarded_proto = request.headers.get("X-Forwarded-Proto", "")
    
    # Si el balanceador de carga nos dice que es HTTPS, forzamos la URL a HTTPS
    if forwarded_proto == "https" and url_str.startswith("http://"):
        url_str = url_str.replace("http://", "https://", 1)
    
    params = dict(form)
    try:
        validator = RequestValidator(token)
        if not validator.validate(url_str, params, sig):
            log_error(f"Firma inválida. URL usada para validar: {url_str}")
            return JSONResponse(status_code=403, content={"detail": "Firma Twilio inválida"})
    except Exception as e:
        log_error(f"Excepción validando firma: {e}")
        raise HTTPException(status_code=500, detail="Error validando firma")

    # 3. Extraer y Validar Datos
    wa_id = str(form.get("From", "")).strip().strip("`\"'")
    message_sid = str(form.get("MessageSid", "")).strip()
    text = str(form.get("Body", "")).strip()

    # Multimedia: anota tipo de archivo recibido para que el bot pueda responder
    num_media = int(form.get("NumMedia", 0) or 0)
    if num_media > 0:
        media_labels = []
        for i in range(min(num_media, 5)):
            ct = str(form.get(f"MediaContentType{i}", "")).lower()
            if "image" in ct:
                media_labels.append("imagen")
            elif "audio" in ct:
                media_labels.append("audio")
            elif "video" in ct:
                media_labels.append("video")
            elif "pdf" in ct:
                media_labels.append("documento PDF")
            else:
                media_labels.append("archivo")
        media_note = ", ".join(f"[{l}]" for l in media_labels)
        text = f"{media_note} {text}".strip() if text else media_note

    if len(text) > 1500:
        text = text[:1500] + " ... [truncado]"

    wa_pattern = r"^whatsapp:\+\d{6,15}$"
    if not wa_id or not re.match(wa_pattern, wa_id):
        log_error(f"wa_id inválido: '{wa_id}'")
        return JSONResponse(status_code=400, content={"detail": "Parámetro 'From' inválido"})

    if not text:
        # A veces llegan actualizaciones de estado (sent/delivered), las ignoramos con 200 OK
        return JSONResponse(status_code=200, content={"status": "ignored_empty"})

    # 3b. Idempotency: antes de rate limit — descarta reintentos de Twilio
    # independientemente de cómo se rechazó el intento anterior
    if not claim_message(message_sid):
        logger.info(f"[Webhook] Reintento Twilio descartado: MessageSid={message_sid}")
        return JSONResponse(status_code=200, content={"status": "duplicate"})

    # 4. Rate limit por wa_id (protege contra bursts y abuso)
    rl_limit = int(getattr(settings, "whatsapp_rate_limit_per_window", 10))
    rl_window = int(getattr(settings, "whatsapp_rate_limit_window_seconds", 60))
    is_limited, count = check_and_increment(wa_id, limit=rl_limit, window_seconds=rl_window)
    if is_limited:
        if should_notify_once(wa_id, window_seconds=rl_window):
            try:
                client = WhatsAppClient()
                await client.send_text(
                    wa_id,
                    f"⚠️ Has enviado demasiados mensajes. Por favor espera {rl_window}s y vuelve a intentar.",
                )
            except Exception:
                pass
        logger.warning(f"[Webhook] Rate limit hit wa_id={wa_id} count={count} limit={rl_limit}")
        return JSONResponse(status_code=200, content={"status": "rate_limited", "count": count})

    # 5. Gestión de Sesión
    conversation_id = None
    try:
        repo = WhatsAppSessionRepository(getattr(request.app.state, "mongodb_client", None))
        conversation_id = await repo.get_or_create(wa_id)
        await repo.touch(wa_id)
    except Exception as e:
        log_error(f"Error DB sesión: {e}", wa_id, exc_info=True)
        conversation_id = f"fallback_{wa_id}"
    
    # 6. Encolar Tarea (Background)
    # Pasamos 'request.app.state' porque 'request' se destruye al retornar
    background_tasks.add_task(
        process_message_background,
        text=text,
        wa_id=wa_id,
        app_state=request.app.state,
        conversation_id=conversation_id,
        message_sid=message_sid,
    )

    # 7. Respuesta Inmediata a Twilio
    logger.info(f"[Webhook] Recibido OK de {wa_id}. Procesando en background.")
    return JSONResponse(status_code=200, content={"status": "received"})

# --- RUTAS DE DIAGNÓSTICO (Mantenidas igual) ---

@router.get("/test")
async def whatsapp_test(current_user=Depends(require_admin)):
    try:
        sid = getattr(settings, "twilio_account_sid", None)
        token = getattr(settings, "twilio_auth_token", None)
        api_base = str(getattr(settings, "twilio_api_base", "https://api.twilio.com")).strip().strip("`\"'")
        
        if not sid or not token:
            return {"status": "error", "message": "Credenciales incompletas"}
            
        url = f"{api_base.rstrip('/')}/2010-04-01/Accounts/{sid}.json"
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(url, auth=(sid, token))
            
        if 200 <= resp.status_code < 300:
            return {"status": "ok", "msg": "Conexión Twilio correcta"}
            
        return {"status": "error", "code": resp.status_code, "raw": str(resp.text)[:200]}
    except Exception as e:
        return {"status": "error", "message": str(e)}

@router.get("/diag")
async def whatsapp_diag(current_user=Depends(require_admin)):
    try:
        sid = getattr(settings, "twilio_account_sid", None) or ""
        token = getattr(settings, "twilio_auth_token", None) or ""
        from_ = getattr(settings, "twilio_whatsapp_from", None) or ""
        
        masked_sid = sid[:4] + "..." + sid[-6:] if len(sid) >= 10 else "INVALID"
        masked_token = "***" + token[-6:] if len(token) >= 6 else "INVALID"
        
        return {
            "loaded": bool(sid and token and from_),
            "sid": masked_sid,
            "token": masked_token,
            "from": from_
        }
    except Exception:
        return {"loaded": False}

@router.get("/send-test")
async def whatsapp_send_test(request: Request, current_user=Depends(require_admin)):
    try:
        params = dict(request.query_params)
        to = str(params.get("to", "")).strip()
        
        if to.startswith("whatsapp: ") and not to.startswith("whatsapp:+"):
            to = to.replace("whatsapp: ", "whatsapp:+", 1)
            
        text = str(params.get("text", "Hola prueba manual")).strip()
        
        if not to or not to.startswith("whatsapp:+"):
            return {"status": "error", "message": "Falta 'to' (whatsapp:+NNN)"}
            
        client = WhatsAppClient()
        result = await client.send_text_diagnostics(to, text)
        
        return {"status": "ok" if result.get("ok") else "error", "twilio": result}
    except Exception as e:
        return {"status": "error", "message": str(e)}
