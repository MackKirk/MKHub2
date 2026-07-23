import { useState, useEffect, useLayoutEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, getToken, withFileAccessToken } from '@/lib/api';
import { getOverlayRoot } from '@/lib/overlayRoot';
import toast from 'react-hot-toast';
import DocumentPreview from '@/components/DocumentPreview';
import DocumentPagesStrip from '@/components/DocumentPagesStrip';
import { AddPageModal } from '@/components/AddPageModal';
import ImagePicker, { type ImagePickerConfirmMeta } from '@/components/ImagePicker';
import type { DocumentPage, DocElement, PageMargins } from '@/types/documentCreator';
import {
  createTextElement,
  createImageElement,
  createImagePlaceholder,
  createBlockElement,
  sizeImageElementFrameForIntrinsicAspect,
} from '@/types/documentCreator';
import OverlayPortal from '@/components/OverlayPortal';
import DocumentEditorRibbon from '@/components/document-editor/DocumentEditorRibbon';
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
  BlockIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  MiniLayersStackGlyph,
  ImageIcon,
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
  pages?: DocumentPage[];
  created_at?: string;
  updated_at?: string | null;
};

const defaultPage = (): DocumentPage => ({ template_id: null, elements: [] });

type EditorSnapshot = {
  title: string;
  pages: DocumentPage[];
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
  onClose?: () => void;
  /** When true, document is view-only: no editing, no add page, no save. */
  readOnly?: boolean;
  /** Optional node rendered at the far right of the ribbon (e.g. expand/compress button). */
  extraActions?: React.ReactNode;
  /** Optional element rendered directly below the close/back button in the ribbon (e.g. expand button). */
  closeSlotBelow?: React.ReactNode;
  /** Pin ribbon to the Hub scrollport while the page scrolls (inline editor on project/opportunity). */
  stickyToolbar?: boolean;
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

export default function DocumentEditor(props: DocumentEditorProps) {
  const isTemplate = isTemplateMode(props);
  const documentId = !isTemplate ? props.documentId : undefined;
  const projectId = !isTemplate ? props.projectId : undefined;
  const onClose = props.onClose;
  const templateProps = isTemplate ? props : null;
  const readOnly = !isTemplate && !!(props as DocumentEditorDocumentProps).readOnly;
  const extraActions = !isTemplate ? (props as DocumentEditorDocumentProps).extraActions : undefined;
  const closeSlotBelow = !isTemplate ? (props as DocumentEditorDocumentProps).closeSlotBelow : undefined;
  const stickyToolbar = !isTemplate && !!(props as DocumentEditorDocumentProps).stickyToolbar;

  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bgBackgroundTriggerRef = useRef<HTMLButtonElement>(null);
  const bgDropdownRef = useRef<HTMLDivElement>(null);
  const [bgMenuPos, setBgMenuPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const lastSavedRef = useRef<{ title: string; pagesStr: string } | null>(null);
  /** After initial GET for a document id, ignore refetches (e.g. post-save invalidate) so undo/redo is not cleared. */
  const serverDocHydratedForIdRef = useRef<string | null>(null);
  const id = documentId;

  const [title, setTitle] = useState('New document');
  const [pages, setPages] = useState<DocumentPage[]>([defaultPage()]);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [selectedElementIds, setSelectedElementIds] = useState<string[]>([]);
  /** Inline text edit active — block selecting other elements until Done / Escape. */
  const [textEditingElementId, setTextEditingElementId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [showAddPageModal, setShowAddPageModal] = useState(false);
  const [pagesPanelCollapsed, setPagesPanelCollapsed] = useState(false);
  const [layersPanelCollapsed, setLayersPanelCollapsed] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [pdfPreview, setPdfPreview] = useState<{ url: string; filename: string } | null>(null);
  const [bgPickerOpen, setBgPickerOpen] = useState(false);
  const [imagePickerOpen, setImagePickerOpen] = useState(false);
  /** When set, ImagePicker is in "replace" mode for this element; when null, in "add" mode. */
  const [imagePickerReplaceElementId, setImagePickerReplaceElementId] = useState<string | null>(null);
  /** Preload this image in the picker when editing/replacing. */
  const [imagePickerFileObjectId, setImagePickerFileObjectId] = useState<string | undefined>(undefined);
  /** When true, picker opens directly in ImageEditor. */
  const [imagePickerOpenEditorOnOpen, setImagePickerOpenEditorOnOpen] = useState(false);
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
    currentPageIndex: 0,
    selectedElementIds: [],
  });
  const undoRef = useRef<EditorSnapshot[]>([]);
  const redoRef = useRef<EditorSnapshot[]>([]);
  /** Internal clipboard: one or many elements (multi-select copy/paste). */
  const clipboardRef = useRef<DocElement[] | null>(null);

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

  const { data: doc } = useQuery({
    queryKey: ['document-creator-doc', id],
    queryFn: () => api<UserDocument>('GET', `/document-creator/documents/${id}`),
    enabled: !!id,
  });

  useEffect(() => {
    serverDocHydratedForIdRef.current = null;
  }, [id]);

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
      setCurrentPageIndex(0);
      setSelectedElementIds([]);
      stateRef.current = {
        title: '',
        pages: [
          {
            template_id: templateProps.templateId,
            margins: templateProps.initialMargins ?? undefined,
            elements: initialEls,
          },
        ],
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

    // Server returned no pages (new doc): still mark hydrated so autosave can run later; do not leave
    // `serverDocHydratedForIdRef` unset (that used to let debounced save PATCH a blank page over real data).
    if (doc.pages.length === 0) {
      const emptyPages: DocumentPage[] = [defaultPage()];
      const t = doc.title || 'New document';
      setTitle(t);
      setPages(emptyPages);
      lastSavedRef.current = { title: t, pagesStr: JSON.stringify(emptyPages) };
      stateRef.current = {
        title: t,
        pages: emptyPages,
        currentPageIndex: 0,
        selectedElementIds: [],
      };
      undoRef.current = [];
      redoRef.current = [];
      bumpHistory();
      serverDocHydratedForIdRef.current = id;
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
    lastSavedRef.current = {
      title: doc.title || 'New document',
      pagesStr: JSON.stringify(converted),
    };
    // Reset history on first load from server only (not on invalidate/refetch).
    stateRef.current = {
      title: doc.title || 'New document',
      pages: converted,
      currentPageIndex: 0,
      selectedElementIds: [],
    };
    undoRef.current = [];
    redoRef.current = [];
    bumpHistory();
    serverDocHydratedForIdRef.current = id;
    requestAnimationFrame(() => scrollCanvasToTop());
  }, [doc, templates, id, bumpHistory, scrollCanvasToTop]);

  // Keep ref updated for history snapshots
  useEffect(() => {
    stateRef.current = {
      title,
      pages,
      currentPageIndex,
      selectedElementIds,
    };
  }, [title, pages, currentPageIndex, selectedElementIds]);

  // Keyboard shortcuts: Delete, Arrow keys, Undo/Redo, Copy/Paste/Duplicate
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
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
          setPages((prev) => {
            const next = [...prev];
            const idx = stateRef.current.currentPageIndex;
            if (!next[idx]) return prev;
            next[idx] = {
              ...next[idx],
              elements: (next[idx].elements ?? []).filter((el) => !removeIds.has(el.id)),
            };
            return next;
          });
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
      // Copy/Paste/Duplicate for elements (multi-select supported; blocks excluded)
      const toCopy = selectedEls.filter((el) => el.type !== 'block');
      if (key === 'c') {
        if (toCopy.length > 0) {
          e.preventDefault();
          clipboardRef.current = toCopy.map((el) => JSON.parse(JSON.stringify(el)) as DocElement);
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
        const buf = clipboardRef.current?.filter((el) => el.type !== 'block') ?? [];
        if (buf.length === 0) return;
        e.preventDefault();
        pushHistory();
        const clones: DocElement[] = buf.map((src) => ({
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
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [undo, redo, newElementId, pushHistory, selectedElementIds, textEditingElementId, notifyBlockedByTextEdit]);

  const currentPage = pages[currentPageIndex];
  const currentTemplateId = currentPage?.template_id ?? null;
  const currentTemplate = templates.find((t) => t.id === currentTemplateId);
  const elements = currentPage?.elements ?? [];
  const selectedElement = selectedElementIds.length === 1 ? elements.find((e) => e.id === selectedElementIds[0]) : null;

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
      requestAnimationFrame(() => scrollToPageSection(index, 'smooth'));
    },
    [scrollToPageSection],
  );

  useEffect(() => {
    const idsOnPage = new Set((pages[currentPageIndex]?.elements ?? []).map((e) => e.id));
    setSelectedElementIds((prev) => prev.filter((id) => idsOnPage.has(id)));
  }, [currentPageIndex, pages]);

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

  const moveElement = useCallback(
    (fromIndex: number, toIndex: number) => {
      if (fromIndex === toIndex) return;
      pushHistory();
      setCurrentPageElements((prev) => {
        const next = [...prev];
        const [moved] = next.splice(fromIndex, 1);
        next.splice(toIndex, 0, moved);
        return next;
      });
    },
    [pushHistory, setCurrentPageElements]
  );

  const bringToFront = useCallback(
    (index: number) => moveElement(index, elements.length - 1),
    [moveElement, elements.length]
  );
  const sendToBack = useCallback((index: number) => moveElement(index, 0), [moveElement]);
  const moveForward = useCallback(
    (index: number) => moveElement(index, Math.min(elements.length - 1, index + 1)),
    [moveElement, elements.length]
  );
  const moveBackward = useCallback((index: number) => moveElement(index, Math.max(0, index - 1)), [moveElement]);

  const handleAddElement = useCallback((el: DocElement) => {
    pushHistory();
    setCurrentPageElements((prev) => [...prev, el]);
    setSelectedElementIds([el.id]);
    if (textEditingElementId) notifyBlockedByTextEdit();
  }, [setCurrentPageElements, pushHistory, textEditingElementId, notifyBlockedByTextEdit]);

  const handleUpdateElement = useCallback((elementId: string, updater: (e: DocElement) => DocElement) => {
    setCurrentPageElements((prev) =>
      prev.map((e) => (e.id === elementId ? updater(e) : e))
    );
  }, [setCurrentPageElements]);

  const handleUpdateElementWithHistory = useCallback((elementId: string, updater: (e: DocElement) => DocElement) => {
    pushHistory();
    handleUpdateElement(elementId, updater);
  }, [pushHistory, handleUpdateElement]);

  const handleRemoveElement = useCallback((elementId: string) => {
    pushHistory();
    setCurrentPageElements((prev) => prev.filter((e) => e.id !== elementId));
    setSelectedElementIds((prev) => prev.filter((id) => id !== elementId));
  }, [setCurrentPageElements, pushHistory]);

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
      updateElementsAtPageIndex(pageIndex, (prev) => prev.filter((e) => e.id !== elementId));
      setSelectedElementIds((prev) => prev.filter((id) => id !== elementId));
    },
    [pushHistory, updateElementsAtPageIndex]
  );

  const handleAlignSelected = useCallback(
    (alignment: AlignKind) => {
      const ids = selectedElementIds.filter((id) => {
        const el = elements.find((e) => e.id === id);
        return el && !el.locked && !el.lockPosition;
      });
      if (ids.length < 2) return;
      const sel = elements.filter((e) => ids.includes(e.id));
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
      const L = effectiveMargins?.left_pct ?? 0;
      const R = effectiveMargins?.right_pct ?? 0;
      const T = effectiveMargins?.top_pct ?? 0;
      const B = effectiveMargins?.bottom_pct ?? 0;
      pushHistory();
      setCurrentPageElements((prev) =>
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
    [selectedElementIds, elements, effectiveMargins, pushHistory, setCurrentPageElements]
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

  const handleDeletePage = useCallback((index: number) => {
    pushHistory();
    setPages((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((_, i) => i !== index);
    });
    setCurrentPageIndex((prev) => {
      if (index < prev) return prev - 1;
      if (index === prev) return Math.max(0, prev - 1);
      return prev;
    });
    setSelectedElementIds([]);
  }, [pushHistory]);

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


  const handleAddImage = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    e.target.value = '';
    try {
      const up: any = await api('POST', '/files/upload', {
        original_name: file.name,
        content_type: file.type,
        client_id: null,
        project_id: null,
        employee_id: null,
        category_id: isTemplate ? 'document-creator-template' : 'document-creator',
      });
      const res = await fetch(up.upload_url, {
        method: 'PUT',
        headers: { 'Content-Type': file.type, 'x-ms-blob-type': 'BlockBlob' },
        body: file,
      });
      if (!res.ok) throw new Error('Upload failed');
      const conf: any = await api('POST', '/files/confirm', {
        key: up.key,
        size_bytes: file.size,
        checksum_sha256: 'na',
        content_type: file.type,
      });
      handleAddElement(createImageElement(conf.id));
      toast.success('Image added.');
    } catch (err) {
      toast.error('Failed to upload image.');
    }
  }, [handleAddElement]);

  const handleReplaceImageAtPage = useCallback(
    async (pageIndex: number, elementId: string, file: File) => {
      try {
        const up: any = await api('POST', '/files/upload', {
          original_name: file.name,
          content_type: file.type,
          client_id: null,
          project_id: null,
          employee_id: null,
          category_id: isTemplate ? 'document-creator-template' : 'document-creator',
        });
        const res = await fetch(up.upload_url, {
          method: 'PUT',
          headers: { 'Content-Type': file.type, 'x-ms-blob-type': 'BlockBlob' },
          body: file,
        });
        if (!res.ok) throw new Error('Upload failed');
        const conf: any = await api('POST', '/files/confirm', {
          key: up.key,
          size_bytes: file.size,
          checksum_sha256: 'na',
          content_type: file.type,
        });
        pushHistory();
        updateElementsAtPageIndex(pageIndex, (prev) =>
          prev.map((e) => (e.id === elementId ? { ...e, content: conf.id } : e))
        );
        toast.success('Image updated.');
      } catch {
        toast.error('Failed to upload image.');
      }
    },
    [pushHistory, updateElementsAtPageIndex, isTemplate]
  );

  const handleReplaceImage = useCallback(
    async (elementId: string, file: File) => {
      await handleReplaceImageAtPage(currentPageIndex, elementId, file);
    },
    [currentPageIndex, handleReplaceImageAtPage]
  );

  const openImagePickerForElement = useCallback((elementId: string) => {
    const el = elements.find((x) => x.id === elementId);
    setImagePickerReplaceElementId(elementId);
    setImagePickerFileObjectId(el?.type === 'image' && el.content ? el.content : undefined);
    setImagePickerOpenEditorOnOpen(false);
    setImagePickerOpen(true);
  }, [elements]);

  const openImageEditorForElement = useCallback((elementId: string) => {
    const el = elements.find((x) => x.id === elementId);
    setImagePickerReplaceElementId(elementId);
    setImagePickerFileObjectId(el?.type === 'image' && el.content ? el.content : undefined);
    setImagePickerOpenEditorOnOpen(true);
    setImagePickerOpen(true);
  }, [elements]);

  const saveDocument = useCallback(async () => {
    if (!id) return;
    if (serverDocHydratedForIdRef.current !== id) return;
    const st = stateRef.current;
    const payload = {
      title: st.title,
      pages: st.pages.map((p) => ({
        template_id: p.template_id,
        margins: p.margins ?? undefined,
        elements: p.elements ?? [],
      })),
    };
    setIsSaving(true);
    try {
      await api('PATCH', `/document-creator/documents/${id}`, payload);
      lastSavedRef.current = { title: st.title, pagesStr: JSON.stringify(st.pages) };
      queryClient.invalidateQueries({ queryKey: ['document-creator-doc', id] });
      queryClient.invalidateQueries({ queryKey: ['document-creator-documents'] });
      if (projectId) {
        queryClient.invalidateQueries({ queryKey: ['document-creator-documents', projectId] });
      }
    } catch (e: any) {
      toast.error(e?.message || 'Failed to save.');
    } finally {
      setIsSaving(false);
    }
  }, [id, projectId, queryClient]);

  useEffect(() => {
    if (!id || readOnly) return;
    // Critical: do not PATCH until the server document has been merged into React state at least once.
    // Otherwise the debounced save can fire while `pages` is still the initial default ([blank page]) —
    // e.g. slow GET after a server restart, or hydration waiting on templates — and overwrite real content.
    if (serverDocHydratedForIdRef.current !== id) return;
    const pagesStr = JSON.stringify(pages);
    if (
      lastSavedRef.current &&
      lastSavedRef.current.title === title &&
      lastSavedRef.current.pagesStr === pagesStr
    )
      return;
    const t = setTimeout(saveDocument, 1500);
    return () => clearTimeout(t);
  }, [id, title, pages, saveDocument, readOnly]);

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
    <div className="flex flex-col h-full min-h-0 max-w-full">
      <div
        className={
          stickyToolbar
            ? 'sticky top-0 z-40 shrink-0 border-b border-slate-200/90 bg-white shadow-[0_6px_16px_-6px_rgba(15,23,42,0.18)]'
            : 'shrink-0'
        }
      >
      <DocumentEditorRibbon
        onCloseOrBack={onClose ?? (() => navigate('/documents/create'))}
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
        isSaving={isSaving}
        isTemplate={!!isTemplate}
        showExportPdf={!isTemplate}
        onExportPdf={handleExportPdf}
        isExportingPdf={isExportingPdf}
        showSaveTemplate={!!(isTemplate && templateProps)}
        onSaveTemplate={handleSaveTemplatePage}
        onUndo={undo}
        onRedo={redo}
        canUndo={undoRef.current.length > 0}
        canRedo={redoRef.current.length > 0}
        readOnly={readOnly}
        onAddText={handleAddText}
        onAddImage={() => {
          if (projectId) {
            setImagePickerReplaceElementId(null);
            setImagePickerFileObjectId(undefined);
            setImagePickerOpenEditorOnOpen(false);
            setImagePickerOpen(true);
          }
          else fileInputRef.current?.click();
        }}
        onAddImagePlaceholder={handleAddImagePlaceholder}
        showBlock={!!isTemplate}
        onAddBlock={isTemplate ? () => handleAddElement(createBlockElement()) : undefined}
        layoutPanel={ribbonLayoutPanel}
        selectionPanel={
          !readOnly && selectedElementIds.length > 0 ? (
            <DocumentSelectionRibbon
              selectedElementIds={selectedElementIds}
              elements={elements}
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
            />
          ) : undefined
        }
        inspectorPanel={
          !readOnly ? (
            <DocumentSelectionInspector
              element={selectedElement && selectedElement.type !== 'block' ? selectedElement : null}
              onUpdate={handleUpdateElementWithHistory}
            />
          ) : undefined
        }
        zoom={zoom}
        onZoomChange={setZoom}
        extraActions={extraActions}
        closeSlotBelow={closeSlotBelow}
      />
      </div>
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
          pages={pages}
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
              return (
                <section
                  key={pageIndex}
                  ref={setPageSectionRef(pageIndex)}
                  data-page-index={pageIndex}
                  className="box-border flex w-full shrink-0 flex-col items-center justify-center py-6"
                >
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
                    onRemoveElement={readOnly ? undefined : (id) => handleRemoveElementAtPage(pageIndex, id)}
                    onReplaceImage={
                      readOnly ? undefined : (id, file) => handleReplaceImageAtPage(pageIndex, id, file)
                    }
                    onReplaceImageClick={readOnly ? undefined : (projectId ? openImagePickerForElement : undefined)}
                  />
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
            onRemoveElement={readOnly ? undefined : handleRemoveElement}
            onReplaceImage={readOnly ? undefined : handleReplaceImage}
            onReplaceImageClick={readOnly ? undefined : (projectId ? openImagePickerForElement : undefined)}
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
                    : 'Blocked Area';
              const typeIcon =
                el.type === 'text' ? (
                  <TextIcon className="h-3 w-3 text-slate-400" />
                ) : el.type === 'image' ? (
                  <ImageIcon className="h-3 w-3 text-slate-400" />
                ) : (
                  <BlockIcon className="h-3 w-3 text-slate-400" />
                );
              const typeLabel = el.type === 'text' ? 'Text' : el.type === 'image' ? 'Image' : 'Block';
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
      />
      )}
      {!isTemplate && projectId && imagePickerOpen && (
        <ImagePicker
          isOpen={true}
          onClose={() => {
            setImagePickerOpen(false);
            setImagePickerReplaceElementId(null);
            setImagePickerFileObjectId(undefined);
            setImagePickerOpenEditorOnOpen(false);
          }}
          projectId={projectId}
          fileObjectId={imagePickerFileObjectId}
          openEditorOnOpen={imagePickerOpenEditorOnOpen}
          targetWidth={imagePickerTargetSize.width}
          targetHeight={imagePickerTargetSize.height}
          allowEdit={true}
          exportScale={2}
          onConfirm={async (blob, meta?: ImagePickerConfirmMeta) => {
            try {
              const name = `doc-img-${Date.now()}.jpg`;
              const up: any = await api('POST', '/files/upload', {
                original_name: name,
                content_type: 'image/jpeg',
                client_id: null,
                project_id: null,
                employee_id: null,
                category_id: 'document-creator',
              });
              const res = await fetch(up.upload_url, {
                method: 'PUT',
                headers: { 'Content-Type': 'image/jpeg', 'x-ms-blob-type': 'BlockBlob' },
                body: blob,
              });
              if (!res.ok) throw new Error('Upload failed');
              const conf: any = await api('POST', '/files/confirm', {
                key: up.key,
                size_bytes: blob.size,
                checksum_sha256: 'na',
                content_type: 'image/jpeg',
              });
              const iw = meta?.intrinsicWidth;
              const ih = meta?.intrinsicHeight;
              const replaceId = imagePickerReplaceElementId;
              if (replaceId) {
                pushHistory();
                handleUpdateElement(replaceId, (el) => {
                  if (el.type !== 'image') {
                    return { ...el, content: conf.id };
                  }
                  const next: DocElement = {
                    ...el,
                    content: conf.id,
                    imageFit: 'fill',
                  };
                  if (iw && ih && iw > 0 && ih > 0) {
                    const { width_pct, height_pct } = sizeImageElementFrameForIntrinsicAspect(el.width_pct ?? 40, iw, ih);
                    return { ...next, width_pct, height_pct };
                  }
                  return next;
                });
                toast.success('Image updated.');
              } else {
                const base = createImageElement(conf.id);
                const sized =
                  iw && ih && iw > 0 && ih > 0
                    ? {
                        ...base,
                        ...sizeImageElementFrameForIntrinsicAspect(base.width_pct ?? 40, iw, ih),
                        imageFit: 'fill' as const,
                      }
                    : base;
                handleAddElement(sized);
                toast.success('Image added.');
              }
              setImagePickerOpen(false);
              setImagePickerReplaceElementId(null);
              setImagePickerFileObjectId(undefined);
              setImagePickerOpenEditorOnOpen(false);
            } catch (err) {
              toast.error('Failed to upload image.');
            }
          }}
        />
      )}
    </div>
  );
}
