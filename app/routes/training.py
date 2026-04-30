import uuid
from datetime import datetime
from typing import List, Optional, Dict, Any
from types import SimpleNamespace
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_, func

from fastapi import APIRouter, Depends, HTTPException, Body, Query
from fastapi.responses import FileResponse, StreamingResponse, Response
from io import BytesIO

from ..db import get_db
from ..auth.security import get_current_user, require_permissions
from ..models.models import (
    TrainingCourse,
    TrainingModule,
    TrainingLesson,
    TrainingQuiz,
    TrainingQuizQuestion,
    TrainingQuizUserAttempt,
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
    validate_and_normalize_quiz_question,
)
from ..services.training import (
    get_required_courses_for_user,
    get_next_lesson,
    update_lesson_progress,
    publish_course,
    unpublish_course,
    duplicate_course,
    validate_course_for_publishing,
    check_renewal_requirements,
    reconcile_training_progress_row,
    effective_max_attempts,
    sync_allow_retry_flag,
)
from ..services.training_matrix_slots import is_valid_matrix_training_id
from ..training_matrix_catalog import normalize_matrix_training_id
from ..services.task_service import get_user_display
from ..storage.provider import StorageProvider
from ..storage.local_provider import LocalStorageProvider
from ..storage.blob_provider import BlobStorageProvider
from ..config import settings
router = APIRouter(prefix="/training", tags=["training"])


def _normalize_multi_answer_indices(s: Optional[str]) -> str:
    if not s or not str(s).strip():
        return ""
    parts = [p.strip() for p in str(s).split(",") if p.strip()]
    try:
        return ",".join(str(x) for x in sorted(int(p) for p in parts))
    except ValueError:
        return str(s).strip()


def _grade_quiz_answer(question: TrainingQuizQuestion, user_answer: Optional[str]) -> bool:
    ua = (user_answer if user_answer is not None else "").strip()
    ca = (question.correct_answer or "").strip()
    qt = question.question_type
    if qt == "multiple_select":
        return _normalize_multi_answer_indices(ua) == _normalize_multi_answer_indices(ca)
    if qt in ("single_choice", "multiple_choice"):
        return ua == ca
    if qt == "true_false":
        return ua.lower() == ca.lower()
    return False


def _normalize_certificate_background_preset_key(raw: Optional[str]) -> Optional[str]:
    from ..services.training_certificate_assets import is_valid_preset_key

    if raw is None:
        return None
    s = raw.strip() if isinstance(raw, str) else ""
    if not s:
        return None
    if not is_valid_preset_key(s):
        raise HTTPException(status_code=400, detail="Invalid certificate_background_preset_key")
    return s


def _normalize_certificate_logo_setting_item_id(raw: Any, db: Session) -> Optional[uuid.UUID]:
    from ..services.organization_logos import is_valid_organization_logo_setting_item

    if raw is None or raw == "":
        return None
    try:
        uid = uuid.UUID(str(raw))
    except (ValueError, TypeError):
        raise HTTPException(status_code=400, detail="Invalid certificate_logo_setting_item_id")
    if not is_valid_organization_logo_setting_item(db, uid):
        raise HTTPException(status_code=400, detail="Unknown organization logo preset")
    return uid


def _normalize_certificate_background_setting_item_id(raw: Any, db: Session) -> Optional[uuid.UUID]:
    from ..services.certificate_background_library import is_valid_certificate_background_setting_item

    if raw is None or raw == "":
        return None
    try:
        uid = uuid.UUID(str(raw))
    except (ValueError, TypeError):
        raise HTTPException(status_code=400, detail="Invalid certificate_background_setting_item_id")
    if not is_valid_certificate_background_setting_item(db, uid):
        raise HTTPException(status_code=400, detail="Unknown certificate background preset")
    return uid


@router.get("/certificate-background-presets")
def list_certificate_background_presets(
    db: Session = Depends(get_db),
    _=Depends(require_permissions("training:manage", "users:write")),
):
    from ..services.certificate_background_library import list_certificate_background_choices_for_api

    return {"presets": list_certificate_background_choices_for_api(db)}


@router.get("/organization-logo-presets")
def list_organization_logo_presets(
    db: Session = Depends(get_db),
    _=Depends(require_permissions("training:manage", "users:write")),
):
    from ..services.organization_logos import list_organization_logo_presets_for_api

    return {"logos": list_organization_logo_presets_for_api(db)}


