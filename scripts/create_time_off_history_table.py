#!/usr/bin/env python3
"""
Script to create the time_off_history table in the database.
"""
import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.db import Base, engine
from app.models.models import TimeOffHistory

if __name__ == "__main__":
    print("Creating time_off_history table...")
    Base.metadata.create_all(bind=engine, tables=[TimeOffHistory.__table__])
    print("[OK] time_off_history table created successfully!")

