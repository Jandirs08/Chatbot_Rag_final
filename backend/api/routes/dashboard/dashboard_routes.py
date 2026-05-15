"""Dashboard analytics routes — admin only."""
import asyncio
from datetime import datetime, timezone, timedelta, time
from typing import List, Optional
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from auth.dependencies import require_admin
from cache.manager import cache
from database.mongodb import get_mongodb_client
from database.retrieval_log_repository import GAP_REASONS, REASON_META
from utils.logging_utils import get_logger
from utils.metrics_collector import get_metrics_collector

logger = get_logger(__name__)
router = APIRouter()

_TZ = ZoneInfo("America/Lima")
_TTL_OVERVIEW = 120
_TTL_LEADS = 300
_TTL_PEAK_HOURS = 3600
_TTL_GAPS = 60

_GAP_WINDOWS_DAYS = {"24h": 1, "7d": 7, "30d": 30}
_GAP_MAX_LIMIT = 500


def _get_db(request: Request):
    mongodb_client = getattr(request.app.state, "mongodb_client", None) or get_mongodb_client()
    return mongodb_client.db


class OverviewResponse(BaseModel):
    today_messages: int
    total_messages: int
    today_conversations: int
    total_conversations: int
    leads_total: int
    leads_this_week: int
    pdfs_ready: int


class LeadItem(BaseModel):
    conversation_id: str
    lead_name: Optional[str] = None
    lead_email: str
    captured_at: Optional[datetime] = None


class LeadsResponse(BaseModel):
    total: int
    this_week: int
    items: List[LeadItem]


class HourBucket(BaseModel):
    hour: int
    count: int


class PeakHoursResponse(BaseModel):
    items: List[HourBucket]
    timezone: str = "America/Lima"


class KnowledgeGapItem(BaseModel):
    query: str
    gating_reason: str
    top_score: Optional[float] = None
    chunk_count: int
    conversation_id: str
    logged_at: datetime


class GapReasonCount(BaseModel):
    reason: str
    count: int


class KnowledgeGapsResponse(BaseModel):
    window: str
    total: int
    by_reason: List[GapReasonCount]
    items: List[KnowledgeGapItem]


class GapReasonMeta(BaseModel):
    reason: str
    label: str
    severity: str


class GapReasonsResponse(BaseModel):
    items: List[GapReasonMeta]


@router.get("/overview", response_model=OverviewResponse)
async def get_overview(request: Request, _=Depends(require_admin)):
    cached = await cache.aget("dashboard:overview")
    if cached is not None:
        return OverviewResponse.model_validate(cached)

    try:
        db = _get_db(request)
        now_lima = datetime.now(_TZ)
        today_start_utc = datetime.combine(now_lima.date(), time.min, _TZ).astimezone(timezone.utc)
        week_ago_utc = datetime.now(timezone.utc) - timedelta(days=7)

        has_lead = {"lead_email": {"$exists": True, "$ne": None, "$nin": ["", None]}}

        def _count_distinct(pipeline_match: dict):
            return db.messages.aggregate([
                {"$match": pipeline_match},
                {"$group": {"_id": "$conversation_id"}},
                {"$count": "n"},
            ]).to_list(length=1)

        (
            today_messages,
            total_messages,
            today_conv_res,
            total_conv_res,
            leads_total,
            leads_this_week,
            pdfs_ready,
        ) = await asyncio.gather(
            db.messages.count_documents({"timestamp": {"$gte": today_start_utc}}),
            db.messages.count_documents({}),
            _count_distinct({"timestamp": {"$gte": today_start_utc}}),
            _count_distinct({}),
            db.conversations.count_documents(has_lead),
            db.conversations.count_documents({**has_lead, "lead_captured_at": {"$gte": week_ago_utc}}),
            db.document_ingestion_status.count_documents({"status": "ready"}),
        )

        result = OverviewResponse(
            today_messages=today_messages,
            total_messages=total_messages,
            today_conversations=today_conv_res[0]["n"] if today_conv_res else 0,
            total_conversations=total_conv_res[0]["n"] if total_conv_res else 0,
            leads_total=leads_total,
            leads_this_week=leads_this_week,
            pdfs_ready=pdfs_ready,
        )
        await cache.aset("dashboard:overview", result.model_dump(), ttl=_TTL_OVERVIEW)
        return result

    except Exception:
        logger.exception("Error in dashboard overview")
        raise HTTPException(status_code=500, detail="Error al obtener resumen del dashboard")


