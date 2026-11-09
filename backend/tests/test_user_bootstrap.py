import sqlite3

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.exc import OperationalError

import pytest

from app.db_bootstrap import UserTableBootstrapError, bootstrap_users
from app.models.user import User
import app.db_bootstrap as db_bootstrap


def _engine(path):
    return create_engine(f"sqlite:///{path}")


def _schema_snapshot(engine):
    inspector = inspect(engine)
    return {
        "tables": sorted(inspector.get_table_names()),
        "columns": [
            (column["name"], str(column["type"]), column["nullable"])
            for column in inspector.get_columns("users")
        ] if "users" in inspector.get_table_names() else None,
        "indexes": sorted(
            (index["name"], tuple(index["column_names"]), index["unique"])
            for index in inspector.get_indexes("users")
        ) if "users" in inspector.get_table_names() else None,
    }


def test_empty_database_creates_only_users(tmp_path):
    engine = _engine(tmp_path / "fresh.db")
    try:
        assert bootstrap_users(engine) is True
        assert inspect(engine).get_table_names() == ["users"]
    finally:
        engine.dispose()


def test_repeated_bootstrap_is_idempotent_and_preserves_data(tmp_path):
    engine = _engine(tmp_path / "repeat.db")
    try:
        assert bootstrap_users(engine) is True
        with engine.begin() as connection:
            connection.execute(
                User.__table__.insert().values(
                    name="Existing",
                    email="existing@example.com",
                    password_hash="hash",
                )
            )
        before = _schema_snapshot(engine)

        assert bootstrap_users(engine) is False
        assert _schema_snapshot(engine) == before
        with engine.connect() as connection:
            assert connection.execute(
                text("SELECT email FROM users")
            ).scalar_one() == "existing@example.com"
    finally:
        engine.dispose()


def test_compatible_existing_users_table_validates_without_changes(tmp_path):
    engine = _engine(tmp_path / "compatible.db")
    try:
        User.__table__.create(engine)
        before = _schema_snapshot(engine)
        assert bootstrap_users(engine) is False
        assert _schema_snapshot(engine) == before
    finally:
        engine.dispose()


def test_missing_required_column_fails_without_modification(tmp_path):
    engine = _engine(tmp_path / "missing-column.db")
    try:
        with engine.begin() as connection:
            connection.execute(text(
                "CREATE TABLE users (id INTEGER PRIMARY KEY, name VARCHAR(100) NOT NULL, "
                "email VARCHAR(255) NOT NULL UNIQUE, password_hash VARCHAR(255) NOT NULL, "
                "created_at DATETIME NOT NULL)"
            ))
            connection.execute(text("CREATE INDEX ix_users_id ON users (id)"))
        before = _schema_snapshot(engine)

        with pytest.raises(UserTableBootstrapError, match="missing column 'updated_at'"):
            bootstrap_users(engine)

        assert _schema_snapshot(engine) == before
    finally:
        engine.dispose()


@pytest.mark.parametrize(
    ("ddl", "error_fragment"),
    [
        (
            "CREATE TABLE users (id VARCHAR(20) PRIMARY KEY, name VARCHAR(100) NOT NULL, "
            "email VARCHAR(255) NOT NULL UNIQUE, password_hash VARCHAR(255) NOT NULL, "
            "created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL)",
            "column 'id' has type",
        ),
        (
            "CREATE TABLE users (id INTEGER PRIMARY KEY, name VARCHAR(100), "
            "email VARCHAR(255) NOT NULL UNIQUE, password_hash VARCHAR(255) NOT NULL, "
            "created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL)",
            "column 'name' nullable=True",
        ),
    ],
)
def test_incorrect_type_or_nullability_fails_clearly(tmp_path, ddl, error_fragment):
    engine = _engine(tmp_path / f"incompatible-{abs(hash(ddl))}.db")
    try:
        with engine.begin() as connection:
            connection.execute(text(ddl))
            connection.execute(text("CREATE INDEX ix_users_id ON users (id)"))
        before = _schema_snapshot(engine)

        with pytest.raises(UserTableBootstrapError, match=error_fragment):
            bootstrap_users(engine)

        assert _schema_snapshot(engine) == before
    finally:
        engine.dispose()


def test_missing_unique_email_semantics_fails_clearly(tmp_path):
    engine = _engine(tmp_path / "not-unique.db")
    try:
        User.__table__.create(engine)
        with engine.begin() as connection:
            connection.execute(text("DROP INDEX ix_users_email"))
        before = _schema_snapshot(engine)

        with pytest.raises(UserTableBootstrapError, match="email is not uniquely constrained"):
            bootstrap_users(engine)

        assert _schema_snapshot(engine) == before
    finally:
        engine.dispose()


