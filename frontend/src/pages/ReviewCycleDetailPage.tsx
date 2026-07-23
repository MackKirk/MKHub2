import { useMemo, useState, type ReactNode } from 'react';

import { Link, useNavigate, useParams } from 'react-router-dom';

import { useQuery, useQueryClient } from '@tanstack/react-query';

import { BarChart3, Calendar, Check, Search, X } from 'lucide-react';

import { api } from '@/lib/api';

import toast from 'react-hot-toast';

import { sortByLabel } from '@/lib/sortOptions';

import { countEmployeesMatchingCycleScope, employeesMatchingCycleScope, employeeDivisionKeys, type ReviewParticipantEmp } from '@/lib/reviewParticipantScope';

import { useConfirm } from '@/components/ConfirmProvider';

import {

  AppBadge,

  AppButton,

  AppCard,

  AppEmptyState,

  AppInput,

  AppModal,

  AppPageHeader,

  AppSectionHeader,

  AppTabCountBadge,
  getAppTabButtonClassName,

  AppTable,

  AppTabs,

  AppTooltip,

  uiColors,

  uiCx,

  uiLayout,

  uiModalLayer,

  uiRadius,

  uiShadows,

  uiSpacing,

  uiTypography,

} from '@/components/ui';



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



function cycleStatusVariant(status: string | null | undefined): 'success' | 'warning' | 'neutral' {

  const s = String(status || '').toLowerCase();

  if (s === 'active') return 'success';

  if (s === 'draft') return 'warning';

  return 'neutral';

}



