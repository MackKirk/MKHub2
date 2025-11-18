from fastapi import APIRouter, Depends, HTTPException, Body
from sqlalchemy.orm import Session
from typing import Optional, List, Dict
from datetime import datetime, timezone

from ..db import get_db
from ..models.models import (
    User, PermissionCategory, PermissionDefinition
)
from ..auth.security import require_permissions, get_current_user


router = APIRouter(prefix="/permissions", tags=["permissions"])


# =====================
# Permission Definitions Management
# =====================

@router.get("/definitions")
def list_permission_definitions(
    category_id: Optional[str] = None,
    include_inactive: bool = False,
    db: Session = Depends(get_db),
    _=Depends(require_permissions("users:read"))
):
    """List all permission definitions grouped by category"""
    query_categories = db.query(PermissionCategory)
    if not include_inactive:
        query_categories = query_categories.filter(PermissionCategory.is_active == True)
    
    categories = query_categories.order_by(PermissionCategory.sort_index.asc(), PermissionCategory.label.asc()).all()
    
    result = []
    for cat in categories:
        if category_id and str(cat.id) != category_id:
            continue
        
        query_perms = db.query(PermissionDefinition).filter(PermissionDefinition.category_id == cat.id)
        if not include_inactive:
            query_perms = query_perms.filter(PermissionDefinition.is_active == True)
        
        permissions = query_perms.order_by(PermissionDefinition.sort_index.asc(), PermissionDefinition.label.asc()).all()
        
        result.append({
            "id": str(cat.id),
            "name": cat.name,
            "label": cat.label,
            "description": cat.description,
            "sort_index": cat.sort_index,
            "is_active": cat.is_active,
            "permissions": [
                {
                    "id": str(p.id),
                    "key": p.key,
                    "label": p.label,
                    "description": p.description,
                    "sort_index": p.sort_index,
                    "is_active": p.is_active,
                }
                for p in permissions
            ]
        })
    
    return result


@router.get("/definitions/categories")
def list_permission_categories(
    include_inactive: bool = False,
    db: Session = Depends(get_db),
    _=Depends(require_permissions("users:read"))
):
    """List all permission categories"""
    query = db.query(PermissionCategory)
    if not include_inactive:
        query = query.filter(PermissionCategory.is_active == True)
    
    categories = query.order_by(PermissionCategory.sort_index.asc(), PermissionCategory.label.asc()).all()
    
    return [
        {
            "id": str(cat.id),
            "name": cat.name,
            "label": cat.label,
            "description": cat.description,
            "sort_index": cat.sort_index,
            "is_active": cat.is_active,
        }
        for cat in categories
    ]


# =====================
# User Permissions Management
# =====================

@router.get("/users/{user_id}")
def get_user_permissions(
    user_id: str,
    db: Session = Depends(get_db),
    _=Depends(require_permissions("users:read"))
):
    """Get all permissions for a user, showing which are granted"""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Get all permission definitions
    categories = db.query(PermissionCategory).filter(
        PermissionCategory.is_active == True
    ).order_by(PermissionCategory.sort_index.asc()).all()
    
    # Build permission map from roles and overrides
    perm_map = {}
    
    # Get permissions from roles
    for role in user.roles:
        if getattr(role, 'permissions', None):
            try:
                perm_map.update(role.permissions)
            except Exception:
                pass
    
    # Get permissions from user overrides (these take precedence)
    if getattr(user, 'permissions_override', None):
        try:
            perm_map.update(user.permissions_override)
        except Exception:
            pass
    
    # Build result with all permissions and their status
    result = []
    for cat in categories:
        permissions = db.query(PermissionDefinition).filter(
            PermissionDefinition.category_id == cat.id,
            PermissionDefinition.is_active == True
        ).order_by(PermissionDefinition.sort_index.asc()).all()
        
        cat_permissions = []
        for perm in permissions:
            # Check if permission is granted (truthy value in perm_map)
            is_granted = bool(perm_map.get(perm.key, False))
            
            cat_permissions.append({
                "id": str(perm.id),
                "key": perm.key,
                "label": perm.label,
                "description": perm.description,
                "is_granted": is_granted,
            })
        
        if cat_permissions:  # Only include categories with active permissions
            result.append({
                "category": {
                    "id": str(cat.id),
                    "name": cat.name,
                    "label": cat.label,
                    "description": cat.description,
                },
                "permissions": cat_permissions,
            })
    
    return {
        "user_id": str(user.id),
        "username": user.username,
        "permissions_by_category": result,
        "permissions_map": {k: bool(v) for k, v in perm_map.items()},  # Simplified map for reference
    }


