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
from .db import Base, engine, SessionLocal
from .logging import setup_logging, RequestIdMiddleware
from .auth.router import router as auth_router
from .routes.files import router as files_router
from .routes.projects import router as projects_router
from .routes.clients import router as clients_router
from .routes.employees import router as employees_router
from .routes.calendar import router as calendar_router
from .routes.settings import router as settings_router
from .routes.integrations import router as integrations_router


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
        # Bootstrap initial admin user if configured and no users exist
        try:
            from .models.models import User, Role
            from .auth.security import get_password_hash

            admin_username = os.getenv("ADMIN_USERNAME")
            admin_email = os.getenv("ADMIN_EMAIL")
            admin_password = os.getenv("ADMIN_PASSWORD")
            if admin_username and admin_email and admin_password:
                db = SessionLocal()
                try:
                    any_user = db.query(User).first()
                    if not any_user:
                        admin_role = db.query(Role).filter(Role.name == "admin").first()
                        if not admin_role:
                            admin_role = Role(name="admin", description="Administrator")
                            db.add(admin_role)
                            db.flush()

                        user = User(
                            username=admin_username,
                            email_personal=admin_email,
                            password_hash=get_password_hash(admin_password),
                            is_active=True,
                        )
                        user.roles.append(admin_role)
                        db.add(user)
                        db.commit()
                finally:
                    db.close()
        except Exception:
            # Do not block startup on bootstrap failures
            pass

    @app.get("/")
    def root():
        return {"service": settings.app_name, "env": settings.environment}

    return app


app = create_app()

