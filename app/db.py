from sqlalchemy.orm import declarative_base, sessionmaker
from sqlalchemy import create_engine
from .config import settings


# Configure connection pool for better performance
engine = create_engine(
    settings.database_url,
    future=True,
    pool_pre_ping=True,
    pool_size=5,
    max_overflow=10,
    pool_recycle=3600,  # Recycle connections after 1 hour
    connect_args={"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}
)

# IMPORTANT: do not use scoped_session with async frameworks; create a fresh Session per request
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)

Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

