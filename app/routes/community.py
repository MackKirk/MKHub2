import uuid
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import cast, String

from ..db import get_db
from ..models.models import CommunityPost, CommunityPostReadConfirmation, CommunityPostView, CommunityPostLike, CommunityPostComment, User, EmployeeProfile, user_divisions
from ..auth.security import get_current_user
from sqlalchemy import or_, select

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
    Posts are filtered by division membership: user sees posts where target_type='all' OR user's division is in target_division_ids
    """
    # Get user's division IDs by querying the association table
    division_query = select(user_divisions.c.division_id).where(user_divisions.c.user_id == current_user.id)
    division_results = db.execute(division_query).scalars().all()
    user_division_ids = [str(did) for did in division_results]
    
    query = db.query(CommunityPost).order_by(CommunityPost.created_at.desc())
    
    # Filter by division membership: show posts where target_type='all' OR user's divisions match
    if user_division_ids:
        # User has divisions: show posts for 'all' OR posts targeting user's divisions
        division_filters = []
        for div_id in user_division_ids:
            # Check if division_id is in target_division_ids JSON array (simple string search)
            division_filters.append(cast(CommunityPost.target_division_ids, String).like(f'%{div_id}%'))
        
        query = query.filter(
            or_(
                CommunityPost.target_type == 'all',
                *division_filters if division_filters else [CommunityPost.id == None]  # No match if no filters
            )
        )
    else:
        # User has no divisions: only show posts for 'all'
        query = query.filter(CommunityPost.target_type == 'all')
    
    # Additional filter logic
    if filter == 'unread':
        # Filter posts that user hasn't viewed yet
        viewed_post_ids = select(CommunityPostView.post_id).where(
            CommunityPostView.user_id == current_user.id
        )
        query = query.filter(~CommunityPost.id.in_(viewed_post_ids))
    elif filter == 'required':
        # Show posts that require read confirmation
        query = query.filter(CommunityPost.requires_read_confirmation == True)
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
        
        # Determine if post is unread: check if user has viewed it
        view = db.query(CommunityPostView).filter(
            CommunityPostView.post_id == post.id,
            CommunityPostView.user_id == current_user.id
        ).first()
        is_unread = view is None
        
        # Build photo URL if exists
        photo_url = None
        if post.photo_file_id:
            photo_url = f"/files/{post.photo_file_id}/thumbnail?w=800"
        
        # Build document URL if exists
        document_url = None
        document_file_id = None
        if post.document_file_id:
            document_url = f"/files/{post.document_file_id}"
            document_file_id = str(post.document_file_id)
        
        # Add Image tag if photo exists
        post_tags = post.tags or []
        if post.photo_file_id and 'Image' not in post_tags:
            post_tags = post_tags + ['Image']
        if post.document_file_id and 'Document' not in post_tags:
            post_tags = post_tags + ['Document']
        
        # Add Required tag if requires read confirmation
        if post.requires_read_confirmation and 'Required' not in post_tags:
            post_tags = post_tags + ['Required']
        
        # Check if user has confirmed reading
        user_has_confirmed = False
        if post.requires_read_confirmation:
            confirmation = db.query(CommunityPostReadConfirmation).filter(
                CommunityPostReadConfirmation.post_id == post.id,
                CommunityPostReadConfirmation.user_id == current_user.id
            ).first()
            user_has_confirmed = confirmation is not None
        
        # Check if user has liked the post
        user_has_liked = False
        like = db.query(CommunityPostLike).filter(
            CommunityPostLike.post_id == post.id,
            CommunityPostLike.user_id == current_user.id
        ).first()
        user_has_liked = like is not None
        
        # Get actual likes count from likes table
        actual_likes_count = db.query(CommunityPostLike).filter(
            CommunityPostLike.post_id == post.id
        ).count()
        
        # Get actual comments count from comments table
        actual_comments_count = db.query(CommunityPostComment).filter(
            CommunityPostComment.post_id == post.id
        ).count()
        
        result.append({
            "id": str(post.id),
            "title": post.title,
            "content": post.content,
            "author_id": str(post.author_id),
            "author_name": author_name,
            "author_avatar": author_avatar,
            "photo_url": photo_url,
            "document_url": document_url,
            "document_file_id": document_file_id,
            "created_at": post.created_at.isoformat() if post.created_at else None,
            "tags": post_tags,
            "likes_count": actual_likes_count,
            "comments_count": actual_comments_count,
            "is_required": post.is_required or False,
            "is_unread": is_unread,
            "is_urgent": post.is_urgent or False,
            "requires_read_confirmation": post.requires_read_confirmation or False,
            "user_has_confirmed": user_has_confirmed,
            "user_has_liked": user_has_liked,
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
    Optional fields: is_urgent, tags, photo_file_id, document_file_id, target_type, target_division_ids
    """
    title = payload.get("title", "").strip()
    content = payload.get("content", "").strip()
    is_urgent = payload.get("is_urgent", False)
    photo_file_id = payload.get("photo_file_id")
    document_file_id = payload.get("document_file_id")
    target_type = payload.get("target_type", "all")  # all|divisions
    target_division_ids = payload.get("target_division_ids", [])
    
    if not title:
        raise HTTPException(status_code=400, detail="Title is required")
    
    if not content:
        raise HTTPException(status_code=400, detail="Content is required")
    
    # Validate target_type
    if target_type not in ["all", "divisions"]:
        raise HTTPException(status_code=400, detail="target_type must be 'all' or 'divisions'")
    
    # Validate target_division_ids if target_type is 'divisions'
    if target_type == "divisions":
        if not target_division_ids or not isinstance(target_division_ids, list) or len(target_division_ids) == 0:
            raise HTTPException(status_code=400, detail="target_division_ids must be a non-empty list when target_type is 'divisions'")
        # Convert to strings for consistency
        target_division_ids = [str(did) for did in target_division_ids]
    
    # Validate photo_file_id if provided
    if photo_file_id:
        try:
            photo_uuid = uuid.UUID(str(photo_file_id))
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid photo_file_id format")
    
    # Validate document_file_id if provided
    if document_file_id:
        try:
            document_uuid = uuid.UUID(str(document_file_id))
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid document_file_id format")
    
    # Build tags based on is_urgent, photo, and document
    tags = ["Announcement"]
    if is_urgent:
        tags.append("Urgent")
    if photo_file_id:
        tags.append("Image")
    if document_file_id:
        tags.append("Document")
    
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
        photo_file_id=uuid.UUID(str(photo_file_id)) if photo_file_id else None,
        document_file_id=uuid.UUID(str(document_file_id)) if document_file_id else None,
        is_urgent=is_urgent,
        is_required=payload.get("is_required", False),
        requires_read_confirmation=payload.get("requires_read_confirmation", False),
        target_type=target_type,
        target_division_ids=target_division_ids if target_type == "divisions" else [],
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
    
    # Build photo URL if exists
    photo_url = None
    if post.photo_file_id:
        photo_url = f"/files/{post.photo_file_id}/thumbnail?w=800"
    
    # Build document URL if exists
    document_url = None
    document_file_id = None
    if post.document_file_id:
        document_url = f"/files/{post.document_file_id}"
        document_file_id = str(post.document_file_id)
    
    return {
        "id": str(post.id),
        "title": post.title,
        "content": post.content,
        "author_id": str(post.author_id),
        "author_name": author_name,
        "author_avatar": author_avatar,
        "photo_url": photo_url,
        "document_url": document_url,
        "document_file_id": document_file_id,
        "created_at": post.created_at.isoformat() if post.created_at else None,
        "tags": post.tags or [],
        "likes_count": post.likes_count or 0,
        "comments_count": post.comments_count or 0,
        "is_required": post.is_required or False,
        "is_unread": True,  # New posts are always unread
        "is_urgent": post.is_urgent or False,
        "requires_read_confirmation": post.requires_read_confirmation or False,
        "user_has_confirmed": False,  # Author doesn't need to confirm their own post
    }


