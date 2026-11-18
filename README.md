# Smart Group Trip Coordination Platform

A collaborative trip management platform built for university group projects. Create trips, invite friends via shareable codes, split expenses fairly, resolve disputes, and settle balances — all in one place.

> **Sprint 1 — Complete** · Authentication · Trip Management · Expense Splitting & Settlements

---

## Features

### Authentication
- User registration with email validation and strong password enforcement (Argon2 hashing)
- JWT-based login with Bearer token authentication
- Protected routes — all trip and expense endpoints require authentication
- Persistent sessions via `localStorage` with automatic token attachment

### Trip Creation & Joining
- **Create a Trip** — Set title, destination, description, start/end dates; a unique 8-character alphanumeric trip code is generated server-side
- **Join via Code** — Enter the trip code manually to join a group trip
- **Join via Shareable Link** — Click `http://localhost:5173/trips/join/<CODE>` to join instantly
- **My Trips** — View all trips you belong to (as host or member)
- **Trip Details** — View trip info, your role (Host/Member), and share invite codes or links with friends
- **Duplicate Protection** — Cannot join a trip you're already a member of (409 Conflict)
- **Host auto-enrolment** — The trip creator is automatically added as the first member with `host` role

### Expense Management & Splitting
- **Add Expense** — Record amount, category (Food & Dining, Transport, Accommodation, Activities, Shopping, Groceries, Other), payer, currency, and description
- **Equal Split** — Automatically divides the expense equally among selected members with penny-accurate rounding
- **Custom Split** — Assign specific amounts to each member (validated to sum to the total)
- **Expense Ledger** — Full trip expense history with payer info, category tags, status badges, and split breakdowns
- **"Who Owes Whom" Dashboard** — Greedy debt simplification algorithm minimises the number of transfers needed
- **Member Balances** — Per-member breakdown of total paid vs. total share with net balance (creditor/debtor)

### Dispute & Acceptance Workflow
- **Accept Expense** — Members review and confirm their split (marks the expense as accepted once all members agree)
- **Raise Dispute** — Members can dispute an expense split with a written reason; the trip host is notified
- **Host Reviews Dispute** — The host can either:
  - **Keep existing split** — Marks the expense accepted as-is
  - **Modify split** — Adjusts individual shares (re-validated to equal the total), recalculates the ledger

### Settlement & Trip Completion
- **Settle Up** — Record payments between members (e.g., Cash, UPI, Venmo) to reduce outstanding balances
- **Automatic Completion** — When all balances are cleared, the trip is automatically marked as "Settled / Finished"
- **Pending Balance Tracking** — Shows outstanding debt amount and prompts members to settle

### In-App Notifications
- Notified when a new expense is added and your share is calculated
- Notified when a member disputes an expense (host receives this)
- Notified when a dispute is resolved (affected members receive this)
- Notified when a settlement payment is recorded
- Notified when all balances are cleared and the trip is finished
- Notification center in the navbar with unread count badge, mark-as-read, and mark-all-read

---

## Team Structure (Sprint 1)

| Module | Members | Branch |
|--------|---------|--------|
| Auth + Home Page | Ruhan, Jay | `feature/auth` |
| Trip Generation + Joining | Mrunali, Kanika | `feature/backend` , `feature/frontend`|
| Expense Management | Rahul, Kavish | `feature/expense` |
| Concept Poster & SRS Documentation | Manthan | `Documents` |
| Code Review & Integration | Kaushal, Bhavin, Parth | — |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Vite 5, React Router v6, Axios |
| Backend | Python 3.10+, FastAPI |
| Database | PostgreSQL 16 |
| Authentication | JWT (Bearer tokens) |
| Password Hashing | Argon2 (via pwdlib) |
| ORM | SQLAlchemy 2.0 |
| Migrations | Alembic |
| Testing | pytest, FastAPI TestClient, SQLite (in-memory) |

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

All **46 tests** across 3 modules should pass:
- `test_auth.py` — 16 tests (registration, login, JWT, logout)
- `test_trip.py` — 23 tests (creation, joining, listing, validation)
- `test_expense.py` — 7 tests (expense CRUD, balances, disputes, settlements)

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

## API Endpoints