@router.get("/leads", response_model=LeadsResponse)
async def get_leads(request: Request, _=Depends(require_admin)):
    cached = await cache.aget("dashboard:leads")
    if cached is not None:
        return LeadsResponse.model_validate(cached)

    try:
        db = _get_db(request)
        week_ago_utc = datetime.now(timezone.utc) - timedelta(days=7)
        has_lead = {"lead_email": {"$exists": True, "$ne": None, "$nin": ["", None]}}

        cursor = db.conversations.find(
            has_lead,
            {"conversation_id": 1, "lead_name": 1, "lead_email": 1, "lead_captured_at": 1},
        ).sort("lead_captured_at", -1).limit(20)

        docs, total, this_week = await asyncio.gather(
            cursor.to_list(length=20),
            db.conversations.count_documents(has_lead),
            db.conversations.count_documents({
                **has_lead,
                "lead_captured_at": {"$gte": week_ago_utc},
            }),
        )

        items = [
            LeadItem(
                conversation_id=d.get("conversation_id", ""),
                lead_name=d.get("lead_name"),
                lead_email=d.get("lead_email", ""),
                captured_at=d.get("lead_captured_at"),
            )
            for d in docs
        ]

        result = LeadsResponse(total=total, this_week=this_week, items=items)
        await cache.aset("dashboard:leads", result.model_dump(), ttl=_TTL_LEADS)
        return result

    except Exception:
        logger.exception("Error in dashboard leads")
        raise HTTPException(status_code=500, detail="Error al obtener leads del dashboard")


@router.get("/peak-hours", response_model=PeakHoursResponse)
async def get_peak_hours(request: Request, _=Depends(require_admin)):
    cached = await cache.aget("dashboard:peak_hours")
    if cached is not None:
        return PeakHoursResponse.model_validate(cached)

    try:
        db = _get_db(request)
        since_30d = datetime.now(timezone.utc) - timedelta(days=30)

        # UTC-5 (Lima): (utc_hour - 5 + 24) % 24 avoids negative mod
        pipeline = [
            {"$match": {"timestamp": {"$gte": since_30d}}},
            {
                "$group": {
                    "_id": {
                        "$mod": [
                            {"$add": [{"$subtract": [{"$hour": "$timestamp"}, 5]}, 24]},
                            24,
                        ]
                    },
                    "count": {"$sum": 1},
                }
            },
            {"$sort": {"_id": 1}},
        ]

        cursor = db.messages.aggregate(pipeline)
        raw = await cursor.to_list(length=None)
        by_hour = {r["_id"]: r["count"] for r in raw}
        items = [HourBucket(hour=h, count=by_hour.get(h, 0)) for h in range(24)]

        result = PeakHoursResponse(items=items)
        await cache.aset("dashboard:peak_hours", result.model_dump(), ttl=_TTL_PEAK_HOURS)
        return result

    except Exception:
        logger.exception("Error in dashboard peak-hours")
        raise HTTPException(status_code=500, detail="Error al obtener distribucion horaria")


@router.get("/gap-reasons", response_model=GapReasonsResponse)
async def get_gap_reasons(_=Depends(require_admin)):
    """Reason metadata (label + severity) for knowledge-gaps UI.

    Single source of truth lives in REASON_META (backend). Frontend fetches
    this to render chips without hardcoding labels — adding a new reason on
    the backend automatically surfaces it in the UI on next page load.
    """
    items = [
        GapReasonMeta(reason=r, label=meta["label"], severity=meta["severity"])
        for r, meta in REASON_META.items()
    ]
    return GapReasonsResponse(items=items)


