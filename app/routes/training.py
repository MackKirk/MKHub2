import uuid
from datetime import datetime
from typing import List, Optional, Dict, Any
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_, func

from fastapi import APIRouter, Depends, HTTPException, Body, Query
from fastapi.responses import FileResponse, StreamingResponse
from io import BytesIO

from ..db import get_db
from ..auth.security import get_current_user, require_permissions
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
    FileObject,
)
from ..schemas.training import (
    CourseCreate,
    CourseUpdate,
    CourseResponse,
    CourseFullResponse,
    ModuleCreate,
    ModuleUpdate,
    ModuleResponse,
    ModuleFullResponse,
    LessonCreate,
    LessonUpdate,
    LessonResponse,
    LessonFullResponse,
    QuizCreate,
    QuizUpdate,
    QuizResponse,
    QuizFullResponse,
    QuizQuestionCreate,
    QuizQuestionUpdate,
    QuizQuestionResponse,
    ProgressResponse,
    CertificateResponse,
    QuizSubmissionRequest,
    QuizSubmissionResponse,
    ReorderModulesRequest,
    ReorderLessonsRequest,
    ReorderQuestionsRequest,
)
from ..services.training import (
    get_required_courses_for_user,
    calculate_course_progress,
    check_course_completion,
    get_next_lesson,
    update_lesson_progress,
    generate_certificate,
    publish_course,
    unpublish_course,
    duplicate_course,
    validate_course_for_publishing,
    check_renewal_requirements,
)
from ..services.task_service import get_user_display
from ..storage.provider import StorageProvider
from ..storage.local_provider import LocalStorageProvider
from ..storage.blob_provider import BlobStorageProvider
from ..config import settings
from ..proposals.pdf_certificate import create_certificate_pdf

router = APIRouter(prefix="/training", tags=["training"])


# =====================
# Employee Endpoints
# =====================

@router.get("")
def list_courses(
    db: Session = Depends(get_db),
    me: User = Depends(get_current_user)
):
    """List courses grouped by status (completed, in_progress, required, expired)"""
    # Get all published courses
    all_courses = db.query(TrainingCourse).filter(
        TrainingCourse.status == "published"
    ).all()
    
    # Get user's progress
    user_progress = {
        p.course_id: p for p in db.query(TrainingProgress).filter(
            TrainingProgress.user_id == me.id
        ).all()
    }
    
    # Get user's certificates
    user_certificates = {
        c.course_id: c for c in db.query(TrainingCertificate).filter(
            TrainingCertificate.user_id == me.id
        ).all()
    }
    
    # Get required courses
    required_courses = get_required_courses_for_user(me.id, db)
    required_course_ids = {c.id for c in required_courses}
    
    completed = []
    in_progress = []
    required = []
    expired = []
    
    for course in all_courses:
        progress = user_progress.get(course.id)
        certificate = user_certificates.get(course.id)
        
        # Check if expired
        if certificate and certificate.expires_at and certificate.expires_at < datetime.utcnow():
            expired.append(_serialize_course(course, progress, certificate))
            continue
        
        # Check if completed
        if progress and progress.completed_at:
            completed.append(_serialize_course(course, progress, certificate))
            continue
        
        # Check if in progress
        if progress and progress.started_at:
            in_progress.append(_serialize_course(course, progress, certificate))
            continue
        
        # Check if required
        if course.id in required_course_ids:
            required.append(_serialize_course(course, progress, certificate))
    
    return {
        "completed": completed,
        "in_progress": in_progress,
        "required": required,
        "expired": expired,
    }


def _serialize_course(course: TrainingCourse, progress: Optional[TrainingProgress], certificate: Optional[TrainingCertificate]) -> Dict[str, Any]:
    """Helper to serialize course for employee view"""
    return {
        "id": str(course.id),
        "title": course.title,
        "description": course.description,
        "category_id": str(course.category_id) if course.category_id else None,
        "category_label": course.category.label if course.category else None,
        "thumbnail_file_id": str(course.thumbnail_file_id) if course.thumbnail_file_id else None,
        "estimated_duration_minutes": course.estimated_duration_minutes,
        "tags": course.tags or [],
        "progress_percent": progress.progress_percent if progress else 0,
        "completed_at": progress.completed_at.isoformat() if progress and progress.completed_at else None,
        "certificate_id": str(certificate.id) if certificate else None,
        "certificate_expires_at": certificate.expires_at.isoformat() if certificate and certificate.expires_at else None,
    }


