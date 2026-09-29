"""
Pydantic schemas for Trip creation, join, and responses.
"""

from datetime import date, datetime
from pydantic import BaseModel, ConfigDict, field_validator


class TripCreate(BaseModel):
    """Fields required to create a new trip."""

    title: str
    description: str | None = None
    destination: str
    start_date: date
    end_date: date

    @field_validator("title")
    @classmethod
    def title_not_empty(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("Title cannot be empty")
        if len(v) > 200:
            raise ValueError("Title must be at most 200 characters")
        return v.strip()

    @field_validator("destination")
    @classmethod
    def destination_not_empty(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("Destination cannot be empty")
        if len(v) > 200:
            raise ValueError("Destination must be at most 200 characters")
        return v.strip()

    @field_validator("end_date")
    @classmethod
    def end_after_start(cls, v: date, info) -> date:
        start = info.data.get("start_date")
        if start and v < start:
            raise ValueError("end_date must be on or after start_date")
        return v


class TripResponse(BaseModel):
    """Trip data returned to the client."""

    id: int
    title: str
    description: str | None
    destination: str
    start_date: date
    end_date: date
    host_id: int
    trip_code: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class TripJoin(BaseModel):
    """Payload for joining a trip by code."""

    trip_code: str


class MemberResponse(BaseModel):
    """Membership data returned to the client."""

    trip_id: int
    user_id: int
    role: str
    joined_at: datetime

    model_config = ConfigDict(from_attributes=True)


class JoinResponse(BaseModel):
    """Response after successfully joining a trip."""

    message: str
    trip: TripResponse
    membership: MemberResponse
