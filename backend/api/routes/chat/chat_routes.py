"""API routes for chat stream and history management."""
from infra.logging_utils import get_logger
import uuid
import json
import asyncio
from typing import Optional
from fastapi import APIRouter, HTTPException, Query, Request, Depends, BackgroundTasks
from fastapi.responses import StreamingResponse, JSONResponse

from api.schemas import ChatRequest
from infra.rate_limiter import conditional_limit
from config import settings
from auth.dependencies import get_optional_current_user
from auth.permissions import require_view_debug
from domain.user import User
from chat.turn_context import get_request_context
from rag.retrieval.retriever import RetrievalBackendUnavailableError
from database.conversation_repository import ConversationRepository
from database.mongodb import get_mongodb_client
from services.classification import classify_conversation
from core.tools import registry as tool_registry

logger = get_logger(__name__)
router = APIRouter()


async def _classify_web(conversation_id: str, app_state) -> None:
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
        logger.error(f"[Classification] Web conv={conversation_id}: {e}")
        try:
            import sentry_sdk
            sentry_sdk.capture_exception(e)
        except Exception:
            pass


# Todas las rutas de este modulo son PUBLICAS — no requieren autenticacion.

@router.post("/")
@conditional_limit(settings.chat_rate_limit)
async def chat_stream_log(
    request: Request,
    background_tasks: BackgroundTasks,
    current_user: Optional[User] = Depends(get_optional_current_user),
):
    """Endpoint para chat con streaming y logging."""
    chat_manager = request.app.state.chat_manager
    bot = request.app.state.bot_instance

    try:
        if not bot.is_active:
            raise HTTPException(status_code=503, detail="El bot esta desactivado actualmente")

        try:
            data = await request.json()
        except Exception as json_error:
            logger.error(f"JSON malformado en chat_stream_log: {json_error}")
            raise HTTPException(status_code=400, detail="JSON malformado en la solicitud")
        try:
            chat_input = ChatRequest(**data)
        except Exception as pydantic_error:
            logger.error(f"Error de validacion en la entrada de chat_stream_log: {pydantic_error}")
            raise HTTPException(status_code=422, detail=f"Cuerpo de la solicitud invalido: {pydantic_error}")

        input_text = chat_input.input
        conversation_id = chat_input.conversation_id or str(uuid.uuid4())
        source = getattr(chat_input, "source", None) or "embed-default"
        debug_mode = bool(getattr(chat_input, "debug_mode", False))
        if debug_mode and not (current_user and current_user.is_admin):
            debug_mode = False
        enable_verification = bool(getattr(chat_input, "enable_verification", False))

        if not input_text:
            raise HTTPException(status_code=400, detail="El mensaje no puede estar vacio")

        logger.info(f"[CHAT] Request: '{input_text[:50]}...' conv={conversation_id}")

        _sse_headers = {"Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no"}
        mongodb_client = getattr(request.app.state, "mongodb_client", None) or get_mongodb_client()
        conv_repo = ConversationRepository(mongodb_client)
        conv_doc = await conv_repo.get_or_create("web", conversation_id, conversation_id)
        conv_mode = conv_doc.get("mode", "bot")

        if conv_mode == "human":
            logger.info(f"[HandOff] Web conv={conversation_id} mode={conv_mode}, skipping LLM")
            try:
                await mongodb_client.add_message(
                    conversation_id=conversation_id,
                    role="user",
                    content=input_text,
                    source=source,
                )
            except Exception as _save_err:
                logger.error(f"[HandOff] Failed to save user message: {_save_err}")

            async def _in_human():
                yield f"event: mode\ndata: {json.dumps({'mode': 'human'})}\n\n"
                yield "event: end\ndata: {}\n\n"
            return StreamingResponse(_in_human(), media_type="text/event-stream", headers=_sse_headers)

        agentic_handoff_enabled = bool(getattr(settings, "enable_agentic_handoff", False))
        agentic_rag_enabled = bool(getattr(settings, "enable_agentic_rag", False))
        agentic_path_active = (
            (agentic_handoff_enabled or agentic_rag_enabled)
            and tool_registry.has_tools()
        )
        lead_already_captured = bool(conv_doc.get("lead_email"))
        # Skip agentic path only when it's handoff-only AND the lead is already
        # captured (no need to re-fire the handoff form). With agentic_rag on,
        # retrieval is per-turn so we always enter the agentic stream.
        skip_for_handoff_lead = (
            agentic_handoff_enabled
            and not agentic_rag_enabled
            and lead_already_captured
        )

        if agentic_path_active and not skip_for_handoff_lead:
            async def generate_agentic():
                try:
                    logger.debug(f"[CHAT] Agentic stream start | conv={conversation_id}")
                    async for event in chat_manager.stream_with_tools(
                        input_text=input_text,
                        conversation_id=conversation_id,
                        source=source,
                        app_state=request.app.state,
                    ):
                        if await request.is_disconnected():
                            logger.info(f"[CHAT] Cliente desconecto | conv={conversation_id}")
                            return
                        if event.kind == "text" and event.text:
                            yield f"data: {json.dumps({'stream': event.text})}\n\n"
                        elif event.kind == "tool_terminal" and event.sse_event == "lead_form":
                            if lead_already_captured:
                                logger.info(
                                    f"[HandOff] conv={conversation_id} lead_form suppressed "
                                    "(lead already captured)"
                                )
                                already_msg = (
                                    "Ya tenemos tus datos, un asesor te contactara en breve. "
                                    "Algo mas?"
                                )
                                yield f"data: {json.dumps({'stream': already_msg})}\n\n"
                                continue
                            background_tasks.add_task(_classify_web, conversation_id, request.app.state)
                            payload = event.sse_payload or {"conversation_id": conversation_id}
                            yield f"event: lead_form\ndata: {json.dumps(payload)}\n\n"
                            user_msg = payload.get("user_message")
                            if user_msg:
                                yield f"data: {json.dumps({'stream': user_msg})}\n\n"
                        elif event.kind == "end":
                            background_tasks.add_task(_classify_web, conversation_id, request.app.state)
                            yield "event: end\ndata: {}\n\n"
                except RetrievalBackendUnavailableError as e_stream:
                    err_payload = json.dumps({"message": str(e_stream)})
                    yield f"event: error\ndata: {err_payload}\n\n"
                    yield "event: end\ndata: {}\n\n"
                except Exception as e_stream:
                    logger.error(f"Error en stream agentic: {e_stream}", exc_info=True)
                    try:
                        import sentry_sdk
                        sentry_sdk.capture_exception(e_stream)
                    except Exception:
                        pass
                    err_payload = json.dumps({
                        "message": "Lo siento, ocurrio un error al procesar tu mensaje. Por favor, intentalo nuevamente."
                    })
                    yield f"event: error\ndata: {err_payload}\n\n"
                    yield "event: end\ndata: {}\n\n"
            return StreamingResponse(generate_agentic(), media_type="text/event-stream", headers=_sse_headers)

        async def generate():
            stream_gen = chat_manager.generate_streaming_response(
                input_text, conversation_id, source, debug_mode, enable_verification
            )
            try:
                logger.debug(f"[CHAT] Streaming iniciado | conv={conversation_id}")
                async for chunk in stream_gen:
                    if await request.is_disconnected():
                        logger.info(f"[CHAT] Cliente desconecto durante streaming | conv={conversation_id}")
                        await stream_gen.aclose()
                        return
                    try:
                        payload = json.dumps({"stream": chunk})
                    except Exception:
                        payload = json.dumps({"stream": str(chunk)})
                    yield f"data: {payload}\n\n"
                logger.debug(f"[CHAT] Streaming finalizado | conv={conversation_id}")
                background_tasks.add_task(_classify_web, conversation_id, request.app.state)
                if debug_mode:
                    try:
                        dbg = get_request_context().debug_info
                        if dbg is not None:
                            dct = dbg.model_dump() if hasattr(dbg, "model_dump") else dbg.dict() if hasattr(dbg, "dict") else None
                            if dct is not None:
                                yield f"event: debug\ndata: {json.dumps(dct)}\n\n"
                    except Exception:
                        pass
                yield "event: end\ndata: {}\n\n"
            except asyncio.TimeoutError:
                err_payload = json.dumps({
                    "message": "Lo siento, la respuesta esta tardando mas de lo esperado. Por favor, intentalo nuevamente en unos segundos."
                })
                yield f"event: error\ndata: {err_payload}\n\n"
                yield "event: end\ndata: {}\n\n"
            except RetrievalBackendUnavailableError as e_stream:
                err_payload = json.dumps({"message": str(e_stream)})
                yield f"event: error\ndata: {err_payload}\n\n"
                yield "event: end\ndata: {}\n\n"
            except Exception as e_stream:
                logger.error(f"Error en streaming: {str(e_stream)}", exc_info=True)
                try:
                    import sentry_sdk
                    sentry_sdk.capture_exception(e_stream)
                except Exception:
                    pass
                err_payload = json.dumps({
                    "message": "Lo siento, ocurrio un error al procesar tu mensaje. Por favor, intentalo nuevamente."
                })
                yield f"event: error\ndata: {err_payload}\n\n"
                yield "event: end\ndata: {}\n\n"

        return StreamingResponse(
            generate(),
            media_type="text/event-stream",
            headers=_sse_headers,
        )

    except HTTPException as http_exc:
        logger.error(f"Error HTTP en chat_stream_log: {http_exc.detail}")
        raise
    except Exception as e:
        logger.error(f"Error general en chat_stream_log: {str(e)}", exc_info=True)
        return JSONResponse(status_code=500, content={"detail": "Error interno del servidor"})


