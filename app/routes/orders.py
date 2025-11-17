import uuid
import json
from datetime import datetime
from typing import Optional, List, Dict

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text

from ..auth.security import require_permissions, get_current_user
from ..db import get_db
from ..models.models import (
    ProjectOrder, ProjectOrderItem, Estimate, EstimateItem, 
    Material, Project, Supplier, User, EmployeeProfile, Task
)
from ..schemas.orders import (
    ProjectOrderCreate, ProjectOrderUpdate, ProjectOrderResponse,
    ProjectOrderItemResponse, GenerateOrdersRequest, CreateExtraOrderRequest
)

router = APIRouter(prefix="/orders", tags=["orders"])


def generate_order_code(db: Session, project_id: uuid.UUID, order_type: str, order_number: int) -> str:
    """Generate a unique order code"""
    project = db.query(Project).filter(Project.id == project_id).first()
    project_code = project.code if project and project.code else "PROJ"
    return f"{project_code}-{order_type.upper()}-{order_number:04d}"


@router.get("/projects/{project_id}")
def list_project_orders(
    project_id: uuid.UUID,
    db: Session = Depends(get_db),
    _=Depends(require_permissions("inventory:read"))
):
    """List all orders for a project"""
    orders = db.query(ProjectOrder).filter(
        ProjectOrder.project_id == project_id
    ).order_by(ProjectOrder.created_at.desc()).all()
    
    result = []
    for order in orders:
        order_dict = {
            "id": str(order.id),
            "project_id": str(order.project_id),
            "estimate_id": order.estimate_id,
            "order_type": order.order_type,
            "supplier_id": str(order.supplier_id) if order.supplier_id else None,
            "supplier_email": order.supplier_email,
            "recipient_email": order.recipient_email,
            "recipient_user_id": str(order.recipient_user_id) if order.recipient_user_id else None,
            "status": order.status,
            "order_code": order.order_code,
            "email_subject": order.email_subject,
            "email_body": order.email_body,
            "email_cc": order.email_cc,
            "email_sent": order.email_sent,
            "email_sent_at": order.email_sent_at.isoformat() if order.email_sent_at else None,
            "delivered_at": order.delivered_at.isoformat() if order.delivered_at else None,
            "delivered_by": str(order.delivered_by) if order.delivered_by else None,
            "notes": order.notes,
            "created_at": order.created_at.isoformat(),
            "created_by": str(order.created_by) if order.created_by else None,
            "items": []
        }
        
        # Get supplier info if available
        if order.supplier_id:
            supplier = db.query(Supplier).filter(Supplier.id == order.supplier_id).first()
            if supplier:
                order_dict["supplier_name"] = supplier.name
                if supplier.email and not order.supplier_email:
                    order_dict["supplier_email"] = supplier.email
        
        # Get recipient user info if available
        if order.recipient_user_id:
            user = db.query(User).filter(User.id == order.recipient_user_id).first()
            if user:
                order_dict["recipient_name"] = user.username
                email = user.email_corporate or user.email_personal
                if email and not order.recipient_email:
                    order_dict["recipient_email"] = email
        
        # Get items
        items = db.query(ProjectOrderItem).filter(
            ProjectOrderItem.order_id == order.id
        ).all()
        
        for item in items:
            order_dict["items"].append({
                "id": str(item.id),
                "order_id": str(item.order_id),
                "estimate_item_id": item.estimate_item_id,
                "material_id": item.material_id,
                "item_type": item.item_type,
                "name": item.name,
                "description": item.description,
                "quantity": item.quantity,
                "unit": item.unit,
                "unit_price": item.unit_price,
                "total_price": item.total_price,
                "section": item.section,
                "supplier_name": item.supplier_name,
                "is_ordered": item.is_ordered,
                "created_at": item.created_at.isoformat()
            })
        
        result.append(order_dict)
    
    return result


