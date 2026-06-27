"""Async-compatible circuit breaker for resilient service calls."""
import asyncio
import logging
import time
from typing import Awaitable, TypeVar

logger = logging.getLogger(__name__)
T = TypeVar("T")


class CircuitOpenError(RuntimeError):
    """Raised when the circuit is open and fast-failing requests."""


class CircuitBreaker:
    """Async circuit breaker: CLOSED → OPEN → HALF_OPEN → CLOSED.

    CLOSED:    normal operation; failures are counted.
    OPEN:      fast-fail; no backend calls until recovery_timeout elapses.
    HALF_OPEN: one probe allowed; success → CLOSED, failure → OPEN.
    """

    _CLOSED = "closed"
    _OPEN = "open"
    _HALF_OPEN = "half_open"

    def __init__(
        self,
        name: str,
        failure_threshold: int = 5,
        recovery_timeout: float = 60.0,
    ) -> None:
        self.name = name
        self.failure_threshold = failure_threshold
        self.recovery_timeout = recovery_timeout
        self._failures = 0
        self._opened_at: float = 0.0
        self._state = self._CLOSED
        self._lock = asyncio.Lock()

    def _effective_state(self) -> str:
        if self._state == self._OPEN:
            if time.monotonic() - self._opened_at >= self.recovery_timeout:
                return self._HALF_OPEN
        return self._state

    @property
    def is_open(self) -> bool:
        """True when the circuit is OPEN (fast-failing)."""
        return self._effective_state() == self._OPEN

    def status_dict(self) -> dict:
        """Return current state snapshot for monitoring endpoints."""
        state = self._effective_state()
        return {
            "state": state,
            "failures": self._failures,
            "is_open": state == self._OPEN,
        }

    async def call(self, coro: Awaitable[T]) -> T:
        """Run *coro* through the circuit breaker.

        Raises CircuitOpenError immediately when OPEN.
        On failure, increments the counter and opens the circuit at threshold.
        On success, resets the counter and closes the circuit.
        """
        async with self._lock:
            state = self._effective_state()
            if state == self._OPEN:
                try:
                    coro.close()
                except Exception:
                    pass
                raise CircuitOpenError(
                    f"Circuit '{self.name}' is OPEN — fast-failing request"
                )
            if state == self._HALF_OPEN:
                # Block concurrent probes: reset opened_at so others see OPEN
                self._opened_at = time.monotonic()

        try:
            result = await coro
        except Exception:
            async with self._lock:
                self._failures += 1
                if self._failures >= self.failure_threshold or state == self._HALF_OPEN:
                    self._state = self._OPEN
                    self._opened_at = time.monotonic()
                    logger.warning(
                        "CircuitBreaker '%s' OPEN | failures=%d", self.name, self._failures
                    )
            raise

        async with self._lock:
            if self._state != self._CLOSED:
                logger.info("CircuitBreaker '%s' CLOSED | recovered after probe", self.name)
            self._failures = 0
            self._state = self._CLOSED
        return result
