import uuid
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_, func

from ..models.models import (
    TrainingCourse,
    TrainingModule,
    TrainingLesson,
    TrainingQuiz,
    TrainingQuizQuestion,
    TrainingProgress,
    TrainingCompletedLesson,
    TrainingCertificate,
    User,
    EmployeeProfile,
    Role,
    SettingItem,
    TaskItem,
    FileObject,
)
from .task_service import create_task_item, get_user_display
from ..storage.provider import StorageProvider
from ..storage.local_provider import LocalStorageProvider
from ..storage.blob_provider import BlobStorageProvider
from ..config import settings


def get_storage() -> StorageProvider:
    """Get storage provider based on configuration"""
    if settings.azure_blob_connection and settings.azure_blob_container:
        return BlobStorageProvider()
    else:
        return LocalStorageProvider()


def get_required_courses_for_user(user_id: uuid.UUID, db: Session) -> List[TrainingCourse]:
    """Get all required courses for a user based on role, division, and explicit assignments"""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        return []
    
    # Get user's roles
    user_role_ids = [role.id for role in user.roles]
    
    # Get user's divisions
    profile = db.query(EmployeeProfile).filter(EmployeeProfile.user_id == user_id).first()
    user_division_ids = []
    if profile and profile.division:
        # Find division SettingItem by label
        division_item = db.query(SettingItem).join(SettingItem.list_id).filter(
            SettingItem.label == profile.division
        ).first()
        if division_item:
            user_division_ids = [division_item.id]
    
    # Also check user_divisions relationship
    user_divisions = db.query(SettingItem).join("users").filter(User.id == user_id).all()
    user_division_ids.extend([d.id for d in user_divisions])
    
    # Build query for required courses
    query = db.query(TrainingCourse).filter(
        TrainingCourse.status == "published",
        TrainingCourse.is_required == True,
        or_(
            # Required for user's roles
            TrainingCourse.required_roles.any(Role.id.in_(user_role_ids)) if user_role_ids else False,
            # Required for user's divisions
            TrainingCourse.required_divisions.any(SettingItem.id.in_(user_division_ids)) if user_division_ids else False,
            # Explicitly required for this user
            TrainingCourse.required_users.any(User.id == user_id),
        )
    )
    
    return query.all()


def assign_onboarding_courses(user_id: uuid.UUID, db: Session) -> None:
    """Assign onboarding courses to a new employee"""
    # Get courses marked for onboarding (renewal_frequency includes onboarding or is_required for new users)
    onboarding_courses = db.query(TrainingCourse).filter(
        TrainingCourse.status == "published",
        or_(
            TrainingCourse.renewal_frequency == "every_new_job",  # This might be used for onboarding
            TrainingCourse.is_required == True,
        )
    ).all()
    
    # Also check if user matches required criteria
    required_courses = get_required_courses_for_user(user_id, db)
    
    all_courses = {c.id: c for c in onboarding_courses + required_courses}.values()
    
    for course in all_courses:
        # Check if progress already exists
        existing = db.query(TrainingProgress).filter(
            TrainingProgress.user_id == user_id,
            TrainingProgress.course_id == course.id
        ).first()
        
        if not existing:
            # Create progress record
            progress = TrainingProgress(
                user_id=user_id,
                course_id=course.id,
                started_at=datetime.utcnow(),
                last_accessed_at=datetime.utcnow(),
            )
            db.add(progress)
    
    db.commit()


def check_expired_certificates(db: Session) -> List[TrainingCertificate]:
    """Find certificates that have expired or are expiring soon"""
    now = datetime.utcnow()
    expired = db.query(TrainingCertificate).filter(
        TrainingCertificate.expires_at.isnot(None),
        TrainingCertificate.expires_at <= now
    ).all()
    return expired


def calculate_course_progress(course_id: uuid.UUID, user_id: uuid.UUID, db: Session) -> int:
    """Calculate completion percentage for a course"""
    course = db.query(TrainingCourse).filter(TrainingCourse.id == course_id).first()
    if not course:
        return 0
    
    # Count total lessons
    total_lessons = db.query(TrainingLesson).join(TrainingModule).filter(
        TrainingModule.course_id == course_id
    ).count()
    
    if total_lessons == 0:
        return 0
    
    # Count completed lessons
    progress = db.query(TrainingProgress).filter(
        TrainingProgress.user_id == user_id,
        TrainingProgress.course_id == course_id
    ).first()
    
    if not progress:
        return 0
    
    completed_count = db.query(TrainingCompletedLesson).filter(
        TrainingCompletedLesson.progress_id == progress.id
    ).count()
    
    return int((completed_count / total_lessons) * 100)


