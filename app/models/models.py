import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import (
    Column,
    String,
    DateTime,
    Date,
    Time,
    Boolean,
    ForeignKey,
    Table,
    Integer,
    Float,
    Numeric,
    JSON,
    UniqueConstraint,
    BigInteger,
    Text,
    Index,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship, Mapped, mapped_column

from ..db import Base


def uuid_pk() -> Mapped[uuid.UUID]:
    return mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)


# Association table for many-to-many User<->Role
user_roles = Table(
    "user_roles",
    Base.metadata,
    Column("user_id", UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
    Column("role_id", UUID(as_uuid=True), ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True),
    UniqueConstraint("user_id", "role_id", name="uq_user_role"),
)

# Association table for many-to-many Task<->User (assignees)
task_assignees = Table(
    "task_assignees",
    Base.metadata,
    Column("task_id", UUID(as_uuid=True), ForeignKey("tasks.id", ondelete="CASCADE"), primary_key=True),
    Column("user_id", UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
    UniqueConstraint("task_id", "user_id", name="uq_task_user"),
)

# Association table for many-to-many User<->Division (SettingItem)
user_divisions = Table(
    "user_divisions",
    Base.metadata,
    Column("user_id", UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
    Column("division_id", UUID(as_uuid=True), ForeignKey("setting_items.id", ondelete="CASCADE"), primary_key=True),
    UniqueConstraint("user_id", "division_id", name="uq_user_division"),
)


class Role(Base):
    __tablename__ = "roles"

    id: Mapped[uuid.UUID] = uuid_pk()
    name: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(String(255))
    permissions: Mapped[Optional[dict]] = mapped_column(JSON, default=dict)

    users = relationship("User", secondary=user_roles, back_populates="roles")


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = uuid_pk()
    username: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    email_personal: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    email_corporate: Mapped[Optional[str]] = mapped_column(String(255), unique=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    last_login_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    permissions_override: Mapped[Optional[dict]] = mapped_column(JSON)
    # Dispatch & Time Tracking fields
    mobile: Mapped[Optional[str]] = mapped_column(String(50))  # Mobile phone for notifications
    preferred_notification: Mapped[Optional[dict]] = mapped_column(JSON)  # Notification preferences {push: bool, email: bool, quiet_hours: dict}
    status: Mapped[Optional[str]] = mapped_column(String(50), default="active")  # User status: active|inactive|suspended

    roles = relationship("Role", secondary=user_roles, back_populates="users")
    divisions = relationship("SettingItem", secondary="user_divisions", backref="users")


class UsernameReservation(Base):
    __tablename__ = "username_reservations"

    id: Mapped[uuid.UUID] = uuid_pk()
    username: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    email_personal: Mapped[str] = mapped_column(String(255), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class Invite(Base):
    __tablename__ = "invites"

    id: Mapped[uuid.UUID] = uuid_pk()
    email_personal: Mapped[str] = mapped_column(String(255), nullable=False)
    token: Mapped[str] = mapped_column(String(128), unique=True, nullable=False, index=True)
    suggested_username: Mapped[Optional[str]] = mapped_column(String(100))
    division_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True))
    division_name: Mapped[Optional[str]] = mapped_column(String(255))
    document_ids: Mapped[Optional[list]] = mapped_column(JSON)  # List of document IDs to sign
    job_info: Mapped[Optional[dict]] = mapped_column(JSON)  # Job information (hire_date, job_title, work_email, etc.)
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    accepted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))


class RefreshToken(Base):
    __tablename__ = "refresh_tokens"

    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"))
    jti: Mapped[str] = mapped_column(String(128), unique=True, nullable=False, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class PasswordReset(Base):
    __tablename__ = "password_resets"

    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"))
    token: Mapped[str] = mapped_column(String(128), unique=True, index=True, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))

class FileObject(Base):
    __tablename__ = "file_objects"

    id: Mapped[uuid.UUID] = uuid_pk()
    provider: Mapped[str] = mapped_column(String(50), nullable=False)
    container: Mapped[str] = mapped_column(String(255), nullable=False)
    key: Mapped[str] = mapped_column(String(1024), nullable=False, index=True)
    size_bytes: Mapped[Optional[int]] = mapped_column(BigInteger)
    content_type: Mapped[Optional[str]] = mapped_column(String(255))
    checksum_sha256: Mapped[Optional[str]] = mapped_column(String(128))
    version: Mapped[Optional[str]] = mapped_column(String(64))

    project_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True))
    client_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True))
    employee_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True))
    category_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True))

    source_ref: Mapped[Optional[str]] = mapped_column(String(255))

    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    tags: Mapped[Optional[dict]] = mapped_column(JSON)


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[uuid.UUID] = uuid_pk()
    code: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[Optional[str]] = mapped_column(String(255), index=True)
    client_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True))
    site_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True))
    address: Mapped[Optional[str]] = mapped_column(String(500))  # Full address for dispatch
    address_city: Mapped[Optional[str]] = mapped_column(String(100))
    address_province: Mapped[Optional[str]] = mapped_column(String(100))
    address_country: Mapped[Optional[str]] = mapped_column(String(100))
    lat: Mapped[Optional[float]] = mapped_column(Numeric(10, 7))  # Latitude for geofence
    lng: Mapped[Optional[float]] = mapped_column(Numeric(10, 7))  # Longitude for geofence
    timezone: Mapped[Optional[str]] = mapped_column(String(100), default="America/Vancouver")  # Project timezone
    status: Mapped[Optional[str]] = mapped_column(String(50))  # Project status
    division_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True))
    status_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True))
    # UI-friendly fields
    status_label: Mapped[Optional[str]] = mapped_column(String(100))
    division_ids: Mapped[Optional[list]] = mapped_column(JSON)
    estimator_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True))
    onsite_lead_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True))
    contact_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True))
    date_start: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    date_eta: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    date_end: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    # Visual progress percentage 0-100
    progress: Mapped[Optional[int]] = mapped_column(Integer)
    cost_estimated: Mapped[Optional[int]] = mapped_column(BigInteger)
    cost_actual: Mapped[Optional[int]] = mapped_column(BigInteger)
    service_value: Mapped[Optional[int]] = mapped_column(BigInteger)
    description: Mapped[Optional[str]] = mapped_column(String(2000))
    notes: Mapped[Optional[str]] = mapped_column(String(2000))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)


class ProjectUpdate(Base):
    __tablename__ = "project_updates"

    id: Mapped[uuid.UUID] = uuid_pk()
    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"))
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    text: Mapped[Optional[str]] = mapped_column(String(2000))
    images: Mapped[Optional[dict]] = mapped_column(JSON)  # list of FileObject ids


class ProjectReport(Base):
    __tablename__ = "project_reports"

    id: Mapped[uuid.UUID] = uuid_pk()
    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"))
    category_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True))
    division_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True))
    description: Mapped[Optional[str]] = mapped_column(String(2000))
    images: Mapped[Optional[dict]] = mapped_column(JSON)
    status: Mapped[Optional[str]] = mapped_column(String(100))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True))


class ProjectEvent(Base):
    __tablename__ = "project_events"

    id: Mapped[uuid.UUID] = uuid_pk()
    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    location: Mapped[Optional[str]] = mapped_column(String(500))
    start_datetime: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    end_datetime: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    notes: Mapped[Optional[str]] = mapped_column(String(2000))
    
    # Recurrence fields
    is_all_day: Mapped[bool] = mapped_column(Boolean, default=False)
    timezone: Mapped[Optional[str]] = mapped_column(String(100))  # e.g., "America/Vancouver"
    repeat_type: Mapped[Optional[str]] = mapped_column(String(50))  # "none", "daily", "weekly", "monthly", "yearly", "custom"
    repeat_config: Mapped[Optional[dict]] = mapped_column(JSON)  # JSON with repeat rules
    repeat_until: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    repeat_count: Mapped[Optional[int]] = mapped_column(Integer)
    exceptions: Mapped[Optional[list]] = mapped_column(JSON)  # List of exception dates (EXDATE)
    extra_dates: Mapped[Optional[list]] = mapped_column(JSON)  # List of extra dates (RDATE)
    overrides: Mapped[Optional[dict]] = mapped_column(JSON)  # Overrides for specific occurrences
    
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))


