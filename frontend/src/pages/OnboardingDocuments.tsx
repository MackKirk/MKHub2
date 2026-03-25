import { useState, useMemo, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { logoutSession } from '@/lib/logoutSession';
import { api, getToken } from '@/lib/api';
import toast from 'react-hot-toast';
import OnboardingSignModal from '@/components/OnboardingSignModal';
import OverlayPortal from '@/components/OverlayPortal';

type DocRow = {
  id: string;
  document_name: string;
  user_message?: string | null;
  status: string;
  deadline_at: string | null;
  remaining_days: number | null;
  required: boolean;
  signed_file_id: string | null;
  subject_label?: string | null;
};

const LOGO_SRC = '/ui/assets/login/logo-light.svg';

function PageShell({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b border-gray-200 shadow-sm shrink-0">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3 sm:gap-4 min-w-0">
            <div className="flex items-center gap-2 shrink-0">
              <img src={LOGO_SRC} alt="Company" className="h-14 w-auto max-w-[180px] object-contain object-left" />
            </div>
            <div className="hidden sm:block h-10 w-px bg-gray-200 shrink-0" aria-hidden />
            <div className="min-w-0">
              <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">MK Hub · HR</p>
              <h1 className="text-lg sm:text-xl font-bold text-gray-900 truncate">Documents to sign</h1>
            </div>
          </div>
          <nav className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => navigate('/profile')}
              className="px-3 py-2 text-xs font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Profile
            </button>
            <button
              type="button"
              onClick={() => navigate('/home', { replace: true })}
              className="px-3 py-2 text-xs font-medium text-white bg-gradient-to-r from-brand-red to-[#ee2b2b] rounded-lg hover:opacity-95 shadow-sm"
            >
              Home
            </button>
            <button
              type="button"
              onClick={() => logoutSession(queryClient, navigate)}
              className="px-3 py-2 text-xs font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Logout
            </button>
          </nav>
        </div>
      </header>
      <main className="flex-1 w-full max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8 pb-10">{children}</main>
    </div>
  );
}

