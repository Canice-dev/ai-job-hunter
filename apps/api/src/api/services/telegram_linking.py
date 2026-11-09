from datetime import datetime, timedelta, timezone
import hashlib
import secrets

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from api.db.models import TelegramLink, TelegramLinkCode

LINK_CODE_LIFETIME = timedelta(minutes=10)


def create_link_code(session: Session) -> tuple[str, datetime]:
    """Create a high-entropy, one-use code; only its digest is persisted."""
    now = datetime.now(timezone.utc)
    expires_at = now + LINK_CODE_LIFETIME
    code = secrets.token_urlsafe(24)
    digest = hashlib.sha256(code.encode("utf-8")).hexdigest()
    session.execute(delete(TelegramLinkCode))
    session.add(TelegramLinkCode(code_digest=digest, expires_at=expires_at))
    session.commit()
    return code, expires_at


def claim_link_code(session: Session, code: str, chat_id: int) -> bool:
    """Consume a valid code and bind the owner's sole Telegram chat."""
    digest = hashlib.sha256(code.encode("utf-8")).hexdigest()
    now = datetime.now(timezone.utc)
    link_code = session.scalar(
        select(TelegramLinkCode)
        .where(TelegramLinkCode.code_digest == digest, TelegramLinkCode.expires_at > now)
        .with_for_update()
    )
    if link_code is None:
        session.execute(delete(TelegramLinkCode).where(TelegramLinkCode.expires_at <= now))
        session.commit()
        return False

    session.delete(link_code)
    session.execute(delete(TelegramLink))
    session.add(TelegramLink(owner_key="owner", chat_id=chat_id))
    session.execute(delete(TelegramLinkCode))
    session.commit()
    return True

