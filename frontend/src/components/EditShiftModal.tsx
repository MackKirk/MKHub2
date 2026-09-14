import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import OverlayPortal from '@/components/OverlayPortal';
import toast from 'react-hot-toast';
import { JOB_TYPES } from '@/constants/jobTypes';
import { formatDateLocal } from '@/lib/dateUtils';
import { editShiftQuickInfo } from '@/lib/formModalQuickInfo';
import {
  SHIFT_TIME_PRESET_OPTIONS,
  detectPreset,
  resolvePresetTimes,
  type ShiftTimePreset,
} from '@/lib/shiftTimePresets';
import {
  AppButton,
  AppControlLabelRow,
  AppDatePicker,
  AppFormModal,
  AppInput,
  AppSelect,
  AppTextarea,
  AppTimePicker,
  uiCx,
  uiLayout,
  uiSpacing,
} from '@/components/ui';

export default function EditShiftModal({
  projectId: _projectId,
  project,
  employees,
  shift,
  canEdit = true,
  designSystem,
  jobTypeOptions,
  onClose,
  onSave,
}: {
  projectId: string;
  project: any;
  employees: any[];
  shift: any;
  canEdit?: boolean;
  designSystem?: boolean;
  jobTypeOptions?: { value: string; label: string }[];
  onClose: () => void;
  onSave: () => Promise<void>;
}) {
  const [workerId, setWorkerId] = useState(shift?.worker_id || '');
  const [date, setDate] = useState(shift?.date || formatDateLocal(new Date()));
  const [timePreset, setTimePreset] = useState<ShiftTimePreset>(() =>
    detectPreset(shift?.start_time, shift?.end_time),
  );
  const [startTime, setStartTime] = useState(shift?.start_time?.slice(0, 5) || '09:00');
  const [endTime, setEndTime] = useState(shift?.end_time?.slice(0, 5) || '17:00');
  const [jobType, setJobType] = useState(shift?.job_name || shift?.job_id || '');
  const [notes, setNotes] = useState(shift?.notes || '');
  const [error, setError] = useState('');
  const [conflictWarning, setConflictWarning] = useState('');
  const [saving, setSaving] = useState(false);

  // Update state when shift changes
  useEffect(() => {
    if (shift && shift.id) {
      setWorkerId(shift.worker_id || '');
      setDate(shift.date || formatDateLocal(new Date()));
      const start = shift.start_time?.slice(0, 5) || '09:00';
      const end = shift.end_time?.slice(0, 5) || '17:00';
      setStartTime(start);
      setEndTime(end);
      setTimePreset(detectPreset(start, end));
      setJobType(shift.job_name || shift.job_id || '');
      setNotes(shift.notes || '');
      setConflictWarning('');
    }
  }, [shift]);

  // Escape to close (legacy shell only — AppFormModal handles escape)
  useEffect(() => {
    if (designSystem) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, designSystem]);

  // Prevent body scroll when modal is open (legacy shell only)
  useEffect(() => {
    if (designSystem) return;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, [designSystem]);

  const applyTimePreset = (preset: ShiftTimePreset) => {
    if (!canEdit) return;
    setTimePreset(preset);
    const times = resolvePresetTimes(preset);
    setStartTime(times.start);
    setEndTime(times.end);
  };

  const handleSave = async () => {
    if (!shift || !shift.id) {
      setError('Shift data is missing');
      return;
    }

    setError('');
    setConflictWarning('');
    setSaving(true);

    try {
      const updated = await api<any>('PATCH', `/dispatch/shifts/${shift.id}`, {
        start_time: startTime,
        end_time: endTime,
        job_type: jobType || null,
        job_name: jobType || null,
        notes: notes.trim() || null,
      });

      if (Array.isArray(updated?.conflicts) && updated.conflicts.length > 0) {
        const names = updated.conflicts
          .map((c: any) => c.project_name)
          .filter(Boolean)
          .slice(0, 3);
        setConflictWarning(
          `Saved with schedule conflicts${names.length ? `: ${names.join(', ')}` : ''}.`,
        );
        toast.success('Shift updated (schedule conflict warning)');
      } else {
        toast.success('Shift updated');
      }
      await onSave();
    } catch (e: any) {
      const errorMsg = e.response?.data?.detail || e.message || 'Failed to update shift';
      setError(errorMsg);
      toast.error(errorMsg);
    } finally {
      setSaving(false);
    }
  };

  if (!shift || !shift.id || !project) {
    return null;
  }

  const worker = Array.isArray(employees)
    ? employees.find((emp: any) => emp.id === workerId)
    : undefined;
  const workerLabel = worker?.name || worker?.username || workerId || 'Unknown';
  const lockedHint =
    'Worker and date cannot be changed. To change them, delete this shift and create a new one.';

  const jobOpts =
    jobTypeOptions ??
    [
      { value: '', label: 'No job type selected' },
      ...JOB_TYPES.map((job) => ({ value: job.name, label: job.name })),
    ];

  const timeOfDaySection = (
    <div className="space-y-2">
      <AppControlLabelRow label="Time of day" />
      <div className="flex flex-wrap gap-2">
        {SHIFT_TIME_PRESET_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            disabled={!canEdit || saving}
            onClick={() => applyTimePreset(opt.value)}
            className={uiCx(
              'rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
              timePreset === opt.value
                ? 'border-[#7f1010] bg-red-50 text-[#7f1010]'
                : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50',
              (!canEdit || saving) && 'opacity-50',
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>
      {timePreset === 'custom' ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <AppTimePicker
            label="Start Time"
            value={startTime}
            onChange={(e) => {
              setStartTime(e.target.value);
              setTimePreset('custom');
            }}
            disabled={!canEdit}
          />
          <AppTimePicker
            label="End Time"
            value={endTime}
            onChange={(e) => {
              setEndTime(e.target.value);
              setTimePreset('custom');
            }}
            disabled={!canEdit}
          />
        </div>
      ) : null}
    </div>
  );

  if (designSystem) {
    return (
      <AppFormModal
        open
        onClose={onClose}
        title={canEdit ? 'Edit Shift' : 'View Shift'}
        description={
          canEdit
            ? 'Update shift time, job type, and notes'
            : 'Read-only — you do not have permission to edit shifts'
        }
        quickInfo={editShiftQuickInfo}
        footer={
          <div className={uiCx(uiLayout.actionsRow, 'w-full justify-end')}>
            <AppButton variant="secondary" size="sm" type="button" onClick={onClose} disabled={saving}>
              Cancel
            </AppButton>
            {canEdit && (
              <AppButton
                size="sm"
                type="button"
                onClick={handleSave}
                disabled={saving}
                loading={saving}
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </AppButton>
            )}
          </div>
        }
      >
        <div className={uiCx(uiSpacing.sectionStack, 'space-y-4')}>
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>
          )}
          {conflictWarning && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              {conflictWarning}
            </div>
          )}

          <AppInput label="Worker" value={workerLabel} disabled helperText={lockedHint} />

          <AppDatePicker label="Date" value={date} onChange={() => {}} disabled helperText={lockedHint} />

          {timeOfDaySection}

          <AppSelect
            label="Job Type"
            value={jobType}
            onChange={(e) => setJobType(e.target.value)}
            options={jobOpts}
            disabled={!canEdit}
            fieldHint="Job Type\n\nOptional label for the type of work during this shift."
          />

          <AppTextarea
            label="Notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={!canEdit}
            rows={3}
            placeholder="Optional notes for this shift..."
            helperText="Visible on the calendar when notes are saved."
          />
        </div>
      </AppFormModal>
    );
  }

  return (
    <OverlayPortal>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        onClick={onClose}
      >
        <div
          className="max-w-lg w-full max-h-[90vh] flex flex-col rounded-xl border border-gray-200 bg-white shadow-xl overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex-shrink-0 border-b border-gray-200 p-4">
            <h2 className="text-sm font-semibold text-gray-900">
              {canEdit ? 'Edit Shift' : 'View Shift'}
            </h2>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                {error}
              </div>
            )}
            {conflictWarning && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                {conflictWarning}
              </div>
            )}
            <div>
              <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide block mb-1">
                Worker
              </label>
              <input
                type="text"
                value={workerLabel}
                disabled
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50"
              />
            </div>
            <div>
              <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide block mb-1">
                Date
              </label>
              <input
                type="date"
                value={date}
                disabled
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50"
              />
            </div>
            {timeOfDaySection}
            <div>
              <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide block mb-1">
                Job Type
              </label>
              <select
                value={jobType}
                onChange={(e) => setJobType(e.target.value)}
                disabled={!canEdit}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              >
                <option value="">No job type selected</option>
                {JOB_TYPES.map((job) => (
                  <option key={job.id} value={job.name}>
                    {job.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide block mb-1">
                Notes
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                disabled={!canEdit}
                rows={3}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div className="flex-shrink-0 border-t border-gray-200 p-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg text-sm border border-gray-200"
            >
              Cancel
            </button>
            {canEdit && (
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-1.5 rounded-lg text-sm font-semibold text-white bg-brand-red disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            )}
          </div>
        </div>
      </div>
    </OverlayPortal>
  );
}
