#!/usr/bin/env python3
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import HTTPException
from app.db import SessionLocal
from app.models.models import User, Project, ProjectMember
from app.auth.security import can_access_business_line
from app.services.project_visibility import can_manage_project_members
from app.routes.projects import (
    add_project_member,
    get_project,
    list_project_members,
    list_projects,
)


def perm_map(user):
    out = {}
    for role in (user.roles or []):
        try:
            if getattr(role, "permissions", None):
                out.update(role.permissions)
        except Exception:
            pass
    try:
        if getattr(user, "permissions_override", None):
            out.update(user.permissions_override)
    except Exception:
        pass
    return out


def is_admin(user):
    return any((getattr(r, "name", "") or "").lower() == "admin" for r in (user.roles or []))


def has_line_all(user, line: str) -> bool:
    if is_admin(user):
        return True
    pm = perm_map(user)
    if line == "construction":
        return bool(pm.get("business:construction:projects:read:all"))
    if line == "repairs_maintenance":
        return bool(pm.get("business:rm:projects:read:all"))
    return False


def run():
    db = SessionLocal()
    try:
        users = db.query(User).filter(User.is_active.is_(True)).all()
        for user in users:
            _ = user.roles

        projects = (
            db.query(Project)
            .filter(Project.deleted_at.is_(None))
            .order_by(Project.created_at.desc())
            .all()
        )

        chosen = None
        for project in projects:
            line = getattr(project, "business_line", None) or "construction"
            if line not in ("construction", "repairs_maintenance"):
                continue

            members = {
                row.user_id
                for row in db.query(ProjectMember).filter(ProjectMember.project_id == project.id).all()
            }
            if getattr(project, "created_by_user_id", None):
                members.add(project.created_by_user_id)

            all_user = next(
                (u for u in users if can_access_business_line(u, line) and has_line_all(u, line)),
                None,
            )
            member_user = next(
                (u for u in users if u.id in members and can_access_business_line(u, line)),
                None,
            )
            outsider_user = next(
                (
                    u
                    for u in users
                    if u.id not in members
                    and can_access_business_line(u, line)
                    and not has_line_all(u, line)
                ),
                None,
            )
            manager_user = next(
                (
                    u
                    for u in users
                    if can_access_business_line(u, line)
                    and can_manage_project_members(u)
                    and (u.id in members or has_line_all(u, line))
                ),
                None,
            )
            no_manage_user = next(
                (
                    u
                    for u in users
                    if can_access_business_line(u, line)
                    and (u.id in members or has_line_all(u, line))
                    and not can_manage_project_members(u)
                ),
                None,
            )
            if all_user and member_user and outsider_user and manager_user and no_manage_user and members:
                chosen = {
                    "project": project,
                    "line": line,
                    "all_user": all_user,
                    "member_user": member_user,
                    "outsider_user": outsider_user,
                    "manager_user": manager_user,
                    "no_manage_user": no_manage_user,
                    "existing_member_id": str(next(iter(members))),
                }
                break

        if not chosen:
            raise RuntimeError("Could not find suitable user/project combination for smoke tests")

        project = chosen["project"]
        line = chosen["line"]

        results = []

        def status_of(callable_fn, *args, **kwargs):
            try:
                callable_fn(*args, **kwargs)
                return 200
            except HTTPException as exc:
                return int(exc.status_code)

        s = status_of(get_project, str(project.id), None, db, chosen["all_user"])
        results.append(("all_user_detail_200", s == 200, s))

        s = status_of(get_project, str(project.id), None, db, chosen["member_user"])
        results.append(("member_detail_200", s == 200, s))

        s = status_of(get_project, str(project.id), None, db, chosen["outsider_user"])
        results.append(("outsider_detail_403", s == 403, s))

        outsider_rows = list_projects(
            business_line=line,
            db=db,
            user=chosen["outsider_user"],
        )
        ids = {str(item.get("id")) for item in outsider_rows if isinstance(item, dict)}
        results.append(("outsider_list_excludes_project", str(project.id) not in ids, 200))

        s = status_of(list_project_members, str(project.id), db, chosen["member_user"])
        results.append(("member_list_members_200", s == 200, s))

        s = status_of(list_project_members, str(project.id), db, chosen["outsider_user"])
        results.append(("outsider_list_members_403", s == 403, s))

        s = status_of(
            add_project_member,
            str(project.id),
            {"user_id": chosen["existing_member_id"]},
            db,
            chosen["no_manage_user"],
        )
        results.append(("no_manage_add_member_403", s == 403, s))

        s = status_of(
            add_project_member,
            str(project.id),
            {"user_id": chosen["existing_member_id"]},
            db,
            chosen["manager_user"],
        )
        results.append(("manager_add_member_200", s == 200, s))

        print("SMOKE_TARGET", {"project_id": str(project.id), "line": line})
        for name, ok, status in results:
            print(f"{name}: {'PASS' if ok else 'FAIL'} (status={status})")

        failed = [name for name, ok, _ in results if not ok]
        print("TOTAL", len(results), "FAILED", len(failed))
        if failed:
            print("FAILED_CASES", failed)
            raise SystemExit(1)
    finally:
        db.close()


if __name__ == "__main__":
    run()
