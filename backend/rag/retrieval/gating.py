"""
Módulo de Gating: decide si una query amerita RAG o puede responderse directamente.

Contiene lógica pura (sin I/O) extraída de RAGRetriever para:
- Mejorar testabilidad (funciones puras, sin mocks de embeddings/Qdrant)
- Permitir estrategias de gating por agente en el futuro
- Reducir el tamaño del retriever monolítico
"""

import dataclasses
import logging
from typing import Optional, Tuple

import numpy as np

logger = logging.getLogger(__name__)


# ============================================================
#   GATING DECISION — Contrato de retorno del sistema de gating
# ============================================================

@dataclasses.dataclass(frozen=True, eq=False)
class GatingDecision:
    """Resultado determinísta e inmutable del sistema de gating.

    Encapsula todo el estado de la decisión en un objeto explícito,
    eliminando tuplas annónimas amb iguas como (reason, True, None).

    Atributos:
        reason:       Motivo de la decisión (para logs y trazabilidad).
        use_rag:      Si se debe ejecutar el pipeline RAG.
        query_vec:    Embedding del query, pre-calculado una sola vez en
                      gating_async para reutilizar en búsqueda + reranking.
                      None si el embedding falló o no se intentó calcular.
        is_degraded:  True cuando use_rag=True pero query_vec=None.
                      Indica que el retrieval procederá sin reranking semántico.
                      El caller debe loguearlo explícitamente.
    """
    reason: str
    use_rag: bool
    query_vec: Optional[np.ndarray] = None
    is_degraded: bool = False

    @property
    def has_vector(self) -> bool:
        """Indica si hay un vector de query disponible para reranking."""
        return self.query_vec is not None



# ============================================================
#   CONSTANTES DE GATING
# ============================================================

MIN_TOKENS_FOR_INTENT = 3        # Mínimo de tokens para considerar intención real
SMALL_CORPUS_THRESHOLD = 20      # Corpus pequeño: relajar criterios
MEDIUM_CORPUS_THRESHOLD = 50     # Corpus mediano: fallback conservador
MIN_TOKENS_FOR_FALLBACK = 4      # Tokens mínimos para usar RAG en caso de duda

# Set expandido con variantes comunes y errores tipográficos frecuentes
SMALL_TALK_PATTERNS = frozenset({
    # Saludos
    "hola", "hla", "ola", "hi", "hey", "buenos días", "buen dia", "buen día",
    "buenas tardes", "buenas noches", "buenas", "saludos",
    # Estado
    "como estás", "cómo estás", "como estas", "qué tal", "que tal",
    "todo bien", "bien y tú", "bien y tu",
    # Agradecimientos
    "gracias", "gracia", "grcias", "muchas gracias", "te agradezco",
    "thanks", "thx", "genial", "perfecto", "excelente",
    # Despedidas
    "adios", "adiós", "chao", "chau", "bye", "hasta luego",
    "hasta pronto", "nos vemos", "cuídate",
    # Confirmaciones
    "ok", "okey", "okay", "vale", "sí", "si", "no", "entendido",
    "de acuerdo", "claro", "listo",
    # Meta-preguntas
    "ayuda", "help", "quien eres", "quién eres", "como te llamas",
    "cómo te llamas", "qué puedes hacer", "que puedes hacer",
})

_INTERROGATIVES = (
    "qué", "como", "cómo", "donde", "dónde",
    "cuando", "cuándo", "por qué", "para qué",
    "puedo", "quiero", "necesito",
)


# ============================================================
#   FUNCIONES PURAS
# ============================================================

def is_trivial_query(q: str) -> Tuple[bool, str]:
    """Detecta queries triviales que no requieren RAG.

    Incluye: saludos, despedidas, agradecimientos, confirmaciones,
    y variantes comunes en español.

    Returns:
        (is_trivial, reason)
    """
    s = (q or "").strip().lower()

    if s in SMALL_TALK_PATTERNS:
        return (True, "small_talk")
    if len(s) < 3:
        return (True, "too_short")
    return (False, "")


def evaluate_gating_logic(
    query: str,
    query_vec: Optional[np.ndarray],
    corpus_size: Optional[int],
    centroid_vec: Optional[np.ndarray],
    has_embedder: bool,
    gating_threshold: float,
) -> Tuple[str, bool]:
    """Lógica pura de gating sin I/O.

    Args:
        query:            texto del usuario
        query_vec:        embedding del query (None si no se pudo calcular)
        corpus_size:      cantidad de puntos en Qdrant (None si desconocido)
        centroid_vec:     centroide del corpus (None si no calculado)
        has_embedder:     si hay embedding manager disponible
        gating_threshold: umbral de similitud coseno para aceptar query

    Returns:
        (reason, use_rag)
    """
    try:
        q = (query or "").strip()

        trivial, trivial_reason = is_trivial_query(q)
        if trivial:
            return (trivial_reason, False)

        has_interrogative = (
            any(w in q.lower() for w in _INTERROGATIVES) or ("?" in q)
        )
        tokens = [t for t in q.lower().split() if t]

        if not has_interrogative and len(tokens) <= MIN_TOKENS_FOR_INTENT:
            return ("low_intent", False)

        if corpus_size is not None and corpus_size < SMALL_CORPUS_THRESHOLD:
            use_small = bool(
                has_interrogative or len(tokens) >= MIN_TOKENS_FOR_FALLBACK
            )
            return ("small_corpus", use_small)

        if not has_embedder:
            return ("no_embedder_fail_open", True)

        if not isinstance(centroid_vec, np.ndarray) or centroid_vec.size == 0:
            return ("no_centroid", True)

        if query_vec is None:
            if corpus_size is None:
                use_unknown = bool(
                    has_interrogative
                    or len(tokens) >= MIN_TOKENS_FOR_FALLBACK
                )
                return ("no_vector_unknown_corpus", use_unknown)

            if 0 <= corpus_size < MEDIUM_CORPUS_THRESHOLD:
                return ("no_vector_small_corpus", True)

            return ("no_vector_fail_closed", False)

        sim = float(np.dot(query_vec, centroid_vec))
        use = bool(sim >= gating_threshold)
        reason = "semantic_match" if use else "low_similarity"
        logger.info(
            f"Gating: similitud={sim:.4f}, "
            f"threshold={gating_threshold:.4f}, reason={reason}"
        )
        return (reason, use)

    except Exception as e:
        # Fail-closed: cualquier error matemático (NaN, dimensión incorrecta en np.dot,
        # etc.) no debe forzar un RAG ciego. El caller (gating_async) ya envuelve esta
        # función en su propio try/except y también aplica fail-closed.
        logger.error(
            f"[GATING] Error inesperado en evaluate_gating_logic: {type(e).__name__}: {e}. "
            "Aplicando fail-closed.",
            exc_info=True,
        )
        return ("error_fail_closed", False)
