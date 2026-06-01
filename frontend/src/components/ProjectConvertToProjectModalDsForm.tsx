import { useMemo } from 'react';
import { AlertTriangle, Check, X } from 'lucide-react';
import { DivisionIcon } from '@/components/DivisionIcon';
import { mapEmployeeToAppUserSelect } from '@/lib/clientUi';
import { sortByLabel } from '@/lib/sortOptions';
import {
  AppDatePicker,
  AppSelect,
  AppTooltip,
  AppUserSelect,
  uiBorders,
  uiColors,
  uiCx,
  uiLayout,
  uiRadius,
  uiSpacing,
  uiTypography,
  type AppSelectOption,
} from '@/components/ui';

type RelatedAwardOption = { id: string; label: string };

type AdditionalCostRow = {
  label?: string;
  name?: string;
  value?: number;
  quantity?: string | number;
  division_id?: string;
};

function ConvertBinaryChoice({
  value,
  onYes,
  onNo,
  yesTitle,
  noTitle,
}: {
  value: boolean;
  onYes: () => void;
  onNo: () => void;
  yesTitle: string;
  noTitle: string;
}) {
  const yesClass = value
    ? 'bg-green-100 text-green-700 border-green-400 shadow-sm'
    : 'bg-white text-gray-300 border-gray-200 hover:border-gray-300 hover:text-gray-400';
  const noClass = !value
    ? 'bg-red-100 text-red-700 border-red-400 shadow-sm'
    : 'bg-white text-gray-300 border-gray-200 hover:border-gray-300 hover:text-gray-400';

  return (
    <div className="flex shrink-0 items-center gap-1">
      <AppTooltip content={yesTitle} placement="top">
        <button
          type="button"
          onClick={onYes}
          className={uiCx(
            'flex h-7 w-7 items-center justify-center rounded-lg border-2 transition-colors',
            yesClass,
          )}
          aria-label={yesTitle}
        >
          <Check className="h-4 w-4" aria-hidden />
        </button>
      </AppTooltip>
      <AppTooltip content={noTitle} placement="top">
        <button
          type="button"
          onClick={onNo}
          className={uiCx(
            'flex h-7 w-7 items-center justify-center rounded-lg border-2 transition-colors',
            noClass,
          )}
          aria-label={noTitle}
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </AppTooltip>
    </div>
  );
}

export type ProjectConvertToProjectModalDsFormProps = {
  proj: any;
  employees: any[];
  leadSourcesList: any[];
  projectAdminId: string;
  onProjectAdminIdChange: (id: string) => void;
  leadSource: string;
  onLeadSourceChange: (value: string) => void;
  divisionIds: string[];
  divisionLeads: Record<string, string>;
  onDivisionLeadChange: (divId: string, userId: string) => void;
  dateStart: string;
  onDateStartChange: (value: string) => void;
  dateEta: string;
  onDateEtaChange: (value: string) => void;
  relatedAwardOptions: RelatedAwardOption[];
  awardedRelatedApprovals: boolean[];
  onAwardedRelatedChange: (index: number, awarded: boolean) => void;
  additionalCosts: AdditionalCostRow[];
  pricingApprovals: boolean[];
  onPricingApprovalChange: (index: number, approved: boolean) => void;
  getDivisionLabel: (divId: string) => string;
  getDivisionMainLabel: (divId: string) => string;
};

