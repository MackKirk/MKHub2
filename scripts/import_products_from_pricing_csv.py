"""
Import inventory products from the 2026 pricing spreadsheet CSV.

Sources suppliers from section headers (not product categories):
  - "Convoy Products"  -> Convoy
  - "Proline Products" -> Proline
  - "White Cap"        -> White Cap

Rules:
  - price           <- Cost column (strip $ / spaces); must be > 0
  - description     <- "Code: {code}" (+ optional LF coverage note)
  - unit            <- Quantity column
  - unit_type       <- from Unit column (SQFT/EA/LF)
  - coverage_ft2    <- Coverage when Unit is SQFT
  - Duplicate names within the same supplier get a "(Quantity)" suffix
  - Existing materials are updated (match by Code in description, else name+supplier)
  - Missing suppliers are created

Usage:
    python scripts/import_products_from_pricing_csv.py <path_to_csv> [--dry-run]

Example:
    python scripts/import_products_from_pricing_csv.py ^
      "C:\\Users\\fernando\\Downloads\\Open Work Orders - Tracking Spreadsheet(2026 Pricing)(in).csv" ^
      --dry-run
"""
from __future__ import annotations

import argparse
import csv
import os
import re
import sys
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Optional

# Add parent directory to path
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
    from sqlalchemy import func

    from app.db import SessionLocal
    from app.models.models import Material, Supplier
except ImportError as e:
    print(f"ERROR: Failed to import database components: {e}")
    sys.exit(1)


SUPPLIER_HEADERS = {
    "Convoy Products": "Convoy",
    "Proline Products": "Proline",
    "White Cap": "White Cap",
}

CODE_PREFIX = "Code:"
FORMULA_NOISE = {"#DIV/0!", "#VALUE!", "#N/A", "#REF!"}


@dataclass
class ParsedProduct:
    supplier: str
    raw_name: str
    name: str
    code: str
    price: float
    quantity: str
    coverage_raw: str
    unit_col: str
    unit_type: str
    coverage_ft2: Optional[float] = None
    description: str = ""
    row_num: int = 0
    warnings: list[str] = field(default_factory=list)


def normalize_text(value) -> str:
    if value is None:
        return ""
    return str(value).strip()


def parse_price(raw: str) -> Optional[float]:
    text = normalize_text(raw)
    if not text or text in FORMULA_NOISE:
        return None
    text = text.replace("$", "").replace(",", "").strip()
    try:
        value = float(text)
    except ValueError:
        return None
    if value <= 0:
        return None
    return value


def parse_coverage_number(raw: str) -> Optional[float]:
    text = normalize_text(raw)
    if not text or text in FORMULA_NOISE:
        return None
    # Allow values like "164'" by stripping trailing quotes/units noise? Prefer plain numbers.
    text = text.replace(",", "").strip()
    # Strip trailing length markers like '
    text = re.sub(r"['\"]$", "", text).strip()
    try:
        return float(text)
    except ValueError:
        return None


def is_header_row(cells: list[str]) -> bool:
    if not cells:
        return False
    first = cells[0]
    joined = " ".join(cells).lower()
    if first == "Material Price List":
        return True
    if "upcharge" in joined and "cost" in joined:
        return True
    if first in SUPPLIER_HEADERS:
        return True
    # Column header rows right under a supplier block
    if first in ("Convoy Products",) or "Convoy Code" in first:
        return True
    second = cells[1] if len(cells) > 1 else ""
    if second in ("Code", " Code", "Convoy Code") or second.strip() == "Code":
        return True
    return False


def build_description(code: str, unit_col: str, coverage_value: Optional[float]) -> str:
    parts = [f"{CODE_PREFIX} {code}"]
    if unit_col.upper() == "LF" and coverage_value is not None:
        # Format without trailing .0 when integer
        cov = int(coverage_value) if coverage_value == int(coverage_value) else coverage_value
        parts.append(f"Coverage: {cov} LF")
    return " | ".join(parts)


def map_unit_and_coverage(
    unit_col: str, coverage_raw: str
) -> tuple[str, Optional[float], Optional[float], list[str]]:
    """Return unit_type, coverage_ft2, coverage_parsed_for_notes, warnings."""
    warnings: list[str] = []
    unit_norm = normalize_text(unit_col).upper()
    coverage_value = parse_coverage_number(coverage_raw)

    if unit_norm == "SQFT":
        if coverage_value is not None:
            return "coverage", coverage_value, coverage_value, warnings
        warnings.append("SQFT without numeric Coverage; using unitary")
        return "unitary", None, None, warnings

    if unit_norm == "EA":
        return "unitary", None, coverage_value, warnings

    if unit_norm == "LF":
        return "unitary", None, coverage_value, warnings

    if unit_norm:
        warnings.append(f"Unknown Unit '{unit_col}'; using unitary")
    return "unitary", None, coverage_value, warnings


