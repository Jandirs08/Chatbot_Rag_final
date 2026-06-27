"""Unit tests for HeuristicParentReranker, OpenAIParentReranker._normalize_scores,
and the build_parent_reranker factory in rag.retrieval.reranker."""
from __future__ import annotations

from types import SimpleNamespace

import pytest

import rag.retrieval.reranker as reranker_mod
from rag.retrieval.reranker import (
    HeuristicParentReranker,
    OpenAIParentReranker,
    ParentCandidate,
    build_parent_reranker,
)


# --- Helpers ---------------------------------------------------------------


def _make_parent(
    *,
    parent_id: str = "p1",
    contains_table: bool = False,
    contains_numeric: bool = False,
    contains_date_like: bool = False,
) -> SimpleNamespace:
    """Return a minimal duck-typed stand-in for ParentDocument."""
    return SimpleNamespace(
        parent_id=parent_id,
        contains_table=contains_table,
        contains_numeric=contains_numeric,
        contains_date_like=contains_date_like,
    )


def _make_candidate(
    fused_score: float = 0.5,
    lexical_score: float = 0.0,
    evidence: list | None = None,
    parent_id: str = "p1",
    **parent_kwargs,
) -> ParentCandidate:
    """Return a ParentCandidate with a SimpleNamespace parent."""
    return ParentCandidate(
        parent=_make_parent(parent_id=parent_id, **parent_kwargs),
        evidence=evidence if evidence is not None else [],
        fused_score=fused_score,
        lexical_score=lexical_score,
    )


# --- HeuristicParentReranker ------------------------------------------------


