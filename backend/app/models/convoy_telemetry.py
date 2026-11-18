"""SQLAlchemy model for retained convoy location telemetry."""

from datetime import datetime, timezone

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    TypeDecorator,
    text,
)
from sqlalchemy.orm import relationship

from app.database import Base


class UTCDateTime(TypeDecorator):
    """Store timestamps as UTC and restore UTC awareness on SQLite reads."""

    impl = DateTime(timezone=True)
    cache_ok = True

    def load_dialect_impl(self, dialect):
        return dialect.type_descriptor(DateTime(timezone=True))

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("recorded_at must be a timezone-aware datetime")
        return value.astimezone(timezone.utc)

    def process_result_value(self, value, dialect):
        if value is None:
            return None
        if value.tzinfo is None or value.utcoffset() is None:
            # SQLite drops timezone metadata for DateTime columns. Its values
            # were normalized to UTC before binding, so restore UTC on read.
            return value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)


class ConvoyTelemetry(Base):
    """A GPS ping submitted by a member of a trip."""

    __tablename__ = "convoy_telemetry"

    id = Column(
        BigInteger().with_variant(Integer, "sqlite"),
        primary_key=True,
        autoincrement=True,
    )
    trip_id = Column(
        Integer,
        ForeignKey("trips.id", ondelete="CASCADE"),
        nullable=False,
    )
    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    latitude = Column(Numeric(10, 8), nullable=False)
    longitude = Column(Numeric(11, 8), nullable=False)
    speed_kmh = Column(Float, nullable=False)
    heading = Column(Numeric(5, 2), nullable=True)
    is_ghost_mode = Column(
        Boolean,
        nullable=False,
        default=False,
        server_default=text("false"),
    )
    recorded_at = Column(
        UTCDateTime(),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        server_default=text("CURRENT_TIMESTAMP"),
    )

    __table_args__ = (
        CheckConstraint(
            "latitude >= -90 AND latitude <= 90",
            name="ck_convoy_telemetry_latitude_range",
        ),
        CheckConstraint(
            "longitude >= -180 AND longitude <= 180",
            name="ck_convoy_telemetry_longitude_range",
        ),
        CheckConstraint(
            "speed_kmh >= 0",
            name="ck_convoy_telemetry_speed_nonnegative",
        ),
        CheckConstraint(
            "heading IS NULL OR (heading >= 0 AND heading <= 360)",
            name="ck_convoy_telemetry_heading_range",
        ),
        Index(
            "ix_telemetry_trip_user_time",
            trip_id,
            user_id,
            recorded_at.desc(),
            id.desc(),
        ),
    )

    trip = relationship("Trip", foreign_keys=[trip_id])
    user = relationship("User", foreign_keys=[user_id])