function statusLabel(status: string | null | undefined): string {

  const s = String(status || '').toLowerCase();

  if (!s) return 'Unknown';

  return s.charAt(0).toUpperCase() + s.slice(1);

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

    return <span className={uiTypography.helper}>No task</span>;

  }

  if (ok) {

    return (

      <AppTooltip content="Submitted" wrap>

        <span

          className={uiCx(

            'inline-flex h-8 w-8 items-center justify-center bg-emerald-50 text-emerald-700 shadow-sm ring-1 ring-emerald-200/80',

            uiRadius.control,

          )}

        >

          <Check className="h-4 w-4" strokeWidth={2.5} aria-hidden />

        </span>

      </AppTooltip>

    );

  }

  return (

    <AppTooltip content="Not submitted" wrap>

      <span

        className={uiCx(

          'inline-flex h-8 w-8 items-center justify-center bg-rose-50 text-rose-600 shadow-sm ring-1 ring-rose-200/80',

          uiRadius.control,

        )}

      >

        <X className="h-4 w-4" strokeWidth={2.5} aria-hidden />

      </span>

    </AppTooltip>

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

  const [scopePeopleModalOpen, setScopePeopleModalOpen] = useState(false);

  const [scopeModalSearch, setScopeModalSearch] = useState('');

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



  const progressFilterSegments = useMemo(() => {
    const counts: Record<string, number> = {
      all: hrSummary?.total ?? 0,
      both_done: hrSummary?.both ?? 0,
      missing_employee: hrSummary?.missE ?? 0,
      missing_supervisor: hrSummary?.missS ?? 0,
    };
    return (
      [
        ['all', 'All'],
        ['both_done', 'Both done'],
        ['missing_employee', 'Needs self'],
        ['missing_supervisor', 'Needs supervisor'],
      ] as const
    ).map(([key, label]) => ({
      key,
      label,
      count: counts[key],
      active: progressFilter === key,
      onClick: () => setProgressFilter(key),
    }));
  }, [progressFilter, hrSummary]);



  const progressColumns = useMemo(() => {

    const cols = ['Employee', 'Supervisor', 'Self due'];

    if (canSeeAdminReviewColumn) cols.push('Admin (HR)');

    cols.push('Self', 'Mgr review', 'Overall', 'Actions');

    return cols;

  }, [canSeeAdminReviewColumn]);



  const progressTableRows = useMemo(

    () =>

      filteredProgressRows.map((r) => {

        const label = (r.display_name || r.name || r.user_id).trim();

        const sup = (r.supervisor_display_name || '').trim();

        const overallBadge = r.both_done ? (

          <AppBadge variant="success">Complete</AppBadge>

        ) : r.missing_employee ? (

          <AppBadge variant="warning">Needs self</AppBadge>

        ) : (

          <AppBadge variant="warning">Needs supervisor</AppBadge>

        );

        const row: ReactNode[] = [

          <Link

            key={`${r.user_id}-emp`}

            to={`/users/${encodeURIComponent(r.user_id)}`}

            className="font-medium text-brand-red hover:underline"

          >

            {label}

          </Link>,

          r.supervisor_user_id ? (

            <Link

              key={`${r.user_id}-sup`}

              to={`/users/${encodeURIComponent(r.supervisor_user_id)}`}

              className="text-gray-800 hover:text-brand-red hover:underline"

            >

              {sup || 'Supervisor'}

            </Link>

          ) : (

            <span key={`${r.user_id}-sup`} className="text-gray-400">

              —

            </span>

          ),

          <span key={`${r.user_id}-due`} className="tabular-nums">

            {formatDueShort(r.self_due_date)}

          </span>,

        ];

        if (canSeeAdminReviewColumn) {

          row.push(

            <AppTooltip key={`${r.user_id}-admin`} content="Reserved for a future admin-only review step" wrap>

              <span className="text-gray-400">—</span>

            </AppTooltip>,

          );

        }

        row.push(

          <CompletionGlyph

            key={`${r.user_id}-self`}

            ok={r.employee_self_done}

            absent={r.has_self_assignment === false}

          />,

          <CompletionGlyph

            key={`${r.user_id}-mgr`}

            ok={r.supervisor_done}

            absent={r.has_supervisor_assignment === false}

          />,

          overallBadge,

          <AppButton

            key={`${r.user_id}-cmp`}

            type="button"

            size="sm"

            variant={r.both_done ? 'primary' : 'secondary'}

            onClick={() =>

              navigate(

                `/reviews/compare?cycle=${encodeURIComponent(id)}&reviewee=${encodeURIComponent(r.user_id)}`,

              )

            }

            title={

              r.both_done

                ? 'Open side-by-side comparison for this employee'

                : 'Open comparison — submitted answers only until both reviews are in'

            }

          >

            Compare

          </AppButton>,

        );

        return row;

      }),

    [filteredProgressRows, canSeeAdminReviewColumn, id, navigate],

  );



  const scopePeopleStats = useMemo(

    () => countEmployeesMatchingCycleScope(employees as ReviewParticipantEmp[], cycle?.participant_scope),

    [employees, cycle?.participant_scope],

  );



  const scopedEmployees = useMemo(

    () =>

      sortByLabel(

        employeesMatchingCycleScope(employees as ReviewParticipantEmp[], cycle?.participant_scope) as EmpRow[],

        (e) => (e.name || e.username || e.id).toString(),

      ),

    [employees, cycle?.participant_scope],

  );



  const scopedEmployeesModalRows = useMemo(() => {

    const q = scopeModalSearch.trim().toLowerCase();

    if (!q) return scopedEmployees;

    return scopedEmployees.filter((e) => {

      const blob = `${e.name || ''} ${e.username || ''} ${e.id} ${(e.department || '').toString()}`.toLowerCase();

      return blob.includes(q);

    });

  }, [scopedEmployees, scopeModalSearch]);



  const scopeParticipantTableRows = useMemo(

    () =>

      scopedEmployeesModalRows.map((e) => [

        <Link

          key={`${e.id}-name`}

          to={`/users/${encodeURIComponent(e.id)}`}

          className="font-medium text-brand-red hover:underline"

          onClick={() => setScopePeopleModalOpen(false)}

        >

          {e.name || e.username || e.id}

        </Link>,

        e.username || '—',

        employeeDivisionKeys(e)[0] || '—',

        (e.project_division_ids || []).length

          ? (e.project_division_ids || [])

              .map((pid) => projDivLabel.get(String(pid)) || String(pid))

              .join(', ')

          : '—',

      ]),

    [scopedEmployeesModalRows, projDivLabel],

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



  const tbdTableRows = useMemo(

    () => tbdRows.map((r) => [r.division, r.templateName]),

    [tbdRows],

  );



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







  if (!id) {

    return (

      <div className={uiCx('w-full min-w-0', uiSpacing.pageStack, 'min-h-full bg-gray-50')}>

        <AppCard bodyClassName={uiSpacing.cardPadding}>

          <AppEmptyState title="Invalid cycle." />

        </AppCard>

      </div>

    );

  }



  if (cycleLoading) {

    return (

      <div className={uiCx('w-full min-w-0', uiSpacing.pageStack, 'min-h-full bg-gray-50')}>

        <AppCard bodyClassName={uiCx(uiSpacing.cardPadding, 'text-center')}>

          <p className={uiTypography.helper}>Loading cycle…</p>

        </AppCard>

      </div>

    );

  }



  if (cycleError || !cycle) {

    return (

      <div className={uiCx('w-full min-w-0', uiSpacing.pageStack, 'min-h-full bg-gray-50')}>

        <AppCard bodyClassName={uiSpacing.sectionStack}>

          <p className="text-sm text-red-700">Could not load this review cycle.</p>

          <AppButton type="button" variant="ghost" onClick={() => navigate('/reviews/cycles')}>

            Back to cycles

          </AppButton>

        </AppCard>

      </div>

    );

  }



  return (

    <div className={uiCx('w-full min-w-0', uiSpacing.pageStack, 'min-h-full bg-gray-50')}>

      <AppPageHeader

        onBack={() => navigate('/reviews/cycles')}

        backLabel="Back to review cycles"

        icon={<Calendar className="h-4 w-4" />}

        title={cycle.name}

        subtitle="Review cycle"

      />



      <AppCard bodyClassName="!p-0">
        <div className={uiCx('flex flex-wrap items-center justify-between gap-3 px-3 py-2.5')}>
          <AppTabs
            tabs={[
              { key: 'progress', label: 'Team progress' },
              { key: 'details', label: 'Cycle details' },
            ]}
            value={cycleTab}
            onChange={(key) => setCycleTab(key as 'details' | 'progress')}
          />
          <AppBadge variant={cycleStatusVariant(cycle.status)} className="shrink-0">
            {statusLabel(cycle.status)}
          </AppBadge>
        </div>
      </AppCard>



      <AppCard bodyClassName={uiSpacing.cardPadding}>

        {cycleTab === 'details' && (

          <div className={uiSpacing.sectionStack}>

            {cycle.assignment_count === 0 && (

              <AppCard className="border-amber-200 bg-amber-50/90" bodyClassName={uiSpacing.sectionStack}>

                <AppSectionHeader

                  title="Next step: create review tasks"

                  description={

                    <>

                      Creating the cycle only saves settings (who participates, which form, dates). Nothing is sent to

                      employees until you create tasks: the system adds{' '}

                      <strong className="font-semibold">self-review</strong> rows and{' '}

                      <strong className="font-semibold">supervisor</strong> rows from the org chart, limited to this

                      cycle&apos;s participant scope. After that, the counts and tables below fill in and HR progress

                      reflects real forms.

                    </>

                  }

                />

                {scopePeopleStats.mode === 'explicit' && scopePeopleStats.emptyCriteria && (

                  <p className="text-sm text-red-800">

                    This cycle&apos;s explicit scope has no criteria — no one will get tasks until you edit the cycle or

                    fix scope in the database.

                  </p>

                )}

                {canManageReviewTasks && (

                  <AppButton

                    type="button"

                    disabled={generatingTasks}

                    loading={generatingTasks}

                    onClick={() => runGenerateReviewTasks()}

                  >

                    {generatingTasks ? 'Creating…' : 'Create review tasks now'}

                  </AppButton>

                )}

              </AppCard>

            )}



            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">

              <AppCard className={uiShadows.card} bodyClassName={uiSpacing.cardPadding}>

                <div className={uiCx(uiTypography.overline, 'mb-2')}>Participants</div>

                {scopeBlock.kind === 'all' ? (

                  <>

                    <p className={uiTypography.body}>

                      Entire company — everyone can receive self and manager tasks when you run task creation (still

                      filtered by the org chart).

                    </p>

                    <p className={uiCx(uiTypography.helper, 'mt-2')}>

                      ~{scopePeopleStats.directoryTotal} people listed in the employee directory (not everyone may

                      appear there).

                    </p>

                    {scopedEmployees.length > 0 ? (

                      <AppButton

                        type="button"

                        variant="secondary"

                        size="sm"

                        className="mt-3"

                        onClick={() => {

                          setScopeModalSearch('');

                          setScopePeopleModalOpen(true);

                        }}

                      >

                        View list ({scopedEmployees.length})

                      </AppButton>

                    ) : null}

                  </>

                ) : (

                  <>

                    <ul className={uiCx(uiTypography.body, 'list-inside list-disc space-y-1.5')}>

                      {scopeBlock.lines.map((line, i) => (

                        <li key={i}>{line}</li>

                      ))}

                    </ul>

                    {scopePeopleStats.mode === 'explicit' && !scopePeopleStats.emptyCriteria && (

                      <p className={uiCx(uiTypography.helper, 'mt-2')}>

                        <span className={uiCx('font-semibold tabular-nums', uiColors.textStrong)}>

                          {scopePeopleStats.count}

                        </span>{' '}

                        people in directory match this scope (same rule as the create wizard).

                      </p>

                    )}

                    {scopedEmployees.length > 0 ? (

                      <AppButton

                        type="button"

                        variant="secondary"

                        size="sm"

                        className="mt-3"

                        onClick={() => {

                          setScopeModalSearch('');

                          setScopePeopleModalOpen(true);

                        }}

                      >

                        View list ({scopedEmployees.length})

                      </AppButton>

                    ) : null}

                  </>

                )}

              </AppCard>



              <AppCard className={uiShadows.card} bodyClassName={uiSpacing.cardPadding}>

                <div className={uiCx(uiTypography.overline, 'mb-2')}>Default form</div>

                <p className={uiCx(uiTypography.body, 'font-medium', uiColors.textStrong)}>

                  {templateLabel(cycle.form_template_id)}

                </p>

                <p className={uiCx(uiTypography.helper, 'mt-1')}>

                  Used when no per-department mapping matches a person&apos;s HR labels (or as the cycle FK).

                </p>

              </AppCard>



              <AppCard className={uiShadows.card} bodyClassName={uiSpacing.cardPadding}>

                <div className={uiCx(uiTypography.overline, 'mb-2')}>Tasks</div>

                <p className={uiCx('text-2xl font-bold tabular-nums', uiColors.textStrong)}>

                  {cycle.assignment_count}

                </p>

                <p className={uiCx(uiTypography.helper, 'mt-1')}>

                  Self: <span className="font-medium">{cycle.assignment_self_rows}</span>

                  {' · '}

                  Supervisor: <span className="font-medium">{cycle.assignment_supervisor_rows}</span>

                </p>

                <p className={uiCx(uiTypography.helper, 'mt-2 leading-snug')}>

                  Each row is one form someone must complete. Zero until you use &quot;Create review tasks&quot;.

                </p>

                {Object.keys(cycle.assignments_by_status || {}).length > 0 && (

                  <div className={uiCx(uiLayout.actionsRow, 'mt-2 flex-wrap')}>

                    {Object.entries(cycle.assignments_by_status).map(([st, n]) => (

                      <AppBadge key={st} variant="neutral">

                        {st}: <span className="ml-0.5 font-semibold tabular-nums">{n}</span>

                      </AppBadge>

                    ))}

                  </div>

                )}

              </AppCard>

            </div>



            {tbdRows.length > 0 && (

              <AppCard bodyClassName={uiSpacing.sectionStack}>

                <AppSectionHeader title="Form by department label" />

                <AppTable

                  columns={['HR / profile label', 'Employee-review template']}

                  rows={tbdTableRows}

                />

              </AppCard>

            )}



            {canDeleteCycle && cycle && (

              <AppCard className="border-red-200 bg-red-50" bodyClassName={uiSpacing.sectionStack}>

                <AppSectionHeader

                  title="Danger Zone"

                  description="Deleting this review cycle permanently removes it and all related assignments and answers. This cannot be undone."

                />

                <AppButton

                  type="button"

                  variant="danger"

                  disabled={deleting}

                  loading={deleting}

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

                >

                  {deleting ? 'Deleting…' : 'Delete review cycle'}

                </AppButton>

              </AppCard>

            )}

          </div>

        )}



        {cycleTab === 'progress' && (

          <div className={uiSpacing.sectionStack}>

            <AppCard className="bg-gradient-to-br from-gray-50/90 to-white" bodyClassName={uiSpacing.cardPadding}>

              <AppSectionHeader

                title="Who has finished?"

                description={

                  <>

                    One row per employee in this cycle. Self-review is their own form; supervisor review is the manager

                    form about them.

                    {canSeeAdminReviewColumn ? (

                      <>

                        {' '}

                        The <span className="font-medium text-gray-800">Admin</span> column (HR/admin only) is reserved

                        for a future third step.

                      </>

                    ) : null}

                  </>

                }

                action={

                  hrSummary && hrSummary.both > 0 ? (

                    <AppButton

                      type="button"

                      variant="secondary"

                      size="sm"

                      leftIcon={<BarChart3 className="h-4 w-4" />}

                      onClick={() => navigate(`/reviews/compare?cycle=${encodeURIComponent(id)}`)}

                    >

                      Compare cycle

                    </AppButton>

                  ) : undefined

                }

              />

            </AppCard>



            {hrSummary ? (

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">

                <AppCard className={uiShadows.card} bodyClassName={uiSpacing.cardPadding}>

                  <div className={uiTypography.overline}>In cycle</div>

                  <div className={uiCx('mt-1 text-2xl font-bold tabular-nums', uiColors.textStrong)}>

                    {hrSummary.total}

                  </div>

                  <div className={uiTypography.helper}>reviewees with tasks</div>

                </AppCard>

                <AppCard className="border-emerald-200/80 bg-emerald-50/60" bodyClassName={uiSpacing.cardPadding}>

                  <div className={uiCx(uiTypography.overline, 'text-emerald-800')}>Both done</div>

                  <div className="mt-1 text-2xl font-bold tabular-nums text-emerald-900">{hrSummary.both}</div>

                  <div className="text-xs text-emerald-800/80">self + supervisor submitted</div>

                </AppCard>

                <AppCard className="border-amber-200/80 bg-amber-50/60" bodyClassName={uiSpacing.cardPadding}>

                  <div className={uiCx(uiTypography.overline, 'text-amber-900')}>Needs self</div>

                  <div className="mt-1 text-2xl font-bold tabular-nums text-amber-950">{hrSummary.missE}</div>

                  <div className="text-xs text-amber-900/80">employee review open</div>

                </AppCard>

                <AppCard className="border-amber-200/80 bg-amber-50/60" bodyClassName={uiSpacing.cardPadding}>

                  <div className={uiCx(uiTypography.overline, 'text-amber-900')}>Needs supervisor</div>

                  <div className="mt-1 text-2xl font-bold tabular-nums text-amber-950">{hrSummary.missS}</div>

                  <div className="text-xs text-amber-900/80">manager review open</div>

                </AppCard>

              </div>

            ) : (

              <AppEmptyState

                title="No people in the progress list yet"

                description={

                  <>

                    {cycle.assignment_count === 0 ? (

                      <>

                        Use <span className="font-semibold text-gray-900">Create review tasks</span> on the Cycle details

                        tab so assignments exist. People in this cycle&apos;s scope appear here even before tasks are

                        created — refresh after saving the cycle if the list is still empty.

                      </>

                    ) : (

                      <>No rows match the current filter or search.</>

                    )}

                  </>

                }

              />

            )}



            {hrSummary ? (

              <>

                <AppCard bodyClassName="!p-0">
                  <div className="flex flex-col gap-3 px-3 py-2.5 lg:flex-row lg:items-center">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={uiCx(uiTypography.overline, 'shrink-0 leading-none')}>Show:</span>
                      <div className="flex flex-wrap items-center gap-2">
                        {progressFilterSegments.map((segment) => (
                          <button
                            key={segment.key}
                            type="button"
                            onClick={segment.onClick}
                            className={getAppTabButtonClassName(segment.active)}
                            aria-pressed={segment.active}
                          >
                            <span>{segment.label}</span>
                            <AppTabCountBadge count={segment.count} isActive={segment.active} />
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="flex min-w-0 flex-1 items-center lg:min-w-[12rem]">
                      <AppInput
                        id="progress-search"
                        className="w-full"
                        placeholder="Search employee or supervisor…"
                        value={progressSearch}
                        onChange={(e) => setProgressSearch(e.target.value)}
                        leftIcon={<Search className="h-4 w-4" />}
                        aria-label="Search by name"
                      />
                    </div>
                  </div>
                </AppCard>



                <AppTable

                  className={uiShadows.card}

                  columns={progressColumns}

                  rows={progressTableRows}

                  emptyState="No rows match this filter or search."

                />

              </>

            ) : null}

          </div>

        )}

      </AppCard>



      <AppModal

        open={scopePeopleModalOpen}

        onClose={() => setScopePeopleModalOpen(false)}

        title="People in this cycle"

        description={

          <>

            <span className="tabular-nums">{scopedEmployees.length}</span> people in scope

          </>

        }

        size="lg"

        dialogClassName="!max-w-3xl"

        overlayClassName={uiModalLayer.stacked}

        bodyClassName={uiCx(uiSpacing.cardPadding, uiSpacing.sectionStack, 'max-h-[min(68vh,40rem)] overflow-y-auto')}

        footer={

          <div className={uiCx(uiLayout.actionsRow, 'justify-end')}>

            <AppButton variant="secondary" onClick={() => setScopePeopleModalOpen(false)}>

              Close

            </AppButton>

          </div>

        }

      >

        <AppInput

          placeholder="Filter…"

          value={scopeModalSearch}

          onChange={(e) => setScopeModalSearch(e.target.value)}

          leftIcon={<Search className="h-4 w-4" />}

          aria-label="Filter people in scope"

        />

        <AppTable

          columns={['Name', 'Username', 'Primary HR', 'Project div.']}

          rows={scopeParticipantTableRows}

          emptyState="No matches."

        />

      </AppModal>

    </div>

  );

}


