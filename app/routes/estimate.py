import json
import uuid
from datetime import datetime
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..auth.security import require_permissions
from ..db import get_db
from ..models.models import Material, RelatedProduct, Estimate, EstimateItem


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
    
    est = Estimate(project_id=body.project_id, markup=body.markup or 0.0, notes=notes_json, created_at=datetime.utcnow())
    db.add(est)
    db.flush()
    total = 0.0
    for it in body.items:
        # default to current material price if unit_price not provided and material_id exists
        price = it.unit_price
        if price is None and it.material_id is not None:
            m = db.query(Material).filter(Material.id == it.material_id).first()
            price = (m.price or 0.0) if m else 0.0
        elif price is None:
            price = 0.0
        line_total = (it.quantity or 0.0) * (price or 0.0)
        total += line_total
        db.add(EstimateItem(
            estimate_id=est.id, 
            material_id=it.material_id,
            quantity=it.quantity, 
            unit_price=price, 
            total_price=line_total, 
            section=it.section or None,
            description=it.description or None,
            item_type=it.item_type or 'product'
        ))
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
    est.notes = json.dumps(ui_state) if ui_state else None
    
    # Delete existing items
    db.query(EstimateItem).filter(EstimateItem.estimate_id == estimate_id).delete()
    
    # Add new items
    total = 0.0
    for it in body.items:
        price = it.unit_price
        if price is None and it.material_id is not None:
            m = db.query(Material).filter(Material.id == it.material_id).first()
            price = (m.price or 0.0) if m else 0.0
        elif price is None:
            price = 0.0
        line_total = (it.quantity or 0.0) * (price or 0.0)
        total += line_total
        db.add(EstimateItem(
            estimate_id=est.id,
            material_id=it.material_id,
            quantity=it.quantity,
            unit_price=price,
            total_price=line_total,
            section=it.section or None,
            description=it.description or None,
            item_type=it.item_type or 'product'
        ))
    est.total_cost = total
    db.commit()
    db.refresh(est)
    return est


