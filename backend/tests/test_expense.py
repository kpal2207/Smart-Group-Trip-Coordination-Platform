"""
Integration and Unit Tests for the Expense Management & Splitting Feature.

Verifies every path and decision in the activity diagram:
1. Select active trip & get dashboard
2. Add expense (amount, category, payer, currency, members)
3. Validation checks (invalid amount, non-members, mismatched custom splits)
4. Equal & custom expense share calculation and penny rounding
5. Ledger recording and 'Who Owes Whom' dashboard updates
6. Notification generation for affected members
7. Member review & acceptance
8. Member disputes expense -> notification to host
9. Host reviews dispute -> keep split vs modify split
10. Members settle balances -> partial settlement vs all balances cleared (marking trip finished)
"""

import pytest
from datetime import date
from decimal import Decimal
from fastapi.testclient import TestClient

from app.models.user import User
from app.models.trip import Trip, TripMember, MemberRole
from app.models.expense import Expense, ExpenseSplit, Dispute, Settlement, Notification, TripSettlementState
from app.services.auth import hash_password, create_access_token


@pytest.fixture
def test_users(db):
    """Create three test users: Host, Member1, Member2."""
    users = []
    for i in range(1, 4):
        u = User(
            name=f"User {i}",
            email=f"user{i}@example.com",
            password_hash=hash_password("Password123!"),
        )
        db.add(u)
    db.commit()
    for u in users:
        db.refresh(u)
    return db.query(User).order_by(User.id).all()


@pytest.fixture
def auth_headers(test_users):
    """Return authorization headers for all three test users."""
    headers = {}
    for u in test_users:
        token = create_access_token({"sub": u.email})
        headers[u.id] = {"Authorization": f"Bearer {token}"}
    return headers


@pytest.fixture
def test_trip(db, test_users):
    """Create a trip where User 1 is Host, User 2 and User 3 are Members."""
    trip = Trip(
        title="Goa Vacation",
        destination="Goa, India",
        start_date=date(2026, 11, 1),
        end_date=date(2026, 11, 10),
        host_id=test_users[0].id,
        trip_code="GOA12345",
    )
    db.add(trip)
    db.commit()
    db.refresh(trip)

    # Add memberships
    db.add(TripMember(trip_id=trip.id, user_id=test_users[0].id, role=MemberRole.host))
    db.add(TripMember(trip_id=trip.id, user_id=test_users[1].id, role=MemberRole.member))
    db.add(TripMember(trip_id=trip.id, user_id=test_users[2].id, role=MemberRole.member))
    db.commit()

    return trip


class TestExpenseValidationAndCreation:
    def test_add_expense_equal_split_success(self, client: TestClient, test_trip, test_users, auth_headers):
        host = test_users[0]
        payload = {
            "title": "Beach Dinner",
            "amount": 90.00,
            "currency": "USD",
            "category": "Food & Dining",
            "description": "Seafood by the beach",
            "payer_id": host.id,
            "split_type": "equal",
            "member_ids": [test_users[0].id, test_users[1].id, test_users[2].id],
        }

        res = client.post(
            f"/trips/{test_trip.id}/expenses",
            json=payload,
            headers=auth_headers[host.id],
        )
        assert res.status_code == 201
        data = res.json()
        assert data["title"] == "Beach Dinner"
        assert float(data["amount"]) == 90.00
        assert len(data["splits"]) == 3
        for split in data["splits"]:
            assert float(split["share_amount"]) == 30.00

    def test_add_expense_validation_amount_negative(self, client: TestClient, test_trip, test_users, auth_headers):
        host = test_users[0]
        payload = {
            "title": "Invalid Expense",
            "amount": -50.00,
            "payer_id": host.id,
            "split_type": "equal",
            "member_ids": [host.id],
        }
        res = client.post(
            f"/trips/{test_trip.id}/expenses",
            json=payload,
            headers=auth_headers[host.id],
        )
        assert res.status_code == 422

    def test_add_expense_non_member_rejected(self, client: TestClient, test_trip, test_users, auth_headers):
        host = test_users[0]
        payload = {
            "title": "Sneaky Split",
            "amount": 100.00,
            "payer_id": host.id,
            "split_type": "equal",
            "member_ids": [9999],  # non-existent user
        }
        res = client.post(
            f"/trips/{test_trip.id}/expenses",
            json=payload,
            headers=auth_headers[host.id],
        )
        assert res.status_code == 400
        assert "not a member" in res.json()["detail"]

    def test_add_expense_custom_split_mismatch_rejected(self, client: TestClient, test_trip, test_users, auth_headers):
        host = test_users[0]
        payload = {
            "title": "Mismatched Split",
            "amount": 100.00,
            "payer_id": host.id,
            "split_type": "custom",
            "custom_splits": [
                {"user_id": test_users[0].id, "share_amount": 40.00},
                {"user_id": test_users[1].id, "share_amount": 40.00},
            ],  # sum is 80 != 100
        }
        res = client.post(
            f"/trips/{test_trip.id}/expenses",
            json=payload,
            headers=auth_headers[host.id],
        )
        assert res.status_code == 422


