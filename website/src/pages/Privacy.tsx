import { Link } from 'react-router-dom';

export default function Privacy() {
  return (
    <div>
      <section className="mk-page-band">
        <div className="mx-auto max-w-3xl px-4 py-14">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/50">Legal</p>
          <h1 className="mt-3 font-display text-4xl font-extrabold tracking-tight md:text-5xl">
            Privacy policy
          </h1>
          <p className="mt-3 text-white/70">How Mack Kirk Metals handles your account and job details.</p>
        </div>
      </section>
      <div className="mx-auto max-w-3xl space-y-5 px-4 py-14 text-sm leading-relaxed text-metals-steel/85">
        <p>
          We collect information you provide when registering or submitting estimates and orders —
          such as name, company, email, phone, project details, and uploaded drawings — so we can
          quote, produce, and communicate about your work.
        </p>
        <p>
          Account data and submissions are used for Mack Kirk Metals operations (estimating, shop
          production, delivery/pickup coordination) and related customer support. We do not sell your
          personal information.
        </p>
        <p>
          Files and notes you upload may be stored in our systems and visible to authorized Mack Kirk
          staff. Keep passwords confidential; use the reset flow if you believe your account was
          compromised.
        </p>
        <p>
          This page is a placeholder privacy notice for the Metals website. For privacy questions,
          email{' '}
          <a href="mailto:metals@mackkirk.com" className="text-metals-accent underline">
            metals@mackkirk.com
          </a>{' '}
          or{' '}
          <a href="mailto:info@mackkirk.com" className="text-metals-accent underline">
            info@mackkirk.com
          </a>
          , or call (604) 258-7121.
        </p>
        <p>
          See also our{' '}
          <Link to="/terms" className="text-metals-accent underline">
            Terms of use
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
