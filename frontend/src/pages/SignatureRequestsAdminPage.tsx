import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ClipboardList, Search, SlidersHorizontal } from 'lucide-react';
import toast from 'react-hot-toast';
import FilterBuilderModal from '@/components/FilterBuilder/FilterBuilderModal';
import FilterChip from '@/components/FilterBuilder/FilterChip';
import { FilterRule, FieldConfig } from '@/components/FilterBuilder/types';
import { useConfirm } from '@/components/ConfirmProvider';
import { api } from '@/lib/api';
import { canManageSignatureRequests } from '@/lib/documentHubPermissions';
import { mapEmployeeToAppUserSelect } from '@/lib/clientUi';
import { employeesDirectoryQueryKey, fetchEmployeesDirectory } from '@/lib/employeesQuery';
import { isAdminRole } from '@/lib/projectLinePermissionKeys';
import {
  AppBadge,
  AppButton,
  AppCard,
  AppEmptyState,
  AppFormModal,
  AppInput,
  AppPageHeader,
  AppReadOnlyField,
  AppSectionHeader,
  getAppTabButtonClassName,
  sortListByAppColumn,
  uiBorders,
  uiColors,
  uiCx,
  uiLayout,
  uiRadius,
  uiShadows,
  uiSpacing,
  uiTypography,
  useLocalAppListSort,
  type AppListSortGetter,
} from '@/components/ui';

type AdminParticipant = {
  id: string;
  name: string;
  signer_user_id: string;
  role: string;
  role_label: string;
  status: string;
  available_at?: string | null;
  deadline_at?: string | null;
  signed_at?: string | null;
  is_overdue?: boolean;
  is_access_blocker?: boolean;
  subject_label?: string | null;
};

type AdminSignatureRow = {
  id: string;
  source: 'document_builder' | 'onboarding';
  display_name: string;
  status: string;
  requested_by_name?: string | null;
  created_at?: string | null;
  sent_at?: string | null;
  deadline_at?: string | null;
  signed_count: number;
  participant_count: number;
  is_overdue?: boolean;
  block_on_overdue?: boolean;
  has_access_blocker?: boolean;
  message_to_signers?: string | null;
  admin_actions_available?: boolean;
  participants?: AdminParticipant[];
};

const FILTER_PARAM_KEYS = ['overdue', 'blocks_access', 'requested_by', 'signer', 'date_from', 'date_to'] as const;

const STATUS_QUICK = [
  { key: '', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'in_progress', label: 'In progress' },
  { key: 'completed', label: 'Completed' },
  { key: 'cancelled', label: 'Cancelled' },
  { key: 'scheduled', label: 'Scheduled' },
] as const;

const SOURCE_QUICK = [
  { key: '', label: 'All sources' },
  { key: 'document_builder', label: 'Document Builder' },
  { key: 'onboarding', label: 'Onboarding' },
] as const;

type SortColumn =
  | 'display_name'
  | 'source'
  | 'status'
  | 'requested_by'
  | 'sent'
  | 'deadline'
  | 'signed'
  | 'overdue'
  | 'blocks_access'
  | 'blocking_now';

const ADMIN_SORT_GETTERS: Record<SortColumn, AppListSortGetter<AdminSignatureRow>> = {
  display_name: (r) => r.display_name,
  source: (r) => r.source,
  status: (r) => r.status,
  requested_by: (r) => r.requested_by_name,
  sent: (r) => r.sent_at || r.created_at,
  deadline: (r) => r.deadline_at,
  signed: (r) => r.signed_count,
  overdue: (r) => (r.is_overdue ? 1 : 0),
  blocks_access: (r) => (r.block_on_overdue ? 1 : 0),
  blocking_now: (r) => (r.has_access_blocker ? 1 : 0),
};

function ruleValueStr(rule: FilterRule): string {
  return typeof rule.value === 'string' ? rule.value : (Array.isArray(rule.value) ? rule.value[0] ?? '' : '');
}