_HISTORY_DEFAULT_LIMIT = 500
_HISTORY_MAX_LIMIT = 2000


@router.get("/history/{conversation_id}")
async def get_history(
    conversation_id: str,
    request: Request,
    limit: int = Query(_HISTORY_DEFAULT_LIMIT, ge=1, le=_HISTORY_MAX_LIMIT),
    current_user: Optional[User] = Depends(get_optional_current_user),
):
    """Devuelve historial de mensajes (mas recientes primero, devueltos en orden ASC).

    - Devuelve hasta `limit` mensajes (default 500, max 2000).
    - Headers: `X-Total-Messages` (total real), `X-Truncated` (1 si total > limit).
    """
    try:
        uuid.UUID(conversation_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="conversation_id invalido")
    try:
        chat_manager = request.app.state.chat_manager
        db = chat_manager.db

        total = await db.messages.count_documents({"conversation_id": conversation_id})

        cursor = db.messages.find({
            "conversation_id": conversation_id
        }, {
            "_id": 1,
            "role": 1,
            "content": 1,
            "timestamp": 1,
            "source": 1,
        }).sort([("timestamp", -1), ("_id", -1)]).limit(limit)

        docs = await cursor.to_list(length=limit)
        docs.reverse()

        history = []
        for d in docs:
            ts = d.get("timestamp")
            history.append({
                "message_id": str(d.get("_id")) if d.get("_id") is not None else None,
                "role": d.get("role"),
                "content": d.get("content"),
                "timestamp": ts.isoformat() if hasattr(ts, "isoformat") else ts,
                "source": d.get("source") if current_user else None,
            })

        mode_value = "bot"
        try:
            mongodb_client = getattr(request.app.state, "mongodb_client", None) or get_mongodb_client()
            conv_repo = ConversationRepository(mongodb_client)
            conv = await conv_repo.get_by_conversation_id(conversation_id)
            if conv:
                mode_value = conv.get("mode", "bot")
        except Exception:
            pass

        truncated = "1" if total > limit else "0"
        if total > limit:
            logger.warning(
                "[get_history] conv=%s truncated: total=%s limit=%s",
                conversation_id, total, limit,
            )
        return JSONResponse(
            content=history,
            headers={
                "X-Conversation-Mode": mode_value,
                "X-Total-Messages": str(total),
                "X-Truncated": truncated,
                "Access-Control-Expose-Headers": "X-Conversation-Mode, X-Total-Messages, X-Truncated",
            },
        )
    except Exception as e:
        logger.error(f"Error al obtener historial de {conversation_id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Error al obtener historial")


