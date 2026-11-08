import os
import unittest

from fastapi import HTTPException
from pwdlib import PasswordHash

from api.config import get_auth_settings
from api.routes.auth import login
from api.schemas.auth import LoginRequest
from api.security import (
    create_owner_session,
    decode_owner_session,
    require_owner,
    verify_owner_credentials,
)


class SecurityTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        os.environ["OWNER_EMAIL"] = "owner@example.com"
        os.environ["OWNER_PASSWORD_HASH"] = PasswordHash.recommended().hash(
            "correct horse battery staple"
        )
        os.environ["SESSION_SECRET"] = "test-session-secret-that-is-long-enough-for-hs256"
        os.environ["SESSION_HOURS"] = "2"

    def setUp(self) -> None:
        get_auth_settings.cache_clear()

    def test_owner_credentials_are_verified(self) -> None:
        settings = get_auth_settings()

        self.assertTrue(
            verify_owner_credentials(
                "OWNER@example.com", "correct horse battery staple", settings
            )
        )
        self.assertFalse(
            verify_owner_credentials("owner@example.com", "incorrect", settings)
        )
        self.assertFalse(
            verify_owner_credentials(
                "someone@example.com", "correct horse battery staple", settings
            )
        )

    def test_owner_session_round_trip_and_rejects_modified_tokens(self) -> None:
        token, expires_at = create_owner_session(get_auth_settings())
        session = decode_owner_session(token, get_auth_settings())

        self.assertIsNotNone(session)
        self.assertEqual(int(session.expires_at.timestamp()), int(expires_at.timestamp()))
        self.assertIsNone(decode_owner_session(f"{token}x", get_auth_settings()))

    def test_private_routes_require_a_bearer_session(self) -> None:
        with self.assertRaises(HTTPException) as missing_token:
            require_owner()
        self.assertEqual(missing_token.exception.status_code, 401)

        token, _ = create_owner_session(get_auth_settings())
        self.assertIsNotNone(require_owner(f"Bearer {token}"))

    def test_login_route_issues_a_valid_owner_session(self) -> None:
        response = login(
            LoginRequest(
                email="owner@example.com", password="correct horse battery staple"
            )
        )

        self.assertIsNotNone(
            decode_owner_session(response.access_token, get_auth_settings())
        )


if __name__ == "__main__":
    unittest.main()
