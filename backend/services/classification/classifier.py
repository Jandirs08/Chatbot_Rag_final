import json
import logging
from typing import Optional

from openai import AsyncOpenAI

from .prompt import build_classification_prompt, build_summary_only_prompt
from .schemas import ClassificationResult, SummaryResult

logger = logging.getLogger(__name__)

MESSAGE_WINDOW = 40
RECLASSIFY_THRESHOLD = 10


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
        if not force and last_count is not None:
            delta = total_count - last_count
            if delta < RECLASSIFY_THRESHOLD:
                logger.debug(
                    f"[Classification] conv={conversation_id} delta={delta} < threshold, skip"
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

        raw_json = response.choices[0].message.content
        data = json.loads(raw_json)
        result = ClassificationResult(**data)
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
