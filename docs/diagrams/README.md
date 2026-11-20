# ConvoySync Architecture & Design Diagrams (IT-314)

This directory contains the standalone architecture, database, and design diagrams for **ConvoySync** (Group 8, IT-314 Software Engineering).

All diagrams are available in three formats:
1. **Interactive Mermaid Diagrams** (rendered natively in this README on GitHub)
2. **Editable Draw.io Source Files** ([`*.drawio`](./))
3. **High-Resolution PNG Exports** ([`images/*.png`](images/))

---

## Quick Navigation

- [1. Relational Schema (Physical Data Model)](#1-relational-schema-physical-data-model)
- [2. Conceptual ERD (Domain Model)](#2-conceptual-erd-domain-model)
- [3. UML Class Diagram (SQLAlchemy ORM)](#3-uml-class-diagram-sqlalchemy-orm)
- [4. UML Sequence Diagram (Auth, Telemetry & SOS)](#4-uml-sequence-diagram-auth-telemetry--sos)
- [5. UML State Diagram (Entity Lifecycles)](#5-uml-state-diagram-entity-lifecycles)
- [6. UML Activity Diagram (Trip & Expense Workflow)](#6-uml-activity-diagram-trip--expense-workflow)

---

## 1. Relational Schema (Physical Data Model)

> **File:** [`relational_schema.drawio`](relational_schema.drawio) | [`images/relational_schema.png`](images/relational_schema.png)  
> **Description:** Complete physical schema across PostgreSQL / Neon, showing all 10 application tables, primary keys, foreign keys (`ON DELETE CASCADE`), constraints, and relationships.

```mermaid
erDiagram
    users ||--o{ trips : "hosts (host_id)"
    users ||--o{ trip_members : "enrolls (user_id)"
    trips ||--o{ trip_members : "contains (trip_id)"
    users ||--o{ convoy_telemetry : "broadcasts (user_id)"
    trips ||--o{ convoy_telemetry : "tracks (trip_id)"
    trips ||--o{ expenses : "logs (trip_id)"
    users ||--o{ expenses : "pays (payer_id)"
    expenses ||--o{ expense_splits : "divides into (expense_id)"
    users ||--o{ expense_splits : "owes (user_id)"
    expenses ||--o{ disputes : "contested via (expense_id)"
    users ||--o{ disputes : "raises (raised_by_id)"
    trips ||--o{ settlements : "settles (trip_id)"
    users ||--o{ settlements : "transfers (payer_id)"
    users ||--o{ settlements : "receives (payee_id)"
    trips ||--o| trip_settlement_states : "aggregates (trip_id)"
    trips ||--o{ emergency_alerts : "sounds siren (trip_id)"
    users ||--o{ emergency_alerts : "triggers (user_id)"
    users ||--o{ notifications : "receives (user_id)"

    users {
        int id PK
        string name "VARCHAR(100)"
        string email UK "VARCHAR(255)"
        string password_hash "VARCHAR(255)"
        string firebase_uid UK "VARCHAR(128) [Opt]"
        string phone_number "VARCHAR(20) [Opt]"
        datetime created_at
        datetime updated_at
    }

    trips {
        int id PK
        string title "VARCHAR(200)"
        string description "TEXT [Opt]"
        string destination "VARCHAR(200)"
        date start_date
        date end_date
        int host_id FK "-> users.id"
        string trip_code UK "VARCHAR(8)"
        datetime created_at
        datetime updated_at
    }

    trip_members {
        int id PK
        int trip_id FK "-> trips.id"
        int user_id FK "-> users.id"
        string role "ENUM('host', 'member')"
        datetime joined_at
    }

    convoy_telemetry {
        bigint id PK
        int trip_id FK "-> trips.id"
        int user_id FK "-> users.id"
        numeric latitude "NUMERIC(10,8) [-90..90]"
        numeric longitude "NUMERIC(11,8) [-180..180]"
        float speed_kmh "FLOAT [>= 0]"
        numeric heading "NUMERIC(5,2) [0..360]"
        boolean is_ghost_mode "DEFAULT false"
        datetime recorded_at "UTC timezone-aware"
    }

    expenses {
        int id PK
        int trip_id FK "-> trips.id"
        int payer_id FK "-> users.id"
        string title "VARCHAR(200)"
        numeric amount "NUMERIC(10,2)"
        string currency "VARCHAR(3) DEFAULT USD"
        string category "VARCHAR(50)"
        string description "TEXT [Opt]"
        string status "VARCHAR(20)"
        datetime created_at
        datetime updated_at
    }

    expense_splits {
        int id PK
        int expense_id FK "-> expenses.id"
        int user_id FK "-> users.id"
        numeric share_amount "NUMERIC(10,2)"
        boolean is_accepted "DEFAULT false"
        datetime created_at
    }

    disputes {
        int id PK
        int expense_id FK "-> expenses.id"
        int raised_by_id FK "-> users.id"
        string reason "TEXT"
        string status "VARCHAR(20) [pending/resolved]"
        string host_notes "TEXT [Opt]"
        datetime created_at
        datetime resolved_at
    }

    settlements {
        int id PK
        int trip_id FK "-> trips.id"
        int payer_id FK "-> users.id"
        int payee_id FK "-> users.id"
        numeric amount "NUMERIC(10,2)"
        string currency "VARCHAR(3) DEFAULT USD"
        string notes "VARCHAR(255) [Opt]"
        datetime created_at
    }

    trip_settlement_states {
        int id PK
        int trip_id FK "-> trips.id"
        string status "VARCHAR(20) [active/settled]"
        datetime settled_at
        datetime updated_at
    }

    emergency_alerts {
        int id PK
        int trip_id FK "-> trips.id"
        int user_id FK "-> users.id"
        numeric latitude "NUMERIC(10,8)"
        numeric longitude "NUMERIC(11,8)"
        string status "VARCHAR(20) [active/resolved/false_alarm]"
        string alert_type "VARCHAR(50) [sos_siren/medical]"
        string notes "TEXT [Opt]"
        datetime created_at
        datetime resolved_at
    }

    notifications {
        int id PK
        int user_id FK "-> users.id"
        int trip_id FK "-> trips.id"
        int expense_id FK "-> expenses.id [Opt]"
        string message "TEXT"
        string notification_type "VARCHAR(50)"
        boolean is_read "DEFAULT false"
        datetime created_at
    }
```

---

## 2. Conceptual ERD (Domain Model)

> **File:** [`conceptual_erd.drawio`](conceptual_erd.drawio) | [`images/conceptual_erd.png`](images/conceptual_erd.png)  
> **Description:** High-level Entity-Relationship model capturing key business domains, roles, cardinality relationships, and data flows.

```mermaid
erDiagram
    USER ||--o{ TRIP : "1:N hosts"
    USER }|--|{ TRIP : "M:N joins / participates"
    USER ||--o{ GPS_TELEMETRY : "1:N broadcasts location"
    TRIP ||--o{ GPS_TELEMETRY : "1:N tracks convoy"
    USER ||--o{ EXPENSE : "1:N pays / incurs"
    TRIP ||--o{ EXPENSE : "1:N logs in ledger"
    EXPENSE ||--|{ EXPENSE_SPLIT : "1:N divides among members"
    USER ||--o{ EXPENSE_SPLIT : "1:N owes share"
    EXPENSE ||--o{ DISPUTE : "1:N contested via"
    USER ||--o{ DISPUTE : "1:N files complaint"
    USER ||--o{ SETTLEMENT : "1:N settles debt via UPI"
    TRIP ||--o{ SETTLEMENT : "1:N reconciles balance"
    USER ||--o{ EMERGENCY_ALERT : "1:N triggers SOS"
    TRIP ||--o{ EMERGENCY_ALERT : "1:N broadcasts siren"
```

---

## 3. UML Class Diagram (SQLAlchemy ORM)

> **File:** [`uml_class_diagram.drawio`](uml_class_diagram.drawio) | [`images/uml_class_diagram.png`](images/uml_class_diagram.png)  
> **Description:** Object-Relational Mapping (ORM) architecture showing SQLAlchemy models, data attributes, enums, methods, and parent-child navigation.

```mermaid
classDiagram
    direction TB

    class Base {
        <<DeclarativeBase>>
        +metadata : MetaData
    }

    class User {
        +int id
        +str name
        +str email
        +str password_hash
        +str firebase_uid
        +str phone_number
        +datetime created_at
        +datetime updated_at
        +verify_password(plain_password) bool
    }

    class Trip {
        +int id
        +str title
        +str description
        +str destination
        +date start_date
        +date end_date
        +int host_id
        +str trip_code
        +datetime created_at
        +datetime updated_at
    }

    class MemberRole {
        <<enumeration>>
        HOST
        MEMBER
    }

    class TripMember {
        +int id
        +int trip_id
        +int user_id
        +MemberRole role
        +datetime joined_at
    }

    class ConvoyTelemetry {
        +int id
        +int trip_id
        +int user_id
        +Decimal latitude
        +Decimal longitude
        +float speed_kmh
        +Decimal heading
        +bool is_ghost_mode
        +datetime recorded_at
    }

    class Expense {
        +int id
        +int trip_id
        +int payer_id
        +str title
        +Decimal amount
        +str currency
        +str category
        +str description
        +ExpenseStatus status
        +datetime created_at
        +datetime updated_at
    }

    class ExpenseSplit {
        +int id
        +int expense_id
        +int user_id
        +Decimal share_amount
        +bool is_accepted
        +datetime created_at
    }

    class Dispute {
        +int id
        +int expense_id
        +int raised_by_id
        +str reason
        +DisputeStatus status
        +str host_notes
        +datetime created_at
        +datetime resolved_at
    }

    class Settlement {
        +int id
        +int trip_id
        +int payer_id
        +int payee_id
        +Decimal amount
        +str currency
        +str notes
        +datetime created_at
    }

    class TripSettlementState {
        +int id
        +int trip_id
        +TripSettlementStatus status
        +datetime settled_at
        +datetime updated_at
    }

    class EmergencyAlert {
        +int id
        +int trip_id
        +int user_id
        +Decimal latitude
        +Decimal longitude
        +str status
        +str alert_type
        +str notes
        +datetime created_at
        +datetime resolved_at
    }

    Base <|-- User
    Base <|-- Trip
    Base <|-- TripMember
    Base <|-- ConvoyTelemetry
    Base <|-- Expense
    Base <|-- ExpenseSplit
    Base <|-- Dispute
    Base <|-- Settlement
    Base <|-- TripSettlementState
    Base <|-- EmergencyAlert

    User "1" --> "*" Trip : hosts
    Trip "1" *-- "*" TripMember : has members
    User "1" --> "*" TripMember : acts as
    TripMember ..> MemberRole

    Trip "1" *-- "*" ConvoyTelemetry : retains pings
    User "1" --> "*" ConvoyTelemetry : emits

    Trip "1" *-- "*" Expense : contains
    User "1" --> "*" Expense : pays
    Expense "1" *-- "*" ExpenseSplit : splits
    User "1" --> "*" ExpenseSplit : owes

    Expense "1" *-- "*" Dispute : contests
    User "1" --> "*" Dispute : files

    Trip "1" *-- "*" Settlement : reconciles
    User "1" --> "*" Settlement : transfers / receives

    Trip "1" -- "1" TripSettlementState : tracks balance
    Trip "1" *-- "*" EmergencyAlert : sounds SOS
    User "1" --> "*" EmergencyAlert : triggers
```

---

## 4. UML Sequence Diagram (Auth, Telemetry & SOS)

> **File:** [`uml_sequence_diagram.drawio`](uml_sequence_diagram.drawio) | [`images/uml_sequence_diagram.png`](images/uml_sequence_diagram.png)  
> **Description:** Complete runtime message flow across 3 phases: adaptive GPS telemetry ingestion, convoy location polling with lag detection, and emergency SOS siren with offline SMS fallback.

```mermaid
sequenceDiagram
    autonumber
    actor Driver as Traveler / Driver
    participant App as React Frontend (ConvoyMap)
    participant API as FastAPI Backend (Router)
    participant Auth as Auth Dependency (JWT)
    participant GIS as GIS Engine (Haversine)
    participant DB as PostgreSQL (Neon DB)
    actor Convoy as Convoy Members

    %% ========================================================
    %% PHASE 1: GPS ADAPTIVE INGESTION
    %% ========================================================
    rect rgb(239, 246, 255)
    Note over Driver,DB: PHASE 1: Velocity-Adaptive GPS Ingestion (5s highway / 15s city / 30s stop)
    Driver->>App: GPS sensor ping (lat, lon, speed, heading)
    App->>GIS: Calculate adaptive interval (speed > 40 km/h -> 5s)
    GIS-->>App: Return polling schedule (5000ms)
    App->>API: POST /trips/{id}/telemetry (lat, lon, speed, heading, is_ghost_mode) [Bearer Token]
    API->>Auth: Verify JWT & extract current_user
    Auth-->>API: User verified (id, email)
    API->>DB: Query trip_members (SELECT 1 WHERE trip_id = ? AND user_id = ?)
    alt Not Active Member
        API-->>App: HTTP 403 Forbidden ("Must be active trip member")
    else Member Verified
        API->>DB: INSERT INTO convoy_telemetry VALUES (...); COMMIT
        DB-->>API: Record stored (id, recorded_at)
        API-->>App: HTTP 201 Created (coords masked if is_ghost_mode=True)
    end
    end

    %% ========================================================
    %% PHASE 2: CONVOY POLLING & LAG MONITORING
    %% ========================================================
    rect rgb(240, 253, 250)
    Note over Driver,Convoy: PHASE 2: Convoy Location Polling & Distance Lag Evaluation
    App->>API: GET /trips/{id}/convoy/locations [Bearer Token]
    API->>DB: B-tree scan: ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY recorded_at DESC)
    DB-->>API: Enrolled members + latest telemetry ping
    Note over API: Classify Freshness:<br/>≤ 60s: 'fresh'<br/>60s–300s: 'stale'<br/>> 300s: 'unavailable'
    Note over API: Privacy filter: if is_ghost_mode == True<br/>-> status='hidden', lat=null, lon=null
    API-->>App: HTTP 200 OK [{user_id, name, lat, lon, speed_kmh, status, is_ghost_mode}, ...]
    App->>GIS: Forward positions to GIS Engine
    Note over GIS: Compute Convoy Centroid<br/>Haversine distance lag > 2.0 km?
    GIS-->>App: Return lag result {has_lag: true, lagging_members: [...]}
    App->>Driver: Render Leaflet map pins + Amber Lag Alert banner
    App-->>Convoy: Lag notification rendered across convoy members
    end

    %% ========================================================
    %% PHASE 3: EMERGENCY SOS SIREN
    %% ========================================================
    rect rgb(254, 242, 242)
    Note over Driver,Convoy: PHASE 3: Emergency SOS Siren with 5s Abort Countdown & SMS Fallback
    Driver->>App: Tap One-Touch SOS Button
    Note over App: Start 5-second countdown siren audio
    alt Cancelled within 5 seconds
        Driver->>App: Tap 'Cancel / False Alarm'
        Note over App: Abort broadcast, dismiss siren
    else Timer Expires (5 seconds)
        App->>API: POST /trips/{id}/sos (lat, lon, alert_type='sos_siren')
        API->>DB: INSERT INTO emergency_alerts (trip_id, user_id, status='active'); COMMIT
        DB-->>API: Alert created
        App->>Driver: Launch offline SMS fallback (sms:+91...?body=SOS_GPS_LAT_LON)
        API-->>Convoy: High-priority distress siren & flashing red banner broadcast to all members
    end
    end
```

---

## 5. UML State Diagram (Entity Lifecycles)

> **File:** [`uml_state_diagram.drawio`](uml_state_diagram.drawio) | [`images/uml_state_diagram.png`](images/uml_state_diagram.png)  
> **Description:** Finite state machines covering the lifecycles of Expense Disputes, Trip Settlements, Convoy Telemetry Pings, and Emergency SOS Alerts.

```mermaid
stateDiagram-v2
    direction TB

    %% ----------------------------------------------------
    %% STATE MACHINE 1: EXPENSE DISPUTE
    %% ----------------------------------------------------
    state "1. Expense Dispute Lifecycle (DisputeStatus)" as S_Dispute {
        [*] --> PendingReview : Member files dispute
        PendingReview --> ResolvedKeep : Host rejects dispute
        PendingReview --> ResolvedModify : Host upholds & adjusts split
        ResolvedKeep --> [*]
        ResolvedModify --> [*]
    }

    %% ----------------------------------------------------
    %% STATE MACHINE 2: TRIP SETTLEMENT
    %% ----------------------------------------------------
    state "2. Trip Settlement Lifecycle (TripSettlementStatus)" as S_Settlement {
        [*] --> ActiveTrip : Trip started & expenses logged
        ActiveTrip --> FullySettled : All net balances paid via UPI
        FullySettled --> ActiveTrip : New expense added to trip
        FullySettled --> [*] : Trip closed & finalized
    }

    %% ----------------------------------------------------
    %% STATE MACHINE 3: CONVOY TELEMETRY PING
    %% ----------------------------------------------------
    state "3. Convoy Telemetry Ping Lifecycle (convoy_telemetry)" as S_Telemetry {
        [*] --> GPSSending : Traveler driving / transmitting
        GPSSending --> FreshPing : INSERT ping (age ≤ 60s)
        FreshPing --> StalePing : Elapsed time > 60s
        StalePing --> FreshPing : New ping received
        StalePing --> Unavailable : Elapsed time > 300s / connection lost
        GPSSending --> GhostMode : Driver toggles Ghost Mode ON
        GhostMode --> GPSSending : Driver toggles Ghost Mode OFF
        GhostMode --> [*] : Trip ended
        Unavailable --> [*] : Trip ended
    }

    %% ----------------------------------------------------
    %% STATE MACHINE 4: EMERGENCY SOS SIREN
    %% ----------------------------------------------------
    state "4. Emergency SOS Alert Lifecycle (EmergencyAlert)" as S_SOS {
        [*] --> Countdown5s : Driver taps SOS button
        Countdown5s --> FalseAlarm : Driver taps 'Cancel' in < 5s
        Countdown5s --> ActiveSiren : 5-second timer expires
        ActiveSiren --> SMSFallback : Cellular data unavailable
        SMSFallback --> ResolvedSafe : Convoy host clears emergency
        ActiveSiren --> ResolvedSafe : Convoy host clears emergency
        FalseAlarm --> [*]
        ResolvedSafe --> [*]
    }
```

---

## 6. UML Activity Diagram (Trip & Expense Workflow)

> **File:** [`uml_activity_diagram.drawio`](uml_activity_diagram.drawio) | [`images/uml_activity_diagram.png`](images/uml_activity_diagram.png)  
> **Description:** End-to-end user workflow: Host trip creation, unique 8-character trip code generation, duplicate-checked joining, expense logging, dispute resolution, and final UPI settlement.

```mermaid
flowchart TD
    Start([● Start]) --> CreateTrip[Host creates Trip via CreateTripModal.jsx\nTitle, Destination, Dates]
    CreateTrip --> GenCode[Backend generates unique 8-char code\nExample: GOASP2DM]
    GenCode --> ShareCode[Host shares code with convoy members\nWhatsApp / Link / QR]
    ShareCode --> EnterCode[Member enters code via JoinTrip.jsx]

    EnterCode --> CheckDup{Already a\nMember?}
    CheckDup -- Yes --> ConflictErr[Return 409 Conflict\n'Already member of this trip']
    ConflictErr --> EnterCode

    CheckDup -- No --> EnrollMember[INSERT INTO trip_members\nrole = 'member']
    EnrollMember --> LogExpense[Member logs expense\nEqual, Custom, or Exclude split]

    LogExpense --> CheckDispute{Dispute\nRaised?}
    CheckDispute -- Yes --> HostReview[Trip Host reviews & resolves dispute\nAdjusts share or dismisses]
    HostReview --> SettleUPI[Members settle net balances\nUPI Intent link: upi://pay]

    CheckDispute -- No --> SettleUPI
    SettleUPI --> AllSettled{All Debts\nPaid?}
    AllSettled -- No --> SettleUPI
    AllSettled -- Yes --> End([◉ End / Trip Settled])
```

---

## Technical Summary Table for Evaluators

| Diagram Type | UML / Modeling Standard | Core Purpose | DB / System Anchor |
| :--- | :--- | :--- | :--- |
| **Relational Schema** | Physical Crow's Foot Schema | Table structures, column data types, Foreign Keys, cascading rules, and composite indexes. | Neon PostgreSQL Database |
| **Conceptual ERD** | Domain Entity-Relationship | Business entities, relationships, cardinality mapping (`1:N`, `M:N`). | Domain-Driven Design (DDD) |
| **UML Class Diagram** | UML 2.5 Class Diagram | SQLAlchemy ORM declarative models, attributes, enums, methods, and class inheritance. | `backend/app/models/` |
| **UML Sequence Diagram** | UML 2.5 Sequence Diagram | Chronological messaging for GPS adaptive capture, JWT auth, convoy lag detection, and SOS alerts. | FastAPI Routers & WebSockets |
| **UML State Diagram** | UML 2.5 State Machine | State transitions and lifecycles for Disputes, Settlements, Telemetry Freshness, and SOS Siren. | Enum fields & Status flags |
| **UML Activity Diagram** | UML 2.5 Activity Diagram | Process workflow for Trip Creation, Invitation, Expense Logging, Dispute Review, and UPI Settlements. | End-to-End User Experience |
