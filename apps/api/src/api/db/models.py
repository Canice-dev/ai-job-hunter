from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import BigInteger, DateTime, ForeignKey, Index, JSON, String, Text, UniqueConstraint, Uuid, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class Job(Base):
    __tablename__ = "jobs"
    __table_args__ = (
        UniqueConstraint(
            "source",
            "normalized_source_url",
            name="uq_jobs_source_normalized_url",
        ),
        Index("ix_jobs_created_at", "created_at"),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    source: Mapped[str] = mapped_column(String(20), nullable=False)
    source_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    normalized_source_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    title: Mapped[str | None] = mapped_column(String(300), nullable=True)
    company: Mapped[str | None] = mapped_column(String(300), nullable=True)
    location: Mapped[str | None] = mapped_column(String(300), nullable=True)
    work_mode: Mapped[str] = mapped_column(String(20), nullable=False, default="unknown")
    description: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="new", index=True)
    match_score: Mapped[int | None] = mapped_column(nullable=True)
    match_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    match_strengths: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    match_gaps: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    match_scored_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    match_profile_confirmed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )


class CVDocument(Base):
    __tablename__ = "cv_documents"
    __table_args__ = (Index("ix_cv_documents_created_at", "created_at"),)

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    original_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    storage_key: Mapped[str] = mapped_column(String(80), nullable=False, unique=True)
    file_format: Mapped[str] = mapped_column(String(10), nullable=False)
    file_size: Mapped[int] = mapped_column(nullable=False)
    extracted_text: Mapped[str] = mapped_column(Text, nullable=False)
    profile_draft: Mapped[dict[str, object]] = mapped_column(JSON, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class Profile(Base):
    __tablename__ = "profiles"

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    cv_document_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("cv_documents.id", ondelete="CASCADE"),
        nullable=False,
    )
    facts: Mapped[dict[str, object]] = mapped_column(JSON, nullable=False)
    confirmed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class TelegramLink(Base):
    __tablename__ = "telegram_links"

    owner_key: Mapped[str] = mapped_column(String(20), primary_key=True, default="owner")
    chat_id: Mapped[int] = mapped_column(BigInteger, nullable=False, unique=True)
    linked_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class TelegramLinkCode(Base):
    __tablename__ = "telegram_link_codes"

    code_digest: Mapped[str] = mapped_column(String(64), primary_key=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
