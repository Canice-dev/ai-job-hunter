from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from api.db.models import Job
from api.schemas.jobs import JobPreviewRequest


_TRACKING_QUERY_KEYS = {
    "fbclid",
    "gclid",
    "trk",
    "trackingid",
    "utm_campaign",
    "utm_content",
    "utm_medium",
    "utm_source",
    "utm_term",
}


def normalize_source_url(source_url: str | None) -> str | None:
    if source_url is None:
        return None

    parts = urlsplit(source_url)
    hostname = (parts.hostname or "").lower()
    if not hostname:
        return source_url

    if hostname.startswith("www."):
        hostname = hostname[4:]

    port = parts.port
    netloc = hostname
    if port and not ((parts.scheme == "https" and port == 443) or (parts.scheme == "http" and port == 80)):
        netloc = f"{hostname}:{port}"

    query = [
        (key, value)
        for key, value in parse_qsl(parts.query, keep_blank_values=True)
        if key.lower() not in _TRACKING_QUERY_KEYS and not key.lower().startswith("utm_")
    ]

    return urlunsplit(
        (
            parts.scheme.lower(),
            netloc,
            parts.path.rstrip("/") or "/",
            urlencode(query, doseq=True),
            "",
        )
    )


def build_job(job_request: JobPreviewRequest) -> Job:
    source_url = str(job_request.source_url) if job_request.source_url else None
    return Job(
        source=job_request.source,
        source_url=source_url,
        normalized_source_url=normalize_source_url(source_url),
        title=job_request.title,
        company=job_request.company,
        location=job_request.location,
        work_mode=job_request.work_mode,
        description=job_request.description,
    )
