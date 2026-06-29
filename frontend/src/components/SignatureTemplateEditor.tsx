import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { api, getToken } from '@/lib/api';
import { overlayPxToPdfRect, pdfRectToOverlayStyle, type PdfRect } from '@/lib/pdfCoordinates';
import { onboardingSignatureTemplateQuickInfo } from '@/lib/formModalQuickInfo';
import { useConfirm } from '@/components/ConfirmProvider';
import {
  AppButton,
  AppCard,
  AppCheckbox,
  AppFormModal,
  AppSectionHeader,
  AppSelect,
  uiBorders,
  uiCx,
  uiLayout,
  uiRadius,
  uiSpacing,
  uiTypography,
} from '@/components/ui';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

export type TemplateFieldType =
  | 'employee_info'
  | 'text'
  | 'value'
  | 'paragraph'
  | 'date'
  | 'checkbox'
  | 'signature'
  | 'initials';

export type TemplateField = {
  id: string;
  type: TemplateFieldType;
  page_index: number;
  rect: PdfRect;
  field_name: string;
  required: boolean;
  assignee: 'employee' | 'user';
  employee_info_key?: string;
};

type SigTemplatePayload = {
  version: number;
  fields: Array<{
    id: string;
    type: string;
    page_index: number;
    rect: PdfRect;
    field_name: string;
    required: boolean;
    assignee: string;
    employee_info_key?: string;
  }>;
};

function defaultFieldLabel(t: TemplateFieldType): string {
  const m: Record<TemplateFieldType, string> = {
    employee_info: 'Employee info',
    text: 'Text field',
    value: 'Currency amount',
    paragraph: 'Paragraph',
    date: 'Date',
    checkbox: 'Checkbox',
    signature: 'Signature',
    initials: 'Initials',
  };
  return m[t];
}

const EMPLOYEE_INFO_KEY_LABELS: Record<string, string> = {
  full_name: 'Full name',
  first_name: 'First name',
  last_name: 'Last name',
  email: 'Email',
  phone: 'Phone',
  job_title: 'Job title',
  hire_date: 'Hire date',
  date_of_birth: 'Date of birth',
  sin_number: 'SIN number',
  address: 'Address',
  city: 'City',
  province: 'Province',
  postal_code: 'Postal code',
};

function getFieldDisplayName(f: { type: TemplateFieldType; employee_info_key?: string }): string {
  if (f.type === 'employee_info' && f.employee_info_key) {
    return EMPLOYEE_INFO_KEY_LABELS[f.employee_info_key] ?? f.employee_info_key;
  }
  return defaultFieldLabel(f.type);
}

function defaultFieldSize(t: TemplateFieldType): { w: number; h: number } {
  const w =
    t === 'signature' || t === 'initials' ? 150 : t === 'paragraph' ? 200 : t === 'checkbox' ? 24 : 140;
  const h =
    t === 'signature' || t === 'initials' ? 48 : t === 'paragraph' ? 96 : t === 'checkbox' ? 24 : 28;
  return { w, h };
}

function newField(t: TemplateFieldType, pageIndex: number, rect?: PdfRect): TemplateField {
  const { w, h } = defaultFieldSize(t);
  const base: TemplateField = {
    id: crypto.randomUUID(),
    type: t,
    page_index: pageIndex,
    rect: rect ?? { x: 72, y: 120, width: w, height: h },
    field_name: defaultFieldLabel(t),
    required: t === 'signature' || t === 'date',
    assignee: 'employee',
  };
  if (t === 'employee_info') base.employee_info_key = 'full_name';
  return base;
}

const EMPLOYEE_INFO_OPTIONS = Object.entries(EMPLOYEE_INFO_KEY_LABELS).map(([value, label]) => ({ value, label }));

const ASSIGNEE_OPTIONS = [
  { value: 'employee', label: 'Employee' },
  { value: 'user', label: 'User' },
];

const SIG_TEMPLATE_DIALOG_COLLAPSED = '!max-w-[1400px] !w-[min(1400px,95vw)]';
const SIG_TEMPLATE_DIALOG_EXPANDED = '!max-w-[calc(1400px+16rem+1.5rem)] !w-[min(calc(1400px+16rem+1.5rem),95vw)]';

