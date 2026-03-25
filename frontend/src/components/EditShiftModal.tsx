import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import OverlayPortal from '@/components/OverlayPortal';
import toast from 'react-hot-toast';
import { JOB_TYPES } from '@/constants/jobTypes';
import { formatDateLocal } from '@/lib/dateUtils';

export default function EditShiftModal({
  projectId,
  project,
  employees,
  shift,
  canEdit = true,
  onClose,
  onSave,
}: {
  projectId: string;
  project: any;
  employees: any[];
  shift: any;
  canEdit?: boolean;
  onClose: () => void;
  onSave: () => Promise<void>;
}) {
  const [workerId, setWorkerId] = useState(shift?.worker_id || '');
  const [date, setDate] = useState(shift?.date || formatDateLocal(new Date()));
  const [startTime, setStartTime] = useState(shift?.start_time?.slice(0, 5) || '09:00');
  const [endTime, setEndTime] = useState(shift?.end_time?.slice(0, 5) || '17:00');
  const [jobType, setJobType] = useState(shift?.job_name || shift?.job_id || '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // Update state when shift changes
  useEffect(() => {
    if (shift && shift.id) {
      setWorkerId(shift.worker_id || '');
      setDate(shift.date || formatDateLocal(new Date()));
      setStartTime(shift.start_time?.slice(0, 5) || '09:00');
      setEndTime(shift.end_time?.slice(0, 5) || '17:00');
      // Use job_name if available, otherwise job_id, otherwise empty
      setJobType(shift.job_name || shift.job_id || '');
    }
  }, [shift]);

  // Escape to close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  const handleSave = async () => {
    if (!shift || !shift.id) {
      setError('Shift data is missing');
      return;
    }

    setError('');
    setSaving(true);

    try {
      // Note: worker_id and date are not sent in the update request as they cannot be changed
      // Only start_time, end_time, and job_type can be edited
      await api('PATCH', `/dispatch/shifts/${shift.id}`, {
        // worker_id is intentionally omitted - it cannot be changed
        // date is intentionally omitted - it cannot be changed
        start_time: startTime,
        end_time: endTime,
        job_type: jobType || null,
        job_name: jobType || null, // Store the job type name for backward compatibility
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

  // Safety check after hooks
  if (!shift || !shift.id || !project || !employees || !Array.isArray(employees)) {
    return null;
  }

  // Find the worker name for display
  const worker = employees.find((emp: any) => emp.id === workerId);

  const labelClass = 'text-[10px] font-medium text-gray-500 uppercase tracking-wide block mb-1';
  const inputBase = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-300 focus:border-gray-300';
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
        {/* Title bar - same style as EventModal / NewSupplierModal */}
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
              <h2 className="text-sm font-semibold text-gray-900">Edit Shift</h2>
              <p className="text-xs text-gray-500 mt-0.5">Update shift time and job type</p>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-4">
            {error && (
              <div className="p-3 bg-red-100 text-red-700 rounded-lg text-sm">{error}</div>
            )}

            {/* Worker - Locked */}
            <div>
              <label className={labelClass}>Worker</label>
              <input
                type="text"
                value={worker?.name || worker?.username || workerId || 'Unknown'}
                disabled
                className={`${inputBase} ${inputDisabled}`}
                title="Worker cannot be changed. To change the worker, delete this shift and create a new one."
              />
              <p className="text-xs text-gray-500 mt-1">
                Worker cannot be changed. To change the worker, delete this shift and create a new one.
              </p>
            </div>

            {/* Date - Locked */}
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

            {/* Start Time and End Time - Editable */}
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

            {/* Job Type - Editable */}
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
          </div>
        </div>

        {/* Footer - same style as EventModal / NewSupplierModal */}
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

