import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import OverlayPortal from '@/components/OverlayPortal';
import SubcontractorSimpleSignature from '@/components/SubcontractorSimpleSignature';
import { useConfirm } from '@/components/ConfirmProvider';

const inputClass =
  'w-full rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs text-gray-900 focus:ring-1 focus:ring-gray-400 focus:border-gray-400';

const toLocalInputValue = (iso?: string | null) => {
  if (!iso) return '';
  const date = new Date(iso);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
};

const formatDateTime = (iso?: string | null) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
};

const formatHours = (hours?: number | null) => {
  if (hours === undefined || hours === null) return '—';
  const totalMinutes = Math.round(hours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h}h ${m.toString().padStart(2, '0')}m`;
};

type ScAttendanceRow = {
  id: string;
  worker_id: string;
  worker_name: string;
  type?: string;
  clock_in_time?: string | null;
  clock_out_time?: string | null;
  status: string;
  project_name?: string | null;
  project_id?: string;
  job_name?: string | null;
  hours_worked?: number | null;
  break_minutes?: number | null;
  reason_text?: string | null;
  shift_id?: string | null;
  shift_deleted?: boolean;
  shift_deleted_by?: string | null;
  shift_deleted_at?: string | null;
};

type AttendanceEvent = {
  event_id: string;
  worker_id: string;
  worker_name: string;
  job_name?: string | null;
  project_name?: string | null;
  job_type?: string | null;
  shift_id?: string | null;
  shift_deleted?: boolean;
  shift_deleted_by?: string | null;
  shift_deleted_at?: string | null;
  clock_in_id?: string | null;
  clock_in_time?: string | null;
  clock_in_status?: string | null;
  clock_in_reason?: string | null;
  clock_out_id?: string | null;
  clock_out_time?: string | null;
  clock_out_status?: string | null;
  clock_out_reason?: string | null;
  hours_worked?: number | null;
  break_minutes?: number | null;
  is_hours_worked?: boolean;
};

function scRowsToEvents(rows: ScAttendanceRow[]): AttendanceEvent[] {
  return rows.map((att) => {
    const finalized = !!att.clock_out_time || att.status === 'finalized';
    let hoursWorked: number | null = att.hours_worked ?? null;
    if (hoursWorked == null && att.clock_in_time && att.clock_out_time) {
      const diff = new Date(att.clock_out_time).getTime() - new Date(att.clock_in_time).getTime();
      hoursWorked = diff / (1000 * 60 * 60);
    }
    return {
      event_id: att.id,
      worker_id: att.worker_id,
      worker_name: att.worker_name,
      job_name: att.job_name,
      project_name: att.project_name,
      job_type: undefined,
      shift_id: att.shift_id,
      shift_deleted: !!att.shift_deleted,
      shift_deleted_by: att.shift_deleted_by || null,
      shift_deleted_at: att.shift_deleted_at || null,
      clock_in_id: att.clock_in_time ? att.id : null,
      clock_in_time: att.clock_in_time || null,
      clock_in_status: finalized ? 'approved' : 'pending',
      clock_in_reason: att.reason_text,
      clock_out_id: att.clock_out_time ? att.id : null,
      clock_out_time: att.clock_out_time || null,
      clock_out_status: finalized ? 'approved' : null,
      clock_out_reason: att.clock_out_time ? att.reason_text : null,
      hours_worked: hoursWorked,
      break_minutes: att.break_minutes ?? null,
      is_hours_worked: false,
    };
  }).sort(
    (a, b) =>
      new Date(b.clock_in_time || b.clock_out_time || '').getTime() -
      new Date(a.clock_in_time || a.clock_out_time || '').getTime(),
  );
}

type OpenAttendance = {
  id: string;
  project_id: string;
  project_name?: string | null;
  clock_in_time?: string | null;
} | null;

type Props = {
  workerId: string;
  openAttendance: OpenAttendance;
  canEdit: boolean;
  onBundleInvalidate: () => void;
};

export default function SubcontractorWorkerTimesheetBlock({
  workerId,
  openAttendance,
  canEdit,
  onBundleInvalidate,
}: Props) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [filters, setFilters] = useState({
    start_date: '',
    end_date: '',
    status: '',
    project_id: '',
  });
  const [projectId, setProjectId] = useState('');
  const [sigOut, setSigOut] = useState<string | null>(null);
  const [hoursConfirm, setHoursConfirm] = useState(false);
  /** Quick site clock: modal per action; signature only on clock-out modal. */
  const [quickActionModal, setQuickActionModal] = useState<null | 'in' | 'out'>(null);
  const [showModal, setShowModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState<AttendanceEvent | null>(null);
  const [formProjectId, setFormProjectId] = useState('');
  const [formClockIn, setFormClockIn] = useState('');
  const [formClockOut, setFormClockOut] = useState('');
  const [formSigOut, setFormSigOut] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [selectedEvents, setSelectedEvents] = useState<Set<string>>(new Set());
  const [deletingSelected, setDeletingSelected] = useState(false);

  const queryParams = new URLSearchParams();
  queryParams.set('record_kind', 'subcontractor');
  queryParams.set('worker_id', workerId);
  if (filters.start_date) queryParams.set('start_date', filters.start_date);
  if (filters.end_date) queryParams.set('end_date', filters.end_date);
  if (filters.status) queryParams.set('status', filters.status);
  if (filters.project_id) queryParams.set('project_id', filters.project_id);
  const queryString = queryParams.toString();
  const listUrl = `/settings/attendance/list?${queryString}`;

  const { data: attendances, isLoading, error } = useQuery({
    queryKey: ['sc-worker-attendance', queryString],
    queryFn: async () => {
      const result = await api<ScAttendanceRow[]>('GET', listUrl);
      return Array.isArray(result) ? result : [];
    },
    enabled: !!workerId,
  });

  const attendanceEvents = useMemo(
    () => scRowsToEvents(Array.isArray(attendances) ? attendances : []),
    [attendances],
  );

  const { data: projects = [] } = useQuery({
    queryKey: ['attendance-projects-sc', workerId],
    queryFn: async () => {
      const result = await api<Array<{ id: string; code?: string; name: string }>>('GET', '/projects?limit=100');
      return Array.isArray(result) ? result : [];
    },
  });

  const sigProjectId = projectId || openAttendance?.project_id || projects[0]?.id || '';

  const invalidateAll = async () => {
    await qc.invalidateQueries({ queryKey: ['sc-worker-attendance'], exact: false });
    await qc.invalidateQueries({ queryKey: ['subcontractor-worker', workerId] });
    onBundleInvalidate();
  };

  const clockInMut = useMutation({
    mutationFn: () =>
      api('POST', '/subcontractors/attendance/clock-in', {
        worker_id: workerId,
        project_id: projectId,
      }),
    onSuccess: async () => {
      toast.success('Clock-in recorded');
      setQuickActionModal(null);
      await invalidateAll();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const clockOutMut = useMutation({
    mutationFn: () =>
      api('POST', '/subcontractors/attendance/clock-out', {
        worker_id: workerId,
        project_id: projectId || openAttendance?.project_id,
        attendance_id: openAttendance?.id,
        clock_out_signature_file_id: sigOut,
        hours_accuracy_confirmed: hoursConfirm,
      }),
    onSuccess: async () => {
      toast.success('Clock-out recorded');
      setSigOut(null);
      setHoursConfirm(false);
      setQuickActionModal(null);
      await invalidateAll();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const createManualMut = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api('POST', `/subcontractors/workers/${workerId}/attendance/manual`, body),
    onSuccess: async () => {
      toast.success('Attendance created');
      setShowModal(false);
      resetModal();
      await invalidateAll();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const patchMut = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      api('PATCH', `/subcontractors/attendance/${id}`, body),
    onSuccess: async () => {
      toast.success('Attendance updated');
      setShowModal(false);
      resetModal();
      await invalidateAll();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const resetModal = () => {
    setEditingEvent(null);
    setFormProjectId('');
    setFormClockIn('');
    setFormClockOut('');
    setFormSigOut(null);
  };

  const closeQuickActionModal = () => {
    setQuickActionModal(null);
    setSigOut(null);
    setHoursConfirm(false);
  };

  const closeModal = () => {
    setShowModal(false);
    resetModal();
  };

  useEffect(() => {
    if (!showModal && !quickActionModal) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (showModal) {
        setShowModal(false);
        resetModal();
      }
      if (quickActionModal) closeQuickActionModal();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showModal, quickActionModal]);

  const toUtcISOString = (localValue?: string) => {
    if (!localValue) return null;
    const [datePart, timePart] = localValue.split('T');
    if (!datePart || !timePart) return null;
    const [year, month, day] = datePart.split('-').map(Number);
    const [hours, minutes] = timePart.split(':').map(Number);
    const localDate = new Date(year, month - 1, day, hours, minutes || 0, 0, 0);
    return localDate.toISOString();
  };

  const openNewModal = () => {
    if (!canEdit) {
      toast.error('You do not have permission to edit attendance');
      return;
    }
    const local = new Date();
    const y = local.getFullYear();
    const m = String(local.getMonth() + 1).padStart(2, '0');
    const d = String(local.getDate()).padStart(2, '0');
    const hh = String(local.getHours()).padStart(2, '0');
    const mm = String(local.getMinutes()).padStart(2, '0');
    resetModal();
    setEditingEvent(null);
    setFormClockIn(`${y}-${m}-${d}T${hh}:${mm}`);
    setFormClockOut('');
    setFormProjectId(projectId || projects[0]?.id || '');
    setShowModal(true);
  };

  const openEditModal = (event: AttendanceEvent) => {
    if (!canEdit) {
      toast.error('You do not have permission to edit attendance');
      return;
    }
    setEditingEvent(event);
    const att = attendances?.find((a) => a.id === event.event_id);
    setFormProjectId(att?.project_id || '');
    setFormClockIn(toLocalInputValue(event.clock_in_time));
    setFormClockOut(toLocalInputValue(event.clock_out_time));
    setFormSigOut(null);
    setShowModal(true);
  };

  const submitModal = async () => {
    if (!canEdit) return;
    if (!formProjectId) {
      toast.error('Project is required');
      return;
    }
    if (!formClockIn) {
      toast.error('Clock-in time is required');
      return;
    }
    const clockInUtc = toUtcISOString(formClockIn);
    if (!clockInUtc) {
      toast.error('Invalid clock-in time');
      return;
    }
    const clockOutUtc = formClockOut ? toUtcISOString(formClockOut) : null;
    if (formClockOut && !clockOutUtc) {
      toast.error('Invalid clock-out time');
      return;
    }

    if (editingEvent) {
      const body: Record<string, unknown> = {
        project_id: formProjectId,
        clock_in_time: clockInUtc,
        clock_out_time: formClockOut ? clockOutUtc : null,
      };
      if (formClockOut && formSigOut) body.clock_out_signature_file_id = formSigOut;
      await patchMut.mutateAsync({ id: editingEvent.event_id, body });
    } else {
      const body: Record<string, unknown> = {
        project_id: formProjectId,
        clock_in_time: clockInUtc,
      };
      if (clockOutUtc) body.clock_out_time = clockOutUtc;
      if (clockOutUtc && formSigOut) body.clock_out_signature_file_id = formSigOut;
      await createManualMut.mutateAsync(body);
    }
  };

  const handleDeleteEvent = async (event: AttendanceEvent) => {
    if (!canEdit) {
      toast.error('You do not have permission to delete attendance records');
      return;
    }
    const result = await confirm({
      title: 'Delete attendance',
      message: 'Are you sure you want to delete this attendance record? This cannot be undone.',
      confirmText: 'Delete',
      cancelText: 'Cancel',
    });
    if (result !== 'confirm') return;
    setDeletingId(event.event_id);
    try {
      await api('DELETE', `/subcontractors/attendance/${event.event_id}`);
      toast.success('Attendance deleted');
      setSelectedEvents((prev) => {
        const n = new Set(prev);
        n.delete(event.event_id);
        return n;
      });
      await invalidateAll();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Delete failed');
    } finally {
      setDeletingId(null);
    }
  };

  const handleToggleSelect = (eventId: string) => {
    if (!canEdit) return;
    setSelectedEvents((prev) => {
      const n = new Set(prev);
      if (n.has(eventId)) n.delete(eventId);
      else n.add(eventId);
      return n;
    });
  };

  const handleSelectAll = () => {
    if (!canEdit) return;
    if (selectedEvents.size === attendanceEvents.length) setSelectedEvents(new Set());
    else setSelectedEvents(new Set(attendanceEvents.map((e) => e.event_id)));
  };

  const handleDeleteSelected = async () => {
    if (!canEdit || selectedEvents.size === 0) return;
    const result = await confirm({
      title: 'Delete selected',
      message: `Delete ${selectedEvents.size} attendance record(s)? This cannot be undone.`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
    });
    if (result !== 'confirm') return;
    setDeletingSelected(true);
    try {
      await Promise.all(
        Array.from(selectedEvents).map((id) =>
          api('DELETE', `/subcontractors/attendance/${id}`).catch(() => null),
        ),
      );
      toast.success('Selected records deleted');
      setSelectedEvents(new Set());
      await invalidateAll();
    } catch {
      toast.error('Some deletes failed');
    } finally {
      setDeletingSelected(false);
    }
  };

  const submitDisabled =
    createManualMut.isPending || patchMut.isPending || !formProjectId || !formClockIn;

  const showManualClockOutSignature = !!formClockOut;

  return (
    <div className="space-y-6 pb-24">
      <div className="rounded-xl border bg-white p-4">
        <div className="mb-4 flex items-center gap-2">
          <div className="w-8 h-8 rounded bg-indigo-100 flex items-center justify-center">
            <svg className="w-5 h-5 text-indigo-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h5 className="text-sm font-semibold text-indigo-900">Timesheet</h5>
        </div>

        {openAttendance && (
          <div className="mb-4 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-900">
            Clocked in
            {openAttendance.project_name ? ` @ ${openAttendance.project_name}` : ''}
            {openAttendance.clock_in_time ? ` since ${new Date(openAttendance.clock_in_time).toLocaleString()}` : ''}.
          </div>
        )}

        <div className="mb-6 flex flex-wrap items-center gap-3">
          {!openAttendance && (
            <button
              type="button"
              className="px-4 py-2 rounded-lg bg-green-700 text-white text-xs font-semibold disabled:opacity-50 hover:bg-green-800 transition-colors"
              disabled={clockInMut.isPending}
              onClick={() => setQuickActionModal('in')}
            >
              Clock In…
            </button>
          )}
          {openAttendance && (
            <button
              type="button"
              className="px-4 py-2 rounded-lg bg-red-700 text-white text-xs font-semibold disabled:opacity-50 hover:bg-red-800 transition-colors"
              disabled={clockOutMut.isPending}
              onClick={() => setQuickActionModal('out')}
            >
              Clock Out…
            </button>
          )}
        </div>

        <div className="mb-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Start date</label>
            <input
              type="date"
              value={filters.start_date}
              onChange={(e) => setFilters({ ...filters, start_date: e.target.value })}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">End date</label>
            <input
              type="date"
              value={filters.end_date}
              onChange={(e) => setFilters({ ...filters, end_date: e.target.value })}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Project</label>
            <select
              value={filters.project_id}
              onChange={(e) => setFilters({ ...filters, project_id: e.target.value })}
              className={inputClass}
            >
              <option value="">All projects</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code ? `${p.code} — ` : ''}
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Status</label>
            <select
              value={filters.status}
              onChange={(e) => setFilters({ ...filters, status: e.target.value })}
              className={inputClass}
            >
              <option value="">All statuses</option>
              <option value="open">Open (in progress)</option>
              <option value="finalized">Finalized</option>
            </select>
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800">
            Error loading attendance: {String(error)}
          </div>
        )}

        {canEdit && selectedEvents.size > 0 && (
          <div className="mb-4 rounded-xl border bg-blue-50 p-3 flex items-center justify-between">
            <div className="text-xs font-medium text-blue-900">{selectedEvents.size} record(s) selected</div>
            <button
              type="button"
              onClick={() => void handleDeleteSelected()}
              disabled={deletingSelected}
              className="px-2 py-1 text-xs bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors disabled:opacity-50"
            >
              {deletingSelected ? 'Deleting…' : 'Delete selected'}
            </button>
          </div>
        )}

        <div className="rounded-xl border overflow-x-auto">
          <table className="w-full min-w-[720px]">
            <thead className="bg-gray-50">
              <tr>
                <th className="p-2.5 text-left w-12">
                  {canEdit && (
                    <input
                      type="checkbox"
                      checked={attendanceEvents.length > 0 && selectedEvents.size === attendanceEvents.length}
                      onChange={handleSelectAll}
                      className="w-3.5 h-3.5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                    />
                  )}
                </th>
                <th className="p-2.5 text-left text-xs font-medium text-gray-600">Clock In</th>
                <th className="p-2.5 text-left text-xs font-medium text-gray-600">Clock Out</th>
                <th className="p-2.5 text-left text-xs font-medium text-gray-600">Project</th>
                <th className="p-2.5 text-left text-xs font-medium text-gray-600">Hours</th>
                <th className="p-2.5 text-left text-xs font-medium text-gray-600">Break</th>
                <th className="p-2.5 text-left text-xs font-medium text-gray-600">Status</th>
                <th className="p-2.5 text-left text-xs font-medium text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody>
              {canEdit && (
                <tr>
                  <td colSpan={8} className="p-0 align-top">
                    <button
                      type="button"
                      onClick={openNewModal}
                      className="w-full border-2 border-dashed border-gray-300 rounded-t-xl p-2.5 hover:border-brand-red hover:bg-gray-50 flex items-center justify-center gap-2 min-h-[52px] text-gray-600 hover:text-brand-red transition-colors"
                    >
                      <span className="text-lg font-medium">+</span>
                      <span className="text-sm font-medium">New attendance</span>
                    </button>
                  </td>
                </tr>
              )}
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="p-4">
                    <div className="h-6 bg-gray-100 animate-pulse rounded" />
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={8} className="p-4 text-center text-xs text-red-600">
                    Could not load attendance.
                  </td>
                </tr>
              ) : attendanceEvents.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-4 text-center text-xs text-gray-500">
                    No attendance records found
                  </td>
                </tr>
              ) : (
                attendanceEvents.map((event) => (
                  <tr key={event.event_id} className="border-t border-gray-200 hover:bg-gray-50">
                    <td className="p-2.5">
                      {canEdit && (
                        <input
                          type="checkbox"
                          checked={selectedEvents.has(event.event_id)}
                          onChange={() => handleToggleSelect(event.event_id)}
                          className="w-3.5 h-3.5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                        />
                      )}
                    </td>
                    <td className="p-2.5 text-xs text-gray-900">
                      {event.clock_in_time ? formatDateTime(event.clock_in_time) : '—'}
                    </td>
                    <td className="p-2.5 text-xs text-gray-900">
                      {event.clock_out_time ? formatDateTime(event.clock_out_time) : '—'}
                    </td>
                    <td className="p-2.5 text-xs text-gray-900">{event.project_name || '—'}</td>
                    <td className="p-2.5 text-xs text-gray-900">{formatHours(event.hours_worked)}</td>
                    <td className="p-2.5 text-xs text-gray-900">—</td>
                    <td className="p-2.5">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                          event.clock_in_status === 'approved' &&
                          (!event.clock_out_status || event.clock_out_status === 'approved')
                            ? 'bg-green-100 text-green-800'
                            : 'bg-yellow-100 text-yellow-800'
                        }`}
                      >
                        {event.clock_out_time ? 'Finalized' : 'Open'}
                      </span>
                    </td>
                    <td className="p-2.5">
                      <div className="flex items-center gap-1.5">
                        {canEdit ? (
                          <>
                            <button
                              type="button"
                              onClick={() => openEditModal(event)}
                              className="text-blue-600 hover:text-blue-800 text-[10px]"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleDeleteEvent(event)}
                              disabled={deletingId === event.event_id}
                              className="text-red-600 hover:text-red-800 text-[10px] disabled:opacity-50"
                            >
                              {deletingId === event.event_id ? 'Deleting…' : 'Delete'}
                            </button>
                          </>
                        ) : (
                          <span className="text-[10px] text-gray-500">View only</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <OverlayPortal>
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 overflow-y-auto"
            onClick={closeModal}
          >
            <div
              className="max-w-lg w-full max-h-[90vh] flex flex-col rounded-xl border border-gray-200 bg-gray-100 shadow-xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex-shrink-0 rounded-t-xl border-b border-gray-200 bg-white p-4">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={closeModal}
                    className="p-1 rounded-lg hover:bg-gray-100 text-gray-600"
                    title="Close"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                  <div>
                    <h2 className="text-sm font-semibold text-gray-900">
                      {editingEvent ? 'Edit attendance' : 'New attendance'}
                    </h2>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {editingEvent
                        ? 'Update times and project.'
                        : 'Add clock-in (and optionally clock-out for a closed session). Optional signature when clock-out is set.'}
                    </p>
                  </div>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-4">
                <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1.5">Project *</label>
                    <select
                      value={formProjectId}
                      onChange={(e) => setFormProjectId(e.target.value)}
                      className={inputClass}
                      required
                    >
                      <option value="">Select project…</option>
                      {projects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.code ? `${p.code} — ` : ''}
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1.5">Clock in (local) *</label>
                    <input
                      type="datetime-local"
                      value={formClockIn}
                      onChange={(e) => setFormClockIn(e.target.value)}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1.5">Clock out (local)</label>
                    <input
                      type="datetime-local"
                      value={formClockOut}
                      onChange={(e) => setFormClockOut(e.target.value)}
                      className={inputClass}
                    />
                  </div>
                  {showManualClockOutSignature && (
                    <div>
                      <p className="text-xs font-medium text-gray-600 mb-1.5">Clock-out signature (optional)</p>
                      {formProjectId ? (
                        <SubcontractorSimpleSignature
                          projectId={formProjectId}
                          disabled={createManualMut.isPending || patchMut.isPending}
                          onUploaded={(fid) => setFormSigOut(fid)}
                          onClear={() => setFormSigOut(null)}
                        />
                      ) : (
                        <p className="text-xs text-amber-700">Select a project to attach a signature file.</p>
                      )}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex-shrink-0 px-4 py-4 border-t border-gray-200 bg-white flex items-center justify-end gap-3 rounded-b-xl">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-3 py-1.5 rounded-lg text-sm font-medium text-gray-700 border border-gray-200 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void submitModal()}
                  disabled={submitDisabled}
                  className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-brand-red hover:bg-[#aa1212] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {editingEvent ? 'Update' : 'Create'}
                </button>
              </div>
            </div>
          </div>
        </OverlayPortal>
      )}

      {quickActionModal === 'in' && (
        <OverlayPortal>
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 overflow-y-auto"
            onClick={closeQuickActionModal}
          >
            <div
              className="max-w-lg w-full max-h-[90vh] flex flex-col rounded-xl border border-gray-200 bg-gray-100 shadow-xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex-shrink-0 rounded-t-xl border-b border-gray-200 bg-white p-4">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={closeQuickActionModal}
                    className="p-1 rounded-lg hover:bg-gray-100 text-gray-600"
                    title="Close"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                  <div>
                    <h2 className="text-sm font-semibold text-gray-900">Clock In</h2>
                    <p className="text-xs text-gray-500 mt-0.5">Choose a project and confirm. Time is recorded as now.</p>
                  </div>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-4">
                <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
                  <div>
                    <label htmlFor="sc-quick-project-modal" className="block text-xs font-medium text-gray-600 mb-1.5">
                      Project
                    </label>
                    <select
                      id="sc-quick-project-modal"
                      className={inputClass}
                      value={projectId}
                      onChange={(e) => setProjectId(e.target.value)}
                    >
                      <option value="">Select project…</option>
                      {projects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.code ? `${p.code} — ` : ''}
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <p className="text-xs text-gray-500">
                    Clock In records entry for the project you select. Clock Out opens a separate confirmation where you
                    verify hours and sign.
                  </p>
                </div>
              </div>
              <div className="flex-shrink-0 px-4 py-4 border-t border-gray-200 bg-white flex items-center justify-end gap-3 rounded-b-xl">
                <button
                  type="button"
                  onClick={closeQuickActionModal}
                  className="px-3 py-1.5 rounded-lg text-sm font-medium text-gray-700 border border-gray-200 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!projectId || clockInMut.isPending}
                  onClick={() => clockInMut.mutate()}
                  className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-green-700 hover:bg-green-800 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {clockInMut.isPending ? 'Recording…' : 'Confirm Clock In'}
                </button>
              </div>
            </div>
          </div>
        </OverlayPortal>
      )}

      {quickActionModal === 'out' && (
        <OverlayPortal>
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 overflow-y-auto"
            onClick={closeQuickActionModal}
          >
            <div
              className="max-w-lg w-full max-h-[90vh] flex flex-col rounded-xl border border-gray-200 bg-gray-100 shadow-xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex-shrink-0 rounded-t-xl border-b border-gray-200 bg-white p-4">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={closeQuickActionModal}
                    className="p-1 rounded-lg hover:bg-gray-100 text-gray-600"
                    title="Close"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                  <div>
                    <h2 className="text-sm font-semibold text-gray-900">Clock Out</h2>
                    <p className="text-xs text-gray-500 mt-0.5">Confirm hours and sign to complete this session.</p>
                  </div>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-4">
                <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-4">
                  {openAttendance && (
                    <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-xs text-green-900">
                      {openAttendance.project_name ? `Project: ${openAttendance.project_name}` : 'Open session'}
                      {openAttendance.clock_in_time
                        ? ` · Since ${formatDateTime(openAttendance.clock_in_time)}`
                        : ''}
                    </div>
                  )}
                  <label className="flex items-start gap-2 text-xs text-gray-700">
                    <input
                      type="checkbox"
                      checked={hoursConfirm}
                      onChange={(e) => setHoursConfirm(e.target.checked)}
                      className="mt-0.5 w-3.5 h-3.5 text-brand-red border-gray-300 rounded focus:ring-brand-red"
                    />
                    <span>I confirm that the recorded working hours are accurate.</span>
                  </label>
                  {sigProjectId ? (
                    <SubcontractorSimpleSignature
                      projectId={sigProjectId}
                      disabled={clockOutMut.isPending}
                      onUploaded={(fid) => setSigOut(fid)}
                      onClear={() => setSigOut(null)}
                    />
                  ) : (
                    <p className="text-xs text-amber-700">Missing project context for signature upload.</p>
                  )}
                </div>
              </div>
              <div className="flex-shrink-0 px-4 py-4 border-t border-gray-200 bg-white flex items-center justify-end gap-3 rounded-b-xl">
                <button
                  type="button"
                  onClick={closeQuickActionModal}
                  className="px-3 py-1.5 rounded-lg text-sm font-medium text-gray-700 border border-gray-200 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={clockOutMut.isPending || !hoursConfirm || !sigOut}
                  onClick={() => clockOutMut.mutate()}
                  className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-red-700 hover:bg-red-800 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {clockOutMut.isPending ? 'Recording…' : 'Clock Out'}
                </button>
              </div>
            </div>
          </div>
        </OverlayPortal>
      )}
    </div>
  );
}
