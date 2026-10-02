import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { DivisionIcon } from '@/components/DivisionIcon';
import { AppButton, AppControlLabelRow, AppFieldHint, AppFormModal, AppInput, AppTooltip, AppUserSelect, uiCx, uiLayout, uiTypography } from '@/components/ui';
import { api } from '@/lib/api';
import { formatSiteHeroAddress } from '@/lib/addressUtils';
import {
  BUSINESS_LINE_REPAIRS_MAINTENANCE,
  filterProjectDivisionsForBusinessLine,
  LEAK_INVESTIGATION_DIVISION_LABEL,
  PROJECT_DIVISIONS_QUERY_KEY,
} from '@/lib/businessLine';
import { employeeHasSalesOrEstimatingDepartment, mapEmployeeToAppUserSelect } from '@/lib/clientUi';
import { employeesDirectoryQueryKey, fetchEmployeesDirectory } from '@/lib/employeesQuery';
import { formModalQuickInfo, uiLabel } from '@/lib/formModalQuickInfo';

type SourceProject = {
  id?: string;
  name?: string;
  code?: string;
  client_display_name?: string;
  client_name?: string;
  site_name?: string;
  site_address_line1?: string;
  site_address_line2?: string;
  site_address_line3?: string;
  site_city?: string;
  site_postal_code?: string;
  address?: string;
  address_city?: string;
  address_postal_code?: string;
};

type DivisionNode = { id?: string; label?: string; subdivisions?: DivisionNode[] };

function pickerDivisions(divisions: DivisionNode[] | undefined) {
  return filterProjectDivisionsForBusinessLine(divisions, BUSINESS_LINE_REPAIRS_MAINTENANCE)
    .filter((div) => div.id)
    .map((div) => ({
      ...div,
      subdivisions: (div.subdivisions || []).filter(
        (sub) => sub.id && sub.label !== LEAK_INVESTIGATION_DIVISION_LABEL,
      ),
    }));
}

