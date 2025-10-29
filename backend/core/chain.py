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
            custom_bot_personality_str: Optional[str] = None,
            model_kwargs_override: Optional[dict] = None
    ):
        self.settings = settings if settings is not None else app_settings
        self.logger = logging.getLogger(self.__class__.__name__)

        # Validar que todos los componentes del prompt estén disponibles
        self._validate_prompt_components()

        self.prompt_input_variables: Dict[str, Any] = {
            "nombre": prompt_module.BOT_NAME  # Agregamos el nombre del bot por defecto
        }
        
        if custom_bot_personality_str is not None:
            self.prompt_input_variables["bot_personality"] = custom_bot_personality_str
        elif self.settings.bot_personality_name:
            bot_personality_str_from_module = self._load_prompt_from_module(self.settings.bot_personality_name)
            if bot_personality_str_from_module:
                self.prompt_input_variables["bot_personality"] = bot_personality_str_from_module
            else:
                self.logger.warning(f"No se pudo cargar la personalidad del bot: {self.settings.bot_personality_name}. Usando system_prompt o vacío.")
                self.prompt_input_variables["bot_personality"] = self.settings.system_prompt or ""
        elif self.settings.system_prompt:
            self.prompt_input_variables["bot_personality"] = self.settings.system_prompt
        else:
            self.prompt_input_variables["bot_personality"] = ""

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

    def _validate_prompt_components(self):
        """Valida que todos los componentes del prompt estén disponibles y muestra un log visible."""
        try:
            # Verificar que existan todas las constantes necesarias
            required_components = [
                ('BOT_NAME', prompt_module.BOT_NAME),
                ('BOT_PERSONALITY', prompt_module.BOT_PERSONALITY),
                ('BASE_PROMPT_TEMPLATE', prompt_module.BASE_PROMPT_TEMPLATE),
                ('ASESOR_ACADEMICO_REACT_PROMPT', prompt_module.ASESOR_ACADEMICO_REACT_PROMPT)
            ]

            # Verificar que todas las funciones necesarias existan
            required_functions = [
                'get_asesor_academico_prompt',
                'get_custom_prompt'
            ]

            # Verificar constantes
            for name, value in required_components:
                if not value:
                    raise ValueError(f"Componente requerido '{name}' está vacío o no definido")

            # Verificar funciones
            for func_name in required_functions:
                if not hasattr(prompt_module, func_name):
                    raise ValueError(f"Función requerida '{func_name}' no encontrada")

            # Si todo está bien, mostrar mensaje de éxito
            print(f"\n{Fore.GREEN}{'='*80}")
            print(f"{Fore.GREEN}✓ Sistema de Prompts Cargado Exitosamente")
            print(f"{Fore.GREEN}✓ Nombre del Bot: {prompt_module.BOT_NAME}")
            print(f"{Fore.GREEN}✓ Personalidad Base: Cargada")
            print(f"{Fore.GREEN}✓ Plantilla Base: Cargada")
            print(f"{Fore.GREEN}✓ Funciones de Prompt: Cargadas")
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
                template = "Contexto de la conversación:\n{context}\n\n" + template
            self._raw_prompt_template = PromptTemplate.from_template(template)
        
        # Asegurarnos de que el prompt incluya el historial
        if "history" not in self._raw_prompt_template.input_variables:
            self.logger.warning("El prompt no incluye la variable 'history'. Añadiéndola...")
            template = self._raw_prompt_template.template
            if "{history}" not in template:
                template = "Historial de la conversación:\n{history}\n\n" + template
            self._raw_prompt_template = PromptTemplate.from_template(template)
        
        self.chain: Runnable = (self._prompt | self._base_model)
        self.chain = self.chain.with_config(run_name="AgentPromptAndModel")

    @property
    def runnable_chain(self) -> Runnable:
        return self.chain

    async def invoke_chain(self, input_dict: Dict[str, Any]) -> Message:
        """Invoca la cadena con el contexto y el historial."""
        try:
            # Asegurarnos de que el contexto esté presente
            if "context" not in input_dict:
                input_dict["context"] = "No hay contexto disponible."
            
            # Asegurarnos de que el historial esté presente
            if "history" not in input_dict:
                input_dict["history"] = "No hay historial disponible."
            
            # Combinar contexto e historial si son diferentes
            if input_dict["context"] != input_dict["history"]:
                input_dict["context"] = f"{input_dict['context']}\n\n{input_dict['history']}"
            
            llm_output = await self.chain.ainvoke(input_dict)
            
            if hasattr(llm_output, 'content'):
                output_content = llm_output.content
            elif isinstance(llm_output, dict) and 'text' in llm_output:
                output_content = llm_output['text']
            else:
                output_content = str(llm_output)
            
            # Limpiar la respuesta de cualquier formato de prompt
            if "Final Answer:" in output_content:
                output_content = output_content.split("Final Answer:")[-1].strip()
            if "Tu respuesta final y completa" in output_content:
                output_content = output_content.split("Tu respuesta final y completa")[-1].strip()
            
            return Message(message=output_content, role="assistant")
            
        except Exception as e:
            self.logger.error(f"Error en invoke_chain: {str(e)}", exc_info=True)
            raise

    def stream_chain(self, input_dict: Dict[str, Any]):
        return self.chain.astream_log(
            input_dict,
            include_names=["StreamResponse"]
        )
