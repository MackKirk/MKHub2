import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, withFileAccessToken } from '@/lib/api';
import { uploadTrainingContentFile } from '@/lib/trainingFileUpload';
import toast from 'react-hot-toast';
import { useEffect, useMemo, useState } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useConfirm } from '@/components/ConfirmProvider';
import LessonRichTextEditor from '@/pages/training/LessonRichTextEditor';
import QuizBuilderSection from '@/pages/training/QuizBuilderSection';

const FIELD =
  'w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 transition-shadow focus:border-brand-red focus:outline-none focus:ring-2 focus:ring-brand-red/20';
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
    max_attempts?: number | null;
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

function HamburgerDragIcon({ className }: { className?: string }) {
  return (
    <svg className={className ?? 'h-4 w-4'} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path strokeLinecap="round" d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}

function SortableModuleCard({
  mod,
  indexDisplay,
  isActive,
  onSelect,
  onRequestDelete,
}: {
  mod: Module;
  indexDisplay: number;
  isActive: boolean;
  onSelect: () => void;
  onRequestDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: mod.id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.72 : 1,
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`overflow-hidden rounded-xl border bg-white shadow-sm transition-colors ${
        isActive ? 'border-brand-red/50 ring-1 ring-brand-red/25' : 'border-slate-200/90 hover:border-slate-300'
      }`}
    >
      <div className="flex items-start gap-0.5 px-2 py-2">
        <button
          type="button"
          ref={setActivatorNodeRef}
          className="mt-0.5 shrink-0 cursor-grab touch-none rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 active:cursor-grabbing"
          aria-label="Drag to reorder module"
          {...listeners}
          {...attributes}
        >
          <HamburgerDragIcon />
        </button>
        <button
          type="button"
          onClick={onSelect}
          className="flex min-w-0 flex-1 items-start gap-2 rounded-lg py-0.5 pl-0.5 text-left transition-colors hover:bg-slate-50/90"
        >
          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[11px] font-bold text-slate-700">
            {indexDisplay}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-semibold text-gray-900">{mod.title}</span>
            <span className="mt-0.5 block text-[11px] text-gray-500">
              {mod.lessons.length} {mod.lessons.length === 1 ? 'lesson' : 'lessons'}
            </span>
          </span>
        </button>
      </div>
      <div className="flex items-center justify-end border-t border-slate-100 bg-slate-50/80 px-2 py-1.5">
        <button
          type="button"
          title="Remove module"
          className={`${BTN_ICON} border-red-200 text-red-600 hover:bg-red-50`}
          onClick={(e) => {
            e.stopPropagation();
            onRequestDelete();
          }}
        >
          ✕
        </button>
      </div>
    </div>
  );
}

