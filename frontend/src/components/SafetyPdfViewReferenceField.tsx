import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import OverlayPortal from '@/components/OverlayPortal';
import { SafetyFormPdfPreviewShell } from '@/components/safety/SafetyModalChrome';
import { SafetyFieldQuestionLabel } from '@/components/SafetyFieldQuestionLabel';
import type { SafetyFormField } from '@/types/safetyFormTemplate';

function PdfBadge({ className = '' }: { className?: string }) {
  return (
    <div
      className={`w-8 h-10 rounded-lg bg-red-500 text-white flex items-center justify-center text-[10px] font-extrabold select-none flex-shrink-0 ${className}`}
      aria-hidden
    >
      PDF
    </div>
  );
}

type Props = {
  field: SafetyFormField;
  rowBg: string;
  /** Rendered next to the title row (e.g. comment toggle). */
  trailingSlot?: ReactNode;
};

export default function SafetyPdfViewReferenceField({ field, rowBg, trailingSlot }: Props) {
  const attachments = field.settings?.referencePdfAttachments ?? [];
  const [preview, setPreview] = useState<{ url: string; name: string } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const previewUrlRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const closePreview = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    setPreview(null);
    setPreviewLoading(false);
  }, []);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = null;
      }
    };
  }, []);

  const openPreview = async (fileId: string, name: string) => {
    abortRef.current?.abort();
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    setPreview(null);
    const ac = new AbortController();
    abortRef.current = ac;
    setPreviewLoading(true);
    try {
      const r = await api<{ preview_url: string }>('GET', `/files/${encodeURIComponent(fileId)}/preview`);
      if (ac.signal.aborted) return;
      setPreview({ url: r.preview_url, name });
    } catch (e) {
      if (!ac.signal.aborted) toast.error(e instanceof Error ? e.message : 'Could not open PDF');
    } finally {
      if (!ac.signal.aborted) setPreviewLoading(false);
    }
  };

  return (
    <div className={rowBg || undefined}>
      <div className="flex flex-wrap items-start gap-2 mb-2">
        <SafetyFieldQuestionLabel
          field={field}
          className="text-sm font-medium text-gray-600 flex-1 min-w-0"
        />
        {trailingSlot ? <div className="shrink-0">{trailingSlot}</div> : null}
      </div>
      {attachments.length === 0 ? (
        <p className="text-xs text-gray-500">No reference PDFs attached for this question.</p>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
          {attachments.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => void openPreview(a.id, a.originalName)}
              className="group rounded-xl border border-gray-200 bg-white px-2 py-3 pt-2 min-h-[100px] flex flex-col items-center gap-1.5 text-left hover:border-gray-300 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-red/25"
            >
              <PdfBadge />
              <span className="text-[10px] text-gray-700 line-clamp-3 w-full text-center break-words">{a.originalName}</span>
              <span className="text-[9px] text-blue-600 group-hover:underline">View</span>
            </button>
          ))}
        </div>
      )}

      {previewLoading && !preview && (
        <OverlayPortal>
          <div className="fixed inset-0 z-[55] bg-black/40 flex items-center justify-center pointer-events-none">
            <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700 shadow-lg">
              Loading PDF…
            </div>
          </div>
        </OverlayPortal>
      )}

      {preview && (
        <SafetyFormPdfPreviewShell
          name={preview.name}
          url={preview.url}
          onClose={closePreview}
          overlayZClass="z-[55]"
        />
      )}
    </div>
  );
}
