import { FormEvent, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import PasswordField from '@/components/PasswordField';
import { ApiError, api, persistTokens } from '@/lib/api';

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from || '/account';
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    setFormError(null);
    try {
      const data = await api<{ access_token: string; refresh_token: string }>('POST', '/portal/metals/auth/login', {
        email: String(fd.get('email') || ''),
        password: String(fd.get('password') || ''),
      });
      persistTokens(data.access_token, data.refresh_token);
      toast.success('Signed in');
      navigate(from, { replace: true });
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Sign in failed';
      setFormError(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <h1 className="font-display text-4xl font-extrabold tracking-tight">Sign in</h1>
      <p className="mt-2 text-sm text-metals-steel/70">Access your Mack Kirk Metals account.</p>
      <form onSubmit={onSubmit} className="mt-8 space-y-4">
        <label className="block text-sm">
          <span className="font-medium">Email</span>
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            className={`mk-input ${formError ? 'border-red-500' : ''}`}
            onChange={() => setFormError(null)}
          />
        </label>
        <PasswordField
          label="Password"
          name="password"
          required
          autoComplete="current-password"
          minLength={8}
          error={formError}
          onChange={() => setFormError(null)}
        />
        <div className="flex justify-end">
          <Link to="/forgot-password" className="text-sm text-metals-accent hover:underline">
            Forgot password?
          </Link>
        </div>
        <button type="submit" disabled={busy} className="mk-btn-primary w-full disabled:opacity-60">
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
