import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useState, useMemo } from 'react';
import toast from 'react-hot-toast';

const QUESTION_TYPES = [
  { value: 'text', label: 'Open text' },
  { value: 'scale', label: 'Scale (1–5)' },
] as const;

export default function ReviewsAdmin() {
  const { data: templates, refetch: refetchTemplates } = useQuery({
    queryKey: ['review-templates'],
    queryFn: () => api<any[]>('GET', '/reviews/templates'),
  });
  const { data: cycles, refetch: refetchCycles } = useQuery({
    queryKey: ['review-cycles'],
    queryFn: () => api<any[]>('GET', '/reviews/cycles'),
  });
  const [name, setName] = useState('Semiannual Review');
  const [questions, setQuestions] = useState<any[]>([
    { key: 'performance', label: 'Overall performance', type: 'scale', options: { min: 1, max: 5 }, required: true },
  ]);
  const [cycleName, setCycleName] = useState('H1 Review');
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [templateByDepartment, setTemplateByDepartment] = useState<{ department: string; template_id: string }[]>([]);

  const todayLabel = useMemo(() => {
    return new Date().toLocaleDateString('en-CA', {
      weekday: 'long',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }, []);

  const addQuestion = () => {
    setQuestions((qs) => [
      ...qs,
      { key: `q${qs.length + 1}`, label: '', type: 'text', options: null, required: false },
    ]);
  };

  const updateQuestion = (idx: number, field: string, value: any) => {
    setQuestions((qs) => {
      const v = [...qs];
      v[idx] = { ...v[idx], [field]: value };
      if (field === 'type' && value === 'scale') {
        v[idx].options = { min: 1, max: 5 };
      }
      if (field === 'type' && value === 'text') {
        v[idx].options = null;
      }
      return v;
    });
  };

  const updateQuestionOptions = (idx: number, key: 'min' | 'max', value: number) => {
    setQuestions((qs) => {
      const v = [...qs];
      const opts = { ...(v[idx].options || { min: 1, max: 5 }), [key]: value };
      v[idx] = { ...v[idx], options: opts };
      return v;
    });
  };

  const addTemplateByDepartmentRow = () => {
    setTemplateByDepartment((prev) => [...prev, { department: '', template_id: '' }]);
  };

  const updateTemplateByDepartmentRow = (idx: number, field: 'department' | 'template_id', value: string) => {
    setTemplateByDepartment((prev) => {
      const v = [...prev];
      v[idx] = { ...v[idx], [field]: value };
      return v;
    });
  };

  const removeTemplateByDepartmentRow = (idx: number) => {
    setTemplateByDepartment((prev) => prev.filter((_, i) => i !== idx));
  };

  const buildTemplateByDepartment = () => {
    const out: Record<string, string> = {};
    templateByDepartment.forEach((row) => {
      const d = (row.department || '').trim();
      if (d && row.template_id) out[d] = row.template_id;
    });
    return Object.keys(out).length ? out : undefined;
  };

  return (
    <div className="max-w-5xl">
      <div className="bg-slate-200/50 rounded-[12px] border border-slate-200 flex items-center justify-between py-4 px-6 mb-6">
        <div>
          <div className="text-xl font-bold text-gray-900 tracking-tight mb-0.5">Reviews Admin</div>
          <div className="text-sm text-gray-500 font-medium">Templates, cycles and assignments.</div>
        </div>
        <div className="text-right">
          <div className="text-xs text-gray-400 mb-1.5 font-medium uppercase tracking-wide">Today</div>
          <div className="text-sm font-semibold text-gray-700">{todayLabel}</div>
        </div>
      </div>
      <div className="grid md:grid-cols-2 gap-6">
        <div className="rounded-xl border bg-white p-4">
          <div className="font-semibold mb-2">Create Template</div>
          <div className="space-y-2 text-sm">
            <div>
              <div className="text-gray-600">Name</div>
              <input className="w-full border rounded px-3 py-2" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <div className="text-gray-600">Questions (scale 1–5 or open text)</div>
              <div className="space-y-2">
                {questions.map((q, idx) => (
                  <div key={idx} className="border rounded p-2 space-y-1">
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        className="border rounded px-2 py-1"
                        value={q.key}
                        onChange={(e) => updateQuestion(idx, 'key', e.target.value)}
                        placeholder="key"
                      />
                      <select
                        className="border rounded px-2 py-1"
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
                      className="w-full border rounded px-2 py-1"
                      value={q.label}
                      onChange={(e) => updateQuestion(idx, 'label', e.target.value)}
                      placeholder="Question label"
                    />
                    {q.type === 'scale' && (
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-gray-600">Scale:</span>
                        <input
                          type="number"
                          min={1}
                          max={10}
                          className="w-14 border rounded px-1 py-0.5"
                          value={q.options?.min ?? 1}
                          onChange={(e) => updateQuestionOptions(idx, 'min', parseInt(e.target.value, 10) || 1)}
                        />
                        <span>to</span>
                        <input
                          type="number"
                          min={1}
                          max={10}
                          className="w-14 border rounded px-1 py-0.5"
                          value={q.options?.max ?? 5}
                          onChange={(e) => updateQuestionOptions(idx, 'max', parseInt(e.target.value, 10) || 5)}
                        />
                      </div>
                    )}
                    <label className="flex items-center gap-1 text-xs">
                      <input
                        type="checkbox"
                        checked={!!q.required}
                        onChange={(e) => updateQuestion(idx, 'required', e.target.checked)}
                      />
                      Required
                    </label>
                  </div>
                ))}
                <button onClick={addQuestion} className="px-2 py-1 rounded border text-xs">
                  Add question
                </button>
              </div>
            </div>
            <button
              onClick={async () => {
                try {
                  await api('POST', '/reviews/templates', { name, questions });
                  toast.success('Template created');
                  setName('');
                  await refetchTemplates();
                } catch (_e) {
                  toast.error('Failed');
                }
              }}
              className="px-3 py-2 rounded bg-brand-red text-white"
            >
              Create
            </button>
          </div>
          <div className="mt-4">
            <div className="font-semibold mb-1">Templates</div>
            <div className="divide-y rounded border">
              {(templates || []).map((t: any) => (
                <div key={t.id} className="px-3 py-2 text-sm">
                  {t.name} v{t.version}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="rounded-xl border bg-white p-4">
          <div className="font-semibold mb-2">Create Cycle</div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="col-span-2">
              <div className="text-gray-600">Name</div>
              <input
                className="w-full border rounded px-3 py-2"
                value={cycleName}
                onChange={(e) => setCycleName(e.target.value)}
              />
            </div>
            <div>
              <div className="text-gray-600">Start</div>
              <input
                type="date"
                className="w-full border rounded px-3 py-2"
                value={periodStart}
                onChange={(e) => setPeriodStart(e.target.value)}
              />
            </div>
            <div>
              <div className="text-gray-600">End</div>
              <input
                type="date"
                className="w-full border rounded px-3 py-2"
                value={periodEnd}
                onChange={(e) => setPeriodEnd(e.target.value)}
              />
            </div>
            <div className="col-span-2">
              <div className="text-gray-600">Default template</div>
              <select
                className="w-full border rounded px-3 py-2"
                value={templateId}
                onChange={(e) => setTemplateId(e.target.value)}
              >
                <option value="">Select...</option>
                {(templates || []).map((t: any) => (
                  <option key={t.id} value={t.id}>
                    {t.name} v{t.version}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-span-2">
              <div className="text-gray-600">Template by department (optional)</div>
              <p className="text-xs text-gray-500 mb-1">Use a different template for employees in a given division.</p>
              <div className="space-y-1">
                {templateByDepartment.map((row, idx) => (
                  <div key={idx} className="flex gap-2 items-center">
                    <input
                      className="flex-1 border rounded px-2 py-1 text-sm"
                      placeholder="Division name"
                      value={row.department}
                      onChange={(e) => updateTemplateByDepartmentRow(idx, 'department', e.target.value)}
                    />
                    <select
                      className="flex-1 border rounded px-2 py-1 text-sm"
                      value={row.template_id}
                      onChange={(e) => updateTemplateByDepartmentRow(idx, 'template_id', e.target.value)}
                    >
                      <option value="">Select template...</option>
                      {(templates || []).map((t: any) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => removeTemplateByDepartmentRow(idx)}
                      className="px-2 py-1 rounded border text-xs text-red-600"
                    >
                      Remove
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addTemplateByDepartmentRow}
                  className="px-2 py-1 rounded border text-xs"
                >
                  Add department mapping
                </button>
              </div>
            </div>
            <div className="col-span-2 text-right mt-2">
              <button
                onClick={async () => {
                  try {
                    await api('POST', '/reviews/cycles', {
                      name: cycleName,
                      period_start: periodStart,
                      period_end: periodEnd,
                      template_id: templateId,
                      template_by_department: buildTemplateByDepartment(),
                      activate: true,
                    });
                    toast.success('Cycle created');
                    setCycleName('');
                    setPeriodStart('');
                    setPeriodEnd('');
                    setTemplateId('');
                    setTemplateByDepartment([]);
                    await refetchCycles();
                  } catch (_e) {
                    toast.error('Failed');
                  }
                }}
                className="px-3 py-2 rounded bg-brand-red text-white"
              >
                Create Cycle
              </button>
            </div>
          </div>
          <div className="mt-4">
            <div className="font-semibold mb-1">Cycles</div>
            <div className="divide-y rounded border">
              {(cycles || []).map((c: any) => (
                <div key={c.id} className="px-3 py-2 text-sm flex items-center justify-between">
                  <div>
                    <div className="font-medium">{c.name}</div>
                    <div className="text-gray-600 text-xs">
                      {c.period_start || ''} — {c.period_end || ''}
                      {c.template_by_department && Object.keys(c.template_by_department).length > 0 && (
                        <span className="ml-1">(+ {Object.keys(c.template_by_department).length} dept. override(s))</span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={async () => {
                      try {
                        await api('POST', `/reviews/cycles/${c.id}/assign`, {});
                        toast.success('Assignments generated');
                      } catch (_e) {
                        toast.error('Failed');
                      }
                    }}
                    className="px-2 py-1 rounded border text-xs"
                  >
                    Assign
                  </button>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-4">
            <div className="font-semibold mb-1">Compare (self vs manager)</div>
            <div className="text-xs text-gray-600 mb-2">Pick a cycle to view comparisons for all employees</div>
            <div className="space-x-2">
              {(cycles || []).map((c: any) => (
                <button
                  key={c.id}
                  onClick={async () => {
                    try {
                      const data = await api<any[]>('GET', `/reviews/cycles/${c.id}/compare`);
                      console.log('compare', data);
                      toast.success(`Loaded ${data.length} comparisons (see console)`);
                    } catch (_e) {
                      toast.error('Failed');
                    }
                  }}
                  className="px-3 py-1 rounded border text-xs"
                >
                  {c.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
