import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ApiError, api, persistTokens } from '@/lib/api';

export default function Register() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    try {
      const data = await api<{ access_token: string; refresh_token: string }>(
        'POST',
        '/portal/metals/auth/register',
        {
          email: String(fd.get('email') || ''),
          password: String(fd.get('password') || ''),
          name: String(fd.get('name') || '') || undefined,
          company_name: String(fd.get('company_name') || '') || undefined,
          phone: String(fd.get('phone') || '') || undefined,
        },
      );
      persistTokens(data.access_token, data.refresh_token);
      toast.success('Account created');
      navigate('/account', { replace: true });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Registration failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <h1 className="font-display text-4xl font-extrabold uppercase">Create account</h1>
      <p className="mt-2 text-sm text-metals-steel/70">
        Track estimates and orders. Use the same email you submitted with to claim past requests.
      </p>
      <form onSubmit={onSubmit} className="mt-8 space-y-4">
        <label className="block text-sm">
          <span className="font-medium">Name</span>
          <input name="name" className="mt-1 w-full rounded border border-metals-mist bg-white px-3 py-2" />
        </label>
        <label className="block text-sm">
          <span className="font-medium">Company</span>
          <input name="company_name" className="mt-1 w-full rounded border border-metals-mist bg-white px-3 py-2" />
        </label>
        <label className="block text-sm">
          <span className="font-medium">Email *</span>
          <input name="email" type="email" required className="mt-1 w-full rounded border border-metals-mist bg-white px-3 py-2" />
        </label>
        <label className="block text-sm">
          <span className="font-medium">Phone</span>
          <input name="phone" className="mt-1 w-full rounded border border-metals-mist bg-white px-3 py-2" />
        </label>
        <label className="block text-sm">
          <span className="font-medium">Password *</span>
          <input name="password" type="password" required minLength={8} className="mt-1 w-full rounded border border-metals-mist bg-white px-3 py-2" />
        </label>
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded bg-metals-accent py-3 text-sm font-bold uppercase text-white disabled:opacity-60"
        >
          {busy ? 'Creating…' : 'Create account'}
        </button>
      </form>
      <p className="mt-4 text-sm text-metals-steel/70">
        Already have an account?{' '}
        <Link to="/login" className="text-metals-accent underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
