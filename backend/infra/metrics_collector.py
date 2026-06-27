"""Collector in-memory de métricas operativas del chatbot.

Captura un sample por chat (con desglose de etapas + tool_calls + gating reason)
en sliding window de 1h. Counters acumulativos desde startup. Snapshot calculado
on-demand desde el endpoint admin (sin scrape continuo).

Diseño asume 1 worker (config_fragments.workers=1) para coherencia. Con N
workers, cada proceso tiene su deque local — el endpoint solo refleja el
worker que recibió la llamada. Si subes WORKERS, mover a Redis sorted set.

Cero dependencias externas. ~5µs por record. Memoria <1MB para 1000 samples.
"""
from __future__ import annotations

import os
import statistics
import threading
import time
from collections import Counter, deque
from dataclasses import dataclass, field
from typing import Any, Optional

# Precios OpenAI gpt-4o-mini (USD por 1M tokens, snapshot 2026-Q2).
# Ajustar si cambia el modelo default o pricing.
_INPUT_PRICE_PER_1M = 0.15
_OUTPUT_PRICE_PER_1M = 0.60

_DEFAULT_MAX_SAMPLES = 1000
_DEFAULT_TTL_SECONDS = 3600  # 1h sliding window


@dataclass
class ChatSample:
    """Snapshot de un chat completado. Todos los campos opcionales tolerados."""

    ts: float
    success: bool
    cached: bool
    used_rag: bool
    total_ms: float
    first_token_ms: Optional[float] = None
    rag_ms: Optional[float] = None
    llm_ms: Optional[float] = None
    embedding_ms: Optional[float] = None
    dense_ms: Optional[float] = None
    lexical_ms: Optional[float] = None
    hydrate_ms: Optional[float] = None
    rerank_ms: Optional[float] = None
    tool_calls: int = 0
    tokens_in: int = 0
    tokens_out: int = 0
    gating_reason: Optional[str] = None


def _percentile(values: list[float], p: float) -> Optional[float]:
    """p como fracción 0-1. Devuelve None si la lista está vacía."""
    if not values:
        return None
    if len(values) == 1:
        return float(values[0])
    sorted_values = sorted(values)
    k = (len(sorted_values) - 1) * p
    f = int(k)
    c = min(f + 1, len(sorted_values) - 1)
    if f == c:
        return float(sorted_values[f])
    d0 = sorted_values[f] * (c - k)
    d1 = sorted_values[c] * (k - f)
    return float(d0 + d1)


def _stage_stats(samples: list[ChatSample], attr: str) -> dict[str, Optional[float]]:
    values = [getattr(s, attr) for s in samples if getattr(s, attr) is not None]
    if not values:
        return {"count": 0, "p50": None, "p95": None, "p99": None, "avg": None}
    return {
        "count": len(values),
        "p50": _percentile(values, 0.50),
        "p95": _percentile(values, 0.95),
        "p99": _percentile(values, 0.99),
        "avg": round(statistics.fmean(values), 2),
    }


def _samples_in_window(samples: list[ChatSample], now: float, seconds: float) -> list[ChatSample]:
    cutoff = now - seconds
    return [s for s in samples if s.ts >= cutoff]


