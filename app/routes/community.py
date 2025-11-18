import uuid
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import cast, String

from ..db import get_db
from ..models.models import CommunityPost, User, EmployeeProfile
from ..auth.security import get_current_user

router = APIRouter(prefix="/community", tags=["community"])


@router.get("/posts")
def list_posts(
    filter: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """
    List community posts with optional filtering.
    filter: 'all', 'unread', 'required', 'announcements'
    """
    query = db.query(CommunityPost).order_by(CommunityPost.created_at.desc())
    
    # Filter logic
    if filter == 'unread':
        # For now, mark posts older than user's last login as read
        # This is a simple implementation - could be enhanced with read tracking
        if current_user.last_login_at:
            query = query.filter(CommunityPost.created_at > current_user.last_login_at)
    elif filter == 'required':
        query = query.filter(CommunityPost.is_required == True)
    elif filter == 'announcements':
        # Filter posts that have 'Announcement' in tags JSON array
        # Simple string search in JSON array - PostgreSQL stores JSON as text in some cases
        query = query.filter(cast(CommunityPost.tags, String).like('%Announcement%'))
    
    posts = query.all()
    
    # Format response with author information
    result = []
    for post in posts:
        author = db.query(User).filter(User.id == post.author_id).first()
        author_profile = db.query(EmployeeProfile).filter(EmployeeProfile.user_id == post.author_id).first() if author else None
        
        author_name = None
        author_avatar = None
        
        if author_profile:
            author_name = author_profile.preferred_name or f"{author_profile.first_name or ''} {author_profile.last_name or ''}".strip()
            if author_profile.profile_photo_file_id:
                author_avatar = f"/files/{author_profile.profile_photo_file_id}/thumbnail?w=96"
        
        if not author_name and author:
            author_name = author.username
        
        # Determine if post is unread (simplified: newer than user's last login)
        is_unread = False
        if current_user.last_login_at and post.created_at:
            is_unread = post.created_at > current_user.last_login_at
        
        result.append({
            "id": str(post.id),
            "title": post.title,
            "content": post.content,
            "author_id": str(post.author_id),
            "author_name": author_name,
            "author_avatar": author_avatar,
            "created_at": post.created_at.isoformat() if post.created_at else None,
            "tags": post.tags or [],
            "likes_count": post.likes_count or 0,
            "comments_count": post.comments_count or 0,
            "is_required": post.is_required or False,
            "is_unread": is_unread,
            "is_urgent": post.is_urgent or False,
        })
    
    return result


@router.post("/posts")
def create_post(
    payload: dict,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """
    Create a new community post/announcement.
    Required fields: title, content
    Optional fields: is_urgent, tags
    """
    title = payload.get("title", "").strip()
    content = payload.get("content", "").strip()
    is_urgent = payload.get("is_urgent", False)
    
    if not title:
        raise HTTPException(status_code=400, detail="Title is required")
    
    if not content:
        raise HTTPException(status_code=400, detail="Content is required")
    
    # Build tags based on is_urgent
    tags = ["Announcement"]
    if is_urgent:
        tags.append("Urgent")
    
    # Add custom tags if provided
    custom_tags = payload.get("tags", [])
    if isinstance(custom_tags, list):
        for tag in custom_tags:
            if tag not in tags:
                tags.append(tag)
    
    post = CommunityPost(
        title=title,
        content=content,
        author_id=current_user.id,
        is_urgent=is_urgent,
        is_required=payload.get("is_required", False),
        tags=tags,
        created_at=datetime.now(timezone.utc),
    )
    
    db.add(post)
    db.commit()
    db.refresh(post)
    
    # Return formatted response
    author = db.query(User).filter(User.id == post.author_id).first()
    author_profile = db.query(EmployeeProfile).filter(EmployeeProfile.user_id == post.author_id).first() if author else None
    
    author_name = None
    author_avatar = None
    
    if author_profile:
        author_name = author_profile.preferred_name or f"{author_profile.first_name or ''} {author_profile.last_name or ''}".strip()
        if author_profile.profile_photo_file_id:
            author_avatar = f"/files/{author_profile.profile_photo_file_id}/thumbnail?w=96"
    
    if not author_name and author:
        author_name = author.username
    
    return {
        "id": str(post.id),
        "title": post.title,
        "content": post.content,
        "author_id": str(post.author_id),
        "author_name": author_name,
        "author_avatar": author_avatar,
        "created_at": post.created_at.isoformat() if post.created_at else None,
        "tags": post.tags or [],
        "likes_count": post.likes_count or 0,
        "comments_count": post.comments_count or 0,
        "is_required": post.is_required or False,
        "is_unread": True,  # New posts are always unread
        "is_urgent": post.is_urgent or False,
    }