def check_course_completion(course_id: uuid.UUID, user_id: uuid.UUID, db: Session) -> bool:
    """Verify if all lessons/modules are complete"""
    course = db.query(TrainingCourse).filter(TrainingCourse.id == course_id).first()
    if not course:
        return False
    
    # Get all lessons
    all_lessons = db.query(TrainingLesson).join(TrainingModule).filter(
        TrainingModule.course_id == course_id,
        TrainingLesson.requires_completion == True
    ).all()
    
    if not all_lessons:
        return False
    
    # Get progress
    progress = db.query(TrainingProgress).filter(
        TrainingProgress.user_id == user_id,
        TrainingProgress.course_id == course_id
    ).first()
    
    if not progress:
        return False
    
    # Check if all lessons are completed
    completed_lesson_ids = {
        cl.lesson_id for cl in db.query(TrainingCompletedLesson).filter(
            TrainingCompletedLesson.progress_id == progress.id
        ).all()
    }
    
    all_lesson_ids = {lesson.id for lesson in all_lessons}
    return all_lesson_ids.issubset(completed_lesson_ids)


def get_next_lesson(course_id: uuid.UUID, user_id: uuid.UUID, db: Session) -> Optional[TrainingLesson]:
    """Get the next uncompleted lesson for a user"""
    progress = db.query(TrainingProgress).filter(
        TrainingProgress.user_id == user_id,
        TrainingProgress.course_id == course_id
    ).first()
    
    if not progress:
        # Start with first lesson
        first_module = db.query(TrainingModule).filter(
            TrainingModule.course_id == course_id
        ).order_by(TrainingModule.order_index).first()
        
        if first_module:
            return db.query(TrainingLesson).filter(
                TrainingLesson.module_id == first_module.id
            ).order_by(TrainingLesson.order_index).first()
        return None
    
    # Get completed lesson IDs
    completed_lesson_ids = {
        cl.lesson_id for cl in db.query(TrainingCompletedLesson).filter(
            TrainingCompletedLesson.progress_id == progress.id
        ).all()
    }
    
    # Find first uncompleted lesson
    modules = db.query(TrainingModule).filter(
        TrainingModule.course_id == course_id
    ).order_by(TrainingModule.order_index).all()
    
    for module in modules:
        lessons = db.query(TrainingLesson).filter(
            TrainingLesson.module_id == module.id
        ).order_by(TrainingLesson.order_index).all()
        
        for lesson in lessons:
            if lesson.id not in completed_lesson_ids:
                return lesson
    
    return None


def update_lesson_progress(progress_id: uuid.UUID, lesson_id: uuid.UUID, quiz_score: Optional[int], db: Session) -> None:
    """Mark lesson complete and update course progress"""
    progress = db.query(TrainingProgress).filter(TrainingProgress.id == progress_id).first()
    if not progress:
        return
    
    # Check if already completed
    existing = db.query(TrainingCompletedLesson).filter(
        TrainingCompletedLesson.progress_id == progress_id,
        TrainingCompletedLesson.lesson_id == lesson_id
    ).first()
    
    if existing:
        # Update quiz score if provided
        if quiz_score is not None:
            existing.quiz_score = quiz_score
        db.commit()
        return
    
    # Create completed lesson record
    completed = TrainingCompletedLesson(
        progress_id=progress_id,
        lesson_id=lesson_id,
        quiz_score=quiz_score,
    )
    db.add(completed)
    
    # Update progress
    progress.last_accessed_at = datetime.utcnow()
    progress.progress_percent = calculate_course_progress(progress.course_id, progress.user_id, db)
    
    # Check if course is complete
    if check_course_completion(progress.course_id, progress.user_id, db):
        progress.completed_at = datetime.utcnow()
        
        # Generate certificate if course generates one
        course = db.query(TrainingCourse).filter(TrainingCourse.id == progress.course_id).first()
        if course and course.generates_certificate:
            generate_certificate(progress.course_id, progress.user_id, db)
    
    db.commit()


