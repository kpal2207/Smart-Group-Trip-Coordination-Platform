"""Pydantic schemas for telemetry requests and convoy location responses."""
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class TelemetryPingCreate(BaseModel):
    latitude: float = Field(ge=-90, le=90, description="Latitude in decimal degrees.")
    longitude: float = Field(ge=-180, le=180, description="Longitude in decimal degrees.")
    speed_kmh: float = Field(ge=0, description="Ground speed in kilometres per hour.")
    heading: float | None = Field(default=None, ge=0, le=360, description="Heading clockwise from north.")
    is_ghost_mode: bool = Field(default=False, description="Hide coordinates from other trip members.")


class TelemetryPingResponse(BaseModel):
    id: int
    trip_id: int
    user_id: int
    latitude: float
    longitude: float
    speed_kmh: float
    heading: float | None
    is_ghost_mode: bool
    recorded_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ConvoyLocationResponse(BaseModel):
    user_id: int
    name: str
    latitude: float | None
    longitude: float | None
    speed_kmh: float | None
    heading: float | None
    is_ghost_mode: bool
    location_status: Literal["fresh", "stale", "unavailable", "hidden"]
    recorded_at: datetime | None

    model_config = ConfigDict(from_attributes=True)
