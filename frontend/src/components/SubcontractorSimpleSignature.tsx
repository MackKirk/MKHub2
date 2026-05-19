import { useRef, useCallback, useState, useEffect, useLayoutEffect } from 'react';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';

const CSS_W_MAX = 480;
const CSS_W_MIN = 200;
const CSS_H = 160;
const MAX_DPR = 2;

type Props = {
  projectId: string;
  disabled?: boolean;
  onUploaded: (fileId: string) => void;
  onClear?: () => void;
};

export default function SubcontractorSimpleSignature({ projectId, disabled, onUploaded, onClear }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [uploading, setUploading] = useState(false);
  const [hasInk, setHasInk] = useState(false);
  const [logicalW, setLogicalW] = useState(320);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const measure = () => {
      const w = el.getBoundingClientRect().width;
      if (w < 48) return;
      const capped = Math.max(CSS_W_MIN, Math.min(CSS_W_MAX, Math.floor(w)));
      setLogicalW((prev) => (prev === capped ? prev : capped));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const layoutCanvas = useCallback(() => {
    const c = canvasRef.current;
    if (!c) return;
    const W = logicalW;
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    c.width = Math.floor(W * dpr);
    c.height = Math.floor(CSS_H * dpr);
    c.style.width = `${W}px`;
    c.style.height = `${CSS_H}px`;
    c.style.maxWidth = '100%';
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, W, CSS_H);
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }, [logicalW]);

  useEffect(() => {
    layoutCanvas();
  }, [layoutCanvas]);

  const getPos = (e: React.MouseEvent | React.TouchEvent) => {
    const c = canvasRef.current;
    if (!c) return { x: 0, y: 0 };
    const r = c.getBoundingClientRect();
    if ('touches' in e && e.touches[0]) {
      return { x: e.touches[0].clientX - r.left, y: e.touches[0].clientY - r.top };
    }
    const me = e as React.MouseEvent;
    return { x: me.clientX - r.left, y: me.clientY - r.top };
  };

  const start = (e: React.MouseEvent | React.TouchEvent) => {
    if (disabled) return;
    drawing.current = true;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const { x, y } = getPos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    setHasInk(true);
  };

  const move = (e: React.MouseEvent | React.TouchEvent) => {
    if (!drawing.current || disabled) return;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const { x, y } = getPos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const end = () => {
    drawing.current = false;
  };

  const clear = () => {
    layoutCanvas();
    setHasInk(false);
    onClear?.();
  };

  const save = async () => {
    const c = canvasRef.current;
    if (!c || disabled || !hasInk) return;
    setUploading(true);
    try {
      const blob = await new Promise<Blob | null>((resolve) => c.toBlob((b) => resolve(b), 'image/png'));
      if (!blob) {
        toast.error('Could not read signature');
        return;
      }
      const name = `subcontractor-signature-${crypto.randomUUID()}.png`;
      const file = new File([blob], name, { type: 'image/png' });
      const form = new FormData();
      form.append('file', file);
      form.append('original_name', name);
      form.append('content_type', 'image/png');
      form.append('project_id', projectId);
      form.append('client_id', '');
      form.append('employee_id', '');
      form.append('category_id', 'files');
      const res = await api<{ id: string }>('POST', '/files/upload-proxy', form);
      onUploaded(res.id);
      toast.success('Signature saved');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Upload failed';
      toast.error(msg);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div ref={containerRef} className="space-y-2 w-full max-w-full min-w-0">
      <canvas
        ref={canvasRef}
        className="block border border-gray-300 rounded touch-none cursor-crosshair bg-white max-w-full"
        onMouseDown={start}
        onMouseMove={move}
        onMouseUp={end}
        onMouseLeave={end}
        onTouchStart={(e) => {
          e.preventDefault();
          start(e);
        }}
        onTouchMove={(e) => {
          e.preventDefault();
          move(e);
        }}
        onTouchEnd={end}
      />
      <div className="flex gap-2">
        <button type="button" className="px-2 py-1 text-xs border rounded" onClick={clear} disabled={disabled || uploading}>
          Clear
        </button>
        <button
          type="button"
          className="px-2 py-1 text-xs rounded bg-gray-900 text-white disabled:opacity-50"
          onClick={save}
          disabled={disabled || uploading || !hasInk}
        >
          {uploading ? 'Uploading…' : 'Save signature'}
        </button>
      </div>
    </div>
  );
}