@router.put("/users/{user_id}")
def update_user_permissions(
    user_id: str,
    permissions: Dict[str, bool] = Body(...),
    db: Session = Depends(get_db),
    _=Depends(require_permissions("users:write"))
):
    """Update user permissions (overrides)
    
    permissions: dict with permission keys as keys and boolean values
    Example: {"profile:edit_personal": true, "equipment:manage": false}
    """
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Validate that all permission keys exist
    permission_keys = set(permissions.keys())
    existing_perms = db.query(PermissionDefinition).filter(
        PermissionDefinition.key.in_(permission_keys),
        PermissionDefinition.is_active == True
    ).all()
    
    existing_keys = {p.key for p in existing_perms}
    invalid_keys = permission_keys - existing_keys
    
    if invalid_keys:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid permission keys: {', '.join(invalid_keys)}"
        )
    
    # Update user permissions_override
    # Start with existing overrides or empty dict
    current_overrides = user.permissions_override or {}
    
    # Update with new permissions (only include truthy values)
    new_overrides = {k: True for k, v in permissions.items() if v}
    
    # Merge: new overrides take precedence, but keep existing ones that weren't updated
    updated_overrides = {**current_overrides, **new_overrides}
    
    # Remove permissions that were explicitly set to False
    for key in permission_keys:
        if not permissions.get(key, False):
            updated_overrides.pop(key, None)
    
    user.permissions_override = updated_overrides
    db.commit()
    
    return {
        "status": "ok",
        "user_id": str(user.id),
        "permissions": updated_overrides,
    }


@router.get("/users/{user_id}/check")
def check_user_permission(
    user_id: str,
    permission_key: str,
    db: Session = Depends(get_db),
    _=Depends(require_permissions("users:read"))
):
    """Check if a user has a specific permission"""
    from ..auth.security import _has_permission
    
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Build permission map
    perm_map = {}
    
    # Get permissions from roles
    for role in user.roles:
        if getattr(role, 'permissions', None):
            try:
                perm_map.update(role.permissions)
            except Exception:
                pass
    
    # Get permissions from user overrides
    if getattr(user, 'permissions_override', None):
        try:
            perm_map.update(user.permissions_override)
        except Exception:
            pass
    
    has_perm = bool(perm_map.get(permission_key, False))
    
    return {
        "user_id": str(user.id),
        "permission_key": permission_key,
        "has_permission": has_perm,
    }


# =====================
# Admin: Permission Definitions Management
# =====================

@router.post("/definitions/categories")
def create_permission_category(
    payload: dict,
    db: Session = Depends(get_db),
    _=Depends(require_permissions("users:write"))
):
    """Create a new permission category"""
    category = PermissionCategory(
        name=payload.get("name"),
        label=payload.get("label", payload.get("name")),
        description=payload.get("description"),
        sort_index=payload.get("sort_index", 0),
        is_active=payload.get("is_active", True),
    )
    
    db.add(category)
    db.commit()
    db.refresh(category)
    
    return {
        "id": str(category.id),
        "status": "ok",
    }


@router.post("/definitions")
def create_permission_definition(
    payload: dict,
    db: Session = Depends(get_db),
    _=Depends(require_permissions("users:write"))
):
    """Create a new permission definition"""
    category = db.query(PermissionCategory).filter(PermissionCategory.id == payload.get("category_id")).first()
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    
    # Check if key already exists
    existing = db.query(PermissionDefinition).filter(PermissionDefinition.key == payload.get("key")).first()
    if existing:
        raise HTTPException(status_code=400, detail="Permission key already exists")
    
    permission = PermissionDefinition(
        category_id=category.id,
        key=payload.get("key"),
        label=payload.get("label", payload.get("key")),
        description=payload.get("description"),
        sort_index=payload.get("sort_index", 0),
        is_active=payload.get("is_active", True),
    )
    
    db.add(permission)
    db.commit()
    db.refresh(permission)
    
    return {
        "id": str(permission.id),
        "status": "ok",
    }


@router.patch("/definitions/categories/{category_id}")
def update_permission_category(
    category_id: str,
    payload: dict,
    db: Session = Depends(get_db),
    _=Depends(require_permissions("users:write"))
):
    """Update a permission category"""
    category = db.query(PermissionCategory).filter(PermissionCategory.id == category_id).first()
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    
    if "label" in payload:
        category.label = payload["label"]
    if "description" in payload:
        category.description = payload.get("description")
    if "sort_index" in payload:
        category.sort_index = payload["sort_index"]
    if "is_active" in payload:
        category.is_active = payload["is_active"]
    
    db.commit()
    
    return {"status": "ok"}


@router.patch("/definitions/{permission_id}")
def update_permission_definition(
    permission_id: str,
    payload: dict,
    db: Session = Depends(get_db),
    _=Depends(require_permissions("users:write"))
):
    """Update a permission definition"""
    permission = db.query(PermissionDefinition).filter(PermissionDefinition.id == permission_id).first()
    if not permission:
        raise HTTPException(status_code=404, detail="Permission not found")
    
    if "label" in payload:
        permission.label = payload["label"]
    if "description" in payload:
        permission.description = payload.get("description")
    if "sort_index" in payload:
        permission.sort_index = payload["sort_index"]
    if "is_active" in payload:
        permission.is_active = payload["is_active"]
    if "category_id" in payload:
        category = db.query(PermissionCategory).filter(PermissionCategory.id == payload["category_id"]).first()
        if not category:
            raise HTTPException(status_code=404, detail="Category not found")
        permission.category_id = category.id
    
    db.commit()
    
    return {"status": "ok"}

