import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '@/lib/api';

type Row = {
  user_id: string;
  name: string;
  username: string;
  email?: string;
  job_title?: string | null;
  department?: string | null;
  project_division_labels: string[];
  manager_user_id?: string | null;
  issues: string[];
  profile_updated_at?: string | null;
  profile_updated_by_name?: string | null;
};

type Payload = {
  total_eligible: number;
  total_with_gaps: number;
  truncated: boolean;
  summary: {
    missing_supervisor: number;
    missing_department: number;
    missing_project_division: number;
    missing_job_title: number;
    missing_compensation: number;
  };
  rows: Row[];
};

const ISSUE_KEYS = [
  'missing_supervisor',
  'missing_department',
  'missing_project_division',
  'missing_job_title',
  'missing_compensation',
] as const;

const ISSUE_LABELS: Record<(typeof ISSUE_KEYS)[number], string> = {
  missing_supervisor: 'No supervisor',
  missing_department: 'No department',
  missing_project_division: 'No project division',
  missing_job_title: 'No job title',
  missing_compensation: 'Pay details incomplete',
};

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return '—';
  }
}

export default function HrDataQualityOverview() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['hr-data-quality'],
    queryFn: () => api<Payload>('GET', '/users/hr-data-quality'),
  });
  const [filter, setFilter] = useState<string | null>(null);

  const filteredRows = useMemo(() => {
    if (!data?.rows) return [];
    if (!filter) return data.rows;
    return data.rows.filter((r) => r.issues.includes(filter));
  }, [data, filter]);

  if (error) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <p className="text-red-600 text-sm">Could not load HR overview. You may not have permission.</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-gray-900">HR overview</h1>
        <p className="text-sm text-gray-600 mt-1">
          Active employees with incomplete org or job data. Open a user to fix supervisor, departments, project divisions,
          and titles. Pay/compensation gaps are counted on the card only (no amounts in the table).
        </p>
        {data && (
          <p className="text-xs text-gray-500 mt-2">
            {data.total_with_gaps} of {data.total_eligible} active employees have at least one gap
            {data.truncated ? ' (showing first 500 rows below; expand filters in the API if needed).' : '.'}
          </p>
        )}
      </div>

      {isLoading && <div className="text-gray-500 text-sm">Loading…</div>}

      {data && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3 mb-8">
            {ISSUE_KEYS.map((key) => {
              const count = data.summary[key] ?? 0;
              const active = filter === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setFilter(active ? null : key)}
                  className={`text-left rounded-xl border p-4 transition shadow-sm hover:shadow ${
                    active ? 'ring-2 ring-brand-red border-brand-red/40 bg-red-50/50' : 'bg-white border-gray-200'
                  }`}
                >
                  <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">{ISSUE_LABELS[key]}</div>
                  <div className="text-2xl font-semibold text-gray-900 mt-1">{count}</div>
                  <div className="text-xs text-gray-500 mt-2">{active ? 'Click to clear filter' : 'Filter table'}</div>
                </button>
              );
            })}
          </div>

          <div className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm">
            <div className="px-4 py-3 border-b border-gray-100 flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-gray-800">
                {filter ? `Showing: ${ISSUE_LABELS[filter as (typeof ISSUE_KEYS)[number]]}` : 'All gaps (combined list)'}
              </span>
              <span className="text-xs text-gray-500">· {filteredRows.length} rows</span>
              {filter && (
                <button
                  type="button"
                  className="text-xs text-brand-red font-medium ml-auto"
                  onClick={() => setFilter(null)}
                >
                  Clear filter
                </button>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    <th className="px-4 py-3">Employee</th>
                    <th className="px-4 py-3">Issues</th>
                    <th className="px-4 py-3">Job title</th>
                    <th className="px-4 py-3">Department</th>
                    <th className="px-4 py-3">Project divisions</th>
                    <th className="px-4 py-3">Last profile update</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredRows.map((r) => (
                    <tr key={r.user_id} className="hover:bg-gray-50/80">
                      <td className="px-4 py-3">
                        <Link
                          to={`/users/${encodeURIComponent(r.user_id)}`}
                          className="font-medium text-brand-red hover:underline"
                        >
                          {r.name || r.username}
                        </Link>
                        <div className="text-xs text-gray-500">{r.email || r.username}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {r.issues.map((issue) => (
                            <span
                              key={issue}
                              className="inline-flex px-2 py-0.5 rounded-full text-xs bg-amber-50 text-amber-900 border border-amber-200"
                            >
                              {ISSUE_LABELS[issue as (typeof ISSUE_KEYS)[number]] || issue}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-800">{r.job_title || '—'}</td>
                      <td className="px-4 py-3 text-gray-800">{r.department || '—'}</td>
                      <td className="px-4 py-3 text-gray-800">
                        {r.project_division_labels?.length ? r.project_division_labels.join(', ') : '—'}
                      </td>
                      <td className="px-4 py-3 text-gray-700 text-xs">
                        {fmtDate(r.profile_updated_at)}
                        {r.profile_updated_by_name ? (
                          <div className="text-gray-500 mt-0.5">by {r.profile_updated_by_name}</div>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredRows.length === 0 && (
                <div className="px-4 py-12 text-center text-gray-500 text-sm">No rows match this filter.</div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
