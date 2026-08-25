import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PenLine } from 'lucide-react';
import toast from 'react-hot-toast';
import { api, getToken } from '@/lib/api';
import DocumentSignModal from '@/components/DocumentSignModal';
import OnboardingSignModal from '@/components/OnboardingSignModal';
import OverlayPortal from '@/components/OverlayPortal';
import {
  AppButton,
  AppCard,
  AppEmptyState,
  AppPageHeader,
  uiCx,
  uiSpacing,
  uiTypography,
} from '@/components/ui';

type InboxItem = {
  id: string;
  source: 'onboarding' | 'document_builder';
  title: string;
  status: 'action_required' | 'waiting' | 'signed' | 'cancelled';
  available_at?: string | null;
  deadline_at?: string | null;
  is_overdue?: boolean;
  block_on_overdue?: boolean;
  is_access_blocker?: boolean;
  required?: boolean | null;
  requested_by_name?: string | null;
  my_role_label?: string | null;
  participant_status?: string | null;
  subject_label?: string | null;
  user_message?: string | null;
  signed_at?: string | null;
  signed_file_id?: string | null;
  created_at?: string | null;
};

type InboxResponse = {
  items: InboxItem[];
  sections: { action_required: number; waiting: number; completed: number };
};

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function statusLabel(item: InboxItem): string {
  if (item.status === 'action_required') {
    if (item.is_overdue) return 'Overdue — action required';
    return 'Your turn';
  }
  if (item.status === 'waiting') return 'Waiting for others';
  if (item.status === 'cancelled') return 'Cancelled';
  return 'Signed';
}

function statusBadgeClass(item: InboxItem): string {
  if (item.status === 'action_required') {
    if (item.is_access_blocker) return 'bg-red-600 text-white';
    if (item.is_overdue) return 'bg-red-100 text-red-800';
    return 'bg-amber-100 text-amber-900';
  }
  if (item.status === 'waiting') return 'bg-slate-100 text-slate-700';
  if (item.status === 'cancelled') return 'bg-gray-100 text-gray-600';
  return 'bg-green-100 text-green-800';
}

function blockingHint(item: InboxItem): string | null {
  if (item.is_access_blocker) {
    return 'Hub access is currently restricted until this is signed.';
  }
  if (item.block_on_overdue && item.is_overdue && item.status === 'action_required') {
    return 'Overdue — this document can block Hub access when enforcement is enabled.';
  }
  if (item.block_on_overdue && item.deadline_at && !item.is_overdue && item.status === 'action_required') {
    return 'Will restrict Hub access if not signed by the deadline (when enforcement is enabled).';
  }
  if (item.is_overdue && item.status === 'action_required') {
    return 'Past deadline — please sign as soon as possible.';
  }
  return null;
}

