import type { DocumentExportPdfProgress } from '@/components/document-editor/DocumentExportPdfOverlay';

export type DocumentExportPdfStreamHandlers = {
  onProgress?: (progress: DocumentExportPdfProgress) => void;
  signal?: AbortSignal;
};

type ReadyPayload = { token: string; filename: string };

function parseSseChunk(chunk: string): Array<{ event: string; data: string }> {
  const events: Array<{ event: string; data: string }> = [];
  const blocks = chunk.split('\n\n');
  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed || trimmed.startsWith(':')) continue;
    let event = 'message';
    const dataLines: string[] = [];
    for (const line of trimmed.split('\n')) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
    }
    if (dataLines.length) events.push({ event, data: dataLines.join('\n') });
  }
  return events;
}

function asProgress(raw: unknown): DocumentExportPdfProgress | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const phaseRaw = String(o.phase || 'working');
  const phase: DocumentExportPdfProgress['phase'] =
    phaseRaw === 'loading_images' || phaseRaw === 'building_pages' ? phaseRaw : 'working';
  const current = Number(o.current) || 0;
  const total = Number(o.total) || 0;
  const pct = Number(o.pct);
  return {
    phase,
    current,
    total,
    pct: Number.isFinite(pct) ? Math.max(0, Math.min(100, pct)) : 0,
  };
}

/**
 * POST export-pdf/stream (SSE). Resolves with download token + filename when ready.
 */
export async function streamDocumentExportPdf(
  documentId: string,
  authToken: string | null,
  handlers: DocumentExportPdfStreamHandlers = {},
): Promise<ReadyPayload> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'text/event-stream',
  };
  if (authToken) headers.Authorization = `Bearer ${authToken}`;

  const res = await fetch(`/document-creator/documents/${encodeURIComponent(documentId)}/export-pdf/stream`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ canvas_width_px: 910 }),
    signal: handlers.signal,
  });
  if (!res.ok) {
    throw new Error(res.statusText || `Export stream failed (${res.status})`);
  }
  if (!res.body) {
    throw new Error('Export stream returned no body');
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let ready: ReadyPayload | null = null;
  let streamError: string | null = null;

  while (!ready && !streamError) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split('\n\n');
    buffer = parts.pop() ?? '';
    for (const part of parts) {
      for (const evt of parseSseChunk(part + '\n\n')) {
        let payload: unknown = null;
        try {
          payload = JSON.parse(evt.data);
        } catch {
          continue;
        }
        if (evt.event === 'progress') {
          const p = asProgress(payload);
          if (p) handlers.onProgress?.(p);
        } else if (evt.event === 'ready') {
          const o = payload as Record<string, unknown>;
          const token = String(o.token || '').trim();
          const filename = String(o.filename || 'document.pdf').trim() || 'document.pdf';
          if (!token) throw new Error('Export stream missing token');
          ready = { token, filename };
        } else if (evt.event === 'error') {
          const o = payload as Record<string, unknown>;
          streamError = String(o.detail || 'PDF generation failed');
        }
      }
    }
  }

  // Flush remainder
  if (!ready && !streamError && buffer.trim()) {
    for (const evt of parseSseChunk(buffer + '\n\n')) {
      let payload: unknown = null;
      try {
        payload = JSON.parse(evt.data);
      } catch {
        continue;
      }
      if (evt.event === 'ready') {
        const o = payload as Record<string, unknown>;
        const token = String(o.token || '').trim();
        const filename = String(o.filename || 'document.pdf').trim() || 'document.pdf';
        if (token) ready = { token, filename };
      } else if (evt.event === 'error') {
        const o = payload as Record<string, unknown>;
        streamError = String(o.detail || 'PDF generation failed');
      }
    }
  }

  try {
    reader.releaseLock();
  } catch {
    /* ignore */
  }

  if (streamError) throw new Error(streamError);
  if (!ready) throw new Error('Export stream ended before the PDF was ready');
  return ready;
}

export async function fetchDocumentExportPdfResult(
  documentId: string,
  resultToken: string,
  authToken: string | null,
  signal?: AbortSignal,
): Promise<Blob> {
  const headers: Record<string, string> = {};
  if (authToken) headers.Authorization = `Bearer ${authToken}`;
  const res = await fetch(
    `/document-creator/documents/${encodeURIComponent(documentId)}/export-pdf/result/${encodeURIComponent(resultToken)}`,
    { method: 'GET', headers, signal },
  );
  if (!res.ok) throw new Error(res.statusText || `Download failed (${res.status})`);
  return res.blob();
}
