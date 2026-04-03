"""
Tests para la extracción de perfil de usuario por regex.

Cubre BaseChatbotMemory._extract_profile:
- Extracción de nombre, edad, gustos, metas, trabajo
- Edge cases y textos sin datos
- Documentación de comportamiento actual (detectar regresiones)

NOTA: _extract_profile es un método de instancia pero su lógica es pura (no usa I/O).
Lo instanciamos con un mock del db_client para evitar conexión a MongoDB.
"""
import pytest
from unittest.mock import patch, MagicMock


def _get_extractor():
    """Crea una instancia de BaseChatbotMemory con MongoDB mockeado."""
    with patch("memory.base_memory.get_mongodb_client") as mock_get_client:
        mock_client = MagicMock()
        mock_client.db = {"chat_profiles": MagicMock()}
        mock_get_client.return_value = mock_client

        from memory.base_memory import BaseChatbotMemory
        return BaseChatbotMemory(
            window_size=5,
            settings=None,
            session_id="test_session",
        )


class TestExtractProfile:
    """Tests para _extract_profile regex."""

    def test_extrae_nombre_me_llamo(self):
        mem = _get_extractor()
        profile = mem._extract_profile("Me llamo Juan Pérez")
        assert "nombre" in profile
        assert profile["nombre"] == "Juan Pérez"

    def test_extrae_nombre_mi_nombre_es(self):
        mem = _get_extractor()
        profile = mem._extract_profile("Mi nombre es María García")
        assert "nombre" in profile
        assert profile["nombre"] == "María García"

    def test_extrae_nombre_soy(self):
        mem = _get_extractor()
        profile = mem._extract_profile("Soy Carlos")
        assert "nombre" in profile
        assert profile["nombre"] == "Carlos"

    def test_extrae_edad(self):
        mem = _get_extractor()
        profile = mem._extract_profile("Tengo 25 años")
        assert "edad" in profile
        assert profile["edad"] == "25"

    def test_extrae_gustos(self):
        mem = _get_extractor()
        profile = mem._extract_profile("Me gusta la programación, la lectura")
        assert "gustos" in profile
        assert "programación" in profile["gustos"]
        assert "lectura" in profile["gustos"]

    def test_extrae_metas(self):
        mem = _get_extractor()
        profile = mem._extract_profile("Mi meta es aprender inteligencia artificial")
        assert "metas" in profile
        assert "inteligencia artificial" in profile["metas"]

    def test_extrae_trabajo(self):
        mem = _get_extractor()
        profile = mem._extract_profile("Trabajo en Acme Corp")
        assert "trabajo" in profile
        # Nota: capitalize() se aplica a cada palabra
        assert "Acme" in profile["trabajo"]

    def test_texto_sin_datos(self):
        """Texto sin información de perfil → diccionario vacío."""
        mem = _get_extractor()
        profile = mem._extract_profile("¿Cómo puedo matricularme?")
        assert profile == {}

    def test_texto_vacio(self):
        mem = _get_extractor()
        profile = mem._extract_profile("")
        assert profile == {}

    def test_extraccion_multiple_campos(self):
        """Texto con múltiples datos extrae todos los campos."""
        mem = _get_extractor()
        text = "Me llamo Ana, tengo 30 años, me gusta leer"
        profile = mem._extract_profile(text)
        assert "nombre" in profile
        # La edad debería extraerse si el regex la detecta
        assert "edad" in profile
        assert profile["edad"] == "30"

    def test_nombre_con_acento(self):
        """Nombres con acentos se manejan correctamente."""
        mem = _get_extractor()
        profile = mem._extract_profile("Me llamo José Ángel")
        assert "nombre" in profile
        assert "José" in profile["nombre"]

    def test_capitaliza_nombre(self):
        """El nombre se capitaliza aunque venga en minúsculas."""
        mem = _get_extractor()
        profile = mem._extract_profile("me llamo pedro luis")
        assert "nombre" in profile
        assert profile["nombre"] == "Pedro Luis"

    def test_trabajo_capitalizado(self):
        """El nombre del trabajo se capitaliza."""
        mem = _get_extractor()
        profile = mem._extract_profile("trabajo en empresa grande")
        assert "trabajo" in profile
        assert profile["trabajo"] == "Empresa Grande"

    def test_gustos_limitados_a_tres(self):
        """Se capturan máximo 3 gustos."""
        mem = _get_extractor()
        profile = mem._extract_profile("Me gustan programación, lectura, música, arte, deportes")
        if "gustos" in profile:
            items = [g.strip() for g in profile["gustos"].split(",")]
            assert len(items) <= 3
