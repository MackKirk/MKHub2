/** Free-form signer role definition stored on the document. */
export type DocumentSignerRoleDef = {
  id: string;
  label: string;
  sortOrder: number;
  fillsEmployeeTokens: boolean;
};

/** @deprecated Legacy enum keys — still accepted when loading old docs. */
export type DocumentSignerRoleLegacyKey = 'employee' | 'company' | 'other';

export const LEGACY_SIGNER_ROLE_IDS: Record<DocumentSignerRoleLegacyKey, string> = {
  employee: '00000000-0000-4000-8000-000000000001',
  company: '00000000-0000-4000-8000-000000000002',
  other: '00000000-0000-4000-8000-000000000003',
};

const SIGNER_ROLE_PALETTE = [
  { border: '#0ea5e9', bg: '#f0f9ff', text: '#0369a1' },
  { border: '#f59e0b', bg: '#fffbeb', text: '#b45309' },
  { border: '#8b5cf6', bg: '#f5f3ff', text: '#6d28d9' },
  { border: '#10b981', bg: '#ecfdf5', text: '#047857' },
  { border: '#ef4444', bg: '#fef2f2', text: '#b91c1c' },
  { border: '#6366f1', bg: '#eef2ff', text: '#4338ca' },
  { border: '#ec4899', bg: '#fdf2f8', text: '#be185d' },
  { border: '#64748b', bg: '#f8fafc', text: '#334155' },
] as const;

export function newDocumentSignerRoleId(): string {
  return crypto.randomUUID();
}

export function createDefaultSignerRoles(): DocumentSignerRoleDef[] {
  return [
    {
      id: newDocumentSignerRoleId(),
      label: 'Signer 1',
      sortOrder: 0,
      fillsEmployeeTokens: false,
    },
  ];
}

/** Next unique Other / Other1 / Other2… label for the document. */
export function nextOtherSignerLabel(roles: DocumentSignerRoleDef[]): string {
  const used = new Set(
    normalizeSignerRolesList(roles).map((r) => r.label.trim().toLowerCase()),
  );
  if (!used.has('other')) return 'Other';
  let n = 1;
  while (used.has(`other${n}`)) n += 1;
  return `Other${n}`;
}

/** Append a signer; default label Signer N. Label "Employee" sets fillsEmployeeTokens. */
export function addSigner(
  roles: DocumentSignerRoleDef[],
  label?: string | null,
): { roles: DocumentSignerRoleDef[]; signer: DocumentSignerRoleDef } {
  const base = normalizeSignerRolesList(roles);
  const nextNum = base.length + 1;
  const trimmed = (label ?? '').trim().slice(0, 120);
  const finalLabel = trimmed || `Signer ${nextNum}`;
  const signer: DocumentSignerRoleDef = {
    id: newDocumentSignerRoleId(),
    label: finalLabel,
    sortOrder: base.length,
    fillsEmployeeTokens: /^employee$/i.test(finalLabel),
  };
  // Only one fills flag
  const next = normalizeSignerRolesList([
    ...base.map((r) =>
      signer.fillsEmployeeTokens ? { ...r, fillsEmployeeTokens: false } : r,
    ),
    signer,
  ]);
  const created = next.find((r) => r.id === signer.id) ?? signer;
  return { roles: next, signer: created };
}

export function normalizeSignerRoleDef(raw: unknown, index = 0): DocumentSignerRoleDef | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const id = String(o.id ?? '').trim() || newDocumentSignerRoleId();
  const label = (String(o.label ?? '').trim() || `Signer ${index + 1}`).slice(0, 120);
  const sortOrder = Number.isFinite(Number(o.sortOrder ?? o.sort_order))
    ? Number(o.sortOrder ?? o.sort_order)
    : index;
  const fillsEmployeeTokens = Boolean(o.fillsEmployeeTokens ?? o.fills_employee_tokens);
  return { id, label, sortOrder, fillsEmployeeTokens };
}