@router.post("/posts/{post_id}/mark-viewed")
def mark_viewed(
    post_id: str,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """
    Mark that the current user has viewed the post (marks it as read).
    """
    try:
        post_uuid = uuid.UUID(str(post_id))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid post_id format")
    
    post = db.query(CommunityPost).filter(CommunityPost.id == post_uuid).first()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    
    # Check if already viewed
    existing = db.query(CommunityPostView).filter(
        CommunityPostView.post_id == post_uuid,
        CommunityPostView.user_id == current_user.id
    ).first()
    
    if existing:
        return {"status": "already_viewed", "viewed_at": existing.viewed_at.isoformat()}
    
    # Create view record
    view = CommunityPostView(
        post_id=post_uuid,
        user_id=current_user.id,
        viewed_at=datetime.now(timezone.utc)
    )
    
    db.add(view)
    db.commit()
    db.refresh(view)
    
    return {
        "status": "viewed",
        "viewed_at": view.viewed_at.isoformat()
    }


@router.post("/posts/{post_id}/confirm-read")
def confirm_read(
    post_id: str,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """
    Confirm that the current user has read the post.
    """
    try:
        post_uuid = uuid.UUID(str(post_id))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid post_id format")
    
    post = db.query(CommunityPost).filter(CommunityPost.id == post_uuid).first()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    
    # Check if already confirmed
    existing = db.query(CommunityPostReadConfirmation).filter(
        CommunityPostReadConfirmation.post_id == post_uuid,
        CommunityPostReadConfirmation.user_id == current_user.id
    ).first()
    
    if existing:
        return {"status": "already_confirmed", "confirmed_at": existing.confirmed_at.isoformat()}
    
    # Create confirmation
    confirmation = CommunityPostReadConfirmation(
        post_id=post_uuid,
        user_id=current_user.id,
        confirmed_at=datetime.now(timezone.utc)
    )
    
    db.add(confirmation)
    db.commit()
    db.refresh(confirmation)
    
    return {
        "status": "confirmed",
        "confirmed_at": confirmation.confirmed_at.isoformat()
    }


@router.get("/posts/my-posts")
def list_my_posts(
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """
    List all posts created by the current user (for history).
    """
    posts = db.query(CommunityPost).filter(
        CommunityPost.author_id == current_user.id
    ).order_by(CommunityPost.created_at.desc()).all()
    
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
        
        photo_url = None
        if post.photo_file_id:
            photo_url = f"/files/{post.photo_file_id}/thumbnail?w=800"
        
        # Build document URL if exists
        document_url = None
        document_file_id = None
        if post.document_file_id:
            document_url = f"/files/{post.document_file_id}"
            document_file_id = str(post.document_file_id)
        
        post_tags = post.tags or []
        if post.photo_file_id and 'Image' not in post_tags:
            post_tags = post_tags + ['Image']
        if post.document_file_id and 'Document' not in post_tags:
            post_tags = post_tags + ['Document']
        
        # Add Required tag if requires read confirmation
        if post.requires_read_confirmation and 'Required' not in post_tags:
            post_tags = post_tags + ['Required']
        
        # Get read confirmations count
        confirmations_count = db.query(CommunityPostReadConfirmation).filter(
            CommunityPostReadConfirmation.post_id == post.id
        ).count()
        
        # Calculate total recipients count
        total_recipients = 0
        if post.target_type == 'all':
            # Count all active users
            total_recipients = db.query(User).filter(User.is_active == True).count()
        elif post.target_type == 'divisions' and post.target_division_ids:
            # Count users in the specified divisions
            # Parse target_division_ids (JSON array)
            import json
            try:
                division_ids = post.target_division_ids
                if isinstance(division_ids, str):
                    division_ids = json.loads(division_ids)
                if isinstance(division_ids, list) and len(division_ids) > 0:
                    # Convert to UUIDs for querying
                    division_uuids = []
                    for div_id in division_ids:
                        try:
                            division_uuids.append(uuid.UUID(str(div_id)))
                        except:
                            pass
                    
                    if division_uuids:
                        # Count distinct users in these divisions
                        from sqlalchemy import distinct
                        total_recipients = db.query(distinct(user_divisions.c.user_id)).filter(
                            user_divisions.c.division_id.in_(division_uuids)
                        ).count()
            except Exception as e:
                # If parsing fails, default to 0
                total_recipients = 0
        
        result.append({
            "id": str(post.id),
            "title": post.title,
            "content": post.content,
            "author_id": str(post.author_id),
            "author_name": author_name,
            "author_avatar": author_avatar,
            "photo_url": photo_url,
            "document_url": document_url,
            "document_file_id": document_file_id,
            "created_at": post.created_at.isoformat() if post.created_at else None,
            "tags": post_tags,
            "likes_count": post.likes_count or 0,
            "comments_count": post.comments_count or 0,
            "is_required": post.is_required or False,
            "is_urgent": post.is_urgent or False,
            "requires_read_confirmation": post.requires_read_confirmation or False,
            "confirmations_count": confirmations_count,
            "total_recipients": total_recipients,
        })
    
    return result


@router.get("/posts/{post_id}/read-confirmations")
def list_read_confirmations(
    post_id: str,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """
    List all users who confirmed reading a post. Only the post author can view this.
    """
    try:
        post_uuid = uuid.UUID(str(post_id))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid post_id format")
    
    post = db.query(CommunityPost).filter(CommunityPost.id == post_uuid).first()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    
    # Only author can view confirmations
    if post.author_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only post author can view read confirmations")
    
    confirmations = db.query(CommunityPostReadConfirmation).filter(
        CommunityPostReadConfirmation.post_id == post_uuid
    ).order_by(CommunityPostReadConfirmation.confirmed_at.desc()).all()
    
    result = []
    for conf in confirmations:
        user = db.query(User).filter(User.id == conf.user_id).first()
        user_profile = db.query(EmployeeProfile).filter(EmployeeProfile.user_id == conf.user_id).first() if user else None
        
        user_name = None
        user_avatar = None
        
        if user_profile:
            user_name = user_profile.preferred_name or f"{user_profile.first_name or ''} {user_profile.last_name or ''}".strip()
            if user_profile.profile_photo_file_id:
                user_avatar = f"/files/{user_profile.profile_photo_file_id}/thumbnail?w=96"
        
        if not user_name and user:
            user_name = user.username
        
        result.append({
            "user_id": str(conf.user_id),
            "user_name": user_name,
            "user_avatar": user_avatar,
            "confirmed_at": conf.confirmed_at.isoformat() if conf.confirmed_at else None,
        })
    
    return result


@router.post("/posts/{post_id}/like")
def toggle_like(
    post_id: str,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """
    Toggle like on a post. If user has already liked, remove the like. Otherwise, add a like.
    """
    try:
        post_uuid = uuid.UUID(str(post_id))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid post_id format")
    
    post = db.query(CommunityPost).filter(CommunityPost.id == post_uuid).first()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    
    # Check if user has already liked
    existing_like = db.query(CommunityPostLike).filter(
        CommunityPostLike.post_id == post_uuid,
        CommunityPostLike.user_id == current_user.id
    ).first()
    
    if existing_like:
        # Remove like
        db.delete(existing_like)
        db.commit()
        action = "unliked"
    else:
        # Add like
        like = CommunityPostLike(
            post_id=post_uuid,
            user_id=current_user.id,
            liked_at=datetime.now(timezone.utc)
        )
        db.add(like)
        db.commit()
        action = "liked"
    
    # Get updated likes count
    likes_count = db.query(CommunityPostLike).filter(
        CommunityPostLike.post_id == post_uuid
    ).count()
    
    return {
        "status": action,
        "likes_count": likes_count,
        "user_has_liked": action == "liked"
    }


@router.get("/posts/{post_id}/comments")
def list_comments(
    post_id: str,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """
    List all comments on a post.
    """
    try:
        post_uuid = uuid.UUID(str(post_id))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid post_id format")
    
    post = db.query(CommunityPost).filter(CommunityPost.id == post_uuid).first()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    
    comments = db.query(CommunityPostComment).filter(
        CommunityPostComment.post_id == post_uuid
    ).order_by(CommunityPostComment.created_at.asc()).all()
    
    result = []
    for comment in comments:
        user = db.query(User).filter(User.id == comment.user_id).first()
        user_profile = db.query(EmployeeProfile).filter(EmployeeProfile.user_id == comment.user_id).first() if user else None
        
        user_name = None
        user_avatar = None
        
        if user_profile:
            user_name = user_profile.preferred_name or f"{user_profile.first_name or ''} {user_profile.last_name or ''}".strip()
            if user_profile.profile_photo_file_id:
                user_avatar = f"/files/{user_profile.profile_photo_file_id}/thumbnail?w=96"
        
        if not user_name and user:
            user_name = user.username
        
        result.append({
            "id": str(comment.id),
            "user_id": str(comment.user_id),
            "user_name": user_name,
            "user_avatar": user_avatar,
            "content": comment.content,
            "created_at": comment.created_at.isoformat() if comment.created_at else None,
            "updated_at": comment.updated_at.isoformat() if comment.updated_at else None,
        })
    
    return result


@router.post("/posts/{post_id}/comments")
def create_comment(
    post_id: str,
    payload: dict,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """
    Create a comment on a post.
    """
    try:
        post_uuid = uuid.UUID(str(post_id))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid post_id format")
    
    post = db.query(CommunityPost).filter(CommunityPost.id == post_uuid).first()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    
    content = payload.get("content", "").strip()
    if not content:
        raise HTTPException(status_code=400, detail="Comment content is required")
    
    comment = CommunityPostComment(
        post_id=post_uuid,
        user_id=current_user.id,
        content=content,
        created_at=datetime.now(timezone.utc)
    )
    
    db.add(comment)
    db.commit()
    db.refresh(comment)
    
    # Get comment author info
    user = db.query(User).filter(User.id == current_user.id).first()
    user_profile = db.query(EmployeeProfile).filter(EmployeeProfile.user_id == current_user.id).first() if user else None
    
    user_name = None
    user_avatar = None
    
    if user_profile:
        user_name = user_profile.preferred_name or f"{user_profile.first_name or ''} {user_profile.last_name or ''}".strip()
        if user_profile.profile_photo_file_id:
            user_avatar = f"/files/{user_profile.profile_photo_file_id}/thumbnail?w=96"
    
    if not user_name and user:
        user_name = user.username
    
    # Get updated comments count
    comments_count = db.query(CommunityPostComment).filter(
        CommunityPostComment.post_id == post_uuid
    ).count()
    
    return {
        "id": str(comment.id),
        "user_id": str(comment.user_id),
        "user_name": user_name,
        "user_avatar": user_avatar,
        "content": comment.content,
        "created_at": comment.created_at.isoformat() if comment.created_at else None,
        "updated_at": comment.updated_at.isoformat() if comment.updated_at else None,
        "comments_count": comments_count,
    }

