"""
Import customers from the cleaned DataForma 2026 CSV into MKHub clients.

Designed for:
  Data_Forma_Customer_2026_Cleaned(in).csv

Maps DataForma columns onto the current Client / ClientContact model:
  ALT #                 -> dataforma_id (unique; used for re-import safety)
  COMPANY NAME          -> name, display_name, legal_name
  TYPE                  -> client_type
  STREET1 / CITY / STATE / ZIPCODE -> address fields
  PHONE1 *              -> primary ClientContact.phone
  SPECIALTY + DESCRIPTION + NOTES -> description
  emails found in notes -> billing_email (first) + cc_emails_for_invoices

Defaults aligned with NewCustomerModal / current app conventions:
  client_status = Active
  country       = Canada
  province      = full name (BC -> British Columbia, ON -> Ontario, ...)
  code          = next sequential 5-digit code (00001, 00002, ...)

Usage:
    python scripts/import_dataforma_customers_2026.py <path_to_csv> [--dry-run]

Example:
    python scripts/import_dataforma_customers_2026.py ^
      "C:\\Users\\Raphael Coelho\\Desktop\\Data_Forma_Customer_2026_Cleaned(in).csv" ^
      --dry-run
"""
from __future__ import annotations

import argparse
import csv
import os
import re
import sys
from typing import Iterable, Optional

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

try:
    from dotenv import load_dotenv

    load_dotenv()
except Exception as e:
    print(f"WARNING: Could not load .env file: {e}")

database_url = os.getenv("DATABASE_URL", "sqlite:///./var/dev.db")
if database_url.startswith("postgresql"):
    try:
        import psycopg2  # noqa: F401
    except ImportError:
        print("ERROR: PostgreSQL database detected but psycopg2 is not installed.")
        sys.exit(1)

try:
    from app.db import SessionLocal
    from app.models.models import Client, ClientContact
except ImportError as e:
    print(f"ERROR: Failed to import database components: {e}")
    sys.exit(1)


# Full names as used by the app UI (NewCustomerModal default = British Columbia).
PROVINCE_BY_CODE = {
    "AB": "Alberta",
    "BC": "British Columbia",
    "MB": "Manitoba",
    "NB": "New Brunswick",
    "NL": "Newfoundland and Labrador",
    "NS": "Nova Scotia",
    "NT": "Northwest Territories",
    "NU": "Nunavut",
    "ON": "Ontario",
    "PE": "Prince Edward Island",
    "QC": "Quebec",
    "SK": "Saskatchewan",
    "YT": "Yukon",
}

PROVINCE_BY_NAME = {name.lower(): name for name in PROVINCE_BY_CODE.values()}

# Labels currently used in Settings → client_types (exact strings stored on Client.client_type).
SYSTEM_CLIENT_TYPES = {
    "Commercial",
    "Residential",
    "Industrial",
    "Government",
    "Strata / Property Management",
    "Developer",
    "General Contractor",
    "Subcontractor",
    "Institutional",
    "Consultant",
    "Architect",
}

# CSV / legacy aliases → system labels.
CLIENT_TYPE_ALIASES = {
    "strata/property management": "Strata / Property Management",
    "strata / property management": "Strata / Property Management",
    "strata/propertymanagement": "Strata / Property Management",
    # Not a system customer type; closest match for filter consistency.
    "supplier": "Commercial",
}

# Known bad CITY values from the cleaned export (company name → corrected city).
CITY_FIXES_BY_COMPANY = {
    "city of white rock": "White Rock",
}

EMAIL_RE = re.compile(r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}")
POSTAL_RE = re.compile(r"^[A-Za-z]\d[A-Za-z]\s?\d[A-Za-z]\d$")
DESCRIPTION_MAX = 4000

PLACEHOLDER_WEBSITES = {"n/a", "na", "none", "-", "null", "tbd"}


