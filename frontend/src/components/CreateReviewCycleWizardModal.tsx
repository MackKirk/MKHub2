import { Fragment, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, Search, Users } from 'lucide-react';
import { api } from '@/lib/api';
import { mapEmployeeToAppUserSelect } from '@/lib/clientUi';
import { sortByLabel } from '@/lib/sortOptions';
import {
  employeeDivisionKeys,
  employeeMatchesParticipantScope,
  type ReviewParticipantEmp,
} from '@/lib/reviewParticipantScope';
import toast from 'react-hot-toast';
import {
  AppBadge,
  AppButton,
  AppCard,
  AppCheckbox,
  AppCombobox,
  AppDatePicker,
  AppFormModal,
  AppInput,
  AppModal,
  AppMultiSelect,
  AppSectionHeader,
  AppTable,
  AppUserSelect,
  FORM_MODAL_WIDE_DIALOG_COLLAPSED,
  FORM_MODAL_WIDE_DIALOG_EXPANDED,
  uiBorders,
  uiColors,
  uiCx,
  uiLayout,
  uiModalLayer,
  uiRadius,
  uiSpacing,
  uiTypography,
} from '@/components/ui';

type DivisionOption = { id: string; label: string };

type EmpRow = ReviewParticipantEmp & {
  name?: string;
  username?: string;
};

const NO_DEPT_LABEL = '(no department)';

