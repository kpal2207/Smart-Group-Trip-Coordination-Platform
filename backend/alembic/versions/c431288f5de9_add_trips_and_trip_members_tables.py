"""add_trips_and_trip_members_tables

Revision ID: c431288f5de9
Revises: 
Create Date: 2026-09-29 21:26:24.382313

Sprint 1 — Trip Generation & Joining
Creates:
  - trips         (id, title, description, destination, start_date, end_date,
                   host_id FK→users.id, trip_code UNIQUE, created_at, updated_at)
  - trip_members  (id, trip_id FK→trips.id, user_id FK→users.id, role, joined_at)
  - Unique constraint on (trip_id, user_id) to prevent duplicate memberships
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'c431288f5de9'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'trips',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('title', sa.String(length=200), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('destination', sa.String(length=200), nullable=False),
        sa.Column('start_date', sa.Date(), nullable=False),
        sa.Column('end_date', sa.Date(), nullable=False),
        sa.Column('host_id', sa.Integer(), nullable=False),
        sa.Column('trip_code', sa.String(length=8), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['host_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('trip_code'),
    )
    op.create_index('ix_trips_id', 'trips', ['id'], unique=False)
    op.create_index('ix_trips_host_id', 'trips', ['host_id'], unique=False)
    op.create_index('ix_trips_trip_code', 'trips', ['trip_code'], unique=True)

    op.create_table(
        'trip_members',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('trip_id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column(
            'role',
            sa.Enum('host', 'member', name='memberrole'),
            nullable=False,
        ),
        sa.Column('joined_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['trip_id'], ['trips.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('trip_id', 'user_id', name='uq_trip_member'),
    )
    op.create_index('ix_trip_members_id', 'trip_members', ['id'], unique=False)
    op.create_index('ix_trip_members_trip_id', 'trip_members', ['trip_id'], unique=False)
    op.create_index('ix_trip_members_user_id', 'trip_members', ['user_id'], unique=False)


def downgrade() -> None:
    op.drop_index('ix_trip_members_user_id', table_name='trip_members')
    op.drop_index('ix_trip_members_trip_id', table_name='trip_members')
    op.drop_index('ix_trip_members_id', table_name='trip_members')
    op.drop_table('trip_members')
    op.execute("DROP TYPE IF EXISTS memberrole")

    op.drop_index('ix_trips_trip_code', table_name='trips')
    op.drop_index('ix_trips_host_id', table_name='trips')
    op.drop_index('ix_trips_id', table_name='trips')
    op.drop_table('trips')
