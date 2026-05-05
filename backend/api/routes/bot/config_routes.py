"""API routes for bot configuration management.

Proteccion: todos los endpoints (excepto /config/public) requieren manage_bot_config.
Hoy manage_bot_config mapea a admin; /config/public sigue publico para el widget.
"""
import logging
import time
from fastapi import APIRouter, HTTPException, Request, status, Depends

from api.schemas.config import BotConfigDTO, UpdateBotConfigRequest, PromptGeneratorRequest, PromptGeneratorResponse
from database.config_repository import ConfigRepository
from auth.permissions import require_manage_bot_config
from models.user import User
from cache.manager import cache
from utils.audit import audit

logger = logging.getLogger(__name__)
router = APIRouter(tags=["bot"])

BOT_CONFIG_CACHE_KEY = "bot:config"
BOT_PUBLIC_CONFIG_CACHE_KEY = "bot:config:public"
BOT_PUBLIC_CONFIG_CACHE_TTL_SECONDS = 3600
RUNTIME_CONFIG_LOCAL_TTL_SECONDS = 5.0

_runtime_config_local_cache: dict | None = None
_runtime_config_local_expires_at: float = 0.0
BOT_CONFIG_CACHE_FIELDS = (
    "temperature",
    "bot_name",
    "ui_prompt_extra",
    "theme_color",
    "starters",
    "input_placeholder",
    "twilio_account_sid",
    "twilio_auth_token",
    "twilio_whatsapp_from",
)
BOT_PUBLIC_CONFIG_FIELDS = (
    "bot_name",
    "theme_color",
    "starters",
    "input_placeholder",
)
SAFE_PUBLIC_BOT_CONFIG = {
    "is_active": True,
    "bot_name": "Asistente IA",
    "theme_color": "#F97316",
    "starters": [],
    "input_placeholder": "Escribe aquí...",
}


def redis_coordination_available() -> bool:
    try:
        return bool(cache.get_health_status().get("redis_connected"))
    except Exception:
        return False


def normalize_runtime_config_payload(payload: object) -> dict | None:
    if not isinstance(payload, dict):
        return None

    normalized = {field: payload.get(field) for field in BOT_CONFIG_CACHE_FIELDS}

    try:
        if normalized["temperature"] is not None:
            normalized["temperature"] = float(normalized["temperature"])
    except Exception:
        normalized["temperature"] = None

    starters = normalized.get("starters")
    if starters is None:
        normalized["starters"] = []
    elif isinstance(starters, list):
        normalized["starters"] = [str(item).strip() for item in starters if str(item).strip()]
    else:
        starter = str(starters).strip()
        normalized["starters"] = [starter] if starter else []

    for field in (
        "bot_name",
        "ui_prompt_extra",
        "theme_color",
        "input_placeholder",
        "twilio_account_sid",
        "twilio_auth_token",
        "twilio_whatsapp_from",
    ):
        value = normalized.get(field)
        if value is None:
            continue
        normalized[field] = str(value)

    return normalized


def build_runtime_config_payload(config_obj: object) -> dict:
    payload = {field: getattr(config_obj, field, None) for field in BOT_CONFIG_CACHE_FIELDS}
    return normalize_runtime_config_payload(payload) or {}


def normalize_public_config_payload(payload: object) -> dict | None:
    normalized = normalize_runtime_config_payload(payload)
    if normalized is None:
        return None

    return {
        "bot_name": normalized.get("bot_name") or SAFE_PUBLIC_BOT_CONFIG["bot_name"],
        "theme_color": normalized.get("theme_color") or SAFE_PUBLIC_BOT_CONFIG["theme_color"],
        "starters": normalized.get("starters") or [],
        "input_placeholder": normalized.get("input_placeholder") or SAFE_PUBLIC_BOT_CONFIG["input_placeholder"],
    }


def build_public_config_payload(config_obj: object) -> dict:
    payload = {field: getattr(config_obj, field, None) for field in BOT_PUBLIC_CONFIG_FIELDS}
    return normalize_public_config_payload(payload) or {
        key: SAFE_PUBLIC_BOT_CONFIG[key] for key in BOT_PUBLIC_CONFIG_FIELDS
    }


