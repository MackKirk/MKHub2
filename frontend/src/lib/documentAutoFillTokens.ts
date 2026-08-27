import type { DocumentSignerRoleDef } from '@/types/documentCreator';

export type DocumentAutoFillGroup = 'project' | 'employee';

export type DocumentAutoFillTokenDef = {
  token: string;
  label: string;
  group: DocumentAutoFillGroup;
};

export type DocumentAutoFillTokenValue = DocumentAutoFillTokenDef & {
  value: string;
};

export const DOCUMENT_AUTO_FILL_TOKENS: DocumentAutoFillTokenDef[] = [
  { token: '<Project Name>', label: 'Project name', group: 'project' },
  { token: '<Project Address>', label: 'Project address', group: 'project' },
  { token: '<Customer Name>', label: 'Customer name', group: 'project' },
  { token: '<Customer Address>', label: 'Customer address', group: 'project' },
  { token: '<Reference Code>', label: 'Project code', group: 'project' },
  { token: '<Auto Date>', label: 'Date when page is added', group: 'project' },
  { token: '<Employee Name>', label: 'Employee name', group: 'employee' },
  { token: '<Employee Address>', label: 'Employee address', group: 'employee' },
  { token: '<Employee Wage>', label: 'Employee wage', group: 'employee' },
  { token: '<Employee Hiring Date>', label: 'Employee hiring date', group: 'employee' },
];

export const DOCUMENT_AUTO_FILL_GROUP_LABEL: Record<DocumentAutoFillGroup, string> = {
  project: 'Project',
  employee: 'Employee',
};

/** CustomEvent name — InlineTextEditor listens and inserts at the caret. */
export const DOCUMENT_TEXT_INSERT_TEXT_EVENT = 'document-text-insert-text';

/** CustomEvent name — InlineTextEditor inserts an atomic signature chip at the caret. */
export const DOCUMENT_TEXT_INSERT_ATOM_EVENT = 'document-text-insert-atom';

export type DocumentTextInsertAtomDetail = {
  elementId: string;
  kind: 'signature' | 'date';
  atomWidthPx?: number;
  atomHeightPx?: number;
  assignee?: string;
  required?: boolean;
};

export function insertDocumentTextAtCaret(elementId: string, text: string) {
  window.dispatchEvent(
    new CustomEvent(DOCUMENT_TEXT_INSERT_TEXT_EVENT, { detail: { elementId, text } }),
  );
}

export function insertDocumentSignatureAtomAtCaret(
  elementId: string,
  opts?: Omit<DocumentTextInsertAtomDetail, 'elementId' | 'kind'>,
) {
  window.dispatchEvent(
    new CustomEvent(DOCUMENT_TEXT_INSERT_ATOM_EVENT, {
      detail: {
        elementId,
        kind: 'signature',
        atomWidthPx: opts?.atomWidthPx,
        atomHeightPx: opts?.atomHeightPx,
        assignee: opts?.assignee,
        required: opts?.required,
      } satisfies DocumentTextInsertAtomDetail,
    }),
  );
}

export function insertDocumentDateAtomAtCaret(
  elementId: string,
  opts?: Omit<DocumentTextInsertAtomDetail, 'elementId' | 'kind'>,
) {
  window.dispatchEvent(
    new CustomEvent(DOCUMENT_TEXT_INSERT_ATOM_EVENT, {
      detail: {
        elementId,
        kind: 'date',
        atomWidthPx: opts?.atomWidthPx,
        atomHeightPx: opts?.atomHeightPx,
        assignee: opts?.assignee,
        required: opts?.required,
      } satisfies DocumentTextInsertAtomDetail,
    }),
  );
}

/** Template layout always keeps the token. Documents insert a resolved value when present. */
export function textToInsertForToken(token: string, value: string | undefined, forceToken: boolean): string {
  if (forceToken) return token;
  const v = (value || '').trim();
  return v || token;
}

/**
 * Project docs hide Employee tokens; user (subject) docs hide Project tokens.
 * Standalone / template (neither): show both groups.
 */
export function filterAutoFillTokensForScope(
  tokens: DocumentAutoFillTokenValue[],
  opts: { projectId?: string | null; subjectUserId?: string | null },
): DocumentAutoFillTokenValue[] {
  const hasProject = Boolean(opts.projectId);
  const hasSubject = Boolean(opts.subjectUserId);
  if (hasProject && !hasSubject) {
    return tokens.filter((t) => t.group !== 'employee');
  }
  if (hasSubject && !hasProject) {
    return tokens.filter((t) => t.group !== 'project');
  }
  return tokens;
}

export function autoFillPickerDescription(opts: {
  projectId?: string | null;
  subjectUserId?: string | null;
  forceToken?: boolean;
}): string {
  if (opts.forceToken) {
    return 'Click a token to insert it at the cursor. Templates always insert the token placeholder.';
  }
  if (opts.projectId && !opts.subjectUserId) {
    return 'Click a token to insert it at the cursor. If project data is available, the filled value is inserted instead.';
  }
  if (opts.subjectUserId && !opts.projectId) {
    return 'Click a token to insert it at the cursor. If employee profile data is available, the filled value is inserted instead.';
  }
  return 'Click a token to insert it at the cursor. If project or employee data is available, the filled value is inserted instead.';
}

