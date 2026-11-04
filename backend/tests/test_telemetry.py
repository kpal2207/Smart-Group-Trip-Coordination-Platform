"""Focused API tests for telemetry validation, authorization, and privacy."""
import pytest

VALID_PING = {
    "latitude": 37.7749,
    "longitude": -122.4194,
    "speed_kmh": 24.5,
    "heading": 180,
    "is_ghost_mode": False,
}

VALID_TRIP = {
    "title": "Telemetry Test Trip",
    "destination": "San Francisco",
    "start_date": "2026-12-01",
    "end_date": "2026-12-05",
}


def _trip_id(client, auth_header):
    response = client.post("/trips/", json=VALID_TRIP, headers=auth_header)
    assert response.status_code == 201, response.text
    return response.json()["id"]


def test_submit_ping_returns_201_for_trip_member(client, auth_header, test_user):
    trip_id = _trip_id(client, auth_header)
    response = client.post(
        f"/trips/{trip_id}/telemetry", json=VALID_PING, headers=auth_header
    )
    assert response.status_code == 201, response.text
    data = response.json()
    assert data["trip_id"] == trip_id
    assert data["user_id"] == test_user.id
    assert data["latitude"] == VALID_PING["latitude"]
    assert data["longitude"] == VALID_PING["longitude"]


@pytest.mark.parametrize(
    "changes",
    [
        {"latitude": 90.01},
        {"latitude": -90.01},
        {"longitude": 180.01},
        {"longitude": -180.01},
        {"speed_kmh": -0.1},
        {"heading": 360.01},
    ],
)
def test_invalid_ping_values_return_422(client, auth_header, changes):
    trip_id = _trip_id(client, auth_header)
    response = client.post(
        f"/trips/{trip_id}/telemetry",
        json={**VALID_PING, **changes},
        headers=auth_header,
    )
    assert response.status_code == 422


def test_non_member_cannot_submit_ping(client, auth_header, auth_header_second):
    trip_id = _trip_id(client, auth_header)
    response = client.post(
        f"/trips/{trip_id}/telemetry",
        json=VALID_PING,
        headers=auth_header_second,
    )
    assert response.status_code == 403


def test_non_member_cannot_read_convoy_locations(client, auth_header, auth_header_second):
    trip_id = _trip_id(client, auth_header)
    response = client.get(
        f"/trips/{trip_id}/convoy/locations", headers=auth_header_second
    )
    assert response.status_code == 403


def test_ghost_mode_masks_coordinates_in_post_and_locations(
    client, auth_header, test_user
):
    trip_id = _trip_id(client, auth_header)
    ghost_ping = {**VALID_PING, "is_ghost_mode": True}
    submitted = client.post(
        f"/trips/{trip_id}/telemetry", json=ghost_ping, headers=auth_header
    )
    assert submitted.status_code == 201, submitted.text
    assert submitted.json()["latitude"] is None
    assert submitted.json()["longitude"] is None

    response = client.get(
        f"/trips/{trip_id}/convoy/locations", headers=auth_header
    )
    assert response.status_code == 200, response.text
    own_location = next(item for item in response.json() if item["user_id"] == test_user.id)
    assert own_location["is_ghost_mode"] is True
    assert own_location["location_status"] == "hidden"
    assert own_location["latitude"] is None
    assert own_location["longitude"] is None


def test_no_ping_member_is_unavailable(client, auth_header, auth_header_second):
    trip_id = _trip_id(client, auth_header)
    joined = client.post(
        "/trips/join",
        json={"trip_code": client.get(f"/trips/{trip_id}", headers=auth_header).json()["trip_code"]},
        headers=auth_header_second,
    )
    assert joined.status_code == 200, joined.text

    response = client.get(
        f"/trips/{trip_id}/convoy/locations", headers=auth_header
    )
    assert response.status_code == 200, response.text
    members = response.json()
    assert len(members) == 2
    assert all(member["location_status"] == "unavailable" for member in members)
    assert all(member["latitude"] is None and member["longitude"] is None for member in members)


def test_telemetry_requires_authentication(client):
    response = client.post(
        "/trips/1/telemetry", json=VALID_PING
    )
    assert response.status_code == 401