def parse_csv(csv_path: str) -> list[ParsedProduct]:
    if not os.path.exists(csv_path):
        print(f"ERROR: File not found: {csv_path}")
        sys.exit(1)

    current_supplier: Optional[str] = None
    raw_rows: list[ParsedProduct] = []

    with open(csv_path, newline="", encoding="utf-8-sig") as f:
        reader = csv.reader(f)
        for row_num, row in enumerate(reader, start=1):
            cells = [normalize_text(c) for c in row]
            if not any(cells):
                continue

            first = cells[0]
            if first in SUPPLIER_HEADERS:
                current_supplier = SUPPLIER_HEADERS[first]
                continue

            if is_header_row(cells):
                continue

            if not current_supplier:
                continue

            name = first
            code = cells[1] if len(cells) > 1 else ""
            cost_raw = cells[2] if len(cells) > 2 else ""
            quantity = cells[3] if len(cells) > 3 else ""
            coverage_raw = cells[4] if len(cells) > 4 else ""
            unit_col = cells[5] if len(cells) > 5 else ""

            if not name or not code:
                continue
            # Skip stray header fragments
            if code.strip().lower() in ("code", "convoy code"):
                continue

            price = parse_price(cost_raw)
            if price is None:
                print(
                    f"Row {row_num}: SKIP - invalid/missing Cost for '{name}' ({code}): {cost_raw!r}"
                )
                continue

            unit_type, coverage_ft2, coverage_for_notes, warnings = map_unit_and_coverage(
                unit_col, coverage_raw
            )
            description = build_description(code, unit_col, coverage_for_notes if unit_col.upper() == "LF" else None)

            raw_rows.append(
                ParsedProduct(
                    supplier=current_supplier,
                    raw_name=name,
                    name=name,  # resolved in second pass
                    code=code,
                    price=price,
                    quantity=quantity,
                    coverage_raw=coverage_raw,
                    unit_col=unit_col,
                    unit_type=unit_type,
                    coverage_ft2=coverage_ft2,
                    description=description,
                    row_num=row_num,
                    warnings=warnings,
                )
            )

    # Second pass: disambiguate duplicate names with Quantity suffix
    counts: dict[tuple[str, str], int] = defaultdict(int)
    for p in raw_rows:
        counts[(p.supplier, p.raw_name.lower())] += 1

    for p in raw_rows:
        if counts[(p.supplier, p.raw_name.lower())] > 1 and p.quantity:
            p.name = f"{p.raw_name} ({p.quantity})"
        else:
            p.name = p.raw_name

    # Detect remaining name collisions after suffix
    final_names: dict[tuple[str, str], list[ParsedProduct]] = defaultdict(list)
    for p in raw_rows:
        final_names[(p.supplier, p.name.lower())].append(p)
    for key, group in final_names.items():
        if len(group) > 1:
            for p in group:
                p.warnings.append(
                    f"Name collision after suffix: '{p.name}' codes={[g.code for g in group]}"
                )

    return raw_rows


def ensure_suppliers(db, supplier_names: set[str], dry_run: bool) -> dict[str, str]:
    """Ensure suppliers exist; return map of canonical name -> action (exists|created)."""
    actions: dict[str, str] = {}
    for name in sorted(supplier_names):
        existing = (
            db.query(Supplier)
            .filter(func.lower(Supplier.name) == name.lower())
            .first()
        )
        if existing:
            actions[name] = f"exists ({existing.id})"
            continue
        actions[name] = "created"
        if dry_run:
            continue
        row = Supplier(name=name, is_active=True, status="active")
        db.add(row)
        db.flush()
        actions[name] = f"created ({row.id})"
    return actions


def extract_code_from_description(description: Optional[str]) -> Optional[str]:
    if not description:
        return None
    m = re.search(r"code:\s*([^\s|]+)", description, flags=re.IGNORECASE)
    return m.group(1).strip() if m else None


def find_existing_material(db, product: ParsedProduct) -> Optional[Material]:
    # Prefer match by Code in description for same supplier
    candidates = (
        db.query(Material)
        .filter(Material.supplier_name.isnot(None))
        .filter(func.lower(Material.supplier_name) == product.supplier.lower())
        .filter(Material.description.isnot(None))
        .all()
    )
    for row in candidates:
        existing_code = extract_code_from_description(row.description)
        if existing_code and existing_code.lower() == product.code.lower():
            return row

    # Fallback: name + supplier
    return (
        db.query(Material)
        .filter(Material.supplier_name.isnot(None))
        .filter(func.lower(Material.name) == product.name.lower())
        .filter(func.lower(Material.supplier_name) == product.supplier.lower())
        .first()
    )


