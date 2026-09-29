"""
SQLAlchemy models for Trip and TripMember.

Trip      — represents a planned group trip.
TripMember — join table recording who belongs to which trip and their role.
"""

from datetime import datetime, timezone
from sqlalchemy import (
    Column, Integer, String, Text, Date, DateTime,
    ForeignKey, UniqueConstraint, Enum as SAEnum
)
import enum
from sqlalchemy.orm import relationship

from app.database import Base


class MemberRole(str, enum.Enum):
    """Role of a user within a trip."""
    host = "host"
    member = "member"


class Trip(Base):
    """A group trip created by one user (the host)."""

    __tablename__ = "trips"

    id = Column(Integer, primary_key=True, autoincrement=True, index=True)

    # Trip details
    title       = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    destination = Column(String(200), nullable=False)
    start_date  = Column(Date, nullable=False)
    end_date    = Column(Date, nullable=False)

    # Creator / host (never trust user-supplied value — set server-side)
    host_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)

    # Unique 8-char alphanumeric code used to join the trip
    trip_code = Column(String(8), unique=True, nullable=False, index=True)

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
    host    = relationship("User", foreign_keys=[host_id])
    members = relationship("TripMember", back_populates="trip", cascade="all, delete-orphan")


class TripMember(Base):
    """Membership record linking a User to a Trip."""

    __tablename__ = "trip_members"

    id      = Column(Integer, primary_key=True, autoincrement=True, index=True)
    trip_id = Column(Integer, ForeignKey("trips.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    role    = Column(SAEnum(MemberRole), default=MemberRole.member, nullable=False)

    joined_at = Column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    # Prevent duplicate memberships at the DB level
    __table_args__ = (
        UniqueConstraint("trip_id", "user_id", name="uq_trip_member"),
    )

    # Relationships
    trip = relationship("Trip", back_populates="members")
    user = relationship("User")
