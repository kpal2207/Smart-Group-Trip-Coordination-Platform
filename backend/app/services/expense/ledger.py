"""
Debt simplification algorithm ('Who Owes Whom'), settlement payments, and ledger dashboard.
"""

from decimal import Decimal
from datetime import datetime, timezone
from sqlalchemy.orm import Session, selectinload
from fastapi import HTTPException, status

from app.models.user import User
from app.models.trip import TripMember
from app.models.expense import (
    Expense,
    ExpenseSplit,
    Dispute,
    Settlement,
    Notification,
    TripSettlementStatus,
)
from app.schemas.expense import (
    SettlementCreate,
    WhoOwesWhomItem,
    MemberBalanceItem,
    ExpenseResponse,
    SettlementResponse,
    TripLedgerDashboard,
)
from app.services.expense.common import (
    get_trip_and_verify_membership,
    get_or_create_settlement_state,
    get_trip_members_list,
)


def calculate_balances_and_simplify_debt(
    db: Session, trip_id: int
) -> tuple[list[MemberBalanceItem], list[WhoOwesWhomItem], Decimal, bool]:
    """
    Calculates member balances and debt simplification ('Who Owes Whom').
    Matches activity diagram:
      Update 'WHO OWES WHOM' Dashboard
      Check: All balances cleared?
    """
    members = (
        db.query(TripMember, User)
        .join(User, TripMember.user_id == User.id)
        .filter(TripMember.trip_id == trip_id)
        .all()
    )

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
    expenses = (
        db.query(Expense)
        .options(selectinload(Expense.splits))
        .filter(Expense.trip_id == trip_id)
        .all()
    )
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
    debtors: list[list] = []  # [[user_id, user_name, amount]]

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
            total_pending_debt += -net

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

    all_balances_cleared = (len(who_owes_whom) == 0) and (
        total_pending_debt <= Decimal("0.05")
    )

    return member_balances, who_owes_whom, total_pending_debt, all_balances_cleared


def record_settlement_payment(
    db: Session, trip_id: int, settlement_data: SettlementCreate, current_user: User
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
            detail="You cannot record a settlement payment to yourself.",
        )

    # Verify payee belongs to trip
    payee_membership = (
        db.query(TripMember)
        .filter(
            TripMember.trip_id == trip_id,
            TripMember.user_id == settlement_data.payee_id,
        )
        .first()
    )
    if not payee_membership:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The payee is not a member of this trip.",
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
    _, _, pending_balance, all_cleared = calculate_balances_and_simplify_debt(
        db, trip_id
    )

    trip_state = get_or_create_settlement_state(db, trip_id)

    if all_cleared:
        # [YES] -> Mark Settlement Complete (Trip finished)
        trip_state.status = TripSettlementStatus.settled
        trip_state.settled_at = datetime.now(timezone.utc)

        # Notify all trip members
        all_members = db.query(TripMember).filter(TripMember.trip_id == trip_id).all()
        for tm in all_members:
            db.add(
                Notification(
                    user_id=tm.user_id,
                    trip_id=trip_id,
                    notification_type="trip_settled",
                    message=f"All balances cleared for trip '{trip.title}'! Settlement is complete and trip is marked finished.",
                )
            )
    else:
        # [NO] -> show pending balance -> Notify Affected Members
        db.add(
            Notification(
                user_id=settlement_data.payee_id,
                trip_id=trip_id,
                notification_type="settlement_made",
                message=f"{current_user.name} paid you {settlement.currency} {settlement.amount:.2f}. Pending trip balance remaining: {settlement.currency} {pending_balance:.2f}.",
            )
        )

    db.commit()
    db.refresh(settlement)
    return settlement, all_cleared, pending_balance


def get_trip_ledger_dashboard(
    db: Session, trip_id: int, current_user: User
) -> TripLedgerDashboard:
    """
    Compile the full ledger dashboard for the active trip matching all diagram UI nodes.
    """
    trip, membership = get_trip_and_verify_membership(db, trip_id, current_user)
    trip_state = get_or_create_settlement_state(db, trip_id)

    member_balances, who_owes_whom, pending_debt, all_cleared = (
        calculate_balances_and_simplify_debt(db, trip_id)
    )

    # Fetch expenses and settlements serialized via Pydantic model_validate
    expenses = (
        db.query(Expense)
        .options(
            selectinload(Expense.payer),
            selectinload(Expense.splits).selectinload(ExpenseSplit.user),
            selectinload(Expense.disputes).selectinload(Dispute.raised_by),
        )
        .filter(Expense.trip_id == trip_id)
        .order_by(Expense.created_at.desc())
        .all()
    )
    total_trip_expenses = sum((exp.amount for exp in expenses), Decimal("0.00"))
    expense_responses = [ExpenseResponse.model_validate(exp) for exp in expenses]

    settlements = (
        db.query(Settlement)
        .options(
            selectinload(Settlement.payer),
            selectinload(Settlement.payee),
        )
        .filter(Settlement.trip_id == trip_id)
        .order_by(Settlement.created_at.desc())
        .all()
    )
    settlement_responses = [SettlementResponse.model_validate(st) for st in settlements]

    members_list = get_trip_members_list(db, trip_id)

    return TripLedgerDashboard(
        trip_id=trip.id,
        trip_title=trip.title,
        trip_status=trip_state.status.value,
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
