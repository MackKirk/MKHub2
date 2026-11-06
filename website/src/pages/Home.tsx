import { Link } from 'react-router-dom';

export default function Home() {
  return (
    <div>
      <section className="relative overflow-hidden bg-metals-ink text-white">
        <div
          className="absolute inset-0 opacity-40"
          style={{
            background:
              'radial-gradient(ellipse at 20% 20%, rgba(196,92,38,0.35), transparent 50%), linear-gradient(135deg, #1a1e24 0%, #0d0f12 60%)',
          }}
        />
        <div className="relative mx-auto max-w-6xl px-4 py-24 md:py-32">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-metals-accent">
            Custom metal forming · British Columbia
          </p>
          <h1 className="mt-4 max-w-3xl font-display text-5xl font-extrabold uppercase leading-none md:text-7xl">
            From sketch to finished metal — <span className="text-metals-accent">fast</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg text-white/75">
            Precision flashings, panels, and trims for contractors. Browse the catalog, send a drawing,
            get an estimate — then track your order in your account.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              to="/quote"
              className="rounded bg-metals-accent px-5 py-3 text-sm font-bold uppercase tracking-wide hover:bg-metals-accentDark"
            >
              Get a free estimate
            </Link>
            <Link
              to="/catalog"
              className="rounded border border-white/30 px-5 py-3 text-sm font-bold uppercase tracking-wide hover:bg-white/10"
            >
              View catalog
            </Link>
          </div>
          <div className="mt-10 flex flex-wrap gap-2 text-xs uppercase tracking-wide text-white/60">
            {['Flashings', 'Panels', 'Trims', 'Custom forming'].map((t) => (
              <span key={t} className="rounded border border-white/20 px-3 py-1">
                {t}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16">
        <h2 className="font-display text-3xl font-bold uppercase">How it works</h2>
        <p className="mt-2 max-w-2xl text-metals-steel/80">
          Three steps from idea to delivery — fully connected to Mack Kirk Metals operations.
        </p>
        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {[
            {
              n: '01',
              t: 'Pick or sketch',
              d: 'Choose a catalog profile or send a photo, DXF, or rough drawing with dimensions.',
            },
            {
              n: '02',
              t: 'Estimate or order',
              d: 'Submit online. Our team quotes same-day when we can, then confirms production.',
            },
            {
              n: '03',
              t: 'Track & receive',
              d: 'Create an account to follow status from shop floor to pickup or delivery.',
            },
          ].map((step) => (
            <div key={step.n} className="border border-metals-mist bg-white p-6">
              <p className="font-display text-4xl font-bold text-metals-accent">{step.n}</p>
              <h3 className="mt-3 font-display text-xl font-bold uppercase">{step.t}</h3>
              <p className="mt-2 text-sm text-metals-steel/80">{step.d}</p>
            </div>
          ))}
        </div>
        <div className="mt-10">
          <Link to="/how-it-works" className="text-sm font-semibold text-metals-accent hover:underline">
            Learn more →
          </Link>
        </div>
      </section>

      <section className="bg-metals-ink py-16 text-white">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 px-4 md:flex-row md:items-center">
          <div>
            <h2 className="font-display text-3xl font-bold uppercase">Ready to start?</h2>
            <p className="mt-2 text-white/70">Send your run details and get a free estimate.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              to="/quote"
              className="rounded bg-metals-accent px-5 py-3 text-sm font-bold uppercase tracking-wide hover:bg-metals-accentDark"
            >
              Free estimate
            </Link>
            <Link
              to="/orders"
              className="rounded border border-white/30 px-5 py-3 text-sm font-bold uppercase tracking-wide hover:bg-white/10"
            >
              Place an order
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