def generate_certificate_number(course_id: uuid.UUID, user_id: uuid.UUID, db: Session) -> str:
    """Generate unique certificate number"""
    # Format: TC-{course_id_prefix}-{user_id_prefix}-{timestamp}
    course_prefix = str(course_id).split('-')[0].upper()[:8]
    user_prefix = str(user_id).split('-')[0].upper()[:8]
    timestamp = datetime.utcnow().strftime('%Y%m%d')
    cert_num = f"TC-{course_prefix}-{user_prefix}-{timestamp}"
    
    # Ensure uniqueness
    counter = 1
    base_num = cert_num
    while db.query(TrainingCertificate).filter(TrainingCertificate.certificate_number == cert_num).first():
        cert_num = f"{base_num}-{counter:03d}"
        counter += 1
    
    return cert_num


def generate_certificate(course_id: uuid.UUID, user_id: uuid.UUID, db: Session) -> Optional[TrainingCertificate]:
    """Generate certificate for completed course"""
    course = db.query(TrainingCourse).filter(TrainingCourse.id == course_id).first()
    if not course or not course.generates_certificate:
        return None
    
    # Check if certificate already exists
    existing = db.query(TrainingCertificate).filter(
        TrainingCertificate.user_id == user_id,
        TrainingCertificate.course_id == course_id
    ).first()
    
    if existing:
        return existing
    
    # Generate certificate number
    cert_number = generate_certificate_number(course_id, user_id, db)
    
    # Calculate expiry date
    expires_at = None
    if course.certificate_validity_days:
        expires_at = datetime.utcnow() + timedelta(days=course.certificate_validity_days)
    
    # Generate QR code data (validation URL)
    qr_data = f"MKHUB-CERT-{cert_number}"
    
    # Get user and employee profile for certificate
    user = db.query(User).filter(User.id == user_id).first()
    profile = db.query(EmployeeProfile).filter(EmployeeProfile.user_id == user_id).first()
    
    # Get user display name
    user_name = get_user_display(db, user_id) or user.username if user else "Employee"
    
    # Generate PDF certificate
    from ..proposals.pdf_certificate import create_certificate_pdf
    pdf_buffer = create_certificate_pdf(
        course_title=course.title,
        user_name=user_name,
        completion_date=datetime.utcnow(),
        expiry_date=expires_at,
        certificate_number=cert_number,
        certificate_text=course.certificate_text,
        qr_code_data=qr_data,
    )
    
    # Save PDF to storage
    storage = get_storage()
    cert_key = f"training/certificates/{cert_number}.pdf"
    
    # Determine provider and container
    if isinstance(storage, LocalStorageProvider):
        provider = "local"
        container = "local"
    else:
        provider = "blob"
        container = settings.azure_blob_container or ""
    
    # Upload PDF
    storage.copy_in(pdf_buffer, cert_key)
    
    # Create FileObject
    file_obj = FileObject(
        provider=provider,
        container=container,
        key=cert_key,
        size_bytes=len(pdf_buffer.getvalue()),
        content_type="application/pdf",
        employee_id=user_id,
        category_id=course.category_id,
        source_ref="training_certificate",
    )
    db.add(file_obj)
    db.flush()
    
    # Create certificate record
    certificate = TrainingCertificate(
        user_id=user_id,
        course_id=course_id,
        issued_at=datetime.utcnow(),
        expires_at=expires_at,
        certificate_number=cert_number,
        qr_code_data=qr_data,
        certificate_file_id=file_obj.id,
    )
    
    db.add(certificate)
    db.commit()
    db.refresh(certificate)
    
    # Create renewal task if certificate expires
    if expires_at:
        create_renewal_task(certificate.id, db)
    
    return certificate


def create_renewal_task(certificate_id: uuid.UUID, db: Session) -> Optional[TaskItem]:
    """Create task for training renewal X days before expiry"""
    certificate = db.query(TrainingCertificate).filter(TrainingCertificate.id == certificate_id).first()
    if not certificate or not certificate.expires_at:
        return None
    
    course = db.query(TrainingCourse).filter(TrainingCourse.id == certificate.course_id).first()
    if not course:
        return None
    
    # Calculate due date (7 days before expiry, or adjust based on course settings)
    days_before = 7  # Default
    if course.renewal_frequency_days:
        days_before = min(course.renewal_frequency_days, 30)  # Cap at 30 days
    
    due_date = certificate.expires_at - timedelta(days=days_before)
    
    # Check if task already exists
    existing_task = db.query(TaskItem).filter(
        TaskItem.origin_type == "training_renewal",
        TaskItem.origin_id == str(certificate_id),
        TaskItem.status != "done"
    ).first()
    
    if existing_task:
        return existing_task
    
    # Create task
    task = create_task_item(
        db,
        title=f"Renew Training: {course.title}",
        description=f"Your {course.title} certificate expires on {certificate.expires_at.strftime('%Y-%m-%d')}. Please complete the training renewal.",
        requested_by_id=None,  # System-generated
        assigned_to_id=certificate.user_id,
        priority="normal",
        due_date=due_date,
        origin_type="training_renewal",
        origin_reference=f"Certificate {certificate.certificate_number}",
        origin_id=str(certificate_id),
    )
    
    db.commit()
    return task


