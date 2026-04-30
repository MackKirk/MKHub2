import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import OverlayPortal from '@/components/OverlayPortal';
import { api } from '@/lib/api';
import { WorkOrderNewForm } from '@/pages/WorkOrderNew';

type SuggestedDescriptionResponse = { description: string };

export type WorkOrderNewModalProps = {
  isOpen: boolean;
  onClose: () => void;
  /** Called after a work order is created (modal already closed by parent if desired). */
  onCreated: (data: { id: string }) => void;
  /**
   * When set with `fleetAssetId`, entity type and vehicle are preset to fleet + that asset (read-only),
   * and the created WO is linked to this inspection (`origin_source` / `origin_id`).
   */
  inspectionId?: string | null;
  fleetAssetId?: string;
};

export default function WorkOrderNewModal({
  isOpen,
  onClose,
  onCreated,
  inspectionId = null,
  fleetAssetId = '',
}: WorkOrderNewModalProps) {
  const [canSubmit, setCanSubmit] = useState(false);
  const [isPending, setIsPending] = useState(false);

  const fromInspection = Boolean(inspectionId?.trim() && fleetAssetId?.trim());

  const { data: suggestion } = useQuery({
    queryKey: ['inspection-suggested-wo-description', inspectionId],
    queryFn: () =>
      api<SuggestedDescriptionResponse>(
        'GET',
        `/fleet/inspections/${inspectionId}/suggested-work-order-description`
      ),
    enabled: isOpen && fromInspection,
    staleTime: 30_000,
  });

  if (!isOpen) return null;

  const formId = fromInspection
    ? `work-order-new-form-inspection-${inspectionId}`
    : 'work-order-new-form-modal';

  const initialDescription =
    fromInspection && suggestion?.description != null ? suggestion.description : undefined;

  return (
    <OverlayPortal>
      <div
        className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center overflow-y-auto p-4"
        onClick={onClose}
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
                  onClick={onClose}
                  className="p-1.5 rounded hover:bg-gray-100 transition-colors flex items-center justify-center"
                  title="Close"
                >
                  <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                  </svg>
                </button>
                <div>
                  <div className="text-sm font-semibold text-gray-900">New Work Order</div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {fromInspection
                      ? 'Create a work order linked to this inspection.'
                      : 'Create a new work order'}
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="overflow-y-auto flex-1 p-4">
            <WorkOrderNewForm
              key={fromInspection ? `wo-${inspectionId}` : 'wo-generic'}
              formId={formId}
              initialEntityType="fleet"
              initialEntityId={fleetAssetId}
              lockEntityAndVehicle={fromInspection}
              originInspectionId={fromInspection ? inspectionId! : undefined}
              initialDescription={initialDescription}
              onSuccess={(data) => {
                onCreated(data);
              }}
              onCancel={onClose}
              onValidationChange={(can, pend) => {
                setCanSubmit(can);
                setIsPending(pend);
              }}
            />
          </div>
          <div className="flex-shrink-0 px-4 py-4 border-t border-gray-200 bg-white flex items-center justify-end gap-3 rounded-b-xl">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg text-sm font-medium text-gray-700 border border-gray-200 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              form={formId}
              disabled={!canSubmit || isPending}
              className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-brand-red hover:bg-[#aa1212] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isPending ? 'Creating...' : 'Create Work Order'}
            </button>
          </div>
        </div>
      </div>
    </OverlayPortal>
  );
}
