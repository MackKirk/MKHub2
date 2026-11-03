#!/usr/bin/env python3
"""Create metals_* CRM tables (non-destructive). Uses SQLAlchemy models."""
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
        m.MetalsClient.__table__,
        m.MetalsClientContact.__table__,
        m.MetalsClientSite.__table__,
        m.MetalsClientFolder.__table__,
        m.MetalsClientFile.__table__,
        m.MetalsClientDocument.__table__,
        m.MetalsClientNote.__table__,
        m.MetalsMigrationBatch.__table__,
        m.MetalsClientIdMap.__table__,
        m.MetalsContactIdMap.__table__,
        m.MetalsSiteIdMap.__table__,
        m.MetalsFolderIdMap.__table__,
        m.MetalsFileIdMap.__table__,
        m.MetalsDocumentIdMap.__table__,
        m.MetalsNoteIdMap.__table__,
    ]
    Base.metadata.create_all(bind=engine, tables=tables)
    print(f"Ensured {len(tables)} metals_* tables exist.")


if __name__ == "__main__":
    main()
