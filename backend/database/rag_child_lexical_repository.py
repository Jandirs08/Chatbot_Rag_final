from __future__ import annotations

import logging
import math
import re
import unicodedata
from collections import Counter, defaultdict
from dataclasses import dataclass
from typing import Iterable, Sequence

from pymongo import ReplaceOne

from config import settings
from database.mongodb import MongodbClient
from rag.ingestion.models import ChildChunk

logger = logging.getLogger(__name__)

_TOKEN_PATTERN = re.compile(r"[a-z0-9]+(?:[._:/-][a-z0-9]+)*")
_STOPWORDS = {
    "a", "al", "algo", "and", "ante", "con", "contra", "como", "de", "del", "desde",
    "donde", "el", "ella", "ellas", "ellos", "en", "entre", "es", "esta", "este",
    "esto", "for", "la", "las", "lo", "los", "no", "o", "of", "para", "por", "que",
    "se", "sin", "sobre", "su", "sus", "the", "un", "una", "uno", "y",
}


@dataclass(frozen=True)
class LexicalSearchHit:
    child_id: str
    parent_id: str
    doc_id: str
    score: float
    content: str
    source: str
    file_path: str
    page_start: int
    page_end: int
    section_title: str | None
    contains_table: bool
    contains_numeric: bool
    contains_date_like: bool
    token_count: int


