import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import * as pdfjsLib from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import toast from 'react-hot-toast';
import { api, getToken } from '@/lib/api';
import { formatCurrencyAmount, parseCurrencyAmount } from '@/lib/currencyFormat';
import { pdfRectToOverlayStyle, type PdfRect } from '@/lib/pdfCoordinates';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

const LOGO_SRC = '/ui/assets/login/logo-light.svg';

/** Pencil cursor for freehand drawing (replaces default crosshair). */
const CURSOR_PENCIL =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='20' viewBox='0 0 20 20'%3E%3Cpath d='M2 18l4-4 10-10 2 2-10 10-4 4-2-2z' fill='none' stroke='%23222' stroke-width='1.5'/%3E%3C/svg%3E\") 2 18, crosshair";

type FieldDef = {
  id: string;
  type: string;
  page_index: number;
  rect: PdfRect;
  field_name: string;
  required: boolean;
  assignee: string;
  employee_info_key?: string;
};

type SigningContext = {
  uses_template: boolean;
  signature_template: { version: number; fields: FieldDef[] } | null;
  page_sizes: { width: number; height: number }[];
  document_name: string;
};

type DocRow = {
  id: string;
  document_name: string;
  subject_label?: string | null;
};

function SigCanvas({
  fieldId,
  onChange,
}: {
  fieldId: string;
  onChange: (dataUrl: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);

  const resize = useCallback(() => {
    const c = canvasRef.current;
    if (!c) return;
    const rect = c.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    c.width = Math.floor(rect.width * ratio);
    c.height = Math.floor(140 * ratio);
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, rect.width, 140);
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
  }, []);

  useEffect(() => {
    resize();
  }, [resize, fieldId]);

  const pos = (e: React.MouseEvent | React.TouchEvent) => {
    const c = canvasRef.current!;
    const r = c.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
    return { x: clientX - r.left, y: clientY - r.top };
  };

  const emit = () => {
    const c = canvasRef.current;
    if (!c) return;
    onChange(c.toDataURL('image/png'));
  };

  return (
    <canvas
      ref={canvasRef}
      className="w-full touch-none block border border-gray-200 rounded bg-transparent"
      style={{ height: 140, cursor: CURSOR_PENCIL }}
      onMouseDown={(e) => {
        drawing.current = true;
        last.current = pos(e);
      }}
      onMouseMove={(e) => {
        if (!drawing.current || !last.current) return;
        const ctx = canvasRef.current?.getContext('2d');
        if (!ctx) return;
        const p = pos(e);
        ctx.beginPath();
        ctx.moveTo(last.current.x, last.current.y);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
        last.current = p;
        emit();
      }}
      onMouseUp={() => {
        drawing.current = false;
        last.current = null;
        emit();
      }}
      onMouseLeave={() => {
        drawing.current = false;
        last.current = null;
      }}
    />
  );
}

/** Renders typed name in a script-style font to PNG for template signature fields. */
function TypedSignatureCanvas({
  fieldId,
  text,
  onDataUrl,
}: {
  fieldId: string;
  text: string;
  onDataUrl: (fieldId: string, url: string) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lastEmitted = useRef<string>('');

  useEffect(() => {
    lastEmitted.current = '';
  }, [fieldId]);

  const paint = useCallback(() => {
    const wrap = wrapRef.current;
    const c = canvasRef.current;
    if (!wrap || !c) return;
    const w = Math.max(260, wrap.clientWidth || 320);
    const h = 140;
    const ratio = window.devicePixelRatio || 1;
    c.width = Math.floor(w * ratio);
    c.height = Math.floor(h * ratio);
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const t = text.trim();
    if (!t) {
      if (lastEmitted.current !== '') {
        lastEmitted.current = '';
        onDataUrl(fieldId, '');
      }
      return;
    }
    let size = 42;
    const fontStack =
      '"Segoe Script", "Brush Script MT", "Lucida Handwriting", "Dancing Script", "Apple Chancery", cursive';
    ctx.font = `${size}px ${fontStack}`;
    while (ctx.measureText(t).width > w * 0.88 && size > 16) {
      size -= 2;
      ctx.font = `${size}px ${fontStack}`;
    }
    ctx.fillStyle = '#111827';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(t, w / 2, h / 2);
    const url = c.toDataURL('image/png');
    if (url !== lastEmitted.current) {
      lastEmitted.current = url;
      onDataUrl(fieldId, url);
    }
  }, [text, fieldId, onDataUrl]);

  useEffect(() => {
    paint();
  }, [paint]);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const ro = new ResizeObserver(() => paint());
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [paint]);

  return (
    <div ref={wrapRef} className="w-full">
      <canvas
        ref={canvasRef}
        className="w-full block border border-gray-200 rounded-lg bg-transparent"
        style={{ height: 140 }}
      />
    </div>
  );
}

