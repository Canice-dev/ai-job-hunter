"""Persist AI job-match assessments.

Revision ID: 20261108_02
Revises: 20261108_01
Create Date: 2026-11-08
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "20261108_02"
down_revision: Union[str, None] = "20261108_01"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("jobs", sa.Column("match_score", sa.Integer(), nullable=True))
    op.add_column("jobs", sa.Column("match_summary", sa.Text(), nullable=True))
    op.add_column(
        "jobs",
        sa.Column("match_strengths", sa.JSON(), nullable=False, server_default="[]"),
    )
    op.add_column(
        "jobs",
        sa.Column("match_gaps", sa.JSON(), nullable=False, server_default="[]"),
    )
    op.add_column("jobs", sa.Column("match_scored_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column(
        "jobs",
        sa.Column("match_profile_confirmed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.alter_column("jobs", "match_strengths", server_default=None)
    op.alter_column("jobs", "match_gaps", server_default=None)


def downgrade() -> None:
    op.drop_column("jobs", "match_profile_confirmed_at")
    op.drop_column("jobs", "match_scored_at")
    op.drop_column("jobs", "match_gaps")
    op.drop_column("jobs", "match_strengths")
    op.drop_column("jobs", "match_summary")
    op.drop_column("jobs", "match_score")
