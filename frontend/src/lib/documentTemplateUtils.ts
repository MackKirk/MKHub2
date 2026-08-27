import { api } from '@/lib/api';
import type { DocumentTypePreset } from '@/components/DocumentTypePicker';
import type { DocumentPage } from '@/types/documentCreator';

export function getTemplatePageCount(documentType: DocumentTypePreset): number {
  return (documentType.page_templates || []).length;
}

export function isMultiPageTemplate(documentType: DocumentTypePreset): boolean {
  return getTemplatePageCount(documentType) > 1;
}

export function pageLabel(documentType: DocumentTypePreset, index: number): string {
  const entry = documentType.page_templates?.[index];
  const custom = (entry?.label || '').trim();
  if (custom) return custom;
  return `Page ${index + 1}`;
}

export async function fetchExpandedPages(
  documentTypeId: string,
  scope?: { projectId?: string | null; subjectUserId?: string | null },
): Promise<DocumentPage[]> {
  const params = new URLSearchParams();
  if (scope?.projectId) params.set('project_id', scope.projectId);
  if (scope?.subjectUserId) params.set('subject_user_id', scope.subjectUserId);
  const qs = params.toString() ? `?${params.toString()}` : '';
  return api<DocumentPage[]>('GET', `/document-creator/document-types/${documentTypeId}/expand-pages${qs}`);
}

export function filterPagesByIndices(pages: DocumentPage[], indices: number[]): DocumentPage[] {
  return indices
    .filter((i) => i >= 0 && i < pages.length)
    .sort((a, b) => a - b)
    .map((i) => pages[i]);
}

export type TemplateSelectionModalPhase = 'grid' | 'options' | 'pages';

export function getTemplateSelectionModalCopy(
  phase: TemplateSelectionModalPhase,
  mode: 'create' | 'add',
  ctx?: { templateName?: string; pageCount?: number },
): { title: string; description: string } {
  if (phase === 'options') {
    return {
      title: 'How do you want to use this template?',
      description: ctx?.templateName
        ? `${ctx.templateName} — ${ctx.pageCount ?? 0} page(s)`
        : 'Choose whether to use all pages or pick a subset.',
    };
  }
  if (phase === 'pages') {
    return {
      title: 'Select pages',
      description: ctx?.templateName
        ? `Choose pages to include from ${ctx.templateName}.`
        : 'Select one or more pages to include.',
    };
  }
  if (mode === 'add') {
    return {
      title: 'Add page(s)',
      description: 'Add pages from a document template or a single background.',
    };
  }
  return {
    title: 'Choose layout',
    description: 'Choose a document template, background, or start blank.',
  };
}
