import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError, api } from '@/lib/api';

export default function ForgotPassword() {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      await api('POST', '/portal/metals/auth/forgot-password', {
        email: String(fd.get('email') || ''),
      });
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Request failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <h1 className="font-display text-4xl font-extrabold tracking-tight">Forgot password</h1>
      <p className="mt-2 text-sm text-metals-steel/70">
        Enter the email for your Mack Kirk Metals account and we&apos;ll send a reset link if it exists.
      </p>
      {done ? (
        <div className="mt-8 border border-metals-mist bg-white p-5 text-sm text-metals-steel/85">
          <p>
            If an account exists for that email, we sent a password reset link. Check your inbox (and
            spam folder). The link expires in one hour.
          </p>
          <Link to="/login" className="mt-4 inline-block text-metals-accent underline">
            Back to sign in
          </Link>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="mt-8 space-y-4">
          <label className="block text-sm">
            <span className="font-medium">Email</span>
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
              className={`mk-input ${error ? 'border-red-500' : ''}`}
            />
            {error && <span className="mt-1 block text-xs text-red-600">{error}</span>}
          </label>
          <button type="submit" disabled={busy} className="mk-btn-primary w-full disabled:opacity-60">
            {busy ? 'Sending…' : 'Send reset link'}
          </button>
          <p className="text-sm text-metals-steel/70">
            <Link to="/login" className="text-metals-accent underline">
              Back to sign in
            </Link>
          </p>
        </form>
      )}
    </div>
  );
}
