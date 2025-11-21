"""Schemas for bot configuration API."""
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field, field_validator


class BotConfigDTO(BaseModel):
    """Bot configuration data transfer object."""
    system_prompt: str = Field(default="", description="System instructions/personality for the bot")
    temperature: float = Field(default=0.7, ge=0.0, le=1.0, description="Model temperature")
    updated_at: datetime = Field(description="Last update time (UTC)")
    bot_name: str | None = Field(default=None, description="Display name of the bot")
    ui_prompt_extra: str | None = Field(default=None, description="Additional instructions to complement base personality")
    twilio_account_sid: str | None = Field(default=None)
    twilio_auth_token: str | None = Field(default=None)
    twilio_whatsapp_from: str | None = Field(default=None)


class UpdateBotConfigRequest(BaseModel):
    """Request payload to update bot configuration."""
    system_prompt: Optional[str] = Field(default=None, description="New system prompt")
    temperature: Optional[float] = Field(default=None, description="New temperature (0..1)")
    bot_name: Optional[str] = Field(default=None, description="New bot display name")
    ui_prompt_extra: Optional[str] = Field(default=None, description="Additional instructions (max 3000 chars)")
    twilio_account_sid: Optional[str] = Field(default=None)
    twilio_auth_token: Optional[str] = Field(default=None)
    twilio_whatsapp_from: Optional[str] = Field(default=None)

    @field_validator("temperature")
    @classmethod
    def validate_temperature(cls, v: Optional[float]):
        if v is None:
            return v
        if not (0.0 <= v <= 1.0):
            raise ValueError("temperature must be between 0.0 and 1.0")
        return v

    @field_validator("ui_prompt_extra")
    @classmethod
    def validate_ui_prompt_extra(cls, v: Optional[str]):
        if v is None:
            return v
        v = v.strip()
        if len(v) > 3000:
            raise ValueError("ui_prompt_extra must be at most 3000 characters")
        return v