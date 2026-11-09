from __future__ import annotations

from datetime import datetime
from html.parser import HTMLParser
import json
import re
from threading import Lock
import time
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from api.schemas.jobs import RemoteOKListing


FEED_URL = "https://remoteok.com/api"
FEED_CACHE_SECONDS = 15 * 60
DESCRIPTION_LIMIT = 50_000

_cache_lock = Lock()
_cached_jobs: list[RemoteOKListing] | None = None
_cached_at = 0.0


class RemoteOKError(RuntimeError):
    """The Remote OK feed could not be loaded or read."""


class _PlainTextExtractor(HTMLParser):
    _BLOCK_TAGS = {"br", "div", "h1", "h2", "h3", "li", "p", "ul", "ol"}
    _IGNORED_TAGS = {"script", "style"}

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []
        self.ignored_depth = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag in self._IGNORED_TAGS:
            self.ignored_depth += 1
        elif not self.ignored_depth and tag in self._BLOCK_TAGS:
            self.parts.append("\n")

    def handle_endtag(self, tag: str) -> None:
        if tag in self._IGNORED_TAGS and self.ignored_depth:
            self.ignored_depth -= 1
        elif not self.ignored_depth and tag in self._BLOCK_TAGS:
            self.parts.append("\n")

    def handle_data(self, data: str) -> None:
        if not self.ignored_depth:
            self.parts.append(data)


def _plain_text(markup: str) -> str:
    parser = _PlainTextExtractor()
    parser.feed(markup)
    text = "".join(parser.parts)
    text = re.sub(r"[ \t\f\v]+", " ", text)
    text = re.sub(r" *\n *", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text).strip()
    return text[:DESCRIPTION_LIMIT]


def _to_listing(item: Any) -> RemoteOKListing | None:
    if not isinstance(item, dict) or not item.get("id"):
        return None

    url = item.get("url") or item.get("apply_url")
    position = item.get("position")
    company = item.get("company")
    description = item.get("description")
    if not all(isinstance(value, str) and value.strip() for value in (url, position, company, description)):
        return None

    try:
        published_at = datetime.fromisoformat(item["date"].replace("Z", "+00:00")) if isinstance(item.get("date"), str) else None
        tags = item.get("tags") if isinstance(item.get("tags"), list) else []
        plain_description = _plain_text(description)
        if not plain_description:
            return None
        return RemoteOKListing(
            id=str(item["id"]),
            title=position.strip()[:300],
            company=company.strip()[:300],
            location=str(item.get("location") or "Remote").strip()[:300],
            tags=[str(tag).strip()[:80] for tag in tags if str(tag).strip()][:20],
            description=plain_description,
            url=url.strip(),
            published_at=published_at,
        )
    except (TypeError, ValueError):
        return None


def _fetch_feed() -> list[RemoteOKListing]:
    request = Request(
        FEED_URL,
        headers={"Accept": "application/json", "User-Agent": "JobHunter/0.1"},
        method="GET",
    )
    try:
        with urlopen(request, timeout=15) as response:
            payload = json.loads(response.read())
    except HTTPError as exc:
        raise RemoteOKError(f"Remote OK returned HTTP {exc.code}.") from exc
    except (TimeoutError, URLError, json.JSONDecodeError) as exc:
        raise RemoteOKError("Could not reach the Remote OK job feed.") from exc

    if not isinstance(payload, list):
        raise RemoteOKError("Remote OK returned an unexpected feed format.")

    listings = [listing for item in payload if (listing := _to_listing(item)) is not None]
    if not listings:
        raise RemoteOKError("Remote OK did not return any readable job listings.")
    return listings


def get_remoteok_jobs() -> list[RemoteOKListing]:
    """Return a cached copy of Remote OK's public feed (at most once per 15 minutes)."""
    global _cached_at, _cached_jobs
    with _cache_lock:
        if _cached_jobs is not None and time.monotonic() - _cached_at < FEED_CACHE_SECONDS:
            return _cached_jobs
        jobs = _fetch_feed()
        _cached_jobs = jobs
        _cached_at = time.monotonic()
        return jobs


def search_remoteok_jobs(query: str, limit: int = 100) -> tuple[list[RemoteOKListing], int]:
    jobs = get_remoteok_jobs()
    terms = [term for term in re.split(r"\s+", query.strip().casefold()) if term]
    if terms:
        jobs = [
            job
            for job in jobs
            if all(
                term in " ".join(
                    (job.title, job.company, job.location, " ".join(job.tags), job.description)
                ).casefold()
                for term in terms
            )
        ]
    return jobs[:limit], len(jobs)
