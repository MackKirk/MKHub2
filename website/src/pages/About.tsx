import { Link } from 'react-router-dom';

export default function About() {
  return (
    <div>
      <section className="mk-page-band">
        <div className="mx-auto max-w-3xl px-4 py-14">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-metals-gold">Since 1908</p>
          <h1 className="mt-3 font-display text-4xl font-extrabold tracking-tight md:text-5xl">
            About Mack Kirk Metals
          </h1>
          <p className="mt-3 text-white/70">
            The metal-forming division of Mack Kirk — shop quality, field-ready practicality.
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-3xl space-y-6 px-4 py-14 text-metals-steel/85 leading-relaxed">
        <p>
          Mack Kirk Metals is the fabrication arm of Mack Kirk, built for BC contractors who need custom
          flashings, panels, and trims formed to the job — not pulled off a shelf. From our Langley
          shop we brake complex profiles, roll-form roof and wall panels, and supply the accessories
          that make installs clean and warrantable.
        </p>
        <p>
          Rooted in a company that has served British Columbia since 1908, we combine in-house brake
          forming, roll forming, and specialty fabrication under one roof. Whether you need supply-only
          with delivery or coordination with Mack Kirk field crews, the same shop standards apply.
        </p>
        <p>
          This website connects your estimate and order requests directly into our operations hub, so
          details move from your inbox to the shop floor without retyping.
        </p>
        <div className="border border-metals-mist bg-white p-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-metals-steel/50">Shop</p>
          <p className="mt-2 font-medium text-metals-ink">9552 – 198 St, Langley BC V1M 3C8</p>
          <p className="mt-1">
            <a href="tel:+16042587121" className="text-metals-accent hover:underline">
              (604) 258-7121
            </a>
          </p>
        </div>
        <Link to="/quote" className="mk-btn-primary">
          Free estimate
        </Link>
      </div>
    </div>
  );
}
