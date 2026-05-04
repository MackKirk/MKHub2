import { useCallback, useEffect, useRef } from 'react';
import type { CSSProperties } from 'react';
import type { Editor } from '@tiptap/core';
import { NodeViewWrapper } from '@tiptap/react';
import type { ReactNodeViewProps } from '@tiptap/react';
import { withFileAccessToken } from '@/lib/api';

type ImageAlign = 'left' | 'center' | 'right';

type ResizeHandleId = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

const MAX_EDGE_HEIGHT_PX = 4000;

function displaySrc(raw: string): string {
  const base = raw.split('?')[0];
  if (base.startsWith('/files/')) return withFileAccessToken(base);
  return raw;
}

/** Word-style corners: uniform scale vs opposite anchor (frozen rect). */
function cornerUniformScale(
  handle: 'nw' | 'ne' | 'sw' | 'se',
  cx: number,
  cy: number,
  L0: number,
  T0: number,
  R0: number,
  B0: number,
  w0: number,
  h0: number,
): number {
  const W = Math.max(w0, 1);
  const H = Math.max(h0, 1);
  switch (handle) {
    case 'se':
      return Math.max(0.02, Math.min((cx - L0) / W, (cy - T0) / H));
    case 'nw':
      return Math.max(0.02, Math.min((R0 - cx) / W, (B0 - cy) / H));
    case 'ne':
      return Math.max(0.02, Math.min((cx - L0) / W, (B0 - cy) / H));
    case 'sw':
      return Math.max(0.02, Math.min((R0 - cx) / W, (cy - T0) / H));
    default:
      return 1;
  }
}

function edgeWidthPx(handle: 'e' | 'w', cx: number, L0: number, R0: number): number {
  if (handle === 'e') return Math.max(8, cx - L0);
  return Math.max(8, R0 - cx);
}

function edgeHeightPx(handle: 'n' | 's', cy: number, T0: number, B0: number): number {
  if (handle === 'n') return Math.max(16, B0 - cy);
  return Math.max(16, cy - T0);
}

const RESIZE_HANDLES: Array<{
  id: ResizeHandleId;
  cursor: string;
  label: string;
  style: CSSProperties;
}> = [
  { id: 'nw', cursor: 'nwse-resize', label: 'Resize from top left', style: { top: 0, left: 0, transform: 'translate(-50%, -50%)' } },
  { id: 'n', cursor: 'ns-resize', label: 'Resize from top', style: { top: 0, left: '50%', transform: 'translate(-50%, -50%)' } },
  { id: 'ne', cursor: 'nesw-resize', label: 'Resize from top right', style: { top: 0, right: 0, transform: 'translate(50%, -50%)' } },
  { id: 'e', cursor: 'ew-resize', label: 'Resize from right', style: { top: '50%', right: 0, transform: 'translate(50%, -50%)' } },
  { id: 'se', cursor: 'nwse-resize', label: 'Resize from bottom right', style: { bottom: 0, right: 0, transform: 'translate(50%, 50%)' } },
  { id: 's', cursor: 'ns-resize', label: 'Resize from bottom', style: { bottom: 0, left: '50%', transform: 'translate(-50%, 50%)' } },
  { id: 'sw', cursor: 'nesw-resize', label: 'Resize from bottom left', style: { bottom: 0, left: 0, transform: 'translate(-50%, 50%)' } },
  { id: 'w', cursor: 'ew-resize', label: 'Resize from left', style: { top: '50%', left: 0, transform: 'translate(-50%, -50%)' } },
];

function applyImageAttrs(editor: Editor, pos: number, attrs: Record<string, unknown>) {
  const nodeAt = editor.state.doc.nodeAt(pos);
  if (!nodeAt || nodeAt.type.name !== 'image') return;
  const tr = editor.state.tr.setNodeMarkup(pos, undefined, { ...nodeAt.attrs, ...attrs });
  editor.view.dispatch(tr);
}

