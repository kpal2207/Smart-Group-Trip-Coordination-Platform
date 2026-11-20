"""Seed the Sprint 2 convoy demo data.

Run from the backend directory:
    python -m scripts.seed_convoy_data
    python -m scripts.seed_convoy_data --reset
    python -m scripts.seed_convoy_data --db-url sqlite:///./dev.db

The script creates/updates the four application users, one demo trip, four
memberships, and five telemetry pings. It does NOT create Supabase Auth
identities. Users are application records associated by email when an
authenticated Supabase user reaches the backend.

Reruns are idempotent. Telemetry for this dedicated demo trip is replaced on
each run so partial or stale seed data cannot accumulate.
"""

from __future__ import annotations

import argparse
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

# Make `app` importable when invoked as `python -m scripts.seed_convoy_data`
_backend_dir = Path(__file__).resolve().parent.parent
if str(_backend_dir) not in sys.path:
    sys.path.insert(0, str(_backend_dir))

from sqlalchemy import create_engine
from sqlalchemy.engine import make_url
from sqlalchemy.orm import sessionmaker

from app.database import Base, SQL_DATABASE_URL
from app.models import User, Trip, TripMember, MemberRole, ConvoyTelemetry


TRIP_CODE = "GOASP2DM"

SEED_USERS = [
    {
        "name": "Mrunali Rathod",
        "email": "mrunali@convoysync.dev",
        "password_hash": "supabase_managed",
    },
    {
        "name": "Kanika Pal",
        "email": "kanika@convoysync.dev",
        "password_hash": "supabase_managed",
    },
    {
        "name": "Manthan Kanetiya",
        "email": "manthan@convoysync.dev",
        "password_hash": "supabase_managed",
    },
    {
        "name": "Rahul Sharma",
        "email": "rahul@convoysync.dev",
        "password_hash": "supabase_managed",
    },
]

SEED_TRIP = {
    "title": "Ahmedabad → Goa Highway Sprint",
    "description": (
        "Sprint 2 demo trip seeded for the location-sharing demonstration. "
        "Four members, including one Ghost Mode member."
    ),
    "destination": "Goa",
    "start_date": datetime(2026, 11, 20).date(),
    "end_date": datetime(2026, 11, 22).date(),
    "trip_code": TRIP_CODE,
}

# (user_index, latitude, longitude, speed_kmh, heading, ghost_mode, minutes_ago)
SEED_PINGS = [
    (0, 21.1702, 72.8311, 85.0, 210.5, False, 0),    # Mrunali — fresh
    (0, 21.1690, 72.8295, 82.0, 210.0, False, 5),    # Mrunali — 5 min ago
    (1, 21.1550, 72.8200, 90.0, 212.0, False, 0),    # Kanika — fresh
    (2, 21.1400, 72.8100, 70.0, 215.0, True, 0),     # Manthan — Ghost Mode
    (3, 21.0900, 72.7800, 0.0, None, False, 360),    # Rahul — 6 hours ago
]

MEMBER_ROLES = [
    MemberRole.host,
    MemberRole.member,
    MemberRole.member,
    MemberRole.member,
]


def _get_or_create_user(db, user_data: dict) -> User:
    """Find the application user by email, or create its local DB record.

    Existing password hashes are deliberately preserved. New rows use the
    marker already used by the backend for Supabase-managed authentication.
    """
    user = db.query(User).filter(User.email == user_data["email"]).first()

    if user is None:
        user = User(**user_data)
        db.add(user)
        db.flush()
    else:
        user.name = user_data["name"]

    return user


def _get_or_create_trip(db, trip_data: dict, host_id: int) -> Trip:
    """Find the demo trip by its stable trip code, or create it."""
    trip = db.query(Trip).filter(Trip.trip_code == TRIP_CODE).first()

    if trip is None:
        trip = Trip(host_id=host_id, **trip_data)
        db.add(trip)
        db.flush()
    else:
        # Keep the dedicated demo trip aligned with this script's seed data.
        trip.host_id = host_id
        for field, value in trip_data.items():
            setattr(trip, field, value)

    return trip


def _ensure_membership(db, trip_id: int, user_id: int, role: MemberRole) -> TripMember:
    """Ensure exactly one membership for this trip/user pair."""
    membership = (
        db.query(TripMember)
        .filter(
            TripMember.trip_id == trip_id,
            TripMember.user_id == user_id,
        )
        .first()
    )

    if membership is None:
        membership = TripMember(
            trip_id=trip_id,
            user_id=user_id,
            role=role,
        )
        db.add(membership)
        db.flush()
    else:
        membership.role = role

    return membership


def _safe_database_label(target_url) -> str:
    """Render a database URL without exposing its password."""
    try:
        return make_url(str(target_url)).render_as_string(hide_password=True)
    except Exception:
        return "<configured database>"


