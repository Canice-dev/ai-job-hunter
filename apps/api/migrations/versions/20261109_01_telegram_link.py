"""Add Telegram owner link and expiring link codes.

Revision ID: 20261109_01
Revises: 20261108_02
Create Date: 2026-11-09
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "20261109_01"
down_revision: Union[str, None] = "20261108_02"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "telegram_links",
        sa.Column("owner_key", sa.String(length=20), nullable=False),
        sa.Column("chat_id", sa.BigInteger(), nullable=False),
        sa.Column(
            "linked_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.PrimaryKeyConstraint("owner_key"),
        sa.UniqueConstraint("chat_id", name="uq_telegram_links_chat_id"),
    )
    op.create_table(
        "telegram_link_codes",
        sa.Column("code_digest", sa.String(length=64), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("code_digest"),
    )


def downgrade() -> None:
    op.drop_table("telegram_link_codes")
    op.drop_table("telegram_links")
