import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Check,
  Copy,
  ExternalLink,
  RefreshCw,
  ScrollText,
  Search,
  ShieldAlert,
  SlidersHorizontal,
} from 'lucide-react';
import {
  AppBadge,
  AppButton,
  AppCard,
  AppDatePicker,
  AppEmptyState,
  AppInput,
  AppModal,
  AppPageHeader,
  AppQuickFilterRow,
  AppSelect,
  AppTabs,
  AppUserSelect,
  uiBorders,
  uiCx,
  uiLayout,
  uiShadows,
  uiSpacing,
  uiTypography,
} from '@/components/ui';

/** Stored in UTC; display in Vancouver (PST/PDT). */
const LOG_TIMEZONE = 'America/Vancouver';
const PAGE_SIZE = 75;

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

function formatRelativeTime(iso: string): string {
  const d = parseUtcTimestamp(iso);
  if (Number.isNaN(d.getTime())) return '';
  const diffSec = Math.round((Date.now() - d.getTime()) / 1000);
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  const abs = Math.abs(diffSec);
  if (abs < 60) return rtf.format(-diffSec, 'second');
  if (abs < 3600) return rtf.format(-Math.round(diffSec / 60), 'minute');
  if (abs < 86400) return rtf.format(-Math.round(diffSec / 3600), 'hour');
  if (abs < 86400 * 30) return rtf.format(-Math.round(diffSec / 86400), 'day');
  return rtf.format(-Math.round(diffSec / (86400 * 30)), 'month');
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
  change_field_count?: number;
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
  user_name: string | null;
  status_code: number | null;
  detail: string | null;
  extra: Record<string, unknown> | null;
};

type UserActivityEntry = {
  user_id: string;
  username: string;
  email: string | null;
  full_name?: string | null;
  last_login_at: string | null;
  is_active?: boolean;
};

type FilterOptions = {
  entity_types: string[];
  actions: string[];
  sources: string[];
  categories: string[];
  levels: string[];
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

function looksLikeUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.trim());
}

function entityHref(entityType: string, entityId: string): string | null {
  const id = (entityId || '').trim();
  if (!id) return null;
  switch (entityType) {
    case 'project':
    case 'opportunity':
      return `/projects/${id}`;
    case 'user':
      return `/users/${id}`;
    case 'fleet_asset':
      return `/fleet/assets/${id}`;
    case 'equipment':
      return `/company-assets/equipment/${id}`;
    case 'work_order':
      return `/fleet/work-orders/${id}`;
    case 'fleet_inspection':
      return `/fleet/inspections/${id}`;
    case 'company_credit_card':
      return `/company-assets/credit-cards/${id}`;
    case 'quote':
      return `/quotes/${id}`;
    default:
      return null;
  }
}

/** Map common audit/system context keys to in-app routes. */
function contextValueHref(key: string, val: unknown): string | null {
  if (typeof val !== 'string' && typeof val !== 'number') return null;
  const id = String(val).trim();
  if (!id || !looksLikeUuid(id)) return null;
  const k = key.toLowerCase();
  if (k === 'project_id' || k.endsWith('_project_id') || k === 'project') return `/projects/${id}`;
  if (
    k === 'user_id' ||
    k === 'actor_id' ||
    k === 'worker_id' ||
    k === 'worker_user_id' ||
    k === 'affected_user_id' ||
    k === 'manager_user_id' ||
    k === 'assigned_to' ||
    k.endsWith('_user_id') ||
    k === 'user'
  ) {
    return `/users/${id}`;
  }
  return null;
}

function contextLinkLabel(key: string, context: Record<string, unknown>): string {
  const k = key.toLowerCase();
  if (k.includes('project')) {
    const name = context.project_name;
    if (typeof name === 'string' && name.trim()) return name.trim();
    return 'Open project';
  }
  if (k.includes('user') || k.includes('worker') || k.includes('actor') || k === 'assigned_to') {
    const name =
      (typeof context.affected_user_name === 'string' && context.affected_user_name) ||
      (typeof context.worker_name === 'string' && context.worker_name) ||
      (typeof context.user_name === 'string' && context.user_name);
    if (name && String(name).trim()) return String(name).trim();
    return humanizeKey(key);
  }
  return humanizeKey(key);
}

type RelatedLink = { label: string; href: string; kind: 'project' | 'user' | 'other' };

function collectRelatedLinks(log: AuditLogEntry): RelatedLink[] {
  const links: RelatedLink[] = [];
  const seen = new Set<string>();
  const add = (label: string, href: string | null, kind: RelatedLink['kind']) => {
    if (!href || seen.has(href)) return;
    seen.add(href);
    links.push({ label, href, kind });
  };

  add(
    log.entity_display || formatEntityTypeLabel(log.entity_type),
    entityHref(log.entity_type, log.entity_id),
    log.entity_type === 'user'
      ? 'user'
      : log.entity_type === 'project' || log.entity_type === 'opportunity'
        ? 'project'
        : 'other',
  );
  if (log.actor_id) {
    add(log.actor_name || 'Actor', `/users/${log.actor_id}`, 'user');
  }
  if (log.context) {
    for (const [key, val] of Object.entries(log.context)) {
      const href = contextValueHref(key, val);
      if (!href) continue;
      const kind: RelatedLink['kind'] = href.startsWith('/projects/')
        ? 'project'
        : href.startsWith('/users/')
          ? 'user'
          : 'other';
      add(contextLinkLabel(key, log.context), href, kind);
    }
  }

  // Prefer project / user shortcuts first in the detail panel.
  return [
    ...links.filter((l) => l.kind === 'project'),
    ...links.filter((l) => l.kind === 'user'),
    ...links.filter((l) => l.kind === 'other'),
  ];
}

