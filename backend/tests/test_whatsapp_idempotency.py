"""Tests para utils.whatsapp.idempotency.

Cubre el path en memoria (sin Redis) y la coherencia ante reintentos.
"""
import time

import pytest

from utils.whatsapp import idempotency


@pytest.fixture(autouse=True)
def _reset_state(monkeypatch):
    monkeypatch.setattr(idempotency, "_memory_store", {})
    monkeypatch.setattr(idempotency, "_get_redis_client", lambda: None)


def test_first_claim_returns_true():
    assert idempotency.claim_message("SM123") is True


def test_repeated_claim_returns_false_within_ttl():
    assert idempotency.claim_message("SM123") is True
    assert idempotency.claim_message("SM123") is False
    assert idempotency.claim_message("SM123") is False


def test_distinct_sids_independent():
    assert idempotency.claim_message("SMA") is True
    assert idempotency.claim_message("SMB") is True
    assert idempotency.claim_message("SMA") is False
    assert idempotency.claim_message("SMB") is False


def test_empty_sid_passes_through():
    # Sin MessageSid no podemos deduplicar; aceptar para no romper flujo.
    assert idempotency.claim_message("") is True
    assert idempotency.claim_message("") is True


def test_expired_entry_can_be_reclaimed(monkeypatch):
    assert idempotency.claim_message("SMX", ttl_seconds=1) is True

    fake_now = time.time() + 5
    monkeypatch.setattr(idempotency.time, "time", lambda: fake_now)

    assert idempotency.claim_message("SMX", ttl_seconds=1) is True


def test_redis_path_uses_set_nx(monkeypatch):
    calls = {}

    class FakeRedis:
        def set(self, name, value, ex, nx):
            calls["args"] = (name, value, ex, nx)
            return True

    monkeypatch.setattr(idempotency, "_get_redis_client", lambda: FakeRedis())

    assert idempotency.claim_message("SMR", ttl_seconds=120) is True
    assert calls["args"] == ("wa_msg_seen:SMR", b"1", 120, True)


def test_redis_failure_falls_back_to_memory(monkeypatch):
    class BrokenRedis:
        def set(self, *_args, **_kwargs):
            raise RuntimeError("boom")

    monkeypatch.setattr(idempotency, "_get_redis_client", lambda: BrokenRedis())

    assert idempotency.claim_message("SMF") is True
    assert idempotency.claim_message("SMF") is False
