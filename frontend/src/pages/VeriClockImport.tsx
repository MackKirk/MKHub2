import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Clock } from 'lucide-react';
import { api } from '@/lib/api';
import { useConfirm } from '@/components/ConfirmProvider';
import { mapEmployeeToAppUserSelect } from '@/lib/clientUi';
import { EMPLOYEES_DIRECTORY_LIMIT, fetchEmployeesDirectory } from '@/lib/employeesQuery';
import { getUserDisplayName } from '@/lib/userDisplay';
import { isPredefinedJobId } from '@/constants/predefinedJobs';
import { JobSearchCombobox } from '@/components/JobSearchCombobox';
import {
  AppBadge,
  AppButton,
  AppCard,
  AppCheckbox,
  AppEmptyState,
  AppInput,
  AppPageHeader,
  AppQuickFilterRow,
  AppTabs,
  AppUserSelect,
  uiCx,
  uiSpacing,
  uiTypography,
} from '@/components/ui';

type PersonRow = {
  vericlock_employee_id: string;
  vericlock_name: string;
  first_name: string;
  last_name: string;
  group: string;
  row_count: number;
  hub_user_id: string | null;
  hub_name: string | null;
  skip: boolean;
  match_source: string;
};

type JobRow = {
  vericlock_job_code: string;
  vericlock_label: string;
  row_count: number;
  skip: boolean;
  hub_project_id: string | null;
  hub_project_label: string | null;
  predefined_job_code: string | null;
  match_source: string;
  kind?: string | null;
};

type Plan = {
  will_import: number;
  will_update?: number;
  created?: number;
  updated?: number;
  already_imported: number;
  skipped_person: number;
  skipped_job?: number;
  needs_person: number;
  unmatched_job: number;
  missing_time: number;
  unmatched_jobs: { label: string; count: number }[];
};

type PreviewResponse = {
  row_count: number;
  people: PersonRow[];
  jobs?: JobRow[];
  counts: { people: number; mapped: number; suggested: number; skipped: number; needs_match: number };
  job_counts?: { jobs: number; mapped: number; suggested: number; skipped: number; needs_match: number };
  plan: Plan;
};

type FilterKey = 'needs' | 'suggested' | 'mapped' | 'skipped' | 'all';
type MatchTab = 'vericlock' | 'hub-unlinked' | 'hub-duplicate';

function matchBadge(row: PersonRow) {
  if (row.skip) return { label: 'Skip', variant: 'neutral' as const };
  if (row.match_source === 'saved') return { label: 'Saved', variant: 'success' as const };
  if (row.match_source === 'exact') return { label: 'Auto', variant: 'info' as const };
  if (row.match_source === 'reversed') return { label: 'Check order', variant: 'warning' as const };
  if (row.hub_user_id) return { label: 'Picked', variant: 'success' as const };
  return { label: 'Needs match', variant: 'danger' as const };
}

function jobMatchBadge(row: JobRow) {
  if (row.skip) return { label: 'Skip', variant: 'neutral' as const };
  if (row.match_source === 'saved') return { label: 'Saved', variant: 'success' as const };
  if (row.match_source === 'auto') return { label: 'Auto', variant: 'info' as const };
  if (row.hub_project_id || row.predefined_job_code) return { label: 'Picked', variant: 'success' as const };
  return { label: 'Needs match', variant: 'danger' as const };
}

function jobPickerValue(row: JobRow) {
  if (row.skip) return '';
  return row.predefined_job_code || row.hub_project_id || '';
}

function jobMapsPayload(jobs: JobRow[]) {
  return jobs.map((row) => ({
    vericlock_job_code: row.vericlock_job_code,
    hub_project_id: row.skip ? null : row.hub_project_id,
    predefined_job_code: row.skip ? null : row.predefined_job_code,
    skip: row.skip,
    vericlock_label: row.vericlock_label,
  }));
}

