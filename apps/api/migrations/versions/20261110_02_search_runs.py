"""Persist recent job search queries and result counts.

Revision ID: 20261110_02
Revises: 20261110_01
Create Date: 2026-11-10
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "20261110_02"
down_revision: Union[str, None] = "20261110_01"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "search_runs",
        sa.Column("id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("source", sa.String(length=20), nullable=False),
        sa.Column("query", sa.String(length=120), server_default="", nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("result_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_search_runs_created_at", "search_runs", ["created_at"])
    op.alter_column("search_runs", "query", server_default=None)
    op.alter_column("search_runs", "result_count", server_default=None)


def downgrade() -> None:
    op.drop_index("ix_search_runs_created_at", table_name="search_runs")
    op.drop_table("search_runs")