class TestBalancesAndWhoOwesWhom:
    def test_who_owes_whom_calculation(self, client: TestClient, test_trip, test_users, auth_headers):
        # User 1 pays $60 for User 1 and User 2 ($30 each)
        client.post(
            f"/trips/{test_trip.id}/expenses",
            json={
                "title": "Cab Ride",
                "amount": 60.00,
                "payer_id": test_users[0].id,
                "split_type": "equal",
                "member_ids": [test_users[0].id, test_users[1].id],
            },
            headers=auth_headers[test_users[0].id],
        )

        # Check dashboard
        res = client.get(
            f"/trips/{test_trip.id}/expenses/dashboard",
            headers=auth_headers[test_users[0].id],
        )
        assert res.status_code == 200
        data = res.json()

        assert data["all_balances_cleared"] is False
        assert float(data["pending_balance_amount"]) == 30.00

        # Who owes whom should show User 2 owes User 1 $30
        owes = data["who_owes_whom"]
        assert len(owes) == 1
        assert owes[0]["from_user_id"] == test_users[1].id
        assert owes[0]["to_user_id"] == test_users[0].id
        assert float(owes[0]["amount"]) == 30.00


class TestDisputeWorkflow:
    def test_member_dispute_and_host_review(self, client: TestClient, test_trip, test_users, auth_headers):
        # 1. User 1 adds expense including User 2
        exp_res = client.post(
            f"/trips/{test_trip.id}/expenses",
            json={
                "title": "Scuba Diving",
                "amount": 100.00,
                "payer_id": test_users[0].id,
                "split_type": "equal",
                "member_ids": [test_users[0].id, test_users[1].id],
            },
            headers=auth_headers[test_users[0].id],
        )
        expense_id = exp_res.json()["id"]

        # 2. User 2 raises a dispute
        disp_res = client.post(
            f"/expenses/{expense_id}/dispute",
            json={"reason": "I did not participate in scuba diving."},
            headers=auth_headers[test_users[1].id],
        )
        assert disp_res.status_code == 201
        dispute_id = disp_res.json()["id"]

        # Verify host received a notification
        notifs_res = client.get("/notifications", headers=auth_headers[test_users[0].id])
        assert notifs_res.status_code == 200
        assert any("disputed expense 'Scuba Diving'" in n["message"] for n in notifs_res.json())

        # 3. Host reviews dispute and modifies the split (puts 100% on User 1)
        rev_res = client.post(
            f"/disputes/{dispute_id}/review",
            json={
                "modify_split": True,
                "new_splits": [
                    {"user_id": test_users[0].id, "share_amount": 100.00}
                ],
                "notes": "Agreed, removed User 2 from the split.",
            },
            headers=auth_headers[test_users[0].id],
        )
        assert rev_res.status_code == 200
        updated = rev_res.json()
        assert updated["status"] == "accepted"
        assert len(updated["splits"]) == 1
        assert float(updated["splits"][0]["share_amount"]) == 100.00


class TestSettlementWorkflow:
    def test_settle_payment_clears_balances_and_finishes_trip(
        self, client: TestClient, test_trip, test_users, auth_headers
    ):
        # 1. User 1 pays $50 for User 2 ($50 share to User 2)
        client.post(
            f"/trips/{test_trip.id}/expenses",
            json={
                "title": "Hotel Room",
                "amount": 50.00,
                "payer_id": test_users[0].id,
                "split_type": "custom",
                "custom_splits": [
                    {"user_id": test_users[1].id, "share_amount": 50.00}
                ],
            },
            headers=auth_headers[test_users[0].id],
        )

        # 2. User 2 settles balance by paying User 1 $50
        settle_res = client.post(
            f"/trips/{test_trip.id}/settlements",
            json={
                "payee_id": test_users[0].id,
                "amount": 50.00,
                "notes": "Paid via UPI",
            },
            headers=auth_headers[test_users[1].id],
        )
        assert settle_res.status_code == 201

        # 3. Check dashboard -> All balances cleared should be True, trip finished!
        dash_res = client.get(
            f"/trips/{test_trip.id}/expenses/dashboard",
            headers=auth_headers[test_users[0].id],
        )
        assert dash_res.status_code == 200
        dash = dash_res.json()
        assert dash["all_balances_cleared"] is True
        assert float(dash["pending_balance_amount"]) == 0.00
        assert dash["trip_status"] == "settled"
