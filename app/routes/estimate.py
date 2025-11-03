import json
import uuid
from datetime import datetime
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..auth.security import require_permissions
from ..db import get_db
from ..models.models import Material, RelatedProduct, Estimate, EstimateItem, Project


router = APIRouter(prefix="/estimate", tags=["estimate"])


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


@router.get("/products")
def list_products(db: Session = Depends(get_db), _=Depends(require_permissions("inventory:read"))):
    return db.query(Material).all()


@router.get("/products/search")
def search_products(
    q: str = Query(""),
    supplier: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    _=Depends(require_permissions("inventory:read")),
):
    query = db.query(Material)
    if q:
        like = f"%{q}%"
        query = query.filter(Material.name.ilike(like))
    if supplier:
        query = query.filter(Material.supplier_name == supplier)
    if category:
        query = query.filter(Material.category == category)
    return query.order_by(Material.name.asc()).limit(50).all()


@router.post("/products")
def create_product(body: MaterialIn, db: Session = Depends(get_db), _=Depends(require_permissions("inventory:write"))):
    row = Material(
        name=body.name,
        category=body.category,
        supplier_name=body.supplier_name,
        unit=body.unit,
        price=body.price or 0.0,
        description=body.description,
        image_base64=body.image_base64,
        unit_type=body.unit_type,
        units_per_package=body.units_per_package,
        coverage_sqs=body.coverage_sqs,
        coverage_ft2=body.coverage_ft2,
        coverage_m2=body.coverage_m2,
        last_updated=datetime.utcnow(),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.put("/products/{product_id}")
def update_product(product_id: int, body: MaterialIn, db: Session = Depends(get_db), _=Depends(require_permissions("inventory:write"))):
    row = db.query(Material).filter(Material.id == product_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Product not found")
    data = body.dict(exclude_unset=True)
    for k, v in data.items():
        setattr(row, k, v)
    row.last_updated = datetime.utcnow()
    db.commit()
    db.refresh(row)
    return row


@router.delete("/products/{product_id}")
def delete_product(product_id: int, db: Session = Depends(get_db), _=Depends(require_permissions("inventory:write"))):
    import traceback
    try:
        row = db.query(Material).filter(Material.id == product_id).first()
        if not row:
            raise HTTPException(status_code=404, detail="Product not found")
        
        print(f"DELETE PRODUCT - Attempting to delete: {product_id}")
        
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
def related_count(ids: str = Query(...), db: Session = Depends(get_db), _=Depends(require_permissions("inventory:read"))):
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
def list_related(product_id: int, db: Session = Depends(get_db), _=Depends(require_permissions("inventory:read"))):
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
            "unit": p.unit,
            "price": p.price,
            "last_updated": p.last_updated.isoformat() if p.last_updated else None,
        }
        for p in items
    ]


@router.post("/related/{product_id}")
def add_related(product_id: int, body: RelatedIn, db: Session = Depends(get_db), _=Depends(require_permissions("inventory:write"))):
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
def delete_relation(product_a_id: int, product_b_id: int, db: Session = Depends(get_db), _=Depends(require_permissions("inventory:write"))):
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


class EstimateIn(BaseModel):
    project_id: uuid.UUID
    markup: Optional[float] = 0.0
    notes: Optional[str] = None
    pst_rate: Optional[float] = None  # PST rate
    gst_rate: Optional[float] = None  # GST rate
    section_order: Optional[List[str]] = None  # Section order
    items: List[EstimateItemIn] = []


@router.get("/estimates")
def list_estimates(project_id: Optional[uuid.UUID] = None, db: Session = Depends(get_db), _=Depends(require_permissions("inventory:read"))):
    q = db.query(Estimate)
    if project_id:
        q = q.filter(Estimate.project_id == project_id)
    return q.order_by(Estimate.created_at.desc()).limit(500).all()


