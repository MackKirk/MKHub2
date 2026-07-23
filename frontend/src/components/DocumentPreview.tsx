import { withFileAccessToken } from '@/lib/api';
import { useRef, useState, useCallback, useEffect, useLayoutEffect, Fragment, type RefObject } from 'react';
import type { DocElement, RichTextRun } from '@/types/documentCreator';
import { ElementOptionsPopover } from '@/components/ElementOptionsPopover';
import {
  editorCanvasScrollAreaClass,
  editorSegmentedControlTrackClass,
  editorSegmentedSegmentIdleClass,
  editorSegmentedSegmentSelectedClass,
} from '@/components/document-editor/documentEditorRibbonPrimitives';
import {
  BLOCK_PROTECTED_BG,
  MARGIN_PROTECTED_BG,
  blockProtectedBorderClass,
  marginBandRingClass,
} from '@/components/document-editor/documentProtectedVisuals';
import { PinIcon } from '@/components/document-editor/documentEditorIcons';
import { notifyTextEditBlocking } from '@/components/document-editor/notifyTextEditBlocking';

export type TemplateMargins = {
  left_pct?: number;
  right_pct?: number;
  top_pct?: number;
  bottom_pct?: number;
};

type DocumentPreviewProps = {
  backgroundUrl: string | null;
  elements: DocElement[];
  /** Content area: elements cannot be placed outside (blocked margins) */
  margins?: TemplateMargins | null;
  /** When false (e.g. creating document), block elements are invisible and not editable but still block placement */
  blockAreasVisible?: boolean;
  /** When true (e.g. editing a document created from a type), block elements are visible but not draggable/resizable/deletable */
  lockBlockElements?: boolean;
  /** When false, do not render the floating ElementOptionsPopover (use external ribbon/toolbar instead). */
  showElementOptionsPopover?: boolean;
  /** Optional: reports current rendered canvas width (px). Useful for export fidelity. */
  onCanvasWidthPxChange?: (widthPx: number) => void;
  /** Optional: called when a user action begins (drag/resize). Useful for undo/redo snapshots. */
  onBeginUserAction?: () => void;
  /** Zoom factor applied to the page canvas (1 = 100%). */
  zoom?: number;
  onElementClick?: (elementId: string, event?: React.PointerEvent) => void;
  onCanvasClick?: () => void;
  /** When array: multi-selection. When empty: none selected. */
  selectedElementIds: string[];
  onUpdateElement?: (elementId: string, updater: (el: DocElement) => DocElement) => void;
  onRemoveElement?: (elementId: string) => void;
  /** For image elements: replace or set image (upload handled by parent) */
  onReplaceImage?: (elementId: string, file: File) => Promise<void>;
  /** When provided, "Add image" / "Replace image" in popover opens image picker instead of file input. */
  onReplaceImageClick?: (elementId: string) => void;
  /** Stack inside parent vertical scroll — no chrome row, no inner scroll (multi-page editor). */
  embedded?: boolean;
  /** Parent scroll container for space+drag pan when `embedded`. */
  embedScrollParentRef?: RefObject<HTMLElement | null>;
  /** Called when user interacts with this page (sync active page in stacked layout). */
  onPageInteraction?: () => void;
  /** When this value changes, scroll the canvas container back to the top (e.g. document id). */
  scrollToTopKey?: string | null;
  /** Fired when inline text edit mode starts or ends (for parent selection guards). */
  onTextEditingChange?: (elementId: string | null) => void;
  /**
   * Controlled text-edit target (one id for the whole document).
   * Required when multiple embedded previews exist (multi-page editor).
   */
  editingElementId?: string | null;
  onEditingElementIdChange?: (elementId: string | null) => void;
};

const A4_ASPECT = 210 / 297;
const MIN_SIZE_PCT = 2;

// Reference width used to keep font sizing stable across window sizes.
// Font sizes are stored in "reference px" and scaled by (canvasWidth / REFERENCE_CANVAS_WIDTH_PX).
const REFERENCE_CANVAS_WIDTH_PX = 910;
const DOCUMENT_PREVIEW_IMAGE_WIDTH_PX = 1600;

/** Ribbon strip below toolbar — keep focus in inline text editor when using formatting controls. */
const DOCUMENT_EDITOR_FORMATTING_SELECTOR = '[data-document-editor-formatting]';
/** Portaled editor panels (color, etc.) — same as formatting strip for “still editing” clicks. */
const DOCUMENT_EDITOR_OVERLAY_SELECTOR = '[data-document-editor-overlay]';
const INLINE_TEXT_EDITOR_ATTR = 'data-inline-text-editor';
/** All text boxes on the canvas (edit or display) — used to allow switching edit target. */
const DOCUMENT_TEXT_ELEMENT_ATTR = 'data-document-text-element';
/** Done toolbar on the text block — clicks must not steal focus from the editor. */
const DOCUMENT_TEXT_EDIT_TOOLBAR_SELECTOR = '[data-document-text-edit-toolbar]';
const TEXT_EDITOR_ROOT_ATTR = 'data-document-text-editor-root';
const TEXT_EDITOR_LINE_ATTR = 'data-document-text-line-index';
const TEXT_EDITOR_LINE_STYLE_ATTR = 'data-document-text-line-style';
const TEXT_EDITOR_LINE_TEXT_ATTR = 'data-document-text-line-text';
const TEXT_EDITOR_ACTIVE_LINE_ATTR = 'data-document-text-active-line-index';
const DOCUMENT_TEXT_APPLY_LIST_STYLE_EVENT = 'document-text-editor-apply-list-style';
const DOCUMENT_TEXT_APPLY_FORMAT_EVENT = 'document-text-apply-format';
const DOCUMENT_TEXT_APPLY_LINE_ALIGN_EVENT = 'document-text-apply-line-align';
const DOCUMENT_TEXT_FORMAT_STATE_ATTR = 'data-current-format';
const TEXT_EDITOR_RUN_ATTR = 'data-document-text-run-index';
/** Fired on `window` whenever the editor updates its data-current-format attribute so the inspector can re-read it. */
const DOCUMENT_TEXT_FORMAT_STATE_CHANGED_EVENT = 'document-text-format-state-changed';

/** Floating chips above text boxes — align with document editor segmented toolbar (h-8 track). */
const DOCUMENT_PREVIEW_FLOATING_SEGMENT_BTN_CLASS =
  'flex h-full min-h-0 shrink-0 items-center gap-1.5 whitespace-nowrap px-2.5 text-[11px] font-semibold transition-[background-color,color,box-shadow] duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-red/35 active:scale-[0.98]';

type LineListStyle = Exclude<NonNullable<DocElement['listStyle']>, 'none'>;
type TextEditorSnapshot = {
  content: string;
  lineListStyles?: Array<LineListStyle | 'none'>;
  richLines?: RichTextRun[][];
  lineTextAligns?: ('left' | 'center' | 'right')[];
};

type ApplyListStyleEvent = CustomEvent<{
  elementId: string;
  mode: LineListStyle | 'none';
}>;

type ApplyFormatEvent = CustomEvent<{
  elementId: string;
  format: Partial<Omit<RichTextRun, 'text'>>;
  /** true = toggle (e.g. bold off if all selected are bold) */
  toggle?: boolean;
}>;

type ApplyLineAlignEvent = CustomEvent<{
  elementId: string;
  align: 'left' | 'center' | 'right';
}>;

function normalizeLineListStyle(style: DocElement['listStyle'] | null | undefined): LineListStyle | undefined {
  return style && style !== 'none' ? style : undefined;
}

function contentLines(content: string | null | undefined): string[] {
  return (content ?? '').replace(/\r\n/g, '\n').split('\n');
}

// ── Rich text run helpers ────────────────────────────────────────────────────

function runsText(runs: RichTextRun[]): string {
  return runs.map((r) => r.text).join('');
}

type RunFormat = Partial<Omit<RichTextRun, 'text'>>;

function runFormat(run: RichTextRun): RunFormat {
  const fmt: RunFormat = {};
  if (run.bold !== undefined) fmt.bold = run.bold;
  if (run.italic !== undefined) fmt.italic = run.italic;
  if (run.fontSize !== undefined) fmt.fontSize = run.fontSize;
  if (run.color !== undefined) fmt.color = run.color;
  if (run.fontFamily !== undefined) fmt.fontFamily = run.fontFamily;
  return fmt;
}

function formatsEqual(a: RunFormat, b: RunFormat): boolean {
  return a.bold === b.bold && a.italic === b.italic && a.fontSize === b.fontSize && a.color === b.color && a.fontFamily === b.fontFamily;
}

function mergeAdjacentRuns(runs: RichTextRun[]): RichTextRun[] {
  if (runs.length <= 1) return runs;
  const result: RichTextRun[] = [{ ...runs[0] }];
  for (let i = 1; i < runs.length; i++) {
    const prev = result[result.length - 1];
    const curr = runs[i];
    if (formatsEqual(runFormat(prev), runFormat(curr))) {
      result[result.length - 1] = { ...prev, text: prev.text + curr.text };
    } else {
      result.push({ ...curr });
    }
  }
  return result;
}

function splitRunsAt(runs: RichTextRun[], offset: number): [RichTextRun[], RichTextRun[]] {
  if (runs.length === 0) return [[{ text: '' }], [{ text: '' }]];
  let pos = 0;
  const left: RichTextRun[] = [];
  const right: RichTextRun[] = [];
  for (let i = 0; i < runs.length; i++) {
    const run = runs[i];
    const len = run.text.length;
    if (pos + len <= offset) {
      left.push({ ...run });
    } else if (pos >= offset) {
      right.push({ ...run });
    } else {
      const sp = offset - pos;
      if (sp > 0) left.push({ ...run, text: run.text.slice(0, sp) });
      if (sp < len) right.push({ ...run, text: run.text.slice(sp) });
    }
    pos += len;
  }
  if (left.length === 0) left.push({ text: '' });
  if (right.length === 0) right.push({ text: '' });
  return [left, right];
}

/** Delete characters [start, end) from a line's runs. */
function deleteRangeFromLineRuns(runs: RichTextRun[], start: number, end: number): RichTextRun[] {
  if (start >= end) return runs;
  let pos = 0;
  const result: RichTextRun[] = [];
  for (const run of runs) {
    const len = run.text.length;
    const rEnd = pos + len;
    if (rEnd <= start || pos >= end) {
      result.push({ ...run });
    } else {
      const kept = run.text.slice(0, Math.max(0, start - pos)) + run.text.slice(Math.min(len, end - pos));
      if (kept.length > 0) result.push({ ...run, text: kept });
    }
    pos += len;
  }
  return result.length > 0 ? mergeAdjacentRuns(result) : [{ text: '' }];
}

/** Insert text at offset in a line's runs, inheriting format from adjacent run unless fmt overrides. */
function insertIntoLineRuns(runs: RichTextRun[], offset: number, text: string, fmt?: RunFormat): RichTextRun[] {
  if (runs.length === 0) return [{ text, ...fmt }];
  let pos = 0;
  const result: RichTextRun[] = [];
  let inserted = false;
  for (let i = 0; i < runs.length; i++) {
    const run = runs[i];
    const len = run.text.length;
    if (!inserted && pos + len >= offset) {
      const inRun = offset - pos;
      const effectiveFmt = fmt ?? runFormat(run);
      if (formatsEqual(effectiveFmt, runFormat(run))) {
        result.push({ ...run, text: run.text.slice(0, inRun) + text + run.text.slice(inRun) });
      } else {
        if (inRun > 0) result.push({ ...run, text: run.text.slice(0, inRun) });
        result.push({ text, ...effectiveFmt });
        if (inRun < len) result.push({ ...run, text: run.text.slice(inRun) });
      }
      inserted = true;
    } else {
      result.push({ ...run });
    }
    pos += len;
  }
  if (!inserted) {
    const last = runs[runs.length - 1];
    const effectiveFmt = fmt ?? runFormat(last);
    if (formatsEqual(effectiveFmt, runFormat(last))) {
      result[result.length - 1] = { ...last, text: last.text + text };
    } else {
      result.push({ text, ...effectiveFmt });
    }
  }
  return mergeAdjacentRuns(result);
}

/** Apply a format override to runs in [start, end). */
function applyFormatToLineRuns(runs: RichTextRun[], start: number, end: number, fmt: RunFormat): RichTextRun[] {
  if (start >= end) return runs;
  let pos = 0;
  const result: RichTextRun[] = [];
  for (const run of runs) {
    const len = run.text.length;
    const rEnd = pos + len;
    if (rEnd <= start || pos >= end) {
      result.push({ ...run });
    } else {
      if (pos < start) result.push({ ...run, text: run.text.slice(0, start - pos) });
      const midS = Math.max(0, start - pos);
      const midE = Math.min(len, end - pos);
      const mid = run.text.slice(midS, midE);
      if (mid.length > 0) result.push({ ...run, text: mid, ...fmt });
      if (rEnd > end) result.push({ ...run, text: run.text.slice(end - pos) });
    }
    pos += len;
  }
  const cleaned = result.filter((r) => r.text.length > 0);
  return cleaned.length > 0 ? mergeAdjacentRuns(cleaned) : [{ text: '' }];
}

/** Get the format at a given character offset within a line's runs.
 *  Uses strict `>` so that a run boundary at exactly `offset` resolves to the
 *  run STARTING at that offset, not the one ending there.  This matters for
 *  `syncFormatState`: after applying a format to [start, end), the newly
 *  formatted run begins at `start.offset`, so `getFormatAtOffset(runs, start)`
 *  must return the new format, not the untouched run before it. */
