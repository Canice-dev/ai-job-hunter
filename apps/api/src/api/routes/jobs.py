from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from api.db.models import ApplicationMaterial, CVDocument, Job, Profile, SearchRun
from api.db.session import get_session
from api.schemas.jobs import (
    JobImportResponse,
    JobFollowUpRequest,
    JobPreviewRequest,
    JobPreviewResponse,
    JobRecordResponse,
    JobStatusRequest,
    RemoteOKSearchRequest,
    RemoteOKSearchResponse,
    RemoteOKSearchRunResponse,
    SearchRunResponse,
)
from api.schemas.materials import ApplicationMaterialsResponse, TailoredMaterialsContent
from api.security import require_owner
from api.services.job_import import build_job, normalize_source_url
from api.services.job_matching import AIProviderError, score_job_match
from api.services.cv_tailoring import (
    TailoringProviderError,
    create_docx,
    create_pdf,
    safe_download_stem,
    tailor_application,
)
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


@router.post("/discover/remoteok/search", response_model=RemoteOKSearchRunResponse)
def run_remoteok_search(
    request: RemoteOKSearchRequest,
    session: Session = Depends(get_session),
) -> RemoteOKSearchRunResponse:
    """Search Remote OK and save a compact history entry for the owner."""
    try:
        jobs, count = search_remoteok_jobs(request.query, limit=100)
    except RemoteOKError as exc:
        search_run = SearchRun(
            source="remoteok",
            query=request.query,
            status="failed",
            result_count=0,
            error=str(exc)[:500],
        )
        session.add(search_run)
        session.commit()
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    search_run = SearchRun(
        source="remoteok",
        query=request.query,
        status="completed",
        result_count=count,
    )
    session.add(search_run)
    session.commit()
    session.refresh(search_run)
    return RemoteOKSearchRunResponse(
        jobs=jobs,
        count=count,
        search_run=SearchRunResponse.model_validate(search_run),
    )


@router.get("/discover/remoteok/history", response_model=list[SearchRunResponse])
def list_remoteok_search_history(
    limit: int = Query(default=10, ge=1, le=50),
    session: Session = Depends(get_session),
) -> list[SearchRunResponse]:
    runs = session.scalars(
        select(SearchRun)
        .where(SearchRun.source == "remoteok")
        .order_by(SearchRun.created_at.desc())
        .limit(limit)
    )
    return [SearchRunResponse.model_validate(run) for run in runs]


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


def _current_material(
    session: Session, job_id: UUID, profile: Profile | None
) -> ApplicationMaterial | None:
    if profile is None:
        return None
    material = session.scalar(
        select(ApplicationMaterial).where(ApplicationMaterial.job_id == job_id)
    )
    if (
        material is None
        or material.cv_document_id != profile.cv_document_id
        or material.profile_confirmed_at != profile.confirmed_at
    ):
        return None
    return material


def _reviewable_content(
    content: dict[str, object], profile: Profile
) -> TailoredMaterialsContent:
    result = TailoredMaterialsContent.model_validate(content)
    sections = {
        "summary": [str(profile.facts.get("summary", ""))] if str(profile.facts.get("summary", "")).strip() else [],
        "skills": profile.facts.get("skills", []),
        "experience": profile.facts.get("experience", []),
        "education": profile.facts.get("education", []),
    }
    for claim in [result.summary, *result.skills, *result.experience, *result.education, *result.cover_letter]:
        for source in claim.sources:
            values = sections[source.section]
            if isinstance(values, list) and source.index < len(values):
                source.text = str(values[source.index])
    return result


@router.get("/{job_id}/materials", response_model=ApplicationMaterialsResponse)
def get_application_materials(
    job_id: UUID,
    session: Session = Depends(get_session),
) -> ApplicationMaterialsResponse:
    job = session.get(Job, job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found.")
    profile = _confirmed_profile(session)
    if profile is None:
        raise HTTPException(status_code=409, detail="Confirm your profile before preparing application materials.")
    material = _current_material(session, job_id, profile)
    if material is None:
        raise HTTPException(status_code=404, detail="No current application materials have been prepared for this job.")
    return ApplicationMaterialsResponse(
        id=material.id,
        job_id=material.job_id,
        created_at=material.created_at,
        content=_reviewable_content(material.content, profile),
    )


@router.post("/{job_id}/tailor", response_model=ApplicationMaterialsResponse, status_code=201)
def prepare_application_materials(
    job_id: UUID,
    session: Session = Depends(get_session),
) -> ApplicationMaterialsResponse:
    job = session.get(Job, job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found.")
    profile = _confirmed_profile(session)
    if profile is None:
        raise HTTPException(status_code=409, detail="Confirm your profile before preparing application materials.")
    try:
        content = tailor_application(job.title, job.company, job.description, profile.facts)
    except TailoringProviderError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    material = session.scalar(
        select(ApplicationMaterial).where(ApplicationMaterial.job_id == job_id)
    )
    if material is None:
        material = ApplicationMaterial(
            job_id=job_id,
            cv_document_id=profile.cv_document_id,
            profile_confirmed_at=profile.confirmed_at,
            content=content.model_dump(mode="json"),
        )
        session.add(material)
    else:
        material.cv_document_id = profile.cv_document_id
        material.profile_confirmed_at = profile.confirmed_at
        material.content = content.model_dump(mode="json")
    session.commit()
    session.refresh(material)
    return ApplicationMaterialsResponse(
        id=material.id,
        job_id=material.job_id,
        created_at=material.created_at,
        content=_reviewable_content(material.content, profile),
    )


@router.get("/{job_id}/materials/{kind}/{file_format}")
def download_application_material(
    job_id: UUID,
    kind: str,
    file_format: str,
    session: Session = Depends(get_session),
) -> Response:
    if kind not in {"cv", "cover-letter"} or file_format not in {"docx", "pdf"}:
        raise HTTPException(status_code=404, detail="Application document not found.")
    job = session.get(Job, job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found.")
    profile = _confirmed_profile(session)
    material = _current_material(session, job_id, profile)
    if profile is None or material is None:
        raise HTTPException(status_code=404, detail="Prepare current application materials before downloading.")

    content = TailoredMaterialsContent.model_validate(material.content)
    document_kind = kind  # path validation above narrows this at runtime
    document_format = file_format
    if document_format == "docx":
        data = create_docx(content.model_dump(mode="json"), profile.facts, document_kind)  # type: ignore[arg-type]
        media_type = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    else:
        data = create_pdf(content.model_dump(mode="json"), profile.facts, document_kind)  # type: ignore[arg-type]
        media_type = "application/pdf"
    title = safe_download_stem(job.title or "application")
    suffix = "cv" if document_kind == "cv" else "cover-letter"
    filename = f"{title}-{suffix}.{document_format}"
    return Response(
        content=data,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


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
