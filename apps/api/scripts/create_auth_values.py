"""Interactively generate secure local values for the single-owner account."""

from getpass import getpass
import secrets

from pwdlib import PasswordHash


def main() -> None:
    password = getpass("Choose an owner password (12+ characters): ")
    confirmation = getpass("Confirm owner password: ")

    if len(password) < 12:
        raise SystemExit("Choose a password with at least 12 characters.")
    if password != confirmation:
        raise SystemExit("The passwords did not match.")

    print("\nCopy these values into apps/api/.env. Do not commit or share them.\n")
    print(f"OWNER_PASSWORD_HASH='{PasswordHash.recommended().hash(password)}'")
    print(f"SESSION_SECRET={secrets.token_urlsafe(48)}")


if __name__ == "__main__":
    main()
