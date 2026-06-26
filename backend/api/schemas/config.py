"""Schemas for bot configuration API."""
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field, field_validator


class BotConfigDTO(BaseModel):
    """Bot configuration data transfer object."""
    temperature: float = Field(default=0.7, ge=0.0, le=1.0, description="Model temperature")
    updated_at: datetime = Field(description="Last update time (UTC)")
    bot_name: str | None = Field(default=None, description="Display name of the bot")
    ui_prompt_extra: str | None = Field(default=None, description="Additional instructions to complement base personality")
    twilio_account_sid: str | None = Field(default=None)
    twilio_configured: bool = Field(default=False, description="Whether Twilio credentials are configured")
    twilio_whatsapp_from: str | None = Field(default=None)
    theme_color: str = Field(default="#F97316", description="Primary theme color (hex)")
    starters: list[str] = Field(default_factory=list, description="Suggested starter questions")
    input_placeholder: str = Field(default="Escribe aquí...", description="Default input placeholder text")


class UpdateBotConfigRequest(BaseModel):
    """Request payload to update bot configuration."""
    temperature: Optional[float] = Field(default=None, description="New temperature (0..1)")
    bot_name: Optional[str] = Field(default=None, description="New bot display name")
    ui_prompt_extra: Optional[str] = Field(default=None, description="Additional instructions (max 3000 chars)")
    twilio_account_sid: Optional[str] = Field(default=None)
    twilio_auth_token: Optional[str] = Field(default=None)
    twilio_whatsapp_from: Optional[str] = Field(default=None)
    theme_color: Optional[str] = Field(default=None, description="Primary theme color (hex)")
    starters: Optional[list[str]] = Field(default=None, description="Suggested starter questions (max 6)")
    input_placeholder: Optional[str] = Field(default=None, description="Default input placeholder text")

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

    @field_validator("theme_color")
    @classmethod
    def validate_theme_color(cls, v: Optional[str]):
        if v is None:
            return v
        v = v.strip()
        if not v.startswith("#") or len(v) not in (4, 7):
            raise ValueError("theme_color must be a hex like #F97316")
        return v

    @field_validator("starters")
    @classmethod
    def validate_starters(cls, v: Optional[list[str]]):
        if v is None:
            return v
        # Enforce max 6 and sanitize strings
        cleaned = [str(s).strip() for s in v if str(s).strip()]
        return cleaned[:6]


class PromptGeneratorRequest(BaseModel):
    """Payload for AI-assisted prompt generation."""
    business_sector: str = Field(..., min_length=2, max_length=60, description="Rubro del negocio")
    business_description: str = Field(..., min_length=10, max_length=600)
    audience: Optional[str] = Field(default=None, max_length=200)
    tone: str = Field(default="cercano", pattern="^(formal|cercano|tecnico|empatico)$")
    restrictions: Optional[str] = Field(default=None, max_length=400)
    special_flows: Optional[str] = Field(default=None, max_length=400)
    website_url: Optional[str] = Field(default=None, max_length=300)

    @field_validator("business_sector")
    @classmethod
    def validate_business_sector(cls, v: str) -> str:
        if v.strip().lower() == "otro":
            raise ValueError("business_sector must be a real sector name, not 'Otro'")
        return v.strip()


class PromptGeneratorResponse(BaseModel):
    """Generated prompt result."""
    prompt: str


class PreviewPersonalityRequest(BaseModel):
    """Request to preview bot personality without saving."""
    prompt: str = Field(..., max_length=3000)
    temperature: float = Field(default=0.7, ge=0.0, le=1.0)
    test_message: str = Field(..., min_length=1, max_length=500)


class PreviewPersonalityResponse(BaseModel):
    """Bot response using draft personality settings."""
    response: str
    temperature_used: float
    prompt_chars: int


class PersonalityHistoryEntry(BaseModel):
    """A saved snapshot of personality configuration."""
    history_id: str
    ui_prompt_extra: str | None
    temperature: float
    saved_at: datetime


class PersonalityHistoryResponse(BaseModel):
    """List of personality history entries."""
    entries: list[PersonalityHistoryEntry]