### Auth Module (`/auth`)

| Method | URL | Auth | Description |
|--------|-----|------|-------------|
| `GET` | `/` | No | API health check |
| `POST` | `/auth/register` | No | Register a new user |
| `POST` | `/auth/login` | No | Login and receive JWT |
| `GET` | `/auth/me` | Yes | Get current user info |
| `POST` | `/auth/logout` | Yes | Logout (client-side) |

### Trip Module (`/trips`)

| Method | URL | Auth | Description |
|--------|-----|------|-------------|
| `POST` | `/trips/` | Yes | Create a new trip (returns 8-char trip code) |
| `POST` | `/trips/join` | Yes | Join a trip via JSON body `{"trip_code": "ABC12345"}` |
| `GET` | `/trips/join/{trip_code}` | Yes | Join a trip via shareable link |
| `GET` | `/trips/` | Yes | List all trips for the current user |
| `GET` | `/trips/{trip_id}` | Yes | Get details of a single trip |

### Expense Module (`/trips/{trip_id}/expenses`)

| Method | URL | Auth | Description |
|--------|-----|------|-------------|
| `GET` | `/trips/{trip_id}/expenses/dashboard` | Yes | Full ledger dashboard: expenses, balances, "Who Owes Whom", settlements |
| `GET` | `/trips/{trip_id}/members` | Yes | List trip members (for expense member selection) |
| `POST` | `/trips/{trip_id}/expenses` | Yes | Add an expense with equal or custom split |
| `POST` | `/expenses/{expense_id}/accept` | Yes | Member accepts an expense split |
| `POST` | `/expenses/{expense_id}/dispute` | Yes | Member raises a dispute on an expense |
| `POST` | `/disputes/{dispute_id}/review` | Yes | Host reviews dispute (keep or modify split) |
| `POST` | `/trips/{trip_id}/settlements` | Yes | Record a settlement payment between members |

### Notifications

| Method | URL | Auth | Description |
|--------|-----|------|-------------|
| `GET` | `/notifications` | Yes | Get all notifications for the current user |
| `POST` | `/notifications/{notification_id}/read` | Yes | Mark a single notification as read |
| `POST` | `/notifications/read-all` | Yes | Mark all notifications as read |

Full interactive API documentation available at http://localhost:8000/docs when the backend is running.

---

## Database Schema

### Tables

| Table | Description |
|-------|-------------|
| `users` | Registered users (id, name, email, password_hash, timestamps) |
| `trips` | Group trips (id, title, destination, dates, host_id FK, trip_code) |
| `trip_members` | Join table: user ↔ trip membership with role (host/member) |
| `expenses` | Trip expenses (amount, payer, category, currency, status) |
| `expense_splits` | Per-member share for each expense with acceptance tracking |
| `disputes` | Dispute records raised by members with host review notes |
| `settlements` | Payment records between members to settle outstanding balances |
| `notifications` | In-app notifications for expense/dispute/settlement events |
| `trip_settlement_states` | Tracks overall settlement status (active vs. settled/finished) |

### Key Relationships

```
users.id  ─┬─→  trips.host_id
            ├─→  trip_members.user_id
            ├─→  expenses.payer_id
            ├─→  expense_splits.user_id
            ├─→  disputes.raised_by_id
            ├─→  settlements.payer_id / payee_id
            └─→  notifications.user_id

trips.id  ─┬─→  trip_members.trip_id
            ├─→  expenses.trip_id
            ├─→  settlements.trip_id
            ├─→  notifications.trip_id
            └─→  trip_settlement_states.trip_id

expenses.id ─┬─→  expense_splits.expense_id
              ├─→  disputes.expense_id
              └─→  notifications.expense_id
```

---

## Authentication Integration Guide

### Using `get_current_user` in your router

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
    # Your logic here, filtered by current_user.id
    ...
