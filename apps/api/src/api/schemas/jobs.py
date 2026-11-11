from datetime import date, datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, HttpUrl, field_validator


class JobPreviewRequest(BaseModel):
    """A job listing supplied by the user for preview before persistence."""

    source: Literal["linkedin", "upwork", "remoteok", "web", "manual"] = "manual"
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
    applied_date: date | None = None
    notes: str | None = None
    follow_up_date: date | None = None
    match_score: float | None = Field(default=None, ge=1.0, le=5.0)
    match_summary: str | None = None
    match_strengths: list[str] = Field(default_factory=list)
    match_gaps: list[str] = Field(default_factory=list)
    match_scored_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class JobImportResponse(BaseModel):
    job: JobRecordResponse
    created: bool


class RemoteOKListing(BaseModel):
    id: str
    title: str
    company: str
    location: str
    tags: list[str] = Field(default_factory=list)
    description: str
    url: HttpUrl
    published_at: datetime | None = None


class RemoteOKSearchResponse(BaseModel):
    jobs: list[RemoteOKListing]
    count: int
    source_name: Literal["Remote OK"] = "Remote OK"
    source_url: str = "https://remoteok.com"


class RemoteOKSearchRequest(BaseModel):
    query: str = Field(default="", max_length=120)

    @field_validator("query")
    @classmethod
    def trim_query(cls, value: str) -> str:
        return value.strip()


class SearchRunResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    source: str
    query: str
    status: Literal["completed", "failed"]
    result_count: int
    error: str | None
    created_at: datetime


class RemoteOKSearchRunResponse(RemoteOKSearchResponse):
    search_run: SearchRunResponse


class JobStatusRequest(BaseModel):
    status: Literal["new", "saved", "dismissed", "applied"]


class JobFollowUpRequest(BaseModel):
    applied_date: date | None = None
    notes: str | None = Field(default=None, max_length=5000)
    follow_up_date: date | None = None

    @field_validator("notes")
    @classmethod
    def trim_notes(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        return cleaned or None
