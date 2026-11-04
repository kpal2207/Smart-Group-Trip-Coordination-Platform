"""Authenticated REST endpoints for convoy location telemetry."""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import and_, func
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies.auth import get_current_user
from app.models.convoy_telemetry import ConvoyTelemetry
from app.models.trip import TripMember
from app.models.user import User
from app.schemas.telemetry import ConvoyLocationResponse, TelemetryPingCreate, TelemetryPingResponse

router = APIRouter(prefix="/trips", tags=["Telemetry"])


def _require_trip_member(db: Session, trip_id: int, user_id: int) -> None:
    membership = (
        db.query(TripMember.id)
        .filter(TripMember.trip_id == trip_id, TripMember.user_id == user_id)
        .first()
    )
    if membership is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You must be an active member of this trip.",
        )


@router.post(
    "/{trip_id}/telemetry",
    response_model=TelemetryPingResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Submit the authenticated member's latest GPS ping",
    responses={403: {"description": "Caller is not an active trip member."}},
)
def submit_telemetry(
    trip_id: int,
    payload: TelemetryPingCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TelemetryPingResponse:
    """Persist one validated location ping for the authenticated member.

    Coordinates, speed, and heading are range-checked by the request schema.
    User and trip IDs always come from authentication and the path, never from
    the request body. Ghost Mode pings are stored but their coordinates are
    masked in every API response.
    """
    _require_trip_member(db, trip_id, current_user.id)
    ping = ConvoyTelemetry(
        trip_id=trip_id,
        user_id=current_user.id,
        latitude=payload.latitude,
        longitude=payload.longitude,
        speed_kmh=payload.speed_kmh,
        heading=payload.heading,
        is_ghost_mode=payload.is_ghost_mode,
        recorded_at=datetime.now(timezone.utc),
    )
    db.add(ping)
    db.commit()
    db.refresh(ping)
    return TelemetryPingResponse(
        id=ping.id,
        trip_id=ping.trip_id,
        user_id=ping.user_id,
        latitude=None if ping.is_ghost_mode else ping.latitude,
        longitude=None if ping.is_ghost_mode else ping.longitude,
        speed_kmh=ping.speed_kmh,
        heading=ping.heading,
        is_ghost_mode=ping.is_ghost_mode,
        recorded_at=ping.recorded_at,
    )


@router.get(
    "/{trip_id}/convoy/locations",
    response_model=list[ConvoyLocationResponse],
    summary="List each trip member's latest location and freshness state",
    responses={403: {"description": "Caller is not an active trip member."}},
)
def get_convoy_locations(
    trip_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[ConvoyLocationResponse]:
    """Return one row per enrolled trip member, including members without pings.

    Fresh means at most 60 seconds old; stale means 60 seconds to 5 minutes;
    older or missing pings are unavailable. Ghost Mode always masks both
    coordinates and returns the explicit hidden status.
    """
    _require_trip_member(db, trip_id, current_user.id)

    latest_ids = (
        db.query(
            ConvoyTelemetry.id.label("ping_id"),
            func.row_number()
            .over(
                partition_by=ConvoyTelemetry.user_id,
                order_by=(ConvoyTelemetry.recorded_at.desc(), ConvoyTelemetry.id.desc()),
            )
            .label("position"),
        )
        .filter(ConvoyTelemetry.trip_id == trip_id)
        .subquery()
    )
    rows = (
        db.query(TripMember, User, ConvoyTelemetry)
        .join(User, User.id == TripMember.user_id)
        .outerjoin(
            latest_ids,
            and_(latest_ids.c.ping_id == ConvoyTelemetry.id, latest_ids.c.position == 1),
        )
        .outerjoin(ConvoyTelemetry, ConvoyTelemetry.id == latest_ids.c.ping_id)
        .filter(TripMember.trip_id == trip_id)
        .order_by(User.name.asc(), User.id.asc())
        .all()
    )

    now = datetime.now(timezone.utc)
    results: list[ConvoyLocationResponse] = []
    for _membership, member, ping in rows:
        if ping is None:
            results.append(ConvoyLocationResponse(
                user_id=member.id, name=member.name, latitude=None, longitude=None,
                speed_kmh=None, heading=None, is_ghost_mode=False,
                location_status="unavailable", recorded_at=None,
            ))
            continue

        if ping.is_ghost_mode:
            location_status = "hidden"
        else:
            recorded_at = ping.recorded_at
            comparison_now = now if recorded_at.tzinfo else now.replace(tzinfo=None)
            age_seconds = (comparison_now - recorded_at).total_seconds()
            if age_seconds <= 60:
                location_status = "fresh"
            elif age_seconds <= 300:
                location_status = "stale"
            else:
                location_status = "unavailable"

        is_visible = location_status in {"fresh", "stale"}
        results.append(ConvoyLocationResponse(
            user_id=member.id,
            name=member.name,
            latitude=ping.latitude if is_visible else None,
            longitude=ping.longitude if is_visible else None,
            speed_kmh=ping.speed_kmh,
            heading=ping.heading,
            is_ghost_mode=ping.is_ghost_mode,
            location_status=location_status,
            recorded_at=ping.recorded_at,
        ))
    return results
