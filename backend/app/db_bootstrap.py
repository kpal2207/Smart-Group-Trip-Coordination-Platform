"""Bootstrap and validate the users table before running Alembic migrations.

This module intentionally creates only ``User.__table__``. It does not create
the rest of the application's metadata.
"""

from __future__ import annotations

import argparse
import sys
from typing import Iterable

from sqlalchemy import BigInteger, Engine, Integer, inspect
from sqlalchemy.exc import DBAPIError

from app.database import engine as configured_engine
from app.models.user import User


class UserTableBootstrapError(RuntimeError):
    """Raised when users is absent in an unsafe state or has a wrong schema."""


def _type_issues(actual_type, expected_type, column_name: str, dialect_name: str) -> list[str]:
    """Compare reflected SQLAlchemy types by affinity and relevant parameters."""
    issues: list[str] = []
    if actual_type._type_affinity is not expected_type._type_affinity:
        return [
            f"column '{column_name}' has type {actual_type!s}; "
            f"expected {expected_type!s}"
        ]

    if isinstance(expected_type, Integer) and not isinstance(expected_type, BigInteger):
        # SQLite and PostgreSQL both reflect their SQL INTEGER columns as
        # SQLAlchemy Integer. Affinity alone is insufficient because
        # BigInteger and SmallInteger share that affinity in SQLAlchemy.
        # Compare the reflected concrete integer type to preserve the model's
        # declared width across these supported dialects.
        if actual_type.__visit_name__.lower() != expected_type.__visit_name__.lower():
            issues.append(
                f"column '{column_name}' has type {actual_type!s}; expected "
                f"{expected_type!s} for dialect '{dialect_name}'"
            )

    if expected_type._type_affinity.__name__ == "String":
        if getattr(actual_type, "length", None) != getattr(expected_type, "length", None):
            issues.append(
                f"column '{column_name}' has length "
                f"{getattr(actual_type, 'length', None)}; expected "
                f"{getattr(expected_type, 'length', None)}"
            )
    elif expected_type._type_affinity.__name__ == "DateTime":
        if bool(getattr(actual_type, "timezone", False)) != bool(
            getattr(expected_type, "timezone", False)
        ):
            issues.append(
                f"column '{column_name}' timezone setting is "
                f"{getattr(actual_type, 'timezone', False)}; expected "
                f"{getattr(expected_type, 'timezone', False)}"
            )
    return issues


def _validate_users_table(connection) -> None:
    inspector = inspect(connection)
    reflected_columns = {
        column["name"]: column for column in inspector.get_columns("users")
    }
    expected_columns = {column.name: column for column in User.__table__.columns}
    issues: list[str] = []

    for name, expected in expected_columns.items():
        actual = reflected_columns.get(name)
        if actual is None:
            issues.append(f"missing column '{name}'")
            continue

        issues.extend(
            _type_issues(actual["type"], expected.type, name, connection.dialect.name)
        )
        if bool(actual["nullable"]) != bool(expected.nullable):
            issues.append(
                f"column '{name}' nullable={actual['nullable']}; "
                f"expected nullable={expected.nullable}"
            )

    extra_columns = sorted(set(reflected_columns) - set(expected_columns))
    if extra_columns:
        issues.append(f"unexpected columns: {', '.join(extra_columns)}")

    primary_key = inspector.get_pk_constraint("users").get("constrained_columns") or []
    expected_primary_key = [column.name for column in User.__table__.primary_key.columns]
    if primary_key != expected_primary_key:
        issues.append(
            f"primary key columns are {primary_key}; expected {expected_primary_key}"
        )

    unique_email = False
    for constraint in inspector.get_unique_constraints("users"):
        if constraint.get("column_names") == ["email"]:
            unique_email = True
            break
    indexes = inspector.get_indexes("users")
    email_indexes = [
        index for index in indexes if index.get("column_names") == ["email"]
    ]
    if any(index.get("unique") for index in email_indexes):
        unique_email = True
    if not unique_email:
        issues.append(
            "email is not uniquely constrained (expected a unique constraint "
            "or a unique single-column email index)"
        )

    # User.id declares index=True, so require its explicit single-column index;
    # the primary-key index alone does not satisfy this model declaration.
    id_indexed = any(
        index.get("column_names") == ["id"] for index in indexes
    )
    if not id_indexed:
        issues.append("missing required index for column 'id'")

    if issues:
        raise UserTableBootstrapError(
            "The existing users table is incompatible with app.models.User:\n- "
            + "\n- ".join(issues)
        )


def _is_already_exists_race(error: DBAPIError) -> bool:
    """Recognize only PostgreSQL/SQLite duplicate-table creation races."""
    original = error.orig
    sqlstate = getattr(original, "sqlstate", None) or getattr(original, "pgcode", None)
    if sqlstate == "42P07":  # PostgreSQL duplicate_table
        return True

    # sqlite3 exposes SQLITE_ERROR for duplicate CREATE TABLE; its message is
    # specific enough to distinguish this expected race from other SQL errors.
    return "already exists" in str(original).lower() and "table users" in str(original).lower()


def bootstrap_users(engine: Engine = configured_engine) -> bool:
    """Create users if safe, or validate it if present.

    Returns True when this call created the table and False when it validated an
    existing table. Other database errors are allowed to propagate.
    """
    with engine.connect() as connection:
        inspector = inspect(connection)
        table_names = set(inspector.get_table_names())

        if "users" in table_names:
            _validate_users_table(connection)
            return False

        if "alembic_version" in table_names:
            raise UserTableBootstrapError(
                "Cannot bootstrap users: alembic_version exists while the users "
                "table is missing. The migration state is inconsistent; inspect "
                "the database and Alembic revision history before proceeding."
            )

        application_tables = sorted(table_names)
        if application_tables:
            raise UserTableBootstrapError(
                "Cannot bootstrap users: the users table is missing while other "
                "application tables exist: "
                + ", ".join(application_tables)
                + ". Resolve this database state explicitly before migrating."
            )

    try:
        User.__table__.create(bind=engine, checkfirst=False)
    except DBAPIError as error:
        if not _is_already_exists_race(error):
            raise

        # Use a fresh connection after the failed CREATE. PostgreSQL marks the
        # failing transaction aborted, so inspection on that connection is not
        # portable or reliable.
        with engine.connect() as connection:
            if "users" not in set(inspect(connection).get_table_names()):
                raise
            _validate_users_table(connection)
        return False

    with engine.connect() as connection:
        _validate_users_table(connection)
    return True


def main(argv: Iterable[str] | None = None) -> int:
    """CLI entry point for ``python -m app.db_bootstrap``."""
    parser = argparse.ArgumentParser(description="Create or validate only the users table.")
    parser.parse_args(argv)
    try:
        created = bootstrap_users()
    except UserTableBootstrapError as error:
        print(f"Users table bootstrap failed: {error}", file=sys.stderr)
        return 1
    except Exception as error:
        # Report and preserve a failing exit status; do not hide SQL/database errors.
        print(f"Users table bootstrap failed: {error}", file=sys.stderr)
        return 1

    if created:
        print("Users table created and validated successfully.")
    else:
        print("Existing users table validated successfully; no changes made.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
