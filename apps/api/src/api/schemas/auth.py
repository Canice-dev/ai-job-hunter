from datetime import datetime

from pydantic import BaseModel, Field, field_validator


class LoginRequest(BaseModel):
    email: str = Field(min_length=3, max_length=320)
    password: str = Field(min_length=1, max_length=1024)

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        cleaned = value.strip().casefold()
        if "@" not in cleaned:
            raise ValueError("Enter a valid email address.")
        return cleaned


class LoginResponse(BaseModel):
    access_token: str
    expires_at: datetime


class SessionResponse(BaseModel):
    email: str
    expires_at: datetime
