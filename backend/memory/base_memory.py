from abc import ABC, abstractmethod
from typing import Optional, Dict, Any, List
from datetime import datetime, timezone
import logging
import re

 


class AbstractChatbotMemory(ABC):
    """Clase base abstracta para la memoria del chatbot"""
    def __init__(
        self,
        window_size: int = 5,
        settings = None,
        session_id: str = "default_session",
        k: Optional[int] = None,
        **kwargs
    ):
        self.window_size = window_size
        self.settings = settings
        self.session_id = session_id
        self.k_history = k if k is not None else window_size
        self.logger = logging.getLogger(self.__class__.__name__)

    @abstractmethod
    async def add_message(self, session_id: str, role: str, content: str) -> None:
        """Añade un mensaje de forma asíncrona"""
        pass

    @abstractmethod
    async def get_history(self, session_id: str) -> List[Dict[str, Any]]:
        """Recupera el historial de forma asíncrona"""
        pass

    @abstractmethod
    async def clear_history(self, session_id: str) -> None:
        """Limpia el historial de forma asíncrona"""
        pass

# Define BaseChatbotMemory as a concrete implementation
class BaseChatbotMemory(AbstractChatbotMemory):
    def __init__(
        self,
        window_size: int = 5,
        settings = None,
        session_id: str = "default_session",
        k: Optional[int] = None,
        **kwargs
    ):
        super().__init__(
            window_size=window_size,
            settings=settings,
            session_id=session_id,
            k=k,
            **kwargs
        )
        # Perfil mínimo por sesión: nombre, edad, gustos, metas
        self._profiles: Dict[str, Dict[str, str]] = {}
        # Historial por sesión (últimos k mensajes)
        self._message_history: Dict[str, List[Dict[str, Any]]] = {}

    def _extract_profile(self, content: str) -> Dict[str, str]:
        """Extrae un perfil mínimo del usuario desde su texto.

        Campos soportados: nombre, edad, gustos, metas.
        La extracción es simple y conservadora para evitar textos largos.
        """
        text = content.strip()
        lower = text.lower()

        profile: Dict[str, str] = {}

        # nombre
        m = re.search(r"(?:me llamo|mi nombre es|soy)\s+([a-záéíóúñ\s]{2,50})", lower)
        if m:
            name = m.group(1).strip()
            # Capitalizar simple por palabras
            profile["nombre"] = " ".join(w.capitalize() for w in name.split())[:50]

        # edad (número seguido de 'años')
        m = re.search(r"(?:tengo|mi edad es)\s+(\d{1,3})\s+(?:años|año)", lower)
        if m:
            profile["edad"] = m.group(1)

        # gustos: capturar una frase corta después de indicaciones comunes
        m = re.search(r"(?:me gusta(?:n)?|disfruto de|me interesa(?:n)?)\s+([a-záéíóúñ\s,]{2,100})", lower)
        if m:
            likes = m.group(1).strip()
            # Limitar longitud y número de elementos
            items = [i.strip() for i in likes.split(",") if i.strip()]
            profile["gustos"] = ", ".join(items[:3])[:100]

        # metas/objetivos: frases cortas después de patrones comunes
        m = re.search(r"(?:mi meta|mis metas|quiero|me gustaría|objetivo)\s+(?:es|es\s+)|(?:quiero|me gustaría)\s+([a-záéíóúñ\s,]{2,120})", lower)
        if not m:
            # alternativa genérica: buscar 'quiero ...'
            m = re.search(r"quiero\s+([a-záéíóúñ\s,]{2,120})", lower)
        if m:
            goals = m.group(1).strip()
            profile["metas"] = goals[:120]

        return profile

    # Eliminado: lógica de temas/resúmenes/contexto extenso.

    # Eliminado: actualización de contexto de sesión complejo.

    async def add_message(self, session_id: str, role: str, content: str) -> None:
        """Añade un mensaje y actualiza el perfil mínimo si es del usuario."""
        self.logger.debug(f"Mensaje añadido a la sesión {session_id}: {role}: {content[:50]}...")
        
        # Inicializar lista de historial para la sesión si no existe
        if session_id not in self._message_history:
            self._message_history[session_id] = []

        # Añadir mensaje al historial de la sesión
        self._message_history[session_id].append({
            "role": role,
            "content": content,
            "session_id": session_id,
            "timestamp": datetime.now(timezone.utc).isoformat()
        })

        # Mantener solo los últimos k mensajes para la sesión actual
        if len(self._message_history[session_id]) > self.k_history:
            self._message_history[session_id] = self._message_history[session_id][-self.k_history:]
        
        # Actualizar perfil mínimo solo para mensajes del usuario
        if role == "human":
            extracted = self._extract_profile(content)
            if extracted:
                current = self._profiles.get(session_id, {})
                current.update(extracted)
                # Asegurar que solo las claves permitidas existan
                allowed = {k: v for k, v in current.items() if k in {"nombre", "edad", "gustos", "metas"}}
                self._profiles[session_id] = allowed
    
    async def get_history(self, session_id: str) -> List[Dict[str, Any]]:
        """Obtiene el historial y, si existe, antepone el perfil del usuario."""
        self.logger.debug(f"Obteniendo historial para la sesión {session_id}")
        
        # Obtener copia del historial de la sesión actual
        session_messages = list(self._message_history.get(session_id, []))
        
        # Anteponer un único mensaje "system" con el perfil, si existe
        profile = self._profiles.get(session_id, {})
        if profile:
            # Construir una cadena resumida y breve
            lines = ["Perfil del usuario:"]
            for key in ("nombre", "edad", "gustos", "metas"):
                if key in profile and profile[key]:
                    lines.append(f"- {key}: {profile[key]}")
            context_message = {
                "role": "system",
                "content": "\n".join(lines),
                "session_id": session_id
            }
            session_messages.insert(0, context_message)
        
        return session_messages
    
    async def clear_history(self, session_id: str) -> None:
        """Limpia el historial y el perfil de una sesión específica."""
        if session_id in self._message_history:
            del self._message_history[session_id]
        if session_id in self._profiles:
            del self._profiles[session_id]
