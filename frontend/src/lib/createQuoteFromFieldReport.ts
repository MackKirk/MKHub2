import { api } from '@/lib/api';
import {
  buildDocumentCreatePayload,
  documentsTabPathForProject,
  type ProjectRouteMeta,
} from '@/lib/documentCreateScope';

type DocumentTypePreset = {
  id: string;
  name: string;
  category?: string | null;
};

type CreatedDocument = { id: string; title?: string };

function pickQuotationType(types: DocumentTypePreset[]): DocumentTypePreset | null {
  const exact = types.find((t) => (t.name || '').trim().toLowerCase() === 'quotation');
  if (exact) return exact;
  const scored = types
    .map((t) => {
      const name = (t.name || '').toLowerCase();
      const cat = (t.category || '').toLowerCase();
      let score = 0;
      if (name.includes('quotation') || name.includes('quote') || name.includes('cotação') || name.includes('cotacao')) {
        score += 3;
      }
      if (cat.includes('quotation') || cat.includes('quote') || cat.includes('proposal') || cat.includes('commercial')) {
        score += 1;
      }
      return { t, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored[0]?.t ?? null;
}

export type CreateQuoteFromFieldReportArgs = {
  project: ProjectRouteMeta;
  recordId: string;
  recordKind?: string | null;
  projectName?: string | null;
};

/**
 * Create a project Document Creator doc for quoting, then return the Documents-tab deep link
 * that opens the editor and prompts Insert from Field Report for this record.
 */
export async function createQuoteFromFieldReport(
  args: CreateQuoteFromFieldReportArgs
): Promise<{ documentId: string; path: string }> {
  const { project, recordId, recordKind, projectName } = args;
  const types = await api<DocumentTypePreset[]>(
    'GET',
    '/document-creator/document-types?for_picker=1'
  );
  const quotation = pickQuotationType(Array.isArray(types) ? types : []);
  const kindLabel =
    (recordKind || '').toLowerCase() === 'work_report' ? 'Work Report' : 'Site Assessment';
  const titleBase = (projectName || '').trim() || 'Project';
  const title = `Quote — ${titleBase} — ${kindLabel}`;

  const selection = quotation
    ? { kind: 'preset' as const, documentTypeId: quotation.id }
    : { kind: 'blank' as const };

  const payload = {
    ...buildDocumentCreatePayload(selection, { kind: 'project', projectId: project.id }),
    title,
  };

  const created = await api<CreatedDocument>('POST', '/document-creator/documents', payload);
  const path = documentsTabPathForProject(project, created.id, {
    rename: true,
    insertFieldReportId: recordId,
  });
  return { documentId: created.id, path };
}
