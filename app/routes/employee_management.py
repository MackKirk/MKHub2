from fastapi import APIRouter, Depends, HTTPException, Query, Body
from sqlalchemy.orm import Session
from sqlalchemy import func, or_, and_
from typing import Optional, List
from datetime import datetime, timezone, date, timedelta
from decimal import Decimal
import uuid as uuid_lib
import os

from ..db import get_db
from ..models.models import (
    User, EmployeeProfile, SettingList, SettingItem,
    EmployeeSalaryHistory, EmployeeLoan, LoanPayment,
    EmployeeNotice, EmployeeFineTicket, EmployeeEquipment,
    TimeOffBalance, TimeOffRequest, TimeOffHistory,
    EmployeeReport, ReportAttachment, ReportComment
)
from ..auth.security import require_permissions, get_current_user
from ..services.bamboohr_client import BambooHRClient


router = APIRouter(prefix="/employees", tags=["employee-management"])


# =====================
# Divisions Management
# =====================

@router.get("/{user_id}/divisions")
def get_user_divisions(
    user_id: str,
    db: Session = Depends(get_db),
    _=Depends(require_permissions("users:read", "hr:users:read", "hr:users:view:general"))
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
    _=Depends(require_permissions("users:write"))
):
    """Update user divisions (replace existing)"""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Get divisions from SettingItem
    divisions_list = db.query(SettingList).filter(SettingList.name == "divisions").first()
    if not divisions_list:
        raise HTTPException(status_code=404, detail="Divisions list not found")
    
    division_items = db.query(SettingItem).filter(
        SettingItem.list_id == divisions_list.id,
        SettingItem.id.in_([uuid_lib.UUID(did) for did in division_ids])
    ).all()
    
    user.divisions = division_items
    db.commit()
    
    return {"status": "ok", "divisions": [{"id": str(d.id), "label": d.label} for d in division_items]}


