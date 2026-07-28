import { useRef, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import {
  AppBadge,
  AppButton,
  AppCard,
  AppFormModal,
  AppSectionHeader,
  uiBorders,
  uiCx,
  uiLayout,
  uiRadius,
  uiSpacing,
  uiTypography,
} from '@/components/ui';
import {
  MAINTENANCE_FREQUENCY_LABELS,
  PROVIDER_TYPE_LABELS,
  WARRANTY_STATUS_LABELS,
  WARRANTY_TYPE_LABELS,
  warrantyStatusBadgeVariant,
} from '@/lib/warrantyLabels';
import type { WarrantyEditSource } from '@/components/warranties/WarrantyFormModal';

type WarrantyDocument = {
  id: string;
  original_name?: string;
  uploaded_at?: string;
  size_bytes?: number;
};

type WarrantyDetail = WarrantyEditSource & {
  coverage_description?: string | null;
  provider_name?: string | null;
  notes?: string | null;
};

type Props = {
  open: boolean;
  onClose: () => void;
  projectId: string;
  warrantyId: string | null;
  canWrite: boolean;
  onEdit: (warranty: WarrantyEditSource) => void;
  onRegisterClaim: (warrantyId: string) => void;
  onNavigateFiles?: () => void;
  onChanged?: () => void;
};

function WarrantyDetailField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-1 border-b border-gray-100 py-3 last:border-0 sm:grid-cols-[9.5rem_minmax(0,1fr)] sm:items-start sm:gap-x-4 sm:py-2.5">
      <dt className={uiTypography.helper}>{label}</dt>
      <dd className={uiCx(uiTypography.body, 'min-w-0 break-words font-medium text-gray-900')}>{children}</dd>
    </div>
  );
}

function formatDate(s?: string | null) {
  if (!s) return '—';
  try {
    return new Date(s).toLocaleDateString(undefined, { dateStyle: 'medium' });
  } catch {
    return '—';
  }
}

