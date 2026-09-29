"""
Business logic for Trip creation and joining.

All ownership is established server-side from the authenticated user's ID;
no user-supplied host_id is ever trusted.
"""

import secrets
import string

from sqlalchemy.orm import Session
from fastapi import HTTPException, status

from app.models.trip import Trip, TripMember, MemberRole
from app.models.user import User
from app.schemas.trip import TripCreate


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_CODE_ALPHABET = string.ascii_uppercase + string.digits  # 36 chars → ~2.8 T combos


def _generate_trip_code(length: int = 8) -> str:
    """Return a cryptographically-random uppercase alphanumeric code."""
    return "".join(secrets.choice(_CODE_ALPHABET) for _ in range(length))


def _unique_trip_code(db: Session, max_attempts: int = 10) -> str:
    """Generate a trip code guaranteed to be unique in the database."""
    for _ in range(max_attempts):
        code = _generate_trip_code()
        if not db.query(Trip).filter(Trip.trip_code == code).first():
            return code
    raise RuntimeError("Failed to generate a unique trip code — please retry.")


# ---------------------------------------------------------------------------
# Trip creation
# ---------------------------------------------------------------------------

def create_trip(db: Session, trip_data: TripCreate, host: User) -> Trip:
    """
    Create a new Trip and add the host as the first TripMember (role=host).

    The host_id is taken from the authenticated user object, never from
    the request body.
    """
    code = _unique_trip_code(db)

    trip = Trip(
        title=trip_data.title,
        description=trip_data.description,
        destination=trip_data.destination,
        start_date=trip_data.start_date,
        end_date=trip_data.end_date,
        host_id=host.id,
        trip_code=code,
    )
    db.add(trip)
    db.flush()  # assign trip.id without committing yet

    # Automatically enrol the creator as host member
    host_membership = TripMember(
        trip_id=trip.id,
        user_id=host.id,
        role=MemberRole.host,
    )
    db.add(host_membership)
    db.commit()
    db.refresh(trip)
    return trip


# ---------------------------------------------------------------------------
# Trip joining
# ---------------------------------------------------------------------------

def join_trip_by_code(db: Session, trip_code: str, current_user: User) -> tuple[Trip, TripMember]:
    """
    Add *current_user* to the trip identified by *trip_code*.

    Returns (trip, membership).

    Raises:
        404 — trip code not found
        409 — user is already a member
    """
    trip = db.query(Trip).filter(Trip.trip_code == trip_code.upper()).first()
    if trip is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Trip not found. Check the code and try again.",
        )

    existing = (
        db.query(TripMember)
        .filter(TripMember.trip_id == trip.id, TripMember.user_id == current_user.id)
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="You are already a member of this trip.",
        )

    membership = TripMember(
        trip_id=trip.id,
        user_id=current_user.id,
        role=MemberRole.member,
    )
    db.add(membership)
    db.commit()
    db.refresh(membership)
    db.refresh(trip)
    return trip, membership
