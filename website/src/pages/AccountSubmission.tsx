import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, type Submission } from '@/lib/api';

export default function AccountSubmission() {
  const { id } = useParams();
  const [row, setRow] = useState<Submission | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    api<Submission>('GET', `/portal/metals/submissions/${encodeURIComponent(id)}`)
      .then(setRow)
      .catch((e) => setError(e.message || 'Not found'));
  }, [id]);

  if (error) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12">
        <p className="text-red-600">{error}</p>
        <Link to="/account" className="mt-4 inline-block text-metals-accent hover:underline">
          ← Account
        </Link>
      </div>
    );
  }

  if (!row) {
    return <div className="mx-auto max-w-3xl px-4 py-12 text-sm text-metals-steel/70">Loading…</div>;
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <Link to="/account" className="text-sm text-metals-accent hover:underline">
        ← Account
      </Link>
      <h1 className="mt-4 font-display text-3xl font-extrabold tracking-tight">{row.submission_code}</h1>
      <p className="mt-1 text-sm capitalize text-metals-steel/70">
        {row.kind} · {row.status_label}
      </p>

      <div className="mt-8 space-y-4 border border-metals-mist bg-white p-5 text-sm">
        <p>
          <span className="text-metals-steel/50">Contact:</span> {row.contact_name} · {row.contact_email}
        </p>
        {row.company_name && (
          <p>
            <span className="text-metals-steel/50">Company:</span> {row.company_name}
          </p>
        )}
        {row.notes && (
          <p>
            <span className="text-metals-steel/50">Notes:</span> {row.notes}
          </p>
        )}
      </div>

      {row.items?.length > 0 && (
        <div className="mt-6">
          <h2 className="font-display text-xl font-bold">Items</h2>
          <ul className="mt-3 space-y-2">
            {row.items.map((it) => (
              <li key={it.id} className="border border-metals-mist bg-white px-4 py-3 text-sm">
                <p className="font-medium">{it.description}</p>
                <p className="text-xs text-metals-steel/60">
                  {[it.gauge, it.colour, `qty ${it.quantity}`].filter(Boolean).join(' · ')}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {row.files?.length > 0 && (
        <div className="mt-6">
          <h2 className="font-display text-xl font-bold">Files</h2>
          <ul className="mt-3 list-disc pl-5 text-sm">
            {row.files.map((f) => (
              <li key={f.id}>{f.original_name || f.id}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
