#!/usr/bin/env python3
"""Set equipment.status=maintenance for rows with open work orders (legacy alignment)."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def main():
    from app.db import SessionLocal
    from app.services.equipment_work_order_sync import backfill_equipment_status_from_open_work_orders

    db = SessionLocal()
    try:
        updated = backfill_equipment_status_from_open_work_orders(db)
        print(f"Equipment rows updated: {updated}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
