from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator


class ProfileFacts(BaseModel):
    full_name: str = Field(default="", max_length=200)
    email: str = Field(default="", max_length=320)
    phone: str = Field(default="", max_length=80)
    location: str = Field(default="", max_length=200)
    summary: str = Field(default="", max_length=5000)
    skills: list[str] = Field(default_factory=list, max_length=100)
    experience: list[str] = Field(default_factory=list, max_length=100)
    education: list[str] = Field(default_factory=list, max_length=100)

    @field_validator("skills", "experience", "education")
    @classmethod
    def clean_lists(cls, values: list[str]) -> list[str]:
        return [item.strip()[:1000] for item in values if item.strip()]


class CVDocumentResponse(BaseModel):
    id: UUID
    original_filename: str
    file_format: Literal["pdf", "docx"]
    file_size: int
    created_at: datetime


class ProfileOnboardingResponse(BaseModel):
    cv: CVDocumentResponse | None = None
    draft: ProfileFacts | None = None
    profile: ProfileFacts | None = None
    confirmed_at: datetime | None = None
    is_confirmed: bool


class ProfileConfirmRequest(BaseModel):
    cv_document_id: UUID
    facts: ProfileFacts


class ProfileStatusResponse(BaseModel):
    status: Literal["draft", "confirmed", "missing"]
    full_name: str | None = None