class TestHeuristicParentReranker:
    """Tests for HeuristicParentReranker.rerank."""

    pytestmark = pytest.mark.anyio

    async def test_ranks_by_fused_score_descending(self):
        """Candidates with no other boosters are sorted by fused_score descending."""
        reranker = HeuristicParentReranker()
        low = _make_candidate(fused_score=0.3, parent_id="low")
        high = _make_candidate(fused_score=0.8, parent_id="high")
        mid = _make_candidate(fused_score=0.5, parent_id="mid")

        result = await reranker.rerank(query="q", candidates=[low, high, mid], limit=3)

        assert [c.parent.parent_id for c in result] == ["high", "mid", "low"]

    async def test_table_boost_elevates_candidate(self):
        """contains_table=True adds 0.05 to the score, lifting rank above an equal base."""
        reranker = HeuristicParentReranker()
        base = _make_candidate(fused_score=0.5, parent_id="base")
        with_table = _make_candidate(fused_score=0.5, parent_id="table", contains_table=True)

        result = await reranker.rerank(query="q", candidates=[base, with_table], limit=2)

        assert result[0].parent.parent_id == "table"
        assert result[0].rerank_score == pytest.approx(result[1].rerank_score + 0.05)

    async def test_numeric_boost_elevates_candidate(self):
        """contains_numeric=True adds 0.05 to the score, lifting rank above an equal base."""
        reranker = HeuristicParentReranker()
        base = _make_candidate(fused_score=0.5, parent_id="base")
        with_numeric = _make_candidate(fused_score=0.5, parent_id="numeric", contains_numeric=True)

        result = await reranker.rerank(query="q", candidates=[base, with_numeric], limit=2)

        assert result[0].parent.parent_id == "numeric"

    async def test_date_boost_elevates_candidate(self):
        """contains_date_like=True adds 0.05 to the score, lifting rank above an equal base."""
        reranker = HeuristicParentReranker()
        base = _make_candidate(fused_score=0.5, parent_id="base")
        with_date = _make_candidate(fused_score=0.5, parent_id="date", contains_date_like=True)

        result = await reranker.rerank(query="q", candidates=[base, with_date], limit=2)

        assert result[0].parent.parent_id == "date"

    async def test_evidence_count_boost_capped_at_015(self):
        """5 evidence items contribute min(0.15, 5*0.03)=0.15; total score is fused + 0.15."""
        reranker = HeuristicParentReranker()
        five_evidence = [{"text": str(i)} for i in range(5)]
        candidate = _make_candidate(fused_score=0.5, evidence=five_evidence)

        result = await reranker.rerank(query="q", candidates=[candidate], limit=1)

        # 0.5 (fused) + 0.0*0.05 (lexical) + 0.15 (evidence cap) = 0.65
        assert result[0].rerank_score == pytest.approx(0.65)

    async def test_evidence_count_boost_below_cap(self):
        """2 evidence items contribute 2*0.03=0.06, which is below the 0.15 cap."""
        reranker = HeuristicParentReranker()
        two_evidence = [{"text": "a"}, {"text": "b"}]
        candidate = _make_candidate(fused_score=0.4, evidence=two_evidence)

        result = await reranker.rerank(query="q", candidates=[candidate], limit=1)

        # 0.4 + 0.06 = 0.46
        assert result[0].rerank_score == pytest.approx(0.46)

    async def test_limit_caps_returned_results(self):
        """With 5 candidates and limit=2, exactly 2 are returned."""
        reranker = HeuristicParentReranker()
        candidates = [_make_candidate(fused_score=float(i), parent_id=str(i)) for i in range(5)]

        result = await reranker.rerank(query="q", candidates=candidates, limit=2)

        assert len(result) == 2

    async def test_limit_zero_returns_one_item(self):
        """limit=0 resolves to max(1, 0)=1, so exactly one candidate is returned."""
        reranker = HeuristicParentReranker()
        candidates = [_make_candidate(fused_score=0.9, parent_id="only")]

        result = await reranker.rerank(query="q", candidates=candidates, limit=0)

        assert len(result) == 1

    async def test_rerank_score_is_set_on_returned_candidates(self):
        """rerank_score must be populated on every returned candidate."""
        reranker = HeuristicParentReranker()
        candidate = _make_candidate(fused_score=0.7)

        result = await reranker.rerank(query="q", candidates=[candidate], limit=1)

        # fused=0.7, no boosters, no evidence -> rerank_score == 0.7
        assert result[0].rerank_score == pytest.approx(0.7)

    async def test_all_boosters_cumulate(self):
        """table + numeric + date boosts each add 0.05, totalling +0.15 over a bare candidate."""
        reranker = HeuristicParentReranker()
        bare = _make_candidate(fused_score=0.5, parent_id="bare")
        boosted = _make_candidate(
            fused_score=0.5,
            parent_id="boosted",
            contains_table=True,
            contains_numeric=True,
            contains_date_like=True,
        )

        result = await reranker.rerank(query="q", candidates=[bare, boosted], limit=2)

        assert result[0].parent.parent_id == "boosted"
        assert result[0].rerank_score == pytest.approx(result[1].rerank_score + 0.15)

    async def test_lexical_score_contributes_weighted_boost(self):
        """lexical_score is multiplied by 0.05, providing a small secondary signal."""
        reranker = HeuristicParentReranker()
        no_lex = _make_candidate(fused_score=0.5, lexical_score=0.0, parent_id="no_lex")
        with_lex = _make_candidate(fused_score=0.5, lexical_score=2.0, parent_id="with_lex")

        result = await reranker.rerank(query="q", candidates=[no_lex, with_lex], limit=2)

        assert result[0].parent.parent_id == "with_lex"
        assert result[0].rerank_score == pytest.approx(result[1].rerank_score + 0.10)


# --- OpenAIParentReranker._normalize_scores ---------------------------------


