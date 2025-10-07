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
from fastapi.responses import RedirectResponse
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
    # Static UI
    app.mount("/ui", StaticFiles(directory="app/ui", html=True), name="ui")

    # Metrics
    Instrumentator().instrument(app).expose(app)

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
        except Exception:
            pass
        # Removed bootstrap admin creation: admins should be granted via roles after onboarding

    @app.get("/")
    def root():
        return RedirectResponse(url="/ui/index.html")

    return app


app = create_app()

