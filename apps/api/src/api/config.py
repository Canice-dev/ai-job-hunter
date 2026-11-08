from dataclasses import dataclass
from functools import lru_cache
import os


class AuthenticationNotConfiguredError(RuntimeError):
    """Raised when the single-owner authentication settings are incomplete."""


@dataclass(frozen=True)
class AuthSettings:
    owner_email: str
    owner_password_hash: str
    session_secret: str
    session_hours: int


def _required_setting(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise AuthenticationNotConfiguredError(f"{name} is not configured.")
    return value


@lru_cache(maxsize=1)
def get_auth_settings() -> AuthSettings:
    """Read and validate the locally configured single-owner account settings."""
    owner_email = _required_setting("OWNER_EMAIL").casefold()
    if "@" not in owner_email:
        raise AuthenticationNotConfiguredError("OWNER_EMAIL must be an email address.")

    session_secret = _required_setting("SESSION_SECRET")
    if len(session_secret) < 32:
        raise AuthenticationNotConfiguredError(
            "SESSION_SECRET must be at least 32 characters long."
        )

    raw_hours = os.getenv("SESSION_HOURS", "24")
    try:
        session_hours = int(raw_hours)
    except ValueError as exc:
        raise AuthenticationNotConfiguredError(
            "SESSION_HOURS must be a whole number."
        ) from exc

    if not 1 <= session_hours <= 168:
        raise AuthenticationNotConfiguredError(
            "SESSION_HOURS must be between 1 and 168."
        )

    return AuthSettings(
        owner_email=owner_email,
        owner_password_hash=_required_setting("OWNER_PASSWORD_HASH"),
        session_secret=session_secret,
        session_hours=session_hours,
    )
