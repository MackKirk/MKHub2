import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import toast from 'react-hot-toast';
import { getOverlayRoot } from '@/lib/overlayRoot';
import DocumentAutoFillTokenPicker from '@/components/document-editor/DocumentAutoFillTokenPicker';
import { useDocumentAutoFillTokens } from '@/hooks/useDocumentAutoFillTokens';
import { insertDocumentSignatureAtomAtCaret, insertDocumentDateAtomAtCaret, insertDocumentTextAtCaret } from '@/lib/documentAutoFillTokens';
import type { DocumentSignerRoleDef } from '@/types/documentCreator';
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
  InitialsIcon,
  DateFieldIcon,
  RedoIcon,
  SignatureIcon,
  TextIcon,
  UndoIcon,
  ZoomIcon,
} from '@/components/document-editor/documentEditorIcons';
import type { DocumentSaveStatus } from '@/hooks/useDocumentAutoSave';

export type DocumentEditorRibbonProps = {
  onCloseOrBack: () => void;
  useCloseIcon: boolean;
  modeHeading: string;
  title: string;
  onTitleChange: (value: string) => void;
  showTitleInput: boolean;
  saveStatus?: DocumentSaveStatus | null;
  /** True while page images / backgrounds are still loading in the canvas. */
  mediaLoading?: boolean;
  isTemplate: boolean;
  showExportPdf: boolean;
  onExportPdf: () => void;
  isExportingPdf: boolean;
  showSendForSignature?: boolean;
  onSendForSignature?: () => void;
  showSaveTemplate: boolean;
  onSaveTemplate: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  readOnly: boolean;
  /**
   * When false, hide the "View only" badge/blur even if `readOnly` is true
   * (e.g. while the edit lock is still being acquired — "Opening document…").
   * Defaults to `readOnly`.
   */
  showViewOnlyBadge?: boolean;
  /** When set, shown under the "View only" badge (e.g. "This document is being edited by <name>"). */
  viewOnlyNotice?: string | null;
  onAddText: () => void;
  onAddImage: () => void;
  onAddImagePlaceholder: () => void;
  onAddInitials?: (assigneeRoleId: string) => void;
  /** Document signers for insert chooser. */
  signerRoles?: DocumentSignerRoleDef[];
  /** Open name dialog then create signer + insert for this field kind. */
  onRequestOtherSigner?: (kind: 'signature' | 'date' | 'initials', textElementId: string | null) => void;
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
  /** When a text box is being edited, Auto-fill inserts at the caret. */
  textEditingElementId?: string | null;
  projectId?: string | null;
  subjectUserId?: string | null;
};

const ZOOM_LEVELS = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;

/** Matches "Change background" trigger in DocumentEditor (ribbon layout panel). */
const ribbonDropdownTriggerClass =
  'inline-flex items-center gap-2 rounded-xl border border-slate-300/90 bg-white px-2.5 py-2 text-sm font-semibold text-slate-800 shadow-[0_1px_3px_rgba(15,23,42,0.08)] transition-[border-color,box-shadow,background-color] duration-200 ease-out hover:border-slate-400 hover:bg-slate-50 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-red/35';

function DocumentSaveStatusBadge({ status }: { status: DocumentSaveStatus }) {
  const badgeClass =
    'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold tabular-nums shadow-sm whitespace-nowrap';

  if (status === 'hydrating') return null;

  if (status === 'saving') {
    return (
      <span className={`${badgeClass} border border-slate-300/80 bg-slate-100 text-slate-600`}>
        Saving…
      </span>
    );
  }

  if (status === 'save_failed') {
    return (
      <span className={`${badgeClass} border border-red-200 bg-red-50 text-red-700`}>
        Save failed
      </span>
    );
  }

  if (status === 'dirty') {
    return (
      <span className={`${badgeClass} border border-amber-200 bg-amber-50 text-amber-800`}>
        Unsaved changes
      </span>
    );
  }

  if (status === 'saved') {
    return (
      <span className={`${badgeClass} border border-green-200 bg-green-50 text-green-700`}>
        Saved
      </span>
    );
  }

  return (
    <span className={`${badgeClass} border border-green-200 bg-green-50 text-green-700`}>
      All changes saved
    </span>
  );
}

