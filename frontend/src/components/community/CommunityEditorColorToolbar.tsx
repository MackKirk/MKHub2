import { useCallback, useEffect, useReducer, useRef, useState, type RefObject } from 'react';
import type { Editor } from '@tiptap/core';
import { EDITOR_FONT_COLOR_PRESETS } from '@/lib/editorFontColorPresets';

const HIGHLIGHT_PRESETS = [
  '#fef08a',
  '#bbf7d0',
  '#bae6fd',
  '#fecdd3',
  '#fde68a',
  '#ddd6fe',
  '#fed7aa',
  '#e5e7eb',
  '#fca5a5',
  '#86efac',
  '#93c5fd',
  '#f9a8d4',
] as const;

function ChevronDown({ className }: { className?: string }) {
  return (
    <svg className={className} width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden>
      <path d="M2.5 4.25L6 7.75l3.5-3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Letter A with colored underline (Word font color). */
function FontColorGlyph({ bar }: { bar: string }) {
  return (
    <svg className="h-4 w-4 shrink-0" viewBox="0 0 20 20" aria-hidden>
      <text x="2" y="15" fontSize="14" fontWeight="700" fontFamily="system-ui,Segoe UI,Roboto,sans-serif" fill="currentColor">
        A
      </text>
      <rect x="1" y="16" width="14" height="3" rx="0.5" fill={bar} stroke="#94a3b8" strokeWidth="0.25" />
    </svg>
  );
}

/** Highlighter / marker icon. */
function HighlightGlyph({ bar }: { bar: string }) {
  return (
    <svg className="h-4 w-4 shrink-0" viewBox="0 0 20 20" aria-hidden>
      <path
        d="M4 14.5L11 4.5l4 2.5-7 10-3.5 1.5L4 14.5z"
        fill="currentColor"
        opacity="0.35"
      />
      <path d="M5.2 13.8L11.8 5l3.2 2-6.6 8.8-2.6 1.2-0.6-1.2z" fill="currentColor" />
      <rect x="3" y="15.5" width="12" height="2.8" rx="0.4" fill={bar} stroke="#64748b" strokeWidth="0.3" />
    </svg>
  );
}

/** Clear font color — A with strikethrough on color bar. */
function ClearFontColorIcon() {
  return (
    <svg className="h-4 w-4 shrink-0" viewBox="0 0 20 20" fill="none" aria-hidden>
      <text x="1" y="14" fontSize="13" fontWeight="700" fontFamily="system-ui,Segoe UI,Roboto,sans-serif" fill="currentColor">
        A
      </text>
      <rect x="1" y="15.5" width="12" height="2.2" rx="0.35" fill="#cbd5e1" stroke="#94a3b8" strokeWidth="0.35" />
      <path d="M2 16.5L12 16.5" stroke="#dc2626" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

/** Clear highlight — marker with slash. */
function ClearHighlightIcon() {
  return (
    <svg className="h-4 w-4 shrink-0" viewBox="0 0 20 20" fill="none" aria-hidden>
      <path d="M5 15h8v2H5v-2z" fill="#fde047" stroke="#ca8a04" strokeWidth="0.5" />
      <path d="M6 5l8 10" stroke="#dc2626" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function useClickOutside(ref: RefObject<HTMLDivElement | null>, open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const fn = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, [open, onClose, ref]);
}

function Swatch({
  color,
  onPick,
  label,
}: {
  color: string;
  onPick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      title={label}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onPick}
      className="h-5 w-5 shrink-0 rounded border border-gray-300/90 shadow-sm hover:ring-2 hover:ring-brand-red/40 hover:ring-offset-1 focus:outline-none focus:ring-2 focus:ring-brand-red/35"
      style={{ backgroundColor: color }}
    />
  );
}

type PopButtonProps = {
  pressed: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
};

function PopoverTrigger({ pressed, onClick, title, children }: PopButtonProps) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`inline-flex items-center gap-0.5 rounded border px-1.5 py-1 text-xs transition-colors ${
        pressed ? 'border-brand-red bg-red-50 ring-1 ring-brand-red/25' : 'border-gray-200 bg-white hover:bg-gray-50'
      }`}
    >
      {children}
    </button>
  );
}

function IconToolbarButton({
  onClick,
  disabled,
  title,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center rounded border p-1.5 text-gray-700 transition-colors border-gray-200 bg-white hover:bg-gray-50 ${
        disabled ? 'opacity-40 cursor-not-allowed' : ''
      }`}
    >
      {children}
    </button>
  );
}

export function CommunityEditorColorToolbar({ editor }: { editor: Editor }) {
  const [, sync] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    const on = () => sync();
    editor.on('selectionUpdate', on);
    editor.on('transaction', on);
    return () => {
      editor.off('selectionUpdate', on);
      editor.off('transaction', on);
    };
  }, [editor]);

  const [fontOpen, setFontOpen] = useState(false);
  const [hiOpen, setHiOpen] = useState(false);
  const fontWrapRef = useRef<HTMLDivElement>(null);
  const hiWrapRef = useRef<HTMLDivElement>(null);
  const fontMoreInputRef = useRef<HTMLInputElement>(null);
  const hiMoreInputRef = useRef<HTMLInputElement>(null);

  const closeFont = useCallback(() => setFontOpen(false), []);
  const closeHi = useCallback(() => setHiOpen(false), []);
  useClickOutside(fontWrapRef, fontOpen, closeFont);
  useClickOutside(hiWrapRef, hiOpen, closeHi);

  const textColor = (editor.getAttributes('textStyle').color as string | undefined) || null;
  const hiAttr = editor.getAttributes('highlight') as { color?: string };
  const hiColor = hiAttr?.color || null;

  const fontBar = textColor || '#1e293b';
  const hiBar = hiColor || '#fde047';

  return (
    <>
      <div className="relative inline-flex items-center gap-0.5" ref={fontWrapRef}>
        <PopoverTrigger
          pressed={fontOpen}
          title="Font color"
          onClick={() => {
            setHiOpen(false);
            setFontOpen((o) => !o);
          }}
        >
          <FontColorGlyph bar={fontBar} />
          <ChevronDown className="text-gray-500 -ml-0.5" />
        </PopoverTrigger>
        <IconToolbarButton title="Remove text color (automatic)" onClick={() => editor.chain().focus().unsetColor().run()}>
          <ClearFontColorIcon />
        </IconToolbarButton>
        {fontOpen && (
          <div
            className="absolute left-0 top-full z-[120] mt-1 w-[232px] rounded-lg border border-gray-200 bg-white py-2 pl-2 pr-2 shadow-xl"
            role="listbox"
            aria-label="Font colors"
          >
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500">Automatic</p>
            <button
              type="button"
              className="mb-2 w-full rounded border border-gray-200 bg-gray-50 py-1.5 text-left text-xs text-gray-800 hover:bg-gray-100"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                editor.chain().focus().unsetColor().run();
                setFontOpen(false);
              }}
            >
              Automatic (default)
            </button>
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-500">Standard colors</p>
            <div className="mb-2 grid grid-cols-8 gap-1">
              {EDITOR_FONT_COLOR_PRESETS.map((c) => (
                <Swatch
                  key={c}
                  color={c}
                  label={c}
                  onPick={() => {
                    editor.chain().focus().setColor(c).run();
                    setFontOpen(false);
                  }}
                />
              ))}
            </div>
            <button
              type="button"
              className="w-full rounded border border-dashed border-gray-300 py-1.5 text-xs font-medium text-gray-700 hover:border-brand-red/50 hover:bg-red-50/50"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => fontMoreInputRef.current?.click()}
            >
              More colors…
            </button>
            <input
              ref={fontMoreInputRef}
              type="color"
              className="sr-only"
              aria-hidden
              onChange={(e) => {
                editor.chain().focus().setColor(e.target.value).run();
                setFontOpen(false);
              }}
            />
          </div>
        )}
      </div>

      <div className="relative inline-flex items-center gap-0.5" ref={hiWrapRef}>
        <PopoverTrigger
          pressed={hiOpen}
          title="Text highlight color"
          onClick={() => {
            setFontOpen(false);
            setHiOpen((o) => !o);
          }}
        >
          <HighlightGlyph bar={hiBar} />
          <ChevronDown className="text-gray-500 -ml-0.5" />
        </PopoverTrigger>
        <IconToolbarButton title="Remove highlight" onClick={() => editor.chain().focus().unsetHighlight().run()}>
          <ClearHighlightIcon />
        </IconToolbarButton>
        {hiOpen && (
          <div
            className="absolute left-0 top-full z-[120] mt-1 w-[200px] rounded-lg border border-gray-200 bg-white py-2 pl-2 pr-2 shadow-xl"
            role="listbox"
            aria-label="Highlight colors"
          >
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500">No color</p>
            <button
              type="button"
              className="mb-2 w-full rounded border border-gray-200 bg-gray-50 py-1.5 text-left text-xs text-gray-800 hover:bg-gray-100"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                editor.chain().focus().unsetHighlight().run();
                setHiOpen(false);
              }}
            >
              No highlight
            </button>
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-500">Presets</p>
            <div className="mb-2 grid grid-cols-6 gap-1">
              {HIGHLIGHT_PRESETS.map((c) => (
                <Swatch
                  key={c}
                  color={c}
                  label={c}
                  onPick={() => {
                    editor.chain().focus().setHighlight({ color: c }).run();
                    setHiOpen(false);
                  }}
                />
              ))}
            </div>
            <button
              type="button"
              className="w-full rounded border border-dashed border-gray-300 py-1.5 text-xs font-medium text-gray-700 hover:border-brand-red/50 hover:bg-red-50/50"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => hiMoreInputRef.current?.click()}
            >
              More colors…
            </button>
            <input
              ref={hiMoreInputRef}
              type="color"
              className="sr-only"
              aria-hidden
              defaultValue="#fef08a"
              onChange={(e) => {
                editor.chain().focus().setHighlight({ color: e.target.value }).run();
                setHiOpen(false);
              }}
            />
          </div>
        )}
      </div>
    </>
  );
}
