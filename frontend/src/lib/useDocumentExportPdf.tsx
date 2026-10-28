import { useCallback, useState } from 'react';
import toast from 'react-hot-toast';
import { getToken } from '@/lib/api';
import {
  fetchDocumentExportPdfResult,
  streamDocumentExportPdf,
} from '@/lib/documentExportPdfStream';
import DocumentExportPdfOverlay, {
  type DocumentExportPdfProgress,
} from '@/components/document-editor/DocumentExportPdfOverlay';

export type DocumentExportPdfMode = 'download' | 'preview';

export type DocumentExportPdfOptions = {
  filename?: string;
  mode?: DocumentExportPdfMode;
};

export type DocumentExportPdfPreview = {
  url: string;
  filename: string;
};

/**
 * Shared staff-UI export: SSE progress overlay + download or preview blob URL.
 * Backend POST /export-pdf remains for mobile/compat; web callers should use this.
 */
export function useDocumentExportPdf() {
  const [exportingId, setExportingId] = useState<string | null>(null);
  const [progress, setProgress] = useState<DocumentExportPdfProgress | null>(null);

  const exportPdf = useCallback(
    async (
      documentId: string,
      options: DocumentExportPdfOptions = {},
    ): Promise<DocumentExportPdfPreview | null> => {
      const mode = options.mode ?? 'download';
      const authToken = getToken();
      setExportingId(documentId);
      setProgress({ phase: 'working', current: 0, total: 0, pct: 0 });
      try {
        const ready = await streamDocumentExportPdf(documentId, authToken, {
          onProgress: (p) => setProgress(p),
        });
        setProgress((prev) => ({
          phase: prev?.phase === 'building_pages' ? 'building_pages' : 'working',
          current: prev?.current ?? 0,
          total: prev?.total ?? 0,
          pct: 100,
        }));
        const blob = await fetchDocumentExportPdfResult(documentId, ready.token, authToken);
        const filename =
          (options.filename || ready.filename || 'document.pdf').trim() || 'document.pdf';
        const url = URL.createObjectURL(blob);

        if (mode === 'preview') {
          toast.success('PDF ready for preview.');
          return { url, filename };
        }

        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
        toast.success('PDF downloaded.');
        return null;
      } catch (e: unknown) {
        if (e && typeof e === 'object' && 'name' in e && (e as { name?: string }).name === 'AbortError') {
          return null;
        }
        toast.error(e instanceof Error ? e.message : 'Failed to export PDF.');
        return null;
      } finally {
        setExportingId(null);
        setProgress(null);
      }
    },
    [],
  );

  const ExportOverlay = (
    <DocumentExportPdfOverlay open={!!exportingId} progress={progress} />
  );

  return {
    exportingId,
    isExporting: !!exportingId,
    progress,
    exportPdf,
    ExportOverlay,
  };
}
