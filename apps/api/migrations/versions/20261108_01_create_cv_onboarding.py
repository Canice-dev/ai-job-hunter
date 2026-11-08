"""Create private CV metadata and confirmed profile tables.

Revision ID: 20261108_01
Revises: 20261107_01
Create Date: 2026-11-08
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "20261108_01"
down_revision: Union[str, None] = "20261107_01"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "cv_documents",
        sa.Column("id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("original_filename", sa.String(length=255), nullable=False),
        sa.Column("storage_key", sa.String(length=80), nullable=False),
        sa.Column("file_format", sa.String(length=10), nullable=False),
        sa.Column("file_size", sa.Integer(), nullable=False),
        sa.Column("extracted_text", sa.Text(), nullable=False),
        sa.Column("profile_draft", sa.JSON(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("storage_key", name="uq_cv_documents_storage_key"),
    )
    op.create_index("ix_cv_documents_created_at", "cv_documents", ["created_at"])
    op.create_table(
        "profiles",
        sa.Column("id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("cv_document_id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("facts", sa.JSON(), nullable=False),
        sa.Column("confirmed_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(
            ["cv_document_id"],
            ["cv_documents.id"],
            name="fk_profiles_cv_document_id_cv_documents",
            ondelete="CASCADE",
        ),
    )


def downgrade() -> None:
    op.drop_table("profiles")
    op.drop_index("ix_cv_documents_created_at", table_name="cv_documents")
    op.drop_table("cv_documents")
