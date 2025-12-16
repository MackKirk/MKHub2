"""
Permission checking service for dispatch operations.
"""
from typing import Optional
from sqlalchemy.orm import Session

from ..models.models import User, Role, Project
from ..auth.security import get_current_user


def is_admin(user: User, db: Session) -> bool:
    """Check if user has admin role."""
    admin_role = db.query(Role).filter(Role.name == "admin").first()
    if not admin_role:
        return False
    return admin_role in user.roles


def is_supervisor(user: User, db: Session, project_id: Optional[str] = None) -> bool:
    """
    Check if user has supervisor role.
    Optionally check if supervisor has access to specific project.
    """
    supervisor_role = db.query(Role).filter(Role.name == "supervisor").first()
    if not supervisor_role:
        return False
    
    has_role = supervisor_role in user.roles
    
    if project_id:
        # Check if user is assigned to this project as supervisor
        # This could be checked via project assignments, division membership, etc.
        # For now, if user has supervisor role, they can access any project
        # TODO: Implement project-specific supervisor assignments
        pass
    
    return has_role


def is_worker(user: User, db: Session) -> bool:
    """Check if user has worker role."""
    worker_role = db.query(Role).filter(Role.name == "worker").first()
    if not worker_role:
        return False
    return worker_role in user.roles


def can_modify_shift(user: User, shift, db: Session) -> bool:
    """
    Check if user can modify a shift.
    - Admin can modify any shift
    - Supervisor of the worker can modify shifts for that worker
    - On-site lead of the project can modify shifts in that project
    """
    if is_admin(user, db):
        return True
    
    # Check if user is supervisor of the worker
    from ..models.models import EmployeeProfile
    worker_profile = db.query(EmployeeProfile).filter(EmployeeProfile.user_id == shift.worker_id).first()
    is_worker_supervisor = worker_profile and worker_profile.manager_user_id and str(worker_profile.manager_user_id) == str(user.id)
    if is_worker_supervisor:
        return True
    
    # Check if user is on-site lead of the project
    if shift.project_id:
        from ..models.models import Project
        project = db.query(Project).filter(Project.id == shift.project_id).first()
        if project:
            # Check division_onsite_leads
            if project.division_onsite_leads:
                for division_id, lead_id in project.division_onsite_leads.items():
                    if str(lead_id) == str(user.id):
                        return True
            # Check legacy onsite_lead_id field
            if project.onsite_lead_id and str(project.onsite_lead_id) == str(user.id):
                return True
    
    return False


def can_modify_attendance(user: User, attendance, db: Session) -> bool:
    """
    Check if user can modify attendance.
    - Admin can modify any attendance
    - Supervisor can modify attendance in their projects
    - Worker can only modify their own attendance (and only if pending)
    """
    if is_admin(user, db):
        return True
    
    # Get shift to check project
    from ..models.models import Shift
    shift = db.query(Shift).filter(Shift.id == attendance.shift_id).first()
    if not shift:
        return False
    
    if is_supervisor(user, db, str(shift.project_id)):
        return True
    
    # Worker can only modify their own pending attendance
    if is_worker(user, db) and str(attendance.worker_id) == str(user.id):
        return attendance.status == "pending"
    
    return False


def can_approve_attendance(user: User, attendance, db: Session) -> bool:
    """
    Check if user can approve/reject attendance.
    - Admin can approve any attendance
    - Supervisor can approve attendance in their projects
    - Worker cannot approve
    """
    if is_admin(user, db):
        return True
    
    # Get shift to check project
    from ..models.models import Shift
    shift = db.query(Shift).filter(Shift.id == attendance.shift_id).first()
    if not shift:
        return False
    
    if is_supervisor(user, db, str(shift.project_id)):
        return True
    
    return False