def seed(db_url: str | None = None, reset: bool = False) -> dict:
    """Seed the demo records and return the verified counts."""
    started_at = time.perf_counter()

    if db_url:
        target_url = db_url
        is_sqlite = db_url.startswith("sqlite")
    else:
        target_url = SQL_DATABASE_URL
        is_sqlite = SQL_DATABASE_URL.drivername.startswith("sqlite")

    connect_args = {"check_same_thread": False} if is_sqlite else {}
    engine = create_engine(target_url, connect_args=connect_args)

    try:
        # Create tables only for the explicitly requested local SQLite target.
        # PostgreSQL/Supabase schema is managed by Alembic migrations.
        if is_sqlite:
            from app.db_bootstrap import bootstrap_users

            bootstrap_users(engine)
            Base.metadata.create_all(bind=engine)

        Session = sessionmaker(
            autocommit=False,
            autoflush=False,
            bind=engine,
        )
        db = Session()

        try:
            print("👤 Seeding application users...")
            users = [_get_or_create_user(db, user_data) for user_data in SEED_USERS]
            db.flush()

            for user in users:
                print(f"   ✅ {user.name} ({user.email}, id={user.id})")

            print("\n🗺️  Seeding demo trip...")
            trip = _get_or_create_trip(db, SEED_TRIP, host_id=users[0].id)
            db.flush()
            print(f"   ✅ {trip.title} (code={trip.trip_code})")

            print("\n🤝 Ensuring trip memberships...")
            for user, role in zip(users, MEMBER_ROLES):
                membership = _ensure_membership(db, trip.id, user.id, role)
                print(f"   ✅ {user.name} → {role.value} (membership id={membership.id})")

            # This is a dedicated demo trip. Replacing only its telemetry makes
            # repeated runs deterministic without touching other trips/users.
            if reset:
                print("\n♻️  Reset requested: clearing this demo trip's telemetry...")

            db.query(ConvoyTelemetry).filter(
                ConvoyTelemetry.trip_id == trip.id
            ).delete(synchronize_session=False)

            print("\n📡 Re-seeding telemetry...")
            now = datetime.now(timezone.utc)

            for user_index, lat, lon, speed, heading, ghost, minutes_ago in SEED_PINGS:
                ping = ConvoyTelemetry(
                    trip_id=trip.id,
                    user_id=users[user_index].id,
                    latitude=lat,
                    longitude=lon,
                    speed_kmh=speed,
                    heading=heading,
                    is_ghost_mode=ghost,
                    recorded_at=now - timedelta(minutes=minutes_ago),
                )
                db.add(ping)

                status = "🔒 GHOST" if ghost else (
                    "🟢 fresh" if minutes_ago <= 1 else f"⏳ {minutes_ago}m ago"
                )
                print(f"   ✅ {users[user_index].name}: {lat}, {lon} — {status}")

            # Commit all seed changes together.
            db.flush()

            # Verify only the records belonging to this dedicated demo trip.
            user_count = (
                db.query(User)
                .filter(User.email.in_([u["email"] for u in SEED_USERS]))
                .count()
            )
            trip_count = (
                db.query(Trip)
                .filter(Trip.trip_code == TRIP_CODE)
                .count()
            )
            member_count = (
                db.query(TripMember)
                .filter(TripMember.trip_id == trip.id)
                .count()
            )
            ping_count = (
                db.query(ConvoyTelemetry)
                .filter(ConvoyTelemetry.trip_id == trip.id)
                .count()
            )
            ghost_count = (
                db.query(ConvoyTelemetry)
                .filter(
                    ConvoyTelemetry.trip_id == trip.id,
                    ConvoyTelemetry.is_ghost_mode.is_(True),
                )
                .count()
            )

            # Validate before committing; a failed assertion rolls back the seed.
            assert user_count == 4, f"Expected 4 seeded users, got {user_count}"
            assert trip_count == 1, f"Expected 1 trip with code {TRIP_CODE}, got {trip_count}"
            assert member_count == 4, f"Expected 4 memberships, got {member_count}"
            assert ping_count == len(SEED_PINGS), (
                f"Expected {len(SEED_PINGS)} telemetry pings, got {ping_count}"
            )
            assert ghost_count == 1, f"Expected 1 Ghost Mode ping, got {ghost_count}"

            db.commit()
            elapsed = time.perf_counter() - started_at

            print("\n" + "=" * 58)
            print("SEED VERIFICATION SUMMARY")
            print("=" * 58)
            print(f"  Database:     {_safe_database_label(target_url)}")
            print(f"  Users:        {user_count} (expected: 4)")
            print(f"  Trips:        {trip_count} (expected: 1 for this trip code)")
            print(f"  Trip code:    {trip.trip_code}")
            print(f"  Memberships:  {member_count} (expected: 4)")
            print(f"  Telemetry:    {ping_count} (expected: {len(SEED_PINGS)})")
            print(f"  Ghost pings:  {ghost_count} (expected: 1 — Manthan)")
            print(f"  Runtime:      {elapsed:.2f}s (target: under 5s)")
            print("=" * 58)

            print("\n✅ All database assertions passed.")
            if elapsed < 5:
                print("✅ Runtime is under 5 seconds.")
            else:
                print("⚠️ Runtime exceeded 5 seconds.")

            return {
                "users": user_count,
                "trips": trip_count,
                "memberships": member_count,
                "telemetry": ping_count,
                "ghost_pings": ghost_count,
                "runtime_seconds": elapsed,
            }

        except Exception:
            db.rollback()
            raise
        finally:
            db.close()

    finally:
        engine.dispose()


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Seed and verify the four-member Sprint 2 convoy demo."
    )
    parser.add_argument(
        "--db-url",
        type=str,
        default=None,
        help=(
            "Optional SQLAlchemy database URL override. "
            "Without this option, the application's configured database is used."
        ),
    )
    parser.add_argument(
        "--reset",
        action="store_true",
        help=(
            "Rebuild telemetry for the GOASP2DM demo trip. "
            "Application users and the trip itself are preserved."
        ),
    )
    args = parser.parse_args()

    try:
        seed(db_url=args.db_url, reset=args.reset)
        return 0
    except Exception as exc:
        print(f"\n❌ Seed failed: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
