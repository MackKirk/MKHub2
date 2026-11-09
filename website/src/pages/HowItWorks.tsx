import { Link } from 'react-router-dom';

const STEPS = [
  {
    n: '01',
    t: 'Send your details',
    d: 'Browse the catalog or describe a custom piece. Attach a sketch, photo, PDF, or CAD file with dimensions, gauge, and colour when you have them.',
  },
  {
    n: '02',
    t: 'We quote & confirm',
    d: 'Our estimators review your request in the Mack Kirk Metals hub, send a quote priced to your job, and confirm production once you approve.',
  },
  {
    n: '03',
    t: 'Form, pack, deliver',
    d: 'We brake or roll-form to spec, then pack for pickup or job-site delivery. Track status in your account from shop floor to site.',
  },
];

export default function HowItWorks() {
  return (
    <div>
      <section className="mk-page-band">
        <div className="mx-auto max-w-3xl px-4 py-14">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/50">Process</p>
          <h1 className="mt-3 font-display text-4xl font-extrabold tracking-tight md:text-5xl">
            How it works
          </h1>
          <p className="mt-3 text-white/70">
            Three steps from your drawing to formed metal — wired into our shop operations.
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-3xl px-4 py-14">
        <ol className="space-y-0">
          {STEPS.map((step, i) => (
            <li
              key={step.n}
              className={`py-8 ${i < STEPS.length - 1 ? 'border-b border-metals-mist' : ''}`}
            >
              <p className="font-display text-3xl font-extrabold text-metals-accent">{step.n}</p>
              <h2 className="mt-2 font-display text-2xl font-bold">{step.t}</h2>
              <p className="mt-3 text-metals-steel/80 leading-relaxed">{step.d}</p>
            </li>
          ))}
        </ol>
        <Link to="/quote" className="mk-btn-primary mt-10">
          Free estimate
        </Link>
      </div>
    </div>
  );
}
