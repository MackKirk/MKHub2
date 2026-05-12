import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '@/lib/api';

export default function SubcontractorScanPage() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const t = params.get('t');
    if (!t) {
      setErr('Missing token');
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const qs = new URLSearchParams({ token: t });
        const res = await api<{ worker: { id: string } }>('GET', `/subcontractors/workers/resolve?${qs.toString()}`);
        if (cancelled) return;
        nav(`/business/subcontractors/workers/${res.worker.id}`, { replace: true });
      } catch (e: unknown) {
        if (!cancelled) setErr(e instanceof Error ? e.message : 'Lookup failed');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [params, nav]);

  if (err) {
    return (
      <div className="p-8 max-w-md mx-auto">
        <p className="text-red-700 text-sm">{err}</p>
        <button type="button" className="mt-4 text-sm text-[#7f1010] underline" onClick={() => nav('/business/subcontractors')}>
          Back to Subcontractors
        </button>
      </div>
    );
  }

  return (
    <div className="p-8 text-center text-sm text-gray-600">
      Opening worker profile…
    </div>
  );
}
