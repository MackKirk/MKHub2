import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type CatalogProduct, type CatalogResponse } from '@/lib/api';

const HERO_IMG = `${import.meta.env.BASE_URL}assets/media/hero.jpg`;
const LOGO = `${import.meta.env.BASE_URL}assets/brand/mkm-logo.png`;

const STEPS = [
  {
    n: '01',
    t: 'Send the profile',
    d: 'Pick a catalog product or attach a sketch, photo, PDF, or DXF with run lengths, gauge, and colour.',
  },
  {
    n: '02',
    t: 'We quote the job',
    d: 'Estimators review in our shop hub and price to your specs — same day when we can.',
  },
  {
    n: '03',
    t: 'Form & deliver',
    d: 'Track production in your account from brake to pickup or job-site delivery.',
  },
];

export default function Home() {
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [heroBg, setHeroBg] = useState(false);

  useEffect(() => {
    const img = new Image();
    img.onload = () => setHeroBg(true);
    img.onerror = () => setHeroBg(false);
    img.src = HERO_IMG;
  }, []);

  useEffect(() => {
    let cancelled = false;
    api<CatalogResponse>('GET', '/public/metals/catalog')
      .then((res) => {
        if (!cancelled) setProducts((res.items || []).slice(0, 6));
      })
      .catch(() => {
        if (!cancelled) setProducts([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div>
      <section
        className="relative overflow-hidden mk-hero-slant mk-page-band min-h-[78vh] flex items-end md:items-center"
        style={
          heroBg
            ? {
                backgroundImage: `linear-gradient(105deg, rgba(28,30,34,0.92) 0%, rgba(28,30,34,0.72) 45%, rgba(28,30,34,0.55) 100%), url(${HERO_IMG})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
              }
            : undefined
        }
      >
        {!heroBg && (
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                'radial-gradient(ellipse at 15% 20%, rgba(209,22,22,0.22), transparent 48%), radial-gradient(ellipse at 85% 70%, rgba(212,175,55,0.08), transparent 40%), linear-gradient(135deg, #2a2d31 0%, #1c1e22 55%, #121316 100%)',
            }}
          />
        )}
        <div className="relative mx-auto w-full max-w-6xl px-4 py-20 md:py-28 animate-mkFadeUp">
          <img src={LOGO} alt="Mack Kirk Metals" className="h-14 w-auto md:h-16" />
          <h1 className="mt-8 max-w-3xl font-display text-4xl font-extrabold leading-tight tracking-tight text-white md:text-6xl">
            Profiles formed to the job — not pulled off a shelf
          </h1>
          <p className="mt-5 max-w-xl text-base text-white/75 md:text-lg">
            Custom flashings, panels, and trims from our Langley shop. Browse the catalog, send run
            details, and get a quote tied straight into production.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/quote" className="mk-btn-primary transition-transform hover:scale-[1.02]">
              Free estimate
            </Link>
            <Link to="/catalog" className="mk-btn-ghost">
              View catalog
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-metals-accent">Catalog</p>
            <h2 className="mt-2 font-display text-3xl font-bold tracking-tight md:text-4xl">
              Shop profiles
            </h2>
            <p className="mt-2 max-w-xl text-metals-steel/75">
              Panels, trims, and flashings formed to your run. Pricing is quoted to the job.
            </p>
          </div>
          <Link to="/catalog" className="text-sm font-semibold text-metals-accent hover:underline">
            Full catalog →
          </Link>
        </div>

        {products.length === 0 ? (
          <div className="mt-10 border border-metals-mist bg-white p-8">
            <p className="text-sm text-metals-steel/75">
              Catalog products will show here once published. Need something custom now?
            </p>
            <Link to="/quote" className="mk-btn-primary mt-4">
              Request an estimate
            </Link>
          </div>
        ) : (
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {products.map((p) => (
              <Link
                key={p.id}
                to={`/catalog/${p.slug}`}
                className="group border border-metals-mist bg-white overflow-hidden transition-colors hover:border-metals-accent/55"
              >
                <div className="aspect-[4/3] bg-metals-mist/60 flex items-center justify-center overflow-hidden">
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
                  <h3 className="mt-1 font-display text-lg font-bold">{p.name}</h3>
                  {p.short_description && (
                    <p className="mt-1 line-clamp-2 text-sm text-metals-steel/70">{p.short_description}</p>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="border-y border-metals-mist bg-white py-16">
        <div className="mx-auto max-w-6xl px-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-metals-accent">Process</p>
          <h2 className="mt-2 font-display text-3xl font-bold tracking-tight md:text-4xl">
            How it works
          </h2>
          <p className="mt-2 max-w-2xl text-metals-steel/75">
            From your drawing to the brake — connected straight into Mack Kirk Metals operations.
          </p>
          <div className="mt-10 grid gap-0 md:grid-cols-3">
            {STEPS.map((step, i) => (
              <div
                key={step.n}
                className={`relative px-0 py-4 md:px-6 md:py-2 ${
                  i < STEPS.length - 1 ? 'md:border-r md:border-metals-mist' : ''
                }`}
              >
                <p className="font-display text-4xl font-extrabold text-metals-accent/90">{step.n}</p>
                <h3 className="mt-3 font-display text-xl font-bold">{step.t}</h3>
                <p className="mt-2 text-sm leading-relaxed text-metals-steel/75">{step.d}</p>
              </div>
            ))}
          </div>
          <Link
            to="/how-it-works"
            className="mt-10 inline-block text-sm font-semibold text-metals-accent hover:underline"
          >
            Learn more →
          </Link>
        </div>
      </section>

      <section className="mk-page-band py-14">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 px-4 md:flex-row md:items-center">
          <div>
            <h2 className="font-display text-3xl font-bold tracking-tight">Ready to start?</h2>
            <p className="mt-2 text-white/70">
              Send run lengths and profiles — we quote to the job.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link to="/quote" className="mk-btn-primary">
              Free estimate
            </Link>
            <Link to="/orders" className="mk-btn-ghost">
              Place an order
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
