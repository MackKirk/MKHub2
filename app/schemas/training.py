import uuid
from datetime import datetime
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, field_validator


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


class QuizCreate(QuizBase):
    lesson_id: Optional[uuid.UUID] = None


class QuizUpdate(BaseModel):
    title: Optional[str] = None
    passing_score_percent: Optional[int] = None
    allow_retry: Optional[bool] = None


class QuizResponse(QuizBase):
    id: uuid.UUID
    lesson_id: Optional[uuid.UUID] = None
    created_at: datetime
    question_count: Optional[int] = None
    
    class Config:
        from_attributes = True


# Quiz Question Schemas
class QuizQuestionBase(BaseModel):
    question_text: str
    question_type: str  # multiple_choice|true_false
    order_index: int = 0
    correct_answer: str
    options: Optional[List[str]] = None
    
    @field_validator('question_type')
    @classmethod
    def validate_question_type(cls, v):
        allowed = ['multiple_choice', 'true_false']
        if v not in allowed:
            raise ValueError(f'question_type must be one of {allowed}')
        return v


class QuizQuestionCreate(QuizQuestionBase):
    pass


class QuizQuestionUpdate(BaseModel):
    question_text: Optional[str] = None
    question_type: Optional[str] = None
    order_index: Optional[int] = None
    correct_answer: Optional[str] = None
    options: Optional[List[str]] = None


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
    score_percent: int
    correct_count: int
    total_count: int
    can_retry: bool
    results: Optional[Dict[str, bool]] = None  # question_id -> is_correct


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

