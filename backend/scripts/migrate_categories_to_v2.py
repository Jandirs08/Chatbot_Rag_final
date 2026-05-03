"""
One-shot migration: rename old classifier categories to new neutral schema.

Old → New mapping:
    oportunidad       → comercial
    interes           → informacion
    requiere_atencion → soporte
    sin_interes       → sin_valor
    seguimiento       → soporte  (best-fit; was rare)

Also drops obsolete recommended_action `seguimiento_leve` to None so the next
classification will refresh it.

Run:
    python -m scripts.migrate_categories_to_v2 --dry-run   # preview
    python -m scripts.migrate_categories_to_v2             # apply
"""
from __future__ import annotations

import argparse
import asyncio
import logging
import sys

from database.mongodb import get_mongodb_client

logger = logging.getLogger("migrate_categories_v2")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

CATEGORY_MAP = {
    "oportunidad": "comercial",
    "interes": "informacion",
    "requiere_atencion": "soporte",
    "sin_interes": "sin_valor",
    "seguimiento": "soporte",
}

OBSOLETE_ACTIONS = {"seguimiento_leve"}


async def run(dry_run: bool) -> None:
    client = get_mongodb_client()
    coll = client.db["conversations"]

    total_updated = 0
    for old, new in CATEGORY_MAP.items():
        count = await coll.count_documents({"category": old})
        logger.info("category=%s → %s : %d documents", old, new, count)
        if count > 0 and not dry_run:
            result = await coll.update_many({"category": old}, {"$set": {"category": new}})
            total_updated += result.modified_count

    actions_count = await coll.count_documents({"recommended_action": {"$in": list(OBSOLETE_ACTIONS)}})
    logger.info("obsolete recommended_action: %d documents", actions_count)
    if actions_count > 0 and not dry_run:
        result = await coll.update_many(
            {"recommended_action": {"$in": list(OBSOLETE_ACTIONS)}},
            {"$set": {"recommended_action": "ninguna"}},
        )
        total_updated += result.modified_count

    if dry_run:
        logger.info("DRY RUN — no changes applied")
    else:
        logger.info("DONE — %d documents updated", total_updated)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="Preview without modifying data")
    args = parser.parse_args()
    asyncio.run(run(dry_run=args.dry_run))
    return 0


if __name__ == "__main__":
    sys.exit(main())
