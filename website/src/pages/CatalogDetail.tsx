import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, type CatalogProduct } from '@/lib/api';

export default function CatalogDetail() {
  const { slug } = useParams();
  const [product, setProduct] = useState<CatalogProduct | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return;
    api<CatalogProduct>('GET', `/public/metals/catalog/${encodeURIComponent(slug)}`)
      .then(setProduct)
      .catch((e) => setError(e.message || 'Not found'));
  }, [slug]);

  if (error) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16">
        <p className="text-red-600">{error}</p>
        <Link to="/catalog" className="mt-4 inline-block text-metals-accent">
          ← Back to catalog
        </Link>
      </div>
    );
  }

  if (!product) {
    return <div className="mx-auto max-w-3xl px-4 py-16 text-sm text-metals-steel/70">Loading…</div>;
  }

  const quoteParams = new URLSearchParams({
    product: product.slug,
    product_id: product.id,
    name: product.name,
  });
  const orderParams = new URLSearchParams({
    product: product.slug,
    product_id: product.id,
    name: product.name,
  });

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <Link to="/catalog" className="text-sm text-metals-accent hover:underline">
        ← Catalog
      </Link>
      <div className="mt-6 grid gap-10 md:grid-cols-2">
        <div className="aspect-square bg-metals-mist/50 border border-metals-mist flex items-center justify-center overflow-hidden">
          {product.image_url ? (
            <img src={product.image_url} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="font-display text-6xl font-bold text-metals-steel/15 uppercase">
              {product.name}
            </span>
          )}
        </div>
        <div>
          {product.category && (
            <p className="text-xs font-semibold uppercase tracking-wider text-metals-accent">
              {product.category.name}
            </p>
          )}
          <h1 className="mt-2 font-display text-4xl font-extrabold uppercase">{product.name}</h1>
          {product.short_description && (
            <p className="mt-3 text-metals-steel/80">{product.short_description}</p>
          )}
          {product.description && (
            <p className="mt-4 whitespace-pre-wrap text-sm text-metals-steel/80">{product.description}</p>
          )}
          {product.specs && Object.keys(product.specs).length > 0 && (
            <div className="mt-6 border-t border-metals-mist pt-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-metals-steel/50">Specs</p>
              <ul className="mt-2 space-y-1 text-sm">
                {Object.entries(product.specs).map(([k, v]) => (
                  <li key={k}>
                    <span className="font-medium capitalize">{k.replace(/_/g, ' ')}:</span>{' '}
                    {Array.isArray(v) ? v.join(', ') : String(v)}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              to={`/quote?${quoteParams.toString()}`}
              className="rounded bg-metals-accent px-4 py-2.5 text-sm font-bold uppercase text-white hover:bg-metals-accentDark"
            >
              Get estimate
            </Link>
            <Link
              to={`/orders?${orderParams.toString()}`}
              className="rounded border border-metals-ink px-4 py-2.5 text-sm font-bold uppercase hover:bg-metals-ink hover:text-white"
            >
              Add to order
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
