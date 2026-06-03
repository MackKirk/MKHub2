import { useState, useEffect, useRef } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, withFileAccessToken } from '@/lib/api';
import {
  InspectionScheduleHero,
  InspectionScheduleHeroSkeleton,
} from '@/components/fleet/InspectionScheduleHero';
import { INSPECTION_RESULT_LABELS } from '@/lib/fleetBadges';
import {
  getInspectionChecklistConditionBadgeVariant,
  getInspectionResultBadgeVariant,
} from '@/lib/fleetUi';
import toast from 'react-hot-toast';
import { ClipboardCheck } from 'lucide-react';
import {
  ScheduleBodyInlineEditor,
  ScheduleMechanicalInlineEditor,
  type InlineInspectionRow,
} from '@/pages/FleetInspectionScheduleInlineEditors';
import { useConfirm } from '@/components/ConfirmProvider';
import WorkOrderNewModal from '@/components/fleet/WorkOrderNewModal';
import {
  AppBadge,
  AppButton,
  AppCard,
  AppEmptyState,
  AppPageHeader,
  AppSectionHeader,
  uiBorders,
  uiCx,
  uiLayout,
  uiRadius,
  uiShadows,
  uiSpacing,
  uiTypography,
} from '@/components/ui';

type Schedule = {
  id: string;
  fleet_asset_id: string;
  fleet_asset_name?: string;
  scheduled_at: string;
  urgency: string;
  category: string;
  status: string;
  notes?: string | null;
  created_at?: string;
  body_inspection_id?: string | null;
  mechanical_inspection_id?: string | null;
  body_result?: string | null;
  mechanical_result?: string | null;
};

type ScheduleInspectionFetched = {
  id: string;
  result: string;
  inspection_type?: string;
  inspection_date?: string;
  auto_generated_work_order_id?: string | null;
  notes?: string;
  photos?: string[];
  checklist_results?: {
    areas?: Array<{ key: string; condition?: string; issues?: string }>;
    _metadata?: Record<string, string>;
    [key: string]: any;
  };
};

type ChecklistTemplate = {
  areas?: Array<{ key: string; label: string; description?: string }>;
  sections?: Array<{
    id: string;
    title: string;
    items: Array<{ key: string; label: string; category: string }>;
  }>;
};

const CONDITION_LABELS: Record<string, string> = {
  ok: 'OK',
  damage: 'Damage',
  conditional: 'Conditional',
};
const CONDITION_ICONS: Record<string, string> = {
  ok: '✓',
  damage: '✗',
  conditional: '⚠',
};

type ColumnLayout = 'balanced' | 'bodyFocus' | 'mechFocus';

function ChecklistConditionBadge({ condition }: { condition: string }) {
  if (!condition) return null;
  return (
    <span title={CONDITION_LABELS[condition] ?? condition}>
      <AppBadge
        variant={getInspectionChecklistConditionBadgeVariant(condition)}
        className="!h-9 !w-9 shrink-0 !justify-center !rounded-xl !px-0 !py-0 !text-lg !font-bold !normal-case !tracking-normal"
      >
        {CONDITION_ICONS[condition] ?? condition}
      </AppBadge>
    </span>
  );
}

function InspectionResultBadge({ result }: { result: string }) {
  return (
    <AppBadge variant={getInspectionResultBadgeVariant(result)}>
      {INSPECTION_RESULT_LABELS[result] ?? result}
    </AppBadge>
  );
}