def check_renewal_tasks(db: Session) -> None:
    """Background job to create renewal tasks for upcoming expirations"""
    # Find certificates expiring in next 30 days without tasks
    now = datetime.utcnow()
    future_date = now + timedelta(days=30)
    
    certificates = db.query(TrainingCertificate).filter(
        TrainingCertificate.expires_at.isnot(None),
        TrainingCertificate.expires_at >= now,
        TrainingCertificate.expires_at <= future_date,
    ).all()
    
    for cert in certificates:
        # Check if task exists
        existing_task = db.query(TaskItem).filter(
            TaskItem.origin_type == "training_renewal",
            TaskItem.origin_id == str(cert.id),
            TaskItem.status != "done"
        ).first()
        
        if not existing_task:
            create_renewal_task(cert.id, db)


def assign_course_to_users(course_id: uuid.UUID, db: Session) -> None:
    """When course is published, assign to required users"""
    course = db.query(TrainingCourse).filter(TrainingCourse.id == course_id).first()
    if not course or course.status != "published" or not course.is_required:
        return
    
    # Get all users who match requirements
    user_ids = set()
    
    # Users with required roles
    if course.required_roles:
        for role in course.required_roles:
            for user in role.users:
                user_ids.add(user.id)
    
    # Users with required divisions
    if course.required_divisions:
        for division in course.required_divisions:
            for user in division.users:
                user_ids.add(user.id)
    
    # Explicitly required users
    if course.required_users:
        for user in course.required_users:
            user_ids.add(user.id)
    
    # Create progress records for users who don't have them
    for user_id in user_ids:
        existing = db.query(TrainingProgress).filter(
            TrainingProgress.user_id == user_id,
            TrainingProgress.course_id == course_id
        ).first()
        
        if not existing:
            progress = TrainingProgress(
                user_id=user_id,
                course_id=course_id,
                started_at=datetime.utcnow(),
                last_accessed_at=datetime.utcnow(),
            )
            db.add(progress)
    
    db.commit()


def validate_course_for_publishing(course_id: uuid.UUID, db: Session) -> Tuple[bool, Optional[str]]:
    """Check if course can be published (has at least one module with one lesson)"""
    course = db.query(TrainingCourse).filter(TrainingCourse.id == course_id).first()
    if not course:
        return False, "Course not found"
    
    modules = db.query(TrainingModule).filter(TrainingModule.course_id == course_id).all()
    if not modules:
        return False, "Course must have at least one module"
    
    for module in modules:
        lessons = db.query(TrainingLesson).filter(TrainingLesson.module_id == module.id).all()
        if lessons:
            return True, None
    
    return False, "Course must have at least one lesson"


def publish_course(course_id: uuid.UUID, db: Session) -> Tuple[bool, Optional[str]]:
    """Publish a course"""
    course = db.query(TrainingCourse).filter(TrainingCourse.id == course_id).first()
    if not course:
        return False, "Course not found"
    
    # Validate
    can_publish, error = validate_course_for_publishing(course_id, db)
    if not can_publish:
        return False, error
    
    # Update status
    course.status = "published"
    course.last_published_at = datetime.utcnow()
    course.updated_at = datetime.utcnow()
    
    db.commit()
    
    # Assign to required users
    assign_course_to_users(course_id, db)
    
    return True, None


def unpublish_course(course_id: uuid.UUID, db: Session) -> None:
    """Unpublish a course (doesn't affect existing progress)"""
    course = db.query(TrainingCourse).filter(TrainingCourse.id == course_id).first()
    if not course:
        return
    
    course.status = "draft"
    course.updated_at = datetime.utcnow()
    db.commit()


