"""API routes for chat management."""
from utils.logging_utils import get_logger
import uuid
import json
import asyncio
from typing import Optional
from fastapi import APIRouter, HTTPException, Query, Request, Depends, BackgroundTasks
from fastapi.responses import StreamingResponse, JSONResponse, Response
from io import BytesIO
from datetime import datetime, timezone
from zoneinfo import ZoneInfo
import csv

# Importar modelos Pydantic desde el módulo centralizado
from api.schemas import (
    ChatRequest
)
from api.schemas.pagination import Page
from utils.rate_limiter import conditional_limit
from config import settings
from auth.dependencies import get_current_active_user, get_optional_current_user
from auth.permissions import require_view_debug
from models.user import User
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

# 🌐 NOTA: Todas las rutas de este módulo son PÚBLICAS
# No requieren autenticación para permitir acceso libre al chat

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
            raise HTTPException(
                status_code=503,
                detail="El bot está desactivado actualmente"
            )
            
        try:
            data = await request.json()
        except Exception as json_error:
            logger.error(f"JSON malformado en chat_stream_log: {json_error}")
            raise HTTPException(status_code=400, detail="JSON malformado en la solicitud")
        try:
            chat_input = ChatRequest(**data)
        except Exception as pydantic_error:
            logger.error(f"Error de validación en la entrada de chat_stream_log: {pydantic_error}")
            raise HTTPException(status_code=422, detail=f"Cuerpo de la solicitud inválido: {pydantic_error}")

        input_text = chat_input.input
        conversation_id = chat_input.conversation_id or str(uuid.uuid4())
        source = getattr(chat_input, "source", None) or "embed-default"
        debug_mode = bool(getattr(chat_input, "debug_mode", False))
        if debug_mode and not (current_user and current_user.is_admin):
            debug_mode = False
        enable_verification = bool(getattr(chat_input, "enable_verification", False))
        
        if not input_text:
            raise HTTPException(status_code=400, detail="El mensaje no puede estar vacío")
        
        logger.info(f"[CHAT] Request: '{input_text[:50]}...' conv={conversation_id}")

        # HandOff guard
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
                            logger.info(f"[CHAT] Cliente desconectó | conv={conversation_id}")
                            return
                        if event.kind == "text" and event.text:
                            yield f"data: {json.dumps({'stream': event.text})}\n\n"
                        elif event.kind == "tool_terminal" and event.sse_event == "lead_form":
                            # Suppress re-firing the lead form when the lead is
                            # already on file (e.g. agentic_rag re-entered the
                            # tool path). Inject a polite text reply instead.
                            if lead_already_captured:
                                logger.info(
                                    f"[HandOff] conv={conversation_id} lead_form suppressed "
                                    "(lead already captured)"
                                )
                                already_msg = (
                                    "Ya tenemos tus datos, un asesor te contactará en breve. "
                                    "¿Algo más?"
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
                        "message": "Lo siento, ocurrió un error al procesar tu mensaje. Por favor, inténtalo nuevamente."
                    })
                    yield f"event: error\ndata: {err_payload}\n\n"
                    yield "event: end\ndata: {}\n\n"
            return StreamingResponse(generate_agentic(), media_type="text/event-stream", headers=_sse_headers)

        async def generate():
            stream_gen = chat_manager.generate_streaming_response(input_text, conversation_id, source, debug_mode, enable_verification)
            try:
                logger.debug(f"[CHAT] Streaming iniciado | conv={conversation_id}")
                async for chunk in stream_gen:
                    if await request.is_disconnected():
                        logger.info(f"[CHAT] Cliente desconectó durante streaming | conv={conversation_id}")
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
                    "message": "Lo siento, la respuesta está tardando más de lo esperado. Por favor, inténtalo nuevamente en unos segundos."
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
                    "message": "Lo siento, ocurrió un error al procesar tu mensaje. Por favor, inténtalo nuevamente."
                })
                yield f"event: error\ndata: {err_payload}\n\n"
                yield "event: end\ndata: {}\n\n"
        
        return StreamingResponse(
            generate(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no"
            }
        )
        
    except HTTPException as http_exc:
        logger.error(f"Error HTTP en chat_stream_log: {http_exc.detail}")
        raise
    except Exception as e:
        logger.error(f"Error general en chat_stream_log: {str(e)}", exc_info=True)
        return JSONResponse(
            status_code=500,
            content={"detail": "Error interno del servidor"}
        )


_HISTORY_DEFAULT_LIMIT = 500
_HISTORY_MAX_LIMIT = 2000


