from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, HttpUrl, field_validator


class JobPreviewRequest(BaseModel):
    """A job listing supplied by the user for preview before persistence."""

    source: Literal["linkedin", "upwork", "manual"] = "manual"
    source_url: HttpUrl | None = None
    title: str | None = Field(default=None, max_length=300)
    company: str | None = Field(default=None, max_length=300)
    location: str | None = Field(default=None, max_length=300)
    work_mode: Literal["on_site", "remote", "hybrid", "unknown"] = "unknown"
    description: str = Field(min_length=1, max_length=50_000)

    @field_validator("description")
    @classmethod
    def trim_description(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Job description cannot be blank.")
        return cleaned

    @field_validator("title", "company", "location")
    @classmethod
    def trim_optional_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        return cleaned or None


class JobPreviewResponse(BaseModel):
    status: Literal["preview_only"] = "preview_only"
    job: JobPreviewRequest
    notice: str = "Preview only: this job has not been saved, scored, or tailored yet."


class JobRecordResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    source: str
    source_url: str | None
    title: str | None
    company: str | None
    location: str | None
    work_mode: str
    description: str
    status: str
    match_score: int | None = None
    match_summary: str | None = None
    match_strengths: list[str] = Field(default_factory=list)
    match_gaps: list[str] = Field(default_factory=list)
    match_scored_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class JobImportResponse(BaseModel):
    job: JobRecordResponse
    created: bool


class JobStatusRequest(BaseModel):
    status: Literal["new", "saved", "dismissed", "applied"]
