import '@/pages/training/LessonRichTextEditor.css';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, withFileAccessToken } from '@/lib/api';
import { injectFileAccessTokensInHtml } from '@/lib/trainingRichText';
import { sanitizeTrainingRichTextHtml } from '@/lib/trainingRichTextSanitize';
import { toYoutubeEmbedUrl } from '@/lib/youtubeEmbed';
import toast from 'react-hot-toast';
import { useState, useEffect, useMemo } from 'react';
import { CheckCircle2, Circle, GraduationCap, ClipboardList } from 'lucide-react';
import {
  AppBadge,
  AppButton,
  AppCard,
  AppEmptyState,
  AppPageHeader,
  AppSectionHeader,
  appSectionPresetProps,
  uiBorders,
  uiCx,
  uiLayout,
  uiRadius,
  uiShadows,
  uiSpacing,
  uiTypography,
} from '@/components/ui';

type Module = {
  id: string;
  title: string;
  order_index: number;
  lessons: Lesson[];
};

type Lesson = {
  id: string;
  title: string;
  lesson_type: string;
  order_index: number;
  requires_completion: boolean;
  content?: any;
  completed: boolean;
  has_quiz?: boolean;
};

type QuizQuestion = {
  id: string;
  question_text: string;
  question_type: string;
  order_index: number;
  options?: string[];
};

function isQuizSingleChoice(t: string) {
  return t === 'single_choice' || t === 'multiple_choice';
}

function isQuizMultiSelect(t: string) {
  return t === 'multiple_select';
}

function parseAnswerIndices(s: string | undefined): Set<number> {
  const out = new Set<number>();
  if (!s) return out;
  for (const p of s.split(',')) {
    const n = parseInt(p.trim(), 10);
    if (!Number.isNaN(n)) out.add(n);
  }
  return out;
}

function sortAnswerIndices(ids: Set<number>): string {
  return [...ids]
    .sort((a, b) => a - b)
    .map(String)
    .join(',');
}

type Quiz = {
  id: string;
  title: string;
  passing_score_percent: number;
  allow_retry: boolean;
  max_attempts?: number | null;
  attempts_used?: number;
  attempts_remaining?: number | null;
  /** False when the learner used all submissions without passing */
  can_submit?: boolean;
  questions: QuizQuestion[];
};

type Course = {
  id: string;
  title: string;
  description?: string;
  modules: Module[];
  progress?: {
    progress_percent: number;
    started_at?: string;
    completed_at?: string;
    current_module_id?: string;
    current_lesson_id?: string;
  };
};

