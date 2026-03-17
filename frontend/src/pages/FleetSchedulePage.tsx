import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import FleetServiceCalendar from './FleetServiceCalendar';
import { InspectionScheduleForm } from './InspectionNew';

export default function FleetSchedulePage() {
  const queryClient = useQueryClient();
  const [showNewInspectionModal, setShowNewInspectionModal] = useState(false);
  const [newInspectionCanSubmit, setNewInspectionCanSubmit] = useState(false);
  const [newInspectionIsPending, setNewInspectionIsPending] = useState(false);

  useEffect(() => {
    if (!showNewInspectionModal) return;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowNewInspectionModal(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKey);
    };
  }, [showNewInspectionModal]);

  return (
    <div className="p-4 max-w-6xl mx-auto space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-xl font-bold text-gray-900">Schedule</h1>
        <button
          type="button"
          onClick={() => setShowNewInspectionModal(true)}
          className="px-4 py-2 rounded-lg bg-brand-red text-white text-sm font-medium hover:bg-[#aa1212] transition-colors"
        >
          Schedule new inspection
        </button>
      </div>

      <FleetServiceCalendar embedView />

      {showNewInspectionModal && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center overflow-y-auto p-4"
          onClick={() => setShowNewInspectionModal(false)}
        >
          <div
            className="w-[900px] max-w-[95vw] max-h-[90vh] bg-gray-100 rounded-xl overflow-hidden flex flex-col border border-gray-200 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="rounded-t-xl border-b border-gray-200 bg-white p-4 flex-shrink-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setShowNewInspectionModal(false)}
                    className="p-1.5 rounded hover:bg-gray-100 transition-colors flex items-center justify-center"
                    title="Close"
                  >
                    <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                    </svg>
                  </button>
                  <div>
                    <div className="text-sm font-semibold text-gray-900">Schedule New Inspection</div>
                    <div className="text-xs text-gray-500 mt-0.5">Creates the schedule and both Body and Mechanical inspections (pending)</div>
                  </div>
                </div>
              </div>
            </div>
            <div className="overflow-y-auto flex-1 p-4">
              <InspectionScheduleForm
                formId="inspection-schedule-form-modal"
                onSuccess={(data) => {
                  setShowNewInspectionModal(false);
                  queryClient.invalidateQueries({ queryKey: ['inspection-schedules'] });
                  queryClient.invalidateQueries({ queryKey: ['fleet-inspection-schedules-calendar'] });
                  queryClient.invalidateQueries({ queryKey: ['inspections'] });
                  queryClient.invalidateQueries({ queryKey: ['inspections-sidebar'] });
                }}
                onCancel={() => setShowNewInspectionModal(false)}
                onValidationChange={(canSubmit, isPending) => {
                  setNewInspectionCanSubmit(canSubmit);
                  setNewInspectionIsPending(isPending);
                }}
              />
            </div>
            <div className="flex-shrink-0 px-4 py-4 border-t border-gray-200 bg-white flex items-center justify-end gap-3 rounded-b-xl">
              <button
                type="button"
                onClick={() => setShowNewInspectionModal(false)}
                className="px-3 py-1.5 rounded-lg text-sm font-medium text-gray-700 border border-gray-200 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                form="inspection-schedule-form-modal"
                disabled={!newInspectionCanSubmit || newInspectionIsPending}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-brand-red hover:bg-[#aa1212] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {newInspectionIsPending ? 'Scheduling...' : 'Schedule inspection'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
