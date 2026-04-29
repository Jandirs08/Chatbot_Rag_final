import json
import logging
from typing import Optional

from openai import AsyncOpenAI

from .prompt import build_classification_prompt
from .schemas import ClassificationResult

logger = logging.getLogger(__name__)


async def classify_conversation(
    conversation_id: str,
    db,
    settings,
) -> Optional[ClassificationResult]:
    try:
        messages_coll = db.messages
        raw = (
            await messages_coll
            .find({"conversation_id": conversation_id})
            .sort("timestamp", 1)
            .to_list(length=20)
        )
        if not raw:
            logger.info(f"[Classification] No messages found for {conversation_id}, skipping")
            return None

        lines = []
        for msg in raw:
            role = msg.get("role", "")
            content = msg.get("content", "")
            if role == "user":
                lines.append(f"Usuario: {content}")
            elif role in ("assistant", "ai"):
                lines.append(f"Bot: {content}")
        conversation_text = "\n".join(lines)

        bot_name = getattr(settings, "bot_name", None) or "el bot"
        business_context = getattr(settings, "ui_prompt_extra", None) or ""

        # Fix 6: system prompt is pure instructions; conversation_text goes only in user message
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
            max_tokens=300,
            temperature=0,
        )

        raw_json = response.choices[0].message.content
        data = json.loads(raw_json)
        result = ClassificationResult(**data)
        logger.info(
            f"[Classification] conv={conversation_id} category={result.category} urgency={result.urgency}"
        )
        return result

    except Exception as e:
        logger.error(f"[Classification] Failed for conv={conversation_id}: {e}")
        return None