export default function TrainingCourse() {
  const { courseId } = useParams<{ courseId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selectedLessonId, setSelectedLessonId] = useState<string | null>(null);
  const [quizAnswers, setQuizAnswers] = useState<Record<string, string>>({});
  const [quizSubmitted, setQuizSubmitted] = useState(false);
  const [quizResult, setQuizResult] = useState<any>(null);

  const { data: course, isLoading } = useQuery<Course>({
    queryKey: ['training-course', courseId],
    queryFn: () => api<Course>('GET', `/training/${courseId}`),
    enabled: !!courseId,
  });

  const selectedModule = useMemo(() => {
    if (!course?.modules?.length) return null;
    if (selectedLessonId) {
      const m = course.modules.find((mod) => mod.lessons.some((l) => l.id === selectedLessonId));
      if (m) return m;
    }
    const cur = course.progress?.current_lesson_id;
    if (cur) {
      const m = course.modules.find((mod) => mod.lessons.some((l) => l.id === cur));
      if (m) return m;
    }
    return course.modules[0];
  }, [course, selectedLessonId]);

  const selectedLesson = useMemo(() => {
    if (!course?.modules?.length) return null;
    const flat = course.modules.flatMap((m) => m.lessons);
    if (selectedLessonId) {
      const found = flat.find((l) => l.id === selectedLessonId);
      if (found) return found;
    }
    const cur = course.progress?.current_lesson_id;
    if (cur) {
      const found = flat.find((l) => l.id === cur);
      if (found) return found;
    }
    return flat[0] ?? null;
  }, [course, selectedLessonId]);

  const needsQuiz =
    !!course?.progress &&
    !!selectedLesson &&
    (selectedLesson.lesson_type === 'quiz' || selectedLesson.has_quiz);

  const { data: lessonQuiz, isLoading: quizLoading } = useQuery<Quiz>({
    queryKey: ['training-lesson-quiz', courseId, selectedModule?.id, selectedLesson?.id],
    queryFn: () =>
      api<Quiz>(
        'GET',
        `/training/${courseId}/modules/${selectedModule!.id}/lessons/${selectedLesson!.id}/quiz`,
      ),
    enabled: Boolean(needsQuiz && courseId && selectedModule?.id && selectedLesson?.id),
  });

  useEffect(() => {
    setQuizAnswers({});
    setQuizSubmitted(false);
    setQuizResult(null);
  }, [selectedLesson?.id]);

  useEffect(() => {
    if (!course?.modules?.length || selectedLessonId) return;
    const hint = course.progress?.current_lesson_id || course.modules[0]?.lessons[0]?.id;
    if (hint) setSelectedLessonId(hint);
  }, [course, selectedLessonId]);

  const startMutation = useMutation({
    mutationFn: () => api('POST', `/training/${courseId}/start`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['training-course', courseId] });
      queryClient.invalidateQueries({ queryKey: ['training'] });
    },
  });

  const completeMutation = useMutation({
    mutationFn: ({ moduleId, lessonId }: { moduleId: string; lessonId: string }) =>
      api('POST', `/training/${courseId}/modules/${moduleId}/lessons/${lessonId}/complete`),
    onSuccess: () => {
      toast.success('Lesson completed!');
      queryClient.invalidateQueries({ queryKey: ['training-course', courseId] });
      queryClient.invalidateQueries({ queryKey: ['training'] });
    },
  });

  const submitQuizMutation = useMutation({
    mutationFn: ({
      moduleId,
      lessonId,
      answers,
      passingScorePercent,
    }: {
      moduleId: string;
      lessonId: string;
      answers: Record<string, string>;
      passingScorePercent: number;
    }) =>
      api('POST', `/training/${courseId}/modules/${moduleId}/lessons/${lessonId}/quiz/submit`, {
        answers,
      }),
    onSuccess: (data, variables) => {
      setQuizResult(data);
      setQuizSubmitted(true);
      queryClient.invalidateQueries({
        queryKey: ['training-lesson-quiz', courseId, variables.moduleId, variables.lessonId],
      });
      if (data.passed) {
        toast.success(
          `Quiz passed!${data.score_percent != null ? ` Score: ${data.score_percent}%` : ''}`,
        );
        queryClient.invalidateQueries({ queryKey: ['training-course', courseId] });
        queryClient.invalidateQueries({ queryKey: ['training'] });
      } else if (data.results_hidden) {
        toast.error(
          `You did not pass.${data.attempts_remaining != null ? ` Attempts left: ${data.attempts_remaining}.` : ''} Question-by-question feedback is hidden until your last attempt.`,
        );
      } else {
        toast.error(
          `Quiz failed. Score: ${data.score_percent ?? '—'}%. Minimum: ${variables.passingScorePercent}%`,
        );
      }
    },
    onError: (err: Error) => {
      toast.error(err?.message || 'Failed to submit quiz');
    },
  });

  if (isLoading) {
    return (
      <div className={uiCx('w-full min-w-0', uiSpacing.pageStack, 'min-h-full bg-gray-50')}>
        <AppCard
          className={uiShadows.card}
          bodyClassName={uiCx(uiSpacing.cardPadding, 'flex min-h-[240px] flex-col items-center justify-center')}
        >
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-gray-200 border-t-brand-red" />
          <p className={uiCx('mt-4', uiTypography.body, 'font-medium')}>Loading course…</p>
        </AppCard>
      </div>
    );
  }

  if (!course) {
    return (
      <div className={uiCx('w-full min-w-0', uiSpacing.pageStack, 'min-h-full bg-gray-50')}>
        <AppPageHeader
          icon={<GraduationCap className="h-4 w-4" />}
          title="Course not found"
          subtitle="This course may be unpublished or no longer available."
          onBack={() => navigate('/training')}
          backLabel="My Training"
        />
        <AppEmptyState
          title="Course not found"
          description="Return to My Training to browse available courses."
          action={
            <AppButton type="button" onClick={() => navigate('/training')}>
              Back to My Training
            </AppButton>
          }
        />
      </div>
    );
  }

  const handleStartCourse = () => {
    startMutation.mutate();
  };

  const handleCompleteLesson = () => {
    if (!selectedLesson || !selectedModule) return;
    completeMutation.mutate({ moduleId: selectedModule.id, lessonId: selectedLesson.id });
  };

  const handleSubmitQuiz = () => {
    if (!selectedLesson || !lessonQuiz || !selectedModule) return;
    const normalized: Record<string, string> = { ...quizAnswers };
    for (const q of lessonQuiz.questions) {
      if (isQuizMultiSelect(q.question_type) && normalized[q.id]) {
        normalized[q.id] = sortAnswerIndices(parseAnswerIndices(normalized[q.id]));
      }
    }
    submitQuizMutation.mutate({
      moduleId: selectedModule.id,
      lessonId: selectedLesson.id,
      answers: normalized,
      passingScorePercent: lessonQuiz.passing_score_percent,
    });
  };

  const quizFullyAnswered =
    !!lessonQuiz &&
    lessonQuiz.questions.every((q) => {
      const a = quizAnswers[q.id];
      if (a === undefined || a === '') return false;
      if (isQuizMultiSelect(q.question_type)) {
        return a.split(',').some((x) => x.trim() !== '');
      }
      return true;
    });

  const handleRetryQuiz = () => {
    setQuizAnswers({});
    setQuizSubmitted(false);
    setQuizResult(null);
    queryClient.invalidateQueries({
      queryKey: ['training-lesson-quiz', courseId, selectedModule?.id, selectedLesson?.id],
    });
  };

  const progressPercent = course.progress?.progress_percent ?? 0;

  return (
    <div className={uiCx('w-full min-w-0', uiSpacing.pageStack, 'min-h-full bg-gray-50')}>
      <AppPageHeader
        icon={<GraduationCap className="h-4 w-4" />}
        title={course.title}
        subtitle={course.description || 'Complete each lesson to finish the course.'}
        onBack={() => navigate('/training')}
        backLabel="My Training"
        actions={
          course.progress ? (
            <div className="min-w-[10rem] text-right">
              <div className={uiCx(uiTypography.helper, 'mb-1')}>
                Progress <span className="font-semibold text-gray-900">{progressPercent}%</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200">
                <div
                  className="h-full rounded-full bg-brand-red transition-all"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
          ) : (
            <AppBadge variant="info">Not started</AppBadge>
          )
        }
      />

      <div className="grid items-start gap-2 lg:grid-cols-[minmax(260px,300px)_minmax(0,1fr)]">
        <AppCard
          className={uiCx(uiShadows.card, 'lg:sticky lg:top-5 lg:max-h-[calc(100vh-10rem)] lg:overflow-hidden')}
          title="Curriculum"
          subtitle={`${course.modules.length} module${course.modules.length === 1 ? '' : 's'}`}
          bodyClassName="!p-0"
        >
          <div className="max-h-[min(70vh,640px)] overflow-y-auto p-2">
            {course.modules.map((module) => (
              <div key={module.id} className="mb-3 last:mb-0">
                <div className={uiCx(uiTypography.overline, 'px-2 py-1.5')}>{module.title}</div>
                <ul className="space-y-0.5">
                  {module.lessons.map((lesson) => {
                    const isSelected = selectedLessonId === lesson.id;
                    return (
                      <li key={lesson.id}>
                        <button
                          type="button"
                          onClick={() => setSelectedLessonId(lesson.id)}
                          className={uiCx(
                            'flex w-full items-start gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors',
                            isSelected
                              ? 'bg-brand-red text-white'
                              : lesson.completed
                                ? 'bg-emerald-50 text-emerald-900 hover:bg-emerald-100'
                                : 'text-gray-800 hover:bg-gray-50',
                          )}
                        >
                          {lesson.completed ? (
                            <CheckCircle2
                              className={uiCx('mt-0.5 h-4 w-4 shrink-0', isSelected ? 'text-white' : 'text-emerald-600')}
                              aria-hidden
                            />
                          ) : (
                            <Circle
                              className={uiCx('mt-0.5 h-4 w-4 shrink-0', isSelected ? 'text-white/80' : 'text-gray-400')}
                              aria-hidden
                            />
                          )}
                          <span className="min-w-0 flex-1 font-medium leading-snug">{lesson.title}</span>
                          {lesson.has_quiz ? (
                            <ClipboardList
                              className={uiCx('mt-0.5 h-4 w-4 shrink-0', isSelected ? 'text-white/90' : 'text-gray-400')}
                              aria-hidden
                            />
                          ) : null}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </AppCard>

        <AppCard className={uiShadows.card} bodyClassName={uiSpacing.sectionStack}>
          {!course.progress ? (
            <AppEmptyState
              title="Ready to begin?"
              description="Start the course to track your progress and complete lessons."
              action={
                <AppButton type="button" loading={startMutation.isPending} onClick={handleStartCourse}>
                  Start course
                </AppButton>
              }
            />
          ) : selectedLesson ? (
            <>
              <AppSectionHeader
                title={selectedLesson.title}
                description={
                  selectedLesson.completed
                    ? 'You completed this lesson.'
                    : selectedLesson.lesson_type === 'quiz' || selectedLesson.has_quiz
                      ? 'Answer all questions to pass the quiz.'
                      : 'Review the content, then mark the lesson complete.'
                }
                {...appSectionPresetProps('education')}
              />

              <div className={uiSpacing.sectionStack}>
              {selectedLesson.lesson_type === 'video' && (
                <div>
                  {selectedLesson.content?.video_url ? (
                    <div className={uiCx(uiRadius.card, 'aspect-video overflow-hidden bg-black')}>
                      <iframe
                        title="Lesson video"
                        src={
                          toYoutubeEmbedUrl(String(selectedLesson.content.video_url)) ||
                          String(selectedLesson.content.video_url)
                        }
                        className="w-full h-full rounded-lg border-0"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                        allowFullScreen
                        referrerPolicy="strict-origin-when-cross-origin"
                      />
                    </div>
                  ) : (
                    <div
                      className={uiCx(
                        uiRadius.card,
                        'flex aspect-video items-center justify-center bg-gray-100',
                      )}
                    >
                      <span className={uiTypography.helper}>Video content</span>
                    </div>
                  )}
                </div>
              )}

              {selectedLesson.lesson_type === 'pdf' && (
                <div className={uiCx(uiRadius.card, uiBorders.subtle, 'bg-gray-50 p-4')}>
                  {selectedLesson.content?.pdf_file_id ? (
                    <>
                      <iframe
                        title="Lesson PDF"
                        src={`${withFileAccessToken(`/files/${selectedLesson.content.pdf_file_id}`)}#view=FitH`}
                        className="h-[min(70vh,720px)] min-h-[420px] w-full rounded-lg border border-gray-200 bg-white"
                      />
                      <a
                        href={withFileAccessToken(`/files/${selectedLesson.content.pdf_file_id}`)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={uiCx('mt-3 inline-block text-sm font-medium text-brand-red hover:underline')}
                      >
                        Open PDF in a new tab
                      </a>
                    </>
                  ) : (
                    <p className={uiTypography.helper}>No PDF is attached to this lesson yet.</p>
                  )}
                </div>
              )}

              {selectedLesson.lesson_type === 'text' && selectedLesson.content?.rich_text_content && (
                <div
                  className="prose max-w-none mb-4 training-lesson-rich-text"
                  dangerouslySetInnerHTML={{
                    __html: injectFileAccessTokensInHtml(
                      sanitizeTrainingRichTextHtml(selectedLesson.content.rich_text_content || ''),
                    ),
                  }}
                />
              )}

              {selectedLesson.lesson_type === 'image' && selectedLesson.content?.images && (
                <div className="grid grid-cols-2 gap-4 mb-4">
                  {selectedLesson.content.images.map((imgId: string, idx: number) => (
                    <img
                      key={idx}
                      src={withFileAccessToken(`/files/${imgId}`)}
                      alt={`Image ${idx + 1}`}
                      className="rounded-lg"
                    />
                  ))}
                </div>
              )}

              {(selectedLesson.lesson_type === 'quiz' || selectedLesson.has_quiz) && needsQuiz && (
                <AppCard bodyClassName={uiSpacing.sectionStack}>
                  {quizLoading && <p className={uiTypography.helper}>Loading quiz…</p>}
                  {!quizLoading && !lessonQuiz && (
                    <p className="text-sm text-amber-800">No quiz is attached to this lesson yet.</p>
                  )}
                  {lessonQuiz && (
                    <>
                      <div>
                        <h3 className={uiTypography.sectionTitle}>{lessonQuiz.title}</h3>
                        <p className={uiTypography.helper}>
                          Passing score: {lessonQuiz.passing_score_percent}%
                        </p>
                        {lessonQuiz.max_attempts != null && (
                          <p className={uiTypography.helper}>
                            Submissions used: {lessonQuiz.attempts_used ?? 0} / {lessonQuiz.max_attempts}
                            {lessonQuiz.attempts_remaining != null && lessonQuiz.attempts_remaining > 0 ? (
                              <span> ({lessonQuiz.attempts_remaining} remaining)</span>
                            ) : null}
                          </p>
                        )}
                        {lessonQuiz.max_attempts == null && (lessonQuiz.attempts_used ?? 0) > 0 && (
                          <p className={uiTypography.helper}>Keep trying until you pass — unlimited attempts.</p>
                        )}
                      </div>

                      {selectedLesson.completed ? (
                        <div className={uiCx(uiRadius.card, 'bg-emerald-50 px-4 py-3 text-sm text-emerald-900')}>
                          You completed this lesson.
                        </div>
                      ) : lessonQuiz.can_submit === false ? (
                        <div
                          className={uiCx(
                            uiRadius.card,
                            uiBorders.subtle,
                            'border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900',
                          )}
                        >
                          You have used all attempts for this quiz without reaching the passing score. Contact your
                          administrator if you need access again.
                        </div>
                      ) : !quizSubmitted ? (
                        <div className="space-y-6">
                          {lessonQuiz.questions.map((question, idx) => (
                            <div key={question.id} className="border-b border-gray-100 pb-4 last:border-0">
                              <p className={uiCx(uiTypography.body, 'mb-3 font-semibold text-gray-900')}>
                                {idx + 1}. {question.question_text}
                              </p>
                          {isQuizSingleChoice(question.question_type) && question.options ? (
                            <div className="space-y-2">
                              {question.options.map((option, optIdx) => (
                                <label
                                  key={optIdx}
                                  className="flex items-center gap-2 p-2 hover:bg-gray-50 rounded cursor-pointer"
                                >
                                  <input
                                    type="radio"
                                    name={`question-${question.id}`}
                                    value={String(optIdx)}
                                    checked={quizAnswers[question.id] === String(optIdx)}
                                    onChange={(e) =>
                                      setQuizAnswers({ ...quizAnswers, [question.id]: e.target.value })
                                    }
                                    className="w-4 h-4"
                                  />
                                  <span>{option}</span>
                                </label>
                              ))}
                            </div>
                          ) : isQuizMultiSelect(question.question_type) && question.options ? (
                            <div className="space-y-2">
                              <p className="text-xs text-gray-500 mb-1">Select all that apply</p>
                              {question.options.map((option, optIdx) => {
                                const picked = parseAnswerIndices(quizAnswers[question.id]);
                                const checked = picked.has(optIdx);
                                return (
                                  <label
                                    key={optIdx}
                                    className="flex items-center gap-2 p-2 hover:bg-gray-50 rounded cursor-pointer"
                                  >
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      onChange={() => {
                                        const next = new Set(picked);
                                        if (next.has(optIdx)) next.delete(optIdx);
                                        else next.add(optIdx);
                                        setQuizAnswers({
                                          ...quizAnswers,
                                          [question.id]: sortAnswerIndices(next),
                                        });
                                      }}
                                      className="w-4 h-4 rounded border-gray-300"
                                    />
                                    <span>{option}</span>
                                  </label>
                                );
                              })}
                            </div>
                          ) : question.question_type === 'true_false' ? (
                            <div className="space-y-2">
                              <label className="flex items-center gap-2 p-2 hover:bg-gray-50 rounded cursor-pointer">
                                <input
                                  type="radio"
                                  name={`question-${question.id}`}
                                  value="true"
                                  checked={quizAnswers[question.id] === 'true'}
                                  onChange={(e) =>
                                    setQuizAnswers({ ...quizAnswers, [question.id]: e.target.value })
                                  }
                                  className="w-4 h-4"
                                />
                                <span>True</span>
                              </label>
                              <label className="flex items-center gap-2 p-2 hover:bg-gray-50 rounded cursor-pointer">
                                <input
                                  type="radio"
                                  name={`question-${question.id}`}
                                  value="false"
                                  checked={quizAnswers[question.id] === 'false'}
                                  onChange={(e) =>
                                    setQuizAnswers({ ...quizAnswers, [question.id]: e.target.value })
                                  }
                                  className="w-4 h-4"
                                />
                                <span>False</span>
                              </label>
                            </div>
                          ) : null}
                        </div>
                      ))}

                      <AppButton
                        type="button"
                        className="w-full"
                        loading={submitQuizMutation.isPending}
                        disabled={!quizFullyAnswered}
                        onClick={handleSubmitQuiz}
                      >
                        Submit quiz
                      </AppButton>
                    </div>
                  ) : quizResult ? (
                    <div className="space-y-4">
                      <div
                        className={uiCx(
                          uiRadius.card,
                          'p-4',
                          quizResult.passed ? 'bg-emerald-50 text-emerald-900' : 'bg-red-50 text-red-900',
                        )}
                      >
                        <p className="text-lg font-bold">
                          {quizResult.passed ? 'Quiz passed' : 'Quiz failed'}
                        </p>
                        {quizResult.results_hidden ? (
                          <>
                            <p className="text-sm mt-2">
                              You did not reach the minimum score. Your answers are not shown so you can retry fairly.
                            </p>
                            {quizResult.attempts_remaining != null && (
                              <p className="text-sm mt-1 font-medium">Attempts remaining: {quizResult.attempts_remaining}</p>
                            )}
                            <p className="text-xs mt-2 text-amber-900/90">
                              Score and per-question feedback appear after your last attempt or when you pass.
                            </p>
                          </>
                        ) : (
                          <>
                            <p className="text-sm mt-1">
                              Score: {quizResult.score_percent ?? '—'}% ({quizResult.correct_count ?? '—'}/
                              {quizResult.total_count} correct)
                            </p>
                            <p className="text-sm">Minimum required: {lessonQuiz.passing_score_percent}%</p>
                          </>
                        )}
                      </div>

                      {quizResult.results && !quizResult.results_hidden && (
                        <div className="space-y-3">
                          <p className="font-semibold">Results:</p>
                          {lessonQuiz.questions.map((question, idx) => {
                            const isCorrect = quizResult.results[question.id];
                            return (
                              <div
                                key={question.id}
                                className={`p-3 rounded ${
                                  isCorrect ? 'bg-green-50' : 'bg-red-50'
                                }`}
                              >
                                <p className="font-semibold">
                                  {idx + 1}. {question.question_text}
                                </p>
                                <p className={`text-sm ${isCorrect ? 'text-green-700' : 'text-red-700'}`}>
                                  {isCorrect ? '✓ Correct' : '✗ Incorrect'}
                                </p>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {quizResult.can_retry && (
                        <AppButton type="button" variant="secondary" className="w-full" onClick={handleRetryQuiz}>
                          {quizResult.results_hidden ? 'Try again' : 'Retry quiz'}
                        </AppButton>
                      )}

                      {quizResult.passed && (
                        <AppButton type="button" className="w-full" onClick={handleCompleteLesson}>
                          Continue to next lesson
                        </AppButton>
                      )}
                    </div>
                  ) : null}
                    </>
                  )}
                </AppCard>
              )}
              </div>

              {!selectedLesson.completed &&
                selectedLesson.lesson_type !== 'quiz' &&
                !selectedLesson.has_quiz && (
                  <div className={uiLayout.actionsRow}>
                    <AppButton
                      type="button"
                      loading={completeMutation.isPending}
                      onClick={handleCompleteLesson}
                    >
                      Mark as complete
                    </AppButton>
                  </div>
                )}

              {selectedLesson.completed && (
                <AppBadge variant="success" className="w-fit px-3 py-2 text-sm">
                  Lesson completed
                </AppBadge>
              )}

              {course.progress?.completed_at && (
                <AppCard
                  bodyClassName={uiCx(uiSpacing.sectionStack, 'border-emerald-200 bg-emerald-50/80')}
                  className="border-emerald-200"
                >
                  <div>
                    <p className={uiCx(uiTypography.sectionTitle, 'text-emerald-900')}>Course completed</p>
                    <p className={uiCx(uiTypography.helper, 'text-emerald-800')}>
                      You have finished all required lessons. Your certificate is available if this course issues one.
                    </p>
                  </div>
                  <Link
                    to="/training?tab=certificates"
                    className="inline-flex h-9 items-center justify-center rounded-md border border-gray-300 bg-white px-4 text-xs font-medium text-gray-700 hover:bg-gray-50"
                  >
                    View certificates
                  </Link>
                </AppCard>
              )}
            </>
          ) : (
            <AppEmptyState title="Select a lesson" description="Choose a lesson from the curriculum to begin." />
          )}
        </AppCard>
      </div>
    </div>
  );
}

