#!/usr/bin/env python3
"""Create portal_metals_password_resets table. Non-destructive.

Legacy portal_password_resets (Hub-shared) was replaced by Metals-only resets.
Prefer scripts/separate_metals_portal_auth.py on existing databases.
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


def main() -> None:
    from app.db import Base, engine
    from app.models import models as m

    Base.metadata.create_all(
        bind=engine,
        tables=[
            m.PortalMetalsUser.__table__,
            m.PortalMetalsPasswordReset.__table__,
        ],
    )
    print("Ensured portal_metals_password_resets table exists.")


if __name__ == "__main__":
    main()
