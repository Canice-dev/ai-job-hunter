from fastapi import APIRouter, Depends, HTTPException

from api.config import AuthenticationNotConfiguredError, get_auth_settings
from api.schemas.auth import LoginRequest, LoginResponse, SessionResponse
from api.security import (
    OwnerSession,
    auth_configuration_error,
    create_owner_session,
    invalid_credentials_error,
    require_owner,
    verify_owner_credentials,
)

router = APIRouter(prefix="/auth", tags=["authentication"])


@router.post("/login", response_model=LoginResponse)
def login(credentials: LoginRequest) -> LoginResponse:
    """Exchange the configured owner's email and password for a short-lived session."""
    try:
        settings = get_auth_settings()
        is_valid = verify_owner_credentials(
            credentials.email, credentials.password, settings
        )
    except AuthenticationNotConfiguredError as exc:
        raise auth_configuration_error() from exc

    if not is_valid:
        raise invalid_credentials_error()

    access_token, expires_at = create_owner_session(settings)
    return LoginResponse(access_token=access_token, expires_at=expires_at)


@router.get("/session", response_model=SessionResponse)
def get_session(owner_session: OwnerSession = Depends(require_owner)) -> SessionResponse:
    """Return the minimal owner session information needed by the dashboard."""
    try:
        settings = get_auth_settings()
    except AuthenticationNotConfiguredError as exc:
        raise auth_configuration_error() from exc

    return SessionResponse(email=settings.owner_email, expires_at=owner_session.expires_at)
