from io import BytesIO
import os
from pathlib import Path
import re
from uuid import uuid4
import zipfile

from docx import Document
from fastapi import HTTPException, UploadFile, status
from pypdf import PdfReader

MAX_CV_SIZE = 10 * 1024 * 1024
MAX_EXTRACTED_CHARACTERS = 150_000
MAX_DOCX_UNCOMPRESSED_SIZE = 30 * 1024 * 1024
ALLOWED_TYPES = {
    "application/pdf": "pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
}

SECTION_NAMES = {
    "summary": {"summary", "profile", "professional summary", "objective", "about me"},
    "skills": {"skills", "technical skills", "core skills", "technologies", "competencies"},
    "experience": {"experience", "work experience", "professional experience", "employment history"},
    "education": {"education", "academic background", "qualifications"},
}


def storage_root() -> Path:
    configured = os.getenv("CV_STORAGE_DIR", ".local-data/cvs")
    root = Path(configured)
    if not root.is_absolute():
        root = Path(__file__).resolve().parents[3] / root
    return root.resolve()


def storage_path(storage_key: str) -> Path:
    if not re.fullmatch(r"[0-9a-f-]{36}\.(pdf|docx)", storage_key):
        raise ValueError("Invalid CV storage key.")
    root = storage_root()
    path = (root / storage_key).resolve()
    if path.parent != root:
        raise ValueError("Invalid CV storage path.")
    return path


async def read_and_extract(upload: UploadFile) -> tuple[str, str, str, bytes, str]:
    filename = Path(upload.filename or "resume").name
    suffix = Path(filename).suffix.lower()
    content_type_format = ALLOWED_TYPES.get(upload.content_type or "")
    suffix_format = {".pdf": "pdf", ".docx": "docx"}.get(suffix)
    if not suffix_format or suffix_format != content_type_format:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Upload a PDF or DOCX CV with the matching file type.",
        )

    data = await upload.read(MAX_CV_SIZE + 1)
    if not data:
        raise HTTPException(status_code=400, detail="The uploaded file is empty.")
    if len(data) > MAX_CV_SIZE:
        raise HTTPException(status_code=413, detail="CV files must be 10 MB or smaller.")

    if suffix_format == "pdf":
        if not data.startswith(b"%PDF-"):
            raise HTTPException(status_code=415, detail="The uploaded file is not a valid PDF.")
        try:
            reader = PdfReader(BytesIO(data), strict=True)
            if reader.is_encrypted:
                raise HTTPException(
                    status_code=422,
                    detail="Password-protected PDFs are not supported. Upload an unlocked copy.",
                )
            text = "\n".join(page.extract_text() or "" for page in reader.pages)
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(
                status_code=422, detail="Could not read this PDF. Try exporting it again."
            ) from exc
    else:
        if not data.startswith(b"PK\x03\x04"):
            raise HTTPException(status_code=415, detail="The uploaded file is not a valid DOCX.")
        try:
            with zipfile.ZipFile(BytesIO(data)) as archive:
                entries = archive.infolist()
                expanded_size = sum(entry.file_size for entry in entries)
                if len(entries) > 2000 or expanded_size > MAX_DOCX_UNCOMPRESSED_SIZE:
                    raise HTTPException(status_code=413, detail="This DOCX file is too large to process.")
                if "word/document.xml" not in archive.namelist():
                    raise HTTPException(status_code=422, detail="This DOCX file has no document content.")
            document = Document(BytesIO(data))
            paragraphs = [paragraph.text for paragraph in document.paragraphs]
            for table in document.tables:
                paragraphs.extend(
                    " | ".join(cell.text for cell in row.cells) for row in table.rows
                )
            text = "\n".join(paragraphs)
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(
                status_code=422, detail="Could not read this DOCX. Try exporting it again."
            ) from exc

    text = text.replace("\x00", "").strip()
    if not text:
        raise HTTPException(
            status_code=422,
            detail="No selectable text was found. Scanned CVs need OCR, which is not available yet.",
        )
    return filename[:255], suffix_format, text[:MAX_EXTRACTED_CHARACTERS], data, content_type_format


def _section_heading(line: str) -> str | None:
    normalized = re.sub(r"[^a-z ]", "", line.casefold()).strip()
    for section, headings in SECTION_NAMES.items():
        if normalized in headings:
            return section
    return None


def extract_profile_draft(text: str) -> dict[str, object]:
    """Extract a modest, editable draft from text without asserting new facts."""
    lines = [re.sub(r"\s+", " ", line).strip(" \t•·-–") for line in text.splitlines()]
    lines = [line for line in lines if line]
    email_match = re.search(r"[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}", text)
    phone_match = re.search(r"(?<!\w)(?:\+?\d[\d ().-]{7,}\d)(?!\w)", text)
    first_text_line = next(
        (line for line in lines[:8] if not re.search(r"@|https?://|linkedin\.com", line, re.I)),
        "",
    )

    sections: dict[str, list[str]] = {name: [] for name in SECTION_NAMES}
    active_section: str | None = None
    for line in lines:
        heading = _section_heading(line)
        if heading:
            active_section = heading
        elif active_section:
            sections[active_section].append(line)

    summary = " ".join(sections["summary"][:5])[:2000]
    skill_lines = sections["skills"][:30]
    skills: list[str] = []
    for line in skill_lines:
        skills.extend(part.strip() for part in re.split(r"[,|•·]", line) if part.strip())

    return {
        "full_name": first_text_line[:200],
        "email": email_match.group(0) if email_match else "",
        "phone": phone_match.group(0)[:80] if phone_match else "",
        "location": "",
        "summary": summary,
        "skills": list(dict.fromkeys(skills))[:100],
        "experience": sections["experience"][:100],
        "education": sections["education"][:100],
    }


def store_upload(file_format: str, data: bytes) -> tuple[str, Path]:
    root = storage_root()
    root.mkdir(parents=True, exist_ok=True)
    storage_key = f"{uuid4()}.{file_format}"
    path = storage_path(storage_key)
    path.write_bytes(data)
    try:
        path.chmod(0o600)
    except OSError:
        # ACLs on some local filesystems do not support chmod.
        pass
    return storage_key, path