# Employee time entries per project
class ProjectTimeEntry(Base):
    __tablename__ = "project_time_entries"

    id: Mapped[uuid.UUID] = uuid_pk()
    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"))
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"))
    work_date: Mapped[Date] = mapped_column(Date, nullable=False)
    start_time: Mapped[Optional[Time]] = mapped_column(Time(timezone=False))
    end_time: Mapped[Optional[Time]] = mapped_column(Time(timezone=False))
    minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    notes: Mapped[Optional[str]] = mapped_column(String(1000))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True))
    # Administrative approval
    is_approved: Mapped[bool] = mapped_column(Boolean, default=False)
    approved_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    approved_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True))


class ProjectTimeEntryLog(Base):
    __tablename__ = "project_time_entry_logs"

    id: Mapped[uuid.UUID] = uuid_pk()
    entry_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("project_time_entries.id", ondelete="CASCADE"))
    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"))
    user_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    action: Mapped[str] = mapped_column(String(50))  # create|update|delete
    changes: Mapped[Optional[dict]] = mapped_column(JSON)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

class Client(Base):
    __tablename__ = "clients"

    id: Mapped[uuid.UUID] = uuid_pk()
    code: Mapped[Optional[str]] = mapped_column(String(50), unique=True, index=True)
    # Identity
    name: Mapped[str] = mapped_column(String(255), nullable=False)  # historical
    legal_name: Mapped[Optional[str]] = mapped_column(String(255))
    display_name: Mapped[Optional[str]] = mapped_column(String(255))
    client_type: Mapped[Optional[str]] = mapped_column(String(50))
    client_status: Mapped[Optional[str]] = mapped_column(String(50))
    lead_source: Mapped[Optional[str]] = mapped_column(String(100))
    estimator_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))
    description: Mapped[Optional[str]] = mapped_column(String(4000))

    # Primary address (supersedes legacy address fields)
    address_line1: Mapped[Optional[str]] = mapped_column(String(255))
    address_line2: Mapped[Optional[str]] = mapped_column(String(255))
    city: Mapped[Optional[str]] = mapped_column(String(100))
    province: Mapped[Optional[str]] = mapped_column(String(100))
    postal_code: Mapped[Optional[str]] = mapped_column(String(50))
    country: Mapped[Optional[str]] = mapped_column(String(100))

    # Billing address
    billing_address_line1: Mapped[Optional[str]] = mapped_column(String(255))
    billing_address_line2: Mapped[Optional[str]] = mapped_column(String(255))
    billing_city: Mapped[Optional[str]] = mapped_column(String(100))
    billing_province: Mapped[Optional[str]] = mapped_column(String(100))
    billing_postal_code: Mapped[Optional[str]] = mapped_column(String(50))
    billing_country: Mapped[Optional[str]] = mapped_column(String(100))
    # Behavior
    billing_same_as_address: Mapped[bool] = mapped_column(Boolean, default=False)

    type_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True))
    status_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True))
    payment_terms_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True))
    billing_email: Mapped[Optional[str]] = mapped_column(String(255))
    po_required: Mapped[bool] = mapped_column(Boolean, default=False)
    tax_number: Mapped[Optional[str]] = mapped_column(String(100))
    dataforma_id: Mapped[Optional[str]] = mapped_column(String(100), unique=True)
    # Communication preferences
    preferred_language: Mapped[Optional[str]] = mapped_column(String(50))
    preferred_channels: Mapped[Optional[list]] = mapped_column(JSON)  # list of strings
    marketing_opt_in: Mapped[bool] = mapped_column(Boolean, default=False)
    invoice_delivery_method: Mapped[Optional[str]] = mapped_column(String(50))
    statement_delivery_method: Mapped[Optional[str]] = mapped_column(String(50))
    cc_emails_for_invoices: Mapped[Optional[list]] = mapped_column(JSON)  # list of emails
    cc_emails_for_estimates: Mapped[Optional[list]] = mapped_column(JSON)  # list of emails
    do_not_contact: Mapped[bool] = mapped_column(Boolean, default=False)
    do_not_contact_reason: Mapped[Optional[str]] = mapped_column(String(500))

    # System flag - marks clients that are system/internal (e.g., "Company Files")
    # These clients should be hidden from normal customer listings
    is_system: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    
    # Audit
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True))
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    updated_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True))


class ClientContact(Base):
    __tablename__ = "client_contacts"

    id: Mapped[uuid.UUID] = uuid_pk()
    client_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("clients.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    role_title: Mapped[Optional[str]] = mapped_column(String(100))
    department: Mapped[Optional[str]] = mapped_column(String(100))
    email: Mapped[Optional[str]] = mapped_column(String(255))
    phone: Mapped[Optional[str]] = mapped_column(String(100))
    mobile_phone: Mapped[Optional[str]] = mapped_column(String(100))
    is_primary: Mapped[bool] = mapped_column(Boolean, default=False)
    sort_index: Mapped[int] = mapped_column(Integer, default=0)
    notes: Mapped[Optional[str]] = mapped_column(String(1000))
    role_tags: Mapped[Optional[list]] = mapped_column(JSON)  # list of strings


class ClientSite(Base):
    __tablename__ = "client_sites"

    id: Mapped[uuid.UUID] = uuid_pk()
    client_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("clients.id", ondelete="CASCADE"))
    site_name: Mapped[Optional[str]] = mapped_column(String(255))
    site_address_line1: Mapped[Optional[str]] = mapped_column(String(255))
    site_address_line2: Mapped[Optional[str]] = mapped_column(String(255))
    site_city: Mapped[Optional[str]] = mapped_column(String(100))
    site_province: Mapped[Optional[str]] = mapped_column(String(100))
    site_postal_code: Mapped[Optional[str]] = mapped_column(String(50))
    site_country: Mapped[Optional[str]] = mapped_column(String(100))
    site_lat: Mapped[Optional[float]] = mapped_column(Numeric(10, 7))  # Latitude for geofence
    site_lng: Mapped[Optional[float]] = mapped_column(Numeric(10, 7))  # Longitude for geofence
    site_notes: Mapped[Optional[str]] = mapped_column(String(1000))
    sort_index: Mapped[int] = mapped_column(Integer, default=0)


class ClientFile(Base):
    __tablename__ = "client_files"

    id: Mapped[uuid.UUID] = uuid_pk()
    client_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("clients.id", ondelete="CASCADE"))
    site_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("client_sites.id", ondelete="CASCADE"))
    file_object_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("file_objects.id", ondelete="CASCADE"))
    category: Mapped[Optional[str]] = mapped_column(String(100))
    key: Mapped[Optional[str]] = mapped_column(String(1024))
    original_name: Mapped[Optional[str]] = mapped_column(String(255))
    uploaded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    uploaded_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True))


# Logical customer folders and documents (parallel to employee folders/docs)
class ClientFolder(Base):
    __tablename__ = "client_folders"

    id: Mapped[uuid.UUID] = uuid_pk()
    client_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("clients.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    parent_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("client_folders.id", ondelete="SET NULL"))
    project_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="SET NULL"), index=True)
    sort_index: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True))
    # Access permissions for company files
    # JSON format: {"allowed_user_ids": [uuid, ...], "allowed_divisions": [string, ...], "is_public": bool}
    # If is_public is true or permissions is null/empty, all users can access
    # If is_public is false, only users in allowed_user_ids or with divisions in allowed_divisions can access
    access_permissions: Mapped[Optional[dict]] = mapped_column(JSON)


