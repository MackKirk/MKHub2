"""
Add quiz attempt limits (training_quizzes.max_attempts) and usage tracking table.

Safe to run multiple times. For existing databases created before max_attempts existed:

  python scripts/migrate_training_quiz_attempts.py

(from repo root; the script adds the project root to sys.path)

On server startup, main.py also applies this migration automatically for PostgreSQL.

New installs can rely on SQLAlchemy create_all from create_training_tables.py instead.
"""

import sys
from pathlib import Path

_root = Path(__file__).resolve().parents[1]
if str(_root) not in sys.path:
    sys.path.insert(0, str(_root))

from sqlalchemy import text

from app.db import Base, engine
from app.models.models import TrainingQuizUserAttempt


def migrate() -> None:
    with engine.begin() as conn:
        conn.execute(
            text(
                """
                ALTER TABLE training_quizzes
                ADD COLUMN IF NOT EXISTS max_attempts INTEGER NULL
                """
            )
        )
        conn.execute(
            text(
                """
                UPDATE training_quizzes
                SET max_attempts = CASE WHEN allow_retry THEN NULL ELSE 1 END
                WHERE max_attempts IS NULL
                """
            )
        )

    Base.metadata.create_all(bind=engine, tables=[TrainingQuizUserAttempt.__table__])
    print("training_quizzes.max_attempts and training_quiz_user_attempts are ready.")


if __name__ == "__main__":
    migrate()
