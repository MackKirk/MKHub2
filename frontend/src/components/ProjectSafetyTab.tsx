import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import {
  PROJECT_SAFETY_INSPECTION_TEMPLATE,
  SAFETY_TEMPLATE_VERSION,
  type SafetyTemplateItem,
  type YesNoNa,
} from '@/data/projectSafetyInspectionTemplate';

type SafetyInspectionRow = {
  id: string;
  project_id: string;
  inspection_date: string;
  template_version: string;
  form_payload: Record<string, unknown>;
  created_at?: string | null;
  created_by?: string | null;
  updated_at?: string | null;
  updated_by?: string | null;
};

const YNA_OPTIONS: {
  value: YesNoNa;
  label: string;
  title: string;
  className: string;
}[] = [
  { value: 'yes', label: 'Y', title: 'Yes', className: 'bg-green-100 text-green-800 border-green-400 hover:bg-green-200' },
  { value: 'no', label: 'N', title: 'No', className: 'bg-red-100 text-red-800 border-red-400 hover:bg-red-200' },
  { value: 'na', label: 'NA', title: 'N/A', className: 'bg-gray-100 text-gray-700 border-gray-300 hover:bg-gray-200' },
];

function isYesNoEntry(v: unknown): v is { status?: string; comments?: string } {
  return v != null && typeof v === 'object' && !Array.isArray(v);
}

function getTextValue(payload: Record<string, unknown>, key: string): string {
  const v = payload[key];
  return typeof v === 'string' ? v : '';
}

