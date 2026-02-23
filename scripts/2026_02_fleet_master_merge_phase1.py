#!/usr/bin/env python3
"""
Idempotent migration: Fleet Master Sheet Merge Phase 1.
- Adds new columns to fleet_assets and equipment
- Creates fleet_compliance_records and asset_assignments tables
- Never drops anything; logs all changes.
"""
import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.config import settings
from app.db import engine
from sqlalchemy import text


def column_exists(conn, table: str, column: str) -> bool:
    r = conn.execute(
        text(
            """
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = :t AND column_name = :c
        """
        ),
        {"t": table, "c": column},
    )
    return r.fetchone() is not None


def table_exists(conn, table: str) -> bool:
    r = conn.execute(
        text(
            """
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = :t
        """
        ),
        {"t": table},
    )
    return r.fetchone() is not None


def unique_index_exists(conn, index_name: str) -> bool:
    r = conn.execute(
        text(
            """
        SELECT 1 FROM pg_indexes WHERE indexname = :name
        """
        ),
        {"name": index_name},
    )
    return r.fetchone() is not None


def run_migration():
    if not settings.database_url.startswith("postgres"):
        print("This script only works with PostgreSQL.")
        return False

    print("Connecting to database...")
    with engine.connect() as conn:
        trans = conn.begin()
        try:
            # ---- A.1 fleet_assets: new columns ----
            print("\n--- fleet_assets ---")
            new_cols = [
                ("fuel_type", "VARCHAR(100)"),
                ("vehicle_type", "VARCHAR(100)"),
                ("driver_contact_phone", "VARCHAR(100)"),
                ("yard_location", "VARCHAR(255)"),
                ("gvw_value", "INTEGER"),
                ("gvw_unit", "VARCHAR(10)"),
                ("equipment_type_label", "VARCHAR(255)"),
                ("odometer_next_due_at", "INTEGER"),
                ("odometer_noted_issues", "TEXT"),
                ("propane_sticker_cert", "VARCHAR(100)"),
                ("propane_sticker_date", "DATE"),
                ("hours_next_due_at", "NUMERIC(12,2)"),
                ("hours_noted_issues", "TEXT"),
            ]
            for col, typ in new_cols:
                if not column_exists(conn, "fleet_assets", col):
                    conn.execute(text(f"ALTER TABLE fleet_assets ADD COLUMN {col} {typ}"))
                    print(f"  [OK] Added fleet_assets.{col}")
                else:
                    print(f"  [SKIP] fleet_assets.{col} exists")

            # Unique index on fleet_assets.unit_number (partial: only non-null)
            if not unique_index_exists(conn, "uq_fleet_assets_unit_number"):
                conn.execute(
                    text(
                        """
                    CREATE UNIQUE INDEX uq_fleet_assets_unit_number
                    ON fleet_assets(unit_number) WHERE unit_number IS NOT NULL AND unit_number != ''
                    """
                    )
                )
                print("  [OK] Created unique index uq_fleet_assets_unit_number")
            else:
                print("  [SKIP] uq_fleet_assets_unit_number exists")

            # ---- A.2 equipment: unit_number ----
            print("\n--- equipment ---")
            if not column_exists(conn, "equipment", "unit_number"):
                conn.execute(text("ALTER TABLE equipment ADD COLUMN unit_number VARCHAR(50)"))
                print("  [OK] Added equipment.unit_number")
            else:
                print("  [SKIP] equipment.unit_number exists")
            if not unique_index_exists(conn, "uq_equipment_unit_number"):
                conn.execute(
                    text(
                        """
                    CREATE UNIQUE INDEX uq_equipment_unit_number
                    ON equipment(unit_number) WHERE unit_number IS NOT NULL AND unit_number != ''
                    """
                    )
                )
                print("  [OK] Created unique index uq_equipment_unit_number")
            else:
                print("  [SKIP] uq_equipment_unit_number exists")

            # ---- A.3 fleet_compliance_records ----
            print("\n--- fleet_compliance_records ---")
            if not table_exists(conn, "fleet_compliance_records"):
                conn.execute(
                    text(
                        """
                    CREATE TABLE fleet_compliance_records (
                        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                        fleet_asset_id UUID NOT NULL REFERENCES fleet_assets(id) ON DELETE CASCADE,
                        record_type VARCHAR(50) NOT NULL,
                        facility VARCHAR(255),
                        completed_by VARCHAR(255),
                        equipment_classification VARCHAR(255),
                        equipment_make_model VARCHAR(255),
                        serial_number VARCHAR(255),
                        annual_inspection_date DATE,
                        expiry_date DATE,
                        file_reference_number VARCHAR(255),
                        notes TEXT,
                        documents JSONB
                    )
                    """
                    )
                )
                conn.execute(
                    text(
                        """
                    CREATE INDEX idx_fleet_compliance_asset_type_expiry
                    ON fleet_compliance_records(fleet_asset_id, record_type, expiry_date)
                    """
                    )
                )
                conn.execute(
                    text(
                        """
                    CREATE INDEX idx_fleet_compliance_expiry
                    ON fleet_compliance_records(expiry_date)
                    """
                    )
                )
                print("  [OK] Created table fleet_compliance_records and indexes")
            else:
                print("  [SKIP] fleet_compliance_records exists")

            # ---- A.4 asset_assignments ----
            print("\n--- asset_assignments ---")
            if not table_exists(conn, "asset_assignments"):
                conn.execute(
                    text(
                        """
                    CREATE TABLE asset_assignments (
                        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                        target_type VARCHAR(50) NOT NULL,
                        fleet_asset_id UUID REFERENCES fleet_assets(id) ON DELETE CASCADE,
                        equipment_id UUID REFERENCES equipment(id) ON DELETE CASCADE,
                        assigned_to_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
                        assigned_to_name VARCHAR(255),
                        phone_snapshot VARCHAR(255),
                        address_snapshot TEXT,
                        department_snapshot VARCHAR(255),
                        assigned_at TIMESTAMP WITH TIME ZONE NOT NULL,
                        expected_return_at TIMESTAMP WITH TIME ZONE,
                        returned_at TIMESTAMP WITH TIME ZONE,
                        odometer_out INTEGER,
                        odometer_in INTEGER,
                        hours_out NUMERIC(12,2),
                        hours_in NUMERIC(12,2),
                        notes_out TEXT,
                        notes_in TEXT,
                        photos_out JSONB,
                        photos_in JSONB
                    )
                    """
                    )
                )
                conn.execute(
                    text(
                        """
                    CREATE INDEX idx_asset_assignments_open_fleet
                    ON asset_assignments(fleet_asset_id) WHERE returned_at IS NULL
                    """
                    )
                )
                conn.execute(
                    text(
                        """
                    CREATE INDEX idx_asset_assignments_open_equipment
                    ON asset_assignments(equipment_id) WHERE returned_at IS NULL
                    """
                    )
                )
                conn.execute(
                    text(
                        """
                    CREATE INDEX idx_asset_assignments_user
                    ON asset_assignments(assigned_to_user_id)
                    """
                    )
                )
                print("  [OK] Created table asset_assignments and indexes")
            else:
                print("  [SKIP] asset_assignments exists")

            trans.commit()
            print("\n[SUCCESS] Migration completed.")
            return True
        except Exception as e:
            trans.rollback()
            print(f"\n[ERROR] {e}")
            import traceback
            traceback.print_exc()
            return False


if __name__ == "__main__":
    print("=" * 60)
    print("2026_02 Fleet Master Merge Phase 1 (idempotent)")
    print("=" * 60)
    ok = run_migration()
    sys.exit(0 if ok else 1)
