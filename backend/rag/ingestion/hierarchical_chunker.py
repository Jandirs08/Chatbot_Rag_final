from __future__ import annotations

import asyncio
import inspect
import logging
import re
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Awaitable, Callable, Iterable, Sequence

import tiktoken
from langchain_core.documents import Document

from utils.hashing import hash_content_for_dedup, hash_for_cache_key

from .models import ChildChunk, HierarchicalChunkingResult, PageSpan, ParentDocument

logger = logging.getLogger(__name__)


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


class HierarchicalChunker:
    _DATE_LIKE_PATTERN = re.compile(
        r"\b(?:\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}[/-]\d{1,2}[/-]\d{1,2}|"
        r"(?:ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic)[a-z]*\.?\s+\d{4})\b",
        re.IGNORECASE,
    )

    def __init__(
        self,
        *,
        parent_target_tokens: int = 1350,
        parent_max_tokens: int = 1500,
        parent_min_tokens: int = 900,
        child_target_tokens: int = 260,
        child_max_tokens: int = 320,
        child_min_tokens: int = 120,
        page_loader: PageLoader | None = None,
        encoding_name: str = "cl100k_base",
    ) -> None:
        self.parent_target_tokens = parent_target_tokens
        self.parent_max_tokens = parent_max_tokens
        self.parent_min_tokens = parent_min_tokens
        self.child_target_tokens = child_target_tokens
        self.child_max_tokens = child_max_tokens
        self.child_min_tokens = child_min_tokens
        self.page_loader = page_loader
        try:
            self.encoding = tiktoken.get_encoding(encoding_name)
        except Exception:
            logger.warning(
                "Could not initialize tiktoken encoding '%s'; using whitespace fallback.",
                encoding_name,
                exc_info=True,
            )
            self.encoding = _FallbackEncoding()

    async def chunk_pdf(self, pdf_path: Path, *, doc_id: str) -> HierarchicalChunkingResult:
        pages = await self._load_pages(pdf_path)
        if not pages:
            return HierarchicalChunkingResult.empty(pdf_path=pdf_path, doc_id=doc_id)

        structural_blocks = self._extract_structural_blocks(pages)
        if not structural_blocks:
            return HierarchicalChunkingResult.empty(pdf_path=pdf_path, doc_id=doc_id)

        parent_groups = self._group_blocks_into_parents(structural_blocks)
        parents, children = self._build_hierarchy(
            parent_groups=parent_groups,
            pdf_path=pdf_path,
            doc_id=doc_id,
        )
        return HierarchicalChunkingResult(
            doc_id=doc_id,
            source=pdf_path.name,
            file_path=str(pdf_path.resolve()),
            page_count=len(pages),
            parents=parents,
            children=children,
            metadata={
                "structural_block_count": len(structural_blocks),
            },
        )

    async def _load_pages(self, pdf_path: Path) -> list[Document]:
        if self.page_loader is not None:
            loaded = self.page_loader(pdf_path)
            if inspect.isawaitable(loaded):
                result = await loaded
            else:
                result = await asyncio.to_thread(lambda: list(loaded))
            return list(result)

        return await asyncio.to_thread(self._load_pages_with_pymupdf4llm, pdf_path)

    def _load_pages_with_pymupdf4llm(self, pdf_path: Path) -> list[Document]:
        try:
            import pymupdf4llm
        except ImportError as exc:
            raise RuntimeError(
                "pymupdf4llm is required for hierarchical chunking."
            ) from exc

        page_chunks = pymupdf4llm.to_markdown(str(pdf_path), page_chunks=True)
        documents: list[Document] = []
        for index, page_chunk in enumerate(page_chunks or []):
            metadata = dict(page_chunk.get("metadata") or {})
            raw_page_number = metadata.get("page_number", index + 1)
            try:
                page_number = int(raw_page_number)
            except (TypeError, ValueError):
                page_number = index + 1

            metadata.update(
                {
                    "source": pdf_path.name,
                    "file_path": str(pdf_path.resolve()),
                    "page_number": page_number,
                    "extraction_method": "pymupdf4llm",
                }
            )
            documents.append(
                Document(
                    page_content=str(page_chunk.get("text") or ""),
                    metadata=metadata,
                )
            )
        return documents

    def _extract_structural_blocks(self, pages: Sequence[Document]) -> list[StructuralBlock]:
        structural_blocks: list[StructuralBlock] = []
        block_order = 0
        current_section_title: str | None = None

        for page in pages:
            page_number = self._safe_page_number(page)
            page_blocks = self._split_page_into_blocks(page.page_content or "")
            for block_type, block_text in page_blocks:
                content = (block_text or "").strip()
                if not content:
                    continue

                if block_type == "header":
                    current_section_title = self._normalize_header(content)

                structural_blocks.append(
                    StructuralBlock(
                        content=content,
                        page_number=page_number,
                        order=block_order,
                        block_type=block_type,
                        section_title=current_section_title,
                        token_count=self._count_tokens(content),
                        contains_table=(block_type == "table"),
                        contains_numeric=self._contains_numeric(content),
                        contains_date_like=self._contains_date_like(content),
                    )
                )
                block_order += 1

        return structural_blocks

    def _split_page_into_blocks(self, text: str) -> list[tuple[str, str]]:
        lines = text.splitlines()
        blocks: list[tuple[str, str]] = []
        current_lines: list[str] = []
        current_type: str | None = None

        def flush_current() -> None:
            nonlocal current_lines, current_type
            if current_lines:
                blocks.append((current_type or "text", "\n".join(current_lines).strip()))
            current_lines = []
            current_type = None

        for raw_line in lines:
            line = raw_line.rstrip()
            stripped = line.strip()

            if not stripped:
                flush_current()
                continue

            line_type = self._classify_line(stripped)

            if line_type == "header":
                flush_current()
                blocks.append(("header", stripped))
                continue

            if line_type == "table":
                if current_type not in {None, "table"}:
                    flush_current()
                current_type = "table"
                current_lines.append(stripped)
                continue

            if current_type == "table":
                flush_current()

            if current_type is None:
                current_type = line_type
            current_lines.append(stripped)

        flush_current()
        return blocks

    def _group_blocks_into_parents(self, blocks: Sequence[StructuralBlock]) -> list[list[StructuralBlock]]:
        groups: list[list[StructuralBlock]] = []
        current_group: list[StructuralBlock] = []
        current_tokens = 0

        for block in blocks:
            block_tokens = max(1, block.token_count)
            should_flush = (
                current_group
                and current_tokens >= self.parent_min_tokens
                and current_tokens + block_tokens > self.parent_max_tokens
            )
            if should_flush:
                groups.append(current_group)
                current_group = []
                current_tokens = 0

            current_group.append(block)
            current_tokens += block_tokens

            if current_tokens >= self.parent_target_tokens and block.block_type == "header":
                groups.append(current_group)
                current_group = []
                current_tokens = 0

        if current_group:
            groups.append(current_group)

        return groups

    def _build_hierarchy(
        self,
        *,
        parent_groups: Sequence[Sequence[StructuralBlock]],
        pdf_path: Path,
        doc_id: str,
    ) -> tuple[list[ParentDocument], list[ChildChunk]]:
        parents: list[ParentDocument] = []
        children: list[ChildChunk] = []

        for parent_index, group in enumerate(parent_groups):
            parent = self._build_parent_document(
                group=group,
                pdf_path=pdf_path,
                doc_id=doc_id,
                parent_index=parent_index,
            )
            parent_children = self._build_children_for_parent(parent=parent, blocks=group)
            parent = parent.model_copy(update={"child_count": len(parent_children)})

            parents.append(parent)
            children.extend(parent_children)

        return parents, children

    def _build_parent_document(
        self,
        *,
        group: Sequence[StructuralBlock],
        pdf_path: Path,
        doc_id: str,
        parent_index: int,
    ) -> ParentDocument:
        content = "\n\n".join(block.content for block in group).strip()
        start_page = min(block.page_number for block in group)
        end_page = max(block.page_number for block in group)
        section_title = next((block.section_title for block in group if block.section_title), None)
        block_types = list(dict.fromkeys(block.block_type for block in group))
        content_hash = hash_content_for_dedup(content)
        parent_id = self._build_stable_id(
            prefix="parent",
            parts=(doc_id, str(parent_index), content_hash),
        )

        return ParentDocument(
            parent_id=parent_id,
            doc_id=doc_id,
            content=content,
            page_span=PageSpan(start_page=start_page, end_page=end_page),
            source=pdf_path.name,
            file_path=str(pdf_path.resolve()),
            parent_index=parent_index,
            section_title=section_title,
            contains_table=any(block.contains_table for block in group),
            contains_numeric=any(block.contains_numeric for block in group),
            contains_date_like=any(block.contains_date_like for block in group),
            block_types=block_types,
            token_count=self._count_tokens(content),
            block_count=len(group),
            child_count=0,
            content_hash=content_hash,
            metadata={
                "page_start": start_page,
                "page_end": end_page,
            },
        )

    def _build_children_for_parent(
        self,
        *,
        parent: ParentDocument,
        blocks: Sequence[StructuralBlock],
    ) -> list[ChildChunk]:
        child_groups = self._group_blocks_into_children(blocks)
        children: list[ChildChunk] = []
        for child_index, group in enumerate(child_groups):
            content = "\n\n".join(block.content for block in group).strip()
            start_page = min(block.page_number for block in group)
            end_page = max(block.page_number for block in group)
            child_hash = hash_content_for_dedup(content)
            child_id = self._build_stable_id(
                prefix="child",
                parts=(parent.parent_id, str(child_index), child_hash),
            )
            children.append(
                ChildChunk(
                    child_id=child_id,
                    parent_id=parent.parent_id,
                    doc_id=parent.doc_id,
                    content=content,
                    page_span=PageSpan(start_page=start_page, end_page=end_page),
                    source=parent.source,
                    file_path=parent.file_path,
                    child_index=child_index,
                    parent_index=parent.parent_index,
                    section_title=parent.section_title,
                    contains_table=parent.contains_table or any(block.contains_table for block in group),
                    contains_numeric=parent.contains_numeric or any(block.contains_numeric for block in group),
                    contains_date_like=parent.contains_date_like or any(block.contains_date_like for block in group),
                    block_types=list(dict.fromkeys(block.block_type for block in group)),
                    token_count=self._count_tokens(content),
                    content_hash=child_hash,
                    metadata={
                        "page_start": start_page,
                        "page_end": end_page,
                        "parent_token_count": parent.token_count,
                    },
                )
            )

        return children

    def _group_blocks_into_children(self, blocks: Sequence[StructuralBlock]) -> list[list[StructuralBlock]]:
        groups: list[list[StructuralBlock]] = []
        current_group: list[StructuralBlock] = []
        current_tokens = 0

        for block in blocks:
            block_tokens = max(1, block.token_count)
            should_flush = (
                current_group
                and current_tokens >= self.child_min_tokens
                and current_tokens + block_tokens > self.child_max_tokens
            )
            if should_flush:
                groups.append(current_group)
                current_group = []
                current_tokens = 0

            current_group.append(block)
            current_tokens += block_tokens

            if current_tokens >= self.child_target_tokens and block.block_type == "table":
                groups.append(current_group)
                current_group = []
                current_tokens = 0

        if current_group:
            groups.append(current_group)

        return groups

    def _classify_line(self, stripped_line: str) -> str:
        if self._looks_like_table_line(stripped_line):
            return "table"
        if self._looks_like_header(stripped_line):
            return "header"
        if re.match(r"^[-*•]\s+\S", stripped_line):
            return "bullet_list"
        if re.match(r"^\d+[.)]\s+\S", stripped_line):
            return "numbered_list"
        return "text"

    def _looks_like_table_line(self, line: str) -> bool:
        if "|" in line and line.count("|") >= 2:
            return True
        if re.match(r"^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$", line):
            return True
        return False

    def _looks_like_header(self, line: str) -> bool:
        if re.match(r"^#{1,6}\s+\S", line):
            return True
        if len(line) <= 80 and line.endswith(":"):
            return True
        if len(line) <= 80 and any(char.isalpha() for char in line) and line == line.upper():
            return True
        return False

    def _normalize_header(self, line: str) -> str:
        return re.sub(r"^#{1,6}\s*", "", line).strip()

    def _count_tokens(self, text: str) -> int:
        try:
            return len(self.encoding.encode(text or ""))
        except Exception:
            return max(1, len((text or "").split()))

    def _contains_numeric(self, text: str) -> bool:
        return any(char.isdigit() for char in text or "")

    def _contains_date_like(self, text: str) -> bool:
        return bool(self._DATE_LIKE_PATTERN.search(text or ""))

    def _safe_page_number(self, page: Document) -> int:
        raw_value = (page.metadata or {}).get("page_number", 1)
        try:
            return max(1, int(raw_value))
        except (TypeError, ValueError):
            return 1

    def _build_stable_id(self, *, prefix: str, parts: Iterable[str]) -> str:
        del prefix
        digest = hash_for_cache_key(":".join(parts))
        return str(uuid.uuid5(uuid.NAMESPACE_URL, digest))
