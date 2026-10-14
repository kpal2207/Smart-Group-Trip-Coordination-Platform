"""
Tests for Trip creation and joining endpoints.

Covers:
- Authenticated trip creation
- Auto-assignment of host_id from token (not request body)
- Unique trip code generation
- Unauthenticated access rejection
- Joining a trip via POST /trips/join (body)
- Joining a trip via GET /trips/join/{code} (link)
- Duplicate join prevention (409)
- Invalid trip code rejection (404)
- Listing own trips
- Fetching a single trip
"""

import pytest

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

VALID_TRIP = {
    "title": "Goa Beach Trip",
    "description": "Fun in the sun",
    "destination": "Goa, India",
    "start_date": "2026-12-15",
    "end_date": "2026-12-20",
}


def _create_trip(client, auth_header, data=None):
    """Helper: POST /trips/ with auth and return response."""
    return client.post("/trips/", json=data or VALID_TRIP, headers=auth_header)


# ===========================================================================
# Trip Creation
# ===========================================================================

class TestCreateTrip:

    def test_create_trip_success(self, client, auth_header):
        """Authenticated user can create a trip and receives a trip_code."""
        response = _create_trip(client, auth_header)
        assert response.status_code == 201, response.text
        data = response.json()
        assert data["title"] == VALID_TRIP["title"]
        assert data["destination"] == VALID_TRIP["destination"]
        assert "trip_code" in data
        assert len(data["trip_code"]) == 8
        assert data["trip_code"].isupper() or data["trip_code"].isalnum()

    def test_host_id_set_from_token(self, client, test_user, auth_header):
        """host_id must equal the authenticated user's id — never from request body."""
        response = _create_trip(client, auth_header)
        assert response.status_code == 201
        assert response.json()["host_id"] == test_user.id

    def test_create_trip_unauthenticated(self, client):
        """Creating a trip without a token must return 401."""
        response = client.post("/trips/", json=VALID_TRIP)
        assert response.status_code == 401

    def test_create_trip_invalid_token(self, client):
        """Creating a trip with a bad token must return 401."""
        response = client.post(
            "/trips/",
            json=VALID_TRIP,
            headers={"Authorization": "Bearer totally_fake_token"},
        )
        assert response.status_code == 401

    def test_create_trip_missing_required_fields(self, client, auth_header):
        """Missing required fields must return 422."""
        response = client.post(
            "/trips/",
            json={"title": "No destination"},
            headers=auth_header,
        )
        assert response.status_code == 422

    def test_create_trip_end_before_start(self, client, auth_header):
        """end_date before start_date must return 422."""
        response = client.post(
            "/trips/",
            json={**VALID_TRIP, "start_date": "2026-12-20", "end_date": "2026-12-15"},
            headers=auth_header,
        )
        assert response.status_code == 422

    def test_create_trip_empty_title(self, client, auth_header):
        """Empty title must return 422."""
        response = _create_trip(client, auth_header, {**VALID_TRIP, "title": "   "})
        assert response.status_code == 422

    def test_trip_codes_are_unique(self, client, auth_header):
        """Each trip should receive a distinct trip code."""
        r1 = _create_trip(client, auth_header)
        r2 = _create_trip(client, auth_header)
        assert r1.status_code == 201
        assert r2.status_code == 201
        assert r1.json()["trip_code"] != r2.json()["trip_code"]

    def test_creator_auto_enrolled_as_host(self, client, test_user, auth_header, db):
        """After creation, the host should have a TripMember record with role=host."""
        from app.models.trip import TripMember, MemberRole
        response = _create_trip(client, auth_header)
        trip_id = response.json()["id"]
        membership = db.query(TripMember).filter_by(trip_id=trip_id, user_id=test_user.id).first()
        assert membership is not None
        assert membership.role == MemberRole.host


# ===========================================================================
# Trip Joining — POST /trips/join
# ===========================================================================

