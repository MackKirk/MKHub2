import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, withFileAccessToken } from '@/lib/api';
import { uploadTrainingContentFile } from '@/lib/trainingFileUpload';
import toast from 'react-hot-toast';
import { useEffect, useMemo, useState } from 'react';
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
  const [activeLessonId, setActiveLessonId] = useState<string | null>(null);
  const [lessonDraft, setLessonDraft] = useState<Record<string, { title: string; lesson_type: string; body: string }>>(
    {},
  );

  const { data: course, isLoading } = useQuery<AdminCourse>({
    queryKey: ['training-admin-course', courseId],
    queryFn: () => api<AdminCourse>('GET', `/training/admin/courses/${courseId}`),
    enabled: !!courseId,
  });

  const sortedModules = useMemo(
    () => [...(course?.modules || [])].sort((a, b) => a.order_index - b.order_index),
    [course?.modules],
  );

  useEffect(() => {
    const ids: string[] = [];
    for (const mod of sortedModules) {
      for (const les of [...mod.lessons].sort((a, b) => a.order_index - b.order_index)) {
        ids.push(les.id);
      }
    }
    if (ids.length === 0) {
      setActiveLessonId(null);
      return;
    }
    setActiveLessonId((prev) => (prev && ids.includes(prev) ? prev : ids[0]));
  }, [sortedModules]);

  const activeEntry = useMemo(() => {
    if (!activeLessonId) return null;
    for (const mod of sortedModules) {
      const lesson = mod.lessons.find((l) => l.id === activeLessonId);
      if (lesson) return { moduleId: mod.id, module: mod, lesson };
    }
    return null;
  }, [sortedModules, activeLessonId]);

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
      api<{ id: string }>('POST', `/training/admin/courses/${courseId}/modules/${payload.moduleId}/lessons`, {
        title: payload.title,
        lesson_type: payload.lesson_type,
        requires_completion: true,
        content: payload.content,
      }),
    onSuccess: () => invalidate(),
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
    const mods = [...sortedModules];
    const j = idx + dir;
    if (j < 0 || j >= mods.length) return;
    const ids = mods.map((m) => m.id);
    const t = ids[idx];
    ids[idx] = ids[j];
    ids[j] = t!;
    reorderModules.mutate(ids);
  };

  const moveLesson = (moduleId: string, lessons: Lesson[], idx: number, dir: -1 | 1) => {
    const sorted = [...lessons].sort((a, b) => a.order_index - b.order_index);
    const j = idx + dir;
    if (j < 0 || j >= sorted.length) return;
    const ids = sorted.map((l) => l.id);
    const t = ids[idx];
    ids[idx] = ids[j];
    ids[j] = t!;
    reorderLessons.mutate({ moduleId, lessonIds: ids });
  };

  const draftKey = (moduleId: string) => `new-${moduleId}`;

  const getDraft = (moduleId: string) =>
    lessonDraft[draftKey(moduleId)] || { title: 'New lesson', lesson_type: 'text', body: '' };

  const setDraft = (moduleId: string, part: Partial<{ title: string; lesson_type: string; body: string }>) => {
    const k = draftKey(moduleId);
    setLessonDraft((d) => ({ ...d, [k]: { ...getDraft(moduleId), ...part } }));
  };

  const submitNewLesson = async (moduleId: string) => {
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
    try {
      const res = await createLesson.mutateAsync({
        moduleId,
        title: d.title.trim() || 'Lesson',
        lesson_type: d.lesson_type,
        content,
      });
      toast.success('Lesson added');
      if (res?.id) setActiveLessonId(res.id);
      setLessonDraft((prev) => {
        const next = { ...prev };
        delete next[draftKey(moduleId)];
        return next;
      });
    } catch {
      /* toast from mutation */
    }
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
        <p className="text-sm text-gray-500">Add a module, then add lessons from the outline.</p>
      )}

      <div className="flex flex-col xl:flex-row gap-6 items-start">
        <aside className="w-full xl:w-80 shrink-0 border rounded-xl bg-slate-50/90 p-3 max-h-[min(70vh,calc(100vh-12rem))] overflow-y-auto space-y-4 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 px-1">Course outline</div>
          {sortedModules.map((mod, mi) => {
            const lessons = [...mod.lessons].sort((a, b) => a.order_index - b.order_index);
            return (
              <div key={mod.id} className="rounded-lg border border-gray-200 bg-white overflow-hidden">
                <div className="flex flex-wrap items-center gap-1 px-2 py-2 bg-slate-100/80 border-b border-gray-100">
                  <input
                    defaultValue={mod.title}
                    key={mod.id + mod.title}
                    className="flex-1 min-w-[100px] px-2 py-1 border rounded text-xs font-semibold"
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      if (v && v !== mod.title) updateModule.mutate({ id: mod.id, title: v });
                    }}
                  />
                  <button
                    type="button"
                    className="text-[10px] px-1.5 py-0.5 border rounded"
                    onClick={() => moveModule(mi, -1)}
                    disabled={mi === 0}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="text-[10px] px-1.5 py-0.5 border rounded"
                    onClick={() => moveModule(mi, 1)}
                    disabled={mi === sortedModules.length - 1}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className="text-[10px] text-red-600 px-1"
                    onClick={() => {
                      if (confirm('Delete this module and all its lessons?')) deleteModule.mutate(mod.id);
                    }}
                  >
                    ✕
                  </button>
                </div>
                <div className="p-1 space-y-0.5">
                  {lessons.map((les) => (
                    <button
                      key={les.id}
                      type="button"
                      onClick={() => setActiveLessonId(les.id)}
                      className={`w-full text-left rounded-md px-2 py-2 text-sm transition-colors ${
                        activeLessonId === les.id
                          ? 'bg-[#7f1010] text-white shadow-inner'
                          : 'hover:bg-slate-100 text-gray-800'
                      }`}
                    >
                      <div className="font-medium truncate">{les.title}</div>
                      <div
                        className={`text-[10px] uppercase mt-0.5 ${activeLessonId === les.id ? 'text-white/80' : 'text-gray-400'}`}
                      >
                        {les.lesson_type}
                      </div>
                    </button>
                  ))}
                </div>
                <div className="p-2 border-t border-gray-100 bg-slate-50/80 space-y-2">
                  <div className="text-[10px] font-semibold text-gray-500 uppercase">New lesson</div>
                  <input
                    className="w-full border rounded px-2 py-1 text-xs"
                    placeholder="Title"
                    value={getDraft(mod.id).title}
                    onChange={(e) => setDraft(mod.id, { title: e.target.value })}
                  />
                  <select
                    className="w-full border rounded px-2 py-1 text-xs"
                    value={getDraft(mod.id).lesson_type}
                    onChange={(e) => setDraft(mod.id, { lesson_type: e.target.value })}
                  >
                    {LESSON_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                  {getDraft(mod.id).lesson_type === 'video' && (
                    <input
                      className="w-full border rounded px-2 py-1 text-xs"
                      placeholder="Embed URL"
                      value={getDraft(mod.id).body}
                      onChange={(e) => setDraft(mod.id, { body: e.target.value })}
                    />
                  )}
                  {(getDraft(mod.id).lesson_type === 'pdf' || getDraft(mod.id).lesson_type === 'image') && (
                    <div>
                      <input
                        type="file"
                        accept={getDraft(mod.id).lesson_type === 'pdf' ? 'application/pdf' : 'image/*'}
                        className="text-[10px] w-full"
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
                      <p className="text-[10px] text-gray-500 mt-1 truncate">ID: {getDraft(mod.id).body || '—'}</p>
                    </div>
                  )}
                  <button
                    type="button"
                    disabled={createLesson.isPending}
                    onClick={() => void submitNewLesson(mod.id)}
                    className="w-full px-2 py-1.5 bg-gray-800 text-white rounded text-xs font-semibold"
                  >
                    Create in this module
                  </button>
                </div>
              </div>
            );
          })}
        </aside>

        <section className="flex-1 min-w-0 w-full border rounded-xl bg-white shadow-sm overflow-hidden">
          {!activeEntry ? (
            <div className="p-10 text-center text-gray-500 text-sm">
              Select a lesson in the outline, or add modules and lessons to get started.
            </div>
          ) : (
            <div className="flex flex-col min-h-[420px]">
              <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b bg-slate-50/80">
                <span className="text-xs font-semibold text-[#7f1010] uppercase tracking-wide truncate max-w-[40%]">
                  {activeEntry.module.title}
                </span>
                <span className="text-xs text-gray-400">/</span>
                <input
                  defaultValue={activeEntry.lesson.title}
                  key={activeEntry.lesson.id + activeEntry.lesson.title}
                  className="flex-1 min-w-[140px] px-2 py-1 border rounded text-sm font-semibold"
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    if (v && v !== activeEntry.lesson.title)
                      updateLesson.mutate({
                        moduleId: activeEntry.moduleId,
                        lessonId: activeEntry.lesson.id,
                        title: v,
                      });
                  }}
                />
                <span className="text-xs font-mono text-gray-400">{activeEntry.lesson.lesson_type}</span>
                {(() => {
                  const lessons = [...activeEntry.module.lessons].sort((a, b) => a.order_index - b.order_index);
                  const li = lessons.findIndex((l) => l.id === activeEntry.lesson.id);
                  return (
                    <>
                      <button
                        type="button"
                        className="text-xs px-2 py-1 border rounded"
                        onClick={() => moveLesson(activeEntry.moduleId, lessons, li, -1)}
                        disabled={li <= 0}
                      >
                        Lesson ↑
                      </button>
                      <button
                        type="button"
                        className="text-xs px-2 py-1 border rounded"
                        onClick={() => moveLesson(activeEntry.moduleId, lessons, li, 1)}
                        disabled={li < 0 || li >= lessons.length - 1}
                      >
                        Lesson ↓
                      </button>
                    </>
                  );
                })()}
                <button
                  type="button"
                  className="text-xs text-red-600 ml-auto"
                  onClick={() => {
                    if (confirm('Delete this lesson?')) {
                      deleteLesson.mutate({
                        moduleId: activeEntry.moduleId,
                        lessonId: activeEntry.lesson.id,
                      });
                    }
                  }}
                >
                  Delete lesson
                </button>
              </div>
              <div className="p-4 flex-1 overflow-auto bg-white">
                {activeEntry.lesson.lesson_type === 'text' && (
                  <LessonRichTextEditor
                    lessonKey={activeEntry.lesson.id}
                    initialHtml={String((activeEntry.lesson.content as { rich_text_content?: string })?.rich_text_content || '')}
                    onSave={(html) =>
                      updateLesson.mutate({
                        moduleId: activeEntry.moduleId,
                        lessonId: activeEntry.lesson.id,
                        content: { rich_text_content: html },
                      })
                    }
                  />
                )}
                {activeEntry.lesson.lesson_type === 'video' && (
                  <input
                    className="w-full border rounded p-2 text-sm"
                    placeholder="Embed URL"
                    defaultValue={String((activeEntry.lesson.content as { video_url?: string })?.video_url || '')}
                    onBlur={(e) => {
                      updateLesson.mutate({
                        moduleId: activeEntry.moduleId,
                        lessonId: activeEntry.lesson.id,
                        content: { video_url: e.target.value.trim() },
                      });
                    }}
                  />
                )}
                {activeEntry.lesson.lesson_type === 'pdf' && (
                  <div className="space-y-3">
                    <p className="text-xs text-gray-500">
                      Upload a PDF below (stored as course content). The ID updates automatically; learners see the same preview.
                    </p>
                    <input
                      type="file"
                      accept="application/pdf"
                      className="text-sm w-full max-w-md"
                      onChange={async (e) => {
                        const f = e.target.files?.[0];
                        if (!f) return;
                        try {
                          const id = await uploadTrainingContentFile(f);
                          updateLesson.mutate({
                            moduleId: activeEntry.moduleId,
                            lessonId: activeEntry.lesson.id,
                            content: { pdf_file_id: id },
                          });
                          toast.success('PDF uploaded');
                        } catch {
                          toast.error('PDF upload failed');
                        }
                        e.target.value = '';
                      }}
                    />
                    <div>
                      <label className="text-xs font-semibold text-gray-600">File ID (optional manual edit)</label>
                      <input
                        className="w-full border rounded p-2 text-sm font-mono mt-0.5"
                        defaultValue={String((activeEntry.lesson.content as { pdf_file_id?: string })?.pdf_file_id || '')}
                        key={(activeEntry.lesson.content as { pdf_file_id?: string })?.pdf_file_id || 'empty'}
                        onBlur={(e) => {
                          const v = e.target.value.trim();
                          updateLesson.mutate({
                            moduleId: activeEntry.moduleId,
                            lessonId: activeEntry.lesson.id,
                            content: { pdf_file_id: v },
                          });
                        }}
                      />
                    </div>
                    {(activeEntry.lesson.content as { pdf_file_id?: string })?.pdf_file_id ? (
                      <div className="border rounded-lg overflow-hidden bg-white">
                        <iframe
                          title="PDF preview"
                          key={String((activeEntry.lesson.content as { pdf_file_id?: string }).pdf_file_id)}
                          src={`${withFileAccessToken(`/files/${(activeEntry.lesson.content as { pdf_file_id: string }).pdf_file_id}`)}#view=FitH`}
                          className="w-full h-[min(65vh,680px)] min-h-[400px] border-0"
                        />
                        <div className="px-2 py-2 border-t bg-slate-50 text-xs">
                          <a
                            href={withFileAccessToken(
                              `/files/${(activeEntry.lesson.content as { pdf_file_id: string }).pdf_file_id}`,
                            )}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[#7f1010] underline"
                          >
                            Open in new tab
                          </a>
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-amber-800">Upload a PDF or paste a file UUID to enable preview.</p>
                    )}
                  </div>
                )}
                {activeEntry.lesson.lesson_type === 'image' && (
                  <div className="space-y-2">
                    <p className="text-xs text-gray-500">Comma-separated image file IDs</p>
                    <input
                      className="w-full border rounded p-2 text-sm"
                      defaultValue={((activeEntry.lesson.content as { images?: string[] })?.images || []).join(', ')}
                      onBlur={(e) => {
                        const ids = e.target.value
                          .split(',')
                          .map((s) => s.trim())
                          .filter(Boolean);
                        updateLesson.mutate({
                          moduleId: activeEntry.moduleId,
                          lessonId: activeEntry.lesson.id,
                          content: { images: ids },
                        });
                      }}
                    />
                  </div>
                )}
                {activeEntry.lesson.lesson_type === 'quiz' && activeEntry.lesson.quiz && (
                  <div className="border rounded-lg p-4 space-y-3 bg-slate-50/50">
                    <div className="grid sm:grid-cols-3 gap-2">
                      <input
                        className="border rounded px-2 py-1 text-sm bg-white"
                        defaultValue={activeEntry.lesson.quiz.title}
                        onBlur={(e) => {
                          const t = e.target.value.trim();
                          if (t)
                            updateQuizMeta.mutate({
                              quizId: activeEntry.lesson.quiz!.id,
                              title: t,
                              passing: activeEntry.lesson.quiz!.passing_score_percent,
                              allow_retry: activeEntry.lesson.quiz!.allow_retry,
                            });
                        }}
                      />
                      <input
                        type="number"
                        className="border rounded px-2 py-1 text-sm bg-white"
                        defaultValue={activeEntry.lesson.quiz.passing_score_percent}
                        onBlur={(e) => {
                          const n = parseInt(e.target.value, 10);
                          if (!Number.isNaN(n))
                            updateQuizMeta.mutate({
                              quizId: activeEntry.lesson.quiz!.id,
                              title: activeEntry.lesson.quiz!.title,
                              passing: n,
                              allow_retry: activeEntry.lesson.quiz!.allow_retry,
                            });
                        }}
                      />
                      <label className="flex items-center gap-2 text-sm bg-white border rounded px-2">
                        <input
                          type="checkbox"
                          defaultChecked={activeEntry.lesson.quiz.allow_retry}
                          onChange={(e) =>
                            updateQuizMeta.mutate({
                              quizId: activeEntry.lesson.quiz!.id,
                              title: activeEntry.lesson.quiz!.title,
                              passing: activeEntry.lesson.quiz!.passing_score_percent,
                              allow_retry: e.target.checked,
                            })
                          }
                        />
                        Allow retry
                      </label>
                    </div>
                    <ul className="text-sm space-y-1">
                      {(activeEntry.lesson.quiz.questions || []).map((q) => (
                        <li key={q.id} className="text-gray-700">
                          {q.question_text}
                        </li>
                      ))}
                    </ul>
                    <AddQuestionForm
                      onAdd={(text, options, correctIndex) =>
                        addQuestion.mutate({ quizId: activeEntry.lesson.quiz!.id, text, options, correctIndex })
                      }
                      disabled={addQuestion.isPending}
                    />
                  </div>
                )}
              </div>
            </div>
          )}
        </section>
      </div>
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
    <div className="flex flex-col gap-2 border rounded p-2 bg-white">
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
