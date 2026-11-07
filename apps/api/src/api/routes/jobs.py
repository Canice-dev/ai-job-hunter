from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from api.db.models import Job
from api.db.session import get_session
from api.schemas.jobs import (
    JobImportResponse,
    JobPreviewRequest,
    JobPreviewResponse,
    JobRecordResponse,
    JobStatusRequest,
)
from api.services.job_import import build_job, normalize_source_url

router = APIRouter(prefix="/jobs", tags=["jobs"])


@router.post("/preview", response_model=JobPreviewResponse)
def preview_job(job: JobPreviewRequest) -> JobPreviewResponse:
    """Validate and normalize a manually supplied listing without fetching it."""
    return JobPreviewResponse(job=job)


@router.post("/import", response_model=JobImportResponse)
def import_job(
    job_request: JobPreviewRequest,
    response: Response,
    session: Session = Depends(get_session),
) -> JobImportResponse:
    """Save a user-provided listing, or return its existing record."""
    normalized_url = normalize_source_url(
        str(job_request.source_url) if job_request.source_url else None
    )
    if normalized_url:
        existing = session.scalar(
            select(Job).where(
                Job.source == job_request.source,
                Job.normalized_source_url == normalized_url,
            )
        )
        if existing:
            return JobImportResponse(job=existing, created=False)

    job = build_job(job_request)
    session.add(job)
    session.commit()
    session.refresh(job)
    response.status_code = 201
    return JobImportResponse(job=job, created=True)


@router.get("", response_model=list[JobRecordResponse])
def list_jobs(
    limit: int = Query(default=100, ge=1, le=200),
    session: Session = Depends(get_session),
) -> list[Job]:
    """Return the most recently imported jobs."""
    return list(session.scalars(select(Job).order_by(Job.created_at.desc()).limit(limit)))


@router.patch("/{job_id}/status", response_model=JobRecordResponse)
def update_job_status(
    job_id: UUID,
    request: JobStatusRequest,
    session: Session = Depends(get_session),
) -> Job:
    job = session.get(Job, job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found.")
    job.status = request.status
    session.commit()
    session.refresh(job)
    return job
