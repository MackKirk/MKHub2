"""
Run data migration steps for Construction vs Repairs & Maintenance (business_line).

Order is safe for production:
1. seed_project_divisions — upsert divisions/subdivisions by label; preserves existing SettingItem ids.
2. seed_business_permissions — upsert PermissionDefinition by key; preserves existing ids.
3. migrate_business_line_permissions — copy legacy business:projects:* flags into line-specific keys on roles/users.
4. apply_projects_business_line — add projects.business_line if missing, backfill, index (idempotent).
Usage (from repo root):
  python scripts/run_business_line_data_migration.py
"""
import importlib.util
import os
import sys

_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, _ROOT)

try:
    from dotenv import load_dotenv
    load_dotenv()
except Exception:
    pass


def _load_script_module(name: str, filename: str):
    path = os.path.join(os.path.dirname(__file__), filename)
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise ImportError(f"Cannot load {path}")
    mod = importlib.util.module_from_spec(spec)
    sys.modules[name] = mod
    spec.loader.exec_module(mod)
    return mod


def main():
    pd = _load_script_module("seed_project_divisions_impl", "seed_project_divisions.py")
    bp = _load_script_module("seed_business_permissions_impl", "seed_business_permissions.py")
    ml = _load_script_module("migrate_business_line_permissions_impl", "migrate_business_line_permissions.py")

    print("=== 1/3 seed_project_divisions (ids preserved) ===")
    pd.seed_project_divisions()
    print("\n=== 2/3 seed_business_permissions (ids preserved) ===")
    bp.seed_business_permissions()
    print("\n=== 3/3 migrate_business_line_permissions (JSON only) ===")
    ml.run()
    print("\n=== 4/4 apply_projects_business_line (column + backfill, idempotent) ===")
    apl = _load_script_module("apply_projects_business_line_impl", "apply_projects_business_line.py")
    apl.run()
    print("\nAll steps done.")


if __name__ == "__main__":
    main()
