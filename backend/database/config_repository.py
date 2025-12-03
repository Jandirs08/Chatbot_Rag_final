"""Repository and model for bot configuration storage in MongoDB."""
import logging
from datetime import datetime, timezone
from typing import Optional
from pydantic import BaseModel, Field

from config import settings as app_settings
from core import prompt as prompt_module
from .mongodb import get_mongodb_client, MongodbClient

logger = logging.getLogger(__name__)

class BotConfig(BaseModel):
    """Configuration for the chatbot behavior."""
    system_prompt: str = Field(default="", description="System instructions/personality for the bot")
    temperature: float = Field(default=0.7, ge=0.0, le=1.0, description="Model temperature for creativity vs precision")
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    bot_name: Optional[str] = Field(default=None, description="Display name of the bot")
    ui_prompt_extra: Optional[str] = Field(default=None, description="Additional instructions to complement base personality")
    twilio_account_sid: Optional[str] = Field(default=None)
    twilio_auth_token: Optional[str] = Field(default=None)
    twilio_whatsapp_from: Optional[str] = Field(default=None)


class ConfigRepository:
    """Repository to manage bot configuration in MongoDB."""

    def __init__(self, mongo: Optional[MongodbClient] = None):
        logger.debug("Initializing ConfigRepository and using global MongoDB client.")
        self._mongo = mongo or get_mongodb_client()
        self._collection = self._mongo.db.get_collection("bot_config")

    async def get_config(self) -> BotConfig:
        """Retrieve current bot configuration, returning defaults if not set."""
        doc = await self._collection.find_one({"_id": "default"})
        if not doc:
            logger.info("No existing bot config found, creating default configuration.")
            # Seed default from Settings
            default_personality = (
                app_settings.system_prompt
                if app_settings.system_prompt is not None
                else prompt_module.BOT_PERSONALITY.format(nombre=prompt_module.BOT_NAME)
            )
            config = BotConfig(
                system_prompt=default_personality,
                temperature=getattr(app_settings, "temperature", 0.7),
                bot_name=prompt_module.BOT_NAME,
                ui_prompt_extra=None,
                twilio_account_sid=getattr(app_settings, "twilio_account_sid", None),
                twilio_auth_token=getattr(app_settings, "twilio_auth_token", None),
                twilio_whatsapp_from=getattr(app_settings, "twilio_whatsapp_from", None),
            )
            await self._collection.update_one(
                {"_id": "default"},
                {"$set": config.model_dump()},
                upsert=True,
            )
            logger.info("Default bot configuration has been saved.")
            return config

        return BotConfig(**{k: v for k, v in doc.items() if k != "_id"})


    async def update_config(self, system_prompt: Optional[str] = None, temperature: Optional[float] = None, bot_name: Optional[str] = None, ui_prompt_extra: Optional[str] = None, twilio_account_sid: Optional[str] = None, twilio_auth_token: Optional[str] = None, twilio_whatsapp_from: Optional[str] = None) -> BotConfig:
        """Update bot configuration fields and return the new config."""
        update_data = {"updated_at": datetime.now(timezone.utc)}
        if system_prompt is not None:
            update_data["system_prompt"] = system_prompt
        if temperature is not None:
            update_data["temperature"] = float(temperature)
        if bot_name is not None:
            update_data["bot_name"] = bot_name
        if ui_prompt_extra is not None:
            ui_text = ui_prompt_extra.strip()
            if len(ui_text) > 3000:
                ui_text = ui_text[:3000]
            update_data["ui_prompt_extra"] = ui_text
        if twilio_account_sid is not None:
            update_data["twilio_account_sid"] = twilio_account_sid
        if twilio_auth_token is not None:
            update_data["twilio_auth_token"] = twilio_auth_token
        if twilio_whatsapp_from is not None:
            cleaned_from = str(twilio_whatsapp_from).strip().strip("`\"'")
            update_data["twilio_whatsapp_from"] = cleaned_from

        await self._collection.update_one(
            {"_id": "default"},
            {"$set": update_data},
            upsert=True,
        )

        doc = await self._collection.find_one({"_id": "default"})
        return BotConfig(**{k: v for k, v in doc.items() if k != "_id"})

    async def reset_ui(self) -> BotConfig:
        """Clear UI-driven fields (bot_name, ui_prompt_extra) and return config."""
        update_data = {
            "bot_name": None,
            "ui_prompt_extra": None,
            "updated_at": datetime.now(timezone.utc),
        }
        await self._collection.update_one({"_id": "default"}, {"$set": update_data}, upsert=True)
        doc = await self._collection.find_one({"_id": "default"})
        return BotConfig(**{k: v for k, v in doc.items() if k != "_id"})