export default function WarrantyDetailModal({
  open,
  onClose,
  projectId,
  warrantyId,
  canWrite,
  onEdit,
  onRegisterClaim,
  onNavigateFiles,
  onChanged,
}: Props) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const detailQ = useQuery({
    queryKey: ['projectWarranty', projectId, warrantyId],
    queryFn: () => api<WarrantyDetail>('GET', `/projects/${projectId}/warranties/${warrantyId}`),
    enabled: open && Boolean(warrantyId),
  });

  const documentsQ = useQuery({
    queryKey: ['projectWarrantyDocuments', projectId, warrantyId],
    queryFn: () =>
      api<WarrantyDocument[]>('GET', `/projects/${projectId}/warranties/${warrantyId}/documents`),
    enabled: open && Boolean(warrantyId),
  });

  const warranty = detailQ.data;
  const documents = documentsQ.data || [];

  const uploadDocument = async (file: File) => {
    if (!warrantyId) return;
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
    queryClient.invalidateQueries({ queryKey: ['projectWarrantyDocuments', projectId, warrantyId] });
    onChanged?.();
  };

  const maintenanceLabel =
    warranty?.maintenance_required && warranty.maintenance_frequency
      ? MAINTENANCE_FREQUENCY_LABELS[warranty.maintenance_frequency] || warranty.maintenance_frequency
      : null;

  return (
    <>
      <AppFormModal
        open={open}
        onClose={onClose}
        layout="detail"
        size="md"
        title={warranty?.name || 'Warranty details'}
        description="Coverage period, maintenance schedule and documents for this warranty."
        bodyClassName={uiCx(uiSpacing.cardPadding, 'min-w-0')}
        footer={
          <div className={uiCx(uiLayout.actionsRow, 'w-full justify-end')}>
            <AppButton type="button" variant="secondary" size="sm" onClick={onClose}>
              Close
            </AppButton>
            {canWrite && warranty ? (
              <>
                <AppButton
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    onRegisterClaim(warranty.id);
                    onClose();
                  }}
                >
                  Register Claim
                </AppButton>
                <AppButton
                  type="button"
                  size="sm"
                  onClick={() => {
                    onEdit(warranty);
                    onClose();
                  }}
                >
                  Edit
                </AppButton>
              </>
            ) : null}
          </div>
        }
      >
        {detailQ.isLoading ? (
          <div className="flex items-center justify-center py-12">
            <p className={uiTypography.helper}>Loading warranty…</p>
          </div>
        ) : detailQ.isError ? (
          <p className="text-sm text-red-600">{(detailQ.error as Error)?.message || 'Failed to load warranty'}</p>
        ) : warranty ? (
          <div className={uiSpacing.sectionStack}>
            <AppCard bodyClassName={uiCx(uiSpacing.cardPadding, 'min-w-0')}>
              <dl className="min-w-0">
                <WarrantyDetailField label="Type">
                  {WARRANTY_TYPE_LABELS[warranty.warranty_type] || warranty.warranty_type}
                </WarrantyDetailField>
                <WarrantyDetailField label="Status">
                  <AppBadge variant={warrantyStatusBadgeVariant(warranty.status)}>
                    {WARRANTY_STATUS_LABELS[warranty.status] || warranty.status}
                  </AppBadge>
                </WarrantyDetailField>
                <WarrantyDetailField label="Provider">
                  {warranty.provider_name || PROVIDER_TYPE_LABELS[warranty.provider_type] || warranty.provider_type}
                </WarrantyDetailField>
                <WarrantyDetailField label="Period">
                  {`${formatDate(warranty.start_date)} – ${formatDate(warranty.end_date)}`}
                </WarrantyDetailField>
                {warranty.maintenance_required ? (
                  <>
                    <WarrantyDetailField label="Maintenance frequency">{maintenanceLabel || '—'}</WarrantyDetailField>
                    <WarrantyDetailField label="Next maintenance">
                      {formatDate(warranty.next_maintenance_due_date)}
                    </WarrantyDetailField>
                  </>
                ) : null}
                {warranty.coverage_description ? (
                  <WarrantyDetailField label="Coverage">
                    <span className="whitespace-pre-wrap font-normal text-gray-700">{warranty.coverage_description}</span>
                  </WarrantyDetailField>
                ) : null}
                {warranty.notes ? (
                  <WarrantyDetailField label="Notes">
                    <span className="whitespace-pre-wrap font-normal text-gray-700">{warranty.notes}</span>
                  </WarrantyDetailField>
                ) : null}
              </dl>
            </AppCard>

            <AppCard bodyClassName={uiCx(uiSpacing.cardPadding, 'min-w-0')}>
              <AppSectionHeader
                title="Documents"
                action={
                  canWrite ? (
                    <AppButton
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      Upload Document
                    </AppButton>
                  ) : undefined
                }
              />
              {documentsQ.isLoading ? (
                <p className={uiCx(uiTypography.helper, 'mt-3')}>Loading documents…</p>
              ) : documents.length === 0 ? (
                <p className={uiCx(uiTypography.helper, 'mt-3')}>
                  No documents have been uploaded for this warranty.
                </p>
              ) : (
                <ul className={uiCx(uiBorders.subtle, uiRadius.control, 'mt-3 overflow-hidden')}>
                  {documents.map((doc) => (
                    <li
                      key={doc.id}
                      className={uiCx(
                        'flex items-center justify-between gap-2 border-b border-gray-100 px-3 py-2 last:border-b-0',
                        uiTypography.body,
                      )}
                    >
                      <span className="truncate">{doc.original_name || 'Document'}</span>
                      <span className={uiCx(uiTypography.helper, 'shrink-0')}>{formatDate(doc.uploaded_at)}</span>
                    </li>
                  ))}
                </ul>
              )}
              {onNavigateFiles ? (
                <AppButton type="button" size="sm" variant="ghost" className="mt-3" onClick={onNavigateFiles}>
                  Open in Files
                </AppButton>
              ) : null}
            </AppCard>
          </div>
        ) : null}
      </AppFormModal>

      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file) return;
          try {
            await uploadDocument(file);
          } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Upload failed');
          }
        }}
      />
    </>
  );
}
