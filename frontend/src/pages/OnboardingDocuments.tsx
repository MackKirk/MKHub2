import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, getToken } from '@/lib/api';
import toast from 'react-hot-toast';

type DocRow = {
  id: string;
  document_name: string;
  status: string;
  deadline_at: string | null;
  remaining_days: number | null;
  required: boolean;
  signed_file_id: string | null;
};

export default function OnboardingDocuments() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: docs = [], isLoading } = useQuery({
    queryKey: ['me-onboarding-docs'],
    queryFn: () => api<DocRow[]>('GET', '/auth/me/onboarding/documents'),
  });
  const { data: status } = useQuery({
    queryKey: ['me-onboarding-status'],
    queryFn: () => api<{ has_pending: boolean; past_deadline: boolean; pending_count: number; earliest_deadline: string | null }>('GET', '/auth/me/onboarding/status'),
  });

  const [signItem, setSignItem] = useState<DocRow | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [mode, setMode] = useState<'draw' | 'type'>('draw');
  const [typedName, setTypedName] = useState('');
  const [agree, setAgree] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);

  const resizeCanvas = useCallback(() => {
    const c = canvasRef.current;
    if (!c) return;
    const rect = c.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    c.width = Math.floor(rect.width * ratio);
    c.height = Math.floor(180 * ratio);
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, rect.width, 180);
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
  }, []);

  useEffect(() => {
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    return () => window.removeEventListener('resize', resizeCanvas);
  }, [resizeCanvas, signItem]);

  useEffect(() => {
    if (mode === 'type' && canvasRef.current) {
      const c = canvasRef.current;
      const ctx = c.getContext('2d');
      if (!ctx) return;
      const w = c.width / (window.devicePixelRatio || 1);
      const h = 180;
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, w, h);
      const text = typedName.trim();
      if (!text) return;
      let size = 48;
      ctx.font = `${size}px "Segoe UI", cursive`;
      while (ctx.measureText(text).width > w * 0.85 && size > 16) {
        size -= 2;
        ctx.font = `${size}px "Segoe UI", cursive`;
      }
      ctx.fillStyle = '#111';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, w / 2, h / 2);
    }
  }, [mode, typedName, signItem]);

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
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx || !last.current) return;
    const p = pos(e);
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
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

  const getSignatureDataUrl = () => {
    const c = canvasRef.current;
    if (!c) return '';
    const ctx = c.getContext('2d');
    if (!ctx) return '';
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
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
    if (!signItem || !agree) {
      toast.error('Check "I have read and agree"');
      return;
    }
    const dataUrl = getSignatureDataUrl();
    if (!dataUrl) {
      toast.error('Add your signature');
      return;
    }
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append('assignment_item_id', signItem.id);
      fd.append('agreement', 'true');
      fd.append('signature_base64', dataUrl);
      const r = await fetch('/auth/me/onboarding/sign', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + (getToken() || '') },
        body: fd,
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.detail || r.statusText);
      }
      toast.success('Document signed');
      setSignItem(null);
      setAgree(false);
      clearSig();
      await qc.invalidateQueries({ queryKey: ['me-onboarding-docs'] });
      await qc.invalidateQueries({ queryKey: ['me-onboarding-status'] });
      await qc.invalidateQueries({ queryKey: ['user-docs'] });
      await qc.invalidateQueries({ queryKey: ['user-folders'] });
    } catch (e: any) {
      toast.error(e?.message || 'Sign failed');
    } finally {
      setSubmitting(false);
    }
  };

  const openPreview = async (id: string) => {
    const t = getToken();
    const url = `/auth/me/onboarding/documents/${id}/preview`;
    const r = await fetch(url, { headers: { Authorization: 'Bearer ' + (t || '') } });
    if (!r.ok) {
      toast.error('Could not load PDF');
      return;
    }
    const blob = await r.blob();
    window.open(URL.createObjectURL(blob), '_blank');
  };

  const pendingRequired = docs.filter((d) => d.status === 'pending' && d.required);
  const blockedByDeadline = Boolean(status?.past_deadline && pendingRequired.length > 0);
  const canLeaveToHome = !blockedByDeadline;

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-600">Loading…</div>
      </div>
    );
  }

  if (docs.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Onboarding documents</h1>
        <p className="text-gray-600 mb-6 text-center max-w-md">No documents are assigned to you right now.</p>
        <button
          type="button"
          onClick={() => navigate('/home', { replace: true })}
          className="px-6 py-3 rounded-xl bg-gradient-to-r from-brand-red to-[#ee2b2b] text-white font-semibold"
        >
          Continue to MK Hub
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b">
        <div className="max-w-3xl mx-auto px-6 py-6">
          <h1 className="text-2xl font-bold text-gray-900">Sign onboarding documents</h1>
          <p className="text-sm text-gray-600 mt-1">
            Review each document, then sign. Signed PDFs are saved under Profile → Docs → HR Documents.
          </p>
          {status?.past_deadline && pendingRequired.length > 0 && (
            <div className="mt-4 p-4 rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm">
              Your access is limited until all required documents are signed.
            </div>
          )}
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-8 space-y-4">
        {docs.map((d) => (
          <div key={d.id} className="bg-white rounded-xl border shadow-sm p-5 flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="font-semibold text-gray-900">{d.document_name}</div>
              <div className="text-sm text-gray-500 mt-1">
                {d.status === 'signed' ? (
                  <span className="text-green-600">Signed</span>
                ) : (
                  <>
                    <span className="text-amber-600">Pending</span>
                    {d.deadline_at && (
                      <span className="ml-2">
                        · Due {new Date(d.deadline_at).toLocaleDateString()}
                        {d.remaining_days != null && ` · ${d.remaining_days} day(s) left`}
                      </span>
                    )}
                    {d.required && <span className="ml-1 text-red-600">· Required</span>}
                  </>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              {d.status === 'pending' && (
                <>
                  <button
                    type="button"
                    onClick={() => openPreview(d.id)}
                    className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
                  >
                    Review
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSignItem(d);
                      setAgree(false);
                      setMode('draw');
                      setTimeout(resizeCanvas, 50);
                    }}
                    className="px-4 py-2 rounded-lg bg-gradient-to-r from-brand-red to-[#ee2b2b] text-white font-medium"
                  >
                    Sign
                  </button>
                </>
              )}
            </div>
          </div>
        ))}

        <div className="flex justify-end pt-4">
          <button
            type="button"
            disabled={!canLeaveToHome}
            onClick={() => navigate('/home', { replace: true })}
            className="px-6 py-3 rounded-xl border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {pendingRequired.length === 0
              ? 'Continue to MK Hub'
              : blockedByDeadline
                ? 'Sign required documents first'
                : 'Skip for now (come back before deadline)'}
          </button>
        </div>
      </div>

      {signItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-6">
            <h2 className="text-lg font-bold mb-2">Sign: {signItem.document_name}</h2>
            <div className="flex gap-2 mb-3">
              <button
                type="button"
                className={`px-3 py-1 rounded-lg text-sm ${mode === 'draw' ? 'bg-gray-900 text-white' : 'bg-gray-100'}`}
                onClick={() => setMode('draw')}
              >
                Draw
              </button>
              <button
                type="button"
                className={`px-3 py-1 rounded-lg text-sm ${mode === 'type' ? 'bg-gray-900 text-white' : 'bg-gray-100'}`}
                onClick={() => setMode('type')}
              >
                Type name
              </button>
            </div>
            {mode === 'type' && (
              <input
                type="text"
                className="w-full border rounded-lg px-3 py-2 mb-2"
                placeholder="Your full name"
                value={typedName}
                onChange={(e) => setTypedName(e.target.value)}
              />
            )}
            <div className="border rounded-xl overflow-hidden bg-gray-50">
              <canvas
                ref={canvasRef}
                className="w-full h-[180px] touch-none cursor-crosshair block"
                style={{ height: 180 }}
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
            <button type="button" className="text-sm text-gray-500 mt-2 underline" onClick={clearSig}>
              Clear
            </button>
            <label className="flex items-center gap-2 mt-4 text-sm">
              <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
              I have read and agree to this document
            </label>
            <div className="flex gap-3 mt-6 justify-end">
              <button type="button" className="px-4 py-2 rounded-lg border" onClick={() => setSignItem(null)}>
                Cancel
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={doSign}
                className="px-4 py-2 rounded-lg bg-gradient-to-r from-brand-red to-[#ee2b2b] text-white font-semibold disabled:opacity-50"
              >
                {submitting ? 'Signing…' : 'Sign document'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
