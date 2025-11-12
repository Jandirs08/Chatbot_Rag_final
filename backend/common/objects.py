from pydantic import BaseModel, Field, validator
from typing import Optional, List, Dict
from .constants import USER_ROLE, ASSISTANT_ROLE

# CONVENCIÓN DE IDENTIFICADORES DE CONVERSACIÓN:
#
# - `conversation_id`: Es el identificador principal para una secuencia de diálogo
#   entre un usuario y el bot. Se utiliza a lo largo de la aplicación (API,
#   ChatManager, almacenamiento en base de datos) para agrupar y rastrear
#   interacciones. Generalmente, es un UUID generado por la aplicación.
#
# - `session_id`: Este término es comúnmente utilizado por componentes específicos
#   de Langchain, especialmente sus clases de gestión de memoria (ej.
#   `MongoDBChatMessageHistory`). Para mantener la coherencia y vincular
#   directamente el historial de Langchain con la lógica de la aplicación,
#   CUANDO UN COMPONENTE LANGCHAIN REQUIERA UN `session_id`, SE DEBERÁ UTILIZAR
#   EL VALOR DEL `conversation_id` DE LA APLICACIÓN.
#
# Esto asegura que un único `conversation_id` representa de forma única una
# conversación completa a través de todas las capas del sistema.

class Message(BaseModel):
    message: str = Field(description="User message")
    role: str = Field(description="Message role in conversation")

    @validator("role")
    def validate_role(cls, v):
        if v not in [USER_ROLE, ASSISTANT_ROLE]:
            # Si el rol es "human" o "ai", lo convertimos al rol correcto
            if v == "human":
                return USER_ROLE
            elif v == "ai":
                return ASSISTANT_ROLE
            raise ValueError(f"Role must be one of: {USER_ROLE}, {ASSISTANT_ROLE}")
        return v
    


# class ChatRequest(BaseModel): # Eliminado: Redundante con api/schemas.py
#     input: str = Field(..., description="User message")
#     conversation_id: Optional[str] = Field(default="default", description="Conversation ID")
