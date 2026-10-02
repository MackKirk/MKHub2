from fastapi import APIRouter, Depends, HTTPException, Query, Body
from sqlalchemy.orm import Session
from sqlalchemy import func, or_, and_, case
from typing import Optional, List
from datetime import datetime, timezone, date, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo
import uuid as uuid_lib
import os

from ..db import get_db
from ..models.models import (
    User, EmployeeProfile, SettingList, SettingItem,
    EmployeeSalaryHistory, EmployeeLoan, LoanPayment,
    EmployeeNotice, EmployeeFineTicket, EmployeeEquipment,
    TimeOffBalance, TimeOffRequest, TimeOffHistory,
    EmployeeReport, ReportAttachment, ReportComment,
    EmployeeDocument, EmployeeFolder,
)
from ..auth.security import (
    require_permissions,
    require_roles,
    get_current_user,
    _has_permission,
    _user_is_admin,
)
from ..config import settings
from ..services.bamboohr_client import BambooHRClient
from ..services.bamboohr_time_off_sync import (
    resolve_bamboohr_id_for_user,
    sync_user_time_off_balance,
    sync_user_time_off_history,
)


router = APIRouter(prefix="/employees", tags=["employee-management"])

REPORTS_DOCUMENTS_FOLDER_NAME = "Reports"


def _get_or_create_reports_documents_folder(
    db: Session, user_id: uuid_lib.UUID, created_by: Optional[uuid_lib.UUID] = None
) -> EmployeeFolder:
    folder = (
        db.query(EmployeeFolder)
        .filter(
            EmployeeFolder.user_id == user_id,
            EmployeeFolder.name == REPORTS_DOCUMENTS_FOLDER_NAME,
            EmployeeFolder.parent_id.is_(None),
        )
        .first()
    )
    if folder:
        return folder
    folder = EmployeeFolder(
        user_id=user_id,
        name=REPORTS_DOCUMENTS_FOLDER_NAME,
        parent_id=None,
        created_by=created_by,
    )
    db.add(folder)
    db.flush()
    return folder


def _mirror_report_attachment_to_employee_docs(
    db: Session,
    user_id: uuid_lib.UUID,
    file_id: uuid_lib.UUID,
    file_name: Optional[str],
    created_by: Optional[uuid_lib.UUID],
) -> None:
    existing = (
        db.query(EmployeeDocument)
        .filter(EmployeeDocument.user_id == user_id, EmployeeDocument.file_id == file_id)
        .first()
    )
    if existing:
        return
    folder = _get_or_create_reports_documents_folder(db, user_id, created_by)
    db.add(
        EmployeeDocument(
            user_id=user_id,
            doc_type=f"folder:{folder.id}",
            title=(file_name or "").strip() or "Report attachment",
            notes="Uploaded from employee report.",
            file_id=file_id,
            created_by=created_by,
        )
    )


# =====================
# Divisions Management
# =====================

@router.get("/{user_id}/divisions")
def get_user_divisions(
    user_id: str,
    db: Session = Depends(get_db),
    _=Depends(require_permissions("users:read", "hr:users:read", "hr:users:view:job", "hr:users:view:general"))
):
    """Get all divisions for a user"""
    from sqlalchemy.orm import joinedload
    user = db.query(User).options(joinedload(User.divisions)).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    divisions = user.divisions if hasattr(user, 'divisions') and user.divisions else []
    return [{"id": str(d.id), "label": d.label, "value": d.value} for d in divisions]


@router.put("/{user_id}/divisions")
def update_user_divisions(
    user_id: str,
    division_ids: List[str],
    db: Session = Depends(get_db),
    actor: User = Depends(require_permissions("users:write", "hr:users:edit:job", "hr:users:edit:general")),
):
    """Update user divisions (replace existing)"""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    divisions_list = db.query(SettingList).filter(SettingList.name == "divisions").first()
    if not divisions_list:
        raise HTTPException(status_code=404, detail="Divisions list not found")

    division_items = db.query(SettingItem).filter(
        SettingItem.list_id == divisions_list.id,
        SettingItem.id.in_([uuid_lib.UUID(did) for did in division_ids])
    ).all()

    user.divisions = division_items
    ep = db.query(EmployeeProfile).filter(EmployeeProfile.user_id == user.id).first()
    if not ep:
        ep = EmployeeProfile(user_id=user.id)
        db.add(ep)
    ep.updated_at = datetime.now(timezone.utc)
    ep.updated_by = actor.id
    db.commit()

    return {"status": "ok", "divisions": [{"id": str(d.id), "label": d.label} for d in division_items]}


@router.put("/{user_id}/project-divisions")
def update_user_project_divisions(
    user_id: str,
    project_division_ids: List[str] = Body(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permissions("users:write", "hr:users:edit:job", "hr:users:edit:general"))
):
    """Update user project divisions (replace existing)"""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    profile = db.query(EmployeeProfile).filter(EmployeeProfile.user_id == user.id).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Employee profile not found")
    
    # Validate that all IDs are valid UUIDs
    try:
        validated_ids = [uuid_lib.UUID(did) for did in project_division_ids]
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"Invalid UUID format: {e}")
    
    # Store as list of strings for JSON serialization
    profile.project_division_ids = [str(did) for did in validated_ids]
    profile.updated_at = datetime.now(timezone.utc)
    profile.updated_by = current_user.id
    
    db.commit()
    
    return {"status": "ok", "project_division_ids": profile.project_division_ids}


# =====================
# Salary History
# =====================

@router.get("/{user_id}/salary-history")
def get_salary_history(
    user_id: str,
    db: Session = Depends(get_db),
    _=Depends(require_permissions("users:read", "hr:users:read", "hr:users:view:job", "hr:users:view:job:compensation", "hr:users:view:general"))
):
    """Get salary history for a user"""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    history = db.query(EmployeeSalaryHistory).filter(
        EmployeeSalaryHistory.user_id == user.id
    ).order_by(EmployeeSalaryHistory.effective_date.desc()).all()
    
    result = []
    for h in history:
        requested_by_user = db.query(User).filter(User.id == h.requested_by).first()
        approved_by_user = None
        if h.approved_by:
            approved_by_user = db.query(User).filter(User.id == h.approved_by).first()
        
        result.append({
            "id": str(h.id),
            "previous_salary": h.previous_salary,
            "new_salary": h.new_salary,
            "pay_type": h.pay_type,
            "effective_date": h.effective_date.isoformat() if h.effective_date else None,
            "justification": h.justification,
            "requested_by": {
                "id": str(h.requested_by),
                "username": requested_by_user.username if requested_by_user else None,
            },
            "approved_by": {
                "id": str(h.approved_by),
                "username": approved_by_user.username if approved_by_user else None,
            } if h.approved_by else None,
            "approved_at": h.approved_at.isoformat() if h.approved_at else None,
            "notes": h.notes,
            "created_at": h.created_at.isoformat() if h.created_at else None,
        })
    
    return result


@router.post("/{user_id}/salary-history")
def create_salary_history(
    user_id: str,
    payload: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permissions("users:write", "hr:users:edit:job", "hr:users:edit:general"))
):
    """Create a new salary history entry"""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Get current salary from profile
    profile = db.query(EmployeeProfile).filter(EmployeeProfile.user_id == user.id).first()
    previous_salary = profile.pay_rate if profile else None
    
    # Parse effective date
    effective_date_str = payload.get("effective_date")
    if not effective_date_str:
        raise HTTPException(status_code=400, detail="effective_date is required")
    
    effective_date = datetime.fromisoformat(effective_date_str.replace('Z', '+00:00'))
    
    # Create salary history entry
    salary_history = EmployeeSalaryHistory(
        user_id=user.id,
        previous_salary=previous_salary,
        new_salary=payload.get("new_salary"),
        pay_type=payload.get("pay_type"),
        effective_date=effective_date,
        justification=payload.get("justification", ""),
        requested_by=current_user.id,
        approved_by=uuid_lib.UUID(payload["approved_by"]) if payload.get("approved_by") else None,
        approved_at=datetime.now(timezone.utc) if payload.get("approved_by") else None,
        notes=payload.get("notes"),
    )
    
    db.add(salary_history)
    
    # Update profile with new salary
    if profile:
        profile.pay_rate = payload.get("new_salary")
        profile.pay_type = payload.get("pay_type")
        profile.updated_at = datetime.now(timezone.utc)
        profile.updated_by = current_user.id
    
    db.commit()
    db.refresh(salary_history)
    
    return {"id": str(salary_history.id), "status": "ok"}


# =====================
# Loans Management
# =====================

@router.get("/{user_id}/loans/summary")
def get_loans_summary(
    user_id: str,
    db: Session = Depends(get_db),
    _=Depends(require_permissions("users:read", "hr:users:read", "hr:users:view:loans", "hr:users:view:general"))
):
    """Get loans summary for a user (total loaned, total paid, total outstanding)"""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    loans = db.query(EmployeeLoan).filter(EmployeeLoan.user_id == user.id).all()
    
    total_loaned = sum(float(loan.loan_amount) for loan in loans)
    total_paid = sum(float(loan.loan_amount) - float(loan.remaining_balance) for loan in loans)
    total_outstanding = sum(float(loan.remaining_balance) for loan in loans if loan.status == "active")
    
    return {
        "total_loaned": total_loaned,
        "total_paid": total_paid,
        "total_outstanding": total_outstanding,
    }


@router.get("/{user_id}/loans")
def get_user_loans(
    user_id: str,
    status: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    _=Depends(require_permissions("users:read", "hr:users:read", "hr:users:view:loans", "hr:users:view:general"))
):
    """Get all loans for a user"""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    query = db.query(EmployeeLoan).filter(EmployeeLoan.user_id == user.id)
    if status:
        # Map frontend status to backend status
        status_map = {"Active": "active", "Closed": "closed", "Cancelled": "cancelled"}
        backend_status = status_map.get(status, status.lower())
        query = query.filter(EmployeeLoan.status == backend_status)
    
    loans = query.order_by(EmployeeLoan.loan_date.desc()).all()
    
    result = []
    for loan in loans:
        created_by_user = db.query(User).filter(User.id == loan.created_by).first()
        # Map backend status to frontend status
        status_map = {"active": "Active", "closed": "Closed", "cancelled": "Cancelled", "paid_off": "Closed"}
        frontend_status = status_map.get(loan.status, loan.status.capitalize())
        
        result.append({
            "id": str(loan.id),
            "loan_amount": float(loan.loan_amount),
            "base_amount": float(loan.base_amount) if loan.base_amount is not None else None,
            "fees_percent": float(loan.fees_percent) if loan.fees_percent is not None else None,
            "remaining_balance": float(loan.remaining_balance),
            "weekly_payment": float(loan.weekly_payment),
            "loan_date": loan.loan_date.isoformat() if loan.loan_date else None,
            "payment_method": loan.payment_method,
            "status": frontend_status,
            "description": loan.description,
            "notes": loan.notes,
            "created_by": {
                "id": str(loan.created_by),
                "username": created_by_user.username if created_by_user else None,
            },
            "created_at": loan.created_at.isoformat() if loan.created_at else None,
            "updated_at": loan.updated_at.isoformat() if loan.updated_at else None,
            "paid_off_at": loan.paid_off_at.isoformat() if loan.paid_off_at else None,
            "payments_count": len(loan.payments) if loan.payments else 0,
        })
    
    return result


