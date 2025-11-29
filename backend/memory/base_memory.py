from abc import ABC, abstractmethod
from typing import Optional, Dict, Any, List
import logging
import re
from database.mongodb import get_mongodb_client


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
    """Memoria basada en MongoDB con perfil de usuario."""

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
        self.db_client = get_mongodb_client()
        self.profiles_col = self.db_client.db["chat_profiles"]

    # ----------------------------
    # PERFIL
    # ----------------------------
    def _extract_profile(self, content: str) -> Dict[str, str]:
        text = content.strip().lower()
        profile: Dict[str, str] = {}

        m = re.search(r"(?:me llamo|mi nombre es|soy)\s+([a-záéíóúñ\s]{2,50}?)(?=\s+(?:y|tengo|mi\s+edad|me\s+gusta|objetivo|quiero|\d)|[,.]|$)", text)
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

        m = re.search(
            r"(?:trabajo\s+en|laboro\s+en|trabajo\s+para|trabajo\s+con|estoy\s+en)\s+([a-záéíóúñ\s\-]{2,80})",
            text
        )
        if m:
            org = m.group(1).strip()
            profile["trabajo"] = " ".join(w.capitalize() for w in org.split())[:80]

        return profile

    async def add_message(self, session_id: str, role: str, content: str) -> None:
        if role == "human":
            extracted = self._extract_profile(content)
            if extracted:
                await self.profiles_col.update_one(
                    {"session_id": session_id},
                    {"$set": extracted, "$setOnInsert": {"session_id": session_id}},
                    upsert=True,
                )

    async def get_history(self, session_id: str) -> List[Dict[str, Any]]:
        messages: List[Dict[str, Any]] = []
        profile_doc = await self.profiles_col.find_one({"session_id": session_id})
        cursor = self.db_client.messages.find(
            {"conversation_id": session_id},
            {"role": 1, "content": 1, "_id": 0},
        ).sort("timestamp", -1).limit(self.window_size)
        fetched = await cursor.to_list(length=self.window_size)
        messages.extend(list(reversed(fetched)))
        if profile_doc:
            lines = ["Perfil del usuario:"]
            for key in ("nombre", "edad", "gustos", "metas", "trabajo"):
                val = profile_doc.get(key)
                if val:
                    lines.append(f"- {key}: {val}")
            messages.insert(0, {
                "role": "system",
                "content": "\n".join(lines),
                "session_id": session_id,
            })
        return messages

    async def clear_history(self, session_id: str) -> None:
        await self.db_client.messages.delete_many({"conversation_id": session_id})
        await self.profiles_col.delete_one({"session_id": session_id})
