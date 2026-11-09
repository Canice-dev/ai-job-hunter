"""Run the Telegram long-polling worker with `uv run --env-file .env python -m api.telegram_bot`."""
import json
import os
import ssl
import time
from datetime import date, datetime, timezone
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from pydantic import ValidationError
from sqlalchemy import delete, select
from sqlalchemy.orm import Session
import truststore

from api.db.models import Job, TelegramLink
from api.db.session import get_engine
from api.schemas.jobs import JobPreviewRequest
from api.services.job_import import build_job
from api.services.telegram_linking import claim_link_code

TELEGRAM_API = "https://api.telegram.org"
VALID_STATUSES = {"new", "saved", "dismissed", "applied"}


class TelegramBot:
    def __init__(self, token: str) -> None:
        self.token = token
        self.offset: int | None = None
        # Use Windows' native certificate validation (including its chain building)
        # while keeping hostname and certificate verification enabled.
        self.ssl_context = truststore.SSLContext(ssl.PROTOCOL_TLS_CLIENT)

    def _call(self, method: str, data: dict[str, object]) -> object:
        body = urlencode(data).encode("utf-8")
        request = Request(
            f"{TELEGRAM_API}/bot{self.token}/{method}",
            data=body,
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            method="POST",
        )
        with urlopen(request, timeout=40, context=self.ssl_context) as response:
            result = json.loads(response.read())
        if not result.get("ok"):
            raise RuntimeError("Telegram API request failed.")
        return result.get("result")

    def send(self, chat_id: int, text: str) -> None:
        self._call("sendMessage", {"chat_id": chat_id, "text": text[:4000]})

    def poll(self) -> list[dict[str, object]]:
        payload: dict[str, object] = {"timeout": 30, "allowed_updates": '["message"]'}
        if self.offset is not None:
            payload["offset"] = self.offset
        result = self._call("getUpdates", payload)
        return result if isinstance(result, list) else []

    def run(self) -> None:
        print("Telegram bot polling is running. Stop with Ctrl+C.")
        while True:
            try:
                for update in self.poll():
                    if not isinstance(update, dict):
                        continue
                    update_id = update.get("update_id")
                    if isinstance(update_id, int):
                        self.offset = update_id + 1
                    self.handle_update(update)
            except KeyboardInterrupt:
                print("Telegram bot stopped.")
                return
            except HTTPError as exc:
                try:
                    error_body = json.loads(exc.read())
                    description = error_body.get("description", "")
                except (json.JSONDecodeError, AttributeError):
                    description = ""
                safe_description = str(description).replace(self.token, "[redacted]")
                detail = f": {safe_description[:300]}" if safe_description else ""
                print(f"Telegram API returned HTTP {exc.code}{detail}; retrying in 5 seconds.")
                time.sleep(5)
            except URLError as exc:
                print(f"Network error contacting Telegram: {exc.reason}; retrying in 5 seconds.")
                time.sleep(5)
            except TimeoutError:
                print("Telegram request timed out; retrying in 5 seconds.")
                time.sleep(5)
            except (RuntimeError, ValueError) as exc:
                detail = str(exc).replace(self.token, "[redacted]")
                print(f"Telegram request failed: {detail[:300]}; retrying in 5 seconds.")
                time.sleep(5)

    def handle_update(self, update: dict[str, object]) -> None:
        message = update.get("message")
        if not isinstance(message, dict):
            return
        chat = message.get("chat")
        if not isinstance(chat, dict) or chat.get("type") != "private":
            return
        chat_id = chat.get("id")
        message_text = message.get("text")
        if not isinstance(chat_id, int) or not isinstance(message_text, str):
            return

        command, _, argument = message_text.strip().partition(" ")
        command = command.split("@", maxsplit=1)[0].lower()
        if command == "/start":
            self.start(chat_id, argument.strip())
            return

        with Session(get_engine()) as session:
            link = session.get(TelegramLink, "owner")
            if link is None or link.chat_id != chat_id:
                self.send(chat_id, "This private chat is not linked. Link it from your Job Hunter dashboard first.")
                return

            if command in {"/help", "/commands"}:
                self.send(chat_id, self.help_text())
            elif command == "/jobs":
                self.list_jobs(chat_id, session)
            elif command == "/status":
                self.update_status(chat_id, session, argument)
            elif command == "/followup":
                self.update_follow_up(chat_id, session, argument)
            elif command == "/note":
                self.update_note(chat_id, session, argument)
            elif command == "/import":
                self.import_job(chat_id, session, argument)
            elif command in {"/site", "/remote"}:
                self.send(
                    chat_id,
                    "Automated job search is not connected yet. Paste a listing with /import instead.",
                )
            elif command == "/unlink":
                session.execute(delete(TelegramLink).where(TelegramLink.owner_key == "owner"))
                session.commit()
                self.send(chat_id, "Telegram was unlinked from your Job Hunter account.")
            else:
                self.send(chat_id, "I don't recognize that command. Send /help to see what I can do.")

    def start(self, chat_id: int, code: str) -> None:
        if not code:
            self.send(chat_id, "To link this private chat, create a code in your dashboard and send /start followed by the code.")
            return
        with Session(get_engine()) as session:
            linked = claim_link_code(session, code, chat_id)
        if linked:
            self.send(chat_id, "Telegram is now linked to your Job Hunter account. Send /help to get started.")
        else:
            self.send(chat_id, "That link code is invalid or expired. Create a fresh code in your dashboard and try again.")

    @staticmethod
    def help_text() -> str:
        return (
            "Job Hunter commands\n"
            "/jobs — show your latest saved listings\n"
            "/status <job-id-prefix> <new|saved|dismissed|applied> — update a listing\n"
            "/followup <job-id-prefix> <YYYY-MM-DD|-> — set or clear a follow-up date\n"
            "/note <job-id-prefix> | <text or -> — save or clear a private note\n"
            "/import <URL or -> | <title> | <company> | <description> — save a listing\n"
            "/site or /remote — search status (automated sources are not connected yet)\n"
            "/unlink — disconnect this Telegram chat"
        )

    def list_jobs(self, chat_id: int, session: Session) -> None:
        jobs = session.scalars(select(Job).order_by(Job.created_at.desc()).limit(10)).all()
        if not jobs:
            self.send(chat_id, "No jobs saved yet. Use /import to add one.")
            return
        lines = ["Your latest jobs:"]
        for job in jobs:
            label = job.title or "Untitled role"
            company = f" — {job.company}" if job.company else ""
            lines.append(f"{str(job.id)[:8]} · {label}{company} [{job.status}]")
            if job.applied_date:
                lines.append(f"Applied: {job.applied_date.isoformat()}")
            if job.follow_up_date:
                lines.append(f"Follow-up: {job.follow_up_date.isoformat()}")
            if job.source_url:
                lines.append(job.source_url)
        self.send(chat_id, "\n".join(lines))

    def update_status(self, chat_id: int, session: Session, arguments: str) -> None:
        parts = arguments.split()
        if len(parts) != 2 or parts[1].lower() not in VALID_STATUSES:
            self.send(chat_id, "Usage: /status <job-id-prefix> <new|saved|dismissed|applied>")
            return
        prefix, status = parts[0].lower(), parts[1].lower()
        matches = session.scalars(select(Job).order_by(Job.created_at.desc()).limit(200)).all()
        matching_jobs = [job for job in matches if str(job.id).startswith(prefix)]
        if len(matching_jobs) != 1:
            self.send(chat_id, "I couldn't identify one job from that ID prefix. Run /jobs and use a longer prefix.")
            return
        matching_jobs[0].status = status
        if status == "applied" and matching_jobs[0].applied_date is None:
            matching_jobs[0].applied_date = datetime.now(timezone.utc).date()
        session.commit()
        self.send(chat_id, f"{matching_jobs[0].title or 'Job'} marked {status}.")

    def update_follow_up(self, chat_id: int, session: Session, arguments: str) -> None:
        parts = arguments.split()
        if len(parts) != 2:
            self.send(chat_id, "Usage: /followup <job-id-prefix> <YYYY-MM-DD|->")
            return
        prefix, raw_date = parts
        matches = session.scalars(select(Job).order_by(Job.created_at.desc()).limit(200)).all()
        matching_jobs = [job for job in matches if str(job.id).startswith(prefix.lower())]
        if len(matching_jobs) != 1:
            self.send(chat_id, "I couldn't identify one job from that ID prefix. Run /jobs and use a longer prefix.")
            return
        try:
            follow_up_date = None if raw_date == "-" else date.fromisoformat(raw_date)
        except ValueError:
            self.send(chat_id, "Use a date like 2026-12-01, or - to clear it.")
            return
        job = matching_jobs[0]
        job.follow_up_date = follow_up_date
        session.commit()
        message = "cleared" if follow_up_date is None else f"set to {follow_up_date.isoformat()}"
        self.send(chat_id, f"Follow-up date {message} for {job.title or 'job'}.")

    def update_note(self, chat_id: int, session: Session, arguments: str) -> None:
        parts = [part.strip() for part in arguments.split("|", maxsplit=1)]
        if len(parts) != 2 or not parts[0] or not parts[1]:
            self.send(chat_id, "Usage: /note <job-id-prefix> | <text or ->")
            return
        prefix, note = parts
        matches = session.scalars(select(Job).order_by(Job.created_at.desc()).limit(200)).all()
        matching_jobs = [job for job in matches if str(job.id).startswith(prefix.lower())]
        if len(matching_jobs) != 1:
            self.send(chat_id, "I couldn't identify one job from that ID prefix. Run /jobs and use a longer prefix.")
            return
        job = matching_jobs[0]
        job.notes = None if note == "-" else note[:5000]
        session.commit()
        message = "cleared" if job.notes is None else "saved"
        self.send(chat_id, f"Note {message} for {job.title or 'job'}.")

    def import_job(self, chat_id: int, session: Session, arguments: str) -> None:
        parts = [part.strip() for part in arguments.split("|", maxsplit=3)]
        if len(parts) != 4 or not parts[1] or not parts[3]:
            self.send(chat_id, "Usage: /import <URL or -> | <title> | <company> | <description>")
            return
        url, title, company, description = parts
        try:
            job_request = JobPreviewRequest(
                source="manual",
                source_url=url if url and url != "-" else None,
                title=title,
                company=company or None,
                description=description,
            )
        except ValidationError:
            self.send(chat_id, "I couldn't validate that listing. Check the URL and required title and description, then try again.")
            return

        job = build_job(job_request)
        if job.normalized_source_url:
            existing = session.scalar(
                select(Job).where(
                    Job.source == job.source,
                    Job.normalized_source_url == job.normalized_source_url,
                )
            )
            if existing:
                self.send(chat_id, f"That listing is already saved as {str(existing.id)[:8]} ({existing.status}).")
                return
        session.add(job)
        session.commit()
        session.refresh(job)
        self.send(chat_id, f"Saved {job.title or 'job'} as {str(job.id)[:8]}.")


def main() -> None:
    token = os.getenv("TELEGRAM_BOT_TOKEN", "").strip()
    if not token:
        raise SystemExit("Set TELEGRAM_BOT_TOKEN in apps/api/.env before starting the Telegram worker.")
    try:
        get_engine()
    except RuntimeError as exc:
        raise SystemExit("Set DATABASE_URL in apps/api/.env before starting the Telegram worker.") from exc
    TelegramBot(token).run()


if __name__ == "__main__":
    main()
