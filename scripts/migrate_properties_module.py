#!/usr/bin/env python3
"""Idempotent migration: Property Management module tables."""
import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.config import settings
from app.db import engine
from sqlalchemy import text


def table_exists(conn, table: str) -> bool:
    if settings.database_url.startswith("sqlite"):
        r = conn.execute(text("SELECT name FROM sqlite_master WHERE type='table' AND name=:t"), {"t": table})
        return r.fetchone() is not None
    r = conn.execute(
        text(
            "SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = :t"
        ),
        {"t": table},
    )
    return r.fetchone() is not None


def run_migration():
    is_pg = settings.database_url.startswith("postgres")
    print("Connecting to database...")
    with engine.connect() as conn:
        trans = conn.begin()
        try:
            ddl_statements = [
                """
                CREATE TABLE IF NOT EXISTS property_entities (
                    id UUID PRIMARY KEY,
                    legal_name VARCHAR(255) NOT NULL,
                    display_name VARCHAR(255),
                    entity_type VARCHAR(50) DEFAULT 'company',
                    notes TEXT,
                    active BOOLEAN DEFAULT TRUE,
                    created_at TIMESTAMPTZ DEFAULT NOW(),
                    updated_at TIMESTAMPTZ,
                    created_by UUID REFERENCES users(id) ON DELETE SET NULL
                )
                """,
                """
                CREATE TABLE IF NOT EXISTS properties (
                    id UUID PRIMARY KEY,
                    name VARCHAR(255) NOT NULL,
                    property_type VARCHAR(50),
                    ownership VARCHAR(50) DEFAULT 'owned',
                    visibility VARCHAR(20) DEFAULT 'company',
                    status VARCHAR(50) DEFAULT 'active',
                    address_line1 VARCHAR(255),
                    address_line2 VARCHAR(255),
                    city VARCHAR(100),
                    province VARCHAR(100),
                    postal_code VARCHAR(50),
                    country VARCHAR(100),
                    lat NUMERIC(10,7),
                    lng NUMERIC(10,7),
                    notes TEXT,
                    image_file_object_id UUID REFERENCES file_objects(id) ON DELETE SET NULL,
                    created_at TIMESTAMPTZ DEFAULT NOW(),
                    updated_at TIMESTAMPTZ,
                    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
                    deleted_at TIMESTAMPTZ
                )
                """,
                """
                CREATE TABLE IF NOT EXISTS property_owners (
                    id UUID PRIMARY KEY,
                    property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
                    entity_id UUID NOT NULL REFERENCES property_entities(id) ON DELETE CASCADE,
                    ownership_percentage NUMERIC(5,2),
                    created_at TIMESTAMPTZ DEFAULT NOW(),
                    UNIQUE(property_id, entity_id)
                )
                """,
                """
                CREATE TABLE IF NOT EXISTS property_access (
                    id UUID PRIMARY KEY,
                    property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
                    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    created_at TIMESTAMPTZ DEFAULT NOW(),
                    UNIQUE(property_id, user_id)
                )
                """,
                """
                CREATE TABLE IF NOT EXISTS property_leases (
                    id UUID PRIMARY KEY,
                    property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
                    role VARCHAR(20) NOT NULL,
                    landlord_entity_id UUID REFERENCES property_entities(id) ON DELETE SET NULL,
                    tenant_entity_id UUID REFERENCES property_entities(id) ON DELETE SET NULL,
                    counterparty_name VARCHAR(255),
                    start_date DATE,
                    end_date DATE,
                    base_rent NUMERIC(12,2),
                    rent_frequency VARCHAR(50),
                    currency VARCHAR(10) DEFAULT 'CAD',
                    deposit NUMERIC(12,2),
                    renewal_type VARCHAR(50),
                    renewal_date DATE,
                    notice_days INTEGER,
                    status VARCHAR(50) DEFAULT 'draft',
                    notes TEXT,
                    created_at TIMESTAMPTZ DEFAULT NOW(),
                    updated_at TIMESTAMPTZ
                )
                """,
                """
                CREATE TABLE IF NOT EXISTS property_insurance_policies (
                    id UUID PRIMARY KEY,
                    property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
                    provider VARCHAR(255),
                    broker VARCHAR(255),
                    policy_number VARCHAR(100),
                    policy_type VARCHAR(100),
                    effective_date DATE,
                    expiry_date DATE,
                    coverage_amount NUMERIC(14,2),
                    deductible NUMERIC(12,2),
                    annual_premium NUMERIC(12,2),
                    contact_name VARCHAR(255),
                    contact_phone VARCHAR(100),
                    contact_email VARCHAR(255),
                    notes TEXT,
                    created_at TIMESTAMPTZ DEFAULT NOW(),
                    updated_at TIMESTAMPTZ
                )
                """,
                """
                CREATE TABLE IF NOT EXISTS property_tax_records (
                    id UUID PRIMARY KEY,
                    property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
                    jurisdiction VARCHAR(255),
                    tax_year INTEGER NOT NULL,
                    assessed_value NUMERIC(14,2),
                    tax_amount NUMERIC(12,2),
                    due_date DATE,
                    paid_date DATE,
                    status VARCHAR(50) DEFAULT 'upcoming',
                    notes TEXT,
                    created_at TIMESTAMPTZ DEFAULT NOW(),
                    updated_at TIMESTAMPTZ
                )
                """,
                """
                CREATE TABLE IF NOT EXISTS property_permits (
                    id UUID PRIMARY KEY,
                    property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
                    permit_type VARCHAR(100),
                    title VARCHAR(255),
                    permit_number VARCHAR(100),
                    authority VARCHAR(255),
                    stage VARCHAR(50) DEFAULT 'identified',
                    issued_date DATE,
                    expiry_date DATE,
                    checklist JSONB DEFAULT '[]',
                    notes TEXT,
                    created_at TIMESTAMPTZ DEFAULT NOW(),
                    updated_at TIMESTAMPTZ
                )
                """,
                """
                CREATE TABLE IF NOT EXISTS property_files (
                    id UUID PRIMARY KEY,
                    property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
                    file_object_id UUID NOT NULL REFERENCES file_objects(id) ON DELETE CASCADE,
                    category VARCHAR(100),
                    related_type VARCHAR(50),
                    related_id UUID,
                    folder VARCHAR(255),
                    description VARCHAR(1000),
                    original_name VARCHAR(255),
                    uploaded_at TIMESTAMPTZ DEFAULT NOW(),
                    uploaded_by UUID
                )
                """,
                """
                CREATE TABLE IF NOT EXISTS property_responsibilities (
                    id UUID PRIMARY KEY,
                    property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
                    role VARCHAR(100) NOT NULL,
                    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
                    contact_name VARCHAR(255),
                    contact_company VARCHAR(255),
                    contact_phone VARCHAR(100),
                    contact_email VARCHAR(255),
                    notes TEXT,
                    created_at TIMESTAMPTZ DEFAULT NOW(),
                    updated_at TIMESTAMPTZ
                )
                """,
                """
                CREATE TABLE IF NOT EXISTS property_maintenance_items (
                    id UUID PRIMARY KEY,
                    property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
                    item_type VARCHAR(100),
                    title VARCHAR(255) NOT NULL,
                    frequency VARCHAR(50),
                    next_due_date DATE,
                    last_completed_date DATE,
                    responsible_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
                    status VARCHAR(50) DEFAULT 'scheduled',
                    notes TEXT,
                    created_at TIMESTAMPTZ DEFAULT NOW(),
                    updated_at TIMESTAMPTZ
                )
                """,
                """
                CREATE TABLE IF NOT EXISTS property_alert_events (
                    id UUID PRIMARY KEY,
                    entity_type VARCHAR(50) NOT NULL,
                    entity_id UUID NOT NULL,
                    alert_key VARCHAR(80) NOT NULL,
                    sent_at TIMESTAMPTZ DEFAULT NOW(),
                    UNIQUE(entity_type, entity_id, alert_key)
                )
                """,
            ]

            if not is_pg:
                for stmt in ddl_statements:
                    s = (
                        stmt.replace("UUID", "TEXT")
                        .replace("JSONB", "JSON")
                        .replace("TIMESTAMPTZ", "DATETIME")
                        .replace("NOW()", "CURRENT_TIMESTAMP")
                        .replace("BOOLEAN", "INTEGER")
                        .replace("DEFAULT TRUE", "DEFAULT 1")
                        .replace("NUMERIC(10,7)", "REAL")
                        .replace("NUMERIC(5,2)", "REAL")
                        .replace("NUMERIC(12,2)", "REAL")
                        .replace("NUMERIC(14,2)", "REAL")
                    )
                    if not table_exists(conn, s.split("CREATE TABLE IF NOT EXISTS ")[1].split(" ")[0].strip()):
                        conn.execute(text(s))
                        print(f"  [OK] Created table")
            else:
                for stmt in ddl_statements:
                    name = stmt.split("CREATE TABLE IF NOT EXISTS ")[1].split(" ")[0].strip()
                    if table_exists(conn, name):
                        print(f"  [SKIP] {name}")
                    else:
                        conn.execute(text(stmt))
                        print(f"  [OK] Created {name}")

            trans.commit()
            print("\nProperty module migration complete.")
            return True
        except Exception as e:
            trans.rollback()
            print(f"Migration failed: {e}")
            raise


if __name__ == "__main__":
    run_migration()
