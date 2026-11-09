import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, type Submission } from '@/lib/api';

type Me = {
  id: string;
  email: string;
  name?: string | null;
  memberships: { metals_client_id: string; name?: string | null; role: string }[];
};

export default function Account() {
  const [me, setMe] = useState<Me | null>(null);
  const [items, setItems] = useState<Submission[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [showWelcome, setShowWelcome] = useState(params.get('welcome') === '1');

  useEffect(() => {
    Promise.all([
      api<Me>('GET', '/portal/metals/me'),
      api<{ items: Submission[] }>('GET', '/portal/metals/submissions'),
    ])
      .then(([profile, subs]) => {
        setMe(profile);
        setItems(subs.items || []);
      })
      .catch((e) => setError(e.message || 'Failed to load account'));
  }, []);

  function dismissWelcome() {
    setShowWelcome(false);
    if (params.get('welcome')) {
      navigate('/account', { replace: true });
    }
  }

  const openCount = items.filter((i) => !['shipped', 'cancelled'].includes(i.status)).length;

  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      {showWelcome && (
        <div className="mb-6 flex flex-wrap items-start justify-between gap-3 border border-metals-accent/25 bg-white px-4 py-3 text-sm">
          <p className="text-metals-steel/85">
            Welcome. Estimates and orders submitted with this email will show up here so you can track
            status online.
          </p>
          <button
            type="button"
            className="shrink-0 text-xs font-semibold uppercase text-metals-accent hover:underline"
            onClick={dismissWelcome}
          >
            Dismiss
          </button>
        </div>
      )}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl font-extrabold tracking-tight">Account</h1>
          {me && (
            <p className="mt-2 text-sm text-metals-steel/70">
              {me.name || me.email}
              {me.memberships[0]?.name ? ` · ${me.memberships[0].name}` : ''}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <Link to="/quote" className="mk-btn-primary !px-3 !py-2 text-xs">
            New estimate
          </Link>
          <Link to="/orders" className="mk-btn-outline !px-3 !py-2 text-xs">
            New order
          </Link>
        </div>
      </div>

      {error && <p className="mt-6 text-sm text-red-600">{error}</p>}

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <div className="border border-metals-mist bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-metals-steel/50">Open requests</p>
          <p className="mt-1 font-display text-3xl font-bold">{openCount}</p>
        </div>
        <div className="border border-metals-mist bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-metals-steel/50">Estimates</p>
          <p className="mt-1 font-display text-3xl font-bold">
            {items.filter((i) => i.kind === 'estimate').length}
          </p>
        </div>
        <div className="border border-metals-mist bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-metals-steel/50">Orders</p>
          <p className="mt-1 font-display text-3xl font-bold">
            {items.filter((i) => i.kind === 'order').length}
          </p>
        </div>
      </div>

      <h2 className="mt-10 font-display text-2xl font-bold">Submissions</h2>
      {items.length === 0 && !error && (
        <p className="mt-4 text-sm text-metals-steel/70">No submissions yet.</p>
      )}
      <ul className="mt-4 divide-y divide-metals-mist border border-metals-mist bg-white">
        {items.map((s) => (
          <li key={s.id}>
            <Link
              to={`/account/submissions/${s.id}`}
              className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-metals-paper"
            >
              <div>
                <p className="font-semibold">{s.submission_code}</p>
                <p className="text-xs capitalize text-metals-steel/60">
                  {s.kind} · {s.status_label}
                </p>
              </div>
              <p className="text-xs text-metals-steel/50">
                {s.created_at ? new Date(s.created_at).toLocaleDateString() : ''}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
