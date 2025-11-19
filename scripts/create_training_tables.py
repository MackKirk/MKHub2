"""
Create training tables in the database.

Usage:
  python scripts/create_training_tables.py

This script creates all training-related tables using SQLAlchemy's create_all().
It's safe to run multiple times - it won't recreate existing tables.
"""

from app.db import Base, engine
from app.models.models import (
    TrainingCourse,
    TrainingModule,
    TrainingLesson,
    TrainingQuiz,
    TrainingQuizQuestion,
    TrainingProgress,
    TrainingCompletedLesson,
    TrainingCertificate,
    training_course_required_roles,
    training_course_required_divisions,
    training_course_required_users,
)


def create_training_tables():
    """Create all training tables"""
    print("Creating training tables...")
    
    # Create all tables defined in models
    Base.metadata.create_all(bind=engine, tables=[
        training_course_required_roles,
        training_course_required_divisions,
        training_course_required_users,
        TrainingCourse.__table__,
        TrainingModule.__table__,
        TrainingLesson.__table__,
        TrainingQuiz.__table__,
        TrainingQuizQuestion.__table__,
        TrainingProgress.__table__,
        TrainingCompletedLesson.__table__,
        TrainingCertificate.__table__,
    ])
    
    print("Training tables created successfully!")
    print("\nTables created:")
    print("  - training_course_required_roles")
    print("  - training_course_required_divisions")
    print("  - training_course_required_users")
    print("  - training_courses")
    print("  - training_modules")
    print("  - training_lessons")
    print("  - training_quizzes")
    print("  - training_quiz_questions")
    print("  - training_progress")
    print("  - training_completed_lessons")
    print("  - training_certificates")


if __name__ == "__main__":
    create_training_tables()

