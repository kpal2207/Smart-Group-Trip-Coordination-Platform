"""Seed script for Sprint 2 pair demo: "Location data for one trip".

Seeds four members in PostgreSQL (or SQLite), creates one trip with four memberships,
and inserts convoy telemetry pings — including one Ghost Mode member whose
coordinates must appear as null in the convoy polling response.

Idempotent: running this script twice produces the same state (uses
upsert-like logic by checking for existing email addresses).

Usage:
    cd backend
    python -m scripts.seed_convoy_data                      # uses DATABASE_URL from .env
    python -m scripts.seed_convoy_data --db-url sqlite:///./dev.db  # seed local SQLite DB
    python -m scripts.seed_convoy_data --reset             # drop & re-seed
"""

from __future__ import annotations

import argparse
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

# ---------------------------------------------------------------------------
# Ensure the backend package is importable when invoked as
# `python -m scripts.seed_convoy_data` from the backend/ directory.
# ---------------------------------------------------------------------------
_backend_dir = Path(__file__).resolve().parent.parent
if str(_backend_dir) not in sys.path:
    sys.path.insert(0, str(_backend_dir))

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from app.config import settings
from app.database import Base
from app.models import User, Trip, TripMember, MemberRole, ConvoyTelemetry


# ── Seed Data ─────────────────────────────────────────────────────────────

SEED_USERS = [
    {"name": "Mrunali Rathod",   "email": "mrunali@convoysync.dev",  "password_hash": "seeded-not-for-login"},
    {"name": "Kanika Pal",       "email": "kanika@convoysync.dev",   "password_hash": "seeded-not-for-login"},
    {"name": "Manthan Kanetiya", "email": "manthan@convoysync.dev",  "password_hash": "seeded-not-for-login"},
    {"name": "Rahul Sharma",     "email": "rahul@convoysync.dev",    "password_hash": "seeded-not-for-login"},
]

SEED_TRIP = {
    "title": "Ahmedabad → Goa Highway Sprint",
    "description": "Sprint 2 demo trip seeded by DBA (Mrunali). Four members, one Ghost Mode.",
    "destination": "Goa",
    "start_date": datetime(2026, 11, 20).date(),
    "end_date": datetime(2026, 11, 22).date(),
    "trip_code": "GOASP2DM",
}

# GPS coordinates along Ahmedabad-Goa NH48 corridor
# Member index 2 (Manthan) is in Ghost Mode — lat/lon stored but hidden by API
SEED_PINGS = [
    # (user_index, latitude,     longitude,    speed, heading, is_ghost, minutes_ago)
    (0,           21.1702,      72.8311,      85.0,  210.5,   False,    0),    # Mrunali — fresh
    (0,           21.1690,      72.8295,      82.0,  210.0,   False,    5),    # Mrunali — 5 min ago
    (1,           21.1550,      72.8200,      90.0,  212.0,   False,    0),    # Kanika — fresh
    (2,           21.1400,      72.8100,      70.0,  215.0,   True,     0),    # Manthan — GHOST MODE
    (3,           21.0900,      72.7800,      0.0,   None,    False,    360),  # Rahul — unavailable (6h ago)
]


def _get_or_create_user(db, user_data: dict) -> User:
    """Return existing user by email or create a new one."""
    existing = db.query(User).filter(User.email == user_data["email"]).first()
    if existing:
        return existing
    user = User(**user_data)
    db.add(user)
    db.flush()
    return user


def _get_or_create_trip(db, trip_data: dict, host_id: int) -> Trip:
    """Return existing trip by trip_code or create a new one."""
    existing = db.query(Trip).filter(Trip.trip_code == trip_data["trip_code"]).first()
    if existing:
        return existing
    trip = Trip(host_id=host_id, **trip_data)
    db.add(trip)
    db.flush()
    return trip


def _ensure_membership(db, trip_id: int, user_id: int, role: MemberRole) -> TripMember:
    """Add a TripMember if one doesn't already exist."""
    existing = (
        db.query(TripMember)
        .filter(TripMember.trip_id == trip_id, TripMember.user_id == user_id)
        .first()
    )
    if existing:
        return existing
    member = TripMember(trip_id=trip_id, user_id=user_id, role=role)
    db.add(member)
    db.flush()
    return member


