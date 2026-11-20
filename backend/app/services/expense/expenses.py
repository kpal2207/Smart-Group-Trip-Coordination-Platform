"""
Expense lifecycle and share split calculation services.
"""

from decimal import Decimal
from sqlalchemy.orm import Session
from fastapi import HTTPException, status

from app.models.user import User
from app.models.trip import TripMember
from app.models.expense import (
    Expense, ExpenseSplit, Notification,
    ExpenseStatus, TripSettlementStatus
)
from app.schemas.expense import ExpenseCreate, CustomSplitItem
from app.services.expense.common import (
    get_trip_and_verify_membership,
    get_or_create_settlement_state,
)


def validate_and_compute_splits(
    db: Session,
    trip_id: int,
    total_amount: Decimal,
    split_type: str,
    member_ids: list[int],
    custom_splits: list[CustomSplitItem]
) -> list[tuple[int, Decimal]]:
    """
    Validate that all target users are valid members of the trip,
    and compute each member's exact share without losing fractions of cents.
    """
    trip_member_user_ids = {
        tm.user_id for tm in db.query(TripMember).filter(TripMember.trip_id == trip_id).all()
    }

    if split_type == "equal":
        for uid in member_ids:
            if uid not in trip_member_user_ids:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"User ID {uid} is not a member of this trip."
                )
        n = len(member_ids)

        # Distribute pennies cleanly
        cents_total = int(round(total_amount * 100))
        base_cents = cents_total // n
        remainder = cents_total % n

        computed = []
        for i, uid in enumerate(member_ids):
            share_cents = base_cents + (1 if i < remainder else 0)
            computed.append((uid, Decimal(share_cents) / Decimal(100)))
        return computed

    elif split_type == "custom":
        computed = []
        total_custom = Decimal("0.00")
        for item in custom_splits:
            if item.user_id not in trip_member_user_ids:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"User ID {item.user_id} is not a member of this trip."
                )
            computed.append((item.user_id, item.share_amount))
            total_custom += item.share_amount

        if abs(total_custom - total_amount) > Decimal("0.05"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Sum of custom shares ({total_custom}) does not equal total amount ({total_amount})."
            )
        return computed

    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid split_type.")


def record_expense(db: Session, trip_id: int, expense_data: ExpenseCreate, current_user: User) -> Expense:
    """
    Record expense in trip ledger and notify affected members.
    Matches activity diagram:
      Validate -> Calculate shares -> Record in trip ledger -> Update 'WHO OWES WHOM' -> Notify Affected Members
    """
    trip, _ = get_trip_and_verify_membership(db, trip_id, current_user)

    # Verify payer belongs to trip
    payer_membership = db.query(TripMember).filter(
        TripMember.trip_id == trip_id,
        TripMember.user_id == expense_data.payer_id
    ).first()
    if not payer_membership:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The specified payer is not an enrolled member of this trip."
        )

    # Compute shares
    shares = validate_and_compute_splits(
        db=db,
        trip_id=trip_id,
        total_amount=expense_data.amount,
        split_type=expense_data.split_type,
        member_ids=expense_data.member_ids,
        custom_splits=expense_data.custom_splits
    )

    # If payer is the only member in split, auto-accept; otherwise pending_review
    initial_status = ExpenseStatus.pending_review
    if len(shares) == 1 and shares[0][0] == expense_data.payer_id:
        initial_status = ExpenseStatus.accepted

    expense = Expense(
        trip_id=trip_id,
        payer_id=expense_data.payer_id,
        title=expense_data.title,
        amount=expense_data.amount,
        currency=expense_data.currency,
        category=expense_data.category,
        description=expense_data.description,
        status=initial_status,
    )
    db.add(expense)
    db.flush()

    for user_id, share_amount in shares:
        split = ExpenseSplit(
            expense_id=expense.id,
            user_id=user_id,
            share_amount=share_amount,
            is_accepted=(user_id == expense_data.payer_id)
        )
        db.add(split)

    # Ensure trip settlement state is active if new expense added
    trip_state = get_or_create_settlement_state(db, trip_id)
    if trip_state.status != TripSettlementStatus.active:
        trip_state.status = TripSettlementStatus.active
        trip_state.settled_at = None

    db.flush()

    # Dispatch notifications to affected members (excluding the payer)
    payer_user = db.query(User).filter(User.id == expense_data.payer_id).first()
    payer_name = payer_user.name if payer_user else "A member"
    for user_id, share_amount in shares:
        if user_id != expense_data.payer_id:
            notif = Notification(
                user_id=user_id,
                trip_id=trip_id,
                expense_id=expense.id,
                notification_type="expense_added",
                message=f"{payer_name} added expense '{expense.title}' ({expense.currency} {expense.amount}). Your share is {expense.currency} {share_amount:.2f}."
            )
            db.add(notif)

    db.commit()
    db.refresh(expense)
    return expense


def mark_expense_accepted(db: Session, expense_id: int, current_user: User) -> Expense:
    """
    Member reviews expense and marks it accepted (Matches activity diagram: Is Disputed? -> [NO] -> Mark Expense accepted).
    """
    expense = db.query(Expense).filter(Expense.id == expense_id).first()
    if not expense:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Expense not found.")

    get_trip_and_verify_membership(db, expense.trip_id, current_user)

    # Mark user's split accepted
    split = db.query(ExpenseSplit).filter(
        ExpenseSplit.expense_id == expense.id,
        ExpenseSplit.user_id == current_user.id
    ).first()

    if split:
        split.is_accepted = True

    # If all splits are accepted, mark entire expense accepted
    all_splits = db.query(ExpenseSplit).filter(ExpenseSplit.expense_id == expense.id).all()
    if all(s.is_accepted for s in all_splits):
        expense.status = ExpenseStatus.accepted

    db.commit()
    db.refresh(expense)
    return expense
