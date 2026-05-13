import { useState, useEffect, type ReactNode } from 'react';
import type { DocElement, RichTextRun } from '@/types/documentCreator';
import { DOCUMENT_EDITOR_FONTS, TEXT_STYLE_PRESETS } from '@/types/documentCreator';
import {
  AlignBottomIcon,
  AlignCenterIcon,
  AlignLeftIcon,
  AlignMiddleIcon,
  AlignRightIcon,
  AlignTopIcon,
  ListBulletIcon,
  ListLetteredIcon,
  ListNumberedIcon,
  ParagraphPlainIcon,
} from '@/components/document-editor/documentEditorIcons';
import ImagePositionDropdown from '@/components/document-editor/ImagePositionDropdown';
import DocumentEditorFontColorPicker from '@/components/document-editor/DocumentEditorFontColorPicker';
import {
  editorContextNativeSelectClass,
  editorContextToolbarGroupClass,
  editorContextToolbarRowClass,
  editorSegmentedControlTrackClass,
  editorSegmentedSegmentIdleClass,
  editorSegmentedSegmentSelectedClass,
  editorToolbarMicroLabelClass,
} from '@/components/document-editor/documentEditorRibbonPrimitives';

function Cluster({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={`${editorContextToolbarGroupClass} ${className ?? ''}`}>{children}</div>;
}

type LineListStyle = Exclude<NonNullable<DocElement['listStyle']>, 'none'>;
type RunFormat = Partial<Omit<RichTextRun, 'text'>>;

// ── Constants shared with DocumentPreview.tsx ─────────────────────────────
const INLINE_TEXT_EDITOR_ATTR = 'data-inline-text-editor';
const TEXT_EDITOR_ROOT_ATTR = 'data-document-text-editor-root';
const TEXT_EDITOR_LINE_ATTR = 'data-document-text-line-index';
const TEXT_EDITOR_LINE_STYLE_ATTR = 'data-document-text-line-style';
const TEXT_EDITOR_ACTIVE_LINE_ATTR = 'data-document-text-active-line-index';
const DOCUMENT_TEXT_APPLY_LIST_STYLE_EVENT = 'document-text-editor-apply-list-style';
const DOCUMENT_TEXT_APPLY_FORMAT_EVENT = 'document-text-apply-format';
const DOCUMENT_TEXT_APPLY_LINE_ALIGN_EVENT = 'document-text-apply-line-align';
const DOCUMENT_TEXT_FORMAT_STATE_ATTR = 'data-current-format';
const DOCUMENT_TEXT_FORMAT_STATE_CHANGED_EVENT = 'document-text-format-state-changed';

// ── Editor DOM helpers ────────────────────────────────────────────────────

function normalizeLineListStyle(style: DocElement['listStyle'] | null | undefined): LineListStyle | undefined {
  return style && style !== 'none' ? style : undefined;
}

function selectedInlineEditorLineIndexes(elementId: string): number[] | null {
  const shell = document.querySelector<HTMLElement>(`[${INLINE_TEXT_EDITOR_ATTR}="${elementId}"]`);
  const root = shell?.querySelector<HTMLElement>(`[${TEXT_EDITOR_ROOT_ATTR}]`);
  const selection = window.getSelection();
  if (!root || !selection || !selection.anchorNode || !root.contains(selection.anchorNode)) return null;

  const lineIndexForNode = (node: Node | null): number | null => {
    let n: Node | null = node;
    if (n?.nodeType === Node.TEXT_NODE) n = n.parentNode;
    while (n && n !== root) {
      if (n instanceof HTMLElement && n.hasAttribute(TEXT_EDITOR_LINE_ATTR)) {
        const idx = Number(n.getAttribute(TEXT_EDITOR_LINE_ATTR));
        return Number.isFinite(idx) ? idx : null;
      }
      n = n.parentNode;
    }
    return null;
  };

  const anchorIdx = lineIndexForNode(selection.anchorNode);
  const focusIdx = root.contains(selection.focusNode) ? lineIndexForNode(selection.focusNode) : anchorIdx;
  if (anchorIdx == null || focusIdx == null) return null;
  const start = Math.min(anchorIdx, focusIdx);
  const end = Math.max(anchorIdx, focusIdx);
  return Array.from({ length: end - start + 1 }, (_, offset) => start + offset);
}

function activeInlineEditorRoot(elementId: string): HTMLElement | null {
  const shell = document.querySelector<HTMLElement>(`[${INLINE_TEXT_EDITOR_ATTR}="${elementId}"]`);
  return shell?.querySelector<HTMLElement>(`[${TEXT_EDITOR_ROOT_ATTR}]`) ?? null;
}

function activeInlineEditorLineIndex(root: HTMLElement): number | null {
  const idx = Number(root.getAttribute(TEXT_EDITOR_ACTIVE_LINE_ATTR));
  return Number.isFinite(idx) ? idx : null;
}

function selectedInlineEditorListMode(element: DocElement): 'none' | LineListStyle {
  const root = activeInlineEditorRoot(element.id);
  const selectedIndexes = root ? selectedInlineEditorLineIndexes(element.id) : null;
  const activeIndex = root ? activeInlineEditorLineIndex(root) : null;
  const lineIndexes = selectedIndexes && selectedIndexes.length > 0 ? selectedIndexes : activeIndex != null ? [activeIndex] : null;
  if (root && lineIndexes && lineIndexes.length > 0) {
    const modes = lineIndexes.map((idx) => {
      const row = root.querySelector<HTMLElement>(`[${TEXT_EDITOR_LINE_ATTR}="${idx}"]`);
      return normalizeLineListStyle(row?.getAttribute(TEXT_EDITOR_LINE_STYLE_ATTR) as DocElement['listStyle'] | null) ?? 'none';
    });
    const first = modes[0] ?? 'none';
    return modes.every((mode) => mode === first) ? first : 'none';
  }

  if (element.lineListStyles?.length) {
    const modes = element.lineListStyles.map((style) => normalizeLineListStyle(style) ?? 'none');
    const listed = modes.filter((mode) => mode !== 'none');
    if (listed.length === 0) return 'none';
    const first = listed[0];
    return listed.every((mode) => mode === first) ? first : 'none';
  }

  return normalizeLineListStyle(element.listStyle) ?? 'none';
}

function dispatchListStyleToInlineEditor(elementId: string, mode: 'none' | LineListStyle): boolean {
  if (!activeInlineEditorRoot(elementId)) return false;
  window.dispatchEvent(new CustomEvent(DOCUMENT_TEXT_APPLY_LIST_STYLE_EVENT, { detail: { elementId, mode } }));
  return true;
}

function applyListStyleToSelection(
  el: DocElement,
  mode: 'none' | LineListStyle,
  selectedLineIndexes: number[] | null
): DocElement {
  const lines = (el.content ?? '').replace(/\r\n/g, '\n').split('\n');
  const targetIndexes = selectedLineIndexes ?? lines.map((_, idx) => idx);

  if (!selectedLineIndexes) {
    return { ...el, listStyle: mode === 'none' ? undefined : mode, lineListStyles: undefined };
  }

  const fallback = normalizeLineListStyle(el.listStyle);
  const nextStyles = lines.map((_, idx) => normalizeLineListStyle(el.lineListStyles?.[idx] ?? fallback) ?? 'none');
  targetIndexes.forEach((idx) => { if (idx >= 0 && idx < nextStyles.length) nextStyles[idx] = mode; });

  const hasAnyList = nextStyles.some((style) => style !== 'none');
  return { ...el, listStyle: undefined, lineListStyles: hasAnyList ? nextStyles : undefined };
}

/** Read the current selection format from the editor root's data attribute. */
function readSelectionFormat(elementId: string): RunFormat | null {
  const root = activeInlineEditorRoot(elementId);
  if (!root) return null;
  const raw = root.getAttribute(DOCUMENT_TEXT_FORMAT_STATE_ATTR);
  if (!raw) return null;
  try { return JSON.parse(raw) as RunFormat; } catch { return null; }
}

/** Read the selected line H-alignment from the editor DOM. Returns null when not editing. */
function readSelectionLineAlign(element: DocElement): 'left' | 'center' | 'right' | null {
  const root = activeInlineEditorRoot(element.id);
  if (!root) return null;
  const selectedIndexes = selectedInlineEditorLineIndexes(element.id);
  const activeIndex = activeInlineEditorLineIndex(root);
  const lineIndexes = (selectedIndexes && selectedIndexes.length > 0) ? selectedIndexes : activeIndex != null ? [activeIndex] : null;
  if (!lineIndexes) return element.textAlign ?? 'left';

  // Read textAlign from the line divs (we update via CSS in the editor; fall back to lineTextAligns / textAlign)
  const values = lineIndexes.map((idx) => {
    const la = element.lineTextAligns?.[idx];
    return la ?? element.textAlign ?? 'left';
  });
  const first = values[0];
  return values.every((v) => v === first) ? first : null;
}

function dispatchFormatToInlineEditor(
  elementId: string,
  format: RunFormat,
  toggle = false,
): boolean {
  if (!activeInlineEditorRoot(elementId)) return false;
  window.dispatchEvent(new CustomEvent(DOCUMENT_TEXT_APPLY_FORMAT_EVENT, { detail: { elementId, format, toggle } }));
  return true;
}

function dispatchLineAlignToInlineEditor(elementId: string, align: 'left' | 'center' | 'right'): boolean {
  if (!activeInlineEditorRoot(elementId)) return false;
  window.dispatchEvent(new CustomEvent(DOCUMENT_TEXT_APPLY_LINE_ALIGN_EVENT, { detail: { elementId, align } }));
  return true;
}

// ── Hook: subscribe to selectionchange to refresh inspector format state ─────
function useSelectionFormatState(elementId: string | null): RunFormat | null {
  const [fmt, setFmt] = useState<RunFormat | null>(null);

  useEffect(() => {
    if (!elementId) { setFmt(null); return; }
    const update = () => {
      const f = readSelectionFormat(elementId);
      setFmt(f);
    };
    // selectionchange covers cursor movement; the custom event covers toolbar clicks that set
    // pending format without moving the selection (e.g. clicking Bold with no selection).
    document.addEventListener('selectionchange', update);
    window.addEventListener(DOCUMENT_TEXT_FORMAT_STATE_CHANGED_EVENT, update);
    return () => {
      document.removeEventListener('selectionchange', update);
      window.removeEventListener(DOCUMENT_TEXT_FORMAT_STATE_CHANGED_EVENT, update);
    };
  }, [elementId]);

  return fmt;
}

/** Formatting controls for the selected element; laid out for a horizontal strip below the ribbon. */
export default function DocumentSelectionInspector({
  element,
  onUpdate,
}: {
  element: DocElement | null;
  onUpdate: (id: string, updater: (el: DocElement) => DocElement) => void;
}) {
  const selFmt = useSelectionFormatState(element?.id ?? null);
  const isEditing = element ? !!activeInlineEditorRoot(element.id) : false;

  if (!element) return null;

  const id = element.id;
  const isText = element.type === 'text';
  const isImage = element.type === 'image';
  const isLocked = !!element.locked;
  const hasImage = isImage && !!element.content;

  if (isText && !isLocked) {
    // When editing: read bold/italic/color/size/font from selection; else from element.
    const activeBold = isEditing && selFmt !== null
      ? (selFmt.bold ?? (element.fontWeight ?? 'normal') === 'bold')
      : (element.fontWeight ?? 'normal') === 'bold';
    const activeItalic = isEditing && selFmt !== null
      ? (selFmt.italic ?? (element.fontStyle ?? 'normal') === 'italic')
      : (element.fontStyle ?? 'normal') === 'italic';
    const activeColor = isEditing && selFmt !== null && selFmt.color !== undefined
      ? selFmt.color
      : (element.color ?? '#000000');
    const activeFontSize = isEditing && selFmt !== null
      ? (selFmt.fontSize ?? element.fontSize ?? 12)
      : (element.fontSize ?? 12);
    const activeFontFamily = isEditing && selFmt !== null && selFmt.fontFamily !== undefined
      ? selFmt.fontFamily
      : (element.fontFamily ?? 'Montserrat');

    // H-alignment: per-line when editing, element-level otherwise.
    const activeHAlign = isEditing
      ? (readSelectionLineAlign(element) ?? element.textAlign ?? 'left')
      : (element.textAlign ?? 'left');

    return (
      <div className={editorContextToolbarRowClass} data-document-inspector-keep-selection="">
        <Cluster className="gap-2">
          <span className={editorToolbarMicroLabelClass}>Preset</span>
          <select
            value=""
            onChange={(e) => {
              const preset = TEXT_STYLE_PRESETS.find((p) => p.id === e.target.value);
              if (!preset) { e.target.value = ''; return; }
              const fmt: RunFormat = {
                fontFamily: preset.fontFamily,
                bold: preset.fontWeight === 'bold',
                fontSize: preset.fontSize,
                color: preset.color,
              };
              if (!dispatchFormatToInlineEditor(id, fmt)) {
                onUpdate(id, (el) => ({
                  ...el,
                  fontFamily: preset.fontFamily,
                  fontWeight: preset.fontWeight,
                  fontSize: preset.fontSize,
                  color: preset.color,
                }));
              }
              e.target.value = '';
            }}
            className={`${editorContextNativeSelectClass} w-[min(10rem,36vw)] min-w-[7.5rem]`}
            title="Apply preset"
          >
            <option value="">Choose preset…</option>
            {TEXT_STYLE_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </select>
        </Cluster>

        <Cluster className="gap-2">
          <span className={editorToolbarMicroLabelClass}>List</span>
          <div className={`${editorSegmentedControlTrackClass} w-[9.5rem] shrink-0 sm:w-[10rem]`}>
            {(
              [
                { mode: 'none' as const, title: 'Plain text', Icon: ParagraphPlainIcon },
                { mode: 'bullet' as const, title: 'Bullets', Icon: ListBulletIcon },
                { mode: 'numbered' as const, title: 'Numbering', Icon: ListNumberedIcon },
                { mode: 'lettered' as const, title: 'Lettered list (a, b, c)', Icon: ListLetteredIcon },
              ] as const
            ).map(({ mode, title, Icon }) => {
              const current = selectedInlineEditorListMode(element);
              const selected = current === mode;
              return (
                <button
                  key={mode}
                  type="button"
                  onPointerDown={(e) => e.preventDefault()}
                  onMouseDown={(e) => e.preventDefault()}
                  title={title}
                  aria-label={title}
                  aria-pressed={selected}
                  onClick={() => {
                    if (dispatchListStyleToInlineEditor(id, mode)) return;
                    onUpdate(id, (el) => applyListStyleToSelection(el, mode, selectedInlineEditorLineIndexes(id)));
                  }}
                  className={`flex h-full min-h-0 flex-1 items-center justify-center px-1 transition-[background-color,color,box-shadow] duration-150 ${selected ? editorSegmentedSegmentSelectedClass : editorSegmentedSegmentIdleClass}`}
                >
                  <Icon className="h-4 w-4 shrink-0 text-slate-800" />
                </button>
              );
            })}
          </div>
        </Cluster>

        <Cluster className="gap-2">
          <span className={editorToolbarMicroLabelClass}>Font</span>
          <select
            value={activeFontFamily}
            onChange={(e) => {
              const val = e.target.value as DocElement['fontFamily'];
              if (!dispatchFormatToInlineEditor(id, { fontFamily: val })) {
                onUpdate(id, (el) => ({ ...el, fontFamily: val }));
              }
            }}
            className={`${editorContextNativeSelectClass} w-[min(9rem,34vw)] min-w-[6.5rem]`}
          >
            {DOCUMENT_EDITOR_FONTS.map((f) => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
        </Cluster>

        <Cluster className="gap-1.5">
          <span className={`${editorToolbarMicroLabelClass} mr-0.5`}>Style</span>
          <button
            type="button"
            onPointerDown={(e) => e.preventDefault()}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              if (!dispatchFormatToInlineEditor(id, { bold: !activeBold }, true)) {
                onUpdate(id, (el) => ({ ...el, fontWeight: (el.fontWeight ?? 'normal') === 'bold' ? 'normal' : 'bold' }));
              }
            }}
            className={`h-8 w-8 shrink-0 rounded-md border text-xs font-bold transition-[background-color,border-color,color,box-shadow] duration-150 ${
              activeBold
                ? 'border-slate-800 bg-slate-800 text-white shadow-sm'
                : 'border-slate-300/95 bg-white text-slate-900 shadow-sm hover:border-slate-400 hover:bg-slate-50'
            }`}
            title="Bold"
          >
            B
          </button>
          <button
            type="button"
            onPointerDown={(e) => e.preventDefault()}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              if (!dispatchFormatToInlineEditor(id, { italic: !activeItalic }, true)) {
                onUpdate(id, (el) => ({ ...el, fontStyle: (el.fontStyle ?? 'normal') === 'italic' ? 'normal' : 'italic' }));
              }
            }}
            className={`h-8 w-8 shrink-0 rounded-md border text-xs italic transition-[background-color,border-color,color,box-shadow] duration-150 ${
              activeItalic
                ? 'border-slate-800 bg-slate-800 text-white shadow-sm'
                : 'border-slate-300/95 bg-white text-slate-900 shadow-sm hover:border-slate-400 hover:bg-slate-50'
            }`}
            title="Italic"
          >
            I
          </button>
          <div className="flex h-8 items-center gap-0.5 rounded-md border border-slate-300/90 bg-white px-0.5 shadow-sm">
            <span className="pl-1 text-[10px] font-semibold text-slate-600">Size</span>
            <button
              type="button"
              onPointerDown={(e) => e.preventDefault()}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                const next = Math.max(6, activeFontSize - 1);
                if (!dispatchFormatToInlineEditor(id, { fontSize: next })) {
                  onUpdate(id, (el) => ({ ...el, fontSize: next }));
                }
              }}
              className="h-6 w-6 shrink-0 rounded text-sm font-semibold text-slate-700 hover:bg-slate-100"
              title="Smaller"
              aria-label="Decrease font size"
            >
              −
            </button>
            <input
              type="number"
              min={6}
              max={99}
              value={activeFontSize}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (Number.isNaN(n)) return;
                const clamped = Math.max(6, Math.min(99, n));
                if (!dispatchFormatToInlineEditor(id, { fontSize: clamped })) {
                  onUpdate(id, (el) => ({ ...el, fontSize: clamped }));
                }
              }}
              className="h-6 w-11 rounded border-0 bg-transparent p-0 text-center text-xs font-semibold tabular-nums text-slate-900 focus:outline-none focus:ring-0"
            />
            <button
              type="button"
              onPointerDown={(e) => e.preventDefault()}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                const next = Math.min(99, activeFontSize + 1);
                if (!dispatchFormatToInlineEditor(id, { fontSize: next })) {
                  onUpdate(id, (el) => ({ ...el, fontSize: next }));
                }
              }}
              className="h-6 w-6 shrink-0 rounded text-sm font-semibold text-slate-700 hover:bg-slate-100"
              title="Larger"
              aria-label="Increase font size"
            >
              +
            </button>
          </div>
          <DocumentEditorFontColorPicker
            key={id}
            value={activeColor}
            onChange={(c) => {
              if (!dispatchFormatToInlineEditor(id, { color: c })) {
                onUpdate(id, (el) => ({ ...el, color: c }));
              }
            }}
          />
        </Cluster>

        <Cluster className="gap-2">
          <span className={editorToolbarMicroLabelClass}>H</span>
          <div className={`${editorSegmentedControlTrackClass} w-[7.25rem]`}>
            {[
              { v: 'left' as const, title: 'Align left', icon: <AlignLeftIcon className="h-4 w-4 shrink-0 text-slate-800" /> },
              { v: 'center' as const, title: 'Align center', icon: <AlignCenterIcon className="h-4 w-4 shrink-0 text-slate-800" /> },
              { v: 'right' as const, title: 'Align right', icon: <AlignRightIcon className="h-4 w-4 shrink-0 text-slate-800" /> },
            ].map(({ v, title, icon }) => (
              <button
                key={v}
                type="button"
                onPointerDown={(e) => e.preventDefault()}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  if (!dispatchLineAlignToInlineEditor(id, v)) {
                    onUpdate(id, (el) => ({ ...el, textAlign: v }));
                  }
                }}
                className={`flex h-full min-h-0 flex-1 items-center justify-center transition-[background-color,color,box-shadow] duration-150 ${
                  activeHAlign === v ? editorSegmentedSegmentSelectedClass : editorSegmentedSegmentIdleClass
                }`}
                title={title}
              >
                {icon}
              </button>
            ))}
          </div>
        </Cluster>

        <Cluster className="gap-2">
          <span className={editorToolbarMicroLabelClass}>V</span>
          <div className={`${editorSegmentedControlTrackClass} w-[7.25rem]`}>
            {[
              { v: 'top' as const, title: 'Top', icon: <AlignTopIcon className="h-4 w-4 shrink-0 text-slate-800" /> },
              { v: 'center' as const, title: 'Center', icon: <AlignMiddleIcon className="h-4 w-4 shrink-0 text-slate-800" /> },
              { v: 'bottom' as const, title: 'Bottom', icon: <AlignBottomIcon className="h-4 w-4 shrink-0 text-slate-800" /> },
            ].map(({ v, title, icon }) => (
              <button
                key={v}
                type="button"
                onPointerDown={(e) => e.preventDefault()}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onUpdate(id, (el) => ({ ...el, verticalAlign: v }))}
                className={`flex h-full min-h-0 flex-1 items-center justify-center transition-[background-color,color,box-shadow] duration-150 ${
                  (element.verticalAlign ?? 'top') === v ? editorSegmentedSegmentSelectedClass : editorSegmentedSegmentIdleClass
                }`}
                title={title}
              >
                {icon}
              </button>
            ))}
          </div>
        </Cluster>
      </div>
    );
  }

  if (isImage && hasImage && !isLocked) {
    return (
      <div className={editorContextToolbarRowClass}>
        <Cluster className="gap-2">
          <span className={editorToolbarMicroLabelClass}>Fit</span>
          <div className={editorSegmentedControlTrackClass}>
            {(['contain', 'cover', 'fill', 'none'] as const).map((fit) => (
              <button
                key={fit}
                type="button"
                onPointerDown={(e) => e.preventDefault()}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onUpdate(id, (el) => ({ ...el, imageFit: fit }))}
                className={`flex h-full min-h-0 min-w-[3rem] flex-1 items-center justify-center px-2 text-[11px] font-semibold capitalize transition-[background-color,color,box-shadow] duration-150 ${
                  (element.imageFit ?? 'contain') === fit ? editorSegmentedSegmentSelectedClass : editorSegmentedSegmentIdleClass
                }`}
                title={fit}
              >
                {fit}
              </button>
            ))}
          </div>
        </Cluster>
        <Cluster className="gap-2">
          <span className={editorToolbarMicroLabelClass}>Pos</span>
          <ImagePositionDropdown
            key={id}
            value={element.imagePosition ?? '50% 50%'}
            onChange={(v) => onUpdate(id, (el) => ({ ...el, imagePosition: v }))}
          />
        </Cluster>
      </div>
    );
  }

  if (isText && isLocked) {
    return (
      <p className="basis-full rounded-md border border-amber-200/80 bg-amber-50/90 px-2.5 py-1.5 text-[11px] text-amber-900">
        Unlock the text element to edit formatting.
      </p>
    );
  }

  if (isImage && (!hasImage || isLocked)) {
    return (
      <p className="basis-full rounded-md border border-slate-200/90 bg-slate-50/80 px-2.5 py-1.5 text-[11px] text-slate-600">
        {isLocked ? 'Unlock the image to adjust fit and position.' : 'Add an image to adjust fit and position.'}
      </p>
    );
  }

  return <p className="py-0.5 text-[11px] text-slate-600">No formatting options for this selection.</p>;
}
