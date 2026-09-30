"""
Business logic and algorithmic services for Expense Splitting, Disputes,
Ledger management, Debt Simplification ('Who Owes Whom'), and Settlements.

Separate service module for Expense Management feature.
"""

from decimal import Decimal, ROUND_HALF_UP
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from fastapi import HTTPException, status

from app.models.user import User
from app.models.trip import Trip, TripMember
from app.models.expense import (
    Expense, ExpenseSplit, Dispute, Settlement, Notification,
    TripSettlementState, ExpenseStatus, DisputeStatus, TripSettlementStatus
)
from app.schemas.expense import (
    ExpenseCreate, DisputeCreate, DisputeReview, SettlementCreate,
    CustomSplitItem, WhoOwesWhomItem, MemberBalanceItem,
    ExpenseResponse, ExpenseSplitResponse, DisputeResponse,
    SettlementResponse, TripMemberItem, TripLedgerDashboard
)


def get_trip_and_verify_membership(db: Session, trip_id: int, current_user: User) -> tuple[Trip, TripMember]:
    """
    Ensure the trip exists and the current user is an enrolled member.
    """
    trip = db.query(Trip).filter(Trip.id == trip_id).first()
    if not trip:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Trip not found.")

    membership = db.query(TripMember).filter(
        TripMember.trip_id == trip_id,
        TripMember.user_id == current_user.id
    ).first()

    if not membership:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not a member of this trip."
        )

    return trip, membership


def get_or_create_settlement_state(db: Session, trip_id: int) -> TripSettlementState:
    state = db.query(TripSettlementState).filter(TripSettlementState.trip_id == trip_id).first()
    if not state:
        state = TripSettlementState(
            trip_id=trip_id,
            status=TripSettlementStatus.active
        )
        db.add(state)
        db.flush()
    return state


def get_trip_members_list(db: Session, trip_id: int) -> list[TripMemberItem]:
    """
    Retrieve all enrolled members of a trip with their profile details.
    """
    members = (
        db.query(TripMember, User)
        .join(User, TripMember.user_id == User.id)
        .filter(TripMember.trip_id == trip_id)
        .all()
    )
    result = []
    for tm, u in members:
        result.append(
            TripMemberItem(
                id=tm.id,
                user_id=u.id,
                name=u.name,
                email=u.email,
                role=tm.role.value if hasattr(tm.role, "value") else str(tm.role),
            )
        )
    return result


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
        if n == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="At least one member must be selected for the expense split."
            )

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


