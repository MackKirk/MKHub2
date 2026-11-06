import { Link } from 'react-router-dom';

export default function Contact() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      <h1 className="font-display text-4xl font-extrabold uppercase">Contact</h1>
      <ul className="mt-6 space-y-2 text-metals-steel/80">
        <li>
          Email:{' '}
          <a className="text-metals-accent underline" href="mailto:metals@mackkirk.com">
            metals@mackkirk.com
          </a>
        </li>
        <li>British Columbia, Canada</li>
      </ul>
      <p className="mt-8 text-sm text-metals-steel/70">
        Prefer to send job details online?{' '}
        <Link to="/quote" className="text-metals-accent underline">
          Request a free estimate
        </Link>
        .
      </p>
    </div>
  );
}
