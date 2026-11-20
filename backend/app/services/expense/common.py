"""
Shared helpers for trip membership verification, settlement state, and member projections.
"""

from sqlalchemy.orm import Session
from fastapi import HTTPException, status

from app.models.user import User
from app.models.trip import Trip, TripMember
from app.models.expense import TripSettlementState, TripSettlementStatus
from app.schemas.expense import TripMemberItem


def get_trip_and_verify_membership(db: Session, trip_id: int, current_user: User) -> tuple[Trip, TripMember]:
    """
    Ensure the trip exists and the current user is an enrolled member.
    """
    trip = db.query(Trip).filter(Trip.id == trip_id).first()
    if not trip:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Trip not found.")

    membership = db.query(TripMember).filter(
        TripMember.trip_id == trip_id,
        TripMember.user_id == current_user.id
    ).first()

    if not membership:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not a member of this trip."
        )

    return trip, membership


def get_or_create_settlement_state(db: Session, trip_id: int) -> TripSettlementState:
    """
    Retrieve or initialize the TripSettlementState record for a trip.
    """
    state = db.query(TripSettlementState).filter(TripSettlementState.trip_id == trip_id).first()
    if not state:
        state = TripSettlementState(
            trip_id=trip_id,
            status=TripSettlementStatus.active
        )
        db.add(state)
        db.flush()
    return state


def get_trip_members_list(db: Session, trip_id: int) -> list[TripMemberItem]:
    """
    Retrieve all enrolled members of a trip with their profile details.
    """
    members = (
        db.query(TripMember, User)
        .join(User, TripMember.user_id == User.id)
        .filter(TripMember.trip_id == trip_id)
        .all()
    )
    return [
        TripMemberItem(
            id=tm.id,
            user_id=u.id,
            name=u.name,
            email=u.email,
            role=tm.role.value,
        )
        for tm, u in members
    ]
