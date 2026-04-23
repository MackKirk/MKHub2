import { useCallback, useEffect, useRef, type FC } from 'react';
import type { Editor } from '@tiptap/core';
import type { Node as PMNode } from '@tiptap/pm/model';
import { NodeViewWrapper } from '@tiptap/react';
import type { ReactNodeViewProps } from '@tiptap/react';
import { withFileAccessToken } from '@/lib/api';

type ImageAlign = 'left' | 'center' | 'right';

function IconAlignLeft({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M3 6h18M3 12h12M3 18h18"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconAlignCenter({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M3 6h18M6 12h12M3 18h18"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconAlignRight({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M3 6h18M9 12h12M3 18h18"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const ALIGN_ICONS: Record<ImageAlign, FC<{ className?: string }>> = {
  left: IconAlignLeft,
  center: IconAlignCenter,
  right: IconAlignRight,
};

function paragraphContainsOnlyImages(parent: PMNode): boolean {
  if (!parent.isTextblock || parent.childCount === 0) return false;
  let ok = true;
  parent.forEach((child) => {
    if (child.type.name !== 'image') ok = false;
  });
  return ok;
}

function applyImageAlign(editor: Editor, imagePos: number, a: ImageAlign) {
  const node = editor.state.doc.nodeAt(imagePos);
  if (!node || node.type.name !== 'image') return;
  let tr = editor.state.tr.setNodeMarkup(imagePos, undefined, { ...node.attrs, align: a });
  const $pos = tr.doc.resolve(imagePos);
  const parent = $pos.parent;
  const parentPos = $pos.before($pos.depth);
  if (parent.type.name === 'paragraph' && paragraphContainsOnlyImages(parent)) {
    tr = tr.setNodeMarkup(parentPos, undefined, { ...parent.attrs, textAlign: a });
  }
  editor.view.dispatch(tr);
}

function displaySrc(raw: string): string {
  const base = raw.split('?')[0];
  if (base.startsWith('/files/')) return withFileAccessToken(base);
  return raw;
}

export function LessonImageNodeView({ node, editor, getPos, selected }: ReactNodeViewProps) {
  const imgRef = useRef<HTMLImageElement>(null);
  const rawSrc = (node.attrs.src as string) || '';
  const src = displaySrc(rawSrc);
  const alt = (node.attrs.alt as string) || '';
  const align = ((node.attrs.align as ImageAlign) || 'left') as ImageAlign;
  const width = (node.attrs.width as string | null | undefined) ?? null;

  const updateAttrs = useCallback(
    (patch: Record<string, unknown>) => {
      const pos = getPos();
      if (typeof pos !== 'number') return;
      const nodeAt = editor.state.doc.nodeAt(pos);
      if (!nodeAt || nodeAt.type.name !== 'image') return;
      const tr = editor.state.tr.setNodeMarkup(pos, undefined, { ...nodeAt.attrs, ...patch });
      editor.view.dispatch(tr);
    },
    [editor, getPos],
  );

  const onResizePointerDown = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.stopPropagation();
      const pos = getPos();
      if (typeof pos !== 'number') return;
      const pm = editor.view.dom.closest('.ProseMirror') as HTMLElement | null;
      const editorW = Math.max(200, pm?.getBoundingClientRect().width ?? 720);
      const imgEl = imgRef.current;
      if (!imgEl) return;
      const startX = e.clientX;
      const startW = imgEl.getBoundingClientRect().width;

      const applyWidth = (clampedPct: number) => {
        const nodeAt = editor.state.doc.nodeAt(pos);
        if (!nodeAt || nodeAt.type.name !== 'image') return;
        const tr = editor.state.tr.setNodeMarkup(pos, undefined, {
          ...nodeAt.attrs,
          width: `${clampedPct}%`,
        });
        editor.view.dispatch(tr);
      };

      const onMove = (ev: PointerEvent) => {
        ev.preventDefault();
        const dx = ev.clientX - startX;
        let newW = Math.round(startW + dx);
        newW = Math.max(24, Math.min(editorW - 8, newW));
        const pct = Math.round((newW / editorW) * 100);
        const clamped = Math.min(100, Math.max(5, pct));
        applyWidth(clamped);
      };

      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onUp);
      };

      /* Listeners on window: dispatch re-mounts the handle, so pointer capture on the button is lost mid-drag. */
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

  return (
    <NodeViewWrapper
      as="span"
      className={`lesson-img-node lesson-img-wrap lesson-img-wrap--inline mr-2 mb-2 align-top ${
        selected ? 'lesson-img-node--selected' : ''
      }`}
      data-lesson-img-wrap=""
      data-align={align}
      style={{
        display: 'inline-block',
        verticalAlign: 'top',
        maxWidth: '100%',
        boxSizing: 'border-box',
        ...(width ? { width } : {}),
      }}
    >
      <span className="relative block w-full min-w-0 align-middle" contentEditable={false}>
        {selected && (
          <div className="absolute -top-9 left-1/2 z-10 flex -translate-x-1/2 gap-0.5 rounded-md border border-gray-200 bg-white p-0.5 shadow-md">
            {(['left', 'center', 'right'] as const).map((a) => {
              const Icon = ALIGN_ICONS[a];
              return (
                <button
                  key={a}
                  type="button"
                  title={
                    a === 'left' ? 'Align row left' : a === 'center' ? 'Align row center' : 'Align row right'
                  }
                  className={`rounded p-1.5 leading-none ${
                    align === a ? 'bg-[#7f1010] text-white' : 'text-gray-600 hover:bg-gray-100'
                  }`}
                  onPointerDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const pos = getPos();
                    if (typeof pos !== 'number') return;
                    applyImageAlign(editor, pos, a);
                  }}
                >
                  <Icon className="block" />
                </button>
              );
            })}
          </div>
        )}
        <img
          ref={imgRef}
          src={src}
          alt={alt}
          draggable={false}
          className="h-auto rounded-lg object-contain select-none"
          style={
            width
              ? { width: '100%', maxWidth: '100%', height: 'auto', display: 'block' }
              : { maxWidth: '100%', height: 'auto', display: 'block' }
          }
        />
        {selected && (
          <button
            type="button"
            aria-label="Resize image"
            title="Drag the corner to resize; drag left to shrink"
            className="absolute bottom-0 right-0 z-10 h-5 w-5 min-h-[20px] min-w-[20px] cursor-nwse-resize rounded-br-md border border-[#7f1010] bg-white shadow touch-none"
            onPointerDown={onResizePointerDown}
          />
        )}
      </span>
    </NodeViewWrapper>
  );
}
