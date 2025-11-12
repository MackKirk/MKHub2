import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import { JOB_TYPES } from '@/constants/jobTypes';

export default function EditShiftModal({
  projectId,
  project,
  employees,
  shift,
  onClose,
  onSave,
}: {
  projectId: string;
  project: any;
  employees: any[];
  shift: any;
  onClose: () => void;
  onSave: () => Promise<void>;
}) {
  const [workerId, setWorkerId] = useState(shift?.worker_id || '');
  const [date, setDate] = useState(shift?.date || new Date().toISOString().slice(0, 10));
  const [startTime, setStartTime] = useState(shift?.start_time?.slice(0, 5) || '09:00');
  const [endTime, setEndTime] = useState(shift?.end_time?.slice(0, 5) || '17:00');
  const [jobType, setJobType] = useState(shift?.job_name || shift?.job_id || '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // Update state when shift changes
  useEffect(() => {
    if (shift && shift.id) {
      setWorkerId(shift.worker_id || '');
      setDate(shift.date || new Date().toISOString().slice(0, 10));
      setStartTime(shift.start_time?.slice(0, 5) || '09:00');
      setEndTime(shift.end_time?.slice(0, 5) || '17:00');
      // Use job_name if available, otherwise job_id, otherwise empty
      setJobType(shift.job_name || shift.job_id || '');
    }
  }, [shift]);

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

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b p-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold">Edit Shift</h2>
          <button onClick={onClose} className="text-2xl font-bold text-gray-400 hover:text-gray-600">
            ×
          </button>
        </div>
        <div className="p-6 space-y-4">
          {error && <div className="p-3 bg-red-100 text-red-700 rounded text-sm">{error}</div>}

          {/* Worker - Locked */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Worker</label>
            <input
              type="text"
              value={worker?.name || worker?.username || workerId || 'Unknown'}
              disabled
              className="w-full border rounded px-3 py-2 bg-gray-100 text-gray-600 cursor-not-allowed"
              title="Worker cannot be changed. To change the worker, delete this shift and create a new one."
            />
            <p className="text-xs text-gray-500 mt-1">
              Worker cannot be changed. To change the worker, delete this shift and create a new one.
            </p>
          </div>

          {/* Date - Locked */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              disabled
              className="w-full border rounded px-3 py-2 bg-gray-100 text-gray-600 cursor-not-allowed"
              title="Date cannot be changed. To change the date, delete this shift and create a new one."
            />
            <p className="text-xs text-gray-500 mt-1">
              Date cannot be changed. To change the date, delete this shift and create a new one.
            </p>
          </div>

          {/* Start Time and End Time - Editable */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Start Time</label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                step="900"
                className="w-full border rounded px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">End Time</label>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                step="900"
                className="w-full border rounded px-3 py-2"
              />
            </div>
          </div>

          {/* Job Type - Editable */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Job Type <span className="text-gray-400 text-xs">(optional)</span>
            </label>
            <select
              value={jobType}
              onChange={(e) => setJobType(e.target.value)}
              className="w-full border rounded px-3 py-2"
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
        <div className="sticky bottom-0 bg-white border-t p-4 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded border bg-gray-100 hover:bg-gray-200">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 rounded bg-brand-red text-white hover:bg-red-700 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