class ClientDocument(Base):
    __tablename__ = "client_documents"

    id: Mapped[uuid.UUID] = uuid_pk()
    client_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("clients.id", ondelete="CASCADE"), index=True)
    # Use doc_type to store folder link as tag "folder:<id>" for compatibility and easy filtering
    doc_type: Mapped[str] = mapped_column(String(100))
    title: Mapped[Optional[str]] = mapped_column(String(255))
    notes: Mapped[Optional[str]] = mapped_column(String(1000))
    file_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("file_objects.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True))
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    updated_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True))


# Legacy Employee model removed in favor of EmployeeProfile linked to User


# Proposal drafts for saving in-progress proposals
class ProposalDraft(Base):
    __tablename__ = "proposal_drafts"

    id: Mapped[uuid.UUID] = uuid_pk()
    client_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True))
    site_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True))
    user_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    title: Mapped[Optional[str]] = mapped_column(String(255))
    data: Mapped[Optional[dict]] = mapped_column(JSON)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)


class Proposal(Base):
    __tablename__ = "proposals"

    id: Mapped[uuid.UUID] = uuid_pk()
    # Optional explicit relation to a project for scoping proposals within a project view
    project_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True))
    client_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True))
    site_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True))
    order_number: Mapped[Optional[str]] = mapped_column(String(20))
    title: Mapped[Optional[str]] = mapped_column(String(255))
    data: Mapped[Optional[dict]] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

class ReviewTemplate(Base):
    __tablename__ = "review_templates"

    id: Mapped[uuid.UUID] = uuid_pk()
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    version: Mapped[int] = mapped_column(Integer, default=1)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)


class ReviewTemplateQuestion(Base):
    __tablename__ = "review_template_questions"

    id: Mapped[uuid.UUID] = uuid_pk()
    template_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("review_templates.id", ondelete="CASCADE"))
    order_index: Mapped[int] = mapped_column(Integer, default=0)
    key: Mapped[str] = mapped_column(String(100), nullable=False)
    label: Mapped[str] = mapped_column(String(1000), nullable=False)
    type: Mapped[str] = mapped_column(String(50), nullable=False)
    options: Mapped[Optional[dict]] = mapped_column(JSON)
    required: Mapped[bool] = mapped_column(Boolean, default=False)


class ReviewCycle(Base):
    __tablename__ = "review_cycles"

    id: Mapped[uuid.UUID] = uuid_pk()
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    period_start: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    period_end: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    template_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("review_templates.id", ondelete="RESTRICT"))
    status: Mapped[str] = mapped_column(String(50), default="draft")


class ReviewAssignment(Base):
    __tablename__ = "review_assignments"

    id: Mapped[uuid.UUID] = uuid_pk()
    cycle_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("review_cycles.id", ondelete="CASCADE"))
    reviewee_user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"))
    reviewer_user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"))
    status: Mapped[str] = mapped_column(String(50), default="pending")
    due_date: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)


class ReviewAnswer(Base):
    __tablename__ = "review_answers"

    id: Mapped[uuid.UUID] = uuid_pk()
    assignment_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("review_assignments.id", ondelete="CASCADE"))
    question_key: Mapped[str] = mapped_column(String(100), nullable=False)
    question_label_snapshot: Mapped[str] = mapped_column(String(1000), nullable=False)
    answer_json: Mapped[Optional[dict]] = mapped_column(JSON)
    score: Mapped[Optional[int]] = mapped_column(Integer)
    commented_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

class CalendarSource(Base):
    __tablename__ = "calendar_sources"

    id: Mapped[uuid.UUID] = uuid_pk()
    type: Mapped[str] = mapped_column(String(50))  # personal|shared|org
    account: Mapped[Optional[str]] = mapped_column(String(255))
    permissions: Mapped[Optional[str]] = mapped_column(String(50))  # delegated|application


class CalendarEvent(Base):
    __tablename__ = "calendar_events"

    id: Mapped[uuid.UUID] = uuid_pk()
    source_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("calendar_sources.id", ondelete="CASCADE"))
    owner_email: Mapped[Optional[str]] = mapped_column(String(255))
    subject: Mapped[Optional[str]] = mapped_column(String(500))
    start: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    end: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    is_private: Mapped[bool] = mapped_column(Boolean, default=False)
    attendee_status: Mapped[Optional[str]] = mapped_column(String(50))
    last_synced_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))


class SettingList(Base):
    __tablename__ = "setting_lists"

    id: Mapped[uuid.UUID] = uuid_pk()
    name: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)


class SettingItem(Base):
    __tablename__ = "setting_items"

    id: Mapped[uuid.UUID] = uuid_pk()
    list_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("setting_lists.id", ondelete="CASCADE"))
    label: Mapped[str] = mapped_column(String(255), nullable=False)
    value: Mapped[Optional[str]] = mapped_column(String(255))
    sort_index: Mapped[int] = mapped_column(Integer, default=0)
    # Optional metadata for richer lists (e.g., { abbr: "OPS" })
    meta: Mapped[Optional[dict]] = mapped_column(JSON)


class PermissionCategory(Base):
    """Categorias de permissões para organização na UI"""
    __tablename__ = "permission_categories"

    id: Mapped[uuid.UUID] = uuid_pk()
    name: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)  # e.g., "profile", "equipment", "salary"
    label: Mapped[str] = mapped_column(String(255), nullable=False)  # Nome amigável para exibição
    description: Mapped[Optional[str]] = mapped_column(String(500))  # Descrição da categoria
    sort_index: Mapped[int] = mapped_column(Integer, default=0)  # Ordem de exibição
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    
    # Relationships
    permissions = relationship("PermissionDefinition", back_populates="category", cascade="all, delete-orphan", order_by="PermissionDefinition.sort_index")


class PermissionDefinition(Base):
    """Definição de permissões disponíveis no sistema"""
    __tablename__ = "permission_definitions"

    id: Mapped[uuid.UUID] = uuid_pk()
    category_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("permission_categories.id", ondelete="CASCADE"), nullable=False, index=True)
    key: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)  # e.g., "profile:edit_personal", "equipment:manage"
    label: Mapped[str] = mapped_column(String(255), nullable=False)  # Nome amigável para exibição
    description: Mapped[Optional[str]] = mapped_column(String(500))  # Descrição da permissão
    sort_index: Mapped[int] = mapped_column(Integer, default=0)  # Ordem dentro da categoria
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    
    # Relationships
    category = relationship("PermissionCategory", back_populates="permissions")
    
    # Indexes
    __table_args__ = (
        Index('idx_permission_def_category', 'category_id', 'sort_index'),
    )


# Extended employee profile linked to users for onboarding
class EmployeeProfile(Base):
    __tablename__ = "employee_profiles"

    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), unique=True)

    # Identidade & Login (redundant fields kept in users table)
    created_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    last_login_date: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))

    # Dados Pessoais
    first_name: Mapped[Optional[str]] = mapped_column(String(100))
    last_name: Mapped[Optional[str]] = mapped_column(String(100))
    preferred_name: Mapped[Optional[str]] = mapped_column(String(100))
    gender: Mapped[Optional[str]] = mapped_column(String(50))
    date_of_birth: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    marital_status: Mapped[Optional[str]] = mapped_column(String(50))
    nationality: Mapped[Optional[str]] = mapped_column(String(100))
    phone: Mapped[Optional[str]] = mapped_column(String(100))
    mobile_phone: Mapped[Optional[str]] = mapped_column(String(100))
    address_line1: Mapped[Optional[str]] = mapped_column(String(255))
    address_line2: Mapped[Optional[str]] = mapped_column(String(255))
    city: Mapped[Optional[str]] = mapped_column(String(100))
    province: Mapped[Optional[str]] = mapped_column(String(100))
    postal_code: Mapped[Optional[str]] = mapped_column(String(50))
    country: Mapped[Optional[str]] = mapped_column(String(100))

    # Informações de Emprego
    hire_date: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    termination_date: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    job_title: Mapped[Optional[str]] = mapped_column(String(255))
    division: Mapped[Optional[str]] = mapped_column(String(255))
    work_email: Mapped[Optional[str]] = mapped_column(String(255))
    work_phone: Mapped[Optional[str]] = mapped_column(String(100))
    manager_user_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))

    # Financeiro & Contratual
    pay_rate: Mapped[Optional[str]] = mapped_column(String(100))
    pay_type: Mapped[Optional[str]] = mapped_column(String(50))  # hourly|salary|contract
    employment_type: Mapped[Optional[str]] = mapped_column(String(50))  # full-time|part-time|contract

    # Documentos & Legal
    profile_photo_file_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("file_objects.id", ondelete="SET NULL"))
    sin_number: Mapped[Optional[str]] = mapped_column(String(100))
    work_permit_status: Mapped[Optional[str]] = mapped_column(String(100))
    visa_status: Mapped[Optional[str]] = mapped_column(String(100))
    emergency_contact_name: Mapped[Optional[str]] = mapped_column(String(255))
    emergency_contact_relationship: Mapped[Optional[str]] = mapped_column(String(100))
    emergency_contact_phone: Mapped[Optional[str]] = mapped_column(String(100))

    # Sistema / Auditoria
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True))
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    updated_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True))