export default function CourseBuilderPanel({ courseId }: { courseId: string }) {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [activeModuleId, setActiveModuleId] = useState<string | null>(null);
  const [activeLessonId, setActiveLessonId] = useState<string | null>(null);
  const [moduleModalOpen, setModuleModalOpen] = useState(false);
  const [lessonModalOpen, setLessonModalOpen] = useState(false);
  const [newModuleTitle, setNewModuleTitle] = useState('');
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
    if (sortedModules.length === 0) {
      setActiveModuleId(null);
      setActiveLessonId(null);
      return;
    }
    setActiveModuleId((prev) => {
      if (prev && sortedModules.some((m) => m.id === prev)) return prev;
      return sortedModules[0].id;
    });
  }, [sortedModules]);

  useEffect(() => {
    if (!activeModuleId) {
      setActiveLessonId(null);
      return;
    }
    const mod = sortedModules.find((m) => m.id === activeModuleId);
    if (!mod) return;
    const sortedLessons = [...mod.lessons].sort((a, b) => a.order_index - b.order_index);
    const ids = sortedLessons.map((l) => l.id);
    setActiveLessonId((prev) => {
      if (prev && ids.includes(prev)) return prev;
      return sortedLessons[0]?.id ?? null;
    });
  }, [activeModuleId, sortedModules]);

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
      api<{ id: string }>('POST', `/training/admin/courses/${courseId}/modules`, { title, order_index: 0 }),
    onSuccess: (res) => {
      toast.success('Module added');
      setNewModuleTitle('');
      setModuleModalOpen(false);
      invalidate();
      if (res?.id) setActiveModuleId(res.id);
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

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const moduleIdsOrdered = useMemo(() => sortedModules.map((m) => m.id), [sortedModules]);

  const handleModuleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const ids = [...moduleIdsOrdered];
    const oldIndex = ids.indexOf(String(active.id));
    const newIndex = ids.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    reorderModules.mutate(arrayMove(ids, oldIndex, newIndex));
  };

  const handleDeleteModule = async (mod: Module) => {
    const result = await confirm({
      title: 'Remove module',
      message: `Remove "${mod.title}" and all lessons inside? This cannot be undone.`,
      confirmText: 'Remove module',
      cancelText: 'Cancel',
    });
    if (result !== 'confirm') return;
    deleteModule.mutate(mod.id);
  };

  const handleDeleteLesson = async (moduleId: string, lessonId: string, lessonTitle: string) => {
    const result = await confirm({
      title: 'Remove lesson',
      message: `Remove "${lessonTitle}"? This cannot be undone.`,
      confirmText: 'Remove lesson',
      cancelText: 'Cancel',
    });
    if (result !== 'confirm') return;
    deleteLesson.mutate({ moduleId, lessonId });
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
      setLessonModalOpen(false);
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

  const activeModule = useMemo(
    () => sortedModules.find((m) => m.id === activeModuleId) ?? null,
    [sortedModules, activeModuleId],
  );

  const lessonsInActiveModule = useMemo(() => {
    if (!activeModule) return [];
    return [...activeModule.lessons].sort((a, b) => a.order_index - b.order_index);
  }, [activeModule]);

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
      {course.modules.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/40 px-6 py-10 text-center">
          <p className="text-base font-semibold text-gray-800">Start with a module</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-gray-500">
            Modules are chapters or sections. Each module has its own lesson list — add one here to begin building content.
          </p>
          <button
            type="button"
            onClick={() => {
              setNewModuleTitle('');
              setModuleModalOpen(true);
            }}
            className="mt-5 rounded-xl bg-brand-red px-6 py-3 text-sm font-semibold text-white shadow-md transition-colors hover:bg-red-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-red/40"
          >
            Add module
          </button>
        </div>
      ) : (
      <div className="flex flex-col items-start gap-6 xl:flex-row">
        <aside className="max-h-[min(70vh,calc(100vh-12rem))] w-full shrink-0 overflow-y-auto rounded-xl border border-slate-200/90 bg-gradient-to-b from-slate-50/95 to-slate-50/60 p-3 shadow-sm xl:w-[300px]">
          <div className="mb-3 flex items-center justify-between gap-2 px-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Modules</span>
            <button
              type="button"
              onClick={() => {
                setNewModuleTitle('');
                setModuleModalOpen(true);
              }}
              className="rounded-lg bg-white px-2.5 py-1.5 text-xs font-semibold text-brand-red shadow-sm ring-1 ring-slate-200 transition-colors hover:bg-slate-50"
            >
              + Add module
            </button>
          </div>

          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleModuleDragEnd}>
            <SortableContext items={moduleIdsOrdered} strategy={verticalListSortingStrategy}>
              <div className="space-y-2">
                {sortedModules.map((mod, mi) => (
                  <SortableModuleCard
                    key={mod.id}
                    mod={mod}
                    indexDisplay={mi + 1}
                    isActive={activeModuleId === mod.id}
                    onSelect={() => setActiveModuleId(mod.id)}
                    onRequestDelete={() => void handleDeleteModule(mod)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>

          {activeModule && (
            <div className="mt-5 border-t border-slate-200 pt-4">
              <div className="mb-2 flex items-start justify-between gap-2 px-1">
                <div className="min-w-0">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Lessons</div>
                  <p className="mt-0.5 truncate text-xs font-medium text-gray-700" title={activeModule.title}>
                    {activeModule.title}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setLessonModalOpen(true)}
                  disabled={!activeModuleId}
                  className="shrink-0 rounded-lg bg-slate-800 px-2.5 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-slate-900 disabled:opacity-40"
                >
                  + Add lesson
                </button>
              </div>
              <div className="space-y-1">
                {lessonsInActiveModule.map((les) => (
                  <button
                    key={les.id}
                    type="button"
                    onClick={() => setActiveLessonId(les.id)}
                    className={`w-full rounded-lg px-2.5 py-2 text-left text-sm transition-all ${
                      activeLessonId === les.id
                        ? 'bg-brand-red text-white shadow-md shadow-brand-red/15 ring-1 ring-brand-red/30'
                        : 'text-gray-800 hover:bg-white'
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
            </div>
          )}
        </aside>

        <section className="min-w-0 w-full flex-1 overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-sm">
          {activeEntry ? (
            <div className="flex min-h-[420px] flex-col">
              <div className="flex flex-col gap-3 border-b border-slate-200/80 bg-gradient-to-r from-slate-50 to-white px-3 py-3 sm:px-4">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Lesson editor</p>
                <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
                  <div className="min-w-0 flex-1 sm:max-w-[min(100%,320px)]">
                    <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">
                      Module name
                    </label>
                    <input
                      defaultValue={activeEntry.module.title}
                      key={`mod-title-${activeEntry.module.id}-${activeEntry.module.title}`}
                      className={`${FIELD} py-2 text-sm font-semibold text-gray-900`}
                      onBlur={(e) => {
                        const v = e.target.value.trim();
                        if (v && v !== activeEntry.module.title)
                          updateModule.mutate({ id: activeEntry.module.id, title: v });
                      }}
                    />
                  </div>
                  <div className="min-w-0 flex-[2] sm:min-w-[200px]">
                    <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">
                      Lesson title
                    </label>
                    <input
                      defaultValue={activeEntry.lesson.title}
                      key={activeEntry.lesson.id + activeEntry.lesson.title}
                      className={`${FIELD} py-2 text-sm font-semibold`}
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
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
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
                    onClick={() =>
                      void handleDeleteLesson(
                        activeEntry.moduleId,
                        activeEntry.lesson.id,
                        activeEntry.lesson.title,
                      )
                    }
                  >
                    Delete lesson
                  </button>
                </div>
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
                  <QuizBuilderSection courseId={courseId} quiz={activeEntry.lesson.quiz} />
                )}
              </div>
            </div>
          ) : activeModule && lessonsInActiveModule.length === 0 ? (
            <div className="flex min-h-[420px] flex-col items-center justify-center px-6 py-16 text-center">
              <div className="mb-4 rounded-2xl bg-slate-100 p-4 text-slate-500">
                <svg className="mx-auto h-10 w-10" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M12 6v12m6-6H6"
                  />
                </svg>
              </div>
              <p className="text-lg font-semibold text-gray-800">This module has no lessons yet</p>
              <p className="mx-auto mt-2 max-w-md text-sm text-gray-500">
                Create the first lesson for <span className="font-medium text-gray-700">{activeModule.title}</span>. You
                can add rich text, video, PDF, images, or a quiz.
              </p>
              <button
                type="button"
                onClick={() => setLessonModalOpen(true)}
                className="mt-8 rounded-xl bg-brand-red px-8 py-3 text-sm font-semibold text-white shadow-lg shadow-brand-red/20 transition-colors hover:bg-red-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-red/40"
              >
                Add lesson
              </button>
            </div>
          ) : (
            <div className="flex min-h-[320px] flex-col items-center justify-center px-6 py-16 text-center">
              <p className="text-sm font-semibold text-gray-700">Select a lesson</p>
              <p className="mt-2 max-w-sm text-sm text-gray-500">
                Choose a module, then pick a lesson in the sidebar — or add a new lesson.
              </p>
            </div>
          )}
        </section>
      </div>
      )}

      {moduleModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/45"
            aria-label="Close"
            onClick={() => !createModule.isPending && setModuleModalOpen(false)}
          />
          <div
            className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-slate-200"
            role="dialog"
            aria-labelledby="module-modal-title"
          >
            <h2 id="module-modal-title" className="text-lg font-bold text-gray-900">
              New module
            </h2>
            <p className="mt-1 text-sm text-gray-500">Give this section a clear name (e.g. “Safety basics”).</p>
            <label className="mt-4 block text-xs font-semibold uppercase tracking-wide text-gray-500">
              Module title
              <input
                autoFocus
                value={newModuleTitle}
                onChange={(e) => setNewModuleTitle(e.target.value)}
                className={`${FIELD} mt-1`}
                placeholder="e.g. Introduction"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newModuleTitle.trim()) createModule.mutate(newModuleTitle.trim());
                }}
              />
            </label>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                disabled={createModule.isPending}
                onClick={() => setModuleModalOpen(false)}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!newModuleTitle.trim() || createModule.isPending}
                onClick={() => createModule.mutate(newModuleTitle.trim())}
                className="rounded-lg bg-brand-red px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-red-700 disabled:opacity-50"
              >
                {createModule.isPending ? 'Creating…' : 'Create module'}
              </button>
            </div>
          </div>
        </div>
      )}

      {lessonModalOpen && activeModuleId && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/45"
            aria-label="Close"
            onClick={() => !createLesson.isPending && setLessonModalOpen(false)}
          />
          <div
            className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-slate-200"
            role="dialog"
            aria-labelledby="lesson-modal-title"
          >
            <h2 id="lesson-modal-title" className="text-lg font-bold text-gray-900">
              New lesson
            </h2>
            <p className="mt-1 truncate text-sm text-gray-500">
              Module: <span className="font-semibold text-gray-700">{activeModule?.title}</span>
            </p>
            <div className="mt-4 space-y-3">
              <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500">
                Lesson title
                <input
                  autoFocus
                  className={`${FIELD} mt-1`}
                  placeholder="e.g. Welcome video"
                  value={getDraft(activeModuleId).title}
                  onChange={(e) => setDraft(activeModuleId, { title: e.target.value })}
                />
              </label>
              <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500">
                Content type
                <select
                  className={`${FIELD} mt-1`}
                  value={getDraft(activeModuleId).lesson_type}
                  onChange={(e) => setDraft(activeModuleId, { lesson_type: e.target.value })}
                >
                  {LESSON_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {LESSON_TYPE_LABEL[t] ?? t}
                    </option>
                  ))}
                </select>
              </label>
              {getDraft(activeModuleId).lesson_type === 'video' && (
                <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Embed URL
                  <input
                    className={`${FIELD} mt-1`}
                    placeholder="https://…"
                    value={getDraft(activeModuleId).body}
                    onChange={(e) => setDraft(activeModuleId, { body: e.target.value })}
                  />
                </label>
              )}
              {(getDraft(activeModuleId).lesson_type === 'pdf' ||
                getDraft(activeModuleId).lesson_type === 'image') && (
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Upload file
                  </label>
                  <input
                    type="file"
                    accept={
                      getDraft(activeModuleId).lesson_type === 'pdf' ? 'application/pdf' : 'image/*'
                    }
                    className="mt-1 w-full text-sm file:mr-2 file:rounded-md file:border-0 file:bg-slate-200 file:px-2 file:py-1.5 file:text-xs file:font-semibold file:text-gray-700"
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      try {
                        const id = await uploadTrainingContentFile(f);
                        setDraft(activeModuleId, { body: id });
                        toast.success('File uploaded');
                      } catch {
                        toast.error('Upload failed');
                      }
                    }}
                  />
                  <p className="mt-1 truncate font-mono text-[10px] text-gray-500">
                    File ID: {getDraft(activeModuleId).body || '—'}
                  </p>
                </div>
              )}
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                disabled={createLesson.isPending}
                onClick={() => setLessonModalOpen(false)}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={createLesson.isPending}
                onClick={() => void submitNewLesson(activeModuleId)}
                className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-900 disabled:opacity-50"
              >
                {createLesson.isPending ? 'Creating…' : 'Create lesson'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