function LinkedValue({
  href,
  children,
  onNavigate,
  className,
  title,
}: {
  href: string;
  children: ReactNode;
  onNavigate?: () => void;
  className?: string;
  title?: string;
}) {
  return (
    <Link
      to={href}
      title={title}
      onClick={(e) => {
        e.stopPropagation();
        onNavigate?.();
      }}
      className={uiCx('inline-flex max-w-full items-center gap-1 font-medium text-brand-red hover:underline', className)}
    >
      <span className="truncate">{children}</span>
      <ExternalLink className="h-3 w-3 shrink-0 opacity-70" />
    </Link>
  );
}

function actionBadgeVariant(action: string): 'neutral' | 'success' | 'warning' | 'danger' | 'info' {
  const a = (action || '').toUpperCase();
  if (a === 'DELETE' || a === 'REJECT') return 'danger';
  if (a === 'CREATE' || a === 'APPROVE' || a === 'CLOCK_IN') return 'success';
  if (a === 'UPDATE' || a === 'CLOCK_OUT') return 'info';
  return 'neutral';
}

function levelBadgeVariant(level: string): 'neutral' | 'success' | 'warning' | 'danger' | 'info' {
  const l = (level || '').toLowerCase();
  if (l === 'error') return 'danger';
  if (l === 'warning') return 'warning';
  if (l === 'info') return 'info';
  return 'neutral';
}

function statusBadgeVariant(code: number | null | undefined): 'neutral' | 'success' | 'warning' | 'danger' | 'info' {
  if (code == null) return 'neutral';
  if (code >= 500) return 'danger';
  if (code >= 400) return 'warning';
  if (code >= 200 && code < 300) return 'success';
  return 'info';
}

function CopyIdButton({ value, label = 'Copy' }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  if (!value) return null;
  return (
    <button
      type="button"
      title={label}
      className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-gray-500 hover:bg-gray-100 hover:text-gray-800"
      onClick={(e) => {
        e.stopPropagation();
        void navigator.clipboard.writeText(value).then(() => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1200);
        });
      }}
    >
      {copied ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
      <span className="font-mono">{value.length > 12 ? `${value.slice(0, 8)}…` : value}</span>
    </button>
  );
}

function TimeCell({ iso }: { iso: string }) {
  return (
    <div className="whitespace-nowrap">
      <div className="text-gray-900">{formatLogTimeVancouver(iso)}</div>
      <div className={uiTypography.helper}>{formatRelativeTime(iso)}</div>
    </div>
  );
}

function formatAuditEntityCell(log: AuditLogEntry, onNavigate?: () => void) {
  const id = (log.entity_id || '').trim();
  const primary = log.entity_display || formatEntityTypeLabel(log.entity_type || 'record');
  const href = entityHref(log.entity_type, id);
  return (
    <div className="min-w-0">
      <div className="flex min-w-0 items-center gap-1.5">
        {href ? (
          <LinkedValue href={href} onNavigate={onNavigate} title={primary}>
            {primary}
          </LinkedValue>
        ) : (
          <span className="truncate font-medium text-gray-900" title={primary}>
            {primary}
          </span>
        )}
      </div>
      <div className="mt-0.5 flex flex-wrap items-center gap-1">
        <span className={uiCx(uiTypography.helper, 'capitalize')}>{formatEntityTypeLabel(log.entity_type)}</span>
        {id ? <CopyIdButton value={id} label="Copy entity ID" /> : null}
      </div>
    </div>
  );
}

function formatAuditActorCell(log: AuditLogEntry, onNavigate?: () => void) {
  const id = log.actor_id?.trim() || '';
  const name = log.actor_name || '—';
  return (
    <div className="min-w-0">
      {id ? (
        <LinkedValue href={`/users/${id}`} onNavigate={onNavigate}>
          {name}
        </LinkedValue>
      ) : (
        <span className="truncate text-gray-900">{name}</span>
      )}
      <div className="mt-0.5 flex flex-wrap items-center gap-1">
        {log.actor_role ? <span className={uiTypography.helper}>{log.actor_role}</span> : null}
        {id ? <CopyIdButton value={id} label="Copy actor ID" /> : null}
      </div>
    </div>
  );
}