export function LessonImageNodeView({ node, editor, getPos, selected }: ReactNodeViewProps) {
  const imgRef = useRef<HTMLImageElement>(null);
  const rawSrc = (node.attrs.src as string) || '';
  const src = displaySrc(rawSrc);
  const alt = (node.attrs.alt as string) || '';
  const align = ((node.attrs.align as ImageAlign) || 'left') as ImageAlign;
  const width = (node.attrs.width as string | null | undefined) ?? null;
  const height = (node.attrs.height as string | null | undefined) ?? null;
  const hasExplicitHeight = Boolean(height && height !== 'auto');

  const onResizePointerDown = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>, handle: ResizeHandleId) => {
      e.preventDefault();
      e.stopPropagation();
      const pos = getPos();
      if (typeof pos !== 'number') return;
      const pm = editor.view.dom.closest('.ProseMirror') as HTMLElement | null;
      const editorW = Math.max(200, pm?.getBoundingClientRect().width ?? 720);
      const imgEl = imgRef.current;
      if (!imgEl) return;

      const r0 = imgEl.getBoundingClientRect();
      const L0 = r0.left;
      const T0 = r0.top;
      const R0 = r0.right;
      const B0 = r0.bottom;
      /** Layout height on screen — used to lock vertical size during E/W-only resize (Word-style). */
      const displayHForHorizontalLock = Math.max(1, r0.height || imgEl.clientHeight || 1);
      let W0 = r0.width;
      let H0 = r0.height;
      if (H0 < 2 && imgEl.naturalHeight > 0) {
        W0 = imgEl.naturalWidth;
        H0 = imgEl.naturalHeight;
      }
      const lockHeightPxForEw = Math.round(
        Math.max(16, Math.min(MAX_EDGE_HEIGHT_PX, displayHForHorizontalLock)),
      );

      const nodeStart = editor.state.doc.nodeAt(pos);
      const startWidthAttr = (nodeStart?.attrs?.width as string | null) ?? null;

      let widthPctForVertical = startWidthAttr;
      if ((handle === 'n' || handle === 's') && !widthPctForVertical) {
        widthPctForVertical = `${Math.min(100, Math.max(5, Math.round((W0 / editorW) * 100)))}%`;
      }

      const onMove = (ev: PointerEvent) => {
        ev.preventDefault();

        if (handle === 'e' || handle === 'w') {
          const newWpx = edgeWidthPx(handle, ev.clientX, L0, R0);
          const clampedW = Math.max(24, Math.min(editorW - 8, newWpx));
          const pct = Math.min(100, Math.max(5, Math.round((clampedW / editorW) * 100)));
          /* Fixed height in px so only width changes visually (height:auto would keep aspect ratio). */
          applyImageAttrs(editor, pos, { width: `${pct}%`, height: `${lockHeightPxForEw}px` });
          return;
        }

        if (handle === 'n' || handle === 's') {
          const newHpx = Math.min(MAX_EDGE_HEIGHT_PX, edgeHeightPx(handle, ev.clientY, T0, B0));
          applyImageAttrs(editor, pos, {
            width: widthPctForVertical,
            height: `${Math.round(newHpx)}px`,
          });
          return;
        }

        const scale = cornerUniformScale(handle, ev.clientX, ev.clientY, L0, T0, R0, B0, W0, H0);
        const newWpx = W0 * scale;
        const clampedW = Math.max(24, Math.min(editorW - 8, newWpx));
        const pct = Math.min(100, Math.max(5, Math.round((clampedW / editorW) * 100)));
        applyImageAttrs(editor, pos, { width: `${pct}%`, height: null });
      };

      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onUp);
      };

      window.addEventListener('pointermove', onMove, { passive: false });
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
    },
    [editor, getPos],
  );

  useEffect(() => {
    if (!selected) return;
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') {
        editor.commands.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected, editor]);

  const imgStyle: CSSProperties = width
    ? {
        width: '100%',
        maxWidth: '100%',
        height: hasExplicitHeight ? height : 'auto',
        display: 'block',
        objectFit: hasExplicitHeight ? 'fill' : 'contain',
      }
    : {
        maxWidth: '100%',
        height: hasExplicitHeight ? height : 'auto',
        display: 'block',
        objectFit: hasExplicitHeight ? 'fill' : 'contain',
      };

  return (
    <NodeViewWrapper
      as="span"
      className={`lesson-img-node lesson-img-wrap lesson-img-wrap--inline mr-2 mb-2 align-bottom ${
        selected ? 'lesson-img-node--selected' : ''
      }`}
      data-lesson-img-wrap=""
      data-align={align}
      style={{
        display: 'inline-block',
        verticalAlign: 'bottom',
        maxWidth: '100%',
        boxSizing: 'border-box',
        ...(width ? { width } : {}),
      }}
    >
      <span className="relative block w-full min-w-0 align-middle" contentEditable={false}>
        <img
          ref={imgRef}
          src={src}
          alt={alt}
          draggable
          className={`h-auto rounded-lg select-none ${hasExplicitHeight ? 'object-fill' : 'object-contain'}`}
          style={imgStyle}
        />
        {selected &&
          RESIZE_HANDLES.map((h) => (
            <button
              key={h.id}
              type="button"
              draggable={false}
              className="lesson-img-resize-handle absolute z-10 box-border h-2.5 w-2.5 min-h-[10px] min-w-[10px] touch-none rounded-sm border border-[#7f1010] bg-white p-0 shadow"
              aria-label={h.label}
              title={h.label}
              style={{ ...h.style, cursor: h.cursor }}
              onPointerDown={(ev) => onResizePointerDown(ev, h.id)}
            />
          ))}
      </span>
    </NodeViewWrapper>
  );
}
