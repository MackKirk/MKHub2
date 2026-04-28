import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, withFileAccessToken } from '@/lib/api';
import { uploadTrainingContentFile } from '@/lib/trainingFileUpload';
import toast from 'react-hot-toast';
import { useEffect, useMemo, useState } from 'react';
import LessonRichTextEditor from '@/pages/training/LessonRichTextEditor';

const FIELD =
  'w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 transition-shadow focus:border-brand-red focus:outline-none focus:ring-2 focus:ring-brand-red/20';
const FIELD_XS = `${FIELD} text-xs py-1.5 px-2.5 rounded-lg`;
const BTN_ICON =
  'inline-flex h-7 min-w-[1.75rem] items-center justify-center rounded-md border border-slate-200 bg-white text-xs font-semibold text-gray-600 shadow-sm transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40';

const LESSON_TYPE_LABEL: Record<string, string> = {
  text: 'Rich text',
  video: 'Video',
  pdf: 'PDF',
  image: 'Images',
  quiz: 'Quiz',
};

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
    return (
      <div className="flex min-h-[200px] flex-col items-center justify-center rounded-xl border border-slate-200 bg-slate-50/50 px-6 py-10">
        <div className="h-9 w-9 animate-spin rounded-full border-2 border-slate-200 border-t-brand-red" />
        <p className="mt-3 text-sm font-medium text-gray-600">Loading course structure…</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 border-b border-slate-200/90 pb-5 sm:flex-row sm:flex-wrap sm:items-end">
        <div className="min-w-0 flex-1 sm:min-w-[220px]">
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">New module</label>
          <input
            value={newModuleTitle}
            onChange={(e) => setNewModuleTitle(e.target.value)}
            className={FIELD}
            placeholder="e.g. Introduction"
          />
        </div>
        <button
          type="button"
          disabled={!newModuleTitle.trim() || createModule.isPending}
          onClick={() => createModule.mutate(newModuleTitle.trim())}
          className="rounded-lg bg-brand-red px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-red-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-red/40 disabled:opacity-50 sm:shrink-0"
        >
          Add module
        </button>
      </div>

      {course.modules.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/40 px-4 py-6 text-center">
          <p className="text-sm font-medium text-gray-700">Start with a module</p>
          <p className="mt-1 text-sm text-gray-500">Modules group your lessons. Add one above, then create lessons from the outline.</p>
        </div>
      )}

      <div className="flex flex-col items-start gap-6 xl:flex-row">
        <aside className="max-h-[min(70vh,calc(100vh-12rem))] w-full shrink-0 space-y-4 overflow-y-auto rounded-xl border border-slate-200/90 bg-gradient-to-b from-slate-50/95 to-slate-50/60 p-3 shadow-sm xl:w-80">
          <div className="px-1 text-[10px] font-bold uppercase tracking-wider text-gray-400">Course outline</div>
          {sortedModules.map((mod, mi) => {
            const lessons = [...mod.lessons].sort((a, b) => a.order_index - b.order_index);
            return (
              <div key={mod.id} className="overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-sm">
                <div className="flex flex-wrap items-center gap-1 border-b border-slate-100 bg-white px-2 py-2">
                  <input
                    defaultValue={mod.title}
                    key={mod.id + mod.title}
                    className={`${FIELD_XS} min-w-[100px] flex-1 font-semibold`}
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      if (v && v !== mod.title) updateModule.mutate({ id: mod.id, title: v });
                    }}
                  />
                  <button type="button" title="Move up" className={BTN_ICON} onClick={() => moveModule(mi, -1)} disabled={mi === 0}>
                    ↑
                  </button>
                  <button
                    type="button"
                    title="Move down"
                    className={BTN_ICON}
                    onClick={() => moveModule(mi, 1)}
                    disabled={mi === sortedModules.length - 1}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    title="Delete module"
                    className={`${BTN_ICON} border-red-200 text-red-600 hover:bg-red-50`}
                    onClick={() => {
                      if (confirm('Delete this module and all its lessons?')) deleteModule.mutate(mod.id);
                    }}
                  >
                    ✕
                  </button>
                </div>
                <div className="space-y-0.5 p-1">
                  {lessons.map((les) => (
                    <button
                      key={les.id}
                      type="button"
                      onClick={() => setActiveLessonId(les.id)}
                      className={`w-full rounded-lg px-2.5 py-2 text-left text-sm transition-all ${
                        activeLessonId === les.id
                          ? 'bg-brand-red text-white shadow-md shadow-brand-red/15 ring-1 ring-brand-red/30'
                          : 'text-gray-800 hover:bg-slate-100'
                      }`}
                    >
                      <div className="truncate font-medium">{les.title}</div>
                      <div className="mt-1 flex items-center gap-1.5">
                        <span
                          className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                            activeLessonId === les.id ? 'bg-white/20 text-white' : 'bg-slate-100 text-gray-500'
                          }`}
                        >
                          {LESSON_TYPE_LABEL[les.lesson_type] ?? les.lesson_type}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
                <div className="space-y-2 border-t border-slate-100 bg-slate-50/70 p-2.5">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400">New lesson</div>
                  <input
                    className={FIELD_XS}
                    placeholder="Title"
                    value={getDraft(mod.id).title}
                    onChange={(e) => setDraft(mod.id, { title: e.target.value })}
                  />
                  <select
                    className={FIELD_XS}
                    value={getDraft(mod.id).lesson_type}
                    onChange={(e) => setDraft(mod.id, { lesson_type: e.target.value })}
                  >
                    {LESSON_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {LESSON_TYPE_LABEL[t] ?? t}
                      </option>
                    ))}
                  </select>
                  {getDraft(mod.id).lesson_type === 'video' && (
                    <input
                      className={FIELD_XS}
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
                        className="w-full text-[11px] file:mr-2 file:rounded-md file:border-0 file:bg-slate-200 file:px-2 file:py-1 file:text-xs file:font-semibold file:text-gray-700"
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
                      <p className="mt-1 truncate text-[10px] text-gray-500">ID: {getDraft(mod.id).body || '—'}</p>
                    </div>
                  )}
                  <button
                    type="button"
                    disabled={createLesson.isPending}
                    onClick={() => void submitNewLesson(mod.id)}
                    className="w-full rounded-lg bg-slate-800 px-2 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-red/25 disabled:opacity-50"
                  >
                    Create in this module
                  </button>
                </div>
              </div>
            );
          })}
        </aside>

        <section className="min-w-0 w-full flex-1 overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-sm">
          {!activeEntry ? (
            <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
              <div className="mb-3 rounded-full bg-slate-100 p-3 text-slate-500">
                <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
                  />
                </svg>
              </div>
              <p className="text-sm font-semibold text-gray-700">No lesson selected</p>
              <p className="mt-1 max-w-sm text-sm text-gray-500">
                Pick a lesson in the outline, or add modules and new lessons to start editing content.
              </p>
            </div>
          ) : (
            <div className="flex min-h-[420px] flex-col">
              <div className="flex flex-wrap items-center gap-2 border-b border-slate-200/80 bg-gradient-to-r from-slate-50 to-white px-3 py-3 sm:px-4">
                <span className="max-w-[38%] truncate text-[11px] font-bold uppercase tracking-wider text-brand-red">
                  {activeEntry.module.title}
                </span>
                <span className="text-xs text-gray-300">/</span>
                <input
                  defaultValue={activeEntry.lesson.title}
                  key={activeEntry.lesson.id + activeEntry.lesson.title}
                  className={`${FIELD} min-w-[120px] flex-1 py-1.5 text-sm font-semibold sm:min-w-[160px]`}
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
                <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                  {LESSON_TYPE_LABEL[activeEntry.lesson.lesson_type] ?? activeEntry.lesson.lesson_type}
                </span>
                {(() => {
                  const lessons = [...activeEntry.module.lessons].sort((a, b) => a.order_index - b.order_index);
                  const li = lessons.findIndex((l) => l.id === activeEntry.lesson.id);
                  return (
                    <>
                      <button
                        type="button"
                        title="Move lesson up"
                        className={BTN_ICON}
                        onClick={() => moveLesson(activeEntry.moduleId, lessons, li, -1)}
                        disabled={li <= 0}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        title="Move lesson down"
                        className={BTN_ICON}
                        onClick={() => moveLesson(activeEntry.moduleId, lessons, li, 1)}
                        disabled={li < 0 || li >= lessons.length - 1}
                      >
                        ↓
                      </button>
                    </>
                  );
                })()}
                <button
                  type="button"
                  className="ml-auto rounded-lg border border-red-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-red-600 shadow-sm transition-colors hover:bg-red-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-300/50"
                  onClick={() => {
                    if (confirm('Delete this lesson?')) {
                      deleteLesson.mutate({
                        moduleId: activeEntry.moduleId,
                        lessonId: activeEntry.lesson.id,
                      });
                    }
                  }}
                >
                  Delete
                </button>
              </div>
              <div className="flex-1 overflow-auto bg-white p-4">
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
                    className={FIELD}
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
                      className="w-full max-w-md text-sm file:mr-2 file:rounded-md file:border-0 file:bg-slate-200 file:px-2 file:py-1.5 file:text-xs file:font-semibold file:text-gray-700"
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
                        className={`${FIELD} mt-0.5 font-mono text-xs`}
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
                      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                        <iframe
                          title="PDF preview"
                          key={String((activeEntry.lesson.content as { pdf_file_id?: string }).pdf_file_id)}
                          src={`${withFileAccessToken(`/files/${(activeEntry.lesson.content as { pdf_file_id: string }).pdf_file_id}`)}#view=FitH`}
                          className="w-full h-[min(65vh,680px)] min-h-[400px] border-0"
                        />
                        <div className="border-t border-slate-100 bg-slate-50 px-3 py-2 text-xs">
                          <a
                            href={withFileAccessToken(
                              `/files/${(activeEntry.lesson.content as { pdf_file_id: string }).pdf_file_id}`,
                            )}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-medium text-brand-red underline-offset-2 hover:underline"
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
                      className={FIELD}
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
                  <div className="space-y-3 rounded-xl border border-slate-200/90 bg-slate-50/50 p-4">
                    <div className="grid gap-2 sm:grid-cols-3">
                      <input
                        className={`${FIELD} bg-white py-2`}
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
                        className={`${FIELD} bg-white py-2`}
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
                      <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
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
                    <ul className="space-y-1.5 text-sm">
                      {(activeEntry.lesson.quiz.questions || []).map((q) => (
                        <li
                          key={q.id}
                          className="rounded-lg border border-slate-100 bg-white px-3 py-2 text-gray-800 shadow-sm"
                        >
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
    <div className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <input
        className={FIELD}
        placeholder="Question text"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <textarea
        className={`${FIELD} min-h-[72px] resize-y font-mono text-xs`}
        placeholder="One option per line"
        value={opts}
        onChange={(e) => setOpts(e.target.value)}
      />
      <div className="flex flex-wrap items-center gap-2 text-sm text-gray-600">
        <span className="font-medium">Correct option #</span>
        <input
          type="number"
          min={0}
          className={`${FIELD} w-20 py-1.5 text-center`}
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
        className="self-start rounded-lg bg-brand-red px-4 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-red-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-red/40 disabled:opacity-50"
      >
        Add question
      </button>
    </div>
  );
}
