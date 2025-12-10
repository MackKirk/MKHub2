from fastapi import APIRouter, Depends, HTTPException, Query, Body
from sqlalchemy.orm import Session
from sqlalchemy import func
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
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    divisions = user.divisions if hasattr(user, 'divisions') else []
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
            balance_hours = 0.0
            accrued_hours = 0.0
            used_hours = 0.0
            
            # Try different field names
            if "balance" in policy_data:
                balance_hours = float(policy_data["balance"]) if policy_data["balance"] else 0.0
            elif "balanceHours" in policy_data:
                balance_hours = float(policy_data["balanceHours"]) if policy_data["balanceHours"] else 0.0
            elif "available" in policy_data:
                balance_hours = float(policy_data["available"]) if policy_data["available"] else 0.0
            
            if "accrued" in policy_data:
                accrued_hours = float(policy_data["accrued"]) if policy_data["accrued"] else 0.0
            elif "accruedHours" in policy_data:
                accrued_hours = float(policy_data["accruedHours"]) if policy_data["accruedHours"] else 0.0
            
            if "used" in policy_data:
                used_hours = float(policy_data["used"]) if policy_data["used"] else 0.0
            elif "usedHours" in policy_data:
                used_hours = float(policy_data["usedHours"]) if policy_data["usedHours"] else 0.0
            
            # Find or create balance record
            balance = db.query(TimeOffBalance).filter(
                TimeOffBalance.user_id == user.id,
                TimeOffBalance.policy_name == policy_name,
                TimeOffBalance.year == current_year
            ).first()
            
            if balance:
                balance.balance_hours = balance_hours
                balance.accrued_hours = accrued_hours
                balance.used_hours = used_hours
                balance.last_synced_at = datetime.now(timezone.utc)
                balance.updated_at = datetime.now(timezone.utc)
            else:
                balance = TimeOffBalance(
                    id=uuid_lib.uuid4(),
                    user_id=user.id,
                    policy_name=policy_name,
                    balance_hours=balance_hours,
                    accrued_hours=accrued_hours,
                    used_hours=used_hours,
                    year=current_year,
                    last_synced_at=datetime.now(timezone.utc),
                    created_at=datetime.now(timezone.utc),
                    updated_at=datetime.now(timezone.utc)
                )
                db.add(balance)
            
            synced_count += 1
        
        db.commit()
        return {"message": f"Synced {synced_count} time off balance(s)", "synced": synced_count}
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error syncing time off balance: {str(e)}")


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
    current_user: User = Depends(get_current_user)
):
    """Create a new time off request"""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Users can only create requests for themselves
    if str(current_user.id) != user_id:
        raise HTTPException(status_code=403, detail="You can only create time off requests for yourself")
    
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
    current_year = datetime.now().year
    balance = db.query(TimeOffBalance).filter(
        TimeOffBalance.user_id == user.id,
        TimeOffBalance.policy_name == policy_name,
        TimeOffBalance.year == current_year
    ).first()
    
    if balance and float(balance.balance_hours) < hours:
        raise HTTPException(
            status_code=400,
            detail=f"Insufficient balance. Available: {balance.balance_hours} hours, Requested: {hours} hours"
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
                    if isinstance(requests_data, list):
                        for req in requests_data:
                            if isinstance(req, dict):
                                # Only process approved requests
                                status = req.get("status", "").lower()
                                if status in ["approved", "used"]:
                                    # Extract request details
                                    start_date = req.get("start")
                                    end_date = req.get("end")
                                    policy_name = req.get("policyType") or req.get("policyName") or req.get("type") or "Time Off"
                                    hours = req.get("amount") or req.get("hours") or 0.0
                                    days = float(hours) / 8.0 if hours else 0.0
                                    
                                    if start_date and end_date:
                                        # Create entry for each day or a single entry for the period
                                        try:
                                            start = datetime.strptime(start_date.split('T')[0], "%Y-%m-%d").date()
                                            end = datetime.strptime(end_date.split('T')[0], "%Y-%m-%d").date()
                                            
                                            # Create one entry per day or one entry for the period
                                            # Using start date as transaction date
                                            history_entries.append({
                                                "date": start_date,
                                                "policyName": policy_name,
                                                "description": f"Time off: {start_date} to {end_date}",
                                                "used": days,
                                                "earned": None,
                                                "balance": None
                                            })
                                        except Exception:
                                            pass
                    
                    if history_entries:
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
                for req in approved_requests:
                    # Convert hours to days
                    days = float(req.hours) / 8.0 if req.hours else 0.0
                    history_entries.append({
                        "date": req.start_date.isoformat(),
                        "policyName": req.policy_name,
                        "description": f"Time off: {req.start_date} to {req.end_date}" + (f" - {req.notes}" if req.notes else ""),
                        "used": days,
                        "earned": None,
                        "balance": None
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
        
        for trans_data in transactions:
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
            used_days = None
            earned_days = None
            
            # Try different field names for used days
            if "used" in trans_data:
                used_days = float(trans_data["used"]) if trans_data["used"] else None
            elif "usedDays" in trans_data:
                used_days = float(trans_data["usedDays"]) if trans_data["usedDays"] else None
            elif "used_days" in trans_data:
                used_days = float(trans_data["used_days"]) if trans_data["used_days"] else None
            elif "daysUsed" in trans_data:
                used_days = float(trans_data["daysUsed"]) if trans_data["daysUsed"] else None
            
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
            balance_after = trans_data.get("balance") or trans_data.get("balanceAfter") or trans_data.get("balance_after") or 0.0
            if balance_after:
                balance_after = float(balance_after)
            else:
                # Calculate from current balance if available
                if trans_policy_name in policy_map:
                    balance = policy_map[trans_policy_name]
                    balance_after = float(balance.balance_hours) / 8.0  # Convert hours to days
            
            # Get transaction ID from BambooHR
            bamboohr_trans_id = trans_data.get("id") or trans_data.get("transactionId") or trans_data.get("transaction_id")
            
            # Check if transaction already exists (by date, policy, and description)
            existing = db.query(TimeOffHistory).filter(
                TimeOffHistory.user_id == user.id,
                TimeOffHistory.policy_name == trans_policy_name,
                TimeOffHistory.transaction_date == trans_date,
                TimeOffHistory.description == description
            ).first()
            
            if existing:
                # Update existing transaction
                existing.used_days = used_days
                existing.earned_days = earned_days
                existing.balance_after = balance_after
                existing.bamboohr_transaction_id = bamboohr_trans_id
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
                    bamboohr_transaction_id=bamboohr_trans_id,
                    created_at=datetime.now(timezone.utc),
                    last_synced_at=datetime.now(timezone.utc)
                )
                db.add(history)
            
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
    
    # Update fields
    if "title" in payload:
        report.title = payload["title"]
        changes.append(f"Title updated to '{payload['title']}'")
    
    if "description" in payload:
        report.description = payload.get("description")
        changes.append("Description updated")
    
    if "occurrence_date" in payload:
        report.occurrence_date = datetime.fromisoformat(payload["occurrence_date"].replace('Z', '+00:00'))
        changes.append("Occurrence date updated")
    
    if "severity" in payload:
        report.severity = payload["severity"]
        changes.append(f"Severity changed to {payload['severity']}")
    
    if "status" in payload:
        report.status = payload["status"]
        if old_status != payload["status"]:
            changes.append(f"Status changed from {old_status} to {payload['status']}")
    
    if "vehicle" in payload:
        report.vehicle = payload.get("vehicle")
    
    if "ticket_number" in payload:
        report.ticket_number = payload.get("ticket_number")
    
    if "fine_amount" in payload:
        report.fine_amount = Decimal(str(payload["fine_amount"])) if payload.get("fine_amount") else None
    
    if "due_date" in payload:
        report.due_date = datetime.fromisoformat(payload["due_date"].replace('Z', '+00:00')) if payload.get("due_date") else None
    
    if "related_project_department" in payload:
        report.related_project_department = payload.get("related_project_department")
    
    if "suspension_start_date" in payload:
        report.suspension_start_date = datetime.fromisoformat(payload["suspension_start_date"].replace('Z', '+00:00')) if payload.get("suspension_start_date") else None
    
    if "suspension_end_date" in payload:
        report.suspension_end_date = datetime.fromisoformat(payload["suspension_end_date"].replace('Z', '+00:00')) if payload.get("suspension_end_date") else None
    
    if "behavior_note_type" in payload:
        report.behavior_note_type = payload.get("behavior_note_type")
    
    report.updated_at = datetime.now(timezone.utc)
    report.updated_by = current_user.id
    
    db.commit()
    
    # Add timeline entry for significant changes
    if changes:
        comment = ReportComment(
            id=uuid_lib.uuid4(),
            report_id=report.id,
            comment_text="; ".join(changes),
            comment_type="status_change" if old_status != report.status else "comment",
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

