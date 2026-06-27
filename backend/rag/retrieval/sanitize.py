"""Prompt-injection sanitization for RAG document content.

Filters retrieved document text before it is injected into the LLM prompt,
preventing tag-based and instruction-injection attacks that could let
document content escape the <context> boundary.
"""
import re

# Tags that could escape the <context> prompt boundary and inject instructions.
_INJECTION_TAG_PATTERN = re.compile(
    r"</?(context|instructions?|forbidden|system(_personality)?|history|"
    r"user_input|input_safety|computation_rules|prompt|persona|"
    r"jailbreak|injection|override|command|assistant|tool)[^>]*>",
    re.IGNORECASE,
)

# Plain-text instruction-injection phrases embedded in document content.
_INJECTION_TEXT_PATTERN = re.compile(
    r"(?:"
    # English imperative forms (high-specificity jailbreak phrases)
    r"ignore\s+all\s+(previous|prior|above)\s+instructions?"
    r"|disregard\s+all\s+(previous|prior|above)\s+instructions?"
    r"|forget\s+all\s+(previous\s+)?instructions?"
    r"|you\s+are\s+now\s+(?:a\s+|an\s+)?\w+"
    r"|new\s+instructions?:\s*"
    r"|\[?SYSTEM\]?:\s*"
    r"|###\s*(?:system|instruction|prompt|task)"
    # Spanish: require "todas las" or "tus" to reduce false positives on "ignora las X anteriores" in legitimate text
    r"|ignora\s+(?:todas?\s+las\s+|tus\s+)instrucciones?\s+anteriores?"
    r"|olvida\s+(?:todas?\s+)?(?:tus\s+|mis\s+)?instrucciones?\s+anteriores?"
    r"|nuevas?\s+instrucciones?:\s*"
    r")",
    re.IGNORECASE,
)


def sanitize_doc_content(text: str) -> str:
    """Remove XML boundary-escape tags and instruction-injection patterns from retrieved document text."""
    if not text:
        return ""
    text = _INJECTION_TAG_PATTERN.sub("[FILTERED]", text)
    text = _INJECTION_TEXT_PATTERN.sub("[FILTERED]", text)
    return text


def sanitize_metadata_field(value: object) -> str:
    """Sanitize a metadata string: collapse newlines and remove injection tags."""
    text = str(value) if value is not None else ""
    text = text.replace("\n", " ").replace("\r", " ")
    return _INJECTION_TAG_PATTERN.sub("[FILTERED]", text)
