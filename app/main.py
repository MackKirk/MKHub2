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
from .routes.reviews import router as reviews_router


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
    app.include_router(reviews_router)
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
        # Lightweight dev-time migrations (PostgreSQL): add missing columns safely
        try:
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
                    conn.execute(text("ALTER TABLE client_sites ADD COLUMN IF NOT EXISTS site_notes VARCHAR(1000)"))
                    conn.execute(text("ALTER TABLE client_sites ADD COLUMN IF NOT EXISTS sort_index INTEGER DEFAULT 0"))
                    # Link files to sites optionally
                    conn.execute(text("ALTER TABLE client_files ADD COLUMN IF NOT EXISTS site_id UUID"))
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
                                       "client_id UUID,\n"
                                       "site_id UUID,\n"
                                       "order_number VARCHAR(20),\n"
                                       "title VARCHAR(255),\n"
                                       "data JSONB,\n"
                                       "created_at TIMESTAMPTZ DEFAULT NOW()\n"
                                       ")"))
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

