from __future__ import annotations

import json
import logging
from dataclasses import dataclass, replace
from typing import Sequence

from openai import AsyncOpenAI

from config import settings
from rag.ingestion.models import ParentDocument

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class ParentCandidate:
    parent: ParentDocument
    evidence: list[dict]
    dense_score: float = 0.0
    lexical_score: float = 0.0
    fused_score: float = 0.0
    rerank_score: float = 0.0


class BaseParentReranker:
    async def rerank(self, *, query: str, candidates: Sequence[ParentCandidate], limit: int) -> list[ParentCandidate]:
        raise NotImplementedError


class HeuristicParentReranker(BaseParentReranker):
    async def rerank(self, *, query: str, candidates: Sequence[ParentCandidate], limit: int) -> list[ParentCandidate]:
        ranked = sorted(
            candidates,
            key=lambda candidate: (
                candidate.fused_score
                + min(0.15, len(candidate.evidence) * 0.03)
                + (0.05 if candidate.parent.contains_table else 0.0)
                + (0.05 if candidate.parent.contains_numeric else 0.0)
                + (0.05 if candidate.parent.contains_date_like else 0.0)
            ),
            reverse=True,
        )
        return [replace(candidate, rerank_score=candidate.fused_score) for candidate in ranked[: max(1, limit)]]


class OpenAIParentReranker(BaseParentReranker):
    def __init__(
        self,
        *,
        model_name: str | None = None,
        timeout_seconds: float | None = None,
    ) -> None:
        api_key = settings.openai_api_key.get_secret_value() if settings.openai_api_key is not None else None
        self.client = AsyncOpenAI(api_key=api_key, timeout=timeout_seconds or settings.rag_reranker_timeout_seconds)
        self.model_name = model_name or settings.rag_reranker_model_name or settings.base_model_name

    async def rerank(self, *, query: str, candidates: Sequence[ParentCandidate], limit: int) -> list[ParentCandidate]:
        if not candidates:
            return []

        payload = {
            "query": query,
            "candidates": [
                {
                    "parent_id": candidate.parent.parent_id,
                    "source": candidate.parent.source,
                    "section_title": candidate.parent.section_title,
                    "page_span": f"{candidate.parent.page_start}-{candidate.parent.page_end}",
                    "dense_score": round(candidate.dense_score, 6),
                    "lexical_score": round(candidate.lexical_score, 6),
                    "fused_score": round(candidate.fused_score, 6),
                    "content": candidate.parent.content[:2200],
                    "evidence": [evidence.get("preview", "")[:400] for evidence in candidate.evidence[:3]],
                }
                for candidate in candidates[: max(1, limit)]
            ],
        }

        completion = await self.client.chat.completions.create(
            model=self.model_name,
            temperature=0,
            response_format={"type": "json_object"},
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are a retrieval reranker. Rank the candidate parent documents for the user query. "
                        "Prioritize exact technical relevance, preserving numbers, dates, HTTP codes, table semantics, "
                        "and configuration references. Return only JSON with keys ranked_parent_ids and scores."
                    ),
                },
                {
                    "role": "user",
                    "content": json.dumps(payload, ensure_ascii=False),
                },
            ],
        )
        raw_content = completion.choices[0].message.content if completion.choices else "{}"
        parsed = json.loads(raw_content or "{}")
        ranked_parent_ids = parsed.get("ranked_parent_ids") or []
        scores = self._normalize_scores(parsed.get("scores"))

        candidate_map = {candidate.parent.parent_id: candidate for candidate in candidates}
        reranked: list[ParentCandidate] = []
        for parent_id in ranked_parent_ids:
            if parent_id not in candidate_map:
                continue
            score = float(scores.get(parent_id, candidate_map[parent_id].fused_score) or 0.0)
            reranked.append(replace(candidate_map[parent_id], rerank_score=score))

        seen = {candidate.parent.parent_id for candidate in reranked}
        for candidate in sorted(candidates, key=lambda item: item.fused_score, reverse=True):
            if candidate.parent.parent_id in seen:
                continue
            reranked.append(replace(candidate, rerank_score=candidate.fused_score))

        return reranked[: max(1, limit)]

    def _normalize_scores(self, raw_scores) -> dict[str, float]:
        if isinstance(raw_scores, dict):
            normalized: dict[str, float] = {}
            for key, value in raw_scores.items():
                try:
                    normalized[str(key)] = float(value)
                except Exception:
                    continue
            return normalized

        if isinstance(raw_scores, list):
            normalized = {}
            for item in raw_scores:
                if not isinstance(item, dict):
                    continue
                parent_id = item.get("parent_id") or item.get("id")
                score = item.get("score")
                if parent_id is None:
                    continue
                try:
                    normalized[str(parent_id)] = float(score)
                except Exception:
                    continue
            return normalized

        return {}


def build_parent_reranker() -> BaseParentReranker:
    if not getattr(settings, "enable_llm_reranker", True):
        return HeuristicParentReranker()

    try:
        return OpenAIParentReranker()
    except Exception as exc:
        logger.warning("Falling back to heuristic reranker: %s", exc)
        return HeuristicParentReranker()
