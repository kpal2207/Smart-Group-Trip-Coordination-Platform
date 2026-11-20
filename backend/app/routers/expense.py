"""
Expense Management API router — Sprint 1 Expense Splitting Feature.

Endpoints strictly correspond to the activity diagram:
- Select Active Trip & View Ledger / 'Who Owes Whom' Dashboard
- Add Expense (Amount, Category, Payer, Currency, Members) -> validation & recording
- Member reviews expense & disputes -> Notifies host
- Host reviews dispute -> modify split or keep split -> updates ledger
- Mark expense accepted
- Members settle balances -> checks if all balances cleared -> marks settlement complete (trip finished)
- In-app notification center for affected members and host
"""

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies.auth import get_current_user
from app.models.user import User
from app.models.expense import Notification
from app.schemas.expense import (
    ExpenseCreate, ExpenseResponse, DisputeCreate, DisputeResponse,
    DisputeReview, SettlementCreate, SettlementResponse,
    TripMemberItem, TripLedgerDashboard, NotificationResponse, StatusResponse
)
from app.services import expense as expense_service

router = APIRouter(tags=["Expense Management"])


# ---------------------------------------------------------------------------
# 1. Trip Ledger & Dashboard
# ---------------------------------------------------------------------------

@router.get("/trips/{trip_id}/expenses/dashboard", response_model=TripLedgerDashboard)
def get_trip_expense_dashboard(
    trip_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Fetch the full ledger dashboard for the active trip:
    expenses, 'Who Owes Whom' breakdown, member balances, settlements, and completion state.
    """
    return expense_service.get_trip_ledger_dashboard(db, trip_id, current_user)


@router.get("/trips/{trip_id}/members", response_model=list[TripMemberItem])
def get_trip_members(
    trip_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Return enrolled members of the trip for member selection in expense splitting.
    """
    expense_service.get_trip_and_verify_membership(db, trip_id, current_user)
    return expense_service.get_trip_members_list(db, trip_id)


# ---------------------------------------------------------------------------
# 2. Add / Record Expense
# ---------------------------------------------------------------------------

@router.post("/trips/{trip_id}/expenses", response_model=ExpenseResponse, status_code=status.HTTP_201_CREATED)
def add_expense(
    trip_id: int,
    payload: ExpenseCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Submit and record an expense in the trip ledger.
    Triggers backend validation, calculates shares, updates 'Who Owes Whom' dashboard,
    and notifies affected members.
    """
    expense = expense_service.record_expense(db, trip_id, payload, current_user)
    return ExpenseResponse.model_validate(expense)


# ---------------------------------------------------------------------------
# 3. Dispute & Acceptance Flow
# ---------------------------------------------------------------------------

@router.post("/expenses/{expense_id}/dispute", response_model=DisputeResponse, status_code=status.HTTP_201_CREATED)
def raise_dispute(
    expense_id: int,
    payload: DisputeCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Member raises a dispute on an expense split. Notifies the trip host.
    """
    dispute = expense_service.dispute_expense(db, expense_id, payload, current_user)
    return DisputeResponse.model_validate(dispute)


@router.post("/disputes/{dispute_id}/review", response_model=ExpenseResponse)
def review_dispute(
    dispute_id: int,
    payload: DisputeReview,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Trip Host reviews dispute:
    - If modify_split is true: updates split, recalculates shares, and records in ledger.
    - If modify_split is false: keeps existing split and marks accepted.
    """
    expense = expense_service.review_dispute(db, dispute_id, payload, current_user)
    return ExpenseResponse.model_validate(expense)


@router.post("/expenses/{expense_id}/accept", response_model=ExpenseResponse)
def accept_expense(
    expense_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Member reviews expense and confirms agreement (marks expense accepted).
    """
    expense = expense_service.mark_expense_accepted(db, expense_id, current_user)
    return ExpenseResponse.model_validate(expense)


# ---------------------------------------------------------------------------
# 4. Settlements
# ---------------------------------------------------------------------------

@router.post("/trips/{trip_id}/settlements", response_model=SettlementResponse, status_code=status.HTTP_201_CREATED)
def settle_balance(
    trip_id: int,
    payload: SettlementCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Members settle balances by logging payments.
    Evaluates if all balances are cleared:
    - If YES -> Marks settlement complete (trip finished)
    - If NO  -> Shows pending balance and notifies affected members
    """
    settlement, all_cleared, pending_balance = expense_service.record_settlement_payment(
        db, trip_id, payload, current_user
    )
    return SettlementResponse.model_validate(settlement)


# ---------------------------------------------------------------------------
# 5. In-App Notifications
# ---------------------------------------------------------------------------

@router.get("/notifications", response_model=list[NotificationResponse])
def get_user_notifications(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Retrieve all notifications for the authenticated user, ordered newest first.
    """
    return db.query(Notification).filter(
        Notification.user_id == current_user.id
    ).order_by(Notification.created_at.desc()).limit(50).all()


@router.post("/notifications/{notification_id}/read", response_model=StatusResponse)
def mark_notification_read(
    notification_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Mark a single notification as read.
    """
    notif = db.query(Notification).filter(
        Notification.id == notification_id,
        Notification.user_id == current_user.id
    ).first()
    if notif:
        notif.is_read = True
        db.commit()
    return {"status": "ok"}


@router.post("/notifications/read-all", response_model=StatusResponse)
def mark_all_notifications_read(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Mark all notifications for the current user as read.
    """
    db.query(Notification).filter(
        Notification.user_id == current_user.id,
        Notification.is_read.is_(False)
    ).update({"is_read": True})
    db.commit()
    return {"status": "ok"}
