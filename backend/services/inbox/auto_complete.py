import asyncio
import logging

from database.conversation_repository import ConversationRepository

logger = logging.getLogger(__name__)

INTERVAL_SECONDS = 6 * 60 * 60
IDLE_DAYS = 7


async def auto_complete_loop(mongodb_client) -> None:
    while True:
        try:
            repo = ConversationRepository(mongodb_client)
            count = await repo.auto_complete_idle(days=IDLE_DAYS)
            if count > 0:
                logger.info(f"[AutoComplete] marked {count} conversations as completed (idle ≥ {IDLE_DAYS}d)")
        except asyncio.CancelledError:
            raise
        except Exception as e:
            logger.error(f"[AutoComplete] loop error: {e}", exc_info=True)
        await asyncio.sleep(INTERVAL_SECONDS)
