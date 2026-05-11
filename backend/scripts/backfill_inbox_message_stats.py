"""One-shot backfill for inbox denormalized counters.

After introducing `last_message_at` and `message_count` on the conversations
collection, pre-existing conversations don't have these fields populated, so
they vanish from the inbox until they receive a new message.

This script walks the `messages` collection, computes per-conversation
{count, max_timestamp}, and writes them to the matching conversation doc.

Usage (from repo root):
    python -m backend.scripts.backfill_inbox_message_stats

Idempotent: safe to re-run. Only writes when current denormalized value
disagrees with the aggregated value (avoids unnecessary updates).
"""

from __future__ import annotations

import asyncio
import logging
import os
import sys
from pathlib import Path

# Allow running as a script from the repo root.
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))

from database.mongodb import get_mongodb_client  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("backfill_inbox")


async def backfill() -> dict:
    client = get_mongodb_client()
    db = client.db
    messages = db.messages
    conversations = db.conversations

    pipeline = [
        {
            "$group": {
                "_id": "$conversation_id",
                "count": {"$sum": 1},
                "last_message_at": {"$max": "$timestamp"},
            }
        }
    ]
    updated = 0
    skipped = 0
    missing_conv = 0
    examined = 0

    async for row in messages.aggregate(pipeline, allowDiskUse=True):
        examined += 1
        conv_id = row["_id"]
        if not conv_id:
            continue
        count = int(row.get("count", 0))
        last_at = row.get("last_message_at")
        existing = await conversations.find_one(
            {"conversation_id": conv_id},
            {"message_count": 1, "last_message_at": 1},
        )
        if existing is None:
            missing_conv += 1
            continue
        cur_count = existing.get("message_count")
        cur_last = existing.get("last_message_at")
        if cur_count == count and cur_last == last_at:
            skipped += 1
            continue
        await conversations.update_one(
            {"conversation_id": conv_id},
            {"$set": {"message_count": count, "last_message_at": last_at}},
        )
        updated += 1
        if updated % 500 == 0:
            logger.info("backfilled=%s skipped=%s examined=%s", updated, skipped, examined)

    return {
        "examined": examined,
        "updated": updated,
        "skipped": skipped,
        "missing_conv": missing_conv,
    }


def main() -> int:
    if os.name == "nt":
        # Windows asyncio default loop has occasional issues with motor; use Selector.
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    stats = asyncio.run(backfill())
    logger.info("Backfill done: %s", stats)
    return 0


if __name__ == "__main__":
    sys.exit(main())
