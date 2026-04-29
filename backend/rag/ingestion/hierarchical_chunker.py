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
        parent_overlap_tokens: int | None = None,
        child_target_tokens: int = 260,
        child_max_tokens: int = 320,
        child_min_tokens: int = 120,
        child_overlap_tokens: int | None = None,
        page_loader: PageLoader | None = None,
        encoding_name: str = "cl100k_base",
    ) -> None:
        self.parent_target_tokens = parent_target_tokens
        self.parent_max_tokens = parent_max_tokens
        self.parent_min_tokens = parent_min_tokens
        self.child_target_tokens = child_target_tokens
        self.child_max_tokens = child_max_tokens
        self.child_min_tokens = child_min_tokens
        if child_overlap_tokens is None:
            from config import settings as _s
            child_overlap_tokens = int(getattr(_s, "rag_child_overlap_tokens", 40))
        self.child_overlap_tokens = max(0, child_overlap_tokens)
        # Parent-level overlap: when flushing a parent, copy the last N tokens of
        # blocks from the closing parent to the start of the next one. Solves the
        # "orphan attribute block" problem in enumerative corpora (products,
        # plans, items) where a sub-header like "Composition:" forces a flush
        # but the entity name lives in the previous parent. Default 0 preserves
        # legacy behavior; recommend ~120 for enumerative documents.
        if parent_overlap_tokens is None:
            from config import settings as _s
            parent_overlap_tokens = int(getattr(_s, "rag_parent_overlap_tokens", 120))
        self.parent_overlap_tokens = max(0, parent_overlap_tokens)
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
        self._semantic_model = None
        self._semantic_model_failed = False
        self._semantic_threshold: float = 0.5

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

    def _get_or_load_semantic_model(self):
        from config import settings as _s
        if not getattr(_s, "enable_semantic_chunking", False):
            return None
        if self._semantic_model_failed:
            return None
        if self._semantic_model is None:
            try:
                from sentence_transformers import SentenceTransformer
                model_name = getattr(_s, "semantic_chunk_model", "all-MiniLM-L6-v2")
                self._semantic_model = SentenceTransformer(model_name)
                self._semantic_threshold = float(getattr(_s, "semantic_chunk_threshold", 0.5))
                logger.info("Semantic chunking model loaded: %s (threshold=%.2f)", model_name, self._semantic_threshold)
            except Exception as exc:
                logger.warning("Semantic chunking model load failed (%s); disabling semantic chunking", exc)
                self._semantic_model_failed = True
                return None
        return self._semantic_model

    def _is_semantic_topic_shift(self, model, block_a: StructuralBlock, block_b: StructuralBlock) -> bool:
        try:
            import numpy as np
            embs = model.encode([block_a.content[:500], block_b.content[:500]], show_progress_bar=False)
            norm_a = float(np.linalg.norm(embs[0]))
            norm_b = float(np.linalg.norm(embs[1]))
            if norm_a < 1e-8 or norm_b < 1e-8:
                return False
            cos_sim = float(np.dot(embs[0], embs[1]) / (norm_a * norm_b))
            return cos_sim < self._semantic_threshold
        except Exception:
            return False

    def _carry_overlap_blocks(self, source_group: Sequence[StructuralBlock]) -> tuple[list[StructuralBlock], int]:
        """Return the trailing blocks of `source_group` whose tokens fit in the overlap budget.

        Used when flushing a parent: the next parent will start with these
        blocks so that an attribute block (e.g. "Composition:") is not orphaned
        from its entity name in the prior parent. Pure positional carry-over,
        no domain knowledge — works for any enumerative document.
        """
        if self.parent_overlap_tokens <= 0 or not source_group:
            return ([], 0)
        carry: list[StructuralBlock] = []
        tokens = 0
        for block in reversed(source_group):
            next_tokens = tokens + max(1, block.token_count)
            if next_tokens > self.parent_overlap_tokens and carry:
                break
            carry.insert(0, block)
            tokens = next_tokens
            if tokens >= self.parent_overlap_tokens:
                break
        # Avoid useless overlap when the prior group is already a full-sized
        # parent (carrying everything would duplicate it). For tiny groups
        # (e.g. a sub-section header followed by a one-line description),
        # carry over the entire group on purpose so the next parent is
        # self-contained. Threshold: only skip carry when the prior group
        # was at least `parent_min_tokens` (a sizable, standalone parent).
        source_total = sum(max(1, b.token_count) for b in source_group)
        if len(carry) >= len(source_group) and source_total >= self.parent_min_tokens:
            return ([], 0)
        return (carry, tokens)

    def _group_blocks_into_parents(self, blocks: Sequence[StructuralBlock]) -> list[list[StructuralBlock]]:
        groups: list[list[StructuralBlock]] = []
        current_group: list[StructuralBlock] = []
        current_tokens = 0
        semantic_model = self._get_or_load_semantic_model()

        def _flush_with_overlap() -> None:
            nonlocal current_group, current_tokens
            if not current_group:
                return
            closed = current_group
            groups.append(closed)
            carry, carry_tokens = self._carry_overlap_blocks(closed)
            current_group = list(carry)
            current_tokens = carry_tokens

        for block in blocks:
            block_tokens = max(1, block.token_count)
            starts_new_section = (
                block.block_type == "header"
                and current_group
                and any(existing.block_type != "header" for existing in current_group)
            )

            if starts_new_section:
                _flush_with_overlap()

            should_flush = (
                current_group
                and current_tokens >= self.parent_min_tokens
                and current_tokens + block_tokens > self.parent_max_tokens
            )
            if should_flush:
                _flush_with_overlap()

            # Semantic topic-shift split (only when group has minimum content)
            if (
                not should_flush
                and not starts_new_section
                and semantic_model is not None
                and current_group
                and current_tokens >= self.parent_min_tokens // 2
                and block.block_type not in {"header"}
            ):
                last_content = next(
                    (b for b in reversed(current_group) if b.block_type not in {"header"}), None
                )
                if last_content is not None and self._is_semantic_topic_shift(semantic_model, last_content, block):
                    _flush_with_overlap()

            current_group.append(block)
            current_tokens += block_tokens

            if current_tokens >= self.parent_target_tokens and block.block_type == "header":
                _flush_with_overlap()

        if current_group:
            groups.append(current_group)

        return groups

    # Heuristic entity-name detection — generic, no domain bias.
    # Matches a short bullet/numbered line followed by attribute markers
    # (next non-empty line is a colon-terminated bullet OR an UPPERCASE
    # header). Used to inject `### {name}` synthetic headings so the model
    # can disambiguate sibling entities packed into the same parent (e.g.
    # successive products, plans, items, lessons, services).
    # Bullet markers cover ASCII dashes, asterisks, and common Unicode bullet
    # glyphs emitted by PDF extractors: en-dash, em-dash, middle dot, square,
    # triangle. Widening keeps the heuristic generic across language/typography.
    _BULLET_CHARS = r"\-–—*•·▪‣◦"
    # Name-start character class: capital letters across Latin scripts, plus
    # encoding artefacts produced by some PDF extractors that mangle accents
    # (e.g. backtick or apostrophe replacing `Á`). Stays generic — does not
    # accept digits or whitespace as name-start.
    _NAME_START = r"A-ZÀ-ÖØ-Þ`'\""
    _ENTITY_NAME_LINE = re.compile(
        r"^\s*(?:[" + _BULLET_CHARS + r"]\s+|\d+[\.\)]\s+)"
        r"(?P<name>[" + _NAME_START + r"][^:\n]{1,80})\s*$"
    )
    _ATTRIBUTE_FOLLOWER = re.compile(
        r"^\s*(?:"
        r"[" + _BULLET_CHARS + r"]\s+[^\s:][^\n:]{0,40}:"  # bullet attribute "- Word:" / "– Foo bar:"
        r"|[" + _NAME_START + r"][^\n:]{2,40}:?\s*$"        # uppercase / header-ish line
        r"|#{1,6}\s+\S"                                     # markdown header
        r")"
    )

    def _inject_entity_headings(self, content: str) -> str:
        if not content or not content.strip():
            return content
        lines = content.split("\n")
        out: list[str] = []
        # Look ahead one significant non-empty line.
        for index, line in enumerate(lines):
            if self._ENTITY_NAME_LINE.match(line):
                # Find next non-empty line.
                follower = None
                for j in range(index + 1, min(index + 5, len(lines))):
                    cand = lines[j]
                    if cand.strip():
                        follower = cand
                        break
                if follower and self._ATTRIBUTE_FOLLOWER.match(follower):
                    name_match = self._ENTITY_NAME_LINE.match(line)
                    name = (name_match.group("name") if name_match else "").strip()
                    if name:
                        # Prepend a synthetic heading. Keeps original line intact
                        # so existing semantics are preserved; just adds an
                        # explicit anchor the model can latch onto.
                        out.append(f"### {name}")
            out.append(line)
        return "\n".join(out)

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
        joined = "\n\n".join(block.content for block in group).strip()
        content = self._inject_entity_headings(joined)
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

    def _compute_overlap_carry(self, group: list[StructuralBlock]) -> list[StructuralBlock]:
        """Return tail blocks from group that fit within child_overlap_tokens budget."""
        if self.child_overlap_tokens <= 0 or not group:
            return []
        carry: list[StructuralBlock] = []
        carry_tokens = 0
        for block in reversed(group):
            if carry_tokens + block.token_count > self.child_overlap_tokens:
                break
            carry.insert(0, block)
            carry_tokens += block.token_count
        return carry

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
                overlap = self._compute_overlap_carry(current_group)
                current_group = list(overlap)
                current_tokens = sum(max(1, b.token_count) for b in current_group)

            current_group.append(block)
            current_tokens += block_tokens

            if current_tokens >= self.child_target_tokens and block.block_type == "table":
                groups.append(current_group)
                overlap = self._compute_overlap_carry(current_group)
                current_group = list(overlap)
                current_tokens = sum(max(1, b.token_count) for b in current_group)

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
