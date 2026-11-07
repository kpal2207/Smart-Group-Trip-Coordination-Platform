from datetime import date, datetime, timedelta, timezone

import pytest
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError, StatementError

from app.database import Base
from app.models import ConvoyTelemetry, Trip, User


def _create_parents(db):
    user = User(
        name="Telemetry User",
        email="telemetry@example.com",
        password_hash="not-used-by-this-test",
    )
    db.add(user)
    db.flush()

    trip = Trip(
        title="Telemetry Test Trip",
        destination="Test destination",
        start_date=date(2026, 11, 1),
        end_date=date(2026, 11, 2),
        host_id=user.id,
        trip_code="TEL12345",
    )
    db.add(trip)
    db.flush()
    return user, trip


def test_create_telemetry_record_and_resolve_relationships(db):
    user, trip = _create_parents(db)
    record = ConvoyTelemetry(
        trip_id=trip.id,
        user_id=user.id,
        latitude=37.7749,
        longitude=-122.4194,
        speed_kmh=24.5,
    )

    db.add(record)
    db.commit()
    db.refresh(record)

    assert record.id is not None
    assert record.trip_id == trip.id
    assert record.user_id == user.id
    assert record.trip.id == trip.id
    assert record.user.id == user.id
    assert record.is_ghost_mode is False


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("latitude", 90.01),
        ("latitude", -90.01),
        ("longitude", 180.01),
        ("longitude", -180.01),
        ("speed_kmh", -0.01),
        ("heading", -0.01),
        ("heading", 360.01),
    ],
)
def test_invalid_measurement_violates_database_constraint(db, field, value):
    user, trip = _create_parents(db)
    measurements = {
        "latitude": 37.0,
        "longitude": -122.0,
        "speed_kmh": 0.0,
    }
    measurements[field] = value
    record = ConvoyTelemetry(
        trip_id=trip.id,
        user_id=user.id,
        **measurements,
    )
    db.add(record)

    with pytest.raises(IntegrityError):
        db.flush()

    db.rollback()


def test_heading_can_be_omitted_while_speed_is_supplied(db):
    user, trip = _create_parents(db)
    record = ConvoyTelemetry(
        trip_id=trip.id,
        user_id=user.id,
        latitude=0,
        longitude=0,
        speed_kmh=24.5,
        heading=None,
    )

    db.add(record)
    db.commit()
    db.refresh(record)

    assert record.speed_kmh == pytest.approx(24.5)
    assert record.heading is None


def test_speed_is_required(db):
    user, trip = _create_parents(db)
    record = ConvoyTelemetry(
        trip_id=trip.id,
        user_id=user.id,
        latitude=0,
        longitude=0,
    )
    db.add(record)

    with pytest.raises(IntegrityError):
        db.flush()

    db.rollback()


def test_ghost_mode_uses_canonical_is_ghost_mode_attribute(db):
    user, trip = _create_parents(db)
    record = ConvoyTelemetry(
        trip_id=trip.id,
        user_id=user.id,
        latitude=1,
        longitude=2,
        speed_kmh=0.0,
    )
    db.add(record)
    db.flush()
    assert record.is_ghost_mode is False

    record.is_ghost_mode = True
    db.commit()
    db.refresh(record)
    assert record.is_ghost_mode is True


def test_recorded_at_default_round_trips_as_aware_utc_on_sqlite(db):
    user, trip = _create_parents(db)
    record = ConvoyTelemetry(
        trip_id=trip.id,
        user_id=user.id,
        latitude=1,
        longitude=2,
        speed_kmh=0.0,
    )

    db.add(record)
    db.flush()

    assert record.recorded_at.tzinfo is not None
    assert record.recorded_at.utcoffset().total_seconds() == 0
    stored_timestamp = db.execute(
        text("SELECT recorded_at FROM convoy_telemetry WHERE id = :id"),
        {"id": record.id},
    ).scalar_one()

    db.commit()
    db.refresh(record)

    assert datetime.fromisoformat(stored_timestamp) == record.recorded_at.replace(
        tzinfo=None
    )
    assert record.recorded_at.tzinfo is not None
    assert record.recorded_at.utcoffset().total_seconds() == 0
    assert ConvoyTelemetry.__table__.c.recorded_at.type.impl.timezone is True


def test_recorded_at_input_is_normalized_to_utc(db):
    user, trip = _create_parents(db)
    timestamp = datetime(2026, 11, 7, 12, 0, tzinfo=timezone(timedelta(hours=5, minutes=30)))
    record = ConvoyTelemetry(
        trip_id=trip.id,
        user_id=user.id,
        latitude=1,
        longitude=2,
        speed_kmh=0.0,
        recorded_at=timestamp,
    )

    db.add(record)
    db.commit()
    db.refresh(record)

    assert record.recorded_at == datetime(2026, 11, 7, 6, 30, tzinfo=timezone.utc)


def test_naive_recorded_at_is_rejected(db):
    user, trip = _create_parents(db)
    record = ConvoyTelemetry(
        trip_id=trip.id,
        user_id=user.id,
        latitude=1,
        longitude=2,
        speed_kmh=0.0,
        recorded_at=datetime(2026, 11, 7, 12, 0),
    )
    db.add(record)

    with pytest.raises(StatementError, match="timezone-aware") as error:
        db.flush()

    assert isinstance(error.value.orig, ValueError)

    db.rollback()


def test_foreign_keys_and_delete_behavior_match_parent_models():
    foreign_keys = {
        foreign_key.column.table.name: foreign_key.ondelete
        for foreign_key in ConvoyTelemetry.__table__.foreign_keys
    }

    assert foreign_keys == {"trips": "CASCADE", "users": "CASCADE"}


def test_composite_index_matches_latest_ping_order():
    index = next(
        index
        for index in ConvoyTelemetry.__table__.indexes
        if index.name == "ix_telemetry_trip_user_time"
    )

    assert [column.name for column in index.columns] == [
        "trip_id",
        "user_id",
        "recorded_at",
        "id",
    ]
    for expression, expected_column in zip(
        index.expressions[2:], ("recorded_at", "id")
    ):
        assert expression.element.name == expected_column
        assert expression.modifier.__name__ == "desc_op"
    assert not any(
        [column.name for column in candidate.columns] == ["trip_id"]
        for candidate in ConvoyTelemetry.__table__.indexes
    )


def test_user_foreign_key_has_a_separate_index():
    user_index = next(
        index
        for index in ConvoyTelemetry.__table__.indexes
        if index.name == "ix_convoy_telemetry_user_id"
    )

    assert [column.name for column in user_index.columns] == ["user_id"]


def test_model_is_registered_in_shared_metadata():
    assert Base.metadata.tables["convoy_telemetry"] is ConvoyTelemetry.__table__