@router.get("/knowledge-gaps", response_model=KnowledgeGapsResponse)
async def get_knowledge_gaps(
    request: Request,
    window: str = "7d",
    reason: Optional[str] = None,
    limit: int = 100,
    _=Depends(require_admin),
):
    """Queries that hit the corpus but didn't find an answer.

    Reads `retrieval_logs` filtered by gating_reason ∈ GAP_REASONS.
    Used by /admin/observability "Vacíos de conocimiento" tab.
    """
    days = _GAP_WINDOWS_DAYS.get(window)
    if days is None:
        raise HTTPException(status_code=400, detail=f"window inválido. Usa: {list(_GAP_WINDOWS_DAYS)}")

    limit = max(1, min(limit, _GAP_MAX_LIMIT))

    if reason is not None and reason not in GAP_REASONS:
        raise HTTPException(status_code=400, detail=f"reason inválido. Usa: {sorted(GAP_REASONS)}")

    cache_key = f"dashboard:knowledge_gaps:{window}:{reason or 'all'}:{limit}"
    cached = await cache.aget(cache_key)
    if cached is not None:
        return KnowledgeGapsResponse.model_validate(cached)

    try:
        db = _get_db(request)
        since_utc = datetime.now(timezone.utc) - timedelta(days=days)
        reason_filter = {"$in": list(GAP_REASONS)} if reason is None else reason
        match = {"logged_at": {"$gte": since_utc}, "gating_reason": reason_filter}

        items_cursor = db.retrieval_logs.find(
            match,
            {
                "_id": 0,
                "query": 1,
                "gating_reason": 1,
                "chunks": 1,
                "chunk_count": 1,
                "conversation_id": 1,
                "logged_at": 1,
            },
        ).sort("logged_at", -1).limit(limit)

        by_reason_pipeline = [
            {"$match": match},
            {"$group": {"_id": "$gating_reason", "count": {"$sum": 1}}},
            {"$sort": {"count": -1}},
        ]

        docs, by_reason_raw, total = await asyncio.gather(
            items_cursor.to_list(length=limit),
            db.retrieval_logs.aggregate(by_reason_pipeline).to_list(length=None),
            db.retrieval_logs.count_documents(match),
        )

        items: List[KnowledgeGapItem] = []
        for d in docs:
            chunks = d.get("chunks") or []
            scores = [c.get("score") for c in chunks if isinstance(c.get("score"), (int, float))]
            top_score = max(scores) if scores else None
            items.append(KnowledgeGapItem(
                query=d.get("query", ""),
                gating_reason=d.get("gating_reason", "unknown"),
                top_score=top_score,
                chunk_count=int(d.get("chunk_count") or 0),
                conversation_id=d.get("conversation_id", ""),
                logged_at=d.get("logged_at"),
            ))

        by_reason = [GapReasonCount(reason=r["_id"], count=r["count"]) for r in by_reason_raw if r.get("_id")]

        result = KnowledgeGapsResponse(
            window=window,
            total=total,
            by_reason=by_reason,
            items=items,
        )
        await cache.aset(cache_key, result.model_dump(mode="json"), ttl=_TTL_GAPS)
        return result

    except HTTPException:
        raise
    except Exception:
        logger.exception("Error in dashboard knowledge-gaps")
        raise HTTPException(status_code=500, detail="Error al obtener vacíos de conocimiento")


@router.get("/observability")
async def get_observability(_=Depends(require_admin)):
    """Métricas operativas in-memory: latencias por etapa, throughput, gating.

    Las muestras viven en sliding window 1h dentro del proceso (1 worker recomendado).
    Para historiales largos, persistir snapshots periódicamente a Mongo (futuro).
    El campo `worker_pid` permite detectar si la respuesta provino de un worker
    distinto cuando WORKERS>1.
    """
    try:
        return get_metrics_collector().snapshot()
    except Exception:
        logger.exception("Error in dashboard observability")
        raise HTTPException(status_code=500, detail="Error al obtener métricas operativas")
