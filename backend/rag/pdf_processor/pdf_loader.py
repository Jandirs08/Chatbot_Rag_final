"""Módulo para cargar y procesar contenido de PDFs (versión estable, segura y no destructiva)."""

import asyncio
import re

from utils.hashing import hash_content_for_dedup
from typing import List, Optional
from pathlib import Path
import logging
import tiktoken

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
        
        self.encoding_name = "cl100k_base"
        self.encoding = tiktoken.get_encoding(self.encoding_name)
        self.separators = improved_separators
        self.text_splitter = RecursiveCharacterTextSplitter.from_tiktoken_encoder(
            encoding_name=self.encoding_name,
            chunk_size=self.chunk_size,
            chunk_overlap=self.chunk_overlap,
            separators=self.separators
        )

        logger.debug(
            f"[PDFContentLoader INIT] chunk_size={self.chunk_size} | overlap={self.chunk_overlap} | min_chunk_length={self.min_chunk_length}"
        )

    # ============================================================
    # 1) CARGA Y SPLIT PRINCIPAL
    # ============================================================

    async def load_and_split_pdf(self, pdf_path: Path) -> List[Document]:
        """Carga y divide el PDF de forma asíncrona.

        El I/O de PyMuPDF es bloqueante; se ejecuta en `asyncio.to_thread`
        para no congelar el event loop de FastAPI/Uvicorn durante la ingesta.

        Usa este método únicamente cuando NO tengas los documentos ya en memoria.
        Si el ingestor ya los cargó (para calcular hashes), llama directamente
        a `split_documents_direct(documents, pdf_path)` para evitar una segunda
        lectura de disco.
        """
        logger.info(f"Procesando PDF: {pdf_path.name}")

        try:
            def _load() -> List[Document]:
                return PyMuPDFLoader(str(pdf_path)).load()

            documents = await asyncio.to_thread(_load)
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
        total_tokens = sum(self.text_splitter._length_function(doc.page_content or "") for doc in processed_docs)
        logger.debug(f"[PDF-TOKENS] {source_path.name}: total_tokens={total_tokens}")
        if total_tokens < 2000:
            chunk_size, chunk_overlap = 300, 50
        elif total_tokens <= 10000:
            chunk_size, chunk_overlap = 600, 100
        else:
            chunk_size, chunk_overlap = 1200, 200
        adaptive_splitter = RecursiveCharacterTextSplitter.from_tiktoken_encoder(
            encoding_name=self.encoding_name,
            chunk_size=chunk_size,
            chunk_overlap=chunk_overlap,
            separators=self.separators
        )
        sections = self._extract_sections(processed_docs)
        chunks = []
        for section in sections:
            token_count = len(self.encoding.encode(section.page_content or ""))
            if token_count <= chunk_size:
                chunks.append(section)
            else:
                chunks.extend(adaptive_splitter.split_documents([section]))
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

    def _extract_sections(self, documents: List[Document]) -> List[Document]:
        sections = []

        def _is_section_header(lines: List[str], index: int) -> bool:
            line = lines[index].strip()
            if not line:
                return False
            if len(line) <= 60 and any(char.isalpha() for char in line) and line == line.upper():
                return True
            if line.endswith(":"):
                return True
            if re.match(r"^#{1,2}\s+\S", line):
                return True
            if index + 1 < len(lines) and not lines[index + 1].strip():
                content_lines = 0
                for candidate in lines[index + 2:]:
                    if candidate.strip():
                        content_lines += 1
                    if content_lines >= 2:
                        return True
            return False

        for doc in documents:
            try:
                text = doc.page_content or ""
                lines = text.split("\n")
                header_indexes = [idx for idx in range(len(lines)) if _is_section_header(lines, idx)]
                if not header_indexes:
                    metadata = dict(doc.metadata)
                    metadata["section_title"] = None
                    sections.append(Document(page_content=text, metadata=metadata))
                    continue

                current_title = None
                current_lines: List[str] = []
                for idx, line in enumerate(lines):
                    if idx in header_indexes:
                        if any(existing_line.strip() for existing_line in current_lines):
                            metadata = dict(doc.metadata)
                            metadata["section_title"] = current_title
                            sections.append(Document(page_content="\n".join(current_lines).strip(), metadata=metadata))
                        current_title = line.strip()
                        current_lines = [line]
                    else:
                        current_lines.append(line)

                if any(existing_line.strip() for existing_line in current_lines):
                    metadata = dict(doc.metadata)
                    metadata["section_title"] = current_title
                    sections.append(Document(page_content="\n".join(current_lines).strip(), metadata=metadata))
            except Exception:
                metadata = dict(getattr(doc, "metadata", {}) or {})
                metadata["section_title"] = None
                sections.append(Document(page_content=getattr(doc, "page_content", "") or "", metadata=metadata))

        return sections

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
        return hash_content_for_dedup(content)
