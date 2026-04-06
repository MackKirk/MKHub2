import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import OverlayPortal from '@/components/OverlayPortal';

/** Stored in UTC; display in Vancouver (PST/PDT). */
const LOG_TIMEZONE = 'America/Vancouver';

function parseUtcTimestamp(iso: string): Date {
  const s = iso.trim();
  if (!s) return new Date(NaN);
  if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(s)) {
    return new Date(s);
  }
  const normalized = s.includes('T') ? s : s.replace(' ', 'T');
  return new Date(normalized.endsWith('Z') ? normalized : `${normalized}Z`);
}

function formatLogTimeVancouver(iso: string): string {
  const d = parseUtcTimestamp(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: LOG_TIMEZONE,
    dateStyle: 'short',
    timeStyle: 'medium',
  }).format(d);
}

const CONTEXT_KEY_LABELS: Record<string, string> = {
  project_id: 'Project',
  project_name: 'Project name',
  client_id: 'Client',
  client_name: 'Client name',
  user_id: 'User',
  affected_user_name: 'Affected user',
  worker_name: 'Worker',
  changed_fields: 'Changed fields',
  conversion: 'Conversion',
  source: 'Source',
  shift_id: 'Shift',
  attendance_id: 'Attendance',
  deleted_report: 'Deleted report',
  deleted_proposal: 'Deleted proposal',
  deleted_draft: 'Deleted draft',
};

