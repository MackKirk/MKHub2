import { useCallback, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import WarrantyClaimFormModal from '@/components/warranties/WarrantyClaimFormModal';
import WarrantyFormModal, { type WarrantyEditSource } from '@/components/warranties/WarrantyFormModal';
import {
  AppBadge,
  AppButton,
  AppCard,
  AppEmptyState,
  AppSectionHeader,
  appSectionPresetProps,
  uiCx,
  uiSpacing,
  uiTypography,
} from '@/components/ui';
import {
  CLAIM_SEVERITY_LABELS,
  CLAIM_STATUS_LABELS,
  COVERAGE_DECISION_LABELS,
  OVERALL_STATUS_LABELS,
  PROVIDER_TYPE_LABELS,
  WARRANTY_STATUS_LABELS,
  WARRANTY_TYPE_LABELS,
  claimSeverityBadgeClass,
  warrantyStatusBadgeClass,
} from '@/lib/warrantyLabels';

type WarrantySummary = {
  overall_status: string;
  active_warranties_count: number;
  pending_warranties_count: number;
  open_claims_count: number;
  next_expiration_date: string | null;
  next_expiration_warranty_id: string | null;
  next_maintenance_date: string | null;
  next_maintenance_warranty_id: string | null;
  overdue_actions_count: number;
};

type Warranty = {
  id: string;
  name: string;
  warranty_type: string;
  provider_type: string;
  provider_name?: string | null;
  status: string;
  coverage_description?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  duration_value?: number | null;
  duration_unit?: string | null;
  maintenance_required?: boolean;
  maintenance_frequency?: string | null;
  maintenance_interval_value?: number | null;
  maintenance_interval_unit?: string | null;
  next_maintenance_due_date?: string | null;
  first_maintenance_due_date?: string | null;
  last_maintenance_completed_at?: string | null;
  open_claims_count: number;
};

type WarrantyClaim = {
  id: string;
  claim_number: string;
  warranty_id?: string | null;
  reported_date: string;
  description: string;
  severity: string;
  status: string;
  coverage_decision: string;
  assigned_user_id?: string | null;
  follow_up_date?: string | null;
  labour_cost?: number | null;
  total_internal_cost?: number | null;
};

type ActivityEntry = {
  id: string;
  action: string;
  details: Record<string, unknown>;
  created_at: string | null;
  created_by_display: string | null;
  warranty_id?: string | null;
  claim_id?: string | null;
};

type Props = {
  projectId: string;
  projectDivisionIds?: string[];
  canRead: boolean;
  canWrite: boolean;
  canViewCosts: boolean;
  designSystem?: boolean;
  onNavigateFiles?: () => void;
};

function formatDate(s?: string | null) {
  if (!s) return '—';
  try {
    return new Date(s).toLocaleDateString(undefined, { dateStyle: 'medium' });
  } catch {
    return '—';
  }
}

function formatActivityMessage(entry: ActivityEntry): string {
  const d = entry.details || {};
  switch (entry.action) {
    case 'warranty_created':
      return 'Warranty created';
    case 'warranty_updated':
      return 'Warranty updated';
    case 'status_changed':
      return `Status changed from ${WARRANTY_STATUS_LABELS[String(d.old_status)] || d.old_status} to ${WARRANTY_STATUS_LABELS[String(d.new_status)] || d.new_status}`;
    case 'maintenance_completed':
      return 'Maintenance completed';
    case 'document_uploaded':
      return `Document uploaded: ${d.file_name || 'file'}`;
    case 'claim_created':
      return `Claim ${d.claim_number || ''} registered`;
    case 'claim_status_changed':
      return `Claim status changed to ${CLAIM_STATUS_LABELS[String(d.new_status)] || d.new_status}`;
    case 'coverage_decision_changed':
      return `Coverage decision: ${COVERAGE_DECISION_LABELS[String(d.new_decision)] || d.new_decision}`;
    case 'claim_resolved':
      return 'Claim resolved';
    case 'costs_updated':
      return 'Claim costs updated';
    default:
      return entry.action.replace(/_/g, ' ');
  }
}

export default function ProjectWarrantiesTab({
  projectId,
  canRead,
  canWrite,
  canViewCosts,
  designSystem = false,
  onNavigateFiles,
}: Props) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadWarrantyIdRef = useRef<string | null>(null);

  const [statusFilter, setStatusFilter] = useState('');
  const [claimsOpenOnly, setClaimsOpenOnly] = useState(false);
  const [selectedWarrantyId, setSelectedWarrantyId] = useState<string | null>(null);
  const [showWarrantyModal, setShowWarrantyModal] = useState(false);
  const [showClaimModal, setShowClaimModal] = useState(false);
  const [editingWarranty, setEditingWarranty] = useState<WarrantyEditSource | null>(null);
  const [claimDefaultWarrantyId, setClaimDefaultWarrantyId] = useState<string | undefined>();

  const summaryQ = useQuery({
    queryKey: ['projectWarrantySummary', projectId],
    queryFn: () => api<WarrantySummary>('GET', `/projects/${projectId}/warranties/summary`),
    enabled: canRead,
  });

  const warrantiesQ = useQuery({
    queryKey: ['projectWarranties', projectId, statusFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      const qs = params.toString();
      return api<Warranty[]>('GET', `/projects/${projectId}/warranties${qs ? `?${qs}` : ''}`);
    },
    enabled: canRead,
  });

  const claimsQ = useQuery({
    queryKey: ['projectWarrantyClaims', projectId, claimsOpenOnly],
    queryFn: () => {
      const params = new URLSearchParams();
      if (claimsOpenOnly) params.set('open_only', 'true');
      const qs = params.toString();
      return api<WarrantyClaim[]>('GET', `/projects/${projectId}/warranty-claims${qs ? `?${qs}` : ''}`);
    },
    enabled: canRead,
  });

  const activitiesQ = useQuery({
    queryKey: ['projectWarrantyActivities', projectId],
    queryFn: () => api<ActivityEntry[]>('GET', `/projects/${projectId}/warranty-activities?limit=50`),
    enabled: canRead,
  });

  const warrantyDetailQ = useQuery({
    queryKey: ['projectWarranty', projectId, selectedWarrantyId],
    queryFn: () => api<Warranty & Record<string, unknown>>('GET', `/projects/${projectId}/warranties/${selectedWarrantyId}`),
    enabled: Boolean(selectedWarrantyId),
  });

  const documentsQ = useQuery({
    queryKey: ['projectWarrantyDocuments', projectId, selectedWarrantyId],
    queryFn: () => api<{ id: string; original_name?: string; uploaded_at?: string; size_bytes?: number }[]>(
      'GET',
      `/projects/${projectId}/warranties/${selectedWarrantyId}/documents`
    ),
    enabled: Boolean(selectedWarrantyId),
  });

  const invalidateAll = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['projectWarrantySummary', projectId] });
    queryClient.invalidateQueries({ queryKey: ['projectWarranties', projectId] });
    queryClient.invalidateQueries({ queryKey: ['projectWarrantyClaims', projectId] });
    queryClient.invalidateQueries({ queryKey: ['projectWarrantyActivities', projectId] });
    if (selectedWarrantyId) {
      queryClient.invalidateQueries({ queryKey: ['projectWarranty', projectId, selectedWarrantyId] });
      queryClient.invalidateQueries({ queryKey: ['projectWarrantyDocuments', projectId, selectedWarrantyId] });
    }
  }, [queryClient, projectId, selectedWarrantyId]);

  const uploadDocument = async (file: File, warrantyId: string) => {
    const up: { upload_url: string; key: string } = await api('POST', '/files/upload', {
      project_id: projectId,
      original_name: file.name,
      content_type: file.type || 'application/octet-stream',
      category_id: 'warranty',
    });
    await fetch(up.upload_url, {
      method: 'PUT',
      headers: {
        'Content-Type': file.type || 'application/octet-stream',
        'x-ms-blob-type': 'BlockBlob',
      },
      body: file,
    });
    const conf: { id: string } = await api('POST', '/files/confirm', {
      key: up.key,
      size_bytes: file.size,
      checksum_sha256: 'na',
      content_type: file.type || 'application/octet-stream',
    });
    const params = new URLSearchParams({
      file_object_id: conf.id,
      original_name: file.name,
    });
    await api('POST', `/projects/${projectId}/warranties/${warrantyId}/documents?${params.toString()}`);
    toast.success('Document uploaded successfully. It is also available in Files > Warranty.');
    invalidateAll();
  };

  const summary = summaryQ.data;
  const warranties = warrantiesQ.data || [];
  const claims = claimsQ.data || [];
  const activities = activitiesQ.data || [];

  const openAddWarranty = () => {
    setEditingWarranty(null);
    setShowWarrantyModal(true);
  };

  const openEditWarranty = (w: Warranty) => {
    setEditingWarranty(w);
    setShowWarrantyModal(true);
  };

  const openRegisterClaim = (warrantyId?: string) => {
    setClaimDefaultWarrantyId(warrantyId);
    setShowClaimModal(true);
  };

  const closeWarrantyModal = () => {
    setShowWarrantyModal(false);
    setEditingWarranty(null);
  };

  const closeClaimModal = () => {
    setShowClaimModal(false);
    setClaimDefaultWarrantyId(undefined);
  };

  const summaryCards = useMemo(
    () => [
      {
        key: 'overall',
        label: 'Overall Status',
        value: OVERALL_STATUS_LABELS[summary?.overall_status || ''] || summary?.overall_status || '—',
        onClick: () => setStatusFilter(''),
      },
      {
        key: 'active',
        label: 'Active Warranties',
        value: String(summary?.active_warranties_count ?? 0),
        onClick: () => setStatusFilter('active'),
      },
      {
        key: 'pending',
        label: 'Pending',
        value: String(summary?.pending_warranties_count ?? 0),
        onClick: () => setStatusFilter('pending_registration'),
      },
      {
        key: 'claims',
        label: 'Open Claims',
        value: String(summary?.open_claims_count ?? 0),
        onClick: () => {
          setClaimsOpenOnly(true);
          setTimeout(() => document.getElementById('warranty-claims-section')?.scrollIntoView({ behavior: 'smooth' }), 50);
        },
      },
      {
        key: 'expiration',
        label: 'Next Expiration',
        value: formatDate(summary?.next_expiration_date),
        onClick: () => {
          if (summary?.next_expiration_warranty_id) setSelectedWarrantyId(summary.next_expiration_warranty_id);
        },
      },
      {
        key: 'maintenance',
        label: 'Next Maintenance',
        value: formatDate(summary?.next_maintenance_date),
        onClick: () => {
          if (summary?.next_maintenance_warranty_id) setSelectedWarrantyId(summary.next_maintenance_warranty_id);
        },
      },
      {
        key: 'overdue',
        label: 'Overdue Actions',
        value: String(summary?.overdue_actions_count ?? 0),
        onClick: () => setStatusFilter(''),
      },
    ],
    [summary]
  );

  if (!canRead) {
    return (
      <div className="rounded-xl border bg-white p-6 text-sm text-gray-600">
        You do not have permission to view warranties.
      </div>
    );
  }

  const sectionProps = designSystem ? appSectionPresetProps('warranties') : {};

  const content = (
    <div className={uiCx('space-y-6', uiSpacing.pageStack)}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className={uiTypography.sectionTitle}>Warranties</h2>
        {canWrite && (
          <div className="flex flex-wrap gap-2">
            <AppButton variant="primary" size="sm" onClick={openAddWarranty}>
              Add Warranty
            </AppButton>
            <AppButton variant="secondary" size="sm" onClick={() => openRegisterClaim()}>
              Register Claim
            </AppButton>
          </div>
        )}
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3 min-w-0">
        {summaryCards.map((card) => (
          <button
            key={card.key}
            type="button"
            onClick={card.onClick}
            className="rounded-lg border border-gray-200 bg-white p-3 text-left hover:border-brand-red/40 hover:bg-gray-50 transition-colors min-w-0"
          >
            <div className="text-xs text-gray-500 truncate">{card.label}</div>
            <div className="text-sm font-semibold text-gray-900 mt-1 truncate">{card.value}</div>
          </button>
        ))}
      </div>

      {/* Warranty records */}
      <AppCard>
        <AppSectionHeader title="Warranty Records" description="Coverage periods, maintenance and documents" {...sectionProps} />
        <div className="px-4 pb-2">
          <select
            className="text-sm border rounded-md px-2 py-1"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All statuses</option>
            {Object.entries(WARRANTY_STATUS_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
        {warrantiesQ.isLoading ? (
          <div className="p-8 text-center text-gray-500 text-sm">Loading…</div>
        ) : warrantiesQ.isError ? (
          <div className="p-8 text-center text-red-600 text-sm">
            {(warrantiesQ.error as Error)?.message || 'Failed to load warranties'}
          </div>
        ) : warranties.length === 0 ? (
          <AppEmptyState
            title="No warranties have been added to this project."
            description="Create a warranty to track coverage periods, required maintenance, documents and claims."
            action={canWrite ? <AppButton onClick={openAddWarranty}>Add Warranty</AppButton> : undefined}
          />
        ) : (
          <ul className="divide-y divide-gray-100 border-t">
            {warranties.map((w) => (
              <li key={w.id} className="px-4 py-3 flex flex-wrap items-center justify-between gap-3 hover:bg-gray-50">
                <button type="button" className="text-left min-w-0 flex-1" onClick={() => setSelectedWarrantyId(w.id)}>
                  <div className="font-medium text-sm text-gray-900">{w.name}</div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {WARRANTY_TYPE_LABELS[w.warranty_type] || w.warranty_type}
                    {' · '}
                    {w.provider_name || PROVIDER_TYPE_LABELS[w.provider_type] || w.provider_type}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {formatDate(w.start_date)} – {formatDate(w.end_date)}
                    {w.open_claims_count > 0 && ` · ${w.open_claims_count} open claim(s)`}
                  </div>
                </button>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${warrantyStatusBadgeClass(w.status)}`}>
                    {WARRANTY_STATUS_LABELS[w.status] || w.status}
                  </span>
                  {canWrite && (
                    <>
                      <AppButton size="sm" variant="ghost" onClick={() => setSelectedWarrantyId(w.id)}>View</AppButton>
                      <AppButton size="sm" variant="ghost" onClick={() => openEditWarranty(w)}>Edit</AppButton>
                      <AppButton size="sm" variant="ghost" onClick={() => openRegisterClaim(w.id)}>Register Claim</AppButton>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </AppCard>

      {/* Warranty detail drawer */}
      {selectedWarrantyId && warrantyDetailQ.data && (
        <AppCard>
          <AppSectionHeader
            title={warrantyDetailQ.data.name}
            description="Warranty details"
            {...sectionProps}
            action={
              <AppButton size="sm" variant="ghost" onClick={() => setSelectedWarrantyId(null)}>Close</AppButton>
            }
          />
          <div className="px-4 pb-4 space-y-4 text-sm">
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><dt className="text-gray-500">Type</dt><dd>{WARRANTY_TYPE_LABELS[warrantyDetailQ.data.warranty_type]}</dd></div>
              <div><dt className="text-gray-500">Status</dt><dd>{WARRANTY_STATUS_LABELS[warrantyDetailQ.data.status]}</dd></div>
              <div><dt className="text-gray-500">Period</dt><dd>{formatDate(warrantyDetailQ.data.start_date)} – {formatDate(warrantyDetailQ.data.end_date)}</dd></div>
              <div><dt className="text-gray-500">Next maintenance</dt><dd>{formatDate(warrantyDetailQ.data.next_maintenance_due_date)}</dd></div>
            </dl>
            {warrantyDetailQ.data.coverage_description && (
              <div><span className="text-gray-500">Coverage: </span>{warrantyDetailQ.data.coverage_description}</div>
            )}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium">Documents</span>
                {canWrite && (
                  <AppButton
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      uploadWarrantyIdRef.current = selectedWarrantyId;
                      fileInputRef.current?.click();
                    }}
                  >
                    Upload Document
                  </AppButton>
                )}
              </div>
              {(documentsQ.data || []).length === 0 ? (
                <p className="text-gray-500 text-sm">No documents have been uploaded for this warranty.</p>
              ) : (
                <ul className="divide-y border rounded-md">
                  {(documentsQ.data || []).map((doc) => (
                    <li key={doc.id} className="px-3 py-2 flex justify-between gap-2 text-sm">
                      <span className="truncate">{doc.original_name || 'Document'}</span>
                      <span className="text-gray-500 flex-shrink-0">{formatDate(doc.uploaded_at)}</span>
                    </li>
                  ))}
                </ul>
              )}
              {onNavigateFiles && (
                <AppButton size="sm" variant="ghost" className="mt-2" onClick={onNavigateFiles}>Open in Files</AppButton>
              )}
            </div>
          </div>
        </AppCard>
      )}

      {/* Claims */}
      <div id="warranty-claims-section">
      <AppCard>
        <AppSectionHeader title="Claims" description="Warranty claims for this project" {...sectionProps} />
        <div className="px-4 pb-2">
          <label className="text-sm flex items-center gap-2">
            <input type="checkbox" checked={claimsOpenOnly} onChange={(e) => setClaimsOpenOnly(e.target.checked)} />
            Open claims only
          </label>
        </div>
        {claimsQ.isLoading ? (
          <div className="p-8 text-center text-gray-500 text-sm">Loading…</div>
        ) : claimsQ.isError ? (
          <div className="p-8 text-center text-red-600 text-sm">
            {(claimsQ.error as Error)?.message || 'Failed to load claims'}
          </div>
        ) : claims.length === 0 ? (
          <AppEmptyState title="No warranty claims have been reported." />
        ) : (
          <ul className="divide-y divide-gray-100 border-t">
            {claims.map((c) => (
              <li key={c.id} className="px-4 py-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="font-medium">{c.claim_number}</span>
                    <span className={`ml-2 text-xs px-2 py-0.5 rounded-full ${claimSeverityBadgeClass(c.severity)}`}>
                      {CLAIM_SEVERITY_LABELS[c.severity]}
                    </span>
                  </div>
                  <AppBadge variant="neutral">{CLAIM_STATUS_LABELS[c.status] || c.status}</AppBadge>
                </div>
                <p className="text-gray-600 mt-1 line-clamp-2">{c.description}</p>
                <div className="text-xs text-gray-500 mt-1">
                  Reported {formatDate(c.reported_date)}
                  {' · '}
                  {COVERAGE_DECISION_LABELS[c.coverage_decision]}
                  {!c.assigned_user_id && ' · Attention required'}
                  {canViewCosts && c.total_internal_cost != null && ` · $${c.total_internal_cost.toFixed(2)}`}
                </div>
              </li>
            ))}
          </ul>
        )}
      </AppCard>
      </div>

      {/* Activity */}
      <AppCard>
        <AppSectionHeader title="Activity History" {...sectionProps} />
        {activitiesQ.isLoading ? (
          <div className="p-8 text-center text-gray-500 text-sm">Loading…</div>
        ) : activitiesQ.isError ? (
          <div className="p-8 text-center text-red-600 text-sm">
            {(activitiesQ.error as Error)?.message || 'Failed to load activity'}
          </div>
        ) : activities.length === 0 ? (
          <p className="px-4 pb-4 text-sm text-gray-500">No activity yet.</p>
        ) : (
          <ul className="px-4 pb-4 space-y-3 border-t pt-4">
            {activities.map((entry) => (
              <li key={entry.id} className="border-l-2 border-gray-200 pl-3 text-sm">
                <div className="text-xs text-gray-500">{formatDate(entry.created_at)}</div>
                <div className="text-gray-900">
                  {formatActivityMessage(entry)}
                  {entry.created_by_display && (
                    <span className="text-gray-500"> by {entry.created_by_display}</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </AppCard>

      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          const wid = uploadWarrantyIdRef.current;
          e.target.value = '';
          if (!file || !wid) return;
          try {
            await uploadDocument(file, wid);
          } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Upload failed');
          }
        }}
      />

      <WarrantyFormModal
        open={showWarrantyModal}
        onClose={closeWarrantyModal}
        projectId={projectId}
        editingWarranty={editingWarranty}
        onSuccess={invalidateAll}
      />

      <WarrantyClaimFormModal
        open={showClaimModal}
        onClose={closeClaimModal}
        projectId={projectId}
        warranties={warranties}
        defaultWarrantyId={claimDefaultWarrantyId}
        onSuccess={invalidateAll}
      />
    </div>
  );

  if (designSystem) {
    return <AppCard>{content}</AppCard>;
  }
  return <div className="rounded-xl border bg-white p-4">{content}</div>;
}
