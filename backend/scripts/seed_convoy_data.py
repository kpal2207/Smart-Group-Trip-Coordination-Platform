"""Seed the Sprint 2 convoy demo data.

Run from the backend directory:
    python -m scripts.seed_convoy_data
    python -m scripts.seed_convoy_data --reset
    python -m scripts.seed_convoy_data --db-url sqlite:///./dev.db

The script creates/updates four application users, one demo trip, their four
memberships, and five identifiable demo telemetry pings. It does NOT create Supabase Auth
identities. Users are application records associated by email when an
authenticated Supabase user reaches the backend.

Normal reruns preserve existing telemetry and add only missing demo pings.
Use --reset to explicitly clear and recreate telemetry for the demo trip.
"""

from __future__ import annotations

import argparse
import os
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

# App database/models are loaded lazily so an explicit SQLite URL can be
# applied to the environment before app.database initializes project settings.


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

MEMBER_ROLE_NAMES = ["host", "member", "member", "member"]


def _get_or_create_user(db, user_data: dict):
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


def _get_or_create_trip(db, trip_data: dict, host_id: int):
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


def _ensure_membership(db, trip_id: int, user_id: int, role):
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


def _load_app_components(db_url: str | None):
    """Load app models, preparing settings first for explicit SQLite use."""
    if db_url:
        parsed_url = make_url(db_url)
        if parsed_url.drivername.startswith("sqlite"):
            # app.database creates its configured engine during import. Set
            # SQLite settings first so PostgreSQL credentials are not required.
            os.environ["DATABASE_DIALECT"] = parsed_url.drivername
            os.environ["DATABASE_NAME"] = parsed_url.database or ":memory:"
            # Some project Settings classes validate all DB fields eagerly,
            # even though app.database does not use these for SQLite.
            os.environ.setdefault("DATABASE_USER", "sqlite_unused")
            os.environ.setdefault("DATABASE_PASSWORD", "sqlite_unused")
            os.environ.setdefault("DATABASE_HOST", "localhost")
            os.environ.setdefault("DATABASE_PORT", "5432")

    from app.database import Base, SQL_DATABASE_URL
    from app.models import User, Trip, TripMember, MemberRole, ConvoyTelemetry

    # Helper functions below resolve these model classes at module scope.
    globals().update({
        "User": User,
        "Trip": Trip,
        "TripMember": TripMember,
    })
    return Base, SQL_DATABASE_URL, User, Trip, TripMember, MemberRole, ConvoyTelemetry


def _seed_ping_query(db, telemetry_model, trip_id, user_id,
                     lat, lon, speed, heading, ghost):
    """Find a demo ping by its stable payload signature.

    The current telemetry schema has no seed/source marker column, so the
    demo ping's user and distinctive payload identify it across reruns.
    """
    query = db.query(telemetry_model).filter(
        telemetry_model.trip_id == trip_id,
        telemetry_model.user_id == user_id,
        telemetry_model.latitude == lat,
        telemetry_model.longitude == lon,
        telemetry_model.speed_kmh == speed,
        telemetry_model.is_ghost_mode.is_(ghost),
    )
    if heading is None:
        query = query.filter(telemetry_model.heading.is_(None))
    else:
        query = query.filter(telemetry_model.heading == heading)
    return query


