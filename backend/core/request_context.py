"""
RequestContext: contexto por-request para aislar datos mutables.

Problema que resuelve:
  Bot es un singleton compartido. Si Request A y Request B se
  ejecutan concurrentemente, los atributos _last_* de una request
  sobrescriben los de la otra → data leak silencioso.

Solución:
  Usar contextvars.ContextVar (aislamiento nativo en asyncio).
  Cada coroutine tiene su propio RequestContext automáticamente.
"""

from dataclasses import dataclass, field
from typing import Optional, List, Any
from contextvars import ContextVar


@dataclass
class RequestContext:
    """Datos mutables que antes vivían en Bot/ChatManager como _last_*."""
    retrieved_docs: List[Any] = field(default_factory=list)
    context: str = ""
    rag_time: Optional[float] = None
    gating_reason: Optional[str] = None
    debug_info: Optional[Any] = None  # DebugInfo de api.schemas


# ContextVar: cada tarea asyncio recibe su propia copia
_current_request_ctx: ContextVar[Optional[RequestContext]] = ContextVar(
    "request_ctx", default=None
)


def new_request_context() -> RequestContext:
    """Crea un RequestContext fresco y lo asocia a la coroutine actual."""
    ctx = RequestContext()
    _current_request_ctx.set(ctx)
    return ctx


def get_request_context() -> RequestContext:
    """Devuelve el RequestContext de la coroutine actual.
    
    Si no existe (e.g. tests o llamada fuera de request),
    crea uno temporal para no explotar.
    """
    ctx = _current_request_ctx.get()
    if ctx is None:
        ctx = RequestContext()
        _current_request_ctx.set(ctx)
    return ctx
