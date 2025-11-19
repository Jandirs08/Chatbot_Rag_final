from abc import ABC, abstractmethod
from typing import Optional, Dict, Any, List
from datetime import datetime, timezone
import logging
import re
import asyncio


class AbstractChatbotMemory(ABC):
    """Clase base abstracta para la memoria del chatbot"""
    def __init__(
        self,
        window_size: int = 5,
        settings=None,
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
        pass

    @abstractmethod
    async def get_history(self, session_id: str) -> List[Dict[str, Any]]:
        pass

    @abstractmethod
    async def clear_history(self, session_id: str) -> None:
        pass


class BaseChatbotMemory(AbstractChatbotMemory):
    """
    Memoria mínima en RAM:
    - Últimos K mensajes
    - Perfil simple del usuario
    - Protegida con lock (evita race conditions)
    """

    def __init__(
        self,
        window_size: int = 5,
        settings=None,
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

        # Perfil mínimo por sesión
        self._profiles: Dict[str, Dict[str, str]] = {}

        # Historial mínimo (últimos K mensajes)
        self._message_history: Dict[str, List[Dict[str, Any]]] = {}

        # 🔒 Lock anticonsistencia (evita corrupción de memoria)
        self._lock = asyncio.Lock()

    # ----------------------------------------------------------------------
    # EXTRACCIÓN DE PERFIL (regex corregido)
    # ----------------------------------------------------------------------
    def _extract_profile(self, content: str) -> Dict[str, str]:
        text = content.strip().lower()
        profile: Dict[str, str] = {}

        # nombre
        m = re.search(r"(?:me llamo|mi nombre es|soy)\s+([a-záéíóúñ\s]{2,50})", text)
        if m:
            name = m.group(1).strip()
            profile["nombre"] = " ".join(w.capitalize() for w in name.split())[:50]

        # edad
        m = re.search(r"(?:tengo|mi edad es)\s+(\d{1,3})\s+(?:años|año)", text)
        if m:
            profile["edad"] = m.group(1)

        # gustos
        m = re.search(
            r"(?:me gusta(?:n)?|disfruto de|me interesa(?:n)?)\s+([a-záéíóúñ\s,]{2,100})",
            text
        )
        if m:
            likes = m.group(1).strip()
            items = [i.strip() for i in likes.split(",") if i.strip()]
            profile["gustos"] = ", ".join(items[:3])[:100]

        # metas — FIX del regex
        m = re.search(
            r"(?:mi meta|mis metas|quiero|me gustaría|objetivo)\s+(?:es\s+)?([a-záéíóúñ\s,]{2,120})",
            text
        )
        if m:
            profile["metas"] = m.group(1).strip()[:120]

        return profile

    # ----------------------------------------------------------------------
    # AÑADIR MENSAJE (CON LOCK)
    # ----------------------------------------------------------------------
    async def add_message(self, session_id: str, role: str, content: str) -> None:
        async with self._lock:  # 🔒 protege escritura
            self.logger.debug(f"Mensaje añadido a {session_id}: {role}: {content[:50]}...")

            # Crear sesión si no existe
            if session_id not in self._message_history:
                self._message_history[session_id] = []

            # Guardar mensaje
            self._message_history[session_id].append({
                "role": role,
                "content": content,
                "session_id": session_id,
                "timestamp": datetime.now(timezone.utc).isoformat()
            })

            # Limitar a últimos K
            if len(self._message_history[session_id]) > self.k_history:
                self._message_history[session_id] = self._message_history[session_id][-self.k_history:]

            # Actualizar perfil si es mensaje humano
            if role == "human":
                extracted = self._extract_profile(content)
                if extracted:
                    current = self._profiles.get(session_id, {})
                    current.update(extracted)
                    allowed = {k: v for k, v in current.items() if k in {"nombre", "edad", "gustos", "metas"}}
                    self._profiles[session_id] = allowed

    # ----------------------------------------------------------------------
    # OBTENER HISTORIAL (CON PERFIL)
    # ----------------------------------------------------------------------
    async def get_history(self, session_id: str) -> List[Dict[str, Any]]:
        async with self._lock:  # 🔒 protege lectura consistente
            session_messages = list(self._message_history.get(session_id, []))

            profile = self._profiles.get(session_id, {})
            if profile:
                lines = ["Perfil del usuario:"]
                for key in ("nombre", "edad", "gustos", "metas"):
                    if key in profile and profile[key]:
                        lines.append(f"- {key}: {profile[key]}")

                session_messages.insert(0, {
                    "role": "system",
                    "content": "\n".join(lines),
                    "session_id": session_id
                })

            return session_messages

    # ----------------------------------------------------------------------
    # LIMPIAR HISTORIAL
    # ----------------------------------------------------------------------
    async def clear_history(self, session_id: str) -> None:
        async with self._lock:
            if session_id in self._message_history:
                del self._message_history[session_id]
            if session_id in self._profiles:
                del self._profiles[session_id]