@router.delete("/history")
async def clear_history(request: Request, current_user=Depends(require_view_debug)):
    """Borra historial de conversaciones + diagnostico de retrieval.

    Limpia tres colecciones:
      - messages: mensajes user/assistant
      - chat_profiles: perfiles de memoria por conversacion
      - retrieval_logs: huellas de busqueda que alimentan el tab de vacios
    """
    try:
        chat_manager = request.app.state.chat_manager
        db = chat_manager.db
        deleted_count = await db.clear_all_messages()
        memory = chat_manager.bot.memory
        if hasattr(memory, "profiles_col"):
            await memory.profiles_col.delete_many({})

        retrieval_deleted = 0
        try:
            mongo_db = db.db if hasattr(db, "db") else None
            if mongo_db is not None:
                res = await mongo_db.retrieval_logs.delete_many({})
                retrieval_deleted = int(getattr(res, "deleted_count", 0) or 0)
        except Exception as exc:
            logger.warning("No se pudieron borrar retrieval_logs (no fatal): %s", exc)

        return JSONResponse(content={
            "status": "success",
            "deleted_count": int(deleted_count),
            "retrieval_logs_deleted": retrieval_deleted,
            "message": "Historial eliminado correctamente",
        })
    except Exception as e:
        logger.error(f"Error al eliminar historial: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Error interno del servidor al eliminar historial")