@router.post("/estimates")
def create_estimate(body: EstimateIn, db: Session = Depends(get_db), _=Depends(require_permissions("inventory:write"))):
    # Store UI state in notes as JSON
    ui_state = {}
    if body.pst_rate is not None:
        ui_state['pst_rate'] = body.pst_rate
    if body.gst_rate is not None:
        ui_state['gst_rate'] = body.gst_rate
    if body.section_order:
        ui_state['section_order'] = body.section_order
    notes_json = json.dumps(ui_state) if ui_state else None
    
    est = Estimate(project_id=body.project_id, markup=body.markup or 0.0, notes=None, created_at=datetime.utcnow())
    db.add(est)
    db.flush()
    
    total = 0.0
    item_extras = {}
    for idx, it in enumerate(body.items):
        # default to current material price if unit_price not provided and material_id exists
        price = it.unit_price
        if price is None and it.material_id is not None:
            m = db.query(Material).filter(Material.id == it.material_id).first()
            price = (m.price or 0.0) if m else 0.0
        elif price is None:
            price = 0.0
        line_total = (it.quantity or 0.0) * (price or 0.0)
        total += line_total
        estimate_item = EstimateItem(
            estimate_id=est.id, 
            material_id=it.material_id,
            quantity=it.quantity, 
            unit_price=price, 
            total_price=line_total, 
            section=it.section or None,
            description=it.description or None,
            item_type=it.item_type or 'product'
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
        if extras:
            item_extras[f'item_{estimate_item.id}'] = extras
    
    # Combine UI state and item extras in notes
    if item_extras:
        ui_state['item_extras'] = item_extras
    notes_json = json.dumps(ui_state) if ui_state else None
    est.notes = notes_json
    
    est.total_cost = total
    db.commit()
    db.refresh(est)
    return est


@router.get("/estimates/{estimate_id}")
def get_estimate(estimate_id: int, db: Session = Depends(get_db), _=Depends(require_permissions("inventory:read"))):
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
            "item_type": item.item_type or 'product'
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
        
        # If material_id exists, get material details
        if item.material_id:
            m = db.query(Material).filter(Material.id == item.material_id).first()
            if m:
                item_dict["name"] = m.name
                item_dict["unit"] = m.unit
                item_dict["supplier_name"] = m.supplier_name
                item_dict["unit_type"] = m.unit_type
                item_dict["units_per_package"] = m.units_per_package
                item_dict["coverage_sqs"] = m.coverage_sqs
                item_dict["coverage_ft2"] = m.coverage_ft2
                item_dict["coverage_m2"] = m.coverage_m2
        items_with_details.append(item_dict)
    
    return {
        "estimate": est,
        "items": items_with_details,
        "pst_rate": ui_state.get("pst_rate"),
        "gst_rate": ui_state.get("gst_rate"),
        "section_order": ui_state.get("section_order")
    }


@router.put("/estimates/{estimate_id}")
def update_estimate(estimate_id: int, body: EstimateIn, db: Session = Depends(get_db), _=Depends(require_permissions("inventory:write"))):
    est = db.query(Estimate).filter(Estimate.id == estimate_id).first()
    if not est:
        raise HTTPException(status_code=404, detail="Estimate not found")
    
    # Update estimate fields
    est.markup = body.markup or 0.0
    # Store UI state in notes as JSON
    ui_state = {}
    if body.pst_rate is not None:
        ui_state['pst_rate'] = body.pst_rate
    if body.gst_rate is not None:
        ui_state['gst_rate'] = body.gst_rate
    if body.section_order:
        ui_state['section_order'] = body.section_order
    
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
    old_items_map = {}
    for old_item in old_items:
        key = f"{old_item.material_id}_{old_item.section}_{old_item.description}"
        old_items_map[key] = old_item
    
    db.query(EstimateItem).filter(EstimateItem.estimate_id == estimate_id).delete()
    
    # Add new items and preserve extras where possible
    total = 0.0
    item_extras = {}
    for it in body.items:
        price = it.unit_price
        if price is None and it.material_id is not None:
            m = db.query(Material).filter(Material.id == it.material_id).first()
            price = (m.price or 0.0) if m else 0.0
        elif price is None:
            price = 0.0
        line_total = (it.quantity or 0.0) * (price or 0.0)
        total += line_total
        estimate_item = EstimateItem(
            estimate_id=est.id,
            material_id=it.material_id,
            quantity=it.quantity,
            unit_price=price,
            total_price=line_total,
            section=it.section or None,
            description=it.description or None,
            item_type=it.item_type or 'product'
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
    db.commit()
    db.refresh(est)
    return est


@router.get("/estimates/{estimate_id}/generate")
async def generate_estimate_pdf(estimate_id: int, db: Session = Depends(get_db), _=Depends(require_permissions("inventory:read"))):
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
    section_order = ui_state.get('section_order', [])
    
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
            "unit": ""
        }
        
        # Get material details if available
        if item.material_id:
            material = db.query(Material).filter(Material.id == item.material_id).first()
            if material:
                item_dict["name"] = material.name
                item_dict["unit"] = material.unit or ""
        
        items_by_section[section].append(item_dict)
    
    # Prepare sections in order
    ordered_sections = section_order if section_order else sorted(items_by_section.keys())
    sections_data = []
    for section_name in ordered_sections:
        if section_name not in items_by_section:
            continue
        sections_data.append({
            "title": section_name,
            "section": section_name,
            "items": items_by_section[section_name]
        })
    
    # Calculate totals
    total = sum((it.quantity or 0.0) * (it.unit_price or 0.0) for it in items_data)
    pst = total * (pst_rate / 100)
    subtotal = total + pst
    markup_value = subtotal * ((est.markup or 0.0) / 100)
    final_total = subtotal + markup_value
    gst = final_total * (gst_rate / 100)
    grand_total = final_total + gst
    
    # Prepare data for PDF generation
    estimate_data = {
        "cover_title": "ESTIMATE",
        "order_number": str(estimate_id),
        "company_name": project_name,
        "company_address": project_address,
        "date": est.created_at.strftime("%Y-%m-%d") if est.created_at else "",
        "sections": sections_data,
        "total": total,
        "pst": pst,
        "pst_rate": pst_rate,
        "subtotal": subtotal,
        "markup": est.markup or 0.0,
        "markup_value": markup_value,
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