@router.get("/{user_id}/loans/{loan_id}")
def get_loan_details(
    user_id: str,
    loan_id: str,
    db: Session = Depends(get_db),
    _=Depends(require_permissions("users:read", "hr:users:read", "hr:users:view:loans", "hr:users:view:general"))
):
    """Get loan details with payments"""
    loan = db.query(EmployeeLoan).filter(
        EmployeeLoan.id == loan_id,
        EmployeeLoan.user_id == user_id
    ).first()
    
    if not loan:
        raise HTTPException(status_code=404, detail="Loan not found")
    
    created_by_user = db.query(User).filter(User.id == loan.created_by).first()
    updated_by_user = None
    if loan.updated_by:
        updated_by_user = db.query(User).filter(User.id == loan.updated_by).first()
    
    payments = []
    for payment in loan.payments:
        created_by_payment = db.query(User).filter(User.id == payment.created_by).first()
        payments.append({
            "id": str(payment.id),
            "payment_amount": float(payment.payment_amount),
            "payment_date": payment.payment_date.isoformat() if payment.payment_date else None,
            "payment_method": payment.payment_method,
            "balance_after": float(payment.balance_after),
            "notes": payment.notes,
            "created_by": {
                "id": str(payment.created_by),
                "username": created_by_payment.username if created_by_payment else None,
            },
            "created_at": payment.created_at.isoformat() if payment.created_at else None,
        })
    
    # Map backend status to frontend status
    status_map = {"active": "Active", "closed": "Closed", "cancelled": "Cancelled", "paid_off": "Closed"}
    frontend_status = status_map.get(loan.status, loan.status.capitalize())
    
    return {
        "id": str(loan.id),
        "loan_amount": float(loan.loan_amount),
        "base_amount": float(loan.base_amount) if loan.base_amount is not None else None,
        "fees_percent": float(loan.fees_percent) if loan.fees_percent is not None else None,
        "remaining_balance": float(loan.remaining_balance),
        "weekly_payment": float(loan.weekly_payment),
        "loan_date": loan.loan_date.isoformat() if loan.loan_date else None,
        "payment_method": loan.payment_method,
        "status": frontend_status,
        "description": loan.description,
        "notes": loan.notes,
        "created_by": {
            "id": str(loan.created_by),
            "username": created_by_user.username if created_by_user else None,
        },
        "created_at": loan.created_at.isoformat() if loan.created_at else None,
        "updated_at": loan.updated_at.isoformat() if loan.updated_at else None,
        "updated_by": {
            "id": str(loan.updated_by),
            "username": updated_by_user.username if updated_by_user else None,
        } if loan.updated_by else None,
        "paid_off_at": loan.paid_off_at.isoformat() if loan.paid_off_at else None,
        "payments": payments,
    }


@router.post("/{user_id}/loans")
def create_loan(
    user_id: str,
    payload: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permissions("users:write", "hr:users:write", "hr:users:edit:loans", "hr:users:edit:general"))
):
    """Create a new loan for a user"""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    loan_date_str = payload.get("loan_date") or payload.get("agreement_date")
    if not loan_date_str:
        loan_date = datetime.now(timezone.utc)
    else:
        loan_date = datetime.fromisoformat(loan_date_str.replace('Z', '+00:00'))
    
    # Map frontend status to backend status
    status_map = {"Active": "active", "Closed": "closed", "Cancelled": "cancelled"}
    frontend_status = payload.get("status", "Active")
    backend_status = status_map.get(frontend_status, "active")
    
    loan_amount_total = Decimal(str(payload.get("loan_amount", 0)))
    base_amount = payload.get("base_amount")
    fees_percent = payload.get("fees_percent")
    
    loan = EmployeeLoan(
        user_id=user.id,
        loan_amount=loan_amount_total,
        base_amount=Decimal(str(base_amount)) if base_amount is not None else None,
        fees_percent=Decimal(str(fees_percent)) if fees_percent is not None else None,
        remaining_balance=loan_amount_total,
        weekly_payment=Decimal(str(payload.get("weekly_payment", 0))),
        loan_date=loan_date,
        payment_method=payload.get("payment_method"),
        status=backend_status,
        description=payload.get("description"),
        notes=payload.get("notes"),
        created_by=current_user.id,
    )
    
    db.add(loan)
    db.commit()
    db.refresh(loan)
    
    return {"id": str(loan.id), "status": "ok"}


@router.post("/{user_id}/loans/{loan_id}/payments")
def create_loan_payment(
    user_id: str,
    loan_id: str,
    payload: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permissions("users:write", "hr:users:write", "hr:users:edit:loans", "hr:users:edit:general"))
):
    """Create a payment for a loan"""
    loan = db.query(EmployeeLoan).filter(
        EmployeeLoan.id == loan_id,
        EmployeeLoan.user_id == user_id
    ).first()
    
    if not loan:
        raise HTTPException(status_code=404, detail="Loan not found")
    
    if loan.status not in ["active"]:
        raise HTTPException(status_code=400, detail="Loan is not active")
    
    payment_amount = Decimal(str(payload.get("payment_amount", 0)))
    if payment_amount <= 0:
        raise HTTPException(status_code=400, detail="Payment amount must be greater than 0")
    
    # Allow payment to exceed balance, but cap it at the remaining balance
    if payment_amount > loan.remaining_balance:
        payment_amount = loan.remaining_balance
    
    payment_date_str = payload.get("payment_date")
    if not payment_date_str:
        payment_date = datetime.now(timezone.utc)
    else:
        payment_date = datetime.fromisoformat(payment_date_str.replace('Z', '+00:00'))
    
    new_balance = loan.remaining_balance - payment_amount
    
    payment = LoanPayment(
        loan_id=loan.id,
        payment_amount=payment_amount,
        payment_date=payment_date,
        payment_method=payload.get("payment_method") or payload.get("origin"),
        balance_after=new_balance,
        notes=payload.get("notes"),
        created_by=current_user.id,
    )
    
    loan.remaining_balance = new_balance
    loan.updated_at = datetime.now(timezone.utc)
    loan.updated_by = current_user.id
    
    # Check if balance reached 0 - but don't auto-close (frontend will ask user)
    should_close = new_balance <= 0
    
    db.add(payment)
    db.commit()
    db.refresh(payment)
    
    return {
        "id": str(payment.id),
        "status": "ok",
        "remaining_balance": float(new_balance),
        "should_close": should_close,
    }


@router.patch("/{user_id}/loans/{loan_id}/close")
def close_loan(
    user_id: str,
    loan_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permissions("users:write", "hr:users:write", "hr:users:edit:loans", "hr:users:edit:general"))
):
    """Close a loan (mark as closed)"""
    loan = db.query(EmployeeLoan).filter(
        EmployeeLoan.id == loan_id,
        EmployeeLoan.user_id == user_id
    ).first()
    
    if not loan:
        raise HTTPException(status_code=404, detail="Loan not found")
    
    loan.status = "closed"
    loan.updated_at = datetime.now(timezone.utc)
    loan.updated_by = current_user.id
    if not loan.paid_off_at:
        loan.paid_off_at = datetime.now(timezone.utc)
    
    db.commit()
    
    return {"status": "ok"}


@router.patch("/{user_id}/loans/{loan_id}")
def update_loan(
    user_id: str,
    loan_id: str,
    payload: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permissions("users:write", "hr:users:write", "hr:users:edit:loans", "hr:users:edit:general"))
):
    """Update a loan (e.g., status, notes, etc.)"""
    loan = db.query(EmployeeLoan).filter(
        EmployeeLoan.id == loan_id,
        EmployeeLoan.user_id == user_id
    ).first()
    
    if not loan:
        raise HTTPException(status_code=404, detail="Loan not found")
    
    # Map frontend status to backend status
    if "status" in payload:
        status_map = {"Active": "active", "Closed": "closed", "Cancelled": "cancelled"}
        frontend_status = payload["status"]
        backend_status = status_map.get(frontend_status, frontend_status.lower())
        loan.status = backend_status
        loan.updated_at = datetime.now(timezone.utc)
        loan.updated_by = current_user.id
        
        # If closing, set paid_off_at if not already set
        if backend_status == "closed" and not loan.paid_off_at:
            loan.paid_off_at = datetime.now(timezone.utc)
    
    # Allow updating notes
    if "notes" in payload:
        loan.notes = payload.get("notes")
        loan.updated_at = datetime.now(timezone.utc)
        loan.updated_by = current_user.id
    
    db.commit()
    
    return {"status": "ok"}


# =====================
# Notices Management
# =====================

@router.get("/{user_id}/notices")
def get_user_notices(
    user_id: str,
    notice_type: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    _=Depends(require_permissions("users:read", "hr:users:read", "hr:users:view:reports", "hr:users:view:general"))
):
    """Get all notices for a user"""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    query = db.query(EmployeeNotice).filter(EmployeeNotice.user_id == user.id)
    if notice_type:
        query = query.filter(EmployeeNotice.notice_type == notice_type)
    
    notices = query.order_by(EmployeeNotice.created_at.desc()).all()
    
    result = []
    for notice in notices:
        created_by_user = db.query(User).filter(User.id == notice.created_by).first()
        acknowledged_by_user = None
        if notice.acknowledged_by:
            acknowledged_by_user = db.query(User).filter(User.id == notice.acknowledged_by).first()
        
        result.append({
            "id": str(notice.id),
            "notice_type": notice.notice_type,
            "title": notice.title,
            "description": notice.description,
            "justification": notice.justification,
            "created_by": {
                "id": str(notice.created_by),
                "username": created_by_user.username if created_by_user else None,
            },
            "created_at": notice.created_at.isoformat() if notice.created_at else None,
            "incident_date": notice.incident_date.isoformat() if notice.incident_date else None,
            "attachments": notice.attachments or [],
            "acknowledged_by": {
                "id": str(notice.acknowledged_by),
                "username": acknowledged_by_user.username if acknowledged_by_user else None,
            } if notice.acknowledged_by else None,
            "acknowledged_at": notice.acknowledged_at.isoformat() if notice.acknowledged_at else None,
        })
    
    return result


