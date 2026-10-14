"""add expense management tables

Revision ID: e87b2190f331
Revises: c431288f5de9
Create Date: 2026-09-30 22:45:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'e87b2190f331'
down_revision = 'c431288f5de9'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Expenses
    op.create_table(
        'expenses',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('trip_id', sa.Integer(), nullable=False),
        sa.Column('payer_id', sa.Integer(), nullable=False),
        sa.Column('title', sa.String(length=200), nullable=False),
        sa.Column('amount', sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column('currency', sa.String(length=3), nullable=False, server_default='USD'),
        sa.Column('category', sa.String(length=50), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('status', sa.Enum('pending_review', 'accepted', 'disputed', name='expensestatus'), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['payer_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['trip_id'], ['trips.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_expenses_id'), 'expenses', ['id'], unique=False)
    op.create_index(op.f('ix_expenses_payer_id'), 'expenses', ['payer_id'], unique=False)
    op.create_index(op.f('ix_expenses_trip_id'), 'expenses', ['trip_id'], unique=False)

    # 2. Expense Splits
    op.create_table(
        'expense_splits',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('expense_id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('share_amount', sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column('is_accepted', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['expense_id'], ['expenses.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_expense_splits_id'), 'expense_splits', ['id'], unique=False)
    op.create_index(op.f('ix_expense_splits_expense_id'), 'expense_splits', ['expense_id'], unique=False)
    op.create_index(op.f('ix_expense_splits_user_id'), 'expense_splits', ['user_id'], unique=False)

    # 3. Disputes
    op.create_table(
        'disputes',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('expense_id', sa.Integer(), nullable=False),
        sa.Column('raised_by_id', sa.Integer(), nullable=False),
        sa.Column('reason', sa.Text(), nullable=False),
        sa.Column('status', sa.Enum('pending', 'resolved_keep_split', 'resolved_modify_split', name='disputestatus'), nullable=False),
        sa.Column('host_notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('resolved_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['expense_id'], ['expenses.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['raised_by_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_disputes_id'), 'disputes', ['id'], unique=False)
    op.create_index(op.f('ix_disputes_expense_id'), 'disputes', ['expense_id'], unique=False)
    op.create_index(op.f('ix_disputes_raised_by_id'), 'disputes', ['raised_by_id'], unique=False)

    # 4. Settlements
    op.create_table(
        'settlements',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('trip_id', sa.Integer(), nullable=False),
        sa.Column('payer_id', sa.Integer(), nullable=False),
        sa.Column('payee_id', sa.Integer(), nullable=False),
        sa.Column('amount', sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column('currency', sa.String(length=3), nullable=False, server_default='USD'),
        sa.Column('notes', sa.String(length=255), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['payee_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['payer_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['trip_id'], ['trips.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_settlements_id'), 'settlements', ['id'], unique=False)
    op.create_index(op.f('ix_settlements_trip_id'), 'settlements', ['trip_id'], unique=False)
    op.create_index(op.f('ix_settlements_payer_id'), 'settlements', ['payer_id'], unique=False)
    op.create_index(op.f('ix_settlements_payee_id'), 'settlements', ['payee_id'], unique=False)

    # 5. Notifications
    op.create_table(
        'notifications',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('trip_id', sa.Integer(), nullable=False),
        sa.Column('expense_id', sa.Integer(), nullable=True),
        sa.Column('message', sa.Text(), nullable=False),
        sa.Column('notification_type', sa.String(length=50), nullable=False),
        sa.Column('is_read', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['expense_id'], ['expenses.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['trip_id'], ['trips.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_notifications_id'), 'notifications', ['id'], unique=False)
    op.create_index(op.f('ix_notifications_user_id'), 'notifications', ['user_id'], unique=False)
    op.create_index(op.f('ix_notifications_trip_id'), 'notifications', ['trip_id'], unique=False)

    # 6. Trip Settlement States
    op.create_table(
        'trip_settlement_states',
        sa.Column('trip_id', sa.Integer(), nullable=False),
        sa.Column('status', sa.Enum('active', 'settled', name='tripsettlementstatus'), nullable=False),
        sa.Column('settled_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['trip_id'], ['trips.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('trip_id')
    )


def downgrade() -> None:
    op.drop_table('trip_settlement_states')
    op.drop_table('notifications')
    op.drop_table('settlements')
    op.drop_table('disputes')
    op.drop_table('expense_splits')
    op.drop_table('expenses')
    op.execute('DROP TYPE IF EXISTS tripsettlementstatus')
    op.execute('DROP TYPE IF EXISTS disputestatus')
    op.execute('DROP TYPE IF EXISTS expensestatus')
