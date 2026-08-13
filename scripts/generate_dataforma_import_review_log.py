"""Generate a full review log of DataForma CSV rows vs MKHub clients."""
from __future__ import annotations

import csv
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from dotenv import load_dotenv

load_dotenv()

from sqlalchemy import func, or_

from app.db import SessionLocal
from app.models.models import Client

CSV_PATH = Path(r"c:\Users\Raphael Coelho\Downloads\Data_Forma_Customer_2026_Cleaned(in).csv")
OUT_DIR = Path("var/imports")


def main() -> int:
    with open(CSV_PATH, newline="", encoding="utf-8-sig") as fh:
        rows = list(csv.DictReader(fh))

    db = SessionLocal()
    imported: list[tuple[int, Client, str]] = []
    name_only: list[tuple[int, Client, str, str]] = []
    missing: list[tuple[int, str, str]] = []

    try:
        for line, row in enumerate(rows, start=2):
            name = (row.get("COMPANY NAME") or "").strip()
            dfid = (row.get("ALT #") or "").strip()
            client = None
            how = None

            if dfid:
                client = db.query(Client).filter(Client.dataforma_id == dfid).first()
                if client:
                    how = "dataforma_id"

            if not client and name:
                name_l = name.lower()
                client = (
                    db.query(Client)
                    .filter(
                        Client.deleted_at.is_(None),
                        or_(
                            func.lower(Client.name) == name_l,
                            func.lower(func.coalesce(Client.display_name, "")) == name_l,
                        ),
                    )
                    .first()
                )
                if client:
                    how = "name"

            if not client:
                missing.append((line, name, dfid))
            elif how == "dataforma_id":
                imported.append((line, client, dfid))
            else:
                name_only.append((line, client, dfid, how or "name"))
    finally:
        db.close()

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out = OUT_DIR / f"dataforma_customers_2026_FULL_review_{datetime.now().strftime('%Y%m%d_%H%M%S')}.log"

    with open(out, "w", encoding="utf-8", newline="") as fh:
        fh.write("DataForma 2026 customer import - FULL manual review log\n")
        fh.write(f"Source CSV: {CSV_PATH}\n")
        fh.write(f"Generated: {datetime.now().isoformat(timespec='seconds')}\n")
        fh.write(f"CSV rows: {len(rows)}\n")
        fh.write(f"Found via dataforma_id (imported from this CSV): {len(imported)}\n")
        fh.write(
            f"Found via name only (already in MKHub / no dataforma link): {len(name_only)}\n"
        )
        fh.write(f"Missing in MKHub: {len(missing)}\n\n")

        fh.write("=" * 80 + "\n")
        fh.write("IMPORTED FROM THIS CSV (have dataforma_id) - verify manually\n")
        fh.write("=" * 80 + "\n")
        for n, (_line, client, dfid) in enumerate(imported, 1):
            label = client.display_name or client.name
            fh.write(f"{n:3d}. [{client.code}] {label}\n")
            fh.write(
                f"     type={client.client_type or '-'}  "
                f"status={client.client_status or '-'}  "
                f"dataforma_id={dfid}\n"
            )
            fh.write(
                f"     address={client.address_line1 or '-'}, "
                f"{client.city or '-'}, {client.province or '-'} "
                f"{client.postal_code or ''}\n"
            )
            fh.write(f"     billing_email={client.billing_email or '-'}\n")

        fh.write("\n" + "=" * 80 + "\n")
        fh.write("ALREADY EXISTED BY NAME (skipped - may not have dataforma_id)\n")
        fh.write("=" * 80 + "\n")
        for n, (_line, client, dfid, how) in enumerate(name_only, 1):
            label = client.display_name or client.name
            fh.write(f"{n:3d}. [{client.code}] {label}\n")
            fh.write(
                f"     csv_dataforma_id={dfid or '-'}  "
                f"db_dataforma_id={client.dataforma_id or '-'}  "
                f"match={how}\n"
            )
            fh.write(f"     type={client.client_type or '-'}  city={client.city or '-'}\n")

        fh.write("\n" + "=" * 80 + "\n")
        fh.write("MISSING (not found in MKHub)\n")
        fh.write("=" * 80 + "\n")
        if not missing:
            fh.write("(none)\n")
        else:
            for line, name, dfid in missing:
                fh.write(f"- line {line}: {name} (ALT #={dfid})\n")

        fh.write("\n" + "=" * 80 + "\n")
        fh.write("CHECKLIST - imported names\n")
        fh.write("=" * 80 + "\n")
        for _line, client, _dfid in imported:
            fh.write(f"[ ] {client.display_name or client.name}\n")

    print(out)
    print(
        f"imported={len(imported)} name_only={len(name_only)} missing={len(missing)}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
