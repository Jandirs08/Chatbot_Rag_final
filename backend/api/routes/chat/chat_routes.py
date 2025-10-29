"""API routes for chat management."""
import logging
from utils.logging_utils import get_logger
import uuid
import json
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse, JSONResponse
import pandas as pd
from io import BytesIO
from datetime import datetime

# Importar modelos Pydantic desde el módulo centralizado
from api.schemas import (
    ChatRequest,
    StreamEventData,
    ClearHistoryResponse
)

from database.mongodb import MongodbClient

# from ..chat.manager import ChatManager # Se inyectará desde el estado de la app
# from ..rag.retrieval.retriever import RAGRetriever # Se inyectará desde el estado de la app

logger = get_logger(__name__)
router = APIRouter()

@router.post("/stream_log")
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
        
        if not input_text:
            raise HTTPException(status_code=400, detail="El mensaje no puede estar vacío")
        
        logger.info(f"Recibida solicitud de chat: '{input_text}' para conversación {conversation_id}")
        
        response_content = await chat_manager.generate_response(input_text, conversation_id)
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

@router.post("/clear/{conversation_id}", response_model=ClearHistoryResponse)
async def clear_history(request: Request, conversation_id: str):
    """Endpoint para limpiar el historial de una conversación."""
    chat_manager = request.app.state.chat_manager
    try:
        if hasattr(chat_manager, 'db') and hasattr(chat_manager.db, 'clear_conversation'):
            await chat_manager.db.clear_conversation(conversation_id)
            return ClearHistoryResponse(message="Historial limpiado exitosamente")
        else:
            # No-op en desarrollo si la operación no está disponible
            env = getattr(request.app.state.settings, 'environment', 'development')
            if env == 'development':
                logger.warning("clear_history no disponible en este entorno; devolviendo no-op.")
                return ClearHistoryResponse(message="Operación no disponible en este entorno (no-op)")
            logger.error("Error: chat_manager.db o clear_conversation no están disponibles.")
            raise HTTPException(status_code=501, detail="Operación no implementada")
    except Exception as e:
        logger.error(f"Error al limpiar historial '{conversation_id}': {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error interno del servidor al limpiar historial: {str(e)}")

@router.get("/export-conversations")
async def export_conversations(request: Request):
    """Exporta todas las conversaciones a un archivo Excel."""
    try:
        chat_manager = request.app.state.chat_manager
        db = chat_manager.db
        
        cursor = db.messages.find({}).sort([("conversation_id", 1), ("timestamp", 1)])
        messages = await cursor.to_list(length=None)
        
        if not messages:
            raise HTTPException(status_code=404, detail="No se encontraron conversaciones para exportar")
        
        df = pd.DataFrame(messages)
        output = BytesIO()
        
        with pd.ExcelWriter(output, engine='xlsxwriter') as writer:
            df = df.sort_values(['conversation_id', 'timestamp'])
            df['timestamp'] = pd.to_datetime(df['timestamp']).dt.strftime('%Y-%m-%d %H:%M:%S')
            
            df = df.rename(columns={
                'conversation_id': 'ID Conversación',
                'timestamp': 'Fecha y Hora',
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
        current_time = datetime.now().strftime('%Y%m%d_%H%M%S')
        filename = f'conversaciones_{current_time}.xlsx'
        
        return StreamingResponse(
            output,
            media_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            headers={'Content-Disposition': f'attachment; filename="{filename}"'}
        )
        
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