/** Local calendar date YYYY-MM-DD (for template date fields stamped at sign click). */
function localDateYYYYMMDD(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function fieldHasValue(f: FieldDef, values: Record<string, string | boolean>): boolean {
  if (f.type === 'employee_info') {
    const v = values[f.id];
    return typeof v === 'string' && v.trim().length > 0;
  }
  if (f.type === 'value') {
    const raw = String(values[f.id] ?? '').trim();
    if (!raw) return !f.required;
    return parseCurrencyAmount(raw) !== null;
  }
  if (f.type === 'date') return true;
  const v = values[f.id];
  if (f.type === 'checkbox') {
    return v === true;
  }
  if (v === undefined || v === null) return false;
  if (typeof v === 'string') return v.trim().length > 0;
  return false;
}

type ProfileBundle = {
  user?: { email?: string | null };
  profile?: Record<string, unknown> | null;
};

function employeeInfoPreviewText(
  f: FieldDef,
  ep: Record<string, unknown> | null | undefined,
  emailFallback: string | null | undefined,
): string {
  const key = (f.employee_info_key || 'full_name').toLowerCase();
  if (key === 'email') {
    return String(emailFallback ?? '').trim();
  }
  if (!ep) return '';
  const s = (x: unknown) => String(x ?? '').trim();
  if (key === 'full_name') {
    const a = s(ep.first_name);
    const b = s(ep.last_name);
    return [a, b].filter(Boolean).join(' ');
  }
  if (key === 'first_name') return s(ep.first_name);
  if (key === 'last_name') return s(ep.last_name);
  if (key === 'preferred_name') return s(ep.preferred_name);
  if (key === 'phone') return s(ep.phone);
  if (key === 'mobile_phone') return s(ep.mobile_phone);
  if (key === 'job_title') return s(ep.job_title);
  if (key === 'division') return s(ep.division);
  if (key === 'hire_date') return s(ep.hire_date);
  if (key === 'date_of_birth') {
    const raw = s(ep.date_of_birth);
    return raw.length >= 10 ? raw.slice(0, 10) : raw;
  }
  if (key === 'address') return s(ep.address_line1);
  if (key === 'city') return s(ep.city);
  if (key === 'province') return s(ep.province);
  if (key === 'postal_code') return s(ep.postal_code);
  if (key === 'country') return s(ep.country);
  if (key === 'sin_number') return s(ep.sin_number);
  return '';
}

function renderTemplateFieldPreview(
  f: FieldDef,
  values: Record<string, string | boolean>,
  profileBundle: ProfileBundle | null | undefined,
  box: { width: number; height: number },
  fontSize: number,
): ReactNode {
  const ep = profileBundle?.profile ?? undefined;
  const email = profileBundle?.user?.email ?? undefined;

  if (f.type === 'employee_info') {
    const raw = values[f.id];
    const text =
      typeof raw === 'string' ? raw : employeeInfoPreviewText(f, ep, email);
    return (
      <span
        className="block w-full truncate text-center font-medium text-gray-900"
        title={text || 'Edit in the panel'}
      >
        {text.trim() ? (
          text
        ) : (
          <span className="font-normal italic text-gray-600">Tap to fill</span>
        )}
      </span>
    );
  }

  const v = values[f.id];

  if (f.type === 'checkbox') {
    if (v === true) {
      return <span className="text-[1.15em] font-bold leading-none text-green-800">✓</span>;
    }
    return null;
  }

  if (f.type === 'signature' || f.type === 'initials') {
    if (typeof v === 'string' && v.startsWith('data:image')) {
      return (
        <img src={v} alt="" className="max-h-full max-w-full object-contain" draggable={false} />
      );
    }
    return null;
  }

  if (f.type === 'paragraph') {
    const t = typeof v === 'string' ? v : '';
    if (!t.trim()) return null;
    const fs = Math.max(8, Math.min(12, fontSize * 0.92, box.height * 0.2));
    return (
      <span
        className="line-clamp-4 block max-h-full w-full overflow-hidden break-words text-left leading-snug text-gray-900"
        style={{ fontSize: fs }}
        title={t}
      >
        {t}
      </span>
    );
  }

  if (f.type === 'date') {
    const t = typeof v === 'string' ? v : '';
    if (t.trim()) {
      return (
        <span className="block w-full truncate text-center font-medium text-gray-900" title={t}>
          {t}
        </span>
      );
    }
    return (
      <span className="block w-full truncate text-center text-[0.7rem] italic text-gray-600" title="Filled when you sign">
        Date on sign
      </span>
    );
  }

  if (f.type === 'value') {
    const raw = typeof v === 'string' ? v : '';
    if (!raw.trim()) return null;
    const n = parseCurrencyAmount(raw);
    const label = n !== null ? formatCurrencyAmount(n) : raw;
    return (
      <span className="block w-full truncate text-center font-medium text-gray-900" title={label}>
        {label}
      </span>
    );
  }

  if (f.type === 'text') {
    const t = typeof v === 'string' ? v : '';
    if (!t.trim()) return null;
    return (
      <span className="block w-full truncate text-center font-medium text-gray-900" title={t}>
        {t}
      </span>
    );
  }

  return null;
}

/** Single-line typed fields: preview aligns to bottom of overlay (like a form line), not vertically centered. */
function fieldPreviewAlignsBottom(f: FieldDef): boolean {
  return (
    f.type === 'text' ||
    f.type === 'value' ||
    f.type === 'employee_info' ||
    f.type === 'date' ||
    f.type === 'paragraph'
  );
}

function renderFieldPlaceholder(
  f: FieldDef,
  box: { width: number; height: number },
  fontSize: number,
): ReactNode {
  const label =
    f.type === 'signature'
      ? (f.field_name || 'Sign here')
      : f.type === 'initials'
        ? (f.field_name || 'Initials')
        : f.field_name;
  if (!label.trim() && !f.required) return null;
  const fs = Math.max(8, Math.min(13, fontSize * 0.95, box.height * 0.22));
  const isPara = f.type === 'paragraph';
  return (
    <span
      className={`block w-full truncate italic leading-snug text-amber-800/75 ${
        isPara ? 'text-left line-clamp-3' : 'text-center'
      }`}
      style={{ fontSize: fs }}
      title={label + (f.required ? ' (obrigatório)' : ' (opcional)')}
    >
      {label || (f.required ? 'Campo obrigatório' : '')}
      {f.required && <span className="text-red-600 font-semibold not-italic" aria-hidden> *</span>}
    </span>
  );
}

function PdfPageView({
  pdf,
  pageIndex,
  scale,
}: {
  pdf: pdfjsLib.PDFDocumentProxy;
  pageIndex: number;
  scale: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const page = await pdf.getPage(pageIndex + 1);
      const viewport = page.getViewport({ scale });
      const canvas = ref.current;
      if (!canvas || cancelled) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await page.render({ canvasContext: ctx, viewport, canvas }).promise;
    })();
    return () => {
      cancelled = true;
    };
  }, [pdf, pageIndex, scale]);
  return <canvas ref={ref} className="block max-w-full border border-gray-100 bg-white" />;
}

