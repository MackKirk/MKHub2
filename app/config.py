from pydantic_settings import BaseSettings
from pydantic import Field, AnyUrl
from typing import Optional, List, Dict


class Settings(BaseSettings):
    # Core
    environment: str = Field(default="dev")
    app_name: str = Field(default="MK Hub API")
    tz_default: str = Field(default="America/Vancouver", alias="TZ_DEFAULT")

    # Server
    host: str = Field(default="0.0.0.0")
    port: int = Field(default=8000)

    # Database
    database_url: str = Field(
        default="sqlite:///./var/dev.db",
        alias="DATABASE_URL",
        description="e.g., postgresql+psycopg2://user:pass@host:5432/db",
    )
    auto_create_db: bool = Field(default=True, alias="AUTO_CREATE_DB")

    # JWT
    jwt_secret: str = Field(default="change-me", alias="JWT_SECRET")
    jwt_algorithm: str = Field(default="HS256")
    jwt_ttl_seconds: int = Field(default=900, alias="JWT_TTL")  # 15 min
    refresh_ttl_seconds: int = Field(default=60 * 60 * 24 * 14, alias="REFRESH_TTL")  # 14d

    # Storage
    storage_provider: str = Field(default="blob", alias="STORAGE_PROVIDER")
    azure_blob_connection: Optional[str] = Field(default=None, alias="AZURE_BLOB_CONNECTION")
    azure_blob_container: Optional[str] = Field(default=None, alias="AZURE_BLOB_CONTAINER")

    # Integrations
    graph_app_client_id: Optional[str] = Field(default=None, alias="GRAPH_APP_CLIENT_ID")
    graph_app_tenant_id: Optional[str] = Field(default=None, alias="GRAPH_APP_TENANT_ID")
    graph_app_client_secret: Optional[str] = Field(default=None, alias="GRAPH_APP_CLIENT_SECRET")

    dataforma_api_key: Optional[str] = Field(default=None, alias="DATAFORMA_API_KEY")
    dataforma_service_code: Optional[str] = Field(default=None, alias="DATAFORMA_SERVICE_CODE")

    bamboohr_subdomain: Optional[str] = Field(default=None, alias="BAMBOOHR_SUBDOMAIN")
    bamboohr_api_key: Optional[str] = Field(default=None, alias="BAMBOOHR_API_KEY")

    # Mail / Public
    public_base_url: str = Field(default="http://localhost:8000", alias="PUBLIC_BASE_URL")
    smtp_host: Optional[str] = Field(default=None, alias="SMTP_HOST")
    smtp_port: int = Field(default=587, alias="SMTP_PORT")
    smtp_username: Optional[str] = Field(default=None, alias="SMTP_USERNAME")
    smtp_password: Optional[str] = Field(default=None, alias="SMTP_PASSWORD")
    smtp_tls: bool = Field(default=True, alias="SMTP_TLS")
    mail_from: Optional[str] = Field(default=None, alias="MAIL_FROM")

    # Feature flags
    feature_flags_json: str = Field(default="{}", alias="FEATURE_FLAGS")

    # Rate limit
    rate_limit: str = Field(default="100/minute")

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = False


settings = Settings()