```

### Frontend API calls

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
Expense API prefix: /trips/{trip_id}/expenses, /expenses, /disputes
Notification prefix:/notifications
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

> Never commit real `.env` files. Use `.env.example` as a reference.

---

## Git Branching Strategy

```
main           ← production releases
develop        ← integration branch (all features merged here)
feature/auth   ← Auth + Home Page (Ruhan, Jay)          Status: Merged
feature/trip   ← Trip module (Mrunali, Kanika)          Status: Merged
feature/expense← Expense module (Rahul, Kavish)         Status: Merged
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
│   │   ├── main.py                  # FastAPI entry point, CORS, routers
│   │   ├── config.py                # Environment settings (Pydantic)
│   │   ├── database.py              # SQLAlchemy engine & session setup
│   │   ├── models/
│   │   │   ├── __init__.py          # Registers all models for Base.metadata
│   │   │   ├── user.py              # User model (id, name, email, password_hash)
│   │   │   ├── trip.py              # Trip + TripMember models (host, code, roles)
│   │   │   └── expense.py           # Expense, ExpenseSplit, Dispute, Settlement,
│   │   │                            #   Notification, TripSettlementState models
│   │   ├── schemas/
│   │   │   ├── auth.py              # Registration, login, user response schemas
│   │   │   ├── trip.py              # TripCreate, TripJoin, TripResponse schemas
│   │   │   └── expense.py           # Expense, split, dispute, settlement,
│   │   │                            #   notification, dashboard schemas
│   │   ├── services/
│   │   │   ├── auth.py              # Password hashing (Argon2) + JWT logic
│   │   │   ├── trip.py              # Trip creation, code generation, join logic
│   │   │   └── expense.py           # Expense recording, split calculation,
│   │   │                            #   dispute workflow, debt simplification,
│   │   │                            #   settlement & completion, notifications
│   │   ├── routers/
│   │   │   ├── auth.py              # Auth API endpoints (/auth/*)
│   │   │   ├── trip.py              # Trip API endpoints (/trips/*)
│   │   │   └── expense.py           # Expense API endpoints (/trips/*/expenses,
│   │   │                            #   /expenses/*, /disputes/*, /notifications)
│   │   └── dependencies/
│   │       └── auth.py              # get_current_user ★ shared auth dependency
│   ├── tests/
│   │   ├── conftest.py              # Test fixtures (SQLite, TestClient, users)
│   │   ├── test_auth.py             # 16 auth endpoint tests
│   │   ├── test_trip.py             # 23 trip creation/joining/listing tests
│   │   └── test_expense.py          # 7 expense/dispute/settlement tests
│   ├── alembic/                     # Database migrations
│   │   └── versions/
│   │       ├── c431288f..._trips.py        # Adds trips + trip_members tables
│   │       └── e87b2190..._expenses.py     # Adds expense management tables
│   ├── requirements.txt
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── App.jsx                  # React Router setup (public + protected routes)
│   │   ├── main.jsx                 # Entry point
│   │   ├── api/
│   │   │   ├── auth.js              # Axios instance with JWT interceptor
│   │   │   ├── trip.js              # Trip API client (create, join, list, details)
│   │   │   └── expense.js           # Expense API client (dashboard, add, dispute,
│   │   │                            #   accept, settle, notifications)
│   │   ├── context/
│   │   │   └── AuthContext.jsx      # Auth state management (login, logout, user)
│   │   ├── components/
│   │   │   ├── Navbar.jsx           # Navigation bar with notifications
│   │   │   ├── ProtectedRoute.jsx   # Route guard (redirects unauthenticated users)
│   │   │   ├── TripCard.jsx         # Trip list card component
│   │   │   ├── NotificationCenter.jsx  # Bell icon dropdown with real-time polling
│   │   │   ├── DisputeModal.jsx     # Dispute creation (member) + review (host) modal
│   │   │   └── SettleUpModal.jsx    # Settlement payment recording modal
│   │   ├── pages/
│   │   │   ├── Landing.jsx          # Public landing page
│   │   │   ├── Login.jsx            # Login form
│   │   │   ├── Signup.jsx           # Registration form with validation
│   │   │   ├── Home.jsx             # Dashboard with trip & expense quick actions
│   │   │   ├── CreateTrip.jsx       # Trip creation form with code/link sharing
│   │   │   ├── JoinTrip.jsx         # Join trip by code or shareable link
│   │   │   ├── MyTrips.jsx          # List of user's trips
│   │   │   ├── TripDetails.jsx      # Single trip view with invite sharing
│   │   │   ├── ExpenseDashboard.jsx # Full expense ledger, balances, "Who Owes Whom"
│   │   │   └── AddExpense.jsx       # Add expense form (equal/custom split)
│   │   └── styles/
│   │       ├── index.css            # Global styles (auth, layout, components)
│   │       ├── trip.css             # Trip-specific styles
│   │       └── expense.css          # Expense dashboard & modal styles
│   ├── package.json
│   └── .env.example
├── docker-compose.yml               # PostgreSQL for development
├── .gitignore
└── README.md                        # This file
```

---

## Frontend Routes

| Path | Component | Auth | Description |
|------|-----------|------|-------------|
| `/` | Landing | No | Public landing page |
| `/login` | Login | No | Login form |
| `/signup` | Signup | No | Registration form |
| `/home` | Home | Yes | Dashboard with quick actions |
| `/trips` | MyTrips | Yes | List of user's trips |
| `/trips/create` | CreateTrip | Yes | Create a new trip |
| `/trips/join` | JoinTrip | Yes | Join trip by entering code |
| `/trips/join/:tripCode` | JoinTrip | Yes | Join trip via shareable link |
| `/trips/:tripId` | TripDetails | Yes | View trip details & share invite |
| `/trips/:tripId/expenses` | ExpenseDashboard | Yes | Expense ledger & "Who Owes Whom" |
| `/trips/:tripId/expenses/add` | AddExpense | Yes | Add new expense with split config |

---

## Expense Splitting — How It Works

The expense system follows a strict activity diagram workflow:

```
User selects active trip
        │
        ▼
   Add Expense
  (Amount, Category, Payer, Currency, Members)
        │
        ▼
  Validate expense details ──[FAIL]──→ Display error, Return
        │ [PASS]
        ▼
  Calculate expense shares (equal or custom)
        │
        ▼
  Record in trip ledger
        │
        ▼
  Update "WHO OWES WHOM" dashboard
        │
        ▼
  Notify affected members
        │
        ▼
  Members review expense
        │
    ┌───┴───┐
    │       │
 [Accept] [Dispute]
    │       │
    ▼       ▼
  Mark    Notify host → Host reviews dispute
 accepted              │
                  ┌────┴────┐
                  │         │
             [Keep split] [Modify split]
                  │         │
                  ▼         ▼
              Mark       Update split →
             accepted    Recalculate shares →
                         Record in ledger →
                         Notify members
        │
        ▼
  Members settle balances
        │
  All balances cleared?
    ┌───┴───┐
    │       │
   [NO]   [YES]
    │       │
    ▼       ▼
  Show    Mark Settlement Complete
  pending (Trip Finished) →
  balance  Notify all members
