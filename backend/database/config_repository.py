"""Repository and model for bot configuration storage in MongoDB."""
from typing import Optional
from datetime import datetime, timezone
from pydantic import BaseModel, Field

from config import Settings, settings as app_settings
from core import prompt as prompt_module
from .mongodb import MongodbClient


class BotConfig(BaseModel):
    """Configuration for the chatbot behavior."""
    system_prompt: str = Field(default="", description="System instructions/personality for the bot")
    temperature: float = Field(default=0.7, ge=0.0, le=1.0, description="Model temperature for creativity vs precision")
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    bot_name: Optional[str] = Field(default=None, description="Display name of the bot")
    ui_prompt_extra: Optional[str] = Field(default=None, description="Additional instructions to complement base personality")


class ConfigRepository:
    """Repository to manage bot configuration in MongoDB."""

    def __init__(self, mongo: Optional[MongodbClient] = None, settings: Settings = app_settings):
        self._settings = settings
        self._mongo = mongo or MongodbClient(settings)
        self._collection = self._mongo.db.get_collection("bot_config")

    async def get_config(self) -> BotConfig:
        """Retrieve current bot configuration, returning defaults if not set."""
        doc = await self._collection.find_one({"_id": "default"})
        if not doc:
            # Seed default from Settings
            default_personality = (
                self._settings.system_prompt
                if self._settings.system_prompt is not None
                else prompt_module.BOT_PERSONALITY.format(nombre=prompt_module.BOT_NAME)
            )
            config = BotConfig(
                system_prompt=default_personality,
                temperature=getattr(self._settings, "temperature", 0.7),
                bot_name=prompt_module.BOT_NAME,
                ui_prompt_extra=None,
            )
            await self._collection.update_one(
                {"_id": "default"},
                {"$set": config.model_dump()},
                upsert=True,
            )
            return config

        return BotConfig(**{k: v for k, v in doc.items() if k != "_id"})

    async def update_config(self, system_prompt: Optional[str] = None, temperature: Optional[float] = None, bot_name: Optional[str] = None, ui_prompt_extra: Optional[str] = None) -> BotConfig:
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