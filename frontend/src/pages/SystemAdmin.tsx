import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useState } from 'react';

type AuditLogEntry = {
  id: string;
  timestamp_utc: string;
  entity_type: string;
  entity_id: string;
  action: string;
  actor_id: string | null;
  actor_role: string | null;
  source: string | null;
  changes_json: Record<string, unknown> | null;
  context: Record<string, unknown> | null;
};

type SystemLogEntry = {
  id: string;
  timestamp_utc: string;
  level: string;
  category: string;
  message: string;
  request_id: string | null;
  path: string | null;
  method: string | null;
  user_id: string | null;
  status_code: number | null;
  detail: string | null;
  extra: Record<string, unknown> | null;
};

export default function SystemAdmin() {
  const [tab, setTab] = useState<'audit' | 'system'>('audit');
  const [entityType, setEntityType] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [levelFilter, setLevelFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [requestIdFilter, setRequestIdFilter] = useState('');

  const auditParams = new URLSearchParams();
  if (entityType) auditParams.set('entity_type', entityType);
  if (actionFilter) auditParams.set('action', actionFilter);
  if (dateFrom) auditParams.set('date_from', dateFrom);
  if (dateTo) auditParams.set('date_to', dateTo);
  auditParams.set('limit', '100');

  const systemParams = new URLSearchParams();
  if (levelFilter) systemParams.set('level', levelFilter);
  if (categoryFilter) systemParams.set('category', categoryFilter);
  if (requestIdFilter) systemParams.set('request_id', requestIdFilter);
  if (dateFrom) systemParams.set('date_from', dateFrom);
  if (dateTo) systemParams.set('date_to', dateTo);
  systemParams.set('limit', '100');

  const { data: auditLogs, isLoading: auditLoading } = useQuery<AuditLogEntry[]>({
    queryKey: ['admin-system-audit', auditParams.toString()],
    queryFn: () => api<AuditLogEntry[]>('GET', `/admin/system/audit-logs?${auditParams}`),
    enabled: tab === 'audit',
  });

  const { data: systemLogs, isLoading: systemLoading } = useQuery<SystemLogEntry[]>({
    queryKey: ['admin-system-logs', systemParams.toString()],
    queryFn: () => api<SystemLogEntry[]>('GET', `/admin/system/logs?${systemParams}`),
    enabled: tab === 'system',
  });

  const isLoading = tab === 'audit' ? auditLoading : systemLoading;

  return (
    <div>
      <div className="bg-slate-200/50 rounded-[12px] border border-slate-200 py-4 px-6 mb-6">
        <div className="text-xl font-bold text-gray-900 tracking-tight mb-0.5">System Admin</div>
        <div className="text-sm text-gray-500 font-medium">Audit logs and application logs for diagnostics (tech team only).</div>
      </div>

      <div className="flex gap-2 mb-4 border-b border-gray-200">
        <button
          type="button"
          onClick={() => setTab('audit')}
          className={`px-4 py-2 font-medium rounded-t-lg transition-colors ${tab === 'audit' ? 'bg-white border border-b-0 border-gray-200 text-gray-900' : 'text-gray-600 hover:bg-gray-100'}`}
        >
          Audit logs
        </button>
        <button
          type="button"
          onClick={() => setTab('system')}
          className={`px-4 py-2 font-medium rounded-t-lg transition-colors ${tab === 'system' ? 'bg-white border border-b-0 border-gray-200 text-gray-900' : 'text-gray-600 hover:bg-gray-100'}`}
        >
          System logs
        </button>
      </div>

      {tab === 'audit' && (
        <>
          <div className="flex flex-wrap gap-4 mb-4 p-3 bg-gray-50 rounded-lg">
            <label className="flex items-center gap-2">
              <span className="text-sm text-gray-600">Entity type</span>
              <input
                type="text"
                value={entityType}
                onChange={(e) => setEntityType(e.target.value)}
                placeholder="e.g. project, client"
                className="border rounded px-2 py-1 text-sm w-32"
              />
            </label>
            <label className="flex items-center gap-2">
              <span className="text-sm text-gray-600">Action</span>
              <input
                type="text"
                value={actionFilter}
                onChange={(e) => setActionFilter(e.target.value)}
                placeholder="e.g. DELETE, CREATE"
                className="border rounded px-2 py-1 text-sm w-28"
              />
            </label>
            <label className="flex items-center gap-2">
              <span className="text-sm text-gray-600">From</span>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="border rounded px-2 py-1 text-sm"
              />
            </label>
            <label className="flex items-center gap-2">
              <span className="text-sm text-gray-600">To</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="border rounded px-2 py-1 text-sm"
              />
            </label>
          </div>
          <div className="border rounded-lg overflow-hidden bg-white">
            {auditLoading ? (
              <div className="p-8 text-center text-gray-500">Loading...</div>
            ) : auditLogs && auditLogs.length === 0 ? (
              <div className="p-8 text-center text-gray-500">No audit logs match the filters.</div>
            ) : auditLogs ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-100 border-b">
                    <tr>
                      <th className="text-left p-3">Time (UTC)</th>
                      <th className="text-left p-3">Entity</th>
                      <th className="text-left p-3">Action</th>
                      <th className="text-left p-3">Actor</th>
                      <th className="text-left p-3">Source</th>
                      <th className="text-left p-3">Context</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditLogs.map((log) => (
                      <tr key={log.id} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="p-3 text-gray-600">{log.timestamp_utc.replace('T', ' ').slice(0, 19)}</td>
                        <td className="p-3">{log.entity_type} / {log.entity_id.slice(0, 8)}…</td>
                        <td className="p-3 font-medium">{log.action}</td>
                        <td className="p-3">{log.actor_id ? `${log.actor_id.slice(0, 8)}…` : '—'} {log.actor_role ? `(${log.actor_role})` : ''}</td>
                        <td className="p-3">{log.source ?? '—'}</td>
                        <td className="p-3 max-w-xs truncate" title={log.context ? JSON.stringify(log.context) : ''}>
                          {log.context ? JSON.stringify(log.context).slice(0, 60) + '…' : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>
        </>
      )}

      {tab === 'system' && (
        <>
          <div className="flex flex-wrap gap-4 mb-4 p-3 bg-gray-50 rounded-lg">
            <label className="flex items-center gap-2">
              <span className="text-sm text-gray-600">Level</span>
              <select
                value={levelFilter}
                onChange={(e) => setLevelFilter(e.target.value)}
                className="border rounded px-2 py-1 text-sm"
              >
                <option value="">All</option>
                <option value="info">Info</option>
                <option value="warning">Warning</option>
                <option value="error">Error</option>
              </select>
            </label>
            <label className="flex items-center gap-2">
              <span className="text-sm text-gray-600">Category</span>
              <input
                type="text"
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                placeholder="e.g. request_error, auth"
                className="border rounded px-2 py-1 text-sm w-36"
              />
            </label>
            <label className="flex items-center gap-2">
              <span className="text-sm text-gray-600">Request ID</span>
              <input
                type="text"
                value={requestIdFilter}
                onChange={(e) => setRequestIdFilter(e.target.value)}
                placeholder="X-Request-ID"
                className="border rounded px-2 py-1 text-sm w-48"
              />
            </label>
            <label className="flex items-center gap-2">
              <span className="text-sm text-gray-600">From</span>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="border rounded px-2 py-1 text-sm"
              />
            </label>
            <label className="flex items-center gap-2">
              <span className="text-sm text-gray-600">To</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="border rounded px-2 py-1 text-sm"
              />
            </label>
          </div>
          <div className="border rounded-lg overflow-hidden bg-white">
            {systemLoading ? (
              <div className="p-8 text-center text-gray-500">Loading...</div>
            ) : systemLogs && systemLogs.length === 0 ? (
              <div className="p-8 text-center text-gray-500">No system logs match the filters.</div>
            ) : systemLogs ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-100 border-b">
                    <tr>
                      <th className="text-left p-3">Time (UTC)</th>
                      <th className="text-left p-3">Level</th>
                      <th className="text-left p-3">Category</th>
                      <th className="text-left p-3">Message</th>
                      <th className="text-left p-3">Path</th>
                      <th className="text-left p-3">Status</th>
                      <th className="text-left p-3">Request ID</th>
                    </tr>
                  </thead>
                  <tbody>
                    {systemLogs.map((log) => (
                      <tr key={log.id} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="p-3 text-gray-600">{log.timestamp_utc.replace('T', ' ').slice(0, 19)}</td>
                        <td className="p-3">
                          <span className={`font-medium ${log.level === 'error' ? 'text-red-600' : log.level === 'warning' ? 'text-amber-600' : 'text-gray-600'}`}>
                            {log.level}
                          </span>
                        </td>
                        <td className="p-3">{log.category}</td>
                        <td className="p-3 max-w-xs" title={log.detail ?? log.message}>{log.message}</td>
                        <td className="p-3 max-w-[200px] truncate" title={log.path ?? ''}>{log.path ?? '—'}</td>
                        <td className="p-3">{log.status_code ?? '—'}</td>
                        <td className="p-3 font-mono text-xs">{log.request_id ? log.request_id.slice(0, 8) + '…' : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>
        </>
      )}

      {isLoading && (
        <div className="p-4 text-center text-gray-500 text-sm">Loading...</div>
      )}
    </div>
  );
}
