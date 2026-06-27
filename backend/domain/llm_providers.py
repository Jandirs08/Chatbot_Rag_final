from enum import Enum
from langchain_community.chat_models.vertexai import ChatVertexAI
from langchain_openai.chat_models.base import ChatOpenAI
from langchain_community.llms.llamacpp import LlamaCpp


class ModelTypes(str, Enum):
    OPENAI = "OPENAI"
    VERTEX = "VERTEX"
    LLAMA_CPP = "LLAMA-CPP"


MODEL_TO_CLASS = {
    "OPENAI": ChatOpenAI,
    "VERTEX": ChatVertexAI,
    "LLAMA-CPP": LlamaCpp
}
