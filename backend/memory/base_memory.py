from abc import ABC, abstractmethod
from typing import Optional, Dict, Any, List, Protocol, Union
from datetime import datetime, timezone
import logging
import re

class MessageStore(Protocol):
    """Protocolo para almacenamiento de mensajes"""
    def store(self, session_id: str, message: Dict[str, Any]) -> None: ...
    def retrieve(self, session_id: str, limit: Optional[int] = None) -> List[Dict[str, Any]]: ...
    def clear(self, session_id: str) -> None: ...

class ContextManager(Protocol):
    """Protocolo para gestión de contexto"""
    def update(self, session_id: str, data: Dict[str, Any]) -> None: ...
    def get(self, session_id: str) -> Dict[str, Any]: ...


class AbstractChatbotMemory(ABC):
    """Clase base abstracta para la memoria del chatbot"""
    def __init__(
        self,
        message_store: Optional[Any] = None,
        context_manager: Optional[Any] = None,
        window_size: int = 5,
        settings = None,
        session_id: str = "default_session",
        k: Optional[int] = None,
        **kwargs
    ):
        self.message_store = message_store
        self.context_manager = context_manager
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
    async def get_history(self, session_id: str) -> str:
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
        message_store: Optional[Any] = None,
        context_manager: Optional[Any] = None,
        window_size: int = 5,
        settings = None,
        session_id: str = "default_session",
        k: Optional[int] = None,
        **kwargs
    ):
        super().__init__(
            message_store=message_store,
            context_manager=context_manager,
            window_size=window_size,
            settings=settings,
            session_id=session_id,
            k=k,
            **kwargs
        )
        self._session_context = {}  # Diccionario para mantener el contexto de la sesión
        self._message_history = []  # Lista para mantener el historial de mensajes en memoria

    def _extract_user_info(self, content: str) -> Dict[str, str]:
        """Extrae información del usuario del mensaje usando expresiones regulares."""
        user_info = {}
        
        # Patrones para extraer información
        patterns = {
            'name': r'(?:me llamo|mi nombre es|soy)\s+([A-Za-zÁáÉéÍíÓóÚúÑñ\s]+)',
            'age': r'(?:tengo|mi edad es|soy de)\s+(\d+)\s+(?:años|año)',
            'city': r'(?:vivo en|soy de|estoy en)\s+([A-Za-zÁáÉéÍíÓóÚúÑñ\s]+)',
            'profession': r'(?:soy|trabajo como|mi profesión es)\s+([A-Za-zÁáÉéÍíÓóÚúÑñ\s]+)',
            'likes': r'(?:me gusta|disfruto de|me interesa)\s+([A-Za-zÁáÉéÍíÓóÚúÑñ\s,]+)',
            'preferences': r'(?:prefiero|me gusta más|me interesa más)\s+([A-Za-zÁáÉéÍíÓóÚúÑñ\s,]+)'
        }
        
        # Buscar cada patrón en el contenido
        for key, pattern in patterns.items():
            match = re.search(pattern, content.lower())
            if match:
                user_info[key] = match.group(1).strip()
        
        return user_info

    def _extract_topics(self, content: str) -> List[str]:
        """Extrae temas de conversación del mensaje."""
        topics = []
        
        # Palabras clave que indican temas
        topic_keywords = {
            'trabajo': ['trabajo', 'empleo', 'profesión', 'carrera'],
            'estudios': ['estudio', 'universidad', 'escuela', 'carrera'],
            'familia': ['familia', 'padres', 'hermanos', 'hijos'],
            'hobbies': ['hobby', 'pasatiempo', 'interés', 'gusto'],
            'viajes': ['viaje', 'viajar', 'turismo', 'destino'],
            'tecnología': ['tecnología', 'computadora', 'software', 'hardware'],
            'deportes': ['deporte', 'ejercicio', 'fútbol', 'baloncesto'],
            'música': ['música', 'canción', 'artista', 'banda'],
            'películas': ['película', 'cine', 'serie', 'actor']
        }
        
        content_lower = content.lower()
        for topic, keywords in topic_keywords.items():
            if any(keyword in content_lower for keyword in keywords):
                topics.append(topic)
        
        return topics

    def _update_session_context(self, session_id: str, content: str) -> None:
        """Actualiza el contexto de la sesión con nueva información."""
        if session_id not in self._session_context:
            self._session_context[session_id] = {
                'user_info': {},
                'conversation_topics': set(),
                'last_message': content,
                'conversation_summary': []
            }
        
        # Extraer y actualizar información del usuario
        user_info = self._extract_user_info(content)
        if user_info:
            self._session_context[session_id]['user_info'].update(user_info)
            # Añadir al resumen de la conversación
            for key, value in user_info.items():
                summary = f"El usuario mencionó que {key}: {value}"
                self._session_context[session_id]['conversation_summary'].append(summary)
        
        # Extraer y actualizar temas de conversación
        topics = self._extract_topics(content)
        if topics:
            self._session_context[session_id]['conversation_topics'].update(topics)
            # Añadir al resumen de la conversación
            for topic in topics:
                if topic not in self._session_context[session_id]['conversation_summary']:
                    summary = f"Se discutió sobre {topic}"
                    self._session_context[session_id]['conversation_summary'].append(summary)
        
        # Actualizar último mensaje
        self._session_context[session_id]['last_message'] = content

    async def add_message(self, session_id: str, role: str, content: str) -> None:
        """Implementación para añadir un mensaje y mantener el contexto"""
        self.logger.debug(f"Mensaje añadido a la sesión {session_id}: {role}: {content[:50]}...")
        
        # Añadir mensaje al historial
        self._message_history.append({
            "role": role,
            "content": content,
            "session_id": session_id,
            "timestamp": datetime.now(timezone.utc).isoformat()
        })
        
        # Mantener solo los últimos k mensajes
        if len(self._message_history) > self.k_history:
            self._message_history = self._message_history[-self.k_history:]
        
        # Extraer y actualizar el contexto solo para mensajes del usuario
        if role == "human":
            self._update_session_context(session_id, content)
    
    async def get_history(self, session_id: str) -> List[Dict[str, Any]]:
        """Implementación para obtener el historial con contexto"""
        self.logger.debug(f"Obteniendo historial para la sesión {session_id}")
        
        # Filtrar mensajes por session_id
        session_messages = [msg for msg in self._message_history if msg["session_id"] == session_id]
        
        # Añadir el contexto actual al historial
        if session_id in self._session_context:
            context = self._session_context[session_id]
            context_str = "Contexto actual:\n"
            
            # Añadir información del usuario
            if context["user_info"]:
                context_str += "Información del usuario:\n"
                for key, value in context["user_info"].items():
                    context_str += f"- {key}: {value}\n"
            
            # Añadir temas de conversación
            if context["conversation_topics"]:
                context_str += "\nTemas de conversación:\n"
                for topic in context["conversation_topics"]:
                    context_str += f"- {topic}\n"
            
            # Añadir resumen de la conversación
            if context["conversation_summary"]:
                context_str += "\nResumen de la conversación:\n"
                for summary in context["conversation_summary"][-5:]:  # Últimos 5 puntos del resumen
                    context_str += f"- {summary}\n"
            
            context_message = {
                "role": "system",
                "content": context_str,
                "session_id": session_id
            }
            session_messages.insert(0, context_message)
        
        return session_messages
    
    async def clear_history(self, session_id: str) -> None:
        """Limpia el historial y el contexto de una sesión específica"""
        self._message_history = [msg for msg in self._message_history if msg["session_id"] != session_id]
        if session_id in self._session_context:
            del self._session_context[session_id]
