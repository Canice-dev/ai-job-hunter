from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from api.db.models import CVDocument, Job, Profile
from api.db.session import get_session
from api.schemas.jobs import (
    JobImportResponse,
    JobFollowUpRequest,
    JobPreviewRequest,
    JobPreviewResponse,
    JobRecordResponse,
    JobStatusRequest,
    RemoteOKSearchResponse,
)
from api.security import require_owner
from api.services.job_import import build_job, normalize_source_url
from api.services.job_matching import AIProviderError, score_job_match
from api.services.remoteok_jobs import RemoteOKError, search_remoteok_jobs

router = APIRouter(
    prefix="/jobs",
    tags=["jobs"],
    dependencies=[Depends(require_owner)],
)


def _confirmed_profile(session: Session) -> Profile | None:
    document = session.scalar(select(CVDocument).order_by(CVDocument.created_at.desc()).limit(1))
    profile = session.scalar(select(Profile).limit(1))
    if document is None or profile is None or profile.cv_document_id != document.id:
        return None
    return profile


def _job_response(job: Job, profile: Profile | None) -> JobRecordResponse:
    response = JobRecordResponse.model_validate(job)
    if profile is None or job.match_profile_confirmed_at != profile.confirmed_at:
        return response.model_copy(
            update={
                "match_score": None,
                "match_summary": None,
                "match_strengths": [],
                "match_gaps": [],
                "match_scored_at": None,
            }
        )
    return response


@router.get("/discover/remoteok", response_model=RemoteOKSearchResponse)
def discover_remoteok_jobs(
    q: str = Query(default="", max_length=120),
    limit: int = Query(default=100, ge=1, le=100),
) -> RemoteOKSearchResponse:
    """Search the cached Remote OK feed without saving listings to the owner's tracker."""
    try:
        jobs, count = search_remoteok_jobs(q, limit)
    except RemoteOKError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return RemoteOKSearchResponse(jobs=jobs, count=count)


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
    profile = _confirmed_profile(session)
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
            return JobImportResponse(job=_job_response(existing, profile), created=False)

    job = build_job(job_request)
    session.add(job)
    session.commit()
    session.refresh(job)
    response.status_code = 201
    return JobImportResponse(job=_job_response(job, profile), created=True)


@router.get("", response_model=list[JobRecordResponse])
def list_jobs(
    limit: int = Query(default=100, ge=1, le=200),
    session: Session = Depends(get_session),
) -> list[JobRecordResponse]:
    """Return the most recently imported jobs."""
    profile = _confirmed_profile(session)
    jobs = session.scalars(select(Job).order_by(Job.created_at.desc()).limit(limit))
    return [_job_response(job, profile) for job in jobs]


@router.post("/{job_id}/score", response_model=JobRecordResponse)
def score_job(
    job_id: UUID,
    session: Session = Depends(get_session),
) -> JobRecordResponse:
    """Ask the configured AI model to assess a job against the confirmed profile."""
    job = session.get(Job, job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found.")
    profile = _confirmed_profile(session)
    if profile is None:
        raise HTTPException(status_code=409, detail="Confirm your profile before scoring jobs.")

    try:
        result = score_job_match(job.title, job.description, profile.facts)
    except AIProviderError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    job.match_score = result.score
    job.match_summary = result.summary
    job.match_strengths = result.strengths
    job.match_gaps = result.gaps
    job.match_scored_at = result.scored_at
    job.match_profile_confirmed_at = profile.confirmed_at
    session.commit()
    session.refresh(job)
    return _job_response(job, profile)


@router.patch("/{job_id}/status", response_model=JobRecordResponse)
def update_job_status(
    job_id: UUID,
    request: JobStatusRequest,
    session: Session = Depends(get_session),
) -> JobRecordResponse:
    job = session.get(Job, job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found.")
    job.status = request.status
    if request.status == "applied" and job.applied_date is None:
        job.applied_date = datetime.now(timezone.utc).date()
    session.commit()
    session.refresh(job)
    return _job_response(job, _confirmed_profile(session))


@router.patch("/{job_id}/follow-up", response_model=JobRecordResponse)
def update_job_follow_up(
    job_id: UUID,
    request: JobFollowUpRequest,
    session: Session = Depends(get_session),
) -> JobRecordResponse:
    """Save application notes and dates for a tracked listing."""
    job = session.get(Job, job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found.")
    if "applied_date" in request.model_fields_set:
        job.applied_date = request.applied_date
    if "notes" in request.model_fields_set:
        job.notes = request.notes
    if "follow_up_date" in request.model_fields_set:
        job.follow_up_date = request.follow_up_date
    session.commit()
    session.refresh(job)
    return _job_response(job, _confirmed_profile(session))