@router.put("/{user_id}/project-divisions")
def update_user_project_divisions(
    user_id: str,
    project_division_ids: List[str] = Body(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permissions("users:write"))
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
    _=Depends(require_permissions("users:read", "hr:users:read", "hr:users:view:general"))
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
    current_user: User = Depends(require_permissions("users:write"))
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
    _=Depends(require_permissions("users:read", "hr:users:read", "hr:users:view:general"))
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
    _=Depends(require_permissions("users:read", "hr:users:read", "hr:users:view:general"))
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
    _=Depends(require_permissions("users:read", "hr:users:read", "hr:users:view:general"))
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
    current_user: User = Depends(require_permissions("users:write", "hr:users:write"))
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
    current_user: User = Depends(require_permissions("users:write", "hr:users:write"))
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
    current_user: User = Depends(require_permissions("users:write", "hr:users:write"))
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
    current_user: User = Depends(require_permissions("users:write", "hr:users:write"))
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
    _=Depends(require_permissions("users:read", "hr:users:read", "hr:users:view:general"))
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
    _=Depends(require_permissions("users:read", "hr:users:read", "hr:users:view:general"))
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
    # Check if force_update is requested (default: True for explicit sync button clicks)
    force_update = payload.get("force_update", True)
    # Get user
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Get user's email (prefer personal, fallback to corporate)
    email = user.email_personal or user.email_corporate
    if not email:
        raise HTTPException(status_code=400, detail="User has no email address to match with BambooHR")
    
    try:
        # Initialize BambooHR client
        client = BambooHRClient()
        
        # Get employee directory to find employee by email
        directory = client.get_employees_directory()
        employees = directory if isinstance(directory, list) else (directory.get("employees", []) if isinstance(directory, dict) else [])
        
        # Find employee by email
        bamboohr_employee = None
        bamboohr_id = None
        
        for emp in employees:
            emp_id = str(emp.get("id", ""))
            try:
                emp_data = client.get_employee(emp_id)
                # Check all email fields
                emp_email = (
                    emp_data.get("homeEmail") or
                    emp_data.get("personalEmail") or
                    emp_data.get("workEmail") or
                    emp_data.get("email")
                )
                if emp_email and emp_email.strip().lower() == email.strip().lower():
                    bamboohr_employee = emp_data
                    bamboohr_employee["id"] = emp_id
                    bamboohr_id = emp_id
                    break
            except Exception:
                continue
        
        if not bamboohr_employee:
            raise HTTPException(status_code=404, detail=f"Employee not found in BambooHR for email: {email}")
        
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


# =====================
# Time Off Management
# =====================

def _get_time_off_entitlement_days(db: Session, policy_name: str) -> float | None:
    """
    Best-effort fallback when BambooHR doesn't expose balance/policy endpoints.
    Reads from SettingList `time_off_entitlements` where items are:
      - label: policy name (e.g. "Sick Leave")
      - value: annual entitlement in DAYS (e.g. "5")
    """
    try:
        lst = db.query(SettingList).filter(SettingList.name == "time_off_entitlements").first()
        if not lst:
            return None
        # Match by label (case-insensitive)
        items = db.query(SettingItem).filter(SettingItem.list_id == lst.id).all()
        for it in items:
            if (it.label or "").strip().lower() == (policy_name or "").strip().lower():
                try:
                    return float(it.value) if it.value is not None else None
                except Exception:
                    return None
        return None
    except Exception:
        return None

def _ensure_default_time_off_entitlement(db: Session, policy_name: str) -> float | None:
    """
    Create a default entitlement entry if the list doesn't exist.
    This is a pragmatic fallback for tenants where Bamboo time off policy endpoints are not available.
    """
    default_map = {
        "sick leave": 5.0,
    }
    pn = (policy_name or "").strip().lower()
    if pn not in default_map:
        return None
    try:
        lst = db.query(SettingList).filter(SettingList.name == "time_off_entitlements").first()
        if not lst:
            lst = SettingList(name="time_off_entitlements")
            db.add(lst)
            db.flush()
        # upsert item
        existing = db.query(SettingItem).filter(
            SettingItem.list_id == lst.id,
            func.lower(SettingItem.label) == pn,
        ).first()
        if not existing:
            item = SettingItem(
                list_id=lst.id,
                label=policy_name,
                value=str(default_map[pn]),
                sort_index=0,
                meta={"source": "default"},
            )
            db.add(item)
            db.flush()
        return default_map[pn]
    except Exception:
        return None

@router.get("/{user_id}/time-off/balance")
def get_time_off_balance(
    user_id: str,
    year: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _=Depends(require_permissions("users:read", "hr:users:read", "hr:users:view:general"))
):
    """Get time off balance for a user"""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Check if user can view their own balance or has permission
    if str(current_user.id) != user_id and not _:
        raise HTTPException(status_code=403, detail="Not authorized")
    
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
    _=Depends(require_permissions("users:write"))
):
    """Sync time off balance from BambooHR"""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Get user's email to find BambooHR employee
    email = user.email_personal or user.email_corporate
    if not email:
        raise HTTPException(status_code=400, detail="User has no email address to match with BambooHR")
    
    try:
        client = BambooHRClient()
        directory = client.get_employees_directory()
        employees = directory if isinstance(directory, list) else (directory.get("employees", []) if isinstance(directory, dict) else [])
        
        bamboohr_id = None
        for emp in employees:
            emp_id = str(emp.get("id", ""))
            try:
                emp_data = client.get_employee(emp_id)
                emp_email = (
                    emp_data.get("homeEmail") or
                    emp_data.get("personalEmail") or
                    emp_data.get("workEmail") or
                    emp_data.get("email")
                )
                if emp_email and emp_email.strip().lower() == email.strip().lower():
                    bamboohr_id = emp_id
                    break
            except Exception:
                continue
        
        if not bamboohr_id:
            raise HTTPException(status_code=404, detail=f"Employee not found in BambooHR for email: {email}")
        
        # Get time off balance from BambooHR
        balance_data = client.get_time_off_balance(bamboohr_id)
        if not balance_data:
            return {"message": "No time off balance data found in BambooHR", "synced": 0}
        
        # Parse balance data (format may vary)
        current_year = datetime.now().year
        synced_count = 0
        
        # Handle different response formats
        policies = []
        if isinstance(balance_data, dict):
            if "policies" in balance_data:
                policies = balance_data["policies"] if isinstance(balance_data["policies"], list) else [balance_data["policies"]]
            elif "data" in balance_data:
                policies = balance_data["data"] if isinstance(balance_data["data"], list) else [balance_data["data"]]
            else:
                # Assume the dict itself is a policy
                policies = [balance_data]
        elif isinstance(balance_data, list):
            policies = balance_data
        
        for policy_data in policies:
            if not isinstance(policy_data, dict):
                continue
            
            policy_name = policy_data.get("name") or policy_data.get("policyName") or policy_data.get("type") or "Time Off"
            
            # Extract balance information
            balance_hours = None
            accrued_hours = None
            used_hours = 0.0
            
            # Try different field names
            if "balance" in policy_data and policy_data["balance"] is not None:
                balance_hours = float(policy_data["balance"])
            elif "balanceHours" in policy_data and policy_data["balanceHours"] is not None:
                balance_hours = float(policy_data["balanceHours"])
            elif "available" in policy_data and policy_data["available"] is not None:
                balance_hours = float(policy_data["available"])
            
            if "accrued" in policy_data and policy_data["accrued"] is not None:
                accrued_hours = float(policy_data["accrued"])
            elif "accruedHours" in policy_data and policy_data["accruedHours"] is not None:
                accrued_hours = float(policy_data["accruedHours"])
            
            if "used" in policy_data and policy_data["used"] is not None:
                used_hours = float(policy_data["used"])
            elif "usedHours" in policy_data and policy_data["usedHours"] is not None:
                used_hours = float(policy_data["usedHours"])

            # Fallback: if Bamboo doesn't provide balance/accrued, compute from configured entitlement
            # This is needed for Bamboo tenants where /time_off/balance and /time_off/policies are not available.
            if (balance_hours is None or accrued_hours is None) and used_hours >= 0:
                entitlement_days = _get_time_off_entitlement_days(db, policy_name)
                if entitlement_days is None:
                    entitlement_days = _ensure_default_time_off_entitlement(db, policy_name)
                if entitlement_days is not None:
                    entitlement_hours = float(entitlement_days) * 8.0
                    if accrued_hours is None:
                        accrued_hours = entitlement_hours
                    if balance_hours is None:
                        balance_hours = entitlement_hours - used_hours
            
            # Find or create balance record
            balance = db.query(TimeOffBalance).filter(
                TimeOffBalance.user_id == user.id,
                TimeOffBalance.policy_name == policy_name,
                TimeOffBalance.year == current_year
            ).first()
            
            if balance:
                # Only update fields that we have data for (preserve existing values if data is partial)
                if balance_hours is not None:
                    balance.balance_hours = balance_hours
                if accrued_hours is not None:
                    balance.accrued_hours = accrued_hours
                balance.used_hours = used_hours
                balance.last_synced_at = datetime.now(timezone.utc)
                balance.updated_at = datetime.now(timezone.utc)
            else:
                # For new records, use 0.0 as default if values are None
                balance = TimeOffBalance(
                    id=uuid_lib.uuid4(),
                    user_id=user.id,
                    policy_name=policy_name,
                    balance_hours=balance_hours if balance_hours is not None else 0.0,
                    accrued_hours=accrued_hours if accrued_hours is not None else 0.0,
                    used_hours=used_hours,
                    year=current_year,
                    last_synced_at=datetime.now(timezone.utc),
                    created_at=datetime.now(timezone.utc),
                    updated_at=datetime.now(timezone.utc)
                )
                db.add(balance)
            
            synced_count += 1
        
        db.commit()
        
        # Check if data came from requests (partial data)
        source = balance_data.get("_source") if isinstance(balance_data, dict) else None
        if source == "requests":
            return {
                "message": f"Synced {synced_count} time off balance(s) from requests (partial data - only used hours available)", 
                "synced": synced_count,
                "partial": True
            }
        
        return {"message": f"Synced {synced_count} time off balance(s)", "synced": synced_count}
        
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
    _=Depends(require_permissions("users:write"))
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
    _=Depends(require_permissions("users:read", "hr:users:read", "hr:users:view:general"))
):
    """Get time off requests for a user"""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Check if user can view their own requests or has permission
    if str(current_user.id) != user_id and not _:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    query = db.query(TimeOffRequest).filter(TimeOffRequest.user_id == user.id)
    if status:
        query = query.filter(TimeOffRequest.status == status)
    
    requests = query.order_by(TimeOffRequest.requested_at.desc()).all()
    
    return [{
        "id": str(r.id),
        "policy_name": r.policy_name,
        "start_date": r.start_date.isoformat(),
        "end_date": r.end_date.isoformat(),
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
    _=Depends(require_permissions("users:write", "hr:users:write"))
):
    """Create a new time off request"""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Users can create requests for themselves, or admins/HR can create for others
    if str(current_user.id) != user_id and not _:
        raise HTTPException(status_code=403, detail="You can only create time off requests for yourself, or you need admin/HR permissions to create requests for others")
    
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
    
    # Calculate hours if not provided
    if not hours:
        days = (end_date - start_date).days + 1
        # Assume 8 hours per day (can be made configurable)
        hours = days * 8.0
    else:
        hours = float(hours)
    
    # Check if user has enough balance
    # For "Sick Leave", allow request even without sufficient balance
    is_sick_leave = policy_name and policy_name.lower().strip() in ["sick leave", "sick"]
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
        notes=notes,
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
    _=Depends(require_permissions("users:write"))
):
    """Update time off request (approve/reject/cancel)"""
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
    
    if new_status == "cancelled" and str(current_user.id) == user_id:
        # User can cancel their own request
        request.status = "cancelled"
        request.updated_at = datetime.now(timezone.utc)
    elif new_status in ["approved", "rejected"] and _:
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
    _=Depends(require_permissions("users:read", "hr:users:read", "hr:users:view:general"))
):
    """Get time off history/transactions for a user"""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Check if user can view their own history or has permission
    if str(current_user.id) != user_id and not _:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    query = db.query(TimeOffHistory).filter(TimeOffHistory.user_id == user.id)
    if policy_name:
        query = query.filter(TimeOffHistory.policy_name == policy_name)
    if year:
        query = query.filter(func.extract('year', TimeOffHistory.transaction_date) == year)
    
    history = query.order_by(TimeOffHistory.transaction_date.desc()).all()
    
    return [{
        "id": str(h.id),
        "policy_name": h.policy_name,
        "transaction_date": h.transaction_date.isoformat(),
        "description": h.description,
        "used_days": float(h.used_days) if h.used_days else None,
        "earned_days": float(h.earned_days) if h.earned_days else None,
        "balance_after": float(h.balance_after),
        "bamboohr_transaction_id": h.bamboohr_transaction_id
    } for h in history]