def _invalidate_runtime_config_local_cache() -> None:
    global _runtime_config_local_cache, _runtime_config_local_expires_at
    _runtime_config_local_cache = None
    _runtime_config_local_expires_at = 0.0


def read_runtime_config_from_cache() -> dict | None:
    """Read runtime config with a short-TTL local cache to avoid hitting Redis
    on every request to /chat, /bot, /whatsapp.

    Trade-off: a config change on another worker is visible after at most
    RUNTIME_CONFIG_LOCAL_TTL_SECONDS. Acceptable for runtime tuning knobs.
    """
    global _runtime_config_local_cache, _runtime_config_local_expires_at

    now = time.monotonic()
    if _runtime_config_local_cache is not None and now < _runtime_config_local_expires_at:
        return _runtime_config_local_cache

    if not redis_coordination_available():
        _invalidate_runtime_config_local_cache()
        return None

    try:
        normalized = normalize_runtime_config_payload(cache.get(BOT_CONFIG_CACHE_KEY))
    except Exception:
        return None

    _runtime_config_local_cache = normalized
    _runtime_config_local_expires_at = now + RUNTIME_CONFIG_LOCAL_TTL_SECONDS
    return normalized


def write_runtime_config_to_cache(config_obj: object) -> None:
    if not redis_coordination_available():
        _invalidate_runtime_config_local_cache()
        return

    payload = config_obj if isinstance(config_obj, dict) else build_runtime_config_payload(config_obj)
    normalized = normalize_runtime_config_payload(payload)
    if normalized is None:
        return

    try:
        cache.set(BOT_CONFIG_CACHE_KEY, normalized, ttl=0)
    except Exception:
        pass

    _invalidate_runtime_config_local_cache()


def read_public_config_from_cache() -> dict | None:
    if not redis_coordination_available():
        return None

    try:
        return normalize_public_config_payload(cache.get(BOT_PUBLIC_CONFIG_CACHE_KEY))
    except Exception as exc:
        logger.warning("No se pudo leer la configuración pública del bot desde Redis: %s", exc, exc_info=True)
        return None


def write_public_config_to_cache(config_obj: object) -> None:
    if not redis_coordination_available():
        return

    payload = config_obj if isinstance(config_obj, dict) else build_public_config_payload(config_obj)
    normalized = normalize_public_config_payload(payload)
    if normalized is None:
        return

    try:
        cache.set(BOT_PUBLIC_CONFIG_CACHE_KEY, normalized, ttl=BOT_PUBLIC_CONFIG_CACHE_TTL_SECONDS)
    except Exception as exc:
        logger.warning("No se pudo guardar la configuración pública del bot en Redis: %s", exc, exc_info=True)


def apply_runtime_config(settings_obj: object, payload: object) -> bool:
    normalized = normalize_runtime_config_payload(payload)
    if settings_obj is None or normalized is None:
        return False

    changed = False
    for field, value in normalized.items():
        if getattr(settings_obj, field, None) != value:
            setattr(settings_obj, field, value)
            changed = True

    return changed


def _get_config_repo(request: Request) -> ConfigRepository:
    """Helper to build ConfigRepository using app's Mongo client when available."""
    try:
        if hasattr(request.app.state, "mongodb_client") and request.app.state.mongodb_client:
            return ConfigRepository(mongo=request.app.state.mongodb_client)
    except Exception:
        pass
    return ConfigRepository()


def _build_bot_config_dto(config_obj: object) -> BotConfigDTO:
    payload = dict(config_obj.model_dump()) if hasattr(config_obj, "model_dump") else dict(config_obj)
    payload.pop("twilio_auth_token", None)
    payload["twilio_configured"] = bool(getattr(config_obj, "twilio_auth_token", None))
    return BotConfigDTO(**payload)


@router.get("/config", response_model=BotConfigDTO, status_code=status.HTTP_200_OK)
async def get_bot_config(
    request: Request,
    _: User = Depends(require_manage_bot_config),
) -> BotConfigDTO:
    """Return current bot configuration. Requires: authenticated user."""
    try:
        repo = _get_config_repo(request)
        config = await repo.get_config()
        return _build_bot_config_dto(config)
    except Exception as e:
        logger.error(f"Error getting bot config: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Error interno del servidor al obtener la configuración")