function convertRulesToParams(rules: FilterRule[], existing: URLSearchParams): URLSearchParams {
  const params = new URLSearchParams(existing);
  FILTER_PARAM_KEYS.forEach((key) => params.delete(key));

  for (const rule of rules) {
    const value = ruleValueStr(rule);
    switch (rule.field) {
      case 'overdue':
        if (value === 'yes') params.set('overdue', 'true');
        else if (value === 'no') params.set('overdue', 'false');
        break;
      case 'blocks_access':
        if (value === 'yes') params.set('blocks_access', 'true');
        else if (value === 'no') params.set('blocks_access', 'false');
        break;
      case 'requested_by':
        if (value.trim()) params.set('requested_by', value.trim());
        break;
      case 'signer':
        if (value.trim()) params.set('signer', value.trim());
        break;
      case 'sent_date':
        if (rule.operator === 'is_before' && value) params.set('date_to', value);
        else if (rule.operator === 'is_after' && value) params.set('date_from', value);
        else if (rule.operator === 'is' && value) {
          params.set('date_from', value);
          params.set('date_to', value);
        } else if (rule.operator === 'is_between' && Array.isArray(rule.value)) {
          params.set('date_from', rule.value[0]);
          params.set('date_to', rule.value[1]);
        }
        break;
    }
  }

  return params;
}

function convertParamsToRules(params: URLSearchParams): FilterRule[] {
  const rules: FilterRule[] = [];
  let idCounter = 1;

  const overdue = params.get('overdue');
  if (overdue === 'true') {
    rules.push({ id: `rule-${idCounter++}`, field: 'overdue', operator: 'is', value: 'yes' });
  } else if (overdue === 'false') {
    rules.push({ id: `rule-${idCounter++}`, field: 'overdue', operator: 'is', value: 'no' });
  }

  const blocksAccess = params.get('blocks_access');
  if (blocksAccess === 'true') {
    rules.push({ id: `rule-${idCounter++}`, field: 'blocks_access', operator: 'is', value: 'yes' });
  } else if (blocksAccess === 'false') {
    rules.push({ id: `rule-${idCounter++}`, field: 'blocks_access', operator: 'is', value: 'no' });
  }

  const requestedBy = params.get('requested_by');
  if (requestedBy) {
    rules.push({ id: `rule-${idCounter++}`, field: 'requested_by', operator: 'is', value: requestedBy });
  }

  const signer = params.get('signer');
  if (signer) {
    rules.push({ id: `rule-${idCounter++}`, field: 'signer', operator: 'is', value: signer });
  }

  const dateFrom = params.get('date_from');
  const dateTo = params.get('date_to');
  if (dateFrom && dateTo) {
    if (dateFrom === dateTo) {
      rules.push({ id: `rule-${idCounter++}`, field: 'sent_date', operator: 'is', value: dateFrom });
    } else {
      rules.push({ id: `rule-${idCounter++}`, field: 'sent_date', operator: 'is_between', value: [dateFrom, dateTo] });
    }
  } else if (dateFrom) {
    rules.push({ id: `rule-${idCounter++}`, field: 'sent_date', operator: 'is_after', value: dateFrom });
  } else if (dateTo) {
    rules.push({ id: `rule-${idCounter++}`, field: 'sent_date', operator: 'is_before', value: dateTo });
  }

  return rules;
}

function buildAdminSignatureQuery(params: URLSearchParams): string {
  const out = new URLSearchParams();
  const q = params.get('q');
  if (q?.trim()) out.set('q', q.trim());
  const status = params.get('status');
  if (status) out.set('status', status);
  const source = params.get('source');
  if (source) out.set('source', source);
  for (const key of FILTER_PARAM_KEYS) {
    const value = params.get(key);
    if (value) out.set(key, value);
  }
  const qs = out.toString();
  return qs ? `?${qs}` : '';
}

function SortHeader({
  label,
  column,
  sortBy,
  sortDir,
  onSort,
  title,
  className,
}: {
  label: string;
  column: SortColumn;
  sortBy: SortColumn;
  sortDir: 'asc' | 'desc';
  onSort: (column: SortColumn) => void;
  title: string;
  className?: string;
}) {
  const indicator = sortBy === column ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '';
  return (
    <th className={className}>
      <AppButton
        type="button"
        variant="ghost"
        size="sm"
        className={uiCx('h-auto px-0 font-semibold text-gray-700 hover:text-gray-900')}
        onClick={() => onSort(column)}
        title={title}
      >
        {label}
        {indicator}
      </AppButton>
    </th>
  );
}

function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch {
    return iso;
  }
}

