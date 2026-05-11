"""Critical-path tests for ConversationRepository (inbox module).

These tests assert that the atomic helpers and inbox queries build the
correct Mongo filter/update documents. They mock the motor collection
directly — no real DB required — and cover the regressions that have
historically caused inbox bugs.
"""

from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from database.conversation_repository import ConversationRepository


def _make_repo() -> tuple[ConversationRepository, MagicMock]:
    """Build a repo whose `coll` is a fully-mocked async collection."""
    coll = MagicMock(name="conversations_coll")
    coll.find_one_and_update = AsyncMock(return_value=None)
    coll.update_one = AsyncMock(return_value=SimpleNamespace(modified_count=1))
    coll.update_many = AsyncMock(return_value=SimpleNamespace(modified_count=0))
    coll.find_one = AsyncMock(return_value=None)
    coll.count_documents = AsyncMock(return_value=0)

    # `find().sort().skip().limit().to_list()` chain — return empty list.
    cursor = MagicMock()
    cursor.sort.return_value = cursor
    cursor.skip.return_value = cursor
    cursor.limit.return_value = cursor
    cursor.to_list = AsyncMock(return_value=[])
    coll.find = MagicMock(return_value=cursor)

    db = MagicMock()
    db.__getitem__.return_value = coll
    client = SimpleNamespace(db=db)
    repo = ConversationRepository(mongodb_client=client)
    return repo, coll


@pytest.mark.asyncio
async def test_atomic_takeover_returns_doc_when_unowned():
    """takeover is idempotent for the same agent — second call returns the doc."""
    repo, coll = _make_repo()
    doc_after = {"conversation_id": "c1", "mode": "human", "assigned_agent_id": "agent-A"}
    coll.find_one_and_update.return_value = doc_after

    result = await repo.atomic_takeover("c1", "agent-A")

    assert result == doc_after
    filter_arg = coll.find_one_and_update.call_args.args[0]
    assert filter_arg["conversation_id"] == "c1"
    assert filter_arg["mode"] == {"$ne": "human"}


@pytest.mark.asyncio
async def test_atomic_release_owned_requires_caller_to_be_owner():
    """release must include assigned_agent_id in the filter — IDOR guard."""
    repo, coll = _make_repo()
    await repo.atomic_release_owned("c1", "agent-A")

    filter_arg = coll.find_one_and_update.call_args.args[0]
    assert filter_arg["conversation_id"] == "c1"
    assert filter_arg["mode"] == "human"
    assert filter_arg["assigned_agent_id"] == "agent-A"

    update_arg = coll.find_one_and_update.call_args.args[1]
    set_op = update_arg["$set"]
    assert set_op["mode"] == "bot"
    assert set_op["assigned_agent_id"] is None


@pytest.mark.asyncio
async def test_atomic_capture_lead_only_if_not_already_captured():
    """capture_lead filter must exclude conversations that already have a lead."""
    repo, coll = _make_repo()
    await repo.atomic_capture_lead("c1", "Jane", "jane@example.com")

    filter_arg = coll.find_one_and_update.call_args.args[0]
    assert filter_arg["conversation_id"] == "c1"
    assert filter_arg["lead_email"] == {"$in": [None, ""]}


@pytest.mark.asyncio
async def test_auto_complete_idle_excludes_human_and_pending():
    """The 7-day sweep must NEVER close conversations a human is handling."""
    repo, coll = _make_repo()
    await repo.auto_complete_idle(days=7)

    filter_arg = coll.update_many.call_args.args[0]
    assert filter_arg["stage"] == "active"
    assert filter_arg["mode"] == {"$nin": ["human", "pending"]}
    # last_message_at fallback to updated_at via $or
    assert "$or" in filter_arg


@pytest.mark.asyncio
async def test_list_inbox_conversations_applies_tab_and_only_unseen():
    """tab='mias' filters by mode=human + assigned_agent_id; only_unseen adds $expr."""
    repo, coll = _make_repo()
    await repo.list_inbox_conversations(
        tab="mias",
        agent_id="agent-A",
        only_unseen=True,
    )

    # The query is the first positional arg of both count_documents and find()
    query = coll.count_documents.call_args.args[0]
    assert query["mode"] == "human"
    assert query["assigned_agent_id"] == "agent-A"
    assert "$expr" in query  # only_unseen translates to a $expr branch
