import uuid
from datetime import datetime
from typing import Optional, List, Dict, Any, Tuple
from pydantic import BaseModel, field_validator, model_validator


# Course Schemas
class CourseBase(BaseModel):
    title: str
    description: Optional[str] = None
    category_id: Optional[uuid.UUID] = None
    thumbnail_file_id: Optional[uuid.UUID] = None
    estimated_duration_minutes: Optional[int] = None
    tags: Optional[List[str]] = None
    
    # Requirements
    is_required: bool = False
    renewal_frequency: str = "none"  # none|weekly|monthly|annual|days_X|every_new_job
    renewal_frequency_days: Optional[int] = None
    
    # Certificate settings
    generates_certificate: bool = False
    certificate_validity_days: Optional[int] = None
    certificate_text: Optional[str] = None
    certificate_background_file_id: Optional[uuid.UUID] = None
    certificate_background_setting_item_id: Optional[uuid.UUID] = None
    certificate_background_preset_key: Optional[str] = None
    certificate_logo_file_id: Optional[uuid.UUID] = None
    certificate_logo_setting_item_id: Optional[uuid.UUID] = None
    certificate_heading_primary: Optional[str] = None
    certificate_heading_secondary: Optional[str] = None
    certificate_body_template: Optional[str] = None
    certificate_instructor_name: Optional[str] = None
    certificate_layout: Optional[Dict[str, Any]] = None

    # HR employee training / matrix (optional)
    matrix_training_id: Optional[str] = None
    sync_completion_to_employee_record: bool = False

    # Required assignments (for create/update)
    required_role_ids: Optional[List[uuid.UUID]] = None
    required_division_ids: Optional[List[uuid.UUID]] = None
    required_user_ids: Optional[List[uuid.UUID]] = None


class CourseCreate(CourseBase):
    pass


class CourseUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    category_id: Optional[uuid.UUID] = None
    thumbnail_file_id: Optional[uuid.UUID] = None
    estimated_duration_minutes: Optional[int] = None
    tags: Optional[List[str]] = None
    status: Optional[str] = None  # draft|published
    is_required: Optional[bool] = None
    renewal_frequency: Optional[str] = None
    renewal_frequency_days: Optional[int] = None
    generates_certificate: Optional[bool] = None
    certificate_validity_days: Optional[int] = None
    certificate_text: Optional[str] = None
    certificate_background_file_id: Optional[uuid.UUID] = None
    certificate_background_setting_item_id: Optional[uuid.UUID] = None
    certificate_background_preset_key: Optional[str] = None
    certificate_logo_file_id: Optional[uuid.UUID] = None
    certificate_logo_setting_item_id: Optional[uuid.UUID] = None
    certificate_heading_primary: Optional[str] = None
    certificate_heading_secondary: Optional[str] = None
    certificate_body_template: Optional[str] = None
    certificate_instructor_name: Optional[str] = None
    certificate_layout: Optional[Dict[str, Any]] = None
    matrix_training_id: Optional[str] = None
    sync_completion_to_employee_record: Optional[bool] = None
    required_role_ids: Optional[List[uuid.UUID]] = None
    required_division_ids: Optional[List[uuid.UUID]] = None
    required_user_ids: Optional[List[uuid.UUID]] = None


class CourseResponse(CourseBase):
    id: uuid.UUID
    status: str
    created_at: datetime
    created_by: Optional[uuid.UUID] = None
    updated_at: Optional[datetime] = None
    last_published_at: Optional[datetime] = None
    cloned_from_id: Optional[uuid.UUID] = None
    
    # Relationships (simplified)
    category_label: Optional[str] = None
    module_count: Optional[int] = None
    lesson_count: Optional[int] = None
    
    class Config:
        from_attributes = True


# Module Schemas
class ModuleBase(BaseModel):
    title: str
    order_index: int = 0


class ModuleCreate(ModuleBase):
    pass


class ModuleUpdate(BaseModel):
    title: Optional[str] = None
    order_index: Optional[int] = None


class ModuleResponse(ModuleBase):
    id: uuid.UUID
    course_id: uuid.UUID
    created_at: datetime
    lesson_count: Optional[int] = None
    
    class Config:
        from_attributes = True