```

### Debt Simplification Algorithm

The "Who Owes Whom" section uses a **greedy matching algorithm**:
1. Calculate each member's **net balance** (total paid − total share)
2. Separate into **creditors** (net > 0, owed money) and **debtors** (net < 0, owe money)
3. Sort both lists by amount (descending)
4. Greedily match the largest debtor to the largest creditor, transferring the minimum of their balances
5. Repeat until all debts are resolved

This minimises the total number of payment transfers needed to settle all debts.

---

## Known Limitations (Sprint 1)

1. **JWT tokens are stored in localStorage** — In production, HTTP-only secure cookies would be preferable to prevent XSS attacks.

2. **Logout is client-side only** — JWT is stateless, so the `/auth/logout` endpoint does not invalidate the token server-side. The client simply removes the token from localStorage.

3. **No refresh tokens** — Tokens expire after 30 minutes. Users must re-login after expiry.

4. **No email verification** — Registration does not verify email addresses via confirmation link.

5. **No password reset** — Forgot password flow is not implemented.

6. **Single currency assumption** — The debt simplification algorithm defaults to USD. Multi-currency support is not yet implemented.

7. **No real-time updates** — The notification center polls every 15 seconds. WebSocket-based push notifications are planned for Sprint 2.

---

## Coming Soon (Sprint 2+)

- Real-time Location Sharing
- Route Monitoring
- Emergency Alerts & SOS
- Multi-currency expense support
- Expense analytics & charts
- WebSocket-based real-time notifications
