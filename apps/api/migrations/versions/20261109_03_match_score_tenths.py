"""Change cached match scores from percentages to one-decimal 1-5 ratings.

Revision ID: 20261109_03
Revises: 20261109_02
Create Date: 2026-11-09
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "20261109_03"
down_revision: Union[str, None] = "20261109_02"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    connection = op.get_bind()
    previous_scores = connection.execute(
        sa.text("SELECT id, match_score FROM jobs WHERE match_score IS NOT NULL")
    ).all()

    op.alter_column(
        "jobs",
        "match_score",
        existing_type=sa.Integer(),
        type_=sa.Float(),
        existing_nullable=True,
    )
    for job_id, old_score in previous_scores:
        rating = round(1.0 + float(old_score) / 25.0, 1)
        connection.execute(
            sa.text("UPDATE jobs SET match_score = :score WHERE id = :job_id"),
            {"score": rating, "job_id": job_id},
        )


def downgrade() -> None:
    connection = op.get_bind()
    current_scores = connection.execute(
        sa.text("SELECT id, match_score FROM jobs WHERE match_score IS NOT NULL")
    ).all()
    for job_id, rating in current_scores:
        percentage = round((float(rating) - 1.0) * 25.0)
        connection.execute(
            sa.text("UPDATE jobs SET match_score = :score WHERE id = :job_id"),
            {"score": percentage, "job_id": job_id},
        )

    op.alter_column(
        "jobs",
        "match_score",
        existing_type=sa.Float(),
        type_=sa.Integer(),
        existing_nullable=True,
    )