@router.post("/{user_id}/time-off/history/sync")
def sync_time_off_history(
    user_id: str,
    policy_name: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _=Depends(require_permissions("users:write"))
):
    """Sync time off history from BambooHR"""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Get user's email to find BambooHR employee
    email = user.email_personal or user.email_corporate
    if not email:
        raise HTTPException(status_code=400, detail="User has no email address to match with BambooHR")
    
    try:
        client = BambooHRClient()
        directory = client.get_employees_directory()
        employees = directory if isinstance(directory, list) else (directory.get("employees", []) if isinstance(directory, dict) else [])
        
        bamboohr_id = None
        for emp in employees:
            emp_id = str(emp.get("id", ""))
            try:
                emp_data = client.get_employee(emp_id)
                emp_email = (
                    emp_data.get("homeEmail") or
                    emp_data.get("personalEmail") or
                    emp_data.get("workEmail") or
                    emp_data.get("email")
                )
                if emp_email and emp_email.strip().lower() == email.strip().lower():
                    bamboohr_id = emp_id
                    break
            except Exception:
                continue
        
        if not bamboohr_id:
            raise HTTPException(status_code=404, detail=f"Employee not found in BambooHR for email: {email}")
        
        # Try to get time off balance history from BambooHR
        history_data = client.get_time_off_balance_history(bamboohr_id)
        if not history_data:
            # If no history endpoint, try to get from balance data which might include history
            balance_data = client.get_time_off_balance(bamboohr_id)
            if balance_data and isinstance(balance_data, dict):
                history_data = balance_data.get("history") or balance_data.get("transactions")
        
        # If still no history, generate from approved time off requests
        if not history_data:
            try:
                # Get approved time off requests from BambooHR
                requests_data = client.get_time_off_requests(bamboohr_id)
                if requests_data:
                    # Convert approved requests to history entries
                    history_entries = []
                    # Track policies/years seen so we can add synthetic accrual credits
                    seen_policy_years: set[tuple[str, int]] = set()
                    if isinstance(requests_data, list):
                        for req in requests_data:
                            if isinstance(req, dict):
                                # Only process approved requests
                                status = req.get("status", "").lower()
                                if status in ["approved", "used", "taken", "approvedpaid", "approvedunpaid"]:
                                    req_id = req.get("id") or req.get("requestId") or req.get("request_id")
                                    # Extract request details
                                    start_date = req.get("start") or req.get("startDate")
                                    end_date = req.get("end") or req.get("endDate")
                                    policy_name = req.get("policyType") or req.get("policyName") or req.get("policy") or req.get("type") or "Time Off"
                                    # Notes can come as string or nested dict (e.g. {"note": "fever"})
                                    notes_raw = req.get("notes") or req.get("note") or req.get("comment") or ""
                                    notes = ""
                                    try:
                                        if isinstance(notes_raw, dict):
                                            notes = (
                                                notes_raw.get("note") or
                                                notes_raw.get("notes") or
                                                notes_raw.get("comment") or
                                                notes_raw.get("reason") or
                                                ""
                                            )
                                        elif isinstance(notes_raw, str):
                                            notes = notes_raw
                                        else:
                                            notes = str(notes_raw) if notes_raw else ""
                                    except Exception:
                                        notes = str(notes_raw) if notes_raw else ""
                                    
                                    # Determine if amount is in days or hours
                                    days = 0.0
                                    unit = req.get("unit", "").lower()
                                    
                                    # Check for explicit hours field
                                    if "hours" in req and req["hours"] is not None:
                                        try:
                                            hours_val = float(req["hours"])
                                            days = abs(hours_val) / 8.0
                                        except (ValueError, TypeError):
                                            pass
                                    
                                    # Check for amount field (usually in days for BambooHR)
                                    elif "amount" in req and req["amount"] is not None:
                                        try:
                                            amount = float(req["amount"])
                                            # Check unit to determine if it's days or hours
                                            if unit == "hours" or "hour" in unit:
                                                days = abs(amount) / 8.0
                                            else:
                                                # Default assumption: amount is in days (BambooHR API typically returns days)
                                                days = abs(amount)
                                        except (ValueError, TypeError):
                                            pass
                                    
                                    # Check for days field
                                    elif "days" in req and req["days"] is not None:
                                        try:
                                            days = abs(float(req["days"]))
                                        except (ValueError, TypeError):
                                            pass
                                    
                                    # Also check if we can calculate from start/end dates
                                    if days == 0.0 and start_date and end_date:
                                        try:
                                            start = datetime.strptime(start_date.split('T')[0], "%Y-%m-%d").date()
                                            end = datetime.strptime(end_date.split('T')[0], "%Y-%m-%d").date()
                                            # Calculate days between dates (inclusive)
                                            delta = (end - start).days + 1
                                            if delta > 0:
                                                days = float(delta)
                                        except Exception:
                                            pass
                                    
                                    if start_date and end_date and days > 0:
                                        # Create entry for each day or a single entry for the period
                                        try:
                                            start = datetime.strptime(start_date.split('T')[0], "%Y-%m-%d").date()
                                            end = datetime.strptime(end_date.split('T')[0], "%Y-%m-%d").date()
                                            
                                            # Create one entry per day or one entry for the period
                                            # Using start date as transaction date
                                            # Format date for description
                                            try:
                                                start_date_obj = datetime.strptime(start_date.split('T')[0], "%Y-%m-%d").date()
                                                date_str = start_date_obj.strftime("%m/%d/%Y")
                                                if start_date.split('T')[0] == end_date.split('T')[0]:
                                                    description = f"Time off used for {date_str}"
                                                else:
                                                    end_date_obj = datetime.strptime(end_date.split('T')[0], "%Y-%m-%d").date()
                                                    end_date_str = end_date_obj.strftime("%m/%d/%Y")
                                                    description = f"Time off used for {date_str} to {end_date_str}"
                                            except:
                                                description = f"Time off: {start_date} to {end_date}"

                                            if notes:
                                                description = f"{description}\n{notes}"

                                            # Try to extract balance-after from request payload (if provided)
                                            balance_after = (
                                                req.get("balanceAfter") or req.get("balance_after") or req.get("balance") or
                                                req.get("balanceRemaining") or req.get("balance_remaining") or req.get("remainingBalance")
                                            )
                                            try:
                                                balance_after = float(balance_after) if balance_after is not None else None
                                            except Exception:
                                                balance_after = None
                                            
                                            history_entries.append({
                                                "date": start_date,
                                                "policyName": policy_name,
                                                "description": description,
                                                "used": -days,  # Used days should be negative
                                                "earned": None,
                                                "balance": balance_after,
                                                # Use request id as stable transaction id so resync updates instead of duplicating
                                                "id": f"req:{req_id}" if req_id else None,
                                            })

                                            # Track policy+year for synthetic accrual
                                            try:
                                                y = datetime.strptime(start_date.split('T')[0], "%Y-%m-%d").date().year
                                            except Exception:
                                                y = datetime.now().year
                                            seen_policy_years.add((policy_name, y))
                                        except Exception:
                                            pass

                    # Add synthetic accrual credits (because this Bamboo tenant doesn't expose balance history/policies)
                    for pol, y in sorted(seen_policy_years, key=lambda x: (x[1], x[0].lower())):
                        entitlement_days = None
                        # Prefer existing synced TimeOffBalance for that year (accrued_hours)
                        try:
                            bal_row = db.query(TimeOffBalance).filter(
                                TimeOffBalance.user_id == user.id,
                                TimeOffBalance.policy_name == pol,
                                TimeOffBalance.year == y
                            ).first()
                            if bal_row and bal_row.accrued_hours is not None:
                                entitlement_days = float(bal_row.accrued_hours) / 8.0
                        except Exception:
                            entitlement_days = None

                        if entitlement_days is None:
                            entitlement_days = _get_time_off_entitlement_days(db, pol)
                        if entitlement_days is None:
                            entitlement_days = _ensure_default_time_off_entitlement(db, pol)

                        if entitlement_days and entitlement_days > 0:
                            accrual_date = f"{y}-01-01"
                            history_entries.append({
                                "date": accrual_date,
                                "policyName": pol,
                                "description": f"Accrual for 01/01/{y} to 12/31/{y}",
                                "used": None,
                                "earned": float(entitlement_days),
                                "balance": float(entitlement_days),
                                "id": f"entitlement:{pol}:{y}",
                            })
                    
                    if history_entries:
                        # Sort by date (oldest first) for proper balance calculation
                        history_entries.sort(key=lambda x: x.get("date", "1900-01-01"))
                        history_data = history_entries
            except Exception as e:
                # Log but don't fail if we can't get requests
                print(f"[DEBUG] Could not get time off requests for history: {e}")
        
        # If still no history from BambooHR, try to generate from local approved requests
        if not history_data:
            # Get approved time off requests from local database
            from ..models.models import TimeOffRequest
            approved_requests = db.query(TimeOffRequest).filter(
                TimeOffRequest.user_id == user.id,
                TimeOffRequest.status == "approved"
            ).all()
            
            if approved_requests:
                history_entries = []
                seen_policy_years: set[tuple[str, int]] = set()
                for req in approved_requests:
                    # Convert hours to days
                    days = float(req.hours) / 8.0 if req.hours else 0.0
                    # Format description
                    try:
                        start_date_str = req.start_date.strftime("%m/%d/%Y")
                        if req.start_date == req.end_date:
                            description = f"Time off used for {start_date_str}"
                        else:
                            end_date_str = req.end_date.strftime("%m/%d/%Y")
                            description = f"Time off used for {start_date_str} to {end_date_str}"
                        if req.notes:
                            description += f" - {req.notes}"
                    except:
                        description = f"Time off: {req.start_date} to {req.end_date}" + (f" - {req.notes}" if req.notes else "")
                    
                    history_entries.append({
                        "date": req.start_date.isoformat(),
                        "policyName": req.policy_name,
                        "description": description,
                        "used": -days,  # Used days should be negative
                        "earned": None,
                        "balance": None
                    })
                    seen_policy_years.add((req.policy_name, req.start_date.year))

                # Add synthetic accrual credits from entitlements
                for pol, y in sorted(seen_policy_years, key=lambda x: (x[1], x[0].lower())):
                    entitlement_days = _get_time_off_entitlement_days(db, pol)
                    if entitlement_days is None:
                        entitlement_days = _ensure_default_time_off_entitlement(db, pol)
                    if entitlement_days and entitlement_days > 0:
                        history_entries.append({
                            "date": f"{y}-01-01",
                            "policyName": pol,
                            "description": f"Accrual for 01/01/{y} to 12/31/{y}",
                            "used": None,
                            "earned": float(entitlement_days),
                            "balance": float(entitlement_days),
                            "id": f"entitlement:{pol}:{y}",
                        })
                
                if history_entries:
                    history_data = history_entries
        
        if not history_data:
            return {"message": "No time off history data found. History may not be available via BambooHR API.", "synced": 0}
        
        # Parse history data (format may vary)
        synced_count = 0
        
        # Handle different response formats
        transactions = []
        if isinstance(history_data, list):
            transactions = history_data
        elif isinstance(history_data, dict):
            if "transactions" in history_data:
                transactions = history_data["transactions"] if isinstance(history_data["transactions"], list) else [history_data["transactions"]]
            elif "history" in history_data:
                transactions = history_data["history"] if isinstance(history_data["history"], list) else [history_data["history"]]
            elif "data" in history_data:
                transactions = history_data["data"] if isinstance(history_data["data"], list) else [history_data["data"]]
            else:
                # Assume the dict itself is a transaction
                transactions = [history_data]
        
        # Get existing balances to map policy names
        balances = db.query(TimeOffBalance).filter(TimeOffBalance.user_id == user.id).all()
        policy_map = {b.policy_name: b for b in balances}
        
        # Sort transactions by date (oldest first) to calculate balance incrementally
        def get_trans_date(trans):
            date_str = trans.get("date") or trans.get("transactionDate") or trans.get("transaction_date") or "1900-01-01"
            try:
                if isinstance(date_str, str):
                    return datetime.strptime(date_str.split('T')[0], "%Y-%m-%d").date()
                return date_str
            except:
                return datetime(1900, 1, 1).date()
        
        transactions_sorted = sorted(transactions, key=get_trans_date)
        
        # Track running balance per policy
        # Initialize with current balance from TimeOffBalance (convert hours to days)
        policy_balances = {}
        for policy_name_key, balance_obj in policy_map.items():
            # Convert hours to days for initial balance
            policy_balances[policy_name_key] = float(balance_obj.balance_hours) / 8.0
        
        # Calculate backwards from current balance to get initial balance for each policy
        # We'll reverse the transactions, subtract earned, add used to get starting balance
        transactions_reversed = list(reversed(transactions_sorted))
        initial_balances = {}
        
        # First, collect all unique policy names from transactions
        all_policies = set()
        for trans in transactions_sorted:
            trans_policy = trans.get("policyName") or trans.get("policy_name") or trans.get("name") or "Time Off"
            all_policies.add(trans_policy)
        
        # Calculate initial balance for each policy
        for policy_name_key in all_policies:
            # Start with current balance if available, otherwise 0
            if policy_name_key in policy_balances:
                initial_balance = policy_balances[policy_name_key]
            else:
                initial_balance = 0.0
            
            # Work backwards through transactions
            for trans in transactions_reversed:
                trans_policy = trans.get("policyName") or trans.get("policy_name") or trans.get("name") or "Time Off"
                if trans_policy == policy_name_key:
                    # Work backwards: subtract earned, add used
                    earned = trans.get("earned") or trans.get("earnedDays") or trans.get("earned_days") or 0.0
                    used = abs(trans.get("used") or trans.get("usedDays") or trans.get("used_days") or 0.0)
                    initial_balance = initial_balance - float(earned) + float(used)
            
            initial_balances[policy_name_key] = initial_balance
        
        # Now reset policy_balances to initial values and calculate forward
        policy_balances = initial_balances.copy()
        
        for trans_data in transactions_sorted:
            if not isinstance(trans_data, dict):
                continue
            
            # Extract transaction information
            trans_policy_name = trans_data.get("policyName") or trans_data.get("policy_name") or trans_data.get("name") or policy_name or "Time Off"
            
            # Skip if policy filter is set and doesn't match
            if policy_name and trans_policy_name != policy_name:
                continue
            
            # Parse transaction date
            trans_date_str = trans_data.get("date") or trans_data.get("transactionDate") or trans_data.get("transaction_date")
            if not trans_date_str:
                continue
            
            try:
                if isinstance(trans_date_str, str):
                    trans_date = datetime.strptime(trans_date_str.split('T')[0], "%Y-%m-%d").date()
                else:
                    trans_date = trans_date_str
            except Exception:
                continue
            
            # Extract description
            description = (
                trans_data.get("description") or
                trans_data.get("note") or
                trans_data.get("notes") or
                trans_data.get("comment") or
                "Time off transaction"
            )
            
            # Extract used/earned days
            # Note: Used days should be negative (deduction from balance)
            used_days = None
            earned_days = None
            if "used" in trans_data and trans_data["used"] is not None:
                used_val = float(trans_data["used"])
                # Ensure used days are negative
                used_days = -abs(used_val) if used_val != 0 else None
            elif "usedDays" in trans_data and trans_data["usedDays"] is not None:
                used_val = float(trans_data["usedDays"])
                used_days = -abs(used_val) if used_val != 0 else None
            elif "used_days" in trans_data and trans_data["used_days"] is not None:
                used_val = float(trans_data["used_days"])
                used_days = -abs(used_val) if used_val != 0 else None
            elif "daysUsed" in trans_data and trans_data["daysUsed"] is not None:
                used_val = float(trans_data["daysUsed"])
                used_days = -abs(used_val) if used_val != 0 else None
            
            # Try different field names for earned days
            if "earned" in trans_data:
                earned_days = float(trans_data["earned"]) if trans_data["earned"] else None
            elif "earnedDays" in trans_data:
                earned_days = float(trans_data["earnedDays"]) if trans_data["earnedDays"] else None
            elif "earned_days" in trans_data:
                earned_days = float(trans_data["earned_days"]) if trans_data["earned_days"] else None
            elif "daysEarned" in trans_data:
                earned_days = float(trans_data["daysEarned"]) if trans_data["daysEarned"] else None
            
            # Extract balance after transaction
            balance_after = None
            if "balance" in trans_data and trans_data["balance"] is not None:
                balance_after = float(trans_data["balance"])
            elif "balanceAfter" in trans_data and trans_data["balanceAfter"] is not None:
                balance_after = float(trans_data["balanceAfter"])
            elif "balance_after" in trans_data and trans_data["balance_after"] is not None:
                balance_after = float(trans_data["balance_after"])
            
            # If balance not provided, calculate incrementally
            if balance_after is None:
                # Initialize balance for this policy if not exists
                if trans_policy_name not in policy_balances:
                    # Try to get initial balance from existing balance record
                    if trans_policy_name in policy_map:
                        balance = policy_map[trans_policy_name]
                        # Start from the current balance and work backwards, or start from 0
                        policy_balances[trans_policy_name] = 0.0  # We'll calculate forward from transactions
                    else:
                        policy_balances[trans_policy_name] = 0.0
                
                # Calculate new balance: current balance + earned - used
                current_balance = policy_balances[trans_policy_name]
                earned = earned_days if earned_days else 0.0
                # Used days should be negative, so we add them (subtract absolute value)
                used = abs(used_days) if used_days and used_days < 0 else (abs(used_days) if used_days else 0.0)
                balance_after = current_balance + earned - used
                
                # Update running balance
                policy_balances[trans_policy_name] = balance_after
            else:
                # If we got an explicit balance, keep the running state in sync for subsequent computed rows.
                policy_balances[trans_policy_name] = balance_after
            
            # Get transaction ID from BambooHR
            bamboohr_trans_id = trans_data.get("id") or trans_data.get("transactionId") or trans_data.get("transaction_id")

            # Upsert strategy:
            # - Prefer matching by BambooHR transaction id (stable)
            # - Fallback to match by (policy + date + used/earned) ignoring description
            existing = None
            if bamboohr_trans_id:
                existing = db.query(TimeOffHistory).filter(
                    TimeOffHistory.user_id == user.id,
                    TimeOffHistory.policy_name == trans_policy_name,
                    TimeOffHistory.bamboohr_transaction_id == str(bamboohr_trans_id),
                ).first()

                # Migration path: if old row exists without transaction_id, adopt it instead of creating a duplicate
                if not existing:
                    existing = db.query(TimeOffHistory).filter(
                        TimeOffHistory.user_id == user.id,
                        TimeOffHistory.policy_name == trans_policy_name,
                        TimeOffHistory.transaction_date == trans_date,
                        TimeOffHistory.bamboohr_transaction_id.is_(None),
                        or_(
                            and_(TimeOffHistory.used_days.is_(None), used_days is None),
                            TimeOffHistory.used_days == used_days,
                        ),
                        or_(
                            and_(TimeOffHistory.earned_days.is_(None), earned_days is None),
                            TimeOffHistory.earned_days == earned_days,
                        ),
                    ).first()
            else:
                existing = db.query(TimeOffHistory).filter(
                    TimeOffHistory.user_id == user.id,
                    TimeOffHistory.policy_name == trans_policy_name,
                    TimeOffHistory.transaction_date == trans_date,
                    or_(
                        and_(TimeOffHistory.used_days.is_(None), used_days is None),
                        TimeOffHistory.used_days == used_days,
                    ),
                    or_(
                        and_(TimeOffHistory.earned_days.is_(None), earned_days is None),
                        TimeOffHistory.earned_days == earned_days,
                    ),
                ).first()
            
            if existing:
                # Update existing transaction
                existing.used_days = used_days
                existing.earned_days = earned_days
                existing.balance_after = balance_after
                existing.description = description
                existing.bamboohr_transaction_id = str(bamboohr_trans_id) if bamboohr_trans_id else existing.bamboohr_transaction_id
                existing.last_synced_at = datetime.now(timezone.utc)
            else:
                # Create new transaction
                history = TimeOffHistory(
                    id=uuid_lib.uuid4(),
                    user_id=user.id,
                    policy_name=trans_policy_name,
                    transaction_date=trans_date,
                    description=description,
                    used_days=used_days,
                    earned_days=earned_days,
                    balance_after=balance_after,
                    bamboohr_transaction_id=str(bamboohr_trans_id) if bamboohr_trans_id else None,
                    created_at=datetime.now(timezone.utc),
                    last_synced_at=datetime.now(timezone.utc)
                )
                db.add(history)

            # Best-effort cleanup: remove old duplicate rows created when description format changed
            # (same policy+date+amount, but missing transaction id)
            try:
                canonical_trans_id = str(bamboohr_trans_id) if bamboohr_trans_id else None
                duplicates_q = db.query(TimeOffHistory).filter(
                    TimeOffHistory.user_id == user.id,
                    TimeOffHistory.policy_name == trans_policy_name,
                    TimeOffHistory.transaction_date == trans_date,
                    or_(
                        and_(TimeOffHistory.used_days.is_(None), used_days is None),
                        TimeOffHistory.used_days == used_days,
                    ),
                    or_(
                        and_(TimeOffHistory.earned_days.is_(None), earned_days is None),
                        TimeOffHistory.earned_days == earned_days,
                    ),
                )
                if canonical_trans_id:
                    duplicates_q = duplicates_q.filter(
                        or_(
                            TimeOffHistory.bamboohr_transaction_id.is_(None),
                            TimeOffHistory.bamboohr_transaction_id != canonical_trans_id,
                        )
                    )
                else:
                    duplicates_q = duplicates_q.filter(TimeOffHistory.bamboohr_transaction_id.is_(None))

                duplicates = duplicates_q.all()
                # Keep at most one: prefer the one with bamboohr_transaction_id, otherwise the newest
                if len(duplicates) > 1:
                    # sort: has transaction id first, then by created_at desc (if present)
                    duplicates_sorted = sorted(
                        duplicates,
                        key=lambda r: (0 if r.bamboohr_transaction_id else 1, -(r.created_at.timestamp() if r.created_at else 0)),
                    )
                    for dup in duplicates_sorted[1:]:
                        db.delete(dup)
            except Exception:
                pass
            
            synced_count += 1
        
        db.commit()
        return {"message": f"Synced {synced_count} time off history transaction(s)", "synced": synced_count}
        
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
    _=Depends(require_permissions("users:read", "hr:users:read", "hr:users:view:general"))
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
    _=Depends(require_permissions("users:read", "hr:users:read", "hr:users:view:general"))
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
    current_user: User = Depends(require_permissions("users:write", "hr:users:write"))
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
        status=payload.get("status", "Open"),
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
    current_user: User = Depends(require_permissions("users:write", "hr:users:write"))
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


@router.post("/{user_id}/reports/{report_id}/comments")
def add_report_comment(
    user_id: str,
    report_id: str,
    payload: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permissions("users:write", "hr:users:write"))
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
    current_user: User = Depends(require_permissions("users:write", "hr:users:write"))
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
    
    db.commit()
    
    return {"id": str(attachment.id), "status": "ok"}


@router.delete("/{user_id}/reports/{report_id}/attachments/{attachment_id}")
def delete_report_attachment(
    user_id: str,
    report_id: str,
    attachment_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permissions("users:write", "hr:users:write"))
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

