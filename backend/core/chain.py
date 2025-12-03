from typing import Optional
import logging

from langchain_core.prompts import PromptTemplate
from langchain_core.runnables import Runnable

from models import ModelTypes, MODEL_TO_CLASS
from config import Settings, settings as app_settings
from . import prompt as prompt_module


class ChainManager:
    """
    Maneja únicamente:
    prompt → modelo
    No agentes, no herramientas.
    """

    def __init__(
        self,
        settings: Optional[Settings] = None,
        model_type: Optional[ModelTypes] = None,
    ):
        self.settings = settings if settings is not None else app_settings
        self.logger = logging.getLogger(self.__class__.__name__)

        # Prompt variables
        bot_name = getattr(self.settings, 'bot_name', None) or prompt_module.BOT_NAME

        base_personality = prompt_module.BOT_PERSONALITY.format(
            nombre=bot_name
        )

        ui_extra = getattr(self.settings, "ui_prompt_extra", None)
        if ui_extra:
            personality_final = f"{base_personality}\n\nInstrucciones adicionales:\n{ui_extra}"
        else:
            personality_final = base_personality

        self.prompt_vars = {
            "nombre": bot_name,
            "bot_personality": personality_final
        }

        # Modelo
        model_kwargs = self._build_model_kwargs(model_type)
        self.model_kwargs = dict(model_kwargs)
        self._model = self._get_model(
            model_type=model_type,
            parameters=model_kwargs
        )

        # Prompt
        prompt_str = getattr(prompt_module, self.settings.main_prompt_name)
        self.prompt_template_str = str(prompt_str)
        self._prompt = PromptTemplate.from_template(prompt_str)
        self._prompt = self._prompt.partial(**self.prompt_vars)

        # LCEL chain
        self.chain: Runnable = (self._prompt | self._model)

    def override_chain(self, runnable: Runnable):
        """Permite al Bot reemplazar la chain por un pipeline LCEL completo."""
        self.chain = runnable

    def _build_model_kwargs(self, model_type):
        if not model_type:
            try:
                model_type = ModelTypes[self.settings.model_type.upper()]
            except Exception:
                model_type = ModelTypes.OPENAI

        if model_type == ModelTypes.OPENAI:
            return {
                "temperature": self.settings.temperature,
                "model_name": self.settings.base_model_name,
                "max_tokens": self.settings.max_tokens,
            }

        if model_type == ModelTypes.VERTEX:
            return {
                "model_name": self.settings.base_model_name,
                "temperature": self.settings.temperature,
                "max_output_tokens": self.settings.max_tokens,
                "top_p": getattr(self.settings, "vertex_top_p", 0.8),
                "top_k": getattr(self.settings, "vertex_top_k", 40),
            }

        # fallback
        return {
            "temperature": self.settings.temperature,
            "max_tokens": self.settings.max_tokens,
        }

    def _get_model(self, model_type, parameters):
        if not model_type:
            model_type = ModelTypes[self.settings.model_type.upper()]

        model_cls = MODEL_TO_CLASS[model_type]
        model_name = parameters.pop("model_name", self.settings.base_model_name)
        return model_cls(model_name=model_name, **parameters)

    @property
    def runnable_chain(self):
        return self.chain
