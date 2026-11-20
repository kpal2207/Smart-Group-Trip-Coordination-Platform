from sqlalchemy import URL, create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from app.config import settings


is_sqlite = settings.DATABASE_DIALECT.startswith("sqlite")
SQL_DATABASE_URL = URL.create(
    drivername=settings.DATABASE_DIALECT,
    username=None if is_sqlite else settings.DATABASE_USER,
    password=None if is_sqlite else settings.DATABASE_PASSWORD,
    host=None if is_sqlite else settings.DATABASE_HOST,
    port=None if is_sqlite else settings.DATABASE_PORT,
    database=settings.DATABASE_NAME,
)

# Create the SQLAlchemy engine. Supports SQLite (for local testing/dev) and PostgreSQL.
connect_args = {"check_same_thread": False} if is_sqlite else {}
engine = create_engine(SQL_DATABASE_URL, connect_args=connect_args)

# SessionLocal is a factory for generating new database sessions.
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Base class for our SQLAlchemy models. All models will inherit from this.
Base = declarative_base()


def get_db():
    """
    FastAPI dependency that provides a database session for a request.
    It yields the session and ensures it is closed after the request is complete.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
