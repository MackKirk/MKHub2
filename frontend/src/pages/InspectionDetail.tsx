import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';

type Inspection = {
  id: string;
  fleet_asset_id: string;
  inspection_date: string;
  inspector_user_id?: string;
  checklist_results?: Record<string, string>;
  photos?: string[];
  result: string;
  notes?: string;
  auto_generated_work_order_id?: string;
  created_at: string;
};

const checklistItems = [
  { key: 'tire_condition', label: 'Tire Condition' },
  { key: 'oil_level', label: 'Oil Level' },
  { key: 'fluids', label: 'Fluids' },
  { key: 'lights', label: 'Lights' },
  { key: 'seatbelts', label: 'Seatbelts' },
  { key: 'dashboard_warnings', label: 'Dashboard Warnings' },
  { key: 'interior_condition', label: 'Interior Condition' },
  { key: 'exterior_condition', label: 'Exterior Condition' },
];

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
      <div className="mb-3 rounded-xl border bg-gradient-to-br from-[#7f1010] to-[#a31414] text-white p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-2xl font-extrabold">Inspection</div>
            <div className="text-sm opacity-90">
              {new Date(inspection.inspection_date).toLocaleDateString()}
            </div>
          </div>
          <button
            onClick={() => nav('/fleet/inspections')}
            className="px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg text-sm"
          >
            ← Back to Inspections
          </button>
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

        {inspection.checklist_results && (
          <div>
            <label className="text-sm text-gray-600 mb-2 block">Checklist Results</label>
            <div className="space-y-2">
              {checklistItems.map(item => {
                const result = inspection.checklist_results?.[item.key];
                return (
                  <div key={item.key} className="flex items-center justify-between p-2 border rounded">
                    <span className="text-sm">{item.label}</span>
                    <span className={`px-2 py-1 rounded text-xs ${
                      result === 'pass' ? 'bg-green-100 text-green-800' :
                      result === 'fail' ? 'bg-red-100 text-red-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {result || 'N/A'}
                    </span>
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

