import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Eye, EyeOff, Lock, LogIn, Mail } from 'lucide-react';
import { ApiError, persistPortalTokens, portalApi } from '@/lib/api';
import PortalAuthLayout from '@/components/PortalAuthLayout';
import { AppButton, AppInput, uiCx, uiRadius, uiTypography } from '@/lib/ui';

const LOGIN_EMAIL_KEY = 'mkhub-portal-login-email';

function readSavedEmail(): string {
  try {
    return (localStorage.getItem(LOGIN_EMAIL_KEY) || '').trim();
  } catch {
    return '';
  }
}

function saveEmail(value: string) {
  try {
    const next = value.trim();
    if (next) localStorage.setItem(LOGIN_EMAIL_KEY, next);
    else localStorage.removeItem(LOGIN_EMAIL_KEY);
  } catch {
    /* ignore */
  }
}

function scrollFocusedFieldIntoView(target: EventTarget | null) {
  const el = target instanceof HTMLElement ? target : null;
  if (!el) return;
  window.setTimeout(() => {
    el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
  }, 350);
}

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState(readSavedEmail);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!email.trim() || !password) {
      const msg = 'Incorrect email or password.';
      setError(msg);
      toast.error(msg);
      return;
    }
    setBusy(true);
    setError('');
    saveEmail(email);
    try {
      const data = await portalApi<{ access_token: string; refresh_token: string }>(
        'POST',
        '/portal/hub/auth/login',
        { email: email.trim(), password },
      );
      persistPortalTokens(data.access_token, data.refresh_token);
      navigate('/');
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Login failed';
      setError(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <PortalAuthLayout>
      <h2 className="text-xl font-semibold text-gray-900">Customer Portal Sign in</h2>
      <p className={uiCx(uiTypography.helper, 'mt-1 mb-5')}>
        Sign in with the email from your invitation to follow your projects.
      </p>
      <form onSubmit={onSubmit} className="space-y-4">
        <AppInput
          id="portal-login-email"
          name="email"
          label="Email"
          type="email"
          placeholder="you@company.com"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (error) setError('');
          }}
          autoComplete="email"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          required
          onFocus={(e) => scrollFocusedFieldIntoView(e.target)}
          leftIcon={<Mail className="h-4 w-4" />}
        />
        <AppInput
          id="portal-login-password"
          name="password"
          label="Password"
          type={showPassword ? 'text' : 'password'}
          placeholder="Enter your password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            if (error) setError('');
          }}
          autoComplete="current-password"
          required
          onFocus={(e) => scrollFocusedFieldIntoView(e.target)}
          leftIcon={<Lock className="h-4 w-4" />}
          rightIcon={
            <button
              type="button"
              className="flex h-7 w-7 items-center justify-center rounded-md text-gray-400 hover:text-gray-700"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          }
        />
        {error ? (
          <div
            className={uiCx('border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800', uiRadius.control)}
            role="alert"
          >
            {error}
          </div>
        ) : null}
        <AppButton
          type="submit"
          className="w-full"
          size="lg"
          disabled={busy}
          loading={busy}
          leftIcon={<LogIn className="h-4 w-4" />}
        >
          {busy ? 'Signing in…' : 'Sign in'}
        </AppButton>
      </form>
      <p className={uiCx(uiTypography.helper, 'mt-4 text-center')}>
        Access is by invitation only. Staff invite you from your company record in MK Hub.
      </p>
      <p className="mt-3 text-center text-sm">
        <Link to="/accept-invite" className="font-semibold text-brand-red hover:text-brand-red/80">
          Have an invite link?
        </Link>
      </p>
      <div className="mt-6 border-t border-gray-100 pt-4 text-center text-sm text-gray-600">
        <a
          href="/privacy-policy"
          className="font-semibold underline decoration-gray-300 underline-offset-4 hover:text-brand-red"
        >
          Privacy Policy
        </a>
      </div>
    </PortalAuthLayout>
  );
}
