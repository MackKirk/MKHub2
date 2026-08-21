import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PenLine } from 'lucide-react';
import toast from 'react-hot-toast';
import { api, getToken } from '@/lib/api';
import DocumentSignModal from '@/components/DocumentSignModal';
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

type SignatureRequestRow = {
  id: string;
  display_name: string;
  status: string;
  my_role?: string | null;
  my_role_label?: string | null;
  my_status?: string | null;
  my_signed_at?: string | null;
  requested_by_name?: string | null;
  created_at?: string | null;
  signed_at?: string | null;
  signed_file_id?: string | null;
};

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export default function DocumentsToSignPage() {
  const qc = useQueryClient();
  const [signItem, setSignItem] = useState<{ id: string; document_name: string } | null>(null);
  const [pdfPreview, setPdfPreview] = useState<{ url: string; name: string } | null>(null);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['me-document-signature-requests'],
    queryFn: () => api<SignatureRequestRow[]>('GET', '/auth/me/document-signature-requests'),
  });

  const pending = useMemo(
    () => rows.filter((r) => (r.my_status || (r.status === 'pending' ? 'ready' : r.status)) === 'ready'),
    [rows],
  );
  const signed = useMemo(
    () =>
      rows
        .filter((r) => {
          const mine = r.my_status;
          if (mine === 'signed') return true;
          if (!mine && (r.status === 'signed' || r.status === 'completed') && r.signed_file_id) return true;
          return false;
        })
        .slice(0, 20),
    [rows],
  );

  const openSignedPreview = async (row: SignatureRequestRow) => {
    try {
      const t = getToken();
      const r = await fetch(`/auth/me/document-signature-requests/${row.id}/signed-preview`, {
        headers: { Authorization: 'Bearer ' + (t || '') },
      });
      if (!r.ok) throw new Error(r.statusText || 'Failed to load signed PDF');
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      setPdfPreview({ url, name: `${row.display_name || 'Document'} (signed)` });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Could not open signed PDF');
    }
  };

  const closePdfPreview = () => {
    if (pdfPreview?.url) URL.revokeObjectURL(pdfPreview.url);
    setPdfPreview(null);
  };

  return (
    <div className={uiCx('w-full min-w-0', uiSpacing.pageStack, 'min-h-full bg-gray-50')}>
      <AppPageHeader
        title="To sign"
        subtitle="Documents sent to you from Document Builder for signature."
        icon={<PenLine className="h-4 w-4" />}
      />

      <AppCard title="Pending" subtitle="Open a document to complete your role’s Signature, Initials, and Date fields.">
        {isLoading ? (
          <AppEmptyState title="Loading…" description="Fetching signature requests." />
        ) : pending.length === 0 ? (
          <AppEmptyState title="Nothing to sign" description="When someone sends you a document, it will appear here when it is your turn." />
        ) : (
          <ul className="divide-y divide-gray-100">
            {pending.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{row.display_name || 'Document'}</p>
                  <p className={uiTypography.helper}>
                    From {row.requested_by_name || 'Someone'}
                    {row.my_role_label ? ` · ${row.my_role_label}` : ''} · {formatWhen(row.created_at)}
                  </p>
                </div>
                <AppButton
                  variant="primary"
                  onClick={() =>
                    setSignItem({ id: row.id, document_name: row.display_name || 'Document' })
                  }
                >
                  Sign
                </AppButton>
              </li>
            ))}
          </ul>
        )}
      </AppCard>

      {signed.length > 0 ? (
        <AppCard title="Recently signed" subtitle="Open the final PDF once the envelope is completed, or your turn’s confirmation.">
          <ul className="divide-y divide-gray-100">
            {signed.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{row.display_name || 'Document'}</p>
                  <p className={uiTypography.helper}>
                    {row.signed_file_id
                      ? `Completed ${formatWhen(row.signed_at)}`
                      : `You signed ${formatWhen(row.my_signed_at)} — waiting for other signers`}
                  </p>
                </div>
                {row.signed_file_id ? (
                  <AppButton variant="secondary" onClick={() => void openSignedPreview(row)}>
                    View PDF
                  </AppButton>
                ) : null}
              </li>
            ))}
          </ul>
        </AppCard>
      ) : null}

      {signItem ? (
        <DocumentSignModal
          signItem={signItem}
          onClose={() => setSignItem(null)}
          onSigned={() => {
            setSignItem(null);
            void qc.invalidateQueries({ queryKey: ['me-document-signature-requests'] });
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
