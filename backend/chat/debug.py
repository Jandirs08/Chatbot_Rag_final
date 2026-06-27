"""Construcción del DebugInfo y log de timings para ChatManager."""
from typing import List

from api.schemas import DebugInfo, RetrievedDocument
from chat.turn_context import get_request_context
from utils.logging_utils import get_logger

logger = get_logger(__name__)

_TIKTOKEN_ENCODING = None


def get_token_count(text: str) -> int:
    """Cuenta tokens con tiktoken (lazy). Encoding `o200k_base` (gpt-4o-mini /
    gpt-4o / o4-mini). Fallback: len(text)//4 si tiktoken falla.

    Nota: si cambias el modelo a uno más viejo (gpt-3.5-turbo / gpt-4) el encoder
    correcto sería `cl100k_base`. Divergencia entre ambos para texto en español
    es <3% — aceptable mientras el modelo activo sea gpt-4o family.
    """
    global _TIKTOKEN_ENCODING
    try:
        if _TIKTOKEN_ENCODING is None:
            import tiktoken
            _TIKTOKEN_ENCODING = tiktoken.get_encoding("o200k_base")
        return int(len(_TIKTOKEN_ENCODING.encode(text or "")))
    except Exception:
        return int(max(0, (len(text or "") // 4)))


def _fmt_ms(value) -> str:
    if value is None:
        return "-"
    try:
        return f"{float(value):.1f}"
    except Exception:
        return "-"


def log_stream_timing_summary(conversation_id: str, is_cached: bool = False) -> None:
    """Log compacto de timings + tokens por etapa para una conversación que streameó."""
    try:
        req_ctx = get_request_context()
        timings = dict(getattr(req_ctx, "stage_timings_ms", {}) or {})
        tokens_in = int(getattr(req_ctx, "tokens_in", 0) or 0)
        tokens_out = int(getattr(req_ctx, "tokens_out", 0) or 0)
        logger.info(
            "[CHAT][PERF] conv=%s cached=%s history_ms=%s embedding_ms=%s dense_ms=%s lexical_ms=%s hydrate_ms=%s rerank_ms=%s first_token_ms=%s rag_ms=%s llm_ms=%s stream_total_ms=%s tokens_in=%s tokens_out=%s",
            conversation_id,
            int(bool(is_cached)),
            _fmt_ms(timings.get("history_ms")),
            _fmt_ms(timings.get("embedding_ms")),
            _fmt_ms(timings.get("dense_ms")),
            _fmt_ms(timings.get("lexical_ms")),
            _fmt_ms(timings.get("hydrate_ms")),
            _fmt_ms(timings.get("rerank_ms")),
            _fmt_ms(timings.get("first_token_ms")),
            _fmt_ms((req_ctx.rag_time * 1000) if req_ctx.rag_time is not None else None),
            _fmt_ms(timings.get("llm_ms")),
            _fmt_ms(timings.get("stream_total_ms")),
            tokens_in,
            tokens_out,
        )
    except Exception:
        pass


class DebugInfoBuilder:
    """Construye `DebugInfo` consolidando docs, prompt, tokens y latencias."""

    def __init__(self, bot) -> None:
        self.bot = bot

    async def build(
        self,
        *,
        conversation_id,
        input_text,
        final_text,
        t_start,
        t_end,
        verification=None,
        is_cached: bool = False,
    ) -> DebugInfo:
        try:
            req_ctx = get_request_context()
            docs = req_ctx.retrieved_docs or []
            items: List[RetrievedDocument] = []
            for d in docs:
                meta = getattr(d, "metadata", {}) or {}
                items.append(
                    RetrievedDocument(
                        text=getattr(d, "page_content", "") or "",
                        source=meta.get("source"),
                        score=(meta.get("score") if isinstance(meta.get("score"), (int, float)) else None),
                        file_path=meta.get("file_path"),
                        page_number=(int(meta.get("page_number")) if isinstance(meta.get("page_number"), (int, float)) else None),
                    )
                )

            prompt_str = getattr(self.bot.chain_manager, "prompt_template_str", "") or ""
            model_params = getattr(self.bot.chain_manager, "model_kwargs", {}) or {}
            hist = await self.bot.memory.get_history(conversation_id)
            formatted_hist = self.bot._format_history_str(hist)
            ctx = req_ctx.context or ""

            try:
                pv = getattr(self.bot.chain_manager, "prompt_vars", {}) or {}
                system_base = str(prompt_str).format(
                    nombre=str(pv.get("nombre") or ""),
                    bot_personality=str(pv.get("bot_personality") or ""),
                    context="",
                ).strip()
            except Exception:
                system_base = str(prompt_str)

            prompt_used = (
                f"<instructions>{system_base}</instructions>\n\n"
                f"<context>{ctx}</context>\n\n"
                f"<history>{formatted_hist}</history>"
            )

            input_tokens = (
                get_token_count(str(prompt_str))
                + get_token_count(str(formatted_hist))
                + get_token_count(str(ctx))
                + get_token_count(str(input_text))
            )
            output_tokens = get_token_count(str(final_text))
            rag_time = req_ctx.rag_time
            stage_timings_ms = dict(getattr(req_ctx, "stage_timings_ms", {}) or {})
            context_truncated = bool(getattr(req_ctx, "context_truncated", False))

            llm_time = None
            try:
                if (t_start is not None) and (t_end is not None):
                    llm_time = float(t_end - t_start)
            except Exception:
                llm_time = None

            gating_reason = req_ctx.gating_reason
            return DebugInfo(
                retrieved_documents=items,
                prompt_used=prompt_used,
                model_params=dict(model_params),
                rag_time=rag_time,
                llm_time=llm_time,
                history_ms=stage_timings_ms.get("history_ms"),
                embedding_ms=stage_timings_ms.get("embedding_ms"),
                dense_ms=stage_timings_ms.get("dense_ms"),
                lexical_ms=stage_timings_ms.get("lexical_ms"),
                hydrate_ms=stage_timings_ms.get("hydrate_ms"),
                rerank_ms=stage_timings_ms.get("rerank_ms"),
                llm_ms=stage_timings_ms.get("llm_ms"),
                first_token_ms=stage_timings_ms.get("first_token_ms"),
                stream_total_ms=stage_timings_ms.get("stream_total_ms"),
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                verification=verification,
                gating_reason=gating_reason,
                is_cached=bool(is_cached),
                tokens_estimated=True,
                context_truncated=context_truncated,
            )
        except Exception:
            req_ctx = get_request_context()
            return DebugInfo(
                retrieved_documents=[],
                prompt_used="",
                model_params={},
                gating_reason=req_ctx.gating_reason,
                is_cached=bool(is_cached),
            )
