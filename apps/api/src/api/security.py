from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
import hmac
from typing import Annotated

import jwt
from fastapi import Header, HTTPException, status
from jwt import InvalidTokenError
from pwdlib import PasswordHash
from pwdlib.exceptions import PwdlibError

from api.config import AuthenticationNotConfiguredError, AuthSettings, get_auth_settings

SESSION_ALGORITHM = "HS256"
SESSION_AUDIENCE = "job-hunter-api"
SESSION_ISSUER = "job-hunter"

password_hash = PasswordHash.recommended()


@dataclass(frozen=True)
class OwnerSession:
    expires_at: datetime


def auth_configuration_error() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail="Authentication has not been configured yet.",
    )


def invalid_credentials_error() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Email or password is incorrect.",
        headers={"WWW-Authenticate": "Bearer"},
    )


def verify_owner_credentials(email: str, password: str, settings: AuthSettings) -> bool:
    """Verify both values for every attempt to avoid revealing which value failed."""
    try:
        password_matches = password_hash.verify(password, settings.owner_password_hash)
    except PwdlibError as exc:
        raise AuthenticationNotConfiguredError(
            "OWNER_PASSWORD_HASH is not a supported password hash."
        ) from exc

    email_matches = hmac.compare_digest(email.strip().casefold(), settings.owner_email)
    return email_matches and password_matches


def create_owner_session(settings: AuthSettings) -> tuple[str, datetime]:
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(hours=settings.session_hours)
    token = jwt.encode(
        {
            "sub": "owner",
            "aud": SESSION_AUDIENCE,
            "iss": SESSION_ISSUER,
            "iat": now,
            "exp": expires_at,
        },
        settings.session_secret,
        algorithm=SESSION_ALGORITHM,
    )
    return token, expires_at


def decode_owner_session(token: str, settings: AuthSettings) -> OwnerSession | None:
    try:
        payload = jwt.decode(
            token,
            settings.session_secret,
            algorithms=[SESSION_ALGORITHM],
            audience=SESSION_AUDIENCE,
            issuer=SESSION_ISSUER,
            options={"require": ["sub", "aud", "iss", "iat", "exp"]},
        )
    except InvalidTokenError:
        return None

    if payload.get("sub") != "owner":
        return None

    expires_at = datetime.fromtimestamp(payload["exp"], tz=timezone.utc)
    return OwnerSession(expires_at=expires_at)


def require_owner(
    authorization: Annotated[str | None, Header()] = None,
) -> OwnerSession:
    """Require a currently valid owner bearer token for private API routes."""
    try:
        settings = get_auth_settings()
    except AuthenticationNotConfiguredError as exc:
        raise auth_configuration_error() from exc

    scheme, _, token = (authorization or "").partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise invalid_credentials_error()

    session = decode_owner_session(token, settings)
    if session is None:
        raise invalid_credentials_error()
    return session
