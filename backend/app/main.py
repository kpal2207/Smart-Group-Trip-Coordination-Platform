"""
Trip Management System — FastAPI Application Entry Point.

This is the main application file that configures the FastAPI app,
sets up CORS, and includes all API routers.

Run with: uvicorn app.main:app --reload
Docs at:  http://localhost:8000/docs
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routers import auth, expense, telemetry, trip
import app.models  # noqa: F401 - ensures all models registered for Base.metadata


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Create tables for development; production uses Alembic migrations."""
    try:
        from app.database import Base, engine
        Base.metadata.create_all(bind=engine)
    except Exception:
        # Database may be unavailable during tests or local startup.
        pass
    yield


app = FastAPI(
    title="Trip Management System API",
    description=(
        "Backend API for trips, expenses, and authenticated convoy telemetry."
    ),
    version="1.1.0",
    lifespan=lifespan,
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
