"""Sprint 2 Verification: Migration upgrade → downgrade → re-upgrade test.

Run from the backend/ directory with the project's virtual environment active:

    cd backend
    python -m scripts.test_migration_rollback

This creates a disposable SQLite database, runs the full migration chain forward,
downgrades by one step (removes convoy_telemetry), then re-upgrades — verifying
that the rollback is clean and re-entrant.
"""

from __future__ import annotations

import os
import sys
import tempfile
from pathlib import Path

_backend_dir = Path(__file__).resolve().parent.parent
if str(_backend_dir) not in sys.path:
    sys.path.insert(0, str(_backend_dir))


def main() -> int:
    from sqlalchemy import create_engine, inspect
    from alembic.config import Config
    from alembic import command

    # Create a disposable SQLite DB in temp
    tmpfile = os.path.join(tempfile.gettempdir(), "convoysync_migration_test.db")
    if os.path.exists(tmpfile):
        os.remove(tmpfile)

    db_url = f"sqlite:///{tmpfile}"
    print(f"🗄️  Disposable test DB: {tmpfile}")

    # Override DATABASE_URL so app.config picks up SQLite
    os.environ["DATABASE_URL"] = db_url

    cfg = Config(str(_backend_dir / "alembic.ini"))
    cfg.set_main_option("sqlalchemy.url", db_url)

    eng = create_engine(db_url)

    # ── Step 0: Bootstrap users table (ConvoySync DB architecture) ─
    print("\n👤 STEP 0: Bootstrap users table via db_bootstrap")
    from app.db_bootstrap import bootstrap_users
    bootstrap_users(eng)
    print("   ✅ Users table bootstrapped successfully")

    # ── Step 1: Upgrade to head ───────────────────────────────────
    print("\n📦 STEP 1: alembic upgrade head")
    command.upgrade(cfg, "head")

    with eng.connect() as conn:
        tables = sorted(inspect(conn).get_table_names())
        print(f"   Tables: {tables}")
        assert "convoy_telemetry" in tables, "convoy_telemetry must exist after upgrade"
        assert "users" in tables
        assert "trips" in tables
        assert "trip_members" in tables
        cols = [c["name"] for c in inspect(conn).get_columns("convoy_telemetry")]
        print(f"   convoy_telemetry columns: {cols}")
        indexes = [i["name"] for i in inspect(conn).get_indexes("convoy_telemetry")]
        print(f"   convoy_telemetry indexes: {indexes}")
    print("   ✅ PASS")

    # ── Step 2: Downgrade -1 (remove convoy_telemetry) ────────────
    print("\n⏪ STEP 2: alembic downgrade -1")
    command.downgrade(cfg, "-1")

    with eng.connect() as conn:
        tables2 = sorted(inspect(conn).get_table_names())
        print(f"   Tables: {tables2}")
        assert "convoy_telemetry" not in tables2, "convoy_telemetry must be gone after downgrade"
        assert "users" in tables2, "users table must survive"
        assert "trips" in tables2, "trips table must survive"
    print("   ✅ PASS — convoy_telemetry dropped, other tables intact")

    # ── Step 3: Re-upgrade to head ────────────────────────────────
    print("\n📦 STEP 3: alembic upgrade head (re-upgrade)")
    command.upgrade(cfg, "head")

    with eng.connect() as conn:
        tables3 = sorted(inspect(conn).get_table_names())
        print(f"   Tables: {tables3}")
        assert "convoy_telemetry" in tables3, "convoy_telemetry must be back after re-upgrade"
    print("   ✅ PASS — convoy_telemetry recreated cleanly")

    # ── Cleanup ───────────────────────────────────────────────────
    eng.dispose()
    os.remove(tmpfile)

    print("\n" + "=" * 55)
    print("  MIGRATION ROLLBACK TEST: ALL 3 STEPS PASSED ✅")
    print("=" * 55)
    print(f"  Cleaned up: {tmpfile}\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
