"""API routes for chat management."""
from utils.logging_utils import get_logger
import uuid
import json
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse, JSONResponse, Response
from io import BytesIO
from datetime import datetime
from zoneinfo import ZoneInfo

# Importar modelos Pydantic desde el módulo centralizado
from api.schemas import (
    ChatRequest,
    StreamEventData
)


logger = get_logger(__name__)
router = APIRouter()

# 🌐 NOTA: Todas las rutas de este módulo son PÚBLICAS
# No requieren autenticación para permitir acceso libre al chat

@router.post("/")
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
        
        if not input_text:
            raise HTTPException(status_code=400, detail="El mensaje no puede estar vacío")
        
        logger.info(f"Recibida solicitud de chat: '{input_text}' para conversación {conversation_id}")
        
        response_content = await chat_manager.generate_response(input_text, conversation_id, source)
        logger.info("Respuesta generada por ChatManager")
        
        response_data_obj = StreamEventData(
            streamed_output=response_content,
            ops=None 
        )
        
        async def generate():
            try:
                yield f"data: {response_data_obj.model_dump_json()}\n\n"
                yield "event: end\ndata: {}\n\n"
            except Exception as e_stream:
                logger.error(f"Error en streaming: {str(e_stream)}", exc_info=True)
                error_event_data = StreamEventData(
                    streamed_output="Lo siento, hubo un error al procesar tu solicitud durante el streaming.",
                    ops=None
                )
                yield f"event: error\ndata: {error_event_data.model_dump_json()}\n\n"
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

@router.get("/export-conversations")
async def export_conversations(request: Request):
    """Exporta todas las conversaciones a un archivo Excel."""
    # Lazy-load de pandas para reducir tiempo/memoria de arranque
    import pandas as pd
    try:
        chat_manager = request.app.state.chat_manager
        db = chat_manager.db

        cursor = db.messages.find({}).sort([("conversation_id", 1), ("timestamp", 1)])
        messages = await cursor.to_list(length=None)

        output = BytesIO()
        with pd.ExcelWriter(output, engine='xlsxwriter') as writer:
            if not messages:
                # Crear un Excel vacío pero válido con encabezados y una fila informativa
                df = pd.DataFrame(columns=['ID Conversación', 'Fecha y Hora', 'Rol', 'Mensaje'])
                # Fecha en zona horaria Perú (UTC-5)
                lima_now = datetime.now(ZoneInfo("America/Lima")).strftime('%Y-%m-%d %H:%M:%S')
                df.loc[0] = ["-", lima_now, "info", "Sin conversaciones registradas"]
                df.to_excel(writer, sheet_name='Conversaciones', index=False)
            else:
                df = pd.DataFrame(messages)
                df = df.sort_values(['conversation_id', 'timestamp'])
                # Convertir timestamps a datetime, forzar UTC y tolerar valores nulos
                ts = pd.to_datetime(df['timestamp'], errors='coerce', utc=True)
                # Convertir a zona horaria Perú (UTC-5) y formatear
                ts_lima = ts.dt.tz_convert('America/Lima')
                df['timestamp_str'] = ts_lima.dt.strftime('%Y-%m-%d %H:%M:%S')
                # Rellenar nulos con marcador para no romper exportación
                df['timestamp_str'] = df['timestamp_str'].fillna('-')

                df = df.rename(columns={
                    'conversation_id': 'ID Conversación',
                    'timestamp_str': 'Fecha y Hora',
                    'role': 'Rol',
                    'content': 'Mensaje'
                })

                df = df[['ID Conversación', 'Fecha y Hora', 'Rol', 'Mensaje']]
                df.to_excel(writer, sheet_name='Conversaciones', index=False)

                workbook = writer.book
                worksheet = writer.sheets['Conversaciones']

                header_format = workbook.add_format({
                    'bold': True,
                    'bg_color': '#D9E1F2',
                    'border': 1
                })

                conversation_format = workbook.add_format({
                    'bg_color': '#E2EFDA',
                    'border': 1
                })

                message_format = workbook.add_format({
                    'border': 1,
                    'text_wrap': True
                })

                for col_num, value in enumerate(df.columns.values):
                    worksheet.write(0, col_num, value, header_format)

                current_conversation = None
                for row_num, row in enumerate(df.itertuples(), start=1):
                    if row[1] != current_conversation:
                        current_conversation = row[1]
                        worksheet.write(row_num, 0, row[1], conversation_format)
                    else:
                        worksheet.write(row_num, 0, row[1], message_format)

                    worksheet.write(row_num, 1, row[2], message_format)
                    worksheet.write(row_num, 2, row[3], message_format)
                    worksheet.write(row_num, 3, row[4], message_format)

                worksheet.set_column('A:A', 36)
                worksheet.set_column('B:B', 20)
                worksheet.set_column('C:C', 10)
                worksheet.set_column('D:D', 100)

                worksheet.autofilter(0, 0, len(df), len(df.columns) - 1)
                worksheet.freeze_panes(1, 0)

        output.seek(0)
        # Nombre del archivo usando hora de Lima para coherencia
        current_time = datetime.now(ZoneInfo("America/Lima")).strftime('%Y%m%d_%H%M%S')
        filename = f'conversaciones_{current_time}.xlsx'

        # Usar Response con contenido completo para mejorar compatibilidad con descargas
        content = output.getvalue()
        headers = {
            'Content-Disposition': f'attachment; filename="{filename}"'
        }
        return Response(content=content, media_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', headers=headers)

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