function getFormatAtOffset(runs: RichTextRun[], offset: number): RunFormat {
  let pos = 0;
  for (const run of runs) {
    if (pos + run.text.length > offset) return runFormat(run);
    pos += run.text.length;
  }
  return runs.length > 0 ? runFormat(runs[runs.length - 1]) : {};
}

/** Check if all runs in [start,end) for the given property share the same value (returns value or 'mixed'/'none'). */
function selectionFormatValue(
  allRuns: RichTextRun[][],
  start: { lineIndex: number; offset: number },
  end: { lineIndex: number; offset: number },
  prop: keyof RunFormat,
): unknown {
  const vals: unknown[] = [];
  for (let li = start.lineIndex; li <= end.lineIndex; li++) {
    const lineRuns = allRuns[li] ?? [];
    const lStart = li === start.lineIndex ? start.offset : 0;
    const lEnd = li === end.lineIndex ? end.offset : runsText(lineRuns).length;
    let pos = 0;
    for (const run of lineRuns) {
      const rEnd = pos + run.text.length;
      if (rEnd > lStart && pos < lEnd) vals.push(run[prop]);
      pos += run.text.length;
    }
  }
  if (vals.length === 0) return undefined;
  const first = vals[0];
  return vals.every((v) => v === first) ? first : 'mixed';
}

function initRunsFromElement(el: DocElement): RichTextRun[][] {
  const lines = contentLines(el.content);
  if (el.richLines && el.richLines.length > 0) {
    return lines.map((line, idx) => {
      const rl = el.richLines![idx];
      if (rl && rl.length > 0 && runsText(rl) === line) return rl;
      return [{ text: line }];
    });
  }
  return lines.map((line) => [{ text: line }]);
}

function runSpanInlineStyle(run: RichTextRun, elementFontSize: number): string {
  const parts: string[] = [];
  if (run.bold !== undefined) parts.push(`font-weight:${run.bold ? 'bold' : 'normal'}`);
  if (run.italic !== undefined) parts.push(`font-style:${run.italic ? 'italic' : 'normal'}`);
  if (run.fontSize !== undefined && run.fontSize !== elementFontSize) {
    parts.push(`font-size:${(run.fontSize / Math.max(1, elementFontSize)).toFixed(4)}em`);
  }
  if (run.color !== undefined) parts.push(`color:${run.color}`);
  if (run.fontFamily !== undefined) {
    parts.push(`font-family:${run.fontFamily === 'Open Sans' ? '"Open Sans",sans-serif' : '"Montserrat",sans-serif'}`);
  }
  return parts.join(';');
}

/** CSS style object for a run span in non-edit (React) display mode. */
function runDisplayStyle(run: RichTextRun, elementFontSize: number): React.CSSProperties {
  const s: React.CSSProperties = {};
  if (run.bold !== undefined) s.fontWeight = run.bold ? 'bold' : 'normal';
  if (run.italic !== undefined) s.fontStyle = run.italic ? 'italic' : 'normal';
  if (run.fontSize !== undefined && run.fontSize !== elementFontSize) {
    s.fontSize = `${(run.fontSize / Math.max(1, elementFontSize)).toFixed(4)}em`;
  }
  if (run.color !== undefined) s.color = run.color;
  if (run.fontFamily !== undefined) {
    s.fontFamily = run.fontFamily === 'Open Sans' ? '"Open Sans", sans-serif' : '"Montserrat", sans-serif';
  }
  return s;
}

function effectiveLineListStyles(el: Pick<DocElement, 'content' | 'listStyle' | 'lineListStyles'>): Array<LineListStyle | undefined> {
  const lines = contentLines(el.content);
  const fallback = normalizeLineListStyle(el.listStyle);
  return lines.map((_, idx) => normalizeLineListStyle(el.lineListStyles?.[idx] ?? fallback));
}

function listOrdinalAt(styles: Array<LineListStyle | undefined>, idx: number): number {
  const style = styles[idx];
  if (!style || style === 'bullet') return 0;
  let n = 1;
  for (let i = idx - 1; i >= 0 && styles[i] === style; i -= 1) n += 1;
  return n;
}

function lineMarker(style: LineListStyle | undefined, ordinal: number): string {
  if (style === 'bullet') return '•';
  if (style === 'numbered') return `${ordinal}.`;
  if (style === 'lettered') return `${ordinal <= 26 ? String.fromCharCode(96 + ordinal) : ordinal}.`;
  return '';
}


// ── Imperative text editor ──────────────────────────────────────────────────
// React MUST NOT render children inside contentEditable — it loses track of
// DOM mutations made by the browser and crashes (insertBefore / removeChild).
// All DOM management here is 100% imperative via innerHTML + useLayoutEffect.