const FIELD_HINTS = {
  cycleName: 'Cycle name\n\nShort title for this review period (e.g. H1 Review). Shown in the cycles list and on assignments.',
  periodStart: 'Start date\n\nOptional beginning of the review period. Used for reporting and cycle context.',
  periodEnd: 'End date\n\nOptional end of the review period. Should be on or after the start date when both are set.',
  activateNow:
    'Activate immediately\n\nWhen enabled, the cycle is active as soon as it is created. When off, it stays in draft until you activate it later.',
  scopePeople:
    'People\n\nAdd specific employees to the cycle. Combined with HR departments and project divisions using OR — any match includes someone. At least one scope rule is required in custom mode.',
  scopeDepts:
    'HR departments\n\nInclude everyone whose HR department label matches. Labels come from Settings. At least one scope rule is required in custom mode.',
  scopeProj:
    'Project divisions\n\nInclude everyone assigned to these project divisions on their employee profile. At least one scope rule is required in custom mode.',
  deptTemplate:
    'Form template\n\nActive employee-review template for everyone with this HR department label in the cycle. Required for each label that appears in scope.',
} as const;

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
    setTemplateByDepartment([]);
    setScopePeopleModalOpen(false);
    setScopeModalSearch('');
    setSubmitting(false);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || !scopePeopleModalOpen) return;
      e.stopImmediatePropagation();
      setScopePeopleModalOpen(false);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, scopePeopleModalOpen]);

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

  const divisionMultiOptions = useMemo(
    () => divisionOptions.map((d) => ({ value: d.id, label: d.label })),
    [divisionOptions],
  );

  const projectDivisionMultiOptions = useMemo(
    () => projectDivisionOptions.map((d) => ({ value: d.id, label: d.label })),
    [projectDivisionOptions],
  );

  const templateComboboxOptions = useMemo(
    () =>
      (templates as any[]).map((t: any) => ({
        value: String(t.id),
        label: `${t.name}${(t.version_label || '').trim() ? ` — ${(t.version_label || '').trim()}` : ''}`,
      })),
    [templates],
  );

  const userSelectEmployees = useMemo(
    () =>
      (employees as EmpRow[]).map((e) => mapEmployeeToAppUserSelect(e as Record<string, unknown>)),
    [employees],
  );

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

  const scopeTableRows = useMemo(
    () =>
      scopedEmployeesModalRows.map((e) => [
        <Link
          key={`${e.id}-name`}
          to={`/users/${encodeURIComponent(e.id)}`}
          className="font-medium text-brand-red hover:underline"
          onClick={() => {
            setScopePeopleModalOpen(false);
            onClose();
          }}
        >
          {e.name || e.username || e.id}
        </Link>,
        e.username || '—',
        primaryHrLabel(e),
        <span key={`${e.id}-div`} className="line-clamp-2 max-w-[200px]" title={projectDivLabelsLine(e)}>
          {projectDivLabelsLine(e)}
        </span>,
      ]),
    [scopedEmployeesModalRows, onClose],
  );

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

  const stepPillClass = (n: number) =>
    uiCx(
      'rounded-full px-2 py-1 text-[10px] font-medium',
      step === n ? 'bg-gray-900 text-white' : 'bg-gray-200 text-gray-600',
    );

  const stepIndicators = (
    <div className={uiCx(uiLayout.actionsRow, uiTypography.helper, 'text-[10px] font-medium')}>
      {[1, 2, 3, 4].map((n, index) => (
        <Fragment key={n}>
          {index > 0 ? <span className="text-gray-400">→</span> : null}
          <span className={stepPillClass(n)}>Step {n}</span>
        </Fragment>
      ))}
    </div>
  );

  const scopeCardClass = (selected: boolean) =>
    uiCx(
      'text-left border-2 p-4 transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2',
      uiRadius.card,
      selected
        ? 'border-gray-900 bg-gradient-to-br from-gray-50 to-white shadow-sm'
        : uiCx(uiBorders.subtle, uiColors.surface, 'hover:border-gray-300 hover:bg-gray-50/60'),
    );

  const modalFooter = (
    <div className={uiCx('flex w-full flex-wrap items-center justify-between gap-3')}>
      <div className={uiTypography.helper}>
        Step {step} of 4 · {STEP_LABELS[step - 1]}
      </div>
      <div className={uiCx(uiLayout.actionsRow)}>
        <AppButton variant="secondary" onClick={onClose}>
          Cancel
        </AppButton>
        {step > 1 ? (
          <AppButton variant="secondary" onClick={goBack} disabled={submitting}>
            Back
          </AppButton>
        ) : null}
        {step < 4 ? (
          <AppButton
            onClick={goNext}
            disabled={
              submitting ||
              (step === 1 && !step1Valid) ||
              (step === 2 && !step2Valid) ||
              (step === 3 && !step3Valid)
            }
          >
            Next
          </AppButton>
        ) : (
          <AppButton disabled={submitting || !primaryFormTemplateId || !step3Valid} onClick={submit}>
            {submitting ? 'Creating…' : 'Create cycle'}
          </AppButton>
        )}
      </div>
    </div>
  );

  return (
    <>
      <AppFormModal
        open={open}
        onClose={onClose}
        formWidth="wide"
        dialogClassName={FORM_MODAL_WIDE_DIALOG_COLLAPSED}
        dialogClassNameExpanded={FORM_MODAL_WIDE_DIALOG_EXPANDED}
        title="New review cycle"
        description={STEP_SUBTITLES[step - 1]}
        headerExtra={stepIndicators}
        quickInfo={
          <>
            <p>Four steps: cycle details, participants, form templates by department, then review and create.</p>
            <p>Custom scope combines people, HR departments, and project divisions with OR logic.</p>
            <p>Each HR department label in scope needs its own employee-review template in step 3.</p>
          </>
        }
        footer={modalFooter}
      >
        {step === 1 && (
          <div className={uiSpacing.sectionStack}>
            <AppInput
              label="Cycle name *"
              fieldHint={FIELD_HINTS.cycleName}
              value={cycleName}
              onChange={(e) => setCycleName(e.target.value)}
            />
            <div className="grid grid-cols-2 gap-3">
              <AppDatePicker
                label="Start"
                fieldHint={FIELD_HINTS.periodStart}
                value={periodStart}
                onChange={(e) => setPeriodStart(e.target.value)}
              />
              <AppDatePicker
                label="End"
                fieldHint={FIELD_HINTS.periodEnd}
                value={periodEnd}
                onChange={(e) => setPeriodEnd(e.target.value)}
              />
            </div>
            <AppCard bodyClassName={uiCx(uiSpacing.cardPadding, uiTypography.helper, 'leading-relaxed text-gray-600')}>
              Employee-review forms are chosen in{' '}
              <span className={uiColors.textStrong}>step 3</span>, one template per HR department label that appears in
              this cycle. Manage definitions in{' '}
              <Link to="/reviews/form-templates" className="font-medium text-brand-red hover:underline">
                Form templates
              </Link>
              .
            </AppCard>
            <AppCheckbox
              label="Activate immediately"
              fieldHint={FIELD_HINTS.activateNow}
              checked={activateNow}
              onChange={setActivateNow}
            />
          </div>
        )}

        {step === 2 && (
          <div className={uiSpacing.sectionStack}>
            <AppSectionHeader
              title="Who participates"
              description="Choose whether the cycle covers everyone or a custom group. For custom scope, criteria combine with OR (any match includes someone). HR departments follow Settings; project divisions come from each employee profile."
            />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Participant scope">
              <button
                type="button"
                role="radio"
                aria-checked={scopeMode === 'all'}
                onClick={() => setScopeMode('all')}
                className={scopeCardClass(scopeMode === 'all')}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={uiCx(
                      'flex h-10 w-10 shrink-0 items-center justify-center',
                      uiRadius.control,
                      scopeMode === 'all' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600',
                    )}
                  >
                    <Building2 className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1 pt-0.5">
                    <div className="flex items-center gap-2">
                      <span className={uiTypography.sectionTitle}>Entire company</span>
                      {scopeMode === 'all' ? <AppBadge variant="neutral">Selected</AppBadge> : null}
                    </div>
                    <p className={uiCx('mt-1 leading-snug', uiTypography.helper)}>
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
                className={scopeCardClass(scopeMode === 'explicit')}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={uiCx(
                      'flex h-10 w-10 shrink-0 items-center justify-center',
                      uiRadius.control,
                      scopeMode === 'explicit' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600',
                    )}
                  >
                    <Users className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1 pt-0.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={uiTypography.sectionTitle}>Custom scope</span>
                      {scopeMode === 'explicit' ? <AppBadge variant="neutral">Selected</AppBadge> : null}
                    </div>
                    <p className={uiCx('mt-1 leading-snug', uiTypography.helper)}>
                      Limit to selected people, HR departments, and/or project divisions. Refine with the lists below.
                    </p>
                  </div>
                </div>
              </button>
            </div>
            {scopeMode === 'explicit' ? (
              <AppCard bodyClassName={uiSpacing.sectionStack}>
                <AppSectionHeader title="Scope rules" />
                <AppUserSelect
                  mode="multiple"
                  label={
                    <>
                      People
                      {scopeMode === 'explicit' ? <span className="text-brand-red"> *</span> : null}
                    </>
                  }
                  fieldHint={FIELD_HINTS.scopePeople}
                  users={userSelectEmployees}
                  value={participantUserIds}
                  onChange={setParticipantUserIds}
                  placeholder="Search by name…"
                  showSelectedChips
                />
                <AppMultiSelect
                  searchable
                  label={
                    <>
                      HR departments
                      {scopeMode === 'explicit' ? <span className="text-brand-red"> *</span> : null}
                    </>
                  }
                  fieldHint={FIELD_HINTS.scopeDepts}
                  value={participantDeptIds}
                  onChange={setParticipantDeptIds}
                  options={divisionMultiOptions}
                  placeholder="Search departments…"
                  showSelectedChips
                />
                <AppMultiSelect
                  searchable
                  label={
                    <>
                      Project divisions
                      {scopeMode === 'explicit' ? <span className="text-brand-red"> *</span> : null}
                    </>
                  }
                  fieldHint={FIELD_HINTS.scopeProj}
                  value={participantProjIds}
                  onChange={setParticipantProjIds}
                  options={projectDivisionMultiOptions}
                  placeholder="Search divisions…"
                  showSelectedChips
                />
              </AppCard>
            ) : null}
            <div className={uiCx('flex flex-wrap items-center gap-3', uiTypography.helper, 'text-gray-700')}>
              <span>
                <span className={uiColors.textStrong}>{scopedEmployees.length}</span> people in scope
                {scopeMode === 'all' ? (
                  <span className="text-gray-500">
                    {' '}
                    (of <span className="tabular-nums">{employees.length}</span> in directory)
                  </span>
                ) : null}
              </span>
              {divisionEmployeeCounts.length > 0 ? (
                <span className="text-gray-500">· {divisionEmployeeCounts.length} primary-dept. groups</span>
              ) : null}
              <AppButton
                type="button"
                variant="secondary"
                size="sm"
                disabled={scopedEmployees.length === 0}
                onClick={() => {
                  setScopeModalSearch('');
                  setScopePeopleModalOpen(true);
                }}
              >
                View list
              </AppButton>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className={uiSpacing.sectionStack}>
            <p className={uiCx(uiTypography.helper, 'leading-relaxed')}>
              Each label below appears on at least one person in this cycle (from HR departments / profile). Choose an{' '}
              <span className={uiColors.textStrong}>active</span> employee-review template for every row. For people
              with several labels, the first matching label in their profile order wins.
            </p>
            {departmentsInScope.length === 0 ? (
              <p className="text-sm text-amber-700">No one in scope yet — go back and fix step 2.</p>
            ) : (
              <div className={uiSpacing.sectionStack}>
                {departmentsInScope.map((label) => {
                  const row = templateByDepartment.find((r) => r.division_key === label);
                  const tid = row?.template_id || '';
                  const n = departmentHeadcount.get(label) ?? 0;
                  return (
                    <AppCard
                      key={label}
                      bodyClassName={uiCx(uiLayout.actionsRow, 'flex-wrap items-center gap-3 bg-gray-50/60')}
                    >
                      <div className="min-w-[160px] flex-1">
                        <div className={uiTypography.sectionTitle}>{label}</div>
                        <div className={uiTypography.helper}>
                          {n} {n === 1 ? 'person' : 'people'} with this label
                        </div>
                      </div>
                      <div className="min-w-[200px] flex-1">
                        <AppCombobox
                          label="Form template *"
                          fieldHint={FIELD_HINTS.deptTemplate}
                          value={tid}
                          onChange={(v) => {
                            setTemplateByDepartment((prev) =>
                              departmentsInScope.map((lab) => {
                                if (lab === label) return { division_key: lab, template_id: v };
                                const ex = prev.find((r) => r.division_key === lab);
                                return ex || { division_key: lab, template_id: '' };
                              }),
                            );
                          }}
                          options={templateComboboxOptions}
                          placeholder="Select template…"
                          leftIcon={<Search className="h-4 w-4" />}
                          triggerClassName={!tid ? 'border-red-300' : undefined}
                        />
                      </div>
                    </AppCard>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {step === 4 && coveragePreview ? (
          <div className={uiSpacing.sectionStack}>
            <AppCard bodyClassName={uiSpacing.sectionStack}>
              <div className={uiTypography.sectionTitle}>Template distribution (preview)</div>
              <ul className={uiCx(uiSpacing.sectionStack, uiTypography.helper, 'text-gray-600')}>
                {Object.entries(coveragePreview.byTemplate).map(([tid, n]) => (
                  <li key={tid}>
                    <span className={uiColors.textStrong}>{n}</span> → {templateLabel(tid)}
                  </li>
                ))}
              </ul>
              {coveragePreview.unresolved.length > 0 ? (
                <p className="text-xs text-red-700">
                  Could not resolve: {coveragePreview.unresolved.slice(0, 8).join('; ')}
                  {coveragePreview.unresolved.length > 8
                    ? ` … +${coveragePreview.unresolved.length - 8} more`
                    : ''}
                </p>
              ) : null}
            </AppCard>
            <div className={uiTypography.helper}>
              <span className={uiColors.textStrong}>{scopedEmployees.length}</span> reviewees ·{' '}
              <span className={activateNow ? 'font-medium text-green-700' : 'font-medium text-amber-700'}>
                {activateNow ? 'Active' : 'Draft'}
              </span>{' '}
              · {(cycleName || '').trim() || 'Untitled'}
            </div>
          </div>
        ) : null}
        {step === 4 && !coveragePreview ? (
          <p className="text-sm text-amber-700">
            Complete step 3 with a template for each department in scope to see the preview.
          </p>
        ) : null}
      </AppFormModal>

      <AppModal
        open={scopePeopleModalOpen}
        onClose={() => setScopePeopleModalOpen(false)}
        title="People in scope"
        description={
          <>
            <span className="tabular-nums">{scopedEmployees.length}</span> people
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
          rows={scopeTableRows}
          emptyState="No matches."
        />
      </AppModal>
    </>
  );
}