export function normalizeSignerRolesList(raw: unknown): DocumentSignerRoleDef[] {
  if (!Array.isArray(raw) || raw.length === 0) return [];
  const seen = new Set<string>();
  const out: DocumentSignerRoleDef[] = [];
  raw.forEach((item, i) => {
    const role = normalizeSignerRoleDef(item, i);
    if (!role || seen.has(role.id)) return;
    seen.add(role.id);
    out.push(role);
  });
  let foundFills = false;
  for (const r of out) {
    if (r.fillsEmployeeTokens) {
      if (foundFills) r.fillsEmployeeTokens = false;
      else foundFills = true;
    }
  }
  out.sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label));
  out.forEach((r, i) => {
    r.sortOrder = i;
  });
  return out;
}

/** Map legacy assignee keys / UUIDs to a role id. */
export function normalizeDocumentAssigneeId(raw: unknown, roles?: DocumentSignerRoleDef[]): string {
  const a = String(raw ?? '').trim();
  if (!a) {
    return roles?.[0]?.id ?? LEGACY_SIGNER_ROLE_IDS.employee;
  }
  const low = a.toLowerCase();
  if (low === 'user') return LEGACY_SIGNER_ROLE_IDS.company;
  if (low === 'employee' || low === 'company' || low === 'other') {
    return LEGACY_SIGNER_ROLE_IDS[low];
  }
  if (roles?.some((r) => r.id === a)) return a;
  // UUID-looking or any free id
  return a;
}

export function signerRoleStyleForIndex(index: number): { border: string; bg: string; text: string } {
  return SIGNER_ROLE_PALETTE[((index % SIGNER_ROLE_PALETTE.length) + SIGNER_ROLE_PALETTE.length) % SIGNER_ROLE_PALETTE.length];
}

export function signerRoleStyle(
  roleId: unknown,
  roles: DocumentSignerRoleDef[] | null | undefined,
): { border: string; bg: string; text: string } {
  const id = normalizeDocumentAssigneeId(roleId, roles ?? undefined);
  const idx = (roles ?? []).findIndex((r) => r.id === id);
  return signerRoleStyleForIndex(idx >= 0 ? idx : 0);
}

export function signerRoleLabel(
  roleId: unknown,
  roles: DocumentSignerRoleDef[] | null | undefined,
): string {
  const id = normalizeDocumentAssigneeId(roleId, roles ?? undefined);
  const found = (roles ?? []).find((r) => r.id === id);
  if (found) return found.label;
  if (id === LEGACY_SIGNER_ROLE_IDS.employee) return 'Employee';
  if (id === LEGACY_SIGNER_ROLE_IDS.company) return 'Company';
  if (id === LEGACY_SIGNER_ROLE_IDS.other) return 'Other';
  return 'Signer';
}

export function fieldLabelWithRole(
  kind: 'Signature' | 'Date' | 'Initials',
  assignee?: unknown,
  roles?: DocumentSignerRoleDef[] | null,
): string {
  return `${kind} · ${signerRoleLabel(assignee, roles)}`;
}

/** Role ids present on pages, ordered by roles catalog sortOrder. */
export function collectPresentSignerRoleIds(
  pages: { elements?: DocElement[] }[] | null | undefined,
  roles: DocumentSignerRoleDef[],
): string[] {
  const seen = new Set<string>();
  for (const page of pages ?? []) {
    for (const el of page.elements ?? []) {
      if (el.type === 'initials' || el.type === 'date') {
        seen.add(normalizeDocumentAssigneeId(el.assignee, roles));
      }
      if (el.type === 'text' && el.richLines) {
        for (const line of el.richLines) {
          for (const run of line) {
            if (isInlineAtomRun(run)) {
              seen.add(normalizeDocumentAssigneeId(run.assignee, roles));
            }
          }
        }
      }
    }
  }
  const ordered = [...roles].sort((a, b) => a.sortOrder - b.sortOrder).filter((r) => seen.has(r.id));
  const ids = ordered.map((r) => r.id);
  for (const id of seen) {
    if (!ids.includes(id)) ids.push(id);
  }
  return ids;
}

/** Keep only signers that still have Signature / Date / Initials on the document. */
export function pruneUnusedSigners(
  roles: DocumentSignerRoleDef[],
  pages: { elements?: DocElement[] }[] | null | undefined,
): DocumentSignerRoleDef[] {
  const normalized = normalizeSignerRolesList(roles);
  const presentIds = collectPresentSignerRoleIds(pages, normalized);
  if (presentIds.length === 0) return [];
  const byId = new Map(normalized.map((r) => [r.id, r]));
  return normalizeSignerRolesList(
    presentIds.map((id, i) => {
      const existing = byId.get(id);
      if (existing) return existing;
      return {
        id,
        label: `Signer ${i + 1}`,
        sortOrder: i,
        fillsEmployeeTokens: false,
      };
    }),
  );
}

