import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import toast from 'react-hot-toast';
import { getOverlayRoot } from '@/lib/overlayRoot';
import {
  RibbonShell,
  RibbonGroup,
  RibbonLargeButton,
  RibbonCompactButton,
  ribbonPortalDropdownPanelClass,
  editorContextStripClass,
} from '@/components/document-editor/documentEditorRibbonPrimitives';
import {
  BackIcon,
  BlockIcon,
  CloseIcon,
  ExportPdfIcon,
  ImageAreaIcon,
  ImageIcon,
  RedoIcon,
  TextIcon,
  UndoIcon,
  ZoomIcon,
} from '@/components/document-editor/documentEditorIcons';

export type DocumentEditorRibbonProps = {
  onCloseOrBack: () => void;
  useCloseIcon: boolean;
  modeHeading: string;
  title: string;
  onTitleChange: (value: string) => void;
  showTitleInput: boolean;
  isSaving: boolean;
  isTemplate: boolean;
  showExportPdf: boolean;
  onExportPdf: () => void;
  isExportingPdf: boolean;
  showSaveTemplate: boolean;
  onSaveTemplate: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  readOnly: boolean;
  onAddText: () => void;
  onAddImage: () => void;
  onAddImagePlaceholder: () => void;
  showBlock: boolean;
  onAddBlock?: () => void;
  layoutPanel: ReactNode;
  /** Second row directly under the main toolbar (e.g. selection strip). */
  selectionPanel?: ReactNode;
  /** Third row: formatting / inspector (e.g. text & image options). */
  inspectorPanel?: ReactNode;
  zoom: number;
  onZoomChange: (zoom: number) => void;
  /** Optional actions rendered at the far right of the ribbon toolbar (e.g. expand/compress button). */
  extraActions?: ReactNode;
  /** Optional element rendered directly below the close/back button (e.g. expand button). */
  closeSlotBelow?: ReactNode;
};

const ZOOM_LEVELS = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;

/** Matches "Change background" trigger in DocumentEditor (ribbon layout panel). */
const ribbonDropdownTriggerClass =
  'inline-flex items-center gap-2 rounded-xl border border-slate-300/90 bg-white px-2.5 py-2 text-sm font-semibold text-slate-800 shadow-[0_1px_3px_rgba(15,23,42,0.08)] transition-[border-color,box-shadow,background-color] duration-200 ease-out hover:border-slate-400 hover:bg-slate-50 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-red/35';

