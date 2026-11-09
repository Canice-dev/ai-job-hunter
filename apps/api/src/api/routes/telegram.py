from fastapi import APIRouter, Depends, Response
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from api.db.models import TelegramLink
from api.db.session import get_session
from api.schemas.telegram import TelegramLinkCodeResponse, TelegramStatusResponse
from api.security import require_owner
from api.services.telegram_linking import create_link_code

router = APIRouter(
    prefix="/telegram",
    tags=["telegram"],
    dependencies=[Depends(require_owner)],
)


@router.post("/link-code", response_model=TelegramLinkCodeResponse)
def make_link_code(
    response: Response, session: Session = Depends(get_session)
) -> TelegramLinkCodeResponse:
    """Issue a short-lived one-time code for linking the owner's private chat."""
    code, expires_at = create_link_code(session)
    response.headers["Cache-Control"] = "no-store"
    return TelegramLinkCodeResponse(code=code, expires_at=expires_at)


@router.get("/status", response_model=TelegramStatusResponse)
def telegram_status(session: Session = Depends(get_session)) -> TelegramStatusResponse:
    link = session.get(TelegramLink, "owner")
    return TelegramStatusResponse(
        linked=link is not None,
        linked_at=link.linked_at if link else None,
    )


@router.delete("/link", status_code=204)
def unlink_telegram(session: Session = Depends(get_session)) -> Response:
    session.execute(delete(TelegramLink))
    session.commit()
    return Response(status_code=204)