export function ensureSignerRolesForDocument(
  signerRoles: unknown,
  pages: { elements?: DocElement[] }[] | null | undefined,
): DocumentSignerRoleDef[] {
  let roles = normalizeSignerRolesList(signerRoles);
  const presentLegacy = new Set<string>();
  for (const page of pages ?? []) {
    for (const el of page.elements ?? []) {
      if (el.type === 'initials' || el.type === 'date') {
        const a = String(el.assignee ?? '').toLowerCase();
        if (a === 'user') presentLegacy.add('company');
        else if (a === 'employee' || a === 'company' || a === 'other') presentLegacy.add(a);
      }
      if (el.type === 'text' && el.richLines) {
        for (const line of el.richLines) {
          for (const run of line) {
            if (!isInlineAtomRun(run)) continue;
            const a = String(run.assignee ?? '').toLowerCase();
            if (a === 'user') presentLegacy.add('company');
            else if (a === 'employee' || a === 'company' || a === 'other') presentLegacy.add(a);
          }
        }
      }
    }
  }
  if (roles.length === 0 && presentLegacy.size > 0) {
    const keys: DocumentSignerRoleLegacyKey[] = ['employee', 'company', 'other'];
    roles = keys
      .filter((k) => presentLegacy.has(k))
      .map((k, i) => ({
        id: LEGACY_SIGNER_ROLE_IDS[k],
        label: k === 'employee' ? 'Employee' : k === 'company' ? 'Company' : 'Other',
        sortOrder: i,
        fillsEmployeeTokens: k === 'employee',
      }));
  }
  if (roles.length === 0) return [];
  return normalizeSignerRolesList(roles);
}

/** Object-replacement char: one code unit per inline signature/date atom in `content`. */
export const DOCUMENT_SIGNATURE_ATOM_CHAR = '\uFFFC';

export type RichTextRunKind = 'text' | 'signature' | 'date';

/** A single styled run of text within a line. Missing properties inherit from element-level defaults. */
export type RichTextRun = {
  /**
   * Plain text for normal runs. Signature/date atoms use DOCUMENT_SIGNATURE_ATOM_CHAR (length 1)
   * so caret/backspace offsets stay string-based.
   */
  text: string;
  /** Default `text`. Signature/date runs are atomic chips (never merge with neighbors). */
  kind?: RichTextRunKind;
  /** Stable id for signature/date atoms (UUID). */
  atomId?: string;
  /** Chip width in reference CSS px (same scale as fontSize). */
  atomWidthPx?: number;
  /** Chip height in reference CSS px. */
  atomHeightPx?: number;
  assignee?: string;
  required?: boolean;
  bold?: boolean;
  italic?: boolean;
  /** Font size in reference px (same scale as DocElement.fontSize). */
  fontSize?: number;
  color?: string;
  fontFamily?: 'Montserrat' | 'Open Sans';
};

/** Any inline overlay chip (signature or date). */
export function isInlineAtomRun(run: RichTextRun | null | undefined): boolean {
  if (!run) return false;
  if (run.kind === 'signature' || run.kind === 'date') return true;
  return run.text === DOCUMENT_SIGNATURE_ATOM_CHAR && !!run.atomId;
}

export function isSignatureAtomRun(run: RichTextRun | null | undefined): boolean {
  if (!run) return false;
  if (run.kind === 'date') return false;
  return run.kind === 'signature' || (run.text === DOCUMENT_SIGNATURE_ATOM_CHAR && !!run.atomId);
}

export function isDateAtomRun(run: RichTextRun | null | undefined): boolean {
  return !!run && run.kind === 'date';
}

export function createSignatureAtomRun(opts?: {
  atomId?: string;
  atomWidthPx?: number;
  atomHeightPx?: number;
  assignee?: string;
  required?: boolean;
}): RichTextRun {
  return {
    text: DOCUMENT_SIGNATURE_ATOM_CHAR,
    kind: 'signature',
    atomId: opts?.atomId ?? crypto.randomUUID(),
    atomWidthPx: opts?.atomWidthPx ?? 200,
    atomHeightPx: opts?.atomHeightPx ?? 48,
    assignee: normalizeDocumentAssigneeId(opts?.assignee),
    required: opts?.required ?? true,
  };
}