@router.put("/config", response_model=BotConfigDTO, status_code=status.HTTP_200_OK)
async def update_bot_config(
    request: Request,
    payload: UpdateBotConfigRequest,
    current_user: User = Depends(require_manage_bot_config),
) -> BotConfigDTO:
    """Update bot configuration fields. Requires: authenticated user."""
    try:
        repo = _get_config_repo(request)
        updated = await repo.update_config(
            temperature=payload.temperature,
            bot_name=payload.bot_name,
            ui_prompt_extra=payload.ui_prompt_extra,
            twilio_account_sid=payload.twilio_account_sid,
            twilio_auth_token=payload.twilio_auth_token,
            twilio_whatsapp_from=payload.twilio_whatsapp_from,
            theme_color=payload.theme_color,
            starters=payload.starters,
            input_placeholder=payload.input_placeholder,
        )
        runtime_payload = build_runtime_config_payload(updated)
        # Aplicar en runtime
        if hasattr(request.app.state, "settings") and request.app.state.settings:
            apply_runtime_config(request.app.state.settings, runtime_payload)

        if hasattr(request.app.state, "bot_instance") and request.app.state.bot_instance:
            try:
                request.app.state.bot_instance.reload_chain(request.app.state.settings)
            except Exception as reload_error:
                logger.error(
                    f"Error recargando chain del bot, se mantiene la chain anterior: {reload_error}",
                    exc_info=True,
                )
        write_runtime_config_to_cache(runtime_payload)
        request.app.state.last_synced_bot_config = runtime_payload

        changed_keys = [k for k, v in payload.model_dump().items() if v is not None]
        audit("bot_config_updated", str(current_user.id), changed_fields=changed_keys, ip=request.client.host if request.client else None)

        return _build_bot_config_dto(updated)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating bot config: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Error interno del servidor al actualizar la configuración")


@router.post("/config/reset", response_model=BotConfigDTO, status_code=status.HTTP_200_OK)
async def reset_bot_config(
    request: Request,
    _: User = Depends(require_manage_bot_config),
) -> BotConfigDTO:
    """Clear UI-driven fields and reload runtime. Requires: authenticated user."""
    try:
        repo = _get_config_repo(request)
        updated = await repo.reset_ui()
        runtime_payload = build_runtime_config_payload(updated)

        if hasattr(request.app.state, "settings") and request.app.state.settings:
            apply_runtime_config(request.app.state.settings, runtime_payload)

        if hasattr(request.app.state, "bot_instance") and request.app.state.bot_instance:
            try:
                request.app.state.bot_instance.reload_chain(request.app.state.settings)
            except Exception as reload_error:
                logger.error(
                    f"Error recargando chain tras reset, se mantiene la chain anterior: {reload_error}",
                    exc_info=True,
                )
        write_runtime_config_to_cache(runtime_payload)
        request.app.state.last_synced_bot_config = runtime_payload
        audit("bot_config_reset", None, ip=request.client.host if request.client else None)
        return _build_bot_config_dto(updated)
    except Exception as e:
        logger.error(f"Error resetting bot config: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Error interno del servidor al restablecer la configuración")


@router.get("/config/public", status_code=status.HTTP_200_OK)
async def get_bot_public_config(request: Request):
    """Public endpoint: exposes only safe UI config fields for the chat widget."""
    try:
        repo = _get_config_repo(request)
        config = await repo.get_config()
        public_config = build_public_config_payload(config)
        write_public_config_to_cache(public_config)
        return public_config
    except Exception as mongo_error:
        logger.error("Error getting public bot config from MongoDB: %s", mongo_error, exc_info=True)

    cached_config = read_public_config_from_cache()
    if cached_config is not None:
        return cached_config

    logger.warning("Returning hardcoded safe default public bot config after MongoDB and Redis failures.")
    return {key: SAFE_PUBLIC_BOT_CONFIG[key] for key in BOT_PUBLIC_CONFIG_FIELDS}


