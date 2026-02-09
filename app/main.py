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
from .routes.quotes import router as quotes_router
from .routes.users import router as users_router
from .routes.estimate import router as estimate_router
from .routes.reviews import router as reviews_router
from .routes.chat import router as chat_router
from .routes.notifications import router as notifications_router
from .routes.company_files import router as company_files_router
from .routes.document_creator import router as document_creator_router
from .routes.orders import router as orders_router
from .routes.task_requests import router as task_requests_router
from .routes.tasks_v2 import router as tasks_router
from .routes.community import router as community_router
from .routes.employee_management import router as employee_management_router
from .routes.permissions import router as permissions_router
from .routes.fleet import router as fleet_router
from .routes.training import router as training_router
from .routes.bug_report import router as bug_report_router
from .routes.search import router as search_router


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
    app.include_router(quotes_router)
    app.include_router(users_router)
    app.include_router(estimate_router)
    app.include_router(reviews_router)
    app.include_router(chat_router)
    app.include_router(notifications_router)
    app.include_router(task_requests_router)
    app.include_router(tasks_router)
    app.include_router(community_router)
    app.include_router(company_files_router)
    app.include_router(document_creator_router)
    app.include_router(orders_router)
    app.include_router(employee_management_router)
    app.include_router(permissions_router)
    app.include_router(fleet_router)
    app.include_router(training_router)
    app.include_router(bug_report_router)
    app.include_router(search_router)
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

        # Lightweight schema safety checks / migrations (no Alembic in this repo).
        # Keep these idempotent and safe to run on every boot.
        print("[startup] Checking lightweight schema migrations...")
        try:
            from sqlalchemy import text
            from .db import SessionLocal, Base, engine
            db = SessionLocal()
            try:
                dialect = db.bind.dialect.name if getattr(db, "bind", None) is not None else ""
                
                # Ensure quotes table exists
                if dialect == "sqlite":
                    # SQLite: Check if table exists
                    try:
                        db.execute(text("SELECT 1 FROM quotes LIMIT 1")).fetchone()
                    except Exception:
                        # Table doesn't exist, create it
                        from .models.models import Quote
                        Base.metadata.create_all(bind=engine, tables=[Quote.__table__])
                        db.commit()
                        print("[startup] Created quotes table")
                else:
                    # PostgreSQL / other dialects: Check if table exists
                    rows = db.execute(
                        text(
                            """
                            SELECT 1
                            FROM information_schema.tables
                            WHERE table_name = 'quotes'
                            LIMIT 1
                            """
                        )
                    ).fetchall()
                    if not rows:
                        # Table doesn't exist, create it
                        from .models.models import Quote
                        Base.metadata.create_all(bind=engine, tables=[Quote.__table__])
                        db.commit()
                        print("[startup] Created quotes table")

                # Ensure task_log_entries table exists (Task modal activity log)
                if dialect == "sqlite":
                    try:
                        db.execute(text("SELECT 1 FROM task_log_entries LIMIT 1")).fetchone()
                    except Exception:
                        from .models.models import TaskLogEntry
                        Base.metadata.create_all(bind=engine, tables=[TaskLogEntry.__table__])
                        db.commit()
                        print("[startup] Created task_log_entries table")

                    # Ensure required columns exist (schema drift safe-guard)
                    try:
                        cols = db.execute(text("PRAGMA table_info(task_log_entries)")).fetchall()
                        col_names = {str(r[1]) for r in cols}
                        if "message" not in col_names:
                            db.execute(text("ALTER TABLE task_log_entries ADD COLUMN message TEXT NULL"))
                        if "entry_type" not in col_names:
                            db.execute(text("ALTER TABLE task_log_entries ADD COLUMN entry_type TEXT NULL"))
                        if "actor_id" not in col_names:
                            db.execute(text("ALTER TABLE task_log_entries ADD COLUMN actor_id TEXT NULL"))
                        if "actor_name" not in col_names:
                            db.execute(text("ALTER TABLE task_log_entries ADD COLUMN actor_name TEXT NULL"))
                        if "created_at" not in col_names:
                            db.execute(text("ALTER TABLE task_log_entries ADD COLUMN created_at TEXT NULL"))
                        db.commit()
                    except Exception:
                        # Best-effort only
                        pass
                else:
                    rows = db.execute(
                        text(
                            """
                            SELECT 1
                            FROM information_schema.tables
                            WHERE table_name = 'task_log_entries'
                            LIMIT 1
                            """
                        )
                    ).fetchall()
                    if not rows:
                        from .models.models import TaskLogEntry
                        Base.metadata.create_all(bind=engine, tables=[TaskLogEntry.__table__])
                        db.commit()
                        print("[startup] Created task_log_entries table")

                    # Ensure required columns exist (schema drift safe-guard)
                    try:
                        # Add columns if missing (Postgres supports IF NOT EXISTS)
                        db.execute(text("ALTER TABLE task_log_entries ADD COLUMN IF NOT EXISTS message TEXT NOT NULL DEFAULT ''"))
                        db.execute(text("ALTER TABLE task_log_entries ADD COLUMN IF NOT EXISTS entry_type VARCHAR(50) NOT NULL DEFAULT 'comment'"))
                        db.execute(text("ALTER TABLE task_log_entries ADD COLUMN IF NOT EXISTS actor_id UUID NULL"))
                        db.execute(text("ALTER TABLE task_log_entries ADD COLUMN IF NOT EXISTS actor_name VARCHAR(255) NULL"))
                        db.execute(text("ALTER TABLE task_log_entries ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()"))

                        # If legacy schema used "body", migrate to "message" and make body nullable
                        body_exists = db.execute(
                            text(
                                """
                                SELECT 1
                                FROM information_schema.columns
                                WHERE table_name = 'task_log_entries'
                                  AND column_name = 'body'
                                LIMIT 1
                                """
                            )
                        ).fetchall()
                        if body_exists:
                            # Migrate data from body to message
                            db.execute(text("UPDATE task_log_entries SET message = body WHERE (message IS NULL OR message = '') AND body IS NOT NULL"))
                            # Make body nullable to avoid constraint violations
                            db.execute(text("ALTER TABLE task_log_entries ALTER COLUMN body DROP NOT NULL"))
                        db.commit()
                    except Exception as e:
                        print(f"[startup] task_log_entries schema check error (non-critical): {e}")
                
                # Check for source_attendance_id column in project_time_entries
                has_col = False
                if dialect == "sqlite":
                    rows = db.execute(text("PRAGMA table_info(project_time_entries)")).fetchall()
                    col_names = {str(r[1]) for r in rows}  # (cid, name, type, notnull, dflt_value, pk)
                    has_col = "source_attendance_id" in col_names
                    if not has_col:
                        db.execute(text("ALTER TABLE project_time_entries ADD COLUMN source_attendance_id TEXT NULL"))
                        try:
                            db.execute(text("CREATE INDEX IF NOT EXISTS idx_project_time_entries_source_attendance_id ON project_time_entries(source_attendance_id)"))
                        except Exception:
                            pass
                        db.commit()
                else:
                    # PostgreSQL / other dialects
                    rows = db.execute(
                        text(
                            """
                            SELECT 1
                            FROM information_schema.columns
                            WHERE table_name = 'project_time_entries'
                              AND column_name = 'source_attendance_id'
                            LIMIT 1
                            """
                        )
                    ).fetchall()
                    has_col = bool(rows)
                    if not has_col:
                        db.execute(text("ALTER TABLE project_time_entries ADD COLUMN source_attendance_id UUID NULL"))
                        try:
                            db.execute(text("CREATE INDEX IF NOT EXISTS idx_project_time_entries_source_attendance_id ON project_time_entries(source_attendance_id)"))
                        except Exception:
                            pass
                        # Best-effort FK for non-sqlite databases
                        try:
                            db.execute(
                                text(
                                    """
                                    ALTER TABLE project_time_entries
                                    ADD CONSTRAINT fk_project_time_entries_source_attendance
                                    FOREIGN KEY (source_attendance_id)
                                    REFERENCES attendance(id)
                                    ON DELETE SET NULL
                                    """
                                )
                            )
                        except Exception:
                            # Constraint may already exist or DB may not support it as written
                            pass
                        db.commit()
                
                # Check for cloth_size and cloth_sizes_custom columns in employee_profiles
                if dialect == "sqlite":
                    rows = db.execute(text("PRAGMA table_info(employee_profiles)")).fetchall()
                    col_names = {str(r[1]) for r in rows}
                    if "cloth_size" not in col_names:
                        db.execute(text("ALTER TABLE employee_profiles ADD COLUMN cloth_size TEXT NULL"))
                    if "cloth_sizes_custom" not in col_names:
                        db.execute(text("ALTER TABLE employee_profiles ADD COLUMN cloth_sizes_custom TEXT NULL"))
                    db.commit()
                else:
                    # PostgreSQL / other dialects
                    # Check cloth_size column
                    rows = db.execute(
                        text(
                            """
                            SELECT 1
                            FROM information_schema.columns
                            WHERE table_name = 'employee_profiles'
                              AND column_name = 'cloth_size'
                            LIMIT 1
                            """
                        )
                    ).fetchall()
                    if not rows:
                        db.execute(text("ALTER TABLE employee_profiles ADD COLUMN cloth_size VARCHAR(50) NULL"))
                    
                    # Check cloth_sizes_custom column
                    rows = db.execute(
                        text(
                            """
                            SELECT 1
                            FROM information_schema.columns
                            WHERE table_name = 'employee_profiles'
                              AND column_name = 'cloth_sizes_custom'
                            LIMIT 1
                            """
                        )
                    ).fetchall()
                    if not rows:
                        db.execute(text("ALTER TABLE employee_profiles ADD COLUMN cloth_sizes_custom JSON NULL"))
                    
                    db.commit()
                
                # Check for project_division_percentages column in projects
                if dialect == "sqlite":
                    rows = db.execute(text("PRAGMA table_info(projects)")).fetchall()
                    col_names = {str(r[1]) for r in rows}
                    if "project_division_percentages" not in col_names:
                        db.execute(text("ALTER TABLE projects ADD COLUMN project_division_percentages TEXT NULL"))
                        db.commit()
                        print("[startup] Added project_division_percentages column to projects table")
                else:
                    # PostgreSQL / other dialects
                    rows = db.execute(
                        text(
                            """
                            SELECT 1
                            FROM information_schema.columns
                            WHERE table_name = 'projects'
                              AND column_name = 'project_division_percentages'
                            LIMIT 1
                            """
                        )
                    ).fetchall()
                    if not rows:
                        db.execute(text("ALTER TABLE projects ADD COLUMN project_division_percentages JSON NULL"))
                        db.commit()
                        print("[startup] Added project_division_percentages column to projects table")
                
                # Check for estimator_ids column in projects
                if dialect == "sqlite":
                    rows = db.execute(text("PRAGMA table_info(projects)")).fetchall()
                    col_names = {str(r[1]) for r in rows}
                    if "estimator_ids" not in col_names:
                        db.execute(text("ALTER TABLE projects ADD COLUMN estimator_ids TEXT NULL"))
                        db.commit()
                        print("[startup] Added estimator_ids column to projects table")
                else:
                    # PostgreSQL / other dialects
                    rows = db.execute(
                        text(
                            """
                            SELECT 1
                            FROM information_schema.columns
                            WHERE table_name = 'projects'
                              AND column_name = 'estimator_ids'
                            LIMIT 1
                            """
                        )
                    ).fetchall()
                    if not rows:
                        db.execute(text("ALTER TABLE projects ADD COLUMN estimator_ids JSON NULL"))
                        db.commit()
                        print("[startup] Added estimator_ids column to projects table")
                
                # Check for project_admin_id column in projects
                if dialect == "sqlite":
                    rows = db.execute(text("PRAGMA table_info(projects)")).fetchall()
                    col_names = {str(r[1]) for r in rows}
                    if "project_admin_id" not in col_names:
                        db.execute(text("ALTER TABLE projects ADD COLUMN project_admin_id TEXT NULL"))
                        db.commit()
                        print("[startup] Added project_admin_id column to projects table")
                else:
                    # PostgreSQL / other dialects
                    rows = db.execute(
                        text(
                            """
                            SELECT 1
                            FROM information_schema.columns
                            WHERE table_name = 'projects'
                              AND column_name = 'project_admin_id'
                            LIMIT 1
                            """
                        )
                    ).fetchall()
                    if not rows:
                        db.execute(text("ALTER TABLE projects ADD COLUMN project_admin_id UUID NULL"))
                        db.commit()
                        print("[startup] Added project_admin_id column to projects table")
                
                print("[startup] Schema migrations check completed")
            except Exception as e:
                print(f"[startup] Schema migrations check error (non-critical): {e}")
            finally:
                db.close()
        except Exception as e:
            print(f"[startup] Could not run schema migrations check (non-critical): {e}")
        
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
        
        print("[startup] Application startup complete - server ready!")

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
