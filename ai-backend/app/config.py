from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv
from pydantic import BaseModel, Field

load_dotenv()


class Settings(BaseModel):
    openai_api_key: str | None = Field(default_factory=lambda: os.getenv("OPENAI_API_KEY") or None)
    openai_model: str = Field(default_factory=lambda: os.getenv("OPENAI_MODEL", "gpt-4.1-mini"))
    ai_demo_mode: bool = Field(default_factory=lambda: os.getenv("AI_DEMO_MODE", "true").lower() == "true")
    frontend_origin: str = Field(default_factory=lambda: os.getenv("FRONTEND_ORIGIN", "http://localhost:5173"))
    database_url: str = Field(default_factory=lambda: os.getenv("DATABASE_URL", "sqlite:///data/bcc_ved.db"))
    max_upload_bytes: int = Field(default_factory=lambda: int(os.getenv("MAX_UPLOAD_BYTES", "10485760")))
    rate_limit_requests: int = Field(default_factory=lambda: int(os.getenv("RATE_LIMIT_REQUESTS", "120")))
    rate_limit_window_seconds: int = Field(default_factory=lambda: int(os.getenv("RATE_LIMIT_WINDOW_SECONDS", "60")))
    session_ttl_hours: int = Field(default_factory=lambda: int(os.getenv("SESSION_TTL_HOURS", "24")))

    @property
    def database_path(self) -> Path:
        prefix = "sqlite:///"
        if not self.database_url.startswith(prefix):
            raise ValueError("Only sqlite:/// DATABASE_URL values are supported")
        return Path(self.database_url.removeprefix(prefix))