type Props = {
  docId: string;
  docName: string;
  initialTemplate: SigTemplatePayload | null | undefined;
  onClose: () => void;
  onSaved: () => void;
};

const FIELD_TYPES: { type: TemplateFieldType; label: string }[] = [
  { type: 'employee_info', label: 'Employee info' },
  { type: 'text', label: 'Text' },
  { type: 'value', label: 'Currency' },
  { type: 'paragraph', label: 'Paragraph' },
  { type: 'date', label: 'Date' },
  { type: 'checkbox', label: 'Checkbox' },
  { type: 'signature', label: 'Signature' },
  { type: 'initials', label: 'Initials' },
];

type PageLayout = { canvasW: number; canvasH: number; heightPt: number };

function PdfPageCanvas({
  pdf,
  pageIndex,
  scale,
  onLayout,
}: {
  pdf: pdfjsLib.PDFDocumentProxy;
  pageIndex: number;
  scale: number;
  onLayout: (layout: PageLayout) => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const onLayoutRef = useRef(onLayout);
  onLayoutRef.current = onLayout;
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const page = await pdf.getPage(pageIndex + 1);
      const v1 = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale });
      const canvas = ref.current;
      if (!canvas || cancelled) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await page.render({ canvasContext: ctx, viewport, canvas }).promise;
      if (cancelled) return;
      onLayoutRef.current({ canvasW: viewport.width, canvasH: viewport.height, heightPt: v1.height });
    })();
    return () => {
      cancelled = true;
    };
  }, [pdf, pageIndex, scale]);
  return <canvas ref={ref} className="block max-w-full" />;
}

