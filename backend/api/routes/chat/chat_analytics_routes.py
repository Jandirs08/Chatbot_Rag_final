"""Analytics and conversation listing routes for the chat API."""
from infra.logging_utils import get_logger
from typing import Optional
from datetime import datetime, timedelta, timezone, time
from zoneinfo import ZoneInfo
from fastapi import APIRouter, HTTPException, Query, Request, Depends
from fastapi.responses import JSONResponse

from api.schemas.pagination import Page
from auth.dependencies import get_current_active_user
from auth.permissions import require_view_debug
from domain.user import User

logger = get_logger(__name__)
router = APIRouter()


@router.get("/stats")
async def get_stats(
    request: Request,
    _: User = Depends(get_current_active_user),
):
    """Obtiene estadisticas de consultas, usuarios activos y PDFs cargados."""
    try:
        chat_manager = request.app.state.chat_manager
        db = chat_manager.db
        pdf_file_manager = request.app.state.pdf_file_manager

        total_queries = await db.messages.count_documents({})

        users_pipeline = [
            {"$group": {"_id": "$conversation_id"}},
            {"$count": "n"},
        ]
        users_result = await db.messages.aggregate(users_pipeline).to_list(length=1)
        total_users = int(users_result[0]["n"]) if users_result else 0

        pdfs = await pdf_file_manager.list_pdfs()
        total_pdfs = len(pdfs)

        return {
            "total_queries": total_queries,
            "total_users": total_users,
            "total_pdfs": total_pdfs,
        }
    except Exception as e:
        logger.error(f"Error al obtener estadisticas: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error al obtener estadisticas: {str(e)}")


@router.get("/stats/history")
async def get_stats_history(
    request: Request,
    days: int = 7,
    _: User = Depends(get_current_active_user),
):
    """Estadisticas historicas agrupadas por dia.

    - Param: `days` en {7, 30, 90}
    - Rellena dias faltantes con 0 para no romper la linea del grafico
    """
    try:
        allowed = {7, 30, 90}
        if days not in allowed:
            days = 7

        chat_manager = request.app.state.chat_manager
        db = chat_manager.db

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
        raise HTTPException(status_code=500, detail=f"Error al obtener estadisticas historicas: {str(e)}")


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
            preview = txt if len(txt) <= m else (txt[:m] + "...")
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
