import { Fragment, useState, useMemo, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  CalendarDays,
  CalendarRange,
  CloudSun,
  Moon,
  SlidersHorizontal,
  Sun,
  Sunrise,
  type LucideIcon,
} from 'lucide-react';
import { api, withFileAccessToken } from '@/lib/api';
import toast from 'react-hot-toast';
import { useConfirm } from '@/components/ConfirmProvider';
import EditShiftModal from '@/components/EditShiftModal';
import { formatDateLocal, getTodayLocal, formatDateTimeVancouver } from '@/lib/dateUtils';
import OverlayPortal from '@/components/OverlayPortal';
import {
  hasProjectFeatureWritePermission,
  hasProjectLineWritePermission,
  isAdminRole,
} from '@/lib/projectLinePermissionKeys';
import { createShiftQuickInfo } from '@/lib/formModalQuickInfo';
import { employeesDirectoryQueryKey, fetchEmployeesDirectory } from '@/lib/employeesQuery';
import { PROJECT_DIVISIONS_QUERY_KEY } from '@/lib/businessLine';
import { getProjectDivisionLabel } from '@/lib/projectListRowUtils';
import { getUserDisplayName } from '@/lib/userDisplay';
import {
  SHIFT_TIME_PRESET_OPTIONS,
  detectPreset,
  resolvePresetTimes,
  type ShiftTimePreset,
} from '@/lib/shiftTimePresets';
import {
  AppButton,
  AppCalendarBase,
  type AppCalendarDay,
  AppBadge,
  AppCard,
  AppCheckbox,
  AppChoiceCards,
  AppControlLabelRow,
  AppDatePicker,
  AppEmptyState,
  AppFormModal,
  AppInput,
  AppSectionHeader,
  AppSelect,
  AppTabs,
  type AppTabItem,
  AppTimePicker,
  AppTooltip,
  AppUserSelect,
  appSectionPresetProps,
  uiBorders,
  uiColors,
  uiCx,
  uiLayout,
  uiRadius,
  uiSpacing,
  uiTypography,
} from '@/components/ui';
import { jobTypeSelectOptions } from '@/lib/jobTypes';
import { shiftAckMeta, shiftAckTracked } from '@/lib/shiftAck';
import ShiftNoteField from '@/components/ShiftNoteField';
import { ShiftCrewMemberCards } from '@/components/ShiftCrewMemberCards';
import { ShiftWorkerDivisionPicker } from '@/components/ShiftWorkerDivisionPicker';
import { persistShiftNoteLibrary } from '@/lib/shiftNoteLibrary';

// Helper function to convert 24h time (HH:MM:SS or HH:MM) to 12h format (h:mm AM/PM)
function formatTime12h(timeStr: string | null | undefined): string {
  if (!timeStr || timeStr === '--:--' || timeStr === '-') return timeStr || '--:--';
  const parts = timeStr.split(':');
  if (parts.length < 2) return timeStr;
  const hours = parseInt(parts[0], 10);
  const minutes = parts[1];
  if (isNaN(hours)) return timeStr;
  const period = hours >= 12 ? 'PM' : 'AM';
  const hours12 = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
  return `${hours12}:${minutes} ${period}`;
}

function shiftHasNotes(shift: { notes?: string | null }): boolean {
  return Boolean(shift.notes?.trim());
}

function shiftNotesPreview(notes: string, maxLen = 120): string {
  const trimmed = notes.trim();
  if (trimmed.length <= maxLen) return trimmed;
  return `${trimmed.slice(0, maxLen)}…`;
}

const SHIFT_TIME_PRESET_ICONS: Record<ShiftTimePreset, LucideIcon> = {
  all_day: Sun,
  morning: Sunrise,
  afternoon: CloudSun,
  evening: Moon,
  custom: SlidersHorizontal,
};

const CREATE_SHIFT_STEPS_SINGLE = [
  'Choose people',
  'Choose dates & time',
  'Notes & details',
  'Review',
] as const;

const CREATE_SHIFT_STEPS_CREW = [
  'Choose people',
  'Crew',
  'Choose dates & time',
  'Notes & details',
  'Review',
] as const;

type DispatchDayShiftGroup =
  | { kind: 'solo'; shift: any }
  | { kind: 'crew'; crewGroupId: string; shifts: any[] };

/** Group same-day shifts that share a crew_group_id (2+ members). Lead first. */
function groupDispatchDayShifts(dayShifts: any[]): DispatchDayShiftGroup[] {
  const list = Array.isArray(dayShifts) ? dayShifts : [];
  const seenCrew = new Set<string>();
  const items: DispatchDayShiftGroup[] = [];

  for (const shift of list) {
    const gid = shift?.crew_group_id ? String(shift.crew_group_id) : '';
    if (!gid) {
      items.push({ kind: 'solo', shift });
      continue;
    }
    if (seenCrew.has(gid)) continue;
    seenCrew.add(gid);
    const members = list
      .filter((s) => String(s?.crew_group_id || '') === gid)
      .slice()
      .sort((a, b) => {
        if (a?.crew_role === 'lead' && b?.crew_role !== 'lead') return -1;
        if (b?.crew_role === 'lead' && a?.crew_role !== 'lead') return 1;
        return 0;
      });
    if (members.length >= 2) {
      items.push({ kind: 'crew', crewGroupId: gid, shifts: members });
    } else if (members[0]) {
      items.push({ kind: 'solo', shift: members[0] });
    }
  }

  return items;
}

