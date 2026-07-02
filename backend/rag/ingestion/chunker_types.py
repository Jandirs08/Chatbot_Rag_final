from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Awaitable, Callable, Sequence

from langchain_core.documents import Document


class _FallbackEncoding:
    def encode(self, text: str) -> list[str]:
        return (text or "").split()


@dataclass(frozen=True)
class StructuralBlock:
    content: str
    page_number: int
    order: int
    block_type: str
    section_title: str | None
    token_count: int
    contains_table: bool
    contains_numeric: bool
    contains_date_like: bool


PageLoader = Callable[[Path], Sequence[Document] | Awaitable[Sequence[Document]]]