export function createDateAtomRun(opts?: {
  atomId?: string;
  atomWidthPx?: number;
  atomHeightPx?: number;
  assignee?: string;
  required?: boolean;
}): RichTextRun {
  return {
    text: DOCUMENT_SIGNATURE_ATOM_CHAR,
    kind: 'date',
    atomId: opts?.atomId ?? crypto.randomUUID(),
    atomWidthPx: opts?.atomWidthPx ?? 140,
    atomHeightPx: opts?.atomHeightPx ?? 32,
    assignee: normalizeDocumentAssigneeId(opts?.assignee),
    required: opts?.required ?? true,
  };
}

/** Element that can be placed on a document page (Canva-style) */
export type DocElement = {
  id: string;
  type: 'text' | 'image' | 'block' | 'initials' | 'date';
  /** For text: the text content. For image: file_id (UUID string), empty = placeholder. Ignored for block/initials/date. */
  content: string;
  x_pct: number;
  y_pct: number;
  width_pct: number;
  height_pct: number;
  /** Initials / date: who must complete the field (signer role id). */
  assignee?: string;
  /** Initials / date: whether the field is required when signing. */
  required?: boolean;
  /** Text only */
  fontSize?: number;
  textAlign?: 'left' | 'center' | 'right';
  /** Vertical alignment within the text box */
  verticalAlign?: 'top' | 'center' | 'bottom';
  fontWeight?: 'normal' | 'bold';
  fontStyle?: 'normal' | 'italic';
  /** Font family: Montserrat or Open Sans */
  fontFamily?: 'Montserrat' | 'Open Sans';
  /** Text color (hex, e.g. #000000) */
  color?: string;
  /** Legacy / whole-box list style. Newer edits may use lineListStyles for mixed plain/list content. */
  listStyle?: 'none' | 'bullet' | 'numbered' | 'lettered';
  /** Per-content-line list style, aligned with `content.split('\n')`. Missing/none = plain text. */
  lineListStyles?: Array<'none' | 'bullet' | 'numbered' | 'lettered' | null | undefined>;
  /** Rich text runs per line. When present, supersedes element-level bold/italic/color/fontSize/fontFamily for display. */
  richLines?: RichTextRun[][];
  /** Per-line horizontal alignment. Overrides element-level textAlign for individual lines. */
  lineTextAligns?: ('left' | 'center' | 'right')[];
  /** Image only: how the image fits inside its box (CSS object-fit) */
  imageFit?: 'contain' | 'cover' | 'fill' | 'none';
  /** Image only: where the image is anchored inside its box (CSS object-position, e.g. "50% 50%") */
  imagePosition?: string;
  /** When true, element cannot be moved, resized, or edited until unlocked */
  locked?: boolean;
  /** When true, element cannot be moved or resized but can still be edited (text, image). Use to avoid moving by accident. */
  lockPosition?: boolean;
  /** Degrees, clockwise, around the element's box center. */
  rotation?: number;
};

/** Content area margins (percent). Elements cannot be placed outside. */
export type PageMargins = {
  left_pct?: number;
  right_pct?: number;
  top_pct?: number;
  bottom_pct?: number;
};

/** Page in the document: background (template) + optional margins + elements */
export type DocumentPage = {
  template_id: string | null;
  /** Margins for this page (content area). Defined on the document, not the template. */
  margins?: PageMargins | null;
  /** Libre elements (text, image, image placeholder, block) */
  elements?: DocElement[];
  /** Legacy: template areas + content (for backward compat) */
  areas_content?: Record<string, string>;
};

export const DOCUMENT_EDITOR_FONTS = ['Montserrat', 'Open Sans'] as const;
export type DocumentEditorFont = (typeof DOCUMENT_EDITOR_FONTS)[number];