export default function OnboardingDocuments() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: docs = [], isLoading } = useQuery({
    queryKey: ['me-onboarding-docs'],
    queryFn: () => api<DocRow[]>('GET', '/auth/me/onboarding/documents'),
  });
  const { data: status } = useQuery({
    queryKey: ['me-onboarding-status'],
    queryFn: () =>
      api<{
        has_pending: boolean;
        past_deadline: boolean;
        pending_count: number;
        earliest_deadline: string | null;
      }>('GET', '/auth/me/onboarding/status'),
  });

  const [signItem, setSignItem] = useState<DocRow | null>(null);
  const [pdfPreview, setPdfPreview] = useState<{ url: string; name: string } | null>(null);
  const [pdfPreviewLoading, setPdfPreviewLoading] = useState(false);
  const pdfPreviewUrlRef = useRef<string | null>(null);
  const pdfPreviewAbortRef = useRef<AbortController | null>(null);

  const closePdfPreview = () => {
    pdfPreviewAbortRef.current?.abort();
    pdfPreviewAbortRef.current = null;
    if (pdfPreviewUrlRef.current) {
      URL.revokeObjectURL(pdfPreviewUrlRef.current);
      pdfPreviewUrlRef.current = null;
    }
    setPdfPreview(null);
    setPdfPreviewLoading(false);
  };

  useEffect(() => {
    return () => {
      pdfPreviewAbortRef.current?.abort();
      if (pdfPreviewUrlRef.current) {
        URL.revokeObjectURL(pdfPreviewUrlRef.current);
        pdfPreviewUrlRef.current = null;
      }
    };
  }, []);

  const openPreview = async (assignmentItemId: string, documentName: string) => {
    pdfPreviewAbortRef.current?.abort();
    if (pdfPreviewUrlRef.current) {
      URL.revokeObjectURL(pdfPreviewUrlRef.current);
      pdfPreviewUrlRef.current = null;
    }
    setPdfPreview(null);
    const ac = new AbortController();
    pdfPreviewAbortRef.current = ac;
    const t = getToken();
    setPdfPreviewLoading(true);
    try {
      const r = await fetch(`/auth/me/onboarding/documents/${assignmentItemId}/preview`, {
        headers: { Authorization: `Bearer ${t || ''}` },
        signal: ac.signal,
      });
      if (ac.signal.aborted) return;
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error((err as { detail?: string }).detail || r.statusText);
      }
      const blob = await r.blob();
      if (ac.signal.aborted) return;
      const url = URL.createObjectURL(blob);
      if (pdfPreviewUrlRef.current) URL.revokeObjectURL(pdfPreviewUrlRef.current);
      pdfPreviewUrlRef.current = url;
      setPdfPreview({ url, name: documentName });
    } catch (e: unknown) {
      if ((e as { name?: string })?.name === 'AbortError') return;
      toast.error((e as Error)?.message || 'Could not load PDF');
    } finally {
      if (!ac.signal.aborted) setPdfPreviewLoading(false);
    }
  };

  const pendingRequired = docs.filter((d) => d.status === 'pending' && d.required);
  const blockedByDeadline = Boolean(status?.past_deadline && pendingRequired.length > 0);
  const canLeaveToHome = !blockedByDeadline;

  const todayLabel = useMemo(
    () =>
      new Date().toLocaleDateString('en-CA', {
        weekday: 'long',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      }),
    []
  );

  if (isLoading) {
    return (
      <PageShell>
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-10 text-center">
          <div className="inline-flex flex-col items-center gap-3">
            <img src={LOGO_SRC} alt="" className="h-12 w-auto opacity-40 object-contain" />
            <div className="text-sm text-gray-500">Loading your documents…</div>
          </div>
        </div>
      </PageShell>
    );
  }

  if (docs.length === 0) {
    return (
      <PageShell>
        <div className="space-y-4">
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold text-gray-900">Onboarding documents</h2>
                <p className="text-sm text-gray-500 mt-1">No assignments at the moment.</p>
              </div>
              <div className="text-right">
                <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Today</div>
                <div className="text-sm font-medium text-gray-800 mt-0.5">{todayLabel}</div>
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-8 sm:p-10 text-center">
            <p className="text-sm text-gray-600 mb-6 max-w-md mx-auto">
              No documents are assigned to you right now. When HR sends a document for signature, it will appear here.
            </p>
            <button
              type="button"
              onClick={() => navigate('/home', { replace: true })}
              className="px-5 py-2.5 text-sm font-medium text-white bg-gradient-to-r from-brand-red to-[#ee2b2b] rounded-lg hover:opacity-95 shadow-sm"
            >
              Continue to MK Hub
            </button>
          </div>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <div className="space-y-5">
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 max-w-xl">
              <h2 className="text-base sm:text-lg font-semibold text-gray-900">Sign onboarding documents</h2>
              <p className="text-sm text-gray-500 mt-1">
                Review each PDF and sign where indicated. Completed files are saved under{' '}
                <span className="text-gray-700 font-medium">Profile → Docs → HR Documents</span>.
              </p>
            </div>
            <div className="text-right shrink-0">
              <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Today</div>
              <div className="text-sm font-medium text-gray-800 mt-0.5">{todayLabel}</div>
            </div>
          </div>
          {status?.past_deadline && pendingRequired.length > 0 && (
            <div className="mt-4 p-4 rounded-lg bg-red-50 border border-red-200 text-red-900 text-sm">
              Your access is limited until all required documents are signed.
            </div>
          )}
        </div>

        <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden min-w-0">
          <div className="overflow-x-auto min-w-0">
            <table className="w-full min-w-0 border-collapse">
              <thead>
                <tr className="text-[10px] font-semibold text-gray-600 bg-gray-50/80 border-b border-gray-200">
                  <th className="px-4 py-3 text-left">Document</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-left">Due</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {docs.map((d) => (
                  <tr key={d.id} className="border-b border-gray-100 last:border-b-0 hover:bg-gray-50/80 transition-colors align-top">
                    <td className="px-4 py-3.5 min-w-0 max-w-md">
                      <div className="text-sm font-medium text-gray-900">{d.document_name}</div>
                      {d.subject_label && (
                        <div className="text-[11px] text-gray-600 mt-1.5 leading-snug max-w-md">
                          This document was sent to you in connection with the onboarding of{' '}
                          <span className="font-semibold text-gray-800">{d.subject_label}</span>.
                        </div>
                      )}
                      {d.user_message && d.status === 'pending' && (
                        <div className="text-xs text-gray-500 mt-1.5 line-clamp-2">{d.user_message}</div>
                      )}
                    </td>
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      {d.status === 'signed' ? (
                        <span className="inline-flex px-2.5 py-1 rounded-md text-xs font-medium bg-green-100 text-green-800">
                          Signed
                        </span>
                      ) : (
                        <span className="inline-flex px-2.5 py-1 rounded-md text-xs font-medium bg-amber-100 text-amber-900">
                          Pending{d.required ? ' · Required' : ''}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-sm text-gray-600 whitespace-nowrap">
                      {d.deadline_at ? (
                        <>
                          {new Date(d.deadline_at).toLocaleDateString()}
                          {d.remaining_days != null && <span className="text-gray-400"> · {d.remaining_days}d left</span>}
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-right whitespace-nowrap">
                      {d.status === 'pending' && (
                        <div className="flex justify-end gap-2 flex-wrap">
                          <button
                            type="button"
                            onClick={() => void openPreview(d.id, d.document_name)}
                            className="px-3 py-1.5 rounded-full text-xs font-medium text-gray-700 border border-gray-200 hover:border-gray-300 bg-white"
                          >
                            Review
                          </button>
                          <button
                            type="button"
                            onClick={() => setSignItem(d)}
                            className="px-3 py-1.5 text-xs font-medium text-white bg-gradient-to-r from-brand-red to-[#ee2b2b] rounded-lg hover:opacity-95 shadow-sm"
                          >
                            Sign
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-4 sm:p-5 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            disabled={!canLeaveToHome}
            onClick={() => navigate('/home', { replace: true })}
            className="px-4 py-2.5 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed bg-white"
          >
            {pendingRequired.length === 0
              ? 'Continue to MK Hub'
              : blockedByDeadline
                ? 'Sign required documents first'
                : 'Skip for now'}
          </button>
        </div>
      </div>

      {pdfPreviewLoading && !pdfPreview && (
        <OverlayPortal>
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60] pointer-events-none">
          <div className="rounded-lg bg-white px-4 py-3 text-sm text-gray-700 shadow-lg">Loading PDF…</div>
        </div>
        </OverlayPortal>
      )}

      {pdfPreview && (
        <OverlayPortal>
        <div
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-[60] p-4"
          onClick={closePdfPreview}
        >
          <div
            className="w-full h-full max-w-[95vw] max-h-[95vh] bg-white rounded-lg overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-3 border-b flex items-center justify-between flex-shrink-0">
              <h3 className="text-sm font-semibold truncate pr-2">{pdfPreview.name}</h3>
              <div className="flex items-center gap-2 shrink-0">
                <a
                  href={pdfPreview.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs px-2 py-1 rounded border hover:bg-gray-50"
                  title="Open in new tab"
                >
                  🔗
                </a>
                <button
                  type="button"
                  onClick={closePdfPreview}
                  className="text-lg font-bold text-gray-400 hover:text-gray-600 w-6 h-6"
                  aria-label="Close"
                >
                  ×
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-hidden min-h-0">
              <iframe
                src={pdfPreview.url}
                className="w-full h-full border-0 min-h-[70vh]"
                title={pdfPreview.name}
              />
            </div>
          </div>
        </div>
        </OverlayPortal>
      )}

      {signItem && (
        <OnboardingSignModal
          signItem={signItem}
          onClose={() => setSignItem(null)}
          onSigned={async () => {
            toast.success('Document signed');
            setSignItem(null);
            await qc.invalidateQueries({ queryKey: ['me-onboarding-docs'] });
            await qc.invalidateQueries({ queryKey: ['me-onboarding-status'] });
            await qc.invalidateQueries({ queryKey: ['user-docs'] });
            await qc.invalidateQueries({ queryKey: ['user-folders'] });
          }}
        />
      )}
    </PageShell>
  );
}