class TestJoinTripPost:

    def test_join_trip_success(self, client, auth_header, auth_header_second):
        """Second user can join a trip created by the first user."""
        trip_code = _create_trip(client, auth_header).json()["trip_code"]
        response = client.post(
            "/trips/join",
            json={"trip_code": trip_code},
            headers=auth_header_second,
        )
        assert response.status_code == 200, response.text
        data = response.json()
        assert data["message"] == "Successfully joined the trip."
        assert data["trip"]["trip_code"] == trip_code
        assert data["membership"]["role"] == "member"

    def test_join_case_insensitive_code(self, client, auth_header, auth_header_second):
        """Trip codes should be accepted in any case."""
        trip_code = _create_trip(client, auth_header).json()["trip_code"]
        lower_code = trip_code.lower()
        response = client.post(
            "/trips/join",
            json={"trip_code": lower_code},
            headers=auth_header_second,
        )
        assert response.status_code == 200

    def test_duplicate_join_rejected(self, client, auth_header, auth_header_second):
        """Joining the same trip twice must return 409."""
        trip_code = _create_trip(client, auth_header).json()["trip_code"]
        # First join succeeds
        r1 = client.post("/trips/join", json={"trip_code": trip_code}, headers=auth_header_second)
        assert r1.status_code == 200
        # Second join must fail
        r2 = client.post("/trips/join", json={"trip_code": trip_code}, headers=auth_header_second)
        assert r2.status_code == 409
        assert "already a member" in r2.json()["detail"]

    def test_host_cannot_rejoin_own_trip(self, client, auth_header):
        """Host is already enrolled at creation — attempting to join again must return 409."""
        trip_code = _create_trip(client, auth_header).json()["trip_code"]
        response = client.post(
            "/trips/join",
            json={"trip_code": trip_code},
            headers=auth_header,
        )
        assert response.status_code == 409

    def test_invalid_code_rejected(self, client, auth_header):
        """Non-existent trip code must return 404."""
        response = client.post(
            "/trips/join",
            json={"trip_code": "XXXXXXXX"},
            headers=auth_header,
        )
        assert response.status_code == 404

    def test_join_unauthenticated(self, client, auth_header):
        """Joining without a token must return 401."""
        trip_code = _create_trip(client, auth_header).json()["trip_code"]
        response = client.post("/trips/join", json={"trip_code": trip_code})
        assert response.status_code == 401


# ===========================================================================
# Trip Joining — GET /trips/join/{code}  (shareable link)
# ===========================================================================

class TestJoinTripLink:

    def test_join_via_link_success(self, client, auth_header, auth_header_second):
        """GET /trips/join/{code} allows joining via a shareable link."""
        trip_code = _create_trip(client, auth_header).json()["trip_code"]
        response = client.get(f"/trips/join/{trip_code}", headers=auth_header_second)
        assert response.status_code == 200, response.text
        assert response.json()["trip"]["trip_code"] == trip_code

    def test_join_via_link_duplicate_rejected(self, client, auth_header, auth_header_second):
        """Following the link twice must still return 409."""
        trip_code = _create_trip(client, auth_header).json()["trip_code"]
        client.get(f"/trips/join/{trip_code}", headers=auth_header_second)
        r2 = client.get(f"/trips/join/{trip_code}", headers=auth_header_second)
        assert r2.status_code == 409

    def test_join_via_link_invalid_code(self, client, auth_header):
        """GET /trips/join/BADCODE must return 404."""
        response = client.get("/trips/join/BADCODE00", headers=auth_header)
        assert response.status_code == 404

    def test_join_via_link_unauthenticated(self, client, auth_header):
        """Following the link without a token must return 401."""
        trip_code = _create_trip(client, auth_header).json()["trip_code"]
        response = client.get(f"/trips/join/{trip_code}")
        assert response.status_code == 401


# ===========================================================================
# List and Get Trip
# ===========================================================================

class TestListAndGetTrip:

    def test_list_trips_returns_own_trips(self, client, auth_header, auth_header_second):
        """GET /trips/ returns only trips the user belongs to."""
        # host creates 2 trips
        _create_trip(client, auth_header, {**VALID_TRIP, "title": "Trip A"})
        code_b = _create_trip(client, auth_header, {**VALID_TRIP, "title": "Trip B"}).json()["trip_code"]
        # second user joins trip B only
        client.post("/trips/join", json={"trip_code": code_b}, headers=auth_header_second)

        r_host = client.get("/trips/", headers=auth_header)
        r_member = client.get("/trips/", headers=auth_header_second)
        assert r_host.status_code == 200
        assert len(r_host.json()) == 2
        assert r_member.status_code == 200
        assert len(r_member.json()) == 1

    def test_get_trip_by_id_success(self, client, auth_header):
        """GET /trips/{id} returns trip details for a member."""
        trip_data = _create_trip(client, auth_header).json()
        trip_id = trip_data["id"]
        response = client.get(f"/trips/{trip_id}", headers=auth_header)
        assert response.status_code == 200
        assert response.json()["id"] == trip_id

    def test_get_trip_by_id_not_member(self, client, auth_header, auth_header_second):
        """GET /trips/{id} returns 404 if user is not a member."""
        trip_id = _create_trip(client, auth_header).json()["id"]
        response = client.get(f"/trips/{trip_id}", headers=auth_header_second)
        assert response.status_code == 404

    def test_list_trips_unauthenticated(self, client):
        """GET /trips/ without token must return 401."""
        response = client.get("/trips/")
        assert response.status_code == 401
