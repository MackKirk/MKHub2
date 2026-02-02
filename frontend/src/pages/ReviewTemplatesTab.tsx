import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';

const QUESTION_TYPES = [
  { value: 'text', label: 'Open text' },
  { value: 'scale', label: 'Scale (1–5)' },
] as const;

type QuestionRow = {
  id?: string;
  key: string;
  label: string;
  type: string;
  options: { min?: number; max?: number } | null;
  required: boolean;
};

const emptyQuestion = (): QuestionRow => ({
  key: '',
  label: '',
  type: 'text',
  options: null,
  required: false,
});

function GrabberIcon({ className }: { className?: string }) {
  return (
    <svg className={className ?? 'w-5 h-5'} fill="currentColor" viewBox="0 0 24 24" aria-hidden>
      <circle cx="9" cy="6" r="1.5" />
      <circle cx="15" cy="6" r="1.5" />
      <circle cx="9" cy="12" r="1.5" />
      <circle cx="15" cy="12" r="1.5" />
      <circle cx="9" cy="18" r="1.5" />
      <circle cx="15" cy="18" r="1.5" />
    </svg>
  );
}

export default function ReviewTemplatesTab() {
  const queryClient = useQueryClient();
  const { data: templates = [], refetch: refetchTemplates } = useQuery({
    queryKey: ['review-templates'],
    queryFn: () => api<any[]>('GET', '/reviews/templates'),
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [questions, setQuestions] = useState<QuestionRow[]>([]);
  const [isNew, setIsNew] = useState(false);
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const [dragInsertPosition, setDragInsertPosition] = useState<'above' | 'below' | null>(null);

  const { data: existingQuestions = [] } = useQuery({
    queryKey: ['review-template-questions', selectedId],
    queryFn: () => api<any[]>('GET', `/reviews/templates/${selectedId}/questions`),
    enabled: !!selectedId && !isNew,
  });

  useEffect(() => {
    if (isNew) {
      setName('');
      setQuestions([{ ...emptyQuestion(), key: 'q1', label: 'Overall performance', type: 'scale', options: { min: 1, max: 5 }, required: true }]);
      return;
    }
    if (!selectedId) {
      setName('');
      setQuestions([]);
      return;
    }
    const t = templates.find((x: any) => x.id === selectedId);
    if (t) setName(t.name);
    if (Array.isArray(existingQuestions)) {
      setQuestions(
        existingQuestions.map((q: any) => ({
          id: q.id,
          key: q.key || '',
          label: q.label || '',
          type: q.type || 'text',
          options: q.type === 'scale' ? { min: q.options?.min ?? 1, max: q.options?.max ?? 5 } : null,
          required: !!q.required,
        }))
      );
    }
  }, [selectedId, isNew, existingQuestions, templates]);

  const addQuestion = () => {
    setQuestions((qs) => [...qs, { ...emptyQuestion(), key: `q${qs.length + 1}` }]);
  };

  const updateQuestion = (idx: number, field: keyof QuestionRow, value: any) => {
    setQuestions((qs) => {
      const v = [...qs];
      v[idx] = { ...v[idx], [field]: value };
      if (field === 'type' && value === 'scale') v[idx].options = { min: 1, max: 5 };
      if (field === 'type' && value === 'text') v[idx].options = null;
      return v;
    });
  };

  const updateScaleOptions = (idx: number, key: 'min' | 'max', value: number) => {
    setQuestions((qs) => {
      const v = [...qs];
      v[idx] = { ...v[idx], options: { ...(v[idx].options || { min: 1, max: 5 }), [key]: value } };
      return v;
    });
  };

  const removeQuestion = (idx: number) => {
    setQuestions((qs) => qs.filter((_, i) => i !== idx));
    if (draggingIdx === idx) setDraggingIdx(null);
    if (dragOverIdx === idx) setDragOverIdx(null);
  };

  const handleDragStart = (idx: number, e: React.DragEvent) => {
    const target = e.target as HTMLElement;
    if (!target.closest('[data-grabber]')) {
      e.preventDefault();
      return;
    }
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(idx));
    setDraggingIdx(idx);
  };

  const handleDragOver = (idx: number, e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (draggingIdx === null || draggingIdx === idx) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const mid = rect.top + rect.height / 2;
    setDragOverIdx(idx);
    setDragInsertPosition(e.clientY < mid ? 'above' : 'below');
  };

  const handleDragLeave = () => {
    setDragOverIdx(null);
    setDragInsertPosition(null);
  };

  const handleDrop = (idx: number) => {
    if (draggingIdx === null) return;
    const fromIdx = draggingIdx;
    setDraggingIdx(null);
    setDragOverIdx(null);
    setDragInsertPosition(null);
    if (fromIdx === idx) return;
    setQuestions((qs) => {
      const v = [...qs];
      const [moved] = v.splice(fromIdx, 1);
      const toIdx = dragInsertPosition === 'above' ? idx : idx + 1;
      const insertAt = fromIdx < toIdx ? toIdx - 1 : toIdx;
      v.splice(insertAt, 0, moved);
      return v;
    });
  };

  const handleDragEnd = () => {
    setDraggingIdx(null);
    setDragOverIdx(null);
    setDragInsertPosition(null);
  };

  const payloadQuestions = () =>
    questions.map((q, i) => ({
      order_index: i,
      key: q.key || `q${i + 1}`,
      label: q.label || 'Question',
      type: q.type || 'text',
      options: q.type === 'scale' ? q.options : undefined,
      required: q.required,
    }));

  const save = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      toast.error('Template name is required');
      return;
    }
    try {
      if (isNew) {
        const res = await api<{ id: string }>('POST', '/reviews/templates', { name: trimmedName, questions: payloadQuestions() });
        toast.success('Template created');
        setIsNew(false);
        if (res?.id) setSelectedId(res.id);
      } else if (selectedId) {
        await api('PUT', `/reviews/templates/${selectedId}`, { name: trimmedName, questions: payloadQuestions() });
        toast.success('Template updated');
      }
      queryClient.invalidateQueries({ queryKey: ['review-templates'] });
      queryClient.invalidateQueries({ queryKey: ['review-template-questions', selectedId] });
      refetchTemplates();
    } catch (_e) {
      toast.error('Failed to save');
    }
  };

  const startNew = () => {
    setIsNew(true);
    setSelectedId(null);
  };

  const selectTemplate = (id: string) => {
    setIsNew(false);
    setSelectedId(id);
  };

  const hasSelection = isNew || !!selectedId;

  return (
    <div className="max-w-5xl">
      <h1 className="text-xl font-bold text-gray-900 mb-3">Review templates</h1>
      <p className="text-sm text-gray-600 mb-4">
        Create and edit templates. Add questions (scale 1–5 or open text), edit labels, and drag the handle to reorder.
      </p>
      <div className="flex gap-6 flex-col lg:flex-row">
        {/* Sidebar: template list */}
        <div className="w-full lg:w-56 flex-shrink-0">
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
              <span className="font-semibold text-sm text-gray-800">Templates</span>
              <button
                type="button"
                onClick={startNew}
                className="px-2.5 py-1.5 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                New template
              </button>
            </div>
            <ul className="divide-y divide-gray-200 max-h-[calc(100vh-280px)] overflow-y-auto">
              {(templates as any[]).map((t: any) => (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => selectTemplate(t.id)}
                    className={`w-full text-left px-4 py-3 text-sm transition-colors ${
                      selectedId === t.id && !isNew
                        ? 'bg-brand-red/10 text-brand-red font-medium border-l-2 border-brand-red'
                        : 'text-gray-700 hover:bg-gray-50 border-l-2 border-transparent'
                    }`}
                  >
                    {t.name} <span className="text-gray-400 font-normal">v{t.version}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Main: editor or empty state */}
        <div className="flex-1 min-w-0">
          {!hasSelection ? (
            <div className="rounded-xl border-2 border-dashed border-gray-200 bg-gray-50/50 p-10 text-center">
              <p className="text-gray-500 text-sm">Select a template to edit or click &quot;New template&quot; to create one.</p>
            </div>
          ) : (
            <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
                <h2 className="font-semibold text-gray-900">{isNew ? 'New template' : 'Edit template'}</h2>
                <button
                  type="button"
                  onClick={save}
                  className="px-4 py-2 rounded-lg bg-brand-red text-white text-sm font-medium hover:opacity-90 transition-opacity"
                >
                  {isNew ? 'Create' : 'Save'}
                </button>
              </div>
              <div className="p-5 space-y-5">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Template name</label>
                  <input
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-brand-red/20 focus:border-brand-red"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Annual Review"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-medium text-gray-700">Questions</label>
                    <button
                      type="button"
                      onClick={addQuestion}
                      className="px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      Add question
                    </button>
                  </div>
                  <div className="space-y-0 divide-y divide-gray-100">
                    {questions.length === 0 && (
                      <p className="py-6 text-sm text-gray-500 text-center">No questions yet. Add one to get started.</p>
                    )}
                    {questions.map((q, idx) => (
                      <div
                        key={q.id ?? idx}
                        draggable
                        onDragStart={(e) => handleDragStart(idx, e)}
                        onDragOver={(e) => handleDragOver(idx, e)}
                        onDragLeave={handleDragLeave}
                        onDrop={() => handleDrop(idx)}
                        onDragEnd={handleDragEnd}
                        className={`relative flex gap-3 items-start p-4 transition-all ${
                          draggingIdx === idx ? 'opacity-50 bg-gray-50' : 'bg-white hover:bg-gray-50/50'
                        } ${dragOverIdx === idx && draggingIdx !== idx ? 'ring-1 ring-brand-red/30' : ''}`}
                      >
                        {/* Drop indicator above/below */}
                        {dragOverIdx === idx && draggingIdx !== idx && (
                          <>
                            {dragInsertPosition === 'above' && (
                              <div className="absolute left-0 right-0 top-0 h-0.5 bg-brand-red z-10" />
                            )}
                            {dragInsertPosition === 'below' && (
                              <div className="absolute left-0 right-0 bottom-0 h-0.5 bg-brand-red z-10" />
                            )}
                          </>
                        )}
                        {/* Grabber handle */}
                        <div
                          data-grabber
                          className="flex-shrink-0 mt-1 p-1.5 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 cursor-grab active:cursor-grabbing touch-none"
                          title="Drag to reorder"
                        >
                          <GrabberIcon />
                        </div>
                        {/* Fields */}
                        <div className="flex-1 min-w-0 space-y-3">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <input
                              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-brand-red/20 focus:border-brand-red"
                              value={q.key}
                              onChange={(e) => updateQuestion(idx, 'key', e.target.value)}
                              placeholder="Key (e.g. performance)"
                            />
                            <select
                              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:ring-2 focus:ring-brand-red/20 focus:border-brand-red"
                              value={q.type || 'text'}
                              onChange={(e) => updateQuestion(idx, 'type', e.target.value)}
                            >
                              {QUESTION_TYPES.map((opt) => (
                                <option key={opt.value} value={opt.value}>
                                  {opt.label}
                                </option>
                              ))}
                            </select>
                          </div>
                          <input
                            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-brand-red/20 focus:border-brand-red"
                            value={q.label}
                            onChange={(e) => updateQuestion(idx, 'label', e.target.value)}
                            placeholder="Question label"
                          />
                          {q.type === 'scale' && (
                            <div className="flex items-center gap-2 text-sm text-gray-600">
                              <span>Scale</span>
                              <input
                                type="number"
                                min={1}
                                max={10}
                                className="w-14 border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-brand-red/20 focus:border-brand-red"
                                value={q.options?.min ?? 1}
                                onChange={(e) => updateScaleOptions(idx, 'min', parseInt(e.target.value, 10) || 1)}
                              />
                              <span>to</span>
                              <input
                                type="number"
                                min={1}
                                max={10}
                                className="w-14 border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-brand-red/20 focus:border-brand-red"
                                value={q.options?.max ?? 5}
                                onChange={(e) => updateScaleOptions(idx, 'max', parseInt(e.target.value, 10) || 5)}
                              />
                            </div>
                          )}
                          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={q.required}
                              onChange={(e) => updateQuestion(idx, 'required', e.target.checked)}
                              className="rounded border-gray-300 text-brand-red focus:ring-brand-red/20"
                            />
                            Required
                          </label>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeQuestion(idx)}
                          className="flex-shrink-0 p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                          title="Remove question"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