def test_missing_users_with_other_application_table_refuses_creation(tmp_path):
    engine = _engine(tmp_path / "other-table.db")
    try:
        with engine.begin() as connection:
            connection.execute(text("CREATE TABLE trips (id INTEGER PRIMARY KEY)"))
        before = inspect(engine).get_table_names()

        with pytest.raises(UserTableBootstrapError, match="users table is missing"):
            bootstrap_users(engine)

        assert inspect(engine).get_table_names() == before
    finally:
        engine.dispose()


@pytest.mark.parametrize("other_tables", [[], ["trips"]])
def test_alembic_revision_marker_without_users_refuses_creation(tmp_path, other_tables):
    engine = _engine(tmp_path / f"alembic-marker-{len(other_tables)}.db")
    try:
        with engine.begin() as connection:
            connection.execute(text(
                "CREATE TABLE alembic_version (version_num VARCHAR(32) NOT NULL PRIMARY KEY)"
            ))
            if "trips" in other_tables:
                connection.execute(text("CREATE TABLE trips (id INTEGER PRIMARY KEY)"))
        before = inspect(engine).get_table_names()

        with pytest.raises(UserTableBootstrapError, match="alembic_version exists"):
            bootstrap_users(engine)

        assert inspect(engine).get_table_names() == before
        assert "users" not in before
    finally:
        engine.dispose()


def test_bigint_user_id_fails_validation(tmp_path):
    engine = _engine(tmp_path / "bigint-id.db")
    try:
        with engine.begin() as connection:
            connection.execute(text(
                "CREATE TABLE users (id BIGINT PRIMARY KEY, name VARCHAR(100) NOT NULL, "
                "email VARCHAR(255) NOT NULL UNIQUE, password_hash VARCHAR(255) NOT NULL, "
                "created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL)"
            ))
            connection.execute(text("CREATE INDEX ix_users_id ON users (id)"))

        with pytest.raises(UserTableBootstrapError, match="column 'id' has type BIGINT"):
            bootstrap_users(engine)
    finally:
        engine.dispose()


def test_primary_key_without_explicit_id_index_fails_validation(tmp_path):
    engine = _engine(tmp_path / "missing-id-index.db")
    try:
        with engine.begin() as connection:
            connection.execute(text(
                "CREATE TABLE users (id INTEGER PRIMARY KEY, name VARCHAR(100) NOT NULL, "
                "email VARCHAR(255) NOT NULL UNIQUE, password_hash VARCHAR(255) NOT NULL, "
                "created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL)"
            ))

        with pytest.raises(UserTableBootstrapError, match="missing required index for column 'id'"):
            bootstrap_users(engine)
    finally:
        engine.dispose()


@pytest.mark.parametrize("compatible", [True, False])
def test_duplicate_table_race_reinspects_on_fresh_connection(
    tmp_path, monkeypatch, compatible
):
    engine = _engine(tmp_path / f"race-{compatible}.db")
    create_connection = None
    validation_connections = []
    original_create = User.__table__.create
    original_validate = db_bootstrap._validate_users_table

    def create_racing_table(bind, checkfirst=False):
        nonlocal create_connection
        with bind.begin() as connection:
            create_connection = connection
            if compatible:
                original_create(bind=connection, checkfirst=False)
            else:
                connection.execute(text(
                    "CREATE TABLE users (id INTEGER PRIMARY KEY, "
                    "name VARCHAR(100) NOT NULL)"
                ))
        raise OperationalError(
            "CREATE TABLE users", {}, sqlite3.OperationalError("table users already exists")
        )

    def track_validation_connection(connection):
        validation_connections.append(connection)
        return original_validate(connection)

    monkeypatch.setattr(User.__table__, "create", create_racing_table)
    monkeypatch.setattr(db_bootstrap, "_validate_users_table", track_validation_connection)

    try:
        if compatible:
            assert bootstrap_users(engine) is False
            assert len(validation_connections) == 1
            assert validation_connections[0] is not create_connection
        else:
            with pytest.raises(UserTableBootstrapError, match="missing column 'email'"):
                bootstrap_users(engine)
            assert len(validation_connections) == 1
            assert validation_connections[0] is not create_connection
    finally:
        engine.dispose()


def test_bootstrap_never_creates_other_application_tables(tmp_path):
    engine = _engine(tmp_path / "only-users.db")
    try:
        bootstrap_users(engine)
        assert set(inspect(engine).get_table_names()) == {"users"}
        assert not {"trips", "expenses", "convoy_telemetry"}.intersection(
            inspect(engine).get_table_names()
        )
    finally:
        engine.dispose()


def test_unrelated_database_errors_propagate(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'missing' / 'database.db'}")
    try:
        with pytest.raises(OperationalError):
            bootstrap_users(engine)
    finally:
        engine.dispose()
