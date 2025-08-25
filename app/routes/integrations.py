from fastapi import APIRouter
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from ..db import engine


router = APIRouter(prefix="/integrations", tags=["integrations"])


@router.get("/status")
def status():
    # DB health
    db_ok = True
    try:
        with engine.connect() as conn:
            conn.execute(text("select 1"))
    except SQLAlchemyError:
        db_ok = False

    # Other integrations are placeholders for now
    return {
        "db": db_ok,
        "blob": False,
        "graph": False,
        "bamboohr": False,
        "dataforma": False,
    }