_TONE_DESCRIPTIONS = {
    "formal": "profesional y corporativo; usa 'usted'; lenguaje preciso, sin informalidades ni contracciones",
    "cercano": "amigable y natural; usa 'tú'; conversacional pero siempre respetuoso y claro",
    "tecnico": "experto y preciso; usa terminología del sector sin simplificar; respuestas detalladas con contexto técnico",
    "empatico": "cálido y comprensivo; valida la emoción antes de informar; prioriza la escucha activa sobre la eficiencia",
}

_GENERATE_PROMPT_SYSTEM = """Eres un especialista en diseño de prompts para asistentes de IA empresariales.
Tu tarea: generar instrucciones de personalidad completas y específicas para un chatbot RAG.
Este chatbot solo responde usando documentos reales de la empresa — nunca inventa información ni da datos de otras fuentes.

Reglas del output:
- En español. Sin meta-comentarios, sin explicaciones, sin prefijos.
- Concreto y accionable — nada genérico como "sé amable".
- Usa exactamente estas secciones con sus etiquetas en mayúsculas seguidas de dos puntos.
- Cada sección debe tener contenido específico al negocio descrito.

Secciones requeridas:
ROL:
TONO:
AUDIENCIA:
SCOPE:
RESTRICCIONES:
COMPORTAMIENTO:
EJEMPLO:"""

_GENERATE_PROMPT_TEMPLATE = """Genera instrucciones de personalidad para este bot empresarial.

RUBRO: {business_sector}
NEGOCIO: {business_description}
AUDIENCIA: {audience}
TONO DESEADO: {tone_description}
RESTRICCIONES ESPECÍFICAS: {restrictions}
FLUJO ESPECIAL: {special_flows}
{website_section}

Formato de respuesta (sin intro, sin cierre, solo las secciones):

ROL:
[2-3 oraciones: qué es este bot, para qué empresa/rubro, qué puede hacer por el usuario]

TONO:
• [lineamiento de comunicación específico y aplicable]
• [otro lineamiento]
• [otro lineamiento]

AUDIENCIA:
[Cómo adaptar el trato según quién pregunta]

SCOPE:
• Responde sobre: [temas concretos del negocio]
• No responde sobre: [qué está fuera de su alcance]

RESTRICCIONES:
• [límite concreto 1]
• [límite concreto 2]

COMPORTAMIENTO:
[Qué hacer cuando preguntan algo fuera de scope o que no está en los documentos]

EJEMPLO:
Usuario: [pregunta típica que recibirá este bot en el rubro {business_sector}]
Bot: [respuesta ideal que muestre exactamente el tono y estilo correcto]"""

_MAX_RESPONSE_BYTES = 512 * 1024  # 512 KB — avoids memory bomb on large responses


def _assert_host_allowed(host: str) -> None:
    """Raise ValueError if host resolves to a private/reserved address."""
    import ipaddress

    if not host:
        raise ValueError("Empty host not allowed")
    # Reject obviously dangerous hostnames by string
    _blocked = ["localhost", "metadata.google", "metadata.internal"]
    for b in _blocked:
        if b in host.lower():
            raise ValueError(f"Host not allowed: {host}")
    # Validate IP literals (covers all private/loopback/reserved ranges incl. IPv6)
    try:
        addr = ipaddress.ip_address(host)
        if addr.is_private or addr.is_loopback or addr.is_reserved or addr.is_link_local:
            raise ValueError(f"Private/reserved IP not allowed: {host}")
    except ValueError as exc:
        if "not allowed" in str(exc) or "not allowed" in str(exc):
            raise
        # hostname, not a numeric IP — allowed at this stage


