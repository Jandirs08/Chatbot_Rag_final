"""Utilidades de hashing centralizadas para evitar duplicación de código."""
import hashlib


def hash_text_md5(text: str, normalize: bool = True) -> str:
    """Genera hash MD5 de un texto.
    
    Args:
        text: Texto a hashear
        normalize: Si True, normaliza el texto (lowercase, strip, colapsa espacios)
    
    Returns:
        Hash MD5 hexadecimal
    """
    if normalize:
        normalized = " ".join((text or "").lower().strip().split())
    else:
        normalized = text or ""
    return hashlib.md5(normalized.encode("utf-8")).hexdigest()


def hash_text_sha256(text: str, normalize: bool = False) -> str:
    """Genera hash SHA256 de un texto.
    
    Args:
        text: Texto a hashear
        normalize: Si True, normaliza el texto (lowercase, strip)
    
    Returns:
        Hash SHA256 hexadecimal
    """
    if normalize:
        normalized = (text or "").strip().lower()
    else:
        normalized = (text or "").strip()
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()


def hash_content_for_dedup(text: str) -> str:
    """Hash específico para deduplicación de contenido.
    
    Usa MD5 con normalización completa (lowercase, strip, colapsa espacios).
    Optimizado para comparar contenido semánticamente equivalente.
    
    Args:
        text: Contenido a hashear
    
    Returns:
        Hash MD5 hexadecimal
    """
    return hash_text_md5(text, normalize=True)


def hash_for_cache_key(text: str) -> str:
    """Hash específico para claves de caché.
    
    Usa SHA256 con normalización mínima (solo strip).
    Más seguro que MD5 para evitar colisiones en cache keys.
    
    Args:
        text: Texto a hashear para cache key
    
    Returns:
        Hash SHA256 hexadecimal
    """
    return hash_text_sha256(text, normalize=False)
