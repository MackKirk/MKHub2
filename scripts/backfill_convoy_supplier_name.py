"""One-off: reassign Material.supplier_name after a supplier was renamed without cascade."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from dotenv import load_dotenv

load_dotenv()

from sqlalchemy import func

from app.db import SessionLocal
from app.models.models import Material, Supplier

OLD = "Convoy"
NEW = "Convoy Supply"


def main() -> int:
    db = SessionLocal()
    try:
        supplier = (
            db.query(Supplier)
            .filter(func.lower(Supplier.name) == NEW.lower())
            .first()
        )
        if not supplier:
            print(f"ERROR: Supplier '{NEW}' not found")
            return 1

        old_supplier = (
            db.query(Supplier)
            .filter(func.lower(Supplier.name) == OLD.lower())
            .first()
        )
        if old_supplier:
            print(f"NOTE: orphan supplier row still named '{old_supplier.name}' id={old_supplier.id}")

        rows = (
            db.query(Material)
            .filter(Material.supplier_name.isnot(None))
            .filter(func.lower(Material.supplier_name) == OLD.lower())
            .all()
        )
        print(f"Found {len(rows)} material(s) with supplier_name='{OLD}'")
        for row in rows:
            row.supplier_name = supplier.name
        db.commit()
        print(f"Updated {len(rows)} material(s) -> '{supplier.name}'")
        return 0
    except Exception as e:
        db.rollback()
        print(f"ERROR: {e}")
        return 1
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