class RAGChildLexicalRepository:
    def __init__(
        self,
        mongodb_client: MongodbClient,
        documents_collection_name: str | None = None,
        postings_collection_name: str | None = None,
    ) -> None:
        self.mongodb_client = mongodb_client
        self.documents_collection_name = (
            documents_collection_name or settings.rag_child_lexical_collection_name
        )
        self.postings_collection_name = (
            postings_collection_name or settings.rag_child_lexical_postings_collection_name
        )
        self.documents_collection = mongodb_client.db[self.documents_collection_name]
        self.postings_collection = mongodb_client.db[self.postings_collection_name]

    async def ensure_indexes(self) -> None:
        try:
            await self.documents_collection.create_index("child_id", unique=True, name="child_id_unique")
            await self.documents_collection.create_index("doc_id", name="doc_id_idx")
            await self.documents_collection.create_index("parent_id", name="parent_id_idx")
            await self.documents_collection.create_index("source", name="source_idx")

            await self.postings_collection.create_index([("term", 1), ("child_id", 1)], unique=True, name="term_child_unique")
            await self.postings_collection.create_index("term", name="term_idx")
            await self.postings_collection.create_index("doc_id", name="posting_doc_id_idx")
            await self.postings_collection.create_index("parent_id", name="posting_parent_id_idx")
            await self.postings_collection.create_index("source", name="posting_source_idx")
        except Exception as exc:
            logger.error("Error ensuring lexical indexes: %s", exc, exc_info=True)
            raise

    async def upsert_children(self, children: Sequence[ChildChunk]) -> int:
        if not children:
            return 0

        docs_operations = []
        posting_operations = []

        for child in children:
            token_counter = Counter(self.tokenize(child.content))
            docs_operations.append(
                ReplaceOne(
                    {"child_id": child.child_id},
                    {
                        "child_id": child.child_id,
                        "parent_id": child.parent_id,
                        "doc_id": child.doc_id,
                        "source": child.source,
                        "file_path": child.file_path,
                        "content": child.content,
                        "page_start": child.page_start,
                        "page_end": child.page_end,
                        "section_title": child.section_title,
                        "contains_table": child.contains_table,
                        "contains_numeric": child.contains_numeric,
                        "contains_date_like": child.contains_date_like,
                        "token_count": child.token_count,
                    },
                    upsert=True,
                )
            )
            for term, term_frequency in token_counter.items():
                posting_operations.append(
                    ReplaceOne(
                        {"term": term, "child_id": child.child_id},
                        {
                            "term": term,
                            "child_id": child.child_id,
                            "parent_id": child.parent_id,
                            "doc_id": child.doc_id,
                            "source": child.source,
                            "tf": int(term_frequency),
                            "token_count": child.token_count,
                        },
                        upsert=True,
                    )
                )

        result = await self.documents_collection.bulk_write(docs_operations, ordered=False)
        if posting_operations:
            await self.postings_collection.bulk_write(posting_operations, ordered=False)
        return int(
            (getattr(result, "inserted_count", 0) or 0)
            + (getattr(result, "upserted_count", 0) or 0)
            + (getattr(result, "modified_count", 0) or 0)
        )

    async def delete_by_doc_id(self, doc_id: str) -> int:
        docs_result = await self.documents_collection.delete_many({"doc_id": doc_id})
        await self.postings_collection.delete_many({"doc_id": doc_id})
        return int(getattr(docs_result, "deleted_count", 0) or 0)

    async def delete_by_source(self, source: str) -> int:
        docs_result = await self.documents_collection.delete_many({"source": source})
        await self.postings_collection.delete_many({"source": source})
        return int(getattr(docs_result, "deleted_count", 0) or 0)

    async def count_by_doc_id(self, doc_id: str) -> int:
        return int(await self.documents_collection.count_documents({"doc_id": doc_id}))

    async def clear(self) -> int:
        docs_result = await self.documents_collection.delete_many({})
        await self.postings_collection.delete_many({})
        return int(getattr(docs_result, "deleted_count", 0) or 0)

    async def search(
        self,
        query: str,
        *,
        limit: int,
        filter_criteria: dict | None = None,
        k1: float = 1.5,
        b: float = 0.75,
    ) -> list[LexicalSearchHit]:
        tokens = self.tokenize(query)
        if not tokens:
            return []

        filter_criteria = dict(filter_criteria or {})
        docs_filter = self._build_docs_filter(filter_criteria)
        postings_filter = self._build_postings_filter(tokens, filter_criteria)

        total_docs = int(await self.documents_collection.count_documents(docs_filter))
        if total_docs == 0:
            return []

        avg_doc_length = await self._average_doc_length(docs_filter)
        postings = await self.postings_collection.find(postings_filter).to_list(length=None)
        if not postings:
            return []

        query_term_frequency = Counter(tokens)
        document_frequency = Counter(posting["term"] for posting in postings)
        child_scores: dict[str, float] = defaultdict(float)

        for posting in postings:
            child_id = str(posting["child_id"])
            term = str(posting["term"])
            tf = max(0, int(posting.get("tf", 0) or 0))
            doc_length = max(1, int(posting.get("token_count", 0) or 1))
            df = max(1, int(document_frequency.get(term, 1)))
            idf = math.log(1 + ((total_docs - df + 0.5) / (df + 0.5)))
            denominator = tf + k1 * (1 - b + b * (doc_length / max(avg_doc_length, 1.0)))
            query_boost = 1 + 0.2 * max(0, query_term_frequency.get(term, 1) - 1)
            child_scores[child_id] += idf * ((tf * (k1 + 1)) / max(denominator, 1e-9)) * query_boost

        ranked_child_ids = [
            child_id for child_id, _ in sorted(child_scores.items(), key=lambda item: item[1], reverse=True)[: max(1, limit)]
        ]
        if not ranked_child_ids:
            return []

        docs = await self.documents_collection.find({"child_id": {"$in": ranked_child_ids}, **docs_filter}).to_list(length=None)
        child_map = {str(doc["child_id"]): doc for doc in docs}

        return [
            LexicalSearchHit(
                child_id=child_id,
                parent_id=str(child_map[child_id]["parent_id"]),
                doc_id=str(child_map[child_id]["doc_id"]),
                score=float(child_scores[child_id]),
                content=str(child_map[child_id]["content"]),
                source=str(child_map[child_id]["source"]),
                file_path=str(child_map[child_id]["file_path"]),
                page_start=int(child_map[child_id]["page_start"]),
                page_end=int(child_map[child_id]["page_end"]),
                section_title=child_map[child_id].get("section_title"),
                contains_table=bool(child_map[child_id].get("contains_table", False)),
                contains_numeric=bool(child_map[child_id].get("contains_numeric", False)),
                contains_date_like=bool(child_map[child_id].get("contains_date_like", False)),
                token_count=int(child_map[child_id].get("token_count", 0) or 0),
            )
            for child_id in ranked_child_ids
            if child_id in child_map
        ]

    async def _average_doc_length(self, docs_filter: dict) -> float:
        pipeline = [
            {"$match": docs_filter},
            {"$group": {"_id": None, "avg_token_count": {"$avg": "$token_count"}}},
        ]
        result = await self.documents_collection.aggregate(pipeline).to_list(length=1)
        if not result:
            return 1.0
        return float(result[0].get("avg_token_count") or 1.0)

    @classmethod
    def tokenize(cls, text: str) -> list[str]:
        normalized = unicodedata.normalize("NFKD", str(text or "").lower())
        ascii_text = normalized.encode("ascii", "ignore").decode("ascii")
        return [
            token
            for token in _TOKEN_PATTERN.findall(ascii_text)
            if token and (token.isdigit() or len(token) > 1) and token not in _STOPWORDS
        ]

    def _build_docs_filter(self, filter_criteria: dict) -> dict:
        allowed = {"doc_id", "parent_id", "source", "child_id"}
        return {key: value for key, value in filter_criteria.items() if key in allowed and value is not None}

    def _build_postings_filter(self, tokens: Iterable[str], filter_criteria: dict) -> dict:
        postings_filter = {"term": {"$in": list(tokens)}}
        for key, value in filter_criteria.items():
            if key in {"doc_id", "parent_id", "source", "child_id"} and value is not None:
                postings_filter[key] = value
        return postings_filter