# Multi-record tables
class EmployeePassport(Base):
    __tablename__ = "employee_passports"

    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True)
    passport_number: Mapped[str] = mapped_column(String(100))
    issuing_country: Mapped[Optional[str]] = mapped_column(String(100))
    issued_date: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    expiry_date: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))


class EmployeeEducation(Base):
    __tablename__ = "employee_education"

    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True)
    college_institution: Mapped[Optional[str]] = mapped_column(String(255))
    degree: Mapped[Optional[str]] = mapped_column(String(255))
    major_specialization: Mapped[Optional[str]] = mapped_column(String(255))
    gpa: Mapped[Optional[str]] = mapped_column(String(50))
    start_date: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    end_date: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))


class EmployeeEmergencyContact(Base):
    __tablename__ = "employee_emergency_contacts"

    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(255))
    relationship: Mapped[Optional[str]] = mapped_column(String(100))
    is_primary: Mapped[bool] = mapped_column(Boolean, default=False)
    work_phone: Mapped[Optional[str]] = mapped_column(String(100))
    home_phone: Mapped[Optional[str]] = mapped_column(String(100))
    mobile_phone: Mapped[Optional[str]] = mapped_column(String(100))
    email: Mapped[Optional[str]] = mapped_column(String(255))
    address: Mapped[Optional[str]] = mapped_column(String(500))


class EmployeeDependent(Base):
    __tablename__ = "employee_dependents"

    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(255))
    relationship: Mapped[Optional[str]] = mapped_column(String(100))
    gender: Mapped[Optional[str]] = mapped_column(String(50))
    ssn: Mapped[Optional[str]] = mapped_column(String(100))
    birth_date: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))


class EmployeeFolder(Base):
    __tablename__ = "employee_folders"

    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    parent_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("employee_folders.id", ondelete="SET NULL"))
    sort_index: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True))

class EmployeeDocument(Base):
    __tablename__ = "employee_documents"

    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True)
    # Generic document typing
    doc_type: Mapped[str] = mapped_column(String(100))  # e.g., passport, driver_license, bc_registration
    title: Mapped[Optional[str]] = mapped_column(String(255))
    number: Mapped[Optional[str]] = mapped_column(String(100))
    issuing_country: Mapped[Optional[str]] = mapped_column(String(100))
    issued_date: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    expiry_date: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    notes: Mapped[Optional[str]] = mapped_column(String(1000))
    # Optional linkage to uploaded file object (from /files)
    file_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("file_objects.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True))
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    updated_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True))


# =====================
# Inventory domain
# =====================

# Employee notes
class EmployeeNote(Base):
    __tablename__ = "employee_notes"

    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True)
    category: Mapped[Optional[str]] = mapped_column(String(100))
    text: Mapped[str] = mapped_column(String(2000))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    updated_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True))


# =====================
# Employee Management domain
# =====================

class EmployeeSalaryHistory(Base):
    """Histórico de mudanças de salário do funcionário"""
    __tablename__ = "employee_salary_history"

    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    previous_salary: Mapped[Optional[str]] = mapped_column(String(100))  # Salário anterior
    new_salary: Mapped[str] = mapped_column(String(100), nullable=False)  # Novo salário
    pay_type: Mapped[Optional[str]] = mapped_column(String(50))  # hourly|salary|contract
    effective_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)  # Data de vigência
    justification: Mapped[str] = mapped_column(Text, nullable=False)  # Justificativa da mudança
    requested_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=False)  # Quem solicitou
    approved_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))  # Quem aprovou (se necessário)
    approved_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    notes: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    
    # Indexes
    __table_args__ = (
        Index('idx_salary_history_user_date', 'user_id', 'effective_date'),
    )


class EmployeeLoan(Base):
    """Empréstimos que funcionários pegam da empresa"""
    __tablename__ = "employee_loans"

    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    loan_amount: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)  # Valor total do empréstimo
    remaining_balance: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)  # Saldo restante
    weekly_payment: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)  # Valor do pagamento semanal
    loan_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)  # Data do empréstimo
    status: Mapped[str] = mapped_column(String(50), default="active")  # active|paid_off|cancelled
    description: Mapped[Optional[str]] = mapped_column(Text)  # Descrição do empréstimo
    notes: Mapped[Optional[str]] = mapped_column(Text)
    created_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    paid_off_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    
    # Relationships
    payments = relationship("LoanPayment", back_populates="loan", cascade="all, delete-orphan", order_by="LoanPayment.payment_date.desc()")


class LoanPayment(Base):
    """Pagamentos semanais de empréstimos"""
    __tablename__ = "loan_payments"

    id: Mapped[uuid.UUID] = uuid_pk()
    loan_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("employee_loans.id", ondelete="CASCADE"), nullable=False, index=True)
    payment_amount: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)  # Valor do pagamento
    payment_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)  # Data do pagamento
    balance_after: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)  # Saldo após o pagamento
    notes: Mapped[Optional[str]] = mapped_column(Text)
    created_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    
    # Relationships
    loan = relationship("EmployeeLoan", back_populates="payments")
    
    # Indexes
    __table_args__ = (
        Index('idx_loan_payment_date', 'loan_id', 'payment_date'),
    )


class EmployeeNotice(Base):
    """Ocorrências (positivas e negativas) do funcionário"""
    __tablename__ = "employee_notices"

    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    notice_type: Mapped[str] = mapped_column(String(50), nullable=False)  # positive|negative|warning|commendation
    title: Mapped[str] = mapped_column(String(255), nullable=False)  # Título da ocorrência
    description: Mapped[str] = mapped_column(Text, nullable=False)  # Descrição detalhada
    justification: Mapped[Optional[str]] = mapped_column(Text)  # Justificativa (para ocorrências negativas)
    created_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=False)  # Quem criou a ocorrência
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    incident_date: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))  # Data do incidente (pode ser diferente da data de criação)
    attachments: Mapped[Optional[list]] = mapped_column(JSON)  # Lista de IDs de arquivos anexados
    acknowledged_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))  # Funcionário que reconheceu
    acknowledged_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    
    # Indexes
    __table_args__ = (
        Index('idx_notice_user_type_date', 'user_id', 'notice_type', 'created_at'),
    )


class EmployeeFineTicket(Base):
    """Multas e tickets do funcionário"""
    __tablename__ = "employee_fines_tickets"

    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    type: Mapped[str] = mapped_column(String(50), nullable=False)  # fine|ticket|violation
    title: Mapped[str] = mapped_column(String(255), nullable=False)  # Título da multa/ticket
    description: Mapped[Optional[str]] = mapped_column(Text)  # Descrição
    amount: Mapped[Optional[float]] = mapped_column(Numeric(10, 2))  # Valor da multa (se aplicável)
    issue_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)  # Data da ocorrência
    due_date: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))  # Data de vencimento do pagamento
    status: Mapped[str] = mapped_column(String(50), default="pending")  # pending|paid|waived|cancelled
    paid_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    paid_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    notes: Mapped[Optional[str]] = mapped_column(Text)
    created_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    attachments: Mapped[Optional[list]] = mapped_column(JSON)  # Lista de IDs de arquivos anexados
    
    # Indexes
    __table_args__ = (
        Index('idx_fine_ticket_user_status', 'user_id', 'status'),
        Index('idx_fine_ticket_due_date', 'due_date'),
    )


