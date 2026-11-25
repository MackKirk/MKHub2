import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import toast from 'react-hot-toast';
import { getOverlayRoot } from '@/lib/overlayRoot';
import DocumentAutoFillTokenPicker from '@/components/document-editor/DocumentAutoFillTokenPicker';
import { useDocumentAutoFillTokens } from '@/hooks/useDocumentAutoFillTokens';
import { insertDocumentSignatureAtomAtCaret, insertDocumentDateAtomAtCaret, insertDocumentTextAtCaret, autoFillPickerDescription, filterAutoFillTokensForScope } from '@/lib/documentAutoFillTokens';
import type { DocumentSignerRoleDef } from '@/types/documentCreator';
import {
  RibbonShell,
  RibbonCompactButton,
  ribbonPortalDropdownPanelClass,
  ribbonMenuTriggerClass,
  ribbonIconToolClass,
  ribbonMenuItemClass,
  editorContextStripClass,
} from '@/components/document-editor/documentEditorRibbonPrimitives';
import {
  BackIcon,
  BlockIcon,
  CloseIcon,
  ExportPdfIcon,
  FieldReportIcon,
  ImageAreaIcon,
  ImageIcon,
  InitialsIcon,
  DateFieldIcon,
  RedoIcon,
  SaveIcon,
  SignatureIcon,
  TextIcon,
  UndoIcon,
  ZoomIcon,
  ZoomInIcon,
  ZoomOutIcon,
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
  /** Manual save (autosave flush). Shown in File when available. */
  onSave?: () => void | Promise<boolean | void>;
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
  /** R&M only: open approved Field Report photo picker (optional; omitted elsewhere). */
  onInsertFromFieldReport?: () => void;
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

const ZOOM_LEVELS = [0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.25, 1.5, 2] as const;

type RibbonMenuId = 'file' | 'edit' | 'insert' | 'page' | 'view';

function DocumentSaveStatusBadge({ status }: { status: DocumentSaveStatus }) {
  const badgeClass =
    'shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums shadow-sm whitespace-nowrap';

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
    onSave,
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
    onInsertFromFieldReport,
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

  const [openMenu, setOpenMenu] = useState<RibbonMenuId | null>(null);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });
  const menuPanelRef = useRef<HTMLDivElement>(null);
  const fileTriggerRef = useRef<HTMLButtonElement>(null);
  const editTriggerRef = useRef<HTMLButtonElement>(null);
  const insertTriggerRef = useRef<HTMLButtonElement>(null);
  const pageTriggerRef = useRef<HTMLButtonElement>(null);
  const viewTriggerRef = useRef<HTMLButtonElement>(null);

  const menuTriggerRef = (id: RibbonMenuId) => {
    if (id === 'file') return fileTriggerRef;
    if (id === 'edit') return editTriggerRef;
    if (id === 'insert') return insertTriggerRef;
    if (id === 'page') return pageTriggerRef;
    return viewTriggerRef;
  };

  const toggleMenu = (id: RibbonMenuId) => {
    setTokensMenuOpen(false);
    setOpenMenu((cur) => (cur === id ? null : id));
  };

  const closeMenus = () => setOpenMenu(null);

  const [tokensMenuOpen, setTokensMenuOpen] = useState(false);
  const [tokensMenuPos, setTokensMenuPos] = useState({ top: 0, left: 0 });
  const tokensDropdownRef = useRef<HTMLDivElement>(null);
  const { data: tokenValues } = useDocumentAutoFillTokens(projectId, !readOnly, subjectUserId);
  const scopedAutoFillTokens = useMemo(
    () =>
      filterAutoFillTokensForScope(tokenValues?.tokens ?? [], {
        projectId: isTemplate ? null : projectId,
        subjectUserId: isTemplate ? null : subjectUserId,
      }),
    [tokenValues?.tokens, projectId, subjectUserId, isTemplate],
  );
  const autoFillDescription = useMemo(
    () =>
      autoFillPickerDescription({
        projectId: isTemplate ? null : projectId,
        subjectUserId: isTemplate ? null : subjectUserId,
        forceToken: isTemplate,
      }),
    [projectId, subjectUserId, isTemplate],
  );

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

  useLayoutEffect(() => {
    if (!openMenu) return;
    const trigger = menuTriggerRef(openMenu).current;
    if (!trigger) return;
    const place = () => {
      const r = trigger.getBoundingClientRect();
      const panelW = openMenu === 'page' ? 360 : openMenu === 'insert' ? 220 : 200;
      const left = Math.max(8, Math.min(r.left, window.innerWidth - panelW - 8));
      setMenuPos({ top: r.bottom + 4, left });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [openMenu]);

  useEffect(() => {
    if (!openMenu) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node | null;
      if (!t) return;
      if (menuTriggerRef(openMenu).current?.contains(t)) return;
      if (menuPanelRef.current?.contains(t)) return;
      // Background picker portal lives outside the menu panel — keep Page open while using it.
      if (openMenu === 'page' && (t as Element).closest?.('[role="listbox"][aria-label="Page backgrounds"]')) {
        return;
      }
      setOpenMenu(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenMenu(null);
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [openMenu]);

  useEffect(() => {
    if (!tokensMenuOpen) return;
    const reposition = () => {
      const anchor = insertTriggerRef.current;
      if (!anchor) return;
      const r = anchor.getBoundingClientRect();
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
      if (insertTriggerRef.current?.contains(t)) return;
      if (tokensDropdownRef.current?.contains(t)) return;
      setTokensMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setTokensMenuOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
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

  const zoomOut = () => {
    const lower = [...ZOOM_LEVELS].reverse().find((z) => z < zoom - 0.001);
    onZoomChange(lower ?? ZOOM_LEVELS[0]);
  };
  const zoomIn = () => {
    const higher = ZOOM_LEVELS.find((z) => z > zoom + 0.001);
    onZoomChange(higher ?? ZOOM_LEVELS[ZOOM_LEVELS.length - 1]);
  };
  const canZoomOut = zoom > ZOOM_LEVELS[0] + 0.001;
  const canZoomIn = zoom < ZOOM_LEVELS[ZOOM_LEVELS.length - 1] - 0.001;

  const menuItem = (
    opts: {
      icon?: ReactNode;
      label: string;
      onClick: () => void;
      disabled?: boolean;
      keepTextSelection?: boolean;
      title?: string;
    },
  ) => (
    <button
      type="button"
      role="menuitem"
      disabled={opts.disabled}
      title={opts.title}
      className={ribbonMenuItemClass}
      onMouseDown={opts.keepTextSelection ? (e) => e.preventDefault() : undefined}
      {...(opts.keepTextSelection ? { 'data-document-keep-text-selection': '' } : {})}
      onClick={() => {
        opts.onClick();
        closeMenus();
      }}
    >
      {opts.icon ? (
        <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center text-slate-600 [&>svg]:h-4 [&>svg]:w-4">
          {opts.icon}
        </span>
      ) : null}
      <span className="min-w-0 flex-1 truncate">{opts.label}</span>
    </button>
  );

  return (
    <RibbonShell>
      <div
        className="flex h-11 flex-nowrap items-center gap-1 overflow-x-auto border-b border-slate-200/80 bg-gradient-to-b from-white via-slate-50/90 to-slate-100/80 px-1.5 sm:px-2.5 [scrollbar-width:thin]"
        role="toolbar"
        aria-label="Document editor toolbar"
      >
        <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            onClick={onCloseOrBack}
            className={ribbonIconToolClass}
            aria-label={useCloseIcon ? 'Close' : 'Back'}
          >
            {useCloseIcon ? <CloseIcon className="h-4 w-4" /> : <BackIcon className="h-4 w-4" />}
          </button>
          {closeSlotBelow}
        </div>

        <div className="flex min-w-0 max-w-[min(220px,36vw)] flex-col justify-center sm:max-w-[280px]">
          <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-slate-500 leading-none">
            {modeHeading}
          </span>
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
                className="mt-0.5 h-7 w-full rounded-md border border-slate-300/90 bg-white px-1.5 text-xs font-bold text-slate-900 focus:border-brand-red/45 focus:outline-none focus:ring-2 focus:ring-brand-red/25"
                aria-label="Document title"
              />
            ) : (
              <button
                type="button"
                onClick={beginTitleEdit}
                className="mt-0.5 w-full truncate rounded-md px-1 py-0.5 text-left text-xs font-bold text-slate-900 hover:bg-white"
                title="Click to edit document name"
              >
                {displayTitle}
              </button>
            )
          ) : (
            !isTemplate &&
            readOnly && (
              <span className="mt-0.5 truncate text-xs font-semibold text-slate-800" title={title}>
                {displayTitle}
              </span>
            )
          )}
        </div>

        <div className="mx-0.5 h-6 w-px shrink-0 bg-slate-200/90" aria-hidden />

        <div className="relative flex min-w-0 flex-1 flex-nowrap items-center gap-0.5">
          <div
            className={`flex min-w-0 flex-nowrap items-center gap-0.5 ${
              viewOnlyBadge ? 'pointer-events-none select-none blur-[2px] opacity-55' : ''
            }`}
            aria-hidden={viewOnlyBadge || undefined}
          >
            <button
              type="button"
              ref={fileTriggerRef}
              className={ribbonMenuTriggerClass}
              aria-expanded={openMenu === 'file'}
              aria-haspopup="menu"
              onClick={() => toggleMenu('file')}
            >
              File <span className="text-slate-400">▾</span>
            </button>
            <button
              type="button"
              ref={editTriggerRef}
              className={ribbonMenuTriggerClass}
              aria-expanded={openMenu === 'edit'}
              aria-haspopup="menu"
              onClick={() => toggleMenu('edit')}
            >
              Edit <span className="text-slate-400">▾</span>
            </button>
            {!readOnly ? (
              <button
                type="button"
                ref={insertTriggerRef}
                className={ribbonMenuTriggerClass}
                aria-expanded={openMenu === 'insert'}
                aria-haspopup="menu"
                onClick={() => toggleMenu('insert')}
              >
                Insert <span className="text-slate-400">▾</span>
              </button>
            ) : null}
            {!readOnly ? (
              <button
                type="button"
                ref={pageTriggerRef}
                className={ribbonMenuTriggerClass}
                aria-expanded={openMenu === 'page'}
                aria-haspopup="menu"
                onClick={() => toggleMenu('page')}
              >
                Page <span className="text-slate-400">▾</span>
              </button>
            ) : null}
          </div>

          {viewOnlyBadge ? (
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-0.5 px-2 text-center">
              <span className="rounded-full bg-slate-900/80 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-white shadow">
                View only
              </span>
              {viewOnlyNotice ? (
                <span className="max-w-[min(70vw,360px)] rounded-full bg-slate-900/70 px-2 py-0.5 text-center text-[10px] font-semibold leading-snug text-white/90 shadow">
                  {viewOnlyNotice}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-1 border-l border-slate-200/75 pl-2">
          {!viewOnlyBadge ? (
            <>
              <button
                type="button"
                className={ribbonIconToolClass}
                onClick={onUndo}
                disabled={!canUndo}
                title="Undo (Ctrl+Z)"
                aria-label="Undo"
              >
                <UndoIcon className="h-4 w-4" />
              </button>
              <button
                type="button"
                className={ribbonIconToolClass}
                onClick={onRedo}
                disabled={!canRedo}
                title="Redo (Ctrl+Y)"
                aria-label="Redo"
              >
                <RedoIcon className="h-4 w-4" />
              </button>
              <div className="mx-0.5 h-5 w-px shrink-0 bg-slate-200/90" aria-hidden />
            </>
          ) : null}

          <div className="flex items-center gap-0.5" role="group" aria-label="Zoom">
            <button
              type="button"
              className={ribbonIconToolClass}
              onClick={zoomOut}
              disabled={!canZoomOut}
              title="Zoom out"
              aria-label="Zoom out"
            >
              <ZoomOutIcon className="h-4 w-4" />
            </button>
            <button
              type="button"
              ref={viewTriggerRef}
              className="inline-flex h-8 min-w-[3rem] items-center justify-center rounded-md px-1.5 text-xs font-semibold tabular-nums text-slate-700 hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-red/35"
              title="Zoom level"
              aria-expanded={openMenu === 'view'}
              aria-haspopup="menu"
              onClick={() => toggleMenu('view')}
            >
              {Math.round(zoom * 100)}%
            </button>
            <button
              type="button"
              className={ribbonIconToolClass}
              onClick={zoomIn}
              disabled={!canZoomIn}
              title="Zoom in"
              aria-label="Zoom in"
            >
              <ZoomInIcon className="h-4 w-4" />
            </button>
          </div>

          <div className="mx-0.5 h-5 w-px shrink-0 bg-slate-200/90" aria-hidden />

          {showSendForSignature && onSendForSignature ? (
            <RibbonCompactButton
              icon={<SignatureIcon className="h-3.5 w-3.5" />}
              label="Send"
              onClick={onSendForSignature}
              title="Send for signature"
              variant="primary"
            />
          ) : null}
          {showExportPdf ? (
            <RibbonCompactButton
              icon={<ExportPdfIcon className="h-3.5 w-3.5" />}
              label={isExportingPdf ? '…' : 'PDF'}
              onClick={onExportPdf}
              disabled={isExportingPdf}
              title="Export PDF"
              variant="primary"
            />
          ) : null}
          {mediaLoading ? (
            <span
              className="inline-flex h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600"
              role="status"
              aria-label="Loading images"
              title="Loading images…"
            />
          ) : null}
          {saveStatus ? <DocumentSaveStatusBadge status={saveStatus} /> : null}
          {extraActions ? <div className="flex shrink-0 items-center">{extraActions}</div> : null}
        </div>
      </div>

      {openMenu
        ? createPortal(
            <div
              ref={menuPanelRef}
              role="menu"
              className={`${ribbonPortalDropdownPanelClass} ${
                openMenu === 'page' ? 'w-[min(92vw,360px)]' : openMenu === 'insert' ? 'w-[220px]' : 'w-[200px]'
              }`}
              style={{ top: menuPos.top, left: menuPos.left, zIndex: 100060 }}
              data-document-keep-text-selection=""
            >
              {openMenu === 'file' ? (
                <>
                  {onSave && !readOnly
                    ? menuItem({
                        icon: <SaveIcon />,
                        label: 'Save',
                        onClick: () => {
                          void onSave();
                        },
                        title: 'Ctrl+S',
                      })
                    : null}
                  {showSaveTemplate
                    ? menuItem({
                        icon: <SaveIcon />,
                        label: 'Save page layout',
                        onClick: onSaveTemplate,
                      })
                    : null}
                  {showExportPdf
                    ? menuItem({
                        icon: <ExportPdfIcon />,
                        label: isExportingPdf ? 'Exporting…' : 'Export PDF',
                        onClick: onExportPdf,
                        disabled: isExportingPdf,
                      })
                    : null}
                  {showSendForSignature && onSendForSignature
                    ? menuItem({
                        icon: <SignatureIcon />,
                        label: 'Send for signature',
                        onClick: onSendForSignature,
                      })
                    : null}
                  {!onSave && !showExportPdf && !showSendForSignature && !showSaveTemplate ? (
                    <p className="px-2.5 py-2 text-xs text-slate-500">No file actions</p>
                  ) : null}
                </>
              ) : null}

              {openMenu === 'edit' ? (
                <>
                  {menuItem({
                    icon: <UndoIcon />,
                    label: 'Undo',
                    onClick: onUndo,
                    disabled: !canUndo,
                    title: 'Ctrl+Z',
                  })}
                  {menuItem({
                    icon: <RedoIcon />,
                    label: 'Redo',
                    onClick: onRedo,
                    disabled: !canRedo,
                    title: 'Ctrl+Y',
                  })}
                </>
              ) : null}

              {openMenu === 'insert' ? (
                <>
                  {menuItem({ icon: <TextIcon />, label: 'Text box', onClick: onAddText })}
                  {menuItem({ icon: <ImageIcon />, label: 'Image', onClick: onAddImage })}
                  {menuItem({
                    icon: <ImageAreaIcon />,
                    label: 'Image area',
                    onClick: onAddImagePlaceholder,
                  })}
                  {onInsertFromFieldReport
                    ? menuItem({
                        icon: <FieldReportIcon />,
                        label: 'Field report…',
                        onClick: onInsertFromFieldReport,
                      })
                    : null}
                  {showBlock && onAddBlock
                    ? menuItem({ icon: <BlockIcon />, label: 'Block', onClick: onAddBlock })
                    : null}
                  {!projectId && onAddInitials
                    ? menuItem({
                        icon: <InitialsIcon />,
                        label: 'Initials…',
                        keepTextSelection: true,
                        onClick: () => openRoleChooser('initials', insertTriggerRef.current),
                      })
                    : null}
                  {!projectId
                    ? menuItem({
                        icon: <DateFieldIcon />,
                        label: 'Date…',
                        keepTextSelection: true,
                        onClick: () => openRoleChooser('date', insertTriggerRef.current),
                      })
                    : null}
                  {!projectId
                    ? menuItem({
                        icon: <SignatureIcon />,
                        label: 'Signature…',
                        keepTextSelection: true,
                        onClick: () => openRoleChooser('signature', insertTriggerRef.current),
                      })
                    : null}
                  <div className="my-1 border-t border-slate-100" aria-hidden />
                  <button
                    type="button"
                    role="menuitem"
                    className={ribbonMenuItemClass}
                    data-document-keep-text-selection=""
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      closeMenus();
                      // Open after Insert menu closes so position uses the Insert trigger.
                      window.requestAnimationFrame(() => {
                        if (!insertTriggerRef.current) return;
                        const r = insertTriggerRef.current.getBoundingClientRect();
                        const panelW = 320;
                        const left = Math.max(8, Math.min(r.left, window.innerWidth - panelW - 8));
                        setTokensMenuPos({ top: r.bottom + 4, left });
                        setTokensMenuOpen(true);
                      });
                    }}
                  >
                    <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center font-mono text-[11px] text-slate-600">
                      {'{ }'}
                    </span>
                    <span className="min-w-0 flex-1 truncate">Auto-fill…</span>
                  </button>
                </>
              ) : null}

              {openMenu === 'page' ? (
                <div className="flex flex-col gap-2 p-1">{layoutPanel}</div>
              ) : null}

              {openMenu === 'view' ? (
                <>
                  {ZOOM_LEVELS.map((z) =>
                    menuItem({
                      icon: zoom === z ? <ZoomIcon /> : undefined,
                      label: `${Math.round(z * 100)}%`,
                      onClick: () => onZoomChange(z),
                    }),
                  )}
                </>
              ) : null}
            </div>,
            getOverlayRoot(),
          )
        : null}

      {roleMenu &&
        createPortal(
          <div
            ref={roleMenuRef}
            className={ribbonPortalDropdownPanelClass}
            style={{ position: 'fixed', top: roleMenu.top, left: roleMenu.left, zIndex: 100060, minWidth: 160 }}
            role="menu"
            data-document-keep-text-selection=""
          >
            <p className="px-2.5 pt-2 pb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
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
                className="block w-full border-t border-slate-100 px-2.5 py-1.5 text-left text-sm font-semibold text-slate-700 hover:bg-slate-100"
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

      {tokensMenuOpen &&
        createPortal(
          <div
            ref={tokensDropdownRef}
            className="fixed z-[100060]"
            style={{ top: tokensMenuPos.top, left: tokensMenuPos.left }}
          >
            <DocumentAutoFillTokenPicker
              tokens={scopedAutoFillTokens}
              forceToken={isTemplate}
              description={autoFillDescription}
              onClose={() => setTokensMenuOpen(false)}
              onInsert={(text) => {
                if (textEditingElementId) {
                  insertDocumentTextAtCaret(textEditingElementId, text);
                } else {
                  void navigator.clipboard.writeText(text);
                  toast.success(
                    'Copied to clipboard — click a text box, then Auto-fill to insert at the cursor.',
                  );
                }
                setTokensMenuOpen(false);
              }}
            />
          </div>,
          getOverlayRoot(),
        )}

      {selectionPanel || inspectorPanel ? (
        <div
          data-document-editor-formatting="true"
          className={`${editorContextStripClass} flex shrink-0 flex-nowrap items-center gap-0 overflow-x-auto px-1.5 py-0.5 sm:px-2 [scrollbar-width:thin]`}
          role="region"
          aria-label="Selection and formatting"
        >
          {selectionPanel ? <div className="flex shrink-0 items-center">{selectionPanel}</div> : null}
          {selectionPanel && inspectorPanel ? (
            // Match editorContextToolbarRowClass divide-x + group px (Done/Delete separators).
            <div className="mx-0.5 h-5 w-px shrink-0 self-center bg-slate-300/85" aria-hidden />
          ) : null}
          {inspectorPanel ? (
            <div className="flex min-w-0 shrink-0 items-center pl-1.5 sm:pl-2">{inspectorPanel}</div>
          ) : null}
        </div>
      ) : null}
    </RibbonShell>
  );
}