@router.get("/{order_id}")
def get_order(
    order_id: uuid.UUID,
    db: Session = Depends(get_db),
    _=Depends(require_permissions("inventory:read"))
):
    """Get a single order by ID"""
    order = db.query(ProjectOrder).filter(ProjectOrder.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    # Build response similar to list_project_orders
    order_dict = {
        "id": str(order.id),
        "project_id": str(order.project_id),
        "estimate_id": order.estimate_id,
        "order_type": order.order_type,
        "supplier_id": str(order.supplier_id) if order.supplier_id else None,
        "supplier_email": order.supplier_email,
        "recipient_email": order.recipient_email,
        "recipient_user_id": str(order.recipient_user_id) if order.recipient_user_id else None,
        "status": order.status,
        "order_code": order.order_code,
        "email_subject": order.email_subject,
        "email_body": order.email_body,
        "email_cc": order.email_cc,
        "email_sent": order.email_sent,
        "email_sent_at": order.email_sent_at.isoformat() if order.email_sent_at else None,
        "delivered_at": order.delivered_at.isoformat() if order.delivered_at else None,
        "delivered_by": str(order.delivered_by) if order.delivered_by else None,
        "notes": order.notes,
        "created_at": order.created_at.isoformat(),
        "created_by": str(order.created_by) if order.created_by else None,
        "items": []
    }
    
    # Get supplier info
    if order.supplier_id:
        supplier = db.query(Supplier).filter(Supplier.id == order.supplier_id).first()
        if supplier:
            order_dict["supplier_name"] = supplier.name
            if supplier.email and not order.supplier_email:
                order_dict["supplier_email"] = supplier.email
    
    # Get recipient info
    if order.recipient_user_id:
        user = db.query(User).filter(User.id == order.recipient_user_id).first()
        if user:
            # Get name from EmployeeProfile if available
            ep = db.query(EmployeeProfile).filter(EmployeeProfile.user_id == user.id).first()
            name = None
            if ep:
                name = (ep.preferred_name or '').strip()
                if not name:
                    first = (ep.first_name or '').strip()
                    last = (ep.last_name or '').strip()
                    name = ' '.join([x for x in [first, last] if x]) or None
            order_dict["recipient_name"] = name or user.username
            email = user.email_corporate or user.email_personal
            if email and not order.recipient_email:
                order_dict["recipient_email"] = email
    
    # Get items
    items = db.query(ProjectOrderItem).filter(
        ProjectOrderItem.order_id == order.id
    ).all()
    
    for item in items:
        order_dict["items"].append({
            "id": str(item.id),
            "order_id": str(item.order_id),
            "estimate_item_id": item.estimate_item_id,
            "material_id": item.material_id,
            "item_type": item.item_type,
            "name": item.name,
            "description": item.description,
            "quantity": item.quantity,
            "unit": item.unit,
            "unit_price": item.unit_price,
            "total_price": item.total_price,
            "section": item.section,
            "supplier_name": item.supplier_name,
            "is_ordered": item.is_ordered,
            "created_at": item.created_at.isoformat()
        })
    
    return order_dict


@router.post("/projects/{project_id}/generate")
def generate_orders_from_estimate(
    project_id: uuid.UUID,
    body: GenerateOrdersRequest,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
    _=Depends(require_permissions("inventory:write"))
):
    """Generate orders from an estimate, grouping by supplier/type"""
    # Get estimate
    estimate = db.query(Estimate).filter(
        Estimate.id == body.estimate_id,
        Estimate.project_id == project_id
    ).first()
    
    if not estimate:
        raise HTTPException(status_code=404, detail="Estimate not found")
    
    # Get all estimate items
    estimate_items = db.query(EstimateItem).filter(
        EstimateItem.estimate_id == body.estimate_id
    ).all()
    
    if not estimate_items:
        raise HTTPException(status_code=400, detail="Estimate has no items")
    
    # Group items by type and supplier
    supplier_orders: Dict[str, List[EstimateItem]] = {}  # supplier_id -> items
    shop_misc_items: List[EstimateItem] = []
    subcontractor_orders: Dict[str, List[EstimateItem]] = {}  # supplier_id or 'no_supplier' -> items
    
    # Parse estimate notes to get item extras
    item_extras_map = {}
    if estimate.notes:
        try:
            ui_state = json.loads(estimate.notes)
            item_extras_map = ui_state.get('item_extras', {})
        except:
            pass
    
    # Categorize items
    for item in estimate_items:
        item_type = item.item_type or 'product'
        
        # Skip labour items - they should not be included in orders
        if item_type == 'labour':
            continue
        
        extras = item_extras_map.get(f'item_{item.id}', {})
        supplier_name = extras.get('supplier_name') or (item.description and item.description.split(' - ')[0] if ' - ' in (item.description or '') else None)
        
        # Check if item has a supplier (from material or extras)
        supplier_id = None
        supplier_email = None
        if item.material_id:
            material = db.query(Material).filter(Material.id == item.material_id).first()
            if material and material.supplier_name:
                # Find supplier by name
                supplier = db.query(Supplier).filter(
                    Supplier.name == material.supplier_name,
                    Supplier.is_active == True
                ).first()
                if supplier:
                    supplier_id = supplier.id
                    supplier_email = supplier.email
                    supplier_name = supplier.name
        
        if not supplier_id and supplier_name:
            # Try to find supplier by name
            supplier = db.query(Supplier).filter(
                Supplier.name == supplier_name,
                Supplier.is_active == True
            ).first()
            if supplier:
                supplier_id = supplier.id
                supplier_email = supplier.email
        
        section = item.section or ''
        
        # Categorize
        if item_type == 'subcontractor' or 'Sub-Contractor' in section or 'Sub-Contractors' in section:
            # Sub-contractors
            key = str(supplier_id) if supplier_id else 'no_supplier'
            if key not in subcontractor_orders:
                subcontractor_orders[key] = []
            subcontractor_orders[key].append(item)
        elif item_type in ('shop', 'miscellaneous') or 'Shop' in section or 'Miscellaneous' in section:
            # Shop & Misc
            shop_misc_items.append(item)
        elif supplier_id:
            # Supplier products
            key = str(supplier_id)
            if key not in supplier_orders:
                supplier_orders[key] = []
            supplier_orders[key].append(item)
        else:
            # Items without supplier go to shop/misc
            shop_misc_items.append(item)
    
    # Generate orders
    orders_created = []
    order_number = 1
    
    # 1. Supplier Orders (one per supplier)
    for supplier_id_str, items in supplier_orders.items():
        supplier_id = uuid.UUID(supplier_id_str)
        supplier = db.query(Supplier).filter(Supplier.id == supplier_id).first()
        
        order = ProjectOrder(
            project_id=project_id,
            estimate_id=body.estimate_id,
            order_type='supplier',
            supplier_id=supplier_id,
            supplier_email=supplier.email if supplier else None,
            status='draft',
            order_code=generate_order_code(db, project_id, 'SUP', order_number),
            created_by=user.id,
            created_at=datetime.utcnow()
        )
        db.add(order)
        db.flush()
        
        # Add items
        for item in items:
            extras = item_extras_map.get(f'item_{item.id}', {})
            material = db.query(Material).filter(Material.id == item.material_id).first() if item.material_id else None
            
            # Calculate item total
            if item.item_type == 'labour' and extras.get('labour_journey_type'):
                if extras.get('labour_journey_type') == 'contract':
                    item_total = (extras.get('labour_journey', 0) or 0) * (item.unit_price or 0.0)
                else:
                    item_total = (extras.get('labour_journey', 0) or 0) * (extras.get('labour_men', 0) or 0) * (item.unit_price or 0.0)
            else:
                item_total = (item.quantity or 0.0) * (item.unit_price or 0.0)
            
            order_item = ProjectOrderItem(
                order_id=order.id,
                estimate_item_id=item.id,
                material_id=item.material_id,
                item_type=item.item_type or 'product',
                name=material.name if material else item.description or 'Item',
                description=item.description,
                quantity=item.quantity or 0.0,
                unit=extras.get('unit') or (material.unit if material else None),
                unit_price=item.unit_price or 0.0,
                total_price=item_total,
                section=item.section,
                supplier_name=supplier.name if supplier else None,
                is_ordered=False,
                created_at=datetime.utcnow()
            )
            db.add(order_item)
        
        order_number += 1
        orders_created.append(str(order.id))
    
    # 2. Shop & Misc Order (single order)
    if shop_misc_items:
        order = ProjectOrder(
            project_id=project_id,
            estimate_id=body.estimate_id,
            order_type='shop_misc',
            status='draft',
            order_code=generate_order_code(db, project_id, 'SHOP', order_number),
            created_by=user.id,
            created_at=datetime.utcnow()
        )
        db.add(order)
        db.flush()
        
        for item in shop_misc_items:
            extras = item_extras_map.get(f'item_{item.id}', {})
            material = db.query(Material).filter(Material.id == item.material_id).first() if item.material_id else None
            
            if item.item_type == 'labour' and extras.get('labour_journey_type'):
                if extras.get('labour_journey_type') == 'contract':
                    item_total = (extras.get('labour_journey', 0) or 0) * (item.unit_price or 0.0)
                else:
                    item_total = (extras.get('labour_journey', 0) or 0) * (extras.get('labour_men', 0) or 0) * (item.unit_price or 0.0)
            else:
                item_total = (item.quantity or 0.0) * (item.unit_price or 0.0)
            
            order_item = ProjectOrderItem(
                order_id=order.id,
                estimate_item_id=item.id,
                material_id=item.material_id,
                item_type=item.item_type or 'miscellaneous',
                name=material.name if material else item.description or 'Item',
                description=item.description,
                quantity=item.quantity or 0.0,
                unit=extras.get('unit') or (material.unit if material else None),
                unit_price=item.unit_price or 0.0,
                total_price=item_total,
                section=item.section,
                supplier_name=None,
                is_ordered=False,
                created_at=datetime.utcnow()
            )
            db.add(order_item)
        
        order_number += 1
        orders_created.append(str(order.id))
    
    # 3. Sub-contractor Orders (grouped by supplier when possible)
    for supplier_key, items in subcontractor_orders.items():
        supplier_id = None
        supplier_email = None
        supplier = None
        
        if supplier_key != 'no_supplier':
            supplier_id = uuid.UUID(supplier_key)
            supplier = db.query(Supplier).filter(Supplier.id == supplier_id).first()
            if supplier:
                supplier_email = supplier.email
        
        order = ProjectOrder(
            project_id=project_id,
            estimate_id=body.estimate_id,
            order_type='subcontractor',
            supplier_id=supplier_id,
            supplier_email=supplier_email,
            status='draft',
            order_code=generate_order_code(db, project_id, 'SUB', order_number),
            created_by=user.id,
            created_at=datetime.utcnow()
        )
        db.add(order)
        db.flush()
        
        for item in items:
            extras = item_extras_map.get(f'item_{item.id}', {})
            material = db.query(Material).filter(Material.id == item.material_id).first() if item.material_id else None
            
            if item.item_type == 'labour' and extras.get('labour_journey_type'):
                if extras.get('labour_journey_type') == 'contract':
                    item_total = (extras.get('labour_journey', 0) or 0) * (item.unit_price or 0.0)
                else:
                    item_total = (extras.get('labour_journey', 0) or 0) * (extras.get('labour_men', 0) or 0) * (item.unit_price or 0.0)
            else:
                item_total = (item.quantity or 0.0) * (item.unit_price or 0.0)
            
            order_item = ProjectOrderItem(
                order_id=order.id,
                estimate_item_id=item.id,
                material_id=item.material_id,
                item_type=item.item_type or 'subcontractor',
                name=material.name if material else item.description or 'Item',
                description=item.description,
                quantity=item.quantity or 0.0,
                unit=extras.get('unit') or (material.unit if material else None),
                unit_price=item.unit_price or 0.0,
                total_price=item_total,
                section=item.section,
                supplier_name=supplier.name if supplier else None,
                is_ordered=False,
                created_at=datetime.utcnow()
            )
            db.add(order_item)
        
        order_number += 1
        orders_created.append(str(order.id))
    
    db.commit()
    
    return {
        "status": "ok",
        "orders_created": len(orders_created),
        "order_ids": orders_created
    }


@router.patch("/{order_id}")
def update_order(
    order_id: uuid.UUID,
    body: ProjectOrderUpdate,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
    _=Depends(require_permissions("inventory:write"))
):
    """Update an order"""
    order = db.query(ProjectOrder).filter(ProjectOrder.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    # Update fields
    if body.status is not None:
        old_status = order.status
        order.status = body.status
        
        # Handle status transitions
        if body.status == 'awaiting_delivery' and old_status == 'draft':
            # Mark email as sent
            if not order.email_sent:
                order.email_sent = True
                order.email_sent_at = datetime.utcnow()
            
            # Mark estimate items as ordered
            items = db.query(ProjectOrderItem).filter(
                ProjectOrderItem.order_id == order_id
            ).all()
            for item in items:
                item.is_ordered = True
                if item.estimate_item_id:
                    estimate_item = db.query(EstimateItem).filter(
                        EstimateItem.id == item.estimate_item_id
                    ).first()
                    if estimate_item:
                        # Could mark estimate item as ordered if needed
                        pass
        
        elif body.status == 'delivered' and order.status != 'delivered':
            order.delivered_at = datetime.utcnow()
            order.delivered_by = user.id
            
            # Mark related task as done if exists
            if order.order_type == 'shop_misc':
                try:
                    task = db.query(Task).filter(
                        Task.origin_id == order.id,
                        Task.category == 'order'
                    ).first()
                    if task and task.status not in ['done', 'completed']:
                        task.status = 'done'
                        task.completed_at = datetime.utcnow()
                        task.updated_at = datetime.utcnow()
                        # TODO: Trigger notification event (prepared but not active)
                        # notify_task_status_changed(task, task.status, 'done')
                except Exception as e:
                    # Don't fail order update if task update fails
                    print(f"Failed to update task for order {order.id}: {e}")
    
    if body.recipient_email is not None:
        order.recipient_email = body.recipient_email
    if body.recipient_user_id is not None:
        order.recipient_user_id = body.recipient_user_id
    if body.email_subject is not None:
        order.email_subject = body.email_subject
    if body.email_body is not None:
        order.email_body = body.email_body
    if body.email_cc is not None:
        order.email_cc = body.email_cc
    if body.notes is not None:
        order.notes = body.notes
    
    order.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(order)
    
    return get_order(order_id, db)


@router.post("/projects/{project_id}/extra")
def create_extra_order(
    project_id: uuid.UUID,
    body: CreateExtraOrderRequest,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
    _=Depends(require_permissions("inventory:write"))
):
    """Create an extra order manually (not from estimate)"""
    # Validate project exists
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Validate items
    if not body.items or len(body.items) == 0:
        raise HTTPException(status_code=400, detail="Order must have at least one item")
    
    # Get the next order number for this project and order type
    order_type_prefix = {'supplier': 'SUP', 'shop_misc': 'SHOP', 'subcontractor': 'SUB'}.get(body.order_type, 'ORD')
    existing_orders_same_type = db.query(ProjectOrder).filter(
        ProjectOrder.project_id == project_id,
        ProjectOrder.order_type == body.order_type
    ).all()
    order_number = len(existing_orders_same_type) + 1
    
    # Get supplier info if supplier order
    supplier_email = None
    supplier_name = None
    if body.order_type == 'supplier':
        if body.supplier_id:
            supplier = db.query(Supplier).filter(Supplier.id == body.supplier_id).first()
            if supplier:
                supplier_email = supplier.email
                supplier_name = supplier.name
        elif body.supplier_name:
            # Custom supplier
            supplier_name = body.supplier_name
            supplier_email = body.supplier_email
    
    # Create order
    order = ProjectOrder(
        project_id=project_id,
        estimate_id=None,  # Extra orders are not linked to estimates
        order_type=body.order_type,
        supplier_id=body.supplier_id,
        supplier_email=supplier_email,
        recipient_email=body.recipient_email,
        recipient_user_id=body.recipient_user_id,
        status='draft',
        order_code=generate_order_code(db, project_id, order_type_prefix, order_number),
        created_by=user.id,
        created_at=datetime.utcnow()
    )
    db.add(order)
    db.flush()
    
    # Add items
    for item_data in body.items:
        # Calculate total if not provided
        total_price = item_data.total_price if hasattr(item_data, 'total_price') and item_data.total_price else (
            (item_data.quantity or 0.0) * (item_data.unit_price or 0.0)
        )
        
        order_item = ProjectOrderItem(
            order_id=order.id,
            estimate_item_id=None,  # Extra orders are not linked to estimate items
            material_id=item_data.material_id,
            item_type=item_data.item_type or 'product',
            name=item_data.name,
            description=item_data.description,
            quantity=item_data.quantity,
            unit=item_data.unit,
            unit_price=item_data.unit_price,
            total_price=total_price,
            section=item_data.section,
            supplier_name=item_data.supplier_name,
            is_ordered=False,
            created_at=datetime.utcnow()
        )
        db.add(order_item)
    
    db.commit()
    db.refresh(order)
    
    # Create task automatically for internal orders (shop_misc) with assigned user
    if body.order_type == 'shop_misc' and body.recipient_user_id:
        try:
            task = Task(
                title=f"Internal order {order.order_code}",
                description=f"Process internal order {order.order_code} for project",
                task_type="order",
                status="todo",
                priority="normal",
                category="order",
                project_id=project_id,
                assigned_to=body.recipient_user_id,
                origin_source=f"Order #{order.order_code}",
                origin_id=order.id,
                created_by=user.id,
            )
            db.add(task)
            db.commit()
            # TODO: Trigger notification event (prepared but not active)
            # notify_task_created(task)
        except Exception as e:
            # Don't fail order creation if task creation fails
            print(f"Failed to create task for order {order.id}: {e}")
            db.rollback()
            # Re-commit the order
            db.add(order)
            db.commit()
            db.refresh(order)
    
    return get_order(order.id, db)


@router.delete("/projects/{project_id}/all")
def delete_all_project_orders(
    project_id: uuid.UUID,
    db: Session = Depends(get_db),
    _=Depends(require_permissions("inventory:write"))
):
    """Delete all orders for a project (for testing purposes)"""
    # Get all orders for the project
    orders = db.query(ProjectOrder).filter(ProjectOrder.project_id == project_id).all()
    
    if not orders:
        return {"status": "ok", "deleted": 0}
    
    # Delete all items first
    order_ids = [order.id for order in orders]
    db.query(ProjectOrderItem).filter(ProjectOrderItem.order_id.in_(order_ids)).delete(synchronize_session=False)
    
    # Delete all orders
    deleted_count = db.query(ProjectOrder).filter(ProjectOrder.project_id == project_id).delete()
    db.commit()
    
    return {"status": "ok", "deleted": deleted_count}


@router.delete("/{order_id}")
def delete_order(
    order_id: uuid.UUID,
    db: Session = Depends(get_db),
    _=Depends(require_permissions("inventory:write"))
):
    """Delete an order"""
    order = db.query(ProjectOrder).filter(ProjectOrder.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    # Delete items first (cascade should handle this, but being explicit)
    db.query(ProjectOrderItem).filter(ProjectOrderItem.order_id == order_id).delete()
    db.delete(order)
    db.commit()
    
    return {"status": "ok"}

