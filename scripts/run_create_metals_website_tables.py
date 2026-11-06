#!/usr/bin/env python3
"""Create MK Metals website tables (catalog, memberships, submissions). Non-destructive."""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

try:
    from dotenv import load_dotenv

    load_dotenv()
except Exception:
    pass


def main() -> None:
    from app.db import Base, engine
    from app.models import models as m

    tables = [
        m.PortalMetalsMembership.__table__,
        m.MetalsCatalogCategory.__table__,
        m.MetalsCatalogProduct.__table__,
        m.MetalsWebsiteSubmission.__table__,
        m.MetalsWebsiteSubmissionItem.__table__,
        m.MetalsWebsiteSubmissionFile.__table__,
    ]
    Base.metadata.create_all(bind=engine, tables=tables)
    print(f"Ensured {len(tables)} metals website tables exist.")


if __name__ == "__main__":
    main()
