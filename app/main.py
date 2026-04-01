import os
from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse, FileResponse, JSONResponse
from fastapi.exceptions import HTTPException as FastAPIHTTPException, RequestValidationError
from prometheus_fastapi_instrumentator import Instrumentator
from slowapi import Limiter
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from .config import settings
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
from .routes.admin_system import router as admin_system_router
from .routes.onboarding import me_router as onboarding_me_router, router as onboarding_router


def create_app() -> FastAPI:
    setup_logging()
    app = FastAPI(title=settings.app_name)

    # Middlewares
    app.add_middleware(RequestIdMiddleware)
    origins = [o.strip() for o in settings.allowed_origins.split(",")] if settings.allowed_origins.strip() else ["*"]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    limiter = Limiter(key_func=get_remote_address, default_limits=[settings.rate_limit])
    app.state.limiter = limiter

    def rate_limit_handler(request, exc: RateLimitExceeded):
        return JSONResponse(
            status_code=429,
            content={"detail": "Too many requests"},
            headers={"Retry-After": "60"},
        )
    app.add_exception_handler(RateLimitExceeded, rate_limit_handler)
    app.add_middleware(SlowAPIMiddleware)

    def _log_request_error(request: Request, status_code: int, detail: str, level: str = "warning"):
        try:
            db = SessionLocal()
            try:
                from .services.system_log import write_system_log
                request_id = getattr(request.state, "request_id", None) if request else None
                write_system_log(
                    db,
                    level=level,
                    category="request_error",
                    message=detail or f"HTTP {status_code}",
                    request_id=request_id,
                    path=request.url.path if request else None,
                    method=request.method if request else None,
                    status_code=status_code,
                    detail=detail[:500] if detail else None,
                )
            finally:
                db.close()
        except Exception:
            pass

    @app.exception_handler(FastAPIHTTPException)
    async def http_exception_handler(request: Request, exc: FastAPIHTTPException):
        level = "error" if exc.status_code >= 500 else "warning"
        _log_request_error(request, exc.status_code, exc.detail or "", level)
        return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail or "Error"})

    @app.exception_handler(Exception)
    async def generic_exception_handler(request: Request, exc: Exception):
        if isinstance(exc, RequestValidationError):
            return JSONResponse(status_code=422, content={"detail": exc.errors()})
        _log_request_error(request, 500, str(exc)[:500], "error")
        return JSONResponse(status_code=500, content={"detail": "Internal server error"})

    # Security headers (X-Frame-Options, X-Content-Type-Options, HSTS when HTTPS)
    @app.middleware("http")
    async def add_security_headers(request, call_next):
        response = await call_next(request)
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-Content-Type-Options"] = "nosniff"
        if settings.public_base_url.strip().lower().startswith("https://"):
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        return response

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
    app.include_router(admin_system_router)
    app.include_router(onboarding_router)
    app.include_router(onboarding_me_router)
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
        # Production (Render) uses PostgreSQL only. Schema migrations run only for PostgreSQL.
        # Lightweight schema safety checks / migrations (no Alembic in this repo).
        # Keep these idempotent and safe to run on every boot.
        print("[startup] Checking lightweight schema migrations...")
        try:
            from sqlalchemy import text
            from .db import SessionLocal, Base, engine
            db = SessionLocal()
            try:
                dialect = db.bind.dialect.name if getattr(db, "bind", None) is not None else ""
                if dialect != "postgresql" and "postgresql" not in dialect:
                    print("[startup] Skipping schema migrations (non-PostgreSQL). Production requires PostgreSQL.")
                else:
                    # Ensure quotes table exists
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
                        from .models.models import Quote
                        Base.metadata.create_all(bind=engine, tables=[Quote.__table__])
                        db.commit()
                        print("[startup] Created quotes table")

                    # Ensure user_home_dashboard table exists
                    rows = db.execute(
                        text(
                            """
                            SELECT 1
                            FROM information_schema.tables
                            WHERE table_name = 'user_home_dashboard'
                            LIMIT 1
                            """
                        )
                    ).fetchall()
                    if not rows:
                        from .models.models import UserHomeDashboard
                        Base.metadata.create_all(bind=engine, tables=[UserHomeDashboard.__table__])
                        db.commit()
                        print("[startup] Created user_home_dashboard table")

                    # Ensure task_log_entries table exists (Task modal activity log)
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
                        db.execute(text("ALTER TABLE task_log_entries ADD COLUMN IF NOT EXISTS message TEXT NOT NULL DEFAULT ''"))
                        db.execute(text("ALTER TABLE task_log_entries ADD COLUMN IF NOT EXISTS entry_type VARCHAR(50) NOT NULL DEFAULT 'comment'"))
                        db.execute(text("ALTER TABLE task_log_entries ADD COLUMN IF NOT EXISTS actor_id UUID NULL"))
                        db.execute(text("ALTER TABLE task_log_entries ADD COLUMN IF NOT EXISTS actor_name VARCHAR(255) NULL"))
                        db.execute(text("ALTER TABLE task_log_entries ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()"))

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
                            db.execute(text("UPDATE task_log_entries SET message = body WHERE (message IS NULL OR message = '') AND body IS NOT NULL"))
                            db.execute(text("ALTER TABLE task_log_entries ALTER COLUMN body DROP NOT NULL"))
                        db.commit()
                    except Exception as e:
                        print(f"[startup] task_log_entries schema check error (non-critical): {e}")

                    # Check for source_attendance_id column in project_time_entries
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
                    if not rows:
                        db.execute(text("ALTER TABLE project_time_entries ADD COLUMN source_attendance_id UUID NULL"))
                        try:
                            db.execute(text("CREATE INDEX IF NOT EXISTS idx_project_time_entries_source_attendance_id ON project_time_entries(source_attendance_id)"))
                        except Exception:
                            pass
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
                            pass
                        db.commit()

                    # Check for cloth_size and cloth_sizes_custom columns in employee_profiles
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

                    rows = db.execute(
                        text(
                            """
                            SELECT 1
                            FROM information_schema.columns
                            WHERE table_name = 'employee_profiles'
                              AND column_name = 'bamboo_files_last_sync_at'
                            LIMIT 1
                            """
                        )
                    ).fetchall()
                    if not rows:
                        db.execute(
                            text(
                                "ALTER TABLE employee_profiles ADD COLUMN bamboo_files_last_sync_at TIMESTAMPTZ NULL"
                            )
                        )

                    db.commit()

                    # Check for project_division_percentages column in projects
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

                    # Awarded date (set on opportunity → project conversion; editable via API)
                    rows = db.execute(
                        text(
                            """
                            SELECT 1
                            FROM information_schema.columns
                            WHERE table_name = 'projects'
                              AND column_name = 'date_awarded'
                            LIMIT 1
                            """
                        )
                    ).fetchall()
                    if not rows:
                        db.execute(text("ALTER TABLE projects ADD COLUMN date_awarded TIMESTAMPTZ NULL"))
                        db.commit()
                        print("[startup] Added date_awarded column to projects table")

                    # Business line: Construction vs Repairs & Maintenance
                    rows = db.execute(
                        text(
                            """
                            SELECT 1
                            FROM information_schema.columns
                            WHERE table_name = 'projects'
                              AND column_name = 'business_line'
                            LIMIT 1
                            """
                        )
                    ).fetchall()
                    if not rows:
                        db.execute(text("ALTER TABLE projects ADD COLUMN business_line VARCHAR(50) NULL"))
                        try:
                            db.execute(text("CREATE INDEX IF NOT EXISTS idx_projects_business_line ON projects(business_line)"))
                        except Exception:
                            pass
                        db.commit()
                        print("[startup] Added business_line column to projects table")
                    try:
                        from .services.business_line import backfill_business_line_column

                        n_null = db.execute(text("SELECT COUNT(*) FROM projects WHERE business_line IS NULL")).scalar() or 0
                        if int(n_null) > 0:
                            backfill_business_line_column(db, do_commit=False)
                            db.execute(text("UPDATE projects SET business_line = 'construction' WHERE business_line IS NULL"))
                        db.execute(text("ALTER TABLE projects ALTER COLUMN business_line SET DEFAULT 'construction'"))
                        try:
                            db.execute(text("ALTER TABLE projects ALTER COLUMN business_line SET NOT NULL"))
                        except Exception:
                            pass
                        try:
                            db.execute(text("CREATE INDEX IF NOT EXISTS idx_projects_business_line ON projects(business_line)"))
                        except Exception:
                            pass
                        db.commit()
                        print("[startup] business_line backfill / constraints OK")
                    except Exception as e:
                        print(f"[startup] business_line migration (non-critical): {e}")
                        db.rollback()

                    # Check for project_id column in user_documents
                    rows = db.execute(
                        text(
                            """
                            SELECT 1
                            FROM information_schema.columns
                            WHERE table_name = 'user_documents'
                              AND column_name = 'project_id'
                            LIMIT 1
                            """
                        )
                    ).fetchall()
                    if not rows:
                        db.execute(text("ALTER TABLE user_documents ADD COLUMN project_id UUID NULL REFERENCES projects(id) ON DELETE SET NULL"))
                        try:
                            db.execute(text("CREATE INDEX IF NOT EXISTS idx_user_documents_project_id ON user_documents(project_id)"))
                        except Exception:
                            pass
                        db.commit()
                        print("[startup] Added project_id column to user_documents table")

                    # Create document_types table
                    db.execute(text("""
                        CREATE TABLE IF NOT EXISTS document_types (
                            id UUID PRIMARY KEY,
                            name VARCHAR(255) NOT NULL,
                            description VARCHAR(500),
                            category VARCHAR(100),
                            page_templates JSON,
                            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
                        )
                    """))
                    db.commit()
                    try:
                        rows = db.execute(text(
                            "SELECT 1 FROM information_schema.columns WHERE table_name = 'document_types' AND column_name = 'category' LIMIT 1"
                        )).fetchall()
                        if not rows:
                            db.execute(text("ALTER TABLE document_types ADD COLUMN category VARCHAR(100)"))
                            db.commit()
                            print("[startup] Added category column to document_types table")
                    except Exception:
                        pass
                    print("[startup] document_types table ready")

                    # Onboarding (Step 2 documents, packages, signing)
                    rows = db.execute(
                        text(
                            "SELECT 1 FROM information_schema.tables WHERE table_name = 'onboarding_base_documents' LIMIT 1"
                        )
                    ).fetchall()
                    if not rows:
                        from .models.models import (
                            OnboardingAssignment,
                            OnboardingAssignmentItem,
                            OnboardingBaseDocument,
                            OnboardingPackage,
                            OnboardingPackageItem,
                            OnboardingSignedDocument,
                            OnboardingTrigger,
                        )

                        Base.metadata.create_all(
                            bind=engine,
                            tables=[
                                OnboardingBaseDocument.__table__,
                                OnboardingPackage.__table__,
                                OnboardingPackageItem.__table__,
                                OnboardingTrigger.__table__,
                                OnboardingAssignment.__table__,
                                OnboardingAssignmentItem.__table__,
                                OnboardingSignedDocument.__table__,
                            ],
                        )
                        db.commit()
                        print("[startup] Created onboarding_* tables")

                    def _onb_col(table: str, col: str) -> bool:
                        return bool(
                            db.execute(
                                text(
                                    "SELECT 1 FROM information_schema.columns "
                                    "WHERE table_schema = 'public' AND table_name = :t AND column_name = :c LIMIT 1"
                                ),
                                {"t": table, "c": col},
                            ).fetchall()
                        )

                    if db.execute(
                        text("SELECT 1 FROM information_schema.tables WHERE table_name = 'onboarding_package_items' LIMIT 1")
                    ).fetchall():
                        for tbl, col, ddl in [
                            ("onboarding_package_items", "display_name", "VARCHAR(255)"),
                            ("onboarding_package_items", "notification_message", "VARCHAR(4000)"),
                            ("onboarding_package_items", "delivery_mode", "VARCHAR(20) NOT NULL DEFAULT 'on_hire'"),
                            ("onboarding_package_items", "delivery_amount", "INTEGER"),
                            ("onboarding_package_items", "delivery_unit", "VARCHAR(16)"),
                            ("onboarding_package_items", "delivery_direction", "VARCHAR(16)"),
                            (
                                "onboarding_package_items",
                                "requires_signature",
                                "BOOLEAN NOT NULL DEFAULT true",
                            ),
                            ("onboarding_package_items", "notification_policy", "JSONB"),
                        ]:
                            if not _onb_col(tbl, col):
                                db.execute(text(f"ALTER TABLE {tbl} ADD COLUMN {col} {ddl}"))
                                db.commit()
                                print(f"[startup] Added {tbl}.{col}")
                        if not _onb_col("onboarding_package_items", "applies_to_mode") and not _onb_col(
                            "onboarding_package_items", "recipient_scope"
                        ):
                            db.execute(text("ALTER TABLE onboarding_package_items ADD COLUMN applies_to_mode VARCHAR(20)"))
                            db.execute(text("ALTER TABLE onboarding_package_items ADD COLUMN applies_to_division_ids JSONB"))
                            db.commit()
                            print("[startup] Added onboarding_package_items applies_to_* (legacy)")
                            import json as _json

                            pkg_rows = db.execute(text("SELECT id FROM onboarding_packages")).fetchall()
                            for (pid,) in pkg_rows:
                                tr = db.execute(
                                    text(
                                        "SELECT condition_type, condition_value FROM onboarding_triggers WHERE package_id = :p"
                                    ),
                                    {"p": pid},
                                ).fetchall()
                                item_rows = db.execute(
                                    text("SELECT id FROM onboarding_package_items WHERE package_id = :p"),
                                    {"p": pid},
                                ).fetchall()
                                if not item_rows:
                                    continue
                                has_all = any((str(t[0] or "").lower() == "all") for t in tr)
                                if has_all:
                                    mode, div_json = "all", "[]"
                                elif tr:
                                    union_ids = []
                                    seen = set()
                                    for t in tr:
                                        if str(t[0] or "").lower() != "division":
                                            continue
                                        cv = t[1]
                                        if isinstance(cv, str):
                                            try:
                                                cv = _json.loads(cv) if cv else {}
                                            except Exception:
                                                cv = {}
                                        elif not isinstance(cv, dict):
                                            cv = {}
                                        for x in cv.get("division_ids") or []:
                                            s = str(x)
                                            if s not in seen:
                                                seen.add(s)
                                                union_ids.append(s)
                                    mode = "division"
                                    div_json = _json.dumps(union_ids)
                                else:
                                    mode = "division"
                                    div_json = "[]"
                                db.execute(
                                    text(
                                        """
                                        UPDATE onboarding_package_items
                                        SET applies_to_mode = :m,
                                            applies_to_division_ids = CAST(:j AS JSONB)
                                        WHERE package_id = :p
                                        """
                                    ),
                                    {"m": mode, "j": div_json, "p": pid},
                                )
                            db.execute(
                                text(
                                    "UPDATE onboarding_package_items SET applies_to_mode = 'all' "
                                    "WHERE applies_to_mode IS NULL"
                                )
                            )
                            db.execute(
                                text(
                                    "UPDATE onboarding_package_items SET applies_to_division_ids = '[]'::jsonb "
                                    "WHERE applies_to_division_ids IS NULL"
                                )
                            )
                            db.execute(
                                text(
                                    "ALTER TABLE onboarding_package_items ALTER COLUMN applies_to_mode SET DEFAULT 'all'"
                                )
                            )
                            db.execute(
                                text(
                                    "ALTER TABLE onboarding_package_items ALTER COLUMN applies_to_mode SET NOT NULL"
                                )
                            )
                            db.commit()
                            print("[startup] Migrated package item applies_to from triggers (legacy)")
                        if not _onb_col("onboarding_package_items", "recipient_scope"):
                            db.execute(
                                text("ALTER TABLE onboarding_package_items ADD COLUMN recipient_scope VARCHAR(24)")
                            )
                            db.execute(text("ALTER TABLE onboarding_package_items ADD COLUMN recipient_user_ids JSONB"))
                            db.commit()
                            has_applies = _onb_col("onboarding_package_items", "applies_to_mode")
                            has_assign = _onb_col("onboarding_package_items", "assign_to")
                            if has_applies and has_assign:
                                db.execute(
                                    text(
                                        """
                                        UPDATE onboarding_package_items SET
                                          recipient_user_ids = '[]'::jsonb,
                                          recipient_scope = CASE
                                            WHEN LOWER(TRIM(COALESCE(applies_to_mode, 'all'))) = 'division'
                                              THEN 'specific_users'
                                            WHEN LOWER(TRIM(COALESCE(assign_to, 'employee'))) = 'manager'
                                              THEN 'specific_users'
                                            ELSE 'everyone'
                                          END
                                        """
                                    )
                                )
                            elif has_applies:
                                db.execute(
                                    text(
                                        """
                                        UPDATE onboarding_package_items SET
                                          recipient_user_ids = '[]'::jsonb,
                                          recipient_scope = CASE
                                            WHEN LOWER(TRIM(COALESCE(applies_to_mode, 'all'))) = 'division'
                                              THEN 'specific_users'
                                            ELSE 'everyone'
                                          END
                                        """
                                    )
                                )
                            elif has_assign:
                                db.execute(
                                    text(
                                        """
                                        UPDATE onboarding_package_items SET
                                          recipient_user_ids = '[]'::jsonb,
                                          recipient_scope = CASE
                                            WHEN LOWER(TRIM(COALESCE(assign_to, 'employee'))) = 'manager'
                                              THEN 'specific_users'
                                            ELSE 'everyone'
                                          END
                                        """
                                    )
                                )
                            else:
                                db.execute(
                                    text(
                                        "UPDATE onboarding_package_items SET recipient_scope = 'everyone', "
                                        "recipient_user_ids = '[]'::jsonb"
                                    )
                                )
                            db.execute(text("UPDATE onboarding_package_items SET recipient_user_ids = '[]'::jsonb WHERE recipient_user_ids IS NULL"))
                            db.execute(text("UPDATE onboarding_package_items SET recipient_scope = 'everyone' WHERE recipient_scope IS NULL OR recipient_scope = ''"))
                            db.execute(
                                text(
                                    "ALTER TABLE onboarding_package_items ALTER COLUMN recipient_scope SET DEFAULT 'everyone'"
                                )
                            )
                            db.execute(
                                text(
                                    "ALTER TABLE onboarding_package_items ALTER COLUMN recipient_scope SET NOT NULL"
                                )
                            )
                            db.commit()
                            print("[startup] Migrated onboarding_package_items to recipient_scope / recipient_user_ids")
                        for legacy_col in ("assign_to", "applies_to_mode", "applies_to_division_ids"):
                            if _onb_col("onboarding_package_items", legacy_col):
                                try:
                                    db.execute(
                                        text(f"ALTER TABLE onboarding_package_items DROP COLUMN {legacy_col}")
                                    )
                                    db.commit()
                                    print(f"[startup] Dropped onboarding_package_items.{legacy_col}")
                                except Exception as _e:
                                    print(f"[startup] Could not drop onboarding_package_items.{legacy_col}: {_e}")
                        if not _onb_col("onboarding_package_items", "signing_deadline_days"):
                            db.execute(
                                text("ALTER TABLE onboarding_package_items ADD COLUMN signing_deadline_days INTEGER")
                            )
                            db.commit()
                            db.execute(
                                text(
                                    """
                                    UPDATE onboarding_package_items AS i
                                    SET signing_deadline_days = COALESCE(
                                      (SELECT b.default_deadline_days FROM onboarding_base_documents AS b
                                       WHERE b.id = i.base_document_id),
                                      7
                                    )
                                    """
                                )
                            )
                            db.execute(
                                text(
                                    "UPDATE onboarding_package_items SET signing_deadline_days = 7 "
                                    "WHERE signing_deadline_days IS NULL"
                                )
                            )
                            db.execute(
                                text(
                                    "ALTER TABLE onboarding_package_items ALTER COLUMN signing_deadline_days SET DEFAULT 7"
                                )
                            )
                            db.execute(
                                text(
                                    "ALTER TABLE onboarding_package_items ALTER COLUMN signing_deadline_days SET NOT NULL"
                                )
                            )
                            db.commit()
                            print("[startup] Added onboarding_package_items.signing_deadline_days")
                    if db.execute(
                        text("SELECT 1 FROM information_schema.tables WHERE table_name = 'onboarding_assignment_items' LIMIT 1")
                    ).fetchall():
                        if not _onb_col("onboarding_assignment_items", "available_at"):
                            db.execute(text("ALTER TABLE onboarding_assignment_items ADD COLUMN available_at TIMESTAMP WITH TIME ZONE"))
                            db.execute(
                                text(
                                    """
                                    UPDATE onboarding_assignment_items AS i
                                    SET available_at = a.assigned_at
                                    FROM onboarding_assignments AS a
                                    WHERE i.assignment_id = a.id AND i.available_at IS NULL
                                    """
                                )
                            )
                            db.execute(text("UPDATE onboarding_assignment_items SET available_at = NOW() WHERE available_at IS NULL"))
                            db.execute(
                                text(
                                    "ALTER TABLE onboarding_assignment_items ALTER COLUMN available_at SET NOT NULL"
                                )
                            )
                            db.commit()
                            print("[startup] Added onboarding_assignment_items.available_at")
                        for tbl, col, ddl in [
                            ("onboarding_assignment_items", "display_name", "VARCHAR(255)"),
                            ("onboarding_assignment_items", "user_message", "VARCHAR(4000)"),
                        ]:
                            if not _onb_col(tbl, col):
                                db.execute(text(f"ALTER TABLE {tbl} ADD COLUMN {col} {ddl}"))
                                db.commit()
                                print(f"[startup] Added {tbl}.{col}")
                        if not _onb_col("onboarding_assignment_items", "subject_user_id"):
                            db.execute(
                                text(
                                    "ALTER TABLE onboarding_assignment_items ADD COLUMN subject_user_id UUID REFERENCES users(id) ON DELETE SET NULL"
                                )
                            )
                            db.commit()
                            print("[startup] Added onboarding_assignment_items.subject_user_id")

                    # Onboarding base document preferences (per-doc, no package UI)
                    if db.execute(
                        text("SELECT 1 FROM information_schema.tables WHERE table_name = 'onboarding_base_documents' LIMIT 1")
                    ).fetchall():
                        for tbl, col, ddl in [
                            ("onboarding_base_documents", "assignee_type", "VARCHAR(20) NOT NULL DEFAULT 'employee'"),
                            ("onboarding_base_documents", "assignee_user_id", "UUID REFERENCES users(id) ON DELETE SET NULL"),
                            ("onboarding_base_documents", "assignee_user_ids", "JSONB"),
                            ("onboarding_base_documents", "required", "BOOLEAN NOT NULL DEFAULT true"),
                            ("onboarding_base_documents", "employee_visible", "BOOLEAN NOT NULL DEFAULT true"),
                            ("onboarding_base_documents", "sort_order", "INTEGER NOT NULL DEFAULT 0"),
                            ("onboarding_base_documents", "display_name", "VARCHAR(255)"),
                            ("onboarding_base_documents", "notification_message", "VARCHAR(4000)"),
                            ("onboarding_base_documents", "delivery_mode", "VARCHAR(20) NOT NULL DEFAULT 'on_hire'"),
                            ("onboarding_base_documents", "delivery_amount", "INTEGER"),
                            ("onboarding_base_documents", "delivery_unit", "VARCHAR(16)"),
                            ("onboarding_base_documents", "delivery_direction", "VARCHAR(16)"),
                            ("onboarding_base_documents", "requires_signature", "BOOLEAN NOT NULL DEFAULT true"),
                            ("onboarding_base_documents", "notification_policy", "JSONB"),
                            ("onboarding_base_documents", "signing_deadline_days", "INTEGER NOT NULL DEFAULT 7"),
                            ("onboarding_base_documents", "signature_template", "JSONB"),
                        ]:
                            if not _onb_col(tbl, col):
                                db.execute(text(f"ALTER TABLE {tbl} ADD COLUMN {col} {ddl}"))
                                db.commit()
                                print(f"[startup] Added {tbl}.{col}")
                        try:
                            db.execute(
                                text(
                                    """
                                    UPDATE onboarding_base_documents SET signing_deadline_days = default_deadline_days
                                    WHERE signing_deadline_days IS NOT NULL AND default_deadline_days IS NOT NULL
                                    """
                                )
                            )
                            db.commit()
                        except Exception:
                            pass
                        try:
                            db.execute(
                                text(
                                    """
                                    UPDATE onboarding_base_documents
                                    SET assignee_user_ids = jsonb_build_array(assignee_user_id::text)
                                    WHERE assignee_user_id IS NOT NULL
                                      AND (assignee_user_ids IS NULL OR assignee_user_ids = '[]'::jsonb)
                                    """
                                )
                            )
                            db.commit()
                        except Exception:
                            pass
                        try:
                            rows_pkg = db.execute(
                                text("SELECT 1 FROM onboarding_packages WHERE name = 'HR Onboarding' LIMIT 1")
                            ).fetchall()
                            if not rows_pkg:
                                db.execute(
                                    text(
                                        """
                                        INSERT INTO onboarding_packages (id, name, description, active, created_at)
                                        VALUES (gen_random_uuid(), 'HR Onboarding', 'System package for onboarding base documents', true, NOW())
                                        """
                                    )
                                )
                                db.commit()
                                print("[startup] Seeded HR Onboarding system package")
                        except Exception as _e:
                            print(f"[startup] HR Onboarding package seed skipped: {_e}")
                        try:
                            if not _onb_col("onboarding_packages", "document_delivery_enabled"):
                                db.execute(
                                    text(
                                        "ALTER TABLE onboarding_packages ADD COLUMN document_delivery_enabled BOOLEAN NOT NULL DEFAULT true"
                                    )
                                )
                                db.commit()
                                print("[startup] Added onboarding_packages.document_delivery_enabled")
                        except Exception as _e:
                            print(f"[startup] onboarding_packages.document_delivery_enabled migration: {_e}")

                    # Project folders
                    db.execute(text("""
                        CREATE TABLE IF NOT EXISTS project_folders (
                            id UUID PRIMARY KEY,
                            project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
                            category VARCHAR(100) NOT NULL,
                            parent_id UUID REFERENCES project_folders(id) ON DELETE CASCADE,
                            name VARCHAR(255) NOT NULL,
                            sort_index INTEGER NOT NULL DEFAULT 0,
                            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
                        )
                    """))
                    db.execute(text("CREATE INDEX IF NOT EXISTS idx_project_folders_project_id ON project_folders(project_id)"))
                    db.commit()
                    try:
                        rows = db.execute(text(
                            "SELECT 1 FROM information_schema.columns WHERE table_name = 'client_files' AND column_name = 'folder_id' LIMIT 1"
                        )).fetchall()
                        if not rows:
                            db.execute(text("ALTER TABLE client_files ADD COLUMN folder_id UUID REFERENCES project_folders(id) ON DELETE SET NULL"))
                            db.commit()
                            print("[startup] Added folder_id column to client_files")
                    except Exception:
                        pass

                    # Ensure permission_templates table exists
                    rows = db.execute(
                        text(
                            """
                            SELECT 1
                            FROM information_schema.tables
                            WHERE table_name = 'permission_templates'
                            LIMIT 1
                            """
                        )
                    ).fetchall()
                    if not rows:
                        from .models.models import PermissionTemplate
                        Base.metadata.create_all(bind=engine, tables=[PermissionTemplate.__table__])
                        db.commit()
                        print("[startup] Created permission_templates table")

                    # Ensure system_logs table exists
                    rows = db.execute(
                        text(
                            """
                            SELECT 1
                            FROM information_schema.tables
                            WHERE table_name = 'system_logs'
                            LIMIT 1
                            """
                        )
                    ).fetchall()
                    if not rows:
                        from .models.models import SystemLog
                        Base.metadata.create_all(bind=engine, tables=[SystemLog.__table__])
                        db.commit()
                        print("[startup] Created system_logs table")

                    # Ensure work_order_files table exists (work order file attachments with categories)
                    rows = db.execute(
                        text(
                            """
                            SELECT 1
                            FROM information_schema.tables
                            WHERE table_name = 'work_order_files'
                            LIMIT 1
                            """
                        )
                    ).fetchall()
                    if not rows:
                        from .models.models import WorkOrderFile
                        Base.metadata.create_all(bind=engine, tables=[WorkOrderFile.__table__])
                        db.commit()
                        print("[startup] Created work_order_files table")

                    # Ensure work_order_activity_logs table exists
                    rows = db.execute(
                        text(
                            """
                            SELECT 1
                            FROM information_schema.tables
                            WHERE table_name = 'work_order_activity_logs'
                            LIMIT 1
                            """
                        )
                    ).fetchall()
                    if not rows:
                        from .models.models import WorkOrderActivityLog
                        Base.metadata.create_all(bind=engine, tables=[WorkOrderActivityLog.__table__])
                        db.commit()
                        print("[startup] Created work_order_activity_logs table")

                    # Manual HR training records (not LMS)
                    rows = db.execute(
                        text(
                            """
                            SELECT 1
                            FROM information_schema.tables
                            WHERE table_name = 'employee_training_records'
                            LIMIT 1
                            """
                        )
                    ).fetchall()
                    if not rows:
                        from .models.models import EmployeeTrainingRecord
                        Base.metadata.create_all(bind=engine, tables=[EmployeeTrainingRecord.__table__])
                        db.commit()
                        print("[startup] Created employee_training_records table")

                    # Soft delete columns (if missing)
                    for table_name, fk_col in [("projects", "deleted_by_id"), ("clients", "deleted_by_id"), ("proposals", "deleted_by_id"), ("quotes", "deleted_by_id")]:
                        try:
                            rows = db.execute(text("""
                                SELECT column_name FROM information_schema.columns
                                WHERE table_schema = 'public' AND table_name = :t AND column_name = 'deleted_at'
                            """), {"t": table_name}).fetchall()
                            if not rows:
                                db.execute(text(f"ALTER TABLE {table_name} ADD COLUMN deleted_at TIMESTAMP WITH TIME ZONE"))
                                db.execute(text(f"ALTER TABLE {table_name} ADD COLUMN {fk_col} UUID REFERENCES users(id) ON DELETE SET NULL"))
                                db.commit()
                                print(f"[startup] Added soft delete columns to {table_name}")
                        except Exception:
                            pass

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

    # After all API routers, serve built JS/CSS with correct MIME types and avoid
    # returning index.html for missing *.js (which breaks dynamic imports with "text/html" MIME).
    if os.path.isdir(FRONT_DIST):
        INDEX_PATH = os.path.join(FRONT_DIST, "index.html")
        assets_dir = os.path.join(FRONT_DIST, "assets")
        if os.path.isdir(assets_dir):
            app.mount("/assets", StaticFiles(directory=assets_dir), name="spa_assets")

        @app.get("/{full_path:path}")
        def spa_fallback(full_path: str):
            # If a built file exists under dist (e.g. favicon at root), serve it
            asset_path = os.path.join(FRONT_DIST, full_path)
            if os.path.isfile(asset_path):
                headers = {"Cache-Control":"public, max-age=3600"}
                return FileResponse(asset_path, headers=headers)
            # Missing chunk under /assets: never serve SPA shell (browser expects JS)
            if full_path.startswith("assets/") or full_path == "assets":
                raise FastAPIHTTPException(status_code=404, detail="Not found")
            # For SPA routes like /home, serve index.html with no-cache
            return FileResponse(INDEX_PATH, headers={"Cache-Control":"no-cache, no-store, must-revalidate"})

    return app


app = create_app()