export default function VeriClockImport() {
  const navigate = useNavigate();
  const confirm = useConfirm();
  const [csvText, setCsvText] = useState('');
  const [fileName, setFileName] = useState('');
  const [hoursOnlyDate, setHoursOnlyDate] = useState('');
  const [allowUnmatchedJobs, setAllowUnmatchedJobs] = useState(false);
  const [overwriteExisting, setOverwriteExisting] = useState(false);
  const [people, setPeople] = useState<PersonRow[]>([]);
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [rowCount, setRowCount] = useState(0);
  const [filter, setFilter] = useState<FilterKey>('needs');
  const [jobFilter, setJobFilter] = useState<FilterKey>('needs');
  const [matchTab, setMatchTab] = useState<MatchTab>('vericlock');
  const [includeInactiveHub, setIncludeInactiveHub] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);

  const { data: employees = [] } = useQuery({
    queryKey: ['employees', 'directory', { limit: EMPLOYEES_DIRECTORY_LIMIT, activeOnly: false, sort: 'name' }],
    queryFn: () => fetchEmployeesDirectory({ limit: EMPLOYEES_DIRECTORY_LIMIT, activeOnly: false, sort: 'name' }),
  });
  const userOptions = useMemo(
    () => (Array.isArray(employees) ? employees : []).map((e) => mapEmployeeToAppUserSelect(e)),
    [employees],
  );

  const counts = useMemo(() => {
    const needs = people.filter((p) => !p.skip && !p.hub_user_id).length;
    const suggested = people.filter((p) => !p.skip && !!p.hub_user_id && (p.match_source === 'exact' || p.match_source === 'reversed')).length;
    const mapped = people.filter((p) => !p.skip && !!p.hub_user_id).length;
    const skipped = people.filter((p) => p.skip).length;
    return { needs, suggested, mapped, skipped, all: people.length };
  }, [people]);

  const jobCounts = useMemo(() => {
    const needs = jobs.filter((j) => !j.skip && !j.hub_project_id && !j.predefined_job_code).length;
    const suggested = jobs.filter((j) => !j.skip && j.match_source === 'auto').length;
    const mapped = jobs.filter((j) => !j.skip && (!!j.hub_project_id || !!j.predefined_job_code)).length;
    const skipped = jobs.filter((j) => j.skip).length;
    return { needs, suggested, mapped, skipped, all: jobs.length };
  }, [jobs]);

  const visibleJobs = useMemo(() => {
    if (jobFilter === 'needs') return jobs.filter((j) => !j.skip && !j.hub_project_id && !j.predefined_job_code);
    if (jobFilter === 'suggested') return jobs.filter((j) => !j.skip && j.match_source === 'auto');
    if (jobFilter === 'mapped') return jobs.filter((j) => !j.skip && (!!j.hub_project_id || !!j.predefined_job_code));
    if (jobFilter === 'skipped') return jobs.filter((j) => j.skip);
    return jobs;
  }, [jobFilter, jobs]);

  const linkedHubIds = useMemo(() => {
    const ids = new Set<string>();
    for (const row of people) {
      if (!row.skip && row.hub_user_id) ids.add(row.hub_user_id);
    }
    return ids;
  }, [people]);

  const duplicateHubIds = useMemo(() => {
    const tally = new Map<string, number>();
    for (const row of people) {
      if (row.skip || !row.hub_user_id) continue;
      tally.set(row.hub_user_id, (tally.get(row.hub_user_id) || 0) + 1);
    }
    return new Set([...tally.entries()].filter(([, n]) => n > 1).map(([id]) => id));
  }, [people]);

  const duplicateGroups = useMemo(() => {
    const groups = new Map<string, PersonRow[]>();
    for (const row of people) {
      if (row.skip || !row.hub_user_id || !duplicateHubIds.has(row.hub_user_id)) continue;
      const list = groups.get(row.hub_user_id) || [];
      list.push(row);
      groups.set(row.hub_user_id, list);
    }
    return [...groups.entries()]
      .map(([hubUserId, rows]) => {
        const hub = userOptions.find((u) => u.id === hubUserId);
        return {
          hubUserId,
          hubName: getUserDisplayName(hub) || rows[0]?.hub_name || hubUserId,
          rows,
        };
      })
      .sort((a, b) => a.hubName.localeCompare(b.hubName, undefined, { sensitivity: 'base' }));
  }, [duplicateHubIds, people, userOptions]);

  const unlinkedHub = useMemo(() => {
    const employeesList = Array.isArray(employees) ? employees : [];
    return employeesList
      .filter((emp) => {
        const id = String(emp?.id || '');
        if (!id || linkedHubIds.has(id)) return false;
        if (!includeInactiveHub && emp?.is_active === false) return false;
        return true;
      })
      .map((emp) => mapEmployeeToAppUserSelect(emp as Record<string, unknown>))
      .sort((a, b) =>
        getUserDisplayName(a).localeCompare(getUserDisplayName(b), undefined, { sensitivity: 'base' }),
      );
  }, [employees, includeInactiveHub, linkedHubIds]);

  const visible = useMemo(() => {
    if (filter === 'needs') return people.filter((p) => !p.skip && !p.hub_user_id);
    if (filter === 'suggested') return people.filter((p) => !p.skip && (p.match_source === 'exact' || p.match_source === 'reversed'));
    if (filter === 'mapped') return people.filter((p) => !p.skip && !!p.hub_user_id);
    if (filter === 'skipped') return people.filter((p) => p.skip);
    return people;
  }, [filter, people]);

  async function runPreview(
    text = csvText,
    opts?: { overwriteExisting?: boolean; allowUnmatchedJobs?: boolean; hoursOnlyDate?: string },
  ) {
    if (!text.trim()) {
      toast.error('Choose a VeriClock Activity Report CSV first');
      return;
    }
    setPreviewing(true);
    try {
      const data = await api<PreviewResponse>('POST', '/integrations/vericlock/preview', {
        csv_text: text,
        hours_only_date: (opts?.hoursOnlyDate ?? hoursOnlyDate) || null,
        allow_unmatched_jobs: opts?.allowUnmatchedJobs ?? allowUnmatchedJobs,
        overwrite_existing: opts?.overwriteExisting ?? overwriteExisting,
      });
      setPeople(data.people || []);
      setJobs(data.jobs || []);
      setPlan(data.plan || null);
      setRowCount(data.row_count || 0);
      if ((data.counts?.needs_match || 0) > 0) setFilter('needs');
      if ((data.job_counts?.needs_match || 0) > 0) setJobFilter('needs');
    } catch (err: any) {
      toast.error(err?.message || 'Could not read the CSV');
    } finally {
      setPreviewing(false);
    }
  }

  async function onPickFile(file?: File | null) {
    if (!file) return;
    const text = await file.text();
    setFileName(file.name);
    setCsvText(text);
    await runPreview(text);
  }

  function patchPerson(id: string, patch: Partial<PersonRow>) {
    setPeople((prev) => prev.map((row) => (row.vericlock_employee_id === id ? { ...row, ...patch } : row)));
  }

  function patchJob(code: string, patch: Partial<JobRow>) {
    setJobs((prev) => prev.map((row) => (row.vericlock_job_code === code ? { ...row, ...patch } : row)));
  }

  async function saveMap() {
    if (!people.length) return;
    setSaving(true);
    try {
      await api('PUT', '/integrations/vericlock/people-map', {
        maps: people.map((row) => ({
          vericlock_employee_id: row.vericlock_employee_id,
          hub_user_id: row.skip ? null : row.hub_user_id,
          skip: row.skip,
          vericlock_name: row.vericlock_name,
          vericlock_group: row.group,
        })),
      });
      toast.success('Name map saved — it will be reused on the next import');
      await runPreview();
    } catch (err: any) {
      toast.error(err?.message || 'Could not save the map');
    } finally {
      setSaving(false);
    }
  }

  async function saveJobMap() {
    if (!jobs.length) return;
    setSaving(true);
    try {
      await api('PUT', '/integrations/vericlock/job-map', { maps: jobMapsPayload(jobs) });
      toast.success('Job map saved — it will be reused on the next import');
      await runPreview();
    } catch (err: any) {
      toast.error(err?.message || 'Could not save the job map');
    } finally {
      setSaving(false);
    }
  }

  async function runImport() {
    if (counts.needs > 0) {
      toast.error('Match or skip every VeriClock name before importing');
      setFilter('needs');
      return;
    }
    if (jobCounts.needs > 0 && !allowUnmatchedJobs) {
      toast.error('Match or skip every VeriClock job, or check unmatched jobs as No Project');
      setJobFilter('needs');
      return;
    }
    const ok = await confirm({
      title: overwriteExisting ? 'Overwrite VeriClock hours?' : 'Import VeriClock hours?',
      message: overwriteExisting
        ? 'Existing VeriClock punches with the same employee, clock-in, and job will be replaced with this CSV (times, hours, and job map). Hub-created punches are not changed. Still In Sage — the companion will not send them again.'
        : jobCounts.needs > 0 && allowUnmatchedJobs
          ? `${jobCounts.needs} job(s) have no Hub match and will import as No Project. Rows still go into Attendance as In Sage; the companion will not send them again.`
          : duplicateGroups.length > 0
            ? `${duplicateGroups.length} Hub employee(s) are linked to more than one VeriClock ID. Rows still go into Attendance as In Sage; the companion will not send them again.`
            : 'Rows go into Attendance as In Sage. The companion will not send them to Sage again. Same punches are skipped unless you turn on overwrite.',
      confirmText: overwriteExisting ? 'Overwrite' : 'Import',
    });
    if (ok !== 'confirm') return;
    setImporting(true);
    try {
      const result = await api<Plan & { created?: number; updated?: number }>('POST', '/integrations/vericlock/import', {
        csv_text: csvText,
        hours_only_date: hoursOnlyDate || null,
        allow_unmatched_jobs: allowUnmatchedJobs,
        overwrite_existing: overwriteExisting,
        maps: people.map((row) => ({
          vericlock_employee_id: row.vericlock_employee_id,
          hub_user_id: row.skip ? null : row.hub_user_id,
          skip: row.skip,
          vericlock_name: row.vericlock_name,
          vericlock_group: row.group,
        })),
        job_maps: jobMapsPayload(jobs),
      });
      setPlan(result);
      const created = result.created ?? result.will_import ?? 0;
      const updated = result.updated ?? result.will_update ?? 0;
      toast.success(
        updated > 0
          ? `Imported ${created} new, updated ${updated} existing`
          : `Imported ${created} attendance row(s)`,
      );
    } catch (err: any) {
      toast.error(err?.message || 'Import failed');
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className={uiCx('w-full min-w-0', uiSpacing.pageStack, 'min-h-full bg-gray-50')}>
      <AppPageHeader
        title="VeriClock import"
        subtitle="Temporary: match names once, then import hours that already went to Sage. Do not use for new Hub punches."
        icon={<Clock className="h-4 w-4" />}
        onBack={() => navigate('/settings/attendance')}
        backLabel="Attendance"
        actions={
          <div className="flex flex-wrap gap-2">
            <AppButton variant="secondary" onClick={() => void saveMap()} loading={saving} disabled={!people.length}>
              Save name map
            </AppButton>
            <AppButton variant="secondary" onClick={() => void saveJobMap()} loading={saving} disabled={!jobs.length}>
              Save job map
            </AppButton>
            <AppButton
              onClick={() => void runImport()}
              loading={importing}
              disabled={!csvText || counts.needs > 0 || (jobCounts.needs > 0 && !allowUnmatchedJobs)}
            >
              Import hours
            </AppButton>
          </div>
        }
      />

      <AppCard title="1. Activity Report CSV" subtitle={fileName || 'Export Time → Activity from VeriClock, then upload here.'}>
        <div className="grid gap-4 md:grid-cols-2">
          <AppInput
            label="CSV file"
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => void onPickFile(e.target.files?.[0])}
          />
          <AppInput
            label="Date for hours-only rows"
            type="date"
            value={hoursOnlyDate}
            onChange={(e) => setHoursOnlyDate(e.target.value)}
            helperText="Stat Holiday rows in this export have no clock times. Set the work date (e.g. 2026-09-07) or they are skipped."
          />
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <AppCheckbox
            label="Import leftover unmatched jobs as No Project"
            checked={allowUnmatchedJobs}
            onChange={(checked) => {
              setAllowUnmatchedJobs(checked);
              if (csvText) void runPreview(csvText, { allowUnmatchedJobs: checked });
            }}
          />
          <AppCheckbox
            label="Overwrite existing VeriClock rows"
            checked={overwriteExisting}
            onChange={(checked) => {
              setOverwriteExisting(checked);
              if (csvText) void runPreview(csvText, { overwriteExisting: checked });
            }}
          />
          <AppButton variant="secondary" onClick={() => void runPreview()} loading={previewing} disabled={!csvText}>
            Refresh preview
          </AppButton>
        </div>
        {overwriteExisting ? (
          <p className={uiCx(uiTypography.helper, 'mt-3')}>
            For a test import, then the final CSV. Replaces times, hours, and job on matching VeriClock punches
            (same employee ID, clock-in, and job code). Does not delete rows that are missing from this file.
          </p>
        ) : null}
      </AppCard>

      {plan ? (
        <AppCard title="Preview" subtitle={`${rowCount} CSV rows`}>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Will import" value={plan.will_import} />
            <Stat label="Will update" value={plan.will_update ?? 0} />
            <Stat label="Already in Hub" value={plan.already_imported} />
            <Stat label="Need a name match" value={plan.needs_person} warn={plan.needs_person > 0} />
            <Stat label="No date / clock" value={plan.missing_time} warn={plan.missing_time > 0} />
            <Stat label="Unmatched job" value={plan.unmatched_job} warn={plan.unmatched_job > 0} />
            <Stat label="Skipped people" value={plan.skipped_person} />
            <Stat label="Skipped jobs" value={plan.skipped_job ?? 0} />
            <Stat label="Hub not linked" value={unlinkedHub.length} />
            <Stat label="Hub used twice" value={duplicateGroups.length} warn={duplicateGroups.length > 0} />
          </div>
          {plan.unmatched_jobs.length > 0 ? (
            <div className="mt-4 space-y-1 text-xs text-gray-600">
              <p className="font-medium text-gray-800">Jobs not found in Hub</p>
              {plan.unmatched_jobs.slice(0, 12).map((job) => (
                <p key={job.label}>
                  {job.label} · {job.count}
                </p>
              ))}
            </div>
          ) : null}
        </AppCard>
      ) : null}

      {people.length > 0 ? (
        <AppCard title="2. Match names" subtitle="Saved by VeriClock Employee ID. Reused when you import again at cutover.">
          <AppTabs
            value={matchTab}
            onChange={(key) => setMatchTab(key as MatchTab)}
            tabs={[
              { key: 'vericlock', label: 'VeriClock names', count: people.length },
              { key: 'hub-unlinked', label: 'Hub not linked', count: unlinkedHub.length },
              { key: 'hub-duplicate', label: 'Hub used twice', count: duplicateGroups.length },
            ]}
          />

          {matchTab === 'vericlock' ? (
            <>
              <AppQuickFilterRow
                label="Show:"
                segments={[
                  { key: 'needs', label: 'Needs match', active: filter === 'needs', count: counts.needs, onClick: () => setFilter('needs') },
                  { key: 'suggested', label: 'Auto', active: filter === 'suggested', count: counts.suggested, onClick: () => setFilter('suggested') },
                  { key: 'mapped', label: 'Matched', active: filter === 'mapped', count: counts.mapped, onClick: () => setFilter('mapped') },
                  { key: 'skipped', label: 'Skip', active: filter === 'skipped', count: counts.skipped, onClick: () => setFilter('skipped') },
                  { key: 'all', label: 'All', active: filter === 'all', count: counts.all, onClick: () => setFilter('all') },
                ]}
              />
              <div className="mt-4 space-y-3">
                {visible.map((row) => (
                  <PersonMatchRow
                    key={row.vericlock_employee_id}
                    row={row}
                    duplicate={Boolean(row.hub_user_id && duplicateHubIds.has(row.hub_user_id))}
                    userOptions={userOptions}
                    onPatch={patchPerson}
                  />
                ))}
                {visible.length === 0 ? <p className="text-sm text-gray-500">Nothing in this filter.</p> : null}
              </div>
            </>
          ) : null}

          {matchTab === 'hub-unlinked' ? (
            <div className="mt-4 space-y-3">
              <p className={uiTypography.helper}>
                Active Hub users with no VeriClock person pointing at them. Office / VeriClock admin accounts often stay here on purpose.
              </p>
              <AppCheckbox
                label="Include inactive Hub users"
                checked={includeInactiveHub}
                onChange={setIncludeInactiveHub}
              />
              {unlinkedHub.length === 0 ? (
                <AppEmptyState
                  title="Everyone here is linked"
                  description="Every Hub user in this list is already selected on a VeriClock name (or inactive users are hidden)."
                />
              ) : (
                <div className="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200">
                  {unlinkedHub.map((user) => (
                    <div key={user.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900">{getUserDisplayName(user)}</p>
                        <p className="text-xs text-gray-500">
                          {user.username || user.id}
                          {user.department ? ` · ${user.department}` : ''}
                        </p>
                      </div>
                      <AppBadge variant="warning">Not linked</AppBadge>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : null}

          {matchTab === 'hub-duplicate' ? (
            <div className="mt-4 space-y-4">
              <p className={uiTypography.helper}>
                The same Hub employee is selected on more than one VeriClock ID. Fix unless they really are the same person with two VeriClock accounts.
              </p>
              {duplicateGroups.length === 0 ? (
                <AppEmptyState
                  title="No Hub person is selected twice"
                  description="Each matched Hub employee is linked to only one VeriClock ID."
                />
              ) : (
                duplicateGroups.map((group) => (
                  <div key={group.hubUserId} className="space-y-3 rounded-xl border border-amber-200 bg-amber-50/40 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-gray-900">{group.hubName}</p>
                      <AppBadge variant="warning">{group.rows.length} VeriClock names</AppBadge>
                    </div>
                    {group.rows.map((row) => (
                      <PersonMatchRow
                        key={row.vericlock_employee_id}
                        row={row}
                        duplicate
                        userOptions={userOptions}
                        onPatch={patchPerson}
                      />
                    ))}
                  </div>
                ))
              )}
            </div>
          ) : null}
        </AppCard>
      ) : null}

      {jobs.length > 0 ? (
        <AppCard
          title="3. Match jobs"
          subtitle="VeriClock uses codes like 795; Hub uses Sage codes like CW8520. Auto-match reads the Sage token in the CSV. Map the rest once — reused at cutover."
        >
          <AppQuickFilterRow
            label="Show:"
            segments={[
              { key: 'needs', label: 'Needs match', active: jobFilter === 'needs', count: jobCounts.needs, onClick: () => setJobFilter('needs') },
              { key: 'suggested', label: 'Auto', active: jobFilter === 'suggested', count: jobCounts.suggested, onClick: () => setJobFilter('suggested') },
              { key: 'mapped', label: 'Matched', active: jobFilter === 'mapped', count: jobCounts.mapped, onClick: () => setJobFilter('mapped') },
              { key: 'skipped', label: 'Skip', active: jobFilter === 'skipped', count: jobCounts.skipped, onClick: () => setJobFilter('skipped') },
              { key: 'all', label: 'All', active: jobFilter === 'all', count: jobCounts.all, onClick: () => setJobFilter('all') },
            ]}
          />
          <div className="mt-4 space-y-3">
            {visibleJobs.map((row) => (
              <JobMatchRow key={row.vericlock_job_code} row={row} onPatch={patchJob} />
            ))}
            {visibleJobs.length === 0 ? <p className="text-sm text-gray-500">Nothing in this filter.</p> : null}
          </div>
        </AppCard>
      ) : null}
    </div>
  );
}

function PersonMatchRow({
  row,
  duplicate,
  userOptions,
  onPatch,
}: {
  row: PersonRow;
  duplicate?: boolean;
  userOptions: ReturnType<typeof mapEmployeeToAppUserSelect>[];
  onPatch: (id: string, patch: Partial<PersonRow>) => void;
}) {
  const badge = matchBadge(row);
  return (
    <div className="grid gap-3 rounded-xl border border-gray-200 bg-white p-3 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1.4fr)_auto]">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium text-gray-900">{row.vericlock_name}</p>
          <AppBadge variant={badge.variant}>{badge.label}</AppBadge>
          {duplicate ? <AppBadge variant="warning">Hub used twice</AppBadge> : null}
        </div>
        <p className="mt-1 text-xs text-gray-500">
          ID {row.vericlock_employee_id}
          {row.group ? ` · ${row.group}` : ''}
          {` · ${row.row_count} row${row.row_count === 1 ? '' : 's'}`}
        </p>
      </div>
      <AppUserSelect
        label="Hub employee"
        users={userOptions}
        value={row.skip ? '' : row.hub_user_id || ''}
        disabled={row.skip}
        placeholder="Search Hub name"
        onChange={(userId) => {
          const picked = userOptions.find((u) => u.id === userId);
          onPatch(row.vericlock_employee_id, {
            hub_user_id: userId || null,
            hub_name: picked ? getUserDisplayName(picked) : null,
            skip: false,
            match_source: 'manual',
          });
        }}
      />
      <div className="flex items-end">
        <AppCheckbox
          label="Skip"
          checked={row.skip}
          onChange={(skip) =>
            onPatch(row.vericlock_employee_id, {
              skip,
              hub_user_id: skip ? null : row.hub_user_id,
            })
          }
        />
      </div>
    </div>
  );
}

function JobMatchRow({
  row,
  onPatch,
}: {
  row: JobRow;
  onPatch: (code: string, patch: Partial<JobRow>) => void;
}) {
  const badge = jobMatchBadge(row);
  return (
    <div className="grid gap-3 rounded-xl border border-gray-200 bg-white p-3 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1.4fr)_auto]">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium text-gray-900">{row.vericlock_label}</p>
          <AppBadge variant={badge.variant}>{badge.label}</AppBadge>
        </div>
        <p className="mt-1 text-xs text-gray-500">
          Code {row.vericlock_job_code}
          {` · ${row.row_count} row${row.row_count === 1 ? '' : 's'}`}
        </p>
      </div>
      <JobSearchCombobox
        label="Hub job"
        value={jobPickerValue(row)}
        disabled={row.skip}
        placeholder="Search project, Shop, Stat Holiday…"
        onChange={(jobId) => {
          if (!jobId) {
            onPatch(row.vericlock_job_code, {
              hub_project_id: null,
              predefined_job_code: null,
              skip: false,
              match_source: 'manual',
            });
            return;
          }
          if (isPredefinedJobId(jobId)) {
            onPatch(row.vericlock_job_code, {
              hub_project_id: null,
              predefined_job_code: jobId,
              skip: false,
              match_source: 'manual',
            });
            return;
          }
          onPatch(row.vericlock_job_code, {
            hub_project_id: jobId,
            predefined_job_code: null,
            skip: false,
            match_source: 'manual',
          });
        }}
      />
      <div className="flex items-end">
        <AppCheckbox
          label="Skip"
          checked={row.skip}
          onChange={(skip) =>
            onPatch(row.vericlock_job_code, {
              skip,
              hub_project_id: skip ? null : row.hub_project_id,
              predefined_job_code: skip ? null : row.predefined_job_code,
            })
          }
        />
      </div>
    </div>
  );
}

function Stat({ label, value, warn }: { label: string; value: number; warn?: boolean }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-gray-500">{label}</p>
      <p className={uiCx('text-lg font-semibold', warn ? 'text-amber-800' : 'text-gray-900')}>{value}</p>
    </div>
  );
}
