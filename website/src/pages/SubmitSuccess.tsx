import { Link, useSearchParams } from 'react-router-dom';
import { getToken } from '@/lib/api';

export default function SubmitSuccess() {
  const [params] = useSearchParams();
  const code = params.get('code') || '';
  const kind = params.get('kind') || 'estimate';
  const loggedIn = Boolean(getToken());

  return (
    <div className="mx-auto max-w-xl px-4 py-20 text-center">
      <p className="text-xs font-semibold uppercase tracking-wider text-metals-accent">Submitted</p>
      <h1 className="mt-3 font-display text-4xl font-extrabold tracking-tight">
        {kind === 'order' ? 'Order received' : 'Estimate request received'}
      </h1>
      {code && (
        <p className="mt-4 text-sm text-metals-steel/70">
          Reference: <span className="font-semibold text-metals-ink">{code}</span>
        </p>
      )}
      <p className="mt-4 text-metals-steel/80">
        Our shop team will review and follow up by email. Create an account with the same email to
        track status online.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        {loggedIn ? (
          <Link to="/account" className="mk-btn-primary">
            Go to account
          </Link>
        ) : (
          <Link to="/register" className="mk-btn-primary">
            Create account to track
          </Link>
        )}
        <Link to="/catalog" className="mk-btn-outline">
          Back to catalog
        </Link>
      </div>
    </div>
  );
}
