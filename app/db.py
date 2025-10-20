from sqlalchemy.orm import declarative_base, sessionmaker
from sqlalchemy import create_engine
from .config import settings


engine = create_engine(settings.database_url, future=True, pool_pre_ping=True)

# IMPORTANT: do not use scoped_session with async frameworks; create a fresh Session per request
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)

Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

