import json
import uuid
from datetime import datetime
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session, defer
from sqlalchemy.orm.attributes import flag_modified
from sqlalchemy.exc import ProgrammingError
from sqlalchemy import func, or_

from ..auth.security import require_permissions, get_current_user, assert_product_tab, User
from ..db import get_db
from ..models.models import Material, RelatedProduct, Estimate, EstimateItem, Project, Client


router = APIRouter(prefix="/estimate", tags=["estimate"])

_LABOURISH_SECTIONS = {"Labour", "Sub-Contractors", "Shop", "Miscellaneous"}


def _is_product_section(section: Optional[str]) -> bool:
    s = section or ""
    if s in _LABOURISH_SECTIONS:
        return False
    if (
        s.startswith("Labour Section")
        or s.startswith("Sub-Contractor Section")
        or s.startswith("Shop Section")
        or s.startswith("Miscellaneous Section")
    ):
        return False
    return True


def _section_display_name(section: str, section_names: Optional[dict]) -> str:
    names = section_names or {}
    if section in names and names[section]:
        return str(names[section])
    if section.startswith("Product Section"):
        return "Product Section"
    return section or "Products"


def _sync_project_crew_material_list_from_estimate_body(
    project_id,
    body: "EstimateIn",
    db: Session,
) -> None:
    """Replace project Material List with product lines from the Costs estimate."""
    if not project_id:
        return
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        return

    section_names = body.section_names if isinstance(getattr(body, "section_names", None), dict) else {}
    previous = project.crew_material_list if isinstance(project.crew_material_list, list) else []
    previous_by_ref = {
        str(row.get("source_ref")): row
        for row in previous
        if isinstance(row, dict) and row.get("source") == "estimate" and row.get("source_ref")
    }

    seen = set()
    rows = []
    for it in body.items or []:
        section = it.section or ""
        if not _is_product_section(section):
            continue
        if (it.item_type or "product") != "product":
            continue

        name = str(it.name or it.description or "").strip()
        if not name and it.material_id is not None:
            material = db.query(Material).filter(Material.id == it.material_id).first()
            if material:
                name = str(material.name or "").strip()
        if not name:
            continue

        key = f"m:{it.material_id}" if it.material_id is not None else f"n:{name.lower()}"
        source_ref = f"{section}|{key}"
        if source_ref in seen:
            continue
        seen.add(source_ref)

        prev = previous_by_ref.get(source_ref) or {}
        qty_value = it.qty_required if it.qty_required is not None else it.quantity
        quantity = None
        if qty_value is not None:
            try:
                quantity = str(qty_value)
            except Exception:
                quantity = None
        if not quantity and prev.get("quantity") is not None:
            quantity = str(prev.get("quantity"))

        unit = str(it.unit_required or it.unit or prev.get("unit") or "").strip() or None
        default_notes = _section_display_name(section, section_names)
        prev_notes = str(prev.get("notes") or "").strip()
        notes = prev_notes or default_notes or None

        try:
            row_id = str(uuid.UUID(str(prev["id"]))) if prev.get("id") else str(uuid.uuid4())
        except (ValueError, TypeError, AttributeError):
            row_id = str(uuid.uuid4())

        rows.append(
            {
                "id": row_id,
                "name": name,
                "quantity": quantity,
                "unit": unit,
                "notes": notes,
                "source": "estimate",
                "source_ref": source_ref,
            }
        )

    project.crew_material_list = rows if rows else None
    flag_modified(project, "crew_material_list")


# ===================== Products (Materials) =====================

class MaterialIn(BaseModel):
    name: str
    category: Optional[str] = None
    supplier_name: Optional[str] = None
    unit: Optional[str] = None
    price: Optional[float] = 0.0
    description: Optional[str] = None
    image_base64: Optional[str] = None
    unit_type: Optional[str] = None
    units_per_package: Optional[float] = None
    coverage_sqs: Optional[float] = None
    coverage_ft2: Optional[float] = None
    coverage_m2: Optional[float] = None
    technical_manual_url: Optional[str] = None


@router.get("/products")
def list_products(db: Session = Depends(get_db), _=Depends(require_permissions("inventory:products:read"))):
    return db.query(Material).all()


@router.get("/products/search")
def search_products(
    q: str = Query(""),
    supplier: Optional[str] = Query(None),
    supplier_not: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    category_not: Optional[str] = Query(None),
    price_min: Optional[float] = Query(None),
    price_max: Optional[float] = Query(None),
    unit_type: Optional[str] = Query(None),
    unit_type_not: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    _=Depends(require_permissions("inventory:products:read")),
):
    query = db.query(Material)
    if q:
        like = f"%{q}%"
        query = query.filter(
            or_(
                Material.name.ilike(like),
                Material.supplier_name.ilike(like),
                Material.category.ilike(like)
            )
        )
    if supplier:
        query = query.filter(Material.supplier_name == supplier)
    
    # Filter by supplier (exclusion)
    if supplier_not:
        query = query.filter(Material.supplier_name != supplier_not)
    
    if category:
        query = query.filter(Material.category == category)
    
    # Filter by category (exclusion)
    if category_not:
        query = query.filter(Material.category != category_not)
    
    if price_min is not None:
        query = query.filter(Material.price >= price_min)
    if price_max is not None:
        query = query.filter(Material.price <= price_max)
    if unit_type:
        query = query.filter(Material.unit_type == unit_type)
    
    # Filter by unit_type (exclusion)
    if unit_type_not:
        query = query.filter(Material.unit_type != unit_type_not)
    
    return query.order_by(Material.name.asc()).limit(50).all()


