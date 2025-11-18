import os
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from prometheus_fastapi_instrumentator import Instrumentator
from slowapi import Limiter
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from .config import settings
from fastapi.responses import RedirectResponse, FileResponse
from .db import Base, engine, SessionLocal
from sqlalchemy import text
from .logging import setup_logging, RequestIdMiddleware
from .auth.router import router as auth_router
from .routes.files import router as files_router
from .routes.projects import router as projects_router
from .routes.clients import router as clients_router
from .routes.employees import router as employees_router
from .routes.calendar import router as calendar_router
from .routes.settings import router as settings_router
from .routes.inventory import router as inventory_router
from .routes.integrations import router as integrations_router
from .routes.proposals import router as proposals_router
from .routes.users import router as users_router
from .routes.estimate import router as estimate_router
from .routes.reviews import router as reviews_router
from .routes.chat import router as chat_router
from .routes.notifications import router as notifications_router
from .routes.company_files import router as company_files_router
from .routes.orders import router as orders_router
<<<<<<< HEAD
from .routes.task_requests import router as task_requests_router
from .routes.tasks_v2 import router as tasks_router
from .routes.community import router as community_router
=======
from .routes.employee_management import router as employee_management_router
from .routes.permissions import router as permissions_router
from .routes.fleet import router as fleet_router
>>>>>>> 5950ecbf7e178ffd3d822a932a0eee030aae00c4


