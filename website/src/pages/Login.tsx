import { FormEvent, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ApiError, api, persistTokens } from '@/lib/api';

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from || '/account';
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    try {
      const data = await api<{ access_token: string; refresh_token: string }>('POST', '/portal/metals/auth/login', {
        email: String(fd.get('email') || ''),
        password: String(fd.get('password') || ''),
      });
      persistTokens(data.access_token, data.refresh_token);
      toast.success('Signed in');
      navigate(from, { replace: true });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Sign in failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <h1 className="font-display text-4xl font-extrabold uppercase">Sign in</h1>
      <p className="mt-2 text-sm text-metals-steel/70">Access your Mack Kirk Metals account.</p>
      <form onSubmit={onSubmit} className="mt-8 space-y-4">
        <label className="block text-sm">
          <span className="font-medium">Email</span>
          <input name="email" type="email" required className="mt-1 w-full rounded border border-metals-mist bg-white px-3 py-2" />
        </label>
        <label className="block text-sm">
          <span className="font-medium">Password</span>
          <input name="password" type="password" required minLength={8} className="mt-1 w-full rounded border border-metals-mist bg-white px-3 py-2" />
        </label>
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded bg-metals-accent py-3 text-sm font-bold uppercase text-white disabled:opacity-60"
        >
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
      <p className="mt-4 text-sm text-metals-steel/70">
        No account?{' '}
        <Link to="/register" className="text-metals-accent underline">
          Create one
        </Link>
      </p>
    </div>
  );
}
