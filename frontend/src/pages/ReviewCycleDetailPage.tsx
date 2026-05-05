import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import { sortByLabel } from '@/lib/sortOptions';
import { countEmployeesMatchingCycleScope, type ReviewParticipantEmp } from '@/lib/reviewParticipantScope';
import { useConfirm } from '@/components/ConfirmProvider';

type CycleDetail = {
  id: string;
  name: string;
  period_start: string | null;
  period_end: string | null;
  form_template_id: string | null;
  template_by_department: Record<string, string> | null;
  participant_scope: {
    mode?: string;
    user_ids?: string[];
    department_ids?: string[];
    project_division_ids?: string[];
  } | null;
  status: string;
  assignment_count: number;
  assignments_by_status: Record<string, number>;
  assignment_self_rows: number;
  assignment_supervisor_rows: number;
};

type EmpRow = ReviewParticipantEmp & { name?: string; username?: string };

function formatIsoDate(s: string | null | undefined) {
  if (!s) return '—';
  try {
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return s;
    return d.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return s;
  }
}

function formatDueShort(s: string | null | undefined) {
  if (!s) return '—';
  try {
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return s;
    return d.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return s;
  }
}

type HrStatusRow = {
  user_id: string;
  name?: string | null;
  display_name?: string | null;
  supervisor_user_id?: string | null;
  supervisor_display_name?: string | null;
  employee_self_done: boolean;
  supervisor_done: boolean;
  both_done: boolean;
  missing_employee: boolean;
  missing_supervisor: boolean;
  self_due_date?: string | null;
  supervisor_due_date?: string | null;
  has_self_assignment?: boolean;
  has_supervisor_assignment?: boolean;
};

function CompletionGlyph({ ok, absent }: { ok: boolean; absent?: boolean }) {
  if (absent) {
    return <span className="text-xs text-gray-400">No task</span>;
  }
  if (ok) {
    return (
      <span
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 shadow-sm ring-1 ring-emerald-200/80"
        title="Submitted"
      >
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
        </svg>
      </span>
    );
  }
  return (
    <span
      className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-rose-50 text-rose-600 shadow-sm ring-1 ring-rose-200/80"
      title="Not submitted"
    >
      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
      </svg>
    </span>
  );
}

