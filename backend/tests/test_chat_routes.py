from __future__ import annotations
import sys, types as _types
from unittest.mock import AsyncMock, MagicMock
import pytest

def _install_slowapi_stub():
    if "slowapi" in sys.modules:
        return
    sm  = _types.ModuleType("slowapi")
    su  = _types.ModuleType("slowapi.util")
    se  = _types.ModuleType("slowapi.errors")
    swm = _types.ModuleType("slowapi.middleware")
    class _NoopLimiter:
        def __init__(self, *a, **kw): pass
        def limit(self, *a, **kw): return lambda fn: fn
    sm.Limiter = _NoopLimiter
    su.get_remote_address = lambda r: "127.0.0.1"
    se.RateLimitExceeded = Exception
    swm.SlowAPIMiddleware = object
    sys.modules.update({"slowapi": sm, "slowapi.util": su, "slowapi.errors": se, "slowapi.middleware": swm})

_install_slowapi_stub()

import httpx
from fastapi import FastAPI
from api.routes.chat.chat_routes import router as chat_router
from auth.dependencies import get_optional_current_user


def _make_db_mock():
    cursor = MagicMock()
    cursor.sort.return_value = cursor
    cursor.limit.return_value = cursor
    cursor.to_list = AsyncMock(return_value=[])
    db = MagicMock()
    db.messages.count_documents = AsyncMock(return_value=0)
    db.messages.find.return_value = cursor
    return db


def _build_test_app(*, bot_active=True):
    app = FastAPI()
    bot = MagicMock()
    bot.is_active = bot_active
    app.state.bot_instance = bot
    chat_manager = MagicMock()
    chat_manager.db = _make_db_mock()
    app.state.chat_manager = chat_manager
    app.state.mongodb_client = MagicMock()
    app.state.auth_deps = MagicMock()
    async def _anonymous_user():
        return None
    app.dependency_overrides[get_optional_current_user] = _anonymous_user
    app.include_router(chat_router, prefix="/api/v1/chat")
    return app


@pytest.mark.anyio
async def test_post_chat_input_too_long_returns_422():
    app = _build_test_app(bot_active=True)
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post("/api/v1/chat/", json={"input": "x" * 2001})
    assert response.status_code == 422


@pytest.mark.anyio
async def test_post_chat_bot_disabled_returns_503():
    app = _build_test_app(bot_active=False)
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post("/api/v1/chat/", json={"input": "hola"})
    assert response.status_code == 503


@pytest.mark.anyio
async def test_get_history_returns_200_with_list():
    app = _build_test_app()
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/v1/chat/history/conv-test-abc123")
    assert response.status_code == 200
    assert isinstance(response.json(), list)


@pytest.mark.anyio
async def test_export_without_auth_returns_401_or_403():
    app = _build_test_app()
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/v1/chat/export-conversations")
    assert response.status_code in (401, 403)
