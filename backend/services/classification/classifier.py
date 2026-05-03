import json
import logging
from typing import Optional

from openai import AsyncOpenAI

from .prompt import build_classification_prompt, build_summary_only_prompt
from .schemas import ClassificationResult, SummaryResult

logger = logging.getLogger(__name__)

_VALID_CATEGORIES = {"informacion", "soporte", "comercial", "sin_valor"}
_VALID_URGENCIES = {"alta", "media", "baja"}


def _coerce_classification_data(data: dict) -> dict:
    """Clamp/default LLM output so Pydantic validation never raises on out-of-range values."""
    category = data.get("category")
    urgency = data.get("urgency")
    try:
        lead_score = max(0, min(100, int(data.get("lead_score") or 0)))
    except (TypeError, ValueError):
        lead_score = 0
    try:
        purchase_intent = max(0, min(100, int(data.get("purchase_intent") or 0)))
    except (TypeError, ValueError):
        purchase_intent = 0
    try:
        confidence = max(0.0, min(1.0, float(data.get("confidence") or 0.5)))
    except (TypeError, ValueError):
        confidence = 0.5
    return {
        "category": category if category in _VALID_CATEGORIES else "sin_valor",
        "urgency": urgency if urgency in _VALID_URGENCIES else "baja",
        "lead_score": lead_score,
        "purchase_intent": purchase_intent,
        "product_interests": data.get("product_interests") or [],
        "recommended_action": str(data.get("recommended_action") or "ninguna"),
        "confidence": confidence,
        "summary": str(data.get("summary") or ""),
    }

MESSAGE_WINDOW = 40
RECLASSIFY_THRESHOLD = 5
STABILITY_SECONDS = 30          # skip if a new message arrived within this window (wait for burst to settle)
FORCE_RECLASSIFY_THRESHOLD = 15  # bypass stability when the conversation has piled up many unclassified messages


async def _load_recent_messages(db, conversation_id: str) -> list[dict]:
    raw = (
        await db.messages
        .find({"conversation_id": conversation_id})
        .sort("timestamp", -1)
        .to_list(length=MESSAGE_WINDOW)
    )
    raw.reverse()
    return raw


def _format_lines(raw: list[dict]) -> str:
    lines = []
    for msg in raw:
        role = msg.get("role", "")
        content = msg.get("content", "")
        if role == "user":
            lines.append(f"Usuario: {content}")
        elif role in ("assistant", "ai"):
            lines.append(f"Bot: {content}")
        elif role == "agent":
            lines.append(f"Agente: {content}")
    return "\n".join(lines)


async def _get_total_count(db, conversation_id: str) -> int:
    return await db.messages.count_documents({"conversation_id": conversation_id})


async def _last_message_age_seconds(db, conversation_id: str) -> Optional[float]:
    doc = await db.messages.find_one(
        {"conversation_id": conversation_id},
        sort=[("timestamp", -1)],
        projection={"timestamp": 1},
    )
    ts = doc.get("timestamp") if doc else None
    if not ts:
        return None
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc)
    if ts.tzinfo is None:
        ts = ts.replace(tzinfo=timezone.utc)
    return (now - ts).total_seconds()


async def _get_conv_meta(db, conversation_id: str) -> Optional[dict]:
    return await db.conversations.find_one(
        {"conversation_id": conversation_id},
        {"last_classified_msg_count": 1, "stage": 1},
    )


async def classify_conversation(
    conversation_id: str,
    db,
    settings,
    force: bool = False,
) -> Optional[ClassificationResult]:
    try:
        meta = await _get_conv_meta(db, conversation_id)
        if meta and meta.get("stage") == "completed":
            logger.debug(f"[Classification] conv={conversation_id} stage=completed, skip")
            return None

        total_count = await _get_total_count(db, conversation_id)
        if total_count == 0:
            logger.info(f"[Classification] No messages for {conversation_id}, skipping")
            return None

        last_count = meta.get("last_classified_msg_count") if meta else None
        delta_unclassified = total_count - (last_count or 0)

        # Stability guard: if a message landed within the last STABILITY_SECONDS,
        # the user/bot is mid-burst — skip and let the next trigger handle it.
        # Escape hatch: if too many unclassified messages have piled up, classify
        # anyway so a chatty user never starves the classifier indefinitely.
        if not force and delta_unclassified < FORCE_RECLASSIFY_THRESHOLD:
            age = await _last_message_age_seconds(db, conversation_id)
            if age is not None and age < STABILITY_SECONDS:
                logger.debug(
                    f"[Classification] conv={conversation_id} last_msg_age={age:.1f}s < {STABILITY_SECONDS}s "
                    f"and delta={delta_unclassified} < {FORCE_RECLASSIFY_THRESHOLD}, skip"
                )
                return None

        if not force and last_count is not None:
            if delta_unclassified < RECLASSIFY_THRESHOLD:
                logger.debug(
                    f"[Classification] conv={conversation_id} delta={delta_unclassified} < threshold, skip"
                )
                return None

        raw = await _load_recent_messages(db, conversation_id)
        conversation_text = _format_lines(raw)
        if not conversation_text.strip():
            return None

        bot_name = getattr(settings, "bot_name", None) or "el bot"
        business_context = getattr(settings, "ui_prompt_extra", None) or ""
        system_prompt = build_classification_prompt(bot_name, business_context)

        api_key = settings.openai_api_key.get_secret_value()
        client = AsyncOpenAI(api_key=api_key)
        response = await client.chat.completions.create(
            model="gpt-4o-mini",
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": conversation_text},
            ],
            max_tokens=500,
            temperature=0,
        )

        raw_json = response.choices[0].message.content or ""
        try:
            data = json.loads(raw_json)
        except json.JSONDecodeError:
            logger.warning(
                "[Classification] conv=%s LLM returned non-JSON: %r", conversation_id, raw_json[:200]
            )
            return None
        result = ClassificationResult(**_coerce_classification_data(data))
        result.msg_count_at_classify = total_count
        logger.info(
            f"[Classification] conv={conversation_id} category={result.category} "
            f"urgency={result.urgency} score={result.lead_score} msgs={total_count}"
        )
        return result

    except Exception as e:
        logger.error(f"[Classification] Failed for conv={conversation_id}: {e}")
        return None


async def regenerate_summary(
    conversation_id: str,
    db,
    settings,
) -> Optional[SummaryResult]:
    try:
        total_count = await _get_total_count(db, conversation_id)
        if total_count == 0:
            return None

        raw = await _load_recent_messages(db, conversation_id)
        conversation_text = _format_lines(raw)
        if not conversation_text.strip():
            return None

        bot_name = getattr(settings, "bot_name", None) or "el bot"
        system_prompt = build_summary_only_prompt(bot_name)

        api_key = settings.openai_api_key.get_secret_value()
        client = AsyncOpenAI(api_key=api_key)
        response = await client.chat.completions.create(
            model="gpt-4o-mini",
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": conversation_text},
            ],
            max_tokens=300,
            temperature=0,
        )

        raw_json = response.choices[0].message.content
        data = json.loads(raw_json)
        summary = data.get("summary", "").strip()
        if not summary:
            return None
        logger.info(
            f"[Summary] conv={conversation_id} regenerated at msg_count={total_count}"
        )
        return SummaryResult(summary=summary, msg_count_at_summary=total_count)

    except Exception as e:
        logger.error(f"[Summary] Failed for conv={conversation_id}: {e}")
        return None
