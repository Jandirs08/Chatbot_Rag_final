from __future__ import annotations

from types import SimpleNamespace

import pytest

from core.bot import Bot


pytestmark = pytest.mark.anyio


class _FakeRunnableChain:
    def __init__(self, parts):
        self.parts = parts

    async def astream(self, _inp):
        for part in self.parts:
            yield part


async def test_astream_chunked_emits_first_chunk_immediately_and_then_buffers():
    bot = Bot.__new__(Bot)
    bot.settings = SimpleNamespace(mock_mode=False, stream_min_chunk_chars=4)
    bot.chain_manager = SimpleNamespace(
        runnable_chain=_FakeRunnableChain(["H", "ola", " mundo"])
    )

    chunks = []
    async for chunk in bot.astream_chunked({"input": "hola", "conversation_id": "conv-1"}):
        chunks.append(chunk)

    assert chunks == ["H", "ola mundo"]
