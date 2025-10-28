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
    material_id: int
    quantity: float
    unit_price: Optional[float] = None
    section: Optional[str] = None


class EstimateIn(BaseModel):
    project_id: uuid.UUID
    markup: Optional[float] = 0.0
    notes: Optional[str] = None
    items: List[EstimateItemIn] = []


@router.get("/estimates")
def list_estimates(project_id: Optional[uuid.UUID] = None, db: Session = Depends(get_db), _=Depends(require_permissions("inventory:read"))):
    q = db.query(Estimate)
    if project_id:
        q = q.filter(Estimate.project_id == project_id)
    return q.order_by(Estimate.created_at.desc()).limit(500).all()


@router.post("/estimates")
def create_estimate(body: EstimateIn, db: Session = Depends(get_db), _=Depends(require_permissions("inventory:write"))):
    est = Estimate(project_id=body.project_id, markup=body.markup or 0.0, created_at=datetime.utcnow())
    db.add(est)
    db.flush()
    total = 0.0
    for it in body.items:
        # default to current material price if unit_price not provided
        price = it.unit_price
        if price is None:
            m = db.query(Material).filter(Material.id == it.material_id).first()
            price = (m.price or 0.0) if m else 0.0
        line_total = (it.quantity or 0.0) * (price or 0.0)
        total += line_total
        db.add(EstimateItem(estimate_id=est.id, material_id=it.material_id, quantity=it.quantity, unit_price=price, total_price=line_total, section=it.section or None))
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
    return {"estimate": est, "items": items}


