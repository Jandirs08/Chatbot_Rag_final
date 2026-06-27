from pydantic import BaseModel, Field, validator
from typing import Optional, List, Dict
from domain.constants import USER_ROLE, ASSISTANT_ROLE

# CONVENCIÃ“N DE IDENTIFICADORES DE CONVERSACIÃ“N:
#
# - `conversation_id`: Es el identificador principal para una secuencia de diÃ¡logo
#   entre un usuario y el bot. Se utiliza a lo largo de la aplicaciÃ³n (API,
#   ChatManager, almacenamiento en base de datos) para agrupar y rastrear
#   interacciones. Generalmente, es un UUID generado por la aplicaciÃ³n.
#
# - `session_id`: Este tÃ©rmino es comÃºnmente utilizado por componentes especÃ­ficos
#   de Langchain, especialmente sus clases de gestiÃ³n de memoria (ej.
#   `MongoDBChatMessageHistory`). Para mantener la coherencia y vincular
#   directamente el historial de Langchain con la lÃ³gica de la aplicaciÃ³n,
#   CUANDO UN COMPONENTE LANGCHAIN REQUIERA UN `session_id`, SE DEBERÃ UTILIZAR
#   EL VALOR DEL `conversation_id` DE LA APLICACIÃ“N.
#
# Esto asegura que un Ãºnico `conversation_id` representa de forma Ãºnica una
# conversaciÃ³n completa a travÃ©s de todas las capas del sistema.

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
