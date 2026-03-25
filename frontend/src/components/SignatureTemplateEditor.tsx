import { useCallback, useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { api, getToken } from '@/lib/api';
import { overlayPxToPdfRect, pdfRectToOverlayStyle, type PdfRect } from '@/lib/pdfCoordinates';
import OverlayPortal from '@/components/OverlayPortal';

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

function newField(t: TemplateFieldType, pageIndex: number): TemplateField {
  const w =
    t === 'signature' || t === 'initials' ? 150 : t === 'paragraph' ? 200 : t === 'checkbox' ? 24 : 140;
  const h =
    t === 'signature' || t === 'initials' ? 48 : t === 'paragraph' ? 96 : t === 'checkbox' ? 24 : 28;
  const base: TemplateField = {
    id: crypto.randomUUID(),
    type: t,
    page_index: pageIndex,
    rect: { x: 72, y: 120, width: w, height: h },
    field_name: defaultFieldLabel(t),
    required: t === 'signature' || t === 'date',
    assignee: 'employee',
  };
  if (t === 'employee_info') base.employee_info_key = 'full_name';
  return base;
}

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

  /** In-memory copy for Ctrl+C / Ctrl+V (same session). */
  const fieldClipboardRef = useRef<TemplateField | null>(null);
  const fieldsRef = useRef<TemplateField[]>(fields);
  fieldsRef.current = fields;
  const selectedIdRef = useRef<string | null>(selectedId);
  selectedIdRef.current = selectedId;
  const pageUiRef = useRef(pageUi);
  pageUiRef.current = pageUi;
  const numPagesRef = useRef(numPages);
  numPagesRef.current = numPages;

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
        const pi = Math.min(nPages, Math.max(1, pageUiRef.current)) - 1;
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
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  /** Which page is most visible in the scroll area (1-based) — drives toolbar + "add field" target page. */
  const updateVisiblePage = useCallback(() => {
    const root = scrollContainerRef.current;
    if (!root || numPages < 1) return;
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
    if (bestDist === Infinity) return;
    setPageUi(bestPi + 1);
  }, [numPages]);

  useEffect(() => {
    if (initialTemplate?.fields?.length) {
      setFields(
        initialTemplate.fields.map((f) => ({
          id: f.id,
          type: f.type as TemplateFieldType,
          page_index: f.page_index,
          rect: { ...f.rect },
          field_name: f.field_name,
          required: !!f.required,
          assignee: (f.assignee === 'user' ? 'user' : 'employee') as 'employee' | 'user',
          employee_info_key: f.employee_info_key,
        })),
      );
    }
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
    const pi = Math.min(numPages, Math.max(1, pageUi)) - 1;
    const newF = newField(t, pi);
    setFields((prev) => [...prev, newF]);
    setSelectedId(newF.id);
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

  const selected = fields.find((f) => f.id === selectedId);

  const borderForType = (t: TemplateFieldType) => {
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
    <OverlayPortal>
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center overflow-y-auto p-4"
      onClick={onClose}
    >
      <div
        className="w-[1400px] max-w-[95vw] max-h-[90vh] bg-gray-100 rounded-xl overflow-hidden flex flex-col border border-gray-200 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="rounded-t-xl border-b border-gray-200 bg-white p-4 flex-shrink-0">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded hover:bg-gray-100 transition-colors flex items-center justify-center flex-shrink-0"
                title="Close"
              >
                <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
              </button>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-gray-900">Edit Signature Template</div>
                <div className="text-xs text-gray-500 mt-0.5 truncate" title={docName}>
                  {docName}
                </div>
                <div className="text-xs text-gray-500 mt-0.5">Define signature fields and placement on the PDF.</div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-hidden p-4 flex flex-col">
          <div className="flex min-h-0 flex-1 flex-col md:flex-row gap-4 overflow-hidden">
            <div className="flex min-h-[min(40vh,320px)] flex-1 min-w-0 flex-col md:min-h-0">
              <div ref={scrollContainerRef} className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-sm p-2 sm:p-3">
            {loading && <div className="rounded-lg bg-white p-6 text-sm text-gray-600 shadow">Loading PDF…</div>}
            {loadErr && <div className="rounded-lg bg-red-50 p-4 text-sm text-red-700">{loadErr}</div>}
            {!loading && !loadErr && pdf && (
              <div className="mx-auto max-w-full space-y-6">
                <div className="flex flex-wrap items-center gap-2 rounded-lg bg-white px-3 py-2 text-xs shadow">
                  <span className="font-medium text-gray-600">Zoom</span>
                  <button
                    type="button"
                    className="rounded border border-gray-200 px-2 py-0.5 hover:bg-gray-50"
                    onClick={() => setScale((s) => Math.max(0.6, s - 0.1))}
                  >
                    −
                  </button>
                  <span className="tabular-nums">{Math.round(scale * 100)}%</span>
                  <button
                    type="button"
                    className="rounded border border-gray-200 px-2 py-0.5 hover:bg-gray-50"
                    onClick={() => setScale((s) => Math.min(2.5, s + 0.1))}
                  >
                    +
                  </button>
                  <span className="mx-2 text-gray-300">|</span>
                  <span className="text-gray-600">Page</span>
                  <button
                    type="button"
                    className="rounded border border-gray-200 px-2 py-0.5 hover:bg-gray-50 disabled:opacity-40"
                    disabled={pageUi <= 1}
                    onClick={() => goPage(-1)}
                  >
                    ‹
                  </button>
                  <span className="tabular-nums">
                    {pageUi} / {numPages}
                  </span>
                  <button
                    type="button"
                    className="rounded border border-gray-200 px-2 py-0.5 hover:bg-gray-50 disabled:opacity-40"
                    disabled={pageUi >= numPages}
                    onClick={() => goPage(1)}
                  >
                    ›
                  </button>
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
                              className={`pointer-events-auto absolute cursor-move border-2 ${borderForType(f.type)} ${
                                sel ? 'ring-2 ring-amber-500' : ''
                              }`}
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
                                className="absolute bottom-0 right-0 h-3 w-3 cursor-nwse-resize bg-amber-500/80"
                                onMouseDown={(e) => {
                                  e.stopPropagation();
                                  startDrag(f.id, 'resize', e);
                                }}
                              />
                            </div>
                          );
                        })}
                      </div>
                      <div className="absolute -bottom-5 left-0 text-[10px] text-gray-500">Page {pi + 1}</div>
                    </div>
                  );
                })}
              </div>
            )}
              </div>
            </div>

            <aside className="flex w-full min-h-[min(36vh,280px)] shrink-0 flex-col md:w-80 md:min-h-0">
              <div className="flex min-h-0 flex-1 flex-col overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-sm p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Signature setup</div>
            <p className="mt-1 text-[11px] leading-snug text-gray-600">
              New fields are placed on the page currently in view (scroll the PDF or use Page ‹ ›). Saved positions use PDF
              coordinates (bottom-left origin). With a field selected, use Ctrl+C / Ctrl+V (Cmd on Mac) to copy and paste a
              duplicate (offset slightly; paste lands on the page in view).
            </p>
            <div className="mt-4 space-y-1.5">
              {FIELD_TYPES.map(({ type, label }) => (
                <button
                  key={type}
                  type="button"
                  disabled={!pdf || loading}
                  onClick={() => addField(type)}
                  className="flex w-full items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-left text-xs font-medium text-gray-800 hover:bg-amber-50 disabled:opacity-40"
                >
                  <span className="text-gray-500">+</span> {label}
                </button>
              ))}
            </div>

            {selected && (
              <div className="mt-6 space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs">
                <div className="font-semibold text-gray-800">Field properties</div>
                <label className="block">
                  <span className="text-gray-600">Who completes</span>
                  <select
                    className="mt-1 w-full rounded border border-gray-200 px-2 py-1"
                    value={selected.assignee}
                    onChange={(e) =>
                      setFields((fs) =>
                        fs.map((x) => (x.id === selected.id ? { ...x, assignee: e.target.value as 'employee' | 'user' } : x)),
                      )
                    }
                  >
                    <option value="employee">Employee</option>
                    <option value="user">User</option>
                  </select>
                </label>
                {selected.type === 'employee_info' && (
                  <label className="block">
                    <span className="text-gray-600">Info</span>
                    <select
                      className="mt-1 w-full rounded border border-gray-200 px-2 py-1"
                      value={selected.employee_info_key || 'full_name'}
                      onChange={(e) =>
                        setFields((fs) =>
                          fs.map((x) => (x.id === selected.id ? { ...x, employee_info_key: e.target.value } : x)),
                        )
                      }
                    >
                      <option value="full_name">Full name</option>
                      <option value="first_name">First name</option>
                      <option value="last_name">Last name</option>
                      <option value="email">Email</option>
                      <option value="phone">Phone</option>
                      <option value="job_title">Job title</option>
                      <option value="hire_date">Hire date</option>
                      <option value="date_of_birth">Date of birth</option>
                      <option value="sin_number">SIN number</option>
                      <option value="address">Address</option>
                      <option value="city">City</option>
                      <option value="province">Province</option>
                      <option value="postal_code">Postal code</option>
                    </select>
                  </label>
                )}
                {selected.type === 'value' && (
                  <p className="text-gray-600 leading-snug">
                    The signer will enter a <span className="font-medium">Canadian dollar (CAD)</span> amount when
                    signing. Placement and label are defined here only.
                  </p>
                )}
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={selected.required}
                    onChange={(e) =>
                      setFields((fs) => fs.map((x) => (x.id === selected.id ? { ...x, required: e.target.checked } : x)))
                    }
                  />
                  Required
                </label>
                <button
                  type="button"
                  className="w-full rounded border border-red-200 bg-white py-1.5 text-red-700 hover:bg-red-50"
                  onClick={() => {
                    setFields((fs) => fs.filter((x) => x.id !== selected.id));
                    setSelectedId(null);
                  }}
                >
                  Remove field
                </button>
              </div>
            )}
              </div>
            </aside>
          </div>
        </div>

        <footer className="flex flex-shrink-0 items-center gap-3 border-t border-gray-200 bg-white px-4 py-3">
          <button
            type="button"
            disabled={saving || loading || !!loadErr}
            onClick={() => void save()}
            className="rounded-lg bg-amber-700 px-5 py-2 text-sm font-semibold text-white hover:bg-amber-800 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save template'}
          </button>
          <button type="button" onClick={onClose} className="text-sm text-gray-600 hover:text-gray-900">
            Cancel
          </button>
        </footer>
      </div>
    </div>
    </OverlayPortal>
  );
}
