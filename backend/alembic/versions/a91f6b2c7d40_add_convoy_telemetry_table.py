"""add convoy telemetry table

Revision ID: a91f6b2c7d40
Revises: e87b2190f331
Create Date: 2026-11-09

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision: str = "a91f6b2c7d40"
down_revision: Union[str, None] = "e87b2190f331"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "convoy_telemetry",
        sa.Column(
            "id",
            sa.BigInteger().with_variant(sa.Integer(), "sqlite"),
            autoincrement=True,
            nullable=False,
        ),
        sa.Column("trip_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("latitude", sa.Numeric(precision=10, scale=8), nullable=False),
        sa.Column("longitude", sa.Numeric(precision=11, scale=8), nullable=False),
        sa.Column("speed_kmh", sa.Float(), nullable=False),
        sa.Column("heading", sa.Numeric(precision=5, scale=2), nullable=True),
        sa.Column(
            "is_ghost_mode",
            sa.Boolean(),
            server_default=sa.text("false"),
            nullable=False,
        ),
        sa.Column(
            "recorded_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "latitude >= -90 AND latitude <= 90",
            name="ck_convoy_telemetry_latitude_range",
        ),
        sa.CheckConstraint(
            "longitude >= -180 AND longitude <= 180",
            name="ck_convoy_telemetry_longitude_range",
        ),
        sa.CheckConstraint(
            "speed_kmh >= 0",
            name="ck_convoy_telemetry_speed_nonnegative",
        ),
        sa.CheckConstraint(
            "heading IS NULL OR (heading >= 0 AND heading <= 360)",
            name="ck_convoy_telemetry_heading_range",
        ),
        sa.ForeignKeyConstraint(["trip_id"], ["trips.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_telemetry_trip_user_time",
        "convoy_telemetry",
        [
            "trip_id",
            "user_id",
            sa.text("recorded_at DESC"),
            sa.text("id DESC"),
        ],
        unique=False,
    )
    op.create_index(
        "ix_convoy_telemetry_user_id",
        "convoy_telemetry",
        ["user_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_convoy_telemetry_user_id",
        table_name="convoy_telemetry",
    )
    op.drop_index(
        "ix_telemetry_trip_user_time",
        table_name="convoy_telemetry",
    )
    op.drop_table("convoy_telemetry")
