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
    - Lock por sesión (alta concurrencia)
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

        self._profiles: Dict[str, Dict[str, str]] = {}
        self._message_history: Dict[str, List[Dict[str, Any]]] = {}

        # Lock POR sesión, no global
        self._locks: Dict[str, asyncio.Lock] = {}

    # ----------------------------
    # LOCK POR SESIÓN
    # ----------------------------
    def _get_lock(self, session_id: str) -> asyncio.Lock:
        """Devuelve un lock específico por sesión (crea si no existe)."""
        if session_id not in self._locks:
            self._locks[session_id] = asyncio.Lock()
        return self._locks[session_id]

    # ----------------------------
    # PERFIL
    # ----------------------------
    def _extract_profile(self, content: str) -> Dict[str, str]:
        text = content.strip().lower()
        profile: Dict[str, str] = {}

        m = re.search(r"(?:me llamo|mi nombre es|soy)\s+([a-záéíóúñ\s]{2,50})", text)
        if m:
            name = m.group(1).strip()
            profile["nombre"] = " ".join(w.capitalize() for w in name.split())[:50]

        m = re.search(r"(?:tengo|mi edad es)\s+(\d{1,3})\s+(?:años|año)", text)
        if m:
            profile["edad"] = m.group(1)

        m = re.search(
            r"(?:me gusta(?:n)?|disfruto de|me interesa(?:n)?)\s+([a-záéíóúñ\s,]{2,100})",
            text
        )
        if m:
            items = [i.strip() for i in m.group(1).split(",") if i.strip()]
            profile["gustos"] = ", ".join(items[:3])[:100]

        m = re.search(
            r"(?:mi meta|mis metas|quiero|me gustaría|objetivo)\s+(?:es\s+)?([a-záéíóúñ\s,]{2,120})",
            text
        )
        if m:
            profile["metas"] = m.group(1).strip()[:120]

        return profile

    # ----------------------------
    # AÑADIR MENSAJE
    # ----------------------------
    async def add_message(self, session_id: str, role: str, content: str) -> None:
        async with self._get_lock(session_id):
            if session_id not in self._message_history:
                self._message_history[session_id] = []

            self._message_history[session_id].append({
                "role": role,
                "content": content,
                "session_id": session_id,
                "timestamp": datetime.now(timezone.utc).isoformat()
            })

            if len(self._message_history[session_id]) > self.k_history:
                self._message_history[session_id] = self._message_history[session_id][-self.k_history:]

            if role == "human":
                extracted = self._extract_profile(content)
                if extracted:
                    current = self._profiles.get(session_id, {})
                    current.update(extracted)
                    self._profiles[session_id] = {
                        k: v for k, v in current.items()
                        if k in {"nombre", "edad", "gustos", "metas"}
                    }

    # ----------------------------
    # OBTENER HISTORIAL
    # ----------------------------
    async def get_history(self, session_id: str) -> List[Dict[str, Any]]:
        async with self._get_lock(session_id):
            history = list(self._message_history.get(session_id, []))

            profile = self._profiles.get(session_id, {})
            if profile:
                lines = ["Perfil del usuario:"]
                for key in ("nombre", "edad", "gustos", "metas"):
                    if key in profile:
                        lines.append(f"- {key}: {profile[key]}")

                history.insert(0, {
                    "role": "system",
                    "content": "\n".join(lines),
                    "session_id": session_id
                })

            return history

    # ----------------------------
    # LIMPIAR HISTORIAL
    # ----------------------------
    async def clear_history(self, session_id: str) -> None:
        async with self._get_lock(session_id):
            self._message_history.pop(session_id, None)
            self._profiles.pop(session_id, None)
