from fastapi.testclient import TestClient

from app.database import Base


def test_fastapi_startup_does_not_create_database_tables(monkeypatch):
    from app.main import app

    def fail_if_create_all_called(*args, **kwargs):
        raise AssertionError("FastAPI startup must not create database tables")

    monkeypatch.setattr(Base.metadata, "create_all", fail_if_create_all_called)

    with TestClient(app) as client:
        response = client.get("/")

    assert response.status_code == 200
    assert response.json()["message"] == "Trip Management System API"
