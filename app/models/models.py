import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import (
    Column,
    String,
    DateTime,
    Boolean,
    ForeignKey,
    Table,
    Integer,
    JSON,
    UniqueConstraint,
    BigInteger,
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

    roles = relationship("Role", secondary=user_roles, back_populates="users")


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
    address_city: Mapped[Optional[str]] = mapped_column(String(100))
    address_province: Mapped[Optional[str]] = mapped_column(String(100))
    address_country: Mapped[Optional[str]] = mapped_column(String(100))
    division_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True))
    status_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True))
    estimator_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True))
    onsite_lead_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True))
    date_start: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    date_eta: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    date_end: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
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


class Client(Base):
    __tablename__ = "clients"

    id: Mapped[uuid.UUID] = uuid_pk()
    code: Mapped[Optional[str]] = mapped_column(String(50), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    address: Mapped[Optional[str]] = mapped_column(String(255))
    city: Mapped[Optional[str]] = mapped_column(String(100))
    province: Mapped[Optional[str]] = mapped_column(String(100))
    country: Mapped[Optional[str]] = mapped_column(String(100))
    type_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True))
    status_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True))
    payment_terms_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True))
    billing_email: Mapped[Optional[str]] = mapped_column(String(255))
    po_required: Mapped[bool] = mapped_column(Boolean, default=False)
    tax_number: Mapped[Optional[str]] = mapped_column(String(100))
    dataforma_id: Mapped[Optional[str]] = mapped_column(String(100), unique=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)


class ClientContact(Base):
    __tablename__ = "client_contacts"

    id: Mapped[uuid.UUID] = uuid_pk()
    client_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("clients.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[Optional[str]] = mapped_column(String(255))
    phone: Mapped[Optional[str]] = mapped_column(String(100))
    is_primary: Mapped[bool] = mapped_column(Boolean, default=False)
    sort_index: Mapped[int] = mapped_column(Integer, default=0)


# Legacy Employee model removed in favor of EmployeeProfile linked to User


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