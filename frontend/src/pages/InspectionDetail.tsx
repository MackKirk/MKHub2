import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import { useMemo } from 'react';

type Inspection = {
  id: string;
  fleet_asset_id: string;
  inspection_date: string;
  inspector_user_id?: string;
  checklist_results?: {
    _metadata?: Record<string, string>;
    [key: string]: any; // Allow checklist items with keys like A1, B1, etc.
  } | Record<string, any>;
  photos?: string[];
  result: string;
  notes?: string;
  odometer_reading?: number;
  hours_reading?: number;
  auto_generated_work_order_id?: string;
  created_at: string;
};

type ChecklistTemplate = {
  sections: Array<{
    id: string;
    title: string;
    items: Array<{
      key: string;
      label: string;
      category: string;
    }>;
  }>;
  status_options: Array<{
    value: string;
    label: string;
  }>;
};

export default function InspectionDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const queryClient = useQueryClient();

  const isValidId = id && id !== 'new';

  const { data: inspection, isLoading } = useQuery({
    queryKey: ['inspection', id],
    queryFn: () => api<Inspection>('GET', `/fleet/inspections/${id}`),
    enabled: isValidId,
  });

  const { data: checklistTemplate } = useQuery<ChecklistTemplate>({
    queryKey: ['inspectionChecklistTemplate'],
    queryFn: () => api<ChecklistTemplate>('GET', '/fleet/inspections/checklist-template'),
  });

  const generateWOMutation = useMutation({
    mutationFn: () => {
      if (!isValidId) throw new Error('Invalid inspection ID');
      return api('POST', `/fleet/inspections/${id}/generate-work-order`);
    },
    onSuccess: () => {
      toast.success('Work order generated');
      queryClient.invalidateQueries({ queryKey: ['inspection', id] });
    },
    onError: () => {
      toast.error('Failed to generate work order');
    },
  });

  const resultColors: Record<string, string> = {
    pass: 'bg-green-100 text-green-800',
    fail: 'bg-red-100 text-red-800',
    conditional: 'bg-yellow-100 text-yellow-800',
  };

  const todayLabel = useMemo(() => {
    return new Date().toLocaleDateString('en-CA', {
      weekday: 'long',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }, []);

  if (!isValidId) {
    return <div className="p-4">Invalid inspection ID</div>;
  }

  if (isLoading) {
    return <div className="p-4">Loading...</div>;
  }

  if (!inspection) {
    return <div className="p-4">Inspection not found</div>;
  }

  return (
    <div className="space-y-4">
      <div className="bg-slate-200/50 rounded-[12px] border border-slate-200 flex items-center justify-between py-4 px-6 mb-6">
        <div className="flex items-center gap-4 flex-1">
          <button
            onClick={() => nav('/fleet/inspections')}
            className="p-2 rounded-lg hover:bg-gray-200 transition-colors flex items-center justify-center"
            title="Back to Inspections"
          >
            <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </button>
          <div>
            <div className="text-xl font-bold text-gray-900 tracking-tight mb-0.5">Inspection</div>
            <div className="text-sm text-gray-500 font-medium">
              {new Date(inspection.inspection_date).toLocaleDateString()}
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs text-gray-400 mb-1.5 font-medium uppercase tracking-wide">Today</div>
          <div className="text-sm font-semibold text-gray-700">{todayLabel}</div>
        </div>
      </div>

      <div className="rounded-xl border bg-white p-6 space-y-6">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm text-gray-600">Result</label>
            <div className="mt-1">
              <span className={`px-2 py-1 rounded text-xs font-medium ${resultColors[inspection.result] || 'bg-gray-100 text-gray-800'}`}>
                {inspection.result}
              </span>
            </div>
          </div>
          <div>
            <label className="text-sm text-gray-600">Inspection Date</label>
            <div className="font-medium mt-1">
              {new Date(inspection.inspection_date).toLocaleDateString()}
            </div>
          </div>
        </div>

        {/* Metadata Display */}
        {inspection.checklist_results && typeof inspection.checklist_results === 'object' && '_metadata' in inspection.checklist_results && inspection.checklist_results._metadata && (
          <div className="bg-gray-50 p-4 rounded-lg border">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Inspection Information</h3>
            <div className="grid grid-cols-3 gap-4 text-sm">
              {inspection.checklist_results._metadata.unit_number && (
                <div>
                  <span className="text-gray-600">Unit #:</span> {inspection.checklist_results._metadata.unit_number}
                </div>
              )}
              {inspection.checklist_results._metadata.km && (
                <div>
                  <span className="text-gray-600">KM:</span> {inspection.checklist_results._metadata.km}
                </div>
              )}
              {inspection.checklist_results._metadata.hours && (
                <div>
                  <span className="text-gray-600">Hours:</span> {inspection.checklist_results._metadata.hours}
                </div>
              )}
              {inspection.checklist_results._metadata.mechanic && (
                <div>
                  <span className="text-gray-600">Mechanic:</span> {inspection.checklist_results._metadata.mechanic}
                </div>
              )}
              {inspection.checklist_results._metadata.next_pm_due && (
                <div>
                  <span className="text-gray-600">Next PM Due:</span> {inspection.checklist_results._metadata.next_pm_due}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Odometer/Hours Reading */}
        {(inspection.odometer_reading || inspection.hours_reading) && (
          <div className="grid grid-cols-2 gap-4">
            {inspection.odometer_reading && (
              <div>
                <label className="text-sm text-gray-600">Odometer Reading</label>
                <div className="font-medium mt-1">{inspection.odometer_reading.toLocaleString()} km</div>
              </div>
            )}
            {inspection.hours_reading && (
              <div>
                <label className="text-sm text-gray-600">Hours Reading</label>
                <div className="font-medium mt-1">{inspection.hours_reading.toFixed(1)} hours</div>
              </div>
            )}
          </div>
        )}

        {/* Complete Checklist Display */}
        {inspection.checklist_results && checklistTemplate && (
          <div>
            <label className="text-sm text-gray-600 mb-3 block font-medium">Checklist Results</label>
            <div className="space-y-6 border rounded-lg p-4 bg-white">
              {checklistTemplate.sections.map((section) => {
                // Filter out _metadata from checklist items
                const checklistItems = inspection.checklist_results && typeof inspection.checklist_results === 'object'
                  ? Object.fromEntries(
                      Object.entries(inspection.checklist_results).filter(([key]) => key !== '_metadata')
                    )
                  : inspection.checklist_results;
                
                const sectionItems = section.items.filter(item => {
                  return checklistItems && item.key in checklistItems;
                });
                
                if (sectionItems.length === 0) return null;

                return (
                  <div key={section.id} className="border-b pb-4 last:border-b-0 last:pb-0">
                    <h4 className="text-base font-semibold text-gray-800 mb-3">
                      {section.id}. {section.title}
                    </h4>
                    <div className="space-y-2">
                      {sectionItems.map((item) => {
                        const itemResult = checklistItems?.[item.key];
                        const status = typeof itemResult === 'object' ? itemResult?.status : itemResult;
                        const comments = typeof itemResult === 'object' ? itemResult?.comments : null;
                        
                        return (
                          <div key={item.key} className="grid grid-cols-12 gap-2 items-center py-2 border-b border-gray-100 last:border-b-0">
                            <div className="col-span-5 text-sm text-gray-700">
                              {item.key}. {item.label}
                            </div>
                            <div className="col-span-3">
                              {status ? (
                                <span className="px-2 py-1 rounded text-xs bg-blue-100 text-blue-800">
                                  {checklistTemplate.status_options.find(opt => opt.value === status)?.label || status}
                                </span>
                              ) : (
                                <span className="text-gray-400 text-xs">-</span>
                              )}
                            </div>
                            <div className="col-span-4 text-sm text-gray-600">
                              {comments || '-'}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {inspection.notes && (
          <div>
            <label className="text-sm text-gray-600">Notes</label>
            <div className="mt-1 p-3 bg-gray-50 rounded">{inspection.notes}</div>
          </div>
        )}

        {inspection.photos && inspection.photos.length > 0 && (
          <div>
            <label className="text-sm text-gray-600 mb-2 block">Photos</label>
            <div className="grid grid-cols-4 gap-2">
              {inspection.photos.map((photoId, idx) => (
                <img
                  key={idx}
                  src={`/files/${photoId}/thumbnail?w=300`}
                  alt={`Photo ${idx + 1}`}
                  className="w-full h-24 object-cover rounded border"
                />
              ))}
            </div>
          </div>
        )}

        {inspection.result === 'fail' && !inspection.auto_generated_work_order_id && (
          <div className="border rounded-lg p-4 bg-yellow-50">
            <div className="font-medium mb-2">Failed Inspection</div>
            <div className="text-sm text-gray-600 mb-3">
              This inspection failed. Generate a work order to address the issues.
            </div>
            <button
              onClick={() => generateWOMutation.mutate()}
              disabled={generateWOMutation.isPending}
              className="px-4 py-2 bg-brand-red text-white rounded-lg hover:bg-red-700 text-sm"
            >
              {generateWOMutation.isPending ? 'Generating...' : 'Generate Work Order'}
            </button>
          </div>
        )}

        {inspection.auto_generated_work_order_id && (
          <div className="border rounded-lg p-4 bg-green-50">
            <div className="font-medium mb-2">Work Order Generated</div>
            <button
              onClick={() => nav(`/fleet/work-orders/${inspection.auto_generated_work_order_id}`)}
              className="text-sm text-brand-red hover:underline"
            >
              View Work Order
            </button>
          </div>
        )}

        <div className="flex gap-2">
          <button
            onClick={() => nav(`/fleet/assets/${inspection.fleet_asset_id}`)}
            className="px-4 py-2 border rounded-lg hover:bg-gray-50"
          >
            View Asset
          </button>
        </div>
      </div>
    </div>
  );
}

