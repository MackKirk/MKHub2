import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Clock, PenLine } from 'lucide-react';
import toast from 'react-hot-toast';
import { api, getToken } from '@/lib/api';
import { isHubAccessBlockedFromStatus } from '@/lib/profileCompleteness';
import DocumentSignModal from '@/components/DocumentSignModal';
import OnboardingSignModal from '@/components/OnboardingSignModal';
import OverlayPortal from '@/components/OverlayPortal';
import SignatureInboxCard from '@/components/personal/SignatureInboxCard';
import HubAccessRestrictedBanner from '@/components/personal/HubAccessRestrictedBanner';
import {
  sortActionRequired,
  type SignatureInboxItem,
  type SignatureInboxResponse,
} from '@/components/personal/signatureInboxUtils';
import {
  AppButton,
  AppEmptyState,
  AppPageHeader,
  uiCx,
  uiSpacing,
} from '@/components/ui';

type ActiveTab = 'pending' | 'completed';

export default function PersonalSignaturesPage() {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<ActiveTab>('pending');
  const [onboardingSign, setOnboardingSign] = useState<{
    id: string;
    document_name: string;
    subject_label?: string | null;
  } | null>(null);
  const [builderSign, setBuilderSign] = useState<{ id: string; document_name: string } | null>(null);
  const [pdfPreview, setPdfPreview] = useState<{ url: string; name: string } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['me-signatures-inbox'],
    queryFn: () => api<SignatureInboxResponse>('GET', '/auth/me/signatures'),
  });

  const { data: signatureStatus } = useQuery({
    queryKey: ['me-signature-status'],
    queryFn: () =>
      api<{
        blocked?: boolean;
        has_pending?: boolean;
        status_available?: boolean;
      }>('GET', '/auth/me/signature-status'),
    retry: false,
  });

  const items = data?.items ?? [];
  const actionRequired = useMemo(
    () => sortActionRequired(items.filter((i) => i.status === 'action_required')),
    [items],
  );
  const waiting = useMemo(() => items.filter((i) => i.status === 'waiting'), [items]);
  const completed = useMemo(
    () => items.filter((i) => i.status === 'signed' || i.status === 'cancelled'),
    [items],
  );

  const pendingCount = actionRequired.length + waiting.length;
  const completedCount = completed.length;
  const hasAccessBlocker = actionRequired.some((i) => i.is_access_blocker);
  const hubRestricted =
    hasAccessBlocker || isHubAccessBlockedFromStatus(signatureStatus ?? undefined);

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['me-signatures-inbox'] });
    void qc.invalidateQueries({ queryKey: ['me-signature-status'] });
    void qc.invalidateQueries({ queryKey: ['me-onboarding-status'] });
    void qc.invalidateQueries({ queryKey: ['me-document-signature-requests'] });
  };

  const openOnboardingPreview = async (item: SignatureInboxItem) => {
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

  const openBuilderPreview = async (item: SignatureInboxItem) => {
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

  const openSignedPreview = async (item: SignatureInboxItem) => {
    if (item.source === 'document_builder' && item.signed_file_id) {
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
      return;
    }
    if (item.source === 'onboarding' && item.signed_file_id) {
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
    }
  };

  const closePdfPreview = () => {
    if (pdfPreview?.url) URL.revokeObjectURL(pdfPreview.url);
    setPdfPreview(null);
  };

  const handlePreview = (item: SignatureInboxItem) => {
    if (item.source === 'onboarding') void openOnboardingPreview(item);
    else void openBuilderPreview(item);
  };

  const handleSign = (item: SignatureInboxItem) => {
    if (item.source === 'onboarding') {
      setOnboardingSign({
        id: item.id,
        document_name: item.title,
        subject_label: item.subject_label,
      });
    } else {
      setBuilderSign({ id: item.id, document_name: item.title });
    }
  };

  const renderCard = (item: SignatureInboxItem, opts?: { compact?: boolean }) => (
    <SignatureInboxCard
      key={`${item.source}-${item.id}`}
      item={item}
      compact={opts?.compact}
      onPreview={
        item.status === 'action_required' || (item.status === 'waiting' && item.source === 'document_builder')
          ? () => handlePreview(item)
          : undefined
      }
      onSign={item.status === 'action_required' ? () => handleSign(item) : undefined}
      onViewPdf={
        item.status === 'signed' && item.signed_file_id ? () => void openSignedPreview(item) : undefined
      }
    />
  );

  return (
    <div className={uiCx('w-full min-w-0', uiSpacing.pageStack, 'min-h-full bg-gray-50')}>
      {hubRestricted ? <HubAccessRestrictedBanner /> : null}

      <AppPageHeader
        title={
          <span className="inline-flex flex-wrap items-center gap-2">
            <span>Signatures</span>
            {pendingCount > 0 ? (
              <span className="inline-flex rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-800">
                {pendingCount} pending
              </span>
            ) : null}
          </span>
        }
        subtitle="Review and sign documents assigned to you."
        icon={<PenLine className="h-4 w-4" />}
      />

      <div className="border-b border-gray-200">
        <div className="flex gap-6">
          <button
            type="button"
            onClick={() => setActiveTab('pending')}
            className={uiCx(
              'inline-flex items-center gap-2 border-b-2 px-1 pb-3 text-sm font-medium transition-colors',
              activeTab === 'pending'
                ? 'border-brand-red text-brand-red'
                : 'border-transparent text-gray-600 hover:text-gray-900',
            )}
          >
            Pending
            {pendingCount > 0 ? (
              <span
                className={uiCx(
                  'inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-bold',
                  activeTab === 'pending' ? 'bg-brand-red text-white' : 'bg-gray-200 text-gray-600',
                )}
              >
                {pendingCount}
              </span>
            ) : null}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('completed')}
            className={uiCx(
              'inline-flex items-center gap-2 border-b-2 px-1 pb-3 text-sm font-medium transition-colors',
              activeTab === 'completed'
                ? 'border-brand-red text-brand-red'
                : 'border-transparent text-gray-600 hover:text-gray-900',
            )}
          >
            Completed
            {completedCount > 0 ? (
              <span
                className={uiCx(
                  'inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-bold',
                  activeTab === 'completed' ? 'bg-brand-red text-white' : 'bg-gray-200 text-gray-600',
                )}
              >
                {completedCount}
              </span>
            ) : null}
          </button>
        </div>
      </div>

      {activeTab === 'pending' ? (
        <div className="space-y-6">
          <section>
            <div className="mb-4 flex items-start gap-2">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" aria-hidden />
              <div>
                <h2 className="text-base font-semibold text-gray-900">Action required</h2>
                <p className="text-sm text-gray-500">Documents that need your signature now.</p>
              </div>
            </div>
            {isLoading ? (
              <AppEmptyState title="Loading…" description="Fetching your signature inbox." />
            ) : actionRequired.length === 0 ? (
              <AppEmptyState
                title="Nothing to sign right now"
                description="When a document needs your signature, it will appear here."
              />
            ) : (
              <div className="space-y-3">{actionRequired.map((item) => renderCard(item))}</div>
            )}
          </section>

          {waiting.length > 0 ? (
            <section>
              <div className="mb-4 flex items-start gap-2">
                <Clock className="mt-0.5 h-5 w-5 shrink-0 text-gray-500" aria-hidden />
                <div>
                  <h2 className="text-base font-semibold text-gray-900">Waiting for others</h2>
                  <p className="text-sm text-gray-500">You will be notified when it is your turn.</p>
                </div>
              </div>
              <div className="space-y-3">{waiting.map((item) => renderCard(item))}</div>
            </section>
          ) : null}
        </div>
      ) : (
        <section>
          {isLoading ? (
            <AppEmptyState title="Loading…" description="Fetching your signature inbox." />
          ) : completedCount === 0 ? (
            <AppEmptyState
              title="No completed documents yet"
              description="Signed and cancelled requests will appear here."
            />
          ) : (
            <div className="space-y-3">{completed.map((item) => renderCard(item))}</div>
          )}
        </section>
      )}

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
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
            role="dialog"
            aria-modal="true"
          >
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