class EmployeeEquipment(Base):
    """Ferramentas e equipamentos que o funcionário possui da empresa"""
    __tablename__ = "employee_equipment"

    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    equipment_type: Mapped[str] = mapped_column(String(100), nullable=False)  # phone|notebook|tool|vehicle|other
    name: Mapped[str] = mapped_column(String(255), nullable=False)  # Nome/descrição do equipamento
    brand: Mapped[Optional[str]] = mapped_column(String(100))  # Marca
    model: Mapped[Optional[str]] = mapped_column(String(100))  # Modelo
    serial_number: Mapped[Optional[str]] = mapped_column(String(255))  # Número de série
    asset_tag: Mapped[Optional[str]] = mapped_column(String(100))  # Tag de ativo da empresa
    assigned_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)  # Data de atribuição
    return_date: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))  # Data de devolução
    status: Mapped[str] = mapped_column(String(50), default="assigned")  # assigned|returned|lost|damaged
    condition: Mapped[Optional[str]] = mapped_column(String(50))  # new|good|fair|poor|damaged
    value: Mapped[Optional[float]] = mapped_column(Numeric(10, 2))  # Valor do equipamento
    notes: Mapped[Optional[str]] = mapped_column(Text)
    created_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    updated_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    
    # Indexes
    __table_args__ = (
        Index('idx_equipment_user_status', 'user_id', 'status'),
        Index('idx_equipment_type', 'equipment_type'),
    )

class InventoryProduct(Base):
    __tablename__ = "inventory_products"

    id: Mapped[uuid.UUID] = uuid_pk()
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    unit: Mapped[str] = mapped_column(String(50), nullable=False)
    stock_quantity: Mapped[int] = mapped_column(Integer, default=0)
    reorder_point: Mapped[int] = mapped_column(Integer, default=0)


class Supplier(Base):
    __tablename__ = "suppliers"

    id: Mapped[uuid.UUID] = uuid_pk()
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    legal_name: Mapped[Optional[str]] = mapped_column(String(255))
    email: Mapped[Optional[str]] = mapped_column(String(255))
    phone: Mapped[Optional[str]] = mapped_column(String(100))
    website: Mapped[Optional[str]] = mapped_column(String(255))

    address_line1: Mapped[Optional[str]] = mapped_column(String(255))
    address_line2: Mapped[Optional[str]] = mapped_column(String(255))
    city: Mapped[Optional[str]] = mapped_column(String(100))
    province: Mapped[Optional[str]] = mapped_column(String(100))
    postal_code: Mapped[Optional[str]] = mapped_column(String(50))
    country: Mapped[Optional[str]] = mapped_column(String(100))

    tax_number: Mapped[Optional[str]] = mapped_column(String(100))
    payment_terms: Mapped[Optional[str]] = mapped_column(String(100))  # e.g., Net 30
    currency: Mapped[Optional[str]] = mapped_column(String(10))  # e.g., CAD, USD
    lead_time_days: Mapped[Optional[int]] = mapped_column(Integer)
    category: Mapped[Optional[str]] = mapped_column(String(100))
    status: Mapped[Optional[str]] = mapped_column(String(50))  # active, paused
    notes: Mapped[Optional[str]] = mapped_column(String(2000))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    image_base64: Mapped[Optional[str]] = mapped_column(String)

    contacts = relationship("SupplierContact", back_populates="supplier", cascade="all, delete-orphan")


class SupplierContact(Base):
    __tablename__ = "supplier_contacts"

    id: Mapped[uuid.UUID] = uuid_pk()
    supplier_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("suppliers.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    email: Mapped[Optional[str]] = mapped_column(String(255))
    phone: Mapped[Optional[str]] = mapped_column(String(100))
    title: Mapped[Optional[str]] = mapped_column(String(100))
    notes: Mapped[Optional[str]] = mapped_column(String(1000))
    image_base64: Mapped[Optional[str]] = mapped_column(String)

    supplier = relationship("Supplier", back_populates="contacts")


class InventoryOrder(Base):
    __tablename__ = "inventory_orders"

    id: Mapped[uuid.UUID] = uuid_pk()
    supplier_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("suppliers.id", ondelete="RESTRICT"), nullable=False)
    contact_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("supplier_contacts.id", ondelete="SET NULL"))
    status: Mapped[str] = mapped_column(String(50), default="pending")
    order_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    delivered_date: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    email_sent: Mapped[bool] = mapped_column(Boolean, default=False)
    email_sent_date: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))

    items = relationship("InventoryOrderItem", back_populates="order", cascade="all, delete-orphan")

    @property
    def order_code(self) -> str:
        # Human-friendly code derived from UUID prefix
        return f"MK{str(self.id).split('-')[0].upper()}"


class InventoryOrderItem(Base):
    __tablename__ = "inventory_order_items"

    id: Mapped[uuid.UUID] = uuid_pk()
    order_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("inventory_orders.id", ondelete="CASCADE"), nullable=False)
    product_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("inventory_products.id", ondelete="RESTRICT"), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)

    order = relationship("InventoryOrder", back_populates="items")


# =====================
# Estimate system domain
# =====================

class Material(Base):
    __tablename__ = "materials"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    category = Column(String)
    supplier_id = Column(Integer)
    supplier_name = Column(String)
    unit = Column(String)
    price = Column(Float)
    last_updated = Column(DateTime, default=datetime.utcnow)
    notes = Column(String)
    description = Column(String)
    image_base64 = Column(String)
    unit_type = Column(String)
    units_per_package = Column(Float)
    coverage_sqs = Column(Float)
    coverage_ft2 = Column(Float)
    coverage_m2 = Column(Float)


class Estimate(Base):
    __tablename__ = "estimates"

    id = Column(Integer, primary_key=True, index=True)
    project_id = mapped_column(UUID(as_uuid=True))
    total_cost = Column(Float)
    markup = Column(Float)
    created_by = mapped_column(UUID(as_uuid=True))
    created_at = Column(DateTime, default=datetime.utcnow)
    version = Column(String)
    notes = Column(String)


class EstimateItem(Base):
    __tablename__ = "estimate_items"

    id = Column(Integer, primary_key=True, index=True)
    estimate_id = Column(Integer, ForeignKey("estimates.id"))
    material_id = Column(Integer, ForeignKey("materials.id"))  # Optional for manual entries
    quantity = Column(Float)
    unit_price = Column(Float)
    total_price = Column(Float)
    section = Column(String)
    description = Column(String)  # For manual entries (labour, sub-contractors, shop)
    item_type = Column(String)  # 'product', 'labour', 'subcontractor', 'shop'


class RelatedProduct(Base):
    __tablename__ = "related_products"

    id = Column(Integer, primary_key=True, index=True)
    product_a_id = Column(Integer, ForeignKey("materials.id"), nullable=False)
    product_b_id = Column(Integer, ForeignKey("materials.id"), nullable=False)
    __table_args__ = (UniqueConstraint("product_a_id", "product_b_id", name="uq_related_pair"),)


# =====================
# Chat domain
# =====================


class ChatConversation(Base):
    __tablename__ = "chat_conversations"

    id: Mapped[uuid.UUID] = uuid_pk()
    title: Mapped[Optional[str]] = mapped_column(String(255))
    is_group: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)


class ChatConversationMember(Base):
    __tablename__ = "chat_conversation_members"

    id: Mapped[uuid.UUID] = uuid_pk()
    conversation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("chat_conversations.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    joined_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

    __table_args__ = (UniqueConstraint("conversation_id", "user_id", name="uq_chat_member"),)


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id: Mapped[uuid.UUID] = uuid_pk()
    conversation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("chat_conversations.id", ondelete="CASCADE"), index=True
    )
    sender_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    content: Mapped[str] = mapped_column(String(4000), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, index=True)