def seed(db_url: str | None = None, reset: bool = False) -> None:
    """Run the full seed procedure."""
    target_url = db_url or settings.DATABASE_URL
    connect_args = {"check_same_thread": False} if target_url.startswith("sqlite") else {}
    target_engine = create_engine(target_url, connect_args=connect_args)

    # If targeting SQLite, ensure tables exist
    if target_url.startswith("sqlite"):
        from app.db_bootstrap import bootstrap_users
        bootstrap_users(target_engine)
        Base.metadata.create_all(bind=target_engine)

    Session = sessionmaker(autocommit=False, autoflush=False, bind=target_engine)
    db = Session()

    try:
        if reset:
            print("🗑️  Resetting seed data...")
            db.execute(text("DELETE FROM convoy_telemetry WHERE trip_id IN (SELECT id FROM trips WHERE trip_code = 'GOASP2DM')"))
            db.execute(text("DELETE FROM trip_members WHERE trip_id IN (SELECT id FROM trips WHERE trip_code = 'GOASP2DM')"))
            db.execute(text("DELETE FROM trips WHERE trip_code = 'GOASP2DM'"))
            for u in SEED_USERS:
                db.execute(text("DELETE FROM users WHERE email = :email"), {"email": u["email"]})
            db.commit()
            print("   Done.\n")

        # ── 1. Create four users ──────────────────────────────────────
        print("👤 Seeding 4 users...")
        users = [_get_or_create_user(db, u) for u in SEED_USERS]
        db.commit()
        for u in users:
            print(f"   ✅ {u.name} (id={u.id}, email={u.email})")

        # ── 2. Create one trip (Mrunali is host) ──────────────────────
        print("\n🗺️  Seeding trip...")
        trip = _get_or_create_trip(db, SEED_TRIP, host_id=users[0].id)
        db.commit()
        print(f"   ✅ '{trip.title}' (id={trip.id}, code={trip.trip_code})")

        # ── 3. Add four memberships ───────────────────────────────────
        print("\n🤝 Seeding memberships...")
        roles = [MemberRole.host, MemberRole.member, MemberRole.member, MemberRole.member]
        for user, role in zip(users, roles):
            member = _ensure_membership(db, trip.id, user.id, role)
            print(f"   ✅ {user.name} → {role.value} (membership id={member.id})")
        db.commit()

        # ── 4. Insert telemetry pings ─────────────────────────────────
        print("\n📡 Seeding telemetry pings...")
        now = datetime.now(timezone.utc)

        # Only insert if no pings exist for this trip yet
        existing_count = (
            db.query(ConvoyTelemetry)
            .filter(ConvoyTelemetry.trip_id == trip.id)
            .count()
        )
        if existing_count > 0:
            print(f"   ⏭️  {existing_count} pings already exist — skipping.")
        else:
            for user_idx, lat, lon, speed, heading, ghost, mins_ago in SEED_PINGS:
                ping = ConvoyTelemetry(
                    trip_id=trip.id,
                    user_id=users[user_idx].id,
                    latitude=lat,
                    longitude=lon,
                    speed_kmh=speed,
                    heading=heading,
                    is_ghost_mode=ghost,
                    recorded_at=now - timedelta(minutes=mins_ago),
                )
                db.add(ping)
                status = "🔒 GHOST" if ghost else ("🟢 fresh" if mins_ago <= 1 else f"⏳ {mins_ago}m ago")
                print(f"   ✅ {users[user_idx].name}: ({lat}, {lon}) speed={speed} — {status}")
            db.commit()

        # ── 5. Verification summary ───────────────────────────────────
        member_count = db.query(TripMember).filter(TripMember.trip_id == trip.id).count()
        ping_count = db.query(ConvoyTelemetry).filter(ConvoyTelemetry.trip_id == trip.id).count()
        ghost_count = (
            db.query(ConvoyTelemetry)
            .filter(ConvoyTelemetry.trip_id == trip.id, ConvoyTelemetry.is_ghost_mode == True)
            .count()
        )

        print("\n" + "=" * 60)
        print("SEED VERIFICATION SUMMARY")
        print("=" * 60)
        print(f"  Target DB:    {target_url}")
        print(f"  Trip:         '{trip.title}' (code: {trip.trip_code})")
        print(f"  Members:      {member_count} (expected: 4)")
        print(f"  Pings:        {ping_count} (expected: {len(SEED_PINGS)})")
        print(f"  Ghost pings:  {ghost_count} (expected: 1 — Manthan)")
        print(f"  Hidden user:  Manthan Kanetiya → lat/lon should show null in API")
        print("=" * 60)

        assert member_count == 4, f"Expected 4 memberships, got {member_count}"
        assert ping_count == len(SEED_PINGS), f"Expected {len(SEED_PINGS)} pings, got {ping_count}"
        assert ghost_count == 1, f"Expected 1 ghost ping, got {ghost_count}"
        print("\n✅ All assertions passed. Seed complete!\n")

    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Seed Sprint 2 demo data: 4 members, 1 trip, telemetry pings."
    )
    parser.add_argument(
        "--db-url",
        type=str,
        default=None,
        help="Optional database connection URL (overrides DATABASE_URL in .env).",
    )
    parser.add_argument(
        "--reset",
        action="store_true",
        help="Delete existing seed data before re-seeding.",
    )
    args = parser.parse_args()

    try:
        seed(db_url=args.db_url, reset=args.reset)
        return 0
    except Exception as e:
        print(f"\n❌ Seed failed: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
