import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { getOverlayRoot } from '@/lib/overlayRoot';
import { PositionIcon } from '@/components/document-editor/documentEditorIcons';
import {
  ribbonPortalDropdownPanelClass,
  selectionContextDropdownTriggerClass,
} from '@/components/document-editor/documentEditorRibbonPrimitives';

const POSITION_OPTIONS = [
  { value: '0% 0%', title: 'Top left' },
  { value: '50% 0%', title: 'Top' },
  { value: '100% 0%', title: 'Top right' },
  { value: '0% 50%', title: 'Left' },
  { value: '50% 50%', title: 'Center' },
  { value: '100% 50%', title: 'Right' },
  { value: '0% 100%', title: 'Bottom left' },
  { value: '50% 100%', title: 'Bottom' },
  { value: '100% 100%', title: 'Bottom right' },
] as const;

const PANEL_MIN_W = 108;

type ImagePositionDropdownProps = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
};

export default function ImagePositionDropdown({ value, onChange, disabled }: ImagePositionDropdownProps) {
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const effective = value || '50% 50%';
  const current = POSITION_OPTIONS.find((o) => o.value === effective) ?? POSITION_OPTIONS[4];

  const reposition = useCallback(() => {
    if (!open || !triggerRef.current) return;
    const r = triggerRef.current.getBoundingClientRect();
    const left = Math.max(8, Math.min(r.left, window.innerWidth - PANEL_MIN_W - 8));
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
      if (dropdownRef.current?.contains(t)) return;
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
        disabled={disabled}
        onClick={() => !disabled && setOpen((v) => !v)}
        className={`${selectionContextDropdownTriggerClass} ${
          disabled ? 'cursor-not-allowed opacity-50' : ''
        }`}
        title="Image position"
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <PositionIcon value={effective} />
        <span className="max-w-[6rem] truncate text-[11px] font-semibold text-slate-900">{current.title}</span>
        <span className="text-xs leading-none text-slate-500" aria-hidden>
          ▾
        </span>
      </button>
      {open &&
        createPortal(
          <div
            ref={dropdownRef}
            role="dialog"
            aria-label="Image position"
            className={`${ribbonPortalDropdownPanelClass} w-fit`}
            style={{ top: menuPos.top, left: menuPos.left, minWidth: PANEL_MIN_W }}
          >
            <div className="grid w-fit grid-cols-3 gap-px overflow-hidden rounded-lg border border-slate-200/90 bg-slate-200/70">
              {POSITION_OPTIONS.map(({ value: v, title }) => {
                const selected = effective === v;
                return (
                  <button
                    key={v}
                    type="button"
                    onClick={() => {
                      onChange(v);
                      setOpen(false);
                    }}
                    className={`flex h-9 w-9 items-center justify-center transition-colors duration-150 ${
                      selected
                        ? 'bg-white text-slate-900 shadow-inner ring-1 ring-inset ring-slate-400/30'
                        : 'bg-slate-50/90 text-slate-600 hover:bg-white'
                    }`}
                    title={title}
                  >
                    <PositionIcon value={v} />
                  </button>
                );
              })}
            </div>
          </div>,
          getOverlayRoot()
        )}
    </>
  );
}
