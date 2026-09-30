"""
Pydantic schemas for Expense Splitting, Ledger, Disputes, Settlements, and Notifications.

Separate schema module for the Expense Splitting feature.
"""

from datetime import datetime
from decimal import Decimal
from pydantic import BaseModel, ConfigDict, field_validator, model_validator


class CustomSplitItem(BaseModel):
    user_id: int
    share_amount: Decimal

    @field_validator("share_amount")
    @classmethod
    def share_positive(cls, v: Decimal) -> Decimal:
        if v <= 0:
            raise ValueError("Share amount must be greater than 0")
        return round(v, 2)


class ExpenseCreate(BaseModel):
    """
    Schema for adding an expense matching the activity diagram:
    Amount, Category, Payer, Currency, Members.
    """
    title: str
    amount: Decimal
    currency: str = "USD"
    category: str = "Other"
    description: str | None = None
    payer_id: int
    
    # Split configuration:
    # If split_type == 'equal', member_ids must contain participating members
    # If split_type == 'custom', custom_splits must contain {user_id, share_amount}
    split_type: str = "equal"
    member_ids: list[int] = []
    custom_splits: list[CustomSplitItem] = []

    @field_validator("title")
    @classmethod
    def title_not_empty(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("Expense title cannot be empty")
        return v.strip()

    @field_validator("amount")
    @classmethod
    def amount_must_be_positive(cls, v: Decimal) -> Decimal:
        if v <= 0:
            raise ValueError("Amount must be greater than 0")
        return round(v, 2)

    @field_validator("currency")
    @classmethod
    def currency_valid(cls, v: str) -> str:
        code = v.strip().upper()
        if len(code) != 3:
            raise ValueError("Currency must be a 3-letter ISO code (e.g., USD, EUR, INR)")
        return code

    @model_validator(mode="after")
    def validate_splits(self):
        if self.split_type == "equal":
            if not self.member_ids:
                raise ValueError("At least one member must be selected for equal split")
        elif self.split_type == "custom":
            if not self.custom_splits:
                raise ValueError("Custom splits must specify members and share amounts")
            total_custom = sum(cs.share_amount for cs in self.custom_splits)
            if abs(total_custom - self.amount) > Decimal("0.05"):
                raise ValueError(
                    f"Sum of custom shares ({total_custom}) does not match expense amount ({self.amount})"
                )
        else:
            raise ValueError("split_type must be either 'equal' or 'custom'")
        return self


class ExpenseSplitResponse(BaseModel):
    id: int
    expense_id: int
    user_id: int
    user_name: str | None = None
    user_email: str | None = None
    share_amount: Decimal
    is_accepted: bool

    model_config = ConfigDict(from_attributes=True)


class DisputeResponse(BaseModel):
    id: int
    expense_id: int
    raised_by_id: int
    raised_by_name: str | None = None
    reason: str
    status: str
    host_notes: str | None = None
    created_at: datetime
    resolved_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


class ExpenseResponse(BaseModel):
    id: int
    trip_id: int
    payer_id: int
    payer_name: str | None = None
    title: str
    amount: Decimal
    currency: str
    category: str
    description: str | None = None
    status: str
    created_at: datetime
    updated_at: datetime
    splits: list[ExpenseSplitResponse] = []
    disputes: list[DisputeResponse] = []

    model_config = ConfigDict(from_attributes=True)


class DisputeCreate(BaseModel):
    reason: str

    @field_validator("reason")
    @classmethod
    def reason_not_empty(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("Please provide a reason for the dispute")
        return v.strip()


class DisputeReview(BaseModel):
    modify_split: bool
    new_splits: list[CustomSplitItem] | None = None
    notes: str | None = None


class SettlementCreate(BaseModel):
    payee_id: int
    amount: Decimal
    notes: str | None = None

    @field_validator("amount")
    @classmethod
    def amount_positive(cls, v: Decimal) -> Decimal:
        if v <= 0:
            raise ValueError("Settlement payment amount must be greater than 0")
        return round(v, 2)


class SettlementResponse(BaseModel):
    id: int
    trip_id: int
    payer_id: int
    payer_name: str | None = None
    payee_id: int
    payee_name: str | None = None
    amount: Decimal
    currency: str
    notes: str | None = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class WhoOwesWhomItem(BaseModel):
    from_user_id: int
    from_user_name: str
    to_user_id: int
    to_user_name: str
    amount: Decimal
    currency: str


class MemberBalanceItem(BaseModel):
    user_id: int
    user_name: str
    user_email: str
    total_paid: Decimal
    total_share: Decimal
    net_balance: Decimal  # > 0 means they are owed money; < 0 means they owe money


class NotificationResponse(BaseModel):
    id: int
    user_id: int
    trip_id: int
    expense_id: int | None = None
    message: str
    notification_type: str
    is_read: bool
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class TripMemberItem(BaseModel):
    id: int
    user_id: int
    name: str
    email: str
    role: str


class TripLedgerDashboard(BaseModel):
    trip_id: int
    trip_title: str
    trip_status: str  # 'active' or 'settled'
    is_host: bool
    currency: str
    total_expenses: Decimal
    all_balances_cleared: bool
    pending_balance_amount: Decimal
    expenses: list[ExpenseResponse]
    who_owes_whom: list[WhoOwesWhomItem]
    member_balances: list[MemberBalanceItem]
    settlements: list[SettlementResponse]
    members: list[TripMemberItem]
