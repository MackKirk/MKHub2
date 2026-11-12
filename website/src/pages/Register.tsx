import { FormEvent, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import MkCheckbox from '@/components/MkCheckbox';
import PasswordField from '@/components/PasswordField';
import PasswordStrength from '@/components/PasswordStrength';
import { ApiError, api, persistTokens } from '@/lib/api';

type FieldErrors = {
  name?: string;
  email?: string;
  password?: string;
  confirm?: string;
  terms?: string;
};

export default function Register() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [terms, setTerms] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});

  const passwordsMatch = confirm.length === 0 || password === confirm;
  const passwordOk = password.length >= 8;
  const canSubmit = passwordOk && passwordsMatch && terms && !busy;

  const confirmError = useMemo(() => {
    if (errors.confirm) return errors.confirm;
    if (confirm && password !== confirm) return 'Passwords do not match';
    return null;
  }, [confirm, password, errors.confirm]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const name = String(fd.get('name') || '').trim();
    const email = String(fd.get('email') || '').trim();
    const next: FieldErrors = {};
    if (!name) next.name = 'Name is required';
    if (!email) next.email = 'Email is required';
    if (password.length < 8) next.password = 'Password must be at least 8 characters';
    if (password !== confirm) next.confirm = 'Passwords do not match';
    if (!terms) next.terms = 'You must agree to the Terms and Privacy Policy';
    setErrors(next);
    if (Object.keys(next).length) return;

    setBusy(true);
    try {
      const data = await api<{ access_token: string; refresh_token: string }>(
        'POST',
        '/portal/metals/auth/register',
        {
          email,
          password,
          name,
          company_name: String(fd.get('company_name') || '') || undefined,
          phone: String(fd.get('phone') || '') || undefined,
        },
      );
      persistTokens(data.access_token, data.refresh_token);
      toast.success('Account created');
      navigate('/account?welcome=1', { replace: true });
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Registration failed';
      if (/already exists/i.test(message)) {
        setErrors({ email: message });
      } else {
        toast.error(message);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-16">
      <h1 className="font-display text-4xl font-extrabold tracking-tight">Create account</h1>
      <p className="mt-2 text-sm text-metals-steel/70">
        Track estimates and orders. Use the same email you submitted with to claim past requests.
      </p>
      <form onSubmit={onSubmit} className="mt-8 space-y-4" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="font-medium">Name *</span>
            <input
              name="name"
              required
              autoComplete="name"
              className={`mk-input ${errors.name ? 'border-red-500' : ''}`}
              onChange={() => setErrors((e) => ({ ...e, name: undefined }))}
            />
            {errors.name && <span className="mt-1 block text-xs text-red-600">{errors.name}</span>}
          </label>
          <label className="block text-sm">
            <span className="font-medium">
              Company <span className="font-normal text-metals-steel/55">(Recommended)</span>
            </span>
            <input name="company_name" autoComplete="organization" className="mk-input" />
          </label>
          <label className="block text-sm">
            <span className="font-medium">Email *</span>
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
              className={`mk-input ${errors.email ? 'border-red-500' : ''}`}
              onChange={() => setErrors((e) => ({ ...e, email: undefined }))}
            />
            {errors.email && <span className="mt-1 block text-xs text-red-600">{errors.email}</span>}
          </label>
          <label className="block text-sm">
            <span className="font-medium">
              Phone <span className="font-normal text-metals-steel/55">(Recommended)</span>
            </span>
            <input name="phone" type="tel" autoComplete="tel" className="mk-input" />
          </label>
        </div>

        <div>
          <PasswordField
            label="Password *"
            name="password"
            required
            autoComplete="new-password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setErrors((err) => ({ ...err, password: undefined, confirm: undefined }));
            }}
            helperText="At least 8 characters."
            error={errors.password}
          />
          <PasswordStrength password={password} />
        </div>

        <PasswordField
          label="Confirm password *"
          name="confirm_password"
          required
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => {
            setConfirm(e.target.value);
            setErrors((err) => ({ ...err, confirm: undefined }));
          }}
          error={confirmError}
        />

        <MkCheckbox
          checked={terms}
          onChange={(v) => {
            setTerms(v);
            setErrors((err) => ({ ...err, terms: undefined }));
          }}
          label={
            <>
              I agree to the{' '}
              <Link to="/terms" className="text-metals-accent underline">
                Terms
              </Link>{' '}
              and{' '}
              <Link to="/privacy" className="text-metals-accent underline">
                Privacy Policy
              </Link>
              .
            </>
          }
        />
        {errors.terms && <p className="text-xs text-red-600">{errors.terms}</p>}

        <button type="submit" disabled={!canSubmit} className="mk-btn-primary w-full disabled:opacity-60">
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
