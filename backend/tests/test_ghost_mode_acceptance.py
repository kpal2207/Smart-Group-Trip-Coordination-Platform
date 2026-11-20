"""
Sprint 2 Ghost Mode Acceptance Tests (Ruhan).

Verifies the end-to-end two-account privacy scenario:
1. User A (Member) and User B (Host) are enrolled in the same trip.
2. User A broadcasts GPS coordinates with Ghost Mode OFF -> User B observes fresh coordinates.
3. User A toggles Ghost Mode ON -> User B receives masked (null) coordinates and "hidden" status.
4. User A toggles Ghost Mode OFF -> User B receives restored coordinates.
5. User C (Outsider / Non-member) is rejected with 403 Forbidden on both submit and read.
6. Unauthenticated requests are rejected with 401 Unauthorized.
"""

import pytest
from app.models.user import User
from app.services.auth import hash_password


@pytest.fixture
def outsider_user(db):
    """Create and return an authenticated third user who is NOT a member of the trip."""
    user = User(
        name="Outsider User",
        email="outsider@example.com",
        password_hash=hash_password("Test1234!"),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@pytest.fixture
def auth_header_outsider(client, outsider_user):
    """Return an Authorization header for the outsider user."""
    response = client.post(
        "/auth/login",
        json={"email": "outsider@example.com", "password": "Test1234!"},
    )
    assert response.status_code == 200, response.text
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def enrolled_trip(client, auth_header, auth_header_second):
    """
    Set up a 2-member trip:
    - Host: test_user (auth_header)
    - Member: second_user (auth_header_second)
    Returns trip dict with id and trip_code.
    """
    trip_payload = {
        "title": "Ghost Mode Acceptance Trip",
        "destination": "Goa NH48 Corridor",
        "start_date": "2026-12-01",
        "end_date": "2026-12-05",
    }
    create_res = client.post("/trips/", json=trip_payload, headers=auth_header)
    assert create_res.status_code == 201, create_res.text
    trip_data = create_res.json()

    # Second user joins the trip via trip code
    join_res = client.post(
        "/trips/join",
        json={"trip_code": trip_data["trip_code"]},
        headers=auth_header_second,
    )
    assert join_res.status_code == 200, join_res.text

    return trip_data


def test_ghost_mode_multi_session_lifecycle(
    client, auth_header, auth_header_second, test_user, second_user, enrolled_trip
):
    """
    Two-session scenario:
    - Session 1: Host (test_user, auth_header)
    - Session 2: Member (second_user, auth_header_second)
    """
    trip_id = enrolled_trip["id"]

    # Step 0: Before any ping is sent, Member is present in convoy with "unavailable" status
    initial_locations_res = client.get(
        f"/trips/{trip_id}/convoy/locations", headers=auth_header
    )
    assert initial_locations_res.status_code == 200, initial_locations_res.text
    initial_member = next(
        m for m in initial_locations_res.json() if m["user_id"] == second_user.id
    )
    assert initial_member["location_status"] == "unavailable"
    assert initial_member["latitude"] is None
    assert initial_member["longitude"] is None
    assert initial_member["is_ghost_mode"] is False

    # Step 1: Member (Session 2) submits a normal GPS ping (Ghost Mode OFF)
    normal_ping = {
        "latitude": 15.2993,
        "longitude": 74.1240,
        "speed_kmh": 72.5,
        "heading": 180.0,
        "is_ghost_mode": False,
    }
    sub_res = client.post(
        f"/trips/{trip_id}/telemetry", json=normal_ping, headers=auth_header_second
    )
    assert sub_res.status_code == 201, sub_res.text
    assert sub_res.json()["latitude"] == pytest.approx(15.2993)
    assert sub_res.json()["longitude"] == pytest.approx(74.1240)
    assert sub_res.json()["is_ghost_mode"] is False

    # Step 2: Host (Session 1) reads convoy locations -> Member coords are visible and fresh
    locations_res = client.get(
        f"/trips/{trip_id}/convoy/locations", headers=auth_header
    )
    assert locations_res.status_code == 200, locations_res.text
    members = locations_res.json()
    member_record = next(m for m in members if m["user_id"] == second_user.id)
    assert member_record["location_status"] == "fresh"
    assert member_record["is_ghost_mode"] is False
    assert member_record["latitude"] == pytest.approx(15.2993)
    assert member_record["longitude"] == pytest.approx(74.1240)
    assert member_record["speed_kmh"] == 72.5
    assert member_record["heading"] == 180.0

    # Step 3: Member (Session 2) toggles Ghost Mode ON and submits ping
    ghost_ping = {
        "latitude": 15.3500,
        "longitude": 74.1500,
        "speed_kmh": 80.0,
        "heading": 195.0,
        "is_ghost_mode": True,
    }
    ghost_sub_res = client.post(
        f"/trips/{trip_id}/telemetry", json=ghost_ping, headers=auth_header_second
    )
    assert ghost_sub_res.status_code == 201, ghost_sub_res.text
    # Even in submitting member's response, coordinates must be masked
    assert ghost_sub_res.json()["latitude"] is None
    assert ghost_sub_res.json()["longitude"] is None
    assert ghost_sub_res.json()["is_ghost_mode"] is True

    # Step 4: Host (Session 1) reads convoy locations -> Member coords are masked to null!
    locations_after_ghost = client.get(
        f"/trips/{trip_id}/convoy/locations", headers=auth_header
    )
    assert locations_after_ghost.status_code == 200, locations_after_ghost.text
    member_ghost_record = next(
        m for m in locations_after_ghost.json() if m["user_id"] == second_user.id
    )
    assert member_ghost_record["is_ghost_mode"] is True
    assert member_ghost_record["location_status"] == "hidden"
    assert member_ghost_record["latitude"] is None
    assert member_ghost_record["longitude"] is None
    # Speed and heading are retained for convoy formation safety
    assert member_ghost_record["speed_kmh"] == 80.0
    assert member_ghost_record["heading"] == 195.0

    # Step 5: Member (Session 2) toggles Ghost Mode OFF and submits a new ping
    restored_ping = {
        "latitude": 15.4000,
        "longitude": 74.1800,
        "speed_kmh": 85.0,
        "heading": 200.0,
        "is_ghost_mode": False,
    }
    restored_sub_res = client.post(
        f"/trips/{trip_id}/telemetry", json=restored_ping, headers=auth_header_second
    )
    assert restored_sub_res.status_code == 201, restored_sub_res.text
    assert restored_sub_res.json()["latitude"] == pytest.approx(15.4000)
    assert restored_sub_res.json()["longitude"] == pytest.approx(74.1800)

    # Step 6: Host (Session 1) verifies coordinates are restored
    locations_restored = client.get(
        f"/trips/{trip_id}/convoy/locations", headers=auth_header
    )
    assert locations_restored.status_code == 200, locations_restored.text
    restored_record = next(
        m for m in locations_restored.json() if m["user_id"] == second_user.id
    )
    assert restored_record["is_ghost_mode"] is False
    assert restored_record["location_status"] == "fresh"
    assert restored_record["latitude"] == pytest.approx(15.4000)
    assert restored_record["longitude"] == pytest.approx(74.1800)


def test_outsider_access_denied_with_403(
    client, auth_header_outsider, enrolled_trip
):
    """
    Security check: an authenticated user who is NOT a member of the trip
    must receive 403 Forbidden when attempting to submit telemetry or read locations.
    """
    trip_id = enrolled_trip["id"]

    # 1. Outsider attempts to submit a telemetry ping to the trip
    ping_payload = {
        "latitude": 15.2993,
        "longitude": 74.1240,
        "speed_kmh": 60.0,
        "heading": 90.0,
        "is_ghost_mode": False,
    }
    submit_res = client.post(
        f"/trips/{trip_id}/telemetry",
        json=ping_payload,
        headers=auth_header_outsider,
    )
    assert submit_res.status_code == 403
    assert submit_res.json()["detail"] == "You must be an active member of this trip."

    # 2. Outsider attempts to read convoy locations for the trip
    read_res = client.get(
        f"/trips/{trip_id}/convoy/locations",
        headers=auth_header_outsider,
    )
    assert read_res.status_code == 403
    assert read_res.json()["detail"] == "You must be an active member of this trip."


def test_unauthenticated_requests_denied_with_401(client, enrolled_trip):
    """
    Security check: unauthenticated requests must be rejected with 401 Unauthorized.
    """
    trip_id = enrolled_trip["id"]
    ping_payload = {
        "latitude": 15.2993,
        "longitude": 74.1240,
        "speed_kmh": 60.0,
        "heading": 90.0,
        "is_ghost_mode": False,
    }

    assert client.post(f"/trips/{trip_id}/telemetry", json=ping_payload).status_code == 401
    assert client.get(f"/trips/{trip_id}/convoy/locations").status_code == 401
