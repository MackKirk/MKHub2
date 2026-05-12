import { useEffect, useRef, useState, useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api, withFileAccessTokenIfNeeded } from '@/lib/api';
import OverlayPortal from '@/components/OverlayPortal';
import SubcontractorSimpleSignature from '@/components/SubcontractorSimpleSignature';

type ResolveResponse = {
  worker: { id: string; name: string; photo_file_id?: string | null; is_active: boolean };
  company: { id: string; name: string; is_active: boolean } | null;
  worker_active: boolean;
  company_active: boolean;
  open_attendance: { id: string; project_id: string; project_name?: string | null; clock_in_time?: string | null } | null;
  can_clock_in: boolean;
  can_clock_out_on_this_project: boolean;
  open_on_other_project: boolean;
  other_project_name?: string | null;
};

function extractTokenFromText(text: string): string | null {
  const t = text.trim();
  if (!t) return null;
  try {
    const u = new URL(t, window.location.origin);
    const tok = u.searchParams.get('t');
    if (tok) return tok;
  } catch {
    /* ignore */
  }
  if (/^[0-9a-f-]{36}$/i.test(t)) return t;
  return null;
}

function decodedTextFromScan(decoded: unknown): string {
  if (typeof decoded === 'string') return decoded;
  if (decoded && typeof decoded === 'object' && 'decodedText' in decoded) {
    const t = (decoded as { decodedText?: string }).decodedText;
    if (typeof t === 'string') return t;
  }
  return String(decoded ?? '');
}

