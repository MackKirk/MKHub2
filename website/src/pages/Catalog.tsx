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
      <section className="bg-metals-ink text-white">
        <div className="mx-auto max-w-6xl px-4 py-16">
          <p className="text-xs uppercase tracking-[0.2em] text-white/50">Catalog · British Columbia</p>
          <h1 className="mt-3 font-display text-5xl font-extrabold uppercase">Product catalog</h1>
          <p className="mt-3 max-w-2xl text-white/70">
            Panels, trims, and flashings formed to your run. Browse profiles, then request an estimate or
            start an order — pricing is quoted to your job.
          </p>
          <Link
            to="/quote"
            className="mt-6 inline-block rounded bg-metals-accent px-4 py-2 text-sm font-bold uppercase hover:bg-metals-accentDark"
          >
            Get a free estimate
          </Link>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-10">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setCategory('all')}
              className={`rounded px-3 py-1.5 text-xs font-bold uppercase ${
                category === 'all' ? 'bg-metals-accent text-white' : 'bg-white border border-metals-mist'
              }`}
            >
              All
            </button>
            {(data?.categories || []).map((c) => (
              <button
                key={c.slug}
                type="button"
                onClick={() => setCategory(c.slug)}
                className={`rounded px-3 py-1.5 text-xs font-bold uppercase ${
                  category === c.slug ? 'bg-metals-accent text-white' : 'bg-white border border-metals-mist'
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
            className="w-full md:w-64 rounded border border-metals-mist bg-white px-3 py-2 text-sm"
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
              className="group border border-metals-mist bg-white overflow-hidden hover:border-metals-accent/50 transition-colors"
            >
              <div className="aspect-[4/3] bg-metals-mist/60 flex items-center justify-center overflow-hidden">
                {p.image_url ? (
                  <img src={p.image_url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="font-display text-4xl font-bold text-metals-steel/20 uppercase">
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
                <h2 className="mt-1 font-display text-xl font-bold uppercase group-hover:text-metals-accent">
                  {p.name}
                </h2>
                {p.short_description && (
                  <p className="mt-1 text-sm text-metals-steel/70 line-clamp-2">{p.short_description}</p>
                )}
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