/** Text style presets: font, weight, size, color. User can apply then override font/size. */
export const TEXT_STYLE_PRESETS = [
  { id: 'area-title', label: 'Preset 01 (Area title)', fontFamily: 'Montserrat' as const, fontWeight: 'bold' as const, fontSize: 13, color: '#B30000' },
  { id: 'text', label: 'Preset 02 (Body text)', fontFamily: 'Montserrat' as const, fontWeight: 'normal' as const, fontSize: 12, color: '#787878' },
  { id: 'title', label: 'Preset 03 (Title)', fontFamily: 'Montserrat' as const, fontWeight: 'normal' as const, fontSize: 12, color: '#000000' },
] as const;

export function createTextElement(): DocElement {
  return {
    id: `el-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    type: 'text',
    content: 'New text',
    x_pct: 10,
    y_pct: 20,
    width_pct: 80,
    height_pct: 8,
    fontSize: 12,
    fontFamily: 'Montserrat',
    fontWeight: 'bold',
    color: '#000000',
  };
}

/** Page is A4 portrait in the editor; element % width / % height must match this aspect to match image pixels without letterboxing. */
const PAGE_WIDTH_OVER_HEIGHT = 210 / 297;

/**
 * Set width_pct / height_pct so the on-canvas frame matches the image aspect ratio (no stretch with `contain`).
 */
export function sizeImageElementFrameForIntrinsicAspect(
  baseWidthPct: number,
  intrinsicWidthPx: number,
  intrinsicHeightPx: number,
  options?: { maxWidthPct?: number; maxHeightPct?: number; minSizePct?: number },
): { width_pct: number; height_pct: number } {
  const maxW = options?.maxWidthPct ?? 92;
  const maxH = options?.maxHeightPct ?? 88;
  const minS = options?.minSizePct ?? 2;

  if (!intrinsicWidthPx || !intrinsicHeightPx || intrinsicWidthPx <= 0 || intrinsicHeightPx <= 0) {
    return { width_pct: baseWidthPct, height_pct: 25 };
  }

  let w = Math.max(minS, Math.min(maxW, baseWidthPct));
  let h = w * PAGE_WIDTH_OVER_HEIGHT * (intrinsicHeightPx / intrinsicWidthPx);

  if (h > maxH) {
    const s = maxH / h;
    w = Math.max(minS, w * s);
    h = maxH;
  }
  if (w > maxW) {
    const s = maxW / w;
    w = maxW;
    h = Math.max(minS, h * s);
  }

  return {
    width_pct: Math.round(w * 1000) / 1000,
    height_pct: Math.round(h * 1000) / 1000,
  };
}

export function createImageElement(fileId: string): DocElement {
  return {
    id: `el-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    type: 'image',
    content: fileId,
    x_pct: 10,
    y_pct: 30,
    width_pct: 40,
    height_pct: 25,
  };
}

/** Empty image area: user can add/replace image later or delete. */
export function createImagePlaceholder(): DocElement {
  return {
    id: `el-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    type: 'image',
    content: '',
    x_pct: 10,
    y_pct: 35,
    width_pct: 40,
    height_pct: 25,
  };
}

/** Blocking area: nothing else can be placed here (e.g. margin or background zone). */
export function createBlockElement(): DocElement {
  return {
    id: `el-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    type: 'block',
    content: '',
    x_pct: 5,
    y_pct: 5,
    width_pct: 20,
    height_pct: 10,
  };
}

/**
 * Free initials field (page footer / margin). Not drawn as ink in the PDF —
 * exported only as signature_template overlay metadata.
 * Default: bottom-right-ish on A4 portrait (~80×32 ref px ≈ 8.8% × 3.8%).
 */
export function createInitialsElement(opts?: { assignee?: string }): DocElement {
  return {
    id: `el-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    type: 'initials',
    content: '',
    x_pct: 78,
    y_pct: 92,
    width_pct: 14,
    height_pct: 4.5,
    assignee: normalizeDocumentAssigneeId(opts?.assignee),
    required: true,
  };
}

/**
 * Free date field for send-for-signature. Not drawn as ink in the PDF —
 * exported only as signature_template overlay metadata (signer picks the date).
 * Default: beside typical initials area on A4 portrait.
 */
export function createDateElement(opts?: { assignee?: string }): DocElement {
  return {
    id: `el-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    type: 'date',
    content: '',
    x_pct: 60,
    y_pct: 92,
    width_pct: 16,
    height_pct: 4.5,
    assignee: normalizeDocumentAssigneeId(opts?.assignee),
    required: true,
  };
}