# Lesson Schemas
class LessonBase(BaseModel):
    lesson_type: str  # video|pdf|text|image|quiz
    title: str
    order_index: int = 0
    requires_completion: bool = True
    content: Optional[Dict[str, Any]] = None
    
    @field_validator('lesson_type')
    @classmethod
    def validate_lesson_type(cls, v):
        allowed = ['video', 'pdf', 'text', 'image', 'quiz']
        if v not in allowed:
            raise ValueError(f'lesson_type must be one of {allowed}')
        return v


class LessonCreate(LessonBase):
    pass


class LessonUpdate(BaseModel):
    lesson_type: Optional[str] = None
    title: Optional[str] = None
    order_index: Optional[int] = None
    requires_completion: Optional[bool] = None
    content: Optional[Dict[str, Any]] = None


class LessonResponse(LessonBase):
    id: uuid.UUID
    module_id: uuid.UUID
    created_at: datetime
    has_quiz: Optional[bool] = None
    
    class Config:
        from_attributes = True


# Quiz Schemas
class QuizBase(BaseModel):
    title: str
    passing_score_percent: int = 70
    allow_retry: bool = True
    # None = unlimited attempts until passing score; integer = max submissions total
    max_attempts: Optional[int] = None

    @field_validator("max_attempts")
    @classmethod
    def validate_max_attempts(cls, v: Optional[int]) -> Optional[int]:
        if v is not None and v < 1:
            raise ValueError("max_attempts must be at least 1 when set")
        return v


class QuizCreate(QuizBase):
    lesson_id: Optional[uuid.UUID] = None


class QuizUpdate(BaseModel):
    title: Optional[str] = None
    passing_score_percent: Optional[int] = None
    allow_retry: Optional[bool] = None
    max_attempts: Optional[int] = None

    @field_validator("max_attempts")
    @classmethod
    def validate_max_attempts_update(cls, v: Optional[int]) -> Optional[int]:
        if v is not None and v < 1:
            raise ValueError("max_attempts must be at least 1 when set")
        return v


class QuizResponse(QuizBase):
    id: uuid.UUID
    lesson_id: Optional[uuid.UUID] = None
    created_at: datetime
    question_count: Optional[int] = None
    
    class Config:
        from_attributes = True


# Quiz question types:
# - single_choice: one correct option (index string "0", "1", …)
# - multiple_choice: legacy alias for single_choice (existing rows)
# - multiple_select: several correct options; correct_answer is sorted comma-separated indices "0,2"
# - true_false: correct_answer is "true" or "false"


def validate_and_normalize_quiz_question(
    question_type: str,
    correct_answer: str,
    options: Optional[List[str]],
) -> Tuple[str, Optional[List[str]]]:
    """Validate fields together; return normalized correct_answer and options list."""
    ca = (correct_answer or "").strip()
    raw_opts = options or []
    opts = [str(o).strip() for o in raw_opts if o is not None and str(o).strip()]

    if question_type == "true_false":
        low = ca.lower()
        if low not in ("true", "false"):
            raise ValueError('For true/false questions, correct_answer must be "true" or "false"')
        return (low, None)

    if question_type in ("single_choice", "multiple_choice"):
        if len(opts) < 2:
            raise ValueError("Single-choice questions need at least 2 options")
        try:
            idx = int(ca)
        except ValueError as e:
            raise ValueError("correct_answer must be the zero-based index of the correct option") from e
        if idx < 0 or idx >= len(opts):
            raise ValueError("correct_answer index is out of range for the options list")
        return (str(idx), opts)

    if question_type == "multiple_select":
        if len(opts) < 2:
            raise ValueError("Multiple-select questions need at least 2 options")
        parts = [p.strip() for p in ca.split(",") if p.strip()]
        indices: List[int] = []
        for p in parts:
            try:
                indices.append(int(p))
            except ValueError as e:
                raise ValueError(
                    "correct_answer must be comma-separated indices of correct options (e.g. 0,2)"
                ) from e
        if len(indices) < 1:
            raise ValueError("Select at least one correct option")
        if len(set(indices)) != len(indices):
            raise ValueError("Duplicate indices in correct_answer")
        for idx in indices:
            if idx < 0 or idx >= len(opts):
                raise ValueError("correct_answer index out of range")
        normalized = ",".join(str(x) for x in sorted(indices))
        return (normalized, opts)

    raise ValueError(f"Unknown question_type: {question_type}")