@router.get("/history/{conversation_id}")
async def get_history(
    conversation_id: str,
    request: Request,
    limit: int = Query(_HISTORY_DEFAULT_LIMIT, ge=1, le=_HISTORY_MAX_LIMIT),
    current_user: Optional[User] = Depends(get_optional_current_user),
):
    """Devuelve historial de mensajes (más recientes primero, devueltos en orden ASC).

    - Devuelve hasta `limit` mensajes (default 500, max 2000).
    - Headers: `X-Total-Messages` (total real), `X-Truncated` (1 si total > limit).
    - Sin paginación cursor todavía; el cliente debería paginar cuando supere el cap.
    """
    try:
        uuid.UUID(conversation_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="conversation_id inválido")
    try:
        chat_manager = request.app.state.chat_manager
        db = chat_manager.db

        total = await db.messages.count_documents({"conversation_id": conversation_id})

        # Recent-first fetch then reverse so UI keeps ASC ordering.
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
                "source": d.get("source") if current_user else None
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

def _normalize_messages_for_export(messages):
    """
    Normaliza documentos de la colección `messages` para exportación.
    - Elimina `_id`
    - Crea `Fecha y Hora` (Lima) desde `timestamp`
    - Ordena del más reciente al más antiguo
    - Renombra columnas base
    - Mantiene columnas extra sin alterar
    """
    import pandas as pd
    df = pd.json_normalize(messages, sep='__')
    if '_id' in df.columns:
        df = df.drop(columns=['_id'])
    if 'timestamp' in df.columns:
        ts = pd.to_datetime(df['timestamp'], errors='coerce', utc=True)
        ts_lima = ts.dt.tz_convert('America/Lima')
        df['Fecha y Hora'] = ts_lima.dt.strftime('%Y-%m-%d %H:%M:%S')
        df['Fecha y Hora'] = df['Fecha y Hora'].fillna('-')
        df['__ts'] = ts
        df = df.sort_values(['__ts'], ascending=False)
        df = df.drop(columns=['__ts', 'timestamp'])
    else:
        df['Fecha y Hora'] = '-'
        df = df.sort_values(['Fecha y Hora'], ascending=False)
    if 'conversation_id' in df.columns:
        df = df.rename(columns={'conversation_id': 'ID Conversación'})
    if 'role' in df.columns:
        df = df.rename(columns={'role': 'Rol'})
    if 'content' in df.columns:
        df = df.rename(columns={'content': 'Mensaje'})
    if 'source' in df.columns:
        df = df.rename(columns={'source': 'Fuente'})
    base_cols = [c for c in ['ID Conversación', 'Fecha y Hora', 'Rol', 'Mensaje', 'Fuente'] if c in df.columns]
    extras = [c for c in df.columns if c not in base_cols]
    ordered = base_cols + sorted(extras)
    df = df[ordered]
    return df


