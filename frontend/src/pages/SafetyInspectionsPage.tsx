import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMemo } from 'react';
import { api } from '@/lib/api';
import { formatDateLocal } from '@/lib/dateUtils';
import { BUSINESS_LINE_REPAIRS_MAINTENANCE } from '@/lib/businessLine';

type SafetyListRow = {
  id: string;
  project_id: string;
  project_name: string;
  project_code: string;
  business_line?: string;
  inspection_date: string | null;
  status: string;
  created_at?: string | null;
  updated_at?: string | null;
};

function projectHref(row: SafetyListRow): string {
  const base = row.business_line === BUSINESS_LINE_REPAIRS_MAINTENANCE ? '/rm-projects' : '/projects';
  const q = new URLSearchParams({ tab: 'safety', safety_inspection: row.id });
  return `${base}/${encodeURIComponent(row.project_id)}?${q.toString()}`;
}

export default function SafetyInspectionsPage() {
  const nav = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const search = searchParams.get('search') ?? '';
  const statusParam = searchParams.get('status') ?? '';
  const sortBy = searchParams.get('sort') === 'project' ? 'project' : 'inspection_date';
  const sortDir = searchParams.get('dir') === 'asc' ? 'asc' : 'desc';

  const setListSort = (column: 'inspection_date' | 'project', direction?: 'asc' | 'desc') => {
    const params = new URLSearchParams(searchParams);
    const nextDir =
      direction ?? (sortBy === column && sortDir === 'asc' ? 'desc' : 'asc');
    params.set('sort', column);
    params.set('dir', nextDir);
    setSearchParams(params, { replace: true });
  };

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['safetyInspections', search, statusParam, sortBy, sortDir],
    queryFn: () => {
      const params = new URLSearchParams();
      if (search.trim()) params.set('search', search.trim());
      if (statusParam) params.set('status', statusParam);
      params.set('sort', sortBy);
      params.set('dir', sortDir);
      params.set('limit', '200');
      params.set('offset', '0');
      return api<SafetyListRow[]>('GET', `/safety/inspections?${params.toString()}`);
    },
  });

  const todayLabel = useMemo(() => {
    return new Date().toLocaleDateString('en-CA', {
      weekday: 'long',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }, []);

  return (
    <div className="space-y-4 min-w-0 overflow-x-hidden">
      <div className="rounded-xl border bg-white p-4 mb-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="text-sm font-semibold text-gray-900">Site safety inspections</div>
            <div className="text-xs text-gray-500 mt-0.5">
              All awarded projects you can access. Open a row to edit in the project Safety tab.
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => nav('/safety/calendar')}
              className="px-3 py-2 text-xs font-medium text-gray-700 border border-gray-200 rounded-lg bg-white hover:bg-gray-50 transition-colors"
            >
              Calendar
            </button>
            <div className="text-right">
              <div className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">Today</div>
              <div className="text-xs font-semibold text-gray-700 mt-0.5">{todayLabel}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border bg-white p-4 mb-4">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex-1 min-w-[200px]">
            <div className="relative">
              <input
                type="text"
                placeholder="Search by project name or code…"
                value={search}
                onChange={(e) => {
                  const next = e.target.value;
                  const params = new URLSearchParams(searchParams);
                  if (next) params.set('search', next);
                  else params.delete('search');
                  setSearchParams(params, { replace: true });
                }}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 pl-9 text-sm bg-gray-50/50 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-300 focus:border-gray-300 focus:bg-white transition-all duration-150"
              />
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
            </div>
          </div>
          <select
            value={statusParam}
            onChange={(e) => {
              const params = new URLSearchParams(searchParams);
              const v = e.target.value;
              if (v) params.set('status', v);
              else params.delete('status');
              setSearchParams(params, { replace: true });
            }}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white text-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-300 min-w-[160px]"
          >
            <option value="">All statuses</option>
            <option value="draft">Draft</option>
            <option value="finalized">Finalized</option>
          </select>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden min-w-0">
        {isLoading ? (
          <div className="p-8 text-center text-xs text-gray-500">Loading…</div>
        ) : rows.length > 0 ? (
          <div className="overflow-x-auto min-w-0">
            <table className="w-full min-w-0 border-collapse">
              <thead>
                <tr className="text-[10px] font-semibold text-gray-700 bg-gray-50 border-b border-gray-200">
                  <th className="px-3 py-2 text-left">
                    <button
                      type="button"
                      onClick={() => setListSort('inspection_date')}
                      className="flex items-center gap-1 hover:text-gray-900 rounded py-0.5 outline-none focus:outline-none"
                    >
                      Date
                      {sortBy === 'inspection_date' ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
                    </button>
                  </th>
                  <th className="px-3 py-2 text-left">
                    <button
                      type="button"
                      onClick={() => setListSort('project')}
                      className="flex items-center gap-1 hover:text-gray-900 rounded py-0.5 outline-none focus:outline-none"
                    >
                      Project
                      {sortBy === 'project' ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
                    </button>
                  </th>
                  <th className="px-3 py-2 text-left">Code</th>
                  <th className="px-3 py-2 text-left">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-gray-100 hover:bg-gray-50/80 cursor-pointer"
                    onClick={() => nav(projectHref(row))}
                  >
                    <td className="px-3 py-2.5 text-xs text-gray-800 whitespace-nowrap">
                      {row.inspection_date
                        ? formatDateLocal(new Date(row.inspection_date))
                        : '—'}
                    </td>
                    <td className="px-3 py-2.5 text-xs font-medium text-gray-900">{row.project_name}</td>
                    <td className="px-3 py-2.5 text-xs text-gray-600">{row.project_code}</td>
                    <td className="px-3 py-2.5 text-xs">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                          row.status === 'finalized'
                            ? 'bg-green-100 text-green-800'
                            : 'bg-amber-100 text-amber-900'
                        }`}
                      >
                        {row.status === 'finalized' ? 'Finalized' : 'Draft'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-8 text-center text-sm text-gray-500">No inspections found.</div>
        )}
      </div>
    </div>
  );
}