function formatSystemUserCell(
  log: { user_name: string | null; user_id: string | null },
  onNavigate?: () => void,
) {
  const id = (log.user_id || '').trim();
  const name = (log.user_name || '').trim() || '—';
  if (!id && name === '—') return <span className="text-gray-400">—</span>;
  return (
    <div className="min-w-0">
      {id ? (
        <LinkedValue href={`/users/${id}`} onNavigate={onNavigate}>
          {name}
        </LinkedValue>
      ) : (
        <span className="truncate text-gray-900">{name}</span>
      )}
      {id ? (
        <div className="mt-0.5">
          <CopyIdButton value={id} label="Copy user ID" />
        </div>
      ) : null}
    </div>
  );
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
      <pre className="max-h-72 overflow-x-auto overflow-y-auto whitespace-pre-wrap break-all rounded-lg border border-gray-200 bg-gray-50 p-3 font-mono text-xs">
        {JSON.stringify(data, null, 2)}
      </pre>
    );
  }
  if (typeof data !== 'object') return null;

  const entries = Object.entries(data as Record<string, unknown>);
  const allBeforeAfter = entries.length > 0 && entries.every(([, v]) => isBeforeAfterObject(v));

  if (allBeforeAfter) {
    return (
      <div className="overflow-hidden rounded-lg border border-gray-200">
        <table className="w-full text-sm">
          <thead className="border-b border-gray-200 bg-gray-50">
            <tr>
              <th className="p-2 text-left font-medium text-gray-700">Field</th>
              <th className="p-2 text-left font-medium text-gray-700">Before</th>
              <th className="p-2 text-left font-medium text-gray-700">After</th>
            </tr>
          </thead>
          <tbody>
            {entries.map(([key, v]) => {
              const o = v as { before?: unknown; after?: unknown };
              return (
                <tr key={key} className="border-b border-gray-100 align-top">
                  <td className="whitespace-nowrap p-2 font-medium text-gray-800">{humanizeKey(key)}</td>
                  <td className="max-w-[200px] break-all p-2 font-mono text-xs text-gray-600">
                    {formatValueForDisplay(o.before)}
                  </td>
                  <td className="max-w-[200px] break-all p-2 font-mono text-xs text-gray-900">
                    {formatValueForDisplay(o.after)}
                  </td>
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
      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-lg border border-gray-200 bg-red-50/40 p-3">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-600">Before</div>
          <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap break-all font-mono text-xs text-gray-800">
            {formatValueForDisplay(data.before)}
          </pre>
        </div>
        <div className="rounded-lg border border-gray-200 bg-emerald-50/40 p-3">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-600">After</div>
          <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap break-all font-mono text-xs text-gray-800">
            {formatValueForDisplay(data.after)}
          </pre>
        </div>
      </div>
    );
  }

  return (
    <pre className="max-h-72 overflow-x-auto overflow-y-auto whitespace-pre-wrap break-all rounded-lg border border-gray-200 bg-gray-50 p-3 font-mono text-xs">
      {JSON.stringify(data, null, 2)}
    </pre>
  );
}

function ContextSection({
  context,
  onNavigate,
}: {
  context: Record<string, unknown> | null;
  onNavigate?: () => void;
}) {
  if (!context || Object.keys(context).length === 0) {
    return <p className="text-sm text-gray-500">No extra context was recorded for this event.</p>;
  }
  return (
    <dl className="space-y-2">
      {Object.entries(context).map(([key, val]) => {
        const href = contextValueHref(key, val);
        return (
          <div key={key} className="rounded-lg border border-gray-100 bg-gray-50/80 px-3 py-2">
            <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">{humanizeKey(key)}</dt>
            <dd className="mt-0.5 break-words whitespace-pre-wrap font-mono text-[13px] text-gray-900">
              {href ? (
                <div className="flex flex-wrap items-center gap-2">
                  <LinkedValue href={href} onNavigate={onNavigate} className="!font-mono text-[13px]">
                    {contextLinkLabel(key, context)}
                  </LinkedValue>
                  <CopyIdButton value={String(val)} label={`Copy ${key}`} />
                </div>
              ) : typeof val === 'object' && val !== null ? (
                formatValueForDisplay(val)
              ) : (
                String(val)
              )}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

function RelatedLinksBar({
  links,
  onNavigate,
}: {
  links: RelatedLink[];
  onNavigate?: () => void;
}) {
  if (links.length === 0) return null;
  return (
    <div className="rounded-lg border border-red-100 bg-red-50/50 px-3 py-3">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-600">Open in MKHub</div>
      <div className="flex flex-wrap gap-2">
        {links.map((link) => (
          <Link
            key={link.href}
            to={link.href}
            onClick={() => onNavigate?.()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-900 shadow-sm hover:border-brand-red hover:text-brand-red"
          >
            <ExternalLink className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate max-w-[220px]">{link.label}</span>
            <span className={uiTypography.helper}>
              {link.kind === 'project' ? 'Project' : link.kind === 'user' ? 'User' : 'Record'}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}

function MetaTile({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
      <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</div>
      <div className="mt-0.5 text-sm text-gray-900">{children}</div>
    </div>
  );
}

function optionList(values: string[], allLabel = 'All') {
  return [{ value: '', label: allLabel }, ...values.map((v) => ({ value: v, label: humanizeKey(v) }))];
}

function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function daysAgoIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export default function SystemAdmin() {
  const navigate = useNavigate();
  const { data: me, isLoading: meLoading } = useQuery({
    queryKey: ['me'],
    queryFn: () => api<any>('GET', '/auth/me'),
  });
  const isSystemAdmin = (me?.roles || []).includes('admin');

  const [tab, setTab] = useState<'audit' | 'system' | 'last-login'>('audit');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [entityType, setEntityType] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [entityIdFilter, setEntityIdFilter] = useState('');
  const [actorId, setActorId] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [levelFilter, setLevelFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [requestIdFilter, setRequestIdFilter] = useState('');
  const [pathFilter, setPathFilter] = useState('');
  const [systemUserId, setSystemUserId] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [neverLoggedIn, setNeverLoggedIn] = useState(false);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [auditDetail, setAuditDetail] = useState<AuditLogEntry | null>(null);
  const [systemDetail, setSystemDetail] = useState<SystemLogEntry | null>(null);

  useEffect(() => {
    if (meLoading || !me) return;
    if (!isSystemAdmin) navigate('/home', { replace: true });
  }, [meLoading, me, isSystemAdmin, navigate]);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => window.clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setLimit(PAGE_SIZE);
  }, [
    tab,
    debouncedSearch,
    entityType,
    actionFilter,
    sourceFilter,
    entityIdFilter,
    actorId,
    dateFrom,
    dateTo,
    levelFilter,
    categoryFilter,
    requestIdFilter,
    pathFilter,
    systemUserId,
    statusFilter,
    neverLoggedIn,
  ]);

  const { data: filterOptions } = useQuery<FilterOptions>({
    queryKey: ['admin-system-filter-options'],
    queryFn: () => api<FilterOptions>('GET', '/admin/system/filter-options'),
    enabled: isSystemAdmin,
    staleTime: 60_000,
  });

  const auditParams = new URLSearchParams();
  if (entityType) auditParams.set('entity_type', entityType);
  if (actionFilter) auditParams.set('action', actionFilter);
  if (sourceFilter) auditParams.set('source', sourceFilter);
  if (entityIdFilter.trim()) auditParams.set('entity_id', entityIdFilter.trim());
  if (actorId) auditParams.set('actor_id', actorId);
  if (debouncedSearch) auditParams.set('q', debouncedSearch);
  if (dateFrom) auditParams.set('date_from', dateFrom);
  if (dateTo) auditParams.set('date_to', dateTo);
  auditParams.set('limit', String(limit));

  const systemParams = new URLSearchParams();
  if (levelFilter) systemParams.set('level', levelFilter);
  if (categoryFilter) systemParams.set('category', categoryFilter);
  if (requestIdFilter.trim()) systemParams.set('request_id', requestIdFilter.trim());
  if (pathFilter.trim()) systemParams.set('path', pathFilter.trim());
  if (systemUserId) systemParams.set('user_id', systemUserId);
  if (statusFilter) systemParams.set('status_code', statusFilter);
  if (debouncedSearch) systemParams.set('q', debouncedSearch);
  if (dateFrom) systemParams.set('date_from', dateFrom);
  if (dateTo) systemParams.set('date_to', dateTo);
  systemParams.set('limit', String(limit));

  const activityParams = new URLSearchParams();
  if (debouncedSearch) activityParams.set('q', debouncedSearch);
  if (neverLoggedIn) activityParams.set('never_logged_in', 'true');
  activityParams.set('limit', String(Math.min(limit, 500)));

  const {
    data: auditLogs,
    isLoading: auditLoading,
    isFetching: auditFetching,
    refetch: refetchAudit,
  } = useQuery<AuditLogEntry[]>({
    queryKey: ['admin-system-audit', auditParams.toString()],
    queryFn: () => api<AuditLogEntry[]>('GET', `/admin/system/audit-logs?${auditParams}`),
    enabled: isSystemAdmin && tab === 'audit',
  });

  const {
    data: systemLogs,
    isLoading: systemLoading,
    isFetching: systemFetching,
    refetch: refetchSystem,
  } = useQuery<SystemLogEntry[]>({
    queryKey: ['admin-system-logs', systemParams.toString()],
    queryFn: () => api<SystemLogEntry[]>('GET', `/admin/system/logs?${systemParams}`),
    enabled: isSystemAdmin && tab === 'system',
  });

  const {
    data: userActivity,
    isLoading: userActivityLoading,
    isFetching: activityFetching,
    refetch: refetchActivity,
  } = useQuery<UserActivityEntry[]>({
    queryKey: ['admin-system-user-activity', activityParams.toString()],
    queryFn: () => api<UserActivityEntry[]>('GET', `/admin/system/user-activity?${activityParams}`),
    enabled: isSystemAdmin && tab === 'last-login',
  });

  const entityTypeOptions = useMemo(
    () => optionList(filterOptions?.entity_types || []),
    [filterOptions?.entity_types],
  );
  const actionOptions = useMemo(() => optionList(filterOptions?.actions || []), [filterOptions?.actions]);
  const sourceOptions = useMemo(() => optionList(filterOptions?.sources || []), [filterOptions?.sources]);
  const categoryOptions = useMemo(
    () => optionList(filterOptions?.categories || []),
    [filterOptions?.categories],
  );
  const levelOptions = useMemo(
    () =>
      optionList(
        filterOptions?.levels?.length
          ? filterOptions.levels
          : ['info', 'warning', 'error'],
      ),
    [filterOptions?.levels],
  );

  const hasAuditFilters = Boolean(
    debouncedSearch || entityType || actionFilter || sourceFilter || entityIdFilter || actorId || dateFrom || dateTo,
  );
  const hasSystemFilters = Boolean(
    debouncedSearch ||
      levelFilter ||
      categoryFilter ||
      requestIdFilter ||
      pathFilter ||
      systemUserId ||
      statusFilter ||
      dateFrom ||
      dateTo,
  );
  const hasActivityFilters = Boolean(debouncedSearch || neverLoggedIn);

  const clearFilters = () => {
    setSearch('');
    setDebouncedSearch('');
    setEntityType('');
    setActionFilter('');
    setSourceFilter('');
    setEntityIdFilter('');
    setActorId('');
    setDateFrom('');
    setDateTo('');
    setLevelFilter('');
    setCategoryFilter('');
    setRequestIdFilter('');
    setPathFilter('');
    setSystemUserId('');
    setStatusFilter('');
    setNeverLoggedIn(false);
  };

  const applyQuickRange = (days: number | null) => {
    if (days == null) {
      setDateFrom('');
      setDateTo('');
      return;
    }
    setDateFrom(daysAgoIso(days));
    setDateTo(todayIso());
  };

  const refetchCurrent = () => {
    if (tab === 'audit') void refetchAudit();
    else if (tab === 'system') void refetchSystem();
    else void refetchActivity();
  };

  const isFetching = tab === 'audit' ? auditFetching : tab === 'system' ? systemFetching : activityFetching;
  const isLoading = tab === 'audit' ? auditLoading : tab === 'system' ? systemLoading : userActivityLoading;
  const rowCount =
    tab === 'audit' ? auditLogs?.length ?? 0 : tab === 'system' ? systemLogs?.length ?? 0 : userActivity?.length ?? 0;
  const canLoadMore = rowCount >= limit && limit < 500;

  if (meLoading || (me && !isSystemAdmin)) {
    return (
      <div className={uiCx('w-full min-w-0', uiSpacing.pageStack, 'min-h-full bg-gray-50')}>
        <p className={uiTypography.helper}>{meLoading ? 'Loading…' : 'Redirecting…'}</p>
      </div>
    );
  }

  return (
    <div className={uiCx('w-full min-w-0', uiSpacing.pageStack, 'min-h-full bg-gray-50')}>
      <AppPageHeader
        icon={<ScrollText className="h-4 w-4" />}
        title="Activity & logs"
        subtitle="Audit trail, application diagnostics, and sign-in activity. Times shown in Pacific (America/Vancouver)."
        actions={
          <AppButton
            type="button"
            variant="secondary"
            size="sm"
            leftIcon={<RefreshCw className={uiCx('h-4 w-4', isFetching && 'animate-spin')} />}
            onClick={refetchCurrent}
          >
            Refresh
          </AppButton>
        }
      />

      <AppTabs
        tabs={[
          { key: 'audit', label: 'Audit trail' },
          { key: 'system', label: 'System logs' },
          { key: 'last-login', label: 'Last login' },
        ]}
        value={tab}
        onChange={(key) => setTab(key as typeof tab)}
      />

      <AppCard bodyClassName={uiSpacing.cardPadding}>
        <div className={uiCx(uiLayout.actionsRow, 'flex-wrap items-stretch gap-3')}>
          <div className="min-w-0 flex-1">
            <AppInput
              placeholder={
                tab === 'audit'
                  ? 'Search actor, entity type, ID, action…'
                  : tab === 'system'
                    ? 'Search message, path, user, request ID…'
                    : 'Search name, username, or email…'
              }
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              leftIcon={<Search className="h-4 w-4" />}
              aria-label="Search logs"
            />
          </div>
          <AppButton
            type="button"
            variant="secondary"
            size="sm"
            leftIcon={<SlidersHorizontal className="h-4 w-4" />}
            onClick={() => setFiltersOpen((v) => !v)}
          >
            {filtersOpen ? 'Hide filters' : 'Filters'}
          </AppButton>
          {(tab === 'audit' ? hasAuditFilters : tab === 'system' ? hasSystemFilters : hasActivityFilters) && (
            <AppButton type="button" variant="ghost" size="sm" onClick={clearFilters}>
              Clear
            </AppButton>
          )}
        </div>

        {filtersOpen && (
          <div className="mt-4 grid grid-cols-1 gap-3 border-t border-gray-100 pt-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {(tab === 'audit' || tab === 'system') && (
              <>
                <AppDatePicker
                  label="From"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                />
                <AppDatePicker label="To" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
              </>
            )}

            {tab === 'audit' && (
              <>
                <AppSelect
                  label="Entity type"
                  options={entityTypeOptions}
                  value={entityType}
                  onChange={(e) => setEntityType(e.target.value)}
                />
                <AppSelect
                  label="Action"
                  options={actionOptions}
                  value={actionFilter}
                  onChange={(e) => setActionFilter(e.target.value)}
                />
                <AppSelect
                  label="Source"
                  options={sourceOptions}
                  value={sourceFilter}
                  onChange={(e) => setSourceFilter(e.target.value)}
                />
                <AppInput
                  label="Entity ID"
                  value={entityIdFilter}
                  onChange={(e) => setEntityIdFilter(e.target.value)}
                  placeholder="Full or partial UUID"
                />
                <div className="sm:col-span-2">
                  <AppUserSelect
                    label="Actor"
                    value={actorId}
                    onChange={setActorId}
                    placeholder="Filter by who made the change"
                  />
                </div>
              </>
            )}

            {tab === 'system' && (
              <>
                <AppSelect
                  label="Level"
                  options={levelOptions}
                  value={levelFilter}
                  onChange={(e) => setLevelFilter(e.target.value)}
                />
                <AppSelect
                  label="Category"
                  options={categoryOptions}
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                />
                <AppInput
                  label="Request ID"
                  value={requestIdFilter}
                  onChange={(e) => setRequestIdFilter(e.target.value)}
                  placeholder="Prefix or full ID"
                />
                <AppInput
                  label="Path contains"
                  value={pathFilter}
                  onChange={(e) => setPathFilter(e.target.value)}
                  placeholder="/api/…"
                />
                <AppSelect
                  label="HTTP status"
                  options={[
                    { value: '', label: 'All' },
                    { value: '200', label: '200' },
                    { value: '400', label: '400' },
                    { value: '401', label: '401' },
                    { value: '403', label: '403' },
                    { value: '404', label: '404' },
                    { value: '500', label: '500' },
                  ]}
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                />
                <div className="sm:col-span-2">
                  <AppUserSelect
                    label="User"
                    value={systemUserId}
                    onChange={setSystemUserId}
                    placeholder="Filter by user on the request"
                  />
                </div>
              </>
            )}

            {tab === 'last-login' && (
              <label className="flex items-center gap-2 text-sm text-gray-700 sm:col-span-2">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-gray-300"
                  checked={neverLoggedIn}
                  onChange={(e) => setNeverLoggedIn(e.target.checked)}
                />
                Only users who never logged in
              </label>
            )}
          </div>
        )}

        {(tab === 'audit' || tab === 'system') && (
          <AppQuickFilterRow
            label="Quick:"
            segments={[
              {
                key: 'today',
                label: 'Today',
                active: dateFrom === todayIso() && dateTo === todayIso(),
                onClick: () => {
                  setDateFrom(todayIso());
                  setDateTo(todayIso());
                },
              },
              {
                key: '7d',
                label: '7 days',
                active: dateFrom === daysAgoIso(7) && dateTo === todayIso(),
                onClick: () => applyQuickRange(7),
              },
              {
                key: '30d',
                label: '30 days',
                active: dateFrom === daysAgoIso(30) && dateTo === todayIso(),
                onClick: () => applyQuickRange(30),
              },
              ...(tab === 'audit'
                ? [
                    {
                      key: 'delete',
                      label: 'Deletes',
                      active: actionFilter === 'DELETE',
                      onClick: () => setActionFilter(actionFilter === 'DELETE' ? '' : 'DELETE'),
                    },
                    {
                      key: 'create',
                      label: 'Creates',
                      active: actionFilter === 'CREATE',
                      onClick: () => setActionFilter(actionFilter === 'CREATE' ? '' : 'CREATE'),
                    },
                  ]
                : [
                    {
                      key: 'errors',
                      label: 'Errors',
                      active: levelFilter === 'error',
                      onClick: () => setLevelFilter(levelFilter === 'error' ? '' : 'error'),
                    },
                    {
                      key: 'warnings',
                      label: 'Warnings',
                      active: levelFilter === 'warning',
                      onClick: () => setLevelFilter(levelFilter === 'warning' ? '' : 'warning'),
                    },
                    {
                      key: 'auth',
                      label: 'Auth',
                      active: categoryFilter === 'auth',
                      onClick: () => setCategoryFilter(categoryFilter === 'auth' ? '' : 'auth'),
                    },
                  ]),
            ]}
          />
        )}

        <div className={uiCx('mt-3 border-t border-gray-100 pt-3', uiTypography.helper)}>
          {isLoading ? 'Loading…' : `${rowCount} result${rowCount === 1 ? '' : 's'} shown`}
          {rowCount >= limit ? ' (increase with Load more)' : null}
        </div>
      </AppCard>

      {tab === 'audit' && (
        <AppCard className={uiShadows.card} bodyClassName="!p-0">
          {auditLoading ? (
            <div className="p-8 text-center text-gray-500">Loading audit trail…</div>
          ) : !auditLogs?.length ? (
            <AppEmptyState
              className="m-4 border-0 bg-transparent"
              icon={<ShieldAlert className="h-5 w-5" />}
              title="No audit events match"
              description="Try clearing filters or widening the date range."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[960px] text-sm">
                <thead className={uiCx(uiBorders.subtle, 'border-b bg-gray-50')}>
                  <tr className={uiTypography.overline}>
                    <th className="p-3 text-left">When</th>
                    <th className="p-3 text-left">Action</th>
                    <th className="p-3 text-left">Entity</th>
                    <th className="p-3 text-left">Actor</th>
                    <th className="p-3 text-left">Changes</th>
                    <th className="p-3 text-left">Source</th>
                  </tr>
                </thead>
                <tbody>
                  {auditLogs.map((log) => {
                    const changeCount =
                      log.change_field_count ??
                      (hasAuditChanges(log.changes_json)
                        ? Array.isArray(log.changes_json)
                          ? log.changes_json.length
                          : Object.keys(log.changes_json || {}).length
                        : 0);
                    return (
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
                        className="cursor-pointer border-b border-gray-100 transition-colors hover:bg-red-50/40"
                      >
                        <td className="p-3 align-top">
                          <TimeCell iso={log.timestamp_utc} />
                        </td>
                        <td className="p-3 align-top">
                          <AppBadge variant={actionBadgeVariant(log.action)}>{log.action}</AppBadge>
                        </td>
                        <td className="max-w-sm p-3 align-top">{formatAuditEntityCell(log)}</td>
                        <td className="max-w-xs p-3 align-top">{formatAuditActorCell(log)}</td>
                        <td className="p-3 align-top">
                          {changeCount > 0 ? (
                            <span className="font-medium text-gray-800">
                              {changeCount} field{changeCount === 1 ? '' : 's'}
                            </span>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                        <td className="p-3 align-top text-gray-600">{log.source ?? '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </AppCard>
      )}

      {tab === 'system' && (
        <AppCard className={uiShadows.card} bodyClassName="!p-0">
          {systemLoading ? (
            <div className="p-8 text-center text-gray-500">Loading system logs…</div>
          ) : !systemLogs?.length ? (
            <AppEmptyState
              className="m-4 border-0 bg-transparent"
              title="No system logs match"
              description="Try clearing filters or searching by request ID / path."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1100px] text-sm">
                <thead className={uiCx(uiBorders.subtle, 'border-b bg-gray-50')}>
                  <tr className={uiTypography.overline}>
                    <th className="p-3 text-left">When</th>
                    <th className="p-3 text-left">Level</th>
                    <th className="p-3 text-left">Category</th>
                    <th className="p-3 text-left">Message</th>
                    <th className="p-3 text-left">User</th>
                    <th className="p-3 text-left">Request</th>
                    <th className="p-3 text-left">Status</th>
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
                      className="cursor-pointer border-b border-gray-100 transition-colors hover:bg-red-50/40"
                    >
                      <td className="p-3 align-top">
                        <TimeCell iso={log.timestamp_utc} />
                      </td>
                      <td className="p-3 align-top">
                        <AppBadge variant={levelBadgeVariant(log.level)}>{log.level}</AppBadge>
                      </td>
                      <td className="p-3 align-top font-mono text-xs text-gray-700">{log.category}</td>
                      <td className="max-w-md p-3 align-top">
                        <div className="line-clamp-2 font-medium text-gray-900" title={log.detail ?? log.message}>
                          {log.message}
                        </div>
                        {log.detail ? (
                          <div className="mt-0.5 line-clamp-1 text-xs text-gray-500" title={log.detail}>
                            {log.detail}
                          </div>
                        ) : null}
                      </td>
                      <td className="max-w-xs p-3 align-top">{formatSystemUserCell(log)}</td>
                      <td className="max-w-[220px] p-3 align-top">
                        <div className="truncate font-mono text-xs text-gray-800" title={`${log.method || ''} ${log.path || ''}`}>
                          {(log.method || '—') + ' ' + (log.path || '—')}
                        </div>
                        {log.request_id ? (
                          <div className="mt-0.5" onClick={(e) => e.stopPropagation()}>
                            <CopyIdButton value={log.request_id} label="Copy request ID" />
                          </div>
                        ) : null}
                      </td>
                      <td className="p-3 align-top">
                        {log.status_code != null ? (
                          <AppBadge variant={statusBadgeVariant(log.status_code)}>{log.status_code}</AppBadge>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </AppCard>
      )}

      {tab === 'last-login' && (
        <AppCard className={uiShadows.card} bodyClassName="!p-0">
          {userActivityLoading ? (
            <div className="p-8 text-center text-gray-500">Loading sign-in activity…</div>
          ) : !userActivity?.length ? (
            <AppEmptyState
              className="m-4 border-0 bg-transparent"
              title="No users match"
              description="Try another search, or clear the never-logged-in filter."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead className={uiCx(uiBorders.subtle, 'border-b bg-gray-50')}>
                  <tr className={uiTypography.overline}>
                    <th className="p-3 text-left">User</th>
                    <th className="p-3 text-left">Email</th>
                    <th className="p-3 text-left">Last login</th>
                  </tr>
                </thead>
                <tbody>
                  {userActivity.map((u) => (
                    <tr key={u.user_id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="p-3">
                        <Link
                          to={`/users/${u.user_id}`}
                          className="font-medium text-gray-900 hover:text-brand-red hover:underline"
                        >
                          {u.full_name || u.username}
                        </Link>
                        {u.full_name ? (
                          <div className={uiTypography.helper}>{u.username}</div>
                        ) : null}
                      </td>
                      <td className="p-3 text-gray-600">{u.email ?? '—'}</td>
                      <td className="p-3 text-gray-600">
                        {u.last_login_at ? <TimeCell iso={u.last_login_at} /> : <span className="text-amber-700">Never</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </AppCard>
      )}

      {canLoadMore && (
        <div className="flex justify-center">
          <AppButton type="button" variant="secondary" onClick={() => setLimit((n) => Math.min(500, n + PAGE_SIZE))}>
            Load more
          </AppButton>
        </div>
      )}

      <AppModal
        open={!!auditDetail}
        onClose={() => setAuditDetail(null)}
        size="lg"
        title="Audit event"
        description={auditDetail ? buildAuditSummary(auditDetail) : undefined}
        footer={
          <AppButton type="button" variant="primary" onClick={() => setAuditDetail(null)}>
            Close
          </AppButton>
        }
      >
        {auditDetail && (
          <div className="space-y-5">
            <RelatedLinksBar
              links={collectRelatedLinks(auditDetail)}
              onNavigate={() => setAuditDetail(null)}
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <MetaTile label="When (Vancouver)">{formatLogTimeVancouver(auditDetail.timestamp_utc)}</MetaTile>
              <MetaTile label="Action">
                <AppBadge variant={actionBadgeVariant(auditDetail.action)}>{auditDetail.action}</AppBadge>
              </MetaTile>
              <MetaTile label="Entity">
                {formatAuditEntityCell(auditDetail, () => setAuditDetail(null))}
              </MetaTile>
              <MetaTile label="Actor">
                {formatAuditActorCell(auditDetail, () => setAuditDetail(null))}
              </MetaTile>
              <MetaTile label="Source">{auditDetail.source ?? '—'}</MetaTile>
              <MetaTile label="Event ID">
                <CopyIdButton value={auditDetail.id} label="Copy event ID" />
              </MetaTile>
            </div>
            <div>
              <h3 className={uiCx(uiTypography.sectionTitle, 'mb-2')}>Context</h3>
              <ContextSection context={auditDetail.context} onNavigate={() => setAuditDetail(null)} />
            </div>
            {hasAuditChanges(auditDetail.changes_json) && (
              <div>
                <h3 className={uiCx(uiTypography.sectionTitle, 'mb-2')}>What changed</h3>
                <ChangesSection data={auditDetail.changes_json as Record<string, unknown> | unknown[]} />
              </div>
            )}
          </div>
        )}
      </AppModal>

      <AppModal
        open={!!systemDetail}
        onClose={() => setSystemDetail(null)}
        size="lg"
        title="System log"
        description={systemDetail?.message}
        footer={
          <AppButton type="button" variant="primary" onClick={() => setSystemDetail(null)}>
            Close
          </AppButton>
        }
      >
        {systemDetail && (
          <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <MetaTile label="When (Vancouver)">{formatLogTimeVancouver(systemDetail.timestamp_utc)}</MetaTile>
              <MetaTile label="Level">
                <AppBadge variant={levelBadgeVariant(systemDetail.level)}>{systemDetail.level}</AppBadge>
              </MetaTile>
              <MetaTile label="Category">
                <span className="font-mono text-xs">{systemDetail.category}</span>
              </MetaTile>
              <MetaTile label="HTTP status">
                {systemDetail.status_code != null ? (
                  <AppBadge variant={statusBadgeVariant(systemDetail.status_code)}>
                    {systemDetail.status_code}
                  </AppBadge>
                ) : (
                  '—'
                )}
              </MetaTile>
              <MetaTile label="Request">
                <span className="break-all font-mono text-xs">
                  {(systemDetail.method || '—') + ' ' + (systemDetail.path || '—')}
                </span>
              </MetaTile>
              <MetaTile label="User">
                {formatSystemUserCell(systemDetail, () => setSystemDetail(null))}
              </MetaTile>
              <MetaTile label="Request ID">
                {systemDetail.request_id ? (
                  <CopyIdButton value={systemDetail.request_id} label="Copy request ID" />
                ) : (
                  '—'
                )}
              </MetaTile>
              <MetaTile label="Log ID">
                <CopyIdButton value={systemDetail.id} label="Copy log ID" />
              </MetaTile>
            </div>
            {systemDetail.detail && (
              <div>
                <h3 className={uiCx(uiTypography.sectionTitle, 'mb-2')}>Detail</h3>
                <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap break-all rounded-lg border border-amber-100 bg-amber-50 p-3 font-mono text-xs">
                  {systemDetail.detail}
                </pre>
              </div>
            )}
            {systemDetail.extra && Object.keys(systemDetail.extra).length > 0 && (
              <div>
                <h3 className={uiCx(uiTypography.sectionTitle, 'mb-2')}>Extra</h3>
                <ContextSection context={systemDetail.extra} onNavigate={() => setSystemDetail(null)} />
              </div>
            )}
          </div>
        )}
      </AppModal>
    </div>
  );
}