export default function ReviewCycleDetailPage() {
  const { cycleId } = useParams<{ cycleId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [deleting, setDeleting] = useState(false);
  const [generatingTasks, setGeneratingTasks] = useState(false);
  const [cycleTab, setCycleTab] = useState<'details' | 'progress'>('progress');
  const [progressFilter, setProgressFilter] = useState<
    'all' | 'both_done' | 'missing_employee' | 'missing_supervisor'
  >('all');
  const [progressSearch, setProgressSearch] = useState('');
  const id = cycleId || '';

  const { data: me } = useQuery({
    queryKey: ['me'],
    queryFn: () => api<any>('GET', '/auth/me'),
  });
  const perms = (me?.permissions || []) as string[];
  const isAdminRole = (me?.roles || []).some((r: string) => String(r || '').toLowerCase() === 'admin');
  /** Match backend + AppShell: full admin role, or explicit review admin perms (admin role often omits these from the flat list). */
  const canDeleteCycle =
    isAdminRole || perms.includes('reviews:admin') || perms.includes('hr:reviews:admin');
  const canManageReviewTasks =
    isAdminRole || perms.includes('reviews:admin') || perms.includes('hr:reviews:admin');
  /** Future admin-only review step (column on Team progress); same gate as other HR review admin tools. */
  const canSeeAdminReviewColumn = canDeleteCycle;

  const { data: cycle, isLoading: cycleLoading, error: cycleError } = useQuery({
    queryKey: ['review-cycle', id],
    queryFn: () => api<CycleDetail>('GET', `/reviews/cycles/${id}`),
    enabled: !!id,
  });

  const { data: templates = [] } = useQuery({
    queryKey: ['form-templates', 'employee_review'],
    queryFn: () =>
      api<any[]>('GET', '/form-templates?category=employee_review&sort=name&sort_dir=asc'),
  });

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api<Record<string, any[]>>('GET', '/settings'),
  });

  const { data: projectDivTree = [] } = useQuery({
    queryKey: ['project-divisions', 'review-cycle-detail'],
    queryFn: () => api<any[]>('GET', '/settings/project-divisions'),
  });

  const { data: employees = [] } = useQuery({
    queryKey: ['employees', 'review-cycle-detail'],
    queryFn: () => api<EmpRow[]>('GET', '/employees'),
  });

  const { data: hrStatus = [] } = useQuery({
    queryKey: ['review-hr-status', id],
    queryFn: () => api<any[]>('GET', `/reviews/cycles/${id}/hr-status`),
    enabled: !!id,
  });

  const templateLabel = (tid: string | null | undefined) => {
    if (!tid) return 'Not set';
    const t = (templates as any[]).find((x: any) => String(x.id) === String(tid));
    if (!t) return tid.length > 10 ? `${tid.slice(0, 8)}…` : tid;
    const vl = (t.version_label || '').trim();
    return vl ? `${t.name} — ${vl}` : t.name;
  };

  const empName = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of employees as EmpRow[]) {
      const n = (e.name || '').trim() || (e.username || '').trim() || e.id;
      m.set(String(e.id), n);
    }
    return m;
  }, [employees]);

  const divisionLabelById = useMemo(() => {
    const m = new Map<string, string>();
    for (const d of settings?.divisions || []) {
      const i = String((d as any).id || '');
      const lab = String((d as any).label || '').trim();
      if (i && lab) m.set(i, lab);
    }
    return m;
  }, [settings]);

  const projectDivisionOptions = useMemo(() => {
    const out: { id: string; label: string }[] = [];
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

  const projDivLabel = useMemo(() => {
    const m = new Map<string, string>();
    for (const o of projectDivisionOptions) m.set(o.id, o.label);
    return m;
  }, [projectDivisionOptions]);

  const hrSummary = useMemo(() => {
    const rows = hrStatus as HrStatusRow[];
    if (!rows.length) return null;
    const both = rows.filter((r) => r.both_done).length;
    const missE = rows.filter((r) => r.missing_employee).length;
    const missS = rows.filter((r) => r.missing_supervisor).length;
    return { total: rows.length, both, missE, missS };
  }, [hrStatus]);

  const filteredProgressRows = useMemo(() => {
    const rows = [...(hrStatus as HrStatusRow[])];
    let out = rows;
    if (progressFilter === 'both_done') out = out.filter((r) => r.both_done);
    else if (progressFilter === 'missing_employee') out = out.filter((r) => r.missing_employee);
    else if (progressFilter === 'missing_supervisor') out = out.filter((r) => r.missing_supervisor);
    const q = progressSearch.trim().toLowerCase();
    if (q) {
      out = out.filter((r) => {
        const a = (r.display_name || r.name || '').toLowerCase();
        const b = (r.supervisor_display_name || '').toLowerCase();
        return a.includes(q) || b.includes(q);
      });
    }
    return out;
  }, [hrStatus, progressFilter, progressSearch]);

  const scopePeopleStats = useMemo(
    () => countEmployeesMatchingCycleScope(employees as ReviewParticipantEmp[], cycle?.participant_scope),
    [employees, cycle?.participant_scope]
  );

  const runGenerateReviewTasks = async () => {
    setGeneratingTasks(true);
    try {
      await api('POST', `/reviews/cycles/${id}/assign`, {});
      toast.success('Review tasks created (self + manager rows where applicable)');
      await queryClient.invalidateQueries({ queryKey: ['review-cycle', id] });
      await queryClient.invalidateQueries({ queryKey: ['review-hr-status', id] });
      await queryClient.invalidateQueries({ queryKey: ['review-cycle-assignments', id] });
      await queryClient.invalidateQueries({ queryKey: ['review-cycles'] });
    } catch {
      toast.error('Could not create review tasks. Check permissions and try again.');
    } finally {
      setGeneratingTasks(false);
    }
  };

  const tbdRows = useMemo(() => {
    const raw = cycle?.template_by_department;
    if (!raw || typeof raw !== 'object') return [];
    return Object.entries(raw)
      .filter(([, v]) => !!v)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([division, tid]) => ({
        division,
        templateName: templateLabel(String(tid)),
      }));
  }, [cycle, templates]);

  const scopeBlock = useMemo(() => {
    const ps = cycle?.participant_scope;
    if (!ps || String(ps.mode || '').toLowerCase() !== 'explicit') {
      return { kind: 'all' as const, lines: [] as string[] };
    }
    const lines: string[] = [];
    const uids = ps.user_ids || [];
    if (uids.length) {
      const names = uids.map((uid) => empName.get(uid) || uid);
      lines.push(`${uids.length} specific people: ${names.slice(0, 8).join(', ')}${uids.length > 8 ? '…' : ''}`);
    }
    const dids = ps.department_ids || [];
    if (dids.length) {
      const labs = dids.map((d) => divisionLabelById.get(d) || d);
      lines.push(`${dids.length} HR department(s): ${labs.join(', ')}`);
    }
    const pids = ps.project_division_ids || [];
    if (pids.length) {
      const labs = pids.map((p) => projDivLabel.get(p) || p);
      lines.push(`${pids.length} project division(s): ${labs.join(', ')}`);
    }
    if (!lines.length) lines.push('Explicit scope with no criteria (no one matched).');
    return { kind: 'explicit' as const, lines };
  }, [cycle, empName, divisionLabelById, projDivLabel]);

  const statusBadgeClass = (s: string) => {
    const x = (s || '').toLowerCase();
    if (x === 'active') return 'bg-green-100 text-green-800';
    if (x === 'draft') return 'bg-amber-100 text-amber-800';
    return 'bg-gray-100 text-gray-700';
  };

  if (!id) {
    return (
      <div className="rounded-xl border bg-white p-6 text-sm text-gray-600">Invalid cycle.</div>
    );
  }

  if (cycleLoading) {
    return (
      <div className="rounded-xl border bg-white p-8 text-center text-sm text-gray-500">Loading cycle…</div>
    );
  }

  if (cycleError || !cycle) {
    return (
      <div className="rounded-xl border bg-white p-6">
        <p className="text-sm text-red-700">Could not load this review cycle.</p>
        <button
          type="button"
          onClick={() => navigate('/reviews/cycles')}
          className="mt-3 text-sm font-medium text-brand-red hover:underline"
        >
          Back to cycles
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-6xl pb-10">
      <div className="rounded-xl border bg-white p-4 mb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <button
              type="button"
              onClick={() => navigate('/reviews/cycles')}
              className="p-1.5 rounded hover:bg-gray-100 shrink-0"
              title="Back to review cycles"
            >
              <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </button>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-lg font-bold text-gray-900">{cycle.name}</h1>
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${statusBadgeClass(
                    cycle.status
                  )}`}
                >
                  {cycle.status}
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                {formatIsoDate(cycle.period_start)} → {formatIsoDate(cycle.period_end)}
              </p>
              <p className="text-[11px] text-gray-400 mt-0.5 font-mono truncate" title={cycle.id}>
                ID {cycle.id}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            {canManageReviewTasks && (
              <button
                type="button"
                disabled={generatingTasks}
                onClick={() => runGenerateReviewTasks()}
                className="px-3 py-1.5 rounded-lg border border-gray-300 text-xs font-medium text-gray-800 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                title="Creates database rows: one self-review per eligible person and one supervisor review per manager/report pair in scope."
              >
                {generatingTasks ? 'Creating…' : 'Create review tasks'}
              </button>
            )}
            <Link
              to="/reviews/admin"
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-900 text-white hover:bg-gray-800 inline-block text-center"
            >
              Status board
            </Link>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-gray-200 mb-4">
        <button
          type="button"
          onClick={() => setCycleTab('progress')}
          className={`px-4 py-2.5 text-sm font-medium rounded-t border-b-2 -mb-px transition-colors ${
            cycleTab === 'progress'
              ? 'border-brand-red text-brand-red bg-white'
              : 'border-transparent text-gray-600 hover:text-gray-900'
          }`}
        >
          Team progress
        </button>
        <button
          type="button"
          onClick={() => setCycleTab('details')}
          className={`px-4 py-2.5 text-sm font-medium rounded-t border-b-2 -mb-px transition-colors ${
            cycleTab === 'details'
              ? 'border-brand-red text-brand-red bg-white'
              : 'border-transparent text-gray-600 hover:text-gray-900'
          }`}
        >
          Cycle details
        </button>
      </div>

      {cycleTab === 'details' && (
        <>
      {cycle.assignment_count === 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/90 p-4 mb-4">
          <h2 className="text-sm font-semibold text-amber-950 mb-1">Next step: create review tasks</h2>
          <p className="text-sm text-amber-950/90 leading-relaxed">
            Creating the cycle only saves settings (who participates, which form, dates). Nothing is sent to employees
            until you create tasks: the system adds <strong className="font-semibold">self-review</strong> rows and{' '}
            <strong className="font-semibold">supervisor</strong> rows from the org chart, limited to this cycle&apos;s
            participant scope. After that, the counts and tables below fill in and HR progress reflects real forms.
          </p>
          {scopePeopleStats.mode === 'explicit' && scopePeopleStats.emptyCriteria && (
            <p className="text-sm text-red-800 mt-2">
              This cycle&apos;s explicit scope has no criteria — no one will get tasks until you edit the cycle or fix
              scope in the database.
            </p>
          )}
          {canManageReviewTasks && (
            <button
              type="button"
              disabled={generatingTasks}
              onClick={() => runGenerateReviewTasks()}
              className="mt-3 px-4 py-2 rounded-lg bg-amber-900 text-white text-sm font-medium hover:bg-amber-950 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {generatingTasks ? 'Creating…' : 'Create review tasks now'}
            </button>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="text-[10px] font-medium text-gray-500 uppercase tracking-wide mb-2">Participants</div>
          {scopeBlock.kind === 'all' ? (
            <>
              <p className="text-sm text-gray-800">
                Entire company — everyone can receive self and manager tasks when you run task creation (still filtered
                by the org chart).
              </p>
              <p className="text-xs text-gray-500 mt-2">
                ~{scopePeopleStats.directoryTotal} people listed in the employee directory (not everyone may appear
                there).
              </p>
            </>
          ) : (
            <>
              <ul className="text-sm text-gray-700 space-y-1.5 list-disc list-inside">
                {scopeBlock.lines.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
              {scopePeopleStats.mode === 'explicit' && !scopePeopleStats.emptyCriteria && (
                <p className="text-xs text-gray-600 mt-2">
                  <span className="font-semibold tabular-nums text-gray-800">{scopePeopleStats.count}</span> people in
                  directory match this scope (same rule as the create wizard).
                </p>
              )}
            </>
          )}
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="text-[10px] font-medium text-gray-500 uppercase tracking-wide mb-2">Default form</div>
          <p className="text-sm font-medium text-gray-900">{templateLabel(cycle.form_template_id)}</p>
          <p className="text-xs text-gray-500 mt-1">
            Used when no per-department mapping matches a person&apos;s HR labels (or as the cycle FK).
          </p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="text-[10px] font-medium text-gray-500 uppercase tracking-wide mb-2">Tasks</div>
          <p className="text-2xl font-bold text-gray-900 tabular-nums">{cycle.assignment_count}</p>
          <p className="text-xs text-gray-600 mt-1">
            Self: <span className="font-medium">{cycle.assignment_self_rows}</span>
            {' · '}
            Supervisor: <span className="font-medium">{cycle.assignment_supervisor_rows}</span>
          </p>
          <p className="text-[11px] text-gray-500 mt-2 leading-snug">
            Each row is one form someone must complete. Zero until you use &quot;Create review tasks&quot;.
          </p>
          {Object.keys(cycle.assignments_by_status || {}).length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {Object.entries(cycle.assignments_by_status).map(([st, n]) => (
                <span
                  key={st}
                  className="inline-flex items-center rounded-md bg-gray-100 px-2 py-0.5 text-[11px] text-gray-700"
                >
                  {st}: <span className="font-semibold ml-0.5 tabular-nums">{n}</span>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {tbdRows.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white p-4 mb-4">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">Form by department label</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-[10px] font-medium uppercase tracking-wide text-gray-500">
                  <th className="py-2 pr-4">HR / profile label</th>
                  <th className="py-2">Employee-review template</th>
                </tr>
              </thead>
              <tbody>
                {tbdRows.map((r) => (
                  <tr key={r.division} className="border-b border-gray-100 last:border-0">
                    <td className="py-2 pr-4 font-medium text-gray-900">{r.division}</td>
                    <td className="py-2 text-gray-700">{r.templateName}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {canDeleteCycle && cycle && (
        <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4">
          <h3 className="text-sm font-semibold text-red-900 mb-3">Danger Zone</h3>
          <p className="text-xs text-red-900/80 mb-3 max-w-2xl leading-relaxed">
            Deleting this review cycle permanently removes it and all related assignments and answers. This cannot be
            undone.
          </p>
          <button
            type="button"
            disabled={deleting}
            onClick={async () => {
              const result = await confirm({
                title: 'Delete review cycle',
                message: `Are you sure you want to delete "${cycle.name}"? All assignments and submitted answers for this cycle will be permanently removed.`,
                confirmText: 'Delete',
                cancelText: 'Cancel',
              });
              if (result !== 'confirm') return;
              setDeleting(true);
              try {
                await api('DELETE', `/reviews/cycles/${encodeURIComponent(id)}`);
                toast.success('Review cycle deleted');
                await queryClient.invalidateQueries({ queryKey: ['review-cycles'] });
                queryClient.removeQueries({ queryKey: ['review-cycle', id] });
                queryClient.removeQueries({ queryKey: ['review-hr-status', id] });
                queryClient.removeQueries({ queryKey: ['review-cycle-assignments', id] });
                queryClient.removeQueries({ queryKey: ['review-compare', id] });
                navigate('/reviews/cycles', { replace: true });
              } catch {
                toast.error('Could not delete review cycle');
              } finally {
                setDeleting(false);
              }
            }}
            className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {deleting ? 'Deleting…' : 'Delete review cycle'}
          </button>
        </div>
      )}
        </>
      )}

      {cycleTab === 'progress' && (
        <div className="space-y-4">
          <div className="rounded-xl border border-gray-200 bg-gradient-to-br from-slate-50/90 to-white p-5 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <h2 className="text-base font-semibold text-gray-900">Who has finished?</h2>
                <p className="text-sm text-gray-600 mt-1 max-w-3xl leading-relaxed">
                  One row per employee in this cycle. Self-review is their own form; supervisor review is the manager
                  form about them.
                  {canSeeAdminReviewColumn ? (
                    <>
                      {' '}
                      The <span className="font-medium text-gray-800">Admin</span> column (HR/admin only) is reserved
                      for a future third step.
                    </>
                  ) : null}
                </p>
              </div>
              {hrSummary && hrSummary.both > 0 ? (
                <Link
                  to={`/reviews/compare?cycle=${encodeURIComponent(id)}`}
                  className="shrink-0 inline-flex items-center justify-center gap-2 rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-900 shadow-sm hover:bg-gray-50"
                >
                  <svg className="h-4 w-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                  Compare cycle
                </Link>
              ) : null}
            </div>
          </div>

          {hrSummary ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">In cycle</div>
                <div className="text-2xl font-bold text-gray-900 tabular-nums mt-1">{hrSummary.total}</div>
                <div className="text-xs text-gray-500 mt-0.5">reviewees with tasks</div>
              </div>
              <div className="rounded-xl border border-emerald-200/80 bg-emerald-50/60 p-4 shadow-sm">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-emerald-800">Both done</div>
                <div className="text-2xl font-bold text-emerald-900 tabular-nums mt-1">{hrSummary.both}</div>
                <div className="text-xs text-emerald-800/80 mt-0.5">self + supervisor submitted</div>
              </div>
              <div className="rounded-xl border border-amber-200/80 bg-amber-50/60 p-4 shadow-sm">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-amber-900">Needs self</div>
                <div className="text-2xl font-bold text-amber-950 tabular-nums mt-1">{hrSummary.missE}</div>
                <div className="text-xs text-amber-900/80 mt-0.5">employee review open</div>
              </div>
              <div className="rounded-xl border border-amber-200/80 bg-amber-50/60 p-4 shadow-sm">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-amber-900">Needs supervisor</div>
                <div className="text-2xl font-bold text-amber-950 tabular-nums mt-1">{hrSummary.missS}</div>
                <div className="text-xs text-amber-900/80 mt-0.5">manager review open</div>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50/80 p-6 text-sm text-gray-600">
              <p className="font-medium text-gray-800 mb-1">No people in the progress list yet</p>
              <p>
                Use <span className="font-semibold text-gray-900">Create review tasks</span> on the Cycle details tab
                so assignments exist; this table then fills automatically.
              </p>
            </div>
          )}

          {hrSummary ? (
            <>
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 flex-wrap">
                <div className="flex flex-wrap gap-2">
                  {(
                    [
                      ['all', 'All'],
                      ['both_done', 'Both done'],
                      ['missing_employee', 'Needs self'],
                      ['missing_supervisor', 'Needs supervisor'],
                    ] as const
                  ).map(([k, lab]) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setProgressFilter(k)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                        progressFilter === k
                          ? 'border-brand-red bg-red-50 text-brand-red'
                          : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      {lab}
                    </button>
                  ))}
                </div>
                <div className="flex-1 min-w-[12rem]">
                  <label className="sr-only" htmlFor="progress-search">
                    Search by name
                  </label>
                  <input
                    id="progress-search"
                    type="search"
                    placeholder="Search employee or supervisor…"
                    value={progressSearch}
                    onChange={(e) => setProgressSearch(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-red/15 focus:border-brand-red/40"
                  />
                </div>
              </div>

              <div className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="bg-slate-100/90 border-b border-gray-200 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                        <th className="py-3 px-4">Employee</th>
                        <th className="py-3 px-4">Supervisor</th>
                        <th className="py-3 px-4 whitespace-nowrap">Self due</th>
                        {canSeeAdminReviewColumn ? (
                          <th className="py-3 px-4 text-center whitespace-nowrap">
                            Admin
                            <span className="block font-normal normal-case text-[10px] text-slate-500 tracking-normal">
                              HR / admin
                            </span>
                          </th>
                        ) : null}
                        <th className="py-3 px-4 text-center">Self</th>
                        <th className="py-3 px-4 text-center">Mgr review</th>
                        <th className="py-3 px-4">Overall</th>
                        <th className="py-3 px-4 min-w-[9rem]">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {filteredProgressRows.length === 0 ? (
                        <tr>
                          <td
                            colSpan={canSeeAdminReviewColumn ? 8 : 7}
                            className="py-10 px-4 text-center text-sm text-gray-500"
                          >
                            No rows match this filter or search.
                          </td>
                        </tr>
                      ) : (
                        filteredProgressRows.map((r) => {
                          const label = (r.display_name || r.name || r.user_id).trim();
                          const sup = (r.supervisor_display_name || '').trim();
                          const overall =
                            r.both_done ? (
                              <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-900">
                                Complete
                              </span>
                            ) : r.missing_employee ? (
                              <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-950">
                                Needs self
                              </span>
                            ) : (
                              <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-950">
                                Needs supervisor
                              </span>
                            );
                          return (
                            <tr key={r.user_id} className="hover:bg-slate-50/80 transition-colors">
                              <td className="py-3 px-4">
                                <Link
                                  to={`/users/${encodeURIComponent(r.user_id)}`}
                                  className="font-medium text-brand-red hover:underline"
                                >
                                  {label}
                                </Link>
                              </td>
                              <td className="py-3 px-4 text-gray-700">
                                {r.supervisor_user_id ? (
                                  <Link
                                    to={`/users/${encodeURIComponent(r.supervisor_user_id)}`}
                                    className="text-gray-800 hover:text-brand-red hover:underline"
                                  >
                                    {sup || 'Supervisor'}
                                  </Link>
                                ) : (
                                  <span className="text-gray-400">—</span>
                                )}
                              </td>
                              <td className="py-3 px-4 text-gray-600 tabular-nums whitespace-nowrap text-xs">
                                {formatDueShort(r.self_due_date)}
                              </td>
                              {canSeeAdminReviewColumn ? (
                                <td className="py-3 px-4 text-center align-middle">
                                  <span
                                    className="inline-flex text-xs text-gray-400"
                                    title="Reserved for a future admin-only review step"
                                  >
                                    —
                                  </span>
                                </td>
                              ) : null}
                              <td className="py-3 px-4 text-center">
                                <CompletionGlyph
                                  ok={r.employee_self_done}
                                  absent={r.has_self_assignment === false}
                                />
                              </td>
                              <td className="py-3 px-4 text-center">
                                <CompletionGlyph
                                  ok={r.supervisor_done}
                                  absent={r.has_supervisor_assignment === false}
                                />
                              </td>
                              <td className="py-3 px-4">{overall}</td>
                              <td className="py-3 px-4">
                                <Link
                                  to={`/reviews/compare?cycle=${encodeURIComponent(id)}&reviewee=${encodeURIComponent(r.user_id)}`}
                                  className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold ${
                                    r.both_done
                                      ? 'bg-gray-900 text-white hover:bg-gray-800'
                                      : 'border border-gray-300 bg-white text-gray-900 shadow-sm hover:bg-gray-50'
                                  }`}
                                  title={
                                    r.both_done
                                      ? 'Open side-by-side comparison for this employee'
                                      : 'Open comparison — submitted answers only until both reviews are in'
                                  }
                                >
                                  Compare
                                </Link>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}