@router.get("/certificate-background-assets/{asset_key}.png")
def get_certificate_background_asset_png(asset_key: str):
    """
    Public allowlisted PNGs for certificate backgrounds. No JWT: <img src> cannot send Authorization.
    Keys are validated against bundled presets only.
    """
    from ..services.training_certificate_assets import _preset_png_path

    path = _preset_png_path(asset_key)
    if not path:
        raise HTTPException(status_code=404, detail="Unknown certificate background")
    return FileResponse(
        path,
        media_type="image/png",
        headers={"Cache-Control": "public, max-age=86400"},
    )


@router.get("/certificate-background-library/{item_id}")
def get_certificate_background_library_image(item_id: str, db: Session = Depends(get_db)):
    """
    Public image bytes for library backgrounds (Settings). No JWT: <img src> cannot send Authorization.
    """
    try:
        uid = uuid.UUID(str(item_id).strip())
    except (ValueError, TypeError):
        raise HTTPException(status_code=404, detail="Unknown certificate background")
    from ..services.certificate_background_library import (
        is_valid_certificate_background_setting_item,
        resolve_certificate_background_file_id,
    )
    from ..services.file_object_read import read_file_object_bytes

    if not is_valid_certificate_background_setting_item(db, uid):
        raise HTTPException(status_code=404, detail="Unknown certificate background")
    fid = resolve_certificate_background_file_id(db, uid)
    if not fid:
        raise HTTPException(status_code=404, detail="Unknown certificate background")
    fo = db.query(FileObject).filter(FileObject.id == fid).first()
    if not fo:
        raise HTTPException(status_code=404, detail="Unknown certificate background")
    data = read_file_object_bytes(fo)
    if not data:
        raise HTTPException(status_code=404, detail="Unknown certificate background")
    ct = (fo.content_type or "").strip() or "image/png"
    if not ct.startswith("image/"):
        ct = "image/png"
    return Response(content=data, media_type=ct, headers={"Cache-Control": "public, max-age=3600"})