def seed(db_url: str | None = None, reset: bool = False) -> dict:
    """Seed demo records without deleting rehearsal telemetry."""
    started_at = time.perf_counter()

    Base, SQL_DATABASE_URL, User, Trip, TripMember, MemberRole, ConvoyTelemetry = (
        _load_app_components(db_url)
    )
    target_url = db_url if db_url else SQL_DATABASE_URL
    is_sqlite = make_url(str(target_url)).drivername.startswith("sqlite")
    connect_args = {"check_same_thread": False} if is_sqlite else {}
    engine = create_engine(target_url, connect_args=connect_args)

    try:
        if is_sqlite:
            from app.db_bootstrap import bootstrap_users
            bootstrap_users(engine)
            Base.metadata.create_all(bind=engine)

        Session = sessionmaker(autocommit=False, autoflush=False, bind=engine)
        db = Session()
        try:
            print("👤 Seeding application users...")
            users = [_get_or_create_user(db, user_data) for user_data in SEED_USERS]
            db.flush()
            for user in users:
                print(f" {user.name} ({user.email}, id={user.id})")

            print("\n Seeding demo trip...")
            trip = _get_or_create_trip(db, SEED_TRIP, host_id=users[0].id)
            db.flush()
            print(f"{trip.title} (code={trip.trip_code})")

            print("\nEnsuring demo memberships...")
            for user, role_name in zip(users, MEMBER_ROLE_NAMES):
                role = getattr(MemberRole, role_name)
                membership = _ensure_membership(db, trip.id, user.id, role)
                print(f" {user.name} → {role.value} (membership id={membership.id})")

            if reset:
                print("\nReset requested: refreshing only the five demo seed pings...")
            else:
                print("\nEnsuring demo telemetry (existing GPS history is preserved)...")

            if reset:
                # Explicit reset replaces telemetry for this dedicated demo trip.
                # Normal runs never delete existing telemetry.
                db.query(ConvoyTelemetry).filter(
                    ConvoyTelemetry.trip_id == trip.id
                ).delete(synchronize_session=False)

            now = datetime.now(timezone.utc)
            inserted_pings = 0
            preserved_pings = 0

            for user_index, lat, lon, speed, heading, ghost, minutes_ago in SEED_PINGS:
                signature_query = _seed_ping_query(
                    db, ConvoyTelemetry, trip.id, users[user_index].id,
                    lat, lon, speed, heading, ghost,
                )

                if reset:
                    # The trip's telemetry was explicitly cleared above.
                    existing_ping = None
                else:
                    existing_ping = signature_query.first()

                if existing_ping is None:
                    db.add(ConvoyTelemetry(
                        trip_id=trip.id,
                        user_id=users[user_index].id,
                        latitude=lat,
                        longitude=lon,
                        speed_kmh=speed,
                        heading=heading,
                        is_ghost_mode=ghost,
                        recorded_at=now - timedelta(minutes=minutes_ago),
                    ))
                    inserted_pings += 1
                    action = "added"
                else:
                    preserved_pings += 1
                    action = "preserved"

                status = "🔒 GHOST" if ghost else (
                    "🟢 fresh" if minutes_ago <= 1 else f"⏳ {minutes_ago}m ago"
                )
                print(f"   ✅ {users[user_index].name}: {lat}, {lon} — {status} ({action})")

            db.flush()

            user_count = (
                db.query(User)
                .filter(User.email.in_([u["email"] for u in SEED_USERS]))
                .count()
            )
            trip_count = db.query(Trip).filter(Trip.trip_code == TRIP_CODE).count()
            total_member_count = (
                db.query(TripMember).filter(TripMember.trip_id == trip.id).count()
            )

            missing_demo_members = []
            for user in users:
                exists = (
                    db.query(TripMember)
                    .filter(
                        TripMember.trip_id == trip.id,
                        TripMember.user_id == user.id,
                    )
                    .first()
                )
                if exists is None:
                    missing_demo_members.append(user.email)

            seeded_ping_counts = []
            for user_index, lat, lon, speed, heading, ghost, _minutes_ago in SEED_PINGS:
                count = _seed_ping_query(
                    db, ConvoyTelemetry, trip.id, users[user_index].id,
                    lat, lon, speed, heading, ghost,
                ).count()
                seeded_ping_counts.append(count)

            seeded_ping_count = sum(count >= 1 for count in seeded_ping_counts)
            total_ping_count = (
                db.query(ConvoyTelemetry)
                .filter(ConvoyTelemetry.trip_id == trip.id)
                .count()
            )
            seeded_ghost_count = sum(
                1 for spec, count in zip(SEED_PINGS, seeded_ping_counts)
                if spec[5] and count >= 1
            )

            assert user_count == 4, f"Expected 4 seeded users, got {user_count}"
            assert trip_count == 1, f"Expected 1 trip with code {TRIP_CODE}, got {trip_count}"
            assert not missing_demo_members, (
                "Missing demo memberships: " + ", ".join(missing_demo_members)
            )
            assert seeded_ping_count == len(SEED_PINGS), (
                f"Expected {len(SEED_PINGS)} identifiable demo pings, "
                f"found {seeded_ping_count}"
            )
            assert seeded_ghost_count == 1, (
                f"Expected 1 demo Ghost Mode ping, got {seeded_ghost_count}"
            )

            db.commit()
            elapsed = time.perf_counter() - started_at

            print("\n" + "=" * 58)
            print("SEED VERIFICATION SUMMARY")
            print("=" * 58)
            print(f"  Database:          {_safe_database_label(target_url)}")
            print(f"  Application users: {user_count} (expected: 4)")
            print(f"  Demo trips:        {trip_count} (expected: 1)")
            print(f"  Trip code:         {trip.trip_code}")
            print(f"  Total members:     {total_member_count} (includes extra testers)")
            print(f"  Demo seed pings:   {seeded_ping_count} (expected: {len(SEED_PINGS)})")
            print(f"  Total trip pings:  {total_ping_count} (includes rehearsal history)")
            print(f"  Demo Ghost pings:  {seeded_ghost_count} (expected: 1 — Manthan)")
            print(f"  Added this run:    {inserted_pings}")
            print(f"  Preserved:         {preserved_pings}")
            print(f"  Runtime:           {elapsed:.2f}s (target: under 5s)")
            print("=" * 58)
            print("\nAll database assertions passed.")
            print("Runtime is under 5 seconds." if elapsed < 5
                  else "Runtime exceeded 5 seconds.")

            return {
                "users": user_count,
                "trips": trip_count,
                "memberships": total_member_count,
                "demo_telemetry": seeded_ping_count,
                "telemetry": total_ping_count,
                "ghost_pings": seeded_ghost_count,
                "inserted_pings": inserted_pings,
                "preserved_pings": preserved_pings,
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
            "Explicitly clear and recreate telemetry for GOASP2DM. "
            "Users, the trip, and extra members are preserved."
        ),
    )
    args = parser.parse_args()

    try:
        seed(db_url=args.db_url, reset=args.reset)
        return 0
    except Exception as exc:
        print(f"\nSeed failed: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
