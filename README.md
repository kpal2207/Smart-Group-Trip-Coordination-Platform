# Trip Management System

A collaborative trip management platform built for university group projects. Plan trips, manage expenses, and travel together safely.

> **Sprint 1** — Authentication, Trip Management, Expense Management

---

## Team Structure (Sprint 1)

| Module | Members | Branch |
|--------|---------|--------|
| Auth + Home Page | Ruhan, Jay | `feature/auth` |
| Trip Generation + Joining | Mrunali, Kanika | `feature/trip` |
| Expense Management | Rahul, Kavish | `feature/expense` |
| Code Review & Integration | Kaushal, Bhavin, Parth, Manthan | — |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Vite |
| Backend | Python, FastAPI |
| Database | PostgreSQL 16 |
| Authentication | JWT (Bearer tokens) |
| Password Hashing | Argon2 (via pwdlib) |
| ORM | SQLAlchemy 2.0 |
| Migrations | Alembic |

---

## Quick Start

### Prerequisites

- Python 3.10+
- Node.js 18+
- Docker & Docker Compose (for PostgreSQL)

### 1. Start the Database

```bash
docker compose up -d
```

This starts PostgreSQL on port 5432 with:
- Database: `tripmanager`
- User: `tripuser`
- Password: `trippass`

### 2. Start the Backend

```bash
cd backend

# Create and activate virtual environment (first time)
python3 -m venv venv
source venv/bin/activate        # Linux/Mac
# venv\Scripts\activate          # Windows

# Install dependencies
pip install -r requirements.txt

# Copy environment file (first time)
cp .env.example .env

# Start the server
uvicorn app.main:app --reload
```

API available at: http://localhost:8000
API docs (Swagger): http://localhost:8000/docs

### 3. Start the Frontend

```bash
cd frontend

# Install dependencies (first time)
npm install

# Copy environment file (first time)
cp .env.example .env

# Start the dev server
npm run dev
```

App available at: http://localhost:5173

### 4. Run Tests

```bash
cd backend
source venv/bin/activate
python -m pytest tests/ -v
```

---

## Database Commands

```bash
# Start PostgreSQL
docker compose up -d

# Stop PostgreSQL (data preserved)
docker compose down

# Stop and DELETE all data
docker compose down -v

# View database logs
docker compose logs -f db
```

---

## API Endpoints (Auth Module)

| Method | URL | Auth | Description |
|--------|-----|------|-------------|
| `GET` | `/` | No | API health check |
| `POST` | `/auth/register` | No | Register a new user |
| `POST` | `/auth/login` | No | Login and receive JWT |
| `GET` | `/auth/me` | Yes | Get current user info |
| `POST` | `/auth/logout` | Yes | Logout (client-side) |

Full API documentation available at http://localhost:8000/docs when the backend is running.

---

## Authentication Integration Guide

### For Trip and Expense Teams

The auth module exposes a reusable FastAPI dependency that other modules can use to identify the authenticated user.

#### Usage in your router:

```python
from app.dependencies.auth import get_current_user
from app.models.user import User
from fastapi import Depends

@router.get("/trips")
def list_trips(current_user: User = Depends(get_current_user)):
    """
    current_user.id    → INTEGER (use as foreign key)
    current_user.name  → str
    current_user.email → str
    """
    # Your trip logic here, filtered by current_user.id
    ...
```

#### Frontend API calls:

```javascript
import api from '../api/auth';

// The axios instance automatically attaches the JWT token
// from localStorage to every request
const response = await api.get('/trips');
```

### Integration Contract

```
User ID type:       INTEGER
Token storage:      localStorage key "access_token"
Token format:       Bearer <jwt>
Auth header:        Authorization: Bearer <token>
Auth API prefix:    /auth
Trip API prefix:    /trips
Expense API prefix: /expenses
Users table FK:     users.id (INTEGER)
```

---

## Environment Variables

### Backend (`backend/.env`)

```env
DATABASE_URL=postgresql://tripuser:trippass@localhost:5432/tripmanager
SECRET_KEY=change-this-to-a-random-secret-key
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
FRONTEND_URL=http://localhost:5173
```

### Frontend (`frontend/.env`)

```env
VITE_API_URL=http://localhost:8000
```

> ⚠️ Never commit real `.env` files. Use `.env.example` as a reference.

---

## Git Branching Strategy

```
main           ← production releases
develop        ← integration branch
feature/auth   ← Auth + Home Page (Ruhan, Jay)
feature/trip   ← Trip module (Mrunali, Kanika)
feature/expense← Expense module (Rahul, Kavish)
```

**Rules:**
- Never push directly to `main` or `develop`
- Open a PR from your feature branch to `develop`
- PRs require at least one reviewer

---

## Project Structure

```
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI entry point
│   │   ├── config.py            # Environment settings
│   │   ├── database.py          # SQLAlchemy setup
│   │   ├── models/user.py       # User database model
│   │   ├── schemas/auth.py      # Request/response validation
│   │   ├── services/auth.py     # Password hashing + JWT logic
│   │   ├── routers/auth.py      # Auth API endpoints
│   │   └── dependencies/auth.py # get_current_user ★ integration point
│   ├── tests/
│   │   ├── conftest.py          # Test fixtures
│   │   └── test_auth.py         # Auth endpoint tests
│   ├── alembic/                 # Database migrations
│   ├── requirements.txt
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── App.jsx              # Router setup
│   │   ├── main.jsx             # Entry point
│   │   ├── api/auth.js          # API client with JWT interceptor
│   │   ├── context/AuthContext.jsx # Auth state management
│   │   ├── components/          # Navbar, ProtectedRoute
│   │   ├── pages/               # Landing, Login, Signup, Home
│   │   └── styles/index.css     # Global styles
│   ├── package.json
│   └── .env.example
├── docker-compose.yml           # PostgreSQL for development
├── .gitignore
└── README.md                    # This file
```

---

## Known Limitations (Sprint 1)

1. **JWT tokens are stored in localStorage** — This is a development simplification. In production, HTTP-only secure cookies would be preferable to prevent XSS attacks.

2. **Logout is client-side only** — JWT is stateless, so the `/auth/logout` endpoint does not invalidate the token server-side. The client simply removes the token from localStorage.

3. **No refresh tokens** — Tokens expire after 30 minutes. Users must re-login after expiry.

4. **No email verification** — Registration does not verify email addresses via confirmation link.

5. **No password reset** — Forgot password flow is not implemented.

6. **Trip and Expense modules are placeholders** — The Home page shows buttons for these features, but they are not implemented in the Auth module. These will be integrated from `feature/trip` and `feature/expense` branches.