@router.post("/{user_id}/notices")
def create_notice(
    user_id: str,
    payload: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permissions("users:write"))
):
    """Create a new notice for a user"""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    incident_date = None
    if payload.get("incident_date"):
        incident_date = datetime.fromisoformat(payload["incident_date"].replace('Z', '+00:00'))
    
    notice = EmployeeNotice(
        user_id=user.id,
        notice_type=payload.get("notice_type", "negative"),
        title=payload.get("title", ""),
        description=payload.get("description", ""),
        justification=payload.get("justification"),
        created_by=current_user.id,
        incident_date=incident_date,
        attachments=payload.get("attachments", []),
    )
    
    db.add(notice)
    db.commit()
    db.refresh(notice)
    
    return {"id": str(notice.id), "status": "ok"}


@router.post("/{user_id}/notices/{notice_id}/acknowledge")
def acknowledge_notice(
    user_id: str,
    notice_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Acknowledge a notice (user can acknowledge their own notices)"""
    notice = db.query(EmployeeNotice).filter(
        EmployeeNotice.id == notice_id,
        EmployeeNotice.user_id == user_id
    ).first()
    
    if not notice:
        raise HTTPException(status_code=404, detail="Notice not found")
    
    if str(current_user.id) != user_id:
        raise HTTPException(status_code=403, detail="Can only acknowledge your own notices")
    
    notice.acknowledged_by = current_user.id
    notice.acknowledged_at = datetime.now(timezone.utc)
    
    db.commit()
    
    return {"status": "ok"}


# =====================
# Fines and Tickets Management
# =====================

@router.get("/{user_id}/fines-tickets")
def get_user_fines_tickets(
    user_id: str,
    status: Optional[str] = Query(None),
    type: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    _=Depends(require_permissions("users:read", "hr:users:read", "hr:users:view:reports", "hr:users:view:general"))
):
    """Get all fines and tickets for a user"""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    query = db.query(EmployeeFineTicket).filter(EmployeeFineTicket.user_id == user.id)
    if status:
        query = query.filter(EmployeeFineTicket.status == status)
    if type:
        query = query.filter(EmployeeFineTicket.type == type)
    
    fines_tickets = query.order_by(EmployeeFineTicket.issue_date.desc()).all()
    
    result = []
    for ft in fines_tickets:
        created_by_user = db.query(User).filter(User.id == ft.created_by).first()
        paid_by_user = None
        if ft.paid_by:
            paid_by_user = db.query(User).filter(User.id == ft.paid_by).first()
        
        result.append({
            "id": str(ft.id),
            "type": ft.type,
            "title": ft.title,
            "description": ft.description,
            "amount": float(ft.amount) if ft.amount else None,
            "issue_date": ft.issue_date.isoformat() if ft.issue_date else None,
            "due_date": ft.due_date.isoformat() if ft.due_date else None,
            "status": ft.status,
            "paid_at": ft.paid_at.isoformat() if ft.paid_at else None,
            "paid_by": {
                "id": str(ft.paid_by),
                "username": paid_by_user.username if paid_by_user else None,
            } if ft.paid_by else None,
            "notes": ft.notes,
            "created_by": {
                "id": str(ft.created_by),
                "username": created_by_user.username if created_by_user else None,
            },
            "created_at": ft.created_at.isoformat() if ft.created_at else None,
            "attachments": ft.attachments or [],
        })
    
    return result


@router.post("/{user_id}/fines-tickets")
def create_fine_ticket(
    user_id: str,
    payload: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permissions("users:write"))
):
    """Create a new fine or ticket for a user"""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    issue_date_str = payload.get("issue_date")
    if not issue_date_str:
        issue_date = datetime.now(timezone.utc)
    else:
        issue_date = datetime.fromisoformat(issue_date_str.replace('Z', '+00:00'))
    
    due_date = None
    if payload.get("due_date"):
        due_date = datetime.fromisoformat(payload["due_date"].replace('Z', '+00:00'))
    
    fine_ticket = EmployeeFineTicket(
        user_id=user.id,
        type=payload.get("type", "fine"),
        title=payload.get("title", ""),
        description=payload.get("description"),
        amount=Decimal(str(payload["amount"])) if payload.get("amount") else None,
        issue_date=issue_date,
        due_date=due_date,
        status=payload.get("status", "pending"),
        notes=payload.get("notes"),
        created_by=current_user.id,
        attachments=payload.get("attachments", []),
    )
    
    db.add(fine_ticket)
    db.commit()
    db.refresh(fine_ticket)
    
    return {"id": str(fine_ticket.id), "status": "ok"}


@router.patch("/{user_id}/fines-tickets/{fine_ticket_id}")
def update_fine_ticket(
    user_id: str,
    fine_ticket_id: str,
    payload: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permissions("users:write"))
):
    """Update a fine or ticket (e.g., mark as paid)"""
    fine_ticket = db.query(EmployeeFineTicket).filter(
        EmployeeFineTicket.id == fine_ticket_id,
        EmployeeFineTicket.user_id == user_id
    ).first()
    
    if not fine_ticket:
        raise HTTPException(status_code=404, detail="Fine/Ticket not found")
    
    if "status" in payload:
        fine_ticket.status = payload["status"]
        if payload["status"] == "paid":
            fine_ticket.paid_at = datetime.now(timezone.utc)
            fine_ticket.paid_by = current_user.id
        elif payload["status"] in ["waived", "cancelled"]:
            fine_ticket.paid_at = None
            fine_ticket.paid_by = None
    
    if "notes" in payload:
        fine_ticket.notes = payload["notes"]
    
    db.commit()
    
    return {"status": "ok"}


# =====================
# Equipment Management
# =====================

@router.get("/{user_id}/equipment")
def get_user_equipment(
    user_id: str,
    status: Optional[str] = Query(None),
    equipment_type: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    _=Depends(require_permissions("users:read", "hr:users:read", "hr:users:view:general"))
):
    """Get all equipment for a user"""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    query = db.query(EmployeeEquipment).filter(EmployeeEquipment.user_id == user.id)
    if status:
        query = query.filter(EmployeeEquipment.status == status)
    if equipment_type:
        query = query.filter(EmployeeEquipment.equipment_type == equipment_type)
    
    equipment = query.order_by(EmployeeEquipment.assigned_date.desc()).all()
    
    result = []
    for eq in equipment:
        created_by_user = db.query(User).filter(User.id == eq.created_by).first()
        updated_by_user = None
        if eq.updated_by:
            updated_by_user = db.query(User).filter(User.id == eq.updated_by).first()
        
        result.append({
            "id": str(eq.id),
            "equipment_type": eq.equipment_type,
            "name": eq.name,
            "brand": eq.brand,
            "model": eq.model,
            "serial_number": eq.serial_number,
            "asset_tag": eq.asset_tag,
            "assigned_date": eq.assigned_date.isoformat() if eq.assigned_date else None,
            "return_date": eq.return_date.isoformat() if eq.return_date else None,
            "status": eq.status,
            "condition": eq.condition,
            "value": float(eq.value) if eq.value else None,
            "notes": eq.notes,
            "created_by": {
                "id": str(eq.created_by),
                "username": created_by_user.username if created_by_user else None,
            },
            "created_at": eq.created_at.isoformat() if eq.created_at else None,
            "updated_at": eq.updated_at.isoformat() if eq.updated_at else None,
            "updated_by": {
                "id": str(eq.updated_by),
                "username": updated_by_user.username if updated_by_user else None,
            } if eq.updated_by else None,
        })
    
    return result


@router.post("/{user_id}/equipment")
def create_equipment(
    user_id: str,
    payload: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permissions("users:write"))
):
    """Assign equipment to a user"""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    assigned_date_str = payload.get("assigned_date")
    if not assigned_date_str:
        assigned_date = datetime.now(timezone.utc)
    else:
        assigned_date = datetime.fromisoformat(assigned_date_str.replace('Z', '+00:00'))
    
    equipment = EmployeeEquipment(
        user_id=user.id,
        equipment_type=payload.get("equipment_type", "other"),
        name=payload.get("name", ""),
        brand=payload.get("brand"),
        model=payload.get("model"),
        serial_number=payload.get("serial_number"),
        asset_tag=payload.get("asset_tag"),
        assigned_date=assigned_date,
        status=payload.get("status", "assigned"),
        condition=payload.get("condition"),
        value=Decimal(str(payload["value"])) if payload.get("value") else None,
        notes=payload.get("notes"),
        created_by=current_user.id,
    )
    
    db.add(equipment)
    db.commit()
    db.refresh(equipment)
    
    return {"id": str(equipment.id), "status": "ok"}


@router.patch("/{user_id}/equipment/{equipment_id}")
def update_equipment(
    user_id: str,
    equipment_id: str,
    payload: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permissions("users:write"))
):
    """Update equipment (e.g., return, update condition)"""
    equipment = db.query(EmployeeEquipment).filter(
        EmployeeEquipment.id == equipment_id,
        EmployeeEquipment.user_id == user_id
    ).first()
    
    if not equipment:
        raise HTTPException(status_code=404, detail="Equipment not found")
    
    if "status" in payload:
        equipment.status = payload["status"]
        if payload["status"] == "returned" and not equipment.return_date:
            equipment.return_date = datetime.now(timezone.utc)
    
    if "return_date" in payload:
        if payload["return_date"]:
            equipment.return_date = datetime.fromisoformat(payload["return_date"].replace('Z', '+00:00'))
        else:
            equipment.return_date = None
    
    if "condition" in payload:
        equipment.condition = payload["condition"]
    
    if "notes" in payload:
        equipment.notes = payload["notes"]
    
    equipment.updated_at = datetime.now(timezone.utc)
    equipment.updated_by = current_user.id
    
    db.commit()
    
    return {"status": "ok"}


# =====================
# BambooHR Sync
# =====================

def _get_bamboohr_id_for_user(db: Session, client: BambooHRClient, user: User) -> Optional[tuple]:
    """Find BambooHR employee by user email. Returns (bamboohr_id, bamboohr_employee_data) or None."""
    return resolve_bamboohr_id_for_user(db, client, user)


@router.post("/{user_id}/sync-bamboohr")
def sync_user_from_bamboohr(
    user_id: str,
    payload: dict = Body(default={}),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _=Depends(require_permissions("users:write"))
):
    """
    Sync a specific user from BambooHR
    
    This endpoint will:
    1. Find the user by ID
    2. Get their email to find the corresponding BambooHR employee
    3. Fetch latest data from BambooHR
    4. Update the user and profile
    
    Parameters:
    - force_update: If True, will overwrite manually edited fields (like pay_rate).
                    If False (default), will preserve manually edited fields.
    """
    force_update = payload.get("force_update", True)
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    email = user.email_personal or user.email_corporate
    if not email:
        raise HTTPException(status_code=400, detail="User has no email address to match with BambooHR")
    try:
        client = BambooHRClient()
        result = _get_bamboohr_id_for_user(db, client, user)
        if not result:
            raise HTTPException(status_code=404, detail=f"Employee not found in BambooHR for email: {email}")
        bamboohr_id, bamboohr_employee = result
        
        # Import sync function
        import sys
        import os
        from pathlib import Path
        
        # Get the scripts directory
        current_file = Path(__file__)
        project_root = current_file.parent.parent.parent
        script_dir = project_root / "scripts"
        sys.path.insert(0, str(script_dir))
        
        # Import the sync function
        import importlib.util
        import traceback
        try:
            spec = importlib.util.spec_from_file_location("sync_bamboohr_employees", script_dir / "sync_bamboohr_employees.py")
            if spec is None or spec.loader is None:
                raise HTTPException(status_code=500, detail="Could not load sync module")
            sync_module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(sync_module)
            create_or_update_user = sync_module.create_or_update_user
            sync_employee_photo = sync_module.sync_employee_photo
            sync_employee_visas = sync_module.sync_employee_visas
            sync_employee_emergency_contacts = sync_module.sync_employee_emergency_contacts
            get_storage = sync_module.get_storage
        except Exception as e:
            print(f"[ERROR] Error importing sync module: {e}")
            print(f"[ERROR] Traceback: {traceback.format_exc()}")
            raise HTTPException(status_code=500, detail=f"Error importing sync module: {str(e)}")
        
        # Sync the user
        # If force_update=True (default for button clicks), overwrite all fields including manually edited ones
        # If force_update=False, preserve manually edited fields like pay_rate
        updated_user, created = create_or_update_user(
            db=db,
            employee_data=bamboohr_employee,
            client=client,
            dry_run=False,
            update_existing=True,
            preserve_manual_fields=not force_update
        )
        
        if not updated_user:
            raise HTTPException(status_code=500, detail="Failed to sync user from BambooHR")
        
        # Sync profile photo
        force_update_photos = payload.get("force_update_photos", force_update)
        try:
            storage = get_storage()
            sync_employee_photo(
                db=db,
                client=client,
                storage=storage,
                user=updated_user,
                bamboohr_id=bamboohr_id,
                dry_run=False,
                force_update=force_update_photos
            )
        except Exception as e:
            # Photo sync is optional, don't fail the whole sync if it fails
            print(f"[WARN] Error syncing photo: {e}")
        
        # Sync visa information
        try:
            sync_employee_visas(
                db=db,
                client=client,
                user=updated_user,
                bamboohr_id=bamboohr_id,
                employee_data=bamboohr_employee,
                dry_run=False
            )
        except Exception as e:
            # Visa sync is optional, don't fail the whole sync if it fails
            import traceback
            print(f"[WARN] Error syncing visas: {e}")
            print(f"[WARN] Traceback: {traceback.format_exc()}")
        
        # Sync emergency contacts
        try:
            sync_employee_emergency_contacts(
                db=db,
                client=client,
                user=updated_user,
                bamboohr_id=bamboohr_id,
                employee_data=bamboohr_employee,
                dry_run=False
            )
        except Exception as e:
            # Emergency contact sync is optional, don't fail the whole sync if it fails
            import traceback
            print(f"[WARN] Error syncing emergency contacts: {e}")
            print(f"[WARN] Traceback: {traceback.format_exc()}")
        
        try:
            db.commit()
        except Exception as e:
            db.rollback()
            import traceback
            print(f"[ERROR] Error committing database changes: {e}")
            print(f"[ERROR] Traceback: {traceback.format_exc()}")
            raise
        
        return {
            "status": "ok",
            "message": "User synced successfully from BambooHR",
            "created": created,
            "user_id": str(updated_user.id)
        }
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error syncing from BambooHR: {str(e)}")


@router.post("/{user_id}/sync-photo")
def sync_user_photo_from_bamboohr(
    user_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _=Depends(require_permissions("users:write"))
):
    """Sync only the profile photo from BambooHR for this user."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if not (user.email_personal or user.email_corporate):
        raise HTTPException(status_code=400, detail="User has no email address to match with BambooHR")
    from pathlib import Path
    import sys
    import importlib.util
    script_dir = Path(__file__).resolve().parent.parent.parent / "scripts"
    sys.path.insert(0, str(script_dir))
    try:
        client = BambooHRClient()
        result = _get_bamboohr_id_for_user(db, client, user)
        if not result:
            raise HTTPException(status_code=404, detail="Employee not found in BambooHR for this user's email")
        bamboohr_id, _ = result
        spec = importlib.util.spec_from_file_location("sync_bamboohr_employees", script_dir / "sync_bamboohr_employees.py")
        if spec is None or spec.loader is None:
            raise HTTPException(status_code=500, detail="Could not load sync module")
        sync_module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(sync_module)
        get_storage = sync_module.get_storage
        sync_employee_photo = sync_module.sync_employee_photo
        storage = get_storage()
        updated = sync_employee_photo(db=db, client=client, storage=storage, user=user, bamboohr_id=bamboohr_id, dry_run=False, force_update=True)
        db.commit()
        return {"message": "Photo synced", "updated": updated}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error syncing photo: {str(e)}")


@router.post("/{user_id}/sync-documents")
def sync_user_documents_from_bamboohr(
    user_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _=Depends(require_permissions("users:write"))
):
    """Sync only documents from BambooHR for this user."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if not (user.email_personal or user.email_corporate):
        raise HTTPException(status_code=400, detail="User has no email address to match with BambooHR")
    from pathlib import Path
    import sys
    import importlib.util
    script_dir = Path(__file__).resolve().parent.parent.parent / "scripts"
    sys.path.insert(0, str(script_dir))
    try:
        client = BambooHRClient()
        result = _get_bamboohr_id_for_user(db, client, user)
        if not result:
            raise HTTPException(status_code=404, detail="Employee not found in BambooHR for this user's email")
        bamboohr_id, _ = result
        spec = importlib.util.spec_from_file_location("sync_bamboohr_documents", script_dir / "sync_bamboohr_documents.py")
        if spec is None or spec.loader is None:
            raise HTTPException(status_code=500, detail="Could not load sync documents module")
        docs_module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(docs_module)
        get_storage = docs_module.get_storage
        sync_documents_for_employee = docs_module.sync_documents_for_employee
        storage = get_storage()
        created, skipped = sync_documents_for_employee(db=db, client=client, storage=storage, employee_id=bamboohr_id, dry_run=False)
        db.commit()
        return {"message": "Documents synced", "created": created, "skipped": skipped}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error syncing documents: {str(e)}")


# =====================
# Time Off Management
# =====================

def _get_time_off_entitlement_days(db: Session, policy_name: str) -> float | None:
    from ..services.bamboohr_time_off_sync import get_entitlement_days
    return get_entitlement_days(db, policy_name)

def _ensure_default_time_off_entitlement(db: Session, policy_name: str) -> float | None:
    from ..services.bamboohr_time_off_sync import ensure_default_entitlement
    return ensure_default_entitlement(db, policy_name)


TIME_OFF_READ_PERMS = (
    "users:read",
    "hr:users:read",
    "hr:users:view:job",
    "hr:users:view:general",
)
TIME_OFF_WRITE_PERMS = (
    "users:write",
    "hr:users:edit:job",
    "hr:users:edit:general",
)


def _is_sick_leave_policy(policy_name: Optional[str]) -> bool:
    if not policy_name:
        return False
    value = policy_name.lower().strip()
    return value in {"sick leave", "sick"} or "sick" in value


def _require_whole_time_off_days(amount_days: float, *, label: str = "Time off") -> float:
    """Hub policy: new requests/adjustments are whole days only. Imported history may still be fractional."""
    try:
        days = float(amount_days)
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=f"{label} days must be a number") from exc
    if days <= 0:
        raise HTTPException(status_code=400, detail=f"{label} days must be greater than 0")
    if abs(days - round(days)) > 1e-6:
        raise HTTPException(
            status_code=400,
            detail=f"{label} must be in whole days (half days are not allowed).",
        )
    return float(round(days))


def _require_whole_time_off_hours(hours: float) -> float:
    days = _require_whole_time_off_days(float(hours) / 8.0, label="Time off")
    return days * 8.0


def _has_any_time_off_perm(user: User, perms: tuple) -> bool:
    if _user_is_admin(user):
        return True
    return any(_has_permission(user, perm) for perm in perms)


def _resolve_time_off_user_id(user_id: str, current_user: User, *, write: bool) -> str:
    if user_id in {"me", "self"}:
        user_id = str(current_user.id)
    if str(current_user.id) == str(user_id):
        return user_id
    needed = TIME_OFF_WRITE_PERMS if write else TIME_OFF_READ_PERMS
    if not _has_any_time_off_perm(current_user, needed):
        raise HTTPException(status_code=403, detail="Not authorized")
    return user_id


def _company_now() -> datetime:
    tz_name = getattr(settings, "tz_default", None) or "America/Vancouver"
    try:
        tz = ZoneInfo(tz_name)
    except Exception:
        tz = ZoneInfo("America/Vancouver")
    return datetime.now(tz)


def _date_only_api(value) -> Optional[str]:
    """
    Serialize a calendar date for the frontend without UTC off-by-one.

    Plain 'YYYY-MM-DD' is parsed as UTC midnight by JS Date, which becomes the
    previous local day in Pacific. Noon UTC keeps the same calendar day in all
    practical timezones for both toLocaleDateString() and timeZone:'UTC'.
    """
    if value is None:
        return None
    if isinstance(value, datetime):
        value = value.date()
    if hasattr(value, "isoformat"):
        return f"{value.isoformat()}T12:00:00.000Z"
    raw = str(value).strip()
    if len(raw) >= 10 and raw[4] == "-" and raw[7] == "-":
        return f"{raw[:10]}T12:00:00.000Z"
    return raw


@router.get("/{user_id}/time-off/balance")
def get_time_off_balance(
    user_id: str,
    year: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get time off balance for a user"""
    user_id = _resolve_time_off_user_id(user_id, current_user, write=False)
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    query = db.query(TimeOffBalance).filter(TimeOffBalance.user_id == user.id)
    if year:
        query = query.filter(TimeOffBalance.year == year)
    else:
        # Default to current year
        current_year = datetime.now().year
        query = query.filter(TimeOffBalance.year == current_year)
    
    balances = query.all()
    return [{
        "id": str(b.id),
        "policy_name": b.policy_name,
        "balance_hours": float(b.balance_hours),
        "accrued_hours": float(b.accrued_hours),
        "used_hours": float(b.used_hours),
        "year": b.year,
        "last_synced_at": b.last_synced_at.isoformat() if b.last_synced_at else None
    } for b in balances]


@router.post("/{user_id}/time-off/balance/sync")
def sync_time_off_balance(
    user_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _=Depends(require_permissions("users:write", "hr:users:edit:job", "hr:users:edit:general"))
):
    """Sync time off balance from BambooHR (scoped to the profile user, never the admin session)."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    email = user.email_personal or user.email_corporate
    if not email:
        raise HTTPException(status_code=400, detail="User has no email address to match with BambooHR")

    try:
        client = BambooHRClient()
        result = _get_bamboohr_id_for_user(db, client, user)
        if not result:
            raise HTTPException(status_code=404, detail=f"Employee not found in BambooHR for email: {email}")
        bamboohr_id, _ = result
        out = sync_user_time_off_balance(db, client, user, bamboohr_id, dry_run=False)
        db.commit()
        return out
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error syncing time off balance: {str(e)}")


@router.post("/{user_id}/time-off/balance/adjust")
def adjust_time_off_balance(
    user_id: str,
    payload: dict = Body(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _=Depends(require_permissions("users:write", "hr:users:edit:job", "hr:users:edit:general"))
):
    """Manually adjust time off balance for a user"""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Validate required fields
    policy_name = payload.get("policy_name")
    adjustment_type = payload.get("adjustment_type")  # "add" or "subtract"
    amount_days = payload.get("amount_days")
    effective_date_str = payload.get("effective_date")
    note = payload.get("note")
    
    if not policy_name:
        raise HTTPException(status_code=400, detail="policy_name is required")
    if adjustment_type not in ["add", "subtract"]:
        raise HTTPException(status_code=400, detail="adjustment_type must be 'add' or 'subtract'")
    if not amount_days or float(amount_days) <= 0:
        raise HTTPException(status_code=400, detail="amount_days must be greater than 0")
    amount_days = _require_whole_time_off_days(amount_days, label="Balance adjustment")
    if not effective_date_str:
        raise HTTPException(status_code=400, detail="effective_date is required")
    if not note or not note.strip():
        raise HTTPException(status_code=400, detail="note is required")
    
    try:
        effective_date = datetime.fromisoformat(effective_date_str.split('T')[0]).date()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")
    
    # Get or create balance for current year
    current_year = datetime.now().year
    balance = db.query(TimeOffBalance).filter(
        TimeOffBalance.user_id == user.id,
        TimeOffBalance.policy_name == policy_name,
        TimeOffBalance.year == current_year
    ).first()
    
    if not balance:
        # Create new balance record
        balance = TimeOffBalance(
            id=uuid_lib.uuid4(),
            user_id=user.id,
            policy_name=policy_name,
            balance_hours=0.0,
            accrued_hours=0.0,
            used_hours=0.0,
            year=current_year,
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc)
        )
        db.add(balance)
        db.flush()
    
    # Convert days to hours (8 hours per day)
    amount_hours = float(amount_days) * 8.0
    
    # Calculate new balance
    current_balance_hours = float(balance.balance_hours)
    if adjustment_type == "add":
        new_balance_hours = current_balance_hours + amount_hours
        balance.accrued_hours = float(balance.accrued_hours) + amount_hours
    else:  # subtract
        new_balance_hours = current_balance_hours - amount_hours
        balance.used_hours = float(balance.used_hours) + amount_hours
    
    balance.balance_hours = new_balance_hours
    balance.updated_at = datetime.now(timezone.utc)
    
    # Get admin name from profile or use username/email
    admin_profile = db.query(EmployeeProfile).filter(EmployeeProfile.user_id == current_user.id).first()
    if admin_profile and admin_profile.first_name:
        admin_name = f"{admin_profile.first_name or ''} {admin_profile.last_name or ''}".strip() or current_user.username or current_user.email_personal
    else:
        admin_name = current_user.username or current_user.email_personal or current_user.email_corporate or "Admin"
    
    description = f"{note.strip()} (Adjusted by {admin_name})"
    
    # Calculate balance in days for history
    new_balance_days = new_balance_hours / 8.0
    
    history = TimeOffHistory(
        id=uuid_lib.uuid4(),
        user_id=user.id,
        policy_name=policy_name,
        transaction_date=effective_date,
        description=description,
        earned_days=float(amount_days) if adjustment_type == "add" else None,
        used_days=float(amount_days) if adjustment_type == "subtract" else None,
        balance_after=new_balance_days,
        created_at=datetime.now(timezone.utc)
    )
    db.add(history)
    
    try:
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error adjusting balance: {str(e)}")
    
    return {
        "id": str(balance.id),
        "policy_name": balance.policy_name,
        "balance_hours": float(balance.balance_hours),
        "balance_days": new_balance_days,
        "accrued_hours": float(balance.accrued_hours),
        "used_hours": float(balance.used_hours),
        "year": balance.year,
        "message": f"Balance adjusted successfully"
    }


@router.get("/{user_id}/time-off/requests")
def get_time_off_requests(
    user_id: str,
    status: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get time off requests for a user"""
    user_id = _resolve_time_off_user_id(user_id, current_user, write=False)
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    query = db.query(TimeOffRequest).filter(TimeOffRequest.user_id == user.id)
    if status:
        query = query.filter(TimeOffRequest.status == status)
    
    requests = query.order_by(TimeOffRequest.requested_at.desc()).all()
    
    return [{
        "id": str(r.id),
        "policy_name": r.policy_name,
        "start_date": _date_only_api(r.start_date),
        "end_date": _date_only_api(r.end_date),
        "hours": float(r.hours),
        "notes": r.notes,
        "status": r.status,
        "requested_at": r.requested_at.isoformat(),
        "reviewed_at": r.reviewed_at.isoformat() if r.reviewed_at else None,
        "reviewed_by": str(r.reviewed_by) if r.reviewed_by else None,
        "review_notes": r.review_notes
    } for r in requests]


@router.post("/{user_id}/time-off/requests")
def create_time_off_request(
    user_id: str,
    payload: dict = Body(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new time off request"""
    user_id = _resolve_time_off_user_id(user_id, current_user, write=True)
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Validate required fields
    policy_name = payload.get("policy_name")
    start_date_str = payload.get("start_date")
    end_date_str = payload.get("end_date")
    hours = payload.get("hours")
    notes = payload.get("notes")
    
    if not policy_name or not start_date_str or not end_date_str:
        raise HTTPException(status_code=400, detail="policy_name, start_date, and end_date are required")
    
    try:
        start_date = datetime.fromisoformat(start_date_str.split('T')[0]).date()
        end_date = datetime.fromisoformat(end_date_str.split('T')[0]).date()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")
    
    if end_date < start_date:
        raise HTTPException(status_code=400, detail="end_date must be after start_date")

    notes_text = (notes or "").strip() if isinstance(notes, str) else ""
    is_sick_leave = _is_sick_leave_policy(policy_name)
    is_self_request = str(current_user.id) == str(user.id)

    if is_sick_leave and not notes_text:
        raise HTTPException(
            status_code=400,
            detail="A justification is required for sick leave.",
        )

    if is_self_request and not is_sick_leave:
        earliest = (_company_now() + timedelta(hours=24)).date()
        if start_date < earliest:
            raise HTTPException(
                status_code=400,
                detail="Time off must be requested at least 24 hours in advance.",
            )
    
    # Calculate hours if not provided — Hub only allows whole days going forward
    if not hours:
        days = (end_date - start_date).days + 1
        hours = _require_whole_time_off_days(days, label="Time off") * 8.0
    else:
        hours = _require_whole_time_off_hours(float(hours))
    
    # Check if user has enough balance
    # For "Sick Leave", allow request even without sufficient balance
    current_year = datetime.now().year
    balance = db.query(TimeOffBalance).filter(
        TimeOffBalance.user_id == user.id,
        TimeOffBalance.policy_name == policy_name,
        TimeOffBalance.year == current_year
    ).first()
    
    # Only check balance for non-sick-leave policies
    if not is_sick_leave:
        if balance and float(balance.balance_hours) < hours:
            raise HTTPException(
                status_code=400,
                detail=f"Insufficient balance. Available: {balance.balance_hours} hours, Requested: {hours} hours"
            )
        elif not balance:
            raise HTTPException(
                status_code=400,
                detail=f"No balance found for policy '{policy_name}'. Please contact HR to set up your time off balance."
            )
    
    # Create request
    request = TimeOffRequest(
        id=uuid_lib.uuid4(),
        user_id=user.id,
        policy_name=policy_name,
        start_date=start_date,
        end_date=end_date,
        hours=hours,
        notes=notes_text or None,
        status="pending",
        requested_at=datetime.now(timezone.utc),
        created_at=datetime.now(timezone.utc)
    )
    db.add(request)
    db.commit()
    
    return {
        "id": str(request.id),
        "message": "Time off request created successfully",
        "status": request.status
    }


@router.patch("/{user_id}/time-off/requests/{request_id}")
def update_time_off_request(
    user_id: str,
    request_id: str,
    payload: dict = Body(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update time off request (approve/reject/cancel)"""
    user_id = _resolve_time_off_user_id(user_id, current_user, write=True)
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    request = db.query(TimeOffRequest).filter(
        TimeOffRequest.id == request_id,
        TimeOffRequest.user_id == user.id
    ).first()
    
    if not request:
        raise HTTPException(status_code=404, detail="Time off request not found")
    
    # Users can cancel their own requests, admins can approve/reject
    new_status = payload.get("status")
    review_notes = payload.get("review_notes")
    
    is_self = str(current_user.id) == str(user_id)
    can_manage = _has_any_time_off_perm(current_user, TIME_OFF_WRITE_PERMS)

    if new_status == "cancelled" and is_self:
        if request.status != "pending":
            raise HTTPException(
                status_code=400,
                detail="Only pending requests can be cancelled",
            )
        # User can cancel their own request
        request.status = "cancelled"
        request.updated_at = datetime.now(timezone.utc)
    elif new_status in ["approved", "rejected"] and can_manage:
        # Admin can approve/reject
        request.status = new_status
        request.reviewed_at = datetime.now(timezone.utc)
        request.reviewed_by = current_user.id
        request.review_notes = review_notes
        request.updated_at = datetime.now(timezone.utc)
        
        # If approved, update balance
        if new_status == "approved":
            current_year = datetime.now().year
            balance = db.query(TimeOffBalance).filter(
                TimeOffBalance.user_id == user.id,
                TimeOffBalance.policy_name == request.policy_name,
                TimeOffBalance.year == current_year
            ).first()
            
            if balance:
                balance.used_hours = float(balance.used_hours) + float(request.hours)
                balance.balance_hours = float(balance.balance_hours) - float(request.hours)
                balance.updated_at = datetime.now(timezone.utc)
    else:
        raise HTTPException(status_code=403, detail="Not authorized to update this request")
    
    db.commit()
    return {"status": "ok", "message": f"Request {new_status}"}


@router.get("/{user_id}/time-off/history")
def get_time_off_history(
    user_id: str,
    policy_name: Optional[str] = Query(None),
    year: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get time off history/transactions for a user"""
    user_id = _resolve_time_off_user_id(user_id, current_user, write=False)
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    query = db.query(TimeOffHistory).filter(TimeOffHistory.user_id == user.id)
    if policy_name:
        query = query.filter(TimeOffHistory.policy_name == policy_name)
    if year:
        query = query.filter(func.extract('year', TimeOffHistory.transaction_date) == year)
    
    history = query.order_by(
        TimeOffHistory.transaction_date.desc(),
        # Same calendar day under DESC: accrual/adjust first, then usage, then
        # carryover loss last — so the top row's balance matches Bamboo's end-of-day.
        case(
            (
                or_(
                    TimeOffHistory.bamboohr_transaction_id.ilike("%carryover%"),
                    TimeOffHistory.description.ilike("%Lost days that exceeded%"),
                ),
                2,
            ),
            (
                and_(
                    TimeOffHistory.used_days.isnot(None),
                    TimeOffHistory.used_days != 0,
                ),
                1,
            ),
            else_=0,
        ).asc(),
        TimeOffHistory.balance_after.desc(),
        TimeOffHistory.created_at.desc(),
    ).all()

    
    return [{
        "id": str(h.id),
        "policy_name": h.policy_name,
        "transaction_date": _date_only_api(h.transaction_date),
        "description": h.description,
        "used_days": float(h.used_days) if h.used_days else None,
        "earned_days": float(h.earned_days) if h.earned_days else None,
        "balance_after": float(h.balance_after),
        "bamboohr_transaction_id": h.bamboohr_transaction_id
    } for h in history]


@router.post("/{user_id}/time-off/history")
def add_time_off_history_entry(
    user_id: str,
    payload: dict = Body(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _=Depends(require_roles("admin"))
):
    """Add a manual time off history entry (admin only). Updates balance for the policy/year."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    policy_name = payload.get("policy_name")
    transaction_date_str = payload.get("transaction_date")
    description = (payload.get("description") or "").strip()
    used_days = payload.get("used_days")
    earned_days = payload.get("earned_days")
    if not policy_name:
        raise HTTPException(status_code=400, detail="policy_name is required")
    if not transaction_date_str:
        raise HTTPException(status_code=400, detail="transaction_date is required")
    try:
        transaction_date = datetime.fromisoformat(transaction_date_str.split("T")[0]).date()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid transaction_date. Use YYYY-MM-DD")
    used_val = float(used_days) if used_days is not None and str(used_days).strip() != "" else None
    earned_val = float(earned_days) if earned_days is not None and str(earned_days).strip() != "" else None
    if (used_val is None or used_val == 0) and (earned_val is None or earned_val == 0):
        raise HTTPException(status_code=400, detail="At least one of used_days or earned_days must be provided and non-zero")
    year = transaction_date.year
    balance = db.query(TimeOffBalance).filter(
        TimeOffBalance.user_id == user.id,
        TimeOffBalance.policy_name == policy_name,
        TimeOffBalance.year == year
    ).first()
    if not balance:
        balance = TimeOffBalance(
            id=uuid_lib.uuid4(),
            user_id=user.id,
            policy_name=policy_name,
            balance_hours=0.0,
            accrued_hours=0.0,
            used_hours=0.0,
            year=year,
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        )
        db.add(balance)
        db.flush()
    current_balance_hours = float(balance.balance_hours)
    current_balance_days = current_balance_hours / 8.0
    balance_after_days = current_balance_days + (earned_val or 0) - (used_val or 0)
    balance.balance_hours = balance_after_days * 8.0
    if earned_val:
        balance.accrued_hours = float(balance.accrued_hours) + (earned_val * 8.0)
    if used_val:
        balance.used_hours = float(balance.used_hours) + (used_val * 8.0)
    balance.updated_at = datetime.now(timezone.utc)
    admin_name = "Admin"
    admin_profile = db.query(EmployeeProfile).filter(EmployeeProfile.user_id == current_user.id).first()
    if admin_profile and (admin_profile.first_name or admin_profile.last_name):
        admin_name = f"{admin_profile.first_name or ''} {admin_profile.last_name or ''}".strip()
    else:
        admin_name = current_user.username or current_user.email_personal or current_user.email_corporate or "Admin"
    desc_text = description or "Manual entry"
    if not desc_text.lower().startswith("manual") and not desc_text.lower().startswith("adjusted"):
        desc_text = f"Manual: {desc_text} (by {admin_name})"
    else:
        desc_text = f"{desc_text} (by {admin_name})"
    history = TimeOffHistory(
        id=uuid_lib.uuid4(),
        user_id=user.id,
        policy_name=policy_name,
        transaction_date=transaction_date,
        description=desc_text,
        earned_days=earned_val,
        used_days=used_val,
        balance_after=balance_after_days,
        created_at=datetime.now(timezone.utc),
    )
    db.add(history)
    try:
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    return {
        "id": str(history.id),
        "policy_name": policy_name,
        "transaction_date": transaction_date.isoformat(),
        "description": desc_text,
        "used_days": used_val,
        "earned_days": earned_val,
        "balance_after": balance_after_days,
        "message": "History entry added",
    }


def _recompute_balance_from_history(db: Session, user_id: uuid_lib.UUID, policy_name: str, year: int) -> None:
    """Recompute TimeOffBalance for user/policy/year from remaining TimeOffHistory entries."""
    remaining = (
        db.query(TimeOffHistory)
        .filter(
            TimeOffHistory.user_id == user_id,
            TimeOffHistory.policy_name == policy_name,
            func.extract("year", TimeOffHistory.transaction_date) == year,
        )
        .order_by(TimeOffHistory.transaction_date.desc())
        .all()
    )
    if not remaining:
        balance_days = 0.0
        accrued_days = 0.0
        used_days_total = 0.0
    else:
        balance_days = float(remaining[0].balance_after)
        accrued_days = sum(float(h.earned_days or 0) for h in remaining)
        used_days_total = sum(float(h.used_days or 0) for h in remaining)
    balance_hours = balance_days * 8.0
    accrued_hours = accrued_days * 8.0
    used_hours = used_days_total * 8.0
    balance = db.query(TimeOffBalance).filter(
        TimeOffBalance.user_id == user_id,
        TimeOffBalance.policy_name == policy_name,
        TimeOffBalance.year == year,
    ).first()
    if not balance:
        balance = TimeOffBalance(
            id=uuid_lib.uuid4(),
            user_id=user_id,
            policy_name=policy_name,
            balance_hours=balance_hours,
            accrued_hours=accrued_hours,
            used_hours=used_hours,
            year=year,
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        )
        db.add(balance)
    else:
        balance.balance_hours = balance_hours
        balance.accrued_hours = accrued_hours
        balance.used_hours = used_hours
        balance.updated_at = datetime.now(timezone.utc)


def _recalculate_history_chain_zero_opening(
    db: Session, user_id: uuid_lib.UUID, policy_name: str, year: int
) -> None:
    """
    Rebuild balance_after for all history rows in a (user, policy, calendar year) bucket
    assuming a zero opening balance at the start of the chain, then refresh TimeOffBalance.
    Used after manual edits; BambooHR sync may later realign totals.
    """
    rows = (
        db.query(TimeOffHistory)
        .filter(
            TimeOffHistory.user_id == user_id,
            TimeOffHistory.policy_name == policy_name,
            func.extract("year", TimeOffHistory.transaction_date) == year,
        )
        .order_by(TimeOffHistory.transaction_date.asc(), TimeOffHistory.id.asc())
        .all()
    )
    if not rows:
        _recompute_balance_from_history(db, user_id, policy_name, year)
        return
    running = 0.0
    for h in rows:
        running += float(h.earned_days or 0) - float(h.used_days or 0)
        h.balance_after = running
    db.flush()
    _recompute_balance_from_history(db, user_id, policy_name, year)


@router.patch("/{user_id}/time-off/history/{entry_id}")
def patch_time_off_history_entry(
    user_id: str,
    entry_id: str,
    payload: dict = Body(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _=Depends(require_roles("admin")),
):
    """Update a time off history row (admin only). Recalculates history chain and balance for affected years."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    try:
        entry_uuid = uuid_lib.UUID(entry_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid entry id")
    entry = db.query(TimeOffHistory).filter(
        TimeOffHistory.id == entry_uuid,
        TimeOffHistory.user_id == user.id,
    ).first()
    if not entry:
        raise HTTPException(status_code=404, detail="History entry not found")

    old_policy = entry.policy_name
    old_year = entry.transaction_date.year if hasattr(entry.transaction_date, "year") else int(entry.transaction_date)

    if not payload:
        raise HTTPException(status_code=400, detail="No fields to update")

    touch_chain = any(
        k in payload for k in ("used_days", "earned_days", "transaction_date", "policy_name")
    )

    if "policy_name" in payload and payload.get("policy_name") is not None:
        pn = str(payload.get("policy_name") or "").strip()
        if not pn:
            raise HTTPException(status_code=400, detail="policy_name cannot be empty")
        entry.policy_name = pn
    if "transaction_date" in payload and payload.get("transaction_date"):
        try:
            entry.transaction_date = datetime.fromisoformat(
                str(payload.get("transaction_date")).split("T")[0]
            ).date()
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid transaction_date. Use YYYY-MM-DD")
    if "description" in payload:
        desc = payload.get("description")
        entry.description = (str(desc).strip() if desc is not None else "") or None
    if "used_days" in payload:
        uv = payload.get("used_days")
        if uv is None or (isinstance(uv, str) and not str(uv).strip()):
            entry.used_days = None
        else:
            entry.used_days = float(uv)
    if "earned_days" in payload:
        ev = payload.get("earned_days")
        if ev is None or (isinstance(ev, str) and not str(ev).strip()):
            entry.earned_days = None
        else:
            entry.earned_days = float(ev)

    uu = float(entry.used_days or 0)
    ee = float(entry.earned_days or 0)
    if uu == 0 and ee == 0:
        raise HTTPException(
            status_code=400,
            detail="At least one of used_days or earned_days must be non-zero",
        )

    new_policy = entry.policy_name
    new_year = entry.transaction_date.year if hasattr(entry.transaction_date, "year") else int(entry.transaction_date)

    affected = {(old_policy, old_year), (new_policy, new_year)}

    try:
        if touch_chain:
            for pol, yr in affected:
                _recalculate_history_chain_zero_opening(db, user.id, pol, int(yr))
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

    db.refresh(entry)
    return {
        "id": str(entry.id),
        "policy_name": entry.policy_name,
        "transaction_date": entry.transaction_date.isoformat(),
        "description": entry.description,
        "used_days": float(entry.used_days) if entry.used_days is not None else None,
        "earned_days": float(entry.earned_days) if entry.earned_days is not None else None,
        "balance_after": float(entry.balance_after),
        "bamboohr_transaction_id": entry.bamboohr_transaction_id,
        "message": "History entry updated",
    }


@router.delete("/{user_id}/time-off/history/{entry_id}")
def delete_time_off_history_entry(
    user_id: str,
    entry_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _=Depends(require_roles("admin")),
):
    """Delete a time off history entry (admin only). Recomputes balance from remaining history."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    try:
        entry_uuid = uuid_lib.UUID(entry_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid entry id")
    entry = db.query(TimeOffHistory).filter(
        TimeOffHistory.id == entry_uuid,
        TimeOffHistory.user_id == user.id,
    ).first()
    if not entry:
        raise HTTPException(status_code=404, detail="History entry not found")
    policy_name = entry.policy_name
    year = entry.transaction_date.year if hasattr(entry.transaction_date, "year") else int(entry.transaction_date)
    db.delete(entry)
    _recompute_balance_from_history(db, user.id, policy_name, year)
    try:
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    return {"message": "History entry deleted"}


@router.post("/{user_id}/time-off/history/sync")
def sync_time_off_history(
    user_id: str,
    policy_name: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _=Depends(require_permissions("users:write", "hr:users:edit:job", "hr:users:edit:general"))
):
    """
    Sync time off history + Bamboo requests into MKHub.

    Always scopes Bamboo /time_off/requests to the profile user's Bamboo employee
    id (email match). Never attributes company-wide leave to the logged-in admin.
    """
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    email = user.email_personal or user.email_corporate
    if not email:
        raise HTTPException(status_code=400, detail="User has no email address to match with BambooHR")

    try:
        client = BambooHRClient()
        result = _get_bamboohr_id_for_user(db, client, user)
        if not result:
            raise HTTPException(status_code=404, detail=f"Employee not found in BambooHR for email: {email}")
        bamboohr_id, _ = result
        out = sync_user_time_off_history(
            db,
            client,
            user,
            bamboohr_id,
            policy_filter=policy_name,
            dry_run=False,
        )
        db.commit()
        return out
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error syncing time off history: {str(e)}")


# =====================
# Reports Management
# =====================

@router.get("/{user_id}/reports")
def get_user_reports(
    user_id: str,
    report_type: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    severity: Optional[str] = Query(None),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    q: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    _=Depends(require_permissions("users:read", "hr:users:read", "hr:users:view:reports", "hr:users:view:general"))
):
    """Get all reports for a user with optional filters"""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    query = db.query(EmployeeReport).filter(EmployeeReport.user_id == user.id)
    
    if report_type:
        query = query.filter(EmployeeReport.report_type == report_type)
    if status:
        query = query.filter(EmployeeReport.status == status)
    if severity:
        query = query.filter(EmployeeReport.severity == severity)
    if start_date:
        start = datetime.fromisoformat(start_date.replace('Z', '+00:00'))
        query = query.filter(EmployeeReport.occurrence_date >= start)
    if end_date:
        end = datetime.fromisoformat(end_date.replace('Z', '+00:00'))
        query = query.filter(EmployeeReport.occurrence_date <= end)
    if q:
        like = f"%{q}%"
        query = query.filter(
            (EmployeeReport.title.ilike(like)) |
            (EmployeeReport.description.ilike(like)) |
            (EmployeeReport.ticket_number.ilike(like))
        )
    
    reports = query.order_by(EmployeeReport.occurrence_date.desc()).all()
    
    result = []
    for report in reports:
        created_by_user = db.query(User).filter(User.id == report.created_by).first()
        reported_by_user = db.query(User).filter(User.id == report.reported_by).first()
        updated_by_user = None
        if report.updated_by:
            updated_by_user = db.query(User).filter(User.id == report.updated_by).first()
        
        result.append({
            "id": str(report.id),
            "report_type": report.report_type,
            "title": report.title,
            "description": report.description,
            "occurrence_date": report.occurrence_date.isoformat() if report.occurrence_date else None,
            "severity": report.severity,
            "status": report.status,
            "vehicle": report.vehicle,
            "ticket_number": report.ticket_number,
            "fine_amount": float(report.fine_amount) if report.fine_amount else None,
            "due_date": report.due_date.isoformat() if report.due_date else None,
            "related_project_department": report.related_project_department,
            "suspension_start_date": report.suspension_start_date.isoformat() if report.suspension_start_date else None,
            "suspension_end_date": report.suspension_end_date.isoformat() if report.suspension_end_date else None,
            "behavior_note_type": report.behavior_note_type,
            "reported_by": {
                "id": str(report.reported_by),
                "username": reported_by_user.username if reported_by_user else None,
            },
            "created_at": report.created_at.isoformat() if report.created_at else None,
            "created_by": {
                "id": str(report.created_by),
                "username": created_by_user.username if created_by_user else None,
            },
            "updated_at": report.updated_at.isoformat() if report.updated_at else None,
            "updated_by": {
                "id": str(report.updated_by),
                "username": updated_by_user.username if updated_by_user else None,
            } if report.updated_by else None,
            "attachments_count": len(report.attachments) if report.attachments else 0,
            "comments_count": len(report.comments) if report.comments else 0,
        })
    
    return result


@router.get("/{user_id}/reports/{report_id}")
def get_report_details(
    user_id: str,
    report_id: str,
    db: Session = Depends(get_db),
    _=Depends(require_permissions("users:read", "hr:users:read", "hr:users:view:reports", "hr:users:view:general"))
):
    """Get detailed information about a specific report"""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    report = db.query(EmployeeReport).filter(
        EmployeeReport.id == report_id,
        EmployeeReport.user_id == user.id
    ).first()
    
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    
    created_by_user = db.query(User).filter(User.id == report.created_by).first()
    reported_by_user = db.query(User).filter(User.id == report.reported_by).first()
    updated_by_user = None
    if report.updated_by:
        updated_by_user = db.query(User).filter(User.id == report.updated_by).first()
    
    # Get attachments
    attachments = []
    for att in report.attachments:
        created_by_att_user = db.query(User).filter(User.id == att.created_by).first()
        attachments.append({
            "id": str(att.id),
            "file_id": str(att.file_id),
            "file_name": att.file_name,
            "file_size": att.file_size,
            "file_type": att.file_type,
            "created_at": att.created_at.isoformat() if att.created_at else None,
            "created_by": {
                "id": str(att.created_by),
                "username": created_by_att_user.username if created_by_att_user else None,
            },
        })
    
    # Get comments/timeline
    comments = []
    for comment in report.comments:
        created_by_comment_user = db.query(User).filter(User.id == comment.created_by).first()
        comments.append({
            "id": str(comment.id),
            "comment_text": comment.comment_text,
            "comment_type": comment.comment_type,
            "created_at": comment.created_at.isoformat() if comment.created_at else None,
            "created_by": {
                "id": str(comment.created_by),
                "username": created_by_comment_user.username if created_by_comment_user else None,
            },
        })
    
    return {
        "id": str(report.id),
        "report_type": report.report_type,
        "title": report.title,
        "description": report.description,
        "occurrence_date": report.occurrence_date.isoformat() if report.occurrence_date else None,
        "severity": report.severity,
        "status": report.status,
        "vehicle": report.vehicle,
        "ticket_number": report.ticket_number,
        "fine_amount": float(report.fine_amount) if report.fine_amount else None,
        "due_date": report.due_date.isoformat() if report.due_date else None,
        "related_project_department": report.related_project_department,
        "suspension_start_date": report.suspension_start_date.isoformat() if report.suspension_start_date else None,
        "suspension_end_date": report.suspension_end_date.isoformat() if report.suspension_end_date else None,
        "behavior_note_type": report.behavior_note_type,
        "reported_by": {
            "id": str(report.reported_by),
            "username": reported_by_user.username if reported_by_user else None,
        },
        "created_at": report.created_at.isoformat() if report.created_at else None,
        "created_by": {
            "id": str(report.created_by),
            "username": created_by_user.username if created_by_user else None,
        },
        "updated_at": report.updated_at.isoformat() if report.updated_at else None,
        "updated_by": {
            "id": str(report.updated_by),
            "username": updated_by_user.username if updated_by_user else None,
        } if report.updated_by else None,
        "attachments": attachments,
        "comments": comments,
    }


@router.post("/{user_id}/reports")
def create_report(
    user_id: str,
    payload: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permissions("users:write", "hr:users:write", "hr:users:edit:reports", "hr:users:edit:general"))
):
    """Create a new report for a user"""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    occurrence_date_str = payload.get("occurrence_date")
    if not occurrence_date_str:
        occurrence_date = datetime.now(timezone.utc)
    else:
        occurrence_date = datetime.fromisoformat(occurrence_date_str.replace('Z', '+00:00'))
    
    due_date = None
    if payload.get("due_date"):
        due_date = datetime.fromisoformat(payload.get("due_date").replace('Z', '+00:00'))
    
    suspension_start_date = None
    if payload.get("suspension_start_date"):
        suspension_start_date = datetime.fromisoformat(payload.get("suspension_start_date").replace('Z', '+00:00'))
    
    suspension_end_date = None
    if payload.get("suspension_end_date"):
        suspension_end_date = datetime.fromisoformat(payload.get("suspension_end_date").replace('Z', '+00:00'))
    
    report = EmployeeReport(
        id=uuid_lib.uuid4(),
        user_id=user.id,
        report_type=payload.get("report_type", "Other"),
        title=payload.get("title", ""),
        description=payload.get("description"),
        occurrence_date=occurrence_date,
        severity=payload.get("severity", "Medium"),
        status=payload.get("status", "Pending Review"),
        vehicle=payload.get("vehicle"),
        ticket_number=payload.get("ticket_number"),
        fine_amount=Decimal(str(payload.get("fine_amount"))) if payload.get("fine_amount") else None,
        due_date=due_date,
        related_project_department=payload.get("related_project_department"),
        suspension_start_date=suspension_start_date,
        suspension_end_date=suspension_end_date,
        behavior_note_type=payload.get("behavior_note_type"),
        reported_by=current_user.id,
        created_by=current_user.id,
    )
    
    db.add(report)
    db.commit()
    db.refresh(report)
    
    # Create initial timeline entry
    comment = ReportComment(
        id=uuid_lib.uuid4(),
        report_id=report.id,
        comment_text=f"Report created: {report.title}",
        comment_type="system",
        created_by=current_user.id,
    )
    db.add(comment)
    db.commit()
    
    return {"id": str(report.id), "status": "ok"}


@router.patch("/{user_id}/reports/{report_id}")
def update_report(
    user_id: str,
    report_id: str,
    payload: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permissions("users:write", "hr:users:write", "hr:users:edit:reports", "hr:users:edit:general"))
):
    """Update a report"""
    report = db.query(EmployeeReport).filter(
        EmployeeReport.id == report_id,
        EmployeeReport.user_id == user_id
    ).first()
    
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    
    old_status = report.status
    changes = []
    
    # Update fields - only add to changes if value actually changed
    if "title" in payload:
        new_title = payload["title"]
        if report.title != new_title:
            report.title = new_title
            changes.append(f"Title updated to '{new_title}'")
    
    if "description" in payload:
        new_description = payload.get("description")
        old_description = report.description or ""
        new_description_str = new_description or ""
        if old_description != new_description_str:
            report.description = new_description
            changes.append("Description updated")
    
    if "occurrence_date" in payload:
        new_occurrence_date = datetime.fromisoformat(payload["occurrence_date"].replace('Z', '+00:00'))
        if report.occurrence_date != new_occurrence_date:
            report.occurrence_date = new_occurrence_date
            changes.append("Occurrence date updated")
    
    if "severity" in payload:
        new_severity = payload["severity"]
        if report.severity != new_severity:
            report.severity = new_severity
            changes.append(f"Severity changed to {new_severity}")
    
    if "status" in payload:
        new_status = payload["status"]
        if old_status != new_status:
            report.status = new_status
            changes.append(f"Status changed from {old_status} to {new_status}")
    
    if "vehicle" in payload:
        new_vehicle = payload.get("vehicle") or None
        old_vehicle = report.vehicle or None
        if old_vehicle != new_vehicle:
            report.vehicle = new_vehicle
    
    if "ticket_number" in payload:
        new_ticket = payload.get("ticket_number") or None
        old_ticket = report.ticket_number or None
        if old_ticket != new_ticket:
            report.ticket_number = new_ticket
    
    if "fine_amount" in payload:
        new_fine_amount = Decimal(str(payload["fine_amount"])) if payload.get("fine_amount") else None
        old_fine_amount = report.fine_amount
        if old_fine_amount != new_fine_amount:
            report.fine_amount = new_fine_amount
    
    if "due_date" in payload:
        new_due_date = datetime.fromisoformat(payload["due_date"].replace('Z', '+00:00')) if payload.get("due_date") else None
        old_due_date = report.due_date
        if old_due_date != new_due_date:
            report.due_date = new_due_date
    
    if "related_project_department" in payload:
        new_related = payload.get("related_project_department") or None
        old_related = report.related_project_department or None
        if old_related != new_related:
            report.related_project_department = new_related
    
    if "suspension_start_date" in payload:
        new_start = datetime.fromisoformat(payload["suspension_start_date"].replace('Z', '+00:00')) if payload.get("suspension_start_date") else None
        old_start = report.suspension_start_date
        if old_start != new_start:
            report.suspension_start_date = new_start
    
    if "suspension_end_date" in payload:
        new_end = datetime.fromisoformat(payload["suspension_end_date"].replace('Z', '+00:00')) if payload.get("suspension_end_date") else None
        old_end = report.suspension_end_date
        if old_end != new_end:
            report.suspension_end_date = new_end
    
    if "behavior_note_type" in payload:
        new_behavior_type = payload.get("behavior_note_type") or None
        old_behavior_type = report.behavior_note_type or None
        if old_behavior_type != new_behavior_type:
            report.behavior_note_type = new_behavior_type
            old_display = old_behavior_type if old_behavior_type else "Not specified"
            new_display = new_behavior_type if new_behavior_type else "Not specified"
            changes.append(f"Behavior note type changed from {old_display} to {new_display}")
    
    report.updated_at = datetime.now(timezone.utc)
    report.updated_by = current_user.id
    
    db.commit()
    
    # Add timeline entry for significant changes
    if changes:
        # Determine comment type: status_change if status changed, otherwise system
        comment_type = "status_change" if old_status != report.status else "system"
        comment = ReportComment(
            id=uuid_lib.uuid4(),
            report_id=report.id,
            comment_text="; ".join(changes),
            comment_type=comment_type,
            created_by=current_user.id,
        )
        db.add(comment)
        db.commit()
    
    return {"status": "ok"}


@router.delete("/{user_id}/reports/{report_id}")
def delete_report(
    user_id: str,
    report_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permissions("users:write", "hr:users:write", "hr:users:edit:reports", "hr:users:edit:general")),
):
    """Delete a report and its attachments/comments (cascade)."""
    report = db.query(EmployeeReport).filter(
        EmployeeReport.id == report_id,
        EmployeeReport.user_id == user_id,
    ).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    db.delete(report)
    db.commit()
    return {"status": "ok"}


@router.post("/{user_id}/reports/{report_id}/comments")
def add_report_comment(
    user_id: str,
    report_id: str,
    payload: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permissions("users:write", "hr:users:write", "hr:users:edit:reports", "hr:users:edit:general"))
):
    """Add a comment to a report timeline"""
    report = db.query(EmployeeReport).filter(
        EmployeeReport.id == report_id,
        EmployeeReport.user_id == user_id
    ).first()
    
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    
    comment = ReportComment(
        id=uuid_lib.uuid4(),
        report_id=report.id,
        comment_text=payload.get("comment_text", ""),
        comment_type=payload.get("comment_type", "comment"),
        created_by=current_user.id,
    )
    
    db.add(comment)
    
    # Update report's updated_at
    report.updated_at = datetime.now(timezone.utc)
    report.updated_by = current_user.id
    
    db.commit()
    db.refresh(comment)
    
    created_by_user = db.query(User).filter(User.id == comment.created_by).first()
    
    return {
        "id": str(comment.id),
        "comment_text": comment.comment_text,
        "comment_type": comment.comment_type,
        "created_at": comment.created_at.isoformat() if comment.created_at else None,
        "created_by": {
            "id": str(comment.created_by),
            "username": created_by_user.username if created_by_user else None,
        },
    }


@router.post("/{user_id}/reports/{report_id}/attachments")
def add_report_attachment(
    user_id: str,
    report_id: str,
    payload: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permissions("users:write", "hr:users:write", "hr:users:edit:reports", "hr:users:edit:general"))
):
    """Add an attachment to a report"""
    report = db.query(EmployeeReport).filter(
        EmployeeReport.id == report_id,
        EmployeeReport.user_id == user_id
    ).first()
    
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    
    attachment = ReportAttachment(
        id=uuid_lib.uuid4(),
        report_id=report.id,
        file_id=uuid_lib.UUID(payload.get("file_id")),
        file_name=payload.get("file_name"),
        file_size=payload.get("file_size"),
        file_type=payload.get("file_type"),
        created_by=current_user.id,
    )
    
    db.add(attachment)
    
    # Update report's updated_at
    report.updated_at = datetime.now(timezone.utc)
    report.updated_by = current_user.id
    
    # Add timeline entry
    comment = ReportComment(
        id=uuid_lib.uuid4(),
        report_id=report.id,
        comment_text=f"Attachment added: {payload.get('file_name', 'File')}",
        comment_type="system",
        created_by=current_user.id,
    )
    db.add(comment)

    _mirror_report_attachment_to_employee_docs(
        db,
        user_id=report.user_id,
        file_id=attachment.file_id,
        file_name=attachment.file_name,
        created_by=current_user.id,
    )
    
    db.commit()
    
    return {"id": str(attachment.id), "status": "ok"}


@router.delete("/{user_id}/reports/{report_id}/attachments/{attachment_id}")
def delete_report_attachment(
    user_id: str,
    report_id: str,
    attachment_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permissions("users:write", "hr:users:write", "hr:users:edit:reports", "hr:users:edit:general"))
):
    """Delete an attachment from a report"""
    attachment = db.query(ReportAttachment).filter(
        ReportAttachment.id == attachment_id,
        ReportAttachment.report_id == report_id
    ).first()
    
    if not attachment:
        raise HTTPException(status_code=404, detail="Attachment not found")
    
    report = db.query(EmployeeReport).filter(
        EmployeeReport.id == report_id,
        EmployeeReport.user_id == user_id
    ).first()
    
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    
    file_name = attachment.file_name or "File"
    db.delete(attachment)
    
    # Update report's updated_at
    report.updated_at = datetime.now(timezone.utc)
    report.updated_by = current_user.id
    
    # Add timeline entry
    comment = ReportComment(
        id=uuid_lib.uuid4(),
        report_id=report.id,
        comment_text=f"Attachment removed: {file_name}",
        comment_type="system",
        created_by=current_user.id,
    )
    db.add(comment)
    
    db.commit()
    
    return {"status": "ok"}

