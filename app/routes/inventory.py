import uuid
from datetime import datetime, timezone
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Body
from sqlalchemy.orm import Session

from ..db import get_db
from ..config import settings
from ..auth.security import get_current_user, require_permissions
from ..models.models import (
    InventoryProduct,
    Supplier,
    SupplierContact,
    InventoryOrder,
    InventoryOrderItem,
)
from ..schemas.inventory import (
    ProductCreate,
    ProductResponse,
    SupplierCreate,
    SupplierResponse,
    SupplierContactCreate,
    SupplierContactResponse,
    OrderCreate,
    OrderResponse,
    OrderStatus,
)

import smtplib
from email.message import EmailMessage


router = APIRouter(prefix="/inventory", tags=["inventory"])


# ---------- PRODUCTS ----------
@router.get("/products", response_model=List[ProductResponse])
def list_products(db: Session = Depends(get_db), _=Depends(require_permissions("inventory:read"))):
    return db.query(InventoryProduct).all()


@router.post("/products", response_model=ProductResponse)
def create_product(product: ProductCreate, db: Session = Depends(get_db), _=Depends(require_permissions("inventory:write"))):
    row = InventoryProduct(**product.dict())
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.put("/products/{product_id}", response_model=ProductResponse)
def update_product(product_id: uuid.UUID, product: ProductCreate, db: Session = Depends(get_db), _=Depends(require_permissions("inventory:write"))):
    row = db.query(InventoryProduct).filter(InventoryProduct.id == product_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Product not found")
    row.name = product.name
    row.unit = product.unit
    row.stock_quantity = product.stock_quantity
    row.reorder_point = product.reorder_point
    db.commit()
    db.refresh(row)
    return row


@router.delete("/products/{product_id}")
def delete_product(product_id: uuid.UUID, db: Session = Depends(get_db), _=Depends(require_permissions("inventory:write"))):
    row = db.query(InventoryProduct).filter(InventoryProduct.id == product_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Product not found")
    db.delete(row)
    db.commit()
    return {"message": "Product deleted successfully"}


@router.get("/products/low_stock", response_model=List[ProductResponse])
def low_stock_products(db: Session = Depends(get_db), _=Depends(require_permissions("inventory:read"))):
    return db.query(InventoryProduct).filter(InventoryProduct.stock_quantity <= InventoryProduct.reorder_point).all()


# ---------- SUPPLIERS ----------
@router.get("/suppliers", response_model=List[SupplierResponse])
def list_suppliers(q: str | None = None, db: Session = Depends(get_db)):
    try:
        query = db.query(Supplier)
        if q:
            like = f"%{q}%"
            query = query.filter((Supplier.name.ilike(like)) | (Supplier.legal_name.ilike(like)))
        # Order by created_at if column exists, otherwise just return
        try:
            return query.order_by(Supplier.created_at.desc()).limit(500).all()
        except Exception:
            return query.limit(500).all()
    except Exception as e:
        # Log and return empty list if there's any error
        return []


@router.post("/suppliers")
def create_supplier(body: dict, db: Session = Depends(get_db)):
    import traceback
    try:
        print("=" * 80)
        print("CREATE SUPPLIER - START")
        print(f"Received body: {body}")
        
        # Basic validation
        if not body.get('name'):
            raise HTTPException(status_code=400, detail="Name is required")
        
        # Build minimal supplier
        supplier_data = {'name': body.get('name').strip()}
        
        # Add only fields that exist and have values
        for field in ['legal_name', 'email', 'phone', 'website', 'address_line1', 
                      'address_line2', 'city', 'province', 'postal_code', 'country', 
                      'tax_number', 'payment_terms', 'currency', 'lead_time_days', 
                      'category', 'status', 'notes', 'is_active', 'image_base64']:
            val = body.get(field)
            if val is not None:
                # Convert to proper type
                if field == 'lead_time_days' and isinstance(val, str):
                    try:
                        val = int(val)
                    except:
                        val = None
                elif field == 'is_active' and isinstance(val, str):
                    val = val.lower() in ('true', '1', 'yes')
                
                if val != '' and val is not None:
                    supplier_data[field] = val
        
        print(f"Supplier data: {supplier_data}")
        
        # Try to create
        row = Supplier(**supplier_data)
        print(f"Created Supplier object: {row}")
        
        db.add(row)
        print("Added to session")
        
        db.commit()
        print("Committed to database")
        
        db.refresh(row)
        print(f"Refreshed row: {row}")
        
        result = {
            'id': str(row.id),
            'name': row.name,
            'legal_name': row.legal_name,
            'email': row.email,
            'phone': row.phone,
        }
        print(f"Returning: {result}")
        print("=" * 80)
        return result
        
    except Exception as e:
        db.rollback()
        error_msg = str(e)
        tb = traceback.format_exc()
        print("=" * 80)
        print("CREATE SUPPLIER - ERROR")
        print(f"Error: {error_msg}")
        print(f"Traceback:\n{tb}")
        print("=" * 80)
        raise HTTPException(status_code=500, detail=f"Failed to create supplier: {error_msg}")


@router.put("/suppliers/{supplier_id}")
def update_supplier(supplier_id: uuid.UUID, body: dict, db: Session = Depends(get_db)):
    row = db.query(Supplier).filter(Supplier.id == supplier_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Supplier not found")
    
    # Update only provided fields (allow empty strings to clear fields)
    for k, v in body.items():
        if hasattr(row, k):
            # Convert empty strings to None for optional fields, except for 'name' which is required
            if k != 'name' and v == '':
                setattr(row, k, None)
            elif v is not None:
                setattr(row, k, v)
    
    row.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(row)
    return row


@router.delete("/suppliers/{supplier_id}")
def delete_supplier(supplier_id: uuid.UUID, db: Session = Depends(get_db)):
    import traceback
    try:
        print(f"DELETE SUPPLIER - Attempting to delete: {supplier_id}")
        row = db.query(Supplier).filter(Supplier.id == supplier_id).first()
        if not row:
            print(f"Supplier not found: {supplier_id}")
            raise HTTPException(status_code=404, detail="Supplier not found")
        
        print(f"Found supplier: {row.name}")
        
        # Manually delete contacts first to avoid relationship issues
        contacts = db.query(SupplierContact).filter(SupplierContact.supplier_id == supplier_id).all()
        for contact in contacts:
            db.delete(contact)
            print(f"Deleted contact: {contact.id}")
        
        db.delete(row)
        db.commit()
        print("Supplier deleted successfully")
        return {"message": "Supplier deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        error_msg = str(e)
        tb = traceback.format_exc()
        print("=" * 80)
        print("DELETE SUPPLIER - ERROR")
        print(f"Error: {error_msg}")
        print(f"Traceback:\n{tb}")
        print("=" * 80)
        raise HTTPException(status_code=500, detail=f"Failed to delete supplier: {error_msg}")


@router.get("/suppliers/{supplier_id}")
def get_supplier(supplier_id: uuid.UUID, db: Session = Depends(get_db)):
    row = db.query(Supplier).filter(Supplier.id == supplier_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Supplier not found")
    return row


# ---------- SUPPLIER CONTACTS ----------
@router.get("/suppliers/{supplier_id}/contacts", response_model=List[SupplierContactResponse])
def list_contacts(supplier_id: uuid.UUID, db: Session = Depends(get_db), _=Depends(require_permissions("inventory:read"))):
    return db.query(SupplierContact).filter(SupplierContact.supplier_id == supplier_id).all()


@router.post("/contacts", response_model=SupplierContactResponse)
def create_contact(contact: SupplierContactCreate, db: Session = Depends(get_db), _=Depends(require_permissions("inventory:write"))):
    row = SupplierContact(**contact.dict())
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.put("/contacts/{contact_id}", response_model=SupplierContactResponse)
def update_contact(contact_id: uuid.UUID, contact: SupplierContactCreate, db: Session = Depends(get_db), _=Depends(require_permissions("inventory:write"))):
    row = db.query(SupplierContact).filter(SupplierContact.id == contact_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Contact not found")
    row.name = contact.name
    row.email = contact.email
    row.phone = contact.phone
    row.supplier_id = contact.supplier_id
    db.commit()
    db.refresh(row)
    return row


@router.delete("/contacts/{contact_id}")
def delete_contact(contact_id: uuid.UUID, db: Session = Depends(get_db), _=Depends(require_permissions("inventory:write"))):
    row = db.query(SupplierContact).filter(SupplierContact.id == contact_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Contact not found")
    db.delete(row)
    db.commit()
    return {"message": "Contact deleted successfully"}


# ---------- ORDERS ----------
@router.get("/orders", response_model=List[OrderResponse])
def list_orders(db: Session = Depends(get_db), _=Depends(require_permissions("inventory:read"))):
    return db.query(InventoryOrder).all()


@router.post("/orders", response_model=OrderResponse)
def create_order(order: OrderCreate, db: Session = Depends(get_db), _=Depends(require_permissions("inventory:write"))):
    row = InventoryOrder(
        supplier_id=order.supplier_id,
        contact_id=order.contact_id,
        status=order.status or OrderStatus.pending,
    )
    db.add(row)
    db.commit()
    db.refresh(row)

    for item in order.items:
        db.add(InventoryOrderItem(order_id=row.id, product_id=item.product_id, quantity=item.quantity))
    db.commit()
    db.refresh(row)
    return row


@router.put("/orders/{order_id}/status", response_model=OrderResponse)
def update_order_status(order_id: uuid.UUID, status: OrderStatus, db: Session = Depends(get_db), _=Depends(require_permissions("inventory:write"))):
    row = db.query(InventoryOrder).filter(InventoryOrder.id == order_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Order not found")

    row.status = status
    if status == OrderStatus.delivered:
        row.delivered_date = datetime.now(timezone.utc)
        for item in row.items:
            p = db.query(InventoryProduct).filter(InventoryProduct.id == item.product_id).first()
            if p:
                p.stock_quantity = (p.stock_quantity or 0) + item.quantity
    db.commit()
    db.refresh(row)
    return row


@router.put("/orders/{order_id}/email_sent", response_model=OrderResponse)
def set_order_email_sent(order_id: uuid.UUID, db: Session = Depends(get_db), _=Depends(require_permissions("inventory:write"))):
    row = db.query(InventoryOrder).filter(InventoryOrder.id == order_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Order not found")
    row.email_sent = True
    row.email_sent_date = datetime.now(timezone.utc)
    db.commit()
    db.refresh(row)
    return row


@router.post("/orders/{order_id}/send-email", response_model=OrderResponse)
def send_order_email(order_id: uuid.UUID, db: Session = Depends(get_db), _=Depends(require_permissions("inventory:send_email"))):
    row = db.query(InventoryOrder).filter(InventoryOrder.id == order_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Order not found")
    supplier = db.query(Supplier).filter(Supplier.id == row.supplier_id).first()
    contact = db.query(SupplierContact).filter(SupplierContact.id == row.contact_id).first() if row.contact_id else None
    if not supplier:
        raise HTTPException(status_code=400, detail="Supplier missing")
    to_email = (contact.email if contact and contact.email else None) or supplier.email
    if not to_email:
        raise HTTPException(status_code=400, detail="No destination email for supplier/contact")

    # Build email body
    items = db.query(InventoryOrderItem).filter(InventoryOrderItem.order_id == row.id).all()
    lines = [f"Order {row.order_code}", "", f"Supplier: {supplier.name}"]
    if contact:
        lines.append(f"Contact: {contact.name}")
    lines.append("")
    lines.append("Items:")
    for it in items:
        p = db.query(InventoryProduct).filter(InventoryProduct.id == it.product_id).first()
        pname = p.name if p else str(it.product_id)
        lines.append(f"- {pname}: {it.quantity}")
    body = "\n".join(lines)

    # Send via SMTP if configured
    if settings.smtp_host and settings.mail_from:
        msg = EmailMessage()
        msg["Subject"] = f"Purchase Order {row.order_code}"
        msg["From"] = settings.mail_from
        msg["To"] = to_email
        msg.set_content(body)
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port) as s:
            if settings.smtp_tls:
                s.starttls()
            if settings.smtp_username and settings.smtp_password:
                s.login(settings.smtp_username, settings.smtp_password)
            s.send_message(msg)

    row.email_sent = True
    row.email_sent_date = datetime.now(timezone.utc)
    db.commit()
    db.refresh(row)
    return row