class TestOpenAIRerankerNormalizeScores:
    """Tests for OpenAIParentReranker._normalize_scores (pure utility, no network calls)."""

    @pytest.fixture(autouse=True)
    def _patch_reranker_settings(self, monkeypatch):
        """Replace the module-level settings with a minimal fake so __init__ succeeds."""
        fake_settings = SimpleNamespace(
            openai_api_key=None,
            rag_reranker_timeout_seconds=5.0,
            rag_reranker_model_name="gpt-4o-mini",
            base_model_name="gpt-4o-mini",
        )
        monkeypatch.setattr(reranker_mod, "settings", fake_settings)

    def _make_reranker(self) -> OpenAIParentReranker:
        return OpenAIParentReranker()

    def test_dict_input_returns_float_values(self):
        """A plain dict of string keys to numerics must be returned with float values."""
        reranker = self._make_reranker()
        result = reranker._normalize_scores({"parent_a": 0.9, "parent_b": 0.7})
        assert result == {"parent_a": pytest.approx(0.9), "parent_b": pytest.approx(0.7)}

    def test_dict_keys_are_coerced_to_str(self):
        """Non-string dict keys must be stringified via str()."""
        reranker = self._make_reranker()
        result = reranker._normalize_scores({1: 0.8, 2: 0.6})
        assert "1" in result
        assert "2" in result

    def test_list_with_parent_id_key(self):
        """List items using parent_id as the identifier key are normalized correctly."""
        reranker = self._make_reranker()
        result = reranker._normalize_scores([{"parent_id": "p1", "score": 0.8}])
        assert result == {"p1": pytest.approx(0.8)}

    def test_list_with_id_key(self):
        """List items using id as the fallback identifier key are normalized correctly."""
        reranker = self._make_reranker()
        result = reranker._normalize_scores([{"id": "p1", "score": 0.5}])
        assert result == {"p1": pytest.approx(0.5)}

    def test_list_parent_id_takes_precedence_over_id(self):
        """When both parent_id and id are present, parent_id wins."""
        reranker = self._make_reranker()
        result = reranker._normalize_scores([{"parent_id": "correct", "id": "wrong", "score": 1.0}])
        assert "correct" in result
        assert "wrong" not in result

    @pytest.mark.parametrize("bad_input", ["a string", None, 42])
    def test_unknown_format_returns_empty_dict(self, bad_input):
        """Non-dict, non-list inputs must return an empty dict."""
        reranker = self._make_reranker()
        assert reranker._normalize_scores(bad_input) == {}

    def test_non_numeric_score_in_list_is_skipped(self):
        """A list item with a non-numeric score string must be silently skipped."""
        reranker = self._make_reranker()
        result = reranker._normalize_scores([{"parent_id": "p1", "score": "not_a_number"}])
        assert result == {}

    def test_non_numeric_score_in_dict_is_skipped(self):
        """A dict entry with a non-numeric value must be silently skipped."""
        reranker = self._make_reranker()
        result = reranker._normalize_scores({"p1": "not_a_number", "p2": 0.5})
        assert "p1" not in result
        assert result.get("p2") == pytest.approx(0.5)

    def test_list_item_missing_both_id_fields_is_skipped(self):
        """A list item without parent_id or id must be silently skipped."""
        reranker = self._make_reranker()
        result = reranker._normalize_scores([{"score": 0.9}])
        assert result == {}

    def test_list_item_not_a_dict_is_skipped(self):
        """Non-dict items inside a list input must be silently skipped."""
        reranker = self._make_reranker()
        result = reranker._normalize_scores(["not_a_dict", {"parent_id": "p1", "score": 0.7}])
        assert result == {"p1": pytest.approx(0.7)}

    def test_empty_dict_input_returns_empty_dict(self):
        """An empty dict must return an empty dict."""
        reranker = self._make_reranker()
        assert reranker._normalize_scores({}) == {}

    def test_empty_list_input_returns_empty_dict(self):
        """An empty list must return an empty dict."""
        reranker = self._make_reranker()
        assert reranker._normalize_scores([]) == {}


# --- build_parent_reranker factory -----------------------------------------


class TestBuildParentRerankerFactory:
    """Tests for the build_parent_reranker factory function."""

    def test_llm_disabled_returns_heuristic(self, monkeypatch):
        """enable_llm_reranker=False must produce a HeuristicParentReranker."""
        monkeypatch.setattr(
            reranker_mod, "settings", SimpleNamespace(enable_llm_reranker=False)
        )
        assert isinstance(build_parent_reranker(), HeuristicParentReranker)

    def test_heuristic_type_with_llm_enabled_returns_heuristic(self, monkeypatch):
        """rag_reranker_type=heuristic with LLM enabled must produce HeuristicParentReranker."""
        monkeypatch.setattr(
            reranker_mod,
            "settings",
            SimpleNamespace(enable_llm_reranker=True, rag_reranker_type="heuristic"),
        )
        assert isinstance(build_parent_reranker(), HeuristicParentReranker)

    def test_missing_enable_llm_attr_falls_back_to_heuristic(self, monkeypatch):
        """Settings without enable_llm_reranker attr defaults to False via getattr."""
        monkeypatch.setattr(reranker_mod, "settings", SimpleNamespace())
        assert isinstance(build_parent_reranker(), HeuristicParentReranker)