def create_app() -> FastAPI:
    setup_logging()
    app = FastAPI(title=settings.app_name)

    # Middlewares
    app.add_middleware(RequestIdMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    limiter = Limiter(key_func=get_remote_address, default_limits=[settings.rate_limit])
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, lambda r, e: e)
    app.add_middleware(SlowAPIMiddleware)

    # Routers
    app.include_router(auth_router)
    app.include_router(files_router)
    app.include_router(projects_router)
    app.include_router(clients_router)
    app.include_router(employees_router)
    app.include_router(calendar_router)
    app.include_router(settings_router)
    app.include_router(integrations_router)
    app.include_router(inventory_router)
    app.include_router(proposals_router)
    app.include_router(users_router)
    app.include_router(estimate_router)
    app.include_router(reviews_router)
    app.include_router(chat_router)
    app.include_router(notifications_router)
    app.include_router(task_requests_router)
    app.include_router(tasks_router)
    app.include_router(community_router)
    app.include_router(company_files_router)
    app.include_router(orders_router)
    app.include_router(employee_management_router)
    app.include_router(permissions_router)
    app.include_router(fleet_router)
    from .routes import dispatch
    app.include_router(dispatch.router)
    # Legacy UI redirects to new React routes (exact paths)
    legacy_map = {
        "/ui/login.html": "/login",
        "/ui/home.html": "/home",
        "/ui/profile.html": "/profile",
        "/ui/customers.html": "/customers",
        "/ui/users.html": "/customers",
        "/ui/inventory.html": "/inventory",
        "/ui/inventory-products.html": "/inventory",
        "/ui/inventory-suppliers.html": "/inventory",
        "/ui/inventory-orders.html": "/inventory",
        "/ui/proposals.html": "/proposals",
    }

    for old_path, new_path in legacy_map.items():
        @app.get(old_path)  # type: ignore[misc]
        def _redir(new_path=new_path):  # default binds current value
            return RedirectResponse(url=new_path)

    # Static UI (legacy)
    app.mount("/ui", StaticFiles(directory="app/ui", html=True), name="ui")
    # React frontend (SPA) - fallback router that serves index.html for unknown paths
    FRONT_DIST = os.path.join("frontend", "dist")

    # Metrics
    Instrumentator().instrument(app).expose(app)

    # Serve SPA index.html on hard reloads for HTML requests (avoid hitting JSON APIs)
    @app.middleware("http")
    async def spa_html_middle(request, call_next):
        try:
            accept = request.headers.get("accept", "")
            path = request.url.path or "/"
            if "text/html" in accept and request.method == "GET":
                # Allowlist actual non-SPA paths
                if not (path.startswith("/api") or path.startswith("/auth") or path.startswith("/files") or path.startswith("/ui") or path.startswith("/assets") or path in {"/favicon.ico","/robots.txt","/metrics"}):
                    if os.path.isdir(FRONT_DIST):
                        index_path = os.path.join(FRONT_DIST, "index.html")
                        if os.path.exists(index_path):
                            return FileResponse(index_path, headers={"Cache-Control":"no-cache, no-store, must-revalidate"})
        except Exception:
            pass
        return await call_next(request)

    @app.on_event("startup")
    def _startup():
        # Ensure local SQLite directory exists
        if settings.database_url.startswith("sqlite:///./"):
            os.makedirs("var", exist_ok=True)
        if settings.auto_create_db:
            Base.metadata.create_all(bind=engine)
            # Seed permissions if they don't exist
            try:
                from .models.models import PermissionCategory
                from .db import SessionLocal
                db = SessionLocal()
                try:
                    existing_count = db.query(PermissionCategory).count()
                    if existing_count == 0:
                        # Import and run seed function
                        import sys
                        import os
                        sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
                        from scripts.seed_permissions import seed_permissions
                        seed_permissions()
                        print("✅ Permissions seeded successfully on startup")
                except Exception as e:
                    print(f"⚠️  Could not seed permissions on startup: {e}")
                finally:
                    db.close()
            except Exception as e:
                print(f"⚠️  Could not check/seed permissions on startup: {e}")
        # Lightweight dev-time migrations (PostgreSQL): add missing columns safely
        try:
            # SQLite lightweight migrations for local dev
            if settings.database_url.startswith("sqlite:///./"):
                try:
                    with engine.begin() as conn:
                        try:
                            conn.execute(text("ALTER TABLE proposals ADD COLUMN project_id TEXT"))
                        except Exception:
                            pass
                        # SQLite: Add suppliers columns if missing
                        try:
                            conn.execute(text("ALTER TABLE suppliers ADD COLUMN legal_name TEXT"))
                        except Exception:
                            pass
                        try:
                            conn.execute(text("ALTER TABLE suppliers ADD COLUMN website TEXT"))
                        except Exception:
                            pass
                        try:
                            conn.execute(text("ALTER TABLE suppliers ADD COLUMN address_line1 TEXT"))
                        except Exception:
                            pass
                        try:
                            conn.execute(text("ALTER TABLE suppliers ADD COLUMN address_line2 TEXT"))
                        except Exception:
                            pass
                        # city column already exists or will be added
                        try:
                            conn.execute(text("ALTER TABLE suppliers ADD COLUMN city TEXT"))
                        except Exception:
                            pass
                        try:
                            conn.execute(text("ALTER TABLE suppliers ADD COLUMN province TEXT"))
                        except Exception:
                            pass
                        try:
                            conn.execute(text("ALTER TABLE suppliers ADD COLUMN postal_code TEXT"))
                        except Exception:
                            pass
                        try:
                            conn.execute(text("ALTER TABLE suppliers ADD COLUMN country TEXT"))
                        except Exception:
                            pass
                        try:
                            conn.execute(text("ALTER TABLE suppliers ADD COLUMN tax_number TEXT"))
                        except Exception:
                            pass
                        try:
                            conn.execute(text("ALTER TABLE suppliers ADD COLUMN payment_terms TEXT"))
                        except Exception:
                            pass
                        try:
                            conn.execute(text("ALTER TABLE suppliers ADD COLUMN currency TEXT"))
                        except Exception:
                            pass
                        try:
                            conn.execute(text("ALTER TABLE suppliers ADD COLUMN lead_time_days INTEGER"))
                        except Exception:
                            pass
                        try:
                            conn.execute(text("ALTER TABLE suppliers ADD COLUMN category TEXT"))
                        except Exception:
                            pass
                        try:
                            conn.execute(text("ALTER TABLE suppliers ADD COLUMN status TEXT"))
                        except Exception:
                            pass
                        try:
                            conn.execute(text("ALTER TABLE suppliers ADD COLUMN notes TEXT"))
                        except Exception:
                            pass
                        try:
                            conn.execute(text("ALTER TABLE suppliers ADD COLUMN is_active INTEGER DEFAULT 1"))
                        except Exception:
                            pass
                        try:
                            conn.execute(text("ALTER TABLE suppliers ADD COLUMN created_at TEXT DEFAULT CURRENT_TIMESTAMP"))
                        except Exception:
                            pass
                        try:
                            conn.execute(text("ALTER TABLE suppliers ADD COLUMN updated_at TEXT"))
                        except Exception:
                            pass
                        # client_folders columns for SQLite
                        try:
                            conn.execute(text("ALTER TABLE client_folders ADD COLUMN project_id TEXT"))
                        except Exception:
                            pass
                        try:
                            conn.execute(text("ALTER TABLE client_folders ADD COLUMN access_permissions TEXT"))
                        except Exception:
                            pass
                        # clients is_system column for SQLite
                        try:
                            conn.execute(text("ALTER TABLE clients ADD COLUMN is_system INTEGER DEFAULT 0"))
                        except Exception:
                            pass
                        # Project events table for SQLite
                        try:
                            conn.execute(text("CREATE TABLE IF NOT EXISTS project_events (\n"
                                               "id TEXT PRIMARY KEY,\n"
                                               "project_id TEXT NOT NULL,\n"
                                               "name TEXT NOT NULL,\n"
                                               "location TEXT,\n"
                                               "start_datetime TEXT NOT NULL,\n"
                                               "end_datetime TEXT NOT NULL,\n"
                                               "notes TEXT,\n"
                                               "is_all_day INTEGER DEFAULT 0,\n"
                                               "timezone TEXT,\n"
                                               "repeat_type TEXT,\n"
                                               "repeat_config TEXT,\n"
                                               "repeat_until TEXT,\n"
                                               "repeat_count INTEGER,\n"
                                               "exceptions TEXT,\n"
                                               "extra_dates TEXT,\n"
                                               "overrides TEXT,\n"
                                               "created_at TEXT DEFAULT CURRENT_TIMESTAMP,\n"
                                               "created_by TEXT,\n"
                                               "FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,\n"
                                               "FOREIGN KEY(created_by) REFERENCES users(id)\n"
                                               ")"))
                        except Exception:
                            pass
                        # Add new columns to existing SQLite table
                        try:
                            conn.execute(text("ALTER TABLE project_events ADD COLUMN is_all_day INTEGER DEFAULT 0"))
                        except Exception:
                            pass
                        try:
                            conn.execute(text("ALTER TABLE project_events ADD COLUMN timezone TEXT"))
                        except Exception:
                            pass
                        try:
                            conn.execute(text("ALTER TABLE project_events ADD COLUMN repeat_type TEXT"))
                        except Exception:
                            pass
                        try:
                            conn.execute(text("ALTER TABLE project_events ADD COLUMN repeat_config TEXT"))
                        except Exception:
                            pass
                        try:
                            conn.execute(text("ALTER TABLE project_events ADD COLUMN repeat_until TEXT"))
                        except Exception:
                            pass
                        try:
                            conn.execute(text("ALTER TABLE project_events ADD COLUMN repeat_count INTEGER"))
                        except Exception:
                            pass
                        try:
                            conn.execute(text("ALTER TABLE project_events ADD COLUMN exceptions TEXT"))
                        except Exception:
                            pass
                        try:
                            conn.execute(text("ALTER TABLE project_events ADD COLUMN extra_dates TEXT"))
                        except Exception:
                            pass
                        try:
                            conn.execute(text("ALTER TABLE project_events ADD COLUMN overrides TEXT"))
                        except Exception:
                            pass
                        # Dispatch & Time Tracking tables for SQLite
                        # Add fields to projects table
                        try:
                            conn.execute(text("ALTER TABLE projects ADD COLUMN address TEXT"))
                        except Exception:
                            pass
                        try:
                            conn.execute(text("ALTER TABLE projects ADD COLUMN lat REAL"))
                        except Exception:
                            pass
                        try:
                            conn.execute(text("ALTER TABLE projects ADD COLUMN lng REAL"))
                        except Exception:
                            pass
                        try:
                            conn.execute(text("ALTER TABLE projects ADD COLUMN timezone TEXT DEFAULT 'America/Vancouver'"))
                        except Exception:
                            pass
                        # Add lat/lng to client_sites table for SQLite
                        try:
                            conn.execute(text("ALTER TABLE client_sites ADD COLUMN site_lat REAL"))
                        except Exception:
                            pass
                        try:
                            conn.execute(text("ALTER TABLE client_sites ADD COLUMN site_lng REAL"))
                        except Exception:
                            pass
                        try:
                            conn.execute(text("ALTER TABLE projects ADD COLUMN status TEXT"))
                        except Exception:
                            pass
                        # Add fields to users table
                        try:
                            conn.execute(text("ALTER TABLE users ADD COLUMN mobile TEXT"))
                        except Exception:
                            pass
                        try:
                            conn.execute(text("ALTER TABLE users ADD COLUMN preferred_notification TEXT"))
                        except Exception:
                            pass
                        try:
                            conn.execute(text("ALTER TABLE users ADD COLUMN status TEXT DEFAULT 'active'"))
                        except Exception:
                            pass
                        # Shifts table
                        try:
                            conn.execute(text("CREATE TABLE IF NOT EXISTS shifts (\n"
                                               "id TEXT PRIMARY KEY,\n"
                                               "project_id TEXT NOT NULL,\n"
                                               "worker_id TEXT NOT NULL,\n"
                                               "date TEXT NOT NULL,\n"
                                               "start_time TEXT NOT NULL,\n"
                                               "end_time TEXT NOT NULL,\n"
                                               "status TEXT DEFAULT 'scheduled',\n"
                                               "default_break_min INTEGER DEFAULT 30,\n"
                                               "geofences TEXT,\n"
                                               "job_id TEXT,\n"
                                               "job_name TEXT,\n"
                                               "created_by TEXT NOT NULL,\n"
                                               "created_at TEXT DEFAULT CURRENT_TIMESTAMP,\n"
                                               "updated_at TEXT,\n"
                                               "cancelled_at TEXT,\n"
                                               "cancelled_by TEXT,\n"
                                               "FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,\n"
                                               "FOREIGN KEY(worker_id) REFERENCES users(id) ON DELETE CASCADE,\n"
                                               "FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE SET NULL,\n"
                                               "FOREIGN KEY(cancelled_by) REFERENCES users(id) ON DELETE SET NULL\n"
                                               ")"))
                        except Exception:
                            pass
                        try:
                            conn.execute(text("ALTER TABLE shifts ADD COLUMN job_id TEXT"))
                        except Exception:
                            pass
                        try:
                            conn.execute(text("ALTER TABLE shifts ADD COLUMN job_name TEXT"))
                        except Exception:
                            pass
                        # Attendance table
                        try:
                            conn.execute(text("CREATE TABLE IF NOT EXISTS attendance (\n"
                                               "id TEXT PRIMARY KEY,\n"
                                               "shift_id TEXT NOT NULL,\n"
                                               "worker_id TEXT NOT NULL,\n"
                                               "type TEXT NOT NULL,\n"
                                               "time_entered_utc TEXT NOT NULL,\n"
                                               "time_selected_utc TEXT NOT NULL,\n"
                                               "status TEXT DEFAULT 'pending',\n"
                                               "source TEXT DEFAULT 'app',\n"
                                               "created_by TEXT,\n"
                                               "reason_text TEXT,\n"
                                               "gps_lat REAL,\n"
                                               "gps_lng REAL,\n"
                                               "gps_accuracy_m REAL,\n"
                                               "mocked_flag INTEGER DEFAULT 0,\n"
                                               "attachments TEXT,\n"
                                               "created_at TEXT DEFAULT CURRENT_TIMESTAMP,\n"
                                               "approved_at TEXT,\n"
                                               "approved_by TEXT,\n"
                                               "rejected_at TEXT,\n"
                                               "rejected_by TEXT,\n"
                                               "rejection_reason TEXT,\n"
                                               "FOREIGN KEY(shift_id) REFERENCES shifts(id) ON DELETE CASCADE,\n"
                                               "FOREIGN KEY(worker_id) REFERENCES users(id) ON DELETE CASCADE,\n"
                                               "FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE SET NULL,\n"
                                               "FOREIGN KEY(approved_by) REFERENCES users(id) ON DELETE SET NULL,\n"
                                               "FOREIGN KEY(rejected_by) REFERENCES users(id) ON DELETE SET NULL\n"
                                               ")"))
                        except Exception:
                            pass
                        # Audit logs table
                        try:
                            conn.execute(text("CREATE TABLE IF NOT EXISTS audit_logs (\n"
                                               "id TEXT PRIMARY KEY,\n"
                                               "entity_type TEXT NOT NULL,\n"
                                               "entity_id TEXT NOT NULL,\n"
                                               "action TEXT NOT NULL,\n"
                                               "actor_id TEXT,\n"
                                               "actor_role TEXT,\n"
                                               "source TEXT,\n"
                                               "changes_json TEXT,\n"
                                               "timestamp_utc TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,\n"
                                               "context TEXT,\n"
                                               "integrity_hash TEXT,\n"
                                               "FOREIGN KEY(actor_id) REFERENCES users(id) ON DELETE SET NULL\n"
                                               ")"))
                        except Exception:
                            pass
                        # Notifications table
                        try:
                            conn.execute(text("CREATE TABLE IF NOT EXISTS notifications (\n"
                                               "id TEXT PRIMARY KEY,\n"
                                               "user_id TEXT NOT NULL,\n"
                                               "channel TEXT NOT NULL,\n"
                                               "template_key TEXT,\n"
                                               "payload_json TEXT,\n"
                                               "sent_at TEXT,\n"
                                               "status TEXT DEFAULT 'pending',\n"
                                               "error_message TEXT,\n"
                                               "created_at TEXT DEFAULT CURRENT_TIMESTAMP,\n"
                                               "FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE\n"
                                               ")"))
                        except Exception:
                            pass
                        # User notification preferences table
                        try:
                            conn.execute(text("CREATE TABLE IF NOT EXISTS user_notification_preferences (\n"
                                               "id TEXT PRIMARY KEY,\n"
                                               "user_id TEXT NOT NULL UNIQUE,\n"
                                               "push INTEGER DEFAULT 1,\n"
                                               "email INTEGER DEFAULT 1,\n"
                                               "quiet_hours TEXT,\n"
                                               "updated_at TEXT DEFAULT CURRENT_TIMESTAMP,\n"
                                               "FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE\n"
                                               ")"))
                        except Exception:
                            pass
                        # Project Orders tables
                        try:
                            conn.execute(text("CREATE TABLE IF NOT EXISTS project_orders (\n"
                                               "id TEXT PRIMARY KEY,\n"
                                               "project_id TEXT NOT NULL,\n"
                                               "estimate_id INTEGER,\n"
                                               "order_type TEXT NOT NULL,\n"
                                               "supplier_id TEXT,\n"
                                               "supplier_email TEXT,\n"
                                               "recipient_email TEXT,\n"
                                               "recipient_user_id TEXT,\n"
                                               "status TEXT NOT NULL DEFAULT 'draft',\n"
                                               "order_code TEXT,\n"
                                               "email_subject TEXT,\n"
                                               "email_body TEXT,\n"
                                               "email_cc TEXT,\n"
                                               "email_sent INTEGER DEFAULT 0,\n"
                                               "email_sent_at TEXT,\n"
                                               "delivered_at TEXT,\n"
                                               "delivered_by TEXT,\n"
                                               "notes TEXT,\n"
                                               "created_at TEXT DEFAULT CURRENT_TIMESTAMP,\n"
                                               "created_by TEXT,\n"
                                               "updated_at TEXT,\n"
                                               "FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,\n"
                                               "FOREIGN KEY(estimate_id) REFERENCES estimates(id) ON DELETE SET NULL,\n"
                                               "FOREIGN KEY(supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL,\n"
                                               "FOREIGN KEY(recipient_user_id) REFERENCES users(id) ON DELETE SET NULL,\n"
                                               "FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE SET NULL,\n"
                                               "FOREIGN KEY(delivered_by) REFERENCES users(id) ON DELETE SET NULL\n"
                                               ")"))
                        except Exception:
                            pass
                        try:
                            conn.execute(text("CREATE TABLE IF NOT EXISTS project_order_items (\n"
                                               "id TEXT PRIMARY KEY,\n"
                                               "order_id TEXT NOT NULL,\n"
                                               "estimate_item_id INTEGER,\n"
                                               "material_id INTEGER,\n"
                                               "item_type TEXT NOT NULL,\n"
                                               "name TEXT NOT NULL,\n"
                                               "description TEXT,\n"
                                               "quantity REAL NOT NULL,\n"
                                               "unit TEXT,\n"
                                               "unit_price REAL NOT NULL,\n"
                                               "total_price REAL NOT NULL,\n"
                                               "section TEXT,\n"
                                               "supplier_name TEXT,\n"
                                               "is_ordered INTEGER DEFAULT 0,\n"
                                               "created_at TEXT DEFAULT CURRENT_TIMESTAMP,\n"
                                               "FOREIGN KEY(order_id) REFERENCES project_orders(id) ON DELETE CASCADE,\n"
                                               "FOREIGN KEY(estimate_item_id) REFERENCES estimate_items(id) ON DELETE SET NULL,\n"
                                               "FOREIGN KEY(material_id) REFERENCES materials(id) ON DELETE SET NULL\n"
                                               ")"))
                        except Exception:
                            pass
                        # Consent logs table
                        try:
                            conn.execute(text("CREATE TABLE IF NOT EXISTS consent_logs (\n"
                                               "id TEXT PRIMARY KEY,\n"
                                               "user_id TEXT NOT NULL,\n"
                                               "policy_version TEXT NOT NULL,\n"
                                               "timestamp_utc TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,\n"
                                               "ip_address TEXT,\n"
                                               "user_agent TEXT,\n"
                                               "FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE\n"
                                               ")"))
                        except Exception:
                            pass
                        # Fleet & Equipment Management tables for SQLite
                        try:
                            conn.execute(text("CREATE TABLE IF NOT EXISTS fleet_assets (\n"
                                               "id TEXT PRIMARY KEY,\n"
                                               "asset_type TEXT NOT NULL,\n"
                                               "name TEXT NOT NULL,\n"
                                               "vin TEXT,\n"
                                               "license_plate TEXT,\n"
                                               "model TEXT,\n"
                                               "year INTEGER,\n"
                                               "division_id TEXT,\n"
                                               "odometer_current INTEGER,\n"
                                               "odometer_last_service INTEGER,\n"
                                               "hours_current REAL,\n"
                                               "hours_last_service REAL,\n"
                                               "status TEXT DEFAULT 'active',\n"
                                               "photos TEXT,\n"
                                               "documents TEXT,\n"
                                               "notes TEXT,\n"
                                               "created_at TEXT DEFAULT CURRENT_TIMESTAMP,\n"
                                               "updated_at TEXT,\n"
                                               "created_by TEXT,\n"
                                               "FOREIGN KEY(division_id) REFERENCES setting_items(id) ON DELETE SET NULL,\n"
                                               "FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE SET NULL\n"
                                               ")"))
                            try:
                                conn.execute(text("ALTER TABLE fleet_assets ADD COLUMN license_plate TEXT"))
                            except Exception:
                                pass
                            conn.execute(text("CREATE INDEX IF NOT EXISTS idx_fleet_asset_type ON fleet_assets(asset_type)"))
                            conn.execute(text("CREATE INDEX IF NOT EXISTS idx_fleet_asset_status ON fleet_assets(status)"))
                            conn.execute(text("CREATE INDEX IF NOT EXISTS idx_fleet_asset_type_status ON fleet_assets(asset_type, status)"))
                            conn.execute(text("CREATE INDEX IF NOT EXISTS idx_fleet_asset_division ON fleet_assets(division_id)"))
                        except Exception:
                            pass
                        try:
                            conn.execute(text("CREATE TABLE IF NOT EXISTS equipment (\n"
                                               "id TEXT PRIMARY KEY,\n"
                                               "category TEXT NOT NULL,\n"
                                               "name TEXT NOT NULL,\n"
                                               "serial_number TEXT,\n"
                                               "brand TEXT,\n"
                                               "model TEXT,\n"
                                               "value REAL,\n"
                                               "warranty_expiry TEXT,\n"
                                               "purchase_date TEXT,\n"
                                               "status TEXT DEFAULT 'available',\n"
                                               "photos TEXT,\n"
                                               "documents TEXT,\n"
                                               "notes TEXT,\n"
                                               "created_at TEXT DEFAULT CURRENT_TIMESTAMP,\n"
                                               "updated_at TEXT,\n"
                                               "created_by TEXT,\n"
                                               "FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE SET NULL\n"
                                               ")"))
                            conn.execute(text("CREATE INDEX IF NOT EXISTS idx_equipment_category ON equipment(category)"))
                            conn.execute(text("CREATE INDEX IF NOT EXISTS idx_equipment_status ON equipment(status)"))
                            conn.execute(text("CREATE INDEX IF NOT EXISTS idx_equipment_serial ON equipment(serial_number)"))
                            conn.execute(text("CREATE INDEX IF NOT EXISTS idx_equipment_category_status ON equipment(category, status)"))
                        except Exception:
                            pass
                        try:
                            conn.execute(text("CREATE TABLE IF NOT EXISTS fleet_inspections (\n"
                                               "id TEXT PRIMARY KEY,\n"
                                               "fleet_asset_id TEXT NOT NULL,\n"
                                               "inspection_date TEXT NOT NULL,\n"
                                               "inspector_user_id TEXT,\n"
                                               "checklist_results TEXT,\n"
                                               "photos TEXT,\n"
                                               "result TEXT DEFAULT 'pass',\n"
                                               "notes TEXT,\n"
                                               "odometer_reading INTEGER,\n"
                                               "hours_reading REAL,\n"
                                               "auto_generated_work_order_id TEXT,\n"
                                               "created_at TEXT DEFAULT CURRENT_TIMESTAMP,\n"
                                               "created_by TEXT,\n"
                                               "FOREIGN KEY(fleet_asset_id) REFERENCES fleet_assets(id) ON DELETE CASCADE,\n"
                                               "FOREIGN KEY(inspector_user_id) REFERENCES users(id) ON DELETE SET NULL,\n"
                                               "FOREIGN KEY(auto_generated_work_order_id) REFERENCES work_orders(id) ON DELETE SET NULL,\n"
                                               "FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE SET NULL\n"
                                               ")"))
                            try:
                                conn.execute(text("ALTER TABLE fleet_inspections ADD COLUMN odometer_reading INTEGER"))
                            except Exception:
                                pass
                            try:
                                conn.execute(text("ALTER TABLE fleet_inspections ADD COLUMN hours_reading REAL"))
                            except Exception:
                                pass
                            conn.execute(text("CREATE INDEX IF NOT EXISTS idx_inspection_asset ON fleet_inspections(fleet_asset_id)"))
                            conn.execute(text("CREATE INDEX IF NOT EXISTS idx_inspection_date ON fleet_inspections(inspection_date)"))
                            conn.execute(text("CREATE INDEX IF NOT EXISTS idx_inspection_result ON fleet_inspections(result)"))
                            conn.execute(text("CREATE INDEX IF NOT EXISTS idx_inspection_asset_date ON fleet_inspections(fleet_asset_id, inspection_date)"))
                        except Exception:
                            pass
                        try:
                            conn.execute(text("CREATE TABLE IF NOT EXISTS work_orders (\n"
                                               "id TEXT PRIMARY KEY,\n"
                                               "work_order_number TEXT UNIQUE NOT NULL,\n"
                                               "entity_type TEXT NOT NULL,\n"
                                               "entity_id TEXT NOT NULL,\n"
                                               "description TEXT NOT NULL,\n"
                                               "category TEXT DEFAULT 'maintenance',\n"
                                               "urgency TEXT DEFAULT 'normal',\n"
                                               "status TEXT DEFAULT 'open',\n"
                                               "assigned_to_user_id TEXT,\n"
                                               "assigned_by_user_id TEXT,\n"
                                               "photos TEXT,\n"
                                               "costs TEXT,\n"
                                               "documents TEXT,\n"
                                               "origin_source TEXT,\n"
                                               "origin_id TEXT,\n"
                                               "odometer_reading INTEGER,\n"
                                               "hours_reading REAL,\n"
                                               "created_at TEXT DEFAULT CURRENT_TIMESTAMP,\n"
                                               "updated_at TEXT,\n"
                                               "closed_at TEXT,\n"
                                               "created_by TEXT,\n"
                                               "FOREIGN KEY(assigned_to_user_id) REFERENCES users(id) ON DELETE SET NULL,\n"
                                               "FOREIGN KEY(assigned_by_user_id) REFERENCES users(id) ON DELETE SET NULL,\n"
                                               "FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE SET NULL\n"
                                               ")"))
                            try:
                                conn.execute(text("ALTER TABLE work_orders ADD COLUMN odometer_reading INTEGER"))
                            except Exception:
                                pass
                            try:
                                conn.execute(text("ALTER TABLE work_orders ADD COLUMN hours_reading REAL"))
                            except Exception:
                                pass
                            conn.execute(text("CREATE INDEX IF NOT EXISTS idx_work_order_number ON work_orders(work_order_number)"))
                            conn.execute(text("CREATE INDEX IF NOT EXISTS idx_work_order_entity_type ON work_orders(entity_type)"))
                            conn.execute(text("CREATE INDEX IF NOT EXISTS idx_work_order_entity_id ON work_orders(entity_id)"))
                            conn.execute(text("CREATE INDEX IF NOT EXISTS idx_work_order_status ON work_orders(status)"))
                            conn.execute(text("CREATE INDEX IF NOT EXISTS idx_work_order_assigned ON work_orders(assigned_to_user_id)"))
                            conn.execute(text("CREATE INDEX IF NOT EXISTS idx_work_order_entity ON work_orders(entity_type, entity_id)"))
                        except Exception:
                            pass
                        try:
                            conn.execute(text("CREATE TABLE IF NOT EXISTS equipment_checkouts (\n"
                                               "id TEXT PRIMARY KEY,\n"
                                               "equipment_id TEXT NOT NULL,\n"
                                               "checked_out_by_user_id TEXT NOT NULL,\n"
                                               "checked_out_at TEXT NOT NULL,\n"
                                               "expected_return_date TEXT,\n"
                                               "actual_return_date TEXT,\n"
                                               "condition_out TEXT NOT NULL,\n"
                                               "condition_in TEXT,\n"
                                               "notes_out TEXT,\n"
                                               "notes_in TEXT,\n"
                                               "status TEXT DEFAULT 'checked_out',\n"
                                               "created_by TEXT,\n"
                                               "created_at TEXT DEFAULT CURRENT_TIMESTAMP,\n"
                                               "updated_at TEXT,\n"
                                               "FOREIGN KEY(equipment_id) REFERENCES equipment(id) ON DELETE CASCADE,\n"
                                               "FOREIGN KEY(checked_out_by_user_id) REFERENCES users(id) ON DELETE CASCADE,\n"
                                               "FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE SET NULL\n"
                                               ")"))
                            conn.execute(text("CREATE INDEX IF NOT EXISTS idx_checkout_equipment ON equipment_checkouts(equipment_id)"))
                            conn.execute(text("CREATE INDEX IF NOT EXISTS idx_checkout_user ON equipment_checkouts(checked_out_by_user_id)"))
                            conn.execute(text("CREATE INDEX IF NOT EXISTS idx_checkout_status ON equipment_checkouts(status)"))
                            conn.execute(text("CREATE INDEX IF NOT EXISTS idx_checkout_expected_return ON equipment_checkouts(expected_return_date)"))
                            conn.execute(text("CREATE INDEX IF NOT EXISTS idx_checkout_equipment_status ON equipment_checkouts(equipment_id, status)"))
                        except Exception:
                            pass
                        try:
                            conn.execute(text("CREATE TABLE IF NOT EXISTS fleet_logs (\n"
                                               "id TEXT PRIMARY KEY,\n"
                                               "fleet_asset_id TEXT NOT NULL,\n"
                                               "log_type TEXT NOT NULL,\n"
                                               "log_date TEXT NOT NULL,\n"
                                               "user_id TEXT,\n"
                                               "description TEXT NOT NULL,\n"
                                               "odometer_snapshot INTEGER,\n"
                                               "hours_snapshot REAL,\n"
                                               "status_snapshot TEXT,\n"
                                               "related_work_order_id TEXT,\n"
                                               "created_at TEXT DEFAULT CURRENT_TIMESTAMP,\n"
                                               "created_by TEXT,\n"
                                               "FOREIGN KEY(fleet_asset_id) REFERENCES fleet_assets(id) ON DELETE CASCADE,\n"
                                               "FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL,\n"
                                               "FOREIGN KEY(related_work_order_id) REFERENCES work_orders(id) ON DELETE SET NULL,\n"
                                               "FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE SET NULL\n"
                                               ")"))
                            conn.execute(text("CREATE INDEX IF NOT EXISTS idx_fleet_log_asset ON fleet_logs(fleet_asset_id)"))
                            conn.execute(text("CREATE INDEX IF NOT EXISTS idx_fleet_log_type ON fleet_logs(log_type)"))
                            conn.execute(text("CREATE INDEX IF NOT EXISTS idx_fleet_log_date ON fleet_logs(log_date)"))
                            conn.execute(text("CREATE INDEX IF NOT EXISTS idx_fleet_log_asset_date ON fleet_logs(fleet_asset_id, log_date)"))
                        except Exception:
                            pass
                        try:
                            conn.execute(text("CREATE TABLE IF NOT EXISTS equipment_logs (\n"
                                               "id TEXT PRIMARY KEY,\n"
                                               "equipment_id TEXT NOT NULL,\n"
                                               "log_type TEXT NOT NULL,\n"
                                               "log_date TEXT NOT NULL,\n"
                                               "user_id TEXT,\n"
                                               "description TEXT NOT NULL,\n"
                                               "related_work_order_id TEXT,\n"
                                               "created_at TEXT DEFAULT CURRENT_TIMESTAMP,\n"
                                               "created_by TEXT,\n"
                                               "FOREIGN KEY(equipment_id) REFERENCES equipment(id) ON DELETE CASCADE,\n"
                                               "FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL,\n"
                                               "FOREIGN KEY(related_work_order_id) REFERENCES work_orders(id) ON DELETE SET NULL,\n"
                                               "FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE SET NULL\n"
                                               ")"))
                            conn.execute(text("CREATE INDEX IF NOT EXISTS idx_equipment_log_equipment ON equipment_logs(equipment_id)"))
                            conn.execute(text("CREATE INDEX IF NOT EXISTS idx_equipment_log_type ON equipment_logs(log_type)"))
                            conn.execute(text("CREATE INDEX IF NOT EXISTS idx_equipment_log_date ON equipment_logs(log_date)"))
                            conn.execute(text("CREATE INDEX IF NOT EXISTS idx_equipment_log_equipment_date ON equipment_logs(equipment_id, log_date)"))
                        except Exception:
                            pass
                        try:
                            conn.execute(text("CREATE TABLE IF NOT EXISTS equipment_assignments (\n"
                                               "id TEXT PRIMARY KEY,\n"
                                               "equipment_id TEXT NOT NULL,\n"
                                               "assigned_to_user_id TEXT NOT NULL,\n"
                                               "assigned_at TEXT NOT NULL,\n"
                                               "returned_at TEXT,\n"
                                               "returned_to_user_id TEXT,\n"
                                               "notes TEXT,\n"
                                               "is_active INTEGER DEFAULT 1,\n"
                                               "created_by TEXT,\n"
                                               "created_at TEXT DEFAULT CURRENT_TIMESTAMP,\n"
                                               "FOREIGN KEY(equipment_id) REFERENCES equipment(id) ON DELETE CASCADE,\n"
                                               "FOREIGN KEY(assigned_to_user_id) REFERENCES users(id) ON DELETE CASCADE,\n"
                                               "FOREIGN KEY(returned_to_user_id) REFERENCES users(id) ON DELETE SET NULL,\n"
                                               "FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE SET NULL\n"
                                               ")"))
                            conn.execute(text("CREATE INDEX IF NOT EXISTS idx_equipment_assignment_equipment ON equipment_assignments(equipment_id)"))
                            conn.execute(text("CREATE INDEX IF NOT EXISTS idx_equipment_assignment_user ON equipment_assignments(assigned_to_user_id)"))
                            conn.execute(text("CREATE INDEX IF NOT EXISTS idx_equipment_assignment_active ON equipment_assignments(is_active)"))
                            conn.execute(text("CREATE INDEX IF NOT EXISTS idx_equipment_assignment_equipment_active ON equipment_assignments(equipment_id, is_active)"))
                            conn.execute(text("CREATE INDEX IF NOT EXISTS idx_equipment_assignment_user_active ON equipment_assignments(assigned_to_user_id, is_active)"))
                        except Exception:
                            pass
                except Exception:
                    pass
            if settings.database_url.startswith("postgres"):
                with engine.begin() as conn:
                    conn.execute(text("ALTER TABLE employee_profiles ADD COLUMN IF NOT EXISTS profile_photo_file_id UUID"))
                    # Ensure clients table has expected columns (idempotent, Postgres only)
                    conn.execute(text("ALTER TABLE clients ADD COLUMN IF NOT EXISTS code VARCHAR(50)"))
                    conn.execute(text("ALTER TABLE clients ADD COLUMN IF NOT EXISTS legal_name VARCHAR(255)"))
                    conn.execute(text("ALTER TABLE clients ADD COLUMN IF NOT EXISTS display_name VARCHAR(255)"))
                    conn.execute(text("ALTER TABLE clients ADD COLUMN IF NOT EXISTS client_type VARCHAR(50)"))
                    conn.execute(text("ALTER TABLE clients ADD COLUMN IF NOT EXISTS client_status VARCHAR(50)"))
                    conn.execute(text("ALTER TABLE clients ADD COLUMN IF NOT EXISTS lead_source VARCHAR(100)"))
                    conn.execute(text("ALTER TABLE clients ADD COLUMN IF NOT EXISTS estimator_id UUID"))
                    conn.execute(text("ALTER TABLE clients ADD COLUMN IF NOT EXISTS description VARCHAR(4000)"))
                    conn.execute(text("ALTER TABLE clients ADD COLUMN IF NOT EXISTS address_line1 VARCHAR(255)"))
                    conn.execute(text("ALTER TABLE clients ADD COLUMN IF NOT EXISTS address_line2 VARCHAR(255)"))
                    conn.execute(text("ALTER TABLE clients ADD COLUMN IF NOT EXISTS city VARCHAR(100)"))
                    conn.execute(text("ALTER TABLE clients ADD COLUMN IF NOT EXISTS province VARCHAR(100)"))
                    conn.execute(text("ALTER TABLE clients ADD COLUMN IF NOT EXISTS postal_code VARCHAR(50)"))
                    conn.execute(text("ALTER TABLE clients ADD COLUMN IF NOT EXISTS country VARCHAR(100)"))
                    conn.execute(text("ALTER TABLE clients ADD COLUMN IF NOT EXISTS billing_address_line1 VARCHAR(255)"))
                    conn.execute(text("ALTER TABLE clients ADD COLUMN IF NOT EXISTS billing_address_line2 VARCHAR(255)"))
                    conn.execute(text("ALTER TABLE clients ADD COLUMN IF NOT EXISTS billing_city VARCHAR(100)"))
                    conn.execute(text("ALTER TABLE clients ADD COLUMN IF NOT EXISTS billing_province VARCHAR(100)"))
                    conn.execute(text("ALTER TABLE clients ADD COLUMN IF NOT EXISTS billing_postal_code VARCHAR(50)"))
                    conn.execute(text("ALTER TABLE clients ADD COLUMN IF NOT EXISTS billing_country VARCHAR(100)"))
                    conn.execute(text("ALTER TABLE clients ADD COLUMN IF NOT EXISTS type_id UUID"))
                    conn.execute(text("ALTER TABLE clients ADD COLUMN IF NOT EXISTS status_id UUID"))
                    conn.execute(text("ALTER TABLE clients ADD COLUMN IF NOT EXISTS payment_terms_id UUID"))
                    conn.execute(text("ALTER TABLE clients ADD COLUMN IF NOT EXISTS billing_email VARCHAR(255)"))
                    conn.execute(text("ALTER TABLE clients ADD COLUMN IF NOT EXISTS po_required BOOLEAN DEFAULT FALSE"))
                    conn.execute(text("ALTER TABLE clients ADD COLUMN IF NOT EXISTS tax_number VARCHAR(100)"))
                    conn.execute(text("ALTER TABLE clients ADD COLUMN IF NOT EXISTS dataforma_id VARCHAR(100)"))
                    conn.execute(text("ALTER TABLE clients ADD COLUMN IF NOT EXISTS preferred_language VARCHAR(50)"))
                    conn.execute(text("ALTER TABLE clients ADD COLUMN IF NOT EXISTS preferred_channels JSONB"))
                    conn.execute(text("ALTER TABLE clients ADD COLUMN IF NOT EXISTS marketing_opt_in BOOLEAN DEFAULT FALSE"))
                    conn.execute(text("ALTER TABLE clients ADD COLUMN IF NOT EXISTS invoice_delivery_method VARCHAR(50)"))
                    conn.execute(text("ALTER TABLE clients ADD COLUMN IF NOT EXISTS statement_delivery_method VARCHAR(50)"))
                    conn.execute(text("ALTER TABLE clients ADD COLUMN IF NOT EXISTS cc_emails_for_invoices JSONB"))
                    conn.execute(text("ALTER TABLE clients ADD COLUMN IF NOT EXISTS cc_emails_for_estimates JSONB"))
                    conn.execute(text("ALTER TABLE clients ADD COLUMN IF NOT EXISTS do_not_contact BOOLEAN DEFAULT FALSE"))
                    conn.execute(text("ALTER TABLE clients ADD COLUMN IF NOT EXISTS do_not_contact_reason VARCHAR(500)"))
                    conn.execute(text("ALTER TABLE clients ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW()"))
                    conn.execute(text("ALTER TABLE clients ADD COLUMN IF NOT EXISTS created_by UUID"))
                    conn.execute(text("ALTER TABLE clients ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ"))
                    conn.execute(text("ALTER TABLE clients ADD COLUMN IF NOT EXISTS updated_by UUID"))
                    conn.execute(text("ALTER TABLE clients ADD COLUMN IF NOT EXISTS billing_same_as_address BOOLEAN DEFAULT FALSE"))
                    conn.execute(text("ALTER TABLE clients ADD COLUMN IF NOT EXISTS is_system BOOLEAN DEFAULT FALSE"))
                    # Ensure client_contacts columns exist
                    conn.execute(text("ALTER TABLE client_contacts ADD COLUMN IF NOT EXISTS role_title VARCHAR(100)"))
                    conn.execute(text("ALTER TABLE client_contacts ADD COLUMN IF NOT EXISTS department VARCHAR(100)"))
                    conn.execute(text("ALTER TABLE client_contacts ADD COLUMN IF NOT EXISTS email VARCHAR(255)"))
                    conn.execute(text("ALTER TABLE client_contacts ADD COLUMN IF NOT EXISTS phone VARCHAR(100)"))
                    conn.execute(text("ALTER TABLE client_contacts ADD COLUMN IF NOT EXISTS mobile_phone VARCHAR(100)"))
                    conn.execute(text("ALTER TABLE client_contacts ADD COLUMN IF NOT EXISTS is_primary BOOLEAN DEFAULT FALSE"))
                    conn.execute(text("ALTER TABLE client_contacts ADD COLUMN IF NOT EXISTS sort_index INTEGER DEFAULT 0"))
                    conn.execute(text("ALTER TABLE client_contacts ADD COLUMN IF NOT EXISTS notes VARCHAR(1000)"))
                    conn.execute(text("ALTER TABLE client_contacts ADD COLUMN IF NOT EXISTS role_tags JSONB"))
                    # Ensure client_sites columns exist
                    conn.execute(text("ALTER TABLE client_sites ADD COLUMN IF NOT EXISTS site_name VARCHAR(255)"))
                    conn.execute(text("ALTER TABLE client_sites ADD COLUMN IF NOT EXISTS site_address_line1 VARCHAR(255)"))
                    conn.execute(text("ALTER TABLE client_sites ADD COLUMN IF NOT EXISTS site_address_line2 VARCHAR(255)"))
                    conn.execute(text("ALTER TABLE client_sites ADD COLUMN IF NOT EXISTS site_city VARCHAR(100)"))
                    conn.execute(text("ALTER TABLE client_sites ADD COLUMN IF NOT EXISTS site_province VARCHAR(100)"))
                    conn.execute(text("ALTER TABLE client_sites ADD COLUMN IF NOT EXISTS site_postal_code VARCHAR(50)"))
                    conn.execute(text("ALTER TABLE client_sites ADD COLUMN IF NOT EXISTS site_country VARCHAR(100)"))
                    conn.execute(text("ALTER TABLE client_sites ADD COLUMN IF NOT EXISTS site_lat NUMERIC(10, 7)"))
                    conn.execute(text("ALTER TABLE client_sites ADD COLUMN IF NOT EXISTS site_lng NUMERIC(10, 7)"))
                    conn.execute(text("ALTER TABLE client_sites ADD COLUMN IF NOT EXISTS site_notes VARCHAR(1000)"))
                    conn.execute(text("ALTER TABLE client_sites ADD COLUMN IF NOT EXISTS sort_index INTEGER DEFAULT 0"))
                    # Link files to sites optionally
                    conn.execute(text("ALTER TABLE client_files ADD COLUMN IF NOT EXISTS site_id UUID"))
                    # client_folders columns for PostgreSQL
                    conn.execute(text("ALTER TABLE client_folders ADD COLUMN IF NOT EXISTS project_id UUID"))
                    conn.execute(text("ALTER TABLE client_folders ADD COLUMN IF NOT EXISTS access_permissions JSONB"))
                    # Proposal drafts table
                    conn.execute(text("CREATE TABLE IF NOT EXISTS proposal_drafts (\n"
                                       "id UUID PRIMARY KEY,\n"
                                       "client_id UUID,\n"
                                       "site_id UUID,\n"
                                       "user_id UUID,\n"
                                       "title VARCHAR(255),\n"
                                       "data JSONB,\n"
                                       "updated_at TIMESTAMPTZ DEFAULT NOW()\n"
                                       ")"))
                    conn.execute(text("CREATE TABLE IF NOT EXISTS proposals (\n"
                                       "id UUID PRIMARY KEY,\n"
                                       "project_id UUID,\n"
                                       "client_id UUID,\n"
                                       "site_id UUID,\n"
                                       "order_number VARCHAR(20),\n"
                                       "title VARCHAR(255),\n"
                                       "data JSONB,\n"
                                       "created_at TIMESTAMPTZ DEFAULT NOW()\n"
                                       ")"))
                    # Ensure new column exists for older DBs
                    conn.execute(text("ALTER TABLE proposals ADD COLUMN IF NOT EXISTS project_id UUID"))
                    # Ensure employee notes table exists
                    conn.execute(text("CREATE TABLE IF NOT EXISTS employee_notes (\n"
                                       "id UUID PRIMARY KEY,\n"
                                       "user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,\n"
                                       "category VARCHAR(100),\n"
                                       "text VARCHAR(2000) NOT NULL,\n"
                                       "created_at TIMESTAMPTZ DEFAULT NOW(),\n"
                                       "created_by UUID REFERENCES users(id),\n"
                                       "updated_at TIMESTAMPTZ,\n"
                                       "updated_by UUID\n"
                                       ")"))
                    # Extend project reports with audit fields
                    conn.execute(text("ALTER TABLE project_reports ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW()"))
                    conn.execute(text("ALTER TABLE project_reports ADD COLUMN IF NOT EXISTS created_by UUID"))
                    # Timesheets
                    conn.execute(text("CREATE TABLE IF NOT EXISTS project_time_entries (\n"
                                       "id UUID PRIMARY KEY,\n"
                                       "project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,\n"
                                       "user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,\n"
                                       "work_date DATE NOT NULL,\n"
                                       "start_time TIME,\n"
                                       "end_time TIME,\n"
                                       "minutes INTEGER NOT NULL DEFAULT 0,\n"
                                       "notes VARCHAR(1000),\n"
                                       "created_at TIMESTAMPTZ DEFAULT NOW(),\n"
                                       "created_by UUID,\n"
                                       "is_approved BOOLEAN DEFAULT FALSE,\n"
                                       "approved_at TIMESTAMPTZ,\n"
                                       "approved_by UUID\n"
                                       ")"))
                    # Ensure new columns exist for older DBs
                    conn.execute(text("ALTER TABLE project_time_entries ADD COLUMN IF NOT EXISTS start_time TIME"))
                    conn.execute(text("ALTER TABLE project_time_entries ADD COLUMN IF NOT EXISTS end_time TIME"))
                    conn.execute(text("ALTER TABLE project_time_entries ADD COLUMN IF NOT EXISTS is_approved BOOLEAN DEFAULT FALSE"))
                    conn.execute(text("ALTER TABLE project_time_entries ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ"))
                    conn.execute(text("ALTER TABLE project_time_entries ADD COLUMN IF NOT EXISTS approved_by UUID"))
                    conn.execute(text("CREATE TABLE IF NOT EXISTS project_time_entry_logs (\n"
                                       "id UUID PRIMARY KEY,\n"
                                       "entry_id UUID NOT NULL REFERENCES project_time_entries(id) ON DELETE CASCADE,\n"
                                       "project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,\n"
                                       "user_id UUID REFERENCES users(id) ON DELETE SET NULL,\n"
                                       "action VARCHAR(50) NOT NULL,\n"
                                       "changes JSONB,\n"
                                       "timestamp TIMESTAMPTZ DEFAULT NOW()\n"
                                       ")"))
                    # New columns used by UI
                    conn.execute(text("ALTER TABLE setting_items ADD COLUMN IF NOT EXISTS meta JSONB"))
                    conn.execute(text("ALTER TABLE projects ADD COLUMN IF NOT EXISTS progress INTEGER"))
                    conn.execute(text("ALTER TABLE projects ADD COLUMN IF NOT EXISTS status_label VARCHAR(100)"))
                    conn.execute(text("ALTER TABLE projects ADD COLUMN IF NOT EXISTS division_ids JSONB"))
                    conn.execute(text("ALTER TABLE projects ADD COLUMN IF NOT EXISTS site_id UUID"))
                    conn.execute(text("ALTER TABLE projects ADD COLUMN IF NOT EXISTS contact_id UUID"))
                    # Employee reviews
                    conn.execute(text("CREATE TABLE IF NOT EXISTS review_templates (\n"
                                       "id UUID PRIMARY KEY,\n"
                                       "name VARCHAR(255) NOT NULL,\n"
                                       "version INTEGER DEFAULT 1,\n"
                                       "is_active BOOLEAN DEFAULT TRUE,\n"
                                       "created_at TIMESTAMPTZ DEFAULT NOW()\n"
                                       ")"))
                    conn.execute(text("CREATE TABLE IF NOT EXISTS review_template_questions (\n"
                                       "id UUID PRIMARY KEY,\n"
                                       "template_id UUID NOT NULL REFERENCES review_templates(id) ON DELETE CASCADE,\n"
                                       "order_index INTEGER DEFAULT 0,\n"
                                       "key VARCHAR(100) NOT NULL,\n"
                                       "label VARCHAR(1000) NOT NULL,\n"
                                       "type VARCHAR(50) NOT NULL,\n"
                                       "options JSONB,\n"
                                       "required BOOLEAN DEFAULT FALSE\n"
                                       ")"))
                    conn.execute(text("CREATE TABLE IF NOT EXISTS review_cycles (\n"
                                       "id UUID PRIMARY KEY,\n"
                                       "name VARCHAR(255) NOT NULL,\n"
                                       "period_start TIMESTAMPTZ,\n"
                                       "period_end TIMESTAMPTZ,\n"
                                       "template_id UUID NOT NULL REFERENCES review_templates(id) ON DELETE RESTRICT,\n"
                                       "status VARCHAR(50) DEFAULT 'draft'\n"
                                       ")"))
                    conn.execute(text("CREATE TABLE IF NOT EXISTS review_assignments (\n"
                                       "id UUID PRIMARY KEY,\n"
                                       "cycle_id UUID NOT NULL REFERENCES review_cycles(id) ON DELETE CASCADE,\n"
                                       "reviewee_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,\n"
                                       "reviewer_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,\n"
                                       "status VARCHAR(50) DEFAULT 'pending',\n"
                                       "due_date TIMESTAMPTZ,\n"
                                       "created_at TIMESTAMPTZ DEFAULT NOW()\n"
                                       ")"))
                    conn.execute(text("CREATE TABLE IF NOT EXISTS review_answers (\n"
                                       "id UUID PRIMARY KEY,\n"
                                       "assignment_id UUID NOT NULL REFERENCES review_assignments(id) ON DELETE CASCADE,\n"
                                       "question_key VARCHAR(100) NOT NULL,\n"
                                       "question_label_snapshot VARCHAR(1000) NOT NULL,\n"
                                       "answer_json JSONB,\n"
                                       "score INTEGER,\n"
                                       "commented_at TIMESTAMPTZ,\n"
                                       "updated_at TIMESTAMPTZ DEFAULT NOW()\n"
                                       ")"))
                    # Ensure suppliers table has all required columns
                    conn.execute(text("ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS legal_name VARCHAR(255)"))
                    conn.execute(text("ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS email VARCHAR(255)"))
                    conn.execute(text("ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS phone VARCHAR(100)"))
                    conn.execute(text("ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS website VARCHAR(255)"))
                    conn.execute(text("ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS address_line1 VARCHAR(255)"))
                    conn.execute(text("ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS address_line2 VARCHAR(255)"))
                    conn.execute(text("ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS city VARCHAR(100)"))
                    conn.execute(text("ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS province VARCHAR(100)"))
                    conn.execute(text("ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS postal_code VARCHAR(50)"))
                    conn.execute(text("ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS country VARCHAR(100)"))
                    conn.execute(text("ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS tax_number VARCHAR(100)"))
                    conn.execute(text("ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS payment_terms VARCHAR(100)"))
                    conn.execute(text("ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS currency VARCHAR(10)"))
                    conn.execute(text("ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS lead_time_days INTEGER"))
                    conn.execute(text("ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS category VARCHAR(100)"))
                    conn.execute(text("ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS status VARCHAR(50)"))
                    conn.execute(text("ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS notes VARCHAR(2000)"))
                    conn.execute(text("ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE"))
                    conn.execute(text("ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW()"))
                    conn.execute(text("ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ"))
                    conn.execute(text("ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS image_base64 TEXT"))
                    # Ensure supplier_contacts table has all required columns
                    conn.execute(text("ALTER TABLE supplier_contacts ADD COLUMN IF NOT EXISTS title VARCHAR(100)"))
                    conn.execute(text("ALTER TABLE supplier_contacts ADD COLUMN IF NOT EXISTS notes VARCHAR(1000)"))
                    conn.execute(text("ALTER TABLE supplier_contacts ADD COLUMN IF NOT EXISTS image_base64 TEXT"))
                    # Ensure estimate_items table has all required columns
                    conn.execute(text("ALTER TABLE estimate_items ADD COLUMN IF NOT EXISTS description TEXT"))
                    conn.execute(text("ALTER TABLE estimate_items ADD COLUMN IF NOT EXISTS item_type VARCHAR(50)"))
                    # Project events table
                    conn.execute(text("CREATE TABLE IF NOT EXISTS project_events (\n"
                                       "id UUID PRIMARY KEY,\n"
                                       "project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,\n"
                                       "name VARCHAR(255) NOT NULL,\n"
                                       "location VARCHAR(500),\n"
                                       "start_datetime TIMESTAMPTZ NOT NULL,\n"
                                       "end_datetime TIMESTAMPTZ NOT NULL,\n"
                                       "notes VARCHAR(2000),\n"
                                       "is_all_day BOOLEAN DEFAULT FALSE,\n"
                                       "timezone VARCHAR(100),\n"
                                       "repeat_type VARCHAR(50),\n"
                                       "repeat_config JSONB,\n"
                                       "repeat_until TIMESTAMPTZ,\n"
                                       "repeat_count INTEGER,\n"
                                       "exceptions JSONB,\n"
                                       "extra_dates JSONB,\n"
                                       "overrides JSONB,\n"
                                       "created_at TIMESTAMPTZ DEFAULT NOW(),\n"
                                       "created_by UUID REFERENCES users(id)\n"
                                       ")"))
                    # Add new columns to existing table if they don't exist
                    try:
                        conn.execute(text("ALTER TABLE project_events ADD COLUMN IF NOT EXISTS is_all_day BOOLEAN DEFAULT FALSE"))
                    except Exception:
                        pass
                    try:
                        conn.execute(text("ALTER TABLE project_events ADD COLUMN IF NOT EXISTS timezone VARCHAR(100)"))
                    except Exception:
                        pass
                    try:
                        conn.execute(text("ALTER TABLE project_events ADD COLUMN IF NOT EXISTS repeat_type VARCHAR(50)"))
                    except Exception:
                        pass
                    try:
                        conn.execute(text("ALTER TABLE project_events ADD COLUMN IF NOT EXISTS repeat_config JSONB"))
                    except Exception:
                        pass
                    try:
                        conn.execute(text("ALTER TABLE project_events ADD COLUMN IF NOT EXISTS repeat_until TIMESTAMPTZ"))
                    except Exception:
                        pass
                    try:
                        conn.execute(text("ALTER TABLE project_events ADD COLUMN IF NOT EXISTS repeat_count INTEGER"))
                    except Exception:
                        pass
                    try:
                        conn.execute(text("ALTER TABLE project_events ADD COLUMN IF NOT EXISTS exceptions JSONB"))
                    except Exception:
                        pass
                    try:
                        conn.execute(text("ALTER TABLE project_events ADD COLUMN IF NOT EXISTS extra_dates JSONB"))
                    except Exception:
                        pass
                    try:
                        conn.execute(text("ALTER TABLE project_events ADD COLUMN IF NOT EXISTS overrides JSONB"))
                    except Exception:
                        pass
                    # Dispatch & Time Tracking tables
                    # Add fields to projects table
                    try:
                        conn.execute(text("ALTER TABLE projects ADD COLUMN IF NOT EXISTS address VARCHAR(500)"))
                    except Exception:
                        pass
                    try:
                        conn.execute(text("ALTER TABLE projects ADD COLUMN IF NOT EXISTS lat NUMERIC(10, 7)"))
                    except Exception:
                        pass
                    try:
                        conn.execute(text("ALTER TABLE projects ADD COLUMN IF NOT EXISTS lng NUMERIC(10, 7)"))
                    except Exception:
                        pass
                    try:
                        conn.execute(text("ALTER TABLE projects ADD COLUMN IF NOT EXISTS timezone VARCHAR(100) DEFAULT 'America/Vancouver'"))
                    except Exception:
                        pass
                    try:
                        conn.execute(text("ALTER TABLE projects ADD COLUMN IF NOT EXISTS status VARCHAR(50)"))
                    except Exception:
                        pass
                    # Add fields to users table
                    try:
                        conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS mobile VARCHAR(50)"))
                    except Exception:
                        pass
                    try:
                        conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS preferred_notification JSONB"))
                    except Exception:
                        pass
                    try:
                        conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'active'"))
                    except Exception:
                        pass
                    # Shifts table
                    conn.execute(text("CREATE TABLE IF NOT EXISTS shifts (\n"
                                       "id UUID PRIMARY KEY,\n"
                                       "project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,\n"
                                       "worker_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,\n"
                                       "date DATE NOT NULL,\n"
                                       "start_time TIME NOT NULL,\n"
                                       "end_time TIME NOT NULL,\n"
                                       "status VARCHAR(50) DEFAULT 'scheduled',\n"
                                       "default_break_min INTEGER DEFAULT 30,\n"
                                       "geofences JSONB,\n"
                                       "job_id UUID,\n"
                                       "job_name VARCHAR(255),\n"
                                       "created_by UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,\n"
                                       "created_at TIMESTAMPTZ DEFAULT NOW(),\n"
                                       "updated_at TIMESTAMPTZ,\n"
                                       "cancelled_at TIMESTAMPTZ,\n"
                                       "cancelled_by UUID REFERENCES users(id) ON DELETE SET NULL\n"
                                       ")"))
                    try:
                        conn.execute(text("ALTER TABLE shifts ADD COLUMN IF NOT EXISTS job_id UUID"))
                    except Exception:
                        pass
                    try:
                        conn.execute(text("ALTER TABLE shifts ADD COLUMN IF NOT EXISTS job_name VARCHAR(255)"))
                    except Exception:
                        pass
                    try:
                        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_shifts_job_id ON shifts(job_id)"))
                    except Exception:
                        pass
                    try:
                        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_shifts_project_id ON shifts(project_id)"))
                    except Exception:
                        pass
                    try:
                        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_shifts_worker_id ON shifts(worker_id)"))
                    except Exception:
                        pass
                    try:
                        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_shifts_worker_date_time ON shifts(worker_id, date, start_time, end_time)"))
                    except Exception:
                        pass
                    try:
                        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_shifts_project_date ON shifts(project_id, date)"))
                    except Exception:
                        pass
                    # Attendance table
                    conn.execute(text("CREATE TABLE IF NOT EXISTS attendance (\n"
                                       "id UUID PRIMARY KEY,\n"
                                       "shift_id UUID NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,\n"
                                       "worker_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,\n"
                                       "type VARCHAR(10) NOT NULL,\n"
                                       "time_entered_utc TIMESTAMPTZ NOT NULL,\n"
                                       "time_selected_utc TIMESTAMPTZ NOT NULL,\n"
                                       "status VARCHAR(20) DEFAULT 'pending',\n"
                                       "source VARCHAR(20) DEFAULT 'app',\n"
                                       "created_by UUID REFERENCES users(id) ON DELETE SET NULL,\n"
                                       "reason_text TEXT,\n"
                                       "gps_lat NUMERIC(10, 7),\n"
                                       "gps_lng NUMERIC(10, 7),\n"
                                       "gps_accuracy_m NUMERIC(10, 2),\n"
                                       "mocked_flag BOOLEAN DEFAULT FALSE,\n"
                                       "attachments JSONB,\n"
                                       "created_at TIMESTAMPTZ DEFAULT NOW(),\n"
                                       "approved_at TIMESTAMPTZ,\n"
                                       "approved_by UUID REFERENCES users(id) ON DELETE SET NULL,\n"
                                       "rejected_at TIMESTAMPTZ,\n"
                                       "rejected_by UUID REFERENCES users(id) ON DELETE SET NULL,\n"
                                       "rejection_reason TEXT\n"
                                       ")"))
                    try:
                        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_attendance_shift_id ON attendance(shift_id)"))
                    except Exception:
                        pass
                    try:
                        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_attendance_worker_id ON attendance(worker_id)"))
                    except Exception:
                        pass
                    try:
                        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_attendance_worker_time ON attendance(worker_id, time_selected_utc)"))
                    except Exception:
                        pass
                    try:
                        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_attendance_shift_type ON attendance(shift_id, type)"))
                    except Exception:
                        pass
                    try:
                        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_attendance_status ON attendance(status)"))
                    except Exception:
                        pass
                    # Audit logs table
                    conn.execute(text("CREATE TABLE IF NOT EXISTS audit_logs (\n"
                                       "id UUID PRIMARY KEY,\n"
                                       "entity_type VARCHAR(50) NOT NULL,\n"
                                       "entity_id UUID NOT NULL,\n"
                                       "action VARCHAR(50) NOT NULL,\n"
                                       "actor_id UUID REFERENCES users(id) ON DELETE SET NULL,\n"
                                       "actor_role VARCHAR(50),\n"
                                       "source VARCHAR(50),\n"
                                       "changes_json JSONB,\n"
                                       "timestamp_utc TIMESTAMPTZ NOT NULL DEFAULT NOW(),\n"
                                       "context JSONB,\n"
                                       "integrity_hash VARCHAR(64)\n"
                                       ")"))
                    try:
                        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_audit_entity_type ON audit_logs(entity_type)"))
                    except Exception:
                        pass
                    try:
                        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_audit_entity_id ON audit_logs(entity_id)"))
                    except Exception:
                        pass
                    try:
                        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_audit_actor_id ON audit_logs(actor_id)"))
                    except Exception:
                        pass
                    try:
                        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_audit_timestamp_utc ON audit_logs(timestamp_utc)"))
                    except Exception:
                        pass
                    try:
                        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity_type, entity_id)"))
                    except Exception:
                        pass
                    try:
                        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_logs(actor_id, timestamp_utc)"))
                    except Exception:
                        pass
                    # Notifications table
                    conn.execute(text("CREATE TABLE IF NOT EXISTS notifications (\n"
                                       "id UUID PRIMARY KEY,\n"
                                       "user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,\n"
                                       "channel VARCHAR(20) NOT NULL,\n"
                                       "template_key VARCHAR(100),\n"
                                       "payload_json JSONB,\n"
                                       "sent_at TIMESTAMPTZ,\n"
                                       "status VARCHAR(20) DEFAULT 'pending',\n"
                                       "error_message TEXT,\n"
                                       "created_at TIMESTAMPTZ DEFAULT NOW()\n"
                                       ")"))
                    try:
                        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id)"))
                    except Exception:
                        pass
                    try:
                        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_notifications_user_status ON notifications(user_id, status)"))
                    except Exception:
                        pass
                    try:
                        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at)"))
                    except Exception:
                        pass
                    # User notification preferences table
                    conn.execute(text("CREATE TABLE IF NOT EXISTS user_notification_preferences (\n"
                                       "id UUID PRIMARY KEY,\n"
                                       "user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,\n"
                                       "push BOOLEAN DEFAULT TRUE,\n"
                                       "email BOOLEAN DEFAULT TRUE,\n"
                                       "quiet_hours JSONB,\n"
                                       "updated_at TIMESTAMPTZ DEFAULT NOW()\n"
                                       ")"))
                    try:
                        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_user_notification_preferences_user_id ON user_notification_preferences(user_id)"))
                    except Exception:
                        pass
                    # Project Orders tables
                    conn.execute(text("CREATE TABLE IF NOT EXISTS project_orders (\n"
                                       "id UUID PRIMARY KEY,\n"
                                       "project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,\n"
                                       "estimate_id INTEGER REFERENCES estimates(id) ON DELETE SET NULL,\n"
                                       "order_type VARCHAR(50) NOT NULL,\n"
                                       "supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,\n"
                                       "supplier_email VARCHAR(255),\n"
                                       "recipient_email VARCHAR(255),\n"
                                       "recipient_user_id UUID REFERENCES users(id) ON DELETE SET NULL,\n"
                                       "status VARCHAR(50) NOT NULL DEFAULT 'draft',\n"
                                       "order_code VARCHAR(100),\n"
                                       "email_subject VARCHAR(500),\n"
                                       "email_body TEXT,\n"
                                       "email_cc VARCHAR(500),\n"
                                       "email_sent BOOLEAN DEFAULT FALSE,\n"
                                       "email_sent_at TIMESTAMPTZ,\n"
                                       "delivered_at TIMESTAMPTZ,\n"
                                       "delivered_by UUID REFERENCES users(id) ON DELETE SET NULL,\n"
                                       "notes TEXT,\n"
                                       "created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),\n"
                                       "created_by UUID REFERENCES users(id) ON DELETE SET NULL,\n"
                                       "updated_at TIMESTAMPTZ\n"
                                       ")"))
                    try:
                        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_project_orders_project_id ON project_orders(project_id)"))
                    except Exception:
                        pass
                    try:
                        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_project_orders_estimate_id ON project_orders(estimate_id)"))
                    except Exception:
                        pass
                    try:
                        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_project_orders_supplier_id ON project_orders(supplier_id)"))
                    except Exception:
                        pass
                    try:
                        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_project_orders_status ON project_orders(status)"))
                    except Exception:
                        pass
                    conn.execute(text("CREATE TABLE IF NOT EXISTS project_order_items (\n"
                                       "id UUID PRIMARY KEY,\n"
                                       "order_id UUID NOT NULL REFERENCES project_orders(id) ON DELETE CASCADE,\n"
                                       "estimate_item_id INTEGER REFERENCES estimate_items(id) ON DELETE SET NULL,\n"
                                       "material_id INTEGER REFERENCES materials(id) ON DELETE SET NULL,\n"
                                       "item_type VARCHAR(50) NOT NULL,\n"
                                       "name VARCHAR(255) NOT NULL,\n"
                                       "description TEXT,\n"
                                       "quantity NUMERIC(10, 2) NOT NULL,\n"
                                       "unit VARCHAR(50),\n"
                                       "unit_price NUMERIC(10, 2) NOT NULL,\n"
                                       "total_price NUMERIC(10, 2) NOT NULL,\n"
                                       "section VARCHAR(255),\n"
                                       "supplier_name VARCHAR(255),\n"
                                       "is_ordered BOOLEAN DEFAULT FALSE,\n"
                                       "created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()\n"
                                       ")"))
                    try:
                        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_project_order_items_order_id ON project_order_items(order_id)"))
                    except Exception:
                        pass
                    try:
                        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_project_order_items_estimate_item_id ON project_order_items(estimate_item_id)"))
                    except Exception:
                        pass
                    # Consent logs table
                    try:
                        conn.execute(text("CREATE TABLE IF NOT EXISTS consent_logs (\n"
                                           "id UUID PRIMARY KEY,\n"
                                           "user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,\n"
                                           "policy_version VARCHAR(50) NOT NULL,\n"
                                           "timestamp_utc TIMESTAMPTZ NOT NULL DEFAULT NOW(),\n"
                                           "ip_address VARCHAR(50),\n"
                                           "user_agent VARCHAR(500)\n"
                                           ")"))
                        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_consent_logs_user_id ON consent_logs(user_id)"))
                    except Exception:
                        pass
                    # Fleet & Equipment Management tables for PostgreSQL
                    try:
                        conn.execute(text("CREATE TABLE IF NOT EXISTS fleet_assets (\n"
                                           "id UUID PRIMARY KEY,\n"
                                           "asset_type VARCHAR(50) NOT NULL,\n"
                                           "name VARCHAR(255) NOT NULL,\n"
                                           "vin VARCHAR(100),\n"
                                           "license_plate VARCHAR(50),\n"
                                           "model VARCHAR(255),\n"
                                           "year INTEGER,\n"
                                           "division_id UUID,\n"
                                           "odometer_current INTEGER,\n"
                                           "odometer_last_service INTEGER,\n"
                                           "hours_current NUMERIC(10, 2),\n"
                                           "hours_last_service NUMERIC(10, 2),\n"
                                           "status VARCHAR(50) DEFAULT 'active',\n"
                                           "photos JSONB,\n"
                                           "documents JSONB,\n"
                                           "notes TEXT,\n"
                                           "created_at TIMESTAMPTZ DEFAULT NOW(),\n"
                                           "updated_at TIMESTAMPTZ,\n"
                                           "created_by UUID REFERENCES users(id) ON DELETE SET NULL\n"
                                           ")"))
                        try:
                            conn.execute(text("CREATE INDEX IF NOT EXISTS idx_fleet_asset_license_plate ON fleet_assets(license_plate)"))
                        except Exception:
                            pass
                        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_fleet_asset_type ON fleet_assets(asset_type)"))
                        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_fleet_asset_status ON fleet_assets(status)"))
                        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_fleet_asset_type_status ON fleet_assets(asset_type, status)"))
                        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_fleet_asset_division ON fleet_assets(division_id)"))
                    except Exception:
                        pass
                    try:
                        conn.execute(text("CREATE TABLE IF NOT EXISTS equipment (\n"
                                           "id UUID PRIMARY KEY,\n"
                                           "category VARCHAR(50) NOT NULL,\n"
                                           "name VARCHAR(255) NOT NULL,\n"
                                           "serial_number VARCHAR(255),\n"
                                           "brand VARCHAR(100),\n"
                                           "model VARCHAR(255),\n"
                                           "value NUMERIC(10, 2),\n"
                                           "warranty_expiry TIMESTAMPTZ,\n"
                                           "purchase_date TIMESTAMPTZ,\n"
                                           "status VARCHAR(50) DEFAULT 'available',\n"
                                           "photos JSONB,\n"
                                           "documents JSONB,\n"
                                           "notes TEXT,\n"
                                           "created_at TIMESTAMPTZ DEFAULT NOW(),\n"
                                           "updated_at TIMESTAMPTZ,\n"
                                           "created_by UUID REFERENCES users(id) ON DELETE SET NULL\n"
                                           ")"))
                        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_equipment_category ON equipment(category)"))
                        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_equipment_status ON equipment(status)"))
                        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_equipment_serial ON equipment(serial_number)"))
                        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_equipment_category_status ON equipment(category, status)"))
                    except Exception:
                        pass
                    try:
                        conn.execute(text("CREATE TABLE IF NOT EXISTS fleet_inspections (\n"
                                           "id UUID PRIMARY KEY,\n"
                                           "fleet_asset_id UUID NOT NULL REFERENCES fleet_assets(id) ON DELETE CASCADE,\n"
                                           "inspection_date TIMESTAMPTZ NOT NULL,\n"
                                           "inspector_user_id UUID REFERENCES users(id) ON DELETE SET NULL,\n"
                                           "checklist_results JSONB,\n"
                                           "photos JSONB,\n"
                                           "result VARCHAR(50) DEFAULT 'pass',\n"
                                           "notes TEXT,\n"
                                           "odometer_reading INTEGER,\n"
                                           "hours_reading NUMERIC(10, 2),\n"
                                           "auto_generated_work_order_id UUID REFERENCES work_orders(id) ON DELETE SET NULL,\n"
                                           "created_at TIMESTAMPTZ DEFAULT NOW(),\n"
                                           "created_by UUID REFERENCES users(id) ON DELETE SET NULL\n"
                                           ")"))
                        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_inspection_asset ON fleet_inspections(fleet_asset_id)"))
                        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_inspection_date ON fleet_inspections(inspection_date)"))
                        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_inspection_result ON fleet_inspections(result)"))
                        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_inspection_asset_date ON fleet_inspections(fleet_asset_id, inspection_date)"))
                    except Exception:
                        pass
                    try:
                        conn.execute(text("CREATE TABLE IF NOT EXISTS work_orders (\n"
                                           "id UUID PRIMARY KEY,\n"
                                           "work_order_number VARCHAR(50) UNIQUE NOT NULL,\n"
                                           "entity_type VARCHAR(50) NOT NULL,\n"
                                           "entity_id UUID NOT NULL,\n"
                                           "description TEXT NOT NULL,\n"
                                           "category VARCHAR(50) DEFAULT 'maintenance',\n"
                                           "urgency VARCHAR(20) DEFAULT 'normal',\n"
                                           "status VARCHAR(50) DEFAULT 'open',\n"
                                           "assigned_to_user_id UUID REFERENCES users(id) ON DELETE SET NULL,\n"
                                           "assigned_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,\n"
                                           "photos JSONB,\n"
                                           "costs JSONB,\n"
                                           "documents JSONB,\n"
                                           "origin_source VARCHAR(50),\n"
                                           "origin_id UUID,\n"
                                           "odometer_reading INTEGER,\n"
                                           "hours_reading NUMERIC(10, 2),\n"
                                           "created_at TIMESTAMPTZ DEFAULT NOW(),\n"
                                           "updated_at TIMESTAMPTZ,\n"
                                           "closed_at TIMESTAMPTZ,\n"
                                           "created_by UUID REFERENCES users(id) ON DELETE SET NULL\n"
                                           ")"))
                        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_work_order_number ON work_orders(work_order_number)"))
                        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_work_order_entity_type ON work_orders(entity_type)"))
                        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_work_order_entity_id ON work_orders(entity_id)"))
                        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_work_order_status ON work_orders(status)"))
                        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_work_order_assigned ON work_orders(assigned_to_user_id)"))
                        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_work_order_entity ON work_orders(entity_type, entity_id)"))
                    except Exception:
                        pass
                    try:
                        conn.execute(text("CREATE TABLE IF NOT EXISTS equipment_checkouts (\n"
                                           "id UUID PRIMARY KEY,\n"
                                           "equipment_id UUID NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,\n"
                                           "checked_out_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,\n"
                                           "checked_out_at TIMESTAMPTZ NOT NULL,\n"
                                           "expected_return_date TIMESTAMPTZ,\n"
                                           "actual_return_date TIMESTAMPTZ,\n"
                                           "condition_out VARCHAR(50) NOT NULL,\n"
                                           "condition_in VARCHAR(50),\n"
                                           "notes_out TEXT,\n"
                                           "notes_in TEXT,\n"
                                           "status VARCHAR(50) DEFAULT 'checked_out',\n"
                                           "created_by UUID REFERENCES users(id) ON DELETE SET NULL,\n"
                                           "created_at TIMESTAMPTZ DEFAULT NOW(),\n"
                                           "updated_at TIMESTAMPTZ\n"
                                           ")"))
                        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_checkout_equipment ON equipment_checkouts(equipment_id)"))
                        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_checkout_user ON equipment_checkouts(checked_out_by_user_id)"))
                        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_checkout_status ON equipment_checkouts(status)"))
                        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_checkout_expected_return ON equipment_checkouts(expected_return_date)"))
                        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_checkout_equipment_status ON equipment_checkouts(equipment_id, status)"))
                    except Exception:
                        pass
                    try:
                        conn.execute(text("CREATE TABLE IF NOT EXISTS fleet_logs (\n"
                                           "id UUID PRIMARY KEY,\n"
                                           "fleet_asset_id UUID NOT NULL REFERENCES fleet_assets(id) ON DELETE CASCADE,\n"
                                           "log_type VARCHAR(50) NOT NULL,\n"
                                           "log_date TIMESTAMPTZ NOT NULL,\n"
                                           "user_id UUID REFERENCES users(id) ON DELETE SET NULL,\n"
                                           "description TEXT NOT NULL,\n"
                                           "odometer_snapshot INTEGER,\n"
                                           "hours_snapshot NUMERIC(10, 2),\n"
                                           "status_snapshot VARCHAR(50),\n"
                                           "related_work_order_id UUID REFERENCES work_orders(id) ON DELETE SET NULL,\n"
                                           "created_at TIMESTAMPTZ DEFAULT NOW(),\n"
                                           "created_by UUID REFERENCES users(id) ON DELETE SET NULL\n"
                                           ")"))
                        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_fleet_log_asset ON fleet_logs(fleet_asset_id)"))
                        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_fleet_log_type ON fleet_logs(log_type)"))
                        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_fleet_log_date ON fleet_logs(log_date)"))
                        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_fleet_log_asset_date ON fleet_logs(fleet_asset_id, log_date)"))
                    except Exception:
                        pass
                    try:
                        conn.execute(text("CREATE TABLE IF NOT EXISTS equipment_logs (\n"
                                           "id UUID PRIMARY KEY,\n"
                                           "equipment_id UUID NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,\n"
                                           "log_type VARCHAR(50) NOT NULL,\n"
                                           "log_date TIMESTAMPTZ NOT NULL,\n"
                                           "user_id UUID REFERENCES users(id) ON DELETE SET NULL,\n"
                                           "description TEXT NOT NULL,\n"
                                           "related_work_order_id UUID REFERENCES work_orders(id) ON DELETE SET NULL,\n"
                                           "created_at TIMESTAMPTZ DEFAULT NOW(),\n"
                                           "created_by UUID REFERENCES users(id) ON DELETE SET NULL\n"
                                           ")"))
                        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_equipment_log_equipment ON equipment_logs(equipment_id)"))
                        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_equipment_log_type ON equipment_logs(log_type)"))
                        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_equipment_log_date ON equipment_logs(log_date)"))
                        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_equipment_log_equipment_date ON equipment_logs(equipment_id, log_date)"))
                    except Exception:
                        pass
                    try:
                        conn.execute(text("CREATE TABLE IF NOT EXISTS equipment_assignments (\n"
                                           "id UUID PRIMARY KEY,\n"
                                           "equipment_id UUID NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,\n"
                                           "assigned_to_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,\n"
                                           "assigned_at TIMESTAMPTZ NOT NULL,\n"
                                           "returned_at TIMESTAMPTZ,\n"
                                           "returned_to_user_id UUID REFERENCES users(id) ON DELETE SET NULL,\n"
                                           "notes TEXT,\n"
                                           "is_active BOOLEAN DEFAULT TRUE,\n"
                                           "created_by UUID REFERENCES users(id) ON DELETE SET NULL,\n"
                                           "created_at TIMESTAMPTZ DEFAULT NOW()\n"
                                           ")"))
                        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_equipment_assignment_equipment ON equipment_assignments(equipment_id)"))
                        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_equipment_assignment_user ON equipment_assignments(assigned_to_user_id)"))
                        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_equipment_assignment_active ON equipment_assignments(is_active)"))
                        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_equipment_assignment_equipment_active ON equipment_assignments(equipment_id, is_active)"))
                        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_equipment_assignment_user_active ON equipment_assignments(assigned_to_user_id, is_active)"))
                    except Exception:
                        pass
                    # Migrations for existing tables - add new columns if they don't exist
                    try:
                        # Add license_plate to fleet_assets
                        result = conn.execute(text("""
                            SELECT column_name 
                            FROM information_schema.columns 
                            WHERE table_name='fleet_assets' AND column_name='license_plate'
                        """))
                        if result.fetchone() is None:
                            conn.execute(text("ALTER TABLE fleet_assets ADD COLUMN license_plate VARCHAR(50)"))
                            conn.execute(text("CREATE INDEX IF NOT EXISTS idx_fleet_asset_license_plate ON fleet_assets(license_plate)"))
                    except Exception:
                        pass
                    try:
                        # Add odometer_reading and hours_reading to fleet_inspections
                        result = conn.execute(text("""
                            SELECT column_name 
                            FROM information_schema.columns 
                            WHERE table_name='fleet_inspections' AND column_name='odometer_reading'
                        """))
                        if result.fetchone() is None:
                            conn.execute(text("ALTER TABLE fleet_inspections ADD COLUMN odometer_reading INTEGER"))
                    except Exception:
                        pass
                    try:
                        result = conn.execute(text("""
                            SELECT column_name 
                            FROM information_schema.columns 
                            WHERE table_name='fleet_inspections' AND column_name='hours_reading'
                        """))
                        if result.fetchone() is None:
                            conn.execute(text("ALTER TABLE fleet_inspections ADD COLUMN hours_reading NUMERIC(10, 2)"))
                    except Exception:
                        pass
                    try:
                        # Add odometer_reading and hours_reading to work_orders
                        result = conn.execute(text("""
                            SELECT column_name 
                            FROM information_schema.columns 
                            WHERE table_name='work_orders' AND column_name='odometer_reading'
                        """))
                        if result.fetchone() is None:
                            conn.execute(text("ALTER TABLE work_orders ADD COLUMN odometer_reading INTEGER"))
                    except Exception:
                        pass
                    try:
                        result = conn.execute(text("""
                            SELECT column_name 
                            FROM information_schema.columns 
                            WHERE table_name='work_orders' AND column_name='hours_reading'
                        """))
                        if result.fetchone() is None:
                            conn.execute(text("ALTER TABLE work_orders ADD COLUMN hours_reading NUMERIC(10, 2)"))
                    except Exception:
                        pass
                    try:
                        # Add documents column to work_orders if it doesn't exist
                        result = conn.execute(text("""
                            SELECT column_name 
                            FROM information_schema.columns 
                            WHERE table_name='work_orders' AND column_name='documents'
                        """))
                        if result.fetchone() is None:
                            conn.execute(text("ALTER TABLE work_orders ADD COLUMN documents JSONB"))
                    except Exception:
                        pass
        except Exception:
            pass
        # Removed bootstrap admin creation: admins should be granted via roles after onboarding

    @app.get("/")
    def root():
        # Prefer React app if built; else fallback to legacy UI
        if os.path.isdir(FRONT_DIST):
            index_path = os.path.join(FRONT_DIST, "index.html")
            if os.path.exists(index_path):
                # Serve index.html with no-cache to avoid stale shell after deployments
                return FileResponse(index_path, headers={"Cache-Control":"no-cache, no-store, must-revalidate"})
        return RedirectResponse(url="/ui/index.html")

    # After all API routers, provide SPA catch-all for deep links
    if os.path.isdir(FRONT_DIST):
        INDEX_PATH = os.path.join(FRONT_DIST, "index.html")

        @app.get("/{full_path:path}")
        def spa_fallback(full_path: str):
            # If a built asset exists, serve it; otherwise serve index.html
            asset_path = os.path.join(FRONT_DIST, full_path)
            if os.path.isfile(asset_path):
                # Cache static assets briefly; index is handled separately
                headers = {"Cache-Control":"public, max-age=3600"}
                return FileResponse(asset_path, headers=headers)
            # For SPA routes like /home, serve index.html with no-cache
            return FileResponse(INDEX_PATH, headers={"Cache-Control":"no-cache, no-store, must-revalidate"})

    return app


app = create_app()

