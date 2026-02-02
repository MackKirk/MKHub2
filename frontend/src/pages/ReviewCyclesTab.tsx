import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useState } from 'react';
import toast from 'react-hot-toast';

export default function ReviewCyclesTab() {
  const { data: templates = [] } = useQuery({
    queryKey: ['review-templates'],
    queryFn: () => api<any[]>('GET', '/reviews/templates'),
  });
  const { data: cycles = [], refetch: refetchCycles } = useQuery({
    queryKey: ['review-cycles'],
    queryFn: () => api<any[]>('GET', '/reviews/cycles'),
  });
  const [cycleName, setCycleName] = useState('H1 Review');
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [templateByDepartment, setTemplateByDepartment] = useState<{ department: string; template_id: string }[]>([]);

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
      <h1 className="text-xl font-bold text-gray-900 mb-3">Review cycles</h1>
      <p className="text-sm text-gray-600 mb-4">
        Create cycles and assign templates. Use &quot;Templates&quot; tab to create or edit templates first.
      </p>
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
              {(templates as any[]).map((t: any) => (
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
                    {(templates as any[]).map((t: any) => (
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
              <button type="button" onClick={addTemplateByDepartmentRow} className="px-2 py-1 rounded border text-xs">
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
            {(cycles as any[]).map((c: any) => (
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
                      await refetchCycles();
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
            {(cycles as any[]).map((c: any) => (
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
  );
}