def calculate_balances_and_simplify_debt(db: Session, trip_id: int) -> tuple[
    list[MemberBalanceItem],
    list[WhoOwesWhomItem],
    Decimal,
    bool
]:
    """
    Calculates member balances and debt simplification ('Who Owes Whom').
    Matches activity diagram:
      Update 'WHO OWES WHOM' Dashboard
      Check: All balances cleared?
    """
    members = db.query(TripMember, User).join(User, TripMember.user_id == User.id).filter(
        TripMember.trip_id == trip_id
    ).all()

    # Track paid and share for each user
    user_totals: dict[int, dict] = {
        u.id: {
            "user": u,
            "total_paid": Decimal("0.00"),
            "total_share": Decimal("0.00"),
        }
        for _, u in members
    }

    # 1. Tally from Expenses and Splits
    expenses = db.query(Expense).filter(Expense.trip_id == trip_id).all()
    for exp in expenses:
        # Payer paid the expense
        if exp.payer_id in user_totals:
            user_totals[exp.payer_id]["total_paid"] += exp.amount
        
        # Each member incurred their split
        for s in exp.splits:
            if s.user_id in user_totals:
                user_totals[s.user_id]["total_share"] += s.share_amount

    # 2. Tally from Settlements (direct payments between members)
    settlements = db.query(Settlement).filter(Settlement.trip_id == trip_id).all()
    for st in settlements:
        if st.payer_id in user_totals:
            user_totals[st.payer_id]["total_paid"] += st.amount
        if st.payee_id in user_totals:
            user_totals[st.payee_id]["total_share"] += st.amount

    # Build MemberBalanceItem list
    member_balances: list[MemberBalanceItem] = []
    # For debt simplification: net_balance = total_paid - total_share
    # net > 0 means the member is owed money (creditor)
    # net < 0 means the member owes money (debtor)
    creditors: list[list] = []  # [[user_id, user_name, amount]]
    debtors: list[list] = []    # [[user_id, user_name, amount]]

    total_pending_debt = Decimal("0.00")

    for uid, data in user_totals.items():
        u: User = data["user"]
        paid = data["total_paid"]
        share = data["total_share"]
        net = paid - share

        member_balances.append(
            MemberBalanceItem(
                user_id=u.id,
                user_name=u.name,
                user_email=u.email,
                total_paid=paid,
                total_share=share,
                net_balance=net,
            )
        )

        if net > Decimal("0.01"):
            creditors.append([u.id, u.name, net])
        elif net < Decimal("-0.01"):
            debtors.append([u.id, u.name, -net])
            total_pending_debt += (-net)

    # Debt Simplification Algorithm (Greedy matching)
    who_owes_whom: list[WhoOwesWhomItem] = []
    debtors.sort(key=lambda x: x[2], reverse=True)
    creditors.sort(key=lambda x: x[2], reverse=True)

    d_idx, c_idx = 0, 0
    while d_idx < len(debtors) and c_idx < len(creditors):
        debtor = debtors[d_idx]
        creditor = creditors[c_idx]

        amount = min(debtor[2], creditor[2])
        if amount > Decimal("0.01"):
            who_owes_whom.append(
                WhoOwesWhomItem(
                    from_user_id=debtor[0],
                    from_user_name=debtor[1],
                    to_user_id=creditor[0],
                    to_user_name=creditor[1],
                    amount=round(amount, 2),
                    currency="USD",
                )
            )

        debtor[2] -= amount
        creditor[2] -= amount

        if debtor[2] <= Decimal("0.01"):
            d_idx += 1
        if creditor[2] <= Decimal("0.01"):
            c_idx += 1

    all_balances_cleared = (len(who_owes_whom) == 0) and (total_pending_debt <= Decimal("0.05"))

    return member_balances, who_owes_whom, total_pending_debt, all_balances_cleared


def record_settlement_payment(
    db: Session,
    trip_id: int,
    settlement_data: SettlementCreate,
    current_user: User
) -> tuple[Settlement, bool, Decimal]:
    """
    Members settle balances.
    Matches activity diagram:
      Members settle balances -> All balances cleared?
        [NO]  -> show pending balance -> Notify Affected Members
        [YES] -> Mark Settlement Complete (Trip finished)
    """
    trip, _ = get_trip_and_verify_membership(db, trip_id, current_user)

    if settlement_data.payee_id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot record a settlement payment to yourself."
        )

    # Verify payee belongs to trip
    payee_membership = db.query(TripMember).filter(
        TripMember.trip_id == trip_id,
        TripMember.user_id == settlement_data.payee_id
    ).first()
    if not payee_membership:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The payee is not a member of this trip."
        )

    settlement = Settlement(
        trip_id=trip_id,
        payer_id=current_user.id,
        payee_id=settlement_data.payee_id,
        amount=settlement_data.amount,
        currency="USD",
        notes=settlement_data.notes,
    )
    db.add(settlement)
    db.flush()

    # Recalculate balances
    _, _, pending_balance, all_cleared = calculate_balances_and_simplify_debt(db, trip_id)

    trip_state = get_or_create_settlement_state(db, trip_id)

    payee_user = db.query(User).filter(User.id == settlement_data.payee_id).first()
    payee_name = payee_user.name if payee_user else "Member"

    if all_cleared:
        # [YES] -> Mark Settlement Complete (Trip finished)
        trip_state.status = TripSettlementStatus.settled
        trip_state.settled_at = datetime.now(timezone.utc)

        # Notify all trip members
        all_members = db.query(TripMember).filter(TripMember.trip_id == trip_id).all()
        for tm in all_members:
            db.add(Notification(
                user_id=tm.user_id,
                trip_id=trip_id,
                notification_type="trip_settled",
                message=f"All balances cleared for trip '{trip.title}'! Settlement is complete and trip is marked finished."
            ))
    else:
        # [NO] -> show pending balance -> Notify Affected Members
        db.add(Notification(
            user_id=settlement_data.payee_id,
            trip_id=trip_id,
            notification_type="settlement_made",
            message=f"{current_user.name} paid you {settlement.currency} {settlement.amount:.2f}. Pending trip balance remaining: {settlement.currency} {pending_balance:.2f}."
        ))

    db.commit()
    db.refresh(settlement)
    return settlement, all_cleared, pending_balance


