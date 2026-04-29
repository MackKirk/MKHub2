import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import FleetServiceCalendar from './FleetServiceCalendar';
import { InspectionScheduleForm } from './InspectionNew';
import { WorkOrderNewForm } from './WorkOrderNew';
import OverlayPortal from '@/components/OverlayPortal';
import PageHeaderBar from '@/components/PageHeaderBar';

export default function FleetSchedulePage() {
  const queryClient = useQueryClient();
  const nav = useNavigate();
  const [showNewInspectionModal, setShowNewInspectionModal] = useState(false);
  const [newInspectionCanSubmit, setNewInspectionCanSubmit] = useState(false);
  const [newInspectionIsPending, setNewInspectionIsPending] = useState(false);
  const [showNewWorkOrderModal, setShowNewWorkOrderModal] = useState(false);
  const [newWoCanSubmit, setNewWoCanSubmit] = useState(false);
  const [newWoIsPending, setNewWoIsPending] = useState(false);

  useEffect(() => {
    if (!showNewInspectionModal && !showNewWorkOrderModal) return;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowNewInspectionModal(false);
        setShowNewWorkOrderModal(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKey);
    };
  }, [showNewInspectionModal, showNewWorkOrderModal]);

  return (
    <div className="space-y-4 min-w-0 max-w-6xl mx-auto px-4 pb-16">
      <PageHeaderBar
        title="Fleet schedule"
        subtitle="Work orders and scheduled inspections on the calendar. Open a work order or inspection schedule to manage details."
      />

      <FleetServiceCalendar
        embedView
        onScheduleNew={() => setShowNewInspectionModal(true)}
        onNewWorkOrder={() => setShowNewWorkOrderModal(true)}
      />

      {showNewInspectionModal && (
        <OverlayPortal><div
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
                vehiclePickerSearchable
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
        </div></OverlayPortal>
      )}

      {showNewWorkOrderModal && (
        <OverlayPortal>
          <div
            className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center overflow-y-auto p-4"
            onClick={() => setShowNewWorkOrderModal(false)}
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
                      onClick={() => setShowNewWorkOrderModal(false)}
                      className="p-1.5 rounded hover:bg-gray-100 transition-colors flex items-center justify-center"
                      title="Close"
                    >
                      <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                      </svg>
                    </button>
                    <div>
                      <div className="text-sm font-semibold text-gray-900">New work order</div>
                      <div className="text-xs text-gray-500 mt-0.5">Select a vehicle, then add details. Appears on the schedule when a service date is set.</div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="overflow-y-auto flex-1 p-4">
                <WorkOrderNewForm
                  formId="work-order-new-schedule-modal"
                  vehiclePickerSearchable
                  onSuccess={(data) => {
                    setShowNewWorkOrderModal(false);
                    queryClient.invalidateQueries({ queryKey: ['fleet-work-orders-calendar'] });
                    queryClient.invalidateQueries({ queryKey: ['workOrders'] });
                    queryClient.invalidateQueries({ queryKey: ['work-orders', 'open'] });
                    nav(`/fleet/work-orders/${data.id}`);
                  }}
                  onCancel={() => setShowNewWorkOrderModal(false)}
                  onValidationChange={(canSubmit, isPending) => {
                    setNewWoCanSubmit(canSubmit);
                    setNewWoIsPending(isPending);
                  }}
                />
              </div>
              <div className="flex-shrink-0 px-4 py-4 border-t border-gray-200 bg-white flex items-center justify-end gap-3 rounded-b-xl">
                <button
                  type="button"
                  onClick={() => setShowNewWorkOrderModal(false)}
                  className="px-3 py-1.5 rounded-lg text-sm font-medium text-gray-700 border border-gray-200 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  form="work-order-new-schedule-modal"
                  disabled={!newWoCanSubmit || newWoIsPending}
                  className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-brand-red hover:bg-[#aa1212] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {newWoIsPending ? 'Creating...' : 'Create work order'}
                </button>
              </div>
            </div>
          </div>
        </OverlayPortal>
      )}
    </div>
  );
}