export default function DocumentEditorRibbon(props: DocumentEditorRibbonProps) {
  const {
    onCloseOrBack,
    useCloseIcon,
    modeHeading,
    title,
    onTitleChange,
    showTitleInput,
    saveStatus,
    mediaLoading = false,
    isTemplate,
    showExportPdf,
    onExportPdf,
    isExportingPdf,
    showSendForSignature = false,
    onSendForSignature,
    showSaveTemplate,
    onSaveTemplate,
    onUndo,
    onRedo,
    canUndo,
    canRedo,
    readOnly,
    showViewOnlyBadge,
    viewOnlyNotice,
    onAddText,
    onAddImage,
    onAddImagePlaceholder,
    onAddInitials,
    signerRoles = [],
    onRequestOtherSigner,
    showBlock,
    onAddBlock,
    layoutPanel,
    selectionPanel,
    inspectorPanel,
    zoom,
    onZoomChange,
    extraActions,
    closeSlotBelow,
    textEditingElementId = null,
    projectId = null,
    subjectUserId = null,
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
  const { data: tokenValues } = useDocumentAutoFillTokens(projectId, !readOnly, subjectUserId);

  type RoleInsertKind = 'signature' | 'date' | 'initials';
  const [roleMenu, setRoleMenu] = useState<{
    kind: RoleInsertKind;
    top: number;
    left: number;
    /** Captured before toolbar/menu blur clears inline editing. */
    textElementId: string | null;
  } | null>(null);
  const roleMenuRef = useRef<HTMLDivElement>(null);

  const openRoleChooser = (kind: RoleInsertKind, trigger: HTMLElement | null) => {
    const textElementId = textEditingElementId;
    if (!trigger) {
      setRoleMenu({ kind, top: 80, left: 24, textElementId });
      return;
    }
    const r = trigger.getBoundingClientRect();
    const panelW = 168;
    const left = Math.max(8, Math.min(r.left, window.innerWidth - panelW - 8));
    setRoleMenu({ kind, top: r.bottom + 4, left, textElementId });
  };

  const pickRole = (roleId: string) => {
    const kind = roleMenu?.kind;
    const textId = roleMenu?.textElementId ?? textEditingElementId;
    setRoleMenu(null);
    if (!kind) return;
    if (kind === 'initials') {
      onAddInitials?.(roleId);
      return;
    }
    if (!textId) {
      toast.error(
        kind === 'date'
          ? 'Click inside a text box first, then insert Date at the cursor.'
          : 'Click inside a text box first, then insert Signature at the cursor.',
      );
      return;
    }
    if (kind === 'date') insertDocumentDateAtomAtCaret(textId, { assignee: roleId });
    else insertDocumentSignatureAtomAtCaret(textId, { assignee: roleId });
  };

  useEffect(() => {
    if (!roleMenu) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (roleMenuRef.current?.contains(t)) return;
      setRoleMenu(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setRoleMenu(null);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [roleMenu]);

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
  const viewOnlyBadge = showViewOnlyBadge ?? readOnly;

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
        </RibbonGroup>

        <div className="flex min-w-0 flex-1 flex-nowrap items-end gap-0">
        {/* flex-1 so the view-only overlay centers across the free space between Document and Export */}
        <div className="relative flex min-w-0 flex-1 flex-nowrap items-end gap-0">
        <div
          className={`flex min-w-0 flex-nowrap items-end gap-0 ${
            viewOnlyBadge ? 'pointer-events-none select-none blur-[3px] opacity-60' : ''
          }`}
          aria-hidden={viewOnlyBadge || undefined}
        >
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
            {onAddInitials && (
              <RibbonLargeButton
                icon={<InitialsIcon />}
                label="Initials"
                keepTextSelection
                onMouseDown={(e) => e.preventDefault()}
                onClick={(e) => openRoleChooser('initials', e.currentTarget)}
                title="Insert initials field — choose who signs"
              />
            )}
            <RibbonLargeButton
              icon={<DateFieldIcon />}
              label="Date"
              keepTextSelection
              onMouseDown={(e) => e.preventDefault()}
              onClick={(e) => openRoleChooser('date', e.currentTarget)}
              title={
                textEditingElementId
                  ? 'Insert date field at the cursor — choose who fills it'
                  : 'Edit a text box first, then insert Date at the cursor'
              }
            />
            <RibbonLargeButton
              icon={<SignatureIcon />}
              label="Signature"
              keepTextSelection
              onMouseDown={(e) => e.preventDefault()}
              onClick={(e) => openRoleChooser('signature', e.currentTarget)}
              title={
                textEditingElementId
                  ? 'Insert signature field at the cursor — choose who signs'
                  : 'Edit a text box first, then insert Signature at the cursor'
              }
            />
          </RibbonGroup>
        )}

        {roleMenu &&
          createPortal(
            <div
              ref={roleMenuRef}
              className={ribbonPortalDropdownPanelClass}
              style={{ position: 'fixed', top: roleMenu.top, left: roleMenu.left, zIndex: 100060, minWidth: 160 }}
              role="menu"
              data-document-keep-text-selection=""
            >
              <p className="px-2.5 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                Who signs
              </p>
              {(signerRoles.length ? signerRoles : []).map((role) => (
                <button
                  key={role.id}
                  type="button"
                  role="menuitem"
                  className="block w-full px-2.5 py-1.5 text-left text-sm text-slate-800 hover:bg-slate-100"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pickRole(role.id)}
                >
                  {role.label}
                </button>
              ))}
              {onRequestOtherSigner ? (
                <button
                  type="button"
                  role="menuitem"
                  className="block w-full border-t border-slate-100 px-2.5 py-1.5 text-left text-sm font-medium text-slate-700 hover:bg-slate-100"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    const kind = roleMenu?.kind;
                    const textElementId = roleMenu?.textElementId ?? textEditingElementId;
                    setRoleMenu(null);
                    if (!kind) return;
                    onRequestOtherSigner(kind, textElementId);
                  }}
                >
                  Other
                </button>
              ) : null}
            </div>,
            getOverlayRoot(),
          )}

        {!readOnly && (
          <RibbonGroup label="Page">
            <div className="flex flex-wrap items-end gap-2.5 max-w-[min(100vw-2rem,450px)]">{layoutPanel}</div>
          </RibbonGroup>
        )}

        {!readOnly && (
          <RibbonGroup label="Variables">
            <div className="inline-flex items-center pb-0.5">
              <button
                type="button"
                ref={tokensTriggerRef}
                onClick={() => setTokensMenuOpen((v) => !v)}
                className={ribbonDropdownTriggerClass}
                title="Auto-fill tokens"
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
                    className="fixed z-[100060]"
                    style={{ top: tokensMenuPos.top, left: tokensMenuPos.left }}
                  >
                    <DocumentAutoFillTokenPicker
                      tokens={tokenValues?.tokens ?? []}
                      forceToken={isTemplate}
                      onClose={() => setTokensMenuOpen(false)}
                      onInsert={(text) => {
                        if (textEditingElementId) {
                          insertDocumentTextAtCaret(textEditingElementId, text);
                        } else {
                          void navigator.clipboard.writeText(text);
                          toast.success('Copied to clipboard — click a text box, then Auto-fill to insert at the cursor.');
                        }
                        setTokensMenuOpen(false);
                      }}
                    />
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

        </div>
        {viewOnlyBadge && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1 px-2 text-center">
            <span className="rounded-full bg-slate-900/80 px-3 py-1 text-xs font-bold uppercase tracking-[0.12em] text-white shadow-lg">
              View only
            </span>
            {viewOnlyNotice && (
              <span className="max-w-[min(70vw,420px)] rounded-full bg-slate-900/70 px-2.5 py-0.5 text-center text-[11px] font-medium leading-snug text-white/90 shadow">
                {viewOnlyNotice}
              </span>
            )}
          </div>
        )}
        </div>
        {/* Export / save status / extra actions stay outside the view-only blur — Export PDF works while viewing. */}
        {(showExportPdf || showSendForSignature || saveStatus || mediaLoading || extraActions) && (
          <div className="ml-auto flex shrink-0 items-end gap-2 border-l border-slate-200/75 pl-2 sm:pl-2.5">
            {(showExportPdf || showSendForSignature || saveStatus || mediaLoading) && (
              <div className="flex min-h-[64px] flex-col items-center justify-end gap-1 py-1">
                <div className="flex items-end gap-1.5">
                  {showSendForSignature && onSendForSignature ? (
                    <RibbonCompactButton
                      icon={<SignatureIcon className="w-4 h-4" />}
                      label="Send for signature"
                      onClick={onSendForSignature}
                      title="Send for signature"
                      variant="primary"
                    />
                  ) : null}
                  {showExportPdf ? (
                    <RibbonCompactButton
                      icon={<ExportPdfIcon className="w-4 h-4" />}
                      label={isExportingPdf ? 'Exporting…' : 'Export PDF'}
                      onClick={onExportPdf}
                      disabled={isExportingPdf}
                      title="Export PDF"
                      variant="primary"
                    />
                  ) : null}
                </div>
                <div className="flex items-center justify-center gap-1.5">
                  {mediaLoading ? (
                    <span
                      className="inline-flex h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600"
                      role="status"
                      aria-label="Loading images"
                      title="Loading images…"
                    />
                  ) : null}
                  {saveStatus ? <DocumentSaveStatusBadge status={saveStatus} /> : null}
                </div>
              </div>
            )}
            {extraActions ? <div className="flex shrink-0 items-end pb-2.5 pr-1">{extraActions}</div> : null}
          </div>
        )}
        </div>
      </div>
      {selectionPanel || inspectorPanel ? (
        <div
          data-document-editor-formatting="true"
          className={`${editorContextStripClass} flex shrink-0 flex-nowrap items-stretch gap-0 overflow-x-auto px-2 py-1 sm:px-3 sm:py-1.5 [scrollbar-width:thin]`}
          role="region"
          aria-label="Selection and formatting"
        >
          {selectionPanel ? <div className="flex shrink-0 items-stretch">{selectionPanel}</div> : null}
          {selectionPanel && inspectorPanel ? (
            // Match editorContextToolbarRowClass divide-x + group px (Done/Delete separators).
            <div className="w-px shrink-0 self-stretch bg-slate-300/85" aria-hidden />
          ) : null}
          {inspectorPanel ? (
            <div className="flex min-w-0 shrink-0 items-stretch pl-2.5 sm:pl-3">{inspectorPanel}</div>
          ) : null}
        </div>
      ) : null}
    </RibbonShell>
  );
}
