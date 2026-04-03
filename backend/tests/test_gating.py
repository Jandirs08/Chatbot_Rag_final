"""Tests para el cheap gate puro del retriever."""

from rag.retrieval.gating import cheap_gate, is_trivial_query


class TestIsTrivialQuery:
    def test_saludo_hola(self):
        is_trivial, reason = is_trivial_query("hola")
        assert is_trivial is True
        assert reason == "small_talk"

    def test_saludo_hola_que_tal(self):
        is_trivial, reason = is_trivial_query("hola que tal")
        assert is_trivial is True
        assert reason == "small_talk"

    def test_saludo_hola_ben(self):
        is_trivial, reason = is_trivial_query("hola ben")
        assert is_trivial is True
        assert reason == "small_talk"

    def test_query_muy_corta(self):
        is_trivial, reason = is_trivial_query("ab")
        assert is_trivial is True
        assert reason == "too_short"

    def test_query_vacia(self):
        is_trivial, reason = is_trivial_query("")
        assert is_trivial is True
        assert reason == "empty_query"

    def test_query_none(self):
        is_trivial, reason = is_trivial_query(None)
        assert is_trivial is True
        assert reason == "empty_query"

    def test_query_solo_puntuacion(self):
        is_trivial, reason = is_trivial_query("...")
        assert is_trivial is True
        assert reason == "punctuation_only"

    def test_query_real_no_trivial(self):
        is_trivial, reason = is_trivial_query("Como funciona el proceso de matricula")
        assert is_trivial is False
        assert reason == "cheap_gate_pass"


class TestCheapGate:
    def test_small_talk_bloquea_retrieval(self):
        decision = cheap_gate("gracias")
        assert decision.should_retrieve is False
        assert decision.reason == "small_talk"

    def test_saludo_contenido_real_no_se_bloquea(self):
        decision = cheap_gate("hola necesito requisitos de matricula")
        assert decision.should_retrieve is True
        assert decision.reason == "cheap_gate_pass"

    def test_query_real_pasa_cheap_gate(self):
        decision = cheap_gate("documentos necesarios para matricula 2026")
        assert decision.should_retrieve is True
        assert decision.reason == "cheap_gate_pass"
