import { Link } from 'react-router-dom';

export default function Terms() {
  return (
    <div>
      <section className="mk-page-band">
        <div className="mx-auto max-w-3xl px-4 py-14">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/50">Legal</p>
          <h1 className="mt-3 font-display text-4xl font-extrabold tracking-tight md:text-5xl">
            Terms of use
          </h1>
          <p className="mt-3 text-white/70">Mack Kirk Metals customer website and account.</p>
        </div>
      </section>
      <div className="mx-auto max-w-3xl space-y-5 px-4 py-14 text-sm leading-relaxed text-metals-steel/85">
        <p>
          By creating an account or submitting an estimate or order through this website, you agree to
          use the service for legitimate business purposes related to custom metal forming, flashings,
          panels, and related products from Mack Kirk Metals.
        </p>
        <p>
          Quotes and orders submitted online are requests only until confirmed by our shop. Pricing,
          lead times, and availability may change based on material, gauge, colour, and shop capacity.
          You are responsible for the accuracy of dimensions, profiles, and files you upload.
        </p>
        <p>
          Account credentials are personal to you. Do not share your password. We may suspend accounts
          that misuse the service or submit fraudulent requests.
        </p>
        <p>
          These terms are a placeholder for customer-facing use of the Mack Kirk Metals website and may
          be updated. For questions, contact{' '}
          <a href="mailto:metals@mackkirk.com" className="text-metals-accent underline">
            metals@mackkirk.com
          </a>{' '}
          or call{' '}
          <a href="tel:+16042587121" className="text-metals-accent underline">
            (604) 258-7121
          </a>{' '}
          (9552 – 198 St, Langley BC V1M 3C8).
        </p>
        <p>
          See also our{' '}
          <Link to="/privacy" className="text-metals-accent underline">
            Privacy Policy
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
