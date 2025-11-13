"""
Módulo que contiene la gestión de cadenas de procesamiento.
"""

from typing import Optional, Dict, Any, Union, List
import colorama
from colorama import Fore, Style

from langchain_core.prompts import PromptTemplate
from langchain_core.runnables import RunnableLambda, Runnable
# from langchain_core.tracers.context import wait_for_all_tracers # COMMENTED OUT

from common.objects import Message
from models import ModelTypes, MODEL_TO_CLASS
from config import Settings, settings as app_settings
from . import prompt as prompt_module

import logging

# Inicializar colorama
colorama.init()

class ChainManager:
    def __init__(
            self,
            settings: Optional[Settings] = None,
            model_type: Optional[ModelTypes] = None,
            tools_list: Optional[List[Any]] = None,
            model_kwargs_override: Optional[dict] = None
    ):
        self.settings = settings if settings is not None else app_settings
        self.logger = logging.getLogger(self.__class__.__name__)

        # Validar que todos los componentes del prompt estén disponibles
        self._validate_prompt_components()

        # Nombre del bot desde settings si está definido; fallback al módulo
        bot_name_effective = getattr(self.settings, 'bot_name', None) or prompt_module.BOT_NAME
        self.prompt_input_variables: Dict[str, Any] = {
            "nombre": bot_name_effective
        }

        # Componer personalidad efectiva: base + instrucciones extra desde UI
        # Usar SIEMPRE la personalidad base del módulo y complementar con extras de UI.
        # Evita que un system_prompt legado (p.ej. "Sheldon Cooper") sobreescriba la personalidad canónica.
        base_personality = prompt_module.BOT_PERSONALITY.format(nombre=bot_name_effective)
        ui_extra = getattr(self.settings, 'ui_prompt_extra', None) or ""
        if ui_extra:
            personality_effective = f"{base_personality}\n\nInstrucciones adicionales:\n{ui_extra}"
        else:
            personality_effective = base_personality
        self.prompt_input_variables["bot_personality"] = personality_effective

        if tools_list:
            self.prompt_input_variables["tools"] = "\n".join([f"{tool.name}: {tool.description}" for tool in tools_list])
            self.prompt_input_variables["tool_names"] = ", ".join([tool.name for tool in tools_list])
        else:
            self.prompt_input_variables["tools"] = ""
            self.prompt_input_variables["tool_names"] = ""

        _model_kwargs = self._get_internal_model_kwargs(model_type=model_type)
        if model_kwargs_override:
            _model_kwargs.update(model_kwargs_override)

        self._base_model = self.get_model(model_type=model_type, parameters=_model_kwargs)
        
        main_prompt_str = self._load_prompt_from_module(self.settings.main_prompt_name)
        if not main_prompt_str:
            self.logger.error("No se pudo cargar la plantilla de prompt principal. Usando fallback.")
            main_prompt_str = "{input}"
        
        self._raw_prompt_template = PromptTemplate.from_template(main_prompt_str)
        
        self._prompt = self._raw_prompt_template.partial(**self.prompt_input_variables)
        self._init_chain()

    def update_tools(self, tools_list: Optional[List[Any]] = None) -> None:
        """Actualiza las herramientas visibles en el prompt y recompone el parcial.

        No altera el modelo ni la plantilla base. Mantiene compatibilidad con ReAct.
        """
        try:
            if tools_list:
                self.prompt_input_variables["tools"] = "\n".join(
                    [f"{tool.name}: {tool.description}" for tool in tools_list]
                )
                self.prompt_input_variables["tool_names"] = ", ".join(
                    [tool.name for tool in tools_list]
                )
            else:
                self.prompt_input_variables["tools"] = ""
                self.prompt_input_variables["tool_names"] = ""

            # Reaplicar parcial sin modificar la plantilla cruda
            self._prompt = self._raw_prompt_template.partial(**self.prompt_input_variables)
            self.logger.info("Herramientas del prompt actualizadas correctamente.")
        except Exception as e:
            self.logger.warning(f"No se pudo actualizar herramientas del prompt: {e}")

    def _validate_prompt_components(self):
        """Valida que todos los componentes del prompt estén disponibles y muestra un log visible."""
        try:
            # Verificar que existan todas las constantes necesarias
            required_components = [
                ('BOT_NAME', prompt_module.BOT_NAME),
                ('BOT_PERSONALITY', prompt_module.BOT_PERSONALITY),
                ('BASE_PROMPT_TEMPLATE', prompt_module.BASE_PROMPT_TEMPLATE),
                ('ASESOR_ACADEMICO_REACT_PROMPT', getattr(prompt_module, 'ASESOR_ACADEMICO_REACT_PROMPT', None))
            ]

            # Verificar constantes
            for name, value in required_components:
                if not value:
                    raise ValueError(f"Componente requerido '{name}' está vacío o no definido")

            # Las funciones legacy de construcción de prompts fueron eliminadas por no uso
            # (get_asesor_academico_prompt, get_custom_prompt). Mantener solo constantes.

            # Si todo está bien, mostrar mensaje de éxito
            print(f"\n{Fore.GREEN}{'='*80}")
            print(f"{Fore.GREEN}✓ Sistema de Prompts Cargado Exitosamente")
            print(f"{Fore.GREEN}✓ Nombre del Bot: {prompt_module.BOT_NAME}")
            print(f"{Fore.GREEN}✓ Personalidad Base: Cargada")
            print(f"{Fore.GREEN}✓ Plantilla Base: Cargada")
            print(f"{Fore.GREEN}✓ Funciones legacy removidas; usando plantilla base única")
            print(f"{Fore.GREEN}{'='*80}{Style.RESET_ALL}\n")

        except Exception as e:
            # Si hay error, mostrar mensaje de error
            print(f"\n{Fore.RED}{'='*80}")
            print(f"{Fore.RED}✗ Error al cargar el sistema de prompts:")
            print(f"{Fore.RED}✗ {str(e)}")
            print(f"{Fore.RED}{'='*80}{Style.RESET_ALL}\n")
            raise

    def _load_prompt_from_module(self, prompt_name: str) -> Optional[str]:
        try:
            template_string = getattr(prompt_module, prompt_name)
            if not isinstance(template_string, str):
                self.logger.error(f"El atributo '{prompt_name}' en prompt.py no es un string.")
                return None
            self.logger.info(f"Plantilla de prompt '{prompt_name}' cargada exitosamente desde prompt.py.")
            return template_string
        except AttributeError:
            self.logger.error(f"No se encontró la plantilla de prompt '{prompt_name}' en prompt.py.")
        except Exception as e:
            self.logger.error(f"Error cargando plantilla de prompt '{prompt_name}' desde prompt.py: {e}")
        return None

    def _get_internal_model_kwargs(self, model_type: Optional[ModelTypes]):
        effective_model_type = model_type
        if not effective_model_type:
            try:
                effective_model_type = ModelTypes[self.settings.model_type.upper()]
            except (AttributeError, KeyError):
                self.logger.warning("model_type no especificado o inválido en settings. Asumiendo OPENAI para kwargs.")
                effective_model_type = ModelTypes.OPENAI

        kwargs = {}
        if effective_model_type == ModelTypes.OPENAI:
            kwargs = {
                "temperature": self.settings.temperature,
                "model_name": self.settings.base_model_name,
                "max_tokens": self.settings.max_tokens
            }
        elif effective_model_type == ModelTypes.VERTEX:
            kwargs = {
                "model_name": self.settings.base_model_name,
                "max_output_tokens": self.settings.max_tokens if hasattr(self.settings, 'max_tokens') else 1024,
                "temperature": self.settings.temperature if hasattr(self.settings, 'temperature') else 0.2,
                "top_p": self.settings.vertex_top_p if hasattr(self.settings, 'vertex_top_p') else 0.8,
                "top_k": self.settings.vertex_top_k if hasattr(self.settings, 'vertex_top_k') else 40
            }
        else:
            kwargs = {
                "temperature": self.settings.temperature if hasattr(self.settings, 'temperature') else 0.2,
                "max_tokens": self.settings.max_tokens if hasattr(self.settings, 'max_tokens') else 1024,
            }
        if 'model_name' not in kwargs and self.settings.base_model_name:
            kwargs['model_name'] = self.settings.base_model_name
            
        return kwargs

    def get_model(
            self,
            model_type: Optional[ModelTypes] = None,
            parameters: Optional[dict] = None
    ):
        parameters = parameters or {}
        model_name_param = parameters.pop("model_name", None)
        
        effective_model_type = model_type
        if effective_model_type is None:
            try:
                effective_model_type = ModelTypes[self.settings.model_type.upper()]
            except KeyError:
                self.logger.warning(f"Invalid model_type in settings: {self.settings.model_type}. Defaulting to VERTEX.")
                effective_model_type = ModelTypes.VERTEX
        
        if effective_model_type not in MODEL_TO_CLASS:
            raise ValueError(
                f"Got unknown model type: {effective_model_type}. "
                f"Valid types are: {MODEL_TO_CLASS.keys()}."
            )
        model_class = MODEL_TO_CLASS[effective_model_type]

        model_name_to_use = model_name_param if model_name_param else self.settings.base_model_name

        model_parameters = {}
        model_parameters.update(parameters)

        if effective_model_type in [ModelTypes.VERTEX, ModelTypes.OPENAI]:
            return model_class(model_name=model_name_to_use, **model_parameters)
        
        return model_class(**model_parameters)

    def _init_chain(self):
        """Inicializa la cadena de procesamiento con el contexto."""
        # Asegurarnos de que el prompt incluya el contexto
        if "context" not in self._raw_prompt_template.input_variables:
            self.logger.warning("El prompt no incluye la variable 'context'. Añadiéndola...")
            template = self._raw_prompt_template.template
            if "{context}" not in template:
                template = (
                    "Contexto de la conversación:\n{context}\n\n"
                    "Instrucciones de grounding: Si el contexto anterior contiene información relevante, responde EXCLUSIVAMENTE basándote en él. "
                    "Si el contexto no cubre la pregunta, dilo claramente y NO inventes ni uses conocimiento general.\n\n"
                    + template
                )
            self._raw_prompt_template = PromptTemplate.from_template(template)
        else:
            self.logger.debug("La plantilla de prompt ya incluye la variable 'context'.")

        # Asegurarnos de que el prompt incluya el historial
        if "history" not in self._raw_prompt_template.input_variables:
            self.logger.warning("El prompt no incluye la variable 'history'. Añadiéndola...")
            template = self._raw_prompt_template.template
            if "{history}" not in template:
                template = "Historial de la conversación:\n{history}\n\n" + template
            self._raw_prompt_template = PromptTemplate.from_template(template)
        else:
            self.logger.debug("La plantilla de prompt ya incluye la variable 'history'.")

        # Recalcular el prompt parcial tras modificar la plantilla cruda
        self._prompt = self._raw_prompt_template.partial(**self.prompt_input_variables)

        self.chain: Runnable = (self._prompt | self._base_model)
        self.chain = self.chain.with_config(run_name="AgentPromptAndModel")
        try:
            self.logger.info(
                f"Cadena inicializada. Input vars: {self._raw_prompt_template.input_variables}"
            )
        except Exception:
            pass

    @property
    def runnable_chain(self) -> Runnable:
        return self.chain

    # Métodos legacy eliminados por no uso: invoke_chain(), stream_chain()
