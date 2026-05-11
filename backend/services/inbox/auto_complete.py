import asyncio
import logging

from database.conversation_repository import ConversationRepository

logger = logging.getLogger(__name__)

INTERVAL_SECONDS = 6 * 60 * 60
IDLE_DAYS = 7


async def auto_complete_loop(mongodb_client) -> None:
    """Background sweep that closes idle conversations.

    Repository-level filters guarantee:
      - human-taken conversations are never closed (an agent owns them);
      - idleness is measured against last_message_at (real chat activity),
        falling back to updated_at for legacy rows.

    Tracks consecutive failures so a stuck loop (e.g. Mongo unreachable) is
    visible in logs at ERROR after the third failure instead of dripping
    warnings forever and silently letting the inbox grow unbounded.
    """
    consecutive_failures = 0
    while True:
        try:
            repo = ConversationRepository(mongodb_client)
            count = await repo.auto_complete_idle(days=IDLE_DAYS)
            consecutive_failures = 0
            if count > 0:
                logger.info(
                    "[AutoComplete] marked %s conversations as completed (idle >= %sd)",
                    count, IDLE_DAYS,
                )
        except asyncio.CancelledError:
            raise
        except Exception:
            consecutive_failures += 1
            if consecutive_failures >= 3:
                logger.error(
                    "[AutoComplete] loop failed %s times in a row — sweep is stuck",
                    consecutive_failures,
                    exc_info=True,
                )
            else:
                logger.warning(
                    "[AutoComplete] loop error (failure %s/3)",
                    consecutive_failures,
                    exc_info=True,
                )
        await asyncio.sleep(INTERVAL_SECONDS)