def _validate_matrix_training_id(raw: Optional[str], db: Session) -> Optional[str]:
    mid = normalize_matrix_training_id(raw)
    if not mid:
        return None
    if not is_valid_matrix_training_id(mid, db):
        raise HTTPException(status_code=400, detail="Invalid matrix_training_id for training matrix")
    return mid


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

    # Align progress rows with lesson completions (same logic as GET /training/{id})
    for course in all_courses:
        progress = user_progress.get(course.id)
        if progress:
            reconcile_training_progress_row(course, progress, me.id, db)
    
    # Get required courses
    required_courses = get_required_courses_for_user(me.id, db)
    required_course_ids = {c.id for c in required_courses}
    
    completed = []
    in_progress = []
    required = []
    expired = []
    placed_ids = set()

    for course in all_courses:
        progress = user_progress.get(course.id)
        certificate = user_certificates.get(course.id)

        # Finished courses stay under "Completed" even if the certificate later expired
        if progress and progress.completed_at:
            completed.append(_serialize_course(course, progress, certificate))
            placed_ids.add(course.id)
            continue

        # Renewal queue: cert past expiry, course not (yet) marked complete on progress
        if certificate and certificate.expires_at and certificate.expires_at < datetime.utcnow():
            expired.append(_serialize_course(course, progress, certificate))
            placed_ids.add(course.id)
            continue

        # Check if in progress
        if progress and progress.started_at:
            in_progress.append(_serialize_course(course, progress, certificate))
            placed_ids.add(course.id)
            continue

        # Check if required
        if course.id in required_course_ids:
            required.append(_serialize_course(course, progress, certificate))
            placed_ids.add(course.id)

    # Published courses not shown above (e.g. optional / browse catalog)
    available = []
    for course in all_courses:
        if course.id in placed_ids:
            continue
        progress = user_progress.get(course.id)
        certificate = user_certificates.get(course.id)
        available.append(_serialize_course(course, progress, certificate))

    return {
        "completed": completed,
        "in_progress": in_progress,
        "required": required,
        "expired": expired,
        "available": available,
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

    if progress:
        reconcile_training_progress_row(course, progress, me.id, db)

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

    attempt_row = db.query(TrainingQuizUserAttempt).filter(
        TrainingQuizUserAttempt.user_id == me.id,
        TrainingQuizUserAttempt.quiz_id == quiz.id,
    ).first()
    attempts_used = attempt_row.submission_count if attempt_row else 0
    mx = effective_max_attempts(quiz)
    attempts_remaining = None if mx is None else max(0, mx - attempts_used)
    can_submit = mx is None or attempts_used < mx
    
    # Get questions (without correct answers for security)
    questions = db.query(TrainingQuizQuestion).filter(
        TrainingQuizQuestion.quiz_id == quiz.id
    ).order_by(TrainingQuizQuestion.order_index).all()
    
    return {
        "id": str(quiz.id),
        "title": quiz.title,
        "passing_score_percent": quiz.passing_score_percent,
        "allow_retry": quiz.allow_retry,
        "max_attempts": getattr(quiz, "max_attempts", None),
        "attempts_used": attempts_used,
        "attempts_remaining": attempts_remaining,
        "can_submit": can_submit,
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

    attempt_row = db.query(TrainingQuizUserAttempt).filter(
        TrainingQuizUserAttempt.user_id == me.id,
        TrainingQuizUserAttempt.quiz_id == quiz.id,
    ).first()
    if not attempt_row:
        attempt_row = TrainingQuizUserAttempt(user_id=me.id, quiz_id=quiz.id, submission_count=0)
        db.add(attempt_row)
        db.flush()

    mx = effective_max_attempts(quiz)
    if mx is not None and attempt_row.submission_count >= mx:
        raise HTTPException(status_code=403, detail="Maximum quiz attempts reached")
    
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
        is_correct = _grade_quiz_answer(question, user_answer)
        results[str(question.id)] = is_correct
        if is_correct:
            correct_count += 1
    
    score_percent = int((correct_count / total_count) * 100) if total_count > 0 else 0
    passed = score_percent >= quiz.passing_score_percent

    attempt_row.submission_count += 1
    attempts_used = attempt_row.submission_count
    can_retry = not passed and (mx is None or attempts_used < mx)
    results_hidden = not passed and can_retry
    attempts_remaining = None if mx is None else max(0, mx - attempts_used)
    
    # Get progress
    progress = db.query(TrainingProgress).filter(
        TrainingProgress.user_id == me.id,
        TrainingProgress.course_id == course_uuid
    ).first()
    
    if not progress:
        raise HTTPException(status_code=404, detail="Progress not found")
    
    # Update progress with quiz score (only pass advances the lesson)
    if passed:
        update_lesson_progress(progress.id, lesson_uuid, score_percent, db)

        next_lesson = get_next_lesson(course_uuid, me.id, db)
        if next_lesson:
            progress.current_lesson_id = next_lesson.id
            progress.current_module_id = next_lesson.module_id
        else:
            progress.current_lesson_id = None
            progress.current_module_id = None

    progress.last_accessed_at = datetime.utcnow()
    db.commit()
    
    if results_hidden:
        return QuizSubmissionResponse(
            passed=False,
            score_percent=None,
            correct_count=None,
            total_count=total_count,
            can_retry=True,
            results=None,
            results_hidden=True,
            attempts_used=attempts_used,
            attempts_remaining=attempts_remaining,
        )

    return QuizSubmissionResponse(
        passed=passed,
        score_percent=score_percent,
        correct_count=correct_count,
        total_count=total_count,
        can_retry=can_retry,
        results=results,
        results_hidden=False,
        attempts_used=attempts_used,
        attempts_remaining=attempts_remaining,
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
    _=Depends(require_permissions("training:manage", "users:write"))
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
    me: User = Depends(require_permissions("training:manage", "users:write"))
):
    """Create a new course (starts as draft)"""
    mid = _validate_matrix_training_id(getattr(course_data, "matrix_training_id", None), db)
    bg_setting_item_id = _normalize_certificate_background_setting_item_id(
        getattr(course_data, "certificate_background_setting_item_id", None), db
    )
    logo_file_id = getattr(course_data, "certificate_logo_file_id", None)
    logo_setting_item_id = (
        None
        if logo_file_id
        else _normalize_certificate_logo_setting_item_id(
            getattr(course_data, "certificate_logo_setting_item_id", None), db
        )
    )
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
        certificate_background_file_id=None,
        certificate_background_setting_item_id=bg_setting_item_id,
        certificate_background_preset_key=None,
        certificate_logo_file_id=logo_file_id,
        certificate_logo_setting_item_id=logo_setting_item_id,
        certificate_heading_primary=course_data.certificate_heading_primary,
        certificate_heading_secondary=course_data.certificate_heading_secondary,
        certificate_body_template=course_data.certificate_body_template,
        certificate_instructor_name=course_data.certificate_instructor_name,
        certificate_layout=course_data.certificate_layout,
        matrix_training_id=mid,
        sync_completion_to_employee_record=bool(getattr(course_data, "sync_completion_to_employee_record", False)),
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
    _=Depends(require_permissions("training:manage", "users:write"))
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
                        "max_attempts": getattr(quiz, "max_attempts", None),
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
        "certificate_background_file_id": str(course.certificate_background_file_id)
        if getattr(course, "certificate_background_file_id", None)
        else None,
        "certificate_background_setting_item_id": str(course.certificate_background_setting_item_id)
        if getattr(course, "certificate_background_setting_item_id", None)
        else None,
        "certificate_background_preset_key": getattr(course, "certificate_background_preset_key", None),
        "certificate_logo_file_id": str(course.certificate_logo_file_id)
        if getattr(course, "certificate_logo_file_id", None)
        else None,
        "certificate_logo_setting_item_id": str(course.certificate_logo_setting_item_id)
        if getattr(course, "certificate_logo_setting_item_id", None)
        else None,
        "certificate_heading_primary": getattr(course, "certificate_heading_primary", None),
        "certificate_heading_secondary": getattr(course, "certificate_heading_secondary", None),
        "certificate_body_template": getattr(course, "certificate_body_template", None),
        "certificate_instructor_name": getattr(course, "certificate_instructor_name", None),
        "certificate_layout": getattr(course, "certificate_layout", None),
        "matrix_training_id": getattr(course, "matrix_training_id", None),
        "sync_completion_to_employee_record": bool(getattr(course, "sync_completion_to_employee_record", False)),
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
    _=Depends(require_permissions("training:manage", "users:write"))
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
    if course_data.certificate_text is not None:
        course.certificate_text = course_data.certificate_text

    patch = course_data.model_dump(exclude_unset=True)
    if "certificate_background_setting_item_id" in patch:
        raw_sit = patch["certificate_background_setting_item_id"]
        course.certificate_background_setting_item_id = (
            _normalize_certificate_background_setting_item_id(raw_sit, db)
            if raw_sit not in (None, "")
            else None
        )
        course.certificate_background_file_id = None
        course.certificate_background_preset_key = None
    if "certificate_background_preset_key" in patch:
        course.certificate_background_preset_key = None
        course.certificate_background_file_id = None
    if "certificate_background_file_id" in patch:
        course.certificate_background_file_id = None
        course.certificate_background_preset_key = None
    if "certificate_logo_setting_item_id" in patch:
        raw_ls = patch["certificate_logo_setting_item_id"]
        course.certificate_logo_setting_item_id = (
            _normalize_certificate_logo_setting_item_id(raw_ls, db) if raw_ls not in (None, "") else None
        )
        if course.certificate_logo_setting_item_id:
            course.certificate_logo_file_id = None
    if "certificate_logo_file_id" in patch:
        course.certificate_logo_file_id = patch["certificate_logo_file_id"]
        if patch["certificate_logo_file_id"]:
            course.certificate_logo_setting_item_id = None
    if "certificate_heading_primary" in patch:
        course.certificate_heading_primary = patch["certificate_heading_primary"]
    if "certificate_heading_secondary" in patch:
        course.certificate_heading_secondary = patch["certificate_heading_secondary"]
    if "certificate_body_template" in patch:
        course.certificate_body_template = patch["certificate_body_template"]
    if "certificate_instructor_name" in patch:
        course.certificate_instructor_name = patch["certificate_instructor_name"]
    if "certificate_validity_days" in patch:
        course.certificate_validity_days = patch["certificate_validity_days"]
    if "certificate_layout" in patch:
        course.certificate_layout = patch["certificate_layout"] if isinstance(patch["certificate_layout"], dict) else None
    if "matrix_training_id" in patch:
        raw = patch["matrix_training_id"]
        course.matrix_training_id = _validate_matrix_training_id(raw, db) if raw not in (None, "") else None
    if "sync_completion_to_employee_record" in patch:
        course.sync_completion_to_employee_record = bool(patch["sync_completion_to_employee_record"])

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
    _=Depends(require_permissions("training:manage", "users:write"))
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


@router.get("/admin/courses/{course_id}/certificate-preview.pdf")
def preview_certificate_pdf(
    course_id: str,
    db: Session = Depends(get_db),
    me: User = Depends(require_permissions("training:manage", "users:write")),
):
    """Generate a live PDF preview of certificate settings for this course."""
    try:
        course_uuid = uuid.UUID(course_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid course ID")

    course = db.query(TrainingCourse).filter(TrainingCourse.id == course_uuid).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")

    if not course.generates_certificate:
        raise HTTPException(status_code=400, detail="Enable certificate generation first")

    from ..services.file_object_read import read_file_object_bytes
    from ..services.training_certificate_assets import resolve_course_background_bytes
    from ..services.organization_logos import resolve_organization_logo_file_id
    from ..proposals.pdf_certificate import create_certificate_pdf

    bg_bytes = resolve_course_background_bytes(course, db)
    logo_bytes = None
    logo_fo_id = getattr(course, "certificate_logo_file_id", None)
    if not logo_fo_id:
        sit = getattr(course, "certificate_logo_setting_item_id", None)
        if sit:
            logo_fo_id = resolve_organization_logo_file_id(db, sit)
    if logo_fo_id:
        fo_logo = db.query(FileObject).filter(FileObject.id == logo_fo_id).first()
        if fo_logo:
            logo_bytes = read_file_object_bytes(fo_logo)

    now = datetime.utcnow()
    preview_user_name = "Participant name"
    instructor_name = (getattr(course, "certificate_instructor_name", None) or "{instructor_name}").strip() or "{instructor_name}"

    pdf_buffer = create_certificate_pdf(
        course_title=course.title or "Course title",
        user_name=preview_user_name,
        completion_date=now,
        expiry_date=None,
        certificate_number="",
        certificate_text=course.certificate_text,
        qr_code_data=None,
        background_image_bytes=bg_bytes,
        logo_image_bytes=logo_bytes,
        certificate_heading_primary=getattr(course, "certificate_heading_primary", None),
        certificate_heading_secondary=getattr(course, "certificate_heading_secondary", None),
        certificate_body_template=getattr(course, "certificate_body_template", None),
        certificate_instructor_name=instructor_name,
        certificate_layout=getattr(course, "certificate_layout", None),
    )
    if not pdf_buffer:
        raise HTTPException(status_code=500, detail="Failed to generate certificate preview")

    return StreamingResponse(
        pdf_buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="certificate-preview-{course_id}.pdf"'},
    )


@router.post("/admin/courses/{course_id}/certificate-preview-render.pdf")
def render_certificate_pdf_preview_from_payload(
    course_id: str,
    body: dict = Body(default_factory=dict),
    db: Session = Depends(get_db),
    _=Depends(require_permissions("training:manage", "users:write")),
):
    """
    Render certificate preview from unsaved editor payload so live preview
    matches final PDF engine without persisting draft changes.
    """
    try:
        course_uuid = uuid.UUID(course_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid course ID")

    course = db.query(TrainingCourse).filter(TrainingCourse.id == course_uuid).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")

    from ..services.file_object_read import read_file_object_bytes
    from ..services.training_certificate_assets import resolve_course_background_bytes
    from ..services.organization_logos import resolve_organization_logo_file_id
    from ..proposals.pdf_certificate import create_certificate_pdf

    bg_setting_item_id = getattr(course, "certificate_background_setting_item_id", None)
    if "certificate_background_setting_item_id" in body:
        bg_setting_item_id = _normalize_certificate_background_setting_item_id(
            body.get("certificate_background_setting_item_id"), db
        )
    bg_proxy = SimpleNamespace(
        certificate_background_file_id=None,
        certificate_background_setting_item_id=bg_setting_item_id,
        certificate_background_preset_key=None,
    )
    bg_bytes = resolve_course_background_bytes(bg_proxy, db)

    logo_file_id = body.get("certificate_logo_file_id", getattr(course, "certificate_logo_file_id", None))
    logo_setting_item_id = body.get(
        "certificate_logo_setting_item_id", getattr(course, "certificate_logo_setting_item_id", None)
    )
    if "certificate_logo_setting_item_id" in body:
        logo_setting_item_id = _normalize_certificate_logo_setting_item_id(logo_setting_item_id, db)
    logo_bytes = None
    logo_fo_id = logo_file_id
    if not logo_fo_id and logo_setting_item_id:
        logo_fo_id = resolve_organization_logo_file_id(db, logo_setting_item_id)
    if logo_fo_id:
        fo_logo = db.query(FileObject).filter(FileObject.id == logo_fo_id).first()
        if fo_logo:
            logo_bytes = read_file_object_bytes(fo_logo)

    now = datetime.utcnow()
    pdf_buffer = create_certificate_pdf(
        course_title=(body.get("title") or course.title or "Course title"),
        user_name="Participant name",
        completion_date=now,
        expiry_date=None,
        certificate_number="",
        certificate_text=body.get("certificate_text", course.certificate_text),
        qr_code_data=None,
        background_image_bytes=bg_bytes,
        logo_image_bytes=logo_bytes,
        certificate_heading_primary=body.get("certificate_heading_primary", getattr(course, "certificate_heading_primary", None)),
        certificate_heading_secondary=body.get(
            "certificate_heading_secondary", getattr(course, "certificate_heading_secondary", None)
        ),
        certificate_body_template=body.get("certificate_body_template", getattr(course, "certificate_body_template", None)),
        certificate_instructor_name=body.get("certificate_instructor_name", "{instructor_name}"),
        certificate_layout=body.get("certificate_layout", getattr(course, "certificate_layout", None)),
    )
    if not pdf_buffer:
        raise HTTPException(status_code=500, detail="Failed to render certificate preview")

    return StreamingResponse(
        pdf_buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="certificate-live-preview-{course_id}.pdf"'},
    )


@router.post("/admin/courses/{course_id}/unpublish")
def unpublish_course_endpoint(
    course_id: str,
    db: Session = Depends(get_db),
    _=Depends(require_permissions("training:manage", "users:write"))
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
    me: User = Depends(require_permissions("training:manage", "users:write")),
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
    _=Depends(require_permissions("training:manage", "users:write"))
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
    _=Depends(require_permissions("training:manage", "users:write"))
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
    _=Depends(require_permissions("training:manage", "users:write"))
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
    _=Depends(require_permissions("training:manage", "users:write"))
):
    """Bulk reorder modules"""
    try:
        course_uuid = uuid.UUID(course_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid course ID")
    
    for index, module_id in enumerate(reorder_data.module_ids):
        try:
            module_uuid = uuid.UUID(str(module_id))
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
    _=Depends(require_permissions("training:manage", "users:write"))
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
    _=Depends(require_permissions("training:manage", "users:write"))
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

    # Quiz lesson: link existing quiz by id, or create an empty quiz shell for the builder UI
    if lesson_data.lesson_type == "quiz":
        if lesson_data.content and lesson_data.content.get("quiz_id"):
            quiz_uuid = uuid.UUID(str(lesson_data.content["quiz_id"]))
            quiz = db.query(TrainingQuiz).filter(TrainingQuiz.id == quiz_uuid).first()
            if quiz:
                quiz.lesson_id = lesson.id
        else:
            db.add(
                TrainingQuiz(
                    lesson_id=lesson.id,
                    title=lesson_data.title or "Quiz",
                    passing_score_percent=70,
                    allow_retry=True,
                    max_attempts=None,
                )
            )

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
    _=Depends(require_permissions("training:manage", "users:write"))
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
    _=Depends(require_permissions("training:manage", "users:write"))
):
    """Bulk reorder lessons"""
    try:
        module_uuid = uuid.UUID(module_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid module ID")
    
    for index, lesson_id in enumerate(reorder_data.lesson_ids):
        try:
            lesson_uuid = uuid.UUID(str(lesson_id))
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
    _=Depends(require_permissions("training:manage", "users:write"))
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
    _=Depends(require_permissions("training:manage", "users:write"))
):
    """Create a quiz"""
    quiz = TrainingQuiz(
        lesson_id=quiz_data.lesson_id,
        title=quiz_data.title,
        passing_score_percent=quiz_data.passing_score_percent,
        allow_retry=quiz_data.allow_retry,
        max_attempts=quiz_data.max_attempts,
    )
    sync_allow_retry_flag(quiz)

    db.add(quiz)
    db.commit()
    db.refresh(quiz)
    
    return {"id": str(quiz.id)}


@router.get("/admin/quizzes/{quiz_id}")
def get_quiz(
    quiz_id: str,
    db: Session = Depends(get_db),
    _=Depends(require_permissions("training:manage", "users:write"))
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
        "max_attempts": getattr(quiz, "max_attempts", None),
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
    _=Depends(require_permissions("training:manage", "users:write"))
):
    """Update quiz settings"""
    try:
        quiz_uuid = uuid.UUID(quiz_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid quiz ID")
    
    quiz = db.query(TrainingQuiz).filter(TrainingQuiz.id == quiz_uuid).first()
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")
    
    payload = quiz_data.model_dump(exclude_unset=True)
    if "title" in payload:
        quiz.title = quiz_data.title
    if "passing_score_percent" in payload:
        quiz.passing_score_percent = quiz_data.passing_score_percent
    if "max_attempts" in payload:
        quiz.max_attempts = quiz_data.max_attempts
        sync_allow_retry_flag(quiz)
    elif "allow_retry" in payload:
        quiz.allow_retry = quiz_data.allow_retry
        quiz.max_attempts = None if quiz_data.allow_retry else 1
    
    db.commit()
    return {"status": "updated"}


@router.post("/admin/quizzes/{quiz_id}/questions")
def add_quiz_question(
    quiz_id: str,
    question_data: QuizQuestionCreate,
    db: Session = Depends(get_db),
    _=Depends(require_permissions("training:manage", "users:write"))
):
    """Add quiz question"""
    try:
        quiz_uuid = uuid.UUID(quiz_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid quiz ID")
    
    quiz = db.query(TrainingQuiz).filter(TrainingQuiz.id == quiz_uuid).first()
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")
    
    max_order = db.query(func.max(TrainingQuizQuestion.order_index)).filter(
        TrainingQuizQuestion.quiz_id == quiz_uuid
    ).scalar()
    next_order = (max_order or 0) + 1
    order_idx = (
        question_data.order_index if question_data.order_index is not None else next_order
    )

    question = TrainingQuizQuestion(
        quiz_id=quiz_uuid,
        question_text=question_data.question_text,
        question_type=question_data.question_type,
        order_index=order_idx,
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
    _=Depends(require_permissions("training:manage", "users:write"))
):
    """Update quiz question"""
    try:
        question_uuid = uuid.UUID(question_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid question ID")
    
    question = db.query(TrainingQuizQuestion).filter(TrainingQuizQuestion.id == question_uuid).first()
    if not question:
        raise HTTPException(status_code=404, detail="Question not found")

    merged_type = (
        question_data.question_type if question_data.question_type is not None else question.question_type
    )
    merged_text = (
        question_data.question_text if question_data.question_text is not None else question.question_text
    )
    merged_order = (
        question_data.order_index if question_data.order_index is not None else question.order_index
    )
    merged_ca = (
        question_data.correct_answer if question_data.correct_answer is not None else question.correct_answer
    )
    merged_opts = question_data.options if question_data.options is not None else question.options

    try:
        norm_ca, norm_opts = validate_and_normalize_quiz_question(
            merged_type, merged_ca, merged_opts
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    question.question_text = merged_text
    question.question_type = merged_type
    question.order_index = merged_order
    question.correct_answer = norm_ca
    question.options = norm_opts

    db.commit()
    return {"status": "updated"}


@router.post("/admin/quizzes/{quiz_id}/questions/reorder")
def reorder_questions(
    quiz_id: str,
    reorder_data: ReorderQuestionsRequest,
    db: Session = Depends(get_db),
    _=Depends(require_permissions("training:manage", "users:write"))
):
    """Bulk reorder questions"""
    try:
        quiz_uuid = uuid.UUID(quiz_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid quiz ID")
    
    for index, question_id in enumerate(reorder_data.question_ids):
        try:
            question_uuid = uuid.UUID(str(question_id))
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
    _=Depends(require_permissions("training:manage", "users:write"))
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
    _=Depends(require_permissions("training:manage", "users:write"))
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
    _=Depends(require_permissions("training:manage", "users:write"))
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

