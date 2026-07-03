import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import OverlayPortal from '@/components/OverlayPortal';
import toast from 'react-hot-toast';
import { JOB_TYPES } from '@/constants/jobTypes';
import { formatDateLocal } from '@/lib/dateUtils';
import { editShiftQuickInfo } from '@/lib/formModalQuickInfo';
import {
  AppButton,
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
  const [startTime, setStartTime] = useState(shift?.start_time?.slice(0, 5) || '09:00');
  const [endTime, setEndTime] = useState(shift?.end_time?.slice(0, 5) || '17:00');
  const [jobType, setJobType] = useState(shift?.job_name || shift?.job_id || '');
  const [notes, setNotes] = useState(shift?.notes || '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // Update state when shift changes
  useEffect(() => {
    if (shift && shift.id) {
      setWorkerId(shift.worker_id || '');
      setDate(shift.date || formatDateLocal(new Date()));
      setStartTime(shift.start_time?.slice(0, 5) || '09:00');
      setEndTime(shift.end_time?.slice(0, 5) || '17:00');
      setJobType(shift.job_name || shift.job_id || '');
      setNotes(shift.notes || '');
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

  const handleSave = async () => {
    if (!shift || !shift.id) {
      setError('Shift data is missing');
      return;
    }

    setError('');
    setSaving(true);

    try {
      await api('PATCH', `/dispatch/shifts/${shift.id}`, {
        start_time: startTime,
        end_time: endTime,
        job_type: jobType || null,
        job_name: jobType || null,
        notes: notes.trim() || null,
      });

      toast.success('Shift updated');
      await onSave();
    } catch (e: any) {
      const errorMsg = e.response?.data?.detail || e.message || 'Failed to update shift';
      setError(errorMsg);
      toast.error(errorMsg);
    } finally {
      setSaving(false);
    }
  };

  if (!shift || !shift.id || !project || !employees || !Array.isArray(employees)) {
    return null;
  }

  const worker = employees.find((emp: any) => emp.id === workerId);
  const workerLabel = worker?.name || worker?.username || workerId || 'Unknown';
  const lockedHint =
    'Worker and date cannot be changed. To change them, delete this shift and create a new one.';

  const jobOpts =
    jobTypeOptions ??
    [
      { value: '', label: 'No job type selected' },
      ...JOB_TYPES.map((job) => ({ value: job.name, label: job.name })),
    ];

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

          <AppInput label="Worker" value={workerLabel} disabled helperText={lockedHint} />

          <AppDatePicker label="Date" value={date} onChange={() => {}} disabled helperText={lockedHint} />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <AppTimePicker
              label="Start Time *"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              disabled={!canEdit}
            />
            <AppTimePicker
              label="End Time *"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              disabled={!canEdit}
            />
          </div>

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

  const labelClass = 'text-[10px] font-medium text-gray-500 uppercase tracking-wide block mb-1';
  const inputBase =
    'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-300 focus:border-gray-300';
  const inputDisabled = 'bg-gray-100 text-gray-600 cursor-not-allowed border-gray-200';

  return (
    <OverlayPortal>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 overflow-y-auto"
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
                title="Close"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <div>
                <h2 className="text-sm font-semibold text-gray-900">
                  {canEdit ? 'Edit Shift' : 'View Shift'}
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  {canEdit
                    ? 'Update shift time, job type, and notes'
                    : 'Read-only — you do not have permission to edit shifts'}
                </p>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-4">
              {error && <div className="p-3 bg-red-100 text-red-700 rounded-lg text-sm">{error}</div>}

              <div>
                <label className={labelClass}>Worker</label>
                <input
                  type="text"
                  value={workerLabel}
                  disabled
                  className={`${inputBase} ${inputDisabled}`}
                  title="Worker cannot be changed. To change the worker, delete this shift and create a new one."
                />
                <p className="text-xs text-gray-500 mt-1">
                  Worker cannot be changed. To change the worker, delete this shift and create a new one.
                </p>
              </div>

              <div>
                <label className={labelClass}>Date</label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  disabled
                  className={`${inputBase} ${inputDisabled}`}
                  title="Date cannot be changed. To change the date, delete this shift and create a new one."
                />
                <p className="text-xs text-gray-500 mt-1">
                  Date cannot be changed. To change the date, delete this shift and create a new one.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Start Time</label>
                  <input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    step="900"
                    disabled={!canEdit}
                    className={`${inputBase} ${!canEdit ? inputDisabled : ''}`}
                  />
                </div>
                <div>
                  <label className={labelClass}>End Time</label>
                  <input
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    step="900"
                    disabled={!canEdit}
                    className={`${inputBase} ${!canEdit ? inputDisabled : ''}`}
                  />
                </div>
              </div>

              <div>
                <label className={labelClass}>
                  Job Type <span className="text-gray-400 text-xs font-normal normal-case">(optional)</span>
                </label>
                <select
                  value={jobType}
                  onChange={(e) => setJobType(e.target.value)}
                  disabled={!canEdit}
                  className={`${inputBase} ${!canEdit ? inputDisabled : ''}`}
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
                <label className={labelClass}>
                  Notes <span className="text-gray-400 text-xs font-normal normal-case">(optional)</span>
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  disabled={!canEdit}
                  rows={3}
                  placeholder="Optional notes for this shift..."
                  className={`${inputBase} ${!canEdit ? inputDisabled : ''} resize-y min-h-[72px]`}
                />
              </div>
            </div>
          </div>

          <div className="flex-shrink-0 px-4 py-4 border-t border-gray-200 bg-white flex items-center justify-end gap-3 rounded-b-xl">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg text-sm font-medium text-gray-700 border border-gray-200 hover:bg-gray-50"
            >
              Cancel
            </button>
            {canEdit && (
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-brand-red hover:bg-[#aa1212] disabled:opacity-50 disabled:cursor-not-allowed"
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
