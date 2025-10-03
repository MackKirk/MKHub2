"""
Seed the local database with sample employees (users) and customers (clients).

Usage:
  python scripts/seed_test_data.py

This script is idempotent: running it multiple times will upsert the same
records based on unique fields (username/email for users, code for clients).
"""

import uuid
from datetime import datetime, timezone

from app.db import SessionLocal, Base, engine
from app.models.models import (
    User,
    Role,
    EmployeeProfile,
    Client,
    ClientContact,
    ClientSite,
)
from app.auth.security import get_password_hash


def ensure_role(session, name: str, description: str = "", permissions: dict | None = None) -> Role:
    role = session.query(Role).filter(Role.name == name).first()
    if role:
        # Update description/permissions if provided
        changed = False
        if description and role.description != description:
            role.description = description
            changed = True
        if permissions is not None:
            base = role.permissions or {}
            base.update(permissions)
            role.permissions = base
            changed = True
        if changed:
            session.add(role)
        return role
    role = Role(name=name, description=description or name.title(), permissions=permissions or {})
    session.add(role)
    session.flush()
    return role


def ensure_user(session, username: str, email: str, password: str, roles: list[str]) -> User:
    user = session.query(User).filter((User.username == username) | (User.email_personal == email)).first()
    if user:
        # Update basic fields and roles if changed
        user.username = username
        user.email_personal = email
        # Only reset password if it's clearly a different user or forced; keep existing otherwise
        if not getattr(user, "password_hash", None):
            user.password_hash = get_password_hash(password)
        # Assign roles
        role_rows = session.query(Role).filter(Role.name.in_(roles)).all()
        user.roles = role_rows
        session.add(user)
        session.flush()
        return user
    user = User(
        username=username,
        email_personal=email,
        password_hash=get_password_hash(password),
        is_active=True,
        created_at=datetime.now(timezone.utc),
    )
    session.add(user)
    session.flush()
    # Assign roles
    role_rows = session.query(Role).filter(Role.name.in_(roles)).all()
    user.roles = role_rows
    session.add(user)
    session.flush()
    # Minimal employee profile
    profile = EmployeeProfile(user_id=user.id, first_name=username.split(".")[0].title(), last_name=username.split(".")[-1].title())
    session.add(profile)
    session.flush()
    return user


def ensure_client(session, code: str, display_name: str, **kwargs) -> Client:
    cli = session.query(Client).filter(Client.code == code).first()
    now = datetime.now(timezone.utc)
    if cli:
        # Update key identity/address fields
        cli.display_name = display_name
        for k, v in kwargs.items():
            if hasattr(cli, k):
                setattr(cli, k, v)
        cli.updated_at = now
        session.add(cli)
        session.flush()
        return cli
    cli = Client(
        code=code,
        name=display_name,  # legacy field
        display_name=display_name,
        created_at=now,
        **{k: v for k, v in kwargs.items() if hasattr(Client, k)}
    )
    session.add(cli)
    session.flush()
    return cli


def ensure_client_contact(session, client_id: uuid.UUID, name: str, **kwargs) -> ClientContact:
    row = (
        session.query(ClientContact)
        .filter(ClientContact.client_id == client_id, ClientContact.name == name)
        .first()
    )
    if row:
        for k, v in kwargs.items():
            if hasattr(row, k):
                setattr(row, k, v)
        session.add(row)
        session.flush()
        return row
    row = ClientContact(client_id=client_id, name=name, **{k: v for k, v in kwargs.items() if hasattr(ClientContact, k)})
    session.add(row)
    session.flush()
    return row


def ensure_client_site(session, client_id: uuid.UUID, site_name: str, **kwargs) -> ClientSite:
    row = (
        session.query(ClientSite)
        .filter(ClientSite.client_id == client_id, ClientSite.site_name == site_name)
        .first()
    )
    if row:
        for k, v in kwargs.items():
            if hasattr(row, k):
                setattr(row, k, v)
        session.add(row)
        session.flush()
        return row
    row = ClientSite(client_id=client_id, site_name=site_name, **{k: v for k, v in kwargs.items() if hasattr(ClientSite, k)})
    session.add(row)
    session.flush()
    return row


def main() -> None:
    # Ensure tables exist (safe for SQLite dev)
    Base.metadata.create_all(bind=engine)

    session = SessionLocal()
    try:
        # Roles and permissions
        admin_perm = {
            "users:read": True,
            "users:write": True,
            "invite:send": True,
            "clients:read": True,
            "clients:write": True,
            "inventory:read": True,
            "inventory:write": True,
            "inventory:send_email": True,
        }
        ensure_role(session, "admin", "Administrator", permissions=admin_perm)
        ensure_role(session, "estimator", "Estimator", permissions={"clients:read": True})
        ensure_role(session, "warehouse", "Warehouse", permissions={"inventory:read": True, "inventory:write": True, "inventory:send_email": True})

        # Users
        admin = ensure_user(session, "admin.user", "admin@example.com", "TestAdmin123!", ["admin"])
        est = ensure_user(session, "emma.estimator", "emma.estimator@example.com", "TestUser123!", ["estimator"])
        wh = ensure_user(session, "wally.warehouse", "wally.warehouse@example.com", "TestUser123!", ["warehouse"])

        # Clients (Customers)
        acme = ensure_client(
            session,
            code="ACME",
            display_name="ACME Corp",
            client_type="Commercial",
            client_status="Active",
            lead_source="Web",
            estimator_id=est.id,
            description="Key account for commercial projects.",
            address_line1="100 Main St",
            city="Vancouver",
            province="British Columbia",
            country="Canada",
            postal_code="V6B 1A1",
            billing_email="ap@acme.example",
            po_required=True,
        )
        ensure_client_contact(session, acme.id, "Alice Manager", role_title="Facilities Manager", email="alice.manager@acme.example", phone="604-555-1000", is_primary=True, role_tags=["Facilities/Property Manager"]) 
        ensure_client_contact(session, acme.id, "Bob Accounts", role_title="AP", email="ap@acme.example", role_tags=["AP/Accounting"]) 
        ensure_client_site(session, acme.id, "Head Office", site_address_line1="100 Main St", site_city="Vancouver", site_province="British Columbia", site_country="Canada", site_notes="Visitor parking underground.")

        globex = ensure_client(
            session,
            code="GLOBEX",
            display_name="Globex Residential",
            client_type="Residential",
            client_status="Prospect",
            lead_source="Referral",
            estimator_id=est.id,
            description="Residential prospect referred by ACME.",
            address_line1="200 Oak Ave",
            city="Burnaby",
            province="British Columbia",
            country="Canada",
            postal_code="V5H 2K2",
            billing_email="owner@globex.example",
            po_required=False,
        )
        ensure_client_contact(session, globex.id, "Grace Owner", role_title="Owner", email="owner@globex.example", phone="604-555-2000", is_primary=True)

        # Commit all changes
        session.commit()
        print("Seed completed: users and clients upserted.")
    except Exception as e:
        session.rollback()
        raise
    finally:
        session.close()


if __name__ == "__main__":
    main()


