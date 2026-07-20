"""
Script para adicionar permissões de Business com estrutura hierárquica.
business:access is deprecated (kept in DB for FK safety, is_active=False).
Granular permissions (customers, projects, construction, R&M, etc.) control access.

IMPORTANT (production-safe):
- Rows are matched by PermissionDefinition.key (unique). Existing rows keep the same primary key (id);
  only label, description, sort_index, category_id, is_active are updated.
- Never delete/recreate definitions here, so FKs from roles and templates that reference id stay valid.
"""
import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Load environment variables first
try:
    from dotenv import load_dotenv
    load_dotenv()
except Exception as e:
    print(f"WARNING: Could not load .env file: {e}")

# Check database type before importing
database_url = os.getenv("DATABASE_URL", "sqlite:///./var/dev.db")

if database_url.startswith("postgresql"):
    try:
        import psycopg2
    except ImportError:
        print("ERROR: PostgreSQL database detected but psycopg2 is not installed.")
        sys.exit(1)

try:
    from app.db import SessionLocal
    from app.models.models import PermissionCategory, PermissionDefinition
except ImportError as e:
    print(f"ERROR: Failed to import database components: {e}")
    sys.exit(1)


def seed_business_permissions():
    """Seed Business permissions with hierarchical structure"""
    db = SessionLocal()
    
    try:
        # Create or get Business category
        category = db.query(PermissionCategory).filter(PermissionCategory.name == "business").first()
        if category:
            print(f"Category 'business' already exists, updating...")
            category.label = "Business"
            category.description = "Permissions for Business area. Blocking access blocks all sub-permissions."
            category.is_active = True
        else:
            category = PermissionCategory(
                name="business",
                label="Business",
                description="Permissions for Business area. Blocking access blocks all sub-permissions.",
                sort_index=1,  # First category
            )
            db.add(category)
        
        db.flush()  # To get the category ID
        
        # Define Business permissions (granular; business:access deprecated)
        business_permissions = [
            {
                "key": "business:access",
                "label": "Access Business",
                "description": "Deprecated. No longer shown in the UI; use granular Business permissions instead.",
                "sort_index": 1,
            },
            # Customers
            {
                "key": "business:customers:read",
                "label": "Customers",
                "description": "Allows viewing the customers list and opening customer records",
                "sort_index": 2,
            },
            {
                "key": "business:customers:write",
                "label": "Customers (create/delete)",
                "description": "Allows creating and deleting customer records",
                "sort_index": 3,
            },
            {
                "key": "business:customers:overview:read",
                "label": "Overview",
                "description": "Allows viewing the customer Overview tab (dashboard and participation summary)",
                "sort_index": 31,
            },
            {
                "key": "business:customers:general:read",
                "label": "General",
                "description": "Allows viewing the customer General tab (profile and settings)",
                "sort_index": 32,
            },
            {
                "key": "business:customers:general:write",
                "label": "General",
                "description": "Allows editing customer profile on the General tab",
                "sort_index": 33,
            },
            {
                "key": "business:customers:contacts:read",
                "label": "Contacts",
                "description": "Allows viewing customer contacts",
                "sort_index": 34,
            },
            {
                "key": "business:customers:contacts:write",
                "label": "Contacts",
                "description": "Allows creating, updating, and deleting customer contacts",
                "sort_index": 35,
            },
            {
                "key": "business:customers:files:read",
                "label": "Files",
                "description": "Allows viewing customer files, folders, and documents",
                "sort_index": 36,
            },
            {
                "key": "business:customers:files:write",
                "label": "Files",
                "description": "Allows uploading and managing customer files and folders",
                "sort_index": 37,
            },
            {
                "key": "business:customers:sites:read",
                "label": "Sites",
                "description": "Allows viewing customer construction sites",
                "sort_index": 38,
            },
            {
                "key": "business:customers:sites:write",
                "label": "Sites",
                "description": "Allows creating, updating, and deleting customer sites",
                "sort_index": 39,
            },
            {
                "key": "business:customers:opportunities:read",
                "label": "Opportunities",
                "description": "Allows viewing opportunities linked to the customer",
                "sort_index": 40,
            },
            {
                "key": "business:customers:opportunities:write",
                "label": "Opportunities",
                "description": "Allows creating opportunities from the customer page",
                "sort_index": 41,
            },
            {
                "key": "business:customers:projects:read",
                "label": "Projects",
                "description": "Allows viewing projects linked to the customer",
                "sort_index": 42,
            },
            {
                "key": "business:customers:projects:write",
                "label": "Projects",
                "description": "Allows creating projects from the customer page",
                "sort_index": 43,
            },
            # Projects & Opportunities
            {
                "key": "business:projects:read",
                "label": "View Projects & Opportunities",
                "description": "Allows viewing projects and opportunities list and details",
                "sort_index": 4,
            },
            {
                "key": "business:projects:write",
                "label": "Edit Projects & Opportunities",
                "description": "Allows creating, updating, and deleting projects and opportunities",
                "sort_index": 5,
            },
            {
                "key": "business:construction:projects:read",
                "label": "View Projects & Opportunities (Construction)",
                "description": "Allows viewing construction line projects and opportunities",
                "sort_index": 24,
            },
            {
                "key": "business:construction:projects:write",
                "label": "Edit Projects & Opportunities (Construction)",
                "description": "Allows creating, updating, and deleting construction line projects and opportunities",
                "sort_index": 25,
            },
            {
                "key": "business:rm:projects:read",
                "label": "View Projects & Opportunities (Repairs & Maintenance)",
                "description": "Allows viewing Repairs & Maintenance line projects and opportunities",
                "sort_index": 26,
            },
            {
                "key": "business:rm:projects:write",
                "label": "Edit Projects & Opportunities (Repairs & Maintenance)",
                "description": "Allows creating, updating, and deleting Repairs & Maintenance projects and opportunities",
                "sort_index": 27,
            },
            {
                "key": "business:construction:projects:read:all",
                "label": "View All Projects & Opportunities (Construction)",
                "description": "Allows viewing all construction projects and opportunities regardless of direct assignment",
                "sort_index": 28,
            },
            {
                "key": "business:rm:projects:read:all",
                "label": "View All Projects & Opportunities (Repairs & Maintenance)",
                "description": "Allows viewing all Repairs & Maintenance projects and opportunities regardless of direct assignment",
                "sort_index": 29,
            },
            {
                "key": "business:projects:members:write",
                "label": "Manage Project Members",
                "description": "Allows adding and removing project members from project detail",
                "sort_index": 30,
            },
            # Projects - Sub-permissions
            {
                "key": "business:projects:reports:read",
                "label": "View Notes/History",
                "description": "Allows viewing the Notes/History tab in project and opportunity details",
                "sort_index": 6,
            },
            {
                "key": "business:projects:reports:write",
                "label": "Edit Notes/History",
                "description": "Allows creating, editing, and deleting notes in the Notes/History tab",
                "sort_index": 7,
            },
            {
                "key": "business:projects:workload:read",
                "label": "View Workload",
                "description": "Allows viewing the Workload tab in project details",
                "sort_index": 8,
            },
            {
                "key": "business:projects:workload:write",
                "label": "Edit Workload",
                "description": "Allows editing the Workload tab in project details",
                "sort_index": 9,
            },
            {
                "key": "business:projects:timesheet:read",
                "label": "View Timesheet",
                "description": "Allows viewing the Timesheet tab in project details",
                "sort_index": 10,
            },
            {
                "key": "business:projects:timesheet:write",
                "label": "Edit Timesheet",
                "description": "Allows editing the Timesheet tab in project details",
                "sort_index": 11,
            },
            {
                "key": "business:projects:files:read",
                "label": "View Files",
                "description": "Allows viewing the Files tab in project details",
                "sort_index": 12,
            },
            {
                "key": "business:projects:files:write",
                "label": "Edit Files",
                "description": "Allows editing the Files tab in project details",
                "sort_index": 13,
            },
            {
                "key": "business:projects:documents:read",
                "label": "View Documents",
                "description": "Allows viewing the Documents tab in project and opportunity details",
                "sort_index": 14,
            },
            {
                "key": "business:projects:documents:write",
                "label": "Edit Documents",
                "description": "Allows editing the Documents tab in project and opportunity details",
                "sort_index": 15,
            },
            {
                "key": "business:projects:proposal:read",
                "label": "View Proposal",
                "description": "Allows viewing the Proposal tab in project details",
                "sort_index": 16,
            },
            {
                "key": "business:projects:proposal:write",
                "label": "Edit Proposal",
                "description": "Allows editing the Proposal tab in project details",
                "sort_index": 17,
            },
            {
                "key": "business:projects:costs:read",
                "label": "View Costs",
                "description": "Allows viewing the Costs tab in project and opportunity details",
                "sort_index": 18,
            },
            {
                "key": "business:projects:costs:write",
                "label": "Edit Costs",
                "description": "Allows editing project costs and budgets",
                "sort_index": 19,
            },
            {
                "key": "business:projects:safety:read",
                "label": "View Safety",
                "description": "Allows viewing the Safety tab in project details (awarded projects only)",
                "sort_index": 22,
            },
            {
                "key": "business:projects:safety:write",
                "label": "Edit Safety",
                "description": "Allows creating and editing safety inspections in the Safety tab (awarded projects only)",
                "sort_index": 23,
            },
        ]

        # Per business line (Production / R&M): same sub-permissions as legacy business:projects:* 
        line_sub_features = [
            ("reports", "Notes/History", "Notes/History tab in project and opportunity details"),
            ("workload", "Workload", "Workload tab in project details"),
            ("timesheet", "Timesheet", "Timesheet tab in project details"),
            ("files", "Files", "Files tab in project details"),
            ("documents", "Documents", "Documents tab in project and opportunity details"),
            ("proposal", "Proposal", "Proposal tab in project details"),
            ("costs", "Costs", "Costs tab in project and opportunity details"),
            ("safety", "Safety", "Safety tab in project details (awarded projects only)"),
        ]
        line_defs = [
            ("business:construction:projects", 50),
            ("business:rm:projects", 70),
        ]
        sort = 80
        for prefix, base_sort in line_defs:
            for feat, label, desc in line_sub_features:
                business_permissions.append({
                    "key": f"{prefix}:{feat}:read",
                    "label": f"View {label}",
                    "description": f"Allows viewing the {desc}",
                    "sort_index": sort,
                })
                sort += 1
                business_permissions.append({
                    "key": f"{prefix}:{feat}:write",
                    "label": f"Edit {label}",
                    "description": f"Allows editing the {desc}",
                    "sort_index": sort,
                })
                sort += 1
            business_permissions.append({
                "key": f"{prefix}:members:write",
                "label": "Manage Project Members",
                "description": "Allows adding and removing project members from project detail",
                "sort_index": base_sort + 19,
            })
        
        for perm_data in business_permissions:
            # Find or create permission
            permission = db.query(PermissionDefinition).filter(PermissionDefinition.key == perm_data["key"]).first()
            if permission:
                # Update existing permission
                permission.category_id = category.id
                permission.label = perm_data["label"]
                permission.description = perm_data.get("description")
                permission.sort_index = perm_data["sort_index"]
                permission.is_active = perm_data["key"] != "business:access"
                print(f"Updated permission: {perm_data['key']}" + (" (inactive)" if not permission.is_active else ""))
            else:
                # Create new permission
                permission = PermissionDefinition(
                    category_id=category.id,
                    key=perm_data["key"],
                    label=perm_data["label"],
                    description=perm_data.get("description"),
                    sort_index=perm_data["sort_index"],
                    is_active=perm_data["key"] != "business:access",
                )
                db.add(permission)
                print(f"Created permission: {perm_data['key']}" + (" (inactive)" if not permission.is_active else ""))
        
        # Removed tabs — deactivate any existing permission rows
        retired_sub_features = ("estimate", "orders")
        line_prefixes = (
            "business:projects",
            "business:construction:projects",
            "business:rm:projects",
        )
        for prefix in line_prefixes:
            for feat in retired_sub_features:
                for action in ("read", "write"):
                    key = f"{prefix}:{feat}:{action}"
                    perm = (
                        db.query(PermissionDefinition)
                        .filter(PermissionDefinition.key == key)
                        .first()
                    )
                    if perm and perm.is_active:
                        perm.is_active = False
                        print(f"Deactivated permission: {key}")

        db.commit()
        print(f"\nSuccessfully seeded Business permissions!")
        print(f"Total permissions: {len(business_permissions)}")
        
    except Exception as e:
        db.rollback()
        print(f"Error seeding Business permissions: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed_business_permissions()