function sourceLabel(source: AdminSignatureRow['source']): string {
  return source === 'onboarding' ? 'Onboarding' : 'Document Builder';
}

function statusLabel(status: string): string {
  return status.replace(/_/g, ' ');
}

function statusVariant(status: string): 'neutral' | 'success' | 'warning' | 'danger' | 'info' {
  if (status === 'completed' || status === 'signed') return 'success';
  if (status === 'cancelled') return 'neutral';
  if (status === 'in_progress') return 'info';
  if (status === 'scheduled') return 'warning';
  return 'warning';
}

function getSignatureFieldLabel(fieldId: string): string {
  const labels: Record<string, string> = {
    overdue: 'Overdue',
    blocks_access: 'Blocks access',
    requested_by: 'Requested by',
    signer: 'Signer',
    sent_date: 'Sent date',
  };
  return labels[fieldId] || fieldId;
}

function getSignatureFilterValueLabel(rule: FilterRule, employees: Array<{ id?: string; user_id?: string; name?: string }>): string {
  const value = ruleValueStr(rule);
  if (rule.field === 'overdue' || rule.field === 'blocks_access') {
    return value === 'yes' ? 'Yes' : value === 'no' ? 'No' : value;
  }
  if (rule.field === 'requested_by' || rule.field === 'signer') {
    const employee = employees.find(
      (emp) => String(emp.id) === value || String(emp.user_id) === value,
    );
    return employee?.name || value;
  }
  if (rule.field === 'sent_date' && rule.operator === 'is_between' && Array.isArray(rule.value)) {
    return `${rule.value[0]} – ${rule.value[1]}`;
  }
  return value;
}

