import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { getOverlayRoot } from '@/lib/overlayRoot';
import { EDITOR_FONT_COLOR_PRESETS } from '@/lib/editorFontColorPresets';
import { ribbonPortalDropdownPanelClass } from '@/components/document-editor/documentEditorRibbonPrimitives';

const PANEL_W = 232;

function ChevronDown({ className }: { className?: string }) {
  return (
    <svg className={className} width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden>
      <path d="M2.5 4.25L6 7.75l3.5-3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

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

function Swatch({ color, onPick, label }: { color: string; onPick: () => void; label: string }) {
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

/** Same UX as community new-post font color (presets + automatic + more colors), portaled above overlays. */
export default function DocumentEditorFontColorPicker({
  value,
  onChange,
}: {
  value: string | undefined;
  onChange: (next: string | undefined) => void;
}) {
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const moreInputRef = useRef<HTMLInputElement>(null);

  const bar = value || '#1e293b';

  const reposition = useCallback(() => {
    if (!open || !triggerRef.current) return;
    const r = triggerRef.current.getBoundingClientRect();
    const left = Math.max(8, Math.min(r.left, window.innerWidth - PANEL_W - 8));
    const top = r.bottom + 4;
    setMenuPos({ top, left });
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;
    reposition();
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [open, reposition]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node | null;
      if (!t) return;
      if (triggerRef.current?.contains(t)) return;
      if (panelRef.current?.contains(t)) return;
      setOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [open]);

  return (
    <>
      <button
        type="button"
        ref={triggerRef}
        onClick={() => setOpen((o) => !o)}
        className={`inline-flex h-8 shrink-0 items-center gap-0.5 rounded-lg border px-1.5 text-xs font-semibold text-slate-900 shadow-sm transition-[border-color,background-color,box-shadow] duration-200 ease-out ${
          open
            ? 'border-brand-red/45 bg-red-50 ring-2 ring-brand-red/20'
            : 'border-slate-300/95 bg-white hover:border-slate-400 hover:bg-slate-50'
        }`}
        title="Font color"
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <FontColorGlyph bar={bar} />
        <ChevronDown className="-ml-0.5 text-gray-500" />
      </button>
      {open &&
        createPortal(
          <div
            ref={panelRef}
            role="dialog"
            aria-label="Font colors"
            className={`${ribbonPortalDropdownPanelClass} w-[232px] max-h-[min(70vh,420px)] overflow-y-auto`}
            style={{ top: menuPos.top, left: menuPos.left }}
          >
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500">Automatic</p>
            <button
              type="button"
              className="mb-2 w-full rounded border border-gray-200 bg-gray-50 py-1.5 text-left text-xs text-gray-800 hover:bg-gray-100"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onChange(undefined);
                setOpen(false);
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
                    onChange(c);
                    setOpen(false);
                  }}
                />
              ))}
            </div>
            <button
              type="button"
              className="w-full rounded border border-dashed border-gray-300 py-1.5 text-xs font-medium text-gray-700 hover:border-brand-red/50 hover:bg-red-50/50"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => moreInputRef.current?.click()}
            >
              More colors…
            </button>
            <input
              ref={moreInputRef}
              type="color"
              className="sr-only"
              aria-hidden
              value={value ?? '#000000'}
              onChange={(e) => {
                onChange(e.target.value);
                setOpen(false);
              }}
            />
          </div>,
          getOverlayRoot()
        )}
    </>
  );
}
