"""Retrieval performance metrics and timing decorator."""
import logging
import statistics
import time
from collections import deque
from functools import wraps
from typing import Dict

logger = logging.getLogger(__name__)

_METRICS_MAX_SAMPLES = 1000
_METRICS_LOG_INTERVAL = 5


def measure_time(func):
    @wraps(func)
    async def wrapper(*args, **kwargs):
        self_obj = args[0] if args else None
        start_time = time.perf_counter()
        try:
            return await func(*args, **kwargs)
        finally:
            execution_time = time.perf_counter() - start_time
            if self_obj and hasattr(self_obj, "performance_metrics"):
                try:
                    self_obj.performance_metrics.add_metric("query_processing", execution_time)
                except Exception:
                    pass
    return wrapper


class PerformanceMetrics:
    def __init__(self, max_samples: int = _METRICS_MAX_SAMPLES):
        self.max_samples = max_samples
        self.metrics = {
            "query_processing": deque(maxlen=max_samples),
            "vector_retrieval": deque(maxlen=max_samples),
            "semantic_reranking": deque(maxlen=max_samples),
            "mmr_application": deque(maxlen=max_samples),
            "cache_operations": deque(maxlen=max_samples),
            "total_time": deque(maxlen=max_samples),
        }

    def add_metric(self, operation: str, time_taken: float) -> None:
        if operation in self.metrics:
            self.metrics[operation].append(time_taken)

    def get_statistics(self) -> Dict[str, Dict[str, float]]:
        stats: Dict[str, Dict[str, float]] = {}
        for operation, times in self.metrics.items():
            if not times:
                continue
            samples = list(times)
            stats[operation] = {
                "min": min(samples),
                "max": max(samples),
                "avg": statistics.mean(samples),
                "median": statistics.median(samples),
                "count": len(samples),
                "buffer_size": self.max_samples,
            }
        return stats

    def log_statistics(self) -> None:
        stats = self.get_statistics()
        logger.info("Performance statistics (last %d samples):", self.max_samples)
        for operation, metrics in stats.items():
            logger.info("%s:", operation)
            for metric, value in metrics.items():
                if metric in {"count", "buffer_size"}:
                    logger.info("  %s: %s", metric, value)
                else:
                    logger.info("  %s: %.3fs", metric, value)

    def reset(self) -> None:
        for key in self.metrics:
            self.metrics[key].clear()
