"""Add application follow-up fields to jobs.

Revision ID: 20261109_02
Revises: 20261109_01
Create Date: 2026-11-09
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "20261109_02"
down_revision: Union[str, None] = "20261109_01"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("jobs", sa.Column("applied_date", sa.Date(), nullable=True))
    op.add_column("jobs", sa.Column("notes", sa.Text(), nullable=True))
    op.add_column("jobs", sa.Column("follow_up_date", sa.Date(), nullable=True))


def downgrade() -> None:
    op.drop_column("jobs", "follow_up_date")
    op.drop_column("jobs", "notes")
    op.drop_column("jobs", "applied_date")
