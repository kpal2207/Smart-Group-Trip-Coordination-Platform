"""
Dispute management and host review resolution workflows.
"""

from datetime import datetime, timezone
from sqlalchemy.orm import Session
from fastapi import HTTPException, status

from app.models.user import User
from app.models.trip import Trip
from app.models.expense import (
    Expense, ExpenseSplit, Dispute, Notification,
    ExpenseStatus, DisputeStatus
)
from app.schemas.expense import DisputeCreate, DisputeReview
from app.services.expense.common import get_trip_and_verify_membership
from app.services.expense.expenses import validate_and_compute_splits


def dispute_expense(db: Session, expense_id: int, dispute_data: DisputeCreate, current_user: User) -> Dispute:
    """
    Member reviews expense and raises a dispute.
    Matches activity diagram:
      Members review expense -> Is expense Disputed? -> [YES] -> Notify trip host -> Host reviews dispute
    """
    expense = db.query(Expense).filter(Expense.id == expense_id).first()
    if not expense:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Expense not found.")

    get_trip_and_verify_membership(db, expense.trip_id, current_user)

    # Verify user is affected by this expense
    is_affected = db.query(ExpenseSplit).filter(
        ExpenseSplit.expense_id == expense.id,
        ExpenseSplit.user_id == current_user.id
    ).first()
    if not is_affected:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot dispute an expense you are not included in."
        )

    # Update expense status to disputed
    expense.status = ExpenseStatus.disputed

    dispute = Dispute(
        expense_id=expense.id,
        raised_by_id=current_user.id,
        reason=dispute_data.reason,
        status=DisputeStatus.pending,
    )
    db.add(dispute)

    # Notify Trip Host
    trip = db.query(Trip).filter(Trip.id == expense.trip_id).first()
    if trip and trip.host_id != current_user.id:
        notif = Notification(
            user_id=trip.host_id,
            trip_id=trip.id,
            expense_id=expense.id,
            notification_type="disputed",
            message=f"{current_user.name} disputed expense '{expense.title}': {dispute_data.reason}"
        )
        db.add(notif)

    db.commit()
    db.refresh(dispute)
    return dispute


def review_dispute(
    db: Session,
    dispute_id: int,
    review_data: DisputeReview,
    current_user: User
) -> Expense:
    """
    Host reviews dispute:
    Matches activity diagram:
      Host reviews dispute -> Modify split?
        [NO]  -> Keep existing split -> (loop back to Update dashboard & Notify)
        [YES] -> Update split -> (loop back to Calculate expense shares -> Record in ledger)
    """
    dispute = db.query(Dispute).filter(Dispute.id == dispute_id).first()
    if not dispute:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dispute not found.")

    expense = db.query(Expense).filter(Expense.id == dispute.expense_id).first()
    if not expense:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Expense not found.")

    trip = db.query(Trip).filter(Trip.id == expense.trip_id).first()
    if not trip or trip.host_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the trip host can review and resolve disputes."
        )

    if review_data.modify_split:
        # [YES] Modify split -> Update split -> Recalculate expense shares -> Record in trip ledger
        if not review_data.new_splits:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="New splits must be provided when modifying the split."
            )

        # Validate new splits
        new_shares = validate_and_compute_splits(
            db=db,
            trip_id=trip.id,
            total_amount=expense.amount,
            split_type="custom",
            member_ids=[],
            custom_splits=review_data.new_splits
        )

        # Delete old splits and create new ones
        db.query(ExpenseSplit).filter(ExpenseSplit.expense_id == expense.id).delete()
        for uid, share_amt in new_shares:
            db.add(ExpenseSplit(
                expense_id=expense.id,
                user_id=uid,
                share_amount=share_amt,
                is_accepted=True
            ))

        dispute.status = DisputeStatus.resolved_modify_split
        dispute.host_notes = review_data.notes or "Split modified by host."
        expense.status = ExpenseStatus.accepted

        # Notify affected members
        for uid, share_amt in new_shares:
            db.add(Notification(
                user_id=uid,
                trip_id=trip.id,
                expense_id=expense.id,
                notification_type="dispute_resolved",
                message=f"Host modified the split for '{expense.title}'. Your new share is {expense.currency} {share_amt:.2f}."
            ))

    else:
        # [NO] Keep existing split -> Mark accepted -> Notify affected members
        dispute.status = DisputeStatus.resolved_keep_split
        dispute.host_notes = review_data.notes or "Host confirmed existing split."
        expense.status = ExpenseStatus.accepted

        # Mark all splits accepted
        db.query(ExpenseSplit).filter(ExpenseSplit.expense_id == expense.id).update({"is_accepted": True})

        # Notify disputer and members
        db.add(Notification(
            user_id=dispute.raised_by_id,
            trip_id=trip.id,
            expense_id=expense.id,
            notification_type="dispute_resolved",
            message=f"Host reviewed your dispute on '{expense.title}' and kept the existing split. Notes: {dispute.host_notes}"
        ))

    dispute.resolved_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(expense)
    return expense