function escapeHtmlText(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function buildEditorHtml(
  lines: string[],
  styles: Array<LineListStyle | undefined>,
  runs: RichTextRun[][],
  elementFontSize: number,
): string {
  return lines
    .map((line, idx) => {
      const style = styles[idx];
      const markerText = style ? escapeHtmlText(lineMarker(style, listOrdinalAt(styles, idx))) : '';
      const markerHtml = style
        ? `<span data-document-text-line-marker="true" contenteditable="false" style="margin-right:0.45em;min-width:1.35em;display:inline-block;text-align:right;user-select:none;-webkit-user-select:none">${markerText}</span>`
        : '';
      const lineRuns = runs[idx] ?? [{ text: line }];
      const hasRichStyling = lineRuns.some((r) => runSpanInlineStyle(r, elementFontSize));
      let textHtml: string;
      if (!hasRichStyling && lineRuns.length === 1) {
        textHtml = escapeHtmlText(lineRuns[0].text) || '<br>';
      } else {
        const allEmpty = lineRuns.every((r) => r.text === '');
        if (allEmpty) {
          textHtml = '<br>';
        } else {
          textHtml = lineRuns
            .map((run, ri) => {
              const s = runSpanInlineStyle(run, elementFontSize);
              const content = escapeHtmlText(run.text);
              return s
                ? `<span ${TEXT_EDITOR_RUN_ATTR}="${ri}" style="${s}">${content}</span>`
                : `<span ${TEXT_EDITOR_RUN_ATTR}="${ri}">${content}</span>`;
            })
            .join('') || '<br>';
        }
      }
      const divStyle = style ? 'display:flex;align-items:baseline' : '';
      return `<div ${TEXT_EDITOR_LINE_ATTR}="${idx}" ${TEXT_EDITOR_LINE_STYLE_ATTR}="${style ?? 'none'}" style="${divStyle}">${markerHtml}<span ${TEXT_EDITOR_LINE_TEXT_ATTR}="true" style="${style ? 'flex:1;min-width:0' : ''}">${textHtml}</span></div>`;
    })
    .join('');
}

/** Walk DOM tree under `container` to find the text node at `offset` chars from the start.
 *  Skips marker spans. Returns null if offset exceeds total text length. */
function findTextNodeAt(container: Node, offset: number): { node: Node; pos: number } | null {
  if (container instanceof HTMLElement && container.hasAttribute('data-document-text-line-marker')) return null;
  if (container.nodeType === Node.TEXT_NODE) {
    const len = (container.textContent ?? '').length;
    if (offset <= len) return { node: container, pos: offset };
    return null;
  }
  let rem = offset;
  for (const child of Array.from(container.childNodes)) {
    if (child instanceof HTMLElement && child.hasAttribute('data-document-text-line-marker')) continue;
    const len = (child.textContent ?? '').length;
    if (rem <= len) {
      const found = findTextNodeAt(child, rem);
      if (found) return found;
      break;
    }
    rem -= len;
  }
  return null;
}

function imperativeCaretSet(root: HTMLElement, lineIdx: number, charOffset: number) {
  const lineEl = root.querySelector(`[${TEXT_EDITOR_LINE_ATTR}="${lineIdx}"]`);
  const textSpan = lineEl?.querySelector<HTMLElement>(`[${TEXT_EDITOR_LINE_TEXT_ATTR}]`);
  if (!textSpan) return;
  const domSel = window.getSelection();
  if (!domSel) return;
  const found = findTextNodeAt(textSpan, charOffset);
  let node: Node;
  let pos: number;
  if (found) {
    node = found.node; pos = found.pos;
  } else {
    // Fallback: place at end of last text node
    const walker = document.createTreeWalker(textSpan, NodeFilter.SHOW_TEXT);
    let last: Text | null = null;
    let cur: Node | null;
    while ((cur = walker.nextNode())) last = cur as Text;
    node = last ?? textSpan;
    pos = last ? last.length : 0;
  }
  try {
    const range = document.createRange();
    const maxPos = node.nodeType === Node.TEXT_NODE ? (node.textContent ?? '').length : (node as HTMLElement).childNodes.length;
    range.setStart(node, Math.min(pos, maxPos));
    range.collapse(true);
    domSel.removeAllRanges();
    domSel.addRange(range);
  } catch { /* ignore */ }
}

/** Restore a selection range from logical line/char coordinates after a repaint. */
function imperativeSelectionRestore(
  root: HTMLElement,
  sel: { start: { lineIndex: number; offset: number }; end: { lineIndex: number; offset: number } },
) {
  const domSel = window.getSelection();
  if (!domSel) return;
  const getNodeAt = (lineIdx: number, offset: number) => {
    const lineEl = root.querySelector(`[${TEXT_EDITOR_LINE_ATTR}="${lineIdx}"]`);
    const textSpan = lineEl?.querySelector<HTMLElement>(`[${TEXT_EDITOR_LINE_TEXT_ATTR}]`);
    if (!textSpan) return null;
    const found = findTextNodeAt(textSpan, offset);
    if (found) return found;
    // end of span fallback
    const walker = document.createTreeWalker(textSpan, NodeFilter.SHOW_TEXT);
    let last: Text | null = null;
    let cur: Node | null;
    while ((cur = walker.nextNode())) last = cur as Text;
    return last ? { node: last as Node, pos: last.length } : null;
  };
  const startN = getNodeAt(sel.start.lineIndex, sel.start.offset);
  const endN = getNodeAt(sel.end.lineIndex, sel.end.offset);
  if (!startN || !endN) {
    imperativeCaretSet(root, sel.start.lineIndex, sel.start.offset);
    return;
  }
  try {
    const range = document.createRange();
    range.setStart(startN.node, Math.min(startN.pos, (startN.node.textContent ?? '').length));
    range.setEnd(endN.node, Math.min(endN.pos, (endN.node.textContent ?? '').length));
    domSel.removeAllRanges();
    domSel.addRange(range);
  } catch {
    imperativeCaretSet(root, sel.start.lineIndex, sel.start.offset);
  }
}

function imperativeSelectionRead(
  root: HTMLElement,
  fallbackLineIdx: number
): { start: { lineIndex: number; offset: number }; end: { lineIndex: number; offset: number }; collapsed: boolean } | null {
  const sel = window.getSelection();
  if (!sel || !sel.anchorNode || !root.contains(sel.anchorNode)) return null;

  const lineIdxForNode = (node: Node | null): number => {
    let n: Node | null = node;
    if (n?.nodeType === Node.TEXT_NODE) n = n.parentNode;
    while (n && n !== root) {
      if (n instanceof HTMLElement && n.hasAttribute(TEXT_EDITOR_LINE_ATTR))
        return Number(n.getAttribute(TEXT_EDITOR_LINE_ATTR));
      n = n.parentNode;
    }
    return fallbackLineIdx;
  };

  const charOffsetInLine = (lineIdx: number, node: Node | null, domOffset: number): number => {
    const lineEl = root.querySelector(`[${TEXT_EDITOR_LINE_ATTR}="${lineIdx}"]`);
    const textSpan = lineEl?.querySelector<HTMLElement>(`[${TEXT_EDITOR_LINE_TEXT_ATTR}]`);
    if (!textSpan || !node || !textSpan.contains(node)) return 0;
    const range = document.createRange();
    range.selectNodeContents(textSpan);
    range.setEnd(node, domOffset);
    return range.toString().length;
  };

  const anchorLineIdx = lineIdxForNode(sel.anchorNode);
  const focusLineIdx = root.contains(sel.focusNode) ? lineIdxForNode(sel.focusNode) : anchorLineIdx;
  const anchor = { lineIndex: anchorLineIdx, offset: charOffsetInLine(anchorLineIdx, sel.anchorNode, sel.anchorOffset) };
  const focus = { lineIndex: focusLineIdx, offset: charOffsetInLine(focusLineIdx, sel.focusNode, sel.focusOffset) };
  const anchorFirst = anchor.lineIndex < focus.lineIndex || (anchor.lineIndex === focus.lineIndex && anchor.offset <= focus.offset);
  return {
    start: anchorFirst ? anchor : focus,
    end: anchorFirst ? focus : anchor,
    collapsed: anchor.lineIndex === focus.lineIndex && anchor.offset === focus.offset,
  };
}

function InlineTextEditor({
  element,
  textStyle,
  onCommit,
  onEscape,
}: {
  element: DocElement;
  textStyle: React.CSSProperties;
  onCommit: (snapshot: TextEditorSnapshot) => void;
  onEscape: () => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  // All state lives in refs — no React re-renders inside this component.
  const linesRef = useRef<string[]>(contentLines(element.content));
  const stylesRef = useRef<Array<LineListStyle | undefined>>(effectiveLineListStyles(element));
  const runsRef = useRef<RichTextRun[][]>(initRunsFromElement(element));
  const lineAlignsRef = useRef<('left' | 'center' | 'right')[]>([]);
  const pendingFormatRef = useRef<RunFormat | null>(null);
  const elementFontSizeRef = useRef(Math.max(8, Math.min(72, element.fontSize ?? 12)));
  const activeLineRef = useRef(0);
  const composingRef = useRef(false);
  /** Selection saved just before each user input event (used to apply pending format in handleInput). */
  const preinputSelRef = useRef<{ lineIndex: number; offset: number; endLineIndex: number; endOffset: number } | null>(null);
  /**
   * When the user clicks the side inspector (font size input, selects, color), the browser moves
   * focus and the DOM selection leaves the contentEditable — imperativeSelectionRead returns null.
   * Bold/Italic avoid that via onMouseDown preventDefault; we snapshot a logical range on mousedown
   * capture so font size / font / color / preset still apply to the selected text.
   */
  const frozenSelForToolbarRef = useRef<{
    start: { lineIndex: number; offset: number };
    end: { lineIndex: number; offset: number };
    collapsed: boolean;
  } | null>(null);
  const elementIdRef = useRef(element.id);
  /** Latest element-level typography (syncFormatState merges with run-level overrides for the inspector). */
  const elementPropsRef = useRef({
    fontWeight: 'normal' as string,
    fontStyle: 'normal' as string,
    fontSize: 12,
    color: '#000000',
    fontFamily: 'Montserrat',
  });
  const onCommitRef = useRef(onCommit);
  const onEscapeRef = useRef(onEscape);
  useLayoutEffect(() => { onCommitRef.current = onCommit; });
  useLayoutEffect(() => { onEscapeRef.current = onEscape; });
  useLayoutEffect(() => {
    elementIdRef.current = element.id;
  }, [element.id]);
  useLayoutEffect(() => {
    elementPropsRef.current = {
      fontWeight: element.fontWeight ?? 'normal',
      fontStyle: element.fontStyle ?? 'normal',
      fontSize: Math.max(8, Math.min(72, element.fontSize ?? 12)),
      color: element.color ?? '#000000',
      fontFamily: element.fontFamily ?? 'Montserrat',
    };
    elementFontSizeRef.current = elementPropsRef.current.fontSize;
  }, [element.fontWeight, element.fontStyle, element.fontSize, element.color, element.fontFamily]);

  // ── Undo stack ────────────────────────────────────────────────────────────
  type UndoEntry = {
    lines: string[];
    styles: Array<LineListStyle | undefined>;
    runs: RichTextRun[][];
    aligns: ('left' | 'center' | 'right')[];
  };
  const undoStackRef = useRef<UndoEntry[]>([]);
  const typingSessionActiveRef = useRef(false);
  const typingPauseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pushUndo = useCallback(() => {
    undoStackRef.current.push({
      lines: [...linesRef.current],
      styles: [...stylesRef.current],
      runs: runsRef.current.map((r) => [...r]),
      aligns: [...lineAlignsRef.current],
    });
    if (undoStackRef.current.length > 200) undoStackRef.current.shift();
    typingSessionActiveRef.current = false;
  }, []);

  const pushUndoForTyping = useCallback(() => {
    if (!typingSessionActiveRef.current) {
      pushUndo();
      typingSessionActiveRef.current = true;
    }
    if (typingPauseTimerRef.current) clearTimeout(typingPauseTimerRef.current);
    typingPauseTimerRef.current = setTimeout(() => { typingSessionActiveRef.current = false; }, 1000);
  }, [pushUndo]);

  const doCommit = useCallback(() => {
    const lines = linesRef.current;
    const styles = stylesRef.current;
    const runs = runsRef.current;
    const aligns = lineAlignsRef.current;
    const hasLineStyles = styles.some(Boolean);
    const hasRichRuns = runs.some((lr) =>
      lr.some((r) => r.bold !== undefined || r.italic !== undefined || r.fontSize !== undefined || r.color !== undefined || r.fontFamily !== undefined)
    );
    const defaultAlign = element.textAlign ?? 'left';
    const hasAligns = aligns.some((a) => a && a !== defaultAlign);
    onCommitRef.current({
      content: lines.join('\n'),
      lineListStyles: hasLineStyles ? styles.map((s) => s ?? 'none') : undefined,
      richLines: hasRichRuns ? runs : undefined,
      lineTextAligns: hasAligns ? aligns : undefined,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Persist edits when leaving this block (Done, Escape, or switching to another text box). */
  useLayoutEffect(() => {
    return () => {
      doCommit();
    };
  }, [doCommit]);

  /** Update data-current-format on the root for the inspector to read, then notify the inspector. */
  const syncFormatState = useCallback(() => {
    const root = rootRef.current;
    if (!root) return;
    const eid = elementIdRef.current;
    // Use live selection; fall back to frozen toolbar snapshot so font size / color
    // applied from the inspector (which steals DOM focus) still reports the right format.
    const sel = imperativeSelectionRead(root, activeLineRef.current)
      ?? (frozenSelForToolbarRef.current && !frozenSelForToolbarRef.current.collapsed
        ? frozenSelForToolbarRef.current
        : null);
    if (!sel) {
      root.removeAttribute(DOCUMENT_TEXT_FORMAT_STATE_ATTR);
      window.dispatchEvent(new CustomEvent(DOCUMENT_TEXT_FORMAT_STATE_CHANGED_EVENT, { detail: { elementId: eid } }));
      return;
    }
    const ep = elementPropsRef.current;
    const lineRuns = runsRef.current[sel.start.lineIndex] ?? [];
    const raw = pendingFormatRef.current ?? getFormatAtOffset(lineRuns, sel.start.offset);
    const fmt: RunFormat = {
      bold: raw.bold ?? ep.fontWeight === 'bold',
      italic: raw.italic ?? ep.fontStyle === 'italic',
      fontSize: raw.fontSize ?? ep.fontSize,
      color: raw.color ?? ep.color,
      fontFamily: raw.fontFamily ?? ep.fontFamily,
    };
    root.setAttribute(DOCUMENT_TEXT_FORMAT_STATE_ATTR, JSON.stringify(fmt));
    window.dispatchEvent(new CustomEvent(DOCUMENT_TEXT_FORMAT_STATE_CHANGED_EVENT, { detail: { elementId: eid } }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Snapshot logical selection before inspector controls steal DOM selection / focus.
  useEffect(() => {
    const inspectorAttr = '[data-document-inspector-keep-selection]';
    const onMouseDownCapture = (e: MouseEvent) => {
      const root = rootRef.current;
      if (!root) return;
      const t = e.target as Node | null;
      if (!t || root.contains(t)) return;
      if (!(t instanceof Element) || !t.closest(inspectorAttr)) return;
      const sel = imperativeSelectionRead(root, activeLineRef.current);
      if (sel && !sel.collapsed) frozenSelForToolbarRef.current = sel;
    };
    const onSelectionChange = () => {
      const root = rootRef.current;
      const s = window.getSelection();
      if (!root || !s?.anchorNode) return;
      if (root.contains(s.anchorNode)) frozenSelForToolbarRef.current = null;
    };
    document.addEventListener('mousedown', onMouseDownCapture, true);
    document.addEventListener('selectionchange', onSelectionChange);
    return () => {
      document.removeEventListener('mousedown', onMouseDownCapture, true);
      document.removeEventListener('selectionchange', onSelectionChange);
    };
  }, [element.id]);

  /** Rebuild innerHTML then restore focus + caret. */
  const repaint = useCallback((focusLineIdx?: number, focusOffset?: number, opts?: { skipSyncFormat?: boolean }) => {
    const root = rootRef.current;
    if (!root) return;
    root.innerHTML = buildEditorHtml(linesRef.current, stylesRef.current, runsRef.current, elementFontSizeRef.current);
    root.setAttribute(TEXT_EDITOR_ACTIVE_LINE_ATTR, String(activeLineRef.current));
    if (focusLineIdx != null) {
      root.focus({ preventScroll: true });
      imperativeCaretSet(root, focusLineIdx, focusOffset ?? 0);
    }
    if (!opts?.skipSyncFormat) {
      syncFormatState();
    }
  }, [syncFormatState]);

  // ── Mount / element switch ────────────────────────────────────────────────
  useLayoutEffect(() => {
    linesRef.current = contentLines(element.content);
    stylesRef.current = effectiveLineListStyles(element);
    runsRef.current = initRunsFromElement(element);
    lineAlignsRef.current = element.lineTextAligns
      ? [...element.lineTextAligns]
      : linesRef.current.map(() => element.textAlign ?? 'left');
    elementFontSizeRef.current = Math.max(8, Math.min(72, element.fontSize ?? 12));
    activeLineRef.current = 0;
    pendingFormatRef.current = null;
    frozenSelForToolbarRef.current = null;
    undoStackRef.current = [];
    typingSessionActiveRef.current = false;
    if (typingPauseTimerRef.current) clearTimeout(typingPauseTimerRef.current);
    repaint(linesRef.current.length - 1, linesRef.current[linesRef.current.length - 1]?.length ?? 0);
    // repaint() already calls root.focus() + imperativeCaretSet internally — no second focus() needed.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [element.id]);

  // ── Apply-list-style event ────────────────────────────────────────────────
  useEffect(() => {
    const handler = (event: Event) => {
      const { elementId, mode } = (event as ApplyListStyleEvent).detail ?? {};
      const root = rootRef.current;
      if (!root || elementId !== element.id) return;
      const sel = imperativeSelectionRead(root, activeLineRef.current);
      const indexes: number[] = sel
        ? Array.from({ length: sel.end.lineIndex - sel.start.lineIndex + 1 }, (_, i) => sel.start.lineIndex + i)
        : [activeLineRef.current];
      pushUndo();
      const nextStyles = [...stylesRef.current];
      indexes.forEach((idx) => {
        if (idx >= 0 && idx < nextStyles.length) nextStyles[idx] = mode === 'none' ? undefined : mode;
      });
      stylesRef.current = nextStyles;
      const caretLine = sel ? sel.start.lineIndex : activeLineRef.current;
      const caretOffset = sel ? sel.start.offset : 0;
      repaint(caretLine, caretOffset);
      doCommit();
    };
    window.addEventListener(DOCUMENT_TEXT_APPLY_LIST_STYLE_EVENT, handler);
    return () => window.removeEventListener(DOCUMENT_TEXT_APPLY_LIST_STYLE_EVENT, handler);
  }, [doCommit, element.id, pushUndo, repaint]);

  // ── Apply-format event (bold, italic, color, fontSize, fontFamily) ────────
  useEffect(() => {
    const handler = (event: Event) => {
      const { elementId, format, toggle } = (event as ApplyFormatEvent).detail ?? {};
      const root = rootRef.current;
      if (!root || elementId !== element.id) return;

      const fr = frozenSelForToolbarRef.current;
      let sel = imperativeSelectionRead(root, activeLineRef.current);
      let usedFrozen = false;
      if (sel && !sel.collapsed) {
        frozenSelForToolbarRef.current = null;
      }
      if (!sel && fr && !fr.collapsed) {
        sel = fr;
        usedFrozen = true;
      }

      // No selection: set pending format (will be applied to next typed characters).
      if (!sel || sel.collapsed) {
        pendingFormatRef.current = { ...(pendingFormatRef.current ?? {}), ...format };
        syncFormatState();
        return;
      }
      if (usedFrozen) frozenSelForToolbarRef.current = null;

      pendingFormatRef.current = null;

      pushUndo();
      const { start, end } = sel;
      const nextRuns = [...runsRef.current];

      // Toggle logic: if all selected runs already have the format value, invert it.
      let appliedFormat = { ...format };
      if (toggle) {
        for (const [key, val] of Object.entries(format) as [keyof RunFormat, unknown][]) {
          const existing = selectionFormatValue(runsRef.current, start, end, key);
          if (existing === val) {
            // All selected already have this value → toggle off
            (appliedFormat as Record<string, unknown>)[key] = key === 'bold' ? false : key === 'italic' ? false : undefined;
          }
        }
      }

      for (let li = start.lineIndex; li <= end.lineIndex; li++) {
        const lr = nextRuns[li] ?? [{ text: linesRef.current[li] ?? '' }];
        const lStart = li === start.lineIndex ? start.offset : 0;
        const lEnd = li === end.lineIndex ? end.offset : runsText(lr).length;
        if (lStart < lEnd) nextRuns[li] = applyFormatToLineRuns(lr, lStart, lEnd, appliedFormat);
      }
      runsRef.current = nextRuns;

      repaint(undefined, undefined, { skipSyncFormat: true });
      root.focus({ preventScroll: true });
      imperativeSelectionRestore(root, sel);
      // Sync call — selection is already restored above, so imperativeSelectionRead works
      // immediately. Using async (queueMicrotask+rAF) caused the inspector to still show
      // the old fontSize, so subsequent clicks computed the wrong next value.
      syncFormatState();
      doCommit();
    };
    window.addEventListener(DOCUMENT_TEXT_APPLY_FORMAT_EVENT, handler);
    return () => window.removeEventListener(DOCUMENT_TEXT_APPLY_FORMAT_EVENT, handler);
  }, [doCommit, element.id, pushUndo, repaint, syncFormatState]);

  // ── Apply-line-align event ────────────────────────────────────────────────
  useEffect(() => {
    const handler = (event: Event) => {
      const { elementId, align } = (event as ApplyLineAlignEvent).detail ?? {};
      const root = rootRef.current;
      if (!root || elementId !== element.id) return;
      const sel = imperativeSelectionRead(root, activeLineRef.current);
      const indexes: number[] = sel
        ? Array.from({ length: sel.end.lineIndex - sel.start.lineIndex + 1 }, (_, i) => sel.start.lineIndex + i)
        : [activeLineRef.current];
      pushUndo();
      const nextAligns = [...lineAlignsRef.current];
      indexes.forEach((idx) => { if (idx >= 0 && idx < nextAligns.length) nextAligns[idx] = align; });
      lineAlignsRef.current = nextAligns;
      const caretLine = sel ? sel.start.lineIndex : activeLineRef.current;
      const caretOffset = sel ? sel.start.offset : 0;
      repaint(caretLine, caretOffset);
      doCommit();
    };
    window.addEventListener(DOCUMENT_TEXT_APPLY_LINE_ALIGN_EVENT, handler);
    return () => window.removeEventListener(DOCUMENT_TEXT_APPLY_LINE_ALIGN_EVENT, handler);
  }, [doCommit, element.id, pushUndo, repaint]);

  // ── Enter ─────────────────────────────────────────────────────────────────
  const handleEnterImperative = useCallback((root: HTMLElement, sel: NonNullable<ReturnType<typeof imperativeSelectionRead>>) => {
    const { start, end } = sel;
    const lines = linesRef.current;
    const styles = stylesRef.current;
    const runs = runsRef.current;
    const aligns = lineAlignsRef.current;

    const lineText = (lines[start.lineIndex] ?? '').slice(0, start.offset);
    const afterText = (lines[end.lineIndex] ?? '').slice(end.offset);
    const style = styles[start.lineIndex];

    if (style && lineText.trim() === '' && afterText.trim() === '') {
      const nextStyles = [...styles];
      nextStyles[start.lineIndex] = undefined;
      stylesRef.current = nextStyles;
      activeLineRef.current = start.lineIndex;
      repaint(start.lineIndex, 0);
      doCommit();
      return;
    }

    const startRuns = runs[start.lineIndex] ?? [{ text: lines[start.lineIndex] ?? '' }];
    const endRuns = runs[end.lineIndex] ?? [{ text: lines[end.lineIndex] ?? '' }];
    const [leftRuns] = splitRunsAt(startRuns, start.offset);
    const [, rightRunsEnd] = splitRunsAt(endRuns, end.offset);
    const [, rightRunsStart] = splitRunsAt(startRuns, start.offset);
    const newLineRuns = start.lineIndex === end.lineIndex ? rightRunsStart : rightRunsEnd;

    const nextLines = [...lines];
    nextLines[start.lineIndex] = lineText;
    if (start.lineIndex !== end.lineIndex) nextLines.splice(start.lineIndex + 1, end.lineIndex - start.lineIndex);
    nextLines.splice(start.lineIndex + 1, 0, afterText);

    const nextRuns = [...runs];
    nextRuns[start.lineIndex] = leftRuns.length > 0 ? leftRuns : [{ text: '' }];
    if (start.lineIndex !== end.lineIndex) nextRuns.splice(start.lineIndex + 1, end.lineIndex - start.lineIndex);
    nextRuns.splice(start.lineIndex + 1, 0, newLineRuns.length > 0 ? newLineRuns : [{ text: '' }]);

    const nextStyles = [...styles];
    if (start.lineIndex !== end.lineIndex) nextStyles.splice(start.lineIndex + 1, end.lineIndex - start.lineIndex);
    nextStyles.splice(start.lineIndex + 1, 0, style);

    const nextAligns = [...aligns];
    if (start.lineIndex !== end.lineIndex) nextAligns.splice(start.lineIndex + 1, end.lineIndex - start.lineIndex);
    nextAligns.splice(start.lineIndex + 1, 0, aligns[start.lineIndex] ?? 'left');

    linesRef.current = nextLines;
    stylesRef.current = nextStyles;
    runsRef.current = nextRuns;
    lineAlignsRef.current = nextAligns;
    activeLineRef.current = start.lineIndex + 1;

    // Carry the character format from the cursor position into the new line
    // (mirrors Word behaviour: if you were typing in bold, the new line starts bold).
    if (!pendingFormatRef.current) {
      const curRuns = nextRuns[start.lineIndex] ?? [];
      const fmt = lineText.length > 0
        ? getFormatAtOffset(curRuns, lineText.length - 1)
        : (curRuns.length > 0 ? runFormat(curRuns[0]) : {});
      if (Object.keys(fmt).length > 0) pendingFormatRef.current = fmt;
    }

    repaint(start.lineIndex + 1, 0);
    doCommit();
  }, [doCommit, repaint]);

  // ── Backspace ─────────────────────────────────────────────────────────────
  const handleBackspaceImperative = useCallback((root: HTMLElement, sel: NonNullable<ReturnType<typeof imperativeSelectionRead>>) => {
    const { start, end, collapsed } = sel;
    const lines = linesRef.current;
    const styles = stylesRef.current;
    const runs = runsRef.current;
    const aligns = lineAlignsRef.current;

    if (!collapsed) {
      const sRuns = runs[start.lineIndex] ?? [{ text: lines[start.lineIndex] ?? '' }];
      const eRuns = runs[end.lineIndex] ?? [{ text: lines[end.lineIndex] ?? '' }];
      const [leftRuns] = splitRunsAt(sRuns, start.offset);
      const [, rightRuns] = splitRunsAt(eRuns, end.offset);
      const merged = mergeAdjacentRuns([...leftRuns, ...rightRuns]);
      const mergedText = `${(lines[start.lineIndex] ?? '').slice(0, start.offset)}${(lines[end.lineIndex] ?? '').slice(end.offset)}`;
      const nextLinesBS = [...lines.slice(0, start.lineIndex), mergedText, ...lines.slice(end.lineIndex + 1)];
      const nextRunsBS = [...runs.slice(0, start.lineIndex), merged, ...runs.slice(end.lineIndex + 1)];
      const nextStylesBS = [...styles.slice(0, start.lineIndex), styles[start.lineIndex], ...styles.slice(end.lineIndex + 1)];
      const nextAlignsBS = [...aligns.slice(0, start.lineIndex), aligns[start.lineIndex], ...aligns.slice(end.lineIndex + 1)];
      linesRef.current = nextLinesBS.length > 0 ? nextLinesBS : [''];
      runsRef.current = nextRunsBS.length > 0 ? nextRunsBS : [[{ text: '' }]];
      stylesRef.current = nextStylesBS.length > 0 ? nextStylesBS : [undefined];
      lineAlignsRef.current = nextAlignsBS.length > 0 ? nextAlignsBS : ['left'];
      activeLineRef.current = start.lineIndex;
      repaint(start.lineIndex, start.offset);
      doCommit();
      return;
    }

    const idx = start.lineIndex;
    if (start.offset === 0) {
      if (styles[idx]) {
        const nextStyles = [...styles];
        nextStyles[idx] = undefined;
        stylesRef.current = nextStyles;
        activeLineRef.current = idx;
        repaint(idx, 0);
        doCommit();
        return;
      }
      if (idx > 0) {
        const prevText = lines[idx - 1] ?? '';
        const prevRuns = runs[idx - 1] ?? [{ text: prevText }];
        const curRuns = runs[idx] ?? [{ text: lines[idx] ?? '' }];
        const mergedRuns = mergeAdjacentRuns([...prevRuns, ...curRuns]);
        const nextLines = [...lines];
        nextLines[idx - 1] = `${prevText}${lines[idx] ?? ''}`;
        nextLines.splice(idx, 1);
        const nextRuns = [...runs];
        nextRuns[idx - 1] = mergedRuns;
        nextRuns.splice(idx, 1);
        const nextStyles = [...styles];
        nextStyles.splice(idx, 1);
        const nextAligns = [...aligns];
        nextAligns.splice(idx, 1);
        linesRef.current = nextLines;
        runsRef.current = nextRuns;
        stylesRef.current = nextStyles;
        lineAlignsRef.current = nextAligns;
        activeLineRef.current = idx - 1;
        repaint(idx - 1, prevText.length);
        doCommit();
      }
      return;
    }

    // Single char before caret
    const lineRuns = runs[idx] ?? [{ text: lines[idx] ?? '' }];
    const newRuns = deleteRangeFromLineRuns(lineRuns, start.offset - 1, start.offset);
    const nextLines = [...lines];
    nextLines[idx] = runsText(newRuns);
    const nextRuns = [...runs];
    nextRuns[idx] = newRuns;
    linesRef.current = nextLines;
    runsRef.current = nextRuns;
    activeLineRef.current = idx;
    repaint(idx, start.offset - 1);
    doCommit();
  }, [doCommit, repaint]);

  // ── Delete ────────────────────────────────────────────────────────────────
  const handleDeleteImperative = useCallback((root: HTMLElement, sel: NonNullable<ReturnType<typeof imperativeSelectionRead>>) => {
    const { start, collapsed } = sel;
    const lines = linesRef.current;
    const runs = runsRef.current;

    if (!collapsed) {
      handleBackspaceImperative(root, sel);
      return;
    }

    const idx = start.lineIndex;
    const text = lines[idx] ?? '';

    if (start.offset < text.length) {
      const lineRuns = runs[idx] ?? [{ text }];
      const newRuns = deleteRangeFromLineRuns(lineRuns, start.offset, start.offset + 1);
      const nextLines = [...lines];
      nextLines[idx] = runsText(newRuns);
      const nextRuns = [...runs];
      nextRuns[idx] = newRuns;
      linesRef.current = nextLines;
      runsRef.current = nextRuns;
      activeLineRef.current = idx;
      repaint(idx, start.offset);
      doCommit();
      return;
    }
    if (idx < lines.length - 1) {
      const nextLines = [...lines];
      const nextRuns = [...runs];
      const merged = mergeAdjacentRuns([...(runs[idx] ?? [{ text }]), ...(runs[idx + 1] ?? [{ text: lines[idx + 1] ?? '' }])]);
      nextLines[idx] = `${text}${lines[idx + 1] ?? ''}`;
      nextLines.splice(idx + 1, 1);
      nextRuns[idx] = merged;
      nextRuns.splice(idx + 1, 1);
      const nextStyles = [...stylesRef.current];
      nextStyles.splice(idx + 1, 1);
      const nextAligns = [...lineAlignsRef.current];
      nextAligns.splice(idx + 1, 1);
      linesRef.current = nextLines;
      runsRef.current = nextRuns;
      stylesRef.current = nextStyles;
      lineAlignsRef.current = nextAligns;
      activeLineRef.current = idx;
      repaint(idx, text.length);
      doCommit();
    }
  }, [doCommit, handleBackspaceImperative, repaint]);

  // ── KeyDown ───────────────────────────────────────────────────────────────
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') { e.preventDefault(); onEscapeRef.current(); return; }

    const root = e.currentTarget;

    // Save cursor position for printable keys so handleInput can apply pending format.
    // (handleBeforeInput is unreliable for reading the selection in some React versions.)
    if (
      e.key.length === 1 &&
      !e.ctrlKey && !e.metaKey && !e.altKey &&
      !composingRef.current
    ) {
      const sel = imperativeSelectionRead(root, activeLineRef.current);
      preinputSelRef.current = sel
        ? { lineIndex: sel.start.lineIndex, offset: sel.start.offset, endLineIndex: sel.end.lineIndex, endOffset: sel.end.offset }
        : null;
    }

    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
      e.preventDefault();
      if (typingPauseTimerRef.current) clearTimeout(typingPauseTimerRef.current);
      typingSessionActiveRef.current = false;
      const prev = undoStackRef.current.pop();
      if (prev) {
        linesRef.current = prev.lines;
        stylesRef.current = prev.styles;
        runsRef.current = prev.runs;
        lineAlignsRef.current = prev.aligns;
        activeLineRef.current = Math.min(activeLineRef.current, prev.lines.length - 1);
        const caretLine = activeLineRef.current;
        const caretOffset = (prev.lines[caretLine] ?? '').length;
        repaint(caretLine, caretOffset);
        doCommit();
      }
      return;
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const sel = imperativeSelectionRead(root, activeLineRef.current);
      if (sel) { pushUndo(); handleEnterImperative(root, sel); }
      return;
    }

    // Backspace + Delete: all cases handled imperatively (with run tracking).
    if (e.key === 'Backspace' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      const sel = imperativeSelectionRead(root, activeLineRef.current);
      if (sel) { pushUndoForTyping(); handleBackspaceImperative(root, sel); }
      return;
    }
    if (e.key === 'Delete' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      const sel = imperativeSelectionRead(root, activeLineRef.current);
      if (sel) { pushUndoForTyping(); handleDeleteImperative(root, sel); }
      return;
    }

    if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      pendingFormatRef.current = null;
      requestAnimationFrame(() => {
        const r = rootRef.current;
        if (!r) return;
        const s = imperativeSelectionRead(r, activeLineRef.current);
        if (s) {
          activeLineRef.current = s.start.lineIndex;
          r.setAttribute(TEXT_EDITOR_ACTIVE_LINE_ATTR, String(activeLineRef.current));
          syncFormatState();
        }
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doCommit, pushUndo, pushUndoForTyping, repaint, syncFormatState]);

  // ── BeforeInput ───────────────────────────────────────────────────────────
  // Enter is intercepted here for structural control (new line). Regular character
  // typing is handled natively by the browser; pending format is applied in onInput.
  const handleBeforeInput = useCallback((e: React.FormEvent<HTMLDivElement>) => {
    const inputType = (e.nativeEvent as InputEvent).inputType;
    const root = e.currentTarget;

    if (inputType === 'insertParagraph' || inputType === 'insertLineBreak') {
      e.preventDefault();
      const sel = imperativeSelectionRead(root, activeLineRef.current);
      if (sel) { pushUndo(); handleEnterImperative(root, sel); }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Input: sync state after browser-native text changes ──────────────────
  const handleInput = useCallback((e: React.FormEvent<HTMLDivElement>) => {
    pushUndoForTyping();

    const root = e.currentTarget;
    const lineDivs = Array.from(root.querySelectorAll<HTMLElement>(`[${TEXT_EDITOR_LINE_ATTR}]`));

    // Read cursor position AFTER the browser's change (used to restore after repaint).
    const postSel = imperativeSelectionRead(root, activeLineRef.current);
    if (postSel) activeLineRef.current = postSel.start.lineIndex;

    if (lineDivs.length !== linesRef.current.length) {
      // Line count changed unexpectedly — resync everything.
      const nextLines = lineDivs.map((div) => {
        let text = '';
        div.childNodes.forEach((child) => {
          if (child instanceof HTMLElement && child.hasAttribute('data-document-text-line-marker')) return;
          text += child.textContent ?? '';
        });
        return text.replace(/\u00a0/g, ' ');
      });
      const nextRuns = nextLines.map((line, idx) => {
        const existing = runsRef.current[idx];
        if (existing && runsText(existing) === line) return existing;
        return [{ text: line }];
      });
      linesRef.current = nextLines;
      runsRef.current = nextRuns;
      stylesRef.current = stylesRef.current.slice(0, nextLines.length);
      lineAlignsRef.current = lineAlignsRef.current.slice(0, nextLines.length);
      repaint(activeLineRef.current, 0);
      doCommit();
      preinputSelRef.current = null;
      return;
    }

    // Read new text from each line.
    const prevLines = linesRef.current;
    const nextLines = lineDivs.map((div) => {
      let text = '';
      div.childNodes.forEach((child) => {
        if (child instanceof HTMLElement && child.hasAttribute('data-document-text-line-marker')) return;
        text += child.textContent ?? '';
      });
      return text.replace(/\u00a0/g, ' ');
    });

    // Sync runs, preserving rich-text structure on every keystroke.
    // When pending format is set, apply it to the inserted chars; otherwise inherit
    // the adjacent run's format so normal typing never strips existing formatting.
    const prePos = preinputSelRef.current;
    preinputSelRef.current = null;
    const pending = pendingFormatRef.current;

    let needRepaint = false;
    const nextRuns = nextLines.map((line, idx) => {
      const existing = runsRef.current[idx];
      if (existing && runsText(existing) === line) return existing;

      const prevLine = prevLines[idx] ?? '';
      const baseExists = !!(existing && runsText(existing) === prevLine);

      // Path A: use captured pre-input cursor (most accurate — set in handleKeyDown).
      if (prePos && prePos.lineIndex === idx) {
        const insertOffset = prePos.offset;
        const selEnd = prePos.endLineIndex === idx ? prePos.endOffset : prevLine.length;
        const rightSurvived = prevLine.length - selEnd;
        const insertedLen = line.length - insertOffset - rightSurvived;

        if (insertedLen > 0) {
          const inserted = line.slice(insertOffset, insertOffset + insertedLen);
          const baseRuns = baseExists ? existing! : [{ text: prevLine }];
          const afterDelete = selEnd > insertOffset
            ? deleteRangeFromLineRuns(baseRuns, insertOffset, selEnd)
            : baseRuns;
          // Apply pending format; fall back to inheriting the adjacent run's format.
          const withFormat = insertIntoLineRuns(afterDelete, insertOffset, inserted, pending ?? undefined);
          if (pending !== null) needRepaint = true;
          return withFormat;
        }
      }

      // Path B: infer from post-input cursor. Handles:
      //   • prePos null after toolbar click (browser lost the selection briefly)
      //   • normal typing with pending=null (preserves rich structure instead of plain fallback)
      if (baseExists && postSel && postSel.start.lineIndex === idx) {
        const insertedLen = line.length - prevLine.length;
        if (insertedLen > 0) {
          const insertOffset = Math.max(0, postSel.start.offset - insertedLen);
          if (insertOffset <= prevLine.length) {
            const inserted = line.slice(insertOffset, insertOffset + insertedLen);
            const withFormat = insertIntoLineRuns(existing!, insertOffset, inserted, pending ?? undefined);
            if (pending !== null) needRepaint = true;
            return withFormat;
          }
        }
      }

      // True fallback: plain run (IME composition end, unexpected DOM mutations, etc.)
      return [{ text: line }];
    });

    linesRef.current = nextLines;
    runsRef.current = nextRuns;
    root.setAttribute(TEXT_EDITOR_ACTIVE_LINE_ATTR, String(activeLineRef.current));
    doCommit();

    if (needRepaint && postSel) {
      // Re-render with formatted spans and restore cursor.
      repaint(postSel.start.lineIndex, postSel.start.offset);
    }
  }, [doCommit, pushUndoForTyping, repaint]);

  const handlePointerUp = useCallback(() => {
    const root = rootRef.current;
    if (!root) return;
    const sel = imperativeSelectionRead(root, activeLineRef.current);
    if (sel) {
      activeLineRef.current = sel.start.lineIndex;
      root.setAttribute(TEXT_EDITOR_ACTIVE_LINE_ATTR, String(activeLineRef.current));
    }
    pendingFormatRef.current = null;
    syncFormatState();
  }, [syncFormatState]);

  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault();
    pushUndo();
    const root = e.currentTarget;
    const sel = imperativeSelectionRead(root, activeLineRef.current);
    if (!sel) return;
    const pasted = e.clipboardData.getData('text/plain').replace(/\r\n/g, '\n');
    const parts = pasted.split('\n');
    const { start, end } = sel;
    const lines = linesRef.current;
    const styles = stylesRef.current;
    const runs = runsRef.current;
    const aligns = lineAlignsRef.current;

    // Delete selection first if any
    let wLines = lines;
    let wRuns = runs;
    let wStyles = styles;
    let wAligns = aligns;
    if (!sel.collapsed) {
      const sRuns = runs[start.lineIndex] ?? [{ text: lines[start.lineIndex] ?? '' }];
      const eRuns = runs[end.lineIndex] ?? [{ text: lines[end.lineIndex] ?? '' }];
      const [leftR] = splitRunsAt(sRuns, start.offset);
      const [, rightR] = splitRunsAt(eRuns, end.offset);
      const merged = mergeAdjacentRuns([...leftR, ...rightR]);
      const mergedText = `${(lines[start.lineIndex] ?? '').slice(0, start.offset)}${(lines[end.lineIndex] ?? '').slice(end.offset)}`;
      wLines = [...lines.slice(0, start.lineIndex), mergedText, ...lines.slice(end.lineIndex + 1)];
      wRuns = [...runs.slice(0, start.lineIndex), merged, ...runs.slice(end.lineIndex + 1)];
      wStyles = [...styles.slice(0, start.lineIndex), styles[start.lineIndex], ...styles.slice(end.lineIndex + 1)];
      wAligns = [...aligns.slice(0, start.lineIndex), aligns[start.lineIndex], ...aligns.slice(end.lineIndex + 1)];
    }

    const before = (wLines[start.lineIndex] ?? '').slice(0, start.offset);
    const after = (wLines[start.lineIndex] ?? '').slice(start.offset);
    const pasteRuns = wRuns[start.lineIndex] ?? [{ text: wLines[start.lineIndex] ?? '' }];
    const pasteFormat = getFormatAtOffset(pasteRuns, start.offset);

    const replacement = parts.length === 1
      ? [`${before}${parts[0]}${after}`]
      : [`${before}${parts[0]}`, ...parts.slice(1, -1), `${parts[parts.length - 1]}${after}`];

    // Build runs for pasted lines — each line inherits the format at the cursor position
    const simpleRunsArr = replacement.map((lineText) => [{ text: lineText, ...pasteFormat }]);

    const nextLines = [...wLines.slice(0, start.lineIndex), ...replacement, ...wLines.slice(start.lineIndex + 1)];
    const nextRuns = [...wRuns.slice(0, start.lineIndex), ...simpleRunsArr, ...wRuns.slice(start.lineIndex + 1)];
    const nextStyles = nextLines.map((_, idx) => {
      if (idx < start.lineIndex) return wStyles[idx];
      if (idx < start.lineIndex + replacement.length) return wStyles[start.lineIndex];
      return wStyles[idx - replacement.length + 1];
    });
    const nextAligns = nextLines.map((_, idx) => {
      if (idx < start.lineIndex) return wAligns[idx];
      if (idx < start.lineIndex + replacement.length) return wAligns[start.lineIndex];
      return wAligns[idx - replacement.length + 1];
    });

    linesRef.current = nextLines;
    runsRef.current = nextRuns;
    stylesRef.current = nextStyles;
    lineAlignsRef.current = nextAligns;
    const nextActive = start.lineIndex + replacement.length - 1;
    activeLineRef.current = nextActive;
    repaint(nextActive, replacement[replacement.length - 1].length - after.length);
    doCommit();
  }, [doCommit, pushUndo, repaint]);

  const handleCut = useCallback((e: React.ClipboardEvent<HTMLDivElement>) => {
    const root = e.currentTarget;
    const sel = imperativeSelectionRead(root, activeLineRef.current);
    if (!sel || sel.collapsed) return;
    pushUndo();
    const { start, end } = sel;
    const lines = linesRef.current;
    const selectedLines = lines.slice(start.lineIndex, end.lineIndex + 1);
    selectedLines[0] = selectedLines[0].slice(start.offset);
    selectedLines[selectedLines.length - 1] = selectedLines[selectedLines.length - 1].slice(
      0, end.offset - (start.lineIndex === end.lineIndex ? start.offset : 0)
    );
    e.clipboardData.setData('text/plain', selectedLines.join('\n'));
    e.preventDefault();
    handleBackspaceImperative(root, sel);
  }, [handleBackspaceImperative, pushUndo]);

  return (
    <div
      ref={rootRef}
      {...{ [TEXT_EDITOR_ROOT_ATTR]: 'true' }}
      contentEditable
      suppressContentEditableWarning
      className="block w-full flex-1 min-h-0 overflow-auto rounded border-0 bg-transparent p-1 focus:outline-none focus:ring-2 focus:ring-brand-red/90 select-text"
      style={{ ...textStyle, whiteSpace: 'pre-wrap' }}
      onInput={handleInput}
      onBeforeInput={handleBeforeInput}
      onKeyDown={handleKeyDown}
      onPointerUp={handlePointerUp}
      onPaste={handlePaste}
      onCut={handleCut}
      onCompositionStart={() => { composingRef.current = true; }}
      onCompositionEnd={() => { composingRef.current = false; }}
      onPointerDown={(e) => e.stopPropagation()}
      onPointerMove={(e) => e.stopPropagation()}
      // No children — DOM managed imperatively via repaint()
    />
  );
}

type ResizeHandle = 'n' | 's' | 'e' | 'w' | 'nw' | 'ne' | 'sw' | 'se';

const HANDLES: { position: string; cursor: string; dir: ResizeHandle }[] = [
  { position: 'left-0 top-0 -translate-x-1/2 -translate-y-1/2', cursor: 'nw-resize', dir: 'nw' },
  { position: 'left-1/2 top-0 -translate-x-1/2 -translate-y-1/2', cursor: 'n-resize', dir: 'n' },
  { position: 'right-0 top-0 translate-x-1/2 -translate-y-1/2', cursor: 'ne-resize', dir: 'ne' },
  { position: 'right-0 top-1/2 translate-x-1/2 -translate-y-1/2', cursor: 'e-resize', dir: 'e' },
  { position: 'right-0 bottom-0 translate-x-1/2 translate-y-1/2', cursor: 'se-resize', dir: 'se' },
  { position: 'left-1/2 bottom-0 -translate-x-1/2 translate-y-1/2', cursor: 's-resize', dir: 's' },
  { position: 'left-0 bottom-0 -translate-x-1/2 translate-y-1/2', cursor: 'sw-resize', dir: 'sw' },
  { position: 'left-0 top-1/2 -translate-x-1/2 -translate-y-1/2', cursor: 'w-resize', dir: 'w' },
];

function contentBounds(margins: TemplateMargins | null | undefined, w: number, h: number) {
  const L = margins?.left_pct ?? 0;
  const R = margins?.right_pct ?? 0;
  const T = margins?.top_pct ?? 0;
  const B = margins?.bottom_pct ?? 0;
  return {
    minX: L,
    maxX: Math.max(L, 100 - R - w),
    minY: T,
    maxY: Math.max(T, 100 - B - h),
  };
}

/** Block elements can be placed anywhere on the canvas (e.g. to block a zone). */
function contentBoundsBlock(w: number, h: number) {
  return {
    minX: 0,
    maxX: Math.max(0, 100 - w),
    minY: 0,
    maxY: Math.max(0, 100 - h),
  };
}

function rectsOverlap(
  x1: number,
  y1: number,
  w1: number,
  h1: number,
  x2: number,
  y2: number,
  w2: number,
  h2: number
): boolean {
  return x1 < x2 + w2 && x1 + w1 > x2 && y1 < y2 + h2 && y1 + h1 > y2;
}

function overlapsAnyBlock(
  x_pct: number,
  y_pct: number,
  width_pct: number,
  height_pct: number,
  blocks: DocElement[],
  excludeId?: string
): boolean {
  return blocks.some(
    (b) =>
      b.id !== excludeId &&
      rectsOverlap(x_pct, y_pct, width_pct, height_pct, b.x_pct ?? 0, b.y_pct ?? 0, b.width_pct ?? 10, b.height_pct ?? 10)
  );
}

// --- Snap guides (alignment lines when dragging) ---
const SNAP_THRESHOLD_PCT = 2.5;
/** Only consider alignment to elements in the same "band" (vertical band for vertical lines, horizontal for horizontal). */
const PROXIMITY_BAND_PCT = 18;

function getReferenceLines(
  elements: DocElement[],
  movingIds: string[],
  margins: TemplateMargins | null | undefined,
  movingBbox: { left: number; right: number; top: number; bottom: number }
): { vertical: number[]; horizontal: number[] } {
  const vertical = new Set<number>();
  const horizontal = new Set<number>();
  const { left: mL, right: mR, top: mT, bottom: mB } = movingBbox;
  const L = margins?.left_pct ?? 0;
  const R = margins?.right_pct ?? 0;
  const T = margins?.top_pct ?? 0;
  const B = margins?.bottom_pct ?? 0;
  if (Math.abs(mL - L) <= PROXIMITY_BAND_PCT || Math.abs(mR - (100 - R)) <= PROXIMITY_BAND_PCT) {
    vertical.add(L);
    vertical.add(100 - R);
  }
  if (Math.abs(mT - T) <= PROXIMITY_BAND_PCT || Math.abs(mB - (100 - B)) <= PROXIMITY_BAND_PCT) {
    horizontal.add(T);
    horizontal.add(100 - B);
  }
  elements.forEach((el) => {
    if (movingIds.includes(el.id)) return;
    const x = el.x_pct ?? 10;
    const y = el.y_pct ?? 20;
    const w = el.width_pct ?? 80;
    const h = el.height_pct ?? 8;
    const elRight = x + w;
    const elBottom = y + h;
    const verticalOverlap = elBottom >= mT - PROXIMITY_BAND_PCT && y <= mB + PROXIMITY_BAND_PCT;
    if (verticalOverlap) {
      vertical.add(x);
      vertical.add(x + w / 2);
      vertical.add(elRight);
    }
    const horizontalOverlap = elRight >= mL - PROXIMITY_BAND_PCT && x <= mR + PROXIMITY_BAND_PCT;
    if (horizontalOverlap) {
      horizontal.add(y);
      horizontal.add(y + h / 2);
      horizontal.add(elBottom);
    }
  });
  return {
    vertical: Array.from(vertical),
    horizontal: Array.from(horizontal),
  };
}

function getGroupBbox(
  movingIds: string[],
  startPositions: Record<string, { x_pct: number; y_pct: number }>,
  elements: DocElement[],
  dx: number,
  dy: number
): { left: number; right: number; top: number; bottom: number; centerX: number; centerY: number } {
  let left = 100;
  let right = 0;
  let top = 100;
  let bottom = 0;
  movingIds.forEach((id) => {
    const pos = startPositions[id];
    const el = elements.find((e) => e.id === id);
    if (!pos || !el) return;
    const w = el.width_pct ?? 80;
    const h = el.height_pct ?? 8;
    const x = pos.x_pct + dx;
    const y = pos.y_pct + dy;
    left = Math.min(left, x);
    right = Math.max(right, x + w);
    top = Math.min(top, y);
    bottom = Math.max(bottom, y + h);
  });
  return {
    left,
    right,
    top,
    bottom,
    centerX: (left + right) / 2,
    centerY: (top + bottom) / 2,
  };
}

function computeSnap(
  bbox: { left: number; right: number; top: number; bottom: number; centerX: number; centerY: number },
  refV: number[],
  refH: number[],
  dx: number,
  dy: number
): { dx: number; dy: number; guides: { v: number[]; h: number[] } } {
  const guides = { v: [] as number[], h: [] as number[] };
  let outDx = dx;
  let outDy = dy;

  let bestDistV = SNAP_THRESHOLD_PCT + 1;
  for (const V of refV) {
    for (const anchor of [bbox.left, bbox.centerX, bbox.right] as const) {
      const current = anchor + dx;
      const dist = Math.abs(current - V);
      if (dist <= SNAP_THRESHOLD_PCT && dist < bestDistV) {
        bestDistV = dist;
        outDx = V - anchor;
        guides.v = [V];
      }
    }
  }

  let bestDistH = SNAP_THRESHOLD_PCT + 1;
  for (const H of refH) {
    for (const anchor of [bbox.top, bbox.centerY, bbox.bottom] as const) {
      const current = anchor + dy;
      const dist = Math.abs(current - H);
      if (dist <= SNAP_THRESHOLD_PCT && dist < bestDistH) {
        bestDistH = dist;
        outDy = H - anchor;
        guides.h = [H];
      }
    }
  }

  return { dx: outDx, dy: outDy, guides };
}

function applyResize(
  handle: ResizeHandle,
  dx: number,
  dy: number,
  startX: number,
  startY: number,
  startW: number,
  startH: number,
  margins?: TemplateMargins | null
): { x_pct: number; y_pct: number; width_pct: number; height_pct: number } {
  const L = margins?.left_pct ?? 0;
  const R = margins?.right_pct ?? 0;
  const T = margins?.top_pct ?? 0;
  const B = margins?.bottom_pct ?? 0;
  const maxW = 100 - L - R;
  const maxH = 100 - T - B;
  let x = startX,
    y = startY,
    w = startW,
    h = startH;
  switch (handle) {
    case 'se':
      w = startW + dx;
      h = startH + dy;
      break;
    case 'sw':
      x = startX + dx;
      w = startW - dx;
      h = startH + dy;
      break;
    case 'ne':
      w = startW + dx;
      y = startY + dy;
      h = startH - dy;
      break;
    case 'nw':
      x = startX + dx;
      w = startW - dx;
      y = startY + dy;
      h = startH - dy;
      break;
    case 'e':
      w = startW + dx;
      break;
    case 'w':
      x = startX + dx;
      w = startW - dx;
      break;
    case 's':
      h = startH + dy;
      break;
    case 'n':
      y = startY + dy;
      h = startH - dy;
      break;
  }
  w = Math.max(MIN_SIZE_PCT, Math.min(maxW, w));
  h = Math.max(MIN_SIZE_PCT, Math.min(maxH, h));
  const b = contentBounds(margins, w, h);
  x = Math.max(b.minX, Math.min(b.maxX, x));
  y = Math.max(b.minY, Math.min(b.maxY, y));
  return { x_pct: x, y_pct: y, width_pct: w, height_pct: h };
}

function applyResizeBlock(
  handle: ResizeHandle,
  dx: number,
  dy: number,
  startX: number,
  startY: number,
  startW: number,
  startH: number
): { x_pct: number; y_pct: number; width_pct: number; height_pct: number } {
  const maxW = 100;
  const maxH = 100;
  let x = startX,
    y = startY,
    w = startW,
    h = startH;
  switch (handle) {
    case 'se':
      w = startW + dx;
      h = startH + dy;
      break;
    case 'sw':
      x = startX + dx;
      w = startW - dx;
      h = startH + dy;
      break;
    case 'ne':
      w = startW + dx;
      y = startY + dy;
      h = startH - dy;
      break;
    case 'nw':
      x = startX + dx;
      w = startW - dx;
      y = startY + dy;
      h = startH - dy;
      break;
    case 'e':
      w = startW + dx;
      break;
    case 'w':
      x = startX + dx;
      w = startW - dx;
      break;
    case 's':
      h = startH + dy;
      break;
    case 'n':
      y = startY + dy;
      h = startH - dy;
      break;
  }
  w = Math.max(MIN_SIZE_PCT, Math.min(maxW, w));
  h = Math.max(MIN_SIZE_PCT, Math.min(maxH, h));
  const b = contentBoundsBlock(w, h);
  x = Math.max(b.minX, Math.min(b.maxX, x));
  y = Math.max(b.minY, Math.min(b.maxY, y));
  return { x_pct: x, y_pct: y, width_pct: w, height_pct: h };
}

export default function DocumentPreview({
  backgroundUrl,
  elements,
  margins,
  blockAreasVisible = true,
  lockBlockElements = false,
  showElementOptionsPopover = true,
  onCanvasWidthPxChange,
  onBeginUserAction,
  zoom = 1,
  onElementClick,
  onCanvasClick,
  selectedElementIds,
  onUpdateElement,
  onRemoveElement,
  onReplaceImage,
  onReplaceImageClick,
  embedded = false,
  embedScrollParentRef,
  onPageInteraction,
  scrollToTopKey = null,
  onTextEditingChange,
  editingElementId: controlledEditingElementId,
  onEditingElementIdChange,
}: DocumentPreviewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [canvasWidthPx, setCanvasWidthPx] = useState<number>(REFERENCE_CANVAS_WIDTH_PX);
  const panRef = useRef<{ active: boolean; startX: number; startY: number; startLeft: number; startTop: number }>({
    active: false,
    startX: 0,
    startY: 0,
    startLeft: 0,
    startTop: 0,
  });
  const [spaceDown, setSpaceDown] = useState(false);
  const dragRef = useRef<{
    movingIds: string[];
    startPositions: Record<string, { x_pct: number; y_pct: number }>;
    startX: number;
    startY: number;
    hasMoved: boolean;
    historyPushed: boolean;
  } | null>(null);
  const resizeRef = useRef<{
    elementId: string;
    handle: ResizeHandle;
    startX: number;
    startY: number;
    startX_pct: number;
    startY_pct: number;
    startW_pct: number;
    startH_pct: number;
    hasResized: boolean;
  } | null>(null);
  const [uncontrolledEditingElementId, setUncontrolledEditingElementId] = useState<string | null>(null);
  const isEditingControlled = onEditingElementIdChange != null;
  const editingElementId = isEditingControlled
    ? (controlledEditingElementId ?? null)
    : uncontrolledEditingElementId;
  const setEditingElementId = useCallback(
    (next: string | null) => {
      onEditingElementIdChange?.(next);
      if (!isEditingControlled) setUncontrolledEditingElementId(next);
    },
    [isEditingControlled, onEditingElementIdChange],
  );
  /** Guide lines shown during drag when snapping to other elements/margins */
  const [dragGuideLines, setDragGuideLines] = useState<{ v: number[]; h: number[] } | null>(null);

  useEffect(() => {
    onTextEditingChange?.(editingElementId);
  }, [editingElementId, onTextEditingChange]);

  const isOtherElementWhileEditing = useCallback(
    (elementId: string) => editingElementId != null && editingElementId !== elementId,
    [editingElementId],
  );

  /** Keep caret in the text block when clicking the canvas outside (edit mode stays active). */
  useEffect(() => {
    if (!editingElementId) return;
    const onPointerDownCapture = (e: PointerEvent) => {
      if (e.button !== 0) return;
      const t = e.target;
      if (!(t instanceof Element)) return;
      if (t.closest(`[${INLINE_TEXT_EDITOR_ATTR}="${editingElementId}"]`)) return;
      if (t.closest(DOCUMENT_EDITOR_FORMATTING_SELECTOR)) return;
      if (t.closest(DOCUMENT_EDITOR_OVERLAY_SELECTOR)) return;
      if (t.closest(DOCUMENT_TEXT_EDIT_TOOLBAR_SELECTOR)) return;
      const otherTextBox = t.closest(`[${DOCUMENT_TEXT_ELEMENT_ATTR}]`);
      if (otherTextBox instanceof HTMLElement) {
        const otherId = otherTextBox.getAttribute(DOCUMENT_TEXT_ELEMENT_ATTR);
        if (otherId && otherId !== editingElementId) return;
      }
      e.preventDefault();
    };
    document.addEventListener('pointerdown', onPointerDownCapture, true);
    return () => document.removeEventListener('pointerdown', onPointerDownCapture, true);
  }, [editingElementId]);

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const update = () => {
      const w = el.getBoundingClientRect().width || REFERENCE_CANVAS_WIDTH_PX;
      setCanvasWidthPx(w);
      // Report logical (unzoomed) canvas width for export fidelity.
      onCanvasWidthPxChange?.(w / Math.max(0.01, zoom));
    };
    update();
    // Keep it stable across resizes so wrapping/size doesn't change relative to the page.
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(() => update());
      ro.observe(el);
      return () => ro.disconnect();
    }
    // Fallback for older browsers/environments without ResizeObserver
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [onCanvasWidthPxChange, zoom]);

  useLayoutEffect(() => {
    if (!scrollToTopKey) return;
    const sc =
      embedded && embedScrollParentRef?.current ? embedScrollParentRef.current : scrollRef.current;
    if (!sc) return;
    const scrollToTop = () => {
      sc.scrollTop = 0;
    };
    scrollToTop();
    requestAnimationFrame(scrollToTop);
  }, [scrollToTopKey, embedded, embedScrollParentRef]);

  // Spacebar pan (like design tools). We don't intercept when typing.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName?.toLowerCase();
      const isTyping = tag === 'input' || tag === 'textarea' || tag === 'select' || (t?.isContentEditable ?? false);
      if (isTyping) return;
      if (e.code === 'Space') {
        setSpaceDown(true);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') setSpaceDown(false);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  const commitInlineEdit = useCallback(() => {
    setEditingElementId(null);
  }, [setEditingElementId]);

  const notifyBlockedByTextEdit = useCallback(() => {
    notifyTextEditBlocking(commitInlineEdit);
  }, [commitInlineEdit]);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent, el: DocElement) => {
      e.stopPropagation();
      if (isOtherElementWhileEditing(el.id)) {
        notifyBlockedByTextEdit();
        return;
      }
      onPageInteraction?.();
      if (e.button !== 0) return;
      if (el.type === 'block' && lockBlockElements) return;
      const target = e.target as HTMLElement;
      if (editingElementId === el.id) {
        if (target.closest('[contenteditable="true"]')) return;
        return;
      }
      if (target.closest('textarea') || target.closest('input') || target.closest('[contenteditable="true"]')) return;
      // Locked / position-locked: no drag, but capture pointer so click still selects (unlock, ribbon, etc.).
      const movingIds = el.locked || el.lockPosition
        ? []
        : selectedElementIds.includes(el.id)
          ? selectedElementIds.filter((id) => {
              const o = elements.find((x) => x.id === id);
              return o && !o.locked && !o.lockPosition;
            })
          : [el.id];
      const startPositions: Record<string, { x_pct: number; y_pct: number }> = {};
      movingIds.forEach((id) => {
        const o = elements.find((x) => x.id === id);
        if (o) startPositions[id] = { x_pct: o.x_pct ?? 10, y_pct: o.y_pct ?? 20 };
      });
      dragRef.current = {
        movingIds,
        startPositions,
        startX: e.clientX,
        startY: e.clientY,
        hasMoved: false,
        historyPushed: false,
      };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    },
    [lockBlockElements, selectedElementIds, elements, onPageInteraction, isOtherElementWhileEditing, editingElementId, notifyBlockedByTextEdit]
  );

  const handleResizePointerDown = useCallback(
    (e: React.PointerEvent, el: DocElement, handle: ResizeHandle) => {
      e.stopPropagation();
      if (isOtherElementWhileEditing(el.id)) {
        notifyBlockedByTextEdit();
        return;
      }
      onPageInteraction?.();
      if (e.button !== 0) return;
      if (el.locked) return;
      if (el.lockPosition) return;
      if (el.type === 'block' && lockBlockElements) return;
      resizeRef.current = {
        elementId: el.id,
        handle,
        startX: e.clientX,
        startY: e.clientY,
        startX_pct: el.x_pct ?? 10,
        startY_pct: el.y_pct ?? 20,
        startW_pct: el.width_pct ?? 80,
        startH_pct: el.height_pct ?? 8,
        hasResized: false,
      };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    },
    [lockBlockElements, onPageInteraction, isOtherElementWhileEditing, notifyBlockedByTextEdit],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || !canvasRef.current || !onUpdateElement) return;
      if (drag.movingIds.length === 0) return;
      const rect = canvasRef.current.getBoundingClientRect();
      let dx = ((e.clientX - drag.startX) / rect.width) * 100;
      let dy = ((e.clientY - drag.startY) / rect.height) * 100;
      if (e.shiftKey) {
        if (Math.abs(dx) > Math.abs(dy)) dy = 0;
        else dx = 0;
      }
      const bbox = getGroupBbox(drag.movingIds, drag.startPositions, elements, dx, dy);
      const { vertical: refV, horizontal: refH } = getReferenceLines(elements, drag.movingIds, margins, bbox);
      const snapped = computeSnap(bbox, refV, refH, dx, dy);
      // Show guide lines when close to alignment, but do not snap (use raw dx, dy)
      const hasGuides = snapped.guides.v.length > 0 || snapped.guides.h.length > 0;
      setDragGuideLines(hasGuides ? snapped.guides : null);
      const movedEnough = Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5;
      if (!drag.historyPushed && !movedEnough) return;
      if (movedEnough) {
        if (!drag.historyPushed) {
          onBeginUserAction?.();
          drag.historyPushed = true;
        }
        drag.hasMoved = true;
      }
      const blocks = elements.filter((x) => x.type === 'block');
      drag.movingIds.forEach((elementId) => {
        const el = elements.find((x) => x.id === elementId);
        if (!el) return;
        const pos = drag.startPositions[elementId];
        if (!pos) return;
        const isBlock = el.type === 'block';
        const w = el.width_pct ?? 80;
        const h = el.height_pct ?? 8;
        const b = isBlock ? contentBoundsBlock(w, h) : contentBounds(margins, w, h);
        const newX_pct = Math.max(b.minX, Math.min(b.maxX, pos.x_pct + dx));
        const newY_pct = Math.max(b.minY, Math.min(b.maxY, pos.y_pct + dy));
        if (!isBlock && overlapsAnyBlock(newX_pct, newY_pct, w, h, blocks, elementId)) return;
        onUpdateElement(elementId, (prev) => ({ ...prev, x_pct: newX_pct, y_pct: newY_pct }));
      });
    },
    [onUpdateElement, onBeginUserAction, margins, elements]
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent, el: DocElement) => {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      const drag = dragRef.current;
      dragRef.current = null;
      setDragGuideLines(null);
      if (isOtherElementWhileEditing(el.id)) return;
      // Select on click: drag of this id, or locked / position-locked (movingIds empty — no drag)
      if (drag && !drag.hasMoved && (drag.movingIds.includes(el.id) || drag.movingIds.length === 0)) {
        onElementClick?.(el.id, e);
      }
    },
    [onElementClick, isOtherElementWhileEditing],
  );

  const handleResizePointerUp = useCallback((e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    resizeRef.current = null;
  }, []);

  useEffect(() => {
    if (!onUpdateElement) return;
    const onDocMove = (e: PointerEvent) => {
      const drag = dragRef.current;
      if (drag && canvasRef.current) {
        if (drag.movingIds.length === 0) return;
        const rect = canvasRef.current.getBoundingClientRect();
        let dx = ((e.clientX - drag.startX) / rect.width) * 100;
        let dy = ((e.clientY - drag.startY) / rect.height) * 100;
        if (e.shiftKey) {
          if (Math.abs(dx) > Math.abs(dy)) dy = 0;
          else dx = 0;
        }
        const bbox = getGroupBbox(drag.movingIds, drag.startPositions, elements, dx, dy);
        const { vertical: refV, horizontal: refH } = getReferenceLines(elements, drag.movingIds, margins, bbox);
        const snapped = computeSnap(bbox, refV, refH, dx, dy);
        const hasGuides = snapped.guides.v.length > 0 || snapped.guides.h.length > 0;
        setDragGuideLines(hasGuides ? snapped.guides : null);
        const movedEnough = Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5;
        if (!drag.historyPushed && !movedEnough) return;
        if (movedEnough) {
          if (!drag.historyPushed) {
            onBeginUserAction?.();
            drag.historyPushed = true;
          }
          drag.hasMoved = true;
        }
        const blocks = elements.filter((x) => x.type === 'block');
        drag.movingIds.forEach((elementId) => {
          const el = elements.find((x) => x.id === elementId);
          if (!el) return;
          const pos = drag.startPositions[elementId];
          if (!pos) return;
          const isBlock = el.type === 'block';
          const w = el.width_pct ?? 80;
          const h = el.height_pct ?? 8;
          const b = isBlock ? contentBoundsBlock(w, h) : contentBounds(margins, w, h);
          const newX_pct = Math.max(b.minX, Math.min(b.maxX, pos.x_pct + dx));
          const newY_pct = Math.max(b.minY, Math.min(b.maxY, pos.y_pct + dy));
          if (!isBlock && overlapsAnyBlock(newX_pct, newY_pct, w, h, blocks, elementId)) return;
          onUpdateElement(elementId, (prev) => ({ ...prev, x_pct: newX_pct, y_pct: newY_pct }));
        });
        return;
      }
      const resize = resizeRef.current;
      if (resize && canvasRef.current) {
        const el = elements.find((x) => x.id === resize.elementId);
        const blocks = elements.filter((x) => x.type === 'block');
        const isBlock = el?.type === 'block';
        const rect = canvasRef.current.getBoundingClientRect();
        const dx = ((e.clientX - resize.startX) / rect.width) * 100;
        const dy = ((e.clientY - resize.startY) / rect.height) * 100;
        if (!resize.hasResized && (Math.abs(dx) > 0.2 || Math.abs(dy) > 0.2)) {
          onBeginUserAction?.();
          resize.hasResized = true;
        }
        const next = isBlock
          ? applyResizeBlock(resize.handle, dx, dy, resize.startX_pct, resize.startY_pct, resize.startW_pct, resize.startH_pct)
          : applyResize(resize.handle, dx, dy, resize.startX_pct, resize.startY_pct, resize.startW_pct, resize.startH_pct, margins);
        if (!isBlock && overlapsAnyBlock(next.x_pct, next.y_pct, next.width_pct, next.height_pct, blocks, resize.elementId)) return;
        onUpdateElement(resize.elementId, (el) => ({ ...el, ...next }));
      }
    };
    const onDocUp = () => {
      dragRef.current = null;
      resizeRef.current = null;
      setDragGuideLines(null);
    };
    document.addEventListener('pointermove', onDocMove);
    document.addEventListener('pointerup', onDocUp);
    document.addEventListener('pointercancel', onDocUp);
    return () => {
      document.removeEventListener('pointermove', onDocMove);
      document.removeEventListener('pointerup', onDocUp);
      document.removeEventListener('pointercancel', onDocUp);
    };
  }, [onUpdateElement, onBeginUserAction, margins, elements]);

  const startTextEdit = useCallback(
    (el: DocElement, e?: React.MouseEvent) => {
      if (el.locked || el.type !== 'text') return;
      if (editingElementId === el.id) return;
      setEditingElementId(el.id);
      onElementClick?.(el.id, e);
    },
    [editingElementId, setEditingElementId, onElementClick],
  );

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent, el: DocElement) => {
      e.stopPropagation();
      startTextEdit(el, e);
    },
    [startTextEdit],
  ); // lockPosition does not block double-click to edit

  const selectedElement = selectedElementIds.length === 1 ? elements.find((e) => e.id === selectedElementIds[0]) : null;

  const getPanScrollEl = useCallback((): HTMLElement | null => {
    if (embedded && embedScrollParentRef?.current) return embedScrollParentRef.current;
    return scrollRef.current;
  }, [embedded, embedScrollParentRef]);

  const scrollAreaClassName = embedded
    ? `flex w-full flex-shrink-0 items-center justify-center px-4 sm:px-6 ${editorCanvasScrollAreaClass} ${spaceDown ? 'cursor-grab' : ''}`
    : `flex min-h-0 flex-1 items-start justify-center overflow-auto ${editorCanvasScrollAreaClass} px-8 pt-5 pb-12 sm:px-16 sm:pt-6 sm:pb-16 ${spaceDown ? 'cursor-grab' : ''}`;

  const outerChromeClass = embedded
    ? 'flex w-full min-w-0 flex-shrink-0 flex-col'
    : 'relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm ring-1 ring-slate-900/[0.04]';

  return (
    <div className={outerChromeClass}>
      {!embedded && (
        <div className="flex items-center justify-between border-b border-slate-200/85 bg-slate-50/95 px-4 py-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Canvas</span>
          <span className="text-[10px] font-medium text-slate-500">A4 preview</span>
        </div>
      )}
      {showElementOptionsPopover &&
        selectedElement &&
        onUpdateElement &&
        onRemoveElement &&
        !(selectedElement.type === 'block' && !blockAreasVisible) &&
        !(selectedElement.type === 'block' && lockBlockElements) && (
        <ElementOptionsPopover
          element={selectedElement}
          onUpdate={onUpdateElement}
          onRemove={(id) => {
            onRemoveElement(id);
            onCanvasClick?.();
          }}
          onClose={() => onCanvasClick?.()}
          onReplaceImage={onReplaceImage}
          onReplaceImageClick={onReplaceImageClick}
        />
      )}
      <div
        ref={embedded ? undefined : scrollRef}
        className={scrollAreaClassName}
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            if (embedded) onPageInteraction?.();
            if (editingElementId) {
              notifyBlockedByTextEdit();
              return;
            }
            onCanvasClick?.();
          }
        }}
        onPointerDown={(e) => {
          if (embedded) onPageInteraction?.();
          if (!spaceDown || e.button !== 0) return;
          const sc = getPanScrollEl();
          if (!sc) return;
          panRef.current = {
            active: true,
            startX: e.clientX,
            startY: e.clientY,
            startLeft: sc.scrollLeft,
            startTop: sc.scrollTop,
          };
          (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
        }}
        onPointerMove={(e) => {
          const sc = getPanScrollEl();
          if (!sc || !panRef.current.active) return;
          sc.scrollLeft = panRef.current.startLeft - (e.clientX - panRef.current.startX);
          sc.scrollTop = panRef.current.startTop - (e.clientY - panRef.current.startY);
        }}
        onPointerUp={(e) => {
          if (!panRef.current.active) return;
          panRef.current.active = false;
          (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
        }}
        onPointerCancel={() => {
          panRef.current.active = false;
        }}
      >
        <div
          ref={canvasRef}
          className="relative flex-shrink-0 select-none overflow-visible rounded-xl bg-white shadow-[0_12px_40px_-12px_rgba(15,23,42,0.12),0_4px_16px_-4px_rgba(15,23,42,0.08),inset_0_1px_0_rgba(255,255,255,1)] ring-1 ring-slate-900/[0.06]"
          style={{
            aspectRatio: `${A4_ASPECT}`,
            width: `${Math.max(0.25, zoom) * 100}%`,
            minWidth: 280 * zoom,
            maxWidth: 1200 * zoom,
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              if (embedded) onPageInteraction?.();
              if (editingElementId) {
                notifyBlockedByTextEdit();
                return;
              }
              onCanvasClick?.();
            }
          }}
        >
          {backgroundUrl && (
            <img
              src={backgroundUrl}
              alt=""
              className="pointer-events-none absolute inset-0 h-full w-full rounded-xl object-cover"
            />
          )}
          {!backgroundUrl && (
            <div className="pointer-events-none absolute inset-0 rounded-xl bg-gradient-to-br from-white to-slate-100" />
          )}
          {margins && (
            <>
              {/* Off-limits margin bands: soft diagonal hatch */}
              {(margins.left_pct ?? 0) > 0 && (
                <div
                  className={`pointer-events-none absolute inset-y-0 left-0 rounded-l-xl ${marginBandRingClass}`}
                  style={{
                    width: `${margins.left_pct}%`,
                    background: MARGIN_PROTECTED_BG,
                  }}
                />
              )}
              {(margins.right_pct ?? 0) > 0 && (
                <div
                  className={`pointer-events-none absolute inset-y-0 right-0 rounded-r-xl ${marginBandRingClass}`}
                  style={{
                    width: `${margins.right_pct}%`,
                    background: MARGIN_PROTECTED_BG,
                  }}
                />
              )}
              {(margins.top_pct ?? 0) > 0 && (
                <div
                  className={`pointer-events-none absolute inset-x-0 top-0 rounded-t-xl ${marginBandRingClass}`}
                  style={{
                    height: `${margins.top_pct}%`,
                    background: MARGIN_PROTECTED_BG,
                  }}
                />
              )}
              {(margins.bottom_pct ?? 0) > 0 && (
                <div
                  className={`pointer-events-none absolute inset-x-0 bottom-0 rounded-b-xl ${marginBandRingClass}`}
                  style={{
                    height: `${margins.bottom_pct}%`,
                    background: MARGIN_PROTECTED_BG,
                  }}
                />
              )}
            </>
          )}
          {elements.map((el) => {
            if (el.type === 'block' && !blockAreasVisible) return null;
            const x = (el.x_pct ?? 10) / 100;
            const y = (el.y_pct ?? 20) / 100;
            const w = (el.width_pct ?? 80) / 100;
            const h = (el.height_pct ?? 8) / 100;
            const isSelected = selectedElementIds.includes(el.id);
            const isEditing = editingElementId === el.id && el.type === 'text' && !el.locked;
            const isBlock = el.type === 'block';
            const isLocked = !!el.locked;
            const isPositionLocked = !!el.lockPosition;
            const showHandles = isSelected && !isEditing && !(isBlock && lockBlockElements) && !isLocked && !isPositionLocked && selectedElementIds.length === 1;
            const isImagePlaceholder = el.type === 'image' && !el.content;
            const showTextEditButton =
              el.type === 'text' && isSelected && !isEditing && !isLocked && selectedElementIds.length === 1;
            const textFloatingToolbarStyle: React.CSSProperties = {
              left: `${(x + w) * 100}%`,
              top: `${y * 100}%`,
              transform: 'translate(-100%, calc(-100% - 4px))',
            };

            return (
              <Fragment key={el.id}>
              {showTextEditButton && !editingElementId && (
                <div
                  className={`absolute z-[3] w-max ${editorSegmentedControlTrackClass}`}
                  style={textFloatingToolbarStyle}
                >
                  {onUpdateElement && (
                    <button
                      type="button"
                      className={`${DOCUMENT_PREVIEW_FLOATING_SEGMENT_BTN_CLASS} ${
                        isPositionLocked
                          ? 'rounded-md bg-sky-100 text-sky-950 shadow-sm ring-1 ring-sky-400/50 hover:bg-sky-100'
                          : editorSegmentedSegmentIdleClass
                      }`}
                      title={isPositionLocked ? 'Allow move' : 'Block move (still edit text/image)'}
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        onUpdateElement(el.id, (prev) => ({ ...prev, lockPosition: !prev.lockPosition }));
                      }}
                    >
                      <PinIcon className="h-3 w-3 shrink-0 opacity-90" />
                      {isPositionLocked ? 'Allow move' : 'Block move'}
                    </button>
                  )}
                  <button
                    type="button"
                    className={`${DOCUMENT_PREVIEW_FLOATING_SEGMENT_BTN_CLASS} ${editorSegmentedSegmentIdleClass}`}
                    title="Edit text"
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      startTextEdit(el, e);
                    }}
                  >
                    Edit
                  </button>
                </div>
              )}
              {isEditing && el.type === 'text' && (
                <div
                  data-document-text-edit-toolbar
                  className={`absolute z-[3] w-max ${editorSegmentedControlTrackClass}`}
                  style={textFloatingToolbarStyle}
                >
                  <button
                    type="button"
                    className={`${DOCUMENT_PREVIEW_FLOATING_SEGMENT_BTN_CLASS} ${editorSegmentedSegmentSelectedClass}`}
                    title="Finish editing"
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      commitInlineEdit();
                    }}
                  >
                    Done
                  </button>
                </div>
              )}
              <div
                {...(el.type === 'text' ? { [DOCUMENT_TEXT_ELEMENT_ATTR]: el.id } : {})}
                data-inline-text-editor={isEditing && el.type === 'text' ? el.id : undefined}
                onPointerDown={(e) => handlePointerDown(e, el)}
                onPointerMove={handlePointerMove}
                onPointerUp={(e) => handlePointerUp(e, el)}
                onPointerLeave={(e) => {
                  if (dragRef.current?.movingIds.includes(el.id)) {
                    (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
                  }
                }}
                onClick={(e) => e.stopPropagation()}
                onDoubleClick={(e) => handleDoubleClick(e, el)}
                className={`absolute rounded-md border transition-[border-color,box-shadow] duration-200 ease-out ${
                  isEditing ? 'cursor-text overflow-hidden' : isLocked ? 'cursor-pointer overflow-hidden' : isPositionLocked ? 'cursor-default overflow-hidden' : isBlock && lockBlockElements ? 'cursor-default overflow-hidden' : 'cursor-move'
                } ${
                  isEditing
                    ? 'z-[2] overflow-visible border-brand-red/55 shadow-[0_0_0_2px_rgba(220,38,38,0.32)] ring-2 ring-brand-red/50'
                    : isSelected
                      ? 'z-[1] overflow-visible border-brand-red/55 shadow-[0_0_0_2px_rgba(220,38,38,0.32)] ring-2 ring-brand-red/50'
                      : 'overflow-hidden border-transparent hover:border-slate-300/70'
                }`}
                style={{
                  left: `${x * 100}%`,
                  top: `${y * 100}%`,
                  width: `${w * 100}%`,
                  height: `${h * 100}%`,
                }}
              >
                {el.type === 'text' ? (
                  (() => {
                    const va = el.verticalAlign ?? 'top';
                    const justifyContent = va === 'top' ? 'flex-start' : va === 'bottom' ? 'flex-end' : 'center';
                    const scale = canvasWidthPx / REFERENCE_CANVAS_WIDTH_PX;
                    const refFontSize = Math.max(8, Math.min(72, el.fontSize ?? 12));
                    const textStyle: React.CSSProperties = {
                      fontSize: `${Math.max(6, refFontSize * scale)}px`,
                      textAlign: el.textAlign ?? 'left',
                      fontWeight: el.fontWeight ?? 'normal',
                      fontStyle: el.fontStyle ?? 'normal',
                      fontFamily: el.fontFamily === 'Open Sans' ? '"Open Sans", sans-serif' : '"Montserrat", sans-serif',
                      color: el.color ?? '#000000',
                    };
                    const textLines = contentLines(el.content);
                    const lineStyles = effectiveLineListStyles(el);
                    const editHint =
                      'Enter: new line. Click Done or press Escape to finish editing.';
                    return (
                      <div
                        className="relative flex h-full w-full flex-col"
                        style={{ justifyContent }}
                      >
                        {isEditing ? (
                          <InlineTextEditor
                            element={el}
                            textStyle={textStyle}
                            onCommit={(snapshot) =>
                              onUpdateElement?.(el.id, (prev) => ({
                                ...prev,
                                content: snapshot.content,
                                listStyle: undefined,
                                lineListStyles: snapshot.lineListStyles,
                                richLines: snapshot.richLines,
                                lineTextAligns: snapshot.lineTextAligns,
                              }))
                            }
                            onEscape={commitInlineEdit}
                          />
                        ) : el.richLines && el.richLines.length > 0 ? (
                          // ── Rich text display (per-run styled spans) ──────────────────
                          <div
                            className="block overflow-hidden whitespace-pre-wrap break-words p-1 min-h-[1em]"
                            style={{ ...textStyle, textAlign: undefined }}
                          >
                            {el.richLines.map((lineRuns, idx) => {
                              const listStyle = lineStyles[idx];
                              const lineAlign = el.lineTextAligns?.[idx] ?? el.textAlign ?? 'left';
                              return (
                                <div
                                  key={idx}
                                  className={listStyle ? 'flex min-h-[1.2em] items-baseline' : 'min-h-[1.2em]'}
                                  style={{ textAlign: lineAlign }}
                                >
                                  {listStyle && (
                                    <span className="mr-[0.45em] inline-block min-w-[1.35em] shrink-0 select-none text-right">
                                      {lineMarker(listStyle, listOrdinalAt(lineStyles, idx))}
                                    </span>
                                  )}
                                  <span className={listStyle ? 'min-w-0 flex-1' : undefined}>
                                    {lineRuns.map((run, ri) => {
                                      const rs = runDisplayStyle(run, refFontSize);
                                      return Object.keys(rs).length > 0
                                        ? <span key={ri} style={rs}>{run.text || '\u00a0'}</span>
                                        : <span key={ri}>{run.text || '\u00a0'}</span>;
                                    })}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        ) : lineStyles.some(Boolean) ? (
                          <div
                            className="block overflow-hidden whitespace-pre-wrap break-words p-1 min-h-[1em]"
                            style={textStyle}
                          >
                            {textLines.map((line, idx) => {
                              const style = lineStyles[idx];
                              return (
                                <div
                                  key={idx}
                                  className={style ? 'flex min-h-[1.2em] items-baseline' : 'min-h-[1.2em]'}
                                >
                                  {style && (
                                    <span className="mr-[0.45em] inline-block min-w-[1.35em] shrink-0 select-none text-right">
                                      {lineMarker(style, listOrdinalAt(lineStyles, idx))}
                                    </span>
                                  )}
                                  <span className={style ? 'min-w-0 flex-1' : undefined}>
                                    {line || '\u00a0'}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <span
                            className="block overflow-hidden whitespace-pre-wrap break-words p-1 min-h-[1em]"
                            style={textStyle}
                          >
                            {el.content || 'Clique para editar'}
                          </span>
                        )}
                      </div>
                    );
                  })()
                ) : el.type === 'block' ? (
                  <div
                    className={`pointer-events-none flex h-full w-full items-center justify-center rounded-md ${blockProtectedBorderClass}`}
                    style={{ background: BLOCK_PROTECTED_BG }}
                  >
                    <span className="text-[10px] font-medium uppercase tracking-wide text-amber-900/75 drop-shadow-[0_0_8px_rgba(255,255,255,0.95)]">
                      Blocked Area
                    </span>
                  </div>
                ) : isImagePlaceholder ? (
                  <div className="pointer-events-none flex h-full w-full items-center justify-center rounded-md border border-dashed border-slate-300 bg-slate-50/90">
                    <span className="text-[11px] font-medium text-slate-500">Image area</span>
                  </div>
                ) : (
                  el.content && (
                    <img
                      src={withFileAccessToken(`/files/${el.content}/thumbnail?w=${DOCUMENT_PREVIEW_IMAGE_WIDTH_PX}`)}
                      alt=""
                      className="w-full h-full pointer-events-none"
                      style={{
                        objectFit: el.imageFit ?? 'contain',
                        objectPosition: el.imagePosition ?? '50% 50%',
                      }}
                    />
                  )
                )}
                {showHandles &&
                  HANDLES.map(({ position, cursor, dir }) => (
                    <div
                      key={dir}
                      role="presentation"
                      className={`absolute h-2.5 w-2.5 rounded-full border border-white bg-white shadow-sm ring-[2px] ring-brand-red/75 transition-transform duration-200 ease-out hover:scale-110 hover:ring-brand-red ${position}`}
                      style={{ cursor }}
                      onPointerDown={(e) => handleResizePointerDown(e, el, dir)}
                      onPointerUp={handleResizePointerUp}
                    />
                  ))}
              </div>
            </Fragment>
            );
          })}
          {/* Snap guide lines (alignment references while dragging) */}
          {dragGuideLines && (
            <div className="pointer-events-none absolute inset-0 rounded-xl" aria-hidden>
              {dragGuideLines.v.map((pct) => (
                <div
                  key={`v-${pct}`}
                  className="absolute bottom-0 top-0 w-px -translate-x-1/2 bg-brand-red/35"
                  style={{ left: `${pct}%` }}
                />
              ))}
              {dragGuideLines.h.map((pct) => (
                <div
                  key={`h-${pct}`}
                  className="absolute left-0 right-0 h-px -translate-y-1/2 bg-brand-red/35"
                  style={{ top: `${pct}%` }}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
