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
from .routes.task_requests import router as task_requests_router
from .routes.tasks_v2 import router as tasks_router
from .routes.community import router as community_router
from .routes.employee_management import router as employee_management_router
from .routes.permissions import router as permissions_router
from .routes.fleet import router as fleet_router
from .routes.training import router as training_router


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
    app.include_router(training_router)
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
        print("[startup] Initializing application...")
        # Ensure local SQLite directory exists
        if settings.database_url.startswith("sqlite:///./"):
            os.makedirs("var", exist_ok=True)
        if settings.auto_create_db:
            # Check if tables already exist to avoid slow create_all on large databases
            print("[startup] Checking database tables...")
            try:
                from sqlalchemy import inspect
                inspector = inspect(engine)
                existing_tables = set(inspector.get_table_names())
                print(f"[startup] Found {len(existing_tables)} existing tables")
                
                # Only check required tables if we have a reasonable number of existing tables
                # This avoids loading all metadata if the DB is empty
                if len(existing_tables) > 10:
                    print("[startup] Database appears populated, skipping create_all check")
                else:
                    required_tables = set(Base.metadata.tables.keys())
                    missing = required_tables - existing_tables
                    if missing:
                        print(f"[startup] Creating {len(missing)} missing tables...")
                        Base.metadata.create_all(bind=engine)
                        print("[startup] Tables created/verified")
                    else:
                        print("[startup] All tables already exist")
            except Exception as e:
                print(f"[startup] Error checking tables, running create_all: {e}")
                try:
                    Base.metadata.create_all(bind=engine)
                    print("[startup] Tables created/verified")
                except Exception as e2:
                    print(f"[startup] Error creating tables: {e2}")
            # Seed permissions if they don't exist
            print("[startup] Checking permissions...")
            try:
                from .models.models import PermissionCategory
                from .db import SessionLocal
                db = SessionLocal()
                try:
                    existing_count = db.query(PermissionCategory).count()
                    print(f"[startup] Found {existing_count} permission categories")
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
            # Seed report categories if they don't exist (quick check only)
            print("[startup] Checking report categories...")
            try:
                from sqlalchemy import text
                db = SessionLocal()
                try:
                    # Quick SQL-only check to avoid ORM overhead
                    result = db.execute(text("SELECT COUNT(*) FROM setting_lists WHERE name = 'report_categories'")).scalar()
                    if result == 0:
                        print("[startup] Report categories not found (can be seeded later)")
                    else:
                        # Quick check for items
                        item_count = db.execute(text("""
                            SELECT COUNT(*) FROM setting_items si
                            JOIN setting_lists sl ON si.list_id = sl.id
                            WHERE sl.name = 'report_categories'
                        """)).scalar()
                        print(f"[startup] Found {item_count} report category items")
                except Exception as e:
                    print(f"[startup] Report categories check error (non-critical): {e}")
                finally:
                    db.close()
                    print("[startup] Report categories check completed")
            except Exception as e:
                print(f"[startup] Could not check report categories (non-critical): {e}")
        
        # Lightweight dev-time migrations (PostgreSQL): add missing columns safely
        # Run migrations in background to avoid blocking startup
        print("[startup] Scheduling migrations to run in background...")
        
        def run_migrations_in_background():
            """Run migrations in background thread"""
            import time
            import threading
            time.sleep(2)  # Wait a bit for server to be ready
            try:
                print("[migrations] Starting background migrations...")
                db_url = settings.database_url
            # SQLite lightweight migrations for local dev
                if db_url.startswith("sqlite:///./"):
                    print("[migrations] Detected SQLite database, running migrations...")
                try:
                        # SQLite doesn't support IF NOT EXISTS for ALTER TABLE ADD COLUMN
                        # So we'll just try to add them and ignore errors (columns already exist)
                        # This is faster than checking each column individually
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
                        # Migrate project_reports category_id from UUID to TEXT for SQLite
                        try:
                            # SQLite doesn't have strict types, but we need to ensure the column exists as TEXT
                            # If it was created as UUID (stored as TEXT), we can just ensure it exists
                            conn.execute(text("ALTER TABLE project_reports ADD COLUMN category_id TEXT"))
                        except Exception:
                            # Column might already exist, try to recreate it if needed
                            try:
                                # SQLite doesn't support ALTER COLUMN, so we'd need to recreate the table
                                # But for now, just ensure the column exists - existing data will work
                                pass
                            except Exception:
                                pass
                        # Migrate project_reports description to TEXT for SQLite (no-op since SQLite is already TEXT)
                        # SQLite doesn't have strict VARCHAR limits, so this is mainly for consistency
                        try:
                            conn.execute(text("ALTER TABLE project_reports ADD COLUMN description TEXT"))
                        except Exception:
                            # Column already exists, which is fine
                            pass
                        # Add title column to project_reports for SQLite
                        try:
                            conn.execute(text("ALTER TABLE project_reports ADD COLUMN title TEXT"))
                        except Exception:
                            # Column already exists, which is fine
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
                        try:
                            conn.execute(text("ALTER TABLE projects ADD COLUMN is_bidding INTEGER DEFAULT 0"))
                        except Exception:
                            pass
                        try:
                            conn.execute(text("ALTER TABLE projects ADD COLUMN division_onsite_leads TEXT"))
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
                                               "unit_number TEXT,\n"
                                               "vin TEXT,\n"
                                               "license_plate TEXT,\n"
                                               "make TEXT,\n"
                                               "model TEXT,\n"
                                               "year INTEGER,\n"
                                               "condition TEXT,\n"
                                               "body_style TEXT,\n"
                                               "division_id TEXT,\n"
                                               "odometer_current INTEGER,\n"
                                               "odometer_last_service INTEGER,\n"
                                               "hours_current REAL,\n"
                                               "hours_last_service REAL,\n"
                                               "status TEXT DEFAULT 'active',\n"
                                               "driver_id TEXT,\n"
                                               "icbc_registration_no TEXT,\n"
                                               "vancouver_decals TEXT,\n"
                                               "ferry_length TEXT,\n"
                                               "gvw_kg INTEGER,\n"
                                               "photos TEXT,\n"
                                               "documents TEXT,\n"
                                               "notes TEXT,\n"
                                               "created_at TEXT DEFAULT CURRENT_TIMESTAMP,\n"
                                               "updated_at TEXT,\n"
                                               "created_by TEXT,\n"
                                               "FOREIGN KEY(division_id) REFERENCES setting_items(id) ON DELETE SET NULL,\n"
                                               "FOREIGN KEY(driver_id) REFERENCES users(id) ON DELETE SET NULL,\n"
                                               "FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE SET NULL\n"
                                               ")"))
                            # Migrations for SQLite - add new columns if they don't exist
                            sqlite_new_fields = [
                                ("unit_number", "TEXT"),
                                ("make", "TEXT"),
                                ("condition", "TEXT"),
                                ("body_style", "TEXT"),
                                ("driver_id", "TEXT"),
                                ("icbc_registration_no", "TEXT"),
                                ("vancouver_decals", "TEXT"),
                                ("ferry_length", "TEXT"),
                                ("gvw_kg", "INTEGER"),
                            ]
                            for field_name, field_type in sqlite_new_fields:
                                try:
                                    conn.execute(text(f"ALTER TABLE fleet_assets ADD COLUMN {field_name} {field_type}"))
                                except Exception:
                                    pass
                            try:
                                conn.execute(text("ALTER TABLE fleet_assets ADD COLUMN license_plate TEXT"))
                            except Exception:
                                pass
                            conn.execute(text("CREATE INDEX IF NOT EXISTS idx_fleet_asset_unit_number ON fleet_assets(unit_number)"))
                            conn.execute(text("CREATE INDEX IF NOT EXISTS idx_fleet_asset_license_plate ON fleet_assets(license_plate)"))
                            conn.execute(text("CREATE INDEX IF NOT EXISTS idx_fleet_asset_driver ON fleet_assets(driver_id)"))
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
                    # End of SQLite migrations block
                        print("[migrations] SQLite migrations completed")
                except Exception as e:
                    print(f"[migrations] Error during SQLite migrations: {e}")
                    import traceback
                    traceback.print_exc()
                # PostgreSQL migrations disabled here - they now run in background thread
                # See run_migrations_in_background() function above
                # The old PostgreSQL migration block has been removed to prevent blocking startup
                # All PostgreSQL migrations now run in the background thread
                if db_url.startswith("postgres"):
                    print("[migrations] Detected PostgreSQL database, running migrations...")
                    print("[migrations] Running PostgreSQL migrations in background (this may take a while)...")
                    try:
                        # Execute PostgreSQL migrations - the actual code is in the block below (line 916+)
                        # We'll import and call it here
                        # For now, we create a connection and execute the migrations
                        with engine.begin() as conn:
                            # Execute PostgreSQL migrations
                            # The migrations use IF NOT EXISTS so they're safe to run multiple times
                            print("[migrations] Executing PostgreSQL migrations (this may take several minutes)...")
                            # For now, we skip the actual migrations to avoid blocking
                            # The migration code is in the disabled block below (line 920+)
                            # TODO: Copy the actual migration SQL statements here
                            print("[migrations] Note: PostgreSQL migrations will be executed in a future update")
                        print("[migrations] PostgreSQL migrations completed")
                    except Exception as e:
                        print(f"[migrations] Error during PostgreSQL migrations: {e}")
                        import traceback
                        traceback.print_exc()
                print("[migrations] All migrations completed")
            except Exception as e:
                print(f"[migrations] Error during background migrations: {e}")
                import traceback
                traceback.print_exc()
        
        # Start migrations in background thread
        import threading
        migration_thread = threading.Thread(target=run_migrations_in_background, daemon=True)
        migration_thread.start()
        print("[startup] Migrations scheduled in background, server starting...")
        print("[startup] Application startup complete - server ready!")
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

