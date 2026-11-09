from datetime import datetime

from pydantic import BaseModel


class TelegramLinkCodeResponse(BaseModel):
    code: str
    expires_at: datetime


class TelegramStatusResponse(BaseModel):
    linked: bool
    linked_at: datetime | None = None