export default function SignatureRequestsAdminPage() {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryParam = searchParams.get('q') || '';
  const [q, setQ] = useState(queryParam);
  const [debouncedQ, setDebouncedQ] = useState(queryParam);
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  const [selected, setSelected] = useState<AdminSignatureRow | null>(null);
  const [busy, setBusy] = useState(false);

  const { data: me } = useQuery({
    queryKey: ['me'],
    queryFn: () => api<{ roles?: string[]; permissions?: string[] }>('GET', '/auth/me'),
  });
  const isAdmin = isAdminRole(me?.roles);
  const permSet = useMemo(() => new Set((me?.permissions || []).map(String)), [me?.permissions]);
  const canManageActions = canManageSignatureRequests(isAdmin, permSet);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQ(q), 350);
    return () => clearTimeout(timer);
  }, [q]);

  useEffect(() => {
    const params = new URLSearchParams(searchParams);
    const currentQ = params.get('q') || '';
    if (debouncedQ === currentQ) return;
    if (debouncedQ) params.set('q', debouncedQ);
    else params.delete('q');
    setSearchParams(params, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQ]);

  useEffect(() => {
    const urlQ = searchParams.get('q') || '';
    if (urlQ !== q) setQ(urlQ);
    if (urlQ !== debouncedQ) setDebouncedQ(urlQ);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const qs = useMemo(() => buildAdminSignatureQuery(searchParams), [searchParams]);
  const currentRules = useMemo(() => convertParamsToRules(searchParams), [searchParams]);
  const hasRuleFilters = currentRules.length > 0;
  const hasQuickFilters = Boolean(searchParams.get('status') || searchParams.get('source'));
  const hasActiveFilters = hasRuleFilters || hasQuickFilters;

  const { data: employees } = useQuery({
    queryKey: employeesDirectoryQueryKey({ limit: 5000 }),
    queryFn: () => fetchEmployeesDirectory({ limit: 5000 }),
    staleTime: 300_000,
  });

  const filterFields: FieldConfig[] = useMemo(
    () => [
      {
        id: 'overdue',
        label: 'Overdue',
        type: 'select',
        operators: ['is'],
        getOptions: () => [
          { value: 'yes', label: 'Yes' },
          { value: 'no', label: 'No' },
        ],
      },
      {
        id: 'blocks_access',
        label: 'Blocks access',
        type: 'select',
        operators: ['is'],
        getOptions: () => [
          { value: 'yes', label: 'Yes' },
          { value: 'no', label: 'No' },
        ],
      },
      {
        id: 'requested_by',
        label: 'Requested by',
        type: 'user',
        operators: ['is'],
        getUsers: () => (employees || []).map((emp: Record<string, unknown>) => mapEmployeeToAppUserSelect(emp)),
      },
      {
        id: 'signer',
        label: 'Signer',
        type: 'user',
        operators: ['is'],
        getUsers: () => (employees || []).map((emp: Record<string, unknown>) => mapEmployeeToAppUserSelect(emp)),
      },
      {
        id: 'sent_date',
        label: 'Sent date',
        type: 'date',
        operators: ['is', 'is_before', 'is_after', 'is_between'],
      },
    ],
    [employees],
  );

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['admin-signature-requests', qs],
    queryFn: () => api<AdminSignatureRow[]>('GET', `/admin/signature-requests${qs}`),
  });

  const { sortBy, sortDir, setSort } = useLocalAppListSort<SortColumn>('sent', 'desc');

  const sortedRows = useMemo(
    () => sortListByAppColumn(rows, sortBy, sortDir, ADMIN_SORT_GETTERS),
    [rows, sortBy, sortDir],
  );

  const selectedFromList = useMemo(
    () => (selected ? rows.find((r) => r.id === selected.id && r.source === selected.source) ?? selected : null),
    [rows, selected],
  );

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['admin-signature-requests'] });
  };

  const handleApplyFilters = (rules: FilterRule[]) => {
    const params = convertRulesToParams(rules, searchParams);
    if (q) params.set('q', q);
    setSearchParams(params, { replace: true });
    setIsFilterModalOpen(false);
  };

  const toggleStatusQuick = (status: string) => {
    const params = new URLSearchParams(searchParams);
    if (!status || params.get('status') === status) {
      params.delete('status');
    } else {
      params.set('status', status);
    }
    setSearchParams(params, { replace: true });
  };

  const toggleSourceQuick = (source: string) => {
    const params = new URLSearchParams(searchParams);
    if (!source || params.get('source') === source) {
      params.delete('source');
    } else {
      params.set('source', source);
    }
    setSearchParams(params, { replace: true });
  };

  const clearAllFilters = () => {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    setSearchParams(params, { replace: true });
  };

  const statusQuickSegments = useMemo(
    () =>
      STATUS_QUICK.map((item) => ({
        key: item.key || 'all',
        label: item.label,
        active: (searchParams.get('status') || '') === item.key,
        onClick: () => toggleStatusQuick(item.key),
      })),
    [searchParams],
  );

  const sourceQuickSegments = useMemo(
    () =>
      SOURCE_QUICK.map((item) => ({
        key: item.key || 'all-sources',
        label: item.label,
        active: (searchParams.get('source') || '') === item.key,
        onClick: () => toggleSourceQuick(item.key),
      })),
    [searchParams],
  );

  const runAdminAction = async (path: string, body?: Record<string, unknown>) => {
    if (!selectedFromList || selectedFromList.source !== 'document_builder') return;
    setBusy(true);
    try {
      await api('POST', `/document-creator/signature-requests/${selectedFromList.id}${path}`, body);
      toast.success('Updated');
      refresh();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setBusy(false);
    }
  };

  const handleExtend = async () => {
    const ok = await confirm({
      title: 'Extend deadline',
      message: 'Extend the deadline for the participant currently ready to sign by 3 days?',
      confirmText: 'Extend',
    });
    if (ok === 'confirm') await runAdminAction('/extend-deadline', { extend_days: 3 });
  };

  const handleDisableBlocking = async () => {
    const ok = await confirm({
      title: 'Disable access blocking',
      message:
        'Stop this request from blocking Hub access when overdue? Existing signatures are preserved.',
      confirmText: 'Disable blocking',
    });
    if (ok === 'confirm') await runAdminAction('/disable-blocking');
  };

  const handleCancel = async () => {
    const ok = await confirm({
      title: 'Cancel signature request',
      message:
        'Cancel this request? All signatures and PDFs already collected will be preserved. Remaining signers will not be able to sign.',
      confirmText: 'Cancel request',
    });
    if (ok === 'confirm') {
      await runAdminAction('/cancel', { reason: 'Admin cancelled' });
      setSelected(null);
    }
  };

  return (
    <div className={uiCx('w-full min-w-0 overflow-x-hidden', uiSpacing.pageStack, 'min-h-full bg-gray-50')}>
      <AppPageHeader
        title="Signature Requests"
        subtitle="Organization-wide signature envelopes — permission-filtered by source."
        icon={<ClipboardList className="h-4 w-4" />}
      />

      <AppCard bodyClassName={uiSpacing.cardPadding}>
        <div className={uiCx(uiLayout.actionsRow, 'flex-wrap items-stretch gap-3')}>
          <div className="min-w-0 flex-1">
            <AppInput
              placeholder="Search by document name, requester, or signer…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              leftIcon={<Search className="h-4 w-4" />}
              aria-label="Search signature requests"
            />
          </div>
          <AppButton
            type="button"
            variant="secondary"
            size="sm"
            leftIcon={<SlidersHorizontal className="h-4 w-4" />}
            onClick={() => setIsFilterModalOpen(true)}
          >
            Filters
          </AppButton>
          {hasActiveFilters ? (
            <AppButton type="button" variant="ghost" size="sm" onClick={clearAllFilters}>
              Clear
            </AppButton>
          ) : null}
        </div>
        <div className={uiCx('mt-3 border-t border-gray-100 pt-3', uiSpacing.sectionStack)}>
          <div className={uiCx(uiLayout.actionsRow, 'flex-wrap items-center gap-2')}>
            <span className={uiCx(uiTypography.overline, 'shrink-0')}>Status:</span>
            <div className="flex flex-wrap gap-2">
              {statusQuickSegments.map((segment) => (
                <button
                  key={segment.key}
                  type="button"
                  onClick={segment.onClick}
                  className={getAppTabButtonClassName(segment.active)}
                  aria-pressed={segment.active}
                >
                  {segment.label}
                </button>
              ))}
            </div>
          </div>
          <div className={uiCx(uiLayout.actionsRow, 'flex-wrap items-center gap-2')}>
            <span className={uiCx(uiTypography.overline, 'shrink-0')}>Source:</span>
            <div className="flex flex-wrap gap-2">
              {sourceQuickSegments.map((segment) => (
                <button
                  key={segment.key}
                  type="button"
                  onClick={segment.onClick}
                  className={getAppTabButtonClassName(segment.active)}
                  aria-pressed={segment.active}
                >
                  {segment.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </AppCard>

      {hasRuleFilters ? (
        <div className={uiCx(uiLayout.actionsRow, 'flex-wrap')}>
          {currentRules.map((rule) => (
            <FilterChip
              key={rule.id}
              rule={rule}
              getFieldLabel={getSignatureFieldLabel}
              getValueLabel={(r) => getSignatureFilterValueLabel(r, employees || [])}
              onRemove={() => {
                const updatedRules = currentRules.filter((r) => r.id !== rule.id);
                handleApplyFilters(updatedRules);
              }}
            />
          ))}
        </div>
      ) : null}

      <AppCard className={uiShadows.card} bodyClassName="!p-0">
        {isLoading ? (
          <div className={uiCx(uiSpacing.cardPadding, 'text-center')}>
            <p className={uiTypography.helper}>Loading signature requests…</p>
          </div>
        ) : sortedRows.length === 0 ? (
          <div className={uiCx(uiSpacing.cardPadding, 'pb-10')}>
            <AppEmptyState
              title="No signature requests"
              description="Try adjusting filters or check your permissions."
              className="border-0 bg-transparent p-0 shadow-none"
            />
          </div>
        ) : (
          <div className="overflow-x-auto min-w-0">
            <table className={uiCx('w-full min-w-[960px] border-collapse', uiBorders.subtle)}>
              <thead>
                <tr className={uiCx(uiColors.surfaceSubtle, 'border-b border-gray-200')}>
                  <SortHeader
                    label="Document"
                    column="display_name"
                    sortBy={sortBy}
                    sortDir={sortDir}
                    onSort={setSort}
                    title="Sort by document name"
                    className={uiCx('px-3 py-2 text-left', uiTypography.controlLabel)}
                  />
                  <SortHeader
                    label="Source"
                    column="source"
                    sortBy={sortBy}
                    sortDir={sortDir}
                    onSort={setSort}
                    title="Sort by source"
                    className={uiCx('px-3 py-2 text-left', uiTypography.controlLabel)}
                  />
                  <SortHeader
                    label="Status"
                    column="status"
                    sortBy={sortBy}
                    sortDir={sortDir}
                    onSort={setSort}
                    title="Sort by status"
                    className={uiCx('px-3 py-2 text-left', uiTypography.controlLabel)}
                  />
                  <SortHeader
                    label="Requested by"
                    column="requested_by"
                    sortBy={sortBy}
                    sortDir={sortDir}
                    onSort={setSort}
                    title="Sort by requester"
                    className={uiCx('px-3 py-2 text-left', uiTypography.controlLabel)}
                  />
                  <SortHeader
                    label="Sent"
                    column="sent"
                    sortBy={sortBy}
                    sortDir={sortDir}
                    onSort={setSort}
                    title="Sort by sent date"
                    className={uiCx('px-3 py-2 text-left', uiTypography.controlLabel)}
                  />
                  <SortHeader
                    label="Deadline"
                    column="deadline"
                    sortBy={sortBy}
                    sortDir={sortDir}
                    onSort={setSort}
                    title="Sort by deadline"
                    className={uiCx('px-3 py-2 text-left', uiTypography.controlLabel)}
                  />
                  <SortHeader
                    label="Signed"
                    column="signed"
                    sortBy={sortBy}
                    sortDir={sortDir}
                    onSort={setSort}
                    title="Sort by signed count"
                    className={uiCx('px-3 py-2 text-left', uiTypography.controlLabel)}
                  />
                  <SortHeader
                    label="Overdue"
                    column="overdue"
                    sortBy={sortBy}
                    sortDir={sortDir}
                    onSort={setSort}
                    title="Sort by overdue"
                    className={uiCx('px-3 py-2 text-left', uiTypography.controlLabel)}
                  />
                  <SortHeader
                    label="Blocks access"
                    column="blocks_access"
                    sortBy={sortBy}
                    sortDir={sortDir}
                    onSort={setSort}
                    title="Sort by blocks access setting"
                    className={uiCx('px-3 py-2 text-left', uiTypography.controlLabel)}
                  />
                  <SortHeader
                    label="Blocking now"
                    column="blocking_now"
                    sortBy={sortBy}
                    sortDir={sortDir}
                    onSort={setSort}
                    title="Sort by active blocking"
                    className={uiCx('px-3 py-2 text-left', uiTypography.controlLabel)}
                  />
                </tr>
              </thead>
              <tbody>
                {sortedRows.map((row) => {
                  const selectedRow =
                    selectedFromList?.id === row.id && selectedFromList?.source === row.source;
                  return (
                    <tr
                      key={`${row.source}-${row.id}`}
                      className={uiCx(
                        'cursor-pointer border-b border-gray-100 transition-colors last:border-b-0 hover:bg-gray-50',
                        selectedRow && 'bg-brand-red/5',
                      )}
                      onClick={() => setSelected(row)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setSelected(row);
                        }
                      }}
                    >
                      <td className="min-w-0 max-w-[220px] px-3 py-3 align-top">
                        <span className={uiCx('block truncate font-medium', uiTypography.helper, uiColors.textStrong)}>
                          {row.display_name}
                        </span>
                      </td>
                      <td className={uiCx('px-3 py-3 align-top whitespace-nowrap', uiTypography.helper)}>
                        {sourceLabel(row.source)}
                      </td>
                      <td className="px-3 py-3 align-top">
                        <AppBadge variant={statusVariant(row.status)}>{statusLabel(row.status)}</AppBadge>
                      </td>
                      <td className={uiCx('px-3 py-3 align-top', uiTypography.helper)}>
                        {row.requested_by_name || '—'}
                      </td>
                      <td className={uiCx('px-3 py-3 align-top whitespace-nowrap', uiTypography.helper)}>
                        {fmtDateTime(row.sent_at || row.created_at)}
                      </td>
                      <td className={uiCx('px-3 py-3 align-top whitespace-nowrap', uiTypography.helper)}>
                        {fmtDateTime(row.deadline_at)}
                      </td>
                      <td className={uiCx('px-3 py-3 align-top whitespace-nowrap', uiTypography.helper)}>
                        {row.signed_count}/{row.participant_count}
                      </td>
                      <td className="px-3 py-3 align-top">
                        {row.is_overdue ? (
                          <AppBadge variant="danger">Yes</AppBadge>
                        ) : (
                          <span className={uiTypography.helper}>No</span>
                        )}
                      </td>
                      <td className="px-3 py-3 align-top">
                        {row.block_on_overdue ? (
                          <AppBadge variant="warning">Yes</AppBadge>
                        ) : (
                          <span className={uiTypography.helper}>No</span>
                        )}
                      </td>
                      <td className="px-3 py-3 align-top">
                        {row.has_access_blocker ? (
                          <AppBadge variant="danger">Yes</AppBadge>
                        ) : (
                          <span className={uiTypography.helper}>No</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </AppCard>

      <FilterBuilderModal
        isOpen={isFilterModalOpen}
        onClose={() => setIsFilterModalOpen(false)}
        onApply={handleApplyFilters}
        initialRules={currentRules}
        fields={filterFields}
        getFieldData={() => null}
      />

      <AppFormModal
        open={!!selectedFromList}
        onClose={() => setSelected(null)}
        title={selectedFromList?.display_name || 'Signature request'}
        description={
          selectedFromList
            ? `${sourceLabel(selectedFromList.source)} · ${statusLabel(selectedFromList.status)}`
            : undefined
        }
        formWidth="wide"
        footer={
          selectedFromList?.source === 'document_builder' &&
          selectedFromList.admin_actions_available &&
          canManageActions ? (
            <div className={uiCx(uiLayout.actionsRow, 'w-full flex-wrap justify-end')}>
              <AppButton type="button" variant="secondary" size="sm" disabled={busy} onClick={() => void handleExtend()}>
                Extend +3 days
              </AppButton>
              {selectedFromList.block_on_overdue ? (
                <AppButton
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={busy}
                  onClick={() => void handleDisableBlocking()}
                >
                  Disable blocking
                </AppButton>
              ) : null}
              <AppButton type="button" variant="danger" size="sm" disabled={busy} onClick={() => void handleCancel()}>
                Cancel request
              </AppButton>
            </div>
          ) : (
            <div className={uiCx(uiLayout.actionsRow, 'w-full justify-end')}>
              <AppButton type="button" variant="secondary" size="sm" onClick={() => setSelected(null)}>
                Close
              </AppButton>
            </div>
          )
        }
      >
        {selectedFromList ? (
          <div className={uiSpacing.sectionStack}>
            <div className="grid gap-4 sm:grid-cols-2">
              <AppReadOnlyField label="Requested by" value={selectedFromList.requested_by_name} />
              <AppReadOnlyField
                label="Sent"
                value={fmtDateTime(selectedFromList.sent_at || selectedFromList.created_at)}
              />
              <AppReadOnlyField label="Deadline" value={fmtDateTime(selectedFromList.deadline_at)} />
              <AppReadOnlyField
                label="Progress"
                value={`${selectedFromList.signed_count}/${selectedFromList.participant_count} signed`}
              />
            </div>

            {selectedFromList.message_to_signers ? (
              <AppReadOnlyField label="Message to signers" value={selectedFromList.message_to_signers} />
            ) : null}

            <div>
              <AppSectionHeader title="Participants" className="mb-3" />
              <div className={uiSpacing.sectionStack}>
                {(selectedFromList.participants ?? []).map((p) => (
                  <div
                    key={p.id}
                    className={uiCx(uiBorders.subtle, uiRadius.card, uiSpacing.cardPadding, 'space-y-2')}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={uiCx(uiTypography.body, 'font-medium', uiColors.textStrong)}>{p.name}</span>
                      <span className={uiTypography.helper}>{p.role_label || p.role}</span>
                      <AppBadge variant="neutral">{p.status}</AppBadge>
                      {p.is_overdue ? <AppBadge variant="danger">Overdue</AppBadge> : null}
                      {p.is_access_blocker ? <AppBadge variant="danger">Blocking access</AppBadge> : null}
                    </div>
                    {p.subject_label ? (
                      <p className={uiTypography.helper}>Subject: {p.subject_label}</p>
                    ) : null}
                    <p className={uiTypography.helper}>
                      Available {fmtDateTime(p.available_at)} · Due {fmtDateTime(p.deadline_at)}
                      {p.signed_at ? ` · Signed ${fmtDateTime(p.signed_at)}` : ''}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {selectedFromList.source === 'onboarding' ? (
              <p className={uiTypography.helper}>
                Onboarding items are managed from HR Onboarding. This view is read-only.
              </p>
            ) : null}
          </div>
        ) : null}
      </AppFormModal>
    </div>
  );
}
