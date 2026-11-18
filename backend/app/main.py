"""
Trip Management System — FastAPI Application Entry Point.

This is the main application file that configures the FastAPI app,
sets up CORS, and includes all API routers.

Run with: uvicorn app.main:app --reload
Docs at:  http://localhost:8000/docs
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.routers import auth, trip, expense


# ---------------------------------------------------------------------------
# Create the FastAPI application
# ---------------------------------------------------------------------------
app = FastAPI(
    title="Trip Management System API",
    description="Backend API for the Trip Management System. "
                "Handles authentication, trips, and expenses.",
    version="1.0.0",
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
