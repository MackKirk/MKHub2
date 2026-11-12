import { Link } from 'react-router-dom';

export default function Contact() {
  return (
    <div>
      <section className="mk-page-band">
        <div className="mx-auto max-w-3xl px-4 py-14">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/50">Langley shop</p>
          <h1 className="mt-3 font-display text-4xl font-extrabold tracking-tight md:text-5xl">
            Contact
          </h1>
          <p className="mt-3 text-white/70">
            Reach the metals shop, or send job details online for a quote.
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-3xl px-4 py-14">
        <div className="grid gap-6 sm:grid-cols-2">
          <div className="border border-metals-mist bg-white p-6">
            <p className="text-xs font-semibold uppercase tracking-wider text-metals-steel/50">Address</p>
            <p className="mt-3 text-metals-ink">9552 – 198 St</p>
            <p className="text-metals-ink">Langley BC V1M 3C8</p>
          </div>
          <div className="border border-metals-mist bg-white p-6">
            <p className="text-xs font-semibold uppercase tracking-wider text-metals-steel/50">Phone & email</p>
            <p className="mt-3">
              <a href="tel:+16042587121" className="font-medium text-metals-accent hover:underline">
                (604) 258-7121
              </a>
            </p>
            <p className="mt-2">
              <a href="mailto:metals@mackkirk.com" className="text-metals-accent hover:underline">
                metals@mackkirk.com
              </a>
            </p>
            <p className="mt-1 text-sm text-metals-steel/65">
              Main office:{' '}
              <a href="mailto:info@mackkirk.com" className="underline hover:text-metals-ink">
                info@mackkirk.com
              </a>
            </p>
          </div>
        </div>

        <p className="mt-10 text-sm text-metals-steel/75">
          Prefer to send drawings and run lengths online?
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link to="/quote" className="mk-btn-primary">
            Free estimate
          </Link>
          <Link to="/orders" className="mk-btn-outline">
            Place an order
          </Link>
        </div>
      </div>
    </div>
  );
}