QUIZ_QUESTION_TYPES = frozenset({"single_choice", "multiple_choice", "multiple_select", "true_false"})


# Quiz Question Schemas
class QuizQuestionBase(BaseModel):
    question_text: str
    question_type: str
    order_index: int = 0
    correct_answer: str
    options: Optional[List[str]] = None

    @field_validator("question_type")
    @classmethod
    def validate_question_type(cls, v: str) -> str:
        if v not in QUIZ_QUESTION_TYPES:
            raise ValueError(f"question_type must be one of {sorted(QUIZ_QUESTION_TYPES)}")
        return v


class QuizQuestionCreate(QuizQuestionBase):
    order_index: Optional[int] = None  # type: ignore[assignment]

    @model_validator(mode="after")
    def normalize_fields(self) -> "QuizQuestionCreate":
        ca, opts = validate_and_normalize_quiz_question(
            self.question_type, self.correct_answer, self.options
        )
        self.correct_answer = ca
        self.options = opts
        return self


class QuizQuestionUpdate(BaseModel):
    question_text: Optional[str] = None
    question_type: Optional[str] = None
    order_index: Optional[int] = None
    correct_answer: Optional[str] = None
    options: Optional[List[str]] = None

    @field_validator("question_type")
    @classmethod
    def validate_question_type_opt(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        if v not in QUIZ_QUESTION_TYPES:
            raise ValueError(f"question_type must be one of {sorted(QUIZ_QUESTION_TYPES)}")
        return v


class QuizQuestionResponse(QuizQuestionBase):
    id: uuid.UUID
    quiz_id: uuid.UUID
    
    class Config:
        from_attributes = True


# Progress Schemas
class ProgressResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    course_id: uuid.UUID
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    last_accessed_at: Optional[datetime] = None
    progress_percent: int
    current_module_id: Optional[uuid.UUID] = None
    current_lesson_id: Optional[uuid.UUID] = None
    completed_lesson_ids: Optional[List[uuid.UUID]] = None
    
    class Config:
        from_attributes = True


# Certificate Schemas
class CertificateResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    course_id: uuid.UUID
    issued_at: datetime
    expires_at: Optional[datetime] = None
    certificate_file_id: Optional[uuid.UUID] = None
    qr_code_data: Optional[str] = None
    certificate_number: str
    
    # Related data
    course_title: Optional[str] = None
    user_name: Optional[str] = None
    
    class Config:
        from_attributes = True


# Quiz Submission Schemas
class QuizSubmissionRequest(BaseModel):
    answers: Dict[str, str]  # question_id -> answer


class QuizSubmissionResponse(BaseModel):
    passed: bool
    score_percent: Optional[int] = None
    correct_count: Optional[int] = None
    total_count: int
    can_retry: bool
    results: Optional[Dict[str, bool]] = None  # question_id -> is_correct (omitted when results_hidden)
    results_hidden: bool = False
    attempts_used: int = 0
    attempts_remaining: Optional[int] = None  # None when unlimited


# Bulk Reorder Schemas
class ReorderModulesRequest(BaseModel):
    module_ids: List[uuid.UUID]  # Ordered list of module IDs


class ReorderLessonsRequest(BaseModel):
    lesson_ids: List[uuid.UUID]  # Ordered list of lesson IDs


class ReorderQuestionsRequest(BaseModel):
    question_ids: List[uuid.UUID]  # Ordered list of question IDs


# Course with full structure (for admin/editing)
class CourseFullResponse(CourseResponse):
    modules: Optional[List['ModuleFullResponse']] = None


class ModuleFullResponse(ModuleResponse):
    lessons: Optional[List['LessonFullResponse']] = None


class LessonFullResponse(LessonResponse):
    quiz: Optional['QuizFullResponse'] = None


class QuizFullResponse(QuizResponse):
    questions: Optional[List[QuizQuestionResponse]] = None


# Update forward references
CourseFullResponse.model_rebuild()
ModuleFullResponse.model_rebuild()
LessonFullResponse.model_rebuild()
QuizFullResponse.model_rebuild()

