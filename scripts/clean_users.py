"""
Script para limpar usuários, mantendo apenas Raphael e Fernando Rabelo como admins

Uso:
    python scripts/clean_users.py [--dry-run]
"""
import sys
import os
import argparse

# Add parent directory to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from sqlalchemy.orm import Session
from sqlalchemy import and_, or_, text
from app.db import SessionLocal
from app.models.models import User, Role, EmployeeProfile

# Identificadores dos usuários que devem ser mantidos (busca por username ou email)
# Usar identificadores mais específicos para evitar matches incorretos
KEEP_USERS = [
    "adminmk",  # Raphael - username específico
    "fernandorabelo",  # Fernando Rabelo - busca por username ou email contendo "fernandorabelo"
]

def find_admin_role(db: Session) -> Role:
    """Find or create admin role"""
    admin_role = db.query(Role).filter(Role.name == "admin").first()
    if not admin_role:
        # Create admin role if it doesn't exist
        admin_role = Role(name="admin", description="Administrator")
        db.add(admin_role)
        db.commit()
        db.refresh(admin_role)
    return admin_role

def clean_users(dry_run: bool = False):
    """Clean users, keeping only Raphael and Fernando Rabelo, and make them admins"""
    db = SessionLocal()
    try:
        # Find users to keep (by email or username)
        keep_users = []
        keep_user_ids = set()
        for identifier in KEEP_USERS:
            # Try to find by username (case insensitive)
            users = db.query(User).filter(User.username.ilike(f"%{identifier}%")).all()
            if not users:
                # Try to find by email (case insensitive)
                users = db.query(User).filter(
                    or_(
                        User.email_personal.ilike(f"%{identifier}%"),
                        User.email_corporate.ilike(f"%{identifier}%")
                    )
                ).all()
            
            for user in users:
                if user.id not in keep_user_ids:
                    keep_users.append(user)
                    keep_user_ids.add(user.id)
                    print(f"[KEEP] Found user to keep: {user.username} ({user.email_personal})")
            
            if not users:
                print(f"[WARN] Could not find user matching: {identifier}")
        
        if not keep_users:
            print("[ERROR] No users found to keep! Aborting.")
            return
        
        # Get admin role
        admin_role = find_admin_role(db)
        
        # Make kept users admins
        for user in keep_users:
            if admin_role not in user.roles:
                if not dry_run:
                    user.roles.append(admin_role)
                    print(f"[ADMIN] Made {user.username} an admin")
                else:
                    print(f"[DRY-RUN] Would make {user.username} an admin")
        
        # Commit admin role changes before deleting users
        if not dry_run:
            db.commit()
        
        # Get all users
        all_users = db.query(User).all()
        
        # Get first kept user to use as replacement for foreign key references
        replacement_user_id = keep_users[0].id if keep_users else None
        
        # Delete users not in keep list
        # Since this is dev data, we'll use SQL to delete directly with CASCADE
        deleted_count = 0
        user_ids_to_delete = [str(u.id) for u in all_users if u.id not in keep_user_ids]
        
        if not dry_run and user_ids_to_delete:
            # Use raw SQL to delete users - CASCADE will handle related records
            # First, update critical foreign keys to replacement user
            if replacement_user_id:
                # Update the most common foreign key references
                update_queries = [
                    ("UPDATE community_posts SET author_id = :replacement_id WHERE author_id = ANY(:user_ids)", "community_posts"),
                    ("UPDATE invites SET created_by = :replacement_id WHERE created_by = ANY(:user_ids)", "invites"),
                    ("UPDATE employee_profiles SET manager_user_id = :replacement_id WHERE manager_user_id = ANY(:user_ids)", "employee_profiles"),
                    ("UPDATE project_events SET created_by = :replacement_id WHERE created_by = ANY(:user_ids)", "project_events"),
                ]
                
                for query_sql, table_name in update_queries:
                    try:
                        db.execute(text(query_sql), {
                            "replacement_id": replacement_user_id,
                            "user_ids": user_ids_to_delete
                        })
                    except Exception as e:
                        print(f"  [WARN] Could not update {table_name}: {e}")
                
                db.commit()
            
            # Now delete users using SQL (CASCADE will handle related records)
            # Delete in batches to avoid issues
            batch_size = 50
            for i in range(0, len(user_ids_to_delete), batch_size):
                batch = user_ids_to_delete[i:i+batch_size]
                try:
                    db.execute(text("""
                        DELETE FROM users 
                        WHERE id = ANY(:user_ids)
                    """), {"user_ids": batch})
                    db.commit()
                    deleted_count += len(batch)
                    print(f"[DELETE] Deleted batch of {len(batch)} users")
                except Exception as e:
                    db.rollback()
                    print(f"[ERROR] Failed to delete batch: {e}")
                    # Try deleting one by one
                    for user_id in batch:
                        try:
                            user = db.query(User).filter(User.id == user_id).first()
                            if user:
                                # Delete profile first
                                profile = db.query(EmployeeProfile).filter(EmployeeProfile.user_id == user.id).first()
                                if profile:
                                    db.delete(profile)
                                db.delete(user)
                                db.commit()
                                deleted_count += 1
                                print(f"[DELETE] Deleted user: {user.username} ({user.email_personal})")
                        except Exception as e2:
                            db.rollback()
                            print(f"[ERROR] Failed to delete user {user_id}: {e2}")
        else:
            for user in all_users:
                if user.id not in keep_user_ids:
                    print(f"[DRY-RUN] Would delete user: {user.username} ({user.email_personal})")
                    deleted_count += 1
        
        if not dry_run:
            print(f"\n[SUCCESS] Cleaned {deleted_count} users. Kept {len(keep_users)} users as admins.")
        else:
            print(f"\n[DRY-RUN] Would clean {deleted_count} users. Would keep {len(keep_users)} users as admins.")
    
    except Exception as e:
        db.rollback()
        print(f"[ERROR] Error cleaning users: {e}")
        import traceback
        traceback.print_exc()
    finally:
        db.close()

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Clean users, keeping only Raphael and Fernando Rabelo as admins")
    parser.add_argument("--dry-run", action="store_true", help="Dry run mode - don't make changes")
    args = parser.parse_args()
    
    clean_users(dry_run=args.dry_run)

