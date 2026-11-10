"""Store generated application materials per job and confirmed CV.

Revision ID: 20261110_01
Revises: 20261109_03
Create Date: 2026-11-10
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "20261110_01"
down_revision: Union[str, None] = "20261109_03"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "application_materials",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("job_id", sa.Uuid(), nullable=False),
        sa.Column("cv_document_id", sa.Uuid(), nullable=False),
        sa.Column("profile_confirmed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("content", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["cv_document_id"], ["cv_documents.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["job_id"], ["jobs.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("job_id", name="uq_application_materials_job_id"),
    )


def downgrade() -> None:
    op.drop_table("application_materials")
