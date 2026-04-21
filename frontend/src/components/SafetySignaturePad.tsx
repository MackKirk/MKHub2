import { useRef, useCallback, useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';

const CATEGORY = 'safety-form';

const CSS_W = 560;
const CSS_H = 200;
const MAX_DPR = 2.5;

export type SavedSignatureMeta = {
  signedAt: string;
  signerName: string;
  signerUserId?: string;
  lat?: number;
  lng?: number;
  locationLabel?: string;
};

type Props = {
  projectId: string;
  disabled?: boolean;
  fileObjectId: string | null;
  onFileObjectId: (id: string | null) => void;
  signerDisplayName: string;
  signerUserId?: string;
  /** When set, upload-proxy allows this user without project files write (pending additional signer). */
  pendingSafetySignInspectionId?: string;
  onSignatureSaved?: (fileId: string, meta: SavedSignatureMeta) => void;
  /** Called after Clear to remove persisted metadata from the form payload */
  onSignatureClear?: () => void;
};

function requestOptionalPosition(): Promise<GeolocationPosition | null> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return Promise.resolve(null);
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(pos),
      () => resolve(null),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60_000 }
    );
  });
}

export default function SafetySignaturePad({
  projectId,
  disabled,
  fileObjectId: _fileObjectId,
  onFileObjectId,
  signerDisplayName,
  signerUserId,
  onSignatureSaved,
  onSignatureClear,
  pendingSafetySignInspectionId,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef({ x: 0, y: 0 });
  const dprRef = useRef(1);
  const [uploading, setUploading] = useState(false);

  const setupCanvas = useCallback(() => {
    const c = canvasRef.current;
    const wrap = wrapRef.current;
    if (!c || !wrap) return;
    const rect = wrap.getBoundingClientRect();
    const cssW = Math.max(280, Math.min(Math.floor(rect.width) || CSS_W, 900));
    const cssH = CSS_H;
    const dpr = Math.min(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1, MAX_DPR);
    dprRef.current = dpr;
    c.width = Math.round(cssW * dpr);
    c.height = Math.round(cssH * dpr);
    c.style.width = `${cssW}px`;
    c.style.height = `${cssH}px`;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, cssW, cssH);
  }, []);

  useEffect(() => {
    setupCanvas();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => setupCanvas()) : null;
    if (ro && wrapRef.current) ro.observe(wrapRef.current);
    const onWin = () => setupCanvas();
    window.addEventListener('resize', onWin);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', onWin);
    };
  }, [setupCanvas]);

  const pos = (e: React.MouseEvent | React.TouchEvent, c: HTMLCanvasElement) => {
    const r = c.getBoundingClientRect();
    const p = 'touches' in e ? e.touches[0] : e;
    return { x: p.clientX - r.left, y: p.clientY - r.top };
  };

  const posNative = (e: MouseEvent | TouchEvent, c: HTMLCanvasElement) => {
    const r = c.getBoundingClientRect();
    if ('touches' in e && e.touches.length > 0) {
      const p = e.touches[0];
      return { x: p.clientX - r.left, y: p.clientY - r.top };
    }
    const m = e as MouseEvent;
    return { x: m.clientX - r.left, y: m.clientY - r.top };
  };

  const start = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (disabled) return;
    const c = canvasRef.current;
    if (!c) return;
    e.preventDefault();
    drawing.current = true;
    last.current = pos(e, c);
  };

  const move = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!drawing.current || disabled) return;
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    e.preventDefault();
    const p = pos(e, c);
    ctx.save();
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    ctx.restore();
    last.current = p;
  };

  const end = () => {
    drawing.current = false;
  };

  /** React's touch handlers are often passive; we need non-passive listeners so preventDefault stops page scroll while drawing. */
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const passiveFalse = { passive: false } as const;
    const onTouchStart = (e: TouchEvent) => {
      if (disabled) return;
      e.preventDefault();
      drawing.current = true;
      last.current = posNative(e, c);
    };
    const onTouchMove = (e: TouchEvent) => {
      if (!drawing.current || disabled) return;
      const ctx = c.getContext('2d');
      if (!ctx) return;
      e.preventDefault();
      const p = posNative(e, c);
      ctx.save();
      ctx.strokeStyle = '#111827';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(last.current.x, last.current.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      ctx.restore();
      last.current = p;
    };
    const onTouchEnd = () => {
      drawing.current = false;
    };
    c.addEventListener('touchstart', onTouchStart, passiveFalse);
    c.addEventListener('touchmove', onTouchMove, passiveFalse);
    c.addEventListener('touchend', onTouchEnd);
    c.addEventListener('touchcancel', onTouchEnd);
    return () => {
      c.removeEventListener('touchstart', onTouchStart, passiveFalse);
      c.removeEventListener('touchmove', onTouchMove, passiveFalse);
      c.removeEventListener('touchend', onTouchEnd);
      c.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [disabled]);

  const clear = () => {
    setupCanvas();
    if (onSignatureClear) {
      onSignatureClear();
    } else {
      onFileObjectId(null);
    }
  };

  const saveCanvas = useCallback(async () => {
    const c = canvasRef.current;
    if (!c || disabled) return;
    setUploading(true);
    try {
      const blob = await new Promise<Blob | null>((resolve) => c.toBlob((b) => resolve(b), 'image/png'));
      if (!blob) {
        toast.error('Could not read signature');
        return;
      }
      const geo = await requestOptionalPosition();
      const meta: SavedSignatureMeta = {
        signedAt: new Date().toISOString(),
        signerName: (signerDisplayName || '').trim() || 'Unknown',
        signerUserId: signerUserId?.trim() || undefined,
      };
      if (geo?.coords) {
        meta.lat = geo.coords.latitude;
        meta.lng = geo.coords.longitude;
        meta.locationLabel = `${geo.coords.latitude.toFixed(5)}, ${geo.coords.longitude.toFixed(5)}`;
      }
      // Unique name per upload: canonical_key uses project + date + original_name; a fixed
      // "signature.png" collides when another signer uploads the same day and overwrites blob bytes
      // while leaving distinct FileObject rows — PDF then shows the same image twice.
      const uniqueName = `signature-${crypto.randomUUID()}.png`;
      const file = new File([blob], uniqueName, { type: 'image/png' });
      const form = new FormData();
      form.append('file', file);
      form.append('original_name', uniqueName);
      form.append('content_type', 'image/png');
      form.append('project_id', projectId);
      form.append('client_id', '');
      form.append('employee_id', '');
      form.append('category_id', CATEGORY);
      if (pendingSafetySignInspectionId?.trim()) {
        form.append('pending_safety_sign_inspection_id', pendingSafetySignInspectionId.trim());
      }
      const res = await api<{ id: string }>('POST', '/files/upload-proxy', form);
      // Do not attach to Project > Files; signature bytes are only referenced from the inspection payload / PDF.
      if (onSignatureSaved) {
        onSignatureSaved(res.id, meta);
      } else {
        onFileObjectId(res.id);
      }
      toast.success('Signature saved');
    } catch {
      toast.error('Save failed');
    } finally {
      setUploading(false);
    }
  }, [
    disabled,
    onFileObjectId,
    onSignatureSaved,
    pendingSafetySignInspectionId,
    projectId,
    signerDisplayName,
    signerUserId,
    setupCanvas,
  ]);

  return (
    <div className="space-y-2">
      <div ref={wrapRef} className="border border-gray-300 rounded-lg overflow-hidden bg-white touch-none w-full max-w-3xl">
        <canvas
          ref={canvasRef}
          className="w-full cursor-crosshair block"
          onMouseDown={start}
          onMouseMove={move}
          onMouseUp={end}
          onMouseLeave={end}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={disabled || uploading}
          onClick={clear}
          className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50"
        >
          Clear
        </button>
        <button
          type="button"
          disabled={disabled || uploading || !projectId}
          onClick={() => void saveCanvas()}
          className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {uploading ? 'Saving…' : 'Save signature'}
        </button>
      </div>
    </div>
  );
}