export function ProjectConvertToProjectModalDsForm({
  proj,
  employees,
  leadSourcesList,
  projectAdminId,
  onProjectAdminIdChange,
  leadSource,
  onLeadSourceChange,
  divisionIds,
  divisionLeads,
  onDivisionLeadChange,
  dateStart,
  onDateStartChange,
  dateEta,
  onDateEtaChange,
  relatedAwardOptions,
  awardedRelatedApprovals,
  onAwardedRelatedChange,
  additionalCosts,
  pricingApprovals,
  onPricingApprovalChange,
  getDivisionLabel,
  getDivisionMainLabel,
}: ProjectConvertToProjectModalDsFormProps) {
  const employeeUserOptions = useMemo(
    () => (employees || []).map((e: any) => mapEmployeeToAppUserSelect(e)),
    [employees],
  );

  const leadSourceOptions: AppSelectOption[] = useMemo(
    () =>
      sortByLabel(leadSourcesList, (ls: any) => (ls?.label ?? ls?.name ?? '').toString()).map((ls: any) => {
        const val = String(ls?.value ?? ls?.id ?? ls?.label ?? ls?.name ?? ls);
        const label = (ls?.label ?? ls?.name ?? String(ls)) as string;
        return { value: val, label };
      }),
    [leadSourcesList],
  );

  return (
    <div className={uiCx(uiSpacing.sectionStack, 'min-w-0')}>
      <div
        className={uiCx(
          uiRadius.control,
          uiBorders.subtle,
          'flex gap-3 border-amber-300 bg-amber-50 p-4',
        )}
      >
        <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" aria-hidden />
        <p className={uiCx(uiTypography.body, 'text-amber-900')}>
          Converting &quot;{proj?.name || 'this opportunity'}&quot; to an active project will enable workload and
          timesheet functionality.{' '}
          <span className="font-medium">Be careful, this action cannot be undone.</span>
        </p>
      </div>

      {relatedAwardOptions.length > 0 ? (
        <div className={uiSpacing.sectionStack}>
          <div>
            <p className={uiTypography.overline}>Related customers – mark awarded</p>
            <p className={uiCx(uiTypography.helper, 'mt-1')}>Use green for awarded, red for not awarded.</p>
          </div>
          <div className={uiCx(uiBorders.subtle, uiRadius.control, uiColors.surface, 'max-h-48 divide-y overflow-y-auto')}>
            {relatedAwardOptions.map(({ id: rid, label }, i) => {
              const approved = i < awardedRelatedApprovals.length ? awardedRelatedApprovals[i] : false;
              return (
                <div
                  key={rid}
                  className={uiCx('flex items-center gap-3 px-3 py-2.5', uiColors.surface, 'hover:bg-gray-50')}
                >
                  <span className={uiCx(uiTypography.body, 'min-w-0 flex-1 truncate font-medium')}>{label}</span>
                  <ConvertBinaryChoice
                    value={approved}
                    yesTitle="Awarded"
                    noTitle="Not awarded"
                    onYes={() => onAwardedRelatedChange(i, true)}
                    onNo={() => onAwardedRelatedChange(i, false)}
                  />
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className={uiLayout.sectionGrid2}>
        <AppUserSelect
          mode="single"
          label="Project admin"
          users={employeeUserOptions}
          value={projectAdminId}
          onChange={onProjectAdminIdChange}
          placeholder="Search user…"
          fieldHint={
            'Project admin\n\nPrimary contact responsible for this project after conversion.'
          }
        />
        <AppSelect
          label="Lead source"
          value={leadSource || ''}
          onChange={(e) => onLeadSourceChange(e.target.value)}
          options={leadSourceOptions}
          placeholder="Select…"
          fieldHint={
            'Lead source\n\nHow this opportunity entered your pipeline. Options come from system settings.'
          }
        />
      </div>

      <div className={uiLayout.sectionGrid2}>
        <AppDatePicker
          label="Start date"
          value={dateStart}
          onChange={(e) => onDateStartChange(e.target.value)}
          fieldHint="Start date\n\nWhen work on this project is expected to begin."
        />
        <AppDatePicker
          label="End date"
          value={dateEta}
          onChange={(e) => onDateEtaChange(e.target.value)}
          fieldHint="End date\n\nTarget completion or end date for the project."
        />
      </div>

      {divisionIds.length > 0 ? (
        <div className={uiSpacing.sectionStack}>
          <p className={uiTypography.overline}>On-site leads (by division)</p>
          <div className={uiSpacing.sectionStack}>
            {divisionIds.map((divId: string) => (
              <div key={divId} className="grid grid-cols-1 items-end gap-2 sm:grid-cols-[9rem_minmax(0,1fr)]">
                <div
                  className="flex min-w-0 items-center gap-1.5 pb-2 sm:pb-0"
                  title={getDivisionLabel(divId)}
                >
                  <DivisionIcon label={getDivisionMainLabel(divId)} size={18} />
                  <span className={uiCx(uiTypography.body, 'truncate text-gray-600')}>
                    {getDivisionLabel(divId)}
                  </span>
                </div>
                <AppUserSelect
                  mode="single"
                  users={employeeUserOptions}
                  value={divisionLeads[divId] || ''}
                  onChange={(userId) => onDivisionLeadChange(divId, userId)}
                  placeholder="Search user…"
                />
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {additionalCosts.length > 0 ? (
        <div className={uiSpacing.sectionStack}>
          <div>
            <p className={uiTypography.overline}>Pricing – approve items for project</p>
            <p className={uiCx(uiTypography.helper, 'mt-1')}>
              Choose which proposal line items carry into the active project.
            </p>
          </div>
          <div className={uiCx(uiBorders.subtle, uiRadius.control, uiColors.surface, 'max-h-48 divide-y overflow-y-auto')}>
            {additionalCosts.map((item, i) => {
              const label = item.label ?? item.name ?? '—';
              const value = (item.value ?? 0) * (parseFloat(String(item.quantity)) || 1);
              const divId = item.division_id;
              const approved = i < pricingApprovals.length ? pricingApprovals[i] : true;
              return (
                <div
                  key={i}
                  className={uiCx('flex items-center gap-3 px-3 py-2.5', uiColors.surface, 'hover:bg-gray-50')}
                >
                  <div className="min-w-0 flex-1">
                    {divId ? (
                      <span className={uiCx(uiTypography.helper, 'mb-0.5 flex items-center gap-1')}>
                        <DivisionIcon label={getDivisionMainLabel(divId)} size={14} />
                        {getDivisionLabel(divId)}
                      </span>
                    ) : null}
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={uiCx(uiTypography.body, 'truncate font-medium')}>{label}</span>
                      <span className="text-gray-400">–</span>
                      <span className={uiCx(uiTypography.body, 'font-semibold text-gray-900')}>
                        ${Number(value).toLocaleString('en-CA', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>
                  <ConvertBinaryChoice
                    value={approved}
                    yesTitle="Approved"
                    noTitle="Not approved"
                    onYes={() => onPricingApprovalChange(i, true)}
                    onNo={() => onPricingApprovalChange(i, false)}
                  />
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
