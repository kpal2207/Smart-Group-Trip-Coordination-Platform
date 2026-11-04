"""Authenticated REST endpoints for convoy location telemetry."""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import and_, func
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies.auth import get_current_user
from app.models.trip import TripMember
from app.models.user import User
from app.schemas.telemetry import (
    ConvoyLocationResponse,
    TelemetryPingCreate,
    TelemetryPingResponse,
)

router = APIRouter(prefix="/trips", tags=["Telemetry"])


def _telemetry_model():
    """Import the DBA-owned model when a telemetry request is served."""
    from app.models.convoy_telemetry import ConvoyTelemetry

    return ConvoyTelemetry


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
    """Persist one validated ping. Identity comes from the token, never body fields.

    Ghost Mode pings are retained, while coordinates are masked in every API
    response, including the submitting member's acknowledgement.
    """
    _require_trip_member(db, trip_id, current_user.id)
    Telemetry = _telemetry_model()
    ping = Telemetry(
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
    """Return each enrolled member, even when no telemetry ping exists.

    Fresh is at most 60 seconds old; stale is 60 seconds to 5 minutes; older
    or missing pings are unavailable. Ghost Mode always masks both coordinates
    and returns the explicit hidden status.
    """
    _require_trip_member(db, trip_id, current_user.id)
    Telemetry = _telemetry_model()

    latest_ids = (
        db.query(
            Telemetry.id.label("ping_id"),
            Telemetry.user_id.label("user_id"),
            func.row_number()
            .over(
                partition_by=Telemetry.user_id,
                order_by=(Telemetry.recorded_at.desc(), Telemetry.id.desc()),
            )
            .label("position"),
        )
        .filter(Telemetry.trip_id == trip_id)
        .subquery()
    )
    rows = (
        db.query(TripMember, User, Telemetry)
        .join(User, User.id == TripMember.user_id)
        .outerjoin(
            latest_ids,
            and_(
                latest_ids.c.user_id == TripMember.user_id,
                latest_ids.c.position == 1,
            ),
        )
        .outerjoin(Telemetry, Telemetry.id == latest_ids.c.ping_id)
        .filter(TripMember.trip_id == trip_id)
        .order_by(User.name.asc(), User.id.asc())
        .all()
    )

    now = datetime.now(timezone.utc)
    locations: list[ConvoyLocationResponse] = []
    for _membership, member, ping in rows:
        if ping is None:
            locations.append(ConvoyLocationResponse(
                user_id=member.id,
                name=member.name,
                latitude=None,
                longitude=None,
                speed_kmh=None,
                heading=None,
                is_ghost_mode=False,
                location_status="unavailable",
                recorded_at=None,
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

        coordinates_visible = location_status in {"fresh", "stale"}
        locations.append(ConvoyLocationResponse(
            user_id=member.id,
            name=member.name,
            latitude=ping.latitude if coordinates_visible else None,
            longitude=ping.longitude if coordinates_visible else None,
            speed_kmh=ping.speed_kmh,
            heading=ping.heading,
            is_ghost_mode=ping.is_ghost_mode,
            location_status=location_status,
            recorded_at=ping.recorded_at,
        ))
    return locations