class MetricsCollector:
    """Singleton thread-safe. Solo expone record_chat / record_rate_limit / snapshot."""

    def __init__(
        self,
        max_samples: int = _DEFAULT_MAX_SAMPLES,
        ttl_seconds: float = _DEFAULT_TTL_SECONDS,
    ) -> None:
        self._lock = threading.Lock()
        self._samples: deque[ChatSample] = deque(maxlen=max_samples)
        self._max_samples = max_samples
        self._ttl_seconds = ttl_seconds

        # Counters acumulativos desde startup
        self._chats_total = 0
        self._chats_success = 0
        self._chats_error = 0
        self._cache_hits = 0
        self._cache_misses = 0
        self._tokens_in_total = 0
        self._tokens_out_total = 0
        self._rate_limit_hits = 0
        self._rag_chats_total = 0  # chats que invocaron search_documents
        self._gating_reasons: Counter[str] = Counter()
        self._startup_time = time.time()

    def record_chat(self, sample: ChatSample) -> None:
        with self._lock:
            self._samples.append(sample)
            self._chats_total += 1
            if sample.success:
                self._chats_success += 1
            else:
                self._chats_error += 1
            if sample.cached:
                self._cache_hits += 1
            else:
                self._cache_misses += 1
            if sample.used_rag:
                self._rag_chats_total += 1
            self._tokens_in_total += int(sample.tokens_in or 0)
            self._tokens_out_total += int(sample.tokens_out or 0)
            if sample.gating_reason:
                self._gating_reasons[sample.gating_reason] += 1

    def record_rate_limit(self) -> None:
        with self._lock:
            self._rate_limit_hits += 1

    def reset(self) -> None:
        """Reinicia counters + samples. Útil en tests."""
        with self._lock:
            self._samples.clear()
            self._chats_total = 0
            self._chats_success = 0
            self._chats_error = 0
            self._cache_hits = 0
            self._cache_misses = 0
            self._tokens_in_total = 0
            self._tokens_out_total = 0
            self._rate_limit_hits = 0
            self._rag_chats_total = 0
            self._gating_reasons.clear()
            self._startup_time = time.time()

    def _prune_expired(self, now: float) -> None:
        cutoff = now - self._ttl_seconds
        while self._samples and self._samples[0].ts < cutoff:
            self._samples.popleft()

    def snapshot(self) -> dict[str, Any]:
        now = time.time()
        with self._lock:
            self._prune_expired(now)
            samples = list(self._samples)
            chats_total = self._chats_total
            chats_success = self._chats_success
            chats_error = self._chats_error
            cache_hits = self._cache_hits
            cache_misses = self._cache_misses
            tokens_in_total = self._tokens_in_total
            tokens_out_total = self._tokens_out_total
            rate_limit_hits = self._rate_limit_hits
            rag_chats_total = self._rag_chats_total
            gating_dist = dict(self._gating_reasons)
            uptime = now - self._startup_time

        # Latencias por etapa (rolling window)
        latency = {
            "total_ms": _stage_stats(samples, "total_ms"),
            "first_token_ms": _stage_stats(samples, "first_token_ms"),
            "llm_ms": _stage_stats(samples, "llm_ms"),
            "rag_ms": _stage_stats(samples, "rag_ms"),
            "embedding_ms": _stage_stats(samples, "embedding_ms"),
            "dense_ms": _stage_stats(samples, "dense_ms"),
            "lexical_ms": _stage_stats(samples, "lexical_ms"),
            "hydrate_ms": _stage_stats(samples, "hydrate_ms"),
            "rerank_ms": _stage_stats(samples, "rerank_ms"),
        }

        # Throughput por ventana (chats/min)
        windows = {"1m": 60, "5m": 300, "15m": 900, "60m": 3600}
        throughput: dict[str, dict[str, Any]] = {}
        for label, seconds in windows.items():
            window_samples = _samples_in_window(samples, now, seconds)
            errors = sum(1 for s in window_samples if not s.success)
            throughput[label] = {
                "chats": len(window_samples),
                "chats_per_min": round(len(window_samples) / (seconds / 60), 2),
                "error_rate": round(errors / len(window_samples), 4) if window_samples else 0.0,
            }

        # RAG usage rate
        rag_usage_rate = round(rag_chats_total / chats_total, 4) if chats_total else 0.0

        # Tokens y costo OpenAI: pendientes de cablear callback `usage` de ChatOpenAI.
        # Mientras tokens_*_total siga en 0, exponemos el campo `pending_token_callback`
        # para que el dashboard distinga "no hay callback" de "no hubo tokens".
        tokens_pending = tokens_in_total == 0 and tokens_out_total == 0 and chats_total > 0
        tokens_block: dict[str, Any] = {
            "tokens_in": tokens_in_total,
            "tokens_out": tokens_out_total,
            "pending_token_callback": tokens_pending,
        }
        if not tokens_pending:
            tokens_block["estimated_cost_usd"] = round(
                (tokens_in_total / 1_000_000) * _INPUT_PRICE_PER_1M
                + (tokens_out_total / 1_000_000) * _OUTPUT_PRICE_PER_1M,
                4,
            )

        return {
            "ts": now,
            "worker_pid": os.getpid(),
            "uptime_seconds": round(uptime, 1),
            "samples": {
                "in_window": len(samples),
                "max": self._max_samples,
                "ttl_seconds": self._ttl_seconds,
            },
            "totals": {
                "chats": chats_total,
                "success": chats_success,
                "error": chats_error,
                "rag_chats": rag_chats_total,
                "rag_usage_rate": rag_usage_rate,
                "rate_limit_hits": rate_limit_hits,
            },
            "tokens": tokens_block,
            "latency_ms": latency,
            "throughput": throughput,
            "gating_reasons": gating_dist,
        }


# Singleton
_collector: Optional[MetricsCollector] = None
_singleton_lock = threading.Lock()


def get_metrics_collector() -> MetricsCollector:
    global _collector
    if _collector is None:
        with _singleton_lock:
            if _collector is None:
                _collector = MetricsCollector()
    return _collector
