"""
Expense management services package.

Decomposed into cohesive domain modules:
- common: shared trip membership, settlement state, and member projections
- expenses: expense recording, share computations, and split acceptance
- disputes: dispute raising and host review workflows
- ledger: debt simplification algorithm ('Who Owes Whom'), settlements, and dashboard
"""

from app.services.expense.common import (
    get_trip_and_verify_membership,
    get_or_create_settlement_state,
    get_trip_members_list,
)
from app.services.expense.expenses import (
    validate_and_compute_splits,
    record_expense,
    mark_expense_accepted,
)
from app.services.expense.disputes import (
    dispute_expense,
    review_dispute,
)
from app.services.expense.ledger import (
    calculate_balances_and_simplify_debt,
    record_settlement_payment,
    get_trip_ledger_dashboard,
)

__all__ = [
    "get_trip_and_verify_membership",
    "get_or_create_settlement_state",
    "get_trip_members_list",
    "validate_and_compute_splits",
    "record_expense",
    "mark_expense_accepted",
    "dispute_expense",
    "review_dispute",
    "calculate_balances_and_simplify_debt",
    "record_settlement_payment",
    "get_trip_ledger_dashboard",
]
