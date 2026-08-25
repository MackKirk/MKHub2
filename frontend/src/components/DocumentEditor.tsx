import { useState, useEffect, useLayoutEffect, useCallback, useMemo, useRef, forwardRef, useImperativeHandle } from 'react';
import { createPortal, flushSync } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useNavigateBack } from '@/hooks/useNavigateBack';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, getToken, withFileAccessToken, ApiError, getApiErrorCode, isDocumentConcurrencyError } from '@/lib/api';
import { getOverlayRoot } from '@/lib/overlayRoot';
import toast from 'react-hot-toast';
import { useConfirm } from '@/components/ConfirmProvider';
import { useUnsavedChangesGuard } from '@/hooks/useUnsavedChangesGuard';
import { useDocumentAutoSave, type DocumentSaveStatus } from '@/hooks/useDocumentAutoSave';
import { useDocumentMediaLoading } from '@/hooks/useDocumentMediaLoading';
import DocumentPreview from '@/components/DocumentPreview';
import DocumentPagesStrip from '@/components/DocumentPagesStrip';
import { AddPageModal } from '@/components/AddPageModal';
import ImagePicker, { type ImagePickerConfirmMeta } from '@/components/ImagePicker';
import type { DocumentPage, DocElement, PageMargins, DocumentSignerRoleDef } from '@/types/documentCreator';
import {
  createTextElement,
  createImageElement,
  createImagePlaceholder,
  createBlockElement,
  createInitialsElement,
  sizeImageElementFrameForIntrinsicAspect,
  ensureSignerRolesForDocument,
  addSigner,
  nextOtherSignerLabel,
  pruneUnusedSigners,
  placeElementOutsideBlockedAreas,
  collectPresentSignerRoleIds,
  normalizeSignerRolesList,
} from '@/types/documentCreator';
import { readDocumentCreatorClipboard, writeDocumentCreatorClipboard } from '@/utils/documentCreatorClipboard';
import OverlayPortal from '@/components/OverlayPortal';
import DocumentEditorRibbon from '@/components/document-editor/DocumentEditorRibbon';
import SendForSignatureModal from '@/components/SendForSignatureModal';
import { insertDocumentSignatureAtomAtCaret, insertDocumentDateAtomAtCaret } from '@/lib/documentAutoFillTokens';
import { AppButton, AppFormModal, AppInput, uiSpacing } from '@/components/ui';
import {
  ribbonPortalDropdownPanelClass,
  editorSurfaceWorkspaceClass,
  editorCanvasScrollAreaClass,
  editorGroupLabelClass,
  editorSidePanelBodyClass,
  editorSidePanelCollapsedRailRightClass,
  editorSidePanelCollapsedRailButtonClass,
  editorSidePanelCollapsedRailCaptionClass,
  editorSidePanelCollapseToggleClass,
  editorSidePanelHeaderClass,
  editorSidePanelHeadingMetaClass,
  editorSidePanelHeadingTitleClass,
  editorSidePanelRootRightClass,
} from '@/components/document-editor/documentEditorRibbonPrimitives';
import DocumentSelectionRibbon from '@/components/document-editor/DocumentSelectionRibbon';
import DocumentSelectionInspector from '@/components/document-editor/DocumentSelectionInspector';
import { notifyTextEditBlocking, dismissTextEditBlockingToast } from '@/components/document-editor/notifyTextEditBlocking';
import type { AlignKind } from '@/components/document-editor/DocumentSelectionRibbon';
import {
  imageFilesFromClipboardData,
  isLikelyImageFile,
  readImageFileDimensions,
} from '@/utils/imageUploadHelpers';
import {
  BlockIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  MiniLayersStackGlyph,
  ImageIcon,
  InitialsIcon,
  DateFieldIcon,
  LayerBackwardIcon,
  LayerForwardIcon,
  LayerToBackIcon,
  LayerToFrontIcon,
  LockIcon,
  PinIcon,
  TextIcon,
} from '@/components/document-editor/documentEditorIcons';

type Template = {
  id: string;
  name: string;
  description?: string;
  background_file_id?: string;
  areas_definition?: any;
  margins?: { left_pct?: number; right_pct?: number; top_pct?: number; bottom_pct?: number };
  default_elements?: DocElement[];
};

type UserDocument = {
  id: string;
  title: string;
  document_type_id?: string;
  project_id?: string | null;
  page_count?: number;
  pages?: DocumentPage[];
  created_at?: string;
  updated_at?: string | null;
  edit_lock?: {
    active?: boolean;
    user_id?: string | null;
    user_name?: string | null;
    session_id?: string | null;
  };
};

function holderNameFromLockError(e: unknown): string | null {
  if (!(e instanceof ApiError) || !e.detail || typeof e.detail !== 'object' || Array.isArray(e.detail)) {
    return null;
  }
  const name = (e.detail as { holder_name?: unknown }).holder_name;
  return typeof name === 'string' && name.trim() ? name.trim() : null;
}

const defaultPage = (): DocumentPage => ({ template_id: null, elements: [] });

type EditorSnapshot = {
  title: string;
  pages: DocumentPage[];
  signerRoles: DocumentSignerRoleDef[];
  currentPageIndex: number;
  selectedElementIds: string[];
};

function legacyToElements(areas_content: Record<string, string> | undefined, areas_def: any): DocElement[] {
  if (!areas_content || typeof areas_content !== 'object') return [];
  const areas = Array.isArray(areas_def) ? areas_def : (areas_def?.areas ?? []);
  return areas.map((a: any, i: number) => ({
    id: `legacy-${i}-${a.id || a.key || i}`,
    type: 'text',
    content: areas_content[a.id || a.key] ?? '',
    x_pct: a.x_pct ?? 10,
    y_pct: a.y_pct ?? 20,
    width_pct: a.width_pct ?? 80,
    height_pct: a.height_pct ?? 8,
    fontSize: a.font_size ?? 12,
  }));
}

type DocumentEditorDocumentProps = {
  documentId: string;
  projectId?: string | null;
  /** HR user the document is about — drives employee autofill tokens */
  subjectUserId?: string | null;
  onClose?: () => void;
  /** When true, document is view-only: no editing, no add page, no save. */
  readOnly?: boolean;
  /** Optional node rendered at the far right of the ribbon (e.g. expand/compress button). */
  extraActions?: React.ReactNode;
  /** Optional element rendered directly below the close/back button in the ribbon (e.g. expand button). */
  closeSlotBelow?: React.ReactNode;
  /** Pin ribbon to the Hub scrollport while the page scrolls (inline editor on project/opportunity). */
  stickyToolbar?: boolean;
  /** Show Send for signature (Document Builder /documents/create only). */
  enableSendForSignature?: boolean;
};

type DocumentEditorTemplateProps = {
  mode: 'template';
  open: boolean;
  pageIndex: number;
  templateId: string | null;
  templates: Template[];
  initialMargins?: PageMargins | null;
  initialElements?: DocElement[];
  onClose: () => void;
  onSave: (margins: PageMargins, elements: DocElement[], templateId?: string | null) => void;
  /** Add a new page to the type with the given layout (parent adds row and may reopen for new page) */
  onDuplicatePage?: (margins: PageMargins, elements: DocElement[]) => void;
};

type DocumentEditorProps = DocumentEditorDocumentProps | DocumentEditorTemplateProps;

function isTemplateMode(props: DocumentEditorProps): props is DocumentEditorTemplateProps {
  return 'mode' in props && props.mode === 'template';
}

export type DocumentEditorHandle = {
  hasUnsavedChanges: () => boolean;
  flushSave: () => Promise<boolean>;
};