def normalize_text(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    text = str(value).replace("\r\n", "\n").replace("\r", "\n").strip()
    return text or None


def detect_encoding(path: str) -> str:
    """Detect a encoding that can decode the entire file (not just a prefix)."""
    with open(path, "rb") as fh:
        raw = fh.read()
    last_error: Exception | None = None
    for encoding in ("utf-8-sig", "utf-8", "cp1252", "latin-1"):
        try:
            raw.decode(encoding)
            return encoding
        except UnicodeDecodeError as e:
            last_error = e
    raise RuntimeError(f"Could not decode CSV (last error: {last_error})")


def open_csv(path: str):
    """Open CSV trying UTF-8 first, then Windows-1252 (DataForma export)."""
    encoding = detect_encoding(path)
    return open(path, "r", encoding=encoding, newline=""), encoding


def normalize_headers(fieldnames: Iterable[str]) -> list[str]:
    return [str(name or "").strip().upper() for name in fieldnames]


def title_city(city: Optional[str], company_name: Optional[str] = None) -> Optional[str]:
    if company_name:
        fixed = CITY_FIXES_BY_COMPANY.get(company_name.strip().lower())
        if fixed:
            return fixed
    if not city:
        return None
    if city != city.lower():
        return city
    return city.title()


def normalize_client_type(raw: Optional[str]) -> Optional[str]:
    """Map CSV TYPE values onto Settings client_types labels."""
    value = normalize_text(raw)
    if not value:
        return None
    if value in SYSTEM_CLIENT_TYPES:
        return value
    alias = CLIENT_TYPE_ALIASES.get(value.lower().strip())
    if alias:
        return alias
    # Collapse odd spacing around "/" then retry (e.g. "Strata/ Property").
    collapsed = re.sub(r"\s*/\s*", " / ", value)
    collapsed = re.sub(r"\s+", " ", collapsed).strip()
    if collapsed in SYSTEM_CLIENT_TYPES:
        return collapsed
    alias = CLIENT_TYPE_ALIASES.get(collapsed.lower())
    if alias:
        return alias
    print(f"  WARNING: TYPE {value!r} is not in system client_types; storing as-is")
    return value


def normalize_province(raw: Optional[str]) -> Optional[str]:
    """Map BC/ON (and full names) to the full province labels used in MKHub."""
    value = normalize_text(raw)
    if not value:
        return None
    code = value.upper().replace(".", "")
    if code in PROVINCE_BY_CODE:
        return PROVINCE_BY_CODE[code]
    by_name = PROVINCE_BY_NAME.get(value.lower())
    if by_name:
        return by_name
    # Unknown value — keep as-is so nothing is silently dropped.
    print(f"  WARNING: unrecognized province {value!r}; storing as-is")
    return value


def normalize_postal_code(raw: Optional[str]) -> Optional[str]:
    value = normalize_text(raw)
    if not value:
        return None
    compact = re.sub(r"\s+", "", value).upper()
    if POSTAL_RE.match(compact) or (len(compact) == 6 and POSTAL_RE.match(f"{compact[:3]} {compact[3:]}")):
        return f"{compact[:3]} {compact[3:]}"
    print(f"  WARNING: unusual postal code {value!r}; storing as-is")
    return value


def format_phone_digits(digits: str) -> Optional[str]:
    if not digits:
        return None
    if len(digits) == 11 and digits.startswith("1"):
        digits = digits[1:]
    if len(digits) == 10:
        return f"({digits[:3]}) {digits[3:6]}-{digits[6:]}"
    # Incomplete numbers (e.g. bare area code) are not useful as contacts.
    if len(digits) < 10:
        return None
    return digits


def normalize_phone(area: Optional[str], number: Optional[str]) -> Optional[str]:
    """
    Prefer PHONE1 # when it already contains a full number.
    DataForma often stores both AREACODE=604 and PHONE1 #=(604) 879-5771.
    """
    area_digits = re.sub(r"\D", "", area or "")
    number_digits = re.sub(r"\D", "", number or "")

    if len(number_digits) >= 10:
        return format_phone_digits(number_digits)

    if area_digits and number_digits:
        return format_phone_digits(area_digits + number_digits)

    if number_digits:
        return format_phone_digits(number_digits)

    if area_digits:
        return format_phone_digits(area_digits)

    return None


def extract_emails(*texts: Optional[str]) -> list[str]:
    found: list[str] = []
    seen: set[str] = set()
    for text in texts:
        if not text:
            continue
        for match in EMAIL_RE.findall(text):
            email = match.lower()
            if email not in seen:
                seen.add(email)
                found.append(match)  # preserve original casing for storage
    return found


def build_description(
    specialty: Optional[str],
    company_description: Optional[str],
    company_notes: Optional[str],
    notes: Optional[str],
    website: Optional[str],
) -> Optional[str]:
    parts: list[str] = []

    if specialty:
        parts.append(f"Specialty: {specialty}")
    if company_description:
        parts.append(company_description)
    if company_notes:
        parts.append(company_notes)
    if notes:
        parts.append(f"Import notes: {notes}")
    if website:
        normalized = website.strip()
        if normalized.lower() not in PLACEHOLDER_WEBSITES:
            if not re.match(r"^https?://", normalized, re.I):
                normalized = f"https://{normalized}"
            parts.append(f"Website: {normalized}")

    if not parts:
        return None

    text = "\n\n".join(parts)
    if len(text) > DESCRIPTION_MAX:
        text = text[: DESCRIPTION_MAX - 1].rstrip() + "…"
    return text


def next_client_code(db, reserved: set[str]) -> str:
    existing = db.query(Client.code).filter(Client.code.isnot(None)).all()
    numeric_codes: list[int] = []
    for row in existing:
        code_value = row[0] if isinstance(row, (tuple, list)) else row
        if code_value and isinstance(code_value, str) and code_value.isdigit() and len(code_value) == 5:
            numeric_codes.append(int(code_value))

    next_num = (max(numeric_codes) if numeric_codes else 0) + 1
    while True:
        code = f"{next_num:05d}"
        if code in reserved:
            next_num += 1
            continue
        taken = (
            db.query(Client)
            .filter(Client.code == code, Client.deleted_at.is_(None))
            .first()
        )
        if taken:
            next_num += 1
            continue
        reserved.add(code)
        return code


def find_existing_client(db, dataforma_id: Optional[str], company_name: str) -> Optional[Client]:
    if dataforma_id:
        by_df = db.query(Client).filter(Client.dataforma_id == dataforma_id).first()
        if by_df:
            return by_df
    from sqlalchemy import func, or_

    name_l = company_name.lower()
    return (
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


def map_row(row: dict) -> tuple[Optional[dict], Optional[str], list[str], Optional[str], Optional[str]]:
    """
    Map one CSV row to Client fields.
    Returns (client_data, phone, emails, skip_reason, type_remap_note).
    client_data is None when the row should be skipped.
    """
    company_name = normalize_text(row.get("COMPANY NAME"))
    if not company_name:
        return None, None, [], "empty COMPANY NAME", None

    specialty = normalize_text(row.get("SPECIALTY"))
    company_description = normalize_text(row.get("COMPANY DESCRIPTION"))
    company_notes = normalize_text(row.get("COMPANY NOTES"))
    # Header is normalized to uppercase ("Notes" -> "NOTES")
    import_notes = normalize_text(row.get("NOTES"))
    website = normalize_text(row.get("WEBSITE"))

    emails = extract_emails(company_description, company_notes, import_notes)
    phone = normalize_phone(
        row.get("PHONE1 AREACODE") or row.get("PHONE1 A"),
        row.get("PHONE1 #") or row.get("PHONE1"),
    )

    raw_type = normalize_text(row.get("TYPE"))
    client_type = normalize_client_type(raw_type)
    type_note = None
    if raw_type and client_type and raw_type != client_type:
        type_note = f"{raw_type!r} -> {client_type!r}"

    client_data = {
        "name": company_name,
        "display_name": company_name,
        "legal_name": company_name,
        "client_type": client_type,
        "client_status": "Active",
        "dataforma_id": normalize_text(row.get("ALT #")),
        "address_line1": normalize_text(row.get("STREET1") or row.get("STREET")),
        "city": title_city(normalize_text(row.get("CITY")), company_name),
        "province": normalize_province(row.get("STATE")),
        "postal_code": normalize_postal_code(row.get("ZIPCODE") or row.get("POSTAL CODE")),
        "country": "Canada",
        "description": build_description(
            specialty,
            company_description,
            company_notes,
            import_notes,
            website,
        ),
        "billing_same_as_address": True,
    }

    if emails:
        client_data["billing_email"] = emails[0]
        if len(emails) > 1:
            client_data["cc_emails_for_invoices"] = emails[1:]

    client_data = {k: v for k, v in client_data.items() if v is not None}
    return client_data, phone, emails, None, type_note


def import_customers(
    csv_path: str,
    dry_run: bool = False,
    review_log_path: Optional[str] = None,
) -> int:
    if not os.path.exists(csv_path):
        print(f"ERROR: File not found: {csv_path}")
        return 1

    # Dry-run validates mapping only — no DB connection (avoids hanging on remote Postgres).
    db = None if dry_run else SessionLocal()
    created = skipped = errors = 0
    reserved_codes: set[str] = set()
    province_counts: dict[str, int] = {}
    type_counts: dict[str, int] = {}
    type_remaps: dict[str, int] = {}
    created_rows: list[dict] = []
    skipped_rows: list[dict] = []

    try:
        fh, encoding = open_csv(csv_path)
        with fh:
            reader = csv.DictReader(fh)
            if not reader.fieldnames:
                print("ERROR: CSV has no header row")
                return 1

            reader.fieldnames = normalize_headers(reader.fieldnames)
            print(f"Encoding: {encoding}", flush=True)
            print(f"Columns: {', '.join(reader.fieldnames)}", flush=True)
            print(f"\n{'[DRY RUN] ' if dry_run else ''}Starting import...\n", flush=True)

            for row_num, row in enumerate(reader, start=2):
                try:
                    client_data, phone, emails, skip_reason, type_note = map_row(row)
                    if skip_reason or not client_data:
                        print(f"Line {row_num}: skip — {skip_reason or 'unmapped row'}", flush=True)
                        skipped += 1
                        skipped_rows.append(
                            {
                                "line": row_num,
                                "name": normalize_text(row.get("COMPANY NAME")) or "",
                                "reason": skip_reason or "unmapped row",
                            }
                        )
                        continue

                    company_name = client_data["name"]
                    dataforma_id = client_data.get("dataforma_id")

                    if type_note:
                        type_remaps[type_note] = type_remaps.get(type_note, 0) + 1

                    if db is not None:
                        existing = find_existing_client(db, dataforma_id, company_name)
                        if existing:
                            reason = (
                                f"dataforma_id={dataforma_id}"
                                if dataforma_id and existing.dataforma_id == dataforma_id
                                else f"name match (existing code={existing.code})"
                            )
                            print(f"Line {row_num}: skip — '{company_name}' already exists ({reason})", flush=True)
                            skipped += 1
                            skipped_rows.append(
                                {
                                    "line": row_num,
                                    "name": company_name,
                                    "reason": reason,
                                    "existing_code": existing.code or "",
                                }
                            )
                            continue
                        code = next_client_code(db, reserved_codes)
                    else:
                        code = f"DRY-{created + 1:05d}"

                    client_data["code"] = code
                    province = client_data.get("province") or "(none)"
                    province_counts[province] = province_counts.get(province, 0) + 1
                    ctype = client_data.get("client_type") or "(none)"
                    type_counts[ctype] = type_counts.get(ctype, 0) + 1

                    review_row = {
                        "line": row_num,
                        "code": code,
                        "dataforma_id": dataforma_id or "",
                        "name": company_name,
                        "client_type": client_data.get("client_type") or "",
                        "type_remap": type_note or "",
                        "city": client_data.get("city") or "",
                        "province": client_data.get("province") or "",
                        "postal_code": client_data.get("postal_code") or "",
                        "phone": phone or "",
                        "billing_email": client_data.get("billing_email") or "",
                        "address_line1": client_data.get("address_line1") or "",
                    }

                    if dry_run:
                        created += 1
                        created_rows.append(review_row)
                        remap = f" (remapped {type_note})" if type_note else ""
                        print(f"Line {row_num}: [DRY RUN] would create '{company_name}'{remap}", flush=True)
                        print(
                            f"         type={client_data.get('client_type')!r} "
                            f"province={client_data.get('province')!r} "
                            f"city={client_data.get('city')!r} "
                            f"postal={client_data.get('postal_code')!r}",
                            flush=True,
                        )
                        print(
                            f"         phone={phone!r} "
                            f"billing_email={client_data.get('billing_email')!r} "
                            f"emails={emails}",
                            flush=True,
                        )
                        continue

                    client = Client(**client_data)
                    db.add(client)
                    db.flush()

                    if phone:
                        db.add(
                            ClientContact(
                                client_id=client.id,
                                name=company_name,
                                phone=phone,
                                email=emails[0] if emails else None,
                                is_primary=True,
                                sort_index=0,
                            )
                        )

                    db.commit()
                    created += 1
                    created_rows.append(review_row)
                    print(
                        f"Line {row_num}: [OK] created '{company_name}' "
                        f"(code={code}, dataforma_id={dataforma_id})",
                        flush=True,
                    )

                except Exception as e:
                    errors += 1
                    print(f"Line {row_num}: [ERROR] {e}", flush=True)
                    if db is not None:
                        db.rollback()

        print("\n" + "=" * 60, flush=True)
        print("Import finished" + (" (dry-run, no DB writes)" if dry_run else ""), flush=True)
        print(f"  Created: {created}", flush=True)
        print(f"  Skipped: {skipped}", flush=True)
        print(f"  Errors:  {errors}", flush=True)
        if type_remaps:
            print("  Type remaps:", flush=True)
            for note, count in sorted(type_remaps.items(), key=lambda x: (-x[1], x[0])):
                print(f"    {note}: {count}", flush=True)
        if type_counts:
            print("  Types (after normalize):", flush=True)
            for name, count in sorted(type_counts.items(), key=lambda x: (-x[1], x[0])):
                print(f"    {name}: {count}", flush=True)
        if province_counts:
            print("  Provinces:", flush=True)
            for name, count in sorted(province_counts.items(), key=lambda x: (-x[1], x[0])):
                print(f"    {name}: {count}", flush=True)
        print("=" * 60, flush=True)

        if review_log_path:
            write_review_log(
                review_log_path,
                created_rows=created_rows,
                skipped_rows=skipped_rows,
                dry_run=dry_run,
                source_csv=csv_path,
                created=created,
                skipped=skipped,
                errors=errors,
            )
            print(f"\nReview log written to: {review_log_path}", flush=True)

        return 1 if errors else 0

    except Exception as e:
        print(f"ERROR: {e}", flush=True)
        if db is not None:
            db.rollback()
        return 1
    finally:
        if db is not None:
            db.close()


def write_review_log(
    path: str,
    *,
    created_rows: list[dict],
    skipped_rows: list[dict],
    dry_run: bool,
    source_csv: str,
    created: int,
    skipped: int,
    errors: int,
) -> None:
    os.makedirs(os.path.dirname(os.path.abspath(path)) or ".", exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="") as fh:
        fh.write("DataForma 2026 customer import — manual review log\n")
        fh.write(f"Source CSV: {source_csv}\n")
        fh.write(f"Mode: {'DRY RUN' if dry_run else 'LIVE IMPORT'}\n")
        fh.write(f"Created: {created}\n")
        fh.write(f"Skipped: {skipped}\n")
        fh.write(f"Errors: {errors}\n")
        fh.write("\n")

        fh.write("=" * 80 + "\n")
        fh.write("CREATED CUSTOMERS (verify manually)\n")
        fh.write("=" * 80 + "\n")
        if not created_rows:
            fh.write("(none)\n")
        else:
            for i, row in enumerate(created_rows, start=1):
                fh.write(
                    f"{i:3d}. [{row.get('code')}] {row.get('name')}\n"
                    f"     type={row.get('client_type')}"
                    + (f"  remap={row.get('type_remap')}" if row.get("type_remap") else "")
                    + f"\n"
                    f"     address={row.get('address_line1')}, {row.get('city')}, "
                    f"{row.get('province')} {row.get('postal_code')}\n"
                    f"     phone={row.get('phone') or '-'}  "
                    f"billing_email={row.get('billing_email') or '-'}  "
                    f"dataforma_id={row.get('dataforma_id') or '-'}\n"
                )

        fh.write("\n")
        fh.write("=" * 80 + "\n")
        fh.write("SKIPPED (already existed or invalid)\n")
        fh.write("=" * 80 + "\n")
        if not skipped_rows:
            fh.write("(none)\n")
        else:
            for i, row in enumerate(skipped_rows, start=1):
                fh.write(
                    f"{i:3d}. {row.get('name') or '(no name)'}\n"
                    f"     reason={row.get('reason')}\n"
                )

        # Also emit a simple name-only checklist for quick review.
        fh.write("\n")
        fh.write("=" * 80 + "\n")
        fh.write("CREATED NAMES CHECKLIST\n")
        fh.write("=" * 80 + "\n")
        for row in created_rows:
            fh.write(f"[ ] {row.get('name')}\n")


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Import cleaned DataForma 2026 customers into MKHub"
    )
    parser.add_argument("csv_path", help="Path to Data_Forma_Customer_2026_Cleaned CSV")
    parser.add_argument(
        "--dry-run",
        "-d",
        action="store_true",
        help="Parse/map CSV only (no database connection or writes)",
    )
    parser.add_argument(
        "--log",
        dest="review_log",
        help="Path for the manual-review log of created/skipped customers",
    )
    args = parser.parse_args()

    review_log = args.review_log
    if not review_log:
        ts = __import__("datetime").datetime.now().strftime("%Y%m%d_%H%M%S")
        mode = "dryrun" if args.dry_run else "live"
        review_log = os.path.join(
            "var",
            "imports",
            f"dataforma_customers_2026_{mode}_{ts}_review.log",
        )

    return import_customers(
        args.csv_path,
        dry_run=args.dry_run,
        review_log_path=review_log,
    )


if __name__ == "__main__":
    raise SystemExit(main())
