"""
Tests para la lógica de Gating del RAGRetriever.

Cubre:
- _is_trivial_query: detección de saludos, despedidas, queries cortas
- _evaluate_gating_logic: decisión completa de usar/omitir RAG
"""
import pytest
import numpy as np
from unittest.mock import patch


# ============================================================
#   _is_trivial_query
# ============================================================

class TestIsTrivialQuery:
    """Tests para detección de queries triviales."""

    def test_saludo_hola(self, retriever):
        is_trivial, reason = retriever._is_trivial_query("hola")
        assert is_trivial is True
        assert reason == "small_talk"

    def test_saludo_con_mayusculas(self, retriever):
        is_trivial, reason = retriever._is_trivial_query("HOLA")
        assert is_trivial is True
        assert reason == "small_talk"

    def test_despedida_adios(self, retriever):
        is_trivial, reason = retriever._is_trivial_query("adiós")
        assert is_trivial is True
        assert reason == "small_talk"

    def test_agradecimiento(self, retriever):
        is_trivial, reason = retriever._is_trivial_query("gracias")
        assert is_trivial is True
        assert reason == "small_talk"

    def test_confirmacion_ok(self, retriever):
        is_trivial, reason = retriever._is_trivial_query("ok")
        assert is_trivial is True
        assert reason == "small_talk"

    def test_meta_pregunta(self, retriever):
        is_trivial, reason = retriever._is_trivial_query("quién eres")
        assert is_trivial is True
        assert reason == "small_talk"

    def test_query_muy_corta(self, retriever):
        is_trivial, reason = retriever._is_trivial_query("ab")
        assert is_trivial is True
        assert reason == "too_short"

    def test_query_vacia(self, retriever):
        is_trivial, reason = retriever._is_trivial_query("")
        assert is_trivial is True
        assert reason == "too_short"

    def test_query_none(self, retriever):
        is_trivial, reason = retriever._is_trivial_query(None)
        assert is_trivial is True
        assert reason == "too_short"

    def test_query_con_espacios(self, retriever):
        is_trivial, reason = retriever._is_trivial_query("   hola   ")
        assert is_trivial is True
        assert reason == "small_talk"

    def test_query_real_no_trivial(self, retriever):
        is_trivial, reason = retriever._is_trivial_query("¿Cómo funciona el proceso de matrícula?")
        assert is_trivial is False
        assert reason == ""

    def test_query_tecnica_no_trivial(self, retriever):
        is_trivial, reason = retriever._is_trivial_query("Explícame las capas de una red neuronal")
        assert is_trivial is False
        assert reason == ""


# ============================================================
#   _evaluate_gating_logic
# ============================================================