const DocumentEditor = forwardRef<DocumentEditorHandle, DocumentEditorProps>(function DocumentEditor(props, ref) {
  const isTemplate = isTemplateMode(props);
  const documentId = !isTemplate ? props.documentId : undefined;
  const projectId = !isTemplate ? props.projectId : undefined;
  const subjectUserId = !isTemplate ? (props as DocumentEditorDocumentProps).subjectUserId : undefined;
  const onClose = props.onClose;
  const templateProps = isTemplate ? props : null;
  const propReadOnly = !isTemplate && !!(props as DocumentEditorDocumentProps).readOnly;
  const [lockForcedReadOnly, setLockForcedReadOnly] = useState(false);
  const [lockBannerHolder, setLockBannerHolder] = useState<string | null>(null);
  /** Soft-lock gate: writers start pending so UI stays read-only until acquire resolves. */
  type EditLockStatus = 'idle' | 'pending' | 'granted' | 'denied';
  const [editLockStatus, setEditLockStatus] = useState<EditLockStatus>(() =>
    isTemplate || (!isTemplate && !!(props as DocumentEditorDocumentProps).readOnly) ? 'idle' : 'pending',
  );
  const readOnly =
    propReadOnly || lockForcedReadOnly || editLockStatus === 'pending' || editLockStatus === 'denied';
  const extraActions = !isTemplate ? (props as DocumentEditorDocumentProps).extraActions : undefined;
  const closeSlotBelow = !isTemplate ? (props as DocumentEditorDocumentProps).closeSlotBelow : undefined;
  const stickyToolbar = !isTemplate && !!(props as DocumentEditorDocumentProps).stickyToolbar;
  const enableSendForSignature =
    !isTemplate && !!(props as DocumentEditorDocumentProps).enableSendForSignature;

  const navigate = useNavigate();
  const navigateBackToDocumentCreate = useNavigateBack('/documents/create');
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bgBackgroundTriggerRef = useRef<HTMLButtonElement>(null);
  const bgDropdownRef = useRef<HTMLDivElement>(null);
  const [bgMenuPos, setBgMenuPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  /** After initial GET for a document id, ignore refetches (e.g. post-save invalidate) so undo/redo is not cleared. */
  const serverDocHydratedForIdRef = useRef<string | null>(null);
  const [isDocHydrated, setIsDocHydrated] = useState(false);
  const id = documentId;
  /** Soft-lock session id for this editor mount (exclusive editing). */
  const editLockSessionIdRef = useRef<string>(
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `sess-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
  );
  const holdsEditLockRef = useRef(false);
  const expectedUpdatedAtRef = useRef<string | null>(null);
  /** True after hydrate has set the OCC baseline (including intentional null for never-saved docs). */
  const [versionBaselineReady, setVersionBaselineReady] = useState(false);
  const suppressSaveRetryRef = useRef(false);
  const versionConflictHandlingRef = useRef(false);
  const lockAcquireNonceRef = useRef(0);
  const [lockAcquireNonce, setLockAcquireNonce] = useState(0);
  const [holdsEditLock, setHoldsEditLock] = useState(false);
  const heartbeatFailCountRef = useRef(0);
  const lockLostHandlingRef = useRef(false);
  const lockMountGenRef = useRef(0);
  const inUsePromptedIdRef = useRef<string | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const navigateBackRef = useRef(navigateBackToDocumentCreate);
  navigateBackRef.current = navigateBackToDocumentCreate;
  const confirmRef = useRef(confirm);
  confirmRef.current = confirm;

  const [title, setTitle] = useState('New document');
  const [pages, setPages] = useState<DocumentPage[]>([defaultPage()]);
  const [signerRoles, setSignerRoles] = useState<DocumentSignerRoleDef[]>([]);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [selectedElementIds, setSelectedElementIds] = useState<string[]>([]);
  /** Inline text edit active — block selecting other elements until Done / Escape. */
  const [textEditingElementId, setTextEditingElementId] = useState<string | null>(null);
  const textEditingElementIdRef = useRef<string | null>(null);
  textEditingElementIdRef.current = textEditingElementId;
  const [showAddPageModal, setShowAddPageModal] = useState(false);
  const [pagesPanelCollapsed, setPagesPanelCollapsed] = useState(false);
  const [layersPanelCollapsed, setLayersPanelCollapsed] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [sendForSignatureOpen, setSendForSignatureOpen] = useState(false);
  const [otherSignerModalOpen, setOtherSignerModalOpen] = useState(false);
  const [otherSignerLabel, setOtherSignerLabel] = useState('');
  const otherSignerPendingRef = useRef<{
    kind?: 'signature' | 'date' | 'initials';
    textElementId?: string | null;
    resolve?: (id: string | null) => void;
  } | null>(null);
  /** Keep newly created signers in the catalog until their first field lands on the page. */
  const retainSignerIdsRef = useRef<Set<string>>(new Set());
  const [pdfPreview, setPdfPreview] = useState<{ url: string; filename: string } | null>(null);
  const [bgPickerOpen, setBgPickerOpen] = useState(false);
  const [imagePickerOpen, setImagePickerOpen] = useState(false);
  /** When set, ImagePicker is in "replace" mode for this element; when null, in "add" mode. */
  const [imagePickerReplaceElementId, setImagePickerReplaceElementId] = useState<string | null>(null);
  /** Preload this image in the picker when editing/replacing. */
  const [imagePickerFileObjectId, setImagePickerFileObjectId] = useState<string | undefined>(undefined);
  /** When true, picker opens directly in ImageEditor. */
  const [imagePickerOpenEditorOnOpen, setImagePickerOpenEditorOnOpen] = useState(false);
  /** Stable replace target captured when picker opens (survives async upload). */
  const imagePickerReplaceRef = useRef<{
    elementId: string;
    pageIndex: number;
    /** Keep placeholder/slot frame size (do not reflow to intrinsic aspect). */
    preserveFrame: boolean;
  } | null>(null);
  /** Prevents double onConfirm while upload is in flight. */
  const imagePickerConfirmLockRef = useRef(false);
  /** Synced for window paste listener so picker owns Ctrl+V while open. */
  const imagePickerOpenRef = useRef(false);
  /** True while canvas drag/resize is in progress (skip autosave dirtiness + freeze pages strip). */
  const canvasGestureActiveRef = useRef(false);
  const [frozenStripPages, setFrozenStripPages] = useState<DocumentPage[] | null>(null);
  const [canvasWidthPxForExport, setCanvasWidthPxForExport] = useState<number>(910);
  /** Vertical scroll container when multiple pages are stacked (`DocumentPreview` embedded). */
  const canvasScrollRef = useRef<HTMLDivElement>(null);
  const pageSectionRefs = useRef<(HTMLDivElement | null)[]>([]);
  /** Suppress IntersectionObserver page sync while sidebar scroll is in flight. */
  const pageScrollLockRef = useRef(false);

  const handlePreviewElementClick = useCallback(
    (pageIndex: number | undefined, elementId: string, e?: React.PointerEvent) => {
      if (pageIndex != null) setCurrentPageIndex(pageIndex);
      if (textEditingElementId && textEditingElementId !== elementId) {
        setSelectedElementIds([elementId]);
        return;
      }
      if (textEditingElementId) return;
      if (e?.ctrlKey || e?.metaKey) {
        setSelectedElementIds((prev) =>
          prev.includes(elementId) ? prev.filter((id) => id !== elementId) : [...prev, elementId],
        );
      } else {
        setSelectedElementIds([elementId]);
      }
    },
    [textEditingElementId],
  );

  const finishTextEditing = useCallback(() => {
    setTextEditingElementId(null);
  }, []);

  const notifyBlockedByTextEdit = useCallback(() => {
    notifyTextEditBlocking(finishTextEditing);
  }, [finishTextEditing]);

  useEffect(() => {
    if (!textEditingElementId) dismissTextEditBlockingToast();
  }, [textEditingElementId]);

  const scrollCanvasToTop = useCallback(() => {
    const root = canvasScrollRef.current;
    if (!root) return;
    const run = () => {
      root.scrollTop = 0;
    };
    run();
    requestAnimationFrame(run);
  }, []);
  const [zoom, setZoom] = useState<number>(0.75);
  const [dragLayerIndex, setDragLayerIndex] = useState<number | null>(null);
  /** Bumps when undo/redo stacks change so UI (e.g. ribbon buttons) re-renders. */
  const [historyRevision, setHistoryRevision] = useState(0);
  const bumpHistory = useCallback(() => setHistoryRevision((n) => n + 1), []);

  // Undo/Redo history (snapshots)
  const stateRef = useRef<EditorSnapshot>({
    title: 'New document',
    pages: [defaultPage()],
    signerRoles: [],
    currentPageIndex: 0,
    selectedElementIds: [],
  });
  const undoRef = useRef<EditorSnapshot[]>([]);
  const redoRef = useRef<EditorSnapshot[]>([]);
  /** Internal clipboard: one or many elements (multi-select copy/paste). */
  const clipboardRef = useRef<DocElement[] | null>(null);
  /** Set on Ctrl/Cmd+V so the paste handler can paste copied elements when no image is on the clipboard. */
  const pasteShortcutRef = useRef(false);

  const newElementId = useCallback(() => {
    return `el-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }, []);

  const takeSnapshot = useCallback((): EditorSnapshot => {
    const cur = stateRef.current;
    // Deep-clone pages to avoid mutation issues
    const pagesClone = JSON.parse(JSON.stringify(cur.pages)) as DocumentPage[];
    return {
      title: cur.title,
      pages: pagesClone,
      signerRoles: JSON.parse(JSON.stringify(cur.signerRoles ?? [])) as DocumentSignerRoleDef[],
      currentPageIndex: cur.currentPageIndex,
      selectedElementIds: [...(cur.selectedElementIds ?? [])],
    };
  }, []);

  const pushHistory = useCallback(() => {
    undoRef.current.push(takeSnapshot());
    // cap history
    if (undoRef.current.length > 100) undoRef.current.shift();
    redoRef.current = [];
    bumpHistory();
  }, [takeSnapshot, bumpHistory]);

  const restoreSnapshot = useCallback((snap: EditorSnapshot) => {
    setTitle(snap.title);
    setPages(snap.pages);
    setSignerRoles(snap.signerRoles ?? []);
    setCurrentPageIndex(snap.currentPageIndex);
    setSelectedElementIds(snap.selectedElementIds ?? []);
  }, []);

  const undo = useCallback(() => {
    const prev = undoRef.current.pop();
    if (!prev) return;
    redoRef.current.push(takeSnapshot());
    restoreSnapshot(prev);
    bumpHistory();
  }, [restoreSnapshot, takeSnapshot, bumpHistory]);

  const redo = useCallback(() => {
    const next = redoRef.current.pop();
    if (!next) return;
    undoRef.current.push(takeSnapshot());
    restoreSnapshot(next);
    bumpHistory();
  }, [restoreSnapshot, takeSnapshot, bumpHistory]);

  const { data: templatesFromApi = [] } = useQuery({
    queryKey: ['document-creator-templates'],
    queryFn: () => api<Template[]>('GET', '/document-creator/templates'),
    enabled: !isTemplate,
  });
  const templates = isTemplate && templateProps ? templateProps.templates : templatesFromApi;

  const { data: doc, isPlaceholderData, isFetched } = useQuery({
    queryKey: ['document-creator-doc', id],
    queryFn: () => api<UserDocument>('GET', `/document-creator/documents/${id}`),
    enabled: !!id,
    placeholderData: () => {
      if (!id) return undefined;
      const cached = queryClient.getQueryData<UserDocument>(['document-creator-doc', id]);
      if (cached && Array.isArray(cached.pages)) return cached;

      const listKeys: Array<unknown[]> = [['document-creator-documents']];
      if (projectId) listKeys.push(['document-creator-documents', projectId]);
      if (subjectUserId) listKeys.push(['document-creator-documents', 'subject', subjectUserId]);
      for (const key of listKeys) {
        const list = queryClient.getQueryData<UserDocument[]>(key);
        const item = list?.find((d) => d.id === id);
        if (!item || !Array.isArray(item.pages)) continue;
        const pageCount = item.page_count ?? item.pages.length;
        // Only seed when list payload includes every page (summary truncates after 4).
        if (pageCount <= item.pages.length) return item;
      }
      return undefined;
    },
  });

  const leaveEditor = useCallback(() => {
    const close = onCloseRef.current ?? navigateBackRef.current;
    close();
  }, []);

  const handleNewerVersionConflict = useCallback(async () => {
    if (versionConflictHandlingRef.current) return;
    versionConflictHandlingRef.current = true;
    suppressSaveRetryRef.current = true;
    holdsEditLockRef.current = false;
    setHoldsEditLock(false);
    setLockForcedReadOnly(true);
    setEditLockStatus('denied');

    const result = await confirmRef.current({
      title: 'Newer version available',
      message:
        'This document was updated in another session. Reload to see the latest version, or leave the editor.',
      confirmText: 'Reload',
      cancelText: 'Leave',
    });

    if (result === 'confirm') {
      suppressSaveRetryRef.current = false;
      versionConflictHandlingRef.current = false;
      setLockForcedReadOnly(false);
      setLockBannerHolder(null);
      setEditLockStatus('pending');
      serverDocHydratedForIdRef.current = null;
      setIsDocHydrated(false);
      setVersionBaselineReady(false);
      if (id) {
        queryClient.removeQueries({ queryKey: ['document-creator-doc', id] });
        await queryClient.invalidateQueries({ queryKey: ['document-creator-doc', id] });
      }
      lockAcquireNonceRef.current += 1;
      setLockAcquireNonce((n) => n + 1);
    } else {
      versionConflictHandlingRef.current = false;
      leaveEditor();
    }
  }, [id, queryClient, leaveEditor]);

  const persistDocument = useCallback(
    async (snapshot: { title: string; pages: DocumentPage[]; signer_roles?: DocumentSignerRoleDef[] }) => {
      if (!id) return;
      if (!versionBaselineReady) {
        const pending = new Error('VERSION_BASELINE_PENDING');
        (pending as Error & { silent?: boolean }).silent = true;
        throw pending;
      }
      // Prefer cache if ref was never set (placeholder race).
      if (expectedUpdatedAtRef.current == null) {
        const cached = queryClient.getQueryData<UserDocument>(['document-creator-doc', id]);
        if (cached?.updated_at) {
          expectedUpdatedAtRef.current = cached.updated_at;
        }
      }
      const payload = {
        title: snapshot.title,
        pages: snapshot.pages.map((p) => ({
          template_id: p.template_id,
          margins: p.margins ?? undefined,
          elements: p.elements ?? [],
        })),
        signer_roles: snapshot.signer_roles ?? stateRef.current.signerRoles,
        expected_updated_at: expectedUpdatedAtRef.current,
        edit_lock_session_id: holdsEditLockRef.current ? editLockSessionIdRef.current : undefined,
      };
      try {
        const saved = await api<{
          id: string;
          title: string;
          pages?: unknown;
          updated_at?: string | null;
          [key: string]: unknown;
        }>('PATCH', `/document-creator/documents/${id}`, payload);
        if (saved?.updated_at != null) {
          expectedUpdatedAtRef.current = saved.updated_at;
        } else if (saved?.updated_at === null) {
          expectedUpdatedAtRef.current = null;
        }
        queryClient.setQueryData(['document-creator-doc', id], (prev: unknown) => {
          if (prev && typeof prev === 'object') {
            return { ...(prev as object), ...saved };
          }
          return saved;
        });
        queryClient.invalidateQueries({ queryKey: ['document-creator-documents'] });
        if (projectId) {
          queryClient.invalidateQueries({ queryKey: ['document-creator-documents', projectId] });
        }
        if (subjectUserId) {
          queryClient.invalidateQueries({ queryKey: ['document-creator-documents', 'subject', subjectUserId] });
        }
      } catch (e: unknown) {
        if (e instanceof Error && (e as Error & { silent?: boolean }).silent) {
          throw e;
        }
        if (isDocumentConcurrencyError(e)) {
          void handleNewerVersionConflict();
          throw e;
        }
        toast.error(e instanceof Error ? e.message : 'Failed to save.');
        throw e;
      }
    },
    [id, projectId, subjectUserId, queryClient, versionBaselineReady, handleNewerVersionConflict],
  );

  const {
    saveStatus,
    hasUnsavedChanges,
    flushSave,
    hydrateBaseline,
    notifyEdited,
  } = useDocumentAutoSave({
    documentId: id,
    readOnly: readOnly || isTemplate,
    isHydrated: isDocHydrated && versionBaselineReady,
    getSnapshot: () => ({
      title: stateRef.current.title,
      pages: stateRef.current.pages,
      signer_roles: stateRef.current.signerRoles,
    }),
    save: persistDocument,
    suppressRetryRef: suppressSaveRetryRef,
  });

  useEffect(() => {
    serverDocHydratedForIdRef.current = null;
    setIsDocHydrated(false);
    setVersionBaselineReady(false);
    expectedUpdatedAtRef.current = null;
    holdsEditLockRef.current = false;
    suppressSaveRetryRef.current = false;
    versionConflictHandlingRef.current = false;
    lockLostHandlingRef.current = false;
    inUsePromptedIdRef.current = null;
    setHoldsEditLock(false);
    setLockForcedReadOnly(false);
    setLockBannerHolder(null);
    setEditLockStatus(isTemplate ? 'idle' : 'pending');
  }, [id, isTemplate, propReadOnly]);

  useEffect(() => {
    if (isTemplate && templateProps?.open) {
      const initialEls = (templateProps.initialElements ?? []).map((el) => ({
        ...el,
        id: el.id || `el-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      }));
      setPages([
        {
          template_id: templateProps.templateId,
          margins: templateProps.initialMargins ?? undefined,
          elements: initialEls,
        },
      ]);
      const templatePages = [
        {
          template_id: templateProps.templateId,
          margins: templateProps.initialMargins ?? undefined,
          elements: initialEls,
        },
      ];
      const templateRoles = pruneUnusedSigners(
        ensureSignerRolesForDocument(null, templatePages),
        templatePages,
      );
      setSignerRoles(templateRoles);
      setCurrentPageIndex(0);
      setSelectedElementIds([]);
      stateRef.current = {
        title: '',
        pages: templatePages,
        signerRoles: templateRoles,
        currentPageIndex: 0,
        selectedElementIds: [],
      };
      undoRef.current = [];
      redoRef.current = [];
      bumpHistory();
    }
  }, [isTemplate, templateProps?.open, templateProps?.templateId, templateProps?.initialMargins, templateProps?.initialElements, bumpHistory]);

  useEffect(() => {
    if (!doc || !id) return;
    if (doc.id !== id) return;
    // Refetch after save (or background refresh) must not replace editor state or wipe undo/redo.
    if (serverDocHydratedForIdRef.current === id) return;

    if (!Array.isArray(doc.pages)) return;

    // Soft UI hydrate from list placeholder — do NOT arm OCC baseline or hydrate gate.
    const armOccBaseline = !isPlaceholderData && isFetched;

    // Server returned no pages (new doc): still mark hydrated so autosave can run later; do not leave
    // `serverDocHydratedForIdRef` unset (that used to let debounced save PATCH a blank page over real data).
    if (doc.pages.length === 0) {
      const emptyPages: DocumentPage[] = [defaultPage()];
      const t = doc.title || 'New document';
      const roles = pruneUnusedSigners(
        ensureSignerRolesForDocument(
          (doc as { signer_roles?: unknown }).signer_roles,
          emptyPages,
        ),
        emptyPages,
      );
      setTitle(t);
      setPages(emptyPages);
      setSignerRoles(roles);
      stateRef.current = {
        title: t,
        pages: emptyPages,
        signerRoles: roles,
        currentPageIndex: 0,
        selectedElementIds: [],
      };
      undoRef.current = [];
      redoRef.current = [];
      bumpHistory();
      if (armOccBaseline) {
        serverDocHydratedForIdRef.current = id;
        expectedUpdatedAtRef.current = doc.updated_at ?? null;
        setVersionBaselineReady(true);
      }
      hydrateBaseline({ title: t, pages: emptyPages, signer_roles: roles });
      setIsDocHydrated(true);
      return;
    }

    const needsTemplateData = doc.pages.some((p) => {
      const hasElements = Array.isArray(p.elements) && p.elements.length > 0;
      return !hasElements;
    });
    if (needsTemplateData && templates.length === 0) return;

    setTitle(doc.title || 'New document');
    const converted = doc.pages.map((p) => {
      const hasElements = Array.isArray(p.elements) && p.elements.length > 0;
      const base = { template_id: p.template_id ?? null, margins: p.margins ?? undefined };
      if (hasElements) {
        return { ...base, elements: p.elements! };
      }
      const template = templates.find((t) => t.id === p.template_id);
      const areasDef = template?.areas_definition;
      const areas = Array.isArray(areasDef) ? areasDef : areasDef?.areas || [];
      const elements = legacyToElements(p.areas_content, areas);
      return { ...base, elements: elements.length ? elements : [] };
    });
    setPages(converted);
    const roles = pruneUnusedSigners(
      ensureSignerRolesForDocument(
        (doc as { signer_roles?: unknown }).signer_roles,
        converted,
      ),
      converted,
    );
    setSignerRoles(roles);
    // Reset history on first load from server only (not on invalidate/refetch).
    stateRef.current = {
      title: doc.title || 'New document',
      pages: converted,
      signerRoles: roles,
      currentPageIndex: 0,
      selectedElementIds: [],
    };
    undoRef.current = [];
    redoRef.current = [];
    bumpHistory();
    if (armOccBaseline) {
      serverDocHydratedForIdRef.current = id;
      expectedUpdatedAtRef.current = doc.updated_at ?? null;
      setVersionBaselineReady(true);
    }
    hydrateBaseline({ title: doc.title || 'New document', pages: converted, signer_roles: roles });
    setIsDocHydrated(true);
    requestAnimationFrame(() => scrollCanvasToTop());
  }, [doc, templates, id, bumpHistory, scrollCanvasToTop, hydrateBaseline, isPlaceholderData, isFetched]);

  // If first hydrate lacked updated_at but a later fetch has it, adopt it for OCC.
  useEffect(() => {
    if (!isDocHydrated || !doc || doc.id !== id || isPlaceholderData) return;
    if (doc.updated_at && expectedUpdatedAtRef.current == null) {
      expectedUpdatedAtRef.current = doc.updated_at;
    }
    if (!versionBaselineReady && !isPlaceholderData && isFetched) {
      expectedUpdatedAtRef.current = doc.updated_at ?? null;
      setVersionBaselineReady(true);
      serverDocHydratedForIdRef.current = id;
    }
  }, [doc, id, isDocHydrated, isPlaceholderData, isFetched, versionBaselineReady]);

  // Keep ref updated for history snapshots
  useEffect(() => {
    stateRef.current = {
      title,
      pages,
      signerRoles,
      currentPageIndex,
      selectedElementIds,
    };
  }, [title, pages, signerRoles, currentPageIndex, selectedElementIds]);

  // Employee + Company always stay in the chooser; extra signers prune when unused.
  useEffect(() => {
    if (!isDocHydrated || readOnly) return;
    setSignerRoles((prev) => {
      const presentIds = new Set(collectPresentSignerRoleIds(pages, prev));
      const retain = retainSignerIdsRef.current;
      for (const id of [...retain]) {
        if (presentIds.has(id)) retain.delete(id);
      }
      const pruned = pruneUnusedSigners(prev, pages);
      const extras = prev.filter((r) => retain.has(r.id) && !pruned.some((p) => p.id === r.id));
      const next = extras.length ? normalizeSignerRolesList([...pruned, ...extras]) : pruned;
      if (
        next.length === prev.length &&
        next.every((r, i) => r.id === prev[i]?.id && r.label === prev[i]?.label)
      ) {
        return prev;
      }
      return next;
    });
  }, [pages, isDocHydrated, readOnly]);

  useEffect(() => {
    if (!isDocHydrated || isTemplate || readOnly) return;
    if (canvasGestureActiveRef.current) return;
    notifyEdited();
  }, [title, pages, signerRoles, isDocHydrated, isTemplate, readOnly, notifyEdited]);

  const handleCanvasGestureChange = useCallback(
    (active: boolean) => {
      canvasGestureActiveRef.current = active;
      if (active) {
        setFrozenStripPages(stateRef.current.pages);
      } else {
        setFrozenStripPages(null);
        if (!isTemplate && !readOnly && isDocHydrated) notifyEdited();
      }
    },
    [isTemplate, readOnly, isDocHydrated, notifyEdited],
  );

  useImperativeHandle(
    ref,
    () => ({
      hasUnsavedChanges: () => hasUnsavedChanges,
      flushSave,
    }),
    [hasUnsavedChanges, flushSave],
  );

  const releaseEditLock = useCallback(
    (opts?: { keepalive?: boolean }) => {
      if (!id || !holdsEditLockRef.current) return;
      const sessionId = editLockSessionIdRef.current;
      holdsEditLockRef.current = false;
      setHoldsEditLock(false);
      const path = `/document-creator/documents/${id}/edit-lock?session_id=${encodeURIComponent(sessionId)}`;
      if (opts?.keepalive) {
        const token = getToken();
        void fetch(path, {
          method: 'DELETE',
          headers: {
            Accept: 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          keepalive: true,
        }).catch(() => {});
        return;
      }
      void api('DELETE', path).catch(() => {});
    },
    [id],
  );

  // Acquire exclusive edit lock when opening a writable document.
  // UI stays on "Opening document…" (editLockStatus=pending) until this resolves
  // or the user picks View only / Leave.
  useEffect(() => {
    if (isTemplate || !id || propReadOnly) {
      return;
    }
    setEditLockStatus('pending');
    let cancelled = false;
    const gen = ++lockMountGenRef.current;

    const promptInUse = async (holder: string | null) => {
      const msg = holder
        ? `This document is already open for editing elsewhere (by ${holder}). You can view it read-only or leave.`
        : 'This document is already open for editing elsewhere. You can view it read-only or leave.';
      return confirmRef.current({
        title: 'Document in use',
        message: msg,
        confirmText: 'View only',
        cancelText: 'Leave',
      });
    };

    const stayViewOnly = (holder: string | null) => {
      setLockForcedReadOnly(true);
      setLockBannerHolder(holder || 'another session');
      holdsEditLockRef.current = false;
      setHoldsEditLock(false);
      setEditLockStatus('denied');
    };

    (async () => {
      try {
        await api('POST', `/document-creator/documents/${id}/edit-lock`, {
          session_id: editLockSessionIdRef.current,
        });
        if (cancelled) {
          if (lockMountGenRef.current === gen) {
            holdsEditLockRef.current = true;
            releaseEditLock();
          }
          return;
        }
        holdsEditLockRef.current = true;
        setHoldsEditLock(true);
        setLockForcedReadOnly(false);
        setLockBannerHolder(null);
        setEditLockStatus('granted');
      } catch (e: unknown) {
        if (cancelled) return;
        const code = getApiErrorCode(e);
        const isInUse = code === 'document_in_use' || (e instanceof ApiError && e.status === 409);
        const isForbidden = e instanceof ApiError && e.status === 403;
        if (isInUse || isForbidden) {
          let holder = holderNameFromLockError(e);
          let inUse = isInUse;
          if (!inUse && isForbidden) {
            try {
              const latest = await api<UserDocument>('GET', `/document-creator/documents/${id}`);
              if (cancelled) return;
              inUse = !!latest.edit_lock?.active;
              holder = latest.edit_lock?.user_name?.trim() || holder;
            } catch {
              /* stay with 403-only path */
            }
          }
          if (inUse) {
            const result = await promptInUse(holder);
            if (cancelled) return;
            if (result === 'confirm') stayViewOnly(holder);
            else {
              setEditLockStatus('denied');
              leaveEditor();
            }
            return;
          }
          setLockForcedReadOnly(true);
          holdsEditLockRef.current = false;
          setHoldsEditLock(false);
          setLockBannerHolder(null);
          setEditLockStatus('denied');
          return;
        }
        toast.error(e instanceof Error ? e.message : 'Could not start editing session.');
        setEditLockStatus('denied');
        leaveEditor();
      }
    })();

    return () => {
      cancelled = true;
      const releaseGen = gen;
      window.setTimeout(() => {
        if (lockMountGenRef.current !== releaseGen) return;
        releaseEditLock();
      }, 0);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally stable; callbacks via refs
  }, [id, isTemplate, propReadOnly, lockAcquireNonce, releaseEditLock, leaveEditor]);

  // Read-only open: still show Opening… then Document in use if someone else holds the lock.
  useEffect(() => {
    if (isTemplate || !id || !propReadOnly) return;
    if (!isFetched || isPlaceholderData) {
      setEditLockStatus('pending');
      return;
    }
    const lock = doc?.edit_lock;
    if (!lock?.active) {
      setEditLockStatus('idle');
      return;
    }
    if (inUsePromptedIdRef.current === id) return;
    inUsePromptedIdRef.current = id;
    let cancelled = false;
    const holder = lock.user_name?.trim() || null;
    (async () => {
      const result = await confirmRef.current({
        title: 'Document in use',
        message: holder
          ? `This document is already open for editing elsewhere (by ${holder}). You can view it read-only or leave.`
          : 'This document is already open for editing elsewhere. You can view it read-only or leave.',
        confirmText: 'View only',
        cancelText: 'Leave',
      });
      if (cancelled) {
        inUsePromptedIdRef.current = null;
        return;
      }
      if (result === 'confirm') {
        setLockForcedReadOnly(true);
        setLockBannerHolder(holder || 'another session');
        setEditLockStatus('idle');
      } else {
        setEditLockStatus('idle');
        leaveEditor();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, isTemplate, propReadOnly, isFetched, isPlaceholderData, doc?.edit_lock?.active, doc?.edit_lock?.user_name, leaveEditor]);

  // Heartbeat while holding the edit lock.
  useEffect(() => {
    if (isTemplate || !id || !holdsEditLock) return;

    const tick = async () => {
      if (!holdsEditLockRef.current) return;
      try {
        await api('POST', `/document-creator/documents/${id}/edit-lock/heartbeat`, {
          session_id: editLockSessionIdRef.current,
        });
        heartbeatFailCountRef.current = 0;
      } catch (e: unknown) {
        heartbeatFailCountRef.current += 1;
        const code = getApiErrorCode(e);
        if (code === 'document_lock_lost' || heartbeatFailCountRef.current >= 3) {
          holdsEditLockRef.current = false;
          setHoldsEditLock(false);
          if (lockLostHandlingRef.current) return;
          lockLostHandlingRef.current = true;
          const result = await confirmRef.current({
            title: 'Document in use',
            message:
              'Another session is now editing this document. You can continue view-only, or leave.',
            confirmText: 'View only',
            cancelText: 'Leave',
          });
          if (result === 'confirm') {
            setLockForcedReadOnly(true);
            setLockBannerHolder('another session');
            setEditLockStatus('denied');
            lockLostHandlingRef.current = false;
          } else {
            lockLostHandlingRef.current = false;
            setEditLockStatus('denied');
            leaveEditor();
          }
        }
      }
    };

    void tick();
    const interval = setInterval(() => {
      void tick();
    }, 45000);

    const onVisibility = () => {
      if (document.visibilityState === 'visible') void tick();
    };
    const onPageHide = (e: PageTransitionEvent) => {
      // Only release on real unload, not bfcache / tab switch.
      if (!e.persisted) releaseEditLock({ keepalive: true });
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
    };
  }, [id, isTemplate, holdsEditLock, releaseEditLock, leaveEditor]);

  const enableNavigationGuard = !isTemplate && !readOnly && !!id;
  useUnsavedChangesGuard(
    enableNavigationGuard ? hasUnsavedChanges : false,
    enableNavigationGuard
      ? async () => {
          const ok = await flushSave();
          if (ok) releaseEditLock();
          return ok;
        }
      : undefined,
    enableNavigationGuard
      ? async () => {
          releaseEditLock();
        }
      : undefined,
  );

  const handleCloseOrBack = useCallback(async () => {
    const close = onCloseRef.current ?? navigateBackRef.current;
    if (isTemplate || !id) {
      close();
      return;
    }
    if (readOnly) {
      releaseEditLock();
      close();
      return;
    }
    if (!hasUnsavedChanges) {
      releaseEditLock();
      close();
      return;
    }
    const saved = await flushSave();
    if (saved) {
      releaseEditLock();
      close();
      return;
    }
    const result = await confirmRef.current({
      title: "Couldn't save document",
      message: 'Your changes could not be saved. What would you like to do?',
      confirmText: 'Retry',
      cancelText: 'Cancel',
      showDiscard: true,
      discardText: 'Close without saving',
    });
    if (result === 'confirm') {
      const retry = await flushSave();
      if (retry) {
        releaseEditLock();
        close();
      }
    } else if (result === 'discard') {
      releaseEditLock();
      close();
    }
  }, [isTemplate, readOnly, id, hasUnsavedChanges, flushSave, releaseEditLock]);

  useEffect(() => {
    if (readOnly && textEditingElementId) {
      setTextEditingElementId(null);
    }
  }, [readOnly, textEditingElementId]);

  const ribbonSaveStatus: DocumentSaveStatus | null =
    isTemplate || readOnly ? null : saveStatus;

  /** Thumbnails actually mounted on the canvas (current page, or current ± 1 when stacked). */
  const canvasMediaUrls = useMemo(() => {
    const useStackedPages = !isTemplate && pages.length > 1;
    const urls: string[] = [];
    for (let i = 0; i < pages.length; i++) {
      if (useStackedPages && Math.abs(i - currentPageIndex) > 1) continue;
      if (!useStackedPages && i !== currentPageIndex) continue;
      const page = pages[i];
      const tmpl = templates.find((t) => t.id === (page.template_id ?? ''));
      if (tmpl?.background_file_id) {
        urls.push(withFileAccessToken(`/files/${tmpl.background_file_id}/thumbnail?w=800`));
      }
      for (const el of page.elements ?? []) {
        if (el.type === 'image' && el.content) {
          urls.push(withFileAccessToken(`/files/${el.content}/thumbnail?w=900`));
        }
      }
    }
    return urls;
  }, [pages, templates, currentPageIndex, isTemplate]);
  const mediaLoading = useDocumentMediaLoading(canvasMediaUrls);

  // Keyboard shortcuts: Delete, Arrow keys, Undo/Redo, Copy/Paste/Duplicate
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (readOnly || isTemplate) return;
      // ImagePicker / ImageEditor own the keyboard while open — do not delete/move canvas elements underneath.
      if (imagePickerOpenRef.current) return;
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName?.toLowerCase();
      const isTyping = tag === 'input' || tag === 'textarea' || tag === 'select' || (t?.isContentEditable ?? false);
      if (e.key === 'Escape') {
        if (isTyping) return;
        if (textEditingElementId) {
          notifyBlockedByTextEdit();
          return;
        }
        if (selectedElementIds.length > 0) {
          e.preventDefault();
          setSelectedElementIds([]);
        }
        return;
      }
      if (isTyping) return;

      const cur = stateRef.current;
      const curPage = cur.pages[cur.currentPageIndex];
      const curEls = curPage?.elements ?? [];
      const ids = cur.selectedElementIds ?? [];
      const selectedEls = curEls.filter((x) => ids.includes(x.id));
      const key = e.key.toLowerCase();

      // Delete / Backspace: remove all selected elements (unless locked)
      if (key === 'delete' || key === 'backspace') {
        const toRemove = selectedEls.filter((el) => !el.locked);
        if (toRemove.length > 0) {
          e.preventDefault();
          pushHistory();
          const removeIds = new Set(toRemove.map((el) => el.id));
          const idx = stateRef.current.currentPageIndex;
          const nextPages = stateRef.current.pages.map((p, i) =>
            i === idx
              ? { ...p, elements: (p.elements ?? []).filter((el) => !removeIds.has(el.id)) }
              : p,
          );
          setPages(nextPages);
          setSignerRoles((prev) => pruneUnusedSigners(prev, nextPages));
          setSelectedElementIds([]);
        }
        return;
      }

      // Arrow keys: move all selected elements (unless locked or position locked). Shift = move by 5%
      const step = e.shiftKey ? 1 : 0.25;
      const toMove = selectedEls.filter((el) => !el.locked && !el.lockPosition);
      if (toMove.length > 0 && ['arrowleft', 'arrowright', 'arrowup', 'arrowdown'].includes(key)) {
        let dx = 0;
        let dy = 0;
        if (key === 'arrowleft') dx = -step;
        if (key === 'arrowright') dx = step;
        if (key === 'arrowup') dy = -step;
        if (key === 'arrowdown') dy = step;
        e.preventDefault();
        pushHistory();
        setPages((prev) => {
          const next = [...prev];
          const idx = stateRef.current.currentPageIndex;
          if (!next[idx]) return prev;
          const moveIds = new Set(toMove.map((el) => el.id));
          next[idx] = {
            ...next[idx],
            elements: (next[idx].elements ?? []).map((el) => {
              if (!moveIds.has(el.id)) return el;
              const w = el.width_pct ?? 80;
              const h = el.height_pct ?? 8;
              const newX = Math.max(0, Math.min(100 - w, (el.x_pct ?? 10) + dx));
              const newY = Math.max(0, Math.min(100 - h, (el.y_pct ?? 20) + dy));
              return { ...el, x_pct: newX, y_pct: newY };
            }),
          };
          return next;
        });
        return;
      }

      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;

      if (key === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (key === 'y') {
        e.preventDefault();
        redo();
        return;
      }
      // Copy/Paste/Duplicate for elements (multi-select supported)
      // Document mode excludes blocks; template mode allows them.
      const toCopy = isTemplate
        ? selectedEls
        : selectedEls.filter((el) => el.type !== 'block');
      if (key === 'c') {
        if (toCopy.length > 0) {
          e.preventDefault();
          const clones = toCopy.map((el) => JSON.parse(JSON.stringify(el)) as DocElement);
          clipboardRef.current = clones;
          writeDocumentCreatorClipboard(clones);
          toast.success(toCopy.length === 1 ? 'Copied.' : `Copied ${toCopy.length} elements.`);
        }
        return;
      }
      if (key === 'd') {
        if (toCopy.length === 0) return;
        e.preventDefault();
        pushHistory();
        const clones: DocElement[] = toCopy.map((src) => ({
          ...(JSON.parse(JSON.stringify(src)) as DocElement),
          id: newElementId(),
          x_pct: Math.min(100 - (src.width_pct ?? 0), (src.x_pct ?? 0) + 1),
          y_pct: Math.min(100 - (src.height_pct ?? 0), (src.y_pct ?? 0) + 1),
        }));
        setPages((prev) => {
          const next = [...prev];
          const idx = stateRef.current.currentPageIndex;
          if (!next[idx]) return prev;
          const els = next[idx].elements ?? [];
          next[idx] = { ...next[idx], elements: [...els, ...clones] };
          return next;
        });
        setSelectedElementIds(clones.map((c) => c.id));
        return;
      }
      if (key === 'v') {
        if (!readOnly) pasteShortcutRef.current = true;
        return;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [undo, redo, newElementId, pushHistory, selectedElementIds, textEditingElementId, notifyBlockedByTextEdit, readOnly, isTemplate]);

  const currentPage = pages[currentPageIndex];
  const currentTemplateId = currentPage?.template_id ?? null;
  const currentTemplate = templates.find((t) => t.id === currentTemplateId);
  const elements = currentPage?.elements ?? [];
  /** Prefer the page that owns the selection so toolbar stays usable after scroll sync. */
  const selectionPageIndex = (() => {
    if (selectedElementIds.length === 0) return currentPageIndex;
    for (let i = 0; i < pages.length; i++) {
      if ((pages[i].elements ?? []).some((e) => selectedElementIds.includes(e.id))) return i;
    }
    return currentPageIndex;
  })();
  const selectionPageElements = pages[selectionPageIndex]?.elements ?? elements;
  const selectedElement =
    selectedElementIds.length === 1
      ? selectionPageElements.find((e) => e.id === selectedElementIds[0]) ?? null
      : null;

  /** A4 aspect: height = width * (297/210). Used to compute image area size in px for ImagePicker. */
  const A4_HEIGHT_RATIO = 297 / 210;
  const contentHeightPx = canvasWidthPxForExport * A4_HEIGHT_RATIO;
  const imagePickerTargetSize = (() => {
    const replaceEl = imagePickerReplaceElementId ? elements.find((e) => e.id === imagePickerReplaceElementId) : null;
    const wPct = replaceEl?.width_pct ?? 40;
    const hPct = replaceEl?.height_pct ?? 25;
    const w = Math.round((wPct / 100) * canvasWidthPxForExport);
    const h = Math.round((hPct / 100) * contentHeightPx);
    return { width: Math.max(100, w), height: Math.max(100, h) };
  })();
  const backgroundFileId = currentTemplate?.background_file_id;
  const backgroundUrl = backgroundFileId ? withFileAccessToken(`/files/${backgroundFileId}/thumbnail?w=800`) : null;
  const defaultMargins: PageMargins = { left_pct: 0, right_pct: 0, top_pct: 0, bottom_pct: 0 };
  /** Margins: page overrides template overrides default */
  const effectiveMargins: PageMargins = {
    ...defaultMargins,
    ...currentTemplate?.margins,
    ...currentPage?.margins,
  };
  const selectionPage = pages[selectionPageIndex];
  const selectionTemplate = templates.find((t) => t.id === (selectionPage?.template_id ?? ''));
  const selectionEffectiveMargins: PageMargins = {
    ...defaultMargins,
    ...selectionTemplate?.margins,
    ...selectionPage?.margins,
  };

  /** Multi-page documents: vertical stack + scroll; template editor stays single-page. */
  const useContinuousPageCanvas = !isTemplate && pages.length > 1;

  const setPageSectionRef = useCallback((index: number) => (el: HTMLDivElement | null) => {
    pageSectionRefs.current[index] = el;
  }, []);

  const scrollToPageSection = useCallback((index: number, behavior: ScrollBehavior = 'smooth') => {
    const root = canvasScrollRef.current;
    const section = pageSectionRefs.current[index];
    if (!root || !section) return;
    const viewportH = root.clientHeight;
    if (viewportH > 0) {
      pageSectionRefs.current.forEach((el) => {
        if (el) el.style.minHeight = `${viewportH}px`;
      });
    }
    pageScrollLockRef.current = true;
    root.scrollTo({ top: section.offsetTop, behavior });
    window.setTimeout(() => {
      pageScrollLockRef.current = false;
    }, behavior === 'smooth' ? 520 : 0);
  }, []);

  const handlePageSelect = useCallback(
    (index: number) => {
      setTextEditingElementId(null);
      setCurrentPageIndex(index);
      // Explicit page jump: keep only selections that live on the destination page.
      setSelectedElementIds((prev) => {
        const idsOnPage = new Set((stateRef.current.pages[index]?.elements ?? []).map((e) => e.id));
        return prev.filter((id) => idsOnPage.has(id));
      });
      requestAnimationFrame(() => scrollToPageSection(index, 'smooth'));
    },
    [scrollToPageSection],
  );

  // Drop stale ids when pages/elements are removed — do NOT clear on scroll-driven
  // currentPageIndex changes (IntersectionObserver), or the formatting toolbar vanishes.
  useEffect(() => {
    const allIds = new Set(pages.flatMap((p) => (p.elements ?? []).map((e) => e.id)));
    setSelectedElementIds((prev) => {
      const next = prev.filter((id) => allIds.has(id));
      return next.length === prev.length ? prev : next;
    });
  }, [pages]);

  useLayoutEffect(() => {
    if (isTemplate || !id) return;
    setCurrentPageIndex(0);
    scrollCanvasToTop();
  }, [id, isTemplate, scrollCanvasToTop]);

  useLayoutEffect(() => {
    if (!useContinuousPageCanvas) return;
    const root = canvasScrollRef.current;
    if (!root) return;
    const syncSectionHeights = () => {
      const h = root.clientHeight;
      if (h <= 0) return;
      pageSectionRefs.current.forEach((el) => {
        if (el) el.style.minHeight = `${h}px`;
      });
    };
    syncSectionHeights();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(syncSectionHeights) : null;
    ro?.observe(root);
    window.addEventListener('resize', syncSectionHeights);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', syncSectionHeights);
    };
  }, [useContinuousPageCanvas, pages.length]);

  useLayoutEffect(() => {
    if (!useContinuousPageCanvas) return;
    const root = canvasScrollRef.current;
    if (!root || pages.length < 2) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (pageScrollLockRef.current) return;
        const candidates = entries.filter((e) => e.isIntersecting && e.intersectionRatio >= 0.45);
        if (candidates.length === 0) return;
        candidates.sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        const raw = (candidates[0].target as HTMLElement).dataset.pageIndex;
        const n = raw !== undefined ? Number(raw) : NaN;
        if (!Number.isNaN(n)) setCurrentPageIndex(n);
      },
      { root, threshold: [0, 0.5, 0.75, 1] }
    );
    pageSectionRefs.current.forEach((el) => {
      if (el) obs.observe(el);
    });
    return () => obs.disconnect();
  }, [useContinuousPageCanvas, pages.length]);

  const setCurrentPageTemplate = useCallback((templateId: string | null) => {
    pushHistory();
    setPages((prev) => {
      const next = [...prev];
      if (!next[currentPageIndex]) return next;
      next[currentPageIndex] = {
        ...next[currentPageIndex],
        template_id: templateId,
        /* Keep existing elements and margins; template is just the background */
      };
      return next;
    });
  }, [currentPageIndex, pushHistory]);

  const setCurrentPageMargins = useCallback((m: PageMargins) => {
    setPages((prev) => {
      const next = [...prev];
      if (next[currentPageIndex]) {
        next[currentPageIndex] = { ...next[currentPageIndex], margins: { ...m } };
      }
      return next;
    });
  }, [currentPageIndex]);

  const setCurrentPageElements = useCallback((updater: (els: DocElement[]) => DocElement[]) => {
    setPages((prev) => {
      const next = [...prev];
      if (next[currentPageIndex]) {
        next[currentPageIndex] = {
          ...next[currentPageIndex],
          elements: updater(next[currentPageIndex].elements ?? []),
        };
      }
      return next;
    });
  }, [currentPageIndex]);

  const updateElementsAtPageIndex = useCallback((pageIndex: number, updater: (els: DocElement[]) => DocElement[]) => {
    setPages((prev) => {
      const next = [...prev];
      if (!next[pageIndex]) return prev;
      next[pageIndex] = {
        ...next[pageIndex],
        elements: updater(next[pageIndex].elements ?? []),
      };
      return next;
    });
  }, []);

  const findPageIndexForElement = useCallback((elementId: string): number | null => {
    const pgs = stateRef.current.pages;
    for (let i = 0; i < pgs.length; i++) {
      if ((pgs[i].elements ?? []).some((e) => e.id === elementId)) return i;
    }
    return null;
  }, []);

  const closeImagePicker = useCallback(() => {
    imagePickerReplaceRef.current = null;
    imagePickerOpenRef.current = false;
    setImagePickerOpen(false);
    setImagePickerReplaceElementId(null);
    setImagePickerFileObjectId(undefined);
    setImagePickerOpenEditorOnOpen(false);
  }, []);

  const applyImageToElement = useCallback(
    (
      pageIndex: number,
      elementId: string,
      fileId: string,
      meta?: {
        intrinsicWidth?: number;
        intrinsicHeight?: number;
        preserveFrame?: boolean;
        fitMode?: ImagePickerConfirmMeta['fitMode'];
      },
    ) => {
      pushHistory();
      updateElementsAtPageIndex(pageIndex, (prev) =>
        prev.map((el) => {
          if (el.id !== elementId) return el;
          if (el.type !== 'image') return { ...el, content: fileId };
          const iw = meta?.intrinsicWidth;
          const ih = meta?.intrinsicHeight;
          if (meta?.fitMode === 'natural' && iw && ih && iw > 0 && ih > 0) {
            const prevW = el.width_pct ?? 40;
            const prevH = el.height_pct ?? 25;
            const { width_pct, height_pct } = sizeImageElementFrameForIntrinsicAspect(prevW, iw, ih);
            const cx = (el.x_pct ?? 0) + prevW / 2;
            const cy = (el.y_pct ?? 0) + prevH / 2;
            return {
              ...el,
              content: fileId,
              imageFit: 'fill' as const,
              imagePosition: '50% 50%',
              width_pct,
              height_pct,
              x_pct: Math.max(0, Math.min(100 - width_pct, cx - width_pct / 2)),
              y_pct: Math.max(0, Math.min(100 - height_pct, cy - height_pct / 2)),
            };
          }
          // Image area / slot: fill content only; never change frame geometry.
          if (!el.content || meta?.preserveFrame) {
            return {
              ...el,
              content: fileId,
              imageFit: 'contain',
              imagePosition: '50% 50%',
            };
          }
          const next: DocElement = { ...el, content: fileId, imageFit: 'fill' };
          if (iw && ih && iw > 0 && ih > 0) {
            const { width_pct, height_pct } = sizeImageElementFrameForIntrinsicAspect(
              el.width_pct ?? 40,
              iw,
              ih,
            );
            return { ...next, width_pct, height_pct };
          }
          return next;
        }),
      );
      setCurrentPageIndex(pageIndex);
      setSelectedElementIds([elementId]);
    },
    [pushHistory, updateElementsAtPageIndex],
  );

  const moveElement = useCallback(
    (fromIndex: number, toIndex: number, pageIndex?: number) => {
      if (fromIndex === toIndex) return;
      pushHistory();
      const targetPage = pageIndex ?? stateRef.current.currentPageIndex;
      updateElementsAtPageIndex(targetPage, (prev) => {
        const next = [...prev];
        const [moved] = next.splice(fromIndex, 1);
        next.splice(toIndex, 0, moved);
        return next;
      });
    },
    [pushHistory, updateElementsAtPageIndex]
  );

  const bringToFront = useCallback(
    (index: number, pageIndex?: number) => {
      const len =
        (pageIndex != null ? stateRef.current.pages[pageIndex]?.elements : stateRef.current.pages[stateRef.current.currentPageIndex]?.elements)
          ?.length ?? 0;
      moveElement(index, Math.max(0, len - 1), pageIndex);
    },
    [moveElement]
  );
  const sendToBack = useCallback((index: number, pageIndex?: number) => moveElement(index, 0, pageIndex), [moveElement]);
  const moveForward = useCallback(
    (index: number, pageIndex?: number) => {
      const len =
        (pageIndex != null ? stateRef.current.pages[pageIndex]?.elements : stateRef.current.pages[stateRef.current.currentPageIndex]?.elements)
          ?.length ?? 0;
      moveElement(index, Math.min(len - 1, index + 1), pageIndex);
    },
    [moveElement]
  );
  const moveBackward = useCallback(
    (index: number, pageIndex?: number) => moveElement(index, Math.max(0, index - 1), pageIndex),
    [moveElement]
  );

  const handleAddElement = useCallback((el: DocElement) => {
    pushHistory();
    const pageEls = stateRef.current.pages[stateRef.current.currentPageIndex]?.elements ?? [];
    const page = stateRef.current.pages[stateRef.current.currentPageIndex];
    const tmpl = templates.find((t) => t.id === (page?.template_id ?? ''));
    const margins: PageMargins = {
      left_pct: page?.margins?.left_pct ?? tmpl?.margins?.left_pct ?? 0,
      right_pct: page?.margins?.right_pct ?? tmpl?.margins?.right_pct ?? 0,
      top_pct: page?.margins?.top_pct ?? tmpl?.margins?.top_pct ?? 0,
      bottom_pct: page?.margins?.bottom_pct ?? tmpl?.margins?.bottom_pct ?? 0,
    };
    const placed =
      el.type === 'initials' || el.type === 'date'
        ? placeElementOutsideBlockedAreas(el, pageEls, margins)
        : el;
    setCurrentPageElements((prev) => [...prev, placed]);
    setSelectedElementIds([placed.id]);
    if (textEditingElementId) notifyBlockedByTextEdit();
  }, [setCurrentPageElements, pushHistory, textEditingElementId, notifyBlockedByTextEdit, templates]);

  const handleUpdateElement = useCallback((elementId: string, updater: (e: DocElement) => DocElement) => {
    const pageIndex = findPageIndexForElement(elementId) ?? stateRef.current.currentPageIndex;
    updateElementsAtPageIndex(pageIndex, (prev) =>
      prev.map((e) => (e.id === elementId ? updater(e) : e))
    );
  }, [findPageIndexForElement, updateElementsAtPageIndex]);

  const handleUpdateElementWithHistory = useCallback((elementId: string, updater: (e: DocElement) => DocElement) => {
    pushHistory();
    handleUpdateElement(elementId, updater);
  }, [pushHistory, handleUpdateElement]);

  const pruneSignersFromPages = useCallback((nextPages: DocumentPage[]) => {
    setSignerRoles((prev) => pruneUnusedSigners(prev, nextPages));
  }, []);

  const closeOtherSignerModal = useCallback((id: string | null) => {
    const pending = otherSignerPendingRef.current;
    otherSignerPendingRef.current = null;
    setOtherSignerModalOpen(false);
    setOtherSignerLabel('');
    pending?.resolve?.(id);
  }, []);

  const openOtherSignerModal = useCallback(
    (opts?: { kind?: 'signature' | 'date' | 'initials'; textElementId?: string | null }) => {
      return new Promise<string | null>((resolve) => {
        const textElementId =
          opts?.textElementId !== undefined ? opts.textElementId : textEditingElementIdRef.current;
        if (opts?.kind === 'signature' || opts?.kind === 'date') {
          if (!textElementId) {
            toast.error(
              opts.kind === 'date'
                ? 'Click inside a text box first, then insert Date at the cursor.'
                : 'Click inside a text box first, then insert Signature at the cursor.',
            );
            resolve(null);
            return;
          }
        }
        otherSignerPendingRef.current = {
          kind: opts?.kind,
          textElementId,
          resolve,
        };
        setOtherSignerLabel('');
        setOtherSignerModalOpen(true);
      });
    },
    [],
  );

  const confirmOtherSignerModal = useCallback(() => {
    const pending = otherSignerPendingRef.current;
    const label =
      otherSignerLabel.trim() || nextOtherSignerLabel(stateRef.current.signerRoles);
    const kind = pending?.kind;
    const textId = pending?.textElementId ?? textEditingElementIdRef.current;
    pushHistory();
    const { roles, signer } = addSigner(stateRef.current.signerRoles, label);
    retainSignerIdsRef.current.add(signer.id);
    // Flush roles before insert so signature chips paint with the real label (not "Signer").
    flushSync(() => {
      setSignerRoles(roles);
      stateRef.current = { ...stateRef.current, signerRoles: roles };
    });
    if (kind === 'initials') {
      const el = createInitialsElement({ assignee: signer.id });
      const pageEls = stateRef.current.pages[stateRef.current.currentPageIndex]?.elements ?? [];
      const page = stateRef.current.pages[stateRef.current.currentPageIndex];
      const tmpl = templates.find((t) => t.id === (page?.template_id ?? ''));
      const margins: PageMargins = {
        left_pct: page?.margins?.left_pct ?? tmpl?.margins?.left_pct ?? 0,
        right_pct: page?.margins?.right_pct ?? tmpl?.margins?.right_pct ?? 0,
        top_pct: page?.margins?.top_pct ?? tmpl?.margins?.top_pct ?? 0,
        bottom_pct: page?.margins?.bottom_pct ?? tmpl?.margins?.bottom_pct ?? 0,
      };
      const placed = placeElementOutsideBlockedAreas(el, pageEls, margins);
      setCurrentPageElements((prev) => [...prev, placed]);
      setSelectedElementIds([placed.id]);
      if (textEditingElementIdRef.current) notifyBlockedByTextEdit();
    } else if (kind === 'date' && textId) {
      insertDocumentDateAtomAtCaret(textId, { assignee: signer.id });
    } else if (kind === 'signature' && textId) {
      insertDocumentSignatureAtomAtCaret(textId, { assignee: signer.id });
    } else if (kind === 'signature' || kind === 'date') {
      retainSignerIdsRef.current.delete(signer.id);
      toast.error(
        kind === 'date'
          ? 'Click inside a text box first, then insert Date at the cursor.'
          : 'Click inside a text box first, then insert Signature at the cursor.',
      );
      closeOtherSignerModal(null);
      return;
    }
    closeOtherSignerModal(signer.id);
  }, [
    otherSignerLabel,
    pushHistory,
    setCurrentPageElements,
    closeOtherSignerModal,
    notifyBlockedByTextEdit,
    templates,
  ]);

  const handleRemoveElement = useCallback((elementId: string) => {
    pushHistory();
    const pageIndex = findPageIndexForElement(elementId) ?? stateRef.current.currentPageIndex;
    const nextPages = stateRef.current.pages.map((p, i) =>
      i === pageIndex
        ? { ...p, elements: (p.elements ?? []).filter((e) => e.id !== elementId) }
        : p,
    );
    setPages(nextPages);
    pruneSignersFromPages(nextPages);
    setSelectedElementIds((prev) => prev.filter((id) => id !== elementId));
  }, [findPageIndexForElement, pushHistory, pruneSignersFromPages]);

  const handleUpdateElementAtPage = useCallback(
    (pageIndex: number, elementId: string, updater: (e: DocElement) => DocElement) => {
      updateElementsAtPageIndex(pageIndex, (prev) =>
        prev.map((e) => (e.id === elementId ? updater(e) : e))
      );
    },
    [updateElementsAtPageIndex]
  );

  const handleRemoveElementAtPage = useCallback(
    (pageIndex: number, elementId: string) => {
      pushHistory();
      const nextPages = stateRef.current.pages.map((p, i) =>
        i === pageIndex
          ? { ...p, elements: (p.elements ?? []).filter((e) => e.id !== elementId) }
          : p,
      );
      setPages(nextPages);
      pruneSignersFromPages(nextPages);
      setSelectedElementIds((prev) => prev.filter((id) => id !== elementId));
    },
    [pushHistory, pruneSignersFromPages]
  );

  const handleAlignSelected = useCallback(
    (alignment: AlignKind) => {
      const pageIdx =
        selectedElementIds.length > 0
          ? findPageIndexForElement(selectedElementIds[0]) ?? stateRef.current.currentPageIndex
          : stateRef.current.currentPageIndex;
      const pageEls = stateRef.current.pages[pageIdx]?.elements ?? [];
      const ids = selectedElementIds.filter((id) => {
        const el = pageEls.find((e) => e.id === id);
        return el && !el.locked && !el.lockPosition;
      });
      if (ids.length < 2) return;
      const sel = pageEls.filter((e) => ids.includes(e.id));
      let left = 100,
        right = 0,
        top = 100,
        bottom = 0;
      sel.forEach((el) => {
        const x = el.x_pct ?? 10;
        const y = el.y_pct ?? 20;
        const w = el.width_pct ?? 80;
        const h = el.height_pct ?? 8;
        left = Math.min(left, x);
        right = Math.max(right, x + w);
        top = Math.min(top, y);
        bottom = Math.max(bottom, y + h);
      });
      const centerX = (left + right) / 2;
      const centerY = (top + bottom) / 2;
      const page = stateRef.current.pages[pageIdx];
      const tmpl = templates.find((t) => t.id === (page?.template_id ?? ''));
      const L = page?.margins?.left_pct ?? tmpl?.margins?.left_pct ?? 0;
      const R = page?.margins?.right_pct ?? tmpl?.margins?.right_pct ?? 0;
      const T = page?.margins?.top_pct ?? tmpl?.margins?.top_pct ?? 0;
      const B = page?.margins?.bottom_pct ?? tmpl?.margins?.bottom_pct ?? 0;
      pushHistory();
      updateElementsAtPageIndex(pageIdx, (prev) =>
        prev.map((el) => {
          if (!ids.includes(el.id)) return el;
          const w = el.width_pct ?? 80;
          const h = el.height_pct ?? 8;
          let newX = el.x_pct ?? 10;
          let newY = el.y_pct ?? 20;
          switch (alignment) {
            case 'left':
              newX = left;
              break;
            case 'right':
              newX = right - w;
              break;
            case 'centerH':
              newX = centerX - w / 2;
              break;
            case 'top':
              newY = top;
              break;
            case 'bottom':
              newY = bottom - h;
              break;
            case 'centerV':
              newY = centerY - h / 2;
              break;
          }
          newX = Math.max(L, Math.min(100 - R - w, newX));
          newY = Math.max(T, Math.min(100 - B - h, newY));
          return { ...el, x_pct: newX, y_pct: newY };
        })
      );
    },
    [selectedElementIds, findPageIndexForElement, templates, pushHistory, updateElementsAtPageIndex]
  );

  const newPageWithTemplate = useCallback((templateId: string | null): DocumentPage => {
    return { template_id: templateId, elements: [] };
  }, []);

  const handleAddPageWithTemplate = useCallback(
    (templateId: string | null) => {
      pushHistory();
      setPages((prev) => [...prev, newPageWithTemplate(templateId)]);
      setCurrentPageIndex(pages.length);
      setSelectedElementIds([]);
      setShowAddPageModal(false);
    },
    [newPageWithTemplate, pages.length, pushHistory]
  );

  const handleAddPages = useCallback(
    (newPages: DocumentPage[]) => {
      if (newPages.length === 0) return;
      pushHistory();
      setPages((prev) => [...prev, ...newPages]);
      setCurrentPageIndex((prev) => prev + newPages.length - 1);
      setSelectedElementIds([]);
      setShowAddPageModal(false);
    },
    [pushHistory]
  );

  const handleDeletePage = useCallback(async (index: number) => {
    if (pages.length <= 1) return;
    const choice = await confirmRef.current({
      title: 'Delete page',
      message: `Remove page ${index + 1} from this document?`,
      confirmText: 'Delete',
    });
    if (choice !== 'confirm') return;
    pushHistory();
    setPages((prev) => {
      if (prev.length <= 1) return prev;
      const next = prev.filter((_, i) => i !== index);
      setSignerRoles((roles) => pruneUnusedSigners(roles, next));
      return next;
    });
    setCurrentPageIndex((prev) => {
      if (index < prev) return prev - 1;
      if (index === prev) return Math.max(0, prev - 1);
      return prev;
    });
    setSelectedElementIds([]);
  }, [pages.length, pushHistory]);

  const handleDuplicatePage = useCallback(
    (index: number) => {
      const page = pages[index];
      if (!page) return;
      const clonedElements = (page.elements ?? []).map((el) => ({
        ...(JSON.parse(JSON.stringify(el)) as DocElement),
        id: newElementId(),
      }));
      const newPage: DocumentPage = {
        template_id: page.template_id,
        margins: page.margins ? { ...page.margins } : undefined,
        elements: clonedElements,
      };
      pushHistory();
      setPages((prev) => {
        const next = [...prev];
        next.splice(index + 1, 0, newPage);
        return next;
      });
      setCurrentPageIndex(index + 1);
      setSelectedElementIds([]);
    },
    [pages, newElementId, pushHistory]
  );

  const handleReorderPages = useCallback(
    (fromIndex: number, toIndex: number) => {
      if (fromIndex === toIndex) return;
      pushHistory();
      setPages((prev) => {
        const next = [...prev];
        const [moved] = next.splice(fromIndex, 1);
        next.splice(toIndex, 0, moved);
        return next;
      });
      setCurrentPageIndex((prev) => {
        if (prev === fromIndex) return toIndex;
        if (fromIndex < prev && toIndex >= prev) return prev - 1;
        if (fromIndex > prev && toIndex <= prev) return prev + 1;
        return prev;
      });
    },
    [pushHistory]
  );

  const handleAddText = useCallback(() => {
    handleAddElement(createTextElement());
  }, [handleAddElement]);

  const handleAddImagePlaceholder = useCallback(() => {
    handleAddElement(createImagePlaceholder());
  }, [handleAddElement]);

  const uploadDocumentImageFile = useCallback(
    async (file: File): Promise<string> => {
      const up: any = await api('POST', '/files/upload', {
        original_name: file.name,
        content_type: file.type || 'application/octet-stream',
        client_id: null,
        project_id: null,
        employee_id: null,
        category_id: isTemplate ? 'document-creator-template' : 'document-creator',
      });
      const res = await fetch(up.upload_url, {
        method: 'PUT',
        headers: { 'Content-Type': file.type || 'application/octet-stream', 'x-ms-blob-type': 'BlockBlob' },
        body: file,
      });
      if (!res.ok) throw new Error('Upload failed');
      const conf: any = await api('POST', '/files/confirm', {
        key: up.key,
        size_bytes: file.size,
        checksum_sha256: 'na',
        content_type: file.type || 'application/octet-stream',
      });
      return conf.id as string;
    },
    [isTemplate],
  );

  const buildImageElement = useCallback(
    async (
      file: File,
      fileId: string,
      position?: { x_pct: number; y_pct: number },
      offsetIndex = 0,
    ): Promise<DocElement> => {
      let iw = 0;
      let ih = 0;
      try {
        const dims = await readImageFileDimensions(file);
        iw = dims.width;
        ih = dims.height;
      } catch {
        /* use defaults */
      }

      const base = createImageElement(fileId);
      let el: DocElement = base;
      if (iw > 0 && ih > 0) {
        const { width_pct, height_pct } = sizeImageElementFrameForIntrinsicAspect(30, iw, ih);
        el = { ...base, width_pct, height_pct, imageFit: 'fill' };
      }

      const w = el.width_pct ?? 40;
      const h = el.height_pct ?? 25;
      if (position) {
        const cx = position.x_pct + offsetIndex * 1.5;
        const cy = position.y_pct + offsetIndex * 1.5;
        el = {
          ...el,
          x_pct: Math.max(0, Math.min(100 - w, cx - w / 2)),
          y_pct: Math.max(0, Math.min(100 - h, cy - h / 2)),
        };
      } else {
        const ox = 10 + offsetIndex * 1.5;
        const oy = 30 + offsetIndex * 1.5;
        el = {
          ...el,
          x_pct: Math.min(100 - w, ox),
          y_pct: Math.min(100 - h, oy),
        };
      }
      return el;
    },
    [],
  );

  const insertImagesFromFiles = useCallback(
    async (
      files: File[],
      opts?: { x_pct?: number; y_pct?: number; pageIndex?: number },
    ) => {
      // ImagePicker owns paste/upload while open — do not mutate the document yet.
      if (imagePickerOpenRef.current) return;
      if (textEditingElementId) {
        notifyBlockedByTextEdit();
        return;
      }
      const valid = files.filter(isLikelyImageFile);
      if (!valid.length) {
        toast.error('No supported image found.');
        return;
      }
      const pageIndex = opts?.pageIndex ?? stateRef.current.currentPageIndex;
      const position =
        opts?.x_pct != null && opts?.y_pct != null ? { x_pct: opts.x_pct, y_pct: opts.y_pct } : undefined;
      try {
        if (valid.length === 1 && stateRef.current.selectedElementIds.length === 1) {
          const selId = stateRef.current.selectedElementIds[0];
          const allElements = stateRef.current.pages.flatMap((p) => p.elements ?? []);
          const selEl = allElements.find((e) => e.id === selId);
          if (selEl?.type === 'image' && !selEl.content) {
            const file = valid[0];
            const fileId = await uploadDocumentImageFile(file);
            let iw = 0;
            let ih = 0;
            try {
              const dims = await readImageFileDimensions(file);
              iw = dims.width;
              ih = dims.height;
            } catch {
              /* use defaults */
            }
            const targetPageIndex = findPageIndexForElement(selId) ?? pageIndex;
            applyImageToElement(targetPageIndex, selId, fileId, {
              intrinsicWidth: iw > 0 ? iw : undefined,
              intrinsicHeight: ih > 0 ? ih : undefined,
            });
            toast.success('Image updated.');
            return;
          }
        }
        const newElements: DocElement[] = [];
        for (let i = 0; i < valid.length; i++) {
          const file = valid[i];
          const fileId = await uploadDocumentImageFile(file);
          const el = await buildImageElement(file, fileId, position, i);
          newElements.push(el);
        }
        pushHistory();
        updateElementsAtPageIndex(pageIndex, (prev) => [...prev, ...newElements]);
        setCurrentPageIndex(pageIndex);
        setSelectedElementIds(newElements.map((el) => el.id));
        toast.success(valid.length === 1 ? 'Image added.' : `${valid.length} images added.`);
      } catch {
        toast.error('Failed to upload image.');
      }
    },
    [
      textEditingElementId,
      notifyBlockedByTextEdit,
      pushHistory,
      uploadDocumentImageFile,
      buildImageElement,
      updateElementsAtPageIndex,
      findPageIndexForElement,
      applyImageToElement,
    ],
  );

  const pasteInternalElements = useCallback(() => {
    const raw = readDocumentCreatorClipboard(clipboardRef.current);
    const buf = isTemplate ? raw : raw.filter((el) => el.type !== 'block');
    if (buf.length === 0) return;
    pushHistory();
    const clones: DocElement[] = buf.map((src) => ({
      ...(JSON.parse(JSON.stringify(src)) as DocElement),
      id: newElementId(),
      // Same geometry across documents/templates (no offset).
      x_pct: src.x_pct ?? 0,
      y_pct: src.y_pct ?? 0,
      width_pct: src.width_pct,
      height_pct: src.height_pct,
    }));
    setPages((prev) => {
      const next = [...prev];
      const idx = stateRef.current.currentPageIndex;
      if (!next[idx]) return prev;
      const els = next[idx].elements ?? [];
      next[idx] = { ...next[idx], elements: [...els, ...clones] };
      return next;
    });
    setSelectedElementIds(clones.map((c) => c.id));
  }, [newElementId, pushHistory, isTemplate]);

  useEffect(() => {
    if (readOnly) return;
    const onPaste = (e: ClipboardEvent) => {
      // Let ImagePicker handle Ctrl+V while the dialog is open.
      if (imagePickerOpenRef.current) return;
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName?.toLowerCase();
      const isTyping = tag === 'input' || tag === 'textarea' || tag === 'select';
      if (isTyping) return;
      if ((t?.isContentEditable ?? false) && textEditingElementId) return;

      const images = imageFilesFromClipboardData(e.clipboardData);
      if (images.length) {
        e.preventDefault();
        pasteShortcutRef.current = false;
        void insertImagesFromFiles(images);
        return;
      }

      if (!pasteShortcutRef.current) return;
      pasteShortcutRef.current = false;
      const raw = readDocumentCreatorClipboard(clipboardRef.current);
      const buf = isTemplate ? raw : raw.filter((el) => el.type !== 'block');
      if (buf.length === 0) return;
      e.preventDefault();
      pasteInternalElements();
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [readOnly, textEditingElementId, insertImagesFromFiles, pasteInternalElements, isTemplate]);

  const handleAddImage = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !isLikelyImageFile(file)) return;
    e.target.value = '';
    await insertImagesFromFiles([file]);
  }, [insertImagesFromFiles]);

  const handleReplaceImageAtPage = useCallback(
    async (pageIndex: number, elementId: string, file: File) => {
      try {
        const confId = await uploadDocumentImageFile(file);
        pushHistory();
        updateElementsAtPageIndex(pageIndex, (prev) =>
          prev.map((e) => (e.id === elementId ? { ...e, content: confId } : e))
        );
        toast.success('Image updated.');
      } catch {
        toast.error('Failed to upload image.');
      }
    },
    [pushHistory, updateElementsAtPageIndex, uploadDocumentImageFile]
  );

  const handleReplaceImage = useCallback(
    async (elementId: string, file: File) => {
      await handleReplaceImageAtPage(currentPageIndex, elementId, file);
    },
    [currentPageIndex, handleReplaceImageAtPage]
  );

  const openImagePickerForElement = useCallback(
    (elementId: string, pageIndex?: number) => {
      const allElements = stateRef.current.pages.flatMap((p) => p.elements ?? []);
      const el = allElements.find((x) => x.id === elementId);
      const idx = pageIndex ?? findPageIndexForElement(elementId) ?? stateRef.current.currentPageIndex;
      // Always keep the existing slot/frame when replacing (empty Image area or filled image).
      const preserveFrame = el?.type === 'image';
      imagePickerReplaceRef.current = { elementId, pageIndex: idx, preserveFrame };
      imagePickerOpenRef.current = true;
      setImagePickerReplaceElementId(elementId);
      setImagePickerFileObjectId(el?.type === 'image' && el.content ? el.content : undefined);
      setImagePickerOpenEditorOnOpen(false);
      setImagePickerOpen(true);
    },
    [findPageIndexForElement],
  );

  const openImageEditorForElement = useCallback(
    (elementId: string, pageIndex?: number) => {
      const allElements = stateRef.current.pages.flatMap((p) => p.elements ?? []);
      const el = allElements.find((x) => x.id === elementId);
      const idx = pageIndex ?? findPageIndexForElement(elementId) ?? stateRef.current.currentPageIndex;
      const preserveFrame = el?.type === 'image';
      imagePickerReplaceRef.current = { elementId, pageIndex: idx, preserveFrame };
      imagePickerOpenRef.current = true;
      setImagePickerReplaceElementId(elementId);
      setImagePickerFileObjectId(el?.type === 'image' && el.content ? el.content : undefined);
      setImagePickerOpenEditorOnOpen(true);
      setImagePickerOpen(true);
    },
    [findPageIndexForElement],
  );

  const handleExportPdf = useCallback(async () => {
    if (!id) return;
    try {
      setIsExportingPdf(true);
      const token = getToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;
      const r = await fetch(`/document-creator/documents/${id}/export-pdf`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ canvas_width_px: 910 }),
      });
      if (!r.ok) throw new Error(r.statusText || 'Export failed');
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      setPdfPreview((prev) => {
        if (prev?.url) URL.revokeObjectURL(prev.url);
        return { url, filename: `${title || 'document'}.pdf` };
      });
      toast.success('PDF ready for preview.');
    } catch (e: any) {
      toast.error(e?.message || 'Failed to export PDF.');
    } finally {
      setIsExportingPdf(false);
    }
  }, [id, title, canvasWidthPxForExport]);

  const closePdfPreview = useCallback(() => {
    setPdfPreview((prev) => {
      if (prev?.url) URL.revokeObjectURL(prev.url);
      return null;
    });
  }, []);

  const handleSaveTemplatePage = useCallback(() => {
    if (!isTemplate || !templateProps) return;
    const page = pages[0];
    if (!page) return;
    const margins: PageMargins = {
      left_pct: page.margins?.left_pct ?? 0,
      right_pct: page.margins?.right_pct ?? 0,
      top_pct: page.margins?.top_pct ?? 0,
      bottom_pct: page.margins?.bottom_pct ?? 0,
    };
    templateProps.onSave(margins, page.elements ?? [], page.template_id ?? null);
    templateProps.onClose();
  }, [isTemplate, templateProps, pages]);

  const repositionBackgroundMenu = useCallback(() => {
    if (!bgPickerOpen || !bgBackgroundTriggerRef.current) return;
    const r = bgBackgroundTriggerRef.current.getBoundingClientRect();
    const panelW = 340;
    const left = Math.max(8, Math.min(r.left, window.innerWidth - panelW - 8));
    const top = r.bottom + 4;
    setBgMenuPos({ top, left });
  }, [bgPickerOpen]);

  useLayoutEffect(() => {
    if (!bgPickerOpen) return;
    repositionBackgroundMenu();
    window.addEventListener('resize', repositionBackgroundMenu);
    window.addEventListener('scroll', repositionBackgroundMenu, true);
    return () => {
      window.removeEventListener('resize', repositionBackgroundMenu);
      window.removeEventListener('scroll', repositionBackgroundMenu, true);
    };
  }, [bgPickerOpen, repositionBackgroundMenu]);

  useEffect(() => {
    if (!bgPickerOpen) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node | null;
      if (!t) return;
      if (bgBackgroundTriggerRef.current?.contains(t)) return;
      if (bgDropdownRef.current?.contains(t)) return;
      setBgPickerOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [bgPickerOpen]);

  void historyRevision;

  if (isTemplate && templateProps && !templateProps.open) return null;

  const ribbonLayoutPanel = (
    <>
      <button
        type="button"
        ref={bgBackgroundTriggerRef}
        onClick={() => setBgPickerOpen((v) => !v)}
        className={`inline-flex items-center gap-2 rounded-xl border border-slate-300/90 bg-white px-2.5 py-2 text-sm font-semibold text-slate-800 shadow-[0_1px_3px_rgba(15,23,42,0.08)] transition-[border-color,box-shadow,background-color] duration-200 ease-out hover:border-slate-400 hover:bg-slate-50 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-red/35`}
        title="Change page background"
        aria-expanded={bgPickerOpen}
        aria-haspopup="listbox"
      >
        <ImageIcon className="h-4 w-4 shrink-0 text-slate-600" />
        <span>Change background</span>
        <span className="text-xs leading-none text-slate-400" aria-hidden>
          ▾
        </span>
      </button>
      {bgPickerOpen &&
        createPortal(
          <div
            ref={bgDropdownRef}
            role="listbox"
            aria-label="Page backgrounds"
            className={`${ribbonPortalDropdownPanelClass} w-[340px] max-h-[60vh] overflow-auto`}
            style={{ top: bgMenuPos.top, left: bgMenuPos.left }}
          >
            <button
              type="button"
              onClick={() => {
                setCurrentPageTemplate(null);
                setBgPickerOpen(false);
              }}
              className={`flex w-full items-center gap-2 rounded-xl px-2 py-2 transition-colors hover:bg-slate-50 ${!currentTemplateId ? 'bg-slate-50' : ''}`}
            >
              <div className="flex h-10 w-16 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-100 text-xs text-slate-500">
                None
              </div>
              <div className="min-w-0 truncate text-sm text-slate-700">No background</div>
            </button>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {templates.map((t) => {
                const thumb = t.background_file_id ? withFileAccessToken(`/files/${t.background_file_id}/thumbnail?w=260`) : null;
                const selected = currentTemplateId === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      setCurrentPageTemplate(t.id);
                      setBgPickerOpen(false);
                    }}
                    className={`rounded-xl border p-2 text-left transition-colors hover:bg-slate-50 ${selected ? 'border-brand-red bg-brand-red/[0.06] shadow-sm ring-1 ring-brand-red/20' : 'border-slate-200'}`}
                    title={t.name}
                  >
                    <div className="aspect-[210/297] w-full overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
                      {thumb ? <img src={thumb} alt="" className="w-full h-full object-cover" /> : null}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>,
          getOverlayRoot()
        )}
      {isTemplate && currentPage && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-300/85 bg-white px-2.5 py-1.5 shadow-[0_1px_3px_rgba(15,23,42,0.06)]">
          <span className={`${editorGroupLabelClass} whitespace-nowrap text-[10px]`}>Margins %</span>
          {(['left_pct', 'right_pct', 'top_pct', 'bottom_pct'] as const).map((key) => (
            <input
              key={key}
              type="number"
              min={0}
              max={50}
              value={currentPage.margins?.[key] ?? 0}
              onChange={(e) =>
                setCurrentPageMargins({
                  left_pct: currentPage.margins?.left_pct ?? 0,
                  right_pct: currentPage.margins?.right_pct ?? 0,
                  top_pct: currentPage.margins?.top_pct ?? 0,
                  bottom_pct: currentPage.margins?.bottom_pct ?? 0,
                  [key]: Number(e.target.value),
                })
              }
              className="h-8 w-11 rounded-lg border border-slate-200 bg-white px-1.5 text-center text-xs font-medium text-slate-800 shadow-sm focus:border-brand-red/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-red/25"
              title={key.replace('_pct', '')}
            />
          ))}
        </div>
      )}
    </>
  );

  return (
    <div className="relative flex flex-col h-full min-h-0 max-w-full">
      {editLockStatus === 'pending' && !isTemplate ? (
        <OverlayPortal>
          <div className="fixed inset-0 z-[225] flex items-center justify-center bg-white/70 backdrop-blur-[1px]">
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 shadow-sm">
              Opening document…
            </div>
          </div>
        </OverlayPortal>
      ) : null}
      <div
        className={
          stickyToolbar
            ? 'sticky top-0 z-40 shrink-0 border-b border-slate-200/90 bg-white shadow-[0_6px_16px_-6px_rgba(15,23,42,0.18)]'
            : 'shrink-0'
        }
      >
      <DocumentEditorRibbon
        onCloseOrBack={handleCloseOrBack}
        useCloseIcon={!!onClose}
        modeHeading={
          isTemplate && templateProps
            ? `Page ${templateProps.pageIndex + 1} layout`
            : readOnly
              ? 'View document'
              : onClose
                ? 'Edit document'
                : 'Document'
        }
        title={title}
        onTitleChange={setTitle}
        showTitleInput={!isTemplate && !readOnly}
        saveStatus={ribbonSaveStatus}
        mediaLoading={mediaLoading}
        isTemplate={!!isTemplate}
        textEditingElementId={textEditingElementId}
        projectId={projectId}
        subjectUserId={subjectUserId}
        showExportPdf={!isTemplate}
        onExportPdf={handleExportPdf}
        isExportingPdf={isExportingPdf}
        showSendForSignature={enableSendForSignature && !readOnly}
        onSendForSignature={() => {
          finishTextEditing();
          setSendForSignatureOpen(true);
        }}
        showSaveTemplate={!!(isTemplate && templateProps)}
        onSaveTemplate={handleSaveTemplatePage}
        onUndo={undo}
        onRedo={redo}
        canUndo={undoRef.current.length > 0}
        canRedo={redoRef.current.length > 0}
        readOnly={readOnly}
        showViewOnlyBadge={readOnly && editLockStatus !== 'pending'}
        viewOnlyNotice={
          lockBannerHolder
            ? `This document is being edited by ${lockBannerHolder}`
            : null
        }
        onAddText={handleAddText}
        onAddImage={() => {
          if (projectId) {
            if (
              selectedElementIds.length === 1 &&
              selectedElement?.type === 'image' &&
              !selectedElement.content
            ) {
              openImagePickerForElement(selectedElement.id);
              return;
            }
            imagePickerReplaceRef.current = null;
            imagePickerOpenRef.current = true;
            setImagePickerReplaceElementId(null);
            setImagePickerFileObjectId(undefined);
            setImagePickerOpenEditorOnOpen(false);
            setImagePickerOpen(true);
          } else fileInputRef.current?.click();
        }}
        onAddImagePlaceholder={handleAddImagePlaceholder}
        onAddInitials={
          projectId
            ? undefined
            : (assigneeRoleId) => handleAddElement(createInitialsElement({ assignee: assigneeRoleId }))
        }
        signerRoles={signerRoles}
        onRequestOtherSigner={
          projectId
            ? undefined
            : (kind, textElementId) => {
                void openOtherSignerModal({ kind, textElementId });
              }
        }
        showBlock={!!isTemplate}
        onAddBlock={isTemplate ? () => handleAddElement(createBlockElement()) : undefined}
        layoutPanel={ribbonLayoutPanel}
        selectionPanel={
          !readOnly && selectedElementIds.length > 0 ? (
            <DocumentSelectionRibbon
              selectedElementIds={selectedElementIds}
              elements={selectionPageElements}
              element={selectedElement && selectedElement.type !== 'block' ? selectedElement : null}
              onUpdate={handleUpdateElementWithHistory}
              onRemove={handleRemoveElement}
              onDeselect={() => {
                if (textEditingElementId) {
                  notifyBlockedByTextEdit();
                  return;
                }
                setSelectedElementIds([]);
              }}
              onReplaceImage={handleReplaceImage}
              onReplaceImageClick={
                projectId ? openImagePickerForElement : undefined
              }
              onEditImageClick={projectId ? openImageEditorForElement : undefined}
              onAlignSelected={handleAlignSelected}
              onSendBackward={
                selectedElement
                  ? () => {
                      const idx = selectionPageElements.findIndex((e) => e.id === selectedElement.id);
                      if (idx >= 0) moveBackward(idx, selectionPageIndex);
                    }
                  : undefined
              }
              onBringForward={
                selectedElement
                  ? () => {
                      const idx = selectionPageElements.findIndex((e) => e.id === selectedElement.id);
                      if (idx >= 0) moveForward(idx, selectionPageIndex);
                    }
                  : undefined
              }
              onSendToBack={
                selectedElement
                  ? () => {
                      const idx = selectionPageElements.findIndex((e) => e.id === selectedElement.id);
                      if (idx >= 0) sendToBack(idx, selectionPageIndex);
                    }
                  : undefined
              }
              onBringToFront={
                selectedElement
                  ? () => {
                      const idx = selectionPageElements.findIndex((e) => e.id === selectedElement.id);
                      if (idx >= 0) bringToFront(idx, selectionPageIndex);
                    }
                  : undefined
              }
            />
          ) : undefined
        }
        inspectorPanel={
          !readOnly ? (
            <DocumentSelectionInspector
              element={selectedElement}
              onUpdate={handleUpdateElementWithHistory}
              margins={selectionEffectiveMargins}
              signerRoles={signerRoles}
              onRequestOtherSigner={() => openOtherSignerModal()}
            />
          ) : undefined
        }
        zoom={zoom}
        onZoomChange={setZoom}
        extraActions={extraActions}
        closeSlotBelow={closeSlotBelow}
      />
      </div>
      {enableSendForSignature && id ? (
        <SendForSignatureModal
          open={sendForSignatureOpen}
          documentId={id}
          documentTitle={title}
          pages={pages}
          signerRoles={signerRoles}
          lockedSubjectUserId={subjectUserId}
          onClose={() => setSendForSignatureOpen(false)}
          onSent={() => {
            /* inbox is separate; toast already shown in modal */
          }}
          flushSave={flushSave}
        />
      ) : null}
      <AppFormModal
        open={otherSignerModalOpen}
        onClose={() => closeOtherSignerModal(null)}
        title="Other signer"
        description="Name this signer. You can reuse them on as many signature fields as you need."
        formWidth="default"
        footer={
          <div className="flex justify-end gap-2">
            <AppButton variant="secondary" onClick={() => closeOtherSignerModal(null)}>
              Cancel
            </AppButton>
            <AppButton variant="primary" onClick={confirmOtherSignerModal}>
              Add
            </AppButton>
          </div>
        }
      >
        <div className={uiSpacing.sectionStack}>
          <AppInput
            label="Signer name"
            value={otherSignerLabel}
            onChange={(e) => setOtherSignerLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                confirmOtherSignerModal();
              }
            }}
            autoFocus
            placeholder="Other"
          />
        </div>
      </AppFormModal>
      {!readOnly && <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAddImage} />}
      {pdfPreview && (
        <OverlayPortal><div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-5xl bg-white rounded-xl shadow-xl overflow-hidden border border-gray-200">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-gray-50">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-gray-800 truncate">PDF Preview</div>
                <div className="text-xs text-gray-500 truncate">{pdfPreview.filename}</div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleExportPdf}
                  disabled={isExportingPdf}
                  className={`px-3 py-1.5 rounded border text-sm ${
                    isExportingPdf ? 'text-gray-400 border-gray-200 cursor-not-allowed' : 'border-gray-300 hover:bg-gray-100 text-gray-700'
                  }`}
                  title="Regenerate preview"
                >
                  Refresh
                </button>
                <a
                  href={pdfPreview.url}
                  download={pdfPreview.filename}
                  className="px-3 py-1.5 rounded border border-gray-300 text-sm text-gray-700 hover:bg-gray-100"
                >
                  Download
                </a>
                <button
                  type="button"
                  onClick={closePdfPreview}
                  className="px-3 py-1.5 rounded bg-gray-800 text-white text-sm hover:bg-gray-900"
                >
                  Close
                </button>
              </div>
            </div>
            <div className="bg-gray-200">
              <iframe
                title="PDF Preview"
                src={pdfPreview.url}
                className="w-full h-[78vh] bg-white"
              />
            </div>
          </div>
        </div></OverlayPortal>
      )}
      <div className={`flex min-h-0 min-w-0 flex-1 overflow-hidden ${editorSurfaceWorkspaceClass}`}>
        <DocumentPagesStrip
          pages={frozenStripPages ?? pages}
          templates={templates}
          currentPageIndex={currentPageIndex}
          onPageSelect={handlePageSelect}
          onAddPage={readOnly ? undefined : isTemplate ? () => {} : () => setShowAddPageModal(true)}
          onReorderPages={readOnly ? undefined : isTemplate ? undefined : handleReorderPages}
          onDeletePage={readOnly ? undefined : isTemplate ? undefined : handleDeletePage}
          onDuplicatePage={
            readOnly ? undefined
              : isTemplate
                ? templateProps?.onDuplicatePage
                  ? () => templateProps.onDuplicatePage?.(pages[0]?.margins ?? {}, pages[0]?.elements ?? [])
                  : undefined
                : handleDuplicatePage
          }
          collapsed={pagesPanelCollapsed}
          onToggleCollapsed={() => setPagesPanelCollapsed((v) => !v)}
        />
        {useContinuousPageCanvas ? (
          <div
            ref={canvasScrollRef}
            className={`min-h-0 flex-1 overflow-x-hidden overflow-y-auto scroll-smooth ${editorCanvasScrollAreaClass}`}
          >
            {pages.map((page, pageIndex) => {
              const tmplForPage = templates.find((t) => t.id === (page.template_id ?? ''));
              const bgForPage = tmplForPage?.background_file_id
                ? withFileAccessToken(`/files/${tmplForPage.background_file_id}/thumbnail?w=800`)
                : null;
              const marginsForPage: PageMargins = {
                ...defaultMargins,
                ...tmplForPage?.margins,
                ...page.margins,
              };
              const elsForPage = page.elements ?? [];
              const mountInteractivePreview = Math.abs(pageIndex - currentPageIndex) <= 1;
              return (
                <section
                  key={pageIndex}
                  ref={setPageSectionRef(pageIndex)}
                  data-page-index={pageIndex}
                  className="box-border flex w-full shrink-0 flex-col items-center justify-center py-6"
                >
                  {mountInteractivePreview ? (
                  <DocumentPreview
                    embedded
                    embedScrollParentRef={canvasScrollRef}
                    onPageInteraction={() => setCurrentPageIndex(pageIndex)}
                    backgroundUrl={bgForPage}
                    elements={elsForPage}
                    margins={marginsForPage}
                    blockAreasVisible={true}
                    lockBlockElements={!isTemplate}
                    showElementOptionsPopover={false}
                    signerRoles={signerRoles}
                    onCanvasWidthPxChange={setCanvasWidthPxForExport}
                    onBeginUserAction={readOnly ? undefined : pushHistory}
                    zoom={zoom}
                    onTextEditingChange={setTextEditingElementId}
                    editingElementId={textEditingElementId}
                    onEditingElementIdChange={setTextEditingElementId}
                    onElementClick={(elementId, e) => handlePreviewElementClick(pageIndex, elementId, e)}
                    onCanvasClick={() => {
                      if (textEditingElementId) {
                        notifyBlockedByTextEdit();
                        return;
                      }
                      setSelectedElementIds([]);
                    }}
                    selectedElementIds={selectedElementIds}
                    onUpdateElement={
                      readOnly ? undefined : (id, u) => handleUpdateElementAtPage(pageIndex, id, u)
                    }
                    onBatchUpdateElements={
                      readOnly ? undefined : (updater) => updateElementsAtPageIndex(pageIndex, updater)
                    }
                    onGestureChange={readOnly ? undefined : handleCanvasGestureChange}
                    onRemoveElement={readOnly ? undefined : (id) => handleRemoveElementAtPage(pageIndex, id)}
                    onReplaceImage={
                      readOnly ? undefined : (id, file) => handleReplaceImageAtPage(pageIndex, id, file)
                    }
                    onReplaceImageClick={readOnly ? undefined : (projectId ? openImagePickerForElement : undefined)}
                    onInsertImages={
                      readOnly
                        ? undefined
                        : (files, position) => insertImagesFromFiles(files, { ...position, pageIndex })
                    }
                    projectId={projectId}
                  />
                  ) : (
                    <div
                      className="pointer-events-none w-full max-w-[910px] rounded-xl border border-slate-200/80 bg-slate-100/80 shadow-sm"
                      style={{ aspectRatio: '210 / 297' }}
                      aria-hidden
                    />
                  )}
                </section>
              );
            })}
          </div>
        ) : (
          <DocumentPreview
            scrollToTopKey={id ?? null}
            backgroundUrl={backgroundUrl}
            elements={elements}
            margins={effectiveMargins}
            blockAreasVisible={true}
            lockBlockElements={!isTemplate}
            showElementOptionsPopover={false}
            signerRoles={signerRoles}
            onCanvasWidthPxChange={setCanvasWidthPxForExport}
            onBeginUserAction={readOnly ? undefined : pushHistory}
            zoom={zoom}
            onTextEditingChange={setTextEditingElementId}
            editingElementId={textEditingElementId}
            onEditingElementIdChange={setTextEditingElementId}
            onElementClick={(elementId, e) => handlePreviewElementClick(undefined, elementId, e)}
            onCanvasClick={() => {
              if (textEditingElementId) {
                notifyBlockedByTextEdit();
                return;
              }
              setSelectedElementIds([]);
            }}
            selectedElementIds={selectedElementIds}
            onUpdateElement={readOnly ? undefined : handleUpdateElement}
            onBatchUpdateElements={
              readOnly
                ? undefined
                : (updater) => updateElementsAtPageIndex(currentPageIndex, updater)
            }
            onGestureChange={readOnly ? undefined : handleCanvasGestureChange}
            onRemoveElement={readOnly ? undefined : handleRemoveElement}
            onReplaceImage={readOnly ? undefined : handleReplaceImage}
            onReplaceImageClick={readOnly ? undefined : (projectId ? openImagePickerForElement : undefined)}
            onInsertImages={readOnly ? undefined : insertImagesFromFiles}
            projectId={projectId}
          />
        )}
        {!readOnly && layersPanelCollapsed && (
          <div className={editorSidePanelCollapsedRailRightClass}>
            <button
              type="button"
              onClick={() => setLayersPanelCollapsed(false)}
              className={editorSidePanelCollapsedRailButtonClass}
              title="Expand Layers"
              aria-expanded={false}
              aria-label="Expand Layers panel"
            >
              <ChevronLeftIcon className="h-4 w-4 shrink-0 opacity-90" />
              <MiniLayersStackGlyph className="h-9 w-6 shrink-0 text-slate-400" />
              <span aria-hidden className={`${editorSidePanelCollapsedRailCaptionClass} mt-0.5`}>Layers</span>
            </button>
          </div>
        )}
        {!readOnly && !layersPanelCollapsed && (
        <div className={editorSidePanelRootRightClass}>
          <div className={`${editorSidePanelHeaderClass} flex flex-col gap-0`}>
            <div className="flex items-start gap-1">
              <div className="min-w-0 flex-1">
                <div className={editorSidePanelHeadingTitleClass}>Layers</div>
                <p className={editorSidePanelHeadingMetaClass}>Stack order on page</p>
              </div>
              <button
                type="button"
                onClick={() => setLayersPanelCollapsed(true)}
                className={editorSidePanelCollapseToggleClass}
                title="Collapse Layers"
                aria-expanded={true}
                aria-label="Collapse Layers panel"
              >
                <ChevronRightIcon className="h-4 w-4" />
              </button>
            </div>
          </div>
          <div className={`${editorSidePanelBodyClass} space-y-2`}>
            {elements.length === 0 && (
              <div className="rounded-lg border border-dashed border-slate-200/90 bg-white px-2 py-4 text-center text-[11px] font-medium text-slate-500">
                No elements on this page.
              </div>
            )}
            {elements.map((el, idx) => {
              const isSel = selectedElementIds.includes(el.id);
              const label =
                el.type === 'text'
                  ? (el.content || 'Text').split('\n')[0].slice(0, 24)
                  : el.type === 'image'
                    ? (el.content ? 'Image' : 'Image area')
                    : el.type === 'initials'
                      ? 'Initials'
                      : el.type === 'date'
                        ? 'Date'
                        : 'Blocked Area';
              const typeIcon =
                el.type === 'text' ? (
                  <TextIcon className="h-3 w-3 text-slate-400" />
                ) : el.type === 'image' ? (
                  <ImageIcon className="h-3 w-3 text-slate-400" />
                ) : el.type === 'initials' ? (
                  <InitialsIcon className="h-3 w-3 text-slate-400" />
                ) : el.type === 'date' ? (
                  <DateFieldIcon className="h-3 w-3 text-slate-400" />
                ) : (
                  <BlockIcon className="h-3 w-3 text-slate-400" />
                );
              const typeLabel =
                el.type === 'text'
                  ? 'Text'
                  : el.type === 'image'
                    ? 'Image'
                    : el.type === 'initials'
                      ? 'Initials'
                      : el.type === 'date'
                        ? 'Date'
                        : 'Block';
              return (
                <div
                  key={el.id}
                  className={`group rounded-lg border transition-[border-color,box-shadow,background-color] duration-200 ease-out ${
                    isSel
                      ? 'border-brand-red/40 bg-white shadow-sm ring-1 ring-brand-red/15'
                      : 'border-slate-200/90 bg-white hover:border-slate-300/90 hover:bg-slate-50/95'
                  }`}
                  draggable={el.type !== 'block'}
                  onDragStart={() => setDragLayerIndex(idx)}
                  onDragOver={(e) => {
                    if (dragLayerIndex === null) return;
                    e.preventDefault();
                  }}
                  onDrop={() => {
                    if (dragLayerIndex === null) return;
                    moveElement(dragLayerIndex, idx);
                    setDragLayerIndex(null);
                  }}
                >
                  <div className="flex items-center gap-1 px-2 py-1.5">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleUpdateElementWithHistory(el.id, (prev) => ({ ...prev, locked: !prev.locked }));
                      }}
                      className={`flex-shrink-0 rounded-md p-1 transition-colors duration-200 ${
                        el.locked
                          ? 'text-amber-700 hover:bg-amber-50'
                          : 'text-slate-400 hover:bg-slate-100 hover:text-slate-600'
                      }`}
                      title={el.locked ? 'Unlock' : 'Lock'}
                      aria-label={el.locked ? 'Unlock' : 'Lock'}
                    >
                      <LockIcon locked={!!el.locked} className="h-3 w-3" />
                    </button>
                    {el.type !== 'block' && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleUpdateElementWithHistory(el.id, (prev) => ({ ...prev, lockPosition: !prev.lockPosition }));
                        }}
                        className={`flex-shrink-0 rounded-md p-1 transition-colors duration-200 ${
                          el.lockPosition ? 'text-sky-600 hover:bg-sky-50' : 'text-slate-400 hover:bg-slate-100 hover:text-slate-600'
                        }`}
                        title={el.lockPosition ? 'Allow move' : 'Block move'}
                        aria-label={el.lockPosition ? 'Allow move' : 'Block move'}
                      >
                        <PinIcon pinned={!!el.lockPosition} className="h-3 w-3" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={(e) => {
                        if (textEditingElementId) {
                          notifyBlockedByTextEdit();
                          return;
                        }
                        if (e.ctrlKey || e.metaKey) {
                          setSelectedElementIds((prev) =>
                            prev.includes(el.id) ? prev.filter((id) => id !== el.id) : [...prev, el.id]
                          );
                        } else {
                          setSelectedElementIds([el.id]);
                        }
                      }}
                      className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                      title={label}
                    >
                      <span className="flex shrink-0 items-center gap-1 rounded border border-slate-200/90 bg-slate-100/80 px-1.5 py-0.5">
                        {typeIcon}
                        <span className="text-[9px] font-semibold uppercase tracking-wide text-slate-500">{typeLabel}</span>
                      </span>
                      <span className="flex-1 truncate text-[12px] font-medium leading-snug text-slate-800">{label}</span>
                    </button>
                  </div>
                  {isSel && selectedElementIds.length === 1 && el.type !== 'block' && (
                    <div className="flex items-center justify-center gap-0.5 border-t border-slate-100 px-1.5 pb-1.5 pt-1.5">
                      <button
                        type="button"
                        onClick={() => moveBackward(idx)}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200/90 bg-white text-slate-500 shadow-sm transition-[border-color,background-color,color,transform] duration-200 ease-out hover:border-slate-300 hover:bg-slate-50 hover:text-slate-800 active:scale-[0.96]"
                        title="Send backward"
                        aria-label="Send backward"
                      >
                        <LayerBackwardIcon className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveForward(idx)}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200/90 bg-white text-slate-500 shadow-sm transition-[border-color,background-color,color,transform] duration-200 ease-out hover:border-slate-300 hover:bg-slate-50 hover:text-slate-800 active:scale-[0.96]"
                        title="Bring forward"
                        aria-label="Bring forward"
                      >
                        <LayerForwardIcon className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => sendToBack(idx)}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200/90 bg-white text-slate-500 shadow-sm transition-[border-color,background-color,color,transform] duration-200 ease-out hover:border-slate-300 hover:bg-slate-50 hover:text-slate-800 active:scale-[0.96]"
                        title="Send to back"
                        aria-label="Send to back"
                      >
                        <LayerToBackIcon className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => bringToFront(idx)}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200/90 bg-white text-slate-500 shadow-sm transition-[border-color,background-color,color,transform] duration-200 ease-out hover:border-slate-300 hover:bg-slate-50 hover:text-slate-800 active:scale-[0.96]"
                        title="Bring to front"
                        aria-label="Bring to front"
                      >
                        <LayerToFrontIcon className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        )}
      </div>
      {!isTemplate && !readOnly && (
      <AddPageModal
        open={showAddPageModal}
        templates={templates}
        onClose={() => setShowAddPageModal(false)}
        onAddPage={handleAddPageWithTemplate}
        onAddPages={handleAddPages}
        projectId={projectId}
        subjectUserId={subjectUserId}
      />
      )}
      {!isTemplate && projectId && imagePickerOpen && (
        <ImagePicker
          isOpen={true}
          onClose={closeImagePicker}
          projectId={projectId}
          fileObjectId={imagePickerFileObjectId}
          openEditorOnOpen={imagePickerOpenEditorOnOpen}
          targetWidth={imagePickerTargetSize.width}
          targetHeight={imagePickerTargetSize.height}
          allowEdit={true}
          exportScale={2}
          preserveTransparency={true}
          enableFitModes
          onConfirm={async (blob, meta?: ImagePickerConfirmMeta) => {
            if (imagePickerConfirmLockRef.current) return;
            imagePickerConfirmLockRef.current = true;
            const replaceTarget = imagePickerReplaceRef.current;
            try {
              const mime = meta?.mimeType || blob.type || 'image/jpeg';
              const ext = mime === 'image/png' ? 'png' : 'jpg';
              const file = new File([blob], `doc-img-${Date.now()}.${ext}`, { type: mime });
              const fileId = await uploadDocumentImageFile(file);

              // Prefetch thumbnail so the canvas paints promptly after the picker closes.
              try {
                await new Promise<void>((resolve) => {
                  const img = new Image();
                  img.onload = () => resolve();
                  img.onerror = () => resolve();
                  img.src = withFileAccessToken(`/files/${fileId}/thumbnail?w=900`);
                });
              } catch {
                /* ignore prefetch errors */
              }

              if (replaceTarget) {
                applyImageToElement(replaceTarget.pageIndex, replaceTarget.elementId, fileId, {
                  intrinsicWidth: meta?.intrinsicWidth,
                  intrinsicHeight: meta?.intrinsicHeight,
                  preserveFrame: replaceTarget.preserveFrame,
                  fitMode: meta?.fitMode,
                });
                toast.success('Image updated.');
              } else {
                const el = await buildImageElement(file, fileId);
                handleAddElement(el);
                toast.success('Image added.');
              }
              closeImagePicker();
            } catch {
              toast.error('Failed to upload image.');
            } finally {
              imagePickerConfirmLockRef.current = false;
            }
          }}
        />
      )}
    </div>
  );
});

export default DocumentEditor;
