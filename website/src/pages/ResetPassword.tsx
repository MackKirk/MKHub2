import { FormEvent, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import PasswordField from '@/components/PasswordField';
import PasswordStrength from '@/components/PasswordStrength';
import { ApiError, api } from '@/lib/api';

export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);

  const confirmError = useMemo(() => {
    if (confirm && password !== confirm) return 'Passwords do not match';
    return null;
  }, [confirm, password]);

  const canSubmit =
    Boolean(token) && password.length >= 8 && password === confirm && !busy && !confirmError;

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!token) {
      setError('Missing reset token. Open the link from your email again.');
      return;
    }
    if (password.length < 8 || password !== confirm) return;
    setBusy(true);
    setError(null);
    try {
      await api('POST', '/portal/metals/auth/reset-password', {
        token,
        new_password: password,
      });
      toast.success('Password updated — sign in with your new password');
      navigate('/login', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Reset failed');
    } finally {
      setBusy(false);
    }
  }

  if (!token) {
    return (
      <div className="mx-auto max-w-md px-4 py-16">
        <h1 className="font-display text-4xl font-extrabold tracking-tight">Reset password</h1>
        <p className="mt-4 text-sm text-red-600">
          Missing reset token. Request a new link from the forgot password page.
        </p>
        <Link to="/forgot-password" className="mt-4 inline-block text-metals-accent underline">
          Forgot password
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <h1 className="font-display text-4xl font-extrabold tracking-tight">Choose a new password</h1>
      <p className="mt-2 text-sm text-metals-steel/70">Enter a new password for your Metals account.</p>
      <form onSubmit={onSubmit} className="mt-8 space-y-4">
        <div>
          <PasswordField
            label="New password *"
            required
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            helperText="At least 8 characters."
          />
          <PasswordStrength password={password} />
        </div>
        <PasswordField
          label="Confirm password *"
          required
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          error={confirmError}
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button type="submit" disabled={!canSubmit} className="mk-btn-primary w-full disabled:opacity-60">
          {busy ? 'Updating…' : 'Update password'}
        </button>
      </form>
    </div>
  );
}
