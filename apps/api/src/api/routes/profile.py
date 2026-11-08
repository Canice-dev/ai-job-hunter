from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from api.db.models import CVDocument, Profile
from api.db.session import get_session
from api.schemas.profile import (
    CVDocumentResponse,
    ProfileConfirmRequest,
    ProfileFacts,
    ProfileOnboardingResponse,
    ProfileStatusResponse,
)
from api.security import require_owner
from api.services.cv_storage import (
    extract_profile_draft,
    read_and_extract,
    storage_path,
    store_upload,
)

router = APIRouter(
    prefix="/profile",
    tags=["profile"],
    dependencies=[Depends(require_owner)],
)


def _latest_cv(session: Session) -> CVDocument | None:
    return session.scalar(select(CVDocument).order_by(CVDocument.created_at.desc()).limit(1))


def _document_response(document: CVDocument) -> CVDocumentResponse:
    return CVDocumentResponse(
        id=document.id,
        original_filename=document.original_filename,
        file_format=document.file_format,  # type: ignore[arg-type]
        file_size=document.file_size,
        created_at=document.created_at,
    )


@router.get("/onboarding", response_model=ProfileOnboardingResponse)
def get_onboarding(session: Session = Depends(get_session)) -> ProfileOnboardingResponse:
    document = _latest_cv(session)
    profile = session.scalar(select(Profile).limit(1))
    is_confirmed = (
        document is not None and profile is not None and profile.cv_document_id == document.id
    )
    return ProfileOnboardingResponse(
        cv=_document_response(document) if document else None,
        draft=ProfileFacts.model_validate(document.profile_draft) if document else None,
        profile=ProfileFacts.model_validate(profile.facts) if is_confirmed and profile else None,
        confirmed_at=profile.confirmed_at if is_confirmed and profile else None,
        is_confirmed=is_confirmed,
    )


@router.post("/cv", response_model=ProfileOnboardingResponse, status_code=201)
async def upload_cv(
    file: UploadFile = File(...),
    session: Session = Depends(get_session),
) -> ProfileOnboardingResponse:
    filename, file_format, text, data, _ = await read_and_extract(file)
    draft = extract_profile_draft(text)
    previous = _latest_cv(session)
    storage_key, path = store_upload(file_format, data)

    document = CVDocument(
        original_filename=filename,
        storage_key=storage_key,
        file_format=file_format,
        file_size=len(data),
        extracted_text=text,
        profile_draft=draft,
    )
    try:
        session.add(document)
        session.flush()
        session.query(Profile).delete()
        if previous:
            session.delete(previous)
        session.commit()
    except Exception:
        session.rollback()
        path.unlink(missing_ok=True)
        raise

    if previous:
        try:
            storage_path(previous.storage_key).unlink(missing_ok=True)
        except OSError:
            # A stale private file is preferable to losing a successfully saved CV record.
            pass

    session.refresh(document)
    return ProfileOnboardingResponse(
        cv=_document_response(document),
        draft=ProfileFacts.model_validate(draft),
        is_confirmed=False,
    )


@router.put("/confirm", response_model=ProfileOnboardingResponse)
def confirm_profile(
    request: ProfileConfirmRequest,
    session: Session = Depends(get_session),
) -> ProfileOnboardingResponse:
    document = _latest_cv(session)
    if document is None:
        raise HTTPException(status_code=404, detail="Upload a CV before confirming your profile.")
    if document.id != request.cv_document_id:
        raise HTTPException(status_code=409, detail="The CV changed. Review the current draft again.")

    profile = session.scalar(select(Profile).limit(1))
    facts = request.facts.model_dump()
    if profile is None:
        profile = Profile(
            cv_document_id=document.id,
            facts=facts,
            confirmed_at=datetime.now(timezone.utc),
        )
        session.add(profile)
    else:
        profile.cv_document_id = document.id
        profile.facts = facts
        profile.confirmed_at = datetime.now(timezone.utc)

    session.commit()
    session.refresh(profile)
    return ProfileOnboardingResponse(
        cv=_document_response(document),
        draft=ProfileFacts.model_validate(document.profile_draft),
        profile=ProfileFacts.model_validate(profile.facts),
        confirmed_at=profile.confirmed_at,
        is_confirmed=True,
    )


@router.get("/status", response_model=ProfileStatusResponse)
def get_profile_status(session: Session = Depends(get_session)) -> ProfileStatusResponse:
    document = _latest_cv(session)
    profile = session.scalar(select(Profile).limit(1))
    if not document:
        return ProfileStatusResponse(status="missing")
    if not profile or profile.cv_document_id != document.id:
        return ProfileStatusResponse(status="draft")
    full_name = str(profile.facts.get("full_name", "")).strip() or None
    return ProfileStatusResponse(status="confirmed", full_name=full_name)


@router.delete("/cv", status_code=status.HTTP_204_NO_CONTENT)
def delete_cv(session: Session = Depends(get_session)) -> None:
    document = _latest_cv(session)
    if document is None:
        return None

    session.query(Profile).delete()
    session.delete(document)
    session.commit()
    try:
        storage_path(document.storage_key).unlink(missing_ok=True)
    except OSError as exc:
        raise HTTPException(
            status_code=500,
            detail="CV records were deleted, but the private file could not be removed.",
        ) from exc
    return None
