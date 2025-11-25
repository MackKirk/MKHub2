from fastapi import APIRouter, Depends, HTTPException, Query, Body
from sqlalchemy.orm import Session
from typing import Optional, List
from datetime import datetime, timezone
from decimal import Decimal
import uuid as uuid_lib

from ..db import get_db
from ..models.models import (
    User, EmployeeProfile, SettingList, SettingItem,
    EmployeeSalaryHistory, EmployeeLoan, LoanPayment,
    EmployeeNotice, EmployeeFineTicket, EmployeeEquipment
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
    _=Depends(require_permissions("users:read"))
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
    _=Depends(require_permissions("users:read"))
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

@router.get("/{user_id}/loans")
def get_user_loans(
    user_id: str,
    status: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    _=Depends(require_permissions("users:read"))
):
    """Get all loans for a user"""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    query = db.query(EmployeeLoan).filter(EmployeeLoan.user_id == user.id)
    if status:
        query = query.filter(EmployeeLoan.status == status)
    
    loans = query.order_by(EmployeeLoan.loan_date.desc()).all()
    
    result = []
    for loan in loans:
        created_by_user = db.query(User).filter(User.id == loan.created_by).first()
        result.append({
            "id": str(loan.id),
            "loan_amount": float(loan.loan_amount),
            "remaining_balance": float(loan.remaining_balance),
            "weekly_payment": float(loan.weekly_payment),
            "loan_date": loan.loan_date.isoformat() if loan.loan_date else None,
            "status": loan.status,
            "description": loan.description,
            "notes": loan.notes,
            "created_by": {
                "id": str(loan.created_by),
                "username": created_by_user.username if created_by_user else None,
            },
            "created_at": loan.created_at.isoformat() if loan.created_at else None,
            "paid_off_at": loan.paid_off_at.isoformat() if loan.paid_off_at else None,
            "payments_count": len(loan.payments) if loan.payments else 0,
        })
    
    return result


@router.get("/{user_id}/loans/{loan_id}")
def get_loan_details(
    user_id: str,
    loan_id: str,
    db: Session = Depends(get_db),
    _=Depends(require_permissions("users:read"))
):
    """Get loan details with payments"""
    loan = db.query(EmployeeLoan).filter(
        EmployeeLoan.id == loan_id,
        EmployeeLoan.user_id == user_id
    ).first()
    
    if not loan:
        raise HTTPException(status_code=404, detail="Loan not found")
    
    created_by_user = db.query(User).filter(User.id == loan.created_by).first()
    
    payments = []
    for payment in loan.payments:
        created_by_payment = db.query(User).filter(User.id == payment.created_by).first()
        payments.append({
            "id": str(payment.id),
            "payment_amount": float(payment.payment_amount),
            "payment_date": payment.payment_date.isoformat() if payment.payment_date else None,
            "balance_after": float(payment.balance_after),
            "notes": payment.notes,
            "created_by": {
                "id": str(payment.created_by),
                "username": created_by_payment.username if created_by_payment else None,
            },
            "created_at": payment.created_at.isoformat() if payment.created_at else None,
        })
    
    return {
        "id": str(loan.id),
        "loan_amount": float(loan.loan_amount),
        "remaining_balance": float(loan.remaining_balance),
        "weekly_payment": float(loan.weekly_payment),
        "loan_date": loan.loan_date.isoformat() if loan.loan_date else None,
        "status": loan.status,
        "description": loan.description,
        "notes": loan.notes,
        "created_by": {
            "id": str(loan.created_by),
            "username": created_by_user.username if created_by_user else None,
        },
        "created_at": loan.created_at.isoformat() if loan.created_at else None,
        "paid_off_at": loan.paid_off_at.isoformat() if loan.paid_off_at else None,
        "payments": payments,
    }


@router.post("/{user_id}/loans")
def create_loan(
    user_id: str,
    payload: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permissions("users:write"))
):
    """Create a new loan for a user"""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    loan_date_str = payload.get("loan_date")
    if not loan_date_str:
        loan_date = datetime.now(timezone.utc)
    else:
        loan_date = datetime.fromisoformat(loan_date_str.replace('Z', '+00:00'))
    
    loan = EmployeeLoan(
        user_id=user.id,
        loan_amount=Decimal(str(payload.get("loan_amount", 0))),
        remaining_balance=Decimal(str(payload.get("loan_amount", 0))),
        weekly_payment=Decimal(str(payload.get("weekly_payment", 0))),
        loan_date=loan_date,
        status=payload.get("status", "active"),
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
    current_user: User = Depends(require_permissions("users:write"))
):
    """Create a payment for a loan"""
    loan = db.query(EmployeeLoan).filter(
        EmployeeLoan.id == loan_id,
        EmployeeLoan.user_id == user_id
    ).first()
    
    if not loan:
        raise HTTPException(status_code=404, detail="Loan not found")
    
    if loan.status != "active":
        raise HTTPException(status_code=400, detail="Loan is not active")
    
    payment_amount = Decimal(str(payload.get("payment_amount", 0)))
    if payment_amount <= 0:
        raise HTTPException(status_code=400, detail="Payment amount must be greater than 0")
    
    if payment_amount > loan.remaining_balance:
        raise HTTPException(status_code=400, detail="Payment amount exceeds remaining balance")
    
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
        balance_after=new_balance,
        notes=payload.get("notes"),
        created_by=current_user.id,
    )
    
    loan.remaining_balance = new_balance
    if new_balance <= 0:
        loan.status = "paid_off"
        loan.paid_off_at = datetime.now(timezone.utc)
    
    db.add(payment)
    db.commit()
    db.refresh(payment)
    
    return {"id": str(payment.id), "status": "ok", "remaining_balance": float(new_balance)}


# =====================
# Notices Management
# =====================

@router.get("/{user_id}/notices")
def get_user_notices(
    user_id: str,
    notice_type: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    _=Depends(require_permissions("users:read"))
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
    _=Depends(require_permissions("users:read"))
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
    _=Depends(require_permissions("users:read"))
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
        spec = importlib.util.spec_from_file_location("sync_bamboohr_employees", script_dir / "sync_bamboohr_employees.py")
        sync_module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(sync_module)
        create_or_update_user = sync_module.create_or_update_user
        sync_employee_photo = sync_module.sync_employee_photo
        get_storage = sync_module.get_storage
        
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
        
        db.commit()
        
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

