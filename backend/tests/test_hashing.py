"""
Tests para utilidades de hashing.

Cubre:
- hash_text_md5: hash MD5 con/sin normalización
- hash_text_sha256: hash SHA256 con/sin normalización
- hash_content_for_dedup: conveniencia para deduplicación
- hash_for_cache_key: conveniencia para cache keys
"""
import pytest

from utils.hashing import (
    hash_text_md5,
    hash_text_sha256,
    hash_content_for_dedup,
    hash_for_cache_key,
)


class TestHashTextMD5:
    """Tests para hash_text_md5."""

    def test_determinista(self):
        """El mismo input produce el mismo hash."""
        assert hash_text_md5("hello") == hash_text_md5("hello")

    def test_normalizacion_espacios(self):
        """Con normalización, espacios extras se colapsan."""
        assert hash_text_md5("Hello  World", normalize=True) == \
               hash_text_md5("hello world", normalize=True)

    def test_normalizacion_case(self):
        """Con normalización, case se ignora."""
        assert hash_text_md5("HELLO", normalize=True) == \
               hash_text_md5("hello", normalize=True)

    def test_sin_normalizacion_case_sensitive(self):
        """Sin normalización, case importa."""
        assert hash_text_md5("Hello", normalize=False) != \
               hash_text_md5("hello", normalize=False)

    def test_texto_vacio(self):
        """Texto vacío no causa error."""
        result = hash_text_md5("")
        assert isinstance(result, str)
        assert len(result) == 32  # MD5 hex = 32 chars

    def test_texto_none(self):
        """None se trata como string vacío."""
        result = hash_text_md5(None)
        assert isinstance(result, str)
        assert len(result) == 32


class TestHashTextSHA256:
    """Tests para hash_text_sha256."""

    def test_determinista(self):
        assert hash_text_sha256("hello") == hash_text_sha256("hello")

    def test_longitud_correcta(self):
        """SHA256 hex = 64 chars."""
        result = hash_text_sha256("test")
        assert len(result) == 64

    def test_strip_sin_normalizacion(self):
        """Sin normalización, solo se hace strip."""
        assert hash_text_sha256("  hello  ", normalize=False) == \
               hash_text_sha256("hello", normalize=False)

    def test_con_normalizacion_lowercase(self):
        """Con normalización, se aplica lowercase + strip."""
        assert hash_text_sha256("HELLO", normalize=True) == \
               hash_text_sha256("hello", normalize=True)


class TestHashContentForDedup:
    """Tests para hash_content_for_dedup (wrapper MD5 normalizado)."""

    def test_contenido_equivalente_mismo_hash(self):
        """Textos semánticamente equivalentes producen el mismo hash."""
        assert hash_content_for_dedup("Hello  World ") == \
               hash_content_for_dedup("hello world")

    def test_diferentes_produce_diferente_hash(self):
        """Textos diferentes producen hashes diferentes."""
        assert hash_content_for_dedup("machine learning") != \
               hash_content_for_dedup("deep learning")


class TestHashForCacheKey:
    """Tests para hash_for_cache_key (wrapper SHA256 sin normalización)."""

    def test_case_sensitive(self):
        """Cache keys son case-sensitive."""
        assert hash_for_cache_key("Hello") != hash_for_cache_key("hello")

    def test_strip_aplicado(self):
        """Solo strip (no lowercase) se aplica."""
        assert hash_for_cache_key("  hello  ") == hash_for_cache_key("hello")

    def test_texto_vacio(self):
        result = hash_for_cache_key("")
        assert isinstance(result, str)
        assert len(result) == 64