@router.get("/{course_id}")
def get_course(
    course_id: str,
    db: Session = Depends(get_db),
    me: User = Depends(get_current_user)
):
    """Get course details with modules/lessons (only published)"""
    try:
        course_uuid = uuid.UUID(course_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid course ID")
    
    course = db.query(TrainingCourse).filter(
        TrainingCourse.id == course_uuid,
        TrainingCourse.status == "published"
    ).first()
    
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    
    # Get user's progress
    progress = db.query(TrainingProgress).filter(
        TrainingProgress.user_id == me.id,
        TrainingProgress.course_id == course_uuid
    ).first()
    
    # Get modules with lessons
    modules = db.query(TrainingModule).filter(
        TrainingModule.course_id == course_uuid
    ).order_by(TrainingModule.order_index).all()
    
    module_data = []
    completed_lesson_ids = set()
    if progress:
        completed_lessons = db.query(TrainingCompletedLesson).filter(
            TrainingCompletedLesson.progress_id == progress.id
        ).all()
        completed_lesson_ids = {cl.lesson_id for cl in completed_lessons}
    
    for module in modules:
        lessons = db.query(TrainingLesson).filter(
            TrainingLesson.module_id == module.id
        ).order_by(TrainingLesson.order_index).all()
        
        lesson_data = []
        for lesson in lessons:
            lesson_data.append({
                "id": str(lesson.id),
                "title": lesson.title,
                "lesson_type": lesson.lesson_type,
                "order_index": lesson.order_index,
                "requires_completion": lesson.requires_completion,
                "content": lesson.content,
                "completed": lesson.id in completed_lesson_ids,
                "has_quiz": lesson.lesson_type == "quiz" or (lesson.content and lesson.content.get("quiz_id")),
            })
        
        module_data.append({
            "id": str(module.id),
            "title": module.title,
            "order_index": module.order_index,
            "lessons": lesson_data,
        })
    
    return {
        "id": str(course.id),
        "title": course.title,
        "description": course.description,
        "category_id": str(course.category_id) if course.category_id else None,
        "category_label": course.category.label if course.category else None,
        "estimated_duration_minutes": course.estimated_duration_minutes,
        "tags": course.tags or [],
        "modules": module_data,
        "progress": {
            "progress_percent": progress.progress_percent if progress else 0,
            "started_at": progress.started_at.isoformat() if progress and progress.started_at else None,
            "completed_at": progress.completed_at.isoformat() if progress and progress.completed_at else None,
            "current_module_id": str(progress.current_module_id) if progress and progress.current_module_id else None,
            "current_lesson_id": str(progress.current_lesson_id) if progress and progress.current_lesson_id else None,
        } if progress else None,
    }


@router.get("/{course_id}/progress")
def get_course_progress(
    course_id: str,
    db: Session = Depends(get_db),
    me: User = Depends(get_current_user)
):
    """Get user's progress for a course"""
    try:
        course_uuid = uuid.UUID(course_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid course ID")
    
    progress = db.query(TrainingProgress).filter(
        TrainingProgress.user_id == me.id,
        TrainingProgress.course_id == course_uuid
    ).first()
    
    if not progress:
        return {
            "progress_percent": 0,
            "started_at": None,
            "completed_at": None,
        }
    
    # Get completed lessons
    completed_lessons = db.query(TrainingCompletedLesson).filter(
        TrainingCompletedLesson.progress_id == progress.id
    ).all()
    
    return {
        "id": str(progress.id),
        "progress_percent": progress.progress_percent,
        "started_at": progress.started_at.isoformat() if progress.started_at else None,
        "completed_at": progress.completed_at.isoformat() if progress.completed_at else None,
        "last_accessed_at": progress.last_accessed_at.isoformat() if progress.last_accessed_at else None,
        "completed_lesson_ids": [str(cl.lesson_id) for cl in completed_lessons],
    }


@router.post("/{course_id}/start")
def start_course(
    course_id: str,
    db: Session = Depends(get_db),
    me: User = Depends(get_current_user)
):
    """Start a course"""
    try:
        course_uuid = uuid.UUID(course_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid course ID")
    
    course = db.query(TrainingCourse).filter(
        TrainingCourse.id == course_uuid,
        TrainingCourse.status == "published"
    ).first()
    
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    
    # Check if progress exists
    progress = db.query(TrainingProgress).filter(
        TrainingProgress.user_id == me.id,
        TrainingProgress.course_id == course_uuid
    ).first()
    
    if not progress:
        # Get first lesson
        next_lesson = get_next_lesson(course_uuid, me.id, db)
        
        progress = TrainingProgress(
            user_id=me.id,
            course_id=course_uuid,
            started_at=datetime.utcnow(),
            last_accessed_at=datetime.utcnow(),
            current_lesson_id=next_lesson.id if next_lesson else None,
            current_module_id=next_lesson.module_id if next_lesson else None,
        )
        db.add(progress)
        db.commit()
        db.refresh(progress)
    
    return {"status": "started", "progress_id": str(progress.id)}


@router.get("/{course_id}/modules/{module_id}/lessons/{lesson_id}/quiz")
def get_lesson_quiz(
    course_id: str,
    module_id: str,
    lesson_id: str,
    db: Session = Depends(get_db),
    me: User = Depends(get_current_user)
):
    """Get quiz for a lesson"""
    try:
        lesson_uuid = uuid.UUID(lesson_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid lesson ID")
    
    lesson = db.query(TrainingLesson).filter(TrainingLesson.id == lesson_uuid).first()
    if not lesson:
        raise HTTPException(status_code=404, detail="Lesson not found")
    
    quiz = None
    if lesson.lesson_type == "quiz":
        quiz = db.query(TrainingQuiz).filter(TrainingQuiz.lesson_id == lesson_uuid).first()
    elif lesson.content and lesson.content.get("quiz_id"):
        quiz_id = uuid.UUID(lesson.content["quiz_id"])
        quiz = db.query(TrainingQuiz).filter(TrainingQuiz.id == quiz_id).first()
    
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")
    
    # Get questions (without correct answers for security)
    questions = db.query(TrainingQuizQuestion).filter(
        TrainingQuizQuestion.quiz_id == quiz.id
    ).order_by(TrainingQuizQuestion.order_index).all()
    
    return {
        "id": str(quiz.id),
        "title": quiz.title,
        "passing_score_percent": quiz.passing_score_percent,
        "allow_retry": quiz.allow_retry,
        "questions": [{
            "id": str(q.id),
            "question_text": q.question_text,
            "question_type": q.question_type,
            "order_index": q.order_index,
            "options": q.options or [],
            # Don't send correct_answer to frontend for security
        } for q in questions],
    }


@router.post("/{course_id}/modules/{module_id}/lessons/{lesson_id}/complete")
def complete_lesson(
    course_id: str,
    module_id: str,
    lesson_id: str,
    db: Session = Depends(get_db),
    me: User = Depends(get_current_user)
):
    """Mark lesson as complete"""
    try:
        course_uuid = uuid.UUID(course_id)
        lesson_uuid = uuid.UUID(lesson_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid ID")
    
    # Get progress
    progress = db.query(TrainingProgress).filter(
        TrainingProgress.user_id == me.id,
        TrainingProgress.course_id == course_uuid
    ).first()
    
    if not progress:
        raise HTTPException(status_code=404, detail="Progress not found. Start the course first.")
    
    # Update progress
    update_lesson_progress(progress.id, lesson_uuid, None, db)
    
    # Get next lesson
    next_lesson = get_next_lesson(course_uuid, me.id, db)
    
    if next_lesson:
        progress.current_lesson_id = next_lesson.id
        progress.current_module_id = next_lesson.module_id
    else:
        # Course complete
        progress.current_lesson_id = None
        progress.current_module_id = None
    
    progress.last_accessed_at = datetime.utcnow()
    db.commit()
    
    return {"status": "completed", "next_lesson_id": str(next_lesson.id) if next_lesson else None}


@router.post("/{course_id}/modules/{module_id}/lessons/{lesson_id}/quiz/submit")
def submit_quiz(
    course_id: str,
    module_id: str,
    lesson_id: str,
    submission: QuizSubmissionRequest,
    db: Session = Depends(get_db),
    me: User = Depends(get_current_user)
):
    """Submit quiz answers"""
    try:
        course_uuid = uuid.UUID(course_id)
        lesson_uuid = uuid.UUID(lesson_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid ID")
    
    # Get lesson and quiz
    lesson = db.query(TrainingLesson).filter(TrainingLesson.id == lesson_uuid).first()
    if not lesson:
        raise HTTPException(status_code=404, detail="Lesson not found")
    
    quiz_id = None
    if lesson.lesson_type == "quiz":
        # Quiz is the lesson itself
        quiz = db.query(TrainingQuiz).filter(TrainingQuiz.lesson_id == lesson_uuid).first()
    elif lesson.content and lesson.content.get("quiz_id"):
        quiz_id = uuid.UUID(lesson.content["quiz_id"])
        quiz = db.query(TrainingQuiz).filter(TrainingQuiz.id == quiz_id).first()
    else:
        raise HTTPException(status_code=400, detail="Lesson does not have a quiz")
    
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")
    
    # Get questions
    questions = db.query(TrainingQuizQuestion).filter(
        TrainingQuizQuestion.quiz_id == quiz.id
    ).order_by(TrainingQuizQuestion.order_index).all()
    
    # Grade quiz
    correct_count = 0
    total_count = len(questions)
    results = {}
    
    for question in questions:
        user_answer = submission.answers.get(str(question.id))
        is_correct = user_answer == question.correct_answer
        results[str(question.id)] = is_correct
        if is_correct:
            correct_count += 1
    
    score_percent = int((correct_count / total_count) * 100) if total_count > 0 else 0
    passed = score_percent >= quiz.passing_score_percent
    
    # Get progress
    progress = db.query(TrainingProgress).filter(
        TrainingProgress.user_id == me.id,
        TrainingProgress.course_id == course_uuid
    ).first()
    
    if not progress:
        raise HTTPException(status_code=404, detail="Progress not found")
    
    # Update progress with quiz score
    if passed:
        update_lesson_progress(progress.id, lesson_uuid, score_percent, db)
    
    # Get next lesson
    next_lesson = get_next_lesson(course_uuid, me.id, db)
    
    if next_lesson:
        progress.current_lesson_id = next_lesson.id
        progress.current_module_id = next_lesson.module_id
    else:
        progress.current_lesson_id = None
        progress.current_module_id = None
    
    progress.last_accessed_at = datetime.utcnow()
    db.commit()
    
    return QuizSubmissionResponse(
        passed=passed,
        score_percent=score_percent,
        correct_count=correct_count,
        total_count=total_count,
        can_retry=quiz.allow_retry and not passed,
        results=results,
    )


@router.get("/certificates")
def list_certificates(
    db: Session = Depends(get_db),
    me: User = Depends(get_current_user)
):
    """List user's certificates"""
    certificates = db.query(TrainingCertificate).filter(
        TrainingCertificate.user_id == me.id
    ).order_by(TrainingCertificate.issued_at.desc()).all()
    
    result = []
    for cert in certificates:
        course = db.query(TrainingCourse).filter(TrainingCourse.id == cert.course_id).first()
        result.append({
            "id": str(cert.id),
            "course_id": str(cert.course_id),
            "course_title": course.title if course else None,
            "issued_at": cert.issued_at.isoformat(),
            "expires_at": cert.expires_at.isoformat() if cert.expires_at else None,
            "certificate_number": cert.certificate_number,
            "qr_code_data": cert.qr_code_data,
            "certificate_file_id": str(cert.certificate_file_id) if cert.certificate_file_id else None,
            "is_expired": cert.expires_at < datetime.utcnow() if cert.expires_at else False,
        })
    
    return result


def get_storage_for_file(fo: FileObject) -> StorageProvider:
    """Get the appropriate storage provider for a specific file"""
    if fo.provider == "blob":
        if settings.azure_blob_connection and settings.azure_blob_container:
            try:
                return BlobStorageProvider()
            except Exception:
                pass
    return LocalStorageProvider()


@router.get("/certificates/{certificate_id}/download")
def download_certificate(
    certificate_id: str,
    db: Session = Depends(get_db),
    me: User = Depends(get_current_user)
):
    """Download certificate PDF"""
    try:
        cert_uuid = uuid.UUID(certificate_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid certificate ID")
    
    certificate = db.query(TrainingCertificate).filter(
        TrainingCertificate.id == cert_uuid,
        TrainingCertificate.user_id == me.id
    ).first()
    
    if not certificate:
        raise HTTPException(status_code=404, detail="Certificate not found")
    
    if not certificate.certificate_file_id:
        raise HTTPException(status_code=404, detail="Certificate file not generated yet")
    
    # Get file object
    file_obj = db.query(FileObject).filter(FileObject.id == certificate.certificate_file_id).first()
    if not file_obj:
        raise HTTPException(status_code=404, detail="Certificate file not found")
    
    # Get storage provider
    storage = get_storage_for_file(file_obj)
    
    # For local storage, serve file directly
    if isinstance(storage, LocalStorageProvider):
        from pathlib import Path
        file_path = storage._get_path(file_obj.key)
        if not file_path.exists():
            raise HTTPException(status_code=404, detail="Certificate file not found on disk")
        
        return FileResponse(
            path=str(file_path),
            media_type="application/pdf",
            filename=f"certificate-{certificate.certificate_number}.pdf"
        )
    
    # For blob storage, return download URL
    url = storage.get_download_url(file_obj.key, expires_s=300)
    if not url:
        raise HTTPException(status_code=500, detail="Failed to generate download URL")
    
    return {"download_url": url, "expires_in": 300}


# =====================
# Admin Endpoints
# =====================

@router.get("/admin/courses")
def list_admin_courses(
    status: Optional[str] = Query(None),
    category_id: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    _=Depends(require_permissions("users:write"))
):
    """List all courses (admin view, includes drafts)"""
    query = db.query(TrainingCourse)
    
    if status:
        query = query.filter(TrainingCourse.status == status)
    
    if category_id:
        try:
            cat_uuid = uuid.UUID(category_id)
            query = query.filter(TrainingCourse.category_id == cat_uuid)
        except ValueError:
            pass
    
    courses = query.order_by(TrainingCourse.created_at.desc()).all()
    
    result = []
    for course in courses:
        # Count modules and lessons
        module_count = db.query(TrainingModule).filter(TrainingModule.course_id == course.id).count()
        lesson_count = db.query(TrainingLesson).join(TrainingModule).filter(
            TrainingModule.course_id == course.id
        ).count()
        
        result.append({
            "id": str(course.id),
            "title": course.title,
            "description": course.description,
            "status": course.status,
            "category_id": str(course.category_id) if course.category_id else None,
            "category_label": course.category.label if course.category else None,
            "thumbnail_file_id": str(course.thumbnail_file_id) if course.thumbnail_file_id else None,
            "estimated_duration_minutes": course.estimated_duration_minutes,
            "tags": course.tags or [],
            "is_required": course.is_required,
            "module_count": module_count,
            "lesson_count": lesson_count,
            "created_at": course.created_at.isoformat(),
            "last_published_at": course.last_published_at.isoformat() if course.last_published_at else None,
        })
    
    return result


@router.post("/admin/courses")
def create_course(
    course_data: CourseCreate,
    db: Session = Depends(get_db),
    me: User = Depends(require_permissions("users:write"))
):
    """Create a new course (starts as draft)"""
    course = TrainingCourse(
        title=course_data.title,
        description=course_data.description,
        category_id=course_data.category_id,
        thumbnail_file_id=course_data.thumbnail_file_id,
        estimated_duration_minutes=course_data.estimated_duration_minutes,
        tags=course_data.tags,
        is_required=course_data.is_required,
        renewal_frequency=course_data.renewal_frequency,
        renewal_frequency_days=course_data.renewal_frequency_days,
        generates_certificate=course_data.generates_certificate,
        certificate_validity_days=course_data.certificate_validity_days,
        certificate_text=course_data.certificate_text,
        status="draft",
        created_by=me.id,
    )
    
    db.add(course)
    db.flush()
    
    # Add required assignments
    if course_data.required_role_ids:
        roles = db.query(Role).filter(Role.id.in_(course_data.required_role_ids)).all()
        course.required_roles = roles
    
    if course_data.required_division_ids:
        divisions = db.query(SettingItem).filter(SettingItem.id.in_(course_data.required_division_ids)).all()
        course.required_divisions = divisions
    
    if course_data.required_user_ids:
        users = db.query(User).filter(User.id.in_(course_data.required_user_ids)).all()
        course.required_users = users
    
    db.commit()
    db.refresh(course)
    
    return {"id": str(course.id), "status": course.status}


@router.get("/admin/courses/{course_id}")
def get_admin_course(
    course_id: str,
    db: Session = Depends(get_db),
    _=Depends(require_permissions("users:write"))
):
    """Get full course with all modules/lessons (admin view, includes drafts)"""
    try:
        course_uuid = uuid.UUID(course_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid course ID")
    
    course = db.query(TrainingCourse).filter(TrainingCourse.id == course_uuid).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    
    # Get modules with lessons
    modules = db.query(TrainingModule).filter(
        TrainingModule.course_id == course_uuid
    ).order_by(TrainingModule.order_index).all()
    
    module_data = []
    for module in modules:
        lessons = db.query(TrainingLesson).filter(
            TrainingLesson.module_id == module.id
        ).order_by(TrainingLesson.order_index).all()
        
        lesson_data = []
        for lesson in lessons:
            quiz_data = None
            if lesson.lesson_type == "quiz":
                quiz = db.query(TrainingQuiz).filter(TrainingQuiz.lesson_id == lesson.id).first()
                if quiz:
                    questions = db.query(TrainingQuizQuestion).filter(
                        TrainingQuizQuestion.quiz_id == quiz.id
                    ).order_by(TrainingQuizQuestion.order_index).all()
                    quiz_data = {
                        "id": str(quiz.id),
                        "title": quiz.title,
                        "passing_score_percent": quiz.passing_score_percent,
                        "allow_retry": quiz.allow_retry,
                        "questions": [{
                            "id": str(q.id),
                            "question_text": q.question_text,
                            "question_type": q.question_type,
                            "order_index": q.order_index,
                            "correct_answer": q.correct_answer,
                            "options": q.options or [],
                        } for q in questions],
                    }
            
            lesson_data.append({
                "id": str(lesson.id),
                "title": lesson.title,
                "lesson_type": lesson.lesson_type,
                "order_index": lesson.order_index,
                "requires_completion": lesson.requires_completion,
                "content": lesson.content,
                "quiz": quiz_data,
            })
        
        module_data.append({
            "id": str(module.id),
            "title": module.title,
            "order_index": module.order_index,
            "lessons": lesson_data,
        })
    
    return {
        "id": str(course.id),
        "title": course.title,
        "description": course.description,
        "category_id": str(course.category_id) if course.category_id else None,
        "status": course.status,
        "thumbnail_file_id": str(course.thumbnail_file_id) if course.thumbnail_file_id else None,
        "estimated_duration_minutes": course.estimated_duration_minutes,
        "tags": course.tags or [],
        "is_required": course.is_required,
        "renewal_frequency": course.renewal_frequency,
        "renewal_frequency_days": course.renewal_frequency_days,
        "generates_certificate": course.generates_certificate,
        "certificate_validity_days": course.certificate_validity_days,
        "certificate_text": course.certificate_text,
        "required_role_ids": [str(r.id) for r in course.required_roles],
        "required_division_ids": [str(d.id) for d in course.required_divisions],
        "required_user_ids": [str(u.id) for u in course.required_users],
        "modules": module_data,
        "created_at": course.created_at.isoformat(),
        "updated_at": course.updated_at.isoformat() if course.updated_at else None,
        "last_published_at": course.last_published_at.isoformat() if course.last_published_at else None,
    }


@router.put("/admin/courses/{course_id}")
def update_course(
    course_id: str,
    course_data: CourseUpdate,
    db: Session = Depends(get_db),
    _=Depends(require_permissions("users:write"))
):
    """Update course metadata"""
    try:
        course_uuid = uuid.UUID(course_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid course ID")
    
    course = db.query(TrainingCourse).filter(TrainingCourse.id == course_uuid).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    
    # Update fields
    if course_data.title is not None:
        course.title = course_data.title
    if course_data.description is not None:
        course.description = course_data.description
    if course_data.category_id is not None:
        course.category_id = course_data.category_id
    if course_data.thumbnail_file_id is not None:
        course.thumbnail_file_id = course_data.thumbnail_file_id
    if course_data.estimated_duration_minutes is not None:
        course.estimated_duration_minutes = course_data.estimated_duration_minutes
    if course_data.tags is not None:
        course.tags = course_data.tags
    if course_data.status is not None:
        course.status = course_data.status
    if course_data.is_required is not None:
        course.is_required = course_data.is_required
    if course_data.renewal_frequency is not None:
        course.renewal_frequency = course_data.renewal_frequency
    if course_data.renewal_frequency_days is not None:
        course.renewal_frequency_days = course_data.renewal_frequency_days
    if course_data.generates_certificate is not None:
        course.generates_certificate = course_data.generates_certificate
    if course_data.certificate_validity_days is not None:
        course.certificate_validity_days = course_data.certificate_validity_days
    if course_data.certificate_text is not None:
        course.certificate_text = course_data.certificate_text
    
    course.updated_at = datetime.utcnow()
    
    # Update required assignments
    if course_data.required_role_ids is not None:
        roles = db.query(Role).filter(Role.id.in_(course_data.required_role_ids)).all()
        course.required_roles = roles
    
    if course_data.required_division_ids is not None:
        divisions = db.query(SettingItem).filter(SettingItem.id.in_(course_data.required_division_ids)).all()
        course.required_divisions = divisions
    
    if course_data.required_user_ids is not None:
        users = db.query(User).filter(User.id.in_(course_data.required_user_ids)).all()
        course.required_users = users
    
    db.commit()
    
    return {"status": "updated"}


@router.post("/admin/courses/{course_id}/publish")
def publish_course_endpoint(
    course_id: str,
    db: Session = Depends(get_db),
    _=Depends(require_permissions("users:write"))
):
    """Publish a course"""
    try:
        course_uuid = uuid.UUID(course_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid course ID")
    
    success, error = publish_course(course_uuid, db)
    if not success:
        raise HTTPException(status_code=400, detail=error)
    
    return {"status": "published"}


@router.post("/admin/courses/{course_id}/unpublish")
def unpublish_course_endpoint(
    course_id: str,
    db: Session = Depends(get_db),
    _=Depends(require_permissions("users:write"))
):
    """Unpublish a course"""
    try:
        course_uuid = uuid.UUID(course_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid course ID")
    
    unpublish_course(course_uuid, db)
    return {"status": "unpublished"}


@router.post("/admin/courses/{course_id}/duplicate")
def duplicate_course_endpoint(
    course_id: str,
    body: dict = Body(...),
    db: Session = Depends(get_db),
    me: User = Depends(get_current_user)
):
    """Duplicate a course"""
    try:
        course_uuid = uuid.UUID(course_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid course ID")
    
    # Get original course to use as fallback title
    original_course = db.query(TrainingCourse).filter(TrainingCourse.id == course_uuid).first()
    if not original_course:
        raise HTTPException(status_code=404, detail="Course not found")
    
    new_title = body.get("new_title") or body.get("newTitle") or f"{original_course.title} (Copy)"
    if not new_title:
        raise HTTPException(status_code=400, detail="new_title is required")
    
    new_course = duplicate_course(course_uuid, new_title, me.id, db)
    if not new_course:
        raise HTTPException(status_code=404, detail="Failed to duplicate course")
    
    return {"id": str(new_course.id), "title": new_course.title}


@router.delete("/admin/courses/{course_id}")
def delete_course(
    course_id: str,
    db: Session = Depends(get_db),
    _=Depends(require_permissions("users:write"))
):
    """Delete a course (soft delete if has progress)"""
    try:
        course_uuid = uuid.UUID(course_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid course ID")
    
    course = db.query(TrainingCourse).filter(TrainingCourse.id == course_uuid).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    
    # Check if course has progress
    has_progress = db.query(TrainingProgress).filter(TrainingProgress.course_id == course_uuid).first()
    
    if has_progress:
        # Soft delete: change status to draft and mark as inactive
        course.status = "draft"
        course.updated_at = datetime.utcnow()
    else:
        # Hard delete
        db.delete(course)
    
    db.commit()
    return {"status": "deleted"}


@router.post("/admin/courses/{course_id}/modules")
def create_module(
    course_id: str,
    module_data: ModuleCreate,
    db: Session = Depends(get_db),
    _=Depends(require_permissions("users:write"))
):
    """Create a module"""
    try:
        course_uuid = uuid.UUID(course_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid course ID")
    
    course = db.query(TrainingCourse).filter(TrainingCourse.id == course_uuid).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    
    # Get max order_index
    max_order = db.query(func.max(TrainingModule.order_index)).filter(
        TrainingModule.course_id == course_uuid
    ).scalar() or 0
    
    module = TrainingModule(
        course_id=course_uuid,
        title=module_data.title,
        order_index=module_data.order_index if module_data.order_index is not None else max_order + 1,
    )
    
    db.add(module)
    db.commit()
    db.refresh(module)
    
    return {"id": str(module.id)}


@router.put("/admin/courses/{course_id}/modules/{module_id}")
def update_module(
    course_id: str,
    module_id: str,
    module_data: ModuleUpdate,
    db: Session = Depends(get_db),
    _=Depends(require_permissions("users:write"))
):
    """Update module"""
    try:
        module_uuid = uuid.UUID(module_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid module ID")
    
    module = db.query(TrainingModule).filter(TrainingModule.id == module_uuid).first()
    if not module:
        raise HTTPException(status_code=404, detail="Module not found")
    
    if module_data.title is not None:
        module.title = module_data.title
    if module_data.order_index is not None:
        module.order_index = module_data.order_index
    
    db.commit()
    return {"status": "updated"}


@router.post("/admin/courses/{course_id}/modules/reorder")
def reorder_modules(
    course_id: str,
    reorder_data: ReorderModulesRequest,
    db: Session = Depends(get_db),
    _=Depends(require_permissions("users:write"))
):
    """Bulk reorder modules"""
    try:
        course_uuid = uuid.UUID(course_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid course ID")
    
    for index, module_id in enumerate(reorder_data.module_ids):
        try:
            module_uuid = uuid.UUID(module_id)
            module = db.query(TrainingModule).filter(
                TrainingModule.id == module_uuid,
                TrainingModule.course_id == course_uuid
            ).first()
            if module:
                module.order_index = index
        except ValueError:
            continue
    
    db.commit()
    return {"status": "reordered"}


@router.delete("/admin/courses/{course_id}/modules/{module_id}")
def delete_module(
    course_id: str,
    module_id: str,
    db: Session = Depends(get_db),
    _=Depends(require_permissions("users:write"))
):
    """Delete a module"""
    try:
        module_uuid = uuid.UUID(module_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid module ID")
    
    module = db.query(TrainingModule).filter(TrainingModule.id == module_uuid).first()
    if not module:
        raise HTTPException(status_code=404, detail="Module not found")
    
    db.delete(module)
    db.commit()
    return {"status": "deleted"}


@router.post("/admin/courses/{course_id}/modules/{module_id}/lessons")
def create_lesson(
    course_id: str,
    module_id: str,
    lesson_data: LessonCreate,
    db: Session = Depends(get_db),
    _=Depends(require_permissions("users:write"))
):
    """Create a lesson"""
    try:
        module_uuid = uuid.UUID(module_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid module ID")
    
    module = db.query(TrainingModule).filter(TrainingModule.id == module_uuid).first()
    if not module:
        raise HTTPException(status_code=404, detail="Module not found")
    
    # Get max order_index
    max_order = db.query(func.max(TrainingLesson.order_index)).filter(
        TrainingLesson.module_id == module_uuid
    ).scalar() or 0
    
    lesson = TrainingLesson(
        module_id=module_uuid,
        lesson_type=lesson_data.lesson_type,
        title=lesson_data.title,
        order_index=lesson_data.order_index if lesson_data.order_index is not None else max_order + 1,
        requires_completion=lesson_data.requires_completion,
        content=lesson_data.content,
    )
    
    db.add(lesson)
    db.flush()
    
    # If lesson type is quiz, create quiz
    if lesson_data.lesson_type == "quiz" and lesson_data.content and lesson_data.content.get("quiz_id"):
        # Link existing quiz
        quiz_uuid = uuid.UUID(lesson_data.content["quiz_id"])
        quiz = db.query(TrainingQuiz).filter(TrainingQuiz.id == quiz_uuid).first()
        if quiz:
            quiz.lesson_id = lesson.id
    
    db.commit()
    db.refresh(lesson)
    
    return {"id": str(lesson.id)}


@router.put("/admin/courses/{course_id}/modules/{module_id}/lessons/{lesson_id}")
def update_lesson(
    course_id: str,
    module_id: str,
    lesson_id: str,
    lesson_data: LessonUpdate,
    db: Session = Depends(get_db),
    _=Depends(require_permissions("users:write"))
):
    """Update lesson"""
    try:
        lesson_uuid = uuid.UUID(lesson_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid lesson ID")
    
    lesson = db.query(TrainingLesson).filter(TrainingLesson.id == lesson_uuid).first()
    if not lesson:
        raise HTTPException(status_code=404, detail="Lesson not found")
    
    if lesson_data.title is not None:
        lesson.title = lesson_data.title
    if lesson_data.lesson_type is not None:
        lesson.lesson_type = lesson_data.lesson_type
    if lesson_data.order_index is not None:
        lesson.order_index = lesson_data.order_index
    if lesson_data.requires_completion is not None:
        lesson.requires_completion = lesson_data.requires_completion
    if lesson_data.content is not None:
        lesson.content = lesson_data.content
    
    db.commit()
    return {"status": "updated"}


@router.post("/admin/courses/{course_id}/modules/{module_id}/lessons/reorder")
def reorder_lessons(
    course_id: str,
    module_id: str,
    reorder_data: ReorderLessonsRequest,
    db: Session = Depends(get_db),
    _=Depends(require_permissions("users:write"))
):
    """Bulk reorder lessons"""
    try:
        module_uuid = uuid.UUID(module_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid module ID")
    
    for index, lesson_id in enumerate(reorder_data.lesson_ids):
        try:
            lesson_uuid = uuid.UUID(lesson_id)
            lesson = db.query(TrainingLesson).filter(
                TrainingLesson.id == lesson_uuid,
                TrainingLesson.module_id == module_uuid
            ).first()
            if lesson:
                lesson.order_index = index
        except ValueError:
            continue
    
    db.commit()
    return {"status": "reordered"}


@router.delete("/admin/courses/{course_id}/modules/{module_id}/lessons/{lesson_id}")
def delete_lesson(
    course_id: str,
    module_id: str,
    lesson_id: str,
    db: Session = Depends(get_db),
    _=Depends(require_permissions("users:write"))
):
    """Delete a lesson"""
    try:
        lesson_uuid = uuid.UUID(lesson_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid lesson ID")
    
    lesson = db.query(TrainingLesson).filter(TrainingLesson.id == lesson_uuid).first()
    if not lesson:
        raise HTTPException(status_code=404, detail="Lesson not found")
    
    db.delete(lesson)
    db.commit()
    return {"status": "deleted"}


@router.post("/admin/quizzes")
def create_quiz(
    quiz_data: QuizCreate,
    db: Session = Depends(get_db),
    _=Depends(require_permissions("users:write"))
):
    """Create a quiz"""
    quiz = TrainingQuiz(
        lesson_id=quiz_data.lesson_id,
        title=quiz_data.title,
        passing_score_percent=quiz_data.passing_score_percent,
        allow_retry=quiz_data.allow_retry,
    )
    
    db.add(quiz)
    db.commit()
    db.refresh(quiz)
    
    return {"id": str(quiz.id)}


@router.get("/admin/quizzes/{quiz_id}")
def get_quiz(
    quiz_id: str,
    db: Session = Depends(get_db),
    _=Depends(require_permissions("users:write"))
):
    """Get quiz with questions"""
    try:
        quiz_uuid = uuid.UUID(quiz_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid quiz ID")
    
    quiz = db.query(TrainingQuiz).filter(TrainingQuiz.id == quiz_uuid).first()
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")
    
    questions = db.query(TrainingQuizQuestion).filter(
        TrainingQuizQuestion.quiz_id == quiz_uuid
    ).order_by(TrainingQuizQuestion.order_index).all()
    
    return {
        "id": str(quiz.id),
        "lesson_id": str(quiz.lesson_id) if quiz.lesson_id else None,
        "title": quiz.title,
        "passing_score_percent": quiz.passing_score_percent,
        "allow_retry": quiz.allow_retry,
        "questions": [{
            "id": str(q.id),
            "question_text": q.question_text,
            "question_type": q.question_type,
            "order_index": q.order_index,
            "correct_answer": q.correct_answer,
            "options": q.options or [],
        } for q in questions],
    }


@router.put("/admin/quizzes/{quiz_id}")
def update_quiz(
    quiz_id: str,
    quiz_data: QuizUpdate,
    db: Session = Depends(get_db),
    _=Depends(require_permissions("users:write"))
):
    """Update quiz settings"""
    try:
        quiz_uuid = uuid.UUID(quiz_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid quiz ID")
    
    quiz = db.query(TrainingQuiz).filter(TrainingQuiz.id == quiz_uuid).first()
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")
    
    if quiz_data.title is not None:
        quiz.title = quiz_data.title
    if quiz_data.passing_score_percent is not None:
        quiz.passing_score_percent = quiz_data.passing_score_percent
    if quiz_data.allow_retry is not None:
        quiz.allow_retry = quiz_data.allow_retry
    
    db.commit()
    return {"status": "updated"}


@router.post("/admin/quizzes/{quiz_id}/questions")
def add_quiz_question(
    quiz_id: str,
    question_data: QuizQuestionCreate,
    db: Session = Depends(get_db),
    _=Depends(require_permissions("users:write"))
):
    """Add quiz question"""
    try:
        quiz_uuid = uuid.UUID(quiz_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid quiz ID")
    
    quiz = db.query(TrainingQuiz).filter(TrainingQuiz.id == quiz_uuid).first()
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")
    
    # Get max order_index
    max_order = db.query(func.max(TrainingQuizQuestion.order_index)).filter(
        TrainingQuizQuestion.quiz_id == quiz_uuid
    ).scalar() or 0
    
    question = TrainingQuizQuestion(
        quiz_id=quiz_uuid,
        question_text=question_data.question_text,
        question_type=question_data.question_type,
        order_index=question_data.order_index if question_data.order_index is not None else max_order + 1,
        correct_answer=question_data.correct_answer,
        options=question_data.options,
    )
    
    db.add(question)
    db.commit()
    db.refresh(question)
    
    return {"id": str(question.id)}


@router.put("/admin/quizzes/{quiz_id}/questions/{question_id}")
def update_quiz_question(
    quiz_id: str,
    question_id: str,
    question_data: QuizQuestionUpdate,
    db: Session = Depends(get_db),
    _=Depends(require_permissions("users:write"))
):
    """Update quiz question"""
    try:
        question_uuid = uuid.UUID(question_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid question ID")
    
    question = db.query(TrainingQuizQuestion).filter(TrainingQuizQuestion.id == question_uuid).first()
    if not question:
        raise HTTPException(status_code=404, detail="Question not found")
    
    if question_data.question_text is not None:
        question.question_text = question_data.question_text
    if question_data.question_type is not None:
        question.question_type = question_data.question_type
    if question_data.order_index is not None:
        question.order_index = question_data.order_index
    if question_data.correct_answer is not None:
        question.correct_answer = question_data.correct_answer
    if question_data.options is not None:
        question.options = question_data.options
    
    db.commit()
    return {"status": "updated"}


@router.post("/admin/quizzes/{quiz_id}/questions/reorder")
def reorder_questions(
    quiz_id: str,
    reorder_data: ReorderQuestionsRequest,
    db: Session = Depends(get_db),
    _=Depends(require_permissions("users:write"))
):
    """Bulk reorder questions"""
    try:
        quiz_uuid = uuid.UUID(quiz_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid quiz ID")
    
    for index, question_id in enumerate(reorder_data.question_ids):
        try:
            question_uuid = uuid.UUID(question_id)
            question = db.query(TrainingQuizQuestion).filter(
                TrainingQuizQuestion.id == question_uuid,
                TrainingQuizQuestion.quiz_id == quiz_uuid
            ).first()
            if question:
                question.order_index = index
        except ValueError:
            continue
    
    db.commit()
    return {"status": "reordered"}


@router.delete("/admin/quizzes/{quiz_id}/questions/{question_id}")
def delete_quiz_question(
    quiz_id: str,
    question_id: str,
    db: Session = Depends(get_db),
    _=Depends(require_permissions("users:write"))
):
    """Delete quiz question"""
    try:
        question_uuid = uuid.UUID(question_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid question ID")
    
    question = db.query(TrainingQuizQuestion).filter(TrainingQuizQuestion.id == question_uuid).first()
    if not question:
        raise HTTPException(status_code=404, detail="Question not found")
    
    db.delete(question)
    db.commit()
    return {"status": "deleted"}


@router.get("/admin/overdue")
def get_overdue_training(
    db: Session = Depends(get_db),
    _=Depends(require_permissions("users:write"))
):
    """List employees with overdue training"""
    now = datetime.utcnow()
    
    # Find expired certificates
    expired_certs = db.query(TrainingCertificate).filter(
        TrainingCertificate.expires_at.isnot(None),
        TrainingCertificate.expires_at <= now
    ).all()
    
    result = []
    for cert in expired_certs:
        course = db.query(TrainingCourse).filter(TrainingCourse.id == cert.course_id).first()
        user = db.query(User).filter(User.id == cert.user_id).first()
        profile = db.query(EmployeeProfile).filter(EmployeeProfile.user_id == cert.user_id).first()
        
        user_name = get_user_display(db, cert.user_id) or user.username if user else "Unknown"
        
        result.append({
            "user_id": str(cert.user_id),
            "user_name": user_name,
            "course_id": str(cert.course_id),
            "course_title": course.title if course else None,
            "certificate_id": str(cert.id),
            "expired_at": cert.expires_at.isoformat() if cert.expires_at else None,
            "days_overdue": (now - cert.expires_at).days if cert.expires_at else 0,
        })
    
    return result


@router.get("/admin/status")
def get_training_status(
    db: Session = Depends(get_db),
    _=Depends(require_permissions("users:write"))
):
    """Dashboard: completion rates, overdue training, course statistics"""
    # Total courses
    total_courses = db.query(TrainingCourse).count()
    published_courses = db.query(TrainingCourse).filter(TrainingCourse.status == "published").count()
    draft_courses = db.query(TrainingCourse).filter(TrainingCourse.status == "draft").count()
    
    # Total completions
    total_completions = db.query(TrainingProgress).filter(
        TrainingProgress.completed_at.isnot(None)
    ).count()
    
    # Overdue certificates
    now = datetime.utcnow()
    overdue_count = db.query(TrainingCertificate).filter(
        TrainingCertificate.expires_at.isnot(None),
        TrainingCertificate.expires_at <= now
    ).count()
    
    return {
        "total_courses": total_courses,
        "published_courses": published_courses,
        "draft_courses": draft_courses,
        "total_completions": total_completions,
        "overdue_certificates": overdue_count,
    }

