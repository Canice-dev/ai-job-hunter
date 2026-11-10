from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field


class MaterialSource(BaseModel):
    section: Literal["summary", "skills", "experience", "education"]
    index: int = Field(ge=0)
    text: str | None = None


class MaterialClaim(BaseModel):
    text: str = Field(min_length=1, max_length=1200)
    sources: list[MaterialSource] = Field(min_length=1, max_length=10)


class TailoredMaterialsContent(BaseModel):
    summary: MaterialClaim
    skills: list[MaterialClaim] = Field(max_length=30)
    experience: list[MaterialClaim] = Field(max_length=30)
    education: list[MaterialClaim] = Field(max_length=20)
    cover_letter: list[MaterialClaim] = Field(min_length=1, max_length=12)


class ApplicationMaterialsResponse(BaseModel):
    id: UUID
    job_id: UUID
    created_at: datetime
    content: TailoredMaterialsContent
    warning: str = (
        "AI drafts can contain errors. Check every statement against your confirmed profile before applying."
    )