/** Narrow gray strip: same »/« chip as column headers + tap to expand to balanced width. */
function CompressedInspectionRail({
  chevron,
  icon,
  shortLabel,
  wideLabel,
  onExpand,
}: {
  chevron: 'right' | 'left';
  icon: string;
  shortLabel: string;
  wideLabel: string;
  onExpand: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onExpand}
      className={uiCx(
        'flex min-h-[120px] flex-1 flex-col items-stretch overflow-hidden bg-gradient-to-b from-gray-100 to-gray-50 lg:min-h-[200px]',
        uiRadius.card,
        uiBorders.subtle,
        'ring-1 ring-gray-200/90 hover:from-gray-200/80 hover:to-gray-100',
      )}
    >
      <div className={uiCx('flex shrink-0 items-center justify-center border-b border-gray-300/80 bg-gray-200/90 py-1.5')}>
        <span
          className={uiCx(
            'pointer-events-none inline-flex rounded-md border border-gray-200 bg-white p-1.5 text-gray-600 shadow-sm',
          )}
          aria-hidden
        >
          <span className="block text-sm font-bold leading-none tracking-tight">
            {chevron === 'right' ? '»' : '«'}
          </span>
        </span>
      </div>
      <div className="flex flex-1 flex-col items-center justify-center gap-1 px-0.5 py-2 text-center">
        <span className="text-lg" aria-hidden>
          {icon}
        </span>
        <span className={uiCx(uiTypography.overline, 'font-semibold text-gray-700 [writing-mode:vertical-rl] rotate-180 max-lg:hidden')}>
          {shortLabel}
        </span>
        <span className={uiCx(uiTypography.overline, 'font-semibold text-gray-700 lg:hidden')}>{wideLabel}</span>
        <span className={uiTypography.helper}>Expand</span>
      </div>
    </button>
  );
}