export default function DocumentEditorRibbon(props: DocumentEditorRibbonProps) {
  const {
    onCloseOrBack,
    useCloseIcon,
    modeHeading,
    title,
    onTitleChange,
    showTitleInput,
    isSaving,
    isTemplate,
    showExportPdf,
    onExportPdf,
    isExportingPdf,
    showSaveTemplate,
    onSaveTemplate,
    onUndo,
    onRedo,
    canUndo,
    canRedo,
    readOnly,
    onAddText,
    onAddImage,
    onAddImagePlaceholder,
    showBlock,
    onAddBlock,
    layoutPanel,
    selectionPanel,
    inspectorPanel,
    zoom,
    onZoomChange,
    extraActions,
    closeSlotBelow,
  } = props;

  const [editingTitle, setEditingTitle] = useState(false);
  const [localTitle, setLocalTitle] = useState(title);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const skipCommitRef = useRef(false);

  const [zoomMenuOpen, setZoomMenuOpen] = useState(false);
  const [zoomMenuPos, setZoomMenuPos] = useState({ top: 0, left: 0 });
  const zoomTriggerRef = useRef<HTMLButtonElement>(null);
  const zoomDropdownRef = useRef<HTMLDivElement>(null);

  const [tokensMenuOpen, setTokensMenuOpen] = useState(false);
  const [tokensMenuPos, setTokensMenuPos] = useState({ top: 0, left: 0 });
  const tokensTriggerRef = useRef<HTMLButtonElement>(null);
  const tokensDropdownRef = useRef<HTMLDivElement>(null);

  const repositionZoomMenu = useCallback(() => {
    if (!zoomMenuOpen || !zoomTriggerRef.current) return;
    const r = zoomTriggerRef.current.getBoundingClientRect();
    const panelW = 200;
    const left = Math.max(8, Math.min(r.left, window.innerWidth - panelW - 8));
    const top = r.bottom + 4;
    setZoomMenuPos({ top, left });
  }, [zoomMenuOpen]);

  useLayoutEffect(() => {
    if (!zoomMenuOpen) return;
    repositionZoomMenu();
    window.addEventListener('resize', repositionZoomMenu);
    window.addEventListener('scroll', repositionZoomMenu, true);
    return () => {
      window.removeEventListener('resize', repositionZoomMenu);
      window.removeEventListener('scroll', repositionZoomMenu, true);
    };
  }, [zoomMenuOpen, repositionZoomMenu]);

  useEffect(() => {
    if (!zoomMenuOpen) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node | null;
      if (!t) return;
      if (zoomTriggerRef.current?.contains(t)) return;
      if (zoomDropdownRef.current?.contains(t)) return;
      setZoomMenuOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [zoomMenuOpen]);

  useEffect(() => {
    if (!tokensMenuOpen) return;
    const reposition = () => {
      if (!tokensTriggerRef.current) return;
      const r = tokensTriggerRef.current.getBoundingClientRect();
      const panelW = 320;
      const left = Math.max(8, Math.min(r.left, window.innerWidth - panelW - 8));
      setTokensMenuPos({ top: r.bottom + 4, left });
    };
    reposition();
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [tokensMenuOpen]);

  useEffect(() => {
    if (!tokensMenuOpen) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node | null;
      if (!t) return;
      if (tokensTriggerRef.current?.contains(t)) return;
      if (tokensDropdownRef.current?.contains(t)) return;
      setTokensMenuOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [tokensMenuOpen]);

  useEffect(() => {
    if (!editingTitle) setLocalTitle(title);
  }, [title, editingTitle]);

  useLayoutEffect(() => {
    if (!editingTitle) return;
    const t = window.setTimeout(() => {
      titleInputRef.current?.focus();
      titleInputRef.current?.select();
    }, 0);
    return () => window.clearTimeout(t);
  }, [editingTitle]);

  const commitTitle = () => {
    if (skipCommitRef.current) {
      skipCommitRef.current = false;
      return;
    }
    const trimmed = localTitle.trim();
    if (!trimmed) {
      toast.error('Document title cannot be empty');
      setLocalTitle(title);
      window.setTimeout(() => {
        titleInputRef.current?.focus();
        titleInputRef.current?.select();
      }, 0);
      return;
    }
    setEditingTitle(false);
    if (trimmed !== title) onTitleChange(trimmed);
  };

  const cancelTitleEdit = () => {
    skipCommitRef.current = true;
    setLocalTitle(title);
    setEditingTitle(false);
  };

  const beginTitleEdit = () => {
    setLocalTitle(title);
    setEditingTitle(true);
  };

  const displayTitle = title.trim() || 'Untitled document';

  return (
    <RibbonShell>
      <div
        className="flex min-h-[80px] flex-nowrap items-end gap-0 overflow-x-auto border-b border-slate-200/80 bg-gradient-to-b from-white via-slate-50/90 to-slate-100/80 px-1.5 py-2.5 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.9)] sm:px-3 [scrollbar-width:thin]"
        role="toolbar"
        aria-label="Document editor toolbar"
      >
        <RibbonGroup label="Document">
          <div className="flex flex-col items-center gap-1 shrink-0 self-center">
            <button
              type="button"
              onClick={onCloseOrBack}
              className="rounded-xl p-2 text-slate-600 transition-[color,background-color,transform] duration-200 ease-out hover:bg-slate-200/70 hover:text-slate-950 active:scale-[0.96] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-red/35"
              aria-label={useCloseIcon ? 'Close' : 'Back'}
            >
              {useCloseIcon ? <CloseIcon className="w-5 h-5" /> : <BackIcon className="w-5 h-5" />}
            </button>
            {closeSlotBelow}
          </div>
          <div className="flex flex-col min-w-0 max-w-[min(250px,44vw)] sm:max-w-[320px] justify-end pb-0.5">
            <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-600 leading-tight">{modeHeading}</span>
            {showTitleInput ? (
              editingTitle ? (
                <input
                  ref={titleInputRef}
                  value={localTitle}
                  onChange={(e) => setLocalTitle(e.target.value)}
                  onBlur={() => commitTitle()}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      (e.target as HTMLInputElement).blur();
                    }
                    if (e.key === 'Escape') {
                      e.preventDefault();
                      cancelTitleEdit();
                    }
                  }}
                  className="mt-0.5 w-full rounded-xl border border-slate-300/90 bg-white px-2.5 py-1.5 text-sm font-bold text-slate-900 shadow-[0_1px_2px_rgba(15,23,42,0.06)] focus:border-brand-red/45 focus:outline-none focus:ring-2 focus:ring-brand-red/25"
                  aria-label="Document title"
                />
              ) : (
                <button
                  type="button"
                  onClick={beginTitleEdit}
                  className="-mx-0.5 mt-0.5 w-full truncate rounded-xl border border-transparent px-2.5 py-1.5 text-left text-sm font-bold text-slate-900 transition-[border-color,background-color,box-shadow] duration-200 ease-out hover:border-slate-300/80 hover:bg-white hover:shadow-md"
                  title="Click to edit document name"
                >
                  {displayTitle}
                </button>
              )
            ) : (
              !isTemplate &&
              readOnly && (
                <span className="mt-0.5 text-sm font-semibold text-slate-800 truncate" title={title}>
                  {displayTitle}
                </span>
              )
            )}
          </div>
          {isSaving && !showExportPdf ? (
            <span className="mb-1 shrink-0 self-end rounded-full border border-slate-300/80 bg-slate-100 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-slate-600 shadow-sm">
              Saving…
            </span>
          ) : null}
        </RibbonGroup>

        <RibbonGroup label="Clipboard">
          <RibbonLargeButton icon={<UndoIcon />} label="Undo" onClick={onUndo} disabled={!canUndo} title="Undo (Ctrl+Z)" />
          <RibbonLargeButton icon={<RedoIcon />} label="Redo" onClick={onRedo} disabled={!canRedo} title="Redo (Ctrl+Y)" />
        </RibbonGroup>

        {!readOnly && (
          <RibbonGroup label="Insert">
            <RibbonLargeButton icon={<TextIcon />} label="Text" onClick={onAddText} title="Insert text box" />
            <RibbonLargeButton icon={<ImageIcon />} label="Image" onClick={onAddImage} title="Insert image" />
            <RibbonLargeButton
              icon={<ImageAreaIcon />}
              label="Image area"
              onClick={onAddImagePlaceholder}
              title="Insert image placeholder"
            />
            {showBlock && onAddBlock && (
              <RibbonLargeButton icon={<BlockIcon />} label="Block" onClick={onAddBlock} title="Insert block area" />
            )}
          </RibbonGroup>
        )}

        {!readOnly && (
          <RibbonGroup label="Page">
            <div className="flex flex-wrap items-end gap-2.5 max-w-[min(100vw-2rem,450px)]">{layoutPanel}</div>
          </RibbonGroup>
        )}

        {isTemplate && (
          <RibbonGroup label="Variables">
            <div className="inline-flex items-center pb-0.5">
              <button
                type="button"
                ref={tokensTriggerRef}
                onClick={() => setTokensMenuOpen((v) => !v)}
                className={ribbonDropdownTriggerClass}
                title="Auto-fill tokens reference"
                aria-expanded={tokensMenuOpen}
                aria-haspopup="dialog"
              >
                <span className="font-mono text-sm leading-none text-slate-500">{'{ }'}</span>
                <span>Auto-fill</span>
              </button>
              {tokensMenuOpen &&
                createPortal(
                  <div
                    ref={tokensDropdownRef}
                    className={`${ribbonPortalDropdownPanelClass} w-[320px]`}
                    style={{ top: tokensMenuPos.top, left: tokensMenuPos.left }}
                    role="dialog"
                    aria-label="Auto-fill tokens"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-[13px] font-semibold text-slate-900">Auto-fill tokens</span>
                      <button
                        type="button"
                        onClick={() => setTokensMenuOpen(false)}
                        className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                        aria-label="Close"
                      >
                        ✕
                      </button>
                    </div>
                    <p className="text-[12px] text-slate-500 mb-3 leading-snug">
                      Use these tokens in text elements. When a document is created from a project, they are replaced automatically.
                    </p>
                    <table className="w-full text-[12px] border-collapse">
                      <thead>
                        <tr className="border-b border-slate-100">
                          <th className="pb-1.5 text-left font-semibold text-slate-700">Token</th>
                          <th className="pb-1.5 text-left font-semibold text-slate-700">Filled with</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {[
                          { token: '<Project Name>', label: 'Project name' },
                          { token: '<Customer Name>', label: 'Customer name' },
                          { token: '<Reference Code>', label: 'Project code' },
                        ].map(({ token, label }) => (
                          <tr key={token}>
                            <td className="py-1.5 pr-3">
                              <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-800">
                                {token}
                              </code>
                            </td>
                            <td className="py-1.5 text-slate-600">{label}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>,
                  getOverlayRoot()
                )}
            </div>
          </RibbonGroup>
        )}

        <RibbonGroup label="View">
          <div className="inline-flex items-center pb-0.5">
            <button
              type="button"
              ref={zoomTriggerRef}
              onClick={() => setZoomMenuOpen((v) => !v)}
              className={ribbonDropdownTriggerClass}
              title="Zoom"
              aria-expanded={zoomMenuOpen}
              aria-haspopup="listbox"
            >
              <ZoomIcon className="h-4 w-4 shrink-0 text-slate-600" aria-hidden />
              <span>{Math.round(zoom * 100)}%</span>
              <span className="text-xs leading-none text-slate-400" aria-hidden>
                ▾
              </span>
            </button>
            {zoomMenuOpen &&
              createPortal(
                <div
                  ref={zoomDropdownRef}
                  role="listbox"
                  aria-label="Zoom level"
                  className={`${ribbonPortalDropdownPanelClass} w-[200px]`}
                  style={{ top: zoomMenuPos.top, left: zoomMenuPos.left }}
                >
                  {ZOOM_LEVELS.map((z) => {
                    const selected = zoom === z;
                    return (
                      <button
                        key={z}
                        type="button"
                        role="option"
                        aria-selected={selected}
                        onClick={() => {
                          onZoomChange(z);
                          setZoomMenuOpen(false);
                        }}
                        className={`flex w-full items-center rounded-xl px-3 py-2 text-left text-sm transition-colors hover:bg-slate-50 ${
                          selected
                            ? 'bg-brand-red/[0.06] font-semibold text-slate-900 ring-1 ring-brand-red/20'
                            : 'font-medium text-slate-700'
                        }`}
                      >
                        {Math.round(z * 100)}%
                      </button>
                    );
                  })}
                </div>,
                getOverlayRoot()
              )}
          </div>
        </RibbonGroup>

        {showExportPdf && (
          <RibbonGroup label="Export">
            <div className="flex flex-wrap items-end gap-2">
              <RibbonCompactButton
                icon={<ExportPdfIcon className="w-4 h-4" />}
                label={isExportingPdf ? 'Exporting…' : 'Export PDF'}
                onClick={onExportPdf}
                disabled={isExportingPdf}
                title="Export PDF"
                variant="primary"
              />
              {isSaving ? (
                <span className="shrink-0 rounded-full border border-slate-300/80 bg-slate-100 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-slate-600 shadow-sm">
                  Saving…
                </span>
              ) : null}
            </div>
          </RibbonGroup>
        )}

        {showSaveTemplate && (
          <RibbonGroup label="Template">
            <button
              type="button"
              onClick={onSaveTemplate}
              className="whitespace-nowrap rounded-xl border border-brand-red/30 bg-brand-red px-3 py-2 text-xs font-bold text-white shadow-[0_2px_8px_rgba(220,38,38,0.35)] transition-[background-color,box-shadow,transform] duration-200 ease-out hover:bg-brand-red/92 hover:shadow-[0_4px_16px_rgba(220,38,38,0.4)] sm:text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-red/40 active:scale-[0.98]"
            >
              Save page layout
            </button>
          </RibbonGroup>
        )}

        {extraActions && (
          <div className="ml-auto flex shrink-0 items-end pb-2.5 pr-1">
            {extraActions}
          </div>
        )}
      </div>
      {selectionPanel || inspectorPanel ? (
        <div
          data-document-editor-formatting="true"
          className={`${editorContextStripClass} flex shrink-0 flex-nowrap items-center gap-0 overflow-x-auto px-2 py-1 sm:px-3 sm:py-1.5 [scrollbar-width:thin]`}
          role="region"
          aria-label="Selection and formatting"
        >
          {selectionPanel ? <div className="shrink-0">{selectionPanel}</div> : null}
          {selectionPanel && inspectorPanel ? (
            <div className="h-6 w-px shrink-0 self-center bg-gradient-to-b from-transparent via-slate-300/80 to-transparent" aria-hidden />
          ) : null}
          {inspectorPanel ? <div className="shrink-0 min-w-0">{inspectorPanel}</div> : null}
        </div>
      ) : null}
    </RibbonShell>
  );
}