class TestEvaluateGatingLogic:
    """Tests para la lógica pura de decisión de gating (sin I/O)."""

    def test_trivial_query_no_usa_rag(self, retriever):
        reason, use_rag = retriever._evaluate_gating_logic("hola", None, 100)
        assert use_rag is False
        assert reason == "small_talk"

    def test_low_intent_pocos_tokens_sin_interrogativo(self, retriever):
        """Query con <= 3 tokens y sin palabras interrogativas → low_intent."""
        reason, use_rag = retriever._evaluate_gating_logic("ver lista", None, 100)
        assert use_rag is False
        assert reason == "low_intent"

    def test_low_intent_tres_tokens_sin_interrogativo(self, retriever):
        reason, use_rag = retriever._evaluate_gating_logic("ver mi nota", None, 100)
        assert use_rag is False
        assert reason == "low_intent"

    def test_con_interrogativo_pasa_intent(self, retriever):
        """Con palabra interrogativa, pasa el filtro de intent."""
        reason, use_rag = retriever._evaluate_gating_logic(
            "¿cómo funciona?", None, 100
        )
        # Debería llegar al gating semántico (no rechazado por intent)
        assert reason != "low_intent"

    def test_con_signo_pregunta_pasa_intent(self, retriever):
        """El signo ? también cuenta como interrogativo."""
        reason, use_rag = retriever._evaluate_gating_logic(
            "proceso de matrícula?", None, 100
        )
        assert reason != "low_intent"

    def test_small_corpus_con_pregunta(self, retriever):
        """Corpus pequeño (<20) + pregunta → usa RAG."""
        reason, use_rag = retriever._evaluate_gating_logic(
            "¿cómo me inscribo?", None, 10
        )
        assert reason == "small_corpus"
        assert use_rag is True

    def test_small_corpus_sin_pregunta_tokens_suficientes(self, retriever):
        """Corpus pequeño + sin interrogativo pero 4+ tokens → usa RAG."""
        reason, use_rag = retriever._evaluate_gating_logic(
            "necesito los documentos del semestre pasado", None, 10
        )
        assert reason == "small_corpus"
        assert use_rag is True

    def test_small_corpus_sin_pregunta_pocos_tokens(self, retriever):
        """Corpus pequeño + sin interrogativo + <4 tokens → low_intent
        (el filtro de intent se evalúa ANTES que el de corpus)."""
        reason, use_rag = retriever._evaluate_gating_logic(
            "los documentos", None, 10
        )
        assert reason == "low_intent"
        assert use_rag is False

    def test_no_embedder_fail_open(self, retriever):
        """Sin embedding manager → fail open (usar RAG por seguridad)."""
        retriever.embedding_manager = None
        reason, use_rag = retriever._evaluate_gating_logic(
            "¿Qué es machine learning?", None, 100
        )
        assert reason == "no_embedder_fail_open"
        assert use_rag is True

    def test_no_centroid_fail_open(self, retriever):
        """Sin centroide calculado → fail open."""
        retriever._centroid_embedding = None
        reason, use_rag = retriever._evaluate_gating_logic(
            "¿Qué es machine learning?",
            np.random.randn(1536).astype(np.float32),
            100
        )
        assert reason == "no_centroid"
        assert use_rag is True

    def test_semantic_match_alta_similitud(self, retriever):
        """Vector de query muy similar al centroide → semantic_match."""
        # Usar el mismo centroide como query vector (similitud ~1.0)
        query_vec = retriever._centroid_embedding.copy()
        reason, use_rag = retriever._evaluate_gating_logic(
            "¿Qué es machine learning?", query_vec, 100
        )
        assert reason == "semantic_match"
        assert use_rag is True

    def test_semantic_reject_baja_similitud(self, retriever):
        """Vector de query ortogonal al centroide → low_similarity."""
        # Crear vector ortogonal (similitud ~0)
        centroid = retriever._centroid_embedding
        # Rotar 90 grados: poner a cero la componente principal y perturbar
        query_vec = np.zeros(1536, dtype=np.float32)
        query_vec[0] = 1.0  # Un vector unitario en una sola dimensión
        # Restar la proyección sobre el centroide para hacerlo más ortogonal
        projection = np.dot(query_vec, centroid) * centroid
        query_vec = query_vec - projection
        norm = np.linalg.norm(query_vec)
        if norm > 0:
            query_vec = query_vec / norm

        reason, use_rag = retriever._evaluate_gating_logic(
            "¿Qué es machine learning?", query_vec, 100
        )
        assert reason == "low_similarity"
        assert use_rag is False

    def test_no_vector_unknown_corpus_con_interrogativo(self, retriever):
        """Sin query vector + corpus desconocido + interrogativo → usa RAG."""
        reason, use_rag = retriever._evaluate_gating_logic(
            "¿cómo funciona?", None, None
        )
        assert reason == "no_vector_unknown_corpus"
        assert use_rag is True

    def test_no_vector_small_corpus(self, retriever):
        """Sin query vector + corpus < 50 → fail open."""
        reason, use_rag = retriever._evaluate_gating_logic(
            "¿qué es la inteligencia artificial?", None, 30
        )
        assert reason == "no_vector_small_corpus"
        assert use_rag is True

    def test_no_vector_large_corpus_fail_closed(self, retriever):
        """Sin query vector + corpus >= 50 → fail closed."""
        reason, use_rag = retriever._evaluate_gating_logic(
            "¿qué es la inteligencia artificial?", None, 200
        )
        assert reason == "no_vector_fail_closed"
        assert use_rag is False