@router.post("/products")
def create_product(body: MaterialIn, db: Session = Depends(get_db), _=Depends(require_permissions("inventory:products:write"))):
    # Enforce required supplier and uniqueness (name + supplier), case-insensitive
    name = (body.name or "").strip()
    supplier_name = (body.supplier_name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name is required")
    if not supplier_name:
        raise HTTPException(status_code=400, detail="Supplier is required")

    existing = (
        db.query(Material)
        .filter(Material.supplier_name.isnot(None))
        .filter(func.lower(Material.name) == name.lower())
        .filter(func.lower(Material.supplier_name) == supplier_name.lower())
        .first()
    )
    if existing:
        raise HTTPException(status_code=400, detail="A product with this name already exists for this supplier")

    row = Material(
        name=name,
        category=body.category,
        supplier_name=supplier_name,
        unit=body.unit,
        price=body.price or 0.0,
        description=body.description,
        image_base64=body.image_base64,
        unit_type=body.unit_type,
        units_per_package=body.units_per_package,
        coverage_sqs=body.coverage_sqs,
        coverage_ft2=body.coverage_ft2,
        coverage_m2=body.coverage_m2,
        technical_manual_url=body.technical_manual_url,
        last_updated=datetime.utcnow(),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.put("/products/{product_id}")
def update_product(
    product_id: int,
    body: MaterialIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    assert_product_tab(user, "details", "write")
    row = db.query(Material).filter(Material.id == product_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Product not found")
    data = body.dict(exclude_unset=True)

    next_name = (data.get("name") if "name" in data else row.name) or ""
    next_name = str(next_name).strip()
    next_supplier = (
        data.get("supplier_name") if "supplier_name" in data else row.supplier_name
    ) or ""
    next_supplier = str(next_supplier).strip()
    if not next_name:
        raise HTTPException(status_code=400, detail="Name is required")
    if not next_supplier:
        raise HTTPException(status_code=400, detail="Supplier is required")

    existing = (
        db.query(Material)
        .filter(Material.id != product_id)
        .filter(Material.supplier_name.isnot(None))
        .filter(func.lower(Material.name) == next_name.lower())
        .filter(func.lower(Material.supplier_name) == next_supplier.lower())
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=400,
            detail="A product with this name already exists for this supplier",
        )

    if "name" in data:
        data["name"] = next_name
    if "supplier_name" in data:
        data["supplier_name"] = next_supplier

    for k, v in data.items():
        setattr(row, k, v)
    row.last_updated = datetime.utcnow()
    db.commit()
    db.refresh(row)
    return row


@router.get("/products/{product_id}/usage")
def get_product_usage(
    product_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    assert_product_tab(user, "usage", "read")
    """Get list of projects/estimates where this product is being used"""
    from ..models.models import Project, Client
    
    # Get all estimate items that use this product
    estimate_items = db.query(EstimateItem).filter(EstimateItem.material_id == product_id).all()
    
    result = []
    seen_estimates = set()
    
    for item in estimate_items:
        # Skip if we've already processed this estimate
        if item.estimate_id in seen_estimates:
            continue
        seen_estimates.add(item.estimate_id)
        
        # Get the estimate
        estimate = db.query(Estimate).filter(Estimate.id == item.estimate_id).first()
        if not estimate:
            # Orphaned item - estimate doesn't exist
            result.append({
                "estimate_id": item.estimate_id,
                "project_id": None,
                "project_name": None,
                "client_name": None,
                "status": "orphaned",
                "created_at": None
            })
            continue
        
        # Get project information
        project_name = None
        client_name = None
        project_deleted = False
        
        if estimate.project_id:
            project = db.query(Project).filter(Project.id == estimate.project_id).first()
            if project:
                project_name = project.name
                # Get client information
                if project.client_id:
                    try:
                        client = db.query(Client).filter(Client.id == project.client_id).first()
                    except ProgrammingError as e:
                        error_msg = str(e.orig) if hasattr(e, 'orig') else str(e)
                        if 'is_system' in error_msg and 'does not exist' in error_msg:
                            db.rollback()
                            client = db.query(Client).options(defer(Client.is_system)).filter(Client.id == project.client_id).first()
                        else:
                            raise
                    if client:
                        client_name = client.display_name or client.name
            else:
                # Project was deleted but estimate still exists
                project_deleted = True
                project_name = f"Project {str(estimate.project_id)[:8]}... (deleted)"
        
        result.append({
            "estimate_id": estimate.id,
            "project_id": str(estimate.project_id) if estimate.project_id else None,
            "project_name": project_name,
            "client_name": client_name,
            "status": "active" if not project_deleted else "project_deleted",
            "project_deleted": project_deleted,
            "created_at": estimate.created_at.isoformat() if estimate.created_at else None
        })
    
    return result


@router.delete("/products/{product_id}")
def delete_product(product_id: int, db: Session = Depends(get_db), _=Depends(require_permissions("inventory:products:write"))):
    import traceback
    try:
        row = db.query(Material).filter(Material.id == product_id).first()
        if not row:
            raise HTTPException(status_code=404, detail="Product not found")
        
        print(f"DELETE PRODUCT - Attempting to delete: {product_id}")
        
        # Check if product is being used in estimate items
        estimate_items = db.query(EstimateItem).filter(EstimateItem.material_id == product_id).all()
        
        if estimate_items:
            # Check which items are orphaned (estimate doesn't exist) vs active
            orphaned_items = []
            active_items = []
            
            for item in estimate_items:
                # Check if the estimate still exists
                estimate_exists = db.query(Estimate).filter(Estimate.id == item.estimate_id).first() is not None
                if not estimate_exists:
                    orphaned_items.append(item)
                else:
                    active_items.append(item)
            
            # Delete orphaned items automatically
            if orphaned_items:
                print(f"Found {len(orphaned_items)} orphaned estimate items, deleting them...")
                for item in orphaned_items:
                    db.delete(item)
                db.commit()
                print(f"Deleted {len(orphaned_items)} orphaned estimate items")
            
            # If there are still active items, prevent deletion
            if active_items:
                raise HTTPException(
                    status_code=400, 
                    detail=f"Cannot delete product: it is being used in {len(active_items)} estimate item(s) in active estimates. Please remove it from all estimates first."
                )
        
        # Delete all relationships before deleting the product
        relations = db.query(RelatedProduct).filter(
            (RelatedProduct.product_a_id == product_id) | (RelatedProduct.product_b_id == product_id)
        ).all()
        
        print(f"Found {len(relations)} relations to delete")
        for rel in relations:
            db.delete(rel)
            print(f"Deleted relation: {rel.id}")
        
        # Commit the relation deletions
        db.commit()
        
        # Now delete the product
        db.delete(row)
        db.commit()
        
        print("Product deleted successfully")
        return {"status": "ok"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        error_msg = str(e)
        tb = traceback.format_exc()
        print("=" * 80)
        print("DELETE PRODUCT - ERROR")
        print(f"Error: {error_msg}")
        print(f"Traceback:\n{tb}")
        print("=" * 80)
        raise HTTPException(status_code=500, detail=f"Failed to delete product: {error_msg}")


# Related products
class RelatedIn(BaseModel):
    related_id: int


@router.get("/related/count")
def related_count(
    ids: str = Query(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    assert_product_tab(user, "related", "read")
    id_list = [int(x) for x in ids.split(",") if x.strip().isdigit()]
    if not id_list:
        return {}
    links = db.query(RelatedProduct).filter(
        (RelatedProduct.product_a_id.in_(id_list)) | (RelatedProduct.product_b_id.in_(id_list))
    ).all()
    counts = {pid: 0 for pid in id_list}
    for r in links:
        if r.product_a_id in counts:
            counts[r.product_a_id] += 1
        if r.product_b_id in counts:
            counts[r.product_b_id] += 1
    return counts


@router.get("/related/{product_id}")
def list_related(
    product_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    assert_product_tab(user, "related", "read")
    links = db.query(RelatedProduct).filter(
        (RelatedProduct.product_a_id == product_id) | (RelatedProduct.product_b_id == product_id)
    ).all()
    related_ids = set()
    for r in links:
        related_ids.add(r.product_b_id if r.product_a_id == product_id else r.product_a_id)
    if not related_ids:
        return []
    items = db.query(Material).filter(Material.id.in_(list(related_ids))).all()
    return [
        {
            "id": p.id,
            "name": p.name,
            "supplier_name": p.supplier_name,
            "category": p.category,
            "unit": p.unit,
            "price": p.price,
            "last_updated": p.last_updated.isoformat() if p.last_updated else None,
            "unit_type": p.unit_type,
            "units_per_package": p.units_per_package,
            "coverage_sqs": p.coverage_sqs,
            "coverage_ft2": p.coverage_ft2,
            "coverage_m2": p.coverage_m2,
            "image_base64": p.image_base64,
        }
        for p in items
    ]


@router.post("/related/{product_id}")
def add_related(
    product_id: int,
    body: RelatedIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    assert_product_tab(user, "related", "write")
    if product_id == body.related_id:
        raise HTTPException(status_code=400, detail="Cannot relate a product to itself")
    a, b = (product_id, body.related_id) if product_id < body.related_id else (body.related_id, product_id)
    exists = db.query(RelatedProduct).filter(RelatedProduct.product_a_id == a, RelatedProduct.product_b_id == b).first()
    if exists:
        return {"status": "ok"}
    db.add(RelatedProduct(product_a_id=a, product_b_id=b))
    db.commit()
    return {"status": "ok"}


@router.delete("/related/{product_a_id}/{product_b_id}")
def delete_relation(
    product_a_id: int,
    product_b_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    assert_product_tab(user, "related", "write")
    rel1 = db.query(RelatedProduct).filter(RelatedProduct.product_a_id == product_a_id, RelatedProduct.product_b_id == product_b_id).first()
    if rel1:
        db.delete(rel1)
    rel2 = db.query(RelatedProduct).filter(RelatedProduct.product_a_id == product_b_id, RelatedProduct.product_b_id == product_a_id).first()
    if rel2:
        db.delete(rel2)
    db.commit()
    return {"status": "ok"}


# ===================== Estimates =====================

class EstimateItemIn(BaseModel):
    material_id: Optional[int] = None  # Optional for manual entries
    quantity: float
    unit_price: Optional[float] = None
    section: Optional[str] = None
    description: Optional[str] = None  # For manual entries
    item_type: Optional[str] = None  # 'product', 'labour', 'subcontractor', 'shop'
    name: Optional[str] = None  # Product name for display
    unit: Optional[str] = None  # Unit for display
    markup: Optional[float] = None  # Item-specific markup
    taxable: Optional[bool] = True
    qty_required: Optional[float] = None
    unit_required: Optional[str] = None
    supplier_name: Optional[str] = None
    unit_type: Optional[str] = None
    units_per_package: Optional[float] = None
    coverage_sqs: Optional[float] = None
    coverage_ft2: Optional[float] = None
    coverage_m2: Optional[float] = None
    labour_journey: Optional[float] = None
    labour_men: Optional[int] = None
    labour_journey_type: Optional[str] = None  # 'days', 'hours', 'contract'
    labour_days: Optional[float] = None  # Original days (time-based display)
    labour_hours_per_day: Optional[float] = None  # Hours/day (time-based display)
    labour_price_unit: Optional[str] = None  # 'day' | 'hour'
    product_image: Optional[str] = None
    pst: Optional[bool] = None
    gst: Optional[bool] = None


class EstimateIn(BaseModel):
    project_id: uuid.UUID
    markup: Optional[float] = 0.0
    notes: Optional[str] = None
    pst_rate: Optional[float] = None  # PST rate (legacy / fallback)
    gst_rate: Optional[float] = None  # GST rate (legacy / fallback)
    profit_rate: Optional[float] = None  # Profit rate
    section_order: Optional[List[str]] = None  # Section order
    section_names: Optional[dict] = None  # Section display names
    section_tax_rates: Optional[dict] = None  # Per-section { pstRate, gstRate }
    items: List[EstimateItemIn] = []


@router.get("/estimates")
def list_estimates(project_id: Optional[uuid.UUID] = None, db: Session = Depends(get_db), _=Depends(require_permissions("business:projects:costs:read", "inventory:read"))):
    from ..models.models import Project, Client
    q = db.query(Estimate)
    if project_id:
        q = q.filter(Estimate.project_id == project_id)
    estimates = q.order_by(Estimate.created_at.desc()).limit(500).all()
    
    # Enrich with project and client information
    result = []
    for est in estimates:
        est_dict = {
            "id": est.id,
            "project_id": str(est.project_id) if est.project_id else None,
            "total_cost": est.total_cost,
            "markup": est.markup,
            "created_at": est.created_at.isoformat() if est.created_at else None,
            "project_name": None,
            "client_name": None,
            "grand_total": None
        }
        
        # Get project information
        if est.project_id:
            project = db.query(Project).filter(Project.id == est.project_id).first()
            if project:
                est_dict["project_name"] = project.name
                # Get client information
                if project.client_id:
                    try:
                        client = db.query(Client).filter(Client.id == project.client_id).first()
                    except ProgrammingError as e:
                        error_msg = str(e.orig) if hasattr(e, 'orig') else str(e)
                        if 'is_system' in error_msg and 'does not exist' in error_msg:
                            db.rollback()
                            client = db.query(Client).options(defer(Client.is_system)).filter(Client.id == project.client_id).first()
                        else:
                            raise
                    if client:
                        est_dict["client_name"] = client.display_name or client.name
        
        # Calculate grand total from notes if available
        if est.notes:
            try:
                import json
                ui_state = json.loads(est.notes)
                # Get rates from UI state
                pst_rate = ui_state.get('pst_rate', 7.0)
                gst_rate = ui_state.get('gst_rate', 5.0)
                profit_rate = ui_state.get('profit_rate', 0.0)
                
                # Get items to calculate taxable total
                items = db.query(EstimateItem).filter(EstimateItem.estimate_id == est.id).all()
                item_extras_map = ui_state.get('item_extras', {})
                
                # Calculate total and taxable total
                total = 0.0
                taxable_total = 0.0
                for item in items:
                    # Calculate item total based on item type
                    if item.item_type == 'labour' and item_extras_map.get(f'item_{item.id}', {}).get('labour_journey_type'):
                        extras = item_extras_map.get(f'item_{item.id}', {})
                        if extras.get('labour_journey_type') == 'contract':
                            item_total = (extras.get('labour_journey', 0) or 0) * (item.unit_price or 0.0)
                        else:
                            item_total = (extras.get('labour_journey', 0) or 0) * (extras.get('labour_men', 0) or 0) * (item.unit_price or 0.0)
                    else:
                        item_total = (item.quantity or 0.0) * (item.unit_price or 0.0)
                    
                    total += item_total
                    # PST only applies to taxable items
                    if item_extras_map.get(f'item_{item.id}', {}).get('taxable', True) is not False:
                        taxable_total += item_total
                
                # Calculate PST, subtotal, profit, total estimate, GST, grand total (no markup)
                pst = taxable_total * (pst_rate / 100)
                subtotal = total + pst
                profit_value = subtotal * (profit_rate / 100)
                final_total = subtotal + profit_value
                gst = final_total * (gst_rate / 100)
                grand_total = final_total + gst
                
                est_dict["grand_total"] = grand_total
            except Exception as e:
                # If calculation fails, use total_cost as fallback
                est_dict["grand_total"] = est.total_cost
        
        result.append(est_dict)
    
    return result


def _update_estimate_internal(estimate_id: int, body: EstimateIn, db: Session):
    """Internal function to update an estimate - can be called from create_estimate or update_estimate route"""
    est = db.query(Estimate).filter(Estimate.id == estimate_id).first()
    if not est:
        raise HTTPException(status_code=404, detail="Estimate not found")
    
    # Update estimate fields
    est.markup = body.markup or 0.0
    
    # Get existing UI state to preserve existing values if not provided
    existing_ui_state = {}
    if est.notes:
        try:
            existing_ui_state = json.loads(est.notes)
        except:
            pass
    
    # Store UI state in notes as JSON
    ui_state = {}
    # Always save rates - they're part of the estimate configuration
    # Check if values were provided (not None) - 0 is a valid value
    # If not provided, preserve existing value if available
    if body.pst_rate is not None:
        ui_state['pst_rate'] = body.pst_rate
    elif 'pst_rate' in existing_ui_state:
        ui_state['pst_rate'] = existing_ui_state['pst_rate']
    
    if body.gst_rate is not None:
        ui_state['gst_rate'] = body.gst_rate
    elif 'gst_rate' in existing_ui_state:
        ui_state['gst_rate'] = existing_ui_state['gst_rate']
    
    if body.profit_rate is not None:
        ui_state['profit_rate'] = body.profit_rate
    elif 'profit_rate' in existing_ui_state:
        ui_state['profit_rate'] = existing_ui_state['profit_rate']
    
    if body.section_order:
        ui_state['section_order'] = body.section_order
    elif 'section_order' in existing_ui_state:
        ui_state['section_order'] = existing_ui_state['section_order']
    
    if body.section_names:
        ui_state['section_names'] = body.section_names
    elif 'section_names' in existing_ui_state:
        ui_state['section_names'] = existing_ui_state['section_names']

    if body.section_tax_rates is not None:
        ui_state['section_tax_rates'] = body.section_tax_rates
    elif 'section_tax_rates' in existing_ui_state:
        ui_state['section_tax_rates'] = existing_ui_state['section_tax_rates']
    
    # Delete existing items (but first get old extras to preserve if items match)
    old_items = db.query(EstimateItem).filter(EstimateItem.estimate_id == estimate_id).all()
    old_extras_map = {}
    if est.notes:
        try:
            old_ui_state = json.loads(est.notes)
            old_extras_map = old_ui_state.get('item_extras', {})
        except:
            pass
    
    # Map old items by material_id + section + description for matching
    # Also preserve report tracking fields
    old_items_map = {}
    old_items_report_tracking = {}  # Map item_id -> (added_via_report_id, added_via_report_date)
    for old_item in old_items:
        key = f"{old_item.material_id}_{old_item.section}_{old_item.description}"
        old_items_map[key] = old_item
        # Preserve report tracking fields
        if getattr(old_item, 'added_via_report_id', None):
            old_items_report_tracking[old_item.id] = (
                old_item.added_via_report_id,
                getattr(old_item, 'added_via_report_date', None)
            )
    
    db.query(EstimateItem).filter(EstimateItem.estimate_id == estimate_id).delete()
    
    # Add new items and preserve extras where possible
    total = 0.0
    item_extras = {}
    for it in body.items:
        price = it.unit_price
        # Get material to capture snapshot data
        material = None
        if it.material_id is not None:
            material = db.query(Material).filter(Material.id == it.material_id).first()
            if price is None and material:
                price = (material.price or 0.0)
        elif price is None:
            price = 0.0
        line_total = (it.quantity or 0.0) * (price or 0.0)
        total += line_total
        
        # Try to preserve report tracking from old item
        added_via_report_id = None
        added_via_report_date = None
        key = f"{it.material_id}_{it.section or ''}_{it.description or ''}"
        if key in old_items_map:
            old_item_id = old_items_map[key].id
            if old_item_id in old_items_report_tracking:
                added_via_report_id, added_via_report_date = old_items_report_tracking[old_item_id]
        
        # Capture product snapshot data when adding product to estimate
        # This preserves product data even if product is later updated in catalog
        product_name_snapshot = None
        product_unit_snapshot = None
        product_supplier_name_snapshot = None
        product_price_snapshot = None
        # Save snapshot for products (item_type is 'product' or None/default)
        if material and (it.item_type == 'product' or it.item_type is None):
            product_name_snapshot = material.name
            product_unit_snapshot = material.unit
            product_supplier_name_snapshot = material.supplier_name
            product_price_snapshot = material.price
        
        estimate_item = EstimateItem(
            estimate_id=est.id,
            material_id=it.material_id,
            quantity=it.quantity,
            unit_price=price,
            total_price=line_total,
            section=it.section or None,
            description=it.description or None,
            item_type=it.item_type or 'product',
            added_via_report_id=added_via_report_id,
            added_via_report_date=added_via_report_date,
            product_name_snapshot=product_name_snapshot,
            product_unit_snapshot=product_unit_snapshot,
            product_supplier_name_snapshot=product_supplier_name_snapshot,
            product_price_snapshot=product_price_snapshot
        )
        db.add(estimate_item)
        db.flush()  # Flush to get the ID
        
        # Store extras using item ID
        extras = {}
        # First try to get from new values
        if it.qty_required is not None:
            extras['qty_required'] = it.qty_required
        if it.unit_required:
            extras['unit_required'] = it.unit_required
        if it.markup is not None:
            extras['markup'] = it.markup
        if it.taxable is not None:
            extras['taxable'] = it.taxable
        if it.pst is not None:
            extras['pst'] = it.pst
        if it.gst is not None:
            extras['gst'] = it.gst
        # Store labour fields
        if it.labour_journey is not None:
            extras['labour_journey'] = it.labour_journey
        if it.labour_men is not None:
            extras['labour_men'] = it.labour_men
        if it.labour_journey_type:
            extras['labour_journey_type'] = it.labour_journey_type
        if it.labour_days is not None:
            extras['labour_days'] = it.labour_days
        if it.labour_hours_per_day is not None:
            extras['labour_hours_per_day'] = it.labour_hours_per_day
        if it.labour_price_unit:
            extras['labour_price_unit'] = it.labour_price_unit
        # Store unit for subcontractor, shop, and miscellaneous items (for composition display)
        if it.unit:
            extras['unit'] = it.unit
        if it.product_image:
            extras['product_image'] = it.product_image
        
        # If no new values, try to preserve from old item
        if not extras:
            key = f"{it.material_id}_{it.section or ''}_{it.description or ''}"
            if key in old_items_map:
                old_item_id = old_items_map[key].id
                old_key = f'item_{old_item_id}'
                if old_key in old_extras_map:
                    extras = old_extras_map[old_key].copy()
        
        if extras:
            item_extras[f'item_{estimate_item.id}'] = extras
    
    # Combine UI state and item extras in notes
    if item_extras:
        ui_state['item_extras'] = item_extras
    est.notes = json.dumps(ui_state) if ui_state else None
    
    est.total_cost = total
    _sync_project_crew_material_list_from_estimate_body(est.project_id, body, db)
    db.commit()
    db.refresh(est)
    return est


@router.post("/estimates")
def create_estimate(body: EstimateIn, db: Session = Depends(get_db), _=Depends(require_permissions("business:projects:costs:write", "inventory:write")), user=Depends(get_current_user)):
    # Check if estimate already exists for this project
    existing_est = db.query(Estimate).filter(Estimate.project_id == body.project_id).first()
    
    if existing_est:
        # If estimate exists, update it instead of creating a new one
        est = _update_estimate_internal(existing_est.id, body, db)
        
        # Create audit log for estimate update
        try:
            from ..services.audit import create_audit_log
            create_audit_log(
                db=db,
                entity_type="estimate",
                entity_id=str(est.id),
                action="UPDATE",
                actor_id=str(user.id) if user else None,
                actor_role="user",
                source="api",
                changes_json={
                    "items_count": len(body.items),
                    "total_cost": est.total_cost,
                    "markup": est.markup,
                },
                context={
                    "project_id": str(body.project_id),
                }
            )
        except Exception:
            pass
        
        return est
    
    # Store UI state in notes as JSON
    ui_state = {}
    # Always save rates - they're part of the estimate configuration
    # Check if values were provided (not None) - 0 is a valid value
    if body.pst_rate is not None:
        ui_state['pst_rate'] = body.pst_rate
    if body.gst_rate is not None:
        ui_state['gst_rate'] = body.gst_rate
    if body.profit_rate is not None:
        ui_state['profit_rate'] = body.profit_rate
    if body.section_order:
        ui_state['section_order'] = body.section_order
    notes_json = json.dumps(ui_state) if ui_state else None
    
    est = Estimate(project_id=body.project_id, markup=body.markup or 0.0, notes=notes_json, created_at=datetime.utcnow())
    db.add(est)
    db.flush()
    
    total = 0.0
    item_extras = {}
    for idx, it in enumerate(body.items):
        # default to current material price if unit_price not provided and material_id exists
        price = it.unit_price
        # Get material to capture snapshot data
        material = None
        if it.material_id is not None:
            material = db.query(Material).filter(Material.id == it.material_id).first()
            if price is None and material:
                price = (material.price or 0.0)
        elif price is None:
            price = 0.0
        line_total = (it.quantity or 0.0) * (price or 0.0)
        total += line_total
        
        # Capture product snapshot data when adding product to estimate
        # This preserves product data even if product is later updated in catalog
        product_name_snapshot = None
        product_unit_snapshot = None
        product_supplier_name_snapshot = None
        product_price_snapshot = None
        if material and (it.item_type == 'product' or it.item_type is None):
            product_name_snapshot = material.name
            product_unit_snapshot = material.unit
            product_supplier_name_snapshot = material.supplier_name
            product_price_snapshot = material.price
        
        estimate_item = EstimateItem(
            estimate_id=est.id, 
            material_id=it.material_id,
            quantity=it.quantity, 
            unit_price=price, 
            total_price=line_total, 
            section=it.section or None,
            description=it.description or None,
            item_type=it.item_type or 'product',
            product_name_snapshot=product_name_snapshot,
            product_unit_snapshot=product_unit_snapshot,
            product_supplier_name_snapshot=product_supplier_name_snapshot,
            product_price_snapshot=product_price_snapshot
        )
        db.add(estimate_item)
        db.flush()  # Flush to get the ID
        
        # Store extras using item ID
        extras = {}
        if it.qty_required is not None:
            extras['qty_required'] = it.qty_required
        if it.unit_required:
            extras['unit_required'] = it.unit_required
        if it.markup is not None:
            extras['markup'] = it.markup
        if it.taxable is not None:
            extras['taxable'] = it.taxable
        if it.pst is not None:
            extras['pst'] = it.pst
        if it.gst is not None:
            extras['gst'] = it.gst
        # Store labour fields
        if it.labour_journey is not None:
            extras['labour_journey'] = it.labour_journey
        if it.labour_men is not None:
            extras['labour_men'] = it.labour_men
        if it.labour_journey_type:
            extras['labour_journey_type'] = it.labour_journey_type
        if it.labour_days is not None:
            extras['labour_days'] = it.labour_days
        if it.labour_hours_per_day is not None:
            extras['labour_hours_per_day'] = it.labour_hours_per_day
        if it.labour_price_unit:
            extras['labour_price_unit'] = it.labour_price_unit
        # Store unit for subcontractor, shop, and miscellaneous items (for composition display)
        if it.unit:
            extras['unit'] = it.unit
        if it.product_image:
            extras['product_image'] = it.product_image
        if extras:
            item_extras[f'item_{estimate_item.id}'] = extras
    
    # Combine UI state and item extras in notes
    # Make sure ui_state is recreated to preserve the initial values
    if not ui_state:
        ui_state = {}
        if body.pst_rate is not None:
            ui_state['pst_rate'] = body.pst_rate
        if body.gst_rate is not None:
            ui_state['gst_rate'] = body.gst_rate
        if body.profit_rate is not None:
            ui_state['profit_rate'] = body.profit_rate
        if body.section_order:
            ui_state['section_order'] = body.section_order
    if item_extras:
        ui_state['item_extras'] = item_extras
    notes_json = json.dumps(ui_state) if ui_state else None
    est.notes = notes_json
    
    est.total_cost = total
    _sync_project_crew_material_list_from_estimate_body(body.project_id, body, db)
    db.commit()
    db.refresh(est)
    
    # Create audit log for estimate creation
    try:
        from ..services.audit import create_audit_log
        create_audit_log(
            db=db,
            entity_type="estimate",
            entity_id=str(est.id),
            action="CREATE",
            actor_id=str(user.id) if user else None,
            actor_role="user",
            source="api",
            changes_json={
                "items_count": len(body.items),
                "total_cost": total,
                "markup": body.markup or 0.0,
            },
            context={
                "project_id": str(body.project_id),
            }
        )
    except Exception:
        pass
    
    return est


@router.get("/estimates/{estimate_id}")
def get_estimate(estimate_id: int, db: Session = Depends(get_db), _=Depends(require_permissions("business:projects:costs:read", "inventory:read"))):
    est = db.query(Estimate).filter(Estimate.id == estimate_id).first()
    if not est:
        raise HTTPException(status_code=404, detail="Estimate not found")
    items = db.query(EstimateItem).filter(EstimateItem.estimate_id == estimate_id).all()
    
    # Parse UI state from notes
    ui_state = {}
    if est.notes:
        try:
            ui_state = json.loads(est.notes)
        except:
            pass
    
    # Get item extras from notes
    item_extras_map = ui_state.get('item_extras', {})
    
    # Get material details for items with material_id
    items_with_details = []
    for item in items:
        item_dict = {
            "id": item.id,
            "material_id": item.material_id,
            "quantity": item.quantity,
            "unit_price": item.unit_price,
            "total_price": item.total_price,
            "section": item.section,
            "description": item.description,
            "item_type": item.item_type or 'product',
            "added_via_report_id": str(item.added_via_report_id) if getattr(item, 'added_via_report_id', None) else None,
            "added_via_report_date": item.added_via_report_date.isoformat() if getattr(item, 'added_via_report_date', None) else None,
        }
        
        # Get extras for this item (by item ID)
        item_key = f'item_{item.id}'
        if item_key in item_extras_map:
            extras = item_extras_map[item_key]
            if 'qty_required' in extras:
                item_dict["qty_required"] = extras['qty_required']
            if 'unit_required' in extras:
                item_dict["unit_required"] = extras['unit_required']
            if 'markup' in extras:
                item_dict["markup"] = extras['markup']
            if 'taxable' in extras:
                item_dict["taxable"] = extras['taxable']
            if 'pst' in extras:
                item_dict["pst"] = extras['pst']
            if 'gst' in extras:
                item_dict["gst"] = extras['gst']
            if 'labour_journey' in extras:
                item_dict["labour_journey"] = extras['labour_journey']
            if 'labour_men' in extras:
                item_dict["labour_men"] = extras['labour_men']
            if 'labour_journey_type' in extras:
                item_dict["labour_journey_type"] = extras['labour_journey_type']
            if 'labour_days' in extras:
                item_dict["labour_days"] = extras['labour_days']
            if 'labour_hours_per_day' in extras:
                item_dict["labour_hours_per_day"] = extras['labour_hours_per_day']
            if 'labour_price_unit' in extras:
                item_dict["labour_price_unit"] = extras['labour_price_unit']
            # Get unit from extras for subcontractor, shop, and miscellaneous items
            if 'unit' in extras:
                item_dict["unit"] = extras['unit']
            if 'product_image' in extras:
                item_dict["product_image"] = extras['product_image']
        
        # If material_id exists, get material details
        # Use snapshot data if available (preserves product data at time of addition)
        # Otherwise fall back to current material data (for backward compatibility)
        if item.material_id:
            # Prefer snapshot data if available (preserves original product data)
            if hasattr(item, 'product_name_snapshot') and item.product_name_snapshot:
                item_dict["name"] = item.product_name_snapshot
                # Only set unit from snapshot if not already set from extras
                if 'unit' not in item_dict:
                    item_dict["unit"] = item.product_unit_snapshot
                item_dict["supplier_name"] = item.product_supplier_name_snapshot
                # For other fields (unit_type, coverage, etc.), still use current material data
                # as these are less likely to change and may be needed for calculations
                m = db.query(Material).filter(Material.id == item.material_id).first()
                if m:
                    item_dict["unit_type"] = m.unit_type
                    item_dict["units_per_package"] = m.units_per_package
                    item_dict["coverage_sqs"] = m.coverage_sqs
                    item_dict["coverage_ft2"] = m.coverage_ft2
                    item_dict["coverage_m2"] = m.coverage_m2
            else:
                # Fall back to current material data (for backward compatibility with old estimates)
                m = db.query(Material).filter(Material.id == item.material_id).first()
                if m:
                    item_dict["name"] = m.name
                    # Only set unit from material if not already set from extras (for non-product items)
                    if 'unit' not in item_dict:
                        item_dict["unit"] = m.unit
                    item_dict["supplier_name"] = m.supplier_name
                    item_dict["unit_type"] = m.unit_type
                    item_dict["units_per_package"] = m.units_per_package
                    item_dict["coverage_sqs"] = m.coverage_sqs
                    item_dict["coverage_ft2"] = m.coverage_ft2
                    item_dict["coverage_m2"] = m.coverage_m2
        items_with_details.append(item_dict)
    
    # Return rates with defaults if not saved
    # If values were not saved before (old estimates), use defaults
    pst_rate = ui_state.get("pst_rate")
    gst_rate = ui_state.get("gst_rate")
    profit_rate = ui_state.get("profit_rate")
    
    # Only return None if explicitly saved as None (not in ui_state means not saved yet)
    # If key doesn't exist in ui_state, it means it was never saved, so return None to use frontend defaults
    return {
        "estimate": est,
        "items": items_with_details,
        "pst_rate": pst_rate if "pst_rate" in ui_state else None,
        "gst_rate": gst_rate if "gst_rate" in ui_state else None,
        "profit_rate": profit_rate if "profit_rate" in ui_state else None,
        "section_order": ui_state.get("section_order"),
        "section_names": ui_state.get("section_names"),
        "section_tax_rates": ui_state.get("section_tax_rates"),
    }


@router.put("/estimates/{estimate_id}")
def update_estimate(estimate_id: int, body: EstimateIn, db: Session = Depends(get_db), _=Depends(require_permissions("business:projects:costs:write", "inventory:write"))):
    return _update_estimate_internal(estimate_id, body, db)


@router.delete("/estimates/{estimate_id}")
def delete_estimate(estimate_id: int, db: Session = Depends(get_db), _=Depends(require_permissions("business:projects:costs:write", "inventory:write")), user=Depends(get_current_user)):
    est = db.query(Estimate).filter(Estimate.id == estimate_id).first()
    if not est:
        raise HTTPException(status_code=404, detail="Estimate not found")
    
    # Capture estimate info before deletion for audit log
    estimate_info = {
        "project_id": str(est.project_id) if est.project_id else None,
        "total_cost": est.total_cost,
        "markup": est.markup,
    }
    items_count = db.query(EstimateItem).filter(EstimateItem.estimate_id == estimate_id).count()
    
    # Delete estimate items first (due to foreign key constraint)
    db.query(EstimateItem).filter(EstimateItem.estimate_id == estimate_id).delete()
    
    # Delete estimate
    db.delete(est)
    db.commit()
    
    # Create audit log for estimate deletion
    try:
        from ..services.audit import create_audit_log
        create_audit_log(
            db=db,
            entity_type="estimate",
            entity_id=str(estimate_id),
            action="DELETE",
            actor_id=str(user.id) if user else None,
            actor_role="user",
            source="api",
            changes_json={
                "deleted_estimate": estimate_info,
                "items_deleted": items_count,
            },
            context={
                "project_id": estimate_info.get("project_id"),
            }
        )
    except Exception:
        pass
    
    return {"status": "ok"}


@router.get("/estimates/{estimate_id}/generate")
async def generate_estimate_pdf(estimate_id: int, db: Session = Depends(get_db), _=Depends(require_permissions("business:projects:costs:read", "inventory:read"))):
    from fastapi.responses import FileResponse
    import tempfile
    import os
    import uuid
    from ..proposals.pdf_estimate import generate_estimate_pdf as generate_pdf
    
    est = db.query(Estimate).filter(Estimate.id == estimate_id).first()
    if not est:
        raise HTTPException(status_code=404, detail="Estimate not found")
    
    # Get project info
    project = db.query(Project).filter(Project.id == est.project_id).first()
    project_name = project.name if project else str(est.project_id)
    project_address = ""
    if project:
        address_parts = []
        if project.address_city:
            address_parts.append(project.address_city)
        if project.address_province:
            address_parts.append(project.address_province)
        if project.address_country:
            address_parts.append(project.address_country)
        project_address = ", ".join(address_parts)
    
    items_data = db.query(EstimateItem).filter(EstimateItem.estimate_id == estimate_id).all()
    
    # Parse UI state from notes
    ui_state = {}
    if est.notes:
        try:
            ui_state = json.loads(est.notes)
        except:
            pass
    
    pst_rate = ui_state.get('pst_rate', 7.0)
    gst_rate = ui_state.get('gst_rate', 5.0)
    profit_rate = ui_state.get('profit_rate', 0.0)
    section_order = ui_state.get('section_order', [])
    section_names = ui_state.get('section_names', {})
    section_tax_rates = ui_state.get('section_tax_rates', {})
    global_markup = ui_state.get('markup', est.markup or 0.0)
    
    # Get item extras from notes to include labour_journey, labour_men, labour_journey_type
    item_extras_map = ui_state.get('item_extras', {})
    
    # Group items by section and get material details
    items_by_section = {}
    for item in items_data:
        section = item.section or 'Miscellaneous'
        if section not in items_by_section:
            items_by_section[section] = []
        
        item_dict = {
            "material_id": item.material_id,
            "quantity": item.quantity or 0.0,
            "unit_price": item.unit_price or 0.0,
            "description": item.description,
            "name": item.description,
            "unit": "",
            "item_type": item.item_type or 'product'
        }
        
        # Get item extras (labour_journey, labour_men, labour_journey_type, qty_required, unit_required, markup, taxable, supplier_name, unit, etc.)
        item_key = f'item_{item.id}'
        if item_key in item_extras_map:
            extras = item_extras_map[item_key]
            if 'labour_journey' in extras:
                item_dict["labour_journey"] = extras['labour_journey']
            if 'labour_men' in extras:
                item_dict["labour_men"] = extras['labour_men']
            if 'labour_journey_type' in extras:
                item_dict["labour_journey_type"] = extras['labour_journey_type']
            if 'labour_days' in extras:
                item_dict["labour_days"] = extras['labour_days']
            if 'labour_hours_per_day' in extras:
                item_dict["labour_hours_per_day"] = extras['labour_hours_per_day']
            if 'labour_price_unit' in extras:
                item_dict["labour_price_unit"] = extras['labour_price_unit']
            if 'qty_required' in extras:
                item_dict["qty_required"] = extras['qty_required']
            if 'unit_required' in extras:
                item_dict["unit_required"] = extras['unit_required']
            if 'markup' in extras:
                item_dict["markup"] = extras['markup']
            if 'taxable' in extras:
                item_dict["taxable"] = extras['taxable']
            if 'pst' in extras:
                item_dict["pst"] = extras['pst']
            if 'gst' in extras:
                item_dict["gst"] = extras['gst']
            # Get unit from extras for subcontractor, shop, and miscellaneous items
            if 'unit' in extras:
                item_dict["unit"] = extras['unit']
            if 'product_image' in extras:
                item_dict["product_image"] = extras['product_image']
        
        # Get material details if available
        # Use snapshot data if available (preserves product data at time of addition)
        # Otherwise fall back to current material data (for backward compatibility)
        if item.material_id:
            # Prefer snapshot data if available (preserves original product data)
            if hasattr(item, 'product_name_snapshot') and item.product_name_snapshot:
                item_dict["name"] = item.product_name_snapshot
                # Only set unit from snapshot if not already set from extras
                if 'unit' not in item_dict or not item_dict.get("unit"):
                    item_dict["unit"] = item.product_unit_snapshot or ""
                if 'supplier_name' not in item_dict:
                    item_dict["supplier_name"] = item.product_supplier_name_snapshot or ""
            else:
                # Fall back to current material data (for backward compatibility with old estimates)
                material = db.query(Material).filter(Material.id == item.material_id).first()
                if material:
                    item_dict["name"] = material.name
                    # Only set unit from material if not already set from extras (for non-product items)
                    if 'unit' not in item_dict or not item_dict.get("unit"):
                        item_dict["unit"] = material.unit or ""
                    if 'supplier_name' not in item_dict:
                        item_dict["supplier_name"] = material.supplier_name or ""
        
        items_by_section[section].append(item_dict)
    
    # Helper function to get display name for section
    def get_section_display_name(section: str) -> str:
        if section in section_names:
            return section_names[section]
        elif section.startswith('Labour Section'):
            return 'Labour'
        elif section.startswith('Sub-Contractor Section'):
            return 'Sub-Contractor'
        elif section.startswith('Miscellaneous Section'):
            return 'Miscellaneous'
        elif section.startswith('Shop Section'):
            return 'Shop'
        elif section.startswith('Product Section'):
            return 'Product Section'
        else:
            return section
    
    # Prepare sections in order
    ordered_sections = section_order if section_order else sorted(items_by_section.keys())
    sections_data = []
    for section_name in ordered_sections:
        if section_name not in items_by_section:
            continue
        # Use display name for section title
        display_name = get_section_display_name(section_name)
        sections_data.append({
            "title": display_name,
            "section": section_name,
            "items": items_by_section[section_name]
        })
    
    # Calculate totals (quote-style: PST/GST per section on checked lines)
    total = 0.0
    total_with_markup = 0.0

    def get_section_rates(section_name: str) -> dict:
        if section_name in section_tax_rates:
            rates = section_tax_rates[section_name]
            return {
                'pst_rate': rates.get('pstRate', pst_rate),
                'gst_rate': rates.get('gstRate', gst_rate),
            }
        return {'pst_rate': pst_rate, 'gst_rate': gst_rate}

    def item_base_total(item_row, extras, item_type, section_name):
        is_product_section = not (
            section_name in ['Labour', 'Sub-Contractors', 'Shop', 'Miscellaneous']
            or section_name.startswith('Labour Section')
            or section_name.startswith('Sub-Contractor Section')
            or section_name.startswith('Shop Section')
            or section_name.startswith('Miscellaneous Section')
        )
        if item_type == 'product' or is_product_section:
            return (item_row.quantity or 0.0) * (item_row.unit_price or 0.0)
        if item_type == 'labour' and extras.get('labour_journey_type'):
            if extras['labour_journey_type'] == 'contract':
                return (extras.get('labour_journey', 0) or 0) * (item_row.unit_price or 0.0)
            return (extras.get('labour_journey', 0) or 0) * (extras.get('labour_men', 0) or 0) * (item_row.unit_price or 0.0)
        return (item_row.quantity or 0.0) * (item_row.unit_price or 0.0)

    pst = 0.0
    gst = 0.0
    for item in items_data:
        item_key = f'item_{item.id}'
        extras = item_extras_map.get(item_key, {})
        item_type = item.item_type or 'product'
        section_name = item.section or 'Miscellaneous'
        line_total = item_base_total(item, extras, item_type, section_name)

        total += line_total
        total_with_markup += line_total

        rates = get_section_rates(section_name)
        pst_flag = extras.get('pst')
        gst_flag = extras.get('gst')
        if pst_flag is None and extras.get('taxable', True):
            pst_flag = True
        if pst_flag:
            pst += line_total * (rates['pst_rate'] / 100)
        if gst_flag:
            gst += line_total * (rates['gst_rate'] / 100)

    # Markup is no longer applied to line totals (legacy field kept on payload at 0)
    markup_value = 0.0
    
    # Subtotal = direct costs + PST
    subtotal = total_with_markup + pst
    
    # Profit is calculated on subtotal
    profit_value = subtotal * (profit_rate / 100)
    
    # Final total = subtotal + profit
    final_total = subtotal + profit_value
    
    # Grand total = final total + GST (line-based, not on final total)
    grand_total = final_total + gst
    
    # Prepare data for PDF generation
    # Note: "total" is used for "Total Direct Costs" in PDF
    estimate_data = {
        "cover_title": f"ESTIMATE - {project_name}",
        "order_number": str(estimate_id),
        "company_name": project_name,
        "company_address": project_address,
        "project_name": project_name,
        "date": est.created_at.strftime("%Y-%m-%d") if est.created_at else "",
        "sections": sections_data,
        "total": total_with_markup,
        "pst": pst,
        "pst_rate": pst_rate,
        "subtotal": subtotal,
        "markup": global_markup,
        "markup_value": markup_value,
        "profit_rate": profit_rate,
        "profit_value": profit_value,
        "final_total": final_total,
        "gst": gst,
        "gst_rate": gst_rate,
        "grand_total": grand_total,
        "cover_image": None,
        "page2_image": None
    }
    
    # Create temporary output file
    file_id = str(uuid.uuid4())
    output_path = os.path.join(tempfile.gettempdir(), f"estimate_{file_id}.pdf")
    
    await generate_pdf(estimate_data, output_path)
    
    return FileResponse(
        output_path,
        media_type="application/pdf",
        filename=f"estimate-{estimate_id}.pdf"
    )