def apply_material_fields(row: Material, product: ParsedProduct, *, is_create: bool) -> None:
    row.name = product.name
    row.supplier_name = product.supplier
    row.unit = product.quantity or None
    row.price = product.price
    row.description = product.description
    row.unit_type = product.unit_type
    if product.unit_type == "coverage":
        row.coverage_ft2 = product.coverage_ft2
        row.coverage_sqs = None
        row.coverage_m2 = None
    else:
        row.coverage_ft2 = None
        row.coverage_sqs = None
        row.coverage_m2 = None
    if product.unit_type != "multiple":
        row.units_per_package = None
    row.last_updated = datetime.now(timezone.utc)
    if is_create:
        row.category = None


def import_products(csv_path: str, dry_run: bool = False) -> int:
    products = parse_csv(csv_path)
    if not products:
        print("ERROR: No product rows parsed from CSV.")
        return 1

    print(f"Parsed {len(products)} product row(s) from CSV")
    print(f"{'[DRY RUN] ' if dry_run else ''}Starting import...\n")

    db = SessionLocal()
    created = 0
    updated = 0
    skipped = 0
    errors = 0

    try:
        supplier_names = {p.supplier for p in products}
        supplier_actions = ensure_suppliers(db, supplier_names, dry_run=dry_run)
        print("Suppliers:")
        for name, action in supplier_actions.items():
            print(f"  - {name}: {action}")
        print()

        # Pre-check unique names within this import batch
        seen_batch: dict[tuple[str, str], ParsedProduct] = {}
        for product in products:
            key = (product.supplier.lower(), product.name.lower())
            if key in seen_batch:
                print(
                    f"Row {product.row_num}: ERROR - duplicate final name in CSV "
                    f"'{product.name}' / {product.supplier} (codes {seen_batch[key].code} & {product.code})"
                )
                errors += 1
                continue
            seen_batch[key] = product

            for w in product.warnings:
                print(f"Row {product.row_num}: WARNING - {w}")

            try:
                if dry_run:
                    existing = find_existing_material(db, product)
                    action = "UPDATE" if existing else "CREATE"
                    print(
                        f"Row {product.row_num}: [{action}] {product.supplier} | {product.name} | "
                        f"code={product.code} | price={product.price} | unit={product.quantity!r} | "
                        f"unit_type={product.unit_type} | coverage_ft2={product.coverage_ft2}"
                    )
                    if existing:
                        updated += 1
                    else:
                        created += 1
                    continue

                existing = find_existing_material(db, product)
                if existing:
                    apply_material_fields(existing, product, is_create=False)
                    updated += 1
                    print(
                        f"Row {product.row_num}: UPDATED id={existing.id} | {product.supplier} | {product.name}"
                    )
                else:
                    # Guard uniqueness before create
                    clash = (
                        db.query(Material)
                        .filter(Material.supplier_name.isnot(None))
                        .filter(func.lower(Material.name) == product.name.lower())
                        .filter(func.lower(Material.supplier_name) == product.supplier.lower())
                        .first()
                    )
                    if clash:
                        print(
                            f"Row {product.row_num}: SKIP - name+supplier clash with id={clash.id} "
                            f"but code did not match (existing desc={clash.description!r})"
                        )
                        skipped += 1
                        continue
                    row = Material()
                    apply_material_fields(row, product, is_create=True)
                    db.add(row)
                    db.flush()
                    created += 1
                    print(
                        f"Row {product.row_num}: CREATED id={row.id} | {product.supplier} | {product.name}"
                    )
            except Exception as e:
                errors += 1
                print(f"Row {product.row_num}: ERROR - {product.name}: {e}")
                db.rollback()
                # reopen transactional state: continue with fresh flush path
                if not dry_run:
                    # After rollback we lose supplier inserts; re-ensure for remaining rows
                    ensure_suppliers(db, supplier_names, dry_run=False)

        if dry_run:
            db.rollback()
        else:
            db.commit()

        print("\n" + "=" * 60)
        print(f"{'[DRY RUN] ' if dry_run else ''}Import complete")
        print(f"  Created: {created}")
        print(f"  Updated: {updated}")
        print(f"  Skipped: {skipped}")
        print(f"  Errors:  {errors}")
        print("=" * 60)
        return 1 if errors else 0
    except Exception as e:
        db.rollback()
        print(f"FATAL: {e}")
        return 1
    finally:
        db.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Import products from 2026 pricing CSV")
    parser.add_argument("csv_path", help="Path to the pricing CSV file")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Parse and report without writing to the database",
    )
    args = parser.parse_args()
    raise SystemExit(import_products(args.csv_path, dry_run=args.dry_run))


if __name__ == "__main__":
    main()
