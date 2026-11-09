#!/usr/bin/env python3
"""Create portal_password_resets table. Non-destructive."""
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

    Base.metadata.create_all(bind=engine, tables=[m.PortalPasswordReset.__table__])
    print("Ensured portal_password_resets table exists.")


if __name__ == "__main__":
    main()