@router.get("/estimates/{estimate_id}/generate")
def generate_estimate_pdf(estimate_id: int, db: Session = Depends(get_db), _=Depends(require_permissions("inventory:read"))):
    from fastapi.responses import FileResponse, StreamingResponse
    import tempfile
    import os
    import atexit
    from reportlab.lib.pagesizes import A4
    from reportlab.pdfgen import canvas
    from reportlab.lib import colors
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    from reportlab.lib.units import mm
    
    est = db.query(Estimate).filter(Estimate.id == estimate_id).first()
    if not est:
        raise HTTPException(status_code=404, detail="Estimate not found")
    
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
    
    # Group items by section
    items_by_section = {}
    for item in items_data:
        section = item.section or 'Miscellaneous'
        if section not in items_by_section:
            items_by_section[section] = []
        items_by_section[section].append(item)
    
    # Calculate totals
    total = sum((it.quantity or 0.0) * (it.unit_price or 0.0) for it in items_data)
    pst = total * (pst_rate / 100)
    subtotal = total + pst
    markup_value = subtotal * ((est.markup or 0.0) / 100)
    final_total = subtotal + markup_value
    gst = final_total * (gst_rate / 100)
    grand_total = final_total + gst
    
    # Create temporary file for PDF
    temp_file = tempfile.NamedTemporaryFile(delete=False, suffix='.pdf')
    temp_path = temp_file.name
    temp_file.close()
    
    # Setup fonts
    try:
        fonts_path = os.path.join(os.path.dirname(__file__), '..', 'proposals', 'assets', 'fonts')
        pdfmetrics.registerFont(TTFont("Montserrat", os.path.join(fonts_path, "Montserrat-Regular.ttf")))
        pdfmetrics.registerFont(TTFont("Montserrat-Bold", os.path.join(fonts_path, "Montserrat-Bold.ttf")))
        font_name = "Montserrat"
        font_bold = "Montserrat-Bold"
    except:
        font_name = "Helvetica"
        font_bold = "Helvetica-Bold"
    
    # Create PDF
    c = canvas.Canvas(temp_path, pagesize=A4)
    width, height = A4
    
    # Header
    c.setFont(font_bold, 20)
    c.setFillColor(colors.HexColor("#7f1010"))
    c.drawString(40, height - 50, "ESTIMATE")
    
    # Project info
    c.setFont(font_name, 10)
    c.setFillColor(colors.black)
    c.drawString(40, height - 80, f"Project ID: {str(est.project_id)}")
    c.drawString(40, height - 95, f"Date: {est.created_at.strftime('%Y-%m-%d') if est.created_at else ''}")
    
    y = height - 130
    
    # Sections in order
    ordered_sections = section_order if section_order else sorted(items_by_section.keys())
    
    for section in ordered_sections:
        if section not in items_by_section:
            continue
        
        # Section header
        c.setFont(font_bold, 12)
        c.setFillColor(colors.HexColor("#7f1010"))
        c.drawString(40, y, section.upper())
        y -= 20
        
        # Table headers
        c.setFont(font_bold, 9)
        c.setFillColor(colors.black)
        c.drawString(40, y, "Item")
        c.drawString(200, y, "Qty")
        c.drawString(250, y, "Unit")
        c.drawString(300, y, "Unit Price")
        c.drawString(400, y, "Total")
        y -= 20
        
        c.setStrokeColor(colors.grey)
        c.line(40, y, width - 40, y)
        y -= 15
        
        # Items
        c.setFont(font_name, 9)
        section_total = 0.0
        for item in items_by_section[section]:
            name = item.description or (item.material_id and f"Material #{item.material_id}") or "Item"
            if len(name) > 30:
                name = name[:27] + "..."
            c.drawString(40, y, name)
            c.drawString(200, y, f"{item.quantity:.2f}")
            unit = ""  # Could get from material if needed
            c.drawString(250, y, unit)
            c.drawString(300, y, f"${item.unit_price:.2f}")
            item_total = (item.quantity or 0.0) * (item.unit_price or 0.0)
            section_total += item_total
            c.drawString(400, y, f"${item_total:.2f}")
            y -= 15
            
            if y < 100:
                c.showPage()
                y = height - 50
        
        # Section subtotal
        c.setFont(font_bold, 9)
        c.drawString(350, y, "Section Subtotal:")
        c.drawString(400, y, f"${section_total:.2f}")
        y -= 25
    
    # Summary
    y -= 20
    c.setFont(font_bold, 10)
    c.drawString(40, y, "SUMMARY")
    y -= 20
    
    c.setFont(font_name, 9)
    c.drawString(350, y, "Total Direct Costs:")
    c.drawString(500, y, f"${total:.2f}")
    y -= 15
    
    c.drawString(350, y, f"PST ({pst_rate}%):")
    c.drawString(500, y, f"${pst:.2f}")
    y -= 15
    
    c.drawString(350, y, "Subtotal:")
    c.drawString(500, y, f"${subtotal:.2f}")
    y -= 15
    
    c.drawString(350, y, f"Markup ({est.markup or 0:.0f}%):")
    c.drawString(500, y, f"${markup_value:.2f}")
    y -= 15
    
    c.drawString(350, y, "Total Estimate:")
    c.drawString(500, y, f"${final_total:.2f}")
    y -= 15
    
    c.drawString(350, y, f"GST ({gst_rate}%):")
    c.drawString(500, y, f"${gst:.2f}")
    y -= 20
    
    c.setFont(font_bold, 12)
    c.setFillColor(colors.HexColor("#7f1010"))
    c.drawString(350, y, "GRAND TOTAL:")
    c.drawString(500, y, f"${grand_total:.2f}")
    
    c.save()
    
    # Schedule cleanup
    def cleanup():
        try:
            if os.path.exists(temp_path):
                os.unlink(temp_path)
        except:
            pass
    
    atexit.register(cleanup)
    
    def generate():
        with open(temp_path, 'rb') as f:
            yield from f
        cleanup()
    
    return StreamingResponse(
        generate(),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="estimate-{estimate_id}.pdf"'}
    )