async def _fetch_website_context(url: str) -> str:
    """Fetch and extract meaningful text. Validates each redirect destination."""
    import re
    import httpx
    from urllib.parse import urlparse

    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise ValueError("URL must use http or https")
    _assert_host_allowed(parsed.hostname or "")

    async def _on_redirect(response: httpx.Response) -> None:
        """Block redirects to private/internal hosts."""
        if response.is_redirect:
            location = response.headers.get("location", "")
            dest = urlparse(location)
            if dest.scheme and dest.scheme not in ("http", "https"):
                raise ValueError(f"Redirect to non-http scheme blocked: {location}")
            dest_host = dest.hostname or ""
            if dest_host:
                _assert_host_allowed(dest_host)

    headers = {"User-Agent": "Mozilla/5.0 (compatible; AlephContextBot/1.0)"}
    async with httpx.AsyncClient(
        timeout=8.0,
        follow_redirects=True,
        max_redirects=3,
        event_hooks={"response": [_on_redirect]},
    ) as client:
        async with client.stream("GET", url, headers=headers) as resp:
            resp.raise_for_status()
            chunks: list[bytes] = []
            total = 0
            async for chunk in resp.aiter_bytes(chunk_size=8192):
                total += len(chunk)
                if total > _MAX_RESPONSE_BYTES:
                    break
                chunks.append(chunk)
            encoding = resp.encoding or "utf-8"
            html = b"".join(chunks).decode(encoding, errors="replace")

    html = re.sub(r"<script[^>]*>.*?</script>", " ", html, flags=re.DOTALL | re.IGNORECASE)
    html = re.sub(r"<style[^>]*>.*?</style>", " ", html, flags=re.DOTALL | re.IGNORECASE)
    html = re.sub(r"<head[^>]*>.*?</head>", " ", html, flags=re.DOTALL | re.IGNORECASE)
    html = re.sub(r"<nav[^>]*>.*?</nav>", " ", html, flags=re.DOTALL | re.IGNORECASE)
    html = re.sub(r"<footer[^>]*>.*?</footer>", " ", html, flags=re.DOTALL | re.IGNORECASE)
    text = re.sub(r"<[^>]+>", " ", html)
    text = re.sub(r"\s+", " ", text).strip()
    return text[:2500]


@router.post("/config/generate-prompt", response_model=PromptGeneratorResponse, status_code=status.HTTP_200_OK)
async def generate_bot_prompt(
    request: Request,
    payload: PromptGeneratorRequest,
    _: User = Depends(require_manage_bot_config),
) -> PromptGeneratorResponse:
    """Generate a structured personality prompt using AI. Requires: authenticated user."""
    from openai import AsyncOpenAI

    try:
        settings_obj = request.app.state.settings
        api_key = settings_obj.openai_api_key.get_secret_value()
    except Exception as e:
        logger.error(f"Cannot read OpenAI API key: {e}")
        raise HTTPException(status_code=500, detail="Configuración de API no disponible")

    website_section = ""
    if payload.website_url:
        try:
            web_text = await _fetch_website_context(payload.website_url)
            website_section = f"\nCONTEXTO DEL SITIO WEB ({payload.website_url}):\n{web_text}"
        except ValueError as e:
            raise HTTPException(status_code=400, detail=f"URL no permitida: {e}")
        except Exception as e:
            logger.warning(f"Could not fetch website {payload.website_url}: {e}")
            website_section = f"\n(No se pudo acceder al sitio {payload.website_url} — generando sin ese contexto)"

    tone_desc = _TONE_DESCRIPTIONS.get(payload.tone, _TONE_DESCRIPTIONS["cercano"])
    user_message = _GENERATE_PROMPT_TEMPLATE.format(
        business_sector=payload.business_sector,
        business_description=payload.business_description,
        audience=payload.audience or "Clientes generales del negocio",
        tone_description=tone_desc,
        restrictions=payload.restrictions or "Ninguna especificada por el usuario",
        special_flows=payload.special_flows or "Ninguno especificado",
        website_section=website_section,
    )

    try:
        client = AsyncOpenAI(api_key=api_key)
        response = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": _GENERATE_PROMPT_SYSTEM},
                {"role": "user", "content": user_message},
            ],
            max_tokens=900,
            temperature=0.65,
        )
        generated = response.choices[0].message.content or ""
        return PromptGeneratorResponse(prompt=generated.strip())
    except Exception as e:
        logger.error(f"Error calling OpenAI for prompt generation: {e}", exc_info=True)
        raise HTTPException(status_code=502, detail="Error al generar el prompt con IA")