def get_trip_ledger_dashboard(db: Session, trip_id: int, current_user: User) -> TripLedgerDashboard:
    """
    Compile the full ledger dashboard for the active trip matching all diagram UI nodes.
    """
    trip, membership = get_trip_and_verify_membership(db, trip_id, current_user)
    trip_state = get_or_create_settlement_state(db, trip_id)

    member_balances, who_owes_whom, pending_debt, all_cleared = calculate_balances_and_simplify_debt(db, trip_id)

    # Fetch expenses with relationships
    expenses = db.query(Expense).filter(Expense.trip_id == trip_id).order_by(Expense.created_at.desc()).all()
    expense_responses = []
    total_trip_expenses = Decimal("0.00")

    users_by_id = {u.id: u for u in db.query(User).all()}

    for exp in expenses:
        total_trip_expenses += exp.amount
        payer = users_by_id.get(exp.payer_id)

        splits_resp = []
        for s in exp.splits:
            su = users_by_id.get(s.user_id)
            splits_resp.append(
                ExpenseSplitResponse(
                    id=s.id,
                    expense_id=s.expense_id,
                    user_id=s.user_id,
                    user_name=su.name if su else "Unknown",
                    user_email=su.email if su else "",
                    share_amount=s.share_amount,
                    is_accepted=s.is_accepted,
                )
            )

        disputes_resp = []
        for d in exp.disputes:
            du = users_by_id.get(d.raised_by_id)
            disputes_resp.append(
                DisputeResponse(
                    id=d.id,
                    expense_id=d.expense_id,
                    raised_by_id=d.raised_by_id,
                    raised_by_name=du.name if du else "Unknown",
                    reason=d.reason,
                    status=d.status.value if hasattr(d.status, "value") else str(d.status),
                    host_notes=d.host_notes,
                    created_at=d.created_at,
                    resolved_at=d.resolved_at,
                )
            )

        expense_responses.append(
            ExpenseResponse(
                id=exp.id,
                trip_id=exp.trip_id,
                payer_id=exp.payer_id,
                payer_name=payer.name if payer else "Unknown",
                title=exp.title,
                amount=exp.amount,
                currency=exp.currency,
                category=exp.category,
                description=exp.description,
                status=exp.status.value if hasattr(exp.status, "value") else str(exp.status),
                created_at=exp.created_at,
                updated_at=exp.updated_at,
                splits=splits_resp,
                disputes=disputes_resp,
            )
        )

    # Fetch settlements
    settlements = db.query(Settlement).filter(Settlement.trip_id == trip_id).order_by(Settlement.created_at.desc()).all()
    settlement_responses = []
    for st in settlements:
        payer = users_by_id.get(st.payer_id)
        payee = users_by_id.get(st.payee_id)
        settlement_responses.append(
            SettlementResponse(
                id=st.id,
                trip_id=st.trip_id,
                payer_id=st.payer_id,
                payer_name=payer.name if payer else "Unknown",
                payee_id=st.payee_id,
                payee_name=payee.name if payee else "Unknown",
                amount=st.amount,
                currency=st.currency,
                notes=st.notes,
                created_at=st.created_at,
            )
        )

    members_list = get_trip_members_list(db, trip_id)

    return TripLedgerDashboard(
        trip_id=trip.id,
        trip_title=trip.title,
        trip_status=trip_state.status.value if hasattr(trip_state.status, "value") else str(trip_state.status),
        is_host=(trip.host_id == current_user.id),
        currency="USD",
        total_expenses=total_trip_expenses,
        all_balances_cleared=all_cleared,
        pending_balance_amount=pending_debt,
        expenses=expense_responses,
        who_owes_whom=who_owes_whom,
        member_balances=member_balances,
        settlements=settlement_responses,
        members=members_list,
    )
