"""Regression tests for guarded local and Supabase demo seeding."""

import importlib.util
import sqlite3
from pathlib import Path

import pytest

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "seed_convoy_data.py"
spec = importlib.util.spec_from_file_location("seed_convoy_data", SCRIPT)
seed_module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(seed_module)

PROJECT_REF = seed_module.SUPABASE_PROJECT_REF
VALID_POOLER_URL = (
    "postgresql+psycopg2://"
    f"postgres.{PROJECT_REF}:secret@aws-1-ap-southeast-1.pooler.supabase.com:6543/postgres"
)


def _sentinel_database(path: Path) -> tuple[int, str]:
    """Create a tiny database whose contents must survive rejected operations."""
    with sqlite3.connect(path) as connection:
        connection.execute("CREATE TABLE IF NOT EXISTS sentinel (id INTEGER, value TEXT)")
        connection.execute("DELETE FROM sentinel")
        connection.execute("INSERT INTO sentinel VALUES (1, 'untouched')")
        connection.commit()
        return connection.execute("SELECT COUNT(*), value FROM sentinel").fetchone()


def _assert_no_database_access(monkeypatch):
    def unexpected(*_args, **_kwargs):
        pytest.fail("Rejected operation accessed application/database components")

    monkeypatch.setattr(seed_module, "_load_app_components", unexpected)
    monkeypatch.setattr(seed_module, "create_engine", unexpected)


@pytest.mark.parametrize("reset", [False, True], ids=["seed", "reset"])
def test_remote_write_without_opt_in_is_rejected_without_changing_records(
    tmp_path, monkeypatch, reset
):
    sentinel = tmp_path / "sentinel.db"
    before = _sentinel_database(sentinel)
    _assert_no_database_access(monkeypatch)

    with pytest.raises(RuntimeError, match="Remote database writes are disabled"):
        seed_module.seed(
            db_url=VALID_POOLER_URL,
            reset=reset,
            allow_remote=False,
            confirm_trip_code=seed_module.TRIP_CODE if reset else None,
        )

    assert _sentinel_database(sentinel) == before


@pytest.mark.parametrize("reset", [False, True], ids=["seed", "reset"])
def test_mismatched_supabase_project_is_rejected_without_changing_records(
    tmp_path, monkeypatch, reset
):
    sentinel = tmp_path / "sentinel.db"
    before = _sentinel_database(sentinel)
    _assert_no_database_access(monkeypatch)
    wrong_project_url = (
        "postgresql+psycopg2://postgres.wrongproject:secret@"
        "aws-1-ap-southeast-1.pooler.supabase.com:6543/postgres"
    )

    with pytest.raises(RuntimeError, match="does not match the designated Supabase project"):
        seed_module.seed(
            db_url=wrong_project_url,
            reset=reset,
            allow_remote=True,
            confirm_trip_code=seed_module.TRIP_CODE if reset else None,
        )

    assert _sentinel_database(sentinel) == before


@pytest.mark.parametrize("confirmation", [None, "GOASP2DMX", "goasp2dm"])
def test_reset_without_exact_trip_code_confirmation_changes_no_records(
    tmp_path, monkeypatch, confirmation
):
    sentinel = tmp_path / "sentinel.db"
    before = _sentinel_database(sentinel)
    _assert_no_database_access(monkeypatch)

    with pytest.raises(RuntimeError, match="Reset blocked"):
        seed_module.seed(
            db_url=f"sqlite:///{sentinel.as_posix()}",
            reset=True,
            confirm_trip_code=confirmation,
        )

    assert _sentinel_database(sentinel) == before


def test_local_sqlite_does_not_require_remote_opt_in():
    seed_module._validate_seed_target("sqlite:///./local.db")


def test_designated_supabase_pooler_project_is_allowed_with_opt_in():
    seed_module._validate_seed_target(VALID_POOLER_URL, allow_remote=True)


def test_remote_target_is_rejected_without_opt_in():
    with pytest.raises(RuntimeError, match="Remote database writes are disabled"):
        seed_module._validate_seed_target(VALID_POOLER_URL)


def test_designated_supabase_direct_connection_is_allowed_with_opt_in():
    url = (
        "postgresql+psycopg2://postgres:secret@"
        f"db.{PROJECT_REF}.supabase.co:5432/postgres"
    )
    seed_module._validate_seed_target(url, allow_remote=True)


@pytest.mark.parametrize("reset", [False, True], ids=["seed", "reset"])
def test_unapproved_pooler_hostname_is_rejected_without_changing_records(
    tmp_path, monkeypatch, reset
):
    sentinel = tmp_path / "sentinel.db"
    before = _sentinel_database(sentinel)
    _assert_no_database_access(monkeypatch)

    wrong_pooler_url = (
        "postgresql+psycopg2://"
        f"postgres.{PROJECT_REF}:secret@"
        "aws-2-ap-southeast-1.pooler.supabase.com:6543/postgres"
    )

    with pytest.raises(
        RuntimeError,
        match="does not match the designated Supabase project"
    ):
        seed_module.seed(
            db_url=wrong_pooler_url,
            reset=reset,
            allow_remote=True,
            confirm_trip_code=seed_module.TRIP_CODE if reset else None,
        )

    assert _sentinel_database(sentinel) == before
