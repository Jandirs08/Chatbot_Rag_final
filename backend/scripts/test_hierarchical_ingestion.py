from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from qdrant_client.http.models import FieldCondition, Filter as QFilter, MatchValue

from config import settings
from database.mongodb import get_mongodb_client
from database.rag_child_lexical_repository import RAGChildLexicalRepository
from database.rag_parent_document_repository import RAGParentDocumentRepository
from rag.embeddings.embedding_manager import EmbeddingManager
from rag.ingestion.hierarchical_chunker import HierarchicalChunker
from rag.ingestion.hierarchical_ingestion_service import HierarchicalIngestionService
from rag.vector_store.vector_store import VectorStore


def resolve_pdf_path(raw_path: Path) -> Path:
    candidates = []

    if raw_path.is_absolute():
        candidates.append(raw_path)
    else:
        candidates.extend(
            [
                Path.cwd() / raw_path,
                BACKEND_DIR / raw_path,
                BACKEND_DIR.parent / raw_path,
            ]
        )

    for candidate in candidates:
        candidate = candidate.resolve()
        if candidate.exists() and candidate.is_file():
            return candidate

    searched = "\n".join(f"- {candidate.resolve()}" for candidate in candidates)
    raise FileNotFoundError(
        "PDF not found. Checked these paths:\n"
        f"{searched}\n\n"
        "If you are running inside the backend Docker container, remember it only has the backend "
        "workspace mounted at /app. Paths like './utils/...' from the repo root will not exist there "
        "unless you mount the full repository or copy the PDF into '/app/storage/documents/pdfs'."
    )


async def main(pdf_path: Path) -> None:
    mongodb_client = get_mongodb_client()
    embedding_manager = EmbeddingManager(model_name=settings.embedding_model)
    parent_repository = RAGParentDocumentRepository(mongodb_client=mongodb_client)
    lexical_repository = RAGChildLexicalRepository(mongodb_client=mongodb_client)
    vector_store = VectorStore(
        embedding_function=embedding_manager,
        distance_strategy=settings.distance_strategy,
        cache_enabled=False,
        cache_ttl=settings.cache_ttl,
        batch_size=settings.batch_size,
        collection_name=settings.rag_child_collection_name,
    )
    service = HierarchicalIngestionService(
        chunker=HierarchicalChunker(),
        parent_repository=parent_repository,
        embedding_manager=embedding_manager,
        vector_store=vector_store,
        lexical_repository=lexical_repository,
    )

    result = await service.ingest_pdf(pdf_path, replace_existing=True)
    doc_id = result["doc_id"]

    mongo_count = await parent_repository.count_by_doc_id(doc_id)
    lexical_count = await lexical_repository.count_by_doc_id(doc_id)
    qfilter = QFilter(must=[FieldCondition(key="doc_id", match=MatchValue(value=doc_id))])
    qdrant_count = vector_store.client.count(
        collection_name=vector_store.collection_name,
        count_filter=qfilter,
    )

    print("Hierarchical ingestion completed")
    print(f"doc_id: {doc_id}")
    print(f"parents_in_mongo: {mongo_count}")
    print(f"children_in_lexical_index: {lexical_count}")
    print(f"children_in_qdrant: {int(getattr(qdrant_count, 'count', 0) or 0)}")
    print(f"mongo_collection: {result['mongo_collection']}")
    print(f"lexical_collection: {result['lexical_collection']}")
    print(f"qdrant_collection: {result['qdrant_collection']}")

    await mongodb_client.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Test hierarchical PDF ingestion.")
    parser.add_argument("pdf_path", type=Path, help="Absolute or relative path to the PDF file.")
    args = parser.parse_args()
    asyncio.run(main(resolve_pdf_path(args.pdf_path)))
