from __future__ import annotations

from dataclasses import dataclass
from typing import Tuple


SMALL_TALK_PATTERNS = frozenset(
    {
        "hola",
        "hla",
        "ola",
        "hi",
        "hey",
        "buenos dias",
        "buen dia",
        "buenas tardes",
        "buenas noches",
        "buenas",
        "saludos",
        "como estas",
        "que tal",
        "todo bien",
        "gracias",
        "gracia",
        "grcias",
        "muchas gracias",
        "thanks",
        "thx",
        "genial",
        "perfecto",
        "excelente",
        "adios",
        "chao",
        "chau",
        "bye",
        "hasta luego",
        "hasta pronto",
        "nos vemos",
        "ok",
        "okey",
        "okay",
        "vale",
        "si",
        "no",
        "entendido",
        "de acuerdo",
        "claro",
        "listo",
        "ayuda",
        "help",
        "quien eres",
        "como te llamas",
        "que puedes hacer",
    }
)

GREETING_PREFIXES = frozenset({"hola", "hla", "ola", "hi", "hey", "buenas", "saludos"})
GREETING_SUFFIX_PATTERNS = frozenset(
    {
        "que tal",
        "como estas",
        "todo bien",
        "ben",
        "bot",
        "bro",
        "amigo",
        "amiga",
    }
)


@dataclass(frozen=True)
class CheapGateDecision:
    should_retrieve: bool
    reason: str


def _normalize_text(query: str | None) -> str:
    lowered = " ".join(str(query or "").strip().lower().split())
    cleaned = "".join(char if char.isalnum() or char.isspace() else " " for char in lowered)
    return " ".join(cleaned.split())


def _looks_like_obvious_greeting(normalized: str) -> bool:
    if normalized in SMALL_TALK_PATTERNS:
        return True

    parts = normalized.split(maxsplit=1)
    if not parts or parts[0] not in GREETING_PREFIXES:
        return False

    if len(parts) == 1:
        return True

    suffix = parts[1].strip()
    return suffix in GREETING_SUFFIX_PATTERNS


def is_trivial_query(query: str | None) -> Tuple[bool, str]:
    raw_normalized = " ".join(str(query or "").strip().lower().split())

    if not raw_normalized:
        return (True, "empty_query")

    if not any(char.isalnum() for char in raw_normalized):
        return (True, "punctuation_only")

    normalized = _normalize_text(raw_normalized)

    if _looks_like_obvious_greeting(normalized):
        return (True, "small_talk")

    if len(normalized) < 3:
        return (True, "too_short")

    return (False, "cheap_gate_pass")


def cheap_gate(query: str | None) -> CheapGateDecision:
    is_trivial, reason = is_trivial_query(query)
    return CheapGateDecision(should_retrieve=not is_trivial, reason=reason)
