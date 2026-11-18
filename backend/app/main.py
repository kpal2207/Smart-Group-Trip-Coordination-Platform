"""FastAPI entry point for the Trip Management System."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

import app.models  # Register all SQLAlchemy models.
from app.config import settings
from app.routers import auth, expense, telemetry, trip


app = FastAPI(
    title="Trip Management System API",
    description="Backend API for trips, expenses, and authenticated convoy telemetry.",
    version="1.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_URL],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(trip.router)
app.include_router(expense.router)
app.include_router(telemetry.router)


@app.get("/", tags=["Health"])
def root():
    """Health-check / info endpoint."""
    return {
        "message": "Trip Management System API",
        "docs": "/docs",
    }