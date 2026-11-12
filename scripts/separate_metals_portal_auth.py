#!/usr/bin/env python3
"""
Separate Metals website auth from Hub portal identities (one-time migration).

- Creates portal_metals_users / refresh / password_reset tables
- Clears metals memberships (users must re-register on the website)
- Remaps membership + submission FKs onto portal_metals_users
- Deletes metals-only orphan PortalHubUser rows (keeps Hub portal accounts)
- Drops legacy portal_password_resets
"""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

try:
    from dotenv import load_dotenv

    load_dotenv()
except Exception:
    pass


def _exec(db, sql: str) -> None:
    from sqlalchemy import text

    db.execute(text(sql))


def main() -> None:
    from sqlalchemy import inspect

    from app.db import Base, SessionLocal, engine
    from app.models import models as m

    db = SessionLocal()
    try:
        insp = inspect(engine)

        # 1) Clear shared Metals links before schema swap (raw SQL: old columns may differ)
        if insp.has_table("portal_metals_memberships"):
            _exec(db, "DELETE FROM portal_metals_memberships")
            print("Deleted portal_metals_memberships rows")

        if insp.has_table("metals_website_submissions"):
            cols = {c["name"] for c in insp.get_columns("metals_website_submissions")}
            if "portal_user_id" in cols:
                _exec(db, "UPDATE metals_website_submissions SET portal_user_id = NULL")
                print("Nulled metals_website_submissions.portal_user_id")
            if "metals_user_id" in cols:
                _exec(db, "UPDATE metals_website_submissions SET metals_user_id = NULL")
                print("Nulled metals_website_submissions.metals_user_id")

        # 2) Drop old membership table (FK pointed at portal_hub_users)
        if insp.has_table("portal_metals_memberships"):
            _exec(db, "DROP TABLE IF EXISTS portal_metals_memberships CASCADE")
            print("Dropped portal_metals_memberships (will recreate)")

        # 3) Remap submissions column portal_user_id -> metals_user_id
        insp = inspect(engine)
        if insp.has_table("metals_website_submissions"):
            cols = {c["name"] for c in insp.get_columns("metals_website_submissions")}
            fks = insp.get_foreign_keys("metals_website_submissions")
            for fk in fks:
                constrained = set(fk.get("constrained_columns") or [])
                if "portal_user_id" in constrained or (
                    "metals_user_id" in constrained and (fk.get("referred_table") == "portal_hub_users")
                ):
                    name = fk.get("name")
                    if name:
                        _exec(db, f'ALTER TABLE metals_website_submissions DROP CONSTRAINT IF EXISTS "{name}"')
                        print(f"Dropped FK {name}")
            if "portal_user_id" in cols and "metals_user_id" not in cols:
                _exec(
                    db,
                    "ALTER TABLE metals_website_submissions RENAME COLUMN portal_user_id TO metals_user_id",
                )
                print("Renamed portal_user_id -> metals_user_id")
            _exec(db, "DROP INDEX IF EXISTS ix_metals_website_submissions_portal_user")

        db.commit()

        # 4) Create new Metals identity tables + memberships
        Base.metadata.create_all(
            bind=engine,
            tables=[
                m.PortalMetalsUser.__table__,
                m.PortalMetalsRefreshToken.__table__,
                m.PortalMetalsPasswordReset.__table__,
                m.PortalMetalsMembership.__table__,
            ],
        )
        print("Ensured portal_metals_users / refresh / password_resets / memberships")

        # 5) Ensure submissions.metals_user_id FK to portal_metals_users
        insp = inspect(engine)
        if insp.has_table("metals_website_submissions"):
            cols = {c["name"] for c in insp.get_columns("metals_website_submissions")}
            if "metals_user_id" not in cols:
                _exec(
                    db,
                    "ALTER TABLE metals_website_submissions ADD COLUMN metals_user_id UUID NULL",
                )
            # Drop any leftover FK on metals_user_id then re-add
            fks = insp.get_foreign_keys("metals_website_submissions")
            for fk in fks:
                if "metals_user_id" in set(fk.get("constrained_columns") or []):
                    name = fk.get("name")
                    if name:
                        _exec(db, f'ALTER TABLE metals_website_submissions DROP CONSTRAINT IF EXISTS "{name}"')
            _exec(
                db,
                """
                DO $$
                BEGIN
                  IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint WHERE conname = 'fk_metals_website_submissions_metals_user'
                  ) THEN
                    ALTER TABLE metals_website_submissions
                      ADD CONSTRAINT fk_metals_website_submissions_metals_user
                      FOREIGN KEY (metals_user_id) REFERENCES portal_metals_users(id) ON DELETE SET NULL;
                  END IF;
                END $$;
                """,
            )
            _exec(
                db,
                "CREATE INDEX IF NOT EXISTS ix_metals_website_submissions_metals_user ON metals_website_submissions (metals_user_id)",
            )
            print("Ensured submissions.metals_user_id FK")

        # 6) Delete metals-only orphan PortalHubUsers (no Hub membership)
        if insp.has_table("portal_hub_users"):
            from sqlalchemy import func

            orphans = (
                db.query(m.PortalHubUser)
                .outerjoin(
                    m.PortalHubMembership,
                    m.PortalHubMembership.portal_user_id == m.PortalHubUser.id,
                )
                .group_by(m.PortalHubUser.id)
                .having(func.count(m.PortalHubMembership.id) == 0)
                .all()
            )
            for u in orphans:
                db.query(m.PortalHubRefreshToken).filter(m.PortalHubRefreshToken.portal_user_id == u.id).delete()
                print(f"Deleting metals-only orphan PortalHubUser {u.email}")
                db.delete(u)

        # 7) Drop legacy portal_password_resets
        _exec(db, "DROP TABLE IF EXISTS portal_password_resets CASCADE")
        print("Dropped portal_password_resets")

        db.commit()
        print("separate_metals_portal_auth: done")
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