export default function SubcontractorClockModal({
  projectId,
  open,
  onClose,
}: {
  projectId: string;
  open: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [readerDomId] = useState(() => `sc-ts-qr-${Math.random().toString(36).slice(2, 12)}`);
  const [manualToken, setManualToken] = useState('');
  const [resolved, setResolved] = useState<ResolveResponse | null>(null);
  const [step, setStep] = useState<'scan' | 'clockIn' | 'clockOut' | 'blocked'>('scan');
  const [sigFileId, setSigFileId] = useState<string | null>(null);
  const [hoursConfirm, setHoursConfirm] = useState(false);
  const scannerRef = useRef<{ stop: () => Promise<void> } | null>(null);
  const closingRef = useRef(false);

  const stopScanner = useCallback(async () => {
    const r = scannerRef.current;
    scannerRef.current = null;
    if (!r) return;
    try {
      await r.stop();
    } catch {
      /* already stopped or DOM gone */
    }
  }, []);

  const handleClose = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    void (async () => {
      try {
        await stopScanner();
      } finally {
        closingRef.current = false;
        onClose();
      }
    })();
  }, [onClose, stopScanner]);

  const resolve = useCallback(
    async (token: string) => {
      const qs = new URLSearchParams({ token });
      qs.set('project_id', projectId);
      const data = await api<ResolveResponse>('GET', `/subcontractors/workers/resolve?${qs.toString()}`);
      setResolved(data);
      if (data.open_on_other_project) {
        setStep('blocked');
        return;
      }
      if (!data.worker_active) {
        toast.error('This worker is inactive');
        setStep('blocked');
        return;
      }
      if (!data.company_active) {
        toast.error('Subcontractor company is inactive');
        setStep('blocked');
        return;
      }
      if (data.can_clock_out_on_this_project && data.open_attendance) {
        setStep('clockOut');
        return;
      }
      if (data.can_clock_in) {
        setStep('clockIn');
        return;
      }
      setStep('blocked');
    },
    [projectId]
  );

  useEffect(() => {
    if (!open) {
      setManualToken('');
      setResolved(null);
      setStep('scan');
      setSigFileId(null);
      setHoursConfirm(false);
      void stopScanner();
      return;
    }
    closingRef.current = false;
    let cancelled = false;
    (async () => {
      try {
        const { Html5Qrcode } = await import('html5-qrcode');
        if (cancelled || closingRef.current) return;
        await new Promise((r) => setTimeout(r, 100));
        if (cancelled || closingRef.current) return;
        const el = document.getElementById(readerDomId);
        if (!el || cancelled || closingRef.current) return;
        const reader = new Html5Qrcode(readerDomId);
        scannerRef.current = reader;
        await reader.start(
          { facingMode: 'environment' },
          { fps: 8, qrbox: { width: 220, height: 220 } },
          async (decoded) => {
            if (closingRef.current || cancelled) return;
            const raw = decodedTextFromScan(decoded);
            const tok = extractTokenFromText(raw);
            if (!tok) return;
            try {
              await reader.stop();
            } catch {
              /* ignore */
            }
            scannerRef.current = null;
            await resolve(tok);
          },
          () => {}
        );
      } catch {
        /* camera denied */
      }
    })();
    return () => {
      cancelled = true;
      void stopScanner();
    };
  }, [open, resolve, readerDomId, stopScanner]);

  const clockInMut = useMutation({
    mutationFn: () =>
      api('POST', '/subcontractors/attendance/clock-in', {
        worker_id: resolved?.worker.id,
        project_id: projectId,
        clock_in_signature_file_id: sigFileId || undefined,
      }),
    onSuccess: async () => {
      toast.success('Clock-in recorded');
      queryClient.invalidateQueries({ queryKey: ['settings-attendance'] });
      await stopScanner();
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const clockOutMut = useMutation({
    mutationFn: () =>
      api('POST', '/subcontractors/attendance/clock-out', {
        attendance_id: resolved?.open_attendance?.id,
        project_id: projectId,
        clock_out_signature_file_id: sigFileId,
        hours_accuracy_confirmed: hoursConfirm,
      }),
    onSuccess: async () => {
      toast.success('Clock-out recorded');
      queryClient.invalidateQueries({ queryKey: ['settings-attendance'] });
      await stopScanner();
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!open) return null;

  const photoUrl = resolved?.worker?.photo_file_id
    ? withFileAccessTokenIfNeeded(`/files/${resolved.worker.photo_file_id}`)
    : null;

  return (
    <OverlayPortal>
      <div
        className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4"
        onClick={() => handleClose()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') handleClose();
        }}
        role="presentation"
      >
        <div
          className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-4 py-3 border-b font-semibold text-gray-900">Subcontractor Clock-In/Out</div>
          <div className="p-4 space-y-4 text-sm">
            {!resolved && (
              <>
                <p className="text-gray-600 text-xs">Scan the worker QR code or paste the URL / token.</p>
                <div id={readerDomId} className="rounded border overflow-hidden min-h-[200px] bg-black" />
                <div className="flex gap-2">
                  <input
                    className="flex-1 border rounded px-2 py-1.5 text-xs"
                    placeholder="Token or full scan URL"
                    value={manualToken}
                    onChange={(e) => setManualToken(e.target.value)}
                  />
                  <button
                    type="button"
                    className="px-3 py-1.5 rounded bg-[#7f1010] text-white text-xs"
                    onClick={async () => {
                      const tok = extractTokenFromText(manualToken);
                      if (!tok) {
                        toast.error('Invalid token');
                        return;
                      }
                      await resolve(tok);
                    }}
                  >
                    Look up
                  </button>
                </div>
              </>
            )}

            {resolved && (
              <div className="flex gap-3">
                {photoUrl ? (
                  <img src={photoUrl} alt="" className="w-16 h-16 rounded-full object-cover border" />
                ) : (
                  <div className="w-16 h-16 rounded-full bg-gray-200 flex items-center justify-center text-lg font-medium text-gray-600">
                    {resolved.worker.name?.slice(0, 1) || '?'}
                  </div>
                )}
                <div>
                  <div className="font-semibold">{resolved.worker.name}</div>
                  <div className="text-xs text-gray-600">{resolved.company?.name}</div>
                  <div className="text-xs mt-1">
                    Status:{' '}
                    <span className={resolved.open_attendance ? 'text-green-700 font-medium' : 'text-gray-700'}>
                      {resolved.open_attendance ? 'Clocked in' : 'Not clocked in'}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {step === 'blocked' && resolved?.open_on_other_project && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded text-amber-900 text-xs">
                This worker has an open attendance on another project
                {resolved.other_project_name ? `: ${resolved.other_project_name}` : ''}. Clock out there first.
              </div>
            )}

            {step === 'clockIn' && resolved && (
              <div className="space-y-2">
                <p className="text-xs text-gray-600">Optional signature for clock-in.</p>
                <SubcontractorSimpleSignature
                  projectId={projectId}
                  disabled={clockInMut.isPending}
                  onUploaded={(id) => setSigFileId(id)}
                  onClear={() => setSigFileId(null)}
                />
                <button
                  type="button"
                  className="w-full py-2 rounded bg-green-700 text-white text-sm font-medium disabled:opacity-50"
                  disabled={clockInMut.isPending}
                  onClick={() => clockInMut.mutate()}
                >
                  {clockInMut.isPending ? 'Saving…' : 'Clock In'}
                </button>
              </div>
            )}

            {step === 'clockOut' && resolved?.open_attendance && (
              <div className="space-y-2">
                <label className="flex items-start gap-2 text-xs cursor-pointer">
                  <input type="checkbox" checked={hoursConfirm} onChange={(e) => setHoursConfirm(e.target.checked)} className="mt-0.5" />
                  <span>I confirm that the recorded working hours are accurate.</span>
                </label>
                <p className="text-xs text-gray-600">Signature required for clock-out.</p>
                <SubcontractorSimpleSignature
                  projectId={projectId}
                  disabled={clockOutMut.isPending}
                  onUploaded={(id) => setSigFileId(id)}
                  onClear={() => setSigFileId(null)}
                />
                <button
                  type="button"
                  className="w-full py-2 rounded bg-red-700 text-white text-sm font-medium disabled:opacity-50"
                  disabled={clockOutMut.isPending || !hoursConfirm || !sigFileId}
                  onClick={() => clockOutMut.mutate()}
                >
                  {clockOutMut.isPending ? 'Saving…' : 'Clock Out'}
                </button>
              </div>
            )}
          </div>
          <div className="px-4 py-3 border-t flex justify-end">
            <button type="button" className="px-3 py-1.5 text-sm border rounded" onClick={() => handleClose()}>
              Close
            </button>
          </div>
        </div>
      </div>
    </OverlayPortal>
  );
}
