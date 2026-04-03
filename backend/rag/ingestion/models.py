from __future__ import annotations

from pathlib import Path
from typing import Any, Optional

from pydantic import BaseModel, Field, model_validator


class PageSpan(BaseModel):
    start_page: int = Field(..., ge=1)
    end_page: int = Field(..., ge=1)

    @model_validator(mode="after")
    def validate_span(self) -> "PageSpan":
        if self.end_page < self.start_page:
            raise ValueError("end_page must be greater than or equal to start_page")
        return self


class ParentDocument(BaseModel):
    parent_id: str
    doc_id: str
    content: str
    page_span: PageSpan
    source: str
    file_path: str
    parent_index: int = Field(..., ge=0)
    section_title: Optional[str] = None
    contains_table: bool = False
    contains_numeric: bool = False
    contains_date_like: bool = False
    block_types: list[str] = Field(default_factory=list)
    token_count: int = Field(default=0, ge=0)
    block_count: int = Field(default=0, ge=0)
    child_count: int = Field(default=0, ge=0)
    content_hash: str = ""
    metadata: dict[str, Any] = Field(default_factory=dict)

    @property
    def page_start(self) -> int:
        return self.page_span.start_page

    @property
    def page_end(self) -> int:
        return self.page_span.end_page


class ChildChunk(BaseModel):
    child_id: str
    parent_id: str
    doc_id: str
    content: str
    page_span: PageSpan
    source: str
    file_path: str
    child_index: int = Field(..., ge=0)
    parent_index: int = Field(..., ge=0)
    section_title: Optional[str] = None
    contains_table: bool = False
    contains_numeric: bool = False
    contains_date_like: bool = False
    block_types: list[str] = Field(default_factory=list)
    token_count: int = Field(default=0, ge=0)
    content_hash: str = ""
    metadata: dict[str, Any] = Field(default_factory=dict)

    @property
    def page_start(self) -> int:
        return self.page_span.start_page

    @property
    def page_end(self) -> int:
        return self.page_span.end_page


class HierarchicalChunkingResult(BaseModel):
    doc_id: str
    source: str
    file_path: str
    page_count: int = Field(default=0, ge=0)
    parents: list[ParentDocument] = Field(default_factory=list)
    children: list[ChildChunk] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)

    @classmethod
    def empty(cls, pdf_path: Path, doc_id: str) -> "HierarchicalChunkingResult":
        return cls(
            doc_id=doc_id,
            source=pdf_path.name,
            file_path=str(pdf_path.resolve()),
            page_count=0,
            parents=[],
            children=[],
            metadata={},
        )