def _process_export(messages, format: str, current_time: str) -> tuple[bytes, str, str]:
    """Procesa la exportación en un hilo separado para no bloquear el event loop."""
    import pandas as pd
    import json as pyjson
    
    if format.lower() == 'xlsx':
        output = BytesIO()
        with pd.ExcelWriter(output, engine='xlsxwriter') as writer:
            if not messages:
                df = pd.DataFrame(columns=['ID Conversación', 'Fecha y Hora', 'Rol', 'Mensaje'])
                lima_now = datetime.now(ZoneInfo("America/Lima")).strftime('%Y-%m-%d %H:%M:%S')
                df.loc[0] = ["-", lima_now, "info", "Sin conversaciones registradas"]
                df.to_excel(writer, sheet_name='Conversaciones', index=False)
            else:
                df = _normalize_messages_for_export(messages)
                df.to_excel(writer, sheet_name='Conversaciones', index=False)

                workbook = writer.book
                worksheet = writer.sheets['Conversaciones']

                header_format = workbook.add_format({'bold': True, 'bg_color': '#D9E1F2', 'border': 1})
                conversation_format = workbook.add_format({'bg_color': '#E2EFDA', 'border': 1})
                cell_format = workbook.add_format({'border': 1, 'text_wrap': True})

                for col_num, value in enumerate(df.columns.values):
                    worksheet.write(0, col_num, value, header_format)

                current_conversation = None
                id_idx = df.columns.get_loc('ID Conversación') if 'ID Conversación' in df.columns else None
                for row_num, row in enumerate(df.itertuples(index=False), start=1):
                    conv = row[id_idx] if id_idx is not None else None
                    if conv != current_conversation:
                        current_conversation = conv
                        if conv is not None and id_idx is not None:
                            worksheet.write(row_num, id_idx, conv, conversation_format)
                    for col_idx in range(len(df.columns)):
                        if id_idx is not None and col_idx == id_idx and conv is not None:
                            continue
                        worksheet.write(row_num, col_idx, row[col_idx], cell_format)

                if 'ID Conversación' in df.columns:
                    worksheet.set_column(id_idx, id_idx, 36)
                if 'Fecha y Hora' in df.columns:
                    ts_idx = df.columns.get_loc('Fecha y Hora')
                    worksheet.set_column(ts_idx, ts_idx, 20)
                if 'Rol' in df.columns:
                    r_idx = df.columns.get_loc('Rol')
                    worksheet.set_column(r_idx, r_idx, 10)
                if 'Mensaje' in df.columns:
                    m_idx = df.columns.get_loc('Mensaje')
                    worksheet.set_column(m_idx, m_idx, 100)

                worksheet.autofilter(0, 0, len(df), len(df.columns) - 1)
                worksheet.freeze_panes(1, 0)

        output.seek(0)
        filename = f'conversaciones_{current_time}.xlsx'
        content = output.getvalue()
        media_type = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        return content, media_type, filename

    elif format.lower() == 'csv':
        if not messages:
            df = pd.DataFrame(columns=['ID Conversación', 'Fecha y Hora', 'Rol', 'Mensaje'])
            lima_now = datetime.now(ZoneInfo("America/Lima")).strftime('%Y-%m-%d %H:%M:%S')
            df.loc[0] = ["-", lima_now, "info", "Sin conversaciones registradas"]
        else:
            df = _normalize_messages_for_export(messages)
        csv_str = df.to_csv(index=False, sep=';', quoting=csv.QUOTE_ALL)
        csv_bytes = ('\ufeff' + csv_str).encode('utf-8')
        filename = f'conversaciones_{current_time}.csv'
        media_type = 'text/csv; charset=utf-8'
        return csv_bytes, media_type, filename

    elif format.lower() == 'json':
        if not messages:
            data = []
        else:
            df = _normalize_messages_for_export(messages)
            data = [dict(row) for row in df.to_dict(orient='records')]
        json_str = pyjson.dumps(data, ensure_ascii=False, indent=2)
        filename = f'conversaciones_{current_time}.json'
        media_type = 'application/json; charset=utf-8'
        return json_str.encode('utf-8'), media_type, filename

    else:
        raise ValueError("Formato de exportación no soportado: use xlsx, csv o json")


@router.get("/export-conversations")
async def export_conversations(
    request: Request,
    format: str = 'xlsx',
    sep: str = 'comma',
    pretty: bool = False,
    limit: int = Query(default=10_000, ge=1, le=50_000),
    _: User = Depends(require_view_debug),
):
    """Exporta conversaciones en XLSX (por defecto), CSV o JSON."""
    try:
        chat_manager = request.app.state.chat_manager
        db = chat_manager.db

        logger.warning("[export] Fetching up to %d messages", limit)
        cursor = db.messages.find({}).sort([("conversation_id", 1), ("timestamp", 1)])
        messages = await cursor.to_list(length=limit)

        current_time = datetime.now(ZoneInfo("America/Lima")).strftime('%Y%m%d_%H%M%S')
        
        # Ejecutar procesamiento pesado en un hilo separado
        try:
            content, media_type, filename = await asyncio.to_thread(
                _process_export, messages, format, current_time
            )
        except ValueError as ve:
             raise HTTPException(status_code=400, detail=str(ve))

        headers = {'Content-Disposition': f'attachment; filename="{filename}"'}
        return Response(content=content, media_type=media_type, headers=headers)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error al exportar conversaciones: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error al exportar conversaciones: {str(e)}")

@router.get("/stats")
async def get_stats(
    request: Request,
    _: User = Depends(get_current_active_user),
):
    """
    Obtiene estadísticas de consultas, usuarios activos y PDFs cargados.
    """
    try:
        chat_manager = request.app.state.chat_manager
        db = chat_manager.db
        pdf_file_manager = request.app.state.pdf_file_manager
        
        # Obtener total de consultas (mensajes)
        total_queries = await db.messages.count_documents({})

        # Cardinalidad de conversation_id vía aggregation (no carga IDs en memoria)
        users_pipeline = [
            {"$group": {"_id": "$conversation_id"}},
            {"$count": "n"},
        ]
        users_result = await db.messages.aggregate(users_pipeline).to_list(length=1)
        total_users = int(users_result[0]["n"]) if users_result else 0

        # Obtener total de PDFs del RAG
        pdfs = await pdf_file_manager.list_pdfs()
        total_pdfs = len(pdfs)
        
        return {
            "total_queries": total_queries,
            "total_users": total_users,
            "total_pdfs": total_pdfs
        }
        
    except Exception as e:
        logger.error(f"Error al obtener estadísticas: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error al obtener estadísticas: {str(e)}")


