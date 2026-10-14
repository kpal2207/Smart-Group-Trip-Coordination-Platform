"""
Trip API router — Sprint 1 endpoints.

All endpoints require a valid JWT (get_current_user dependency).
The trip code produced on creation can be shared as a link or entered manually;
both flows resolve to the same join endpoint.

Prefix:  /trips
Tags:    Trips
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies.auth import get_current_user
from app.models.user import User
from app.schemas.trip import TripCreate, TripResponse, TripJoin, JoinResponse, MemberResponse
from app.services.trip import create_trip, join_trip_by_code

router = APIRouter(prefix="/trips", tags=["Trips"])


# ---------------------------------------------------------------------------
# POST /trips  — create a new trip
# ---------------------------------------------------------------------------

@router.post("/", response_model=TripResponse, status_code=status.HTTP_201_CREATED)
def create_new_trip(
    trip_data: TripCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Create a new trip. The authenticated user automatically becomes the host.

    A unique 8-character trip code is generated server-side and returned
    in the response. Share it (or a link containing it) with others so they
    can join.
    """
    trip = create_trip(db, trip_data, current_user)
    return trip


# ---------------------------------------------------------------------------
# POST /trips/join  — join via JSON body  {"trip_code": "ABC12345"}
# ---------------------------------------------------------------------------

@router.post("/join", response_model=JoinResponse, status_code=status.HTTP_200_OK)
def join_trip(
    payload: TripJoin,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Join a trip using its unique code.

    Returns the trip details and the new membership record.
    Rejects duplicate memberships (409) and invalid codes (404).
    """
    trip, membership = join_trip_by_code(db, payload.trip_code, current_user)
    return JoinResponse(
        message="Successfully joined the trip.",
        trip=TripResponse.model_validate(trip),
        membership=MemberResponse.model_validate(membership),
    )


# ---------------------------------------------------------------------------
# GET /trips/join/{trip_code}  — join via shareable link
#
# Frontend route: /trips/join/<code>  →  GET /trips/join/<code>
# This resolves the code and performs the join, consistent with the link
# the host shares.  The frontend can also POST to /trips/join with the code;
# both routes call the same service function.
# ---------------------------------------------------------------------------

@router.get("/join/{trip_code}", response_model=JoinResponse, status_code=status.HTTP_200_OK)
def join_trip_via_link(
    trip_code: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Join a trip by following a shareable link that contains the code.

    Functionally identical to POST /trips/join — the frontend can redirect
    the user here after they click the shared link.
    """
    trip, membership = join_trip_by_code(db, trip_code, current_user)
    return JoinResponse(
        message="Successfully joined the trip.",
        trip=TripResponse.model_validate(trip),
        membership=MemberResponse.model_validate(membership),
    )


# ---------------------------------------------------------------------------
# GET /trips/  — list trips for the current user
# ---------------------------------------------------------------------------

@router.get("/", response_model=list[TripResponse])
def list_my_trips(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Return all trips the authenticated user belongs to (as host or member).
    """
    from app.models.trip import Trip, TripMember
    trips = (
        db.query(Trip)
        .join(TripMember, TripMember.trip_id == Trip.id)
        .filter(TripMember.user_id == current_user.id)
        .all()
    )
    return trips


# ---------------------------------------------------------------------------
# GET /trips/{trip_id}  — get a single trip by ID
# ---------------------------------------------------------------------------

@router.get("/{trip_id}", response_model=TripResponse)
def get_trip(
    trip_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Return details for a single trip the user is a member of.
    """
    from app.models.trip import Trip, TripMember
    trip = (
        db.query(Trip)
        .join(TripMember, TripMember.trip_id == Trip.id)
        .filter(Trip.id == trip_id, TripMember.user_id == current_user.id)
        .first()
    )
    if trip is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Trip not found or you are not a member.",
        )
    return trip