export function RmOpportunityFromProjectModal({
  open,
  project,
  onClose,
  onCreated,
}: {
  open: boolean;
  project: SourceProject | null | undefined;
  onClose: () => void;
  onCreated: (opportunityId: string) => void;
}) {
  const [name, setName] = useState('');
  const [divisionIds, setDivisionIds] = useState<string[]>([]);
  const [expandedDivisions, setExpandedDivisions] = useState<Set<string>>(new Set());
  const [estimatorId, setEstimatorId] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(project?.name || '');
    setDivisionIds([]);
    setExpandedDivisions(new Set());
    setEstimatorId('');
    setSubmitting(false);
  }, [open, project?.id, project?.name]);

  const { data: projectDivisions, isLoading: divisionsLoading } = useQuery({
    queryKey: PROJECT_DIVISIONS_QUERY_KEY,
    queryFn: () => api<DivisionNode[]>('GET', '/settings/project-divisions'),
    enabled: open,
    staleTime: 300_000,
  });
  const { data: employees } = useQuery({
    queryKey: employeesDirectoryQueryKey({ limit: 5000 }),
    queryFn: () => fetchEmployeesDirectory({ limit: 5000 }),
    enabled: open,
    staleTime: 300_000,
  });

  const divisionsForPicker = useMemo(() => pickerDivisions(projectDivisions), [projectDivisions]);
  const estimatorOptions = useMemo(
    () => (employees || []).filter(employeeHasSalesOrEstimatingDepartment).map((emp) => mapEmployeeToAppUserSelect(emp)),
    [employees],
  );

  const projectName = project?.name?.trim() || '';
  const customer = project?.client_display_name || project?.client_name || '—';
  const siteAddress = formatSiteHeroAddress({
    address_line1: project?.site_address_line1 || project?.address,
    address_line2: project?.site_address_line2,
    address_line3: project?.site_address_line3,
    city: project?.site_city || project?.address_city,
    postal_code: project?.site_postal_code || project?.address_postal_code,
  });
  const site = project?.site_name?.trim() || siteAddress || '—';

  const handleCreate = async () => {
    if (!project?.id || submitting) return;
    setSubmitting(true);
    try {
      const created = await api<{ id: string }>('POST', `/projects/${encodeURIComponent(String(project.id))}/rm-opportunity`, {
        name: name.trim(),
        project_division_ids: divisionIds,
        estimator_id: estimatorId || null,
      });
      onCreated(created.id);
    } catch (err) {
      toast.error((err as Error)?.message || 'Could not create opportunity');
      setSubmitting(false);
    }
  };

  return (
    <AppFormModal
      open={open}
      onClose={onClose}
      title="Create Opportunity related to this Project"
      description="Optional details before the R&M opportunity is created"
      formWidth="comfortable"
      dialogClassName="!max-w-2xl"
      dialogClassNameExpanded="!w-[calc(42rem+1.5rem+16rem)] !max-w-[calc(42rem+1.5rem+16rem)]"
      formColumnClassName="w-full md:w-[40rem] md:max-w-[40rem]"
      quickInfo={formModalQuickInfo({
        purpose: 'Start an R&M opportunity from this finished Production project. Customer, contact, and site are copied automatically.',
        howToUse: (
          <>
            Adjust <uiLabel>Name</uiLabel>, choose an R&M <uiLabel>Division</uiLabel>, or assign an <uiLabel>Estimator</uiLabel> if you already know them.
          </>
        ),
        behavior: 'Every field can be left blank. An empty name keeps the project name. Division and estimator can be set later on the opportunity.',
        actions: (
          <>
            <uiLabel>Create</uiLabel> opens the new opportunity. <uiLabel>Cancel</uiLabel> closes this window without creating anything.
          </>
        ),
      })}
      footer={
        <div className={uiCx(uiLayout.actionsRow, 'w-full justify-end gap-3')}>
          <AppButton type="button" variant="secondary" size="sm" onClick={onClose} disabled={submitting}>
            Cancel
          </AppButton>
          <AppButton type="button" size="sm" onClick={handleCreate} disabled={submitting} loading={submitting}>
            {submitting ? 'Creating…' : 'Create'}
          </AppButton>
        </div>
      }
    >
      <div className="space-y-4">
        <dl className="grid grid-cols-1 gap-2 rounded-lg border border-gray-200 bg-gray-50 p-3 sm:grid-cols-3">
          <div className="min-w-0">
            <dt className={uiTypography.overline}>Project</dt>
            <AppTooltip constrain wrap content={projectName} disabled={!projectName}>
              <dd className={uiCx(uiTypography.body, 'truncate font-semibold text-gray-900')}>
                {projectName || '—'}
                {project?.code ? <span className="font-normal text-gray-600"> · {project.code}</span> : null}
              </dd>
            </AppTooltip>
          </div>
          <div className="min-w-0">
            <dt className={uiTypography.overline}>Customer</dt>
            <AppTooltip constrain wrap content={customer === '—' ? '' : customer} disabled={customer === '—'}>
              <dd className={uiCx(uiTypography.body, 'truncate font-semibold text-gray-900')}>{customer}</dd>
            </AppTooltip>
          </div>
          <div className="min-w-0">
            <dt className={uiTypography.overline}>Site</dt>
            <AppTooltip constrain wrap content={siteAddress || ''} disabled={!siteAddress}>
              <dd className={uiCx(uiTypography.body, 'truncate font-semibold text-gray-900')}>{site}</dd>
            </AppTooltip>
          </div>
        </dl>
        <AppInput
          label="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={project?.name || 'Project name'}
        />
        <div className="space-y-3">
          <AppControlLabelRow
            label="Project divisions"
            fieldHint={
              <AppFieldHint hint="Project divisions\n\nOptional. Expand a division to choose subdivisions, the same way as when creating an opportunity." />
            }
          />
          <div className="divide-y divide-gray-200 overflow-hidden rounded-lg border border-gray-200 bg-white">
            {divisionsLoading ? (
              <div className="py-6 text-center text-sm text-gray-600">Loading project divisions…</div>
            ) : divisionsForPicker.length > 0 ? (
              divisionsForPicker.map((div) => {
                const divId = String(div.id);
                const subdivisions = Array.isArray(div.subdivisions) ? div.subdivisions : [];
                const hasSubdivisions = subdivisions.length > 0;
                const isExpanded = expandedDivisions.has(divId);
                return (
                  <div key={divId} className="overflow-hidden bg-white">
                    <button
                      type="button"
                      onClick={() => {
                        if (hasSubdivisions) {
                          setExpandedDivisions((prev) => {
                            const next = new Set(prev);
                            if (next.has(divId)) next.delete(divId);
                            else next.add(divId);
                            return next;
                          });
                        } else {
                          setDivisionIds((prev) =>
                            prev.includes(divId) ? prev.filter((id) => id !== divId) : [...prev, divId],
                          );
                        }
                      }}
                      className={`flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-semibold transition-colors ${
                        hasSubdivisions
                          ? 'bg-gray-50 text-gray-900 hover:bg-gray-100'
                          : divisionIds.includes(divId)
                            ? 'border-l-2 border-l-indigo-500 bg-indigo-50 text-gray-900'
                            : 'bg-white text-gray-900 hover:bg-gray-50'
                      }`}
                    >
                      {hasSubdivisions ? (
                        <span className="w-4 flex-shrink-0 text-sm text-gray-600">{isExpanded ? '▼' : '▶'}</span>
                      ) : (
                        <span className="w-4 flex-shrink-0" aria-hidden />
                      )}
                      <span className="flex-shrink-0 text-lg">
                        <DivisionIcon label={div.label || ''} size={20} />
                      </span>
                      <span className="min-w-0">{div.label}</span>
                    </button>
                    {hasSubdivisions && isExpanded ? (
                      <div className="space-y-1 border-t border-gray-100 bg-gray-50/80 px-2 pb-2 pt-0">
                        {subdivisions.map((sub) => {
                          const subId = String(sub.id);
                          const subSelected = divisionIds.includes(subId);
                          return (
                            <button
                              key={subId}
                              type="button"
                              onClick={() =>
                                setDivisionIds((prev) =>
                                  prev.includes(subId) ? prev.filter((id) => id !== subId) : [...prev, subId],
                                )
                              }
                              className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                                subSelected
                                  ? 'border border-indigo-200 bg-indigo-50 text-gray-900'
                                  : 'border border-gray-200 bg-white text-gray-800 hover:bg-gray-50'
                              }`}
                            >
                              <span className="flex-shrink-0 text-base">
                                <DivisionIcon label={sub.label || div.label || ''} size={18} />
                              </span>
                              <span className="min-w-0">• {sub.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                );
              })
            ) : (
              <div className="py-6 text-center text-sm text-gray-600">No project divisions available.</div>
            )}
          </div>
        </div>
        <AppUserSelect
          mode="single"
          label="Estimator"
          users={estimatorOptions}
          value={estimatorId}
          onChange={setEstimatorId}
          placeholder="None"
        />
      </div>
    </AppFormModal>
  );
}
