"""Módulo para cargar y procesar contenido de PDFs (versión estable, segura y no destructiva)."""

import re
import hashlib
from typing import List, Optional
from pathlib import Path
import logging

from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_core.documents import Document
from langchain_community.document_loaders import PyMuPDFLoader

logger = logging.getLogger(__name__)


class PDFContentLoader:
    """Cargador seguro y no destructivo de contenido PDF."""

    def __init__(
        self,
        chunk_size: Optional[int] = None,
        chunk_overlap: Optional[int] = None,
        min_chunk_length: Optional[int] = None
    ):
        from config import settings  # evitar ciclos

        # Usar estrictamente los valores provistos o los de settings;
        # evitar defaults internos inconsistentes.
        self.chunk_size = chunk_size if chunk_size is not None else settings.chunk_size
        self.chunk_overlap = chunk_overlap if chunk_overlap is not None else settings.chunk_overlap
        self.min_chunk_length = min_chunk_length if min_chunk_length is not None else settings.min_chunk_length

        # Enhanced separators for better structural awareness
        # Ordered by semantic strength (strongest breaks first)
        improved_separators = [
            "\n\n\n",      # Multiple blank lines (strong section break)
            "\n\n",        # Paragraph break
            "\n---\n",     # Horizontal rule / section divider
            "\n## ",       # Markdown header
            "\n# ",        # Markdown header
            "\n- ",        # List item (dash)
            "\n• ",        # List item (bullet)
            "\n* ",        # List item (asterisk)
            "\n\t",        # Tab-indented content (often lists or code)
            ".\n",        # Sentence ending with newline
            "!\n",        # Exclamation with newline
            "?\n",        # Question with newline
            "\n",          # Line break
            ". ",          # Sentence ending with space
            "! ",          # Exclamation with space
            "? ",          # Question with space
            "; ",          # Semicolon (natural pause)
            ": ",          # Colon (often precedes explanation)
            ", ",          # Comma (lighter pause)
            " ",           # Word boundary
            ""             # Character boundary (last resort)
        ]
        
        self.text_splitter = RecursiveCharacterTextSplitter.from_tiktoken_encoder(
            encoding_name="cl100k_base",
            chunk_size=self.chunk_size,
            chunk_overlap=self.chunk_overlap,
            separators=improved_separators
        )

        logger.debug(
            f"[PDFContentLoader INIT] chunk_size={self.chunk_size} | overlap={self.chunk_overlap} | min_chunk_length={self.min_chunk_length}"
        )

    # ============================================================
    # 1) CARGA Y SPLIT PRINCIPAL
    # ============================================================

    def load_and_split_pdf(self, pdf_path: Path) -> List[Document]:
        """Carga y divide el PDF sin modificar su estructura."""
        logger.info(f"Procesando PDF: {pdf_path.name}")

        try:
            pdf_loader = PyMuPDFLoader(str(pdf_path))
            documents = pdf_loader.load()
            logger.info(f"PDF cargado: {len(documents)} páginas")
        except Exception as e:
            logger.error(f"Error leyendo PDF {pdf_path.name}: {e}", exc_info=True)
            return []

        return self.split_documents_direct(documents, pdf_path)

    def split_documents_direct(self, documents: List[Document], source_path: Path) -> List[Document]:
        """
        Procesa documentos ya cargados en memoria.
        Optimización para evitar doble I/O cuando el ingestor ya cargó el PDF.
        """
        if not documents:
            logger.warning(f"PDF vacío o lista de documentos vacía: {source_path.name}")
            return []

        # Preprocesado seguro
        processed_docs = self._preprocess_documents(documents)

        # Dividir en chunks
        chunks = self.text_splitter.split_documents(processed_docs)
        logger.info(f"{len(chunks)} chunks generados")

        # Post-procesado seguro (sin filtrado destructivo)
        final_chunks = self._postprocess_chunks(chunks, source_path)
        logger.info(f"{len(final_chunks)} chunks finales después de metadata")
        try:
            preview_count = min(len(final_chunks), 10)
            for idx in range(preview_count):
                c = final_chunks[idx]
                t = c.page_content.strip()
                logger.debug(f"chunk[{idx}] size={len(t)} words={len(t.split())} preview={t[:120]}")
        except Exception:
            pass

        return final_chunks

    # ============================================================
    # 2) PREPROCESAMIENTO SEGURO (NO destructivo)
    # ============================================================

    def _preprocess_documents(self, documents: List[Document]) -> List[Document]:
        """Limpieza mínima sin alterar estructura."""
        processed_docs = []
        for doc in documents:
            text = doc.page_content
            text = self._clean_text(text)  # limpieza mínima
            doc.page_content = text
            processed_docs.append(doc)
        return processed_docs

    def _clean_text(self, text: str) -> str:
        """Elimina solo caracteres problemáticos sin tocar estructura."""
        # Mantener saltos de línea y tabs
        text = ''.join(
            c for c in text if c.isprintable() or c in ['\n', '\t']
        )

        # NO colapsar saltos de línea
        lines = text.splitlines()
        cleaned = [line.rstrip() for line in lines]

        return "\n".join(cleaned).strip()

    def _validate_sentence_boundaries(self, text: str) -> tuple:
        """
        Validates and adjusts text to end on sentence boundaries when possible.
        This prevents chunks from cutting mid-sentence.
        
        Returns:
            tuple: (adjusted_text, has_complete_sentences, boundary_quality_score)
                - adjusted_text: text trimmed to last sentence boundary if found
                - has_complete_sentences: True if ends on sentence boundary
                - boundary_quality_score: 0.0-1.0 indicating quality
        """
        if not text or len(text.strip()) == 0:
            return text, False, 0.0
        
        # Sentence ending patterns (various punctuation marks)
        # Handles: period, exclamation, question, with optional quotes
        sentence_end_pattern = r'[.!?]["\']?\s*$'
        
        # Check if text already ends with sentence boundary
        if re.search(sentence_end_pattern, text.rstrip()):
            return text, True, 1.0
        
        # Try to find last complete sentence within the text
        # Match sentence endings followed by space/newline or quotes then space
        sentences_pattern = r'[.!?]["\']?(?:\s+|\n)'
        matches = list(re.finditer(sentences_pattern, text))
        
        if matches:
            # Get position after last sentence boundary
            last_boundary = matches[-1].end()
            
            # Calculate how much content we're trimming
            remaining_ratio = last_boundary / max(len(text), 1)
            
            # Only trim if we're keeping at least 70% of the content
            # This prevents over-aggressive trimming that loses too much context
            if remaining_ratio >= 0.7:
                adjusted_text = text[:last_boundary].rstrip()
                quality_score = remaining_ratio
                return adjusted_text, True, quality_score
        
        # No good sentence boundary found, or would trim too much
        # Return original text but flag it
        # Quality score 0.5 = uncertain boundary
        return text, False, 0.5

    # ============================================================
    # 3) POSTPROCESAMIENTO — SOLO AÑADIR METADATA (NO filtrar)
    # ============================================================

    def _postprocess_chunks(self, chunks: List[Document], pdf_path: Path) -> List[Document]:
        """Asigna metadatos sin descartar contenido bueno."""
        final_chunks = []

        for idx, chunk in enumerate(chunks):
            content = chunk.page_content.strip()
            if not content:
                continue  # solo descarta si realmente está vacío
            # Filtro mínimo para evitar basura: respeta configuración existente
            if len(content) < self.min_chunk_length:
                continue

            # Validate and potentially adjust for sentence boundaries
            adjusted_content, has_complete_sentences, boundary_score = self._validate_sentence_boundaries(content)
            
            # Only use adjusted content if it passes minimum length after adjustment
            if len(adjusted_content.strip()) >= self.min_chunk_length:
                content = adjusted_content
                chunk.page_content = content  # Update chunk with adjusted content
            else:
                # If adjustment would make it too short, keep original
                has_complete_sentences = False
                boundary_score = 0.5
            
            quality_score = self._calculate_chunk_quality(content)
            page_idx = None
            try:
                raw_page = chunk.metadata.get("page")
                if isinstance(raw_page, (int, float)):
                    page_idx = int(raw_page)
                elif isinstance(raw_page, str) and raw_page.isdigit():
                    page_idx = int(raw_page)
            except Exception:
                page_idx = None

            try:
                preview_text = content[:50]
                human_page = (page_idx + 1) if page_idx is not None else None
                logger.debug(f"[PDF-DEBUG] Chunk {idx} | Page RawIdx: {page_idx} -> Human: {human_page} | Text: \"{preview_text}\"")
                if human_page is None:
                    logger.warning(f"[ALERTA] Chunk sin número de página detectado en {pdf_path.name}")
            except Exception:
                pass

            chunk.metadata.update({
                "source": pdf_path.name,
                "file_path": str(pdf_path.resolve()),
                "chunk_type": self._detect_chunk_type(content),
                "content_hash": self._generate_content_hash(content),
                "quality_score": quality_score,
                "word_count": len(content.split()),
                "char_count": len(content),
                "page_number": ((page_idx + 1) if page_idx is not None else None),
                # New metadata for semantic boundary tracking
                "has_complete_sentences": has_complete_sentences,
                "boundary_quality_score": boundary_score,
            })

            final_chunks.append(chunk)

        return final_chunks

    # ============================================================
    # 4) UTILIDADES DE METADATOS
    # ============================================================

    def _calculate_chunk_quality(self, content: str) -> float:
        """Score informativo pero NO usado para descartar."""
        score = 1.0

        if len(content) < 20:
            score *= 0.7

        if content.count("\n") > 3:
            score *= 1.1

        return min(score, 1.0)

    def _detect_chunk_type(self, content: str) -> str:
        """Detects the type of content in the chunk for better categorization."""
        # Check for table patterns (common indicators)
        if '|' in content and content.count('|') > 3:
            return "table"
        
        # Check for numbered lists
        if re.match(r'^\d+\.\s', content) or re.search(r'\n\d+\.\s', content):
            return "numbered_list"
        
        # Check for bullet lists (various bullet styles)
        if content.startswith("• ") or content.startswith("- ") or content.startswith("* "):
            return "bullet_list"
        if re.search(r'\n[•\-\*]\s', content):
            return "bullet_list"
        
        # Check for header patterns (short, capitalized, possibly ending with :)
        lines = content.split('\n')
        if lines and len(lines[0]) < 100 and lines[0].strip().endswith(':'):
            return "header"
        if lines and len(lines[0]) < 80 and lines[0].isupper():
            return "header"
        
        # Default to text
        return "text"

    def _generate_content_hash(self, content: str) -> str:
        normalized = re.sub(r'\s+', ' ', content.lower().strip())
        return hashlib.md5(normalized.encode()).hexdigest()