def duplicate_course(course_id: uuid.UUID, new_title: str, created_by: uuid.UUID, db: Session) -> Optional[TrainingCourse]:
    """Duplicate a course with all modules, lessons, and quizzes"""
    original = db.query(TrainingCourse).filter(TrainingCourse.id == course_id).first()
    if not original:
        return None
    
    # Create new course
    new_course = TrainingCourse(
        title=new_title,
        description=original.description,
        category_id=original.category_id,
        thumbnail_file_id=original.thumbnail_file_id,
        estimated_duration_minutes=original.estimated_duration_minutes,
        tags=original.tags.copy() if original.tags else None,
        is_required=original.is_required,
        renewal_frequency=original.renewal_frequency,
        renewal_frequency_days=original.renewal_frequency_days,
        generates_certificate=original.generates_certificate,
        certificate_validity_days=original.certificate_validity_days,
        certificate_text=original.certificate_text,
        status="draft",
        created_by=created_by,
        cloned_from_id=original.id,
    )
    
    db.add(new_course)
    db.flush()
    
    # Copy required assignments (need to reload relationships)
    db.refresh(original)
    if original.required_roles:
        new_course.required_roles = list(original.required_roles)
    if original.required_divisions:
        new_course.required_divisions = list(original.required_divisions)
    if original.required_users:
        new_course.required_users = list(original.required_users)
    
    # Duplicate modules
    for module in original.modules:
        duplicate_module(module, new_course.id, db)
    
    db.commit()
    db.refresh(new_course)
    return new_course


def duplicate_module(module: TrainingModule, new_course_id: uuid.UUID, db: Session) -> TrainingModule:
    """Duplicate a module and its lessons"""
    new_module = TrainingModule(
        course_id=new_course_id,
        title=module.title,
        order_index=module.order_index,
    )
    db.add(new_module)
    db.flush()
    
    # Duplicate lessons
    for lesson in module.lessons:
        duplicate_lesson(lesson, new_module.id, db)
    
    return new_module


def duplicate_lesson(lesson: TrainingLesson, new_module_id: uuid.UUID, db: Session) -> TrainingLesson:
    """Duplicate a lesson (including quiz if present)"""
    new_lesson = TrainingLesson(
        module_id=new_module_id,
        lesson_type=lesson.lesson_type,
        title=lesson.title,
        order_index=lesson.order_index,
        requires_completion=lesson.requires_completion,
        content=lesson.content.copy() if lesson.content else None,
    )
    db.add(new_lesson)
    db.flush()
    
    # Duplicate quiz if present
    if lesson.quiz:
        duplicate_quiz(lesson.quiz, new_lesson.id, db)
    
    return new_lesson


def duplicate_quiz(quiz: TrainingQuiz, new_lesson_id: uuid.UUID, db: Session) -> TrainingQuiz:
    """Duplicate a quiz with all questions"""
    new_quiz = TrainingQuiz(
        lesson_id=new_lesson_id,
        title=quiz.title,
        passing_score_percent=quiz.passing_score_percent,
        allow_retry=quiz.allow_retry,
    )
    db.add(new_quiz)
    db.flush()
    
    # Duplicate questions
    for question in quiz.questions:
        new_question = TrainingQuizQuestion(
            quiz_id=new_quiz.id,
            question_text=question.question_text,
            question_type=question.question_type,
            order_index=question.order_index,
            correct_answer=question.correct_answer,
            options=question.options.copy() if question.options else None,
        )
        db.add(new_question)
    
    return new_quiz


def check_renewal_requirements(user_id: uuid.UUID, course_id: uuid.UUID, db: Session) -> bool:
    """Check if user needs to renew training based on frequency"""
    course = db.query(TrainingCourse).filter(TrainingCourse.id == course_id).first()
    if not course or course.renewal_frequency == "none":
        return False
    
    # Get user's latest certificate
    certificate = db.query(TrainingCertificate).filter(
        TrainingCertificate.user_id == user_id,
        TrainingCertificate.course_id == course_id
    ).order_by(TrainingCertificate.issued_at.desc()).first()
    
    if not certificate:
        return True  # No certificate, needs to complete
    
    if certificate.expires_at and certificate.expires_at <= datetime.utcnow():
        return True  # Expired
    
    # Check renewal frequency
    if course.renewal_frequency == "annual":
        if certificate.issued_at < datetime.utcnow() - timedelta(days=365):
            return True
    elif course.renewal_frequency == "monthly":
        if certificate.issued_at < datetime.utcnow() - timedelta(days=30):
            return True
    elif course.renewal_frequency == "weekly":
        if certificate.issued_at < datetime.utcnow() - timedelta(days=7):
            return True
    elif course.renewal_frequency == "days_X" and course.renewal_frequency_days:
        if certificate.issued_at < datetime.utcnow() - timedelta(days=course.renewal_frequency_days):
            return True
    
    return False