type Props = {
  signItem: DocRow;
  onClose: () => void;
  onSigned: () => void;
};

export default function OnboardingSignModal({ signItem, onClose, onSigned }: Props) {
  const [scale] = useState(1.15);
  const [agree, setAgree] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [mode, setMode] = useState<'draw' | 'type'>('draw');
  const [typedName, setTypedName] = useState('');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);

  const { data: ctx, isLoading: ctxLoading } = useQuery({
    queryKey: ['onb-signing-ctx', signItem.id],
    queryFn: () =>
      api<SigningContext>('GET', `/auth/me/onboarding/documents/${signItem.id}/signing-context`),
  });

  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const t = getToken();
      const r = await fetch(`/auth/me/onboarding/documents/${signItem.id}/preview`, {
        headers: { Authorization: 'Bearer ' + (t || '') },
      });
      if (!r.ok || cancelled) return;
      const buf = await r.arrayBuffer();
      if (cancelled) return;
      const task = pdfjsLib.getDocument({ data: buf });
      const doc = await task.promise;
      if (!cancelled) setPdfDoc(doc);
    })();
    return () => {
      cancelled = true;
    };
  }, [signItem.id]);

  const [fieldValues, setFieldValues] = useState<Record<string, string | boolean>>({});
  /** Uncommitted text while editing currency fields (before blur formats). */
  const [currencyDraft, setCurrencyDraft] = useState<Record<string, string>>({});
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [templateSigMode, setTemplateSigMode] = useState<'draw' | 'type'>('draw');
  const [typedSigByFieldId, setTypedSigByFieldId] = useState<Record<string, string>>({});
  const [sigClearKeys, setSigClearKeys] = useState<Record<string, number>>({});

  const handleTypedTemplateSig = useCallback((fieldId: string, url: string) => {
    setFieldValues((v) => ({ ...v, [fieldId]: url }));
  }, []);

  const usesTemplate = Boolean(ctx?.uses_template && ctx.signature_template?.fields?.length);

  const { data: profileForPreview } = useQuery({
    queryKey: ['onb-sign-profile-preview', signItem.id],
    queryFn: () => api<ProfileBundle>('GET', '/auth/me/profile'),
    enabled: Boolean(!ctxLoading && usesTemplate && pdfDoc),
  });

  useEffect(() => {
    setSelectedFieldId(null);
    setTemplateSigMode('draw');
    setTypedSigByFieldId({});
    setSigClearKeys({});
    setFieldValues({});
    setCurrencyDraft({});
  }, [signItem.id]);

  useEffect(() => {
    if (!profileForPreview || !usesTemplate) return;
    const flds = ctx?.signature_template?.fields ?? [];
    const ep = profileForPreview.profile ?? undefined;
    const email = profileForPreview.user?.email ?? undefined;
    setFieldValues((prev) => {
      const next = { ...prev };
      for (const f of flds) {
        if (f.type !== 'employee_info') continue;
        if (next[f.id] !== undefined) continue;
        next[f.id] = employeeInfoPreviewText(f, ep, email);
      }
      return next;
    });
  }, [profileForPreview, usesTemplate, ctx?.signature_template?.fields]);

  useEffect(() => {
    setTemplateSigMode('draw');
  }, [selectedFieldId]);

  const resizeCanvas = useCallback(() => {
    const c = canvasRef.current;
    if (!c) return;
    const rect = c.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    c.width = Math.floor(rect.width * ratio);
    c.height = Math.floor(180 * ratio);
    const ctx2 = c.getContext('2d');
    if (!ctx2) return;
    ctx2.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx2.clearRect(0, 0, rect.width, 180);
    ctx2.strokeStyle = '#111';
    ctx2.lineWidth = 2;
    ctx2.lineCap = 'round';
  }, []);

  useEffect(() => {
    if (usesTemplate) return;
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    return () => window.removeEventListener('resize', resizeCanvas);
  }, [resizeCanvas, usesTemplate, signItem]);

  useEffect(() => {
    if (mode !== 'type' || !canvasRef.current || usesTemplate) return;
    const c = canvasRef.current;
    const ctx2 = c.getContext('2d');
    if (!ctx2) return;
    const w = c.width / (window.devicePixelRatio || 1);
    const h = 180;
    ctx2.clearRect(0, 0, w, h);
    const text = typedName.trim();
    if (!text) return;
    let size = 48;
    ctx2.font = `${size}px "Segoe UI", cursive`;
    while (ctx2.measureText(text).width > w * 0.85 && size > 16) {
      size -= 2;
      ctx2.font = `${size}px "Segoe UI", cursive`;
    }
    ctx2.fillStyle = '#111';
    ctx2.textAlign = 'center';
    ctx2.textBaseline = 'middle';
    ctx2.fillText(text, w / 2, h / 2);
  }, [mode, typedName, usesTemplate, signItem]);

  const pos = (e: React.MouseEvent | React.TouchEvent) => {
    const c = canvasRef.current!;
    const r = c.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
    return { x: clientX - r.left, y: clientY - r.top };
  };

  const onDown = (e: React.MouseEvent | React.TouchEvent) => {
    if (mode !== 'draw') return;
    drawing.current = true;
    last.current = pos(e);
  };
  const onMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (!drawing.current || mode !== 'draw') return;
    const ctx2 = canvasRef.current?.getContext('2d');
    if (!ctx2 || !last.current) return;
    const p = pos(e);
    ctx2.beginPath();
    ctx2.moveTo(last.current.x, last.current.y);
    ctx2.lineTo(p.x, p.y);
    ctx2.stroke();
    last.current = p;
  };
  const onUp = () => {
    drawing.current = false;
    last.current = null;
  };

  const clearSig = () => {
    resizeCanvas();
    setTypedName('');
  };

  const getLegacySignatureDataUrl = () => {
    const c = canvasRef.current;
    if (!c) return '';
    const ctx2 = c.getContext('2d');
    if (!ctx2) return '';
    const d = ctx2.getImageData(0, 0, c.width, c.height).data;
    let ink = false;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i] < 250 || d[i + 1] < 250 || d[i + 2] < 250) {
        ink = true;
        break;
      }
    }
    if (!ink && mode === 'type' && !typedName.trim()) return '';
    if (!ink && mode === 'draw') return '';
    return c.toDataURL('image/png');
  };

  const doSign = async () => {
    if (!agree) {
      toast.error('Check "I have read and agree"');
      return;
    }
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append('assignment_item_id', signItem.id);
      fd.append('agreement', 'true');
      if (usesTemplate && ctx?.signature_template) {
        const tmplFields = ctx.signature_template.fields;
        const mergedForCheck = { ...fieldValues } as Record<string, string | boolean>;
        for (const f of tmplFields) {
          if (f.type === 'value' && currencyDraft[f.id] !== undefined) {
            mergedForCheck[f.id] = currencyDraft[f.id] as string;
          }
        }
        const missing = tmplFields.filter(
          (f) => f.required && !fieldHasValue(f, mergedForCheck),
        );
        if (missing.length > 0) {
          toast.error('Click each highlighted area on the document and complete all required fields');
          setSubmitting(false);
          return;
        }
        const signLocalDate = localDateYYYYMMDD();
        const fv: Record<string, unknown> = { ...fieldValues };
        for (const f of tmplFields) {
          if (f.type === 'date') {
            fv[f.id] = signLocalDate;
          }
          if (f.type === 'value') {
            const raw =
              currencyDraft[f.id] !== undefined ? currencyDraft[f.id]! : String(fv[f.id] ?? '');
            const n = parseCurrencyAmount(raw);
            if (n !== null) fv[f.id] = formatCurrencyAmount(n);
            else fv[f.id] = raw.trim();
          }
        }
        fd.append('field_values_json', JSON.stringify(fv));
        fd.append('signature_base64', '');
      } else {
        const dataUrl = getLegacySignatureDataUrl();
        if (!dataUrl) {
          toast.error('Add your signature');
          setSubmitting(false);
          return;
        }
        fd.append('signature_base64', dataUrl);
        fd.append('field_values_json', '{}');
      }
      const r = await fetch('/auth/me/onboarding/sign', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + (getToken() || '') },
        body: fd,
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error((err as { detail?: string }).detail || r.statusText);
      }
      onSigned();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Sign failed');
    } finally {
      setSubmitting(false);
    }
  };

  const fields = ctx?.signature_template?.fields ?? [];
  const pageSizes = ctx?.page_sizes ?? [];
  const selectedField = selectedFieldId ? fields.find((x) => x.id === selectedFieldId) : undefined;

  const fieldValuesWithCurrencyDraft = useMemo(() => {
    const m = { ...fieldValues } as Record<string, string | boolean>;
    for (const [k, v] of Object.entries(currencyDraft)) {
      m[k] = v;
    }
    return m;
  }, [fieldValues, currencyDraft]);

  const switchTemplateSigMode = (m: 'draw' | 'type') => {
    if (!selectedField || (selectedField.type !== 'signature' && selectedField.type !== 'initials')) return;
    if (m === templateSigMode) return;
    setFieldValues((v) => {
      const n = { ...v };
      delete n[selectedField.id];
      return n;
    });
    setTypedSigByFieldId((s) => {
      const n = { ...s };
      delete n[selectedField.id];
      return n;
    });
    setTemplateSigMode(m);
  };

  const inputCls =
    'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50/50 text-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-300 focus:border-gray-300 focus:bg-white transition-colors';

  const templateSplitLayout = !ctxLoading && usesTemplate && pdfDoc;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80"
      onClick={() => !submitting && onClose()}
    >
      <div
        className="bg-white rounded-lg border border-gray-200 shadow-xl w-[min(96vw,1440px)] max-w-[1440px] max-h-[95vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex-shrink-0 px-4 py-3 sm:px-5 sm:py-4 border-b border-gray-200 bg-white flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <img src={LOGO_SRC} alt="" className="h-10 w-auto max-w-[140px] object-contain object-left shrink-0" />
            <div className="hidden sm:block h-9 w-px bg-gray-200 shrink-0" aria-hidden />
            <div className="min-w-0">
              <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">MK Hub · HR</p>
              <h2 className="text-base font-bold text-gray-900 truncate">Sign document</h2>
              <p className="text-xs text-gray-500 truncate mt-0.5">{signItem.document_name}</p>
            </div>
          </div>
          <button
            type="button"
            disabled={submitting}
            onClick={onClose}
            className="text-xl font-bold text-gray-400 hover:text-gray-700 w-8 h-8 shrink-0 rounded-lg hover:bg-gray-100 disabled:opacity-50"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div
          className={`flex-1 min-h-0 px-4 py-4 sm:px-5 sm:py-5 bg-gray-50 ${
            templateSplitLayout ? 'flex flex-col overflow-hidden' : 'overflow-y-auto'
          }`}
        >
          {signItem.subject_label && (
            <p className="text-[11px] text-gray-600 mb-4 leading-snug rounded-lg border border-gray-200 bg-white px-3 py-2.5 shadow-sm shrink-0">
              This document was sent to you in connection with the onboarding of{' '}
              <span className="font-semibold text-gray-800">{signItem.subject_label}</span>.
            </p>
          )}

          {ctxLoading && (
            <div className="flex flex-col items-center justify-center py-16 text-sm text-gray-500">
              <img src={LOGO_SRC} alt="" className="h-10 w-auto opacity-30 mb-3 object-contain" />
              Loading signing options…
            </div>
          )}

          {!ctxLoading && usesTemplate && pdfDoc && (
            <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
              <p className="shrink-0 text-xs text-gray-700 rounded-lg border border-amber-200/90 bg-amber-50/90 px-3 py-2.5">
                <span className="font-semibold text-amber-950">Tip:</span> click each highlighted area on the PDF to fill or
                sign it in the panel on the right (checkboxes toggle directly on the document). Required fields are marked
                with *.
              </p>

              <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden lg:flex-row">
                <div className="flex min-h-[min(40vh,320px)] flex-1 min-w-0 flex-col lg:min-h-0">
                  <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-sm p-2 sm:p-3">
                    {Array.from({ length: pdfDoc.numPages }, (_, pi) => {
                      const ph = pageSizes[pi]?.height ?? 792;
                      const fieldsHere = fields.filter((f) => f.page_index === pi);
                      return (
                        <div key={pi} className="relative mb-4 w-max mx-auto last:mb-0">
                          <PdfPageView pdf={pdfDoc} pageIndex={pi} scale={scale} />
                          <div className="absolute inset-0 pointer-events-none">
                            {fieldsHere.map((f) => {
                              const st = pdfRectToOverlayStyle(f.rect, ph, scale);
                              const filled = fieldHasValue(f, fieldValuesWithCurrencyDraft);
                              const sel = selectedFieldId === f.id;
                              const fontSize = Math.max(8, Math.min(14, st.height * 0.38));
                              const content = filled
                                ? renderTemplateFieldPreview(
                                    f,
                                    fieldValuesWithCurrencyDraft,
                                    profileForPreview,
                                    st,
                                    fontSize,
                                  )
                                : renderFieldPlaceholder(f, st, fontSize);
                              const isPara = f.type === 'paragraph';
                              const isSig = f.type === 'signature' || f.type === 'initials';
                              const isCb = f.type === 'checkbox';
                              const bottomText = fieldPreviewAlignsBottom(f);
                              const checked = Boolean(fieldValues[f.id]);
                              return (
                                <button
                                  key={f.id}
                                  type="button"
                                  role={isCb ? 'checkbox' : undefined}
                                  aria-checked={isCb ? checked : undefined}
                                  className={`pointer-events-auto absolute overflow-hidden rounded-sm transition-all ${
                                    !isCb && sel
                                      ? 'z-10 border-2 border-brand-red bg-brand-red/15 shadow-md ring-2 ring-brand-red'
                                      : filled
                                        ? 'border-2 border-green-600/70 bg-green-50/85 ring-1 ring-green-600/60'
                                        : 'border-2 border-amber-500/85 bg-amber-400/15 hover:bg-amber-400/30'
                                  } ${filled ? 'hover:bg-black/[0.04]' : 'hover:bg-amber-400/25'}`}
                                  style={{ left: st.left, top: st.top, width: st.width, height: st.height }}
                                  title={f.field_name}
                                  aria-label={
                                    isCb
                                      ? `${f.field_name}${f.required ? ' (required)' : ''}, ${checked ? 'checked' : 'unchecked'}`
                                      : `Field: ${f.field_name}${f.required ? ' (required)' : ''}`
                                  }
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (isCb) {
                                      setFieldValues((v) => ({ ...v, [f.id]: !Boolean(v[f.id]) }));
                                      return;
                                    }
                                    setSelectedFieldId(f.id);
                                  }}
                                >
                                  {content != null && (
                                    <div
                                      className={`pointer-events-none absolute inset-0 flex select-none px-0.5 pt-0.5 pb-0 ${
                                        filled ? 'text-gray-900' : 'text-amber-800/70'
                                      } ${
                                        isSig
                                          ? 'items-center justify-center pb-0.5'
                                          : isCb
                                            ? 'items-center justify-center pb-0.5'
                                            : isPara
                                              ? 'items-end justify-start overflow-hidden'
                                              : bottomText
                                                ? 'items-end justify-center'
                                                : 'items-center justify-center pb-0.5'
                                      }`}
                                      style={{ fontSize }}
                                      aria-hidden
                                    >
                                      {content}
                                    </div>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <aside className="flex w-full min-h-[min(36vh,280px)] shrink-0 flex-col lg:w-[min(100%,440px)] xl:w-[460px] lg:min-h-0">
                  <div className="flex min-h-0 flex-1 flex-col overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-sm">
                  {!selectedField && (
                    <div className="flex flex-1 items-center justify-center px-4 py-10 text-center">
                      <p className="text-xs text-gray-500 leading-relaxed">
                        Select a highlighted area on the document to fill or sign it here.
                      </p>
                    </div>
                  )}

                  {selectedField && (
                    <div className="p-4 sm:p-5 text-sm">
                  <div className="flex justify-between items-start gap-3 mb-3">
                    <div className="min-w-0">
                      <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Selected field</div>
                      <div className="font-semibold text-gray-900 mt-0.5 break-words">
                        {selectedField.field_name}
                        {selectedField.required ? <span className="text-red-600"> *</span> : null}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="text-xs font-medium text-gray-600 hover:text-gray-900 px-2.5 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 shrink-0"
                      onClick={() => setSelectedFieldId(null)}
                    >
                      Done
                    </button>
                  </div>

                  {selectedField.type === 'employee_info' && (
                    <div className="space-y-2 mt-1">
                      <input
                        className={inputCls}
                        type={['hire_date', 'date_of_birth'].includes(
                          (selectedField.employee_info_key || 'full_name').toLowerCase(),
                        )
                          ? 'date'
                          : 'text'}
                        value={String(fieldValues[selectedField.id] ?? '')}
                        onChange={(e) =>
                          setFieldValues((v) => ({ ...v, [selectedField.id]: e.target.value }))
                        }
                      />
                      <p className="text-xs text-gray-500 leading-relaxed">
                        Pre-filled from your profile; you can edit this before signing.
                      </p>
                    </div>
                  )}

                  {selectedField.type === 'text' && (
                    <input
                      className={inputCls}
                      type="text"
                      value={String(fieldValues[selectedField.id] ?? '')}
                      onChange={(e) => setFieldValues((v) => ({ ...v, [selectedField.id]: e.target.value }))}
                    />
                  )}

                  {selectedField.type === 'date' && (
                    <p className="text-xs text-gray-600 leading-relaxed rounded-lg border border-gray-100 bg-gray-50 px-3 py-2.5">
                      This field is filled automatically with{' '}
                      <span className="font-medium text-gray-800">today&apos;s date</span> in your time zone when you
                      click <span className="font-medium">Sign document</span>. It cannot be edited.
                    </p>
                  )}

                  {selectedField.type === 'value' && (
                    <div className="space-y-2 mt-1">
                      <input
                        type="text"
                        inputMode="decimal"
                        autoComplete="off"
                        className={inputCls}
                        placeholder="$0.00"
                        value={
                          currencyDraft[selectedField.id] !== undefined
                            ? currencyDraft[selectedField.id]!
                            : String(fieldValues[selectedField.id] ?? '')
                        }
                        onChange={(e) =>
                          setCurrencyDraft((d) => ({ ...d, [selectedField.id]: e.target.value }))
                        }
                        onBlur={() => {
                          const id = selectedField.id;
                          const raw =
                            currencyDraft[id] !== undefined
                              ? currencyDraft[id]!
                              : String(fieldValues[id] ?? '');
                          setCurrencyDraft((d) => {
                            const n = { ...d };
                            delete n[id];
                            return n;
                          });
                          const n = parseCurrencyAmount(raw);
                          setFieldValues((v) => ({
                            ...v,
                            [id]: n !== null ? formatCurrencyAmount(n) : raw.trim(),
                          }));
                        }}
                      />
                      <p className="text-xs text-gray-500 leading-relaxed">
                        Enter an amount in Canadian dollars (CAD). Formatting is applied when you leave the field.
                      </p>
                    </div>
                  )}

                  {selectedField.type === 'paragraph' && (
                    <textarea
                      className={`${inputCls} min-h-[88px]`}
                      value={String(fieldValues[selectedField.id] ?? '')}
                      onChange={(e) => setFieldValues((v) => ({ ...v, [selectedField.id]: e.target.value }))}
                    />
                  )}

                  {(selectedField.type === 'signature' || selectedField.type === 'initials') && (
                    <div className="space-y-3 mt-1">
                      <div className="flex gap-1 border-b border-gray-200 pb-3">
                        <button
                          type="button"
                          className={`px-3 py-2 text-xs font-medium transition-colors border-b-2 -mb-[13px] ${
                            templateSigMode === 'draw'
                              ? 'border-brand-red text-brand-red'
                              : 'border-transparent text-gray-600 hover:text-gray-900'
                          }`}
                          onClick={() => switchTemplateSigMode('draw')}
                        >
                          Draw
                        </button>
                        <button
                          type="button"
                          className={`px-3 py-2 text-xs font-medium transition-colors border-b-2 -mb-[13px] ${
                            templateSigMode === 'type'
                              ? 'border-brand-red text-brand-red'
                              : 'border-transparent text-gray-600 hover:text-gray-900'
                          }`}
                          onClick={() => switchTemplateSigMode('type')}
                        >
                          Type signature
                        </button>
                      </div>
                      {templateSigMode === 'type' && (
                        <input
                          type="text"
                          className={inputCls}
                          placeholder={selectedField.type === 'initials' ? 'Your initials' : 'Your full name'}
                          value={typedSigByFieldId[selectedField.id] ?? ''}
                          onChange={(e) =>
                            setTypedSigByFieldId((s) => ({ ...s, [selectedField.id]: e.target.value }))
                          }
                        />
                      )}
                      {templateSigMode === 'type' ? (
                        <TypedSignatureCanvas
                          fieldId={selectedField.id}
                          text={typedSigByFieldId[selectedField.id] ?? ''}
                          onDataUrl={handleTypedTemplateSig}
                        />
                      ) : (
                        <SigCanvas
                          key={`sig-${selectedField.id}-${sigClearKeys[selectedField.id] ?? 0}`}
                          fieldId={selectedField.id}
                          onChange={(dataUrl) => setFieldValues((v) => ({ ...v, [selectedField.id]: dataUrl }))}
                        />
                      )}
                      <button
                        type="button"
                        className="text-xs font-medium text-gray-600 hover:text-gray-900 underline underline-offset-2"
                        onClick={() => {
                          setFieldValues((v) => {
                            const n = { ...v };
                            delete n[selectedField.id];
                            return n;
                          });
                          setTypedSigByFieldId((s) => {
                            const n = { ...s };
                            delete n[selectedField.id];
                            return n;
                          });
                          setSigClearKeys((k) => ({ ...k, [selectedField.id]: (k[selectedField.id] ?? 0) + 1 }));
                        }}
                      >
                        Clear field
                      </button>
                    </div>
                  )}
                    </div>
                  )}
                  </div>
                </aside>
              </div>
            </div>
          )}

        {!ctxLoading && !usesTemplate && (
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-4 sm:p-5 space-y-3">
            <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Your signature</div>
            <div className="flex gap-1 border-b border-gray-200 pb-3">
              <button
                type="button"
                className={`px-3 py-2 text-xs font-medium transition-colors border-b-2 -mb-[13px] ${
                  mode === 'draw' ? 'border-brand-red text-brand-red' : 'border-transparent text-gray-600 hover:text-gray-900'
                }`}
                onClick={() => setMode('draw')}
              >
                Draw
              </button>
              <button
                type="button"
                className={`px-3 py-2 text-xs font-medium transition-colors border-b-2 -mb-[13px] ${
                  mode === 'type' ? 'border-brand-red text-brand-red' : 'border-transparent text-gray-600 hover:text-gray-900'
                }`}
                onClick={() => setMode('type')}
              >
                Type name
              </button>
            </div>
            {mode === 'type' && (
              <input
                type="text"
                className={inputCls}
                placeholder="Your full name"
                value={typedName}
                onChange={(e) => setTypedName(e.target.value)}
              />
            )}
            <div className="border border-gray-200 rounded-lg overflow-hidden bg-gray-50/80">
              <canvas
                ref={canvasRef}
                className="w-full h-[180px] touch-none block"
                style={{ height: 180, cursor: CURSOR_PENCIL }}
                onMouseDown={onDown}
                onMouseMove={onMove}
                onMouseUp={onUp}
                onMouseLeave={onUp}
                onTouchStart={(e) => {
                  e.preventDefault();
                  onDown(e);
                }}
                onTouchMove={(e) => {
                  e.preventDefault();
                  onMove(e);
                }}
                onTouchEnd={onUp}
              />
            </div>
            <button
              type="button"
              className="text-xs font-medium text-gray-600 hover:text-gray-900 underline underline-offset-2"
              onClick={clearSig}
            >
              Clear signature
            </button>
          </div>
        )}

        </div>

        <div className="flex-shrink-0 border-t border-gray-200 bg-white px-4 py-4 sm:px-5">
          <label className="flex items-start gap-2.5 text-sm text-gray-700">
            <input
              type="checkbox"
              className="mt-0.5 rounded border-gray-300 text-brand-red focus:ring-brand-red"
              checked={agree}
              onChange={(e) => setAgree(e.target.checked)}
            />
            <span>I have read and agree to this document</span>
          </label>
          <div className="flex gap-3 mt-4 justify-end flex-wrap">
            <button
              type="button"
              disabled={submitting}
              className="px-4 py-2.5 text-sm font-medium rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={submitting || ctxLoading}
              onClick={() => void doSign()}
              className="px-5 py-2.5 text-sm font-medium rounded-lg text-white bg-gradient-to-r from-brand-red to-[#ee2b2b] shadow-sm disabled:opacity-50 hover:opacity-95"
            >
              {submitting ? 'Signing…' : 'Sign document'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
