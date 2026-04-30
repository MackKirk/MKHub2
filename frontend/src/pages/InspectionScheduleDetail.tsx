import { useState, useEffect, useRef } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, withFileAccessToken } from '@/lib/api';
import FleetDetailHeader from '@/components/FleetDetailHeader';
import { formatDateLocal } from '@/lib/dateUtils';
import { INSPECTION_RESULT_LABELS, INSPECTION_RESULT_COLORS, SCHEDULE_STATUS_LABELS, CATEGORY_LABELS, URGENCY_LABELS, URGENCY_COLORS } from '@/lib/fleetBadges';
import toast from 'react-hot-toast';
import {
  ScheduleBodyInlineEditor,
  ScheduleMechanicalInlineEditor,
  type InlineInspectionRow,
} from '@/pages/FleetInspectionScheduleInlineEditors';
import { useConfirm } from '@/components/ConfirmProvider';
import WorkOrderNewModal from '@/components/fleet/WorkOrderNewModal';

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

const CONDITION_STYLES: Record<string, string> = {
  ok: 'bg-green-100 text-green-800',
  damage: 'bg-red-100 text-red-800',
  conditional: 'bg-amber-100 text-amber-800',
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
      className="flex flex-1 flex-col items-stretch rounded-lg bg-gradient-to-b from-gray-100 to-gray-50 ring-1 ring-gray-200/90 hover:from-gray-200/80 hover:to-gray-100 min-h-[120px] lg:min-h-[200px] overflow-hidden"
    >
      <div className="flex items-center justify-center py-1.5 bg-gray-200/90 border-b border-gray-300/80 shrink-0">
        <span
          className="inline-flex p-1.5 rounded-md border border-gray-200 bg-white text-gray-600 shadow-sm pointer-events-none"
          aria-hidden
        >
          <span className="block text-sm font-bold leading-none tracking-tight">
            {chevron === 'right' ? '»' : '«'}
          </span>
        </span>
      </div>
      <div className="flex flex-1 flex-col items-center justify-center gap-1 py-2 text-center px-0.5">
        <span className="text-lg" aria-hidden>
          {icon}
        </span>
        <span className="text-[10px] font-semibold text-gray-700 [writing-mode:vertical-rl] rotate-180 max-lg:hidden">{shortLabel}</span>
        <span className="text-[10px] font-semibold text-gray-700 lg:hidden">{wideLabel}</span>
        <span className="text-[10px] font-medium text-gray-600">Expand</span>
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

  if (!id) {
    return (
      <div className="p-4">
        <button type="button" onClick={goBackFromSchedule} className="text-brand-red hover:underline">
          Back to inspections
        </button>
        <p className="mt-4 text-gray-500">Invalid schedule ID</p>
      </div>
    );
  }

  if (isPending || !schedule) {
    return (
      <div className="p-4">
        <div className="animate-pulse rounded-xl border bg-white p-6">Loading…</div>
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

  const todayLabel = new Date().toLocaleDateString('en-CA', {
    weekday: 'long',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  return (
    <div className="space-y-4 min-w-0 overflow-x-hidden">
      <FleetDetailHeader
        onBack={goBackFromSchedule}
        title={<span className="text-sm font-semibold text-gray-900">Inspection</span>}
        subtitle={null}
        actions={isAdmin ? (
          <button
            type="button"
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
            disabled={deleteScheduleMutation.isPending}
            className="px-3 py-1.5 rounded-lg border border-red-200 bg-red-50 text-red-700 text-xs font-medium hover:bg-red-100 disabled:opacity-50"
          >
            {deleteScheduleMutation.isPending ? 'Deleting…' : 'Delete'}
          </button>
        ) : undefined}
        right={
          <div className="text-right">
            <div className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">Today</div>
            <div className="text-xs font-semibold text-gray-700 mt-0.5">{todayLabel}</div>
          </div>
        }
      />

      {/* Hero section - same layout as Work Order: asset photo + key info */}
      <div className="rounded-xl border bg-white overflow-hidden p-4">
        <div className="flex gap-4 items-start">
          <div className="w-48 flex-shrink-0">
            <div className="w-48 h-36 rounded-xl border border-gray-200 overflow-hidden bg-gray-100">
              {assetPhotoUrl ? (
                <img src={assetPhotoUrl} alt={asset?.name || 'Vehicle'} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-400">
                  <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1h-1M4 12a2 2 0 110 4m0-4a2 2 0 100 4m0-4v2m0-4V6m16 4a2 2 0 110 4m0-4a2 2 0 100 4m0-4v2m0-4V6" />
                  </svg>
                </div>
              )}
            </div>
            {schedule.fleet_asset_id && (
              <button
                type="button"
                onClick={() => nav(`/fleet/assets/${schedule.fleet_asset_id}`)}
                className="mt-2 text-xs font-medium text-brand-red hover:underline"
              >
                View asset
              </button>
            )}
          </div>
          <div className="flex-1 min-w-0 grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4">
            <div>
              <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">Status</span>
              <div className="mt-0.5">
                <span
                  className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                    schedule.status === 'scheduled'
                      ? 'bg-blue-100 text-blue-800'
                      : schedule.status === 'in_progress'
                        ? 'bg-amber-100 text-amber-800'
                        : schedule.status === 'completed'
                          ? 'bg-green-100 text-green-800'
                          : 'bg-gray-100 text-gray-800'
                  }`}
                >
                  {SCHEDULE_STATUS_LABELS[schedule.status] ?? schedule.status}
                </span>
              </div>
            </div>
            <div>
              <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">Category</span>
              <div className="text-sm font-semibold text-gray-900 mt-0.5">{CATEGORY_LABELS[schedule.category] ?? schedule.category}</div>
            </div>
            <div>
              <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">Urgency</span>
              <div className="mt-0.5">
                <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${URGENCY_COLORS[schedule.urgency] || 'bg-gray-100 text-gray-800'}`}>
                  {URGENCY_LABELS[schedule.urgency] ?? schedule.urgency}
                </span>
              </div>
            </div>
            <div>
              <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">Vehicle</span>
              <div className="text-sm font-semibold text-gray-900 mt-0.5 truncate" title={schedule.fleet_asset_name || schedule.fleet_asset_id}>
                {asset?.unit_number || schedule.fleet_asset_name || schedule.fleet_asset_id || '—'}
              </div>
            </div>
            <div>
              <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">Scheduled</span>
              <div className="text-sm font-semibold text-gray-900 mt-0.5">{formatDateLocal(new Date(schedule.scheduled_at))}</div>
            </div>
            <div>
              <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">Created</span>
              <div className="text-sm font-semibold text-gray-900 mt-0.5">{schedule.created_at ? new Date(schedule.created_at).toLocaleDateString() : '—'}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Inspections: two columns with optional compress + inline editors (no separate page). */}
      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/80">
          <h2 className="text-sm font-semibold text-gray-900">Inspections</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Start opens the checklist here; Body and Mechanical can run together. Chevrons in each header compress the other column; use the narrow gray strip to expand again.
          </p>
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
                    <div className="flex items-center shrink-0 self-center">
                      <span
                        className={`text-xs px-2 py-0.5 rounded font-medium ${
                          INSPECTION_RESULT_COLORS[schedule.body_result] || 'bg-gray-200 text-gray-800'
                        }`}
                      >
                        {INSPECTION_RESULT_LABELS[schedule.body_result] ?? schedule.body_result}
                      </span>
                    </div>
                  )}
                  <div className="flex flex-1 min-w-0 flex-wrap items-center justify-end gap-2">
                    <h3 className="font-semibold text-gray-900">Body / Exterior</h3>
                    <span className="text-xl shrink-0">🚗</span>
                    {columnLayout === 'balanced' && (
                      <button
                        type="button"
                        aria-label="Compress Mechanical column"
                        title="Compress Mechanical column (more room for Body)"
                        onClick={() => setColumnLayout('bodyFocus')}
                        className="p-1.5 rounded-md border border-gray-200 bg-white text-gray-600 hover:bg-amber-50 hover:border-amber-200 hover:text-amber-800 shadow-sm shrink-0"
                      >
                        <span className="block text-sm font-bold leading-none tracking-tight" aria-hidden>
                          »
                        </span>
                      </button>
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
                        <button
                          type="button"
                          disabled={!canEditBodyInspection || !bodyTemplate?.areas}
                          onClick={() => {
                            setBodyInlineOpen(true);
                            setColumnLayout(mechInlineOpen ? 'balanced' : 'bodyFocus');
                          }}
                          className="w-full mb-4 px-4 py-3 rounded-xl border-2 border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-900 font-medium text-sm flex items-center justify-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <span className="text-lg">🚗</span>
                          <span>{!bodyTemplate?.areas ? 'Loading…' : 'Start'}</span>
                        </button>
                      ) : null
                    ) : (
                      <div className="mb-4 py-3 px-4 rounded-xl border border-gray-200 bg-gray-50 text-gray-500 text-sm text-center">
                        Body not created
                      </div>
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
                                {cond && (
                                  <span
                                    className={`shrink-0 w-9 h-9 flex items-center justify-center rounded-xl text-lg font-bold ${CONDITION_STYLES[cond] || 'bg-gray-100 text-gray-700'}`}
                                    title={CONDITION_LABELS[cond] ?? cond}
                                  >
                                    {CONDITION_ICONS[cond] ?? cond}
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                        {bodyInspection.notes && (
                          <div className="rounded-lg bg-gray-50 p-3">
                            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Observations</span>
                            <p className="text-sm text-gray-700 mt-1 whitespace-pre-wrap">{bodyInspection.notes}</p>
                          </div>
                        )}
                        {bodyInspection.photos && bodyInspection.photos.length > 0 && (
                          <div>
                            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Photos</span>
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
                          <div className="pt-3 border-t border-gray-200 flex items-center justify-between">
                            <span className="text-xs font-medium text-gray-500">Result</span>
                            <span
                              className={`inline-flex px-2.5 py-1 rounded-md text-sm font-medium ${INSPECTION_RESULT_COLORS[bodyInspection.result] || 'bg-gray-100 text-gray-800'}`}
                            >
                              {INSPECTION_RESULT_LABELS[bodyInspection.result] ?? bodyInspection.result}
                            </span>
                          </div>
                        )}
                        {!bodyPending &&
                          isInspectionResultFinal(bodyInspection.result) &&
                          !bodyInspection.auto_generated_work_order_id && (
                          <div
                            className={`rounded-lg border p-3 mt-3 ${
                              bodyInspection.result === 'fail'
                                ? 'border-amber-200 bg-amber-50'
                                : 'border-slate-200 bg-slate-50'
                            }`}
                          >
                            <div className="text-sm font-medium text-gray-900 mb-1">
                              {bodyInspection.result === 'fail'
                                ? 'Body inspection failed'
                                : 'Create work order (Body)'}
                            </div>
                            <p className="text-xs text-gray-600 mb-2">
                              {bodyInspection.result === 'fail'
                                ? 'Create a linked work order to address the issues in the shop.'
                                : 'Inspection is complete. Create a linked work order if you still need shop follow-up.'}
                            </p>
                            <button
                              type="button"
                              onClick={() =>
                                schedule.body_inspection_id && setWoModalInspectionId(schedule.body_inspection_id)
                              }
                              className="px-3 py-1.5 bg-brand-red text-white rounded-lg hover:bg-red-700 text-xs font-medium"
                            >
                              Create work order
                            </button>
                          </div>
                        )}
                        {!bodyPending && !!bodyInspection.auto_generated_work_order_id && (
                          <div className="rounded-lg border border-green-200 bg-green-50 p-3 mt-3">
                            <div className="text-sm font-medium text-gray-900 mb-2">Work order</div>
                            <button
                              type="button"
                              onClick={() => nav(`/fleet/work-orders/${bodyInspection.auto_generated_work_order_id}`)}
                              className="text-xs font-medium text-brand-red hover:underline"
                            >
                              View work order
                            </button>
                          </div>
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
                      <button
                        type="button"
                        aria-label="Compress Body column"
                        title="Compress Body column (more room for Mechanical)"
                        onClick={() => setColumnLayout('mechFocus')}
                        className="p-1.5 rounded-md border border-gray-200 bg-white text-gray-600 hover:bg-amber-50 hover:border-amber-200 hover:text-amber-800 shadow-sm shrink-0"
                      >
                        <span className="block text-sm font-bold leading-none tracking-tight" aria-hidden>
                          «
                        </span>
                      </button>
                    )}
                    <span className="text-xl shrink-0">🔧</span>
                    <h3 className="font-semibold text-gray-900">Mechanical</h3>
                  </div>
                  {schedule.mechanical_inspection_id && !mechPending && schedule.mechanical_result && (
                    <div className="flex items-center shrink-0 sm:ml-auto">
                      <span
                        className={`text-xs px-2 py-0.5 rounded font-medium ${
                          INSPECTION_RESULT_COLORS[schedule.mechanical_result] || 'bg-gray-200 text-gray-800'
                        }`}
                      >
                        {INSPECTION_RESULT_LABELS[schedule.mechanical_result] ?? schedule.mechanical_result}
                      </span>
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
                        <button
                          type="button"
                          disabled={!canEditMechanicalInspection || !mechanicalTemplate?.sections}
                          onClick={() => {
                            setMechInlineOpen(true);
                            setColumnLayout(bodyInlineOpen ? 'balanced' : 'mechFocus');
                          }}
                          className="w-full mb-4 px-4 py-3 rounded-xl border-2 border-gray-300 bg-gray-50 hover:bg-gray-100 text-gray-900 font-medium text-sm flex items-center justify-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <span className="text-lg">🔧</span>
                          <span>{!mechanicalTemplate?.sections ? 'Loading…' : 'Start'}</span>
                        </button>
                      ) : null
                    ) : (
                      <div className="mb-4 py-3 px-4 rounded-xl border border-gray-200 bg-gray-50 text-gray-500 text-sm text-center">
                        Mechanical not created
                      </div>
                    )}
                    {schedule.mechanical_inspection_id && mechanicalInspection && mechanicalTemplate?.sections && !mechInlineOpen ? (
                      <div className="space-y-4">
                        <div className="space-y-3">
                          {mechanicalTemplate.sections.map((section) => (
                            <div key={section.id}>
                              <h4 className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">{section.title}</h4>
                              <div className="space-y-1.5">
                                {section.items.map((item) => {
                                  const val = (mechanicalInspection.checklist_results as any)?.[item.key];
                                  const cond = typeof val === 'object' ? val?.status || val?.condition || '' : val || '';
                                  const norm = cond === 'ok' || cond === 'damage' || cond === 'conditional' ? cond : '';
                                  return (
                                    <div key={item.key} className="flex items-center justify-between gap-2 py-1.5 px-2 rounded bg-gray-50/80">
                                      <span className="text-sm text-gray-800">{item.label}</span>
                                      {norm && (
                                        <span
                                          className={`shrink-0 w-9 h-9 flex items-center justify-center rounded-xl text-lg font-bold ${CONDITION_STYLES[norm] || 'bg-gray-100 text-gray-700'}`}
                                          title={CONDITION_LABELS[norm] ?? norm}
                                        >
                                          {CONDITION_ICONS[norm] ?? norm}
                                        </span>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                        {mechanicalInspection.notes && (
                          <div className="rounded-lg bg-gray-50 p-3">
                            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Observations</span>
                            <p className="text-sm text-gray-700 mt-1 whitespace-pre-wrap">{mechanicalInspection.notes}</p>
                          </div>
                        )}
                        {mechanicalInspection.photos && mechanicalInspection.photos.length > 0 && (
                          <div>
                            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Photos</span>
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
                          <div className="pt-3 border-t border-gray-200 flex items-center justify-between">
                            <span className="text-xs font-medium text-gray-500">Result</span>
                            <span
                              className={`inline-flex px-2.5 py-1 rounded-md text-sm font-medium ${INSPECTION_RESULT_COLORS[mechanicalInspection.result] || 'bg-gray-100 text-gray-800'}`}
                            >
                              {INSPECTION_RESULT_LABELS[mechanicalInspection.result] ?? mechanicalInspection.result}
                            </span>
                          </div>
                        )}
                        {!mechPending &&
                          isInspectionResultFinal(mechanicalInspection.result) &&
                          !mechanicalInspection.auto_generated_work_order_id && (
                          <div
                            className={`rounded-lg border p-3 mt-3 ${
                              mechanicalInspection.result === 'fail'
                                ? 'border-amber-200 bg-amber-50'
                                : 'border-slate-200 bg-slate-50'
                            }`}
                          >
                            <div className="text-sm font-medium text-gray-900 mb-1">
                              {mechanicalInspection.result === 'fail'
                                ? 'Mechanical inspection failed'
                                : 'Create work order (Mechanical)'}
                            </div>
                            <p className="text-xs text-gray-600 mb-2">
                              {mechanicalInspection.result === 'fail'
                                ? 'Create a linked work order to address the issues in the shop.'
                                : 'Inspection is complete. Create a linked work order if you still need shop follow-up.'}
                            </p>
                            <button
                              type="button"
                              onClick={() =>
                                schedule.mechanical_inspection_id &&
                                setWoModalInspectionId(schedule.mechanical_inspection_id)
                              }
                              className="px-3 py-1.5 bg-brand-red text-white rounded-lg hover:bg-red-700 text-xs font-medium"
                            >
                              Create work order
                            </button>
                          </div>
                        )}
                        {!mechPending && !!mechanicalInspection.auto_generated_work_order_id && (
                          <div className="rounded-lg border border-green-200 bg-green-50 p-3 mt-3">
                            <div className="text-sm font-medium text-gray-900 mb-2">Work order</div>
                            <button
                              type="button"
                              onClick={() => nav(`/fleet/work-orders/${mechanicalInspection.auto_generated_work_order_id}`)}
                              className="text-xs font-medium text-brand-red hover:underline"
                            >
                              View work order
                            </button>
                          </div>
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
      </div>

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