function getCheckboxValues(payload: Record<string, unknown>, key: string): string[] {
  const v = payload[key];
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

function getYnEntry(payload: Record<string, unknown>, key: string): { status: YesNoNa | ''; comments: string } {
  const v = payload[key];
  if (!isYesNoEntry(v)) return { status: '', comments: '' };
  const s = v.status;
  const status = s === 'yes' || s === 'no' || s === 'na' ? s : '';
  return { status, comments: typeof v.comments === 'string' ? v.comments : '' };
}

type Props = {
  projectId: string;
  proj: { name?: string; address?: string; address_city?: string; address_province?: string };
  canRead: boolean;
  canWrite: boolean;
};

export default function ProjectSafetyTab({ projectId, proj, canRead, canWrite }: Props) {
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [inspectionDate, setInspectionDate] = useState<string>('');
  const [formPayload, setFormPayload] = useState<Record<string, unknown>>({});

  const listKey = ['projectSafetyInspections', projectId];
  const { data: list = [], isLoading: listLoading } = useQuery({
    queryKey: listKey,
    queryFn: () => api<SafetyInspectionRow[]>('GET', `/projects/${encodeURIComponent(projectId)}/safety-inspections`),
    enabled: canRead && !!projectId,
  });

  const detailKey = ['projectSafetyInspection', projectId, selectedId];
  const { data: detail, isLoading: detailLoading } = useQuery({
    queryKey: detailKey,
    queryFn: () =>
      api<SafetyInspectionRow>(
        'GET',
        `/projects/${encodeURIComponent(projectId)}/safety-inspections/${encodeURIComponent(selectedId!)}`
      ),
    enabled: canRead && !!projectId && !!selectedId,
  });

  useEffect(() => {
    if (!detail) return;
    const d = new Date(detail.inspection_date);
    const local = Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 16);
    setInspectionDate(local);
    setFormPayload(
      detail.form_payload && typeof detail.form_payload === 'object' && !Array.isArray(detail.form_payload)
        ? { ...detail.form_payload }
        : {}
    );
  }, [detail?.id, detail?.inspection_date, detail?.form_payload]);

  const applyProjectPrefill = useCallback(
    (payload: Record<string, unknown>) => {
      const next = { ...payload };
      const loc = [proj.address, proj.address_city, proj.address_province].filter(Boolean).join(', ');
      if (proj.name && !getTextValue(next, 'project_name')) next.project_name = proj.name;
      if (loc && !getTextValue(next, 'project_location')) next.project_location = loc;
      return next;
    },
    [proj.address, proj.address_city, proj.address_province, proj.name]
  );

  useEffect(() => {
    if (!selectedId || !detail) return;
    if (detail.form_payload && Object.keys(detail.form_payload).length > 0) return;
    setFormPayload((p) => applyProjectPrefill(p));
  }, [selectedId, detail, applyProjectPrefill]);

  const createMutation = useMutation({
    mutationFn: () =>
      api<SafetyInspectionRow>('POST', `/projects/${encodeURIComponent(projectId)}/safety-inspections`, {
        template_version: SAFETY_TEMPLATE_VERSION,
        form_payload: applyProjectPrefill({}),
      }),
    onSuccess: (row) => {
      qc.invalidateQueries({ queryKey: listKey });
      setSelectedId(row.id);
      toast.success('Inspection created');
    },
    onError: () => toast.error('Could not create inspection'),
  });

  const saveMutation = useMutation({
    mutationFn: () => {
      if (!selectedId) throw new Error('no id');
      let iso: string;
      if (inspectionDate) {
        const t = new Date(inspectionDate);
        iso = Number.isNaN(t.getTime()) ? new Date().toISOString() : t.toISOString();
      } else {
        iso = new Date().toISOString();
      }
      return api<SafetyInspectionRow>(
        'PUT',
        `/projects/${encodeURIComponent(projectId)}/safety-inspections/${encodeURIComponent(selectedId)}`,
        { inspection_date: iso, form_payload: formPayload, template_version: SAFETY_TEMPLATE_VERSION }
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: listKey });
      if (selectedId) {
        qc.invalidateQueries({ queryKey: ['projectSafetyInspection', projectId, selectedId] });
      }
      toast.success('Saved');
    },
    onError: () => toast.error('Could not save'),
  });

  const setTextField = (key: string, value: string) => {
    setFormPayload((p) => ({ ...p, [key]: value }));
  };

  const setYnStatus = (key: string, status: YesNoNa) => {
    setFormPayload((p) => {
      const cur = getYnEntry(p, key);
      return { ...p, [key]: { ...cur, status } };
    });
  };

  const setYnComments = (key: string, comments: string) => {
    setFormPayload((p) => {
      const cur = getYnEntry(p, key);
      return { ...p, [key]: { ...cur, comments } };
    });
  };

  const toggleCheckbox = (key: string, option: string) => {
    setFormPayload((p) => {
      const cur = getCheckboxValues(p, key);
      const has = cur.includes(option);
      const next = has ? cur.filter((x) => x !== option) : [...cur, option];
      return { ...p, [key]: next };
    });
  };

  const renderItem = (item: SafetyTemplateItem, idx: number, zebra: boolean) => {
    const rowBg = zebra ? (idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/80') : '';
    if (item.kind === 'subheading') {
      return (
        <div key={item.id} className="px-4 py-2.5 bg-slate-100/90 border-y border-slate-200/80">
          <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wide">{item.label}</h4>
        </div>
      );
    }
    if (item.kind === 'hint') {
      return (
        <div key={item.id} className="p-4 bg-amber-50/60 border-b border-amber-100/80">
          <p className="text-xs text-gray-700 leading-relaxed">{item.text}</p>
        </div>
      );
    }
    if (item.kind === 'text') {
      return (
        <div key={item.key} className={`p-4 ${rowBg}`}>
          <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">{item.label}</label>
          <input
            type="text"
            value={getTextValue(formPayload, item.key)}
            onChange={(e) => setTextField(item.key, e.target.value)}
            disabled={!canWrite}
            placeholder={item.placeholder}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm disabled:bg-gray-50 disabled:text-gray-500"
          />
        </div>
      );
    }
    if (item.kind === 'textarea') {
      return (
        <div key={item.key} className={`p-4 ${rowBg}`}>
          <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">{item.label}</label>
          <textarea
            value={getTextValue(formPayload, item.key)}
            onChange={(e) => setTextField(item.key, e.target.value)}
            disabled={!canWrite}
            placeholder={item.placeholder}
            rows={3}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-y disabled:bg-gray-50 disabled:text-gray-500"
          />
        </div>
      );
    }
    if (item.kind === 'checkboxes') {
      const selected = getCheckboxValues(formPayload, item.key);
      return (
        <div key={item.key} className={`p-4 ${rowBg}`}>
          <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">{item.label}</div>
          <div className="flex flex-wrap gap-3">
            {item.options.map((opt) => (
              <label key={opt} className="inline-flex items-center gap-2 text-sm text-gray-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selected.includes(opt)}
                  disabled={!canWrite}
                  onChange={() => toggleCheckbox(item.key, opt)}
                  className="rounded border-gray-300"
                />
                {opt}
              </label>
            ))}
          </div>
        </div>
      );
    }
    if (item.kind !== 'yes_no_na') {
      return null;
    }
    const yn = getYnEntry(formPayload, item.key);
    return (
      <div key={item.key} className={`p-4 transition-colors ${rowBg}`}>
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex-1 min-w-0">
            <div className="font-medium text-gray-900 text-sm">{item.label}</div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {YNA_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                title={opt.title}
                disabled={!canWrite}
                onClick={() => setYnStatus(item.key, opt.value)}
                className={`min-w-[3.25rem] min-h-[3.25rem] flex items-center justify-center rounded-xl text-sm font-bold border-2 transition-all disabled:opacity-50 ${
                  yn.status === opt.value ? opt.className + ' scale-105 shadow-md' : 'bg-white text-gray-300 border-gray-200 hover:border-gray-300'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        {item.commentsField && (
          <textarea
            value={yn.comments}
            onChange={(e) => setYnComments(item.key, e.target.value)}
            disabled={!canWrite}
            placeholder="Comments / details"
            rows={2}
            className="mt-3 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-y disabled:bg-gray-50"
          />
        )}
      </div>
    );
  };

  const formSections = useMemo(() => PROJECT_SAFETY_INSPECTION_TEMPLATE, []);

  if (!canRead) {
    return <div className="rounded-xl border bg-white p-6 text-sm text-gray-600">You do not have permission to view safety inspections.</div>;
  }

  if (!selectedId) {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-gray-900">Safety inspections</h2>
          {canWrite && (
            <button
              type="button"
              disabled={createMutation.isPending}
              onClick={() => createMutation.mutate()}
              className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              New inspection
            </button>
          )}
        </div>
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          {listLoading ? (
            <div className="p-8 text-center text-gray-500 text-sm">Loading…</div>
          ) : list.length === 0 ? (
            <div className="p-8 text-center text-gray-500 text-sm">No inspections yet. Create one to get started.</div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {list.map((row) => (
                <li key={row.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(row.id)}
                    className="w-full text-left px-4 py-3 hover:bg-gray-50 flex items-center justify-between gap-3"
                  >
                    <span className="text-sm font-medium text-gray-900">
                      {row.inspection_date
                        ? new Date(row.inspection_date).toLocaleString(undefined, {
                            dateStyle: 'medium',
                            timeStyle: 'short',
                          })
                        : '—'}
                    </span>
                    <span className="text-xs text-brand-red font-medium">Open</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 min-w-0">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => {
            setSelectedId(null);
          }}
          className="text-sm text-brand-red hover:underline font-medium"
        >
          ← All inspections
        </button>
      </div>

      {detailLoading && !detail ? (
        <div className="rounded-xl border bg-white p-8 text-center text-gray-500">Loading…</div>
      ) : (
        <>
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Inspection date & time</label>
            <input
              type="datetime-local"
              value={inspectionDate}
              onChange={(e) => setInspectionDate(e.target.value)}
              disabled={!canWrite}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm disabled:bg-gray-50"
            />
          </div>

          {formSections.map((section) => (
            <div key={section.id} className="rounded-xl border border-gray-200 bg-white overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/80">
                <h3 className="text-sm font-semibold text-gray-800">{section.title}</h3>
                {section.subtitle && <p className="text-xs text-gray-500 mt-1">{section.subtitle}</p>}
              </div>
              <div className="divide-y divide-gray-100">
                {section.items.map((item, idx) => renderItem(item, idx, true))}
              </div>
            </div>
          ))}

          {canWrite && (
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                disabled={saveMutation.isPending}
                onClick={() => saveMutation.mutate()}
                className="px-5 py-2.5 bg-blue-600 text-white rounded-lg font-medium text-sm hover:bg-blue-700 disabled:opacity-50"
              >
                {saveMutation.isPending ? 'Saving…' : 'Save inspection'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
