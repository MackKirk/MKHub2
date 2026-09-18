import { useEffect, useState, type ReactNode } from 'react';
import { getToken } from '@/lib/api';
import {
  GRID_THUMB_WIDTH_PX,
  previewPagesFromDocumentType,
  type BackgroundTemplate,
  type DocumentTypePreset,
} from '@/components/DocumentTypePicker';
import { DocumentPagePreviewThumbnails } from '@/components/DocumentPagePreviewThumbnails';

/** Same pixel frame used by DocumentTypePicker / DocumentPagePreviewThumbnails. */
export const INVITE_PREVIEW_W = GRID_THUMB_WIDTH_PX;
export const INVITE_PREVIEW_H = Math.round((GRID_THUMB_WIDTH_PX * 297) / 210);

/**
 * Fixed A4 preview frame. Both contract and PDF thumbs must render inside this
 * so Customize and Add documents always show the same size.
 */
export function InvitePickerPreviewFrame({
  checkbox,
  children,
}: {
  checkbox?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="relative w-full bg-gray-50 flex items-center justify-center py-4 px-2 min-h-[200px]">
      {checkbox}
      <div
        className="relative flex-shrink-0 overflow-hidden rounded border border-gray-200 bg-white shadow-sm box-border"
        style={{ width: INVITE_PREVIEW_W, height: INVITE_PREVIEW_H }}
      >
        {children}
      </div>
    </div>
  );
}

/** @deprecated Use InvitePickerPreviewFrame */
export const InvitePickerPreviewWell = InvitePickerPreviewFrame;

/** Document Builder type — fills the shared frame exactly. */
export function InvitePickerContractThumb({
  documentType,
  backgroundTemplates,
}: {
  documentType: DocumentTypePreset;
  backgroundTemplates: BackgroundTemplate[];
}) {
  const pages = previewPagesFromDocumentType(documentType, backgroundTemplates);
  return (
    <div className="absolute inset-0">
      <DocumentPagePreviewThumbnails
        pages={pages}
        templates={backgroundTemplates}
        maxPages={1}
        thumbWidthPx={INVITE_PREVIEW_W}
        fillWidth
      />
    </div>
  );
}

/** Onboarding Admin PDF — fills the shared frame exactly. */
export function InvitePickerPdfThumb({ docId }: { docId: string }) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let revoked = false;
    let objectUrl: string | null = null;
    const ac = new AbortController();
    setFailed(false);
    setBlobUrl(null);
    const t = getToken();
    void (async () => {
      try {
        const r = await fetch(`/onboarding/base-documents/${docId}/thumbnail?w=${INVITE_PREVIEW_W * 2}`, {
          headers: { Authorization: `Bearer ${t || ''}` },
          signal: ac.signal,
        });
        if (!r.ok) throw new Error('thumb failed');
        const blob = await r.blob();
        if (ac.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        if (!revoked) setBlobUrl(objectUrl);
      } catch {
        if (!ac.signal.aborted) setFailed(true);
      }
    })();
    return () => {
      revoked = true;
      ac.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [docId]);

  if (failed || !blobUrl) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-gray-50 text-[10px] font-semibold text-gray-400">
        PDF
      </div>
    );
  }

  return (
    <img
      src={blobUrl}
      alt=""
      className="pointer-events-none absolute inset-0 h-full w-full object-cover"
      draggable={false}
    />
  );
}
