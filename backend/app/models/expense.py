"""
SQLAlchemy models for Expense Splitting, Disputes, Settlements, and Notifications.

Separate module created for the Expense Splitting feature.
Adheres strictly to the activity diagram workflow.
"""

from datetime import datetime, timezone
import enum
from sqlalchemy import (
    Column, Integer, String, Text, Numeric, Boolean,
    DateTime, ForeignKey, Enum as SAEnum
)
from sqlalchemy.orm import relationship

from app.database import Base


class ExpenseStatus(str, enum.Enum):
    pending_review = "pending_review"
    accepted = "accepted"
    disputed = "disputed"


class DisputeStatus(str, enum.Enum):
    pending = "pending"
    resolved_keep_split = "resolved_keep_split"
    resolved_modify_split = "resolved_modify_split"


class TripSettlementStatus(str, enum.Enum):
    active = "active"
    settled = "settled"


class ExpenseCategory(str, enum.Enum):
    food = "Food & Dining"
    transport = "Transport"
    accommodation = "Accommodation"
    activities = "Activities & Entertainment"
    shopping = "Shopping"
    groceries = "Groceries"
    other = "Other"


class Expense(Base):
    """
    Trip ledger entry for an expense paid by one member and split among members.
    """
    __tablename__ = "expenses"

    id = Column(Integer, primary_key=True, autoincrement=True, index=True)
    trip_id = Column(Integer, ForeignKey("trips.id", ondelete="CASCADE"), nullable=False, index=True)
    payer_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    
    title = Column(String(200), nullable=False)
    amount = Column(Numeric(10, 2), nullable=False)
    currency = Column(String(3), nullable=False, default="USD")
    category = Column(String(50), nullable=False, default=ExpenseCategory.other.value)
    description = Column(Text, nullable=True)
    
    status = Column(SAEnum(ExpenseStatus), default=ExpenseStatus.pending_review, nullable=False)
    
    created_at = Column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    updated_at = Column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    # Relationships
    trip = relationship("Trip", foreign_keys=[trip_id])
    payer = relationship("User", foreign_keys=[payer_id])
    splits = relationship("ExpenseSplit", back_populates="expense", cascade="all, delete-orphan")
    disputes = relationship("Dispute", back_populates="expense", cascade="all, delete-orphan")


class ExpenseSplit(Base):
    """
    Record of an individual member's share for a specific expense.
    """
    __tablename__ = "expense_splits"

    id = Column(Integer, primary_key=True, autoincrement=True, index=True)
    expense_id = Column(Integer, ForeignKey("expenses.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    
    share_amount = Column(Numeric(10, 2), nullable=False)
    is_accepted = Column(Boolean, default=False, nullable=False)

    created_at = Column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    expense = relationship("Expense", back_populates="splits")
    user = relationship("User", foreign_keys=[user_id])


class Dispute(Base):
    """
    A member's dispute raised against an expense split.
    Reviewed by the trip host.
    """
    __tablename__ = "disputes"

    id = Column(Integer, primary_key=True, autoincrement=True, index=True)
    expense_id = Column(Integer, ForeignKey("expenses.id", ondelete="CASCADE"), nullable=False, index=True)
    raised_by_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    
    reason = Column(Text, nullable=False)
    status = Column(SAEnum(DisputeStatus), default=DisputeStatus.pending, nullable=False)
    host_notes = Column(Text, nullable=True)
    
    created_at = Column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    resolved_at = Column(DateTime, nullable=True)

    expense = relationship("Expense", back_populates="disputes")
    raised_by = relationship("User", foreign_keys=[raised_by_id])


class Settlement(Base):
    """
    Payment record made by one member to another to settle debt.
    """
    __tablename__ = "settlements"

    id = Column(Integer, primary_key=True, autoincrement=True, index=True)
    trip_id = Column(Integer, ForeignKey("trips.id", ondelete="CASCADE"), nullable=False, index=True)
    payer_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    payee_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    
    amount = Column(Numeric(10, 2), nullable=False)
    currency = Column(String(3), nullable=False, default="USD")
    notes = Column(String(255), nullable=True)
    
    created_at = Column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    trip = relationship("Trip", foreign_keys=[trip_id])
    payer = relationship("User", foreign_keys=[payer_id])
    payee = relationship("User", foreign_keys=[payee_id])


class Notification(Base):
    """
    Notifications dispatched to affected members or the trip host.
    """
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, autoincrement=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    trip_id = Column(Integer, ForeignKey("trips.id", ondelete="CASCADE"), nullable=False, index=True)
    expense_id = Column(Integer, ForeignKey("expenses.id", ondelete="SET NULL"), nullable=True, index=True)
    
    message = Column(Text, nullable=False)
    notification_type = Column(String(50), nullable=False)  # expense_added, disputed, dispute_resolved, settlement_made, trip_settled
    is_read = Column(Boolean, default=False, nullable=False)
    
    created_at = Column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    user = relationship("User", foreign_keys=[user_id])
    trip = relationship("Trip", foreign_keys=[trip_id])


class TripSettlementState(Base):
    """
    Tracks overall settlement status for a trip (active vs. settled/finished)
    without mutating the existing Trip model.
    """
    __tablename__ = "trip_settlement_states"

    trip_id = Column(Integer, ForeignKey("trips.id", ondelete="CASCADE"), primary_key=True)
    status = Column(SAEnum(TripSettlementStatus), default=TripSettlementStatus.active, nullable=False)
    settled_at = Column(DateTime, nullable=True)
    
    updated_at = Column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    trip = relationship("Trip", foreign_keys=[trip_id])
