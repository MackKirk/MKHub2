import { Link } from 'react-router-dom';

export default function HowItWorks() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      <h1 className="font-display text-4xl font-extrabold uppercase">How it works</h1>
      <ol className="mt-8 space-y-6">
        <li>
          <h2 className="font-display text-2xl font-bold uppercase text-metals-accent">01 · Send your details</h2>
          <p className="mt-2 text-metals-steel/80">
            Browse the catalog or describe a custom piece. Attach a sketch, photo, PDF, or CAD file with dimensions,
            gauge, and colour when you have them.
          </p>
        </li>
        <li>
          <h2 className="font-display text-2xl font-bold uppercase text-metals-accent">02 · We quote & confirm</h2>
          <p className="mt-2 text-metals-steel/80">
            Our estimators review your request in the Mack Kirk Metals hub, send a quote, and confirm production once
            you approve.
          </p>
        </li>
        <li>
          <h2 className="font-display text-2xl font-bold uppercase text-metals-accent">03 · Form, pack, deliver</h2>
          <p className="mt-2 text-metals-steel/80">
            Track status in your account from shop to pickup or job-site delivery.
          </p>
        </li>
      </ol>
      <Link
        to="/quote"
        className="mt-10 inline-block rounded bg-metals-accent px-5 py-3 text-sm font-bold uppercase text-white"
      >
        Get a free estimate
      </Link>
    </div>
  );
}