export default function SignatureTemplateEditor({ docId, docName, initialTemplate, onClose, onSaved }: Props) {
  const confirm = useConfirm();
  const [pdf, setPdf] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [pageHeights, setPageHeights] = useState<number[]>([]);
  const pageHeightsRef = useRef<number[]>([]);
  pageHeightsRef.current = pageHeights;
  const [numPages, setNumPages] = useState(0);
  const [scale, setScale] = useState(1.2);
  const [fields, setFields] = useState<TemplateField[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [pageLayouts, setPageLayouts] = useState<PageLayout[]>([]);
  const [pageUi, setPageUi] = useState(1);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const pageWrapRefs = useRef<(HTMLDivElement | null)[]>([]);
  const getVisiblePageIndexFromDomRef = useRef<() => number>(() => 0);
  const layoutUpdater = useCallback((pi: number) => (layout: PageLayout) => {
    setPageLayouts((prev) => {
      const next = [...prev];
      while (next.length <= pi) next.push({ canvasW: 0, canvasH: 0, heightPt: 792 });
      next[pi] = layout;
      return next;
    });
  }, []);
  const dragRef = useRef<{
    id: string;
    mode: 'move' | 'resize';
    startX: number;
    startY: number;
    orig: PdfRect;
    pageIndex: number;
  } | null>(null);

  // Snapshot inicial para detetar alterações não guardadas.
  const initialSnapshotRef = useRef<string>('[]');

  const normalizeFieldsForCompare = (fs: TemplateField[]) =>
    [...fs]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((f) => ({
        id: f.id,
        type: f.type,
        page_index: f.page_index,
        rect: { x: f.rect.x, y: f.rect.y, width: f.rect.width, height: f.rect.height },
        field_name: f.field_name,
        required: f.required,
        assignee: f.assignee,
        ...(f.type === 'employee_info' ? { employee_info_key: f.employee_info_key } : {}),
      }));

  const currentSnapshot = useMemo(() => JSON.stringify(normalizeFieldsForCompare(fields)), [fields]);

  /** In-memory copy for Ctrl+C / Ctrl+V (same session). */
  const fieldClipboardRef = useRef<TemplateField | null>(null);
  const fieldsRef = useRef<TemplateField[]>(fields);
  fieldsRef.current = fields;
  const selectedIdRef = useRef<string | null>(selectedId);
  selectedIdRef.current = selectedId;
  const numPagesRef = useRef(numPages);
  numPagesRef.current = numPages;

  /** 0-based page index whose center is closest to the scroll container center (same logic as toolbar). */
  const getVisiblePageIndexFromDom = useCallback((): number => {
    const root = scrollContainerRef.current;
    if (!root || numPages < 1) return 0;
    const rootRect = root.getBoundingClientRect();
    const centerY = rootRect.top + rootRect.height / 2;
    let bestPi = 0;
    let bestDist = Infinity;
    for (let pi = 0; pi < numPages; pi++) {
      const el = pageWrapRefs.current[pi];
      if (!el) continue;
      const r = el.getBoundingClientRect();
      const pageCenterY = r.top + r.height / 2;
      const dist = Math.abs(pageCenterY - centerY);
      if (dist < bestDist) {
        bestDist = dist;
        bestPi = pi;
      }
    }
    return bestPi;
  }, [numPages]);

  getVisiblePageIndexFromDomRef.current = getVisiblePageIndexFromDom;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const k = e.key.toLowerCase();
      if (k !== 'c' && k !== 'v') return;
      const t = e.target as HTMLElement | null;
      if (!t) return;
      if (t.isContentEditable || t.closest?.('[contenteditable="true"]')) return;
      const tag = t.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (k === 'c') {
        const sel = selectedIdRef.current;
        if (!sel) return;
        const f = fieldsRef.current.find((x) => x.id === sel);
        if (!f) return;
        e.preventDefault();
        fieldClipboardRef.current = JSON.parse(JSON.stringify(f)) as TemplateField;
        return;
      }

      if (k === 'v') {
        const src = fieldClipboardRef.current;
        if (!src) return;
        e.preventDefault();
        const nPages = numPagesRef.current;
        if (nPages < 1) return;
        const pi = getVisiblePageIndexFromDomRef.current();
        const ph = pageHeightsRef.current[pi] ?? 792;
        const dx = 12;
        const dy = 12;
        let nx = src.rect.x + dx;
        let ny = src.rect.y + dy;
        if (ny + src.rect.height > ph) ny = Math.max(0, ph - src.rect.height - 0.5);
        if (ny < 0) ny = 0;
        if (nx < 0) nx = 0;
        const newF: TemplateField = {
          ...src,
          id: crypto.randomUUID(),
          page_index: pi,
          rect: { ...src.rect, x: nx, y: ny },
        };
        setFields((prev) => [...prev, newF]);
        setSelectedId(newF.id);
        setPageUi(pi + 1);
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            document
              .querySelector(`[data-sig-tpl-field="${newF.id}"]`)
              ?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
          });
        });
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  /** Which page is most visible in the scroll area (1-based) — drives toolbar + "add field" target page. */
  const updateVisiblePage = useCallback(() => {
    if (numPages < 1) return;
    setPageUi(getVisiblePageIndexFromDom() + 1);
  }, [numPages, getVisiblePageIndexFromDom]);

  /** Place a new field in the PDF region that intersects the current scroll viewport (so the user sees it). */
  const computeInitialRectForAdd = useCallback(
    (t: TemplateFieldType, pageIndex: number): PdfRect => {
      const { w, h } = defaultFieldSize(t);
      const ph = pageLayouts[pageIndex]?.heightPt || pageHeights[pageIndex] || 792;
      const cw = pageLayouts[pageIndex]?.canvasW || 0;
      const ch = pageLayouts[pageIndex]?.canvasH || 0;
      const wPx = w * scale;
      const hPx = h * scale;
      const margin = 4;
      const pwPt = cw > 0 ? cw / scale : 612;

      if (cw < wPx + margin * 2 || ch < hPx + margin * 2) {
        const x = Math.max(margin, (pwPt - w) / 2);
        const y = Math.max(0, ph / 2 - h / 2);
        return { x, y, width: w, height: h };
      }

      const root = scrollContainerRef.current;
      const pageEl = pageWrapRefs.current[pageIndex];
      if (!root || !pageEl) {
        const x = Math.max(margin, (pwPt - w) / 2);
        const y = Math.max(0, ph / 2 - h / 2);
        return { x, y, width: w, height: h };
      }

      const rootRect = root.getBoundingClientRect();
      const pageRect = pageEl.getBoundingClientRect();

      const visTop = Math.max(rootRect.top, pageRect.top);
      const visBottom = Math.min(rootRect.bottom, pageRect.bottom);
      const visLeft = Math.max(rootRect.left, pageRect.left);
      const visRight = Math.min(rootRect.right, pageRect.right);

      const visH = visBottom - visTop;
      const visW = visRight - visLeft;

      let leftPx: number;
      let topPx: number;

      if (visH < 24 || visW < 24) {
        leftPx = (cw - wPx) / 2;
        topPx = (ch - hPx) / 2;
      } else {
        const centerX = (visLeft + visRight) / 2;
        const centerY = (visTop + visBottom) / 2;
        leftPx = centerX - pageRect.left - wPx / 2;
        topPx = centerY - pageRect.top - hPx / 2;
      }

      leftPx = Math.min(Math.max(margin, leftPx), cw - wPx - margin);
      topPx = Math.min(Math.max(margin, topPx), ch - hPx - margin);

      return overlayPxToPdfRect(leftPx, topPx, wPx, hPx, ph, scale);
    },
    [pageHeights, pageLayouts, scale],
  );

  useEffect(() => {
    const initFields: TemplateField[] = (initialTemplate?.fields ?? []).map((f) => ({
      id: f.id,
      type: f.type as TemplateFieldType,
      page_index: f.page_index,
      rect: { ...f.rect },
      field_name: f.field_name,
      required: !!f.required,
      assignee: (f.assignee === 'user' ? 'user' : 'employee') as 'employee' | 'user',
      employee_info_key: f.employee_info_key,
    }));

    initialSnapshotRef.current = JSON.stringify(normalizeFieldsForCompare(initFields));
    setFields(initFields);
    setSelectedId(null);
  }, [initialTemplate]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadErr(null);
      try {
        const t = getToken();
        const r = await fetch(`/onboarding/base-documents/${docId}/preview`, {
          headers: { Authorization: 'Bearer ' + (t || '') },
        });
        if (!r.ok) throw new Error('Could not load PDF');
        const buf = await r.arrayBuffer();
        const task = pdfjsLib.getDocument({ data: buf });
        const doc = await task.promise;
        if (cancelled) return;
        setPdf(doc);
        setNumPages(doc.numPages);
        const heights: number[] = [];
        for (let i = 1; i <= doc.numPages; i++) {
          const p = await doc.getPage(i);
          const vp = p.getViewport({ scale: 1 });
          heights.push(vp.height);
        }
        if (cancelled) return;
        setPageHeights(heights);
        setPageLayouts([]);
      } catch (e: unknown) {
        if (!cancelled) setLoadErr(e instanceof Error ? e.message : 'Load failed');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [docId]);

  useEffect(() => {
    const root = scrollContainerRef.current;
    if (!root || !pdf) return;
    const run = () => {
      if (!pageWrapRefs.current.some(Boolean)) return;
      updateVisiblePage();
    };
    run();
    const t = window.setTimeout(run, 150);
    root.addEventListener('scroll', updateVisiblePage, { passive: true });
    const ro = new ResizeObserver(run);
    ro.observe(root);
    return () => {
      window.clearTimeout(t);
      root.removeEventListener('scroll', updateVisiblePage);
      ro.disconnect();
    };
  }, [pdf, numPages, scale, updateVisiblePage]);

  const goPage = (d: number) => {
    setPageUi((p) => {
      const next = Math.max(1, Math.min(numPages, p + d));
      requestAnimationFrame(() => {
        pageWrapRefs.current[next - 1]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
      return next;
    });
  };

  const addField = (t: TemplateFieldType) => {
    if (numPages < 1) return;
    const pi = getVisiblePageIndexFromDom();
    setPageUi(pi + 1);
    const rect = computeInitialRectForAdd(t, pi);
    const newF = newField(t, pi, rect);
    setFields((prev) => [...prev, newF]);
    setSelectedId(newF.id);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        document
          .querySelector(`[data-sig-tpl-field="${newF.id}"]`)
          ?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
      });
    });
  };

  const onPointerMove = useCallback(
    (e: MouseEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const ph = pageHeights[d.pageIndex] || 792;
      const dx = e.clientX - d.startX;
      const dy = e.clientY - d.startY;
      const r = d.orig;
      setFields((prev) =>
        prev.map((f) => {
          if (f.id !== d.id) return f;
          if (d.mode === 'move') {
            const left = r.x * scale + dx;
            const top = (ph - r.y - r.height) * scale + dy;
            const nr = overlayPxToPdfRect(left, top, r.width * scale, r.height * scale, ph, scale);
            return { ...f, rect: nr };
          }
          const left = r.x * scale;
          const top = (ph - r.y - r.height) * scale;
          const nw = Math.max(24, r.width * scale + dx);
          const nh = Math.max(16, r.height * scale + dy);
          const nr = overlayPxToPdfRect(left, top, nw, nh, ph, scale);
          return { ...f, rect: nr };
        }),
      );
    },
    [pageHeights, scale],
  );

  const onPointerUp = useCallback(() => {
    dragRef.current = null;
    window.removeEventListener('mousemove', onPointerMove);
    window.removeEventListener('mouseup', onPointerUp);
  }, [onPointerMove]);

  const startDrag = (id: string, mode: 'move' | 'resize', e: React.MouseEvent) => {
    e.stopPropagation();
    const f = fields.find((x) => x.id === id);
    if (!f) return;
    dragRef.current = {
      id,
      mode,
      startX: e.clientX,
      startY: e.clientY,
      orig: { ...f.rect },
      pageIndex: f.page_index,
    };
    window.addEventListener('mousemove', onPointerMove);
    window.addEventListener('mouseup', onPointerUp);
  };

  const save = async () => {
    setSaving(true);
    try {
      const payload = {
        signature_template: {
          version: initialTemplate?.version || 1,
          fields: fields.map((f) => ({
            id: f.id,
            type: f.type,
            page_index: f.page_index,
            rect: f.rect,
            field_name: getFieldDisplayName(f),
            required: f.required,
            assignee: f.assignee,
            ...(f.type === 'employee_info' && f.employee_info_key ? { employee_info_key: f.employee_info_key } : {}),
          })),
        },
      };
      await api('PUT', `/onboarding/base-documents/${docId}`, payload);
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const tryClose = async () => {
    if (saving || loading) return;
    const hasUnsavedChanges = currentSnapshot !== initialSnapshotRef.current;
    if (!hasUnsavedChanges) {
      onClose();
      return;
    }

    const result = await confirm({
      title: 'Discard changes?',
      message: 'You have unsaved changes. Close without saving?',
      confirmText: 'Discard',
      cancelText: 'Keep editing',
    });
    if (result === 'confirm') onClose();
  };

  const selected = fields.find((f) => f.id === selectedId);

  /** Border + fill: stronger colours when selected (no ring). */
  const fieldOverlayClasses = (t: TemplateFieldType, selected: boolean) => {
    if (selected) {
      switch (t) {
        case 'signature':
        case 'initials':
          return 'border-emerald-700 bg-emerald-500/40';
        case 'date':
          return 'border-teal-800 bg-teal-600/35';
        case 'value':
          return 'border-slate-700 bg-slate-500/30';
        default:
          return 'border-lime-800 bg-lime-600/35';
      }
    }
    switch (t) {
      case 'signature':
      case 'initials':
        return 'border-emerald-500/90 bg-emerald-500/15';
      case 'date':
        return 'border-teal-600/90 bg-teal-600/15';
      case 'value':
        return 'border-slate-500/85 bg-slate-400/15';
      default:
        return 'border-lime-600/80 bg-lime-500/10';
    }
  };

  return (
    <AppFormModal
      open
      onClose={() => void tryClose()}
      title="Edit Signature Template"
      description={
        <>
          <span className="block truncate" title={docName}>
            {docName}
          </span>
          <span className="block">Define signature fields and placement on the PDF.</span>
        </>
      }
      layout="detail"
      size="lg"
      dialogClassName={SIG_TEMPLATE_DIALOG_COLLAPSED}
      dialogClassNameExpanded={SIG_TEMPLATE_DIALOG_EXPANDED}
      quickInfo={onboardingSignatureTemplateQuickInfo}
      scrollBody={false}
      bodyClassName="!p-4 flex min-h-0 flex-1 flex-col overflow-hidden"
      footer={
        <div className={uiCx(uiLayout.actionsRow, 'w-full justify-end')}>
          <AppButton type="button" variant="secondary" size="sm" onClick={() => void tryClose()}>
            Cancel
          </AppButton>
          <AppButton
            type="button"
            size="sm"
            loading={saving}
            disabled={saving || loading || !!loadErr}
            onClick={() => void save()}
          >
            Save template
          </AppButton>
        </div>
      }
    >
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden md:flex-row">
        <div className="flex min-h-[min(40vh,320px)] min-w-0 flex-1 flex-col md:min-h-0">
          <div
            ref={scrollContainerRef}
            className={uiCx(
              'min-h-0 flex-1 overflow-y-auto bg-white p-2 sm:p-3',
              uiRadius.card,
              uiBorders.subtle,
            )}
          >
            {loading ? (
              <div className={uiCx(uiTypography.body, uiSpacing.cardPadding)}>Loading PDF…</div>
            ) : null}
            {loadErr ? (
              <div className={uiCx('bg-red-50 p-4 text-red-700', uiRadius.control, uiTypography.body)}>{loadErr}</div>
            ) : null}
            {!loading && !loadErr && pdf ? (
              <div className="mx-auto max-w-full space-y-6">
                <div className={uiCx('flex flex-wrap items-center gap-2 px-3 py-2', uiRadius.control, uiBorders.subtle, 'bg-white')}>
                  <span className={uiTypography.controlLabel}>Zoom</span>
                  <AppButton
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="min-w-8 px-2"
                    onClick={() => setScale((s) => Math.max(0.6, s - 0.1))}
                  >
                    −
                  </AppButton>
                  <span className={uiCx('tabular-nums', uiTypography.body)}>{Math.round(scale * 100)}%</span>
                  <AppButton
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="min-w-8 px-2"
                    onClick={() => setScale((s) => Math.min(2.5, s + 0.1))}
                  >
                    +
                  </AppButton>
                  <span className="mx-2 text-gray-300">|</span>
                  <span className={uiTypography.body}>Page</span>
                  <AppButton
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="min-w-8 px-2"
                    disabled={pageUi <= 1}
                    onClick={() => goPage(-1)}
                  >
                    ‹
                  </AppButton>
                  <span className={uiCx('tabular-nums', uiTypography.body)}>
                    {pageUi} / {numPages}
                  </span>
                  <AppButton
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="min-w-8 px-2"
                    disabled={pageUi >= numPages}
                    onClick={() => goPage(1)}
                  >
                    ›
                  </AppButton>
                </div>

                {Array.from({ length: numPages }, (_, pi) => {
                  const ph = pageLayouts[pi]?.heightPt || pageHeights[pi] || 792;
                  const cw = pageLayouts[pi]?.canvasW || 0;
                  const ch = pageLayouts[pi]?.canvasH || 0;
                  const pageFields = fields.filter((f) => f.page_index === pi);
                  return (
                    <div
                      key={pi}
                      ref={(el) => {
                        pageWrapRefs.current[pi] = el;
                      }}
                      className="relative mx-auto scroll-mt-4 bg-white shadow-md"
                      style={cw ? { width: cw } : undefined}
                      onClick={() => setSelectedId(null)}
                    >
                      <PdfPageCanvas pdf={pdf} pageIndex={pi} scale={scale} onLayout={layoutUpdater(pi)} />
                      <div
                        className="pointer-events-none absolute left-0 top-0"
                        style={cw && ch ? { width: cw, height: ch } : undefined}
                      >
                        {pageFields.map((f) => {
                          const st = pdfRectToOverlayStyle(f.rect, ph, scale);
                          const sel = f.id === selectedId;
                          return (
                            <div
                              key={f.id}
                              data-sig-tpl-field={f.id}
                              className={`pointer-events-auto absolute cursor-move border-2 transition-colors ${fieldOverlayClasses(
                                f.type,
                                sel,
                              )}`}
                              style={{ left: st.left, top: st.top, width: st.width, height: st.height }}
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedId(f.id);
                              }}
                              onMouseDown={(e) => startDrag(f.id, 'move', e)}
                            >
                              <span className="pointer-events-none absolute left-0.5 top-0.5 max-w-[calc(100%-4px)] truncate text-[9px] font-semibold text-gray-800">
                                {getFieldDisplayName(f)}
                                {f.required ? <span className="text-red-600"> *</span> : null}
                              </span>
                              <div
                                className="absolute bottom-0 right-0 h-3 w-3 cursor-nwse-resize bg-gray-700/75"
                                onMouseDown={(e) => {
                                  e.stopPropagation();
                                  startDrag(f.id, 'resize', e);
                                }}
                              />
                            </div>
                          );
                        })}
                      </div>
                      <div className={uiCx('absolute -bottom-5 left-0', uiTypography.helper)}>Page {pi + 1}</div>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>
        </div>

        <aside className="flex w-full min-h-[min(36vh,280px)] shrink-0 flex-col md:w-80 md:min-h-0">
          <AppCard className="flex min-h-0 flex-1 flex-col overflow-hidden" bodyClassName={uiCx(uiSpacing.cardPadding, 'flex min-h-0 flex-1 flex-col overflow-y-auto')}>
            <AppSectionHeader
              title="Signature setup"
              description="Add a field type to place it on the page you are viewing."
            />
            <div className={uiCx('mt-4', uiSpacing.sectionStack)}>
              {FIELD_TYPES.map(({ type, label }) => (
                <AppButton
                  key={type}
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="w-full justify-start"
                  disabled={!pdf || loading}
                  leftIcon={<Plus className="h-3.5 w-3.5" />}
                  onClick={() => addField(type)}
                >
                  {label}
                </AppButton>
              ))}
            </div>

            {selected ? (
              <AppCard className="mt-6" bodyClassName={uiSpacing.cardPadding}>
                <AppSectionHeader title="Field properties" />
                <div className={uiCx('mt-4', uiSpacing.sectionStack)}>
                  <AppSelect
                    label="Who completes"
                    value={selected.assignee}
                    options={ASSIGNEE_OPTIONS}
                    onChange={(e) =>
                      setFields((fs) =>
                        fs.map((x) =>
                          x.id === selected.id ? { ...x, assignee: e.target.value as 'employee' | 'user' } : x,
                        ),
                      )
                    }
                    fieldHint="Who completes\n\nEmployee = the new hire fills this field. User = a specific signer assigned to the document."
                  />
                  {selected.type === 'employee_info' ? (
                    <AppSelect
                      label="Info"
                      value={selected.employee_info_key || 'full_name'}
                      options={EMPLOYEE_INFO_OPTIONS}
                      onChange={(e) =>
                        setFields((fs) =>
                          fs.map((x) => (x.id === selected.id ? { ...x, employee_info_key: e.target.value } : x)),
                        )
                      }
                      fieldHint="Info\n\nWhich employee profile value is printed in this field when the document is generated."
                    />
                  ) : null}
                  {selected.type === 'value' ? (
                    <p className={uiTypography.helper}>
                      The signer will enter a <span className="font-medium">Canadian dollar (CAD)</span> amount when
                      signing. Placement and label are defined here only.
                    </p>
                  ) : null}
                  <AppCheckbox
                    label="Required"
                    checked={selected.required}
                    onChange={(checked) =>
                      setFields((fs) => fs.map((x) => (x.id === selected.id ? { ...x, required: checked } : x)))
                    }
                    fieldHint="Required\n\nWhen checked, the signer must complete this field before the document can be submitted."
                  />
                  <AppButton
                    type="button"
                    variant="danger"
                    size="sm"
                    className="w-full"
                    onClick={() => {
                      setFields((fs) => fs.filter((x) => x.id !== selected.id));
                      setSelectedId(null);
                    }}
                  >
                    Remove field
                  </AppButton>
                </div>
              </AppCard>
            ) : null}
          </AppCard>
        </aside>
      </div>
    </AppFormModal>
  );
}
