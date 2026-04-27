"""Debug chat routes — admin only, never persists to DB."""
import json
import uuid
import asyncio
from fastapi import APIRouter, Request, Depends, HTTPException
from fastapi.responses import StreamingResponse

from api.schemas import ChatRequest
from auth.dependencies import require_admin
from core.request_context import get_request_context
from models.user import User
from rag.retrieval.retriever import RetrievalBackendUnavailableError
from utils.logging_utils import get_logger

logger = get_logger(__name__)
router = APIRouter()


@router.post("/chat")
async def debug_chat_stream(
    request: Request,
    _: User = Depends(require_admin),
):
    """Streaming debug chat — admin only.

    Identical pipeline to /chat but:
    - Always runs with debug_mode=True (full metrics + prompt emitted via SSE event: debug)
    - Never persists messages or memory to MongoDB
    - Requires admin token
    """
    chat_manager = request.app.state.chat_manager
    bot = request.app.state.bot_instance

    if not bot.is_active:
        raise HTTPException(status_code=503, detail="El bot está desactivado actualmente")

    try:
        data = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="JSON malformado en la solicitud")

    try:
        chat_input = ChatRequest(**data)
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Cuerpo de la solicitud inválido: {e}")

    if not chat_input.input:
        raise HTTPException(status_code=400, detail="El mensaje no puede estar vacío")

    input_text = chat_input.input
    conversation_id = chat_input.conversation_id or str(uuid.uuid4())
    enable_verification = bool(chat_input.enable_verification)

    async def generate():
        try:
            stream_gen = chat_manager.generate_streaming_response(
                input_text,
                conversation_id,
                source="debug",
                debug_mode=True,
                enable_verification=enable_verification,
            )
            async for chunk in stream_gen:
                try:
                    payload = json.dumps({"stream": chunk})
                except Exception:
                    payload = json.dumps({"stream": str(chunk)})
                yield f"data: {payload}\n\n"

            try:
                dbg = get_request_context().debug_info
                if dbg is not None:
                    dct = dbg.model_dump() if hasattr(dbg, "model_dump") else dbg.dict()
                    if dct is not None:
                        yield f"event: debug\ndata: {json.dumps(dct)}\n\n"
            except Exception:
                pass

            yield "event: end\ndata: {}\n\n"

        except asyncio.TimeoutError:
            err = json.dumps({"message": "Timeout. Intenta nuevamente."})
            yield f"event: error\ndata: {err}\n\n"
            yield "event: end\ndata: {}\n\n"
        except RetrievalBackendUnavailableError as e:
            yield f"event: error\ndata: {json.dumps({'message': str(e)})}\n\n"
            yield "event: end\ndata: {}\n\n"
        except Exception as e:
            logger.error("Error en debug stream: %s", e, exc_info=True)
            err = json.dumps({"message": "Error procesando el mensaje."})
            yield f"event: error\ndata: {err}\n\n"
            yield "event: end\ndata: {}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
