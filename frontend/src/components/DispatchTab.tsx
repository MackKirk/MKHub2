import { useState, useMemo, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import { api, withFileAccessToken } from '@/lib/api';
import toast from 'react-hot-toast';
import { useConfirm } from '@/components/ConfirmProvider';
import EditShiftModal from '@/components/EditShiftModal';
import { formatDateLocal, getTodayLocal } from '@/lib/dateUtils';
import OverlayPortal from '@/components/OverlayPortal';
import {
  hasProjectFeatureWritePermission,
  isAdminRole,
} from '@/lib/projectLinePermissionKeys';
import { mapEmployeeToAppUserSelect } from '@/lib/clientUi';
import { createShiftQuickInfo } from '@/lib/formModalQuickInfo';
import {
  AppButton,
  AppCard,
  AppCheckbox,
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
import { JOB_TYPES } from '@/constants/jobTypes';

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

  // Check if editing is restricted based on status (only Finished restricts editing for workload)
  const isEditingRestricted = useMemo(() => {
    if (!statusLabel) return false;
    const statusLower = String(statusLabel).trim().toLowerCase();
    return statusLower === 'finished';
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

  const { data: employees } = useQuery({
    queryKey: ['employees'],
    queryFn: () => api<any[]>('GET', '/employees'),
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
    () => [
      { value: '', label: 'No job type selected' },
      ...JOB_TYPES.map((job) => ({ value: job.name, label: job.name })),
    ],
    [],
  );

  const alertBanners = (
    <>
      {isEditingRestricted && statusLabel && (
        <div
          className={
            designSystem
              ? uiCx(
                  'rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900',
                )
              : 'mb-4 rounded border border-yellow-200 bg-yellow-50 p-3 text-xs text-yellow-800'
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
              ? uiCx(uiRadius.card, uiBorders.subtle, uiColors.surfaceSubtle, 'p-3 text-xs text-gray-700')
              : 'mb-4 rounded border border-gray-200 bg-gray-50 p-3 text-xs text-gray-700'
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
        className={`rounded px-3 py-1.5 text-xs font-medium ${view === 'calendar' ? 'bg-brand-red text-white' : 'bg-gray-100 text-gray-700'}`}
      >
        Calendar
      </button>
      {canEditWorkload && (
        <button
          type="button"
          onClick={() => setView('pending')}
          className={`rounded px-3 py-1.5 text-xs font-medium ${view === 'pending' ? 'bg-brand-red text-white' : 'bg-gray-100 text-gray-700'}`}
        >
          Pending Queue
          {pendingAttendance && pendingAttendance.length > 0 && (
            <span className="ml-1.5 rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-medium text-white">
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
          className="px-3 py-1.5 rounded text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-1.5"
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
          className="px-3 py-1.5 rounded text-xs font-medium bg-brand-red text-white"
          disabled={deleteMode}
        >
          + Create Shift
        </button>
        <button
          onClick={toggleDeleteMode}
          className={`px-3 py-1.5 rounded text-xs font-medium text-white ${
            deleteMode ? 'bg-gray-600 hover:bg-gray-700' : 'bg-red-600 hover:bg-red-700'
          }`}
        >
          {deleteMode ? 'Cancel Delete' : 'Delete Shifts'}
        </button>
        {deleteMode && selectedShiftsForDelete.size > 0 && (
          <button
            onClick={handleDeleteSelectedShifts}
            className="px-3 py-1.5 rounded text-xs font-medium bg-red-600 hover:bg-red-700 text-white"
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
      <button onClick={goPrevWeek} className="px-2.5 py-1 rounded border text-xs font-medium">
        ← Prev
      </button>
      <input
        type="date"
        value={selectedDate}
        onChange={(e) => onWeekDatePick(e.target.value)}
        className="border rounded px-2.5 py-1 text-xs"
      />
      <button onClick={goNextWeek} className="px-2.5 py-1 rounded border text-xs font-medium">
        Next →
      </button>
      <span className="text-xs font-semibold text-gray-700 min-w-[180px] text-center">{weekLabel}</span>
      <button onClick={goTodayWeek} className="px-2.5 py-1 rounded border text-xs font-medium">
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
              <div className="flex items-center gap-2 text-xs text-orange-800">
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
                      ? uiCx(uiTypography.helper, 'font-semibold text-gray-600 text-center py-0.5')
                      : 'text-[10px] font-semibold text-gray-600 text-center py-0.5'
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
                    className={`h-64 rounded border bg-white p-1.5 flex flex-col ${
                      deleteMode ? '' : 'cursor-pointer'
                    } ${
                      isSelected && !deleteMode ? 'ring-2 ring-brand-red border-brand-red' : ''
                    } ${isToday && !isSelected && !deleteMode ? 'ring-1 ring-gray-300' : ''}`}
                  >
                    <div className="text-[10px] font-semibold text-gray-700 flex-shrink-0 mb-0.5">
                      <div className="text-[9px] text-gray-500 uppercase">{dayName}</div>
                      <div>{dayNumber}</div>
                    </div>
                    <div 
                      className="flex-1 overflow-y-auto min-h-0 space-y-1" 
                      style={{ scrollbarWidth: 'thin' }}
                      onMouseDown={(e) => e.stopPropagation()}
                    >
                      {dayShifts.length > 0 ? (
                        dayShifts.map((shift: any) => {
                          const worker = employees?.find((e: any) => e.id === shift.worker_id);
                          const isShiftSelected = selectedShiftsForDelete.has(shift.id);
                          const canDelete = !isPastDate;
                          
                          return (
                            <div
                              key={shift.id}
                              className={`text-[10px] p-1 rounded group relative ${
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
                                  <div className="font-medium truncate text-[10px]">
                                    {worker?.name || shift.worker_id}
                                  </div>
                                  <span className="text-[9px] text-gray-600">
                                    {formatTime12h(shift.start_time)} - {formatTime12h(shift.end_time)}
                                  </span>
                                  {shift.job_name && (
                                    <div className="text-[9px] text-gray-500 mt-0.5 truncate">
                                      {shift.job_name}
                                    </div>
                                  )}
                                  {/* NOTE: During testing phase, past date validation is disabled */}
                                  {/* {deleteMode && !canDelete && (
                                    <div className="text-[8px] text-red-600 mt-0.5 font-medium">
                                      Past date
                                    </div>
                                  )} */}
                                </div>
                                {!deleteMode && (
                                  <div className="flex items-center gap-0.5 flex-shrink-0">
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
                        })
                      ) : (
                        <div className="text-[9px] text-gray-400" onMouseDown={(e) => e.stopPropagation()}>No shifts</div>
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
                : 'p-3 border-b text-xs font-semibold text-gray-900'
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
              <div className="p-3 text-xs text-gray-600">No pending attendance</div>
            )}
          </div>
        </div>
      )}
    </>
  );

  const modals = (
    <>
      {createShiftModal && project && employees && Array.isArray(employees) && (
        <CreateShiftModal
          projectId={projectId}
          project={project}
          employees={employees}
          defaultBreakMin={defaultBreakMin}
          defaultGeofenceRadius={defaultGeofenceRadius}
          designSystem={designSystem}
          jobTypeOptions={jobTypeOptions}
          onClose={() => setCreateShiftModal(false)}
          onSave={async () => {
            await refetchShifts();
            queryClient.invalidateQueries({ queryKey: ['projectRecentActivity', projectId] });
            invalidateWorkloadTabCounts();
            setCreateShiftModal(false);
          }}
        />
      )}

      {editShiftModal && project && employees && Array.isArray(employees) && editShiftModal?.id && (
        <EditShiftModal
          projectId={projectId}
          project={project}
          employees={employees}
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
            title="Workload"
            description="Employee shifts and workload scheduling. Use the week calendar to plan shifts or review pending attendance."
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
          <div className="text-xs font-medium text-gray-900">
            {worker?.name || attendance.worker_id} - {attendance.clock_in_time && !attendance.clock_out_time ? 'Clock In' : 
                                                      attendance.clock_out_time ? 'Clock Out' : 
                                                      attendance.type === 'in' ? 'Clock In' : 'Clock Out'}
          </div>
          <div className="text-[10px] text-gray-600 mt-0.5">
            {attendance.clock_in_time ? new Date(attendance.clock_in_time).toLocaleString() : 
             attendance.clock_out_time ? new Date(attendance.clock_out_time).toLocaleString() :
             attendance.time_selected_utc ? new Date(attendance.time_selected_utc).toLocaleString() : '--'}
          </div>
          {attendance.reason_text && (
            <div className="text-[10px] text-gray-700 mt-0.5">{attendance.reason_text}</div>
          )}
          {attendance.gps_lat && attendance.gps_lng && (
            <div className="text-[10px] text-gray-500 mt-0.5">
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
                    className="px-2.5 py-1 rounded text-xs font-medium bg-green-600 text-white"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => setShowReject(true)}
                    className="px-2.5 py-1 rounded text-xs font-medium bg-red-600 text-white"
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
                  className="border rounded px-2 py-1 text-xs w-32"
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
                    className="px-2.5 py-1 rounded text-xs font-medium bg-red-600 text-white"
                  >
                    Confirm
                  </button>
                  <button
                    onClick={() => {
                      setShowReject(false);
                      setRejectReason('');
                    }}
                    className="px-2.5 py-1 rounded text-xs font-medium bg-gray-100 text-gray-700"
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

function CreateShiftModal({
  projectId,
  project,
  employees,
  defaultBreakMin,
  defaultGeofenceRadius,
  designSystem,
  jobTypeOptions,
  onClose,
  onSave,
}: {
  projectId: string;
  project: any;
  employees: any[];
  defaultBreakMin: number;
  defaultGeofenceRadius: number;
  designSystem?: boolean;
  jobTypeOptions?: { value: string; label: string }[];
  onClose: () => void;
  onSave: () => Promise<void>;
}) {
  const [selectedWorkers, setSelectedWorkers] = useState<string[]>([]);
  const [dateMode, setDateMode] = useState<'single' | 'range'>('range');
  const [date, setDate] = useState(formatDateLocal(new Date()));
  const [dateFrom, setDateFrom] = useState(formatDateLocal(new Date()));
  const [dateTo, setDateTo] = useState(() => {
    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 6);
    return formatDateLocal(nextWeek);
  });
  const [excludeWeekends, setExcludeWeekends] = useState(false);
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('17:00');
  const [jobType, setJobType] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [workerDropdownOpen, setWorkerDropdownOpen] = useState(false);
  const [workerSearch, setWorkerSearch] = useState('');
  const workerDropdownRef = useRef<HTMLDivElement>(null);

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

  // Generate list of dates based on mode
  const selectedDates = useMemo(() => {
    if (dateMode === 'single') {
      return [date];
    } else {
      // Range mode
      const dates: string[] = [];
      // Parse dates in local timezone to avoid UTC issues
      const fromParts = dateFrom.split('-').map(Number);
      const toParts = dateTo.split('-').map(Number);
      const from = new Date(fromParts[0], fromParts[1] - 1, fromParts[2]);
      const to = new Date(toParts[0], toParts[1] - 1, toParts[2]);
      
      // Iterate through dates
      const current = new Date(from);
      while (current <= to) {
        const year = current.getFullYear();
        const month = String(current.getMonth() + 1).padStart(2, '0');
        const day = String(current.getDate()).padStart(2, '0');
        const dateStr = `${year}-${month}-${day}`;
        
        if (excludeWeekends) {
          const dayOfWeek = current.getDay();
          // getDay() returns: 0 = Sunday, 1 = Monday, ..., 6 = Saturday
          // We want to exclude Saturday (6) and Sunday (0)
          if (dayOfWeek !== 0 && dayOfWeek !== 6) {
            // Not Sunday (0) or Saturday (6) - include this date
            dates.push(dateStr);
          }
        } else {
          dates.push(dateStr);
        }
        
        // Move to next day
        current.setDate(current.getDate() + 1);
      }
      return dates;
    }
  }, [dateMode, date, dateFrom, dateTo, excludeWeekends]);

  // Filter employees by search
  const filteredEmployees = useMemo(() => {
    if (!employees || !Array.isArray(employees)) return [];
    if (!workerSearch) return employees;
    const searchLower = workerSearch.toLowerCase();
    return employees.filter((emp: any) => {
      const name = (emp.name || emp.username || '').toLowerCase();
      return name.includes(searchLower);
    });
  }, [employees, workerSearch]);

  const toggleWorker = (workerId: string) => {
    setSelectedWorkers((prev) => {
      const prevArray = Array.isArray(prev) ? prev : [];
      return prevArray.includes(workerId) 
        ? prevArray.filter((id) => id !== workerId) 
        : [...prevArray, workerId];
    });
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

    setError('');
    setSaving(true);

    try {
      // Use the provided default values (they should always be valid numbers)
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

      // Create shifts for each combination of worker and date
      const shiftsToCreate = [];
      const workersArray = Array.isArray(selectedWorkers) ? selectedWorkers : [];
      const datesArray = Array.isArray(selectedDates) ? selectedDates : [];
      for (const workerId of workersArray) {
        for (const dateStr of datesArray) {
          shiftsToCreate.push({
            worker_id: workerId,
            date: dateStr,
            start_time: startTime,
            end_time: endTime,
            default_break_min: breakMin,
            geofences,
            job_type: jobType || null,
            job_name: jobType || null, // Store the job type name for backward compatibility
          });
        }
      }

      // Call API to create multiple shifts
      let successCount = 0;
      let errorCount = 0;
      const errors: string[] = [];

      for (const shiftData of shiftsToCreate) {
        try {
          await api('POST', '/dispatch/projects/' + projectId + '/shifts', shiftData);
          successCount++;
        } catch (e: any) {
          errorCount++;
          const employeesArray = Array.isArray(employees) ? employees : [];
          const workerName = employeesArray.find((emp: any) => emp.id === shiftData.worker_id)?.name || shiftData.worker_id;
          const errorMsg = e.response?.data?.detail || e.message || 'Failed';
          errors.push(`${workerName} on ${new Date(shiftData.date).toLocaleDateString()}: ${errorMsg}`);
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
        // Still refresh to show created shifts
        if (successCount > 0) {
          await onSave();
        }
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

  // Safety check after hooks
  if (!project || !employees || !Array.isArray(employees)) {
    return null;
  }

  const canSubmit = Array.isArray(selectedWorkers) && selectedWorkers.length > 0 && Array.isArray(selectedDates) && selectedDates.length > 0;

  const employeeUsers = useMemo(
    () => (employees || []).map((e: any) => mapEmployeeToAppUserSelect(e)),
    [employees],
  );

  const jobOpts =
    jobTypeOptions ??
    [
      { value: '', label: 'No job type selected' },
      ...JOB_TYPES.map((job) => ({ value: job.name, label: job.name })),
    ];

  const shiftCount =
    (Array.isArray(selectedWorkers) ? selectedWorkers.length : 0) *
    (Array.isArray(selectedDates) ? selectedDates.length : 0);

  if (designSystem) {
    return (
      <AppFormModal
        open
        onClose={onClose}
        title="Create Shift"
        description="Add shifts for workers on the project"
        quickInfo={createShiftQuickInfo}
        footer={
          <div className={uiCx(uiLayout.actionsRow, 'w-full justify-end')}>
            <AppButton variant="secondary" size="sm" type="button" onClick={onClose} disabled={saving}>
              Cancel
            </AppButton>
            <AppButton
              size="sm"
              type="submit"
              form="create-shift-form-ds"
              disabled={!canSubmit || saving}
              loading={saving}
            >
              {saving
                ? 'Creating...'
                : canSubmit
                  ? `Create ${shiftCount} Shift${shiftCount > 1 ? 's' : ''}`
                  : 'Create Shift'}
            </AppButton>
          </div>
        }
      >
        <form
          id="create-shift-form-ds"
          onSubmit={(e) => {
            e.preventDefault();
            handleSave();
          }}
          className={uiCx(uiSpacing.sectionStack, 'space-y-4')}
        >
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 whitespace-pre-line">
              {error}
            </div>
          )}

          <AppUserSelect
            mode="multiple"
            label="Workers *"
            users={employeeUsers}
            value={Array.isArray(selectedWorkers) ? selectedWorkers : []}
            onChange={setSelectedWorkers}
            fieldHint="Workers\n\nSelect one or more employees who will be scheduled for the chosen dates."
          />

          <AppSelect
            label="Date Selection"
            value={dateMode}
            onChange={(e) => setDateMode(e.target.value as 'single' | 'range')}
            options={[
              { value: 'single', label: 'Single Date' },
              { value: 'range', label: 'Date Range' },
            ]}
          />

          {dateMode === 'single' ? (
            <AppDatePicker
              label="Date *"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          ) : (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <AppDatePicker
                  label="From *"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                />
                <AppDatePicker
                  label="To *"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                />
              </div>
              <AppCheckbox
                label="Exclude weekends"
                checked={excludeWeekends}
                onChange={setExcludeWeekends}
              />
              {Array.isArray(selectedDates) && selectedDates.length > 0 && (
                <p className={uiCx(uiTypography.helper, 'text-gray-600')}>
                  {selectedDates.length} day{selectedDates.length > 1 ? 's' : ''} selected
                  {selectedDates.length <= 10 && (
                    <span className="mt-1 block text-gray-500">
                      {selectedDates
                        .map((d) =>
                          new Date(d).toLocaleDateString('en-US', {
                            weekday: 'short',
                            month: 'short',
                            day: 'numeric',
                          }),
                        )
                        .join(', ')}
                    </span>
                  )}
                </p>
              )}
            </>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <AppTimePicker
              label="Start Time *"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
            />
            <AppTimePicker
              label="End Time *"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
            />
          </div>

          <AppSelect
            label="Job Type"
            value={jobType}
            onChange={(e) => setJobType(e.target.value)}
            options={jobOpts}
            fieldHint="Job Type\n\nOptional label for the type of work during this shift."
          />
        </form>
      </AppFormModal>
    );
  }

  return (
    <OverlayPortal><div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="max-w-2xl w-full max-h-[90vh] flex flex-col rounded-xl border border-gray-200 bg-gray-100 shadow-xl overflow-hidden"
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
              <p className="text-xs text-gray-500 mt-0.5">Add shifts for workers on the project</p>
            </div>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          <form
            id="create-shift-form"
            onSubmit={(e) => { e.preventDefault(); handleSave(); }}
            className="rounded-xl border border-gray-200 bg-white p-4 space-y-4"
          >
            {error && (
              <div className="p-3 bg-red-100 text-red-700 rounded-lg text-sm whitespace-pre-line">
                {error}
              </div>
            )}

            {/* Worker Selection with Multi-Select */}
            <div>
              <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide block mb-1">
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
                <span className="text-gray-400">{workerDropdownOpen ? '▲' : '▼'}</span>
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
                        className="text-xs px-2 py-1 rounded border hover:bg-gray-50"
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
                        className="text-xs px-2 py-1 rounded border hover:bg-gray-50"
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

            {/* Date Selection Mode */}
            <div>
              <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide block mb-1">Date Selection</label>
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
                      <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide block mb-1">From</label>
                      <input
                        type="date"
                        value={dateFrom}
                        onChange={(e) => setDateFrom(e.target.value)}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-300 focus:border-gray-300"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide block mb-1">To</label>
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
                    <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">Exclude weekends</span>
                  </label>
                {Array.isArray(selectedDates) && selectedDates.length > 0 && (
                  <div className="text-xs text-gray-600">
                    {selectedDates.length} day{selectedDates.length > 1 ? 's' : ''} selected
                    {selectedDates.length <= 10 && (
                      <div className="mt-1 text-gray-500">
                        {selectedDates.map((d) => new Date(d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })).join(', ')}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide block mb-1">Start Time</label>
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  step="900"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-300 focus:border-gray-300"
                />
              </div>
              <div>
                <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide block mb-1">End Time</label>
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  step="900"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-300 focus:border-gray-300"
                />
              </div>
            </div>

            {/* Job Type Selection (Optional) */}
            <div>
              <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide block mb-1">
                Job Type <span className="text-gray-400 normal-case">(optional)</span>
              </label>
              <select
                value={jobType}
                onChange={(e) => setJobType(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-300 focus:border-gray-300"
              >
                <option value="">No job type selected</option>
                {JOB_TYPES.map((job) => (
                  <option key={job.id} value={job.name}>
                    {job.name}
                  </option>
                ))}
              </select>
            </div>
          </form>
        </div>
        <div className="flex-shrink-0 px-4 py-4 border-t border-gray-200 bg-white flex items-center justify-end gap-3 rounded-b-xl">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="px-3 py-1.5 rounded-lg text-sm font-medium text-gray-700 border border-gray-200 hover:bg-gray-50 disabled:opacity-50"
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
              ? `Create ${selectedWorkers.length * selectedDates.length} Shift${selectedWorkers.length * selectedDates.length > 1 ? 's' : ''}`
              : 'Create Shift'}
          </button>
        </div>
      </div>
    </div></OverlayPortal>
  );
}