export default function DispatchTab({
  projectId,
  statusLabel,
  businessLine,
  designSystem,
}: {
  projectId: string;
  statusLabel?: string;
  businessLine?: string | null;
  designSystem?: boolean;
}) {
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const location = useLocation();
  const nav = useNavigate();

  const invalidateWorkloadTabCounts = () => {
    queryClient.invalidateQueries({ queryKey: ['projectShifts', projectId] });
    queryClient.invalidateQueries({ queryKey: ['timesheet', projectId] });
  };
  
  // Check for subtab query parameter
  const searchParams = new URLSearchParams(location.search);
  const initialView = (searchParams.get('subtab') === 'pending' ? 'pending' : 'calendar') as 'calendar' | 'pending';
  const [view, setView] = useState<'calendar' | 'pending'>(initialView);
  
  // Check permissions for workload (line-scoped; admin bypasses)
  const { data: me } = useQuery({ queryKey:['me'], queryFn: ()=>api<any>('GET','/auth/me') });
  const isAdmin = isAdminRole(me?.roles);
  const permissions = new Set(me?.permissions || []);
  const canWriteWorkload = hasProjectFeatureWritePermission(
    permissions,
    businessLine,
    'workload',
    isAdmin
  );
  const canEditOnsiteLeads = hasProjectLineWritePermission(
    permissions,
    businessLine,
    isAdmin,
    location.pathname,
  );

  // Check if editing is restricted based on status (only Finished restricts editing for workload)
  const isEditingRestricted = useMemo(() => {
    if (!statusLabel) return false;
    const statusLower = String(statusLabel).trim().toLowerCase();
    return statusLower === 'finished' || statusLower === 'cancelled' || statusLower === 'canceled';
  }, [statusLabel]);

  const canEditWorkload = canWriteWorkload && !isEditingRestricted;

  // Update view when URL search params change
  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const subtabParam = searchParams.get('subtab');
    if (subtabParam === 'pending') {
      if (canEditWorkload) {
        setView('pending');
      } else {
        // Redirect to calendar if no permission
        setView('calendar');
        nav(location.pathname + '?tab=dispatch', { replace: true });
      }
    } else if (subtabParam === 'calendar' || !subtabParam) {
      setView('calendar');
    }
  }, [location.search, canEditWorkload, nav, location.pathname]);
  
  // Week view: anchor date is the Sunday of the current week
  const [anchorDate, setAnchorDate] = useState<Date>(() => {
    const d = new Date();
    // Get Sunday of current week
    const day = d.getDay(); // 0 = Sunday, 6 = Saturday
    d.setDate(d.getDate() - day); // Go back to Sunday
    d.setHours(0, 0, 0, 0);
    return d;
  });
  
  // Selected date for highlighting
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    return formatDateLocal(new Date());
  });

  // Calculate week range for API query (Sunday to Saturday)
  const weekStart = useMemo(() => {
    // anchorDate is already Sunday
    return new Date(anchorDate);
  }, [anchorDate]);

  const weekEnd = useMemo(() => {
    // Saturday is 6 days after Sunday
    const saturday = new Date(anchorDate);
    saturday.setDate(saturday.getDate() + 6);
    return saturday;
  }, [anchorDate]);

  const dateRange = useMemo(() => {
    return `${formatDateLocal(weekStart)},${formatDateLocal(weekEnd)}`;
  }, [weekStart, weekEnd]);

  // Generate week days (Sunday to Saturday)
  const days = useMemo(() => {
    const cells: { date: Date; key: string; dayNumber: number }[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(anchorDate);
      d.setDate(d.getDate() + i);
      cells.push({ 
        date: d, 
        key: formatDateLocal(d),
        dayNumber: d.getDate()
      });
    }
    return cells;
  }, [anchorDate]);

  const weekLabel = useMemo(() => {
    const start = weekStart.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
    const end = weekEnd.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
    return `${start} - ${end}`;
  }, [weekStart, weekEnd]);

  const { data: shifts, refetch: refetchShifts } = useQuery({
    queryKey: ['dispatch-shifts', projectId, dateRange],
    queryFn: () => api<any[]>('GET', '/dispatch/projects/' + projectId + '/shifts?date_range=' + dateRange),
    refetchInterval: 5000, // Refetch every 5 seconds for real-time updates
  });

  const { data: pendingAttendance, refetch: refetchPending } = useQuery({
    queryKey: ['dispatch-pending', projectId],
    queryFn: () => api<any[]>('GET', '/dispatch/attendance/pending?project_id=' + projectId),
    enabled: view === 'pending',
    refetchInterval: 5000, // Refetch every 5 seconds for real-time updates
  });

  const { data: employees, isPending: employeesLoading } = useQuery({
    // Match ProjectDetail cache key so Dispatch does not re-fetch 5000 rows on tab open.
    queryKey: employeesDirectoryQueryKey({ limit: 5000 }),
    queryFn: () => fetchEmployeesDirectory({ limit: 5000 }),
    staleTime: 5 * 60 * 1000,
  });

  const { data: project } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => api<any>('GET', '/projects/' + projectId),
  });

  const { data: settings } = useQuery({
    queryKey: ['settings-bundle'],
    queryFn: () => api<Record<string, any[]>>('GET', '/settings'),
  });

  // Get default values from settings
  const defaultBreakMin = useMemo(() => {
    if (!settings) return 30; // Default value while loading
    const timesheetItems = (settings.timesheet || []) as any[];
    const breakItem = timesheetItems.find((i: any) => i.label === 'default_break_minutes');
    const value = breakItem?.value ? parseInt(breakItem.value, 10) : 30;
    return isNaN(value) ? 30 : value; // Ensure it's always a valid number
  }, [settings]);

  const defaultGeofenceRadius = useMemo(() => {
    if (!settings) return 150; // Default value while loading
    const timesheetItems = (settings.timesheet || []) as any[];
    const radiusItem = timesheetItems.find((i: any) => i.label === 'default_geofence_radius_meters');
    const value = radiusItem?.value ? parseInt(radiusItem.value, 10) : 150;
    return isNaN(value) ? 150 : value; // Ensure it's always a valid number
  }, [settings]);

  const [createShiftModal, setCreateShiftModal] = useState(false);
  const [editShiftModal, setEditShiftModal] = useState<any>(null);
  const [deleteMode, setDeleteMode] = useState(false);
  const [selectedShiftsForDelete, setSelectedShiftsForDelete] = useState<Set<string>>(new Set());

  const workloadTabs = useMemo((): AppTabItem[] => {
    const tabs: AppTabItem[] = [{ key: 'calendar', label: 'Calendar' }];
    if (canEditWorkload) {
      tabs.push({
        key: 'pending',
        label: 'Pending Queue',
        count: pendingAttendance?.length ?? 0,
      });
    }
    return tabs;
  }, [canEditWorkload, pendingAttendance?.length]);

  const setWorkloadView = (key: string) => {
    const next = key as 'calendar' | 'pending';
    setView(next);
    const sp = new URLSearchParams(location.search);
    sp.set('tab', 'dispatch');
    if (next === 'pending') sp.set('subtab', 'pending');
    else sp.delete('subtab');
    nav(`${location.pathname}?${sp.toString()}`, { replace: true });
  };

  const jobTypeOptions = useMemo(
    () => jobTypeSelectOptions(settings?.job_types),
    [settings?.job_types],
  );

  const alertBanners = (
    <>
      {isEditingRestricted && statusLabel && (
        <div
          className={
            designSystem
              ? uiCx(
                  'rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900',
                )
              : 'mb-4 rounded border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800'
          }
        >
          <strong>Editing Restricted:</strong> This project has status &quot;{statusLabel}&quot; which
          does not allow editing workload.
        </div>
      )}
      {!canWriteWorkload && !isEditingRestricted && (
        <div
          className={
            designSystem
              ? uiCx(uiRadius.card, uiBorders.subtle, uiColors.surfaceSubtle, 'p-3 text-sm text-gray-700')
              : 'mb-4 rounded border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700'
          }
        >
          <strong>View only:</strong> You can view the workload calendar but cannot create or edit
          shifts.
        </div>
      )}
    </>
  );

  const viewTabs = designSystem ? (
    <AppTabs tabs={workloadTabs} value={view} onChange={setWorkloadView} />
  ) : (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => setView('calendar')}
        className={`rounded px-3 py-1.5 text-sm font-semibold ${view === 'calendar' ? 'bg-brand-red text-white' : 'bg-gray-100 text-gray-700'}`}
      >
        Calendar
      </button>
      {canEditWorkload && (
        <button
          type="button"
          onClick={() => setView('pending')}
          className={`rounded px-3 py-1.5 text-sm font-semibold ${view === 'pending' ? 'bg-brand-red text-white' : 'bg-gray-100 text-gray-700'}`}
        >
          Pending Queue
          {pendingAttendance && pendingAttendance.length > 0 && (
            <span className="ml-1.5 rounded-full bg-red-500 px-1.5 py-0.5 text-xs font-semibold text-white">
              {pendingAttendance.length}
            </span>
          )}
        </button>
      )}
    </div>
  );

  const goPrevWeek = () => {
    const newDate = new Date(anchorDate);
    newDate.setDate(newDate.getDate() - 7);
    setAnchorDate(newDate);
  };
  const goNextWeek = () => {
    const newDate = new Date(anchorDate);
    newDate.setDate(newDate.getDate() + 7);
    setAnchorDate(newDate);
  };
  const goTodayWeek = () => {
    const n = new Date();
    const day = n.getDay();
    n.setDate(n.getDate() - day);
    n.setHours(0, 0, 0, 0);
    setAnchorDate(n);
    setSelectedDate(formatDateLocal(n));
  };
  const onWeekDatePick = (selected: string) => {
    setSelectedDate(selected);
    const selectedDateObj = new Date(selected);
    const day = selectedDateObj.getDay();
    selectedDateObj.setDate(selectedDateObj.getDate() - day);
    selectedDateObj.setHours(0, 0, 0, 0);
    setAnchorDate(selectedDateObj);
  };

  const handleNotifyWorkers = async () => {
    try {
      const shiftsInRange = shifts || [];
      if (shiftsInRange.length === 0) {
        toast.error('No shifts to notify');
        return;
      }
      const workerIds = [...new Set(shiftsInRange.map((s: any) => s.worker_id))];
      await api('POST', '/dispatch/projects/' + projectId + '/notify-shifts', {
        date_range: dateRange,
        worker_ids: workerIds,
      });
      toast.success(
        `Notifications sent to ${workerIds.length} worker${workerIds.length > 1 ? 's' : ''}`,
      );
    } catch (e: any) {
      toast.error(e.response?.data?.detail || e.message || 'Failed to send notifications');
    }
  };

  const toggleDeleteMode = () => {
    if (deleteMode) {
      setDeleteMode(false);
      setSelectedShiftsForDelete(new Set());
    } else {
      setDeleteMode(true);
      setSelectedShiftsForDelete(new Set());
    }
  };

  const handleDeleteSelectedShifts = async () => {
    try {
      const shiftsToDelete = (shifts || []).filter((s: any) => selectedShiftsForDelete.has(s.id));
      const pastShifts: any[] = [];
      if (shiftsToDelete.length === 0) {
        toast.error('No shifts selected');
        return;
      }
      let messageText = `Are you sure you want to delete ${shiftsToDelete.length} shift(s)? This action cannot be undone.`;
      if (pastShifts.length > 0) {
        messageText +=
          '\n\nNote: ' +
          pastShifts.length +
          ' shift(s) from past dates cannot be deleted and were excluded.';
      }
      const confirmResult = await confirm({
        title: 'Delete Shifts',
        message: messageText,
        confirmText: 'Delete',
        cancelText: 'Cancel',
      });
      if (confirmResult !== 'confirm') return;
      let successCount = 0;
      let errorCount = 0;
      for (const shift of shiftsToDelete) {
        try {
          await api('DELETE', '/dispatch/shifts/' + shift.id);
          successCount++;
        } catch (e: any) {
          errorCount++;
          console.error(`Failed to delete shift ${shift.id}:`, e);
        }
      }
      if (errorCount > 0) {
        toast.error(`${successCount} shift(s) deleted, ${errorCount} failed`);
      } else {
        toast.success(`${successCount} shift(s) deleted successfully`);
      }
      await refetchShifts();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['attendances'] }),
        queryClient.invalidateQueries({ queryKey: ['shifts'] }),
        queryClient.invalidateQueries({ queryKey: ['timesheetLogs'] }),
        queryClient.invalidateQueries({ queryKey: ['timesheetLogsMini'] }),
        queryClient.invalidateQueries({ queryKey: ['timesheet'] }),
        queryClient.invalidateQueries({ queryKey: ['dispatch-shifts-all'] }),
        queryClient.invalidateQueries({ queryKey: ['projectRecentActivity', projectId] }),
      ]);
      invalidateWorkloadTabCounts();
      await Promise.all([
        queryClient.refetchQueries({ queryKey: ['timesheet'] }),
        queryClient.refetchQueries({ queryKey: ['timesheetLogsMini'] }),
        queryClient.refetchQueries({ queryKey: ['dispatch-shifts-all'] }),
      ]);
      setDeleteMode(false);
      setSelectedShiftsForDelete(new Set());
    } catch (e: any) {
      toast.error(e.message || 'Failed to delete shifts');
    }
  };

  const workloadActionButtons = canEditWorkload ? (
    designSystem ? (
      <div className="flex flex-wrap items-center gap-2">
        <AppButton
          variant="secondary"
          size="sm"
          onClick={handleNotifyWorkers}
          title="Send push notifications and emails to workers with scheduled shifts"
        >
          Notify Workers
        </AppButton>
        <AppButton size="sm" onClick={() => setCreateShiftModal(true)} disabled={deleteMode}>
          + Create Shift
        </AppButton>
        <AppButton
          variant={deleteMode ? 'secondary' : 'danger'}
          size="sm"
          onClick={toggleDeleteMode}
        >
          {deleteMode ? 'Cancel Delete' : 'Delete Shifts'}
        </AppButton>
        {deleteMode && selectedShiftsForDelete.size > 0 && (
          <AppButton variant="danger" size="sm" onClick={handleDeleteSelectedShifts}>
            Delete {selectedShiftsForDelete.size} Selected
          </AppButton>
        )}
      </div>
    ) : (
      <div className="flex items-center gap-2">
        <button
          onClick={handleNotifyWorkers}
          className="px-3 py-1.5 rounded text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-1.5"
          title="Send push notifications and emails to workers with scheduled shifts"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
            />
          </svg>
          Notify Workers
        </button>
        <button
          onClick={() => setCreateShiftModal(true)}
          className="px-3 py-1.5 rounded text-sm font-semibold bg-brand-red text-white"
          disabled={deleteMode}
        >
          + Create Shift
        </button>
        <button
          onClick={toggleDeleteMode}
          className={`px-3 py-1.5 rounded text-sm font-semibold text-white ${
            deleteMode ? 'bg-gray-600 hover:bg-gray-700' : 'bg-red-600 hover:bg-red-700'
          }`}
        >
          {deleteMode ? 'Cancel Delete' : 'Delete Shifts'}
        </button>
        {deleteMode && selectedShiftsForDelete.size > 0 && (
          <button
            onClick={handleDeleteSelectedShifts}
            className="px-3 py-1.5 rounded text-sm font-semibold bg-red-600 hover:bg-red-700 text-white"
          >
            Delete {selectedShiftsForDelete.size} Selected
          </button>
        )}
      </div>
    )
  ) : null;

  const calendarNavDs = (
    <div className="flex flex-wrap items-center gap-2">
      <AppButton variant="secondary" size="sm" onClick={goPrevWeek}>
        ← Prev
      </AppButton>
      <AppDatePicker
        value={selectedDate}
        onChange={(e) => onWeekDatePick(e.target.value)}
        triggerClassName="w-[140px]"
      />
      <AppButton variant="secondary" size="sm" onClick={goNextWeek}>
        Next →
      </AppButton>
      <span className={uiCx(uiTypography.body, 'font-semibold text-gray-700 min-w-[180px] text-center')}>
        {weekLabel}
      </span>
      <AppButton variant="secondary" size="sm" onClick={goTodayWeek}>
        Today
      </AppButton>
    </div>
  );

  const legacyCalendarToolbarStart = !designSystem ? (
    <div className="flex items-center gap-2">
      <button onClick={goPrevWeek} className="px-2.5 py-1 rounded border text-sm font-semibold">
        ← Prev
      </button>
      <input
        type="date"
        value={selectedDate}
        onChange={(e) => onWeekDatePick(e.target.value)}
        className="border rounded px-2.5 py-1 text-sm"
      />
      <button onClick={goNextWeek} className="px-2.5 py-1 rounded border text-sm font-semibold">
        Next →
      </button>
      <span className="text-sm font-semibold text-gray-700 min-w-[180px] text-center">{weekLabel}</span>
      <button onClick={goTodayWeek} className="px-2.5 py-1 rounded border text-sm font-semibold">
        Today
      </button>
    </div>
  ) : null;

  const workloadInner = (
    <>
      {alertBanners}
      {viewTabs}

      {view === 'calendar' && (
        <div className={designSystem ? uiSpacing.sectionStack : 'space-y-4'}>
          <div
            className={
              designSystem
                ? 'flex flex-wrap items-center justify-between gap-3'
                : 'flex items-center justify-between'
            }
          >
            {designSystem ? calendarNavDs : legacyCalendarToolbarStart}
            {workloadActionButtons}
          </div>

          {deleteMode && (
            <div
              className={
                designSystem
                  ? uiCx(uiRadius.card, 'border border-orange-300 bg-orange-50 p-3')
                  : 'rounded-xl border border-orange-300 bg-orange-50 p-2.5'
              }
            >
              <div className="flex items-center gap-2 text-sm text-orange-800">
                <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <div>
                  <strong>Delete Mode:</strong> Click on shifts to select them for deletion.
                  {/* NOTE: During testing phase, past date validation is disabled */}
                  {/* Shifts from past dates cannot be deleted and will be automatically excluded. */}
                  {selectedShiftsForDelete.size > 0 && (
                    <span className="ml-1.5 font-semibold">
                      {selectedShiftsForDelete.size} shift{selectedShiftsForDelete.size > 1 ? 's' : ''} selected
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          <div
            className={
              designSystem
                ? uiCx(uiRadius.card, uiBorders.subtle, 'bg-white p-3')
                : 'rounded-xl border bg-white p-3'
            }
          >
            {/* Day headers */}
            <div className="grid grid-cols-7 gap-1.5 mb-1.5">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                <div
                  key={day}
                  className={
                    designSystem
                      ? uiCx('text-sm font-semibold text-gray-600 text-center py-0.5')
                      : 'text-sm font-semibold text-gray-600 text-center py-0.5'
                  }
                >
                  {day}
                </div>
              ))}
            </div>
            
            {/* Calendar grid */}
            <div className="grid grid-cols-7 gap-1.5">
              {days.map(({ date, key, dayNumber }) => {
                const dateStr = formatDateLocal(date);
                const isToday = (() => {
                  const t = new Date();
                  return formatDateLocal(t) === dateStr;
                })();
                const isSelected = selectedDate === dateStr;
                
                // NOTE: During testing phase, past date validation is disabled
                // TODO: Re-enable past date validation for production
                // Check if date is in the past
                // const today = new Date();
                // today.setHours(0, 0, 0, 0);
                // const shiftDate = new Date(date);
                // shiftDate.setHours(0, 0, 0, 0);
                // const isPastDate = shiftDate < today;
                const isPastDate = false; // Always allow during testing
                
                // Filter shifts for this date - show all shifts regardless of status
                const dayShifts = (shifts || []).filter(
                  (s: any) => s.date === dateStr
                );

                const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
                const dayName = dayNames[date.getDay()];

                return (
                  <div
                    key={key}
                    onClick={() => !deleteMode && setSelectedDate(dateStr)}
                    className={`min-h-64 h-full rounded border bg-white p-1.5 flex flex-col ${
                      deleteMode ? '' : 'cursor-pointer'
                    } ${
                      isSelected && !deleteMode ? 'ring-2 ring-brand-red border-brand-red' : ''
                    } ${isToday && !isSelected && !deleteMode ? 'ring-1 ring-gray-300' : ''}`}
                  >
                    <div className="text-sm font-semibold text-gray-700 flex-shrink-0 mb-0.5">
                      <div className="text-xs text-gray-600 uppercase">{dayName}</div>
                      <div>{dayNumber}</div>
                    </div>
                    <div
                      className="flex-1 space-y-1"
                      onMouseDown={(e) => e.stopPropagation()}
                    >
                      {dayShifts.length > 0 ? (
                        groupDispatchDayShifts(dayShifts).map((item) => {
                          const shiftsInItem =
                            item.kind === 'crew' ? item.shifts : [item.shift];
                          const cards = shiftsInItem.map((shift: any) => {
                          const worker = employees?.find((e: any) => e.id === shift.worker_id);
                          const isShiftSelected = selectedShiftsForDelete.has(shift.id);
                          const canDelete = !isPastDate;
                          
                          return (
                            <div
                              key={shift.id}
                              className={`text-xs p-1 rounded group relative ${
                                deleteMode
                                  ? canDelete
                                    ? isShiftSelected
                                      ? 'bg-red-200 border-2 border-red-500 cursor-pointer hover:bg-red-300'
                                      : 'bg-blue-50 border border-blue-200 cursor-pointer hover:bg-blue-100'
                                    : 'bg-gray-100 border border-gray-300 opacity-60 cursor-not-allowed'
                                  : 'bg-blue-100 cursor-pointer hover:bg-blue-200'
                              }`}
                              title={
                                deleteMode
                                  ? canDelete
                                    ? isShiftSelected
                                      ? 'Click to deselect'
                                      : 'Click to select for deletion'
                                    : 'Cannot delete shifts from past dates'
                                  : `${worker?.name || shift.worker_id}: ${formatTime12h(shift.start_time)} - ${formatTime12h(shift.end_time)}`
                              }
                              onMouseDown={(e) => e.stopPropagation()}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (deleteMode) {
                                  if (!canEditWorkload) {
                                    toast.error('You do not have permission to delete shifts');
                                    return;
                                  }
                                  if (canDelete) {
                                    setSelectedShiftsForDelete((prev) => {
                                      const newSet = new Set(prev);
                                      if (isShiftSelected) {
                                        newSet.delete(shift.id);
                                      } else {
                                        newSet.add(shift.id);
                                      }
                                      return newSet;
                                    });
                                  } else {
                                    toast.error('Cannot delete shifts from past dates');
                                  }
                                } else {
                                  // Allow opening modal for viewing even without edit permission
                                  setEditShiftModal(shift);
                                }
                              }}
                            >
                              {deleteMode && (
                                <div className="absolute top-1 left-1 z-10">
                                  {canDelete ? (
                                    <input
                                      type="checkbox"
                                      checked={isShiftSelected}
                                      onChange={() => {}}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        if (canDelete) {
                                          setSelectedShiftsForDelete((prev) => {
                                            const newSet = new Set(prev);
                                            if (isShiftSelected) {
                                              newSet.delete(shift.id);
                                            } else {
                                              newSet.add(shift.id);
                                            }
                                            return newSet;
                                          });
                                        }
                                      }}
                                      className="w-3 h-3 rounded border-gray-300 text-red-600 focus:ring-red-500 cursor-pointer"
                                    />
                                  ) : (
                                    <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                    </svg>
                                  )}
                                </div>
                              )}
                              <div className="flex items-start justify-between gap-1">
                                <div className={`flex-1 min-w-0 ${deleteMode ? 'ml-4' : ''}`}>
                                  <div className="flex items-center gap-1 min-w-0">
                                    <div className="font-semibold truncate text-xs">
                                      {worker?.name || shift.worker_id}
                                    </div>
                                    {shift.crew_role === 'lead' ? (
                                      <AppBadge
                                        variant="info"
                                        className="shrink-0 normal-case !text-[9px] !px-1 !py-0"
                                      >
                                        Lead
                                      </AppBadge>
                                    ) : null}
                                  </div>
                                  <span className="text-xs text-gray-600">
                                    {formatTime12h(shift.start_time)} - {formatTime12h(shift.end_time)}
                                  </span>
                                  {shift.job_name && (
                                    <div className="text-xs text-gray-600 mt-0.5 truncate">
                                      {shift.job_name}
                                    </div>
                                  )}
                                  {shift.retroactive ? (
                                    <div
                                      className="text-[10px] font-semibold mt-0.5 truncate text-amber-800"
                                      title="Created after the shift date; worker was not notified"
                                    >
                                      Backdated
                                    </div>
                                  ) : null}
                                  {/* NOTE: During testing phase, past date validation is disabled */}
                                  {/* {deleteMode && !canDelete && (
                                    <div className="text-[8px] text-red-600 mt-0.5 font-semibold">
                                      Past date
                                    </div>
                                  )} */}
                                </div>
                                {shiftAckTracked(shift.ack_status) ? (
                                  <AppTooltip
                                    content={
                                      shift.ack_status === 'declined' && shift.ack_note
                                        ? `Declined: ${shift.ack_note}`
                                        : shiftAckMeta(shift.ack_status).longLabel
                                    }
                                    placement="top"
                                  >
                                    <span
                                      className={uiCx(
                                        'absolute top-1 right-1 z-[1] h-2 w-2 rounded-full ring-1 ring-white/90',
                                        shiftAckMeta(shift.ack_status).dotClass,
                                      )}
                                      aria-label={shiftAckMeta(shift.ack_status).longLabel}
                                      onMouseDown={(e) => e.stopPropagation()}
                                      onClick={(e) => e.stopPropagation()}
                                    />
                                  </AppTooltip>
                                ) : null}
                                {!deleteMode && (
                                  <div className="flex items-center gap-0.5 flex-shrink-0 pr-2.5">
                                    {shiftHasNotes(shift) && (
                                      <AppTooltip
                                        content={shiftNotesPreview(String(shift.notes))}
                                        placement="top"
                                      >
                                        <span
                                          className="flex items-center justify-center p-0.5 text-amber-600"
                                          aria-label="Shift has notes"
                                          onMouseDown={(e) => e.stopPropagation()}
                                          onClick={(e) => e.stopPropagation()}
                                        >
                                          <AlertTriangle className="w-2.5 h-2.5" strokeWidth={2.5} />
                                        </span>
                                      </AppTooltip>
                                    )}
                                    {canEditWorkload && (
                                      <div
                                        className={uiCx(
                                          'flex items-center gap-0.5',
                                          !shiftHasNotes(shift) && 'opacity-0 group-hover:opacity-100 transition-opacity',
                                        )}
                                      >
                                    <button
                                      onMouseDown={(e) => e.stopPropagation()}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setEditShiftModal(shift);
                                      }}
                                      className="p-0.5 rounded hover:bg-blue-300 text-blue-700"
                                      title="Edit shift"
                                    >
                                      <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                      </svg>
                                    </button>
                                    <button
                                      onMouseDown={(e) => e.stopPropagation()}
                                      onClick={async (e) => {
                                        e.stopPropagation();
                                        // NOTE: During testing phase, past date validation is disabled
                                        // TODO: Re-enable past date validation for production
                                        // const shiftDateCheck = new Date(shift.date);
                                        // shiftDateCheck.setHours(0, 0, 0, 0);
                                        // const todayCheck = new Date();
                                        // todayCheck.setHours(0, 0, 0, 0);
                                        // 
                                        // if (shiftDateCheck < todayCheck) {
                                        //   toast.error('Cannot delete shifts from past dates');
                                        //   return;
                                        // }
                                        
                                        const confirmResult = await confirm({
                                          title: 'Delete Shift',
                                          message: `Are you sure you want to delete this shift for ${worker?.name || shift.worker_id} on ${new Date(shift.date).toLocaleDateString()}?`,
                                          confirmText: 'Delete',
                                          cancelText: 'Cancel',
                                        });
                                        if (confirmResult !== 'confirm') return;
                                        try {
                                          await api('DELETE', '/dispatch/shifts/' + shift.id);
                                          toast.success('Shift deleted');
                                          await refetchShifts();
                                          invalidateWorkloadTabCounts();
                                        } catch (e: any) {
                                          const errorMsg = e.response?.data?.detail || e.message || 'Failed to delete shift';
                                          toast.error(errorMsg);
                                          console.error('Delete shift error:', e);
                                        }
                                      }}
                                      className="p-0.5 rounded hover:bg-red-300 text-red-700"
                                      title="Delete shift"
                                    >
                                      <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                      </svg>
                                    </button>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                          });

                          if (item.kind === 'crew') {
                            return (
                              <div
                                key={`crew-${item.crewGroupId}`}
                                className="rounded-md border border-slate-300/90 bg-slate-50/90 p-0.5 space-y-0.5"
                                onMouseDown={(e) => e.stopPropagation()}
                                title={`Crew of ${item.shifts.length} people`}
                              >
                                <div className="flex items-center justify-between gap-1 px-1 pt-0.5">
                                  <span className="text-[9px] font-semibold uppercase tracking-wide text-slate-600">
                                    Crew · {item.shifts.length}{' '}
                                    {item.shifts.length === 1 ? 'person' : 'people'}
                                  </span>
                                </div>
                                <div className="space-y-0.5">{cards}</div>
                              </div>
                            );
                          }

                          return <Fragment key={item.shift.id}>{cards}</Fragment>;
                        })
                      ) : (
                        <div className="text-xs text-gray-600" onMouseDown={(e) => e.stopPropagation()}>No shifts</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {view === 'pending' && (
        <div
          className={
            designSystem
              ? uiCx(uiRadius.card, uiBorders.subtle, 'overflow-hidden bg-white')
              : 'rounded-xl border bg-white'
          }
        >
          <div
            className={
              designSystem
                ? uiCx('border-b px-4 py-3', uiTypography.sectionTitle)
                : 'p-3 border-b text-sm font-semibold text-gray-900'
            }
          >
            Pending Attendance Approval
          </div>
          <div className="divide-y">
            {(pendingAttendance || []).length > 0 ? (
              pendingAttendance.map((attendance: any) => (
                <PendingAttendanceRow
                  key={attendance.id}
                  attendance={attendance}
                  employees={employees || []}
                  designSystem={designSystem}
                  onApprove={async () => {
                    try {
                      await api('POST', '/dispatch/attendance/' + attendance.id + '/approve', { note: 'Approved' });
                      toast.success('Approved');
                      await refetchPending();
                      await refetchShifts();
                      // Invalidate attendances queries in TimesheetTab to trigger refetch
                      queryClient.invalidateQueries({ queryKey: ['attendances'] });
                      queryClient.invalidateQueries({ queryKey: ['shifts'] });
                      queryClient.invalidateQueries({ queryKey: ['projectRecentActivity', projectId] });
                      invalidateWorkloadTabCounts();
                    } catch (e: any) {
                      toast.error(e.message || 'Failed to approve');
                    }
                  }}
                  onReject={async (reason: string) => {
                    try {
                      await api('POST', '/dispatch/attendance/' + attendance.id + '/reject', { reason });
                      toast.success('Rejected');
                      await refetchPending();
                      await refetchShifts();
                      // Invalidate attendances queries in TimesheetTab to trigger refetch
                      queryClient.invalidateQueries({ queryKey: ['attendances'] });
                      queryClient.invalidateQueries({ queryKey: ['shifts'] });
                      queryClient.invalidateQueries({ queryKey: ['projectRecentActivity', projectId] });
                      invalidateWorkloadTabCounts();
                    } catch (e: any) {
                      toast.error(e.message || 'Failed to reject');
                    }
                  }}
                />
              ))
            ) : designSystem ? (
              <AppEmptyState className="py-8" title="No pending attendance" />
            ) : (
              <div className="p-3 text-sm text-gray-600">No pending attendance</div>
            )}
          </div>
        </div>
      )}
    </>
  );

  const modals = (
    <>
      {createShiftModal && project && (
        <CreateShiftModal
          projectId={projectId}
          project={project}
          employees={Array.isArray(employees) ? employees : []}
          employeesLoading={employeesLoading}
          defaultBreakMin={defaultBreakMin}
          defaultGeofenceRadius={defaultGeofenceRadius}
          designSystem={designSystem}
          jobTypeOptions={jobTypeOptions}
          canEditOnsiteLeads={canEditOnsiteLeads}
          onClose={() => setCreateShiftModal(false)}
          onSave={async () => {
            await refetchShifts();
            queryClient.invalidateQueries({ queryKey: ['projectRecentActivity', projectId] });
            invalidateWorkloadTabCounts();
            setCreateShiftModal(false);
          }}
        />
      )}

      {editShiftModal && project && editShiftModal?.id && (
        <EditShiftModal
          projectId={projectId}
          project={project}
          employees={Array.isArray(employees) ? employees : []}
          shift={editShiftModal}
          canEdit={canEditWorkload}
          designSystem={designSystem}
          jobTypeOptions={jobTypeOptions}
          onClose={() => setEditShiftModal(null)}
          onSave={async () => {
            await refetchShifts();
            queryClient.invalidateQueries({ queryKey: ['projectRecentActivity', projectId] });
            invalidateWorkloadTabCounts();
            setEditShiftModal(null);
          }}
        />
      )}
    </>
  );

  if (designSystem) {
    return (
      <>
        <AppCard className="!rounded-2xl" bodyClassName={uiSpacing.cardPadding}>
          <AppSectionHeader
            title="Dispatch"
            description="Employee shifts and dispatch scheduling. Use the week calendar to plan shifts or review pending attendance."
            {...appSectionPresetProps('workload')}
          />
          <div className={uiCx('mt-4', uiSpacing.sectionStack)}>{workloadInner}</div>
        </AppCard>
        {modals}
      </>
    );
  }

  return (
    <div className="space-y-4">
      {workloadInner}
      {modals}
    </div>
  );
}

function PendingAttendanceRow({
  attendance,
  employees,
  designSystem,
  onApprove,
  onReject,
}: {
  attendance: any;
  employees: any[];
  designSystem?: boolean;
  onApprove: () => Promise<void>;
  onReject: (reason: string) => Promise<void>;
}) {
  const [showReject, setShowReject] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const worker = employees.find((e: any) => e.id === attendance.worker_id);

  return (
    <div className="p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-gray-900">
            {worker?.name || attendance.worker_id} - {attendance.clock_in_time && !attendance.clock_out_time ? 'Clock In' : 
                                                      attendance.clock_out_time ? 'Clock Out' : 
                                                      attendance.type === 'in' ? 'Clock In' : 'Clock Out'}
          </div>
          <div className="text-xs text-gray-600 mt-0.5">
            {attendance.clock_in_time ? formatDateTimeVancouver(attendance.clock_in_time) : 
             attendance.clock_out_time ? formatDateTimeVancouver(attendance.clock_out_time) :
             attendance.time_selected_utc ? formatDateTimeVancouver(attendance.time_selected_utc) : '--'}
          </div>
          {attendance.reason_text && (
            <div className="text-xs text-gray-700 mt-0.5">{attendance.reason_text}</div>
          )}
          {attendance.gps_lat && attendance.gps_lng && (
            <div className="text-xs text-gray-600 mt-0.5">
              GPS: {attendance.gps_lat.toFixed(6)}, {attendance.gps_lng.toFixed(6)}
              {attendance.gps_accuracy_m && ` (accuracy: ${attendance.gps_accuracy_m.toFixed(0)}m)`}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {!showReject ? (
            <>
              {designSystem ? (
                <>
                  <AppButton size="sm" onClick={onApprove}>
                    Approve
                  </AppButton>
                  <AppButton variant="danger" size="sm" onClick={() => setShowReject(true)}>
                    Reject
                  </AppButton>
                </>
              ) : (
                <>
                  <button
                    onClick={onApprove}
                    className="px-2.5 py-1 rounded text-sm font-semibold bg-green-600 text-white"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => setShowReject(true)}
                    className="px-2.5 py-1 rounded text-sm font-semibold bg-red-600 text-white"
                  >
                    Reject
                  </button>
                </>
              )}
            </>
          ) : (
            <div className="flex items-center gap-1.5">
              {designSystem ? (
                <AppInput
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Rejection reason"
                  className="w-40"
                />
              ) : (
                <input
                  type="text"
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Rejection reason"
                  className="border rounded px-2 py-1 text-sm w-32"
                />
              )}
              {designSystem ? (
                <>
                  <AppButton
                    variant="danger"
                    size="sm"
                    onClick={async () => {
                      if (!rejectReason.trim()) {
                        toast.error('Reason required');
                        return;
                      }
                      await onReject(rejectReason);
                      setShowReject(false);
                      setRejectReason('');
                    }}
                  >
                    Confirm
                  </AppButton>
                  <AppButton
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setShowReject(false);
                      setRejectReason('');
                    }}
                  >
                    Cancel
                  </AppButton>
                </>
              ) : (
                <>
                  <button
                    onClick={async () => {
                      if (!rejectReason.trim()) {
                        toast.error('Reason required');
                        return;
                      }
                      await onReject(rejectReason);
                      setShowReject(false);
                      setRejectReason('');
                    }}
                    className="px-2.5 py-1 rounded text-sm font-semibold bg-red-600 text-white"
                  >
                    Confirm
                  </button>
                  <button
                    onClick={() => {
                      setShowReject(false);
                      setRejectReason('');
                    }}
                    className="px-2.5 py-1 rounded text-sm font-semibold bg-gray-100 text-gray-700"
                  >
                    Cancel
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function CreateShiftModal({
  projectId,
  project,
  employees,
  employeesLoading = false,
  defaultBreakMin,
  defaultGeofenceRadius,
  designSystem,
  jobTypeOptions,
  canEditOnsiteLeads = false,
  initialDate,
  onClose,
  onSave,
}: {
  projectId: string;
  project: any;
  employees: any[];
  employeesLoading?: boolean;
  defaultBreakMin: number;
  defaultGeofenceRadius: number;
  designSystem?: boolean;
  jobTypeOptions?: { value: string; label: string }[];
  canEditOnsiteLeads?: boolean;
  /** YYYY-MM-DD — seeds single/range start when opening from calendar drop. */
  initialDate?: string;
  onClose: () => void;
  onSave: () => Promise<void>;
}) {
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const seedDate = initialDate && /^\d{4}-\d{2}-\d{2}$/.test(initialDate)
    ? initialDate
    : formatDateLocal(new Date());
  const [step, setStep] = useState(1);
  const [selectedWorkers, setSelectedWorkers] = useState<string[]>([]);
  const [dateMode, setDateMode] = useState<'single' | 'range'>('single');
  const [date, setDate] = useState(seedDate);
  const [dateFrom, setDateFrom] = useState(seedDate);
  const [dateTo, setDateTo] = useState(() => {
    const base = new Date(`${seedDate}T12:00:00`);
    if (Number.isNaN(base.getTime())) {
      const nextWeek = new Date();
      nextWeek.setDate(nextWeek.getDate() + 6);
      return formatDateLocal(nextWeek);
    }
    base.setDate(base.getDate() + 6);
    return formatDateLocal(base);
  });
  const [excludeWeekends, setExcludeWeekends] = useState(false);
  const [calMonth, setCalMonth] = useState(() => {
    const d = new Date(`${seedDate}T12:00:00`);
    if (Number.isNaN(d.getTime())) {
      const today = new Date();
      return new Date(today.getFullYear(), today.getMonth(), 1);
    }
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [timePreset, setTimePreset] = useState<ShiftTimePreset>('all_day');
  const [startTime, setStartTime] = useState(() => resolvePresetTimes('all_day').start);
  const [endTime, setEndTime] = useState(() => resolvePresetTimes('all_day').end);
  const [jobType, setJobType] = useState('');
  const [notes, setNotes] = useState('');
  const [noteFlags, setNoteFlags] = useState({ saveOnProject: false, saveGlobal: false });
  const [error, setError] = useState('');
  const [overlapWarnings, setOverlapWarnings] = useState<
    { workerId: string; workerName: string; date: string; conflicts: any[] }[]
  >([]);
  const [saving, setSaving] = useState(false);
  const [workerDropdownOpen, setWorkerDropdownOpen] = useState(false);
  const [workerSearch, setWorkerSearch] = useState('');
  const workerDropdownRef = useRef<HTMLDivElement>(null);
  /** Draft project on-site leads for this create batch: divisionId → workerId (one lead per division). */
  const [onsiteLeadByDivision, setOnsiteLeadByDivision] = useState<Record<string, string>>({});
  /** Optional lead of the multi-worker crew for this create batch (not project on-site lead). */
  const [groupLeadWorkerId, setGroupLeadWorkerId] = useState<string | null>(null);
  const [onsiteLeadModalWorkerId, setOnsiteLeadModalWorkerId] = useState<string | null>(null);
  const [onsiteLeadModalDivisionIds, setOnsiteLeadModalDivisionIds] = useState<string[]>([]);

  useEffect(() => {
    const maxSteps = (Array.isArray(selectedWorkers) ? selectedWorkers.length : 0) >= 2 ? 5 : 4;
    setStep((s) => Math.min(s, maxSteps));
  }, [selectedWorkers]);

  const { data: projectDivisions } = useQuery({
    queryKey: PROJECT_DIVISIONS_QUERY_KEY,
    queryFn: () => api<any[]>('GET', '/settings/project-divisions'),
    staleTime: 300_000,
  });

  const availableDivisions = useMemo(() => {
    const ids = Array.isArray(project?.project_division_ids)
      ? project.project_division_ids.map((id: unknown) => String(id))
      : [];
    const leads =
      project?.division_onsite_leads && typeof project.division_onsite_leads === 'object'
        ? (project.division_onsite_leads as Record<string, string>)
        : {};
    return ids.filter((divId: string) => {
      const existing = leads[divId];
      return !existing || !String(existing).trim();
    });
  }, [project?.project_division_ids, project?.division_onsite_leads]);

  const onsiteLeadEnabled = canEditOnsiteLeads && availableDivisions.length > 0;

  const leadAssignments = useMemo(() => {
    const allowed = new Set(availableDivisions);
    const next: Record<string, string> = {};
    for (const [divId, workerId] of Object.entries(onsiteLeadByDivision)) {
      const w = String(workerId || '').trim();
      if (allowed.has(divId) && w) next[divId] = w;
    }
    return next;
  }, [onsiteLeadByDivision, availableDivisions]);

  const hasOnsiteLeadAssignment = Object.keys(leadAssignments).length > 0;
  const onsiteLeadWorkerIds = useMemo(
    () => new Set(Object.values(leadAssignments).map(String)),
    [leadAssignments],
  );

  const divisionsForOnsiteWorker = (workerId: string) =>
    Object.entries(leadAssignments)
      .filter(([, w]) => String(w) === String(workerId))
      .map(([divId]) => divId);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (workerDropdownRef.current && !workerDropdownRef.current.contains(event.target as Node)) {
        setWorkerDropdownOpen(false);
      }
    };

    if (workerDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [workerDropdownOpen]);

  // Keep on-site / group lead drafts in sync with selected workers and open slots
  useEffect(() => {
    const selected = selectedWorkers.map(String);
    if (selected.length === 0) {
      setOnsiteLeadByDivision({});
      setGroupLeadWorkerId(null);
      return;
    }
    setOnsiteLeadByDivision((prev) => {
      let changed = false;
      const next: Record<string, string> = {};
      for (const [divId, workerId] of Object.entries(prev)) {
        if (!availableDivisions.includes(divId)) {
          changed = true;
          continue;
        }
        if (!selected.includes(String(workerId))) {
          changed = true;
          continue;
        }
        next[divId] = String(workerId);
      }
      if (!changed && Object.keys(next).length === Object.keys(prev).length) return prev;
      return next;
    });
    if (groupLeadWorkerId && !selected.includes(String(groupLeadWorkerId))) {
      setGroupLeadWorkerId(null);
    }
    if (selected.length < 2) {
      setGroupLeadWorkerId(null);
    }
  }, [selectedWorkers, availableDivisions, groupLeadWorkerId]);

  // Generate list of dates based on mode
  const selectedDates = useMemo(() => {
    if (dateMode === 'single') {
      return [date];
    } else {
      const dates: string[] = [];
      const fromParts = dateFrom.split('-').map(Number);
      const toParts = dateTo.split('-').map(Number);
      const from = new Date(fromParts[0], fromParts[1] - 1, fromParts[2]);
      const to = new Date(toParts[0], toParts[1] - 1, toParts[2]);

      const current = new Date(from);
      while (current <= to) {
        const year = current.getFullYear();
        const month = String(current.getMonth() + 1).padStart(2, '0');
        const day = String(current.getDate()).padStart(2, '0');
        const dateStr = `${year}-${month}-${day}`;

        if (excludeWeekends) {
          const dayOfWeek = current.getDay();
          if (dayOfWeek !== 0 && dayOfWeek !== 6) {
            dates.push(dateStr);
          }
        } else {
          dates.push(dateStr);
        }

        current.setDate(current.getDate() + 1);
      }
      return dates;
    }
  }, [dateMode, date, dateFrom, dateTo, excludeWeekends]);

  const dateRangeSummary = useMemo(() => {
    if (!Array.isArray(selectedDates) || selectedDates.length === 0) return '';
    const count = selectedDates.length;
    const unit = excludeWeekends && dateMode === 'range' ? 'weekday' : 'day';
    const countLabel = `${count} ${unit}${count > 1 ? 's' : ''}`;
    if (count === 1) {
      const one = new Date(selectedDates[0] + 'T12:00:00').toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      });
      return `${countLabel} · ${one}`;
    }
    const first = new Date(selectedDates[0] + 'T12:00:00').toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
    const last = new Date(selectedDates[selectedDates.length - 1] + 'T12:00:00').toLocaleDateString(
      'en-US',
      { month: 'short', day: 'numeric' },
    );
    return `${countLabel} · ${first}–${last}`;
  }, [selectedDates, excludeWeekends, dateMode]);

  const calMonthRange = useMemo(() => {
    const start = formatDateLocal(new Date(calMonth.getFullYear(), calMonth.getMonth(), 1));
    const end = formatDateLocal(new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 0));
    return `${start},${end}`;
  }, [calMonth]);

  const workerIdsKey = useMemo(
    () =>
      (Array.isArray(selectedWorkers) ? selectedWorkers : [])
        .map(String)
        .sort()
        .join(','),
    [selectedWorkers],
  );

  type ExistingShiftRow = {
    id?: string;
    date?: string;
    worker_id?: string;
    project_name?: string;
    start_time?: string;
    end_time?: string;
  };

  const { data: existingWorkerShifts = [] } = useQuery({
    queryKey: ['create-shift-existing', calMonthRange, workerIdsKey],
    queryFn: async () => {
      const workers = (Array.isArray(selectedWorkers) ? selectedWorkers : []).map(String);
      if (workers.length === 0) return [] as ExistingShiftRow[];
      const results = await Promise.all(
        workers.map((wid) =>
          api<ExistingShiftRow[]>(
            'GET',
            `/dispatch/shifts?date_range=${encodeURIComponent(calMonthRange)}&worker_id=${encodeURIComponent(wid)}`,
          ).catch(() => [] as ExistingShiftRow[]),
        ),
      );
      return results.flat();
    },
    enabled: workerIdsKey.length > 0,
    staleTime: 15_000,
  });

  const existingShiftInfoByDate = useMemo(() => {
    const map = new Map<string, { count: number; projects: string[] }>();
    for (const s of existingWorkerShifts) {
      const key = String(s.date || '').slice(0, 10);
      if (!key) continue;
      const prev = map.get(key) || { count: 0, projects: [] };
      prev.count += 1;
      const pname = (s.project_name || '').trim();
      if (pname && !prev.projects.includes(pname)) prev.projects.push(pname);
      map.set(key, prev);
    }
    return map;
  }, [existingWorkerShifts]);

  const todayStr = getTodayLocal();

  const createShiftCalendarDays: AppCalendarDay[] = useMemo(() => {
    const year = calMonth.getFullYear();
    const month = calMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startingDayOfWeek = firstDay.getDay();
    const days: AppCalendarDay[] = [];

    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push({ dateLabel: '', isMuted: true });
    }

    const rangeStart = dateMode === 'range' ? dateFrom : date;
    const rangeEnd = dateMode === 'range' ? dateTo : date;

    // Inclusive range edges that are weekdays when weekends are excluded (for start/end styling)
    const weekdayEdge = (from: string, to: string, which: 'start' | 'end') => {
      if (!excludeWeekends || dateMode !== 'range') return which === 'start' ? from : to;
      const step = which === 'start' ? 1 : -1;
      const cursor = new Date(`${(which === 'start' ? from : to)}T12:00:00`);
      const limit = new Date(`${(which === 'start' ? to : from)}T12:00:00`);
      while (
        which === 'start' ? cursor <= limit : cursor >= limit
      ) {
        const dow = cursor.getDay();
        if (dow !== 0 && dow !== 6) return formatDateLocal(cursor);
        cursor.setDate(cursor.getDate() + step);
      }
      return which === 'start' ? from : to;
    };
    const visualStart =
      dateMode === 'range' && rangeStart && rangeEnd
        ? weekdayEdge(rangeStart, rangeEnd, 'start')
        : rangeStart;
    const visualEnd =
      dateMode === 'range' && rangeStart && rangeEnd
        ? weekdayEdge(rangeStart, rangeEnd, 'end')
        : rangeEnd;

    for (let day = 1; day <= lastDay.getDate(); day++) {
      const cell = new Date(year, month, day);
      const dateStr = formatDateLocal(cell);
      const isPast = dateStr < todayStr;
      const dow = cell.getDay();
      const isWeekend = dow === 0 || dow === 6;
      const info = existingShiftInfoByDate.get(dateStr);
      const shiftCount = info?.count ?? 0;
      const inSpan =
        dateMode === 'single'
          ? dateStr === date
          : Boolean(rangeStart && rangeEnd && dateStr >= rangeStart && dateStr <= rangeEnd);
      const excludedWeekend =
        dateMode === 'range' && excludeWeekends && isWeekend && inSpan;
      const inSelection = inSpan && !excludedWeekend;

      let rangeRole: AppCalendarDay['rangeRole'];
      if (inSelection) {
        if (dateMode === 'single' || visualStart === visualEnd) {
          rangeRole = 'alone';
        } else if (dateStr === visualStart) {
          rangeRole = 'start';
        } else if (dateStr === visualEnd) {
          rangeRole = 'end';
        } else {
          rangeRole = 'middle';
        }
      }

      const projectHint =
        info?.projects?.length
          ? info.projects.slice(0, 2).join(', ') + (info.projects.length > 2 ? '…' : '')
          : '';

      days.push({
        dateLabel: String(day),
        isToday: dateStr === todayStr,
        isSelected: inSelection,
        isMuted: isPast || excludedWeekend,
        rangeRole: excludedWeekend ? undefined : rangeRole,
        hasMarker: shiftCount > 0,
        badge: shiftCount > 0 ? shiftCount : undefined,
        badgeTone: shiftCount > 0 ? 'accent' : undefined,
        title: isPast
          ? 'Past date — workers will not be notified'
          : excludedWeekend
            ? 'Weekend excluded'
            : shiftCount > 0
              ? `${shiftCount} existing shift${shiftCount > 1 ? 's' : ''}${projectHint ? ` · ${projectHint}` : ''}`
              : dateStr === todayStr
                ? 'Today'
                : undefined,
        onClick: () => {
              if (dateMode === 'single') {
                setDate(dateStr);
                return;
              }
              // Range: first click / reset → from=to; second click extends end
              if (!dateFrom || (dateFrom && dateTo && dateFrom !== dateTo)) {
                setDateFrom(dateStr);
                setDateTo(dateStr);
                return;
              }
              if (dateStr < dateFrom) {
                setDateFrom(dateStr);
                return;
              }
              setDateTo(dateStr);
            },
      });
    }
    return days;
  }, [
    calMonth,
    dateMode,
    date,
    dateFrom,
    dateTo,
    excludeWeekends,
    existingShiftInfoByDate,
    todayStr,
  ]);

  const calMonthLabel = useMemo(
    () =>
      calMonth.toLocaleDateString('en-US', {
        month: 'long',
        year: 'numeric',
      }),
    [calMonth],
  );

  const filteredEmployees = useMemo(() => {
    if (!employees || !Array.isArray(employees)) return [];
    if (!workerSearch) return employees;
    const searchLower = workerSearch.toLowerCase();
    return employees.filter((emp: any) => {
      const name = (emp.name || emp.username || '').toLowerCase();
      return name.includes(searchLower);
    });
  }, [employees, workerSearch]);

  const employeeNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const emp of employees || []) {
      if (emp?.id) {
        map.set(
          String(emp.id),
          getUserDisplayName(emp) || emp.name || emp.username || String(emp.id),
        );
      }
    }
    return map;
  }, [employees]);

  const applyTimePreset = (preset: ShiftTimePreset) => {
    setTimePreset(preset);
    const times = resolvePresetTimes(preset);
    setStartTime(times.start);
    setEndTime(times.end);
  };

  // Live overlap preview (advisory)
  useEffect(() => {
    const workers = Array.isArray(selectedWorkers) ? selectedWorkers : [];
    const dates = Array.isArray(selectedDates) ? selectedDates : [];
    if (workers.length === 0 || dates.length === 0 || !startTime || !endTime) {
      setOverlapWarnings([]);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const items: { worker_id: string; date: string; start_time: string; end_time: string }[] =
          [];
        for (const workerId of workers) {
          for (const dateStr of dates) {
            items.push({
              worker_id: String(workerId),
              date: dateStr,
              start_time: startTime,
              end_time: endTime,
            });
          }
        }
        const res = await api<{ items?: any[] }>(
          'POST',
          '/dispatch/shifts/check-overlaps',
          { items },
          undefined,
          controller.signal,
        );
        const warnings: { workerId: string; workerName: string; date: string; conflicts: any[] }[] =
          [];
        for (const item of res?.items || []) {
          if (Array.isArray(item.conflicts) && item.conflicts.length > 0) {
            warnings.push({
              workerId: String(item.worker_id),
              workerName: employeeNameById.get(String(item.worker_id)) || String(item.worker_id),
              date: String(item.date),
              conflicts: item.conflicts,
            });
          }
        }
        setOverlapWarnings(warnings);
      } catch (e: any) {
        if (e?.name === 'AbortError' || controller.signal.aborted) return;
        // Ignore preview failures — create still works
      }
    }, 350);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [selectedWorkers, selectedDates, startTime, endTime, employeeNameById]);

  const toggleWorker = (workerId: string) => {
    setSelectedWorkers((prev) => {
      const prevArray = Array.isArray(prev) ? prev : [];
      return prevArray.includes(workerId)
        ? prevArray.filter((id) => id !== workerId)
        : [...prevArray, workerId];
    });
  };

  const closeOnsiteLeadModal = () => {
    setOnsiteLeadModalWorkerId(null);
    setOnsiteLeadModalDivisionIds([]);
  };

  const handleOnsiteLeadStarClick = (workerId: string) => {
    const id = String(workerId);
    setSelectedWorkers((prev) => {
      const prevArray = (Array.isArray(prev) ? prev : []).map(String);
      return prevArray.includes(id) ? prevArray : [...prevArray, id];
    });
    setOnsiteLeadModalWorkerId(id);
    const ownDivisions = divisionsForOnsiteWorker(id);
    if (ownDivisions.length > 0) {
      setOnsiteLeadModalDivisionIds(ownDivisions);
    } else {
      const freeDivisions = availableDivisions.filter((divId) => !leadAssignments[divId]);
      setOnsiteLeadModalDivisionIds(freeDivisions.length === 1 ? [freeDivisions[0]] : []);
    }
  };

  const handleConfirmOnsiteLead = () => {
    if (!onsiteLeadModalWorkerId || onsiteLeadModalDivisionIds.length === 0) return;
    const workerId = String(onsiteLeadModalWorkerId);
    const selectedDivs = onsiteLeadModalDivisionIds.filter((divId) =>
      availableDivisions.includes(divId),
    );
    if (selectedDivs.length === 0) return;
    setOnsiteLeadByDivision((prev) => {
      const next: Record<string, string> = {};
      for (const [divId, w] of Object.entries(prev)) {
        if (String(w) === workerId) continue;
        if (selectedDivs.includes(divId)) continue;
        next[divId] = String(w);
      }
      for (const divId of selectedDivs) {
        next[divId] = workerId;
      }
      return next;
    });
    closeOnsiteLeadModal();
  };

  const handleClearOnsiteLead = () => {
    if (!onsiteLeadModalWorkerId) {
      closeOnsiteLeadModal();
      return;
    }
    const workerId = String(onsiteLeadModalWorkerId);
    setOnsiteLeadByDivision((prev) => {
      const next: Record<string, string> = {};
      for (const [divId, w] of Object.entries(prev)) {
        if (String(w) === workerId) continue;
        next[divId] = String(w);
      }
      return next;
    });
    closeOnsiteLeadModal();
  };

  const handleSave = async () => {
    const workersArray = Array.isArray(selectedWorkers) ? selectedWorkers : [];
    const datesArray = Array.isArray(selectedDates) ? selectedDates : [];

    if (workersArray.length === 0) {
      setError('At least one worker is required');
      return;
    }

    if (datesArray.length === 0) {
      setError('At least one date is required');
      return;
    }

    if (hasOnsiteLeadAssignment) {
      const selectedSet = new Set(workersArray.map(String));
      const availableSet = new Set(availableDivisions);
      for (const [divId, workerId] of Object.entries(leadAssignments)) {
        if (!availableSet.has(divId)) {
          setError('One or more selected lead divisions are no longer available.');
          return;
        }
        if (!selectedSet.has(String(workerId))) {
          setError('On-site lead must be one of the selected workers.');
          return;
        }
      }
    }

    setError('');
    setSaving(true);

    try {
      if (onsiteLeadEnabled && Object.keys(leadAssignments).length > 0) {
        const existing =
          project?.division_onsite_leads && typeof project.division_onsite_leads === 'object'
            ? { ...(project.division_onsite_leads as Record<string, string>) }
            : {};
        const merged = { ...existing, ...leadAssignments };
        try {
          await api('PATCH', `/projects/${encodeURIComponent(projectId)}`, {
            division_onsite_leads: merged,
          });
          await queryClient.invalidateQueries({ queryKey: ['project', projectId] });
        } catch (e: any) {
          const msg = e?.response?.data?.detail || e?.message || 'Failed to update on-site leads';
          setError(msg);
          toast.error(msg);
          setSaving(false);
          return;
        }
      }

      if (notes.trim() && (noteFlags.saveOnProject || noteFlags.saveGlobal)) {
        try {
          await persistShiftNoteLibrary({
            projectId,
            body: notes,
            saveOnProject: noteFlags.saveOnProject,
            saveGlobal: noteFlags.saveGlobal,
          });
        } catch (e: any) {
          toast.error(
            e?.response?.data?.detail ||
              e?.message ||
              'The shift will still be created, but the note could not be saved for reuse.',
          );
        }
      }

      const geofenceRadius = defaultGeofenceRadius ?? 150;
      const breakMin = defaultBreakMin ?? 30;

      const geofences = project?.lat && project?.lng
        ? [
            {
              lat: parseFloat(project.lat),
              lng: parseFloat(project.lng),
              radius_m: geofenceRadius,
            },
          ]
        : [];

      const multiCrew = workersArray.length >= 2;
      const groupLead =
        multiCrew && groupLeadWorkerId && workersArray.map(String).includes(String(groupLeadWorkerId))
          ? String(groupLeadWorkerId)
          : null;

      const shiftsToCreate: Record<string, unknown>[] = [];
      for (const dateStr of datesArray) {
        const crewGroupId = multiCrew
          ? typeof crypto !== 'undefined' && crypto.randomUUID
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(16).slice(2)}`
          : null;
        for (const workerId of workersArray) {
          const row: Record<string, unknown> = {
            worker_id: workerId,
            date: dateStr,
            start_time: startTime,
            end_time: endTime,
            default_break_min: breakMin,
            geofences,
            job_type: jobType || null,
            job_name: jobType || null,
            notes: notes.trim() || null,
          };
          if (crewGroupId) {
            row.crew_group_id = crewGroupId;
            if (groupLead) {
              row.crew_role = String(workerId) === groupLead ? 'lead' : 'helper';
            }
          }
          shiftsToCreate.push(row);
        }
      }

      let successCount = 0;
      let errorCount = 0;
      let conflictCount = 0;
      const errors: string[] = [];

      for (const shiftData of shiftsToCreate) {
        try {
          const created = await api<any>(
            'POST',
            '/dispatch/projects/' + projectId + '/shifts',
            shiftData,
          );
          successCount++;
          if (Array.isArray(created?.conflicts) && created.conflicts.length > 0) {
            conflictCount++;
          }
        } catch (e: any) {
          errorCount++;
          const employeesArray = Array.isArray(employees) ? employees : [];
          const workerIdStr = String(shiftData.worker_id || '');
          const workerName =
            employeesArray.find((emp: any) => emp.id === workerIdStr)?.name || workerIdStr;
          const errorMsg = e.response?.data?.detail || e.message || 'Failed';
          errors.push(
            `${workerName} on ${new Date(String(shiftData.date)).toLocaleDateString()}: ${errorMsg}`,
          );
        }
      }

      if (errorCount > 0) {
        const errorMsg = `${successCount} shift${successCount > 1 ? 's' : ''} created, ${errorCount} failed.`;
        toast.error(errorMsg);
        let errorDetails = errorMsg + '\n\nFailed shifts:\n' + errors.slice(0, 10).join('\n');
        if (errors.length > 10) {
          errorDetails += '\n... and ' + (errors.length - 10) + ' more';
        }
        setError(errorDetails);
        if (successCount > 0) {
          await onSave();
        }
      } else if (conflictCount > 0) {
        toast.success(
          `${successCount} shift${successCount > 1 ? 's' : ''} created; ${conflictCount} have schedule conflicts`,
        );
        await onSave();
      } else {
        toast.success(`${successCount} shift${successCount > 1 ? 's' : ''} created successfully`);
        await onSave();
      }
    } catch (e: any) {
      setError(e.message || 'Failed to create shifts');
      toast.error(e.message || 'Failed to create shifts');
    } finally {
      setSaving(false);
    }
  };

  if (!project) {
    return null;
  }

  const canSubmit =
    Array.isArray(selectedWorkers) &&
    selectedWorkers.length > 0 &&
    Array.isArray(selectedDates) &&
    selectedDates.length > 0;

  const hasPastDates = useMemo(
    () => (Array.isArray(selectedDates) ? selectedDates : []).some((d) => d < todayStr),
    [selectedDates, todayStr],
  );

  const backdatedWarning =
    'You are creating shift(s) on a past date. Workers will not be notified, and confirmation will be marked as accepted automatically. This will be recorded as a backdated shift.';

  const requestCreate = async () => {
    if (hasPastDates) {
      const result = await confirm({
        title: 'Create backdated shift?',
        message: `${backdatedWarning} Continue?`,
        confirmText: 'Create anyway',
        cancelText: 'Cancel',
      });
      if (result !== 'confirm') return;
    }
    await handleSave();
  };

  const jobOpts = jobTypeOptions ?? jobTypeSelectOptions();

  const shiftCount =
    (Array.isArray(selectedWorkers) ? selectedWorkers.length : 0) *
    (Array.isArray(selectedDates) ? selectedDates.length : 0);

  const onsiteLeadModalWorkerName = onsiteLeadModalWorkerId
    ? employeeNameById.get(String(onsiteLeadModalWorkerId)) || 'Worker'
    : '';
  const onsiteLeadModalEditing =
    Boolean(onsiteLeadModalWorkerId) &&
    divisionsForOnsiteWorker(String(onsiteLeadModalWorkerId || '')).length > 0;

  const onsiteLeadReviewText = useMemo(() => {
    if (!hasOnsiteLeadAssignment) return '';
    const byWorker = new Map<string, string[]>();
    for (const [divId, workerId] of Object.entries(leadAssignments)) {
      const list = byWorker.get(workerId) || [];
      list.push(getProjectDivisionLabel(divId, projectDivisions));
      byWorker.set(workerId, list);
    }
    return Array.from(byWorker.entries())
      .map(
        ([workerId, labels]) =>
          `${employeeNameById.get(String(workerId)) || 'Worker'} (${labels.join(', ')})`,
      )
      .join('; ');
  }, [hasOnsiteLeadAssignment, leadAssignments, projectDivisions, employeeNameById]);

  const onsiteLeadMiniModal = (
    <AppFormModal
      open={Boolean(onsiteLeadModalWorkerId)}
      onClose={closeOnsiteLeadModal}
      title="Assign as on-site lead"
      description={onsiteLeadModalWorkerName}
      size="sm"
      overlayClassName="z-[200]"
      bodyFill={false}
      footer={
        <div className={uiCx(uiLayout.actionsRow, 'w-full justify-between gap-2')}>
          {onsiteLeadModalEditing ? (
            <AppButton
              variant="secondary"
              size="sm"
              type="button"
              onClick={handleClearOnsiteLead}
              disabled={saving}
            >
              Remove
            </AppButton>
          ) : (
            <span />
          )}
          <div className={uiCx(uiLayout.actionsRow, 'justify-end')}>
            <AppButton
              variant="secondary"
              size="sm"
              type="button"
              onClick={closeOnsiteLeadModal}
              disabled={saving}
            >
              Cancel
            </AppButton>
            <AppButton
              size="sm"
              type="button"
              onClick={handleConfirmOnsiteLead}
              disabled={saving || onsiteLeadModalDivisionIds.length === 0}
            >
              Assign
            </AppButton>
          </div>
        </div>
      }
    >
      <div className={uiSpacing.sectionStack}>
        <p className={uiCx(uiTypography.helper, 'text-gray-600')}>
          Choose which empty project divisions this person should lead. Different people can lead
          different divisions. Existing project leads are not changed.
        </p>
        <div className="space-y-2">
          {availableDivisions.map((divId) => {
            const checked = onsiteLeadModalDivisionIds.includes(divId);
            const assignedTo = leadAssignments[divId] ? String(leadAssignments[divId]) : null;
            const assignedToOther =
              Boolean(assignedTo) &&
              Boolean(onsiteLeadModalWorkerId) &&
              assignedTo !== String(onsiteLeadModalWorkerId);
            const baseLabel = getProjectDivisionLabel(divId, projectDivisions);
            const label = assignedToOther
              ? `${baseLabel} (currently ${employeeNameById.get(assignedTo!) || 'another person'})`
              : baseLabel;
            return (
              <AppCheckbox
                key={divId}
                label={label}
                checked={checked}
                disabled={saving}
                onChange={(next) => {
                  setOnsiteLeadModalDivisionIds((prev) =>
                    next
                      ? [...prev.filter((id) => id !== divId), divId]
                      : prev.filter((id) => id !== divId),
                  );
                }}
              />
            );
          })}
        </div>
      </div>
    </AppFormModal>
  );

  if (designSystem) {
    const multiCrew =
      Array.isArray(selectedWorkers) && selectedWorkers.length >= 2;
    const wizardSteps = multiCrew ? CREATE_SHIFT_STEPS_CREW : CREATE_SHIFT_STEPS_SINGLE;
    const totalSteps = wizardSteps.length;
    const datesStep = multiCrew ? 3 : 2;
    const notesStep = multiCrew ? 4 : 3;
    const reviewStep = multiCrew ? 5 : 4;
    const canProceedStep1 = Array.isArray(selectedWorkers) && selectedWorkers.length > 0;
    const canProceedDatesStep =
      Array.isArray(selectedDates) && selectedDates.length > 0 && !!startTime && !!endTime;

    const stepPillClass = (n: number) =>
      uiCx(
        'rounded-full px-2 py-1 text-xs font-semibold',
        step === n ? 'bg-gray-900 text-white' : 'bg-gray-200 text-gray-600',
      );

    const stepIndicators = (
      <div className={uiCx(uiLayout.actionsRow, uiTypography.helper, 'text-xs font-semibold')}>
        {wizardSteps.map((_, index) => (
          <Fragment key={index}>
            {index > 0 ? <span className="text-gray-600">→</span> : null}
            <span className={stepPillClass(index + 1)}>{index + 1}</span>
          </Fragment>
        ))}
      </div>
    );

    const goNext = () => {
      setError('');
      if (step === 1 && !canProceedStep1) {
        setError('Select at least one worker to continue.');
        return;
      }
      if (step === datesStep && !canProceedDatesStep) {
        setError('Choose at least one date and a time range to continue.');
        return;
      }
      setStep((s) => Math.min(totalSteps, s + 1));
    };

    const overlapBlock =
      overlapWarnings.length > 0 ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <div className="font-semibold">Schedule conflicts detected</div>
          <p className="mt-1 text-sm text-amber-800">
            These shifts can still be created, but this worker already has overlapping time on
            another shift.
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-4 text-sm">
            {overlapWarnings.slice(0, 8).map((w) => {
              const projectLabel =
                w.conflicts
                  .map((c) => c.project_name)
                  .filter(Boolean)
                  .slice(0, 2)
                  .join(', ') || 'another project';
              return (
                <li key={`${w.workerId}-${w.date}`}>
                  {w.workerName} on{' '}
                  {new Date(w.date + 'T12:00:00').toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                  })}{' '}
                  overlaps {projectLabel}
                </li>
              );
            })}
            {overlapWarnings.length > 8 ? (
              <li>…and {overlapWarnings.length - 8} more</li>
            ) : null}
          </ul>
        </div>
      ) : null;

    return (
      <>
      <AppFormModal
        open
        onClose={onClose}
        title="Create Shift"
        description={wizardSteps[step - 1]}
        formWidth="wide"
        dialogClassName="!w-[min(96vw,72rem)] !max-w-[min(96vw,72rem)]"
        dialogClassNameExpanded="!w-[min(96vw,calc(72rem+1.5rem+16rem))] !max-w-[min(96vw,calc(72rem+1.5rem+16rem))]"
        scrollBody={step !== 1}
        quickInfo={createShiftQuickInfo}
        headerExtra={stepIndicators}
        footer={
          <div className={uiCx(uiLayout.actionsRow, 'w-full flex-wrap justify-between gap-3')}>
            <span className={uiTypography.helper}>
              Step {step} of {totalSteps}
            </span>
            <div className={uiCx(uiLayout.actionsRow, 'justify-end')}>
              <AppButton variant="secondary" size="sm" type="button" onClick={onClose} disabled={saving}>
                Cancel
              </AppButton>
              {step > 1 ? (
                <AppButton
                  variant="secondary"
                  size="sm"
                  type="button"
                  disabled={saving}
                  onClick={() => {
                    setError('');
                    setStep((s) => Math.max(1, s - 1));
                  }}
                >
                  Back
                </AppButton>
              ) : null}
              {step < totalSteps ? (
                <AppButton
                  key="create-shift-next"
                  size="sm"
                  type="button"
                  disabled={
                    saving ||
                    (step === 1 && !canProceedStep1) ||
                    (step === datesStep && !canProceedDatesStep)
                  }
                  onClick={goNext}
                >
                  Next
                </AppButton>
              ) : (
                <AppButton
                  key="create-shift-submit"
                  size="sm"
                  type="button"
                  disabled={!canSubmit || saving}
                  loading={saving}
                  onClick={() => {
                    void requestCreate();
                  }}
                >
                  {saving
                    ? 'Creating...'
                    : canSubmit
                      ? `Create ${shiftCount} Shift${shiftCount > 1 ? 's' : ''}`
                      : 'Create Shift'}
                </AppButton>
              )}
            </div>
          </div>
        }
      >
        <form
          id="create-shift-form-ds"
          onSubmit={(e) => {
            e.preventDefault();
            // Enter advances the wizard. Create is an explicit button click so the
            // Next → Create swap cannot submit in the same click.
            if (step < totalSteps) goNext();
          }}
          className={uiCx(uiSpacing.sectionStack, 'space-y-4')}
        >
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 whitespace-pre-line">
              {error}
            </div>
          )}

          {step === 1 ? (
            <div className={uiSpacing.sectionStack}>
              <p className={uiCx(uiTypography.helper, 'text-gray-600')}>
                Who should be scheduled? Filter by division, then tap people to select.
                {onsiteLeadEnabled
                  ? ' Use the star to assign someone as on-site lead for empty divisions.'
                  : ''}
                {multiCrew
                  ? ' With 2+ people you can set an optional group lead on the next step.'
                  : ''}
              </p>
              <ShiftWorkerDivisionPicker
                employees={Array.isArray(employees) ? employees : []}
                loading={employeesLoading}
                projectDivisions={projectDivisions}
                value={Array.isArray(selectedWorkers) ? selectedWorkers : []}
                onChange={setSelectedWorkers}
                disabled={saving}
                onsiteLeadEnabled={onsiteLeadEnabled}
                onsiteLeadWorkerIds={onsiteLeadWorkerIds}
                onOnsiteLeadStarClick={handleOnsiteLeadStarClick}
              />
            </div>
          ) : null}

          {multiCrew && step === 2 ? (
            <div className={uiSpacing.sectionStack}>
              <p className={uiCx(uiTypography.helper, 'text-gray-600')}>
                Optional. Tap a person (or the crown) to set the group lead for this crew. Use the
                star to change the project on-site lead. Each person still gets their own shift.
              </p>
              <ShiftCrewMemberCards
                employees={Array.isArray(employees) ? employees : []}
                workerIds={Array.isArray(selectedWorkers) ? selectedWorkers : []}
                disabled={saving}
                groupLeadWorkerId={groupLeadWorkerId}
                onGroupLeadClick={(workerId) => {
                  setGroupLeadWorkerId((prev) =>
                    prev && String(prev) === String(workerId) ? null : String(workerId),
                  );
                }}
                onsiteLeadEnabled={onsiteLeadEnabled}
                onsiteLeadWorkerIds={onsiteLeadWorkerIds}
                onOnsiteLeadStarClick={handleOnsiteLeadStarClick}
              />
            </div>
          ) : null}

          {step === datesStep ? (
            <div className={uiSpacing.sectionStack}>
              <p className={uiCx(uiTypography.helper, 'text-gray-600')}>
                How do you want to pick the dates?
              </p>
              <AppChoiceCards
                value={dateMode}
                onChange={(mode) => {
                  setDateMode(mode);
                  const anchor = mode === 'single' ? date : dateFrom || date;
                  const d = new Date(`${anchor}T12:00:00`);
                  if (!Number.isNaN(d.getTime())) {
                    setCalMonth(new Date(d.getFullYear(), d.getMonth(), 1));
                  }
                }}
                disabled={saving}
                options={[
                  {
                    value: 'single',
                    title: 'Single date',
                    description: 'Schedule one day for the selected workers.',
                    icon: CalendarDays,
                  },
                  {
                    value: 'range',
                    title: 'Date range',
                    description: 'Click start and end days — optionally skip weekends.',
                    icon: CalendarRange,
                  },
                ]}
              />

              <div className="space-y-3">
              <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-[16.5rem_minmax(0,1fr)]">
                <div className="min-w-0 space-y-3">
                  <div
                    className={uiCx(
                      uiRadius.card,
                      uiBorders.subtle,
                      uiColors.surface,
                      'w-full max-w-[16.5rem] overflow-hidden',
                    )}
                  >
                    <AppCalendarBase
                      bare
                      density="picker"
                      monthLabel={calMonthLabel}
                      days={createShiftCalendarDays}
                      onPrevious={() =>
                        setCalMonth(new Date(calMonth.getFullYear(), calMonth.getMonth() - 1, 1))
                      }
                      onNext={() =>
                        setCalMonth(new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 1))
                      }
                      headerExtra={
                        <AppButton
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-6 min-h-0 px-1.5 text-xs"
                          onClick={() => {
                            const now = new Date();
                            setCalMonth(new Date(now.getFullYear(), now.getMonth(), 1));
                            if (dateMode === 'single') {
                              setDate(todayStr);
                            } else {
                              setDateFrom(todayStr);
                              setDateTo(todayStr);
                            }
                          }}
                        >
                          Today
                        </AppButton>
                      }
                      footer={
                        <div
                          className={uiCx(
                            uiLayout.actionsRow,
                            'justify-between gap-2 text-xs text-gray-600',
                          )}
                        >
                          <span className="min-w-0 truncate">
                            {workerIdsKey
                              ? 'Numbers in the corner = existing shifts'
                              : 'Select workers in step 1 to see their existing shifts'}
                          </span>
                          {dateRangeSummary ? (
                            <span className="shrink-0 font-semibold text-gray-800">
                              {dateRangeSummary}
                            </span>
                          ) : null}
                        </div>
                      }
                    />
                  </div>

                  {dateMode === 'range' ? (
                    <AppCheckbox
                      label="Exclude weekends"
                      checked={excludeWeekends}
                      onChange={setExcludeWeekends}
                    />
                  ) : null}
                </div>

                <div className="min-w-0 space-y-3">
                  <AppControlLabelRow label="Time of day" />
                  <AppChoiceCards
                    size="compact"
                    columns={2}
                    value={timePreset}
                    onChange={(preset) => applyTimePreset(preset)}
                    disabled={saving}
                    options={SHIFT_TIME_PRESET_OPTIONS.map((opt) => ({
                      value: opt.value,
                      title: opt.label,
                      icon: SHIFT_TIME_PRESET_ICONS[opt.value],
                    }))}
                  />
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <AppTimePicker
                      label="Start Time"
                      value={startTime}
                      onChange={(e) => {
                        const next = e.target.value;
                        setStartTime(next);
                        setTimePreset(detectPreset(next, endTime));
                      }}
                    />
                    <AppTimePicker
                      label="End Time"
                      value={endTime}
                      onChange={(e) => {
                        const next = e.target.value;
                        setEndTime(next);
                        setTimePreset(detectPreset(startTime, next));
                      }}
                    />
                  </div>
                </div>
              </div>

              {hasPastDates ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                  <div className="font-semibold">Past date selected</div>
                  <p className="mt-1 text-amber-900">{backdatedWarning}</p>
                </div>
              ) : null}
              </div>

              {overlapBlock}
            </div>
          ) : null}

          {step === notesStep ? (
            <div className={uiSpacing.sectionStack}>
              <p className={uiCx(uiTypography.helper, 'text-gray-600')}>
                Optional. Add a job type or a note the worker will see.
              </p>
              <AppSelect
                label="Job Type"
                value={jobType}
                onChange={(e) => setJobType(e.target.value)}
                options={jobOpts}
                fieldHint="Job Type\n\nOptional label for the type of work during this shift."
              />
              <ShiftNoteField
                projectId={projectId}
                value={notes}
                onChange={setNotes}
                disabled={saving}
                flags={noteFlags}
                onFlagsChange={setNoteFlags}
              />
            </div>
          ) : null}

          {step === reviewStep ? (
            <div className={uiSpacing.sectionStack}>
              <p className={uiCx(uiTypography.helper, 'text-gray-600')}>
                Check the details, then create {shiftCount} shift{shiftCount === 1 ? '' : 's'}.
              </p>
              <dl className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white">
                {(
                  [
                    [
                      'People',
                      (Array.isArray(selectedWorkers) ? selectedWorkers : [])
                        .map((id) => employeeNameById.get(String(id)) || 'Worker')
                        .join(', ') || 'None',
                    ],
                    ...(multiCrew
                      ? ([
                          [
                            'Group lead',
                            groupLeadWorkerId
                              ? employeeNameById.get(String(groupLeadWorkerId)) || 'Worker'
                              : 'None',
                          ],
                        ] as const)
                      : []),
                    ...(hasOnsiteLeadAssignment && onsiteLeadReviewText
                      ? ([['On-site lead', onsiteLeadReviewText]] as const)
                      : []),
                    ['Dates', dateRangeSummary || 'None'],
                    [
                      'Time',
                      startTime && endTime
                        ? `${formatTime12h(startTime)} – ${formatTime12h(endTime)}`
                        : 'None',
                    ],
                    [
                      'Job type',
                      jobOpts.find((opt) => opt.value === jobType)?.label || 'No job type',
                    ],
                    ['Note', notes.trim() || 'None'],
                  ] as const
                ).map(([label, valueText]) => (
                  <div key={label} className="grid gap-1 px-3 py-2.5 sm:grid-cols-[7rem_minmax(0,1fr)] sm:gap-3">
                    <dt className="text-sm font-semibold text-gray-500">{label}</dt>
                    <dd className="text-sm text-gray-900 whitespace-pre-wrap">{valueText}</dd>
                  </div>
                ))}
              </dl>
              {notes.trim() && (noteFlags.saveOnProject || noteFlags.saveGlobal) ? (
                <p className={uiCx(uiTypography.helper, 'text-gray-600')}>
                  This note will also be saved
                  {noteFlags.saveOnProject && noteFlags.saveGlobal
                    ? ' on this project and for all projects'
                    : noteFlags.saveOnProject
                      ? ' on this project'
                      : ' for all projects'}
                  .
                </p>
              ) : null}
              {overlapBlock}
            </div>
          ) : null}
        </form>
      </AppFormModal>
      {onsiteLeadMiniModal}
      </>
    );
  }

  return (
    <>
    {onsiteLeadMiniModal}
    <OverlayPortal><div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="max-w-4xl w-full max-h-[90vh] flex flex-col rounded-xl border border-gray-200 bg-gray-100 shadow-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex-shrink-0 rounded-t-xl border-b border-gray-200 bg-white p-4">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-lg hover:bg-gray-100 text-gray-600"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Create Shift</h2>
              <p className="text-sm text-gray-600 mt-0.5">Add shifts for workers on the project</p>
            </div>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          <form
            id="create-shift-form"
            onSubmit={(e) => {
              e.preventDefault();
              void requestCreate();
            }}
            className="rounded-xl border border-gray-200 bg-white p-4 space-y-4"
          >
            {error && (
              <div className="p-3 bg-red-100 text-red-700 rounded-lg text-sm whitespace-pre-line">
                {error}
              </div>
            )}

            <div>
              <label className="text-sm font-semibold text-gray-600 uppercase tracking-wide block mb-1">
                Workers {(Array.isArray(selectedWorkers) ? selectedWorkers.length : 0) > 0 && `(${Array.isArray(selectedWorkers) ? selectedWorkers.length : 0} selected)`}
              </label>
              <div className="relative" ref={workerDropdownRef}>
                <button
                  type="button"
                  onClick={() => setWorkerDropdownOpen(!workerDropdownOpen)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-left bg-white flex items-center justify-between focus:outline-none focus:ring-1 focus:ring-gray-300 focus:border-gray-300"
                >
                  <span className="text-sm text-gray-600">
                    {(Array.isArray(selectedWorkers) ? selectedWorkers.length : 0) === 0
                      ? 'Select workers...'
                      : `${Array.isArray(selectedWorkers) ? selectedWorkers.length : 0} worker${(Array.isArray(selectedWorkers) ? selectedWorkers.length : 0) > 1 ? 's' : ''} selected`}
                  </span>
                <span className="text-gray-600">{workerDropdownOpen ? '▲' : '▼'}</span>
              </button>
              {workerDropdownOpen && (
                <div
                  className="absolute z-50 mt-1 w-full rounded-lg border bg-white shadow-lg max-h-60 overflow-auto"
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  <div className="p-2 border-b space-y-2">
                    <input
                      type="text"
                      placeholder="Search workers..."
                      value={workerSearch}
                      onChange={(e) => setWorkerSearch(e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-300 focus:border-gray-300"
                      onMouseDown={(e) => e.stopPropagation()}
                    />
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          if (!Array.isArray(filteredEmployees)) return;
                          const allFilteredIds = filteredEmployees.map((e: any) => e.id);
                          setSelectedWorkers((prev) => {
                            const prevArray = Array.isArray(prev) ? prev : [];
                            const newSet = new Set([...prevArray, ...allFilteredIds]);
                            return Array.from(newSet);
                          });
                        }}
                        className="text-sm px-2 py-1 rounded border hover:bg-gray-50"
                      >
                        Select All
                      </button>
                      <button
                        type="button"
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setSelectedWorkers([]);
                        }}
                        className="text-sm px-2 py-1 rounded border hover:bg-gray-50"
                      >
                        Clear All
                      </button>
                    </div>
                  </div>
                  <div className="p-2">
                    {(Array.isArray(filteredEmployees) && filteredEmployees.length > 0) ? (
                      filteredEmployees.map((emp: any) => (
                        <label
                          key={emp.id}
                          className="flex items-center gap-2 p-2 hover:bg-gray-50 cursor-pointer rounded"
                          onMouseDown={(e) => e.stopPropagation()}
                        >
                          <input
                            type="checkbox"
                            checked={Array.isArray(selectedWorkers) && selectedWorkers.includes(emp.id)}
                            onChange={() => toggleWorker(emp.id)}
                            className="rounded"
                            onMouseDown={(e) => e.stopPropagation()}
                          />
                          <div className="flex items-center gap-2 flex-1">
                            {emp.profile_photo_file_id ? (
                              <img
                                src={withFileAccessToken('/files/' + emp.profile_photo_file_id + '/thumbnail?w=64')}
                                className="w-6 h-6 rounded-full object-cover"
                                alt=""
                              />
                            ) : (
                              <span className="w-6 h-6 rounded-full bg-gray-200 inline-block" />
                            )}
                            <span className="text-sm">{emp.name || emp.username}</span>
                          </div>
                        </label>
                      ))
                    ) : (
                      <div className="p-2 text-sm text-gray-600">No workers found</div>
                    )}
                  </div>
                </div>
              )}
            </div>
            {Array.isArray(selectedWorkers) && selectedWorkers.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                  {selectedWorkers.map((workerId) => {
                    const worker = (Array.isArray(employees) ? employees : []).find((e: any) => e.id === workerId);
                    return (
                      <span
                        key={workerId}
                        className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-800 rounded text-sm"
                      >
                        {worker?.name || worker?.username || workerId}
                        <button
                          type="button"
                          onClick={() => toggleWorker(workerId)}
                          className="text-blue-600 hover:text-blue-800"
                        >
                          ×
                        </button>
                      </span>
                    );
                  })}
              </div>
            )}
          </div>

            <div>
              <label className="text-sm font-semibold text-gray-600 uppercase tracking-wide block mb-1">Date Selection</label>
              <div className="flex items-center gap-4 mb-2">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="dateMode"
                    checked={dateMode === 'single'}
                    onChange={() => setDateMode('single')}
                    className="rounded border-gray-200"
                  />
                  <span className="text-sm">Single Date</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="dateMode"
                    checked={dateMode === 'range'}
                    onChange={() => setDateMode('range')}
                    className="rounded border-gray-200"
                  />
                  <span className="text-sm">Date Range</span>
                </label>
              </div>

              {dateMode === 'single' ? (
                <div>
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-300 focus:border-gray-300"
                  />
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-sm font-semibold text-gray-600 uppercase tracking-wide block mb-1">From</label>
                      <input
                        type="date"
                        value={dateFrom}
                        onChange={(e) => setDateFrom(e.target.value)}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-300 focus:border-gray-300"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-semibold text-gray-600 uppercase tracking-wide block mb-1">To</label>
                      <input
                        type="date"
                        value={dateTo}
                        onChange={(e) => setDateTo(e.target.value)}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-300 focus:border-gray-300"
                      />
                    </div>
                  </div>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={excludeWeekends}
                      onChange={(e) => setExcludeWeekends(e.target.checked)}
                      className="rounded border-gray-200"
                    />
                    <span className="text-sm font-semibold text-gray-600 uppercase tracking-wide">Exclude weekends</span>
                  </label>
                {dateRangeSummary ? (
                  <div className="text-sm text-gray-600">{dateRangeSummary}</div>
                ) : null}
              </div>
            )}
            {hasPastDates ? (
              <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
                <div className="font-semibold">Past date selected</div>
                <p className="mt-1 text-amber-900">{backdatedWarning}</p>
              </div>
            ) : null}
          </div>

            {overlapWarnings.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                <div className="font-semibold">Schedule conflicts detected</div>
                <p className="mt-1 text-sm text-amber-800">
                  These shifts can still be created, but this worker already has overlapping time on
                  another shift.
                </p>
              </div>
            )}

            <div className="space-y-2">
              <AppControlLabelRow label="Time of day" />
              <div className="flex flex-wrap gap-2">
                {SHIFT_TIME_PRESET_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    disabled={saving}
                    onClick={() => applyTimePreset(opt.value)}
                    className={`rounded-lg border px-3 py-1.5 text-sm font-semibold ${
                      timePreset === opt.value
                        ? 'border-[#7f1010] bg-red-50 text-[#7f1010]'
                        : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              {timePreset === 'custom' ? (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-semibold text-gray-600 uppercase tracking-wide block mb-1">
                      Start Time
                    </label>
                    <input
                      type="time"
                      value={startTime}
                      onChange={(e) => {
                        setStartTime(e.target.value);
                        setTimePreset('custom');
                      }}
                      step="900"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-300 focus:border-gray-300"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-semibold text-gray-600 uppercase tracking-wide block mb-1">
                      End Time
                    </label>
                    <input
                      type="time"
                      value={endTime}
                      onChange={(e) => {
                        setEndTime(e.target.value);
                        setTimePreset('custom');
                      }}
                      step="900"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-300 focus:border-gray-300"
                    />
                  </div>
                </div>
              ) : null}
            </div>

            <div>
              <label className="text-sm font-semibold text-gray-600 uppercase tracking-wide block mb-1">
                Job Type <span className="text-gray-600 normal-case">(optional)</span>
              </label>
              <select
                value={jobType}
                onChange={(e) => setJobType(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-300 focus:border-gray-300"
              >
                {jobOpts.map((opt) => (
                  <option key={opt.value || '__none'} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <ShiftNoteField
              projectId={projectId}
              value={notes}
              onChange={setNotes}
              disabled={saving}
              variant="legacy"
              flags={noteFlags}
              onFlagsChange={setNoteFlags}
            />
          </form>
        </div>
        <div className="flex-shrink-0 px-4 py-4 border-t border-gray-200 bg-white flex items-center justify-end gap-3 rounded-b-xl">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="px-3 py-1.5 rounded-lg text-sm font-semibold text-gray-700 border border-gray-200 hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="create-shift-form"
            disabled={!canSubmit || saving}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-brand-red hover:bg-[#aa1212] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving
              ? 'Creating...'
              : canSubmit
              ? `Create ${shiftCount} Shift${shiftCount > 1 ? 's' : ''}`
              : 'Create Shift'}
          </button>
        </div>
      </div>
    </div></OverlayPortal>
    </>
  );
}