class ChatMessageRead(Base):
    __tablename__ = "chat_message_reads"

    id: Mapped[uuid.UUID] = uuid_pk()
    message_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("chat_messages.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    read_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

    __table_args__ = (UniqueConstraint("message_id", "user_id", name="uq_chat_read"),)


# =====================
# Task Request & Execution domain
# =====================


class TaskRequest(Base):
    __tablename__ = "task_requests"

    id: Mapped[uuid.UUID] = uuid_pk()
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(50), default="new", index=True)
    priority: Mapped[str] = mapped_column(String(20), default="normal")
    due_date: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), index=True)

    requested_by_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), index=True
    )
    requested_by_name: Mapped[Optional[str]] = mapped_column(String(255))

    target_type: Mapped[str] = mapped_column(String(20), default="user", index=True)  # user|division
    target_user_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), index=True
    )
    target_user_name: Mapped[Optional[str]] = mapped_column(String(255))
    target_division_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), index=True)
    target_division_label: Mapped[Optional[str]] = mapped_column(String(255))

    project_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="SET NULL"), index=True
    )
    project_name: Mapped[Optional[str]] = mapped_column(String(255))
    project_code: Mapped[Optional[str]] = mapped_column(String(50))

    accepted_task_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), index=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

    messages = relationship(
        "TaskRequestMessage",
        back_populates="request",
        cascade="all, delete-orphan",
        order_by="TaskRequestMessage.created_at",
    )
    task = relationship("TaskItem", back_populates="request", uselist=False)


class TaskRequestMessage(Base):
    __tablename__ = "task_request_messages"

    id: Mapped[uuid.UUID] = uuid_pk()
    request_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("task_requests.id", ondelete="CASCADE"), nullable=False, index=True
    )
    sender_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    sender_name: Mapped[Optional[str]] = mapped_column(String(255))
    message_type: Mapped[str] = mapped_column(String(50), default="note")
    body: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, index=True)

    request = relationship("TaskRequest", back_populates="messages")


class TaskItem(Base):
    __tablename__ = "tasks_v2"

    id: Mapped[uuid.UUID] = uuid_pk()
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(50), default="accepted", index=True)  # accepted|in_progress|done
    priority: Mapped[str] = mapped_column(String(20), default="normal")
    due_date: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), index=True)

    requested_by_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), index=True
    )
    requested_by_name: Mapped[Optional[str]] = mapped_column(String(255))

    assigned_to_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), index=True
    )
    assigned_to_name: Mapped[Optional[str]] = mapped_column(String(255))
    assigned_division_label: Mapped[Optional[str]] = mapped_column(String(255), index=True)

    project_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="SET NULL"), index=True
    )
    project_name: Mapped[Optional[str]] = mapped_column(String(255))
    project_code: Mapped[Optional[str]] = mapped_column(String(50))

    origin_type: Mapped[str] = mapped_column(String(50), default="manual_request", index=True)
    origin_reference: Mapped[Optional[str]] = mapped_column(String(255))
    origin_id: Mapped[Optional[str]] = mapped_column(String(255), index=True)

    request_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("task_requests.id", ondelete="SET NULL"), index=True
    )

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), index=True)
    started_by_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    started_by_name: Mapped[Optional[str]] = mapped_column(String(255))

    concluded_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), index=True)
    concluded_by_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    concluded_by_name: Mapped[Optional[str]] = mapped_column(String(255))

    request = relationship("TaskRequest", back_populates="task")


# Dispatch & Time Tracking Models

class Shift(Base):
    """Shift scheduling for workers on projects"""
    __tablename__ = "shifts"

    id: Mapped[uuid.UUID] = uuid_pk()
    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    worker_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    date: Mapped[Date] = mapped_column(Date, nullable=False)  # Local date
    start_time: Mapped[Time] = mapped_column(Time(timezone=False), nullable=False)  # Local time
    end_time: Mapped[Time] = mapped_column(Time(timezone=False), nullable=False)  # Local time
    status: Mapped[str] = mapped_column(String(50), default="scheduled")  # scheduled|cancelled
    default_break_min: Mapped[int] = mapped_column(Integer, default=30)  # Break duration in minutes
    geofences: Mapped[Optional[list]] = mapped_column(JSON)  # List of {lat, lng, radius_m} geofences
    job_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), index=True)  # Job type/task identifier (to be linked to Job model when available)
    job_name: Mapped[Optional[str]] = mapped_column(String(255))  # Job name snapshot (for reference)
    created_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    cancelled_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    cancelled_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))

    # Indexes for conflict checking
    __table_args__ = (
        Index('idx_shifts_worker_date_time', 'worker_id', 'date', 'start_time', 'end_time'),
        Index('idx_shifts_project_date', 'project_id', 'date'),
    )


class Attendance(Base):
    """Worker clock-in/out attendance records"""
    __tablename__ = "attendance"

    id: Mapped[uuid.UUID] = uuid_pk()
    shift_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("shifts.id", ondelete="CASCADE"), nullable=False, index=True)
    worker_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    type: Mapped[str] = mapped_column(String(10), nullable=False)  # in|out
    time_entered_utc: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)  # When record was created
    time_selected_utc: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)  # Selected time (after rounding)
    status: Mapped[str] = mapped_column(String(20), default="pending")  # approved|pending|rejected
    source: Mapped[str] = mapped_column(String(20), default="app")  # app|supervisor|kiosk|system
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    reason_text: Mapped[Optional[str]] = mapped_column(Text)  # Free-text justification when outside rules
    gps_lat: Mapped[Optional[float]] = mapped_column(Numeric(10, 7))  # GPS latitude
    gps_lng: Mapped[Optional[float]] = mapped_column(Numeric(10, 7))  # GPS longitude
    gps_accuracy_m: Mapped[Optional[float]] = mapped_column(Numeric(10, 2))  # GPS accuracy in meters
    mocked_flag: Mapped[bool] = mapped_column(Boolean, default=False)  # Flag if GPS was mocked
    attachments: Mapped[Optional[list]] = mapped_column(JSON)  # List of file attachments
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    approved_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    approved_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    rejected_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    rejected_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    rejection_reason: Mapped[Optional[str]] = mapped_column(Text)

    # Indexes for queries
    __table_args__ = (
        Index('idx_attendance_worker_time', 'worker_id', 'time_selected_utc'),
        Index('idx_attendance_shift_type', 'shift_id', 'type'),
        Index('idx_attendance_status', 'status'),
    )


class AuditLog(Base):
    """Append-only audit log for all dispatch actions"""
    __tablename__ = "audit_logs"

    id: Mapped[uuid.UUID] = uuid_pk()
    entity_type: Mapped[str] = mapped_column(String(50), nullable=False, index=True)  # shift|attendance|project|user
    entity_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    action: Mapped[str] = mapped_column(String(50), nullable=False)  # CREATE|UPDATE|APPROVE|REJECT|DELETE|CLOCK_IN|CLOCK_OUT
    actor_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), index=True)
    actor_role: Mapped[Optional[str]] = mapped_column(String(50))  # admin|supervisor|worker|system
    source: Mapped[Optional[str]] = mapped_column(String(50))  # app|supervisor|kiosk|system|api
    changes_json: Mapped[Optional[dict]] = mapped_column(JSON)  # Before/after diff
    timestamp_utc: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, nullable=False, index=True)
    context: Mapped[Optional[dict]] = mapped_column(JSON)  # Additional context: {project_id, worker_id, gps_lat, gps_lng, gps_accuracy_m, mocked_flag, reason_text, attachments}
    integrity_hash: Mapped[Optional[str]] = mapped_column(String(64))  # SHA256 hash for integrity verification

    # Indexes for common queries
    __table_args__ = (
        Index('idx_audit_entity', 'entity_type', 'entity_id'),
        Index('idx_audit_actor', 'actor_id', 'timestamp_utc'),
    )