export default function PersonalSignaturesPage() {
  const qc = useQueryClient();
  const [onboardingSign, setOnboardingSign] = useState<{ id: string; document_name: string; subject_label?: string | null } | null>(null);
  const [builderSign, setBuilderSign] = useState<{ id: string; document_name: string } | null>(null);
  const [pdfPreview, setPdfPreview] = useState<{ url: string; name: string } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['me-signatures-inbox'],
    queryFn: () => api<InboxResponse>('GET', '/auth/me/signatures'),
  });

  const items = data?.items ?? [];

  const actionRequired = useMemo(() => items.filter((i) => i.status === 'action_required'), [items]);
  const waiting = useMemo(() => items.filter((i) => i.status === 'waiting'), [items]);
  const completed = useMemo(() => items.filter((i) => i.status === 'signed' || i.status === 'cancelled'), [items]);

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['me-signatures-inbox'] });
    void qc.invalidateQueries({ queryKey: ['me-signature-status'] });
    void qc.invalidateQueries({ queryKey: ['me-onboarding-status'] });
    void qc.invalidateQueries({ queryKey: ['me-document-signature-requests'] });
  };

  const openOnboardingPreview = async (item: InboxItem) => {
    try {
      const t = getToken();
      const r = await fetch(`/auth/me/onboarding/documents/${item.id}/preview`, {
        headers: { Authorization: 'Bearer ' + (t || '') },
      });
      if (!r.ok) throw new Error(r.statusText || 'Failed to load preview');
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      setPdfPreview({ url, name: item.title || 'Onboarding document' });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Could not open preview');
    }
  };

  const openBuilderPreview = async (item: InboxItem) => {
    try {
      const t = getToken();
      const r = await fetch(`/auth/me/document-signature-requests/${item.id}/preview`, {
        headers: { Authorization: 'Bearer ' + (t || '') },
      });
      if (!r.ok) throw new Error(r.statusText || 'Failed to load preview');
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      setPdfPreview({ url, name: item.title || 'Document' });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Could not open preview');
    }
  };

  const openSignedPreview = async (item: InboxItem) => {
    if (item.source !== 'document_builder' || !item.signed_file_id) return;
    try {
      const t = getToken();
      const r = await fetch(`/auth/me/document-signature-requests/${item.id}/signed-preview`, {
        headers: { Authorization: 'Bearer ' + (t || '') },
      });
      if (!r.ok) throw new Error(r.statusText || 'Failed to load signed PDF');
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      setPdfPreview({ url, name: `${item.title || 'Document'} (signed)` });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Could not open signed PDF');
    }
  };

  const closePdfPreview = () => {
    if (pdfPreview?.url) URL.revokeObjectURL(pdfPreview.url);
    setPdfPreview(null);
  };

  const renderRow = (item: InboxItem) => (
    <li key={`${item.source}-${item.id}`} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium text-gray-900 truncate">{item.title || 'Document'}</p>
          <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide ${statusBadgeClass(item)}`}>
            {statusLabel(item)}
          </span>
        </div>
        <p className={uiTypography.helper}>
          {item.source === 'onboarding' ? 'Onboarding' : 'Document Builder'}
          {item.my_role_label ? ` · ${item.my_role_label}` : ''}
          {item.requested_by_name ? ` · From ${item.requested_by_name}` : ''}
          {item.deadline_at ? ` · Due ${formatWhen(item.deadline_at)}` : ''}
        </p>
        {item.subject_label ? (
          <p className="text-[11px] text-gray-600 mt-1">Related to onboarding of {item.subject_label}</p>
        ) : null}
        {item.user_message && item.status === 'action_required' ? (
          <p className="text-xs text-gray-500 mt-1 line-clamp-2">{item.user_message}</p>
        ) : null}
        {blockingHint(item) ? (
          <p
            className={`text-xs mt-1 font-medium ${
              item.is_access_blocker ? 'text-red-700' : item.is_overdue ? 'text-red-600' : 'text-gray-500'
            }`}
          >
            {blockingHint(item)}
          </p>
        ) : null}
      </div>
      <div className="flex gap-2 shrink-0">
        {item.status === 'action_required' ? (
          <>
            <AppButton
              variant="secondary"
              onClick={() => {
                if (item.source === 'onboarding') void openOnboardingPreview(item);
                else void openBuilderPreview(item);
              }}
            >
              Preview
            </AppButton>
            <AppButton
              variant="primary"
              onClick={() => {
                if (item.source === 'onboarding') {
                  setOnboardingSign({
                    id: item.id,
                    document_name: item.title,
                    subject_label: item.subject_label,
                  });
                } else {
                  setBuilderSign({ id: item.id, document_name: item.title });
                }
              }}
            >
              Sign
            </AppButton>
          </>
        ) : null}
        {item.status === 'waiting' && item.source === 'document_builder' ? (
          <AppButton variant="secondary" onClick={() => void openBuilderPreview(item)}>
            Preview
          </AppButton>
        ) : null}
        {item.status === 'signed' && item.source === 'document_builder' && item.signed_file_id ? (
          <AppButton variant="secondary" onClick={() => void openSignedPreview(item)}>
            View PDF
          </AppButton>
        ) : null}
        {item.status === 'signed' && item.source === 'onboarding' && item.signed_file_id ? (
          <AppButton
            variant="secondary"
            onClick={async () => {
              try {
                const t = getToken();
                const r = await fetch(`/files/${item.signed_file_id}/preview`, {
                  headers: { Authorization: 'Bearer ' + (t || '') },
                });
                if (!r.ok) throw new Error(r.statusText || 'Failed to load signed PDF');
                const blob = await r.blob();
                const url = URL.createObjectURL(blob);
                setPdfPreview({ url, name: `${item.title || 'Document'} (signed)` });
              } catch (e: unknown) {
                toast.error(e instanceof Error ? e.message : 'Could not open signed PDF');
              }
            }}
          >
            View PDF
          </AppButton>
        ) : null}
      </div>
    </li>
  );

  return (
    <div className={uiCx('w-full min-w-0', uiSpacing.pageStack, 'min-h-full bg-gray-50')}>
      <AppPageHeader
        title="Signatures"
        subtitle="All documents waiting for your signature — onboarding and Document Builder."
        icon={<PenLine className="h-4 w-4" />}
      />

      <AppCard title="Action required" subtitle="Documents that need your signature now.">
        {isLoading ? (
          <AppEmptyState title="Loading…" description="Fetching your signature inbox." />
        ) : actionRequired.length === 0 ? (
          <AppEmptyState title="Nothing to sign right now" description="When a document needs your signature, it will appear here." />
        ) : (
          <ul className="divide-y divide-gray-100">{actionRequired.map(renderRow)}</ul>
        )}
      </AppCard>

      {waiting.length > 0 ? (
        <AppCard title="Waiting" subtitle="You will be notified when it is your turn.">
          <ul className="divide-y divide-gray-100">{waiting.map(renderRow)}</ul>
        </AppCard>
      ) : null}

      {completed.length > 0 ? (
        <AppCard title="Completed" subtitle="Recently signed or cancelled requests.">
          <ul className="divide-y divide-gray-100">{completed.map(renderRow)}</ul>
        </AppCard>
      ) : null}

      {onboardingSign ? (
        <OnboardingSignModal
          signItem={onboardingSign}
          onClose={() => setOnboardingSign(null)}
          onSigned={() => {
            setOnboardingSign(null);
            invalidate();
          }}
        />
      ) : null}

      {builderSign ? (
        <DocumentSignModal
          signItem={builderSign}
          onClose={() => setBuilderSign(null)}
          onSigned={() => {
            setBuilderSign(null);
            invalidate();
          }}
        />
      ) : null}

      {pdfPreview ? (
        <OverlayPortal>
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
            <div className="flex h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl">
              <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-4 py-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-gray-800">{pdfPreview.name}</div>
                </div>
                <AppButton variant="secondary" onClick={closePdfPreview}>
                  Close
                </AppButton>
              </div>
              <iframe title={pdfPreview.name} src={pdfPreview.url} className="min-h-0 flex-1 w-full" />
            </div>
          </div>
        </OverlayPortal>
      ) : null}
    </div>
  );
}
