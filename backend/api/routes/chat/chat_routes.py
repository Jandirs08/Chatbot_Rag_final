"""API routes for chat management."""
from utils.logging_utils import get_logger
import uuid
import json
import asyncio
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse, JSONResponse, Response
from io import BytesIO
from datetime import datetime
from zoneinfo import ZoneInfo
import csv

# Importar modelos Pydantic desde el módulo centralizado
from api.schemas import (
    ChatRequest
)
from utils.rate_limiter import limiter
from config import settings


logger = get_logger(__name__)
router = APIRouter()

# 🌐 NOTA: Todas las rutas de este módulo son PÚBLICAS
# No requieren autenticación para permitir acceso libre al chat

@router.post("/")
@limiter.limit(settings.chat_rate_limit)
async def chat_stream_log(request: Request):
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
        enable_verification = bool(getattr(chat_input, "enable_verification", False))
        
        if not input_text:
            raise HTTPException(status_code=400, detail="El mensaje no puede estar vacío")
        
        logger.info(f"Recibida solicitud de chat: '{input_text}' para conversación {conversation_id}")
        
        async def generate():
            try:
                logger.info(f"[SSE] Iniciando streaming para conv={conversation_id}")
                stream_gen = chat_manager.generate_streaming_response(input_text, conversation_id, source, debug_mode, enable_verification)
                async for chunk in stream_gen:
                    try:
                        payload = json.dumps({"stream": chunk})
                    except Exception:
                        payload = json.dumps({"stream": str(chunk)})
                    try:
                        logger.debug(f"[SSE] Chunk emitido len={len(str(chunk))}")
                    except Exception:
                        pass
                    yield f"data: {payload}\n\n"
                logger.info(f"[SSE] Streaming finalizado para conv={conversation_id}")
                if debug_mode:
                    try:
                        dbg = getattr(chat_manager, "_last_debug_info", None)
                        if dbg is not None:
                            dct = dbg.model_dump() if hasattr(dbg, "model_dump") else dbg.dict() if hasattr(dbg, "dict") else None
                            if dct is not None:
                                yield f"event: debug\ndata: {json.dumps(dct)}\n\n"
                    except Exception:
                        pass
                yield "event: end\ndata: {}\n\n"
            except asyncio.TimeoutError:
                err_payload = json.dumps({"message": "timeout"})
                yield f"event: error\ndata: {err_payload}\n\n"
                yield "event: end\ndata: {}\n\n"
            except Exception as e_stream:
                logger.error(f"Error en streaming: {str(e_stream)}", exc_info=True)
                err_payload = json.dumps({"message": "Error interno"})
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
            content={"detail": f"Error interno del servidor en chat: {str(e)}"}
        )


@router.get("/history/{conversation_id}")
async def get_history(conversation_id: str, request: Request):
    """Devuelve el historial de mensajes para una conversación.

    - Lee de la colección 'messages'.
    - Ordena por timestamp ascendente.
    - Devuelve únicamente: { role, content, timestamp, source (opcional) } por elemento.
    - Sin metadatos adicionales.
    """
    try:
        chat_manager = request.app.state.chat_manager
        db = chat_manager.db

        cursor = db.messages.find({
            "conversation_id": conversation_id
        }, {
            "_id": 0,
            "role": 1,
            "content": 1,
            "timestamp": 1,
            "source": 1,
        }).sort("timestamp", 1)

        docs = await cursor.to_list(length=None)

        # Normalizar timestamp a ISO 8601 para compatibilidad JSON
        history = []
        for d in docs:
            ts = d.get("timestamp")
            history.append({
                "role": d.get("role"),
                "content": d.get("content"),
                "timestamp": ts.isoformat() if hasattr(ts, "isoformat") else ts,
                "source": d.get("source")
            })

        return JSONResponse(content=history)
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


@router.get("/export-conversations")
async def export_conversations(request: Request, format: str = 'xlsx', sep: str = 'comma', pretty: bool = False):
    """Exporta conversaciones en XLSX (por defecto), CSV o JSON."""
    # Lazy-load de pandas para reducir tiempo/memoria de arranque
    import pandas as pd
    try:
        chat_manager = request.app.state.chat_manager
        db = chat_manager.db

        cursor = db.messages.find({}).sort([("conversation_id", 1), ("timestamp", 1)])
        messages = await cursor.to_list(length=None)

        current_time = datetime.now(ZoneInfo("America/Lima")).strftime('%Y%m%d_%H%M%S')
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
            headers = {'Content-Disposition': f'attachment; filename="{filename}"'}
            return Response(content=content, media_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', headers=headers)

        elif format.lower() == 'csv':
            import pandas as pd
            if not messages:
                df = pd.DataFrame(columns=['ID Conversación', 'Fecha y Hora', 'Rol', 'Mensaje'])
                lima_now = datetime.now(ZoneInfo("America/Lima")).strftime('%Y-%m-%d %H:%M:%S')
                df.loc[0] = ["-", lima_now, "info", "Sin conversaciones registradas"]
            else:
                df = _normalize_messages_for_export(messages)
            csv_str = df.to_csv(index=False, sep=';', quoting=csv.QUOTE_ALL)
            csv_bytes = ('\ufeff' + csv_str).encode('utf-8')
            filename = f'conversaciones_{current_time}.csv'
            headers = {'Content-Disposition': f'attachment; filename="{filename}"'}
            return Response(content=csv_bytes, media_type='text/csv; charset=utf-8', headers=headers)

        elif format.lower() == 'json':
            import json as pyjson
            if not messages:
                data = []
            else:
                df = _normalize_messages_for_export(messages)
                data = [dict(row) for row in df.to_dict(orient='records')]
            json_str = pyjson.dumps(data, ensure_ascii=False, indent=2)
            filename = f'conversaciones_{current_time}.json'
            headers = {'Content-Disposition': f'attachment; filename="{filename}"'}
            return Response(content=json_str.encode('utf-8'), media_type='application/json; charset=utf-8', headers=headers)

        else:
            raise HTTPException(status_code=400, detail="Formato de exportación no soportado: use xlsx, csv o json")

    except Exception as e:
        logger.error(f"Error al exportar conversaciones: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error al exportar conversaciones: {str(e)}")

@router.get("/stats")
async def get_stats(request: Request):
    """
    Obtiene estadísticas de consultas, usuarios activos y PDFs cargados.
    """
    try:
        chat_manager = request.app.state.chat_manager
        db = chat_manager.db
        pdf_file_manager = request.app.state.pdf_file_manager
        
        # Obtener total de consultas (mensajes)
        total_queries = await db.messages.count_documents({})
        
        # Obtener usuarios únicos (basado en conversation_id)
        unique_users = await db.messages.distinct("conversation_id")
        total_users = len(unique_users)
        
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
async def get_stats_history(request: Request, days: int = 7):
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