class Notification(Base):
    """Notification records for push and email"""
    __tablename__ = "notifications"

    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    channel: Mapped[str] = mapped_column(String(20), nullable=False)  # push|email
    template_key: Mapped[Optional[str]] = mapped_column(String(100))  # Template identifier
    payload_json: Mapped[Optional[dict]] = mapped_column(JSON)  # Notification payload
    sent_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(String(20), default="pending")  # pending|sent|failed|delivered
    error_message: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

    # Indexes
    __table_args__ = (
        Index('idx_notifications_user_status', 'user_id', 'status'),
        Index('idx_notifications_created', 'created_at'),
    )


class UserNotificationPreference(Base):
    """User notification preferences"""
    __tablename__ = "user_notification_preferences"

    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False, index=True)
    push: Mapped[bool] = mapped_column(Boolean, default=True)
    email: Mapped[bool] = mapped_column(Boolean, default=True)
    quiet_hours: Mapped[Optional[dict]] = mapped_column(JSON)  # {start: "HH:MM", end: "HH:MM", timezone: "America/Vancouver"}
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)


class ConsentLog(Base):
    """Consent tracking for policies"""
    __tablename__ = "consent_logs"

    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    policy_version: Mapped[str] = mapped_column(String(50), nullable=False)
    timestamp_utc: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    ip_address: Mapped[Optional[str]] = mapped_column(String(50))
    user_agent: Mapped[Optional[str]] = mapped_column(String(500))


# =====================
# Project Orders domain
# =====================

class ProjectOrder(Base):
    """Orders generated from project estimates"""
    __tablename__ = "project_orders"

    id: Mapped[uuid.UUID] = uuid_pk()
    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    estimate_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("estimates.id", ondelete="SET NULL"), index=True)
    order_type: Mapped[str] = mapped_column(String(50), nullable=False)  # 'supplier', 'shop_misc', 'subcontractor'
    supplier_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("suppliers.id", ondelete="SET NULL"), index=True)
    supplier_email: Mapped[Optional[str]] = mapped_column(String(255))  # For shop/misc or when supplier email is missing
    recipient_email: Mapped[Optional[str]] = mapped_column(String(255))  # For shop/misc orders
    recipient_user_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    status: Mapped[str] = mapped_column(String(50), default="draft", nullable=False)  # 'draft', 'awaiting_delivery', 'delivered'
    order_code: Mapped[Optional[str]] = mapped_column(String(100))
    email_subject: Mapped[Optional[str]] = mapped_column(String(500))
    email_body: Mapped[Optional[str]] = mapped_column(Text)
    email_cc: Mapped[Optional[str]] = mapped_column(String(500))
    email_sent: Mapped[bool] = mapped_column(Boolean, default=False)
    email_sent_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    delivered_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    delivered_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    notes: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))


class ProjectOrderItem(Base):
    """Items in a project order"""
    __tablename__ = "project_order_items"

    id: Mapped[uuid.UUID] = uuid_pk()
    order_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("project_orders.id", ondelete="CASCADE"), nullable=False, index=True)
    estimate_item_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("estimate_items.id", ondelete="SET NULL"), index=True)
    material_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("materials.id", ondelete="SET NULL"))
    item_type: Mapped[str] = mapped_column(String(50), nullable=False)  # 'product', 'labour', 'subcontractor', 'shop', 'miscellaneous'
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text)
    quantity: Mapped[float] = mapped_column(Float, nullable=False)
    unit: Mapped[Optional[str]] = mapped_column(String(50))
    unit_price: Mapped[float] = mapped_column(Float, nullable=False)
    total_price: Mapped[float] = mapped_column(Float, nullable=False)
    section: Mapped[Optional[str]] = mapped_column(String(255))
    supplier_name: Mapped[Optional[str]] = mapped_column(String(255))
    is_ordered: Mapped[bool] = mapped_column(Boolean, default=False)  # Track if estimate item has been ordered
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)


class CommunityPost(Base):
    __tablename__ = "community_posts"

    id: Mapped[uuid.UUID] = uuid_pk()
    title: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    author_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    is_urgent: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    is_required: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    tags: Mapped[Optional[list]] = mapped_column(JSON, default=list)  # List of tags like ['Announcement', 'Mack Kirk News', 'Image']
    likes_count: Mapped[int] = mapped_column(Integer, default=0)
    comments_count: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, nullable=False, index=True)
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))

    author: Mapped["User"] = relationship("User", foreign_keys=[author_id], backref="community_posts")


# =====================
# Fleet & Equipment Management domain
# =====================

class FleetAsset(Base):
    """Fleet assets: vehicles, heavy machinery, other fleet assets"""
    __tablename__ = "fleet_assets"

    id: Mapped[uuid.UUID] = uuid_pk()
    asset_type: Mapped[str] = mapped_column(String(50), nullable=False, index=True)  # vehicle|heavy_machinery|other
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    vin: Mapped[Optional[str]] = mapped_column(String(100))  # VIN for vehicles, serial for others
    license_plate: Mapped[Optional[str]] = mapped_column(String(50), index=True)  # License plate for vehicles
    model: Mapped[Optional[str]] = mapped_column(String(255))
    year: Mapped[Optional[int]] = mapped_column(Integer)
    division_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("setting_items.id", ondelete="SET NULL"), index=True)
    odometer_current: Mapped[Optional[int]] = mapped_column(Integer)  # Current odometer reading
    odometer_last_service: Mapped[Optional[int]] = mapped_column(Integer)  # Odometer at last service (auto-updated from inspections/work orders)
    hours_current: Mapped[Optional[float]] = mapped_column(Float)  # Current hours (for machinery)
    hours_last_service: Mapped[Optional[float]] = mapped_column(Float)  # Hours at last service (auto-updated from inspections/work orders)
    status: Mapped[str] = mapped_column(String(50), default="active", index=True)  # active|inactive|retired|maintenance
    photos: Mapped[Optional[list]] = mapped_column(JSON)  # Array of file_object_ids
    documents: Mapped[Optional[list]] = mapped_column(JSON)  # Array of file_object_ids
    notes: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))

    # Relationships
    inspections = relationship("FleetInspection", back_populates="fleet_asset", cascade="all, delete-orphan", order_by="FleetInspection.inspection_date.desc()")
    logs = relationship("FleetLog", back_populates="fleet_asset", cascade="all, delete-orphan", order_by="FleetLog.log_date.desc()")

    # Indexes
    __table_args__ = (
        Index('idx_fleet_asset_type_status', 'asset_type', 'status'),
    )


class Equipment(Base):
    """Equipment items: generators, tools, electronics, small tools, safety equipment"""
    __tablename__ = "equipment"

    id: Mapped[uuid.UUID] = uuid_pk()
    category: Mapped[str] = mapped_column(String(50), nullable=False, index=True)  # generator|tool|electronics|small_tool|safety
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    serial_number: Mapped[Optional[str]] = mapped_column(String(255), index=True)
    brand: Mapped[Optional[str]] = mapped_column(String(100))
    model: Mapped[Optional[str]] = mapped_column(String(255))
    value: Mapped[Optional[float]] = mapped_column(Numeric(10, 2))
    warranty_expiry: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    purchase_date: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(String(50), default="available", index=True)  # available|checked_out|maintenance|retired
    photos: Mapped[Optional[list]] = mapped_column(JSON)  # Array of file_object_ids
    documents: Mapped[Optional[list]] = mapped_column(JSON)  # Array of file_object_ids
    notes: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))

    # Relationships
    checkouts = relationship("EquipmentCheckout", back_populates="equipment", cascade="all, delete-orphan", order_by="EquipmentCheckout.checked_out_at.desc()")
    logs = relationship("EquipmentLog", back_populates="equipment", cascade="all, delete-orphan", order_by="EquipmentLog.log_date.desc()")
    assignments = relationship("EquipmentAssignment", back_populates="equipment", cascade="all, delete-orphan", order_by="EquipmentAssignment.assigned_at.desc()")

    # Indexes
    __table_args__ = (
        Index('idx_equipment_category_status', 'category', 'status'),
    )


