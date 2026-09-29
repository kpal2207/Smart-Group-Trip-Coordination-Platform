"""
Test fixtures for the Auth module.

Uses an in-memory SQLite database so tests run fast without
needing a real PostgreSQL instance.
"""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.models.user import User  # noqa: F401 — ensures model is registered
from app.models.trip import Trip, TripMember  # noqa: F401 — ensures models are registered
from app.services.auth import hash_password

# ---------------------------------------------------------------------------
# Test database — SQLite in-memory (fast, no external deps)
# ---------------------------------------------------------------------------
SQLALCHEMY_DATABASE_URL = "sqlite:///:memory:"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},  # required for SQLite
    poolclass=StaticPool,                        # reuse the same connection
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(autouse=True)
def setup_database():
    """
    Create all tables before each test and drop them after.
    This ensures every test starts with a clean database.
    """
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def db(setup_database):
    """Provide a database session for a single test, rolled back afterward."""
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture
def client(db):
    """
    Provide a FastAPI TestClient with the database dependency overridden
    to use our in-memory SQLite database.
    """
    # Import here to avoid triggering the lifespan DB creation
    from app.main import app

    def override_get_db():
        try:
            yield db
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture
def test_user(db):
    """Create and return a test user in the database."""
    user = User(
        name="Test User",
        email="test@example.com",
        password_hash=hash_password("Test1234!"),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@pytest.fixture
def auth_header(client, test_user):
    """
    Login the test user and return an Authorization header dict.
    Useful for testing protected endpoints.
    """
    response = client.post(
        "/auth/login",
        json={"email": "test@example.com", "password": "Test1234!"},
    )
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def second_user(db):
    """Create and return a second test user in the database."""
    user = User(
        name="Second User",
        email="second@example.com",
        password_hash=hash_password("Test1234!"),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@pytest.fixture
def auth_header_second(client, second_user):
    """Login the second user and return an Authorization header dict."""
    response = client.post(
        "/auth/login",
        json={"email": "second@example.com", "password": "Test1234!"},
    )
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}
