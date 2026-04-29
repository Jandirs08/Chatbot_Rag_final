"""Handoff tool: lets the LLM request a human handoff explicitly.

Terminal mode — when called, the route layer emits an SSE `lead_form` event
and stops streaming. Classification runs in a background task downstream.
"""
from __future__ import annotations

import logging

from .base import ToolContext, ToolDefinition, ToolResult

logger = logging.getLogger(__name__)

HANDOFF_TOOL_NAME = "request_human_handoff"

HANDOFF_SCHEMA = {
    "type": "function",
    "function": {
        "name": HANDOFF_TOOL_NAME,
        "description": (
            "Llama esta función cuando el usuario pida explícitamente hablar con "
            "un humano/asesor, cuando no puedas responder con la información del "
            "contexto disponible, o cuando detectes que el tema está fuera de tu "
            "alcance. No la llames para preguntas conversacionales o que sí puedes "
            "responder con el contexto."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "reason": {
                    "type": "string",
                    "enum": ["user_request", "low_confidence", "out_of_scope"],
                    "description": (
                        "Motivo del handoff: user_request si el usuario lo pidió "
                        "explícitamente; low_confidence si no hay contexto suficiente; "
                        "out_of_scope si el tema no aplica al asistente."
                    ),
                }
            },
            "required": ["reason"],
        },
    },
}


async def _handler(args: dict, ctx: ToolContext) -> ToolResult:
    reason = args.get("reason") or "user_request"
    logger.info(
        "[Handoff] tool fired conv=%s reason=%s",
        ctx.conversation_id,
        reason,
    )

    mongodb_client = getattr(ctx.app_state, "mongodb_client", None) if ctx.app_state else None
    if mongodb_client is None:
        logger.warning(
            "[Handoff] no mongodb_client in app_state; skipping persist conv=%s",
            ctx.conversation_id,
        )
    else:
        try:
            from database.conversation_repository import ConversationRepository

            repo = ConversationRepository(mongodb_client)
            await repo.set_handoff_reason(ctx.conversation_id, reason)
        except Exception as exc:
            logger.warning(
                "[Handoff] failed to persist reason conv=%s: %s",
                ctx.conversation_id,
                exc,
            )

    return ToolResult(
        sse_event="lead_form",
        sse_payload={
            "conversation_id": ctx.conversation_id,
            "reason": reason,
            "user_message": "Claro, para que un asesor te contacte deja tu nombre y correo electrónico.",
        },
        stop_stream=True,
    )


HANDOFF_TOOL = ToolDefinition(
    name=HANDOFF_TOOL_NAME,
    schema=HANDOFF_SCHEMA,
    mode="terminal",
    handler=_handler,
    description="Request a human handoff",
)