function humanizeKey(key: string): string {
  if (CONTEXT_KEY_LABELS[key]) return CONTEXT_KEY_LABELS[key];
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatValueForDisplay(val: unknown, depth = 0): string {
  if (val === null || val === undefined) return '—';
  if (typeof val === 'boolean') return val ? 'Yes' : 'No';
  if (typeof val === 'number' || typeof val === 'string') return String(val);
  if (Array.isArray(val)) {
    if (val.length === 0) return '—';
    if (depth > 2) return JSON.stringify(val);
    return val.map((v) => formatValueForDisplay(v, depth + 1)).join(', ');
  }
  if (typeof val === 'object') {
    try {
      return JSON.stringify(val, null, 2);
    } catch {
      return String(val);
    }
  }
  return String(val);
}

type AuditLogEntry = {
  id: string;
  timestamp_utc: string;
  entity_type: string;
  entity_id: string;
  entity_display: string | null;
  action: string;
  actor_id: string | null;
  actor_name: string | null;
  actor_role: string | null;
  source: string | null;
  changes_json: Record<string, unknown> | null;
  context: Record<string, unknown> | null;
};

function hasAuditChanges(c: Record<string, unknown> | unknown[] | null): boolean {
  if (c == null) return false;
  if (Array.isArray(c)) return c.length > 0;
  if (typeof c === 'object') return Object.keys(c).length > 0;
  return true;
}

function formatEntityTypeLabel(entityType: string): string {
  return humanizeKey(entityType || 'record');
}

/** Table / list: primary label + full id in parentheses when present. */
function formatAuditEntityCell(log: AuditLogEntry) {
  const id = (log.entity_id || '').trim();
  const primary = log.entity_display || formatEntityTypeLabel(log.entity_type || 'record');
  return (
    <span title={`${log.entity_type || 'entity'}${id ? ` · ${id}` : ''}`}>
      <span className="font-medium text-gray-900">{primary}</span>
      {id ? <span className="text-gray-500 font-mono text-[11px] sm:text-xs"> ({id})</span> : null}
    </span>
  );
}

function formatAuditActorCell(log: AuditLogEntry) {
  const id = log.actor_id?.trim() || '';
  if (log.actor_name && id) {
    return (
      <span title={id}>
        <span className="text-gray-900">{log.actor_name}</span>
        <span className="text-gray-500 font-mono text-[11px] sm:text-xs"> ({id})</span>
        {log.actor_role ? <span className="text-gray-400 text-xs"> · {log.actor_role}</span> : null}
      </span>
    );
  }
  if (log.actor_name) {
    return (
      <span className="text-gray-900">
        {log.actor_name}
        {log.actor_role ? <span className="text-gray-400 text-xs"> · {log.actor_role}</span> : null}
      </span>
    );
  }
  if (id) {
    return <span className="font-mono text-[11px] sm:text-xs text-gray-600">{id}</span>;
  }
  return '—';
}

function formatSystemUserCell(log: { user_name: string | null; user_id: string | null }) {
  const id = (log.user_id || '').trim();
  const name = (log.user_name || '').trim();
  if (name && id) {
    return (
      <span title={id}>
        <span className="text-gray-900">{name}</span>
        <span className="text-gray-500 font-mono text-[11px] sm:text-xs"> ({id})</span>
      </span>
    );
  }
  if (name) return <span className="text-gray-900">{name}</span>;
  if (id) return <span className="font-mono text-[11px] sm:text-xs text-gray-600">{id}</span>;
  return '—';
}

function buildAuditSummary(log: AuditLogEntry): string {
  const action = (log.action || 'ACTION').toUpperCase();
  const entity = log.entity_type || 'record';
  const id = (log.entity_id || '').trim();
  const baseName = log.entity_display || formatEntityTypeLabel(log.entity_type);
  const name = id ? `${baseName} (${id})` : baseName;
  const verbs: Record<string, string> = {
    CREATE: 'created',
    UPDATE: 'updated',
    DELETE: 'deleted',
    APPROVE: 'approved',
    REJECT: 'rejected',
    CLOCK_IN: 'clocked in',
    CLOCK_OUT: 'clocked out',
  };
  const v = verbs[action] || action.toLowerCase();
  return `${log.actor_name || 'Someone'} ${v} ${entity.replace(/_/g, ' ')} “${name}”.`;
}

function isBeforeAfterObject(v: unknown): v is { before?: unknown; after?: unknown } {
  return typeof v === 'object' && v !== null && !Array.isArray(v) && ('before' in v || 'after' in v);
}

function ChangesSection({ data }: { data: Record<string, unknown> | unknown[] | null }) {
  if (data == null) return null;
  if (Array.isArray(data)) {
    return (
      <pre className="text-xs font-mono bg-gray-50 border border-gray-200 rounded-lg p-3 overflow-x-auto max-h-72 overflow-y-auto whitespace-pre-wrap break-all">
        {JSON.stringify(data, null, 2)}
      </pre>
    );
  }
  if (typeof data !== 'object') return null;

  const entries = Object.entries(data as Record<string, unknown>);
  const allBeforeAfter = entries.length > 0 && entries.every(([, v]) => isBeforeAfterObject(v));

  if (allBeforeAfter) {
    return (
      <div className="rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left p-2 font-medium text-gray-700">Field</th>
              <th className="text-left p-2 font-medium text-gray-700">Before</th>
              <th className="text-left p-2 font-medium text-gray-700">After</th>
            </tr>
          </thead>
          <tbody>
            {entries.map(([key, v]) => {
              const o = v as { before?: unknown; after?: unknown };
              return (
                <tr key={key} className="border-b border-gray-100 align-top">
                  <td className="p-2 text-gray-800 font-medium whitespace-nowrap">{humanizeKey(key)}</td>
                  <td className="p-2 text-gray-600 font-mono text-xs break-all max-w-[200px]">{formatValueForDisplay(o.before)}</td>
                  <td className="p-2 text-gray-900 font-mono text-xs break-all max-w-[200px]">{formatValueForDisplay(o.after)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  if (isBeforeAfterObject(data) && (data.before !== undefined || data.after !== undefined)) {
    return (
      <div className="grid md:grid-cols-2 gap-3">
        <div className="rounded-lg border border-gray-200 p-3 bg-red-50/40">
          <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Before</div>
          <pre className="text-xs font-mono text-gray-800 whitespace-pre-wrap break-all max-h-64 overflow-y-auto">
            {formatValueForDisplay(data.before)}
          </pre>
        </div>
        <div className="rounded-lg border border-gray-200 p-3 bg-emerald-50/40">
          <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">After</div>
          <pre className="text-xs font-mono text-gray-800 whitespace-pre-wrap break-all max-h-64 overflow-y-auto">
            {formatValueForDisplay(data.after)}
          </pre>
        </div>
      </div>
    );
  }

  return (
    <pre className="text-xs font-mono bg-gray-50 border border-gray-200 rounded-lg p-3 overflow-x-auto max-h-72 overflow-y-auto whitespace-pre-wrap break-all">
      {JSON.stringify(data, null, 2)}
    </pre>
  );
}

function ContextSection({ context }: { context: Record<string, unknown> | null }) {
  if (!context || Object.keys(context).length === 0) {
    return <p className="text-sm text-gray-500">No extra context was recorded for this event.</p>;
  }
  return (
    <dl className="space-y-2">
      {Object.entries(context).map(([key, val]) => (
        <div key={key} className="rounded-lg border border-gray-100 bg-gray-50/80 px-3 py-2">
          <dt className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{humanizeKey(key)}</dt>
          <dd className="text-sm text-gray-900 mt-0.5 break-words whitespace-pre-wrap font-mono text-[13px]">
            {typeof val === 'object' && val !== null ? formatValueForDisplay(val) : String(val)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

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
  user_name: string | null;
  status_code: number | null;
  detail: string | null;
  extra: Record<string, unknown> | null;
};

type UserActivityEntry = {
  user_id: string;
  username: string;
  email: string | null;
  last_login_at: string | null;
};

export default function SystemAdmin() {
  const navigate = useNavigate();
  const { data: me, isLoading: meLoading } = useQuery({
    queryKey: ['me'],
    queryFn: () => api<any>('GET', '/auth/me'),
  });
  const isSystemAdmin = (me?.roles || []).includes('admin');

  const [tab, setTab] = useState<'audit' | 'system' | 'last-login'>('audit');
  const [entityType, setEntityType] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [levelFilter, setLevelFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [requestIdFilter, setRequestIdFilter] = useState('');
  const [auditDetail, setAuditDetail] = useState<AuditLogEntry | null>(null);
  const [systemDetail, setSystemDetail] = useState<SystemLogEntry | null>(null);

  useEffect(() => {
    if (meLoading || !me) return;
    if (!isSystemAdmin) navigate('/home', { replace: true });
  }, [meLoading, me, isSystemAdmin, navigate]);

  useEffect(() => {
    if (!auditDetail && !systemDetail) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setAuditDetail(null);
        setSystemDetail(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [auditDetail, systemDetail]);

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
    enabled: isSystemAdmin && tab === 'audit',
  });

  const { data: systemLogs, isLoading: systemLoading } = useQuery<SystemLogEntry[]>({
    queryKey: ['admin-system-logs', systemParams.toString()],
    queryFn: () => api<SystemLogEntry[]>('GET', `/admin/system/logs?${systemParams}`),
    enabled: isSystemAdmin && tab === 'system',
  });

  const { data: userActivity, isLoading: userActivityLoading } = useQuery<UserActivityEntry[]>({
    queryKey: ['admin-system-user-activity'],
    queryFn: () => api<UserActivityEntry[]>('GET', '/admin/system/user-activity?limit=200'),
    enabled: isSystemAdmin && tab === 'last-login',
  });

  const isLoading = tab === 'audit' ? auditLoading : tab === 'system' ? systemLoading : userActivityLoading;

  if (meLoading || (me && !isSystemAdmin)) {
    return (
      <div className="p-8 text-center text-gray-500">
        {meLoading ? 'Loading…' : 'Redirecting…'}
      </div>
    );
  }

  return (
    <div>
      <div className="bg-slate-200/50 rounded-[12px] border border-slate-200 py-4 px-6 mb-6">
        <div className="text-xl font-bold text-gray-900 tracking-tight mb-0.5">Activity &amp; logs</div>
        <div className="text-sm text-gray-500 font-medium">
          Audit trail, application logs, and sign-in activity. Timestamps use Pacific Time (America/Vancouver, PST/PDT).
        </div>
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
        <button
          type="button"
          onClick={() => setTab('last-login')}
          className={`px-4 py-2 font-medium rounded-t-lg transition-colors ${tab === 'last-login' ? 'bg-white border border-b-0 border-gray-200 text-gray-900' : 'text-gray-600 hover:bg-gray-100'}`}
        >
          Last login
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
          <p className="text-sm text-gray-500 mb-2">
            Click a row to open a summary, structured context, and any before/after field changes.
          </p>
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
                      <th className="text-left p-3">Time (Vancouver)</th>
                      <th className="text-left p-3">Entity</th>
                      <th className="text-left p-3">Action</th>
                      <th className="text-left p-3">Actor</th>
                      <th className="text-left p-3">Source</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditLogs.map((log) => (
                      <tr
                        key={log.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => setAuditDetail(log)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setAuditDetail(log);
                          }
                        }}
                        className="border-b border-gray-100 hover:bg-indigo-50/60 cursor-pointer transition-colors"
                      >
                        <td className="p-3 text-gray-600 whitespace-nowrap">{formatLogTimeVancouver(log.timestamp_utc)}</td>
                        <td className="p-3 max-w-md">{formatAuditEntityCell(log)}</td>
                        <td className="p-3 font-medium">{log.action}</td>
                        <td className="p-3 max-w-xs">{formatAuditActorCell(log)}</td>
                        <td className="p-3">{log.source ?? '—'}</td>
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
          <p className="text-sm text-gray-500 mb-2">Click a row for full message, request details, and technical metadata.</p>
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
                      <th className="text-left p-3">Time (Vancouver)</th>
                      <th className="text-left p-3">Level</th>
                      <th className="text-left p-3">Category</th>
                      <th className="text-left p-3">Message</th>
                      <th className="text-left p-3">User</th>
                      <th className="text-left p-3">Path</th>
                      <th className="text-left p-3">Status</th>
                      <th className="text-left p-3">Request ID</th>
                    </tr>
                  </thead>
                  <tbody>
                    {systemLogs.map((log) => (
                      <tr
                        key={log.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => setSystemDetail(log)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setSystemDetail(log);
                          }
                        }}
                        className="border-b border-gray-100 hover:bg-indigo-50/60 cursor-pointer transition-colors"
                      >
                        <td className="p-3 text-gray-600 whitespace-nowrap">{formatLogTimeVancouver(log.timestamp_utc)}</td>
                        <td className="p-3">
                          <span className={`font-medium ${log.level === 'error' ? 'text-red-600' : log.level === 'warning' ? 'text-amber-600' : 'text-gray-600'}`}>
                            {log.level}
                          </span>
                        </td>
                        <td className="p-3">{log.category}</td>
                        <td className="p-3 max-w-xs" title={log.detail ?? log.message}>{log.message}</td>
                        <td className="p-3 max-w-xs">{formatSystemUserCell(log)}</td>
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

      {tab === 'last-login' && (
        <div className="border rounded-lg overflow-hidden bg-white">
          {userActivityLoading ? (
            <div className="p-8 text-center text-gray-500">Carregando...</div>
          ) : userActivity && userActivity.length === 0 ? (
            <div className="p-8 text-center text-gray-500">Nenhum usuário ativo.</div>
          ) : userActivity ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-100 border-b">
                  <tr>
                    <th className="text-left p-3">Usuário</th>
                    <th className="text-left p-3">Email</th>
                    <th className="text-left p-3">Último login (Vancouver)</th>
                  </tr>
                </thead>
                <tbody>
                  {userActivity.map((u) => (
                    <tr key={u.user_id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="p-3 font-medium">{u.username}</td>
                      <td className="p-3 text-gray-600">{u.email ?? '—'}</td>
                      <td className="p-3 text-gray-600">
                        {u.last_login_at
                          ? formatLogTimeVancouver(u.last_login_at)
                          : 'Nunca'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      )}

      {isLoading && (
        <div className="p-4 text-center text-gray-500 text-sm">Loading...</div>
      )}

      {auditDetail && (
        <OverlayPortal>
          <div
            className="fixed inset-0 z-[100001] flex items-center justify-center p-4 bg-black/50"
            onClick={() => setAuditDetail(null)}
            role="presentation"
          >
            <div
              className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[min(90vh,820px)] overflow-hidden flex flex-col border border-gray-200"
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-labelledby="audit-modal-title"
            >
              <div className="px-5 py-4 border-b border-gray-200 flex items-start justify-between gap-3 shrink-0">
                <div>
                  <h2 id="audit-modal-title" className="text-lg font-bold text-gray-900">
                    Audit event
                  </h2>
                  <p className="text-sm text-gray-600 mt-1 leading-relaxed">{buildAuditSummary(auditDetail)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setAuditDetail(null)}
                  className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-800"
                  aria-label="Close"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="px-5 py-4 overflow-y-auto flex-1 space-y-5">
                <div className="grid sm:grid-cols-2 gap-3 text-sm">
                  <div className="rounded-lg bg-gray-50 border border-gray-100 px-3 py-2">
                    <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">When (Vancouver)</div>
                    <div className="text-gray-900 mt-0.5">{formatLogTimeVancouver(auditDetail.timestamp_utc)}</div>
                  </div>
                  <div className="rounded-lg bg-gray-50 border border-gray-100 px-3 py-2">
                    <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Action</div>
                    <div className="text-gray-900 mt-0.5 font-medium">{auditDetail.action}</div>
                  </div>
                  <div className="rounded-lg bg-gray-50 border border-gray-100 px-3 py-2 sm:col-span-2">
                    <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Entity</div>
                    <div className="text-gray-900 mt-0.5 break-words">{formatAuditEntityCell(auditDetail)}</div>
                    <div className="text-xs text-gray-500 mt-1 font-mono">{auditDetail.entity_type}</div>
                  </div>
                  <div className="rounded-lg bg-gray-50 border border-gray-100 px-3 py-2 sm:col-span-2">
                    <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Actor</div>
                    <div className="text-gray-900 mt-0.5 break-words">{formatAuditActorCell(auditDetail)}</div>
                  </div>
                  <div className="rounded-lg bg-gray-50 border border-gray-100 px-3 py-2 sm:col-span-2">
                    <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Source</div>
                    <div className="text-gray-900 mt-0.5">{auditDetail.source ?? '—'}</div>
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-bold text-gray-900 mb-2">Context</h3>
                  <ContextSection context={auditDetail.context} />
                </div>

                {hasAuditChanges(auditDetail.changes_json) && (
                  <div>
                    <h3 className="text-sm font-bold text-gray-900 mb-2">What changed</h3>
                    <ChangesSection data={auditDetail.changes_json as Record<string, unknown> | unknown[]} />
                  </div>
                )}
              </div>
              <div className="px-5 py-3 border-t border-gray-200 bg-gray-50 shrink-0 flex justify-end">
                <button
                  type="button"
                  onClick={() => setAuditDetail(null)}
                  className="px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-medium hover:bg-gray-800"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </OverlayPortal>
      )}

      {systemDetail && (
        <OverlayPortal>
          <div
            className="fixed inset-0 z-[100001] flex items-center justify-center p-4 bg-black/50"
            onClick={() => setSystemDetail(null)}
            role="presentation"
          >
            <div
              className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[min(90vh,820px)] overflow-hidden flex flex-col border border-gray-200"
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-labelledby="system-modal-title"
            >
              <div className="px-5 py-4 border-b border-gray-200 flex items-start justify-between gap-3 shrink-0">
                <div>
                  <h2 id="system-modal-title" className="text-lg font-bold text-gray-900">
                    System log
                  </h2>
                  <p className="text-sm text-gray-600 mt-1">{systemDetail.message}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setSystemDetail(null)}
                  className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-800"
                  aria-label="Close"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="px-5 py-4 overflow-y-auto flex-1 space-y-5">
                <div className="grid sm:grid-cols-2 gap-3 text-sm">
                  <div className="rounded-lg bg-gray-50 border border-gray-100 px-3 py-2">
                    <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">When (Vancouver)</div>
                    <div className="text-gray-900 mt-0.5">{formatLogTimeVancouver(systemDetail.timestamp_utc)}</div>
                  </div>
                  <div className="rounded-lg bg-gray-50 border border-gray-100 px-3 py-2">
                    <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Level</div>
                    <div
                      className={`mt-0.5 font-medium ${
                        systemDetail.level === 'error'
                          ? 'text-red-600'
                          : systemDetail.level === 'warning'
                            ? 'text-amber-600'
                            : 'text-gray-800'
                      }`}
                    >
                      {systemDetail.level}
                    </div>
                  </div>
                  <div className="rounded-lg bg-gray-50 border border-gray-100 px-3 py-2">
                    <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Category</div>
                    <div className="text-gray-900 mt-0.5 font-mono text-xs">{systemDetail.category}</div>
                  </div>
                  <div className="rounded-lg bg-gray-50 border border-gray-100 px-3 py-2">
                    <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">HTTP status</div>
                    <div className="text-gray-900 mt-0.5">{systemDetail.status_code ?? '—'}</div>
                  </div>
                  <div className="rounded-lg bg-gray-50 border border-gray-100 px-3 py-2 sm:col-span-2">
                    <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Request</div>
                    <div className="text-gray-900 mt-0.5 font-mono text-xs break-all">
                      {(systemDetail.method || '—') + ' ' + (systemDetail.path || '—')}
                    </div>
                  </div>
                  <div className="rounded-lg bg-gray-50 border border-gray-100 px-3 py-2">
                    <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">User</div>
                    <div className="text-gray-900 mt-0.5">
                      {formatSystemUserCell(systemDetail)}
                    </div>
                  </div>
                  <div className="rounded-lg bg-gray-50 border border-gray-100 px-3 py-2">
                    <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Request ID</div>
                    <div className="text-gray-900 mt-0.5 font-mono text-xs break-all">{systemDetail.request_id ?? '—'}</div>
                  </div>
                </div>
                {systemDetail.detail && (
                  <div>
                    <h3 className="text-sm font-bold text-gray-900 mb-2">Detail</h3>
                    <pre className="text-xs font-mono bg-amber-50 border border-amber-100 rounded-lg p-3 whitespace-pre-wrap break-all max-h-48 overflow-y-auto">
                      {systemDetail.detail}
                    </pre>
                  </div>
                )}
                {systemDetail.extra && Object.keys(systemDetail.extra).length > 0 && (
                  <div>
                    <h3 className="text-sm font-bold text-gray-900 mb-2">Extra</h3>
                    <ContextSection context={systemDetail.extra} />
                  </div>
                )}
              </div>
              <div className="px-5 py-3 border-t border-gray-200 bg-gray-50 shrink-0 flex justify-end">
                <button
                  type="button"
                  onClick={() => setSystemDetail(null)}
                  className="px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-medium hover:bg-gray-800"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </OverlayPortal>
      )}
    </div>
  );
}
