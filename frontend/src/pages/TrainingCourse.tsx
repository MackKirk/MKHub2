import '@/pages/training/LessonRichTextEditor.css';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, withFileAccessToken } from '@/lib/api';
import { injectFileAccessTokensInHtml } from '@/lib/trainingRichText';
import { sanitizeTrainingRichTextHtml } from '@/lib/trainingRichTextSanitize';
import { toYoutubeEmbedUrl } from '@/lib/youtubeEmbed';
import toast from 'react-hot-toast';
import { useState, useEffect, useMemo } from 'react';

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

type Quiz = {
  id: string;
  title: string;
  passing_score_percent: number;
  allow_retry: boolean;
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
      if (data.passed) {
        toast.success(`Quiz passed! Score: ${data.score_percent}%`);
        queryClient.invalidateQueries({ queryKey: ['training-course', courseId] });
        queryClient.invalidateQueries({ queryKey: ['training'] });
      } else {
        toast.error(
          `Quiz failed. Score: ${data.score_percent}%. Minimum: ${variables.passingScorePercent}%`,
        );
      }
    },
    onError: () => {
      toast.error('Failed to submit quiz');
    },
  });

  if (isLoading) {
    return <div className="p-4">Loading course...</div>;
  }

  if (!course) {
    return <div className="p-4">Course not found</div>;
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
    submitQuizMutation.mutate({
      moduleId: selectedModule.id,
      lessonId: selectedLesson.id,
      answers: quizAnswers,
      passingScorePercent: lessonQuiz.passing_score_percent,
    });
  };

  const handleRetryQuiz = () => {
    setQuizAnswers({});
    setQuizSubmitted(false);
    setQuizResult(null);
  };

  return (
    <div className="flex gap-6 h-[calc(100vh-200px)]">
      {/* Sidebar - Modules & Lessons */}
      <div className="w-80 border-r bg-gray-50 overflow-y-auto">
        <div className="p-4 sticky top-0 bg-white border-b z-10">
          <button
            onClick={() => navigate('/training')}
            className="text-sm text-gray-600 hover:text-gray-900 mb-2"
          >
            ← Back to Training
          </button>
          <h1 className="font-bold text-lg">{course.title}</h1>
          {course.progress && (
            <div className="mt-2">
              <div className="flex justify-between text-xs text-gray-600 mb-1">
                <span>Progress</span>
                <span>{course.progress.progress_percent}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-[#7f1010] h-2 rounded-full"
                  style={{ width: `${course.progress.progress_percent}%` }}
                />
              </div>
            </div>
          )}
        </div>

        <div className="p-2">
          {course.modules.map((module) => (
            <div key={module.id} className="mb-4">
              <div className="font-semibold text-sm text-gray-700 mb-2 px-2">
                {module.title}
              </div>
              {module.lessons.map((lesson) => (
                <button
                  key={lesson.id}
                  onClick={() => setSelectedLessonId(lesson.id)}
                  className={`w-full text-left px-4 py-2 mb-1 rounded text-sm transition-colors ${
                    selectedLessonId === lesson.id
                      ? 'bg-[#7f1010] text-white'
                      : lesson.completed
                      ? 'bg-green-50 text-green-800 hover:bg-green-100'
                      : 'hover:bg-gray-100'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {lesson.completed ? (
                      <span className="text-green-600">✓</span>
                    ) : (
                      <span className="text-gray-400">○</span>
                    )}
                    <span>{lesson.title}</span>
                    {lesson.has_quiz && <span className="text-xs">📝</span>}
                  </div>
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-6">
        {!course.progress ? (
          <div className="text-center py-12">
            <p className="text-lg mb-4">Start this course to begin learning</p>
            <button
              onClick={handleStartCourse}
              className="px-6 py-3 bg-[#7f1010] text-white rounded-lg font-semibold hover:bg-[#a31414] transition-colors"
            >
              Start Course
            </button>
          </div>
        ) : selectedLesson ? (
          <div>
            <h2 className="text-2xl font-bold mb-4">{selectedLesson.title}</h2>

            {/* Lesson Content */}
            <div className="mb-6">
              {selectedLesson.lesson_type === 'video' && (
                <div>
                  {selectedLesson.content?.video_url ? (
                    <div className="aspect-video bg-black rounded-lg mb-4 overflow-hidden">
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
                    <div className="aspect-video bg-gray-200 rounded-lg flex items-center justify-center">
                      <span className="text-gray-500">Video content</span>
                    </div>
                  )}
                </div>
              )}

              {selectedLesson.lesson_type === 'pdf' && (
                <div className="border rounded-lg p-4 mb-4 bg-slate-50">
                  {selectedLesson.content?.pdf_file_id ? (
                    <>
                      <iframe
                        title="Lesson PDF"
                        src={`${withFileAccessToken(`/files/${selectedLesson.content.pdf_file_id}`)}#view=FitH`}
                        className="w-full h-[min(70vh,720px)] min-h-[420px] rounded bg-white border border-gray-200"
                      />
                      <a
                        href={withFileAccessToken(`/files/${selectedLesson.content.pdf_file_id}`)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-block mt-3 text-sm text-[#7f1010] underline"
                      >
                        Open PDF in a new tab
                      </a>
                    </>
                  ) : (
                    <p className="text-sm text-gray-600">No PDF is attached to this lesson yet.</p>
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
                <div className="border rounded-lg p-6 bg-white mb-4">
                  {quizLoading && <p className="text-gray-600">Loading quiz…</p>}
                  {!quizLoading && !lessonQuiz && (
                    <p className="text-amber-800">No quiz is attached to this lesson yet.</p>
                  )}
                  {lessonQuiz && (
                    <>
                  <h3 className="text-xl font-bold mb-4">{lessonQuiz.title}</h3>
                  <p className="text-sm text-gray-600 mb-6">
                    Passing score: {lessonQuiz.passing_score_percent}%
                  </p>

                  {!quizSubmitted ? (
                    <div className="space-y-6">
                      {lessonQuiz.questions.map((question, idx) => (
                        <div key={question.id} className="border-b pb-4">
                          <p className="font-semibold mb-3">
                            {idx + 1}. {question.question_text}
                          </p>
                          {question.question_type === 'multiple_choice' && question.options ? (
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

                      <button
                        onClick={handleSubmitQuiz}
                        disabled={
                          submitQuizMutation.isPending ||
                          Object.keys(quizAnswers).length < lessonQuiz.questions.length
                        }
                        className="w-full px-6 py-3 bg-[#7f1010] text-white rounded-lg font-semibold hover:bg-[#a31414] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {submitQuizMutation.isPending ? 'Submitting...' : 'Submit Quiz'}
                      </button>
                    </div>
                  ) : quizResult ? (
                    <div className="space-y-4">
                      <div
                        className={`p-4 rounded-lg ${
                          quizResult.passed ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
                        }`}
                      >
                        <p className="font-bold text-lg">
                          {quizResult.passed ? '✓ Quiz Passed!' : '✗ Quiz Failed'}
                        </p>
                        <p className="text-sm mt-1">
                          Score: {quizResult.score_percent}% ({quizResult.correct_count}/
                          {quizResult.total_count} correct)
                        </p>
                        <p className="text-sm">
                          Minimum required: {lessonQuiz.passing_score_percent}%
                        </p>
                      </div>

                      {quizResult.results && (
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
                        <button
                          onClick={handleRetryQuiz}
                          className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors"
                        >
                          Retry Quiz
                        </button>
                      )}

                      {quizResult.passed && (
                        <button
                          onClick={handleCompleteLesson}
                          className="w-full px-6 py-3 bg-[#7f1010] text-white rounded-lg font-semibold hover:bg-[#a31414] transition-colors"
                        >
                          Continue to Next Lesson
                        </button>
                      )}
                    </div>
                  ) : null}
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Complete Button - Only show if lesson doesn't have quiz or quiz is completed */}
            {!selectedLesson.completed &&
              selectedLesson.lesson_type !== 'quiz' &&
              !selectedLesson.has_quiz && (
                <div className="flex gap-4">
                  <button
                    onClick={handleCompleteLesson}
                    disabled={completeMutation.isPending}
                    className="px-6 py-3 bg-[#7f1010] text-white rounded-lg font-semibold hover:bg-[#a31414] transition-colors disabled:opacity-50"
                  >
                    {completeMutation.isPending ? 'Completing...' : 'Mark as Complete'}
                  </button>
                </div>
              )}

            {selectedLesson.completed && (
              <div className="px-6 py-3 bg-green-50 text-green-800 rounded-lg font-semibold">
                ✓ Lesson Completed
              </div>
            )}

            {course.progress?.completed_at && (
              <div className="mt-8 border rounded-xl bg-emerald-50 border-emerald-200 p-6">
                <p className="font-bold text-emerald-900 text-lg mb-2">Course completed</p>
                <p className="text-sm text-emerald-800 mb-4">
                  You have finished all required lessons. Your certificate is available if this course issues one.
                </p>
                <Link
                  to="/training/certificates"
                  className="inline-block px-4 py-2 bg-emerald-700 text-white rounded-lg font-semibold hover:bg-emerald-800"
                >
                  View certificates
                </Link>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-12 text-gray-500">
            <p>Select a lesson to begin</p>
          </div>
        )}
      </div>
    </div>
  );
}

