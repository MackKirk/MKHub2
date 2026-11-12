import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type CatalogProduct, type CatalogResponse } from '@/lib/api';

export default function Catalog() {
  const [data, setData] = useState<CatalogResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const params = new URLSearchParams();
    if (q.trim()) params.set('q', q.trim());
    if (category !== 'all') params.set('category', category);
    api<CatalogResponse>('GET', `/public/metals/catalog?${params.toString()}`)
      .then((res) => {
        if (!cancelled) {
          setData(res);
          setError(null);
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e.message || 'Failed to load catalog');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [q, category]);

  const items: CatalogProduct[] = useMemo(() => data?.items || [], [data]);

  return (
    <div>
      <section className="mk-page-band">
        <div className="mx-auto max-w-6xl px-4 py-14">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/50">
            Langley shop · British Columbia
          </p>
          <h1 className="mt-3 font-display text-4xl font-extrabold tracking-tight md:text-5xl">
            Product catalog
          </h1>
          <p className="mt-3 max-w-2xl text-white/70">
            Panels, trims, and flashings formed to your run. Browse profiles, then request an estimate
            or start an order — pricing is quoted to your job.
          </p>
          <Link to="/quote" className="mk-btn-primary mt-6">
            Free estimate
          </Link>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-10">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setCategory('all')}
              className={`rounded-sm px-3 py-1.5 text-xs font-bold uppercase ${
                category === 'all' ? 'bg-metals-accent text-white' : 'border border-metals-mist bg-white'
              }`}
            >
              All
            </button>
            {(data?.categories || []).map((c) => (
              <button
                key={c.slug}
                type="button"
                onClick={() => setCategory(c.slug)}
                className={`rounded-sm px-3 py-1.5 text-xs font-bold uppercase ${
                  category === c.slug ? 'bg-metals-accent text-white' : 'border border-metals-mist bg-white'
                }`}
              >
                {c.name}
              </button>
            ))}
          </div>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search products"
            className="w-full rounded-sm border border-metals-mist bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-metals-accent/30 md:w-64"
          />
        </div>

        {loading && <p className="mt-10 text-sm text-metals-steel/70">Loading catalog…</p>}
        {error && <p className="mt-10 text-sm text-red-600">{error}</p>}
        {!loading && !error && items.length === 0 && (
          <p className="mt-10 text-sm text-metals-steel/70">
            No published products yet. Check back soon, or{' '}
            <Link to="/quote" className="text-metals-accent underline">
              request a custom estimate
            </Link>
            .
          </p>
        )}

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((p) => (
            <Link
              key={p.id}
              to={`/catalog/${p.slug}`}
              className="group overflow-hidden border border-metals-mist bg-white transition-colors hover:border-metals-accent/55"
            >
              <div className="flex aspect-[4/3] items-center justify-center overflow-hidden bg-metals-mist/60">
                {p.image_url ? (
                  <img
                    src={p.image_url}
                    alt=""
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                  />
                ) : (
                  <span className="font-display text-4xl font-bold uppercase text-metals-steel/20">
                    {p.name.slice(0, 2)}
                  </span>
                )}
              </div>
              <div className="p-4">
                {p.category && (
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-metals-accent">
                    {p.category.name}
                  </p>
                )}
                <h2 className="mt-1 font-display text-xl font-bold group-hover:text-metals-accent">
                  {p.name}
                </h2>
                {p.short_description && (
                  <p className="mt-1 line-clamp-2 text-sm text-metals-steel/70">{p.short_description}</p>
                )}
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
