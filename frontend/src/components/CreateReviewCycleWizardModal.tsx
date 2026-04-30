import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { sortByLabel } from '@/lib/sortOptions';
import {
  employeeDivisionKeys,
  employeeMatchesParticipantScope,
  type ReviewParticipantEmp,
} from '@/lib/reviewParticipantScope';
import toast from 'react-hot-toast';
import OverlayPortal from '@/components/OverlayPortal';

type DivisionOption = { id: string; label: string };

type EmpRow = ReviewParticipantEmp & {
  name?: string;
  username?: string;
};

const NO_DEPT_LABEL = '(no department)';

const STEP_LABELS = [
  'Cycle details',
  'Who participates',
  'Form by department',
  'Review & create',
];

const STEP_SUBTITLES = [
  'Name, period, and activation',
  'Company-wide or scoped participants',
  'One employee-review template per HR department label in this cycle',
  'Confirm distribution and create',
];

type Props = {
  open: boolean;
  onClose: () => void;
};

export default function CreateReviewCycleWizardModal({ open, onClose }: Props) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState(1);
  const [cycleName, setCycleName] = useState('H1 Review');
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [activateNow, setActivateNow] = useState(true);
  const [scopeMode, setScopeMode] = useState<'all' | 'explicit'>('all');
  const [participantUserIds, setParticipantUserIds] = useState<string[]>([]);
  const [participantDeptIds, setParticipantDeptIds] = useState<string[]>([]);
  const [participantProjIds, setParticipantProjIds] = useState<string[]>([]);
  const [employeePickSearch, setEmployeePickSearch] = useState('');
  const [templateByDepartment, setTemplateByDepartment] = useState<{ division_key: string; template_id: string }[]>([]);
  const [scopePeopleModalOpen, setScopePeopleModalOpen] = useState(false);
  const [scopeModalSearch, setScopeModalSearch] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const { data: templates = [] } = useQuery({
    queryKey: ['form-templates', 'employee_review'],
    queryFn: () =>
      api<any[]>('GET', '/form-templates?category=employee_review&sort=name&sort_dir=asc'),
    enabled: open,
  });
  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api<Record<string, any[]>>('GET', '/settings'),
    enabled: open,
  });
  const { data: employees = [] } = useQuery({
    queryKey: ['employees', 'review-cycle-wizard'],
    queryFn: () => api<any[]>('GET', '/employees'),
    enabled: open,
  });
  const { data: projectDivTree = [] } = useQuery({
    queryKey: ['project-divisions', 'review-cycle-wizard'],
    queryFn: () => api<any[]>('GET', '/settings/project-divisions'),
    enabled: open,
  });

  useEffect(() => {
    if (!open) return;
    setStep(1);
    setCycleName('H1 Review');
    setPeriodStart('');
    setPeriodEnd('');
    setActivateNow(true);
    setScopeMode('all');
    setParticipantUserIds([]);
    setParticipantDeptIds([]);
    setParticipantProjIds([]);
    setEmployeePickSearch('');
    setTemplateByDepartment([]);
    setScopePeopleModalOpen(false);
    setScopeModalSearch('');
    setSubmitting(false);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (scopePeopleModalOpen) setScopePeopleModalOpen(false);
        else onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, scopePeopleModalOpen]);

  const projectDivisionOptions: DivisionOption[] = useMemo(() => {
    const out: DivisionOption[] = [];
    for (const d of projectDivTree as any[]) {
      const main = String(d.label || '').trim();
      const mainId = d.id != null ? String(d.id) : '';
      if (mainId) out.push({ id: mainId, label: main || mainId });
      for (const s of d.subdivisions || []) {
        const sub = String(s.label || '').trim();
        const sid = s.id != null ? String(s.id) : '';
        if (!sid) continue;
        out.push({ id: sid, label: main ? `${main} / ${sub || sid}` : sub || sid });
      }
    }
    return sortByLabel(out, (x) => x.label);
  }, [projectDivTree]);

  const projectDivisionLabelById = useMemo(() => {
    const m = new Map<string, string>();
    for (const o of projectDivisionOptions) m.set(o.id, o.label);
    return m;
  }, [projectDivisionOptions]);

  const divisionOptions: DivisionOption[] = useMemo(() => {
    const fromSettings = (settings?.divisions || [])
      .map((i: any) => ({ id: String(i.id || ''), label: String(i.label || '').trim() }))
      .filter((i: DivisionOption) => i.label);
    if (fromSettings.length) {
      return sortByLabel(fromSettings, (d) => d.label);
    }
    const set = new Set<string>();
    for (const e of employees) {
      for (const k of employeeDivisionKeys(e)) {
        set.add(k);
      }
    }
    return sortByLabel(
      Array.from(set).map((label) => ({ id: label, label })),
      (d) => d.label
    );
  }, [settings, employees]);

  const scopedEmployees = useMemo(() => {
    const rows = employees as EmpRow[];
    if (scopeMode !== 'explicit') return rows;
    const u = new Set(participantUserIds);
    const d = new Set(participantDeptIds);
    const p = new Set(participantProjIds);
    if (u.size === 0 && d.size === 0 && p.size === 0) return [];
    return rows.filter((emp) => employeeMatchesParticipantScope(emp, u, d, p));
  }, [employees, scopeMode, participantUserIds, participantDeptIds, participantProjIds]);

  /** Every distinct HR label (or "(no department)") that appears on someone in scope. */
  const departmentsInScope = useMemo(() => {
    const set = new Set<string>();
    for (const emp of scopedEmployees as EmpRow[]) {
      const keys = employeeDivisionKeys(emp);
      if (keys.length === 0) set.add(NO_DEPT_LABEL);
      else keys.forEach((k) => set.add(k));
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [scopedEmployees]);

  const departmentHeadcount = useMemo(() => {
    const m = new Map<string, number>();
    for (const emp of scopedEmployees as EmpRow[]) {
      const keys = employeeDivisionKeys(emp);
      if (keys.length === 0) {
        m.set(NO_DEPT_LABEL, (m.get(NO_DEPT_LABEL) || 0) + 1);
      } else {
        const uniq = new Set(keys);
        uniq.forEach((k) => {
          m.set(k, (m.get(k) || 0) + 1);
        });
      }
    }
    return m;
  }, [scopedEmployees]);

  useEffect(() => {
    if (!open || step !== 3) return;
    setTemplateByDepartment((prev) => {
      const prevMap = new Map(prev.map((r) => [r.division_key, r.template_id]));
      return departmentsInScope.map((division_key) => ({
        division_key,
        template_id: prevMap.get(division_key) || '',
      }));
    });
  }, [open, step, departmentsInScope]);

  const draftTemplateByDepartment = useMemo(() => {
    const out: Record<string, string> = {};
    for (const row of templateByDepartment) {
      const d = (row.division_key || '').trim();
      if (d && row.template_id) out[d] = row.template_id;
    }
    return Object.keys(out).length ? out : undefined;
  }, [templateByDepartment]);

  const primaryFormTemplateId = useMemo(() => {
    const tbd = draftTemplateByDepartment;
    if (!tbd || !Object.keys(tbd).length) return '';
    if (tbd[NO_DEPT_LABEL]) return tbd[NO_DEPT_LABEL];
    const sorted = Object.entries(tbd).sort(([a], [b]) => a.localeCompare(b));
    return sorted.find(([, v]) => v)?.[1] || '';
  }, [draftTemplateByDepartment]);

  const coveragePreview = useMemo(() => {
    const tbd = draftTemplateByDepartment;
    if (!tbd || Object.keys(tbd).length === 0) return null;
    const fallback =
      tbd[NO_DEPT_LABEL] ||
      Object.entries(tbd)
        .sort(([a], [b]) => a.localeCompare(b))
        .find(([, v]) => v)?.[1] ||
      '';
    const byTemplate: Record<string, number> = {};
    const unresolved: string[] = [];
    for (const emp of scopedEmployees as EmpRow[]) {
      const keys = employeeDivisionKeys(emp);
      let resolved = '';
      if (keys.length === 0) {
        resolved = tbd[NO_DEPT_LABEL] || fallback;
        if (!resolved) unresolved.push(`${emp.name || emp.username || emp.id} (no department label)`);
      } else {
        let hit = false;
        for (const k of keys) {
          if (tbd[k]) {
            resolved = tbd[k];
            hit = true;
            break;
          }
        }
        if (!hit) {
          resolved = fallback;
          unresolved.push(`${emp.name || emp.username || emp.id}: ${keys.join(', ')}`);
        }
      }
      if (resolved) byTemplate[resolved] = (byTemplate[resolved] || 0) + 1;
    }
    return {
      total: scopedEmployees.length,
      byTemplate,
      unresolved,
    };
  }, [scopedEmployees, draftTemplateByDepartment]);

  const divisionEmployeeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const emp of scopedEmployees) {
      const keys = employeeDivisionKeys(emp);
      const primary = keys[0] || '(no department)';
      counts[primary] = (counts[primary] || 0) + 1;
    }
    return Object.entries(counts)
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [scopedEmployees]);

  const employeesForPicker = useMemo(() => {
    const q = employeePickSearch.trim().toLowerCase();
    const rows = sortByLabel(employees as EmpRow[], (e) => (e.name || e.username || e.id).toString());
    if (!q) return rows;
    return rows.filter(
      (e) =>
        (e.name || '').toLowerCase().includes(q) ||
        (e.username || '').toLowerCase().includes(q) ||
        e.id.toLowerCase().includes(q)
    );
  }, [employees, employeePickSearch]);

  const scopedEmployeesSorted = useMemo(
    () => sortByLabel(scopedEmployees as EmpRow[], (e) => (e.name || e.username || e.id).toString()),
    [scopedEmployees]
  );

  const scopedEmployeesModalRows = useMemo(() => {
    const q = scopeModalSearch.trim().toLowerCase();
    if (!q) return scopedEmployeesSorted;
    return scopedEmployeesSorted.filter((e) => {
      const blob = `${e.name || ''} ${e.username || ''} ${e.id} ${(e.department || '').toString()}`.toLowerCase();
      return blob.includes(q);
    });
  }, [scopedEmployeesSorted, scopeModalSearch]);

  const toggleId = (arr: string[], setArr: (v: string[]) => void, id: string) => {
    if (arr.includes(id)) setArr(arr.filter((x) => x !== id));
    else setArr([...arr, id]);
  };

  const templateLabel = (id: string) => {
    const t = (templates as any[]).find((x: any) => String(x.id) === String(id));
    if (!t) return id.length > 8 ? `${id.slice(0, 8)}…` : id;
    const vl = (t.version_label || '').trim();
    return vl ? `${t.name} — ${vl}` : t.name;
  };

  const step1Valid = !!(cycleName || '').trim();
  const step2Valid =
    scopeMode === 'all' ||
    (participantUserIds.length + participantDeptIds.length + participantProjIds.length > 0 &&
      scopedEmployees.length > 0);
  const step3Valid =
    departmentsInScope.length > 0 &&
    departmentsInScope.every((label) => {
      const row = templateByDepartment.find((r) => r.division_key === label);
      return !!(row && row.template_id);
    });

  const primaryHrLabel = (e: EmpRow) => employeeDivisionKeys(e)[0] || '—';

  const projectDivLabelsLine = (e: EmpRow) => {
    const ids = e.project_division_ids || [];
    if (!ids.length) return '—';
    return ids
      .map((id) => {
        const s = String(id);
        return projectDivisionLabelById.get(s) || (s.length > 8 ? `${s.slice(0, 8)}…` : s);
      })
      .join(', ');
  };

  const goNext = () => {
    if (step === 1 && !step1Valid) {
      toast.error('Enter a cycle name');
      return;
    }
    if (step === 2 && !step2Valid) {
      toast.error('Select at least one person, HR department, or project division');
      return;
    }
    if (step === 3 && !step3Valid) {
      toast.error('Choose a form template for every department in this cycle');
      return;
    }
    setStep((s) => Math.min(4, s + 1));
  };

  const goBack = () => setStep((s) => Math.max(1, s - 1));

  const submit = async () => {
    if (!primaryFormTemplateId || !draftTemplateByDepartment || submitting) return;
    if (!step3Valid) {
      toast.error('Every department in scope needs a template');
      return;
    }
    if (scopeMode === 'explicit' && scopedEmployees.length === 0) {
      toast.error('No participants match your scope');
      return;
    }
    setSubmitting(true);
    try {
      await api('POST', '/reviews/cycles', {
        name: (cycleName || '').trim() || 'Review cycle',
        period_start: periodStart || null,
        period_end: periodEnd || null,
        form_template_id: primaryFormTemplateId,
        template_by_department: draftTemplateByDepartment,
        activate: activateNow,
        ...(scopeMode === 'explicit'
          ? {
              participant_scope: {
                mode: 'explicit',
                user_ids: participantUserIds,
                department_ids: participantDeptIds,
                project_division_ids: participantProjIds,
              },
            }
          : {}),
      });
      toast.success('Cycle created');
      await queryClient.invalidateQueries({ queryKey: ['review-cycles'] });
      onClose();
    } catch {
      toast.error('Could not create cycle');
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <>
      <OverlayPortal>
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center overflow-y-auto p-4">
          <div
            className="w-[900px] max-w-[95vw] max-h-[90vh] bg-gray-100 rounded-xl overflow-hidden flex flex-col border border-gray-200 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="rounded-t-xl border-b border-gray-200 bg-white p-4 flex-shrink-0">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3 min-w-0">
                  <button
                    type="button"
                    onClick={onClose}
                    className="p-1.5 rounded hover:bg-gray-100 transition-colors flex items-center justify-center shrink-0"
                    title="Close"
                  >
                    <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                    </svg>
                  </button>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-gray-900">New review cycle</div>
                    <div className="text-xs text-gray-500 mt-0.5 truncate">{STEP_SUBTITLES[step - 1]}</div>
                  </div>
                </div>
                <div className="inline-flex items-center gap-1.5 text-[10px] font-medium text-gray-500 flex-wrap justify-end">
                  {[1, 2, 3, 4].map((n) => (
                    <span key={n} className="inline-flex items-center gap-1.5">
                      <span
                        className={
                          step === n
                            ? 'px-2 py-1 rounded-full bg-gray-900 text-white'
                            : 'px-2 py-1 rounded-full bg-gray-200 text-gray-600'
                        }
                      >
                        Step {n}
                      </span>
                      {n < 4 ? <span className="text-gray-400">→</span> : null}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div className="overflow-y-auto flex-1 p-4 min-h-0">
              <div className="rounded-xl border border-gray-200 bg-white p-4 text-sm space-y-4">
                {step === 1 && (
                  <>
                    <div>
                      <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide block mb-1">
                        Cycle name *
                      </label>
                      <input
                        className={`w-full border rounded-lg px-3 py-2 text-sm ${!(cycleName || '').trim() ? 'border-red-300' : 'border-gray-200'}`}
                        value={cycleName}
                        onChange={(e) => setCycleName(e.target.value)}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide block mb-1">
                          Start
                        </label>
                        <input
                          type="date"
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                          value={periodStart}
                          onChange={(e) => setPeriodStart(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide block mb-1">
                          End
                        </label>
                        <input
                          type="date"
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                          value={periodEnd}
                          onChange={(e) => setPeriodEnd(e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="rounded-lg border border-gray-200 bg-gray-50/80 px-3 py-2.5 text-xs text-gray-600 leading-relaxed">
                      Employee-review forms are chosen in{' '}
                      <span className="font-medium text-gray-800">step 3</span>, one template per HR department label
                      that appears in this cycle. Manage definitions in{' '}
                      <Link to="/reviews/form-templates" className="text-brand-red font-medium hover:underline">
                        Form templates
                      </Link>
                      .
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={activateNow} onChange={(e) => setActivateNow(e.target.checked)} />
                      <span className="text-gray-800">Activate immediately</span>
                    </label>
                  </>
                )}

                {step === 2 && (
                  <>
                    <div>
                      <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wide mb-1">
                        Who participates
                      </p>
                      <p className="text-xs text-gray-600 leading-relaxed">
                        Choose whether the cycle covers everyone or a custom group. For custom scope, criteria combine
                        with <span className="font-medium text-gray-800">OR</span> (any match includes someone). HR
                        departments follow Settings; project divisions come from each employee profile.
                      </p>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" role="radiogroup" aria-label="Participant scope">
                      <button
                        type="button"
                        role="radio"
                        aria-checked={scopeMode === 'all'}
                        onClick={() => setScopeMode('all')}
                        className={`text-left rounded-xl border-2 p-4 transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2 ${
                          scopeMode === 'all'
                            ? 'border-gray-900 bg-gradient-to-br from-gray-50 to-white shadow-sm'
                            : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50/60'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <div
                            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
                              scopeMode === 'all' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600'
                            }`}
                          >
                            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                              />
                            </svg>
                          </div>
                          <div className="min-w-0 flex-1 pt-0.5">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold text-gray-900">Entire company</span>
                              {scopeMode === 'all' && (
                                <span className="rounded-full bg-gray-900 px-2 py-0.5 text-[10px] font-medium text-white">
                                  Selected
                                </span>
                              )}
                            </div>
                            <p className="mt-1 text-xs text-gray-600 leading-snug">
                              All people in the directory can receive self-review and manager assignments for this cycle.
                            </p>
                          </div>
                        </div>
                      </button>
                      <button
                        type="button"
                        role="radio"
                        aria-checked={scopeMode === 'explicit'}
                        onClick={() => setScopeMode('explicit')}
                        className={`text-left rounded-xl border-2 p-4 transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2 ${
                          scopeMode === 'explicit'
                            ? 'border-gray-900 bg-gradient-to-br from-gray-50 to-white shadow-sm'
                            : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50/60'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <div
                            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
                              scopeMode === 'explicit' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600'
                            }`}
                          >
                            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                              />
                            </svg>
                          </div>
                          <div className="min-w-0 flex-1 pt-0.5">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-semibold text-gray-900">Custom scope</span>
                              {scopeMode === 'explicit' && (
                                <span className="rounded-full bg-gray-900 px-2 py-0.5 text-[10px] font-medium text-white">
                                  Selected
                                </span>
                              )}
                            </div>
                            <p className="mt-1 text-xs text-gray-600 leading-snug">
                              Limit to selected people, HR departments, and/or project divisions. Refine with the lists
                              below.
                            </p>
                          </div>
                        </div>
                      </button>
                    </div>
                    {scopeMode === 'explicit' && (
                      <div className="space-y-3 rounded-xl border border-gray-200 bg-gray-50/90 p-4 shadow-inner">
                        <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">
                          Scope rules
                        </p>
                        <div>
                          <div className="text-xs font-medium text-gray-700 mb-1">
                            People ({participantUserIds.length})
                          </div>
                          <input
                            className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm mb-1 bg-white"
                            placeholder="Search by name…"
                            value={employeePickSearch}
                            onChange={(e) => setEmployeePickSearch(e.target.value)}
                          />
                          <div className="max-h-32 overflow-y-auto rounded border border-gray-200 bg-white text-sm">
                            {employeesForPicker.map((e) => (
                              <label
                                key={e.id}
                                className="flex items-center gap-2 px-2 py-1 border-b border-gray-50 hover:bg-gray-50 cursor-pointer"
                              >
                                <input
                                  type="checkbox"
                                  checked={participantUserIds.includes(e.id)}
                                  onChange={() => toggleId(participantUserIds, setParticipantUserIds, e.id)}
                                />
                                <span className="truncate">{e.name || e.username || e.id}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs font-medium text-gray-700 mb-1">
                            HR departments ({participantDeptIds.length})
                          </div>
                          <div className="max-h-28 overflow-y-auto rounded border border-gray-200 bg-white p-1 space-y-0.5">
                            {divisionOptions.map((d) => (
                              <label
                                key={d.id}
                                className="flex items-center gap-2 px-2 py-0.5 hover:bg-gray-50 cursor-pointer"
                              >
                                <input
                                  type="checkbox"
                                  checked={participantDeptIds.includes(d.id)}
                                  onChange={() => toggleId(participantDeptIds, setParticipantDeptIds, d.id)}
                                />
                                <span className="truncate">{d.label}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs font-medium text-gray-700 mb-1">
                            Project divisions ({participantProjIds.length})
                          </div>
                          <div className="max-h-28 overflow-y-auto rounded border border-gray-200 bg-white p-1 space-y-0.5">
                            {projectDivisionOptions.map((d) => (
                              <label
                                key={d.id}
                                className="flex items-center gap-2 px-2 py-0.5 hover:bg-gray-50 cursor-pointer"
                              >
                                <input
                                  type="checkbox"
                                  checked={participantProjIds.includes(d.id)}
                                  onChange={() => toggleId(participantProjIds, setParticipantProjIds, d.id)}
                                />
                                <span className="truncate">{d.label}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                    <div className="flex flex-wrap items-center gap-3 text-sm text-gray-700">
                      <span>
                        <span className="font-semibold text-gray-900 tabular-nums">{scopedEmployees.length}</span> people
                        in scope
                        {scopeMode === 'all' ? (
                          <span className="text-gray-500">
                            {' '}
                            (of <span className="tabular-nums">{employees.length}</span> in directory)
                          </span>
                        ) : null}
                      </span>
                      {divisionEmployeeCounts.length > 0 && (
                        <span className="text-gray-500">
                          · {divisionEmployeeCounts.length} primary-dept. groups
                        </span>
                      )}
                      <button
                        type="button"
                        disabled={scopedEmployees.length === 0}
                        onClick={() => {
                          setScopeModalSearch('');
                          setScopePeopleModalOpen(true);
                        }}
                        className="px-3 py-1 rounded-lg border border-gray-300 text-xs font-medium hover:bg-gray-50 disabled:opacity-50"
                      >
                        View list
                      </button>
                    </div>
                  </>
                )}

                {step === 3 && (
                  <>
                    <p className="text-xs text-gray-600 leading-relaxed">
                      Each label below appears on at least one person in this cycle (from HR departments / profile).
                      Choose an <span className="font-medium text-gray-800">active</span> employee-review template for
                      every row. For people with several labels, the first matching label in their profile order wins.
                    </p>
                    {departmentsInScope.length === 0 ? (
                      <p className="text-sm text-amber-700">No one in scope yet — go back and fix step 2.</p>
                    ) : (
                      <div className="space-y-2">
                        {departmentsInScope.map((label) => {
                          const row = templateByDepartment.find((r) => r.division_key === label);
                          const tid = row?.template_id || '';
                          const n = departmentHeadcount.get(label) ?? 0;
                          return (
                            <div
                              key={label}
                              className="flex flex-wrap gap-3 items-center rounded-lg border border-gray-200 bg-gray-50/60 px-3 py-2"
                            >
                              <div className="flex-1 min-w-[160px]">
                                <div className="text-sm font-medium text-gray-900">{label}</div>
                                <div className="text-[11px] text-gray-500">
                                  {n} {n === 1 ? 'person' : 'people'} with this label
                                </div>
                              </div>
                              <select
                                className={`flex-1 min-w-[200px] border rounded-lg px-2 py-1.5 text-sm bg-white ${
                                  !tid ? 'border-red-300' : 'border-gray-200'
                                }`}
                                value={tid}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  setTemplateByDepartment((prev) =>
                                    departmentsInScope.map((lab) => {
                                      if (lab === label) return { division_key: lab, template_id: v };
                                      const ex = prev.find((r) => r.division_key === lab);
                                      return ex || { division_key: lab, template_id: '' };
                                    })
                                  );
                                }}
                              >
                                <option value="">Select template…</option>
                                {(templates as any[]).map((t: any) => (
                                  <option key={t.id} value={t.id}>
                                    {t.name}
                                    {(t.version_label || '').trim() ? ` — ${(t.version_label || '').trim()}` : ''}
                                  </option>
                                ))}
                              </select>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </>
                )}

                {step === 4 && coveragePreview && (
                  <>
                    <div className="rounded-lg bg-slate-50 border border-slate-100 p-3">
                      <div className="font-medium text-gray-800 mb-2">Template distribution (preview)</div>
                      <ul className="space-y-1 text-gray-600 text-sm">
                        {Object.entries(coveragePreview.byTemplate).map(([tid, n]) => (
                          <li key={tid}>
                            <span className="font-medium text-gray-900">{n}</span> → {templateLabel(tid)}
                          </li>
                        ))}
                      </ul>
                      {coveragePreview.unresolved.length > 0 && (
                        <p className="mt-2 text-red-700 text-xs">
                          Could not resolve: {coveragePreview.unresolved.slice(0, 8).join('; ')}
                          {coveragePreview.unresolved.length > 8
                            ? ` … +${coveragePreview.unresolved.length - 8} more`
                            : ''}
                        </p>
                      )}
                    </div>
                    <div className="text-sm text-gray-700">
                      <span className="font-semibold">{scopedEmployees.length}</span> reviewees ·{' '}
                      <span className={activateNow ? 'text-green-700 font-medium' : 'text-amber-700 font-medium'}>
                        {activateNow ? 'Active' : 'Draft'}
                      </span>{' '}
                      · {(cycleName || '').trim() || 'Untitled'}
                    </div>
                  </>
                )}
                {step === 4 && !coveragePreview && (
                  <p className="text-sm text-amber-700">
                    Complete step 3 with a template for each department in scope to see the preview.
                  </p>
                )}
              </div>
            </div>

            <div className="flex-shrink-0 px-4 py-4 border-t border-gray-200 bg-white flex flex-wrap items-center justify-between gap-3 rounded-b-xl relative z-0">
              <div className="text-xs text-gray-500">
                Step {step} of 4 · {STEP_LABELS[step - 1]}
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-3 py-1.5 rounded-lg text-sm font-medium text-gray-700 border border-gray-200 hover:bg-gray-50"
                >
                  Cancel
                </button>
                {step > 1 && (
                  <button
                    type="button"
                    onClick={goBack}
                    disabled={submitting}
                    className="px-3 py-1.5 rounded-lg text-sm font-medium text-gray-700 border border-gray-200 hover:bg-gray-50 disabled:opacity-50"
                  >
                    Back
                  </button>
                )}
                {step < 4 && (
                  <button
                    type="button"
                    onClick={goNext}
                    disabled={
                      submitting ||
                      (step === 1 && !step1Valid) ||
                      (step === 2 && !step2Valid) ||
                      (step === 3 && !step3Valid)
                    }
                    className="px-4 py-2 rounded-lg text-sm font-semibold bg-brand-red text-white hover:bg-[#aa1212] disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Next
                  </button>
                )}
                {step === 4 && (
                  <button
                    type="button"
                    disabled={submitting || !primaryFormTemplateId || !step3Valid}
                    onClick={submit}
                    className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-brand-red hover:bg-[#aa1212] disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {submitting ? 'Creating…' : 'Create cycle'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </OverlayPortal>

      {scopePeopleModalOpen && (
        <OverlayPortal>
          <div
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
            role="dialog"
            aria-modal="true"
            onClick={() => setScopePeopleModalOpen(false)}
          >
            <div
              className="w-full max-w-3xl max-h-[85vh] bg-gray-100 rounded-xl overflow-hidden flex flex-col border border-gray-200 shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="rounded-t-xl border-b border-gray-200 bg-white px-5 py-4 flex items-start justify-between gap-3 shrink-0">
                <div>
                  <h3 className="text-sm font-semibold text-gray-900">People in scope</h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    <span className="tabular-nums">{scopedEmployees.length}</span> people
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setScopePeopleModalOpen(false)}
                  className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"
                  aria-label="Close"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            <div className="px-4 py-3 border-b border-gray-200 bg-white shrink-0">
              <input
                type="search"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white"
                placeholder="Filter…"
                value={scopeModalSearch}
                onChange={(e) => setScopeModalSearch(e.target.value)}
              />
            </div>
            <div className="overflow-y-auto flex-1 min-h-0 p-4 bg-gray-100">
              <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
                <table className="min-w-full text-sm">
                <thead className="bg-gray-50 sticky top-0">
                  <tr className="text-left text-xs font-medium text-gray-600 uppercase">
                    <th className="px-4 py-2">Name</th>
                    <th className="px-4 py-2">Username</th>
                    <th className="px-4 py-2">Primary HR</th>
                    <th className="px-4 py-2">Project div.</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {scopedEmployeesModalRows.map((e) => (
                    <tr key={e.id} className="hover:bg-gray-50/80">
                      <td className="px-4 py-2 font-medium text-gray-900">
                        <Link
                          to={`/users/${encodeURIComponent(e.id)}`}
                          className="text-brand-red hover:underline"
                          onClick={() => {
                            setScopePeopleModalOpen(false);
                            onClose();
                          }}
                        >
                          {e.name || e.username || e.id}
                        </Link>
                      </td>
                      <td className="px-4 py-2 text-gray-600">{e.username || '—'}</td>
                      <td className="px-4 py-2 text-gray-700">{primaryHrLabel(e)}</td>
                      <td className="px-4 py-2 text-gray-600 text-xs max-w-[200px]">
                        <span className="line-clamp-2" title={projectDivLabelsLine(e)}>
                          {projectDivLabelsLine(e)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
                </table>
                {scopedEmployeesModalRows.length === 0 && (
                  <div className="px-5 py-10 text-center text-sm text-gray-500">No matches.</div>
                )}
              </div>
            </div>
            <div className="flex-shrink-0 px-4 py-3 border-t border-gray-200 bg-white flex justify-end rounded-b-xl">
              <button
                type="button"
                onClick={() => setScopePeopleModalOpen(false)}
                className="px-3 py-1.5 rounded-lg text-sm font-medium text-gray-700 border border-gray-200 hover:bg-gray-50"
              >
                Close
              </button>
            </div>
          </div>
        </div>
        </OverlayPortal>
      )}
    </>
  );
}
