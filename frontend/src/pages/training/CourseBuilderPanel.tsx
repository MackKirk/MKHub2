import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { uploadTrainingContentFile } from '@/lib/trainingFileUpload';
import toast from 'react-hot-toast';
import { useState } from 'react';
import LessonRichTextEditor from '@/pages/training/LessonRichTextEditor';

type Lesson = {
  id: string;
  title: string;
  lesson_type: string;
  order_index: number;
  requires_completion: boolean;
  content?: Record<string, unknown>;
  quiz?: {
    id: string;
    title: string;
    passing_score_percent: number;
    allow_retry: boolean;
    questions: Array<{
      id: string;
      question_text: string;
      question_type: string;
      order_index: number;
      correct_answer: string;
      options?: string[];
    }>;
  };
};

type Module = { id: string; title: string; order_index: number; lessons: Lesson[] };

type AdminCourse = {
  id: string;
  title: string;
  modules: Module[];
};

const LESSON_TYPES = ['text', 'video', 'pdf', 'image', 'quiz'] as const;

export default function CourseBuilderPanel({ courseId }: { courseId: string }) {
  const queryClient = useQueryClient();
  const [newModuleTitle, setNewModuleTitle] = useState('');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [lessonDraft, setLessonDraft] = useState<Record<string, { title: string; lesson_type: string; body: string }>>(
    {},
  );

  const { data: course, isLoading } = useQuery<AdminCourse>({
    queryKey: ['training-admin-course', courseId],
    queryFn: () => api<AdminCourse>('GET', `/training/admin/courses/${courseId}`),
    enabled: !!courseId,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['training-admin-course', courseId] });
    queryClient.invalidateQueries({ queryKey: ['training-admin-courses'] });
  };

  const createModule = useMutation({
    mutationFn: (title: string) =>
      api('POST', `/training/admin/courses/${courseId}/modules`, { title, order_index: 0 }),
    onSuccess: () => {
      toast.success('Module added');
      setNewModuleTitle('');
      invalidate();
    },
    onError: () => toast.error('Failed to add module'),
  });

  const updateModule = useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) =>
      api('PUT', `/training/admin/courses/${courseId}/modules/${id}`, { title }),
    onSuccess: () => {
      toast.success('Module saved');
      invalidate();
    },
    onError: () => toast.error('Failed to save module'),
  });

  const deleteModule = useMutation({
    mutationFn: (id: string) => api('DELETE', `/training/admin/courses/${courseId}/modules/${id}`),
    onSuccess: () => {
      toast.success('Module removed');
      invalidate();
    },
    onError: () => toast.error('Failed to remove module'),
  });

  const reorderModules = useMutation({
    mutationFn: (moduleIds: string[]) =>
      api('POST', `/training/admin/courses/${courseId}/modules/reorder`, { module_ids: moduleIds }),
    onSuccess: () => invalidate(),
  });

  const createLesson = useMutation({
    mutationFn: (payload: { moduleId: string; title: string; lesson_type: string; content?: Record<string, unknown> }) =>
      api('POST', `/training/admin/courses/${courseId}/modules/${payload.moduleId}/lessons`, {
        title: payload.title,
        lesson_type: payload.lesson_type,
        requires_completion: true,
        content: payload.content,
      }),
    onSuccess: () => {
      toast.success('Lesson added');
      invalidate();
    },
    onError: () => toast.error('Failed to add lesson'),
  });

  const updateLesson = useMutation({
    mutationFn: (payload: {
      moduleId: string;
      lessonId: string;
      title?: string;
      lesson_type?: string;
      content?: Record<string, unknown>;
      requires_completion?: boolean;
    }) =>
      api('PUT', `/training/admin/courses/${courseId}/modules/${payload.moduleId}/lessons/${payload.lessonId}`, {
        title: payload.title,
        lesson_type: payload.lesson_type,
        content: payload.content,
        requires_completion: payload.requires_completion,
      }),
    onSuccess: () => {
      toast.success('Lesson saved');
      invalidate();
    },
    onError: () => toast.error('Failed to save lesson'),
  });

  const deleteLesson = useMutation({
    mutationFn: ({ moduleId, lessonId }: { moduleId: string; lessonId: string }) =>
      api('DELETE', `/training/admin/courses/${courseId}/modules/${moduleId}/lessons/${lessonId}`),
    onSuccess: () => {
      toast.success('Lesson removed');
      invalidate();
    },
    onError: () => toast.error('Failed to remove lesson'),
  });

  const reorderLessons = useMutation({
    mutationFn: ({ moduleId, lessonIds }: { moduleId: string; lessonIds: string[] }) =>
      api('POST', `/training/admin/courses/${courseId}/modules/${moduleId}/lessons/reorder`, { lesson_ids: lessonIds }),
    onSuccess: () => invalidate(),
  });

  const addQuestion = useMutation({
    mutationFn: (payload: { quizId: string; text: string; options: string[]; correctIndex: number }) =>
      api('POST', `/training/admin/quizzes/${payload.quizId}/questions`, {
        question_text: payload.text,
        question_type: 'multiple_choice',
        correct_answer: String(payload.correctIndex),
        options: payload.options,
      }),
    onSuccess: () => {
      toast.success('Question added');
      invalidate();
    },
    onError: () => toast.error('Failed to add question'),
  });

  const updateQuizMeta = useMutation({
    mutationFn: (payload: { quizId: string; title: string; passing: number; allow_retry: boolean }) =>
      api('PUT', `/training/admin/quizzes/${payload.quizId}`, {
        title: payload.title,
        passing_score_percent: payload.passing,
        allow_retry: payload.allow_retry,
      }),
    onSuccess: () => invalidate(),
  });

  const moveModule = (idx: number, dir: -1 | 1) => {
    const mods = [...(course?.modules || [])].sort((a, b) => a.order_index - b.order_index);
    const j = idx + dir;
    if (j < 0 || j >= mods.length) return;
    const ids = mods.map((m) => m.id);
    const t = ids[idx];
    ids[idx] = ids[j];
    ids[j] = t;
    reorderModules.mutate(ids);
  };

  const moveLesson = (moduleId: string, lessons: Lesson[], idx: number, dir: -1 | 1) => {
    const sorted = [...lessons].sort((a, b) => a.order_index - b.order_index);
    const j = idx + dir;
    if (j < 0 || j >= sorted.length) return;
    const ids = sorted.map((l) => l.id);
    const t = ids[idx];
    ids[idx] = ids[j];
    ids[j] = t;
    reorderLessons.mutate({ moduleId, lessonIds: ids });
  };

  const draftKey = (moduleId: string) => `new-${moduleId}`;

  const getDraft = (moduleId: string) =>
    lessonDraft[draftKey(moduleId)] || { title: 'New lesson', lesson_type: 'text', body: '' };

  const setDraft = (moduleId: string, part: Partial<{ title: string; lesson_type: string; body: string }>) => {
    const k = draftKey(moduleId);
    setLessonDraft((d) => ({ ...d, [k]: { ...getDraft(moduleId), ...part } }));
  };

  const submitNewLesson = (moduleId: string) => {
    const d = getDraft(moduleId);
    let content: Record<string, unknown> | undefined;
    if (d.lesson_type === 'text') content = { rich_text_content: d.body || '<p></p>' };
    if (d.lesson_type === 'video') content = { video_url: d.body.trim() };
    if (d.lesson_type === 'pdf' && d.body) content = { pdf_file_id: d.body.trim() };
    if (d.lesson_type === 'quiz') content = undefined;
    if (d.lesson_type === 'image' && d.body) {
      const ids = d.body
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      content = { images: ids };
    }
    createLesson.mutate({ moduleId, title: d.title.trim() || 'Lesson', lesson_type: d.lesson_type, content });
  };

  if (isLoading || !course) {
    return <div className="text-gray-600 py-8">Loading course structure…</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2 items-end border-b pb-4">
        <div className="flex-1 min-w-[200px]">
          <label className="block text-xs font-semibold text-gray-600 mb-1">New module title</label>
          <input
            value={newModuleTitle}
            onChange={(e) => setNewModuleTitle(e.target.value)}
            className="w-full px-3 py-2 border rounded-lg"
            placeholder="e.g. Introduction"
          />
        </div>
        <button
          type="button"
          disabled={!newModuleTitle.trim() || createModule.isPending}
          onClick={() => createModule.mutate(newModuleTitle.trim())}
          className="px-4 py-2 bg-[#7f1010] text-white rounded-lg font-semibold disabled:opacity-50"
        >
          Add module
        </button>
      </div>

      {course.modules.length === 0 && (
        <p className="text-sm text-gray-500">Add a module, then add lessons inside it.</p>
      )}

      {[...course.modules].sort((a, b) => a.order_index - b.order_index).map((mod, mi) => {
        const open = expanded[mod.id] !== false;
        const lessons = [...mod.lessons].sort((a, b) => a.order_index - b.order_index);
        return (
          <div key={mod.id} className="border rounded-xl overflow-hidden bg-slate-50/50">
            <div className="flex flex-wrap items-center gap-2 px-4 py-3 bg-white border-b">
              <button
                type="button"
                className="text-sm font-semibold text-gray-700 mr-2"
                onClick={() => setExpanded((e) => ({ ...e, [mod.id]: !open }))}
              >
                {open ? '▼' : '▶'}
              </button>
              <input
                defaultValue={mod.title}
                key={mod.id + mod.title}
                className="flex-1 min-w-[160px] px-2 py-1 border rounded font-medium"
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (v && v !== mod.title) updateModule.mutate({ id: mod.id, title: v });
                }}
              />
              <button
                type="button"
                className="text-xs px-2 py-1 border rounded"
                onClick={() => moveModule(mi, -1)}
                disabled={mi === 0}
              >
                Up
              </button>
              <button
                type="button"
                className="text-xs px-2 py-1 border rounded"
                onClick={() => moveModule(mi, 1)}
                disabled={mi === course.modules.length - 1}
              >
                Down
              </button>
              <button
                type="button"
                className="text-xs text-red-600"
                onClick={() => {
                  if (confirm('Delete this module and all its lessons?')) deleteModule.mutate(mod.id);
                }}
              >
                Delete module
              </button>
            </div>
            {open && (
              <div className="p-4 space-y-4">
                {lessons.map((les, li) => (
                  <div key={les.id} className="border rounded-lg p-4 bg-white space-y-3">
                    <div className="flex flex-wrap gap-2 items-center">
                      <span className="text-xs font-mono text-gray-400">{les.lesson_type}</span>
                      <input
                        defaultValue={les.title}
                        key={les.id + les.title}
                        className="flex-1 min-w-[140px] px-2 py-1 border rounded text-sm font-semibold"
                        onBlur={(e) => {
                          const v = e.target.value.trim();
                          if (v && v !== les.title)
                            updateLesson.mutate({ moduleId: mod.id, lessonId: les.id, title: v });
                        }}
                      />
                      <button
                        type="button"
                        className="text-xs px-2 py-1 border rounded"
                        onClick={() => moveLesson(mod.id, lessons, li, -1)}
                        disabled={li === 0}
                      >
                        Up
                      </button>
                      <button
                        type="button"
                        className="text-xs px-2 py-1 border rounded"
                        onClick={() => moveLesson(mod.id, lessons, li, 1)}
                        disabled={li === lessons.length - 1}
                      >
                        Down
                      </button>
                      <button
                        type="button"
                        className="text-xs text-red-600"
                        onClick={() => {
                          if (confirm('Delete this lesson?')) deleteLesson.mutate({ moduleId: mod.id, lessonId: les.id });
                        }}
                      >
                        Delete
                      </button>
                    </div>
                    {les.lesson_type === 'text' && (
                      <LessonRichTextEditor
                        lessonKey={les.id}
                        initialHtml={String((les.content as { rich_text_content?: string })?.rich_text_content || '')}
                        onSave={(html) =>
                          updateLesson.mutate({
                            moduleId: mod.id,
                            lessonId: les.id,
                            content: { rich_text_content: html },
                          })
                        }
                      />
                    )}
                    {les.lesson_type === 'video' && (
                      <input
                        className="w-full border rounded p-2 text-sm"
                        placeholder="Embed URL"
                        defaultValue={String((les.content as { video_url?: string })?.video_url || '')}
                        onBlur={(e) => {
                          updateLesson.mutate({
                            moduleId: mod.id,
                            lessonId: les.id,
                            content: { video_url: e.target.value.trim() },
                          });
                        }}
                      />
                    )}
                    {les.lesson_type === 'pdf' && (
                      <div className="space-y-2">
                        <p className="text-xs text-gray-500">PDF file ID (upload via Company Files, then paste id)</p>
                        <input
                          className="w-full border rounded p-2 text-sm"
                          defaultValue={String((les.content as { pdf_file_id?: string })?.pdf_file_id || '')}
                          onBlur={(e) => {
                            updateLesson.mutate({
                              moduleId: mod.id,
                              lessonId: les.id,
                              content: { pdf_file_id: e.target.value.trim() },
                            });
                          }}
                        />
                      </div>
                    )}
                    {les.lesson_type === 'image' && (
                      <div className="space-y-2">
                        <p className="text-xs text-gray-500">Comma-separated image file IDs</p>
                        <input
                          className="w-full border rounded p-2 text-sm"
                          defaultValue={((les.content as { images?: string[] })?.images || []).join(', ')}
                          onBlur={(e) => {
                            const ids = e.target.value
                              .split(',')
                              .map((s) => s.trim())
                              .filter(Boolean);
                            updateLesson.mutate({ moduleId: mod.id, lessonId: les.id, content: { images: ids } });
                          }}
                        />
                      </div>
                    )}
                    {les.lesson_type === 'quiz' && les.quiz && (
                      <div className="border-t pt-3 space-y-2">
                        <div className="grid sm:grid-cols-3 gap-2">
                          <input
                            className="border rounded px-2 py-1 text-sm"
                            defaultValue={les.quiz.title}
                            onBlur={(e) => {
                              const t = e.target.value.trim();
                              if (t)
                                updateQuizMeta.mutate({
                                  quizId: les.quiz!.id,
                                  title: t,
                                  passing: les.quiz!.passing_score_percent,
                                  allow_retry: les.quiz!.allow_retry,
                                });
                            }}
                          />
                          <input
                            type="number"
                            className="border rounded px-2 py-1 text-sm"
                            defaultValue={les.quiz.passing_score_percent}
                            onBlur={(e) => {
                              const n = parseInt(e.target.value, 10);
                              if (!Number.isNaN(n))
                                updateQuizMeta.mutate({
                                  quizId: les.quiz!.id,
                                  title: les.quiz!.title,
                                  passing: n,
                                  allow_retry: les.quiz!.allow_retry,
                                });
                            }}
                          />
                          <label className="flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              defaultChecked={les.quiz.allow_retry}
                              onChange={(e) =>
                                updateQuizMeta.mutate({
                                  quizId: les.quiz!.id,
                                  title: les.quiz!.title,
                                  passing: les.quiz!.passing_score_percent,
                                  allow_retry: e.target.checked,
                                })
                              }
                            />
                            Allow retry
                          </label>
                        </div>
                        <ul className="text-sm space-y-1">
                          {(les.quiz.questions || []).map((q) => (
                            <li key={q.id} className="text-gray-700">
                              {q.question_text}
                            </li>
                          ))}
                        </ul>
                        <AddQuestionForm
                          onAdd={(text, options, correctIndex) =>
                            addQuestion.mutate({ quizId: les.quiz!.id, text, options, correctIndex })
                          }
                          disabled={addQuestion.isPending}
                        />
                      </div>
                    )}
                  </div>
                ))}

                <div className="border border-dashed rounded-lg p-4 bg-slate-50 space-y-2">
                  <div className="text-sm font-semibold text-gray-700">Add lesson</div>
                  <div className="flex flex-wrap gap-2">
                    <input
                      className="flex-1 min-w-[160px] border rounded px-2 py-1 text-sm"
                      placeholder="Title"
                      value={getDraft(mod.id).title}
                      onChange={(e) => setDraft(mod.id, { title: e.target.value })}
                    />
                    <select
                      className="border rounded px-2 py-1 text-sm"
                      value={getDraft(mod.id).lesson_type}
                      onChange={(e) => setDraft(mod.id, { lesson_type: e.target.value })}
                    >
                      {LESSON_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </div>
                  {getDraft(mod.id).lesson_type === 'text' && (
                    <LessonRichTextEditor
                      lessonKey={`draft-${mod.id}`}
                      initialHtml={getDraft(mod.id).body}
                      onSave={(html) => setDraft(mod.id, { body: html })}
                    />
                  )}
                  {getDraft(mod.id).lesson_type === 'video' && (
                    <input
                      className="w-full border rounded p-2 text-sm"
                      placeholder="Video embed URL"
                      value={getDraft(mod.id).body}
                      onChange={(e) => setDraft(mod.id, { body: e.target.value })}
                    />
                  )}
                  {(getDraft(mod.id).lesson_type === 'pdf' || getDraft(mod.id).lesson_type === 'image') && (
                    <div className="space-y-2">
                      <input
                        type="file"
                        accept={getDraft(mod.id).lesson_type === 'pdf' ? 'application/pdf' : 'image/*'}
                        onChange={async (e) => {
                          const f = e.target.files?.[0];
                          if (!f) return;
                          try {
                            const id = await uploadTrainingContentFile(f);
                            setDraft(mod.id, { body: id });
                            toast.success('File uploaded');
                          } catch {
                            toast.error('Upload failed');
                          }
                        }}
                      />
                      <p className="text-xs text-gray-500">File ID: {getDraft(mod.id).body || '—'}</p>
                    </div>
                  )}
                  <button
                    type="button"
                    disabled={createLesson.isPending}
                    onClick={() => submitNewLesson(mod.id)}
                    className="px-3 py-1.5 bg-gray-800 text-white rounded text-sm font-semibold"
                  >
                    Create lesson
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function AddQuestionForm({
  onAdd,
  disabled,
}: {
  onAdd: (text: string, options: string[], correctIndex: number) => void;
  disabled?: boolean;
}) {
  const [text, setText] = useState('');
  const [opts, setOpts] = useState('Option A\nOption B\nOption C');
  const [correct, setCorrect] = useState(0);
  return (
    <div className="flex flex-col gap-2 border rounded p-2 bg-slate-50">
      <input
        className="border rounded px-2 py-1 text-sm"
        placeholder="Question text"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <textarea
        className="border rounded px-2 py-1 text-sm font-mono min-h-[60px]"
        placeholder="One option per line"
        value={opts}
        onChange={(e) => setOpts(e.target.value)}
      />
      <div className="flex items-center gap-2 text-sm">
        <span>Correct option #</span>
        <input
          type="number"
          min={0}
          className="w-16 border rounded px-1"
          value={correct}
          onChange={(e) => setCorrect(parseInt(e.target.value, 10) || 0)}
        />
      </div>
      <button
        type="button"
        disabled={disabled || !text.trim()}
        onClick={() => {
          const options = opts
            .split('\n')
            .map((s) => s.trim())
            .filter(Boolean);
          if (options.length < 2) {
            toast.error('Need at least 2 options');
            return;
          }
          if (correct < 0 || correct >= options.length) {
            toast.error('Correct index out of range');
            return;
          }
          onAdd(text.trim(), options, correct);
          setText('');
        }}
        className="self-start px-3 py-1 bg-[#7f1010] text-white rounded text-xs font-semibold"
      >
        Add question
      </button>
    </div>
  );
}