export default function InspectionScheduleDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const reduceMotion = useReducedMotion();
  const [columnLayout, setColumnLayout] = useState<ColumnLayout>('balanced');
  const [bodyInlineOpen, setBodyInlineOpen] = useState(false);
  const [mechInlineOpen, setMechInlineOpen] = useState(false);
  const [woModalInspectionId, setWoModalInspectionId] = useState<string | null>(null);
  const appliedFocusFromUrlRef = useRef<string | null>(null);
  const focusParam = searchParams.get('focus');

  const goBackFromSchedule = () => {
    if (window.history.length > 1) {
      nav(-1);
    } else {
      nav('/fleet/inspections');
    }
  };

  const { data: me } = useQuery({
    queryKey: ['me'],
    queryFn: () => api<{ roles?: string[] }>('GET', '/auth/me'),
  });
  const isAdmin = (me?.roles ?? []).includes('admin');

  const { data: schedule, isPending } = useQuery({
    queryKey: ['inspection-schedule', id],
    queryFn: () => api<Schedule>('GET', `/fleet/inspection-schedules/${id}`),
    enabled: !!id,
  });

  const { data: asset } = useQuery({
    queryKey: ['fleetAsset', schedule?.fleet_asset_id],
    queryFn: () =>
      api<{
        id: string;
        name?: string;
        unit_number?: string;
        asset_type?: string;
        photos?: string[];
        odometer_current?: number | null;
        hours_current?: number | null;
      }>('GET', `/fleet/assets/${schedule!.fleet_asset_id}`),
    enabled: !!schedule?.fleet_asset_id,
  });

  const assetPhotoUrl = asset?.photos?.[0] ? withFileAccessToken(`/files/${asset.photos[0]}/thumbnail?w=400`) : null;

  const { data: bodyInspection } = useQuery({
    queryKey: ['inspection', schedule?.body_inspection_id],
    queryFn: () => api<ScheduleInspectionFetched>('GET', `/fleet/inspections/${schedule!.body_inspection_id}`),
    enabled: !!schedule?.body_inspection_id,
  });

  const { data: mechanicalInspection } = useQuery({
    queryKey: ['inspection', schedule?.mechanical_inspection_id],
    queryFn: () => api<ScheduleInspectionFetched>('GET', `/fleet/inspections/${schedule!.mechanical_inspection_id}`),
    enabled: !!schedule?.mechanical_inspection_id,
  });

  const { data: bodyTemplate } = useQuery({
    queryKey: ['inspectionChecklistTemplate', 'body'],
    queryFn: () => api<ChecklistTemplate>('GET', '/fleet/inspections/checklist-template?type=body'),
    enabled: !!schedule?.body_inspection_id,
  });

  const { data: mechanicalTemplate } = useQuery({
    queryKey: ['inspectionChecklistTemplate', 'mechanical'],
    queryFn: () => api<ChecklistTemplate>('GET', '/fleet/inspections/checklist-template?type=mechanical'),
    enabled: !!schedule?.mechanical_inspection_id,
  });

  const invalidateAfterScheduleMutation = () => {
    queryClient.invalidateQueries({ queryKey: ['inspection-schedules'] });
    queryClient.invalidateQueries({ queryKey: ['fleet-inspection-schedules-calendar'] });
    if (id) {
      queryClient.invalidateQueries({ queryKey: ['fleet-inspection-route-schedule-resolve', id] });
      queryClient.invalidateQueries({ queryKey: ['fleet-inspection-route-inspection-resolve', id] });
    }
  };

  const deleteScheduleMutation = useMutation({
    mutationFn: () => api('DELETE', `/fleet/inspection-schedules/${id}`),
    onSuccess: () => {
      invalidateAfterScheduleMutation();
      toast.success('Schedule deleted');
      nav('/fleet/inspections');
    },
    onError: () => toast.error('Failed to delete schedule'),
  });

  useEffect(() => {
    appliedFocusFromUrlRef.current = null;
  }, [id]);

  useEffect(() => {
    if (!id || isPending || !schedule) return;
    const focusRaw = (focusParam || '').toLowerCase();
    if (focusRaw !== 'body' && focusRaw !== 'mechanical') return;

    const applyKey = `${id}:${focusRaw}`;
    if (appliedFocusFromUrlRef.current === applyKey) return;

    const isInspectionResultFinal = (r: string | undefined | null) =>
      !!r && ['pass', 'fail', 'conditional'].includes(String(r).toLowerCase());

    const bodyPendingLocal = !schedule.body_result || schedule.body_result === 'pending';
    const mechPendingLocal = !schedule.mechanical_result || schedule.mechanical_result === 'pending';

    const canEditBody =
      !!bodyInspection &&
      bodyPendingLocal &&
      !bodyInspection.auto_generated_work_order_id &&
      !isInspectionResultFinal(bodyInspection.result);

    const canEditMech =
      !!mechanicalInspection &&
      mechPendingLocal &&
      !mechanicalInspection.auto_generated_work_order_id &&
      !isInspectionResultFinal(mechanicalInspection.result);

    const stripFocusFromUrl = () => {
      const next = new URLSearchParams(searchParams);
      if (!next.has('focus')) return;
      next.delete('focus');
      setSearchParams(next, { replace: true });
    };

    if (focusRaw === 'body') {
      if (!schedule.body_inspection_id) {
        appliedFocusFromUrlRef.current = applyKey;
        stripFocusFromUrl();
        return;
      }
      if (canEditBody && !bodyTemplate?.areas) return;

      setColumnLayout('bodyFocus');
      if (canEditBody && bodyTemplate?.areas) {
        setBodyInlineOpen(true);
      }
      appliedFocusFromUrlRef.current = applyKey;
      stripFocusFromUrl();
      return;
    }

    if (!schedule.mechanical_inspection_id) {
      appliedFocusFromUrlRef.current = applyKey;
      stripFocusFromUrl();
      return;
    }
    if (canEditMech && !mechanicalTemplate?.sections) return;

    setColumnLayout('mechFocus');
    if (canEditMech && mechanicalTemplate?.sections) {
      setMechInlineOpen(true);
    }
    appliedFocusFromUrlRef.current = applyKey;
    stripFocusFromUrl();
  }, [
    id,
    isPending,
    schedule,
    focusParam,
    bodyInspection,
    mechanicalInspection,
    bodyTemplate,
    mechanicalTemplate,
    searchParams,
    setSearchParams,
  ]);

  const pageShellClass = uiCx('w-full min-w-0 overflow-x-hidden', uiSpacing.pageStack, 'min-h-full bg-gray-50');

  const todayLabel = new Date().toLocaleDateString('en-CA', {
    weekday: 'long',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  if (!id) {
    return (
      <div className={pageShellClass}>
        <AppPageHeader
          title="Inspection"
          onBack={goBackFromSchedule}
          backLabel="Inspections"
          icon={<ClipboardCheck className="h-4 w-4" />}
        />
        <AppCard>
          <p className={uiTypography.helper}>Invalid schedule ID</p>
        </AppCard>
      </div>
    );
  }

  if (isPending || !schedule) {
    return (
      <div className={pageShellClass}>
        <AppPageHeader
          title="Inspection"
          onBack={goBackFromSchedule}
          backLabel="Inspections"
          icon={<ClipboardCheck className="h-4 w-4" />}
          actions={
            <div className="text-right">
              <div className={uiTypography.overline}>Today</div>
              <div className={uiCx(uiTypography.sectionTitle, 'mt-0.5')}>{todayLabel}</div>
            </div>
          }
        />
        <InspectionScheduleHeroSkeleton />
        <AppCard>
          <p className={uiCx(uiTypography.helper, 'py-4 text-center')}>Loading…</p>
        </AppCard>
      </div>
    );
  }

  const bodyPending = !schedule.body_result || schedule.body_result === 'pending';
  const mechPending = !schedule.mechanical_result || schedule.mechanical_result === 'pending';

  const isInspectionResultFinal = (r: string | undefined | null) =>
    !!r && ['pass', 'fail', 'conditional'].includes(String(r).toLowerCase());

  const canEditBodyInspection =
    !!bodyInspection &&
    bodyPending &&
    !bodyInspection.auto_generated_work_order_id &&
    !isInspectionResultFinal(bodyInspection.result);

  const canEditMechanicalInspection =
    !!mechanicalInspection &&
    mechPending &&
    !mechanicalInspection.auto_generated_work_order_id &&
    !isInspectionResultFinal(mechanicalInspection.result);

  const finishBodyInline = () => {
    setBodyInlineOpen(false);
    setColumnLayout((prev) => (prev === 'bodyFocus' ? 'balanced' : prev));
  };

  const finishMechInline = () => {
    setMechInlineOpen(false);
    setColumnLayout((prev) => (prev === 'mechFocus' ? 'balanced' : prev));
  };

  const asInlineRow = (ins: ScheduleInspectionFetched): InlineInspectionRow => ({
    ...ins,
    fleet_asset_id: schedule.fleet_asset_id,
  });

  return (
    <div className={pageShellClass}>
      <AppPageHeader
        title="Inspection"
        onBack={goBackFromSchedule}
        backLabel="Inspections"
        icon={<ClipboardCheck className="h-4 w-4" />}
        actions={
          <div className={uiCx(uiLayout.actionsRow, 'flex-wrap items-center gap-3')}>
            {isAdmin ? (
              <AppButton
                variant="danger"
                size="sm"
                loading={deleteScheduleMutation.isPending}
                onClick={async () => {
                  const result = await confirm({
                    title: 'Delete schedule',
                    message:
                      'Delete this schedule permanently? Linked inspections will also be removed. This action cannot be undone.',
                    confirmText: 'Delete',
                    cancelText: 'Cancel',
                  });
                  if (result !== 'confirm') return;
                  deleteScheduleMutation.mutate();
                }}
              >
                Delete
              </AppButton>
            ) : null}
            <div className="text-right">
              <div className={uiTypography.overline}>Today</div>
              <div className={uiCx(uiTypography.sectionTitle, 'mt-0.5')}>{todayLabel}</div>
            </div>
          </div>
        }
      />

      <InspectionScheduleHero
        schedule={schedule}
        asset={asset}
        assetPhotoUrl={assetPhotoUrl}
        onViewAsset={() => nav(`/fleet/assets/${schedule.fleet_asset_id}`)}
      />

      <AppCard className={uiShadows.card} bodyClassName="!p-0">
        <div className={uiCx(uiSpacing.cardPadding, 'border-b border-gray-100')}>
          <AppSectionHeader
            title="Inspections"
            description="Start opens the checklist here; Body and Mechanical can run together. Chevrons in each header compress the other column; use the narrow gray strip to expand again."
          />
        </div>
        {/* balanced: stack on small screens, two columns on lg+. bodyFocus/mechFocus: always row so one side can compress. */}
        <div
          className={`flex min-h-[240px] min-w-0 transition-[gap] duration-300 ease-out ${
            columnLayout === 'balanced' ? 'flex-col lg:flex-row lg:divide-x divide-gray-200' : 'flex-row divide-x divide-gray-200'
          }`}
        >
          {/* Body / Exterior column */}
          <div
            className={`min-w-0 flex flex-col motion-safe:transition-[padding,flex-grow,flex-shrink,width] motion-safe:duration-300 motion-safe:ease-out ${
              columnLayout === 'mechFocus' ? 'w-14 sm:w-16 shrink-0 lg:order-1' : 'flex-1 lg:order-1'
            } ${columnLayout === 'mechFocus' ? 'p-1' : 'p-4 border-b lg:border-b-0 border-gray-200'}`}
          >
            {columnLayout === 'mechFocus' ? (
              <CompressedInspectionRail
                chevron="right"
                icon="🚗"
                shortLabel="Body"
                wideLabel="Body"
                onExpand={() => setColumnLayout('balanced')}
              />
            ) : (
              <>
                <div className="flex items-start gap-2 mb-3 flex-wrap gap-y-2 min-w-0">
                  {schedule.body_inspection_id && !bodyPending && schedule.body_result && (
                    <div className="flex shrink-0 items-center self-center">
                      <InspectionResultBadge result={schedule.body_result} />
                    </div>
                  )}
                  <div className="flex flex-1 min-w-0 flex-wrap items-center justify-end gap-2">
                    <h3 className="font-semibold text-gray-900">Body / Exterior</h3>
                    <span className="text-xl shrink-0">🚗</span>
                    {columnLayout === 'balanced' && (
                      <AppButton
                        type="button"
                        variant="secondary"
                        size="sm"
                        className="h-8 w-8 shrink-0 px-0 hover:border-amber-200 hover:bg-amber-50 hover:text-amber-800"
                        aria-label="Compress Mechanical column"
                        title="Compress Mechanical column (more room for Body)"
                        onClick={() => setColumnLayout('bodyFocus')}
                      >
                        <span className="block text-sm font-bold leading-none tracking-tight" aria-hidden>
                          »
                        </span>
                      </AppButton>
                    )}
                  </div>
                </div>
                {bodyInlineOpen && schedule.body_inspection_id && bodyInspection && bodyTemplate?.areas ? (
                  <motion.div
                    className="min-w-0 overflow-x-hidden"
                    initial={reduceMotion ? false : { opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 34, mass: 0.85 }}
                  >
                    <ScheduleBodyInlineEditor
                      inspectionId={schedule.body_inspection_id}
                      scheduleId={id}
                      inspection={asInlineRow(bodyInspection)}
                      fleetAsset={asset}
                      templateAreas={bodyTemplate.areas}
                      onSaved={finishBodyInline}
                      onCancel={finishBodyInline}
                    />
                  </motion.div>
                ) : (
                  <>
                    {schedule.body_inspection_id ? (
                      bodyPending ? (
                        <AppButton
                          type="button"
                          variant="danger"
                          className="mb-4 w-full gap-2"
                          disabled={!canEditBodyInspection || !bodyTemplate?.areas}
                          onClick={() => {
                            setBodyInlineOpen(true);
                            setColumnLayout(mechInlineOpen ? 'balanced' : 'bodyFocus');
                          }}
                        >
                          <span className="text-lg" aria-hidden>
                            🚗
                          </span>
                          <span>{!bodyTemplate?.areas ? 'Loading…' : 'Start'}</span>
                        </AppButton>
                      ) : null
                    ) : (
                      <AppEmptyState
                        title="Body not created"
                        className="mb-4 border border-gray-200 bg-gray-50 py-3 shadow-none"
                      />
                    )}
                    {schedule.body_inspection_id && bodyInspection && bodyTemplate?.areas && !bodyInlineOpen ? (
                      <div className="space-y-4">
                        <div className="space-y-2">
                          {bodyTemplate.areas.map((area) => {
                            const result = bodyInspection.checklist_results?.areas?.find((a: any) => a.key === area.key);
                            const cond = result?.condition ?? '';
                            const issueText = result?.issues ?? '';
                            return (
                              <div key={area.key} className="flex items-start justify-between gap-2 py-2 border-b border-gray-100 last:border-b-0">
                                <div className="min-w-0">
                                  <span className="text-sm font-medium text-gray-800">{area.label}</span>
                                  {area.description && <div className="text-xs text-gray-500 mt-0.5">{area.description}</div>}
                                  {issueText && <div className="text-xs text-gray-600 mt-1">{issueText}</div>}
                                </div>
                                {cond ? <ChecklistConditionBadge condition={cond} /> : null}
                              </div>
                            );
                          })}
                        </div>
                        {bodyInspection.notes && (
                          <div className={uiCx(uiRadius.card, 'bg-gray-50 p-3')}>
                            <span className={uiTypography.overline}>Observations</span>
                            <p className={uiCx(uiTypography.body, 'mt-1 whitespace-pre-wrap text-gray-700')}>
                              {bodyInspection.notes}
                            </p>
                          </div>
                        )}
                        {bodyInspection.photos && bodyInspection.photos.length > 0 && (
                          <div>
                            <span className={uiTypography.overline}>Photos</span>
                            <div className="flex flex-wrap gap-2 mt-2">
                              {bodyInspection.photos.map((photoId) => (
                                <a
                                  key={photoId}
                                  href={withFileAccessToken(`/files/${photoId}/thumbnail?w=800`)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="block w-20 h-20 rounded-lg overflow-hidden border border-gray-200 hover:ring-2 hover:ring-brand-red focus:outline-none focus:ring-2 focus:ring-brand-red"
                                >
                                  <img src={withFileAccessToken(`/files/${photoId}/thumbnail?w=160`)} alt="" className="w-full h-full object-cover" />
                                </a>
                              ))}
                            </div>
                          </div>
                        )}
                        {!bodyPending && (
                          <div className={uiCx('flex items-center justify-between border-t border-gray-200 pt-3')}>
                            <span className={uiTypography.helper}>Result</span>
                            <InspectionResultBadge result={bodyInspection.result} />
                          </div>
                        )}
                        {!bodyPending &&
                          isInspectionResultFinal(bodyInspection.result) &&
                          !bodyInspection.auto_generated_work_order_id && (
                          <AppCard
                            className={uiCx(
                              'mt-3',
                              bodyInspection.result === 'fail'
                                ? 'border-amber-200 bg-amber-50'
                                : 'border-slate-200 bg-slate-50',
                            )}
                            bodyClassName="p-3"
                          >
                            <div className={uiCx(uiTypography.sectionTitle, 'mb-1')}>
                              {bodyInspection.result === 'fail'
                                ? 'Body inspection failed'
                                : 'Create work order (Body)'}
                            </div>
                            <p className={uiCx(uiTypography.helper, 'mb-2')}>
                              {bodyInspection.result === 'fail'
                                ? 'Create a linked work order to address the issues in the shop.'
                                : 'Inspection is complete. Create a linked work order if you still need shop follow-up.'}
                            </p>
                            <AppButton
                              type="button"
                              size="sm"
                              onClick={() =>
                                schedule.body_inspection_id && setWoModalInspectionId(schedule.body_inspection_id)
                              }
                            >
                              Create work order
                            </AppButton>
                          </AppCard>
                        )}
                        {!bodyPending && !!bodyInspection.auto_generated_work_order_id && (
                          <AppCard className="mt-3 border-green-200 bg-green-50" bodyClassName="p-3">
                            <div className={uiCx(uiTypography.sectionTitle, 'mb-2')}>Work order</div>
                            <AppButton
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-auto px-0 text-brand-red hover:bg-transparent hover:underline"
                              onClick={() => nav(`/fleet/work-orders/${bodyInspection.auto_generated_work_order_id}`)}
                            >
                              View work order
                            </AppButton>
                          </AppCard>
                        )}
                      </div>
                    ) : schedule.body_inspection_id && bodyPending && !canEditBodyInspection ? (
                      <p className="text-sm text-gray-500">This inspection cannot be edited (completed or work order linked).</p>
                    ) : schedule.body_inspection_id && bodyPending && !bodyInlineOpen ? (
                      <p className="text-sm text-gray-500">Use Start to fill the checklist here.</p>
                    ) : null}
                  </>
                )}
              </>
            )}
          </div>

          {/* Mechanical column */}
          <div
            className={`min-w-0 flex flex-col motion-safe:transition-[padding,flex-grow,flex-shrink,width] motion-safe:duration-300 motion-safe:ease-out ${
              columnLayout === 'bodyFocus' ? 'w-14 sm:w-16 shrink-0 lg:order-2' : 'flex-1 lg:order-2'
            } ${columnLayout === 'bodyFocus' ? 'p-1' : 'p-4'}`}
          >
            {columnLayout === 'bodyFocus' ? (
              <CompressedInspectionRail
                chevron="left"
                icon="🔧"
                shortLabel="Mech"
                wideLabel="Mechanical"
                onExpand={() => setColumnLayout('balanced')}
              />
            ) : (
              <>
                <div className="flex items-start gap-2 mb-3 flex-wrap gap-y-2 min-w-0">
                  <div className="flex items-center gap-2 min-w-0 flex-wrap flex-1">
                    {columnLayout === 'balanced' && (
                      <AppButton
                        type="button"
                        variant="secondary"
                        size="sm"
                        className="h-8 w-8 shrink-0 px-0 hover:border-amber-200 hover:bg-amber-50 hover:text-amber-800"
                        aria-label="Compress Body column"
                        title="Compress Body column (more room for Mechanical)"
                        onClick={() => setColumnLayout('mechFocus')}
                      >
                        <span className="block text-sm font-bold leading-none tracking-tight" aria-hidden>
                          «
                        </span>
                      </AppButton>
                    )}
                    <span className="text-xl shrink-0">🔧</span>
                    <h3 className="font-semibold text-gray-900">Mechanical</h3>
                  </div>
                  {schedule.mechanical_inspection_id && !mechPending && schedule.mechanical_result && (
                    <div className="flex shrink-0 items-center sm:ml-auto">
                      <InspectionResultBadge result={schedule.mechanical_result} />
                    </div>
                  )}
                </div>
                {mechInlineOpen && schedule.mechanical_inspection_id && mechanicalInspection && mechanicalTemplate?.sections ? (
                  <motion.div
                    className="min-w-0 overflow-x-hidden"
                    initial={reduceMotion ? false : { opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 34, mass: 0.85 }}
                  >
                    <ScheduleMechanicalInlineEditor
                      inspectionId={schedule.mechanical_inspection_id}
                      scheduleId={id}
                      inspection={asInlineRow(mechanicalInspection)}
                      fleetAsset={asset}
                      templateSections={mechanicalTemplate.sections}
                      onSaved={finishMechInline}
                      onCancel={finishMechInline}
                    />
                  </motion.div>
                ) : (
                  <>
                    {schedule.mechanical_inspection_id ? (
                      mechPending ? (
                        <AppButton
                          type="button"
                          variant="danger"
                          className="mb-4 w-full gap-2"
                          disabled={!canEditMechanicalInspection || !mechanicalTemplate?.sections}
                          onClick={() => {
                            setMechInlineOpen(true);
                            setColumnLayout(bodyInlineOpen ? 'balanced' : 'mechFocus');
                          }}
                        >
                          <span className="text-lg" aria-hidden>
                            🔧
                          </span>
                          <span>{!mechanicalTemplate?.sections ? 'Loading…' : 'Start'}</span>
                        </AppButton>
                      ) : null
                    ) : (
                      <AppEmptyState
                        title="Mechanical not created"
                        className="mb-4 border border-gray-200 bg-gray-50 py-3 shadow-none"
                      />
                    )}
                    {schedule.mechanical_inspection_id && mechanicalInspection && mechanicalTemplate?.sections && !mechInlineOpen ? (
                      <div className="space-y-4">
                        <div className="space-y-3">
                          {mechanicalTemplate.sections.map((section) => (
                            <div key={section.id}>
                              <h4 className={uiCx(uiTypography.overline, 'mb-2 font-semibold text-gray-600')}>
                                {section.title}
                              </h4>
                              <div className="space-y-1.5">
                                {section.items.map((item) => {
                                  const val = (mechanicalInspection.checklist_results as any)?.[item.key];
                                  const cond = typeof val === 'object' ? val?.status || val?.condition || '' : val || '';
                                  const norm = cond === 'ok' || cond === 'damage' || cond === 'conditional' ? cond : '';
                                  return (
                                    <div key={item.key} className="flex items-center justify-between gap-2 py-1.5 px-2 rounded bg-gray-50/80">
                                      <span className="text-sm text-gray-800">{item.label}</span>
                                      {norm ? <ChecklistConditionBadge condition={norm} /> : null}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                        {mechanicalInspection.notes && (
                          <div className={uiCx(uiRadius.card, 'bg-gray-50 p-3')}>
                            <span className={uiTypography.overline}>Observations</span>
                            <p className={uiCx(uiTypography.body, 'mt-1 whitespace-pre-wrap text-gray-700')}>
                              {mechanicalInspection.notes}
                            </p>
                          </div>
                        )}
                        {mechanicalInspection.photos && mechanicalInspection.photos.length > 0 && (
                          <div>
                            <span className={uiTypography.overline}>Photos</span>
                            <div className="flex flex-wrap gap-2 mt-2">
                              {mechanicalInspection.photos.map((photoId) => (
                                <a
                                  key={photoId}
                                  href={withFileAccessToken(`/files/${photoId}/thumbnail?w=800`)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="block w-20 h-20 rounded-lg overflow-hidden border border-gray-200 hover:ring-2 hover:ring-brand-red focus:outline-none focus:ring-2 focus:ring-brand-red"
                                >
                                  <img src={withFileAccessToken(`/files/${photoId}/thumbnail?w=160`)} alt="" className="w-full h-full object-cover" />
                                </a>
                              ))}
                            </div>
                          </div>
                        )}
                        {!mechPending && (
                          <div className={uiCx('flex items-center justify-between border-t border-gray-200 pt-3')}>
                            <span className={uiTypography.helper}>Result</span>
                            <InspectionResultBadge result={mechanicalInspection.result} />
                          </div>
                        )}
                        {!mechPending &&
                          isInspectionResultFinal(mechanicalInspection.result) &&
                          !mechanicalInspection.auto_generated_work_order_id && (
                          <AppCard
                            className={uiCx(
                              'mt-3',
                              mechanicalInspection.result === 'fail'
                                ? 'border-amber-200 bg-amber-50'
                                : 'border-slate-200 bg-slate-50',
                            )}
                            bodyClassName="p-3"
                          >
                            <div className={uiCx(uiTypography.sectionTitle, 'mb-1')}>
                              {mechanicalInspection.result === 'fail'
                                ? 'Mechanical inspection failed'
                                : 'Create work order (Mechanical)'}
                            </div>
                            <p className={uiCx(uiTypography.helper, 'mb-2')}>
                              {mechanicalInspection.result === 'fail'
                                ? 'Create a linked work order to address the issues in the shop.'
                                : 'Inspection is complete. Create a linked work order if you still need shop follow-up.'}
                            </p>
                            <AppButton
                              type="button"
                              size="sm"
                              onClick={() =>
                                schedule.mechanical_inspection_id &&
                                setWoModalInspectionId(schedule.mechanical_inspection_id)
                              }
                            >
                              Create work order
                            </AppButton>
                          </AppCard>
                        )}
                        {!mechPending && !!mechanicalInspection.auto_generated_work_order_id && (
                          <AppCard className="mt-3 border-green-200 bg-green-50" bodyClassName="p-3">
                            <div className={uiCx(uiTypography.sectionTitle, 'mb-2')}>Work order</div>
                            <AppButton
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-auto px-0 text-brand-red hover:bg-transparent hover:underline"
                              onClick={() => nav(`/fleet/work-orders/${mechanicalInspection.auto_generated_work_order_id}`)}
                            >
                              View work order
                            </AppButton>
                          </AppCard>
                        )}
                      </div>
                    ) : schedule.mechanical_inspection_id && mechPending && !canEditMechanicalInspection ? (
                      <p className="text-sm text-gray-500">This inspection cannot be edited (completed or work order linked).</p>
                    ) : schedule.mechanical_inspection_id && mechPending && !mechInlineOpen ? (
                      <p className="text-sm text-gray-500">Use Start to fill the checklist here.</p>
                    ) : null}
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </AppCard>

      <WorkOrderNewModal
        isOpen={!!woModalInspectionId}
        onClose={() => setWoModalInspectionId(null)}
        onCreated={(data) => {
          const inspId = woModalInspectionId;
          setWoModalInspectionId(null);
          if (inspId) {
            queryClient.invalidateQueries({ queryKey: ['inspection', inspId] });
          }
          queryClient.invalidateQueries({ queryKey: ['inspection-schedule', id] });
          invalidateAfterScheduleMutation();
          nav(`/fleet/work-orders/${data.id}`);
        }}
        inspectionId={woModalInspectionId}
        fleetAssetId={schedule.fleet_asset_id}
      />
    </div>
  );
}