@router.get("/stats/history")
async def get_stats_history(
    request: Request,
    days: int = 7,
    _: User = Depends(get_current_active_user),
):
    """
    Estadísticas históricas agrupadas por día.

    - Param: `days` en {7, 30, 90}
    - Fuente: colección `messages` en MongoDB
    - Aggregation: `$match` por rango de fechas y `$group` por día usando `$dateToString`
    - `users_count`: cardinalidad de `conversation_id` por día usando `$addToSet` + `$size`
    - Rellena días faltantes con 0 para no romper la línea del gráfico
    """
    try:
        allowed = {7, 30, 90}
        if days not in allowed:
            days = 7

        chat_manager = request.app.state.chat_manager
        db = chat_manager.db

        from datetime import datetime, timedelta, timezone, time
        from zoneinfo import ZoneInfo

        tz = ZoneInfo("America/Lima")
        now_local = datetime.now(tz)
        start_local_date = (now_local - timedelta(days=days - 1)).date()
        end_local_date = now_local.date()
        start_local = datetime.combine(start_local_date, time.min, tz)
        end_local = datetime.combine(end_local_date, time.max, tz)
        start_utc = start_local.astimezone(timezone.utc)
        end_utc = end_local.astimezone(timezone.utc)

        pipeline = [
            {"$match": {"timestamp": {"$gte": start_utc, "$lte": end_utc}}},
            {
                "$group": {
                    "_id": {
                        "$dateToString": {
                            "format": "%Y-%m-%d",
                            "date": "$timestamp",
                            "timezone": "America/Lima",
                        }
                    },
                    "messages_count": {"$sum": 1},
                    "users_set": {"$addToSet": "$conversation_id"},
                }
            },
            {
                "$project": {
                    "_id": 0,
                    "date": "$_id",
                    "messages_count": 1,
                    "users_count": {"$size": "$users_set"},
                }
            },
            {"$sort": {"date": 1}},
        ]

        cursor = db.messages.aggregate(pipeline)
        results = await cursor.to_list(length=None)

        by_date = {r["date"]: r for r in results}
        filled = []
        for i in range(days):
            d = (start_local_date + timedelta(days=i)).isoformat()
            item = by_date.get(d)
            if item:
                filled.append(item)
            else:
                filled.append({"date": d, "messages_count": 0, "users_count": 0})

        return filled
    except Exception as e:
        logger.error(f"Error en stats history: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error al obtener estadísticas históricas: {str(e)}")


@router.get("/conversations")
async def list_recent_conversations(
    request: Request,
    limit: int = Query(50, ge=1, le=500),
    skip: int = Query(0, ge=0, le=1_000_000),
    search: Optional[str] = Query(None, max_length=200),
    start_date: Optional[datetime] = Query(None),
    end_date: Optional[datetime] = Query(None),
    hide_trivial: bool = Query(False),
    current_user=Depends(require_view_debug),
):
    try:
        chat_manager = request.app.state.chat_manager
        db = chat_manager.db

        # Ensure tz-aware UTC for Mongo comparison against stored timestamps
        if start_date is not None and start_date.tzinfo is None:
            start_date = start_date.replace(tzinfo=timezone.utc)
        if end_date is not None and end_date.tzinfo is None:
            end_date = end_date.replace(tzinfo=timezone.utc)

        data = await db.list_recent_conversations(
            limit=limit,
            skip=skip,
            search=search,
            start_date=start_date,
            end_date=end_date,
            hide_trivial=hide_trivial,
        )

        items_db = data.get("items", [])
        total = data.get("total", 0)

        items_processed = []
        for r in items_db:
            txt = str(r.get("last_message") or "").strip()
            m = 160
            preview = txt if len(txt) <= m else (txt[:m] + "…")
            ts = r.get("updated_at")
            items_processed.append({
                "conversation_id": r.get("conversation_id"),
                "last_message_preview": preview,
                "total_messages": int(r.get("total_messages") or 0),
                "updated_at": ts.isoformat() if hasattr(ts, "isoformat") else ts,
            })
        return Page[dict].build(
            items=items_processed,
            total=total,
            limit=limit,
            skip=skip,
        )
    except Exception as e:
        logger.error(f"Error al listar conversaciones: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Error al listar conversaciones")

@router.delete("/history")
async def clear_history(request: Request, current_user=Depends(require_view_debug)):
    """Borra historial de conversaciones + diagnóstico de retrieval.

    Limpia tres colecciones para que "borrar historial" sea exhaustivo:
      - messages: mensajes user/assistant
      - chat_profiles: perfiles de memoria por conversación
      - retrieval_logs: huellas de búsqueda que alimentan el tab de vacíos
        (sin esto, gaps históricos quedan visibles tras una limpieza).
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
            "message": "Historial eliminado correctamente"
        })
    except Exception as e:
        logger.error(f"Error al eliminar historial: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Error interno del servidor al eliminar historial")
