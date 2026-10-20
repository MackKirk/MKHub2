import type { Tutorial } from '../types';

export const DOCUMENTS_BUILDER_TUTORIAL_ID = 'documents.builder' as const;

/** Metadata only — section markdown lives in backend seed + admin overrides. */
export const documentsBuilderTutorial: Tutorial = {
  id: DOCUMENTS_BUILDER_TUTORIAL_ID,
  title: 'Document builder',
  summary: 'Build estimates, reports, and other documents, then export them to PDF.',
  category: { id: 'production', label: 'Production' },
  access: { kind: 'anyProjectLine', lines: ['construction', 'repairs'] },
};
