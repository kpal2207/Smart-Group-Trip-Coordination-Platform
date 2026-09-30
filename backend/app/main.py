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
from app.routers import auth, trip, expense
import app.models  # noqa: F401 - ensures all models registered for Base.metadata


# ---------------------------------------------------------------------------
# Lifespan: runs on startup / shutdown
# ---------------------------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Create database tables on startup (development convenience).
    In production, use Alembic migrations instead.
    
    If the database is unavailable (e.g., during tests with SQLite override),
    we skip table creation here — tests handle their own setup.
    """
    try:
        from app.database import Base, engine
        Base.metadata.create_all(bind=engine)
    except Exception:
        # Database not available (tests use their own engine)
        pass
    yield


# ---------------------------------------------------------------------------
# Create the FastAPI application
# ---------------------------------------------------------------------------
app = FastAPI(
    title="Trip Management System API",
    description="Backend API for the Trip Management System. "
                "Handles authentication, trips, and expenses.",
    version="1.0.0",
    lifespan=lifespan,
)

# ---------------------------------------------------------------------------
# CORS — allow the React frontend to call this API
# ---------------------------------------------------------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_URL],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Routers
# ---------------------------------------------------------------------------
app.include_router(auth.router)
app.include_router(trip.router)
app.include_router(expense.router)


# ---------------------------------------------------------------------------
# Root endpoint
# ---------------------------------------------------------------------------
@app.get("/", tags=["Health"])
def root():
    """Health-check / info endpoint."""
    return {
        "message": "Trip Management System API",
        "docs": "/docs",
    }
