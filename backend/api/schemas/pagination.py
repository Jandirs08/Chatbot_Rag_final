"""Shared pagination response shape."""

from typing import Generic, List, TypeVar

from pydantic import BaseModel

T = TypeVar("T")


class Page(BaseModel, Generic[T]):
    items: List[T]
    total: int
    page: int = 1
    limit: int = 50
    total_pages: int = 1
    has_next: bool = False

    @classmethod
    def build(cls, items: List[T], total: int, limit: int, skip: int) -> "Page[T]":
        if limit <= 0:
            return cls(items=items, total=total, page=1, limit=limit, total_pages=1, has_next=False)
        total_pages = max(1, (total + limit - 1) // limit)
        raw_page = skip // limit + 1
        page = min(raw_page, total_pages)
        return cls(
            items=items,
            total=total,
            page=page,
            limit=limit,
            total_pages=total_pages,
            has_next=page < total_pages,
        )