class FleetInspection(Base):
    """Fleet inspections with checklist results"""
    __tablename__ = "fleet_inspections"

    id: Mapped[uuid.UUID] = uuid_pk()
    fleet_asset_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("fleet_assets.id", ondelete="CASCADE"), nullable=False, index=True)
    inspection_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    inspector_user_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    checklist_results: Mapped[Optional[dict]] = mapped_column(JSON)  # {tire_condition: pass/fail, oil_level: ..., lights: ..., seatbelts: ..., dashboard_warnings: ..., interior_condition: ..., exterior_condition: ...}
    photos: Mapped[Optional[list]] = mapped_column(JSON)  # Array of file_object_ids
    result: Mapped[str] = mapped_column(String(50), default="pass", index=True)  # pass|fail|conditional
    notes: Mapped[Optional[str]] = mapped_column(Text)
    odometer_reading: Mapped[Optional[int]] = mapped_column(Integer)  # Odometer reading at time of inspection
    hours_reading: Mapped[Optional[float]] = mapped_column(Float)  # Hours reading at time of inspection
    auto_generated_work_order_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("work_orders.id", ondelete="SET NULL"), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))

    # Relationships
    fleet_asset = relationship("FleetAsset", back_populates="inspections")
    auto_generated_work_order = relationship("WorkOrder", foreign_keys=[auto_generated_work_order_id], post_update=True)

    # Indexes
    __table_args__ = (
        Index('idx_inspection_asset_date', 'fleet_asset_id', 'inspection_date'),
        Index('idx_inspection_result', 'result'),
    )


class WorkOrder(Base):
    """Unified work orders for fleet and equipment"""
    __tablename__ = "work_orders"

    id: Mapped[uuid.UUID] = uuid_pk()
    work_order_number: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)  # Auto-generated
    entity_type: Mapped[str] = mapped_column(String(50), nullable=False, index=True)  # fleet|equipment
    entity_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)  # FK to FleetAsset or Equipment
    description: Mapped[str] = mapped_column(Text, nullable=False)
    category: Mapped[str] = mapped_column(String(50), default="maintenance", index=True)  # maintenance|repair|inspection|other
    urgency: Mapped[str] = mapped_column(String(20), default="normal", index=True)  # low|normal|high|urgent
    status: Mapped[str] = mapped_column(String(50), default="open", index=True)  # open|in_progress|pending_parts|closed|cancelled
    assigned_to_user_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), index=True)
    assigned_by_user_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    photos: Mapped[Optional[list]] = mapped_column(JSON)  # Array of file_object_ids
    costs: Mapped[Optional[dict]] = mapped_column(JSON)  # Legacy: {labor: 0, parts: 0, other: 0, total: 0} or New: {labor: [{description, amount, invoice_files}], parts: [...], other: [...]}
    documents: Mapped[Optional[list]] = mapped_column(JSON)  # Array of file_object_ids for invoices and documents
    origin_source: Mapped[Optional[str]] = mapped_column(String(50))  # manual|inspection
    origin_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), index=True)  # FK to inspection or other source
    odometer_reading: Mapped[Optional[int]] = mapped_column(Integer)  # Odometer reading at time of work order (for fleet)
    hours_reading: Mapped[Optional[float]] = mapped_column(Float)  # Hours reading at time of work order (for fleet)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    closed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))

    # Relationships - Note: entity relationships are handled via queries, not direct relationships

    # Indexes
    __table_args__ = (
        Index('idx_work_order_entity', 'entity_type', 'entity_id'),
        Index('idx_work_order_status', 'status'),
        Index('idx_work_order_assigned', 'assigned_to_user_id'),
    )


class EquipmentCheckout(Base):
    """Equipment check-out/in tracking"""
    __tablename__ = "equipment_checkouts"

    id: Mapped[uuid.UUID] = uuid_pk()
    equipment_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("equipment.id", ondelete="CASCADE"), nullable=False, index=True)
    checked_out_by_user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    checked_out_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    expected_return_date: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), index=True)
    actual_return_date: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    condition_out: Mapped[str] = mapped_column(String(50), nullable=False)  # new|good|fair|poor
    condition_in: Mapped[Optional[str]] = mapped_column(String(50))  # new|good|fair|poor
    notes_out: Mapped[Optional[str]] = mapped_column(Text)
    notes_in: Mapped[Optional[str]] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(50), default="checked_out", index=True)  # checked_out|returned|overdue
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))

    # Relationships
    equipment = relationship("Equipment", back_populates="checkouts")

    # Indexes
    __table_args__ = (
        Index('idx_checkout_equipment_status', 'equipment_id', 'status'),
        Index('idx_checkout_user', 'checked_out_by_user_id'),
        Index('idx_checkout_expected_return', 'expected_return_date'),
    )


class FleetLog(Base):
    """Fleet usage/status logs"""
    __tablename__ = "fleet_logs"

    id: Mapped[uuid.UUID] = uuid_pk()
    fleet_asset_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("fleet_assets.id", ondelete="CASCADE"), nullable=False, index=True)
    log_type: Mapped[str] = mapped_column(String(50), nullable=False, index=True)  # usage|status_change|repair|inspection|other
    log_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    user_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    description: Mapped[str] = mapped_column(Text, nullable=False)
    odometer_snapshot: Mapped[Optional[int]] = mapped_column(Integer)  # Odometer at time of log
    hours_snapshot: Mapped[Optional[float]] = mapped_column(Float)  # Hours at time of log
    status_snapshot: Mapped[Optional[str]] = mapped_column(String(50))  # Status at time of log
    related_work_order_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("work_orders.id", ondelete="SET NULL"), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))

    # Relationships
    fleet_asset = relationship("FleetAsset", back_populates="logs")

    # Indexes
    __table_args__ = (
        Index('idx_fleet_log_asset_date', 'fleet_asset_id', 'log_date'),
        Index('idx_fleet_log_type', 'log_type'),
    )


class EquipmentLog(Base):
    """Equipment usage/issues logs"""
    __tablename__ = "equipment_logs"

    id: Mapped[uuid.UUID] = uuid_pk()
    equipment_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("equipment.id", ondelete="CASCADE"), nullable=False, index=True)
    log_type: Mapped[str] = mapped_column(String(50), nullable=False, index=True)  # usage|issue|maintenance|checkout|checkin|other
    log_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    user_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    description: Mapped[str] = mapped_column(Text, nullable=False)
    related_work_order_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("work_orders.id", ondelete="SET NULL"), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))

    # Relationships
    equipment = relationship("Equipment", back_populates="logs")

    # Indexes
    __table_args__ = (
        Index('idx_equipment_log_equipment_date', 'equipment_id', 'log_date'),
        Index('idx_equipment_log_type', 'log_type'),
    )


class EquipmentAssignment(Base):
    """Equipment assignment history - tracks when equipment is assigned to users"""
    __tablename__ = "equipment_assignments"

    id: Mapped[uuid.UUID] = uuid_pk()
    equipment_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("equipment.id", ondelete="CASCADE"), nullable=False, index=True)
    assigned_to_user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    assigned_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    returned_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), index=True)
    returned_to_user_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))  # User who received it back
    notes: Mapped[Optional[str]] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)  # True if currently assigned
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

    # Relationships
    equipment = relationship("Equipment", back_populates="assignments")
    assigned_to_user = relationship("User", foreign_keys=[assigned_to_user_id])
    returned_to_user = relationship("User", foreign_keys=[returned_to_user_id])

    # Indexes
    __table_args__ = (
        Index('idx_equipment_assignment_equipment_active', 'equipment_id', 'is_active'),
        Index('idx_equipment_assignment_user_active', 'assigned_to_user_id', 'is_active'),
    )
