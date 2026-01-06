import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useState, useMemo } from 'react';
import { api } from '@/lib/api';

type Inspection = {
  id: string;
  fleet_asset_id: string;
  fleet_asset_name?: string;
  inspection_date: string;
  inspector_user_id?: string;
  result: string;
  auto_generated_work_order_id?: string;
  created_at: string;
};

export default function Inspections() {
  const nav = useNavigate();
  const [resultFilter, setResultFilter] = useState<string>('all');
  const [assetFilter, setAssetFilter] = useState<string>('');

  const { data: inspections, isLoading } = useQuery({
    queryKey: ['inspections', resultFilter, assetFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      if (resultFilter !== 'all') params.append('result', resultFilter);
      if (assetFilter) params.append('fleet_asset_id', assetFilter);
      const query = params.toString();
      return api<Inspection[]>('GET', `/fleet/inspections${query ? `?${query}` : ''}`);
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

  return (
    <div className="space-y-4">
      <div className="bg-slate-200/50 rounded-[12px] border border-slate-200 flex items-center justify-between py-4 px-6 mb-6">
        <div>
          <div className="text-xl font-bold text-gray-900 tracking-tight mb-0.5">Fleet Inspections</div>
          <div className="text-sm text-gray-500 font-medium">Manage fleet inspections</div>
        </div>
        <div className="text-right">
          <div className="text-xs text-gray-400 mb-1.5 font-medium uppercase tracking-wide">Today</div>
          <div className="text-sm font-semibold text-gray-700">{todayLabel}</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 items-center">
        <input
          type="text"
          placeholder="Filter by asset ID..."
          value={assetFilter}
          onChange={e => setAssetFilter(e.target.value)}
          className="flex-1 border rounded-lg px-4 py-2"
        />
        <select
          value={resultFilter}
          onChange={e => setResultFilter(e.target.value)}
          className="border rounded-lg px-4 py-2"
        >
          <option value="all">All Results</option>
          <option value="pass">Pass</option>
          <option value="fail">Fail</option>
          <option value="conditional">Conditional</option>
        </select>
        <button
          onClick={() => nav('/fleet/inspections/new')}
          className="px-4 py-2 bg-brand-red text-white rounded-lg hover:bg-red-700"
        >
          + New Inspection
        </button>
      </div>

      {/* Table */}
      <div className="rounded-xl border bg-white overflow-hidden">
        {isLoading ? (
          <div className="p-4">
            <div className="h-6 bg-gray-100 animate-pulse rounded" />
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="p-3 text-left">Date</th>
                <th className="p-3 text-left">Asset</th>
                <th className="p-3 text-left">Result</th>
                <th className="p-3 text-left">Work Order</th>
                <th className="p-3 text-left">Inspector</th>
              </tr>
            </thead>
            <tbody>
              {(inspections || []).map(inspection => (
                <tr
                  key={inspection.id}
                  className="border-t hover:bg-gray-50 cursor-pointer"
                  onClick={() => nav(`/fleet/inspections/${inspection.id}`)}
                >
                  <td className="p-3 font-medium">
                    {new Date(inspection.inspection_date).toLocaleDateString()}
                  </td>
                  <td className="p-3 text-gray-600">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        nav(`/fleet/assets/${inspection.fleet_asset_id}`);
                      }}
                      className="text-brand-red hover:underline"
                    >
                      {inspection.fleet_asset_name || inspection.fleet_asset_id}
                    </button>
                  </td>
                  <td className="p-3">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${resultColors[inspection.result] || 'bg-gray-100 text-gray-800'}`}>
                      {inspection.result}
                    </span>
                  </td>
                  <td className="p-3">
                    {inspection.auto_generated_work_order_id ? (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          nav(`/fleet/work-orders/${inspection.auto_generated_work_order_id}`);
                        }}
                        className="text-brand-red hover:underline text-sm"
                      >
                        View WO
                      </button>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </td>
                  <td className="p-3 text-gray-600">
                    {inspection.inspector_user_id || '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {!isLoading && (!inspections || inspections.length === 0) && (
          <div className="p-8 text-center text-gray-500">No inspections found</div>
        )}
      </div>
    </div>
  );
}

