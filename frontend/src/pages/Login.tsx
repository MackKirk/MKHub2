import { useEffect, useRef, useState } from 'react';
import { ApiError, api, persistSessionTokens } from '@/lib/api';
import { LOGIN_TOAST_ID, lockSecondsForFailures, parseRetryAfterSeconds } from '@/lib/loginThrottle';
import { resolvePostAuthDestination } from '@/lib/profileCompleteness';
import { useLocation, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  CalendarDays,
  Clock,
  Eye,
  EyeOff,
  FileText,
  GraduationCap,
  HardHat,
  Lock,
  LogIn,
  Package,
  Truck,
  UserRound,
  Users,
} from 'lucide-react';
import LoginAppDownloadHint from '@/components/LoginAppDownloadHint';
import {
  AppButton,
  AppCheckbox,
  AppFormModal,
  AppInput,
  uiCx,
  uiLayout,
  uiRadius,
  uiSpacing,
  uiTypography,
} from '@/components/ui';

const LOGO_SRC = '/ui/assets/login/logo-light.svg';
const LOGIN_BG_SRC = '/ui/assets/login/background.jpg';

const LOGIN_FEATURES = [
  { label: 'Customers', Icon: Users },
  { label: 'Proposals', Icon: FileText },
  { label: 'Inventory', Icon: Package },
  { label: 'Projects', Icon: HardHat },
  { label: 'Clock in/out', Icon: Clock },
  { label: 'Training', Icon: GraduationCap },
  { label: 'Fleet', Icon: Truck },
  { label: 'Time off', Icon: CalendarDays },
] as const;
const LOGIN_IDENTIFIER_KEY = 'mkhub-login-identifier';

function readSavedIdentifier(): string {
  try {
    return (localStorage.getItem(LOGIN_IDENTIFIER_KEY) || '').trim();
  } catch {
    return '';
  }
}

function saveIdentifier(value: string) {
  try {
    const next = value.trim();
    if (next) localStorage.setItem(LOGIN_IDENTIFIER_KEY, next);
    else localStorage.removeItem(LOGIN_IDENTIFIER_KEY);
  } catch {
    /* ignore quota / private mode */
  }
}

const LOGIN_ERROR_CREDENTIALS = 'Incorrect username or password.';
const LOGIN_ERROR_DEACTIVATED =
  'This account has been deactivated. Please contact your company administration.';
const LOGIN_ERROR_GENERIC = 'Login failed. Please try again.';

function scrollFocusedFieldIntoView(target: EventTarget | null) {
  const el = target instanceof HTMLElement ? target : null;
  if (!el) return;
  window.setTimeout(() => {
    el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
  }, 350);
}

function loginErrorMessage(raw: unknown, status?: number): string {
  const message = String(raw || '').trim();
  const lower = message.toLowerCase();
  if (status === 429 || lower.includes('too many login attempts') || lower.includes('too many requests')) {
    return message || 'Too many login attempts. Please wait and try again.';
  }
  if (!message || lower === 'unauthorized' || lower === 'invalid credentials') {
    return LOGIN_ERROR_CREDENTIALS;
  }
  if (lower.includes('deactivated') || lower.includes('not active') || lower.includes('inactive')) {
    return LOGIN_ERROR_DEACTIVATED;
  }
  return message || LOGIN_ERROR_GENERIC;
}

function showLoginError(message: string) {
  toast.error(message, { id: LOGIN_TOAST_ID });
}

export default function Login() {
  const [identifier, setIdentifier] = useState(readSavedIdentifier);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState('');
  const [forgotPasswordOpen, setForgotPasswordOpen] = useState(false);
  const [forgotIdentifier, setForgotIdentifier] = useState('');
  const [forgotPasswordSent, setForgotPasswordSent] = useState(false);
  const [loggingIn, setLoggingIn] = useState(false);
  const [fieldFocused, setFieldFocused] = useState(false);
  const [consecutiveFailures, setConsecutiveFailures] = useState(0);
  const [lockUntil, setLockUntil] = useState(0);
  const [lockRemaining, setLockRemaining] = useState(0);
  const submitLockRef = useRef(false);
  const nav = useNavigate();
  const loc = useLocation() as { state?: { from?: string } };

  useEffect(() => {
    if (!lockUntil) {
      setLockRemaining(0);
      return;
    }
    const tick = () => {
      const left = Math.max(0, Math.ceil((lockUntil - Date.now()) / 1000));
      setLockRemaining(left);
      if (left <= 0) setLockUntil(0);
    };
    tick();
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, [lockUntil]);

  const startCooldown = (seconds: number) => {
    if (seconds <= 0) return;
    setLockUntil(Date.now() + seconds * 1000);
  };

  const closeForgotModal = () => {
    setForgotPasswordOpen(false);
    setForgotIdentifier('');
    setForgotPasswordSent(false);
  };

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitLockRef.current || loggingIn || lockRemaining > 0) return;
    if (!identifier.trim() || !password) {
      const empty = LOGIN_ERROR_CREDENTIALS;
      setError(empty);
      showLoginError(empty);
      return;
    }
    submitLockRef.current = true;
    setError('');
    if (rememberMe) saveIdentifier(identifier);
    else saveIdentifier('');
    setLoggingIn(true);
    try {
      const j = await api<{ access_token: string; refresh_token?: string }>('POST', '/auth/login', { identifier, password });
      if (j && j.access_token) {
        setConsecutiveFailures(0);
        setLockUntil(0);
        persistSessionTokens(j.access_token, j.refresh_token);
        const requested = loc.state?.from ? String(loc.state.from) : '/home';
        try {
          const to = await resolvePostAuthDestination(requested);
          nav(to, { replace: true });
        } catch {
          nav(requested, { replace: true });
        }
      } else {
        const nextFails = consecutiveFailures + 1;
        setConsecutiveFailures(nextFails);
        startCooldown(lockSecondsForFailures(nextFails));
        setError(LOGIN_ERROR_CREDENTIALS);
        showLoginError(LOGIN_ERROR_CREDENTIALS);
      }
    } catch (err: unknown) {
      const status = err instanceof ApiError ? err.status : undefined;
      const raw = err instanceof Error ? err.message : String(err);
      const next = loginErrorMessage(raw, status);
      const fromServer = parseRetryAfterSeconds(next);
      if (status !== 429) {
        const nextFails = consecutiveFailures + 1;
        setConsecutiveFailures(nextFails);
        startCooldown(fromServer ?? lockSecondsForFailures(nextFails));
      } else {
        startCooldown(fromServer ?? 10);
      }
      setError(next);
      showLoginError(next);
    } finally {
      setLoggingIn(false);
      submitLockRef.current = false;
    }
  }

  const sendRecoveryEmail = async () => {
    if (!forgotIdentifier.trim()) {
      toast.error('Please enter your email or username');
      return;
    }
    try {
      const response = await api<any>(
        'POST',
        `/auth/password/forgot?identifier=${encodeURIComponent(forgotIdentifier.trim())}`,
      );
      setForgotPasswordSent(true);
      if (response?.email_sent) {
        toast.success('Password reset email sent successfully');
      } else if (response?.email_error) {
        console.error('Email send error:', response.email_error);
        toast.error('Failed to send email. Please contact support.');
      } else {
        console.warn('Email not sent - SMTP may not be configured');
        toast.error('Email service not configured. Please contact support.');
      }
    } catch (error: any) {
      console.error('Password reset request error:', error);
      setForgotPasswordSent(true);
    }
  };

  return (
    <div className="min-h-dvh bg-[#f7f4f3] md:h-dvh md:overflow-hidden">
      <div className="flex min-h-dvh flex-col md:h-full md:flex-row">
        <aside className="relative shrink-0 overflow-hidden bg-gradient-to-br from-[#7f1010] to-[#a31414] px-5 py-3.5 text-white md:flex md:w-[42%] md:flex-col md:items-center md:justify-center md:px-10 md:py-10 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <div
            className="pointer-events-none absolute inset-0 hidden bg-cover bg-center grayscale opacity-[0.28] mix-blend-luminosity md:block"
            style={{ backgroundImage: "url('/ui/assets/login/panel-photo.jpg')" }}
            aria-hidden
          />
          <div
            className="pointer-events-none absolute inset-0 hidden bg-gradient-to-t from-[#5c0c0c]/70 via-transparent to-[#7f1010]/20 md:block"
            aria-hidden
          />
          <div className="relative z-10 flex items-center md:hidden">
            <img src={LOGO_SRC} alt="Mack Kirk" className="h-12 w-auto max-w-[70%] object-contain sm:h-14" />
          </div>
          <div className="relative z-10 hidden w-full max-w-sm flex-col items-center text-center md:flex">
            <img
              src={LOGO_SRC}
              alt="Mack Kirk"
              className="h-auto w-[min(100%,18rem)] object-contain lg:w-[min(100%,22rem)] xl:w-[min(100%,26rem)]"
            />
            <ul className="mt-8 grid w-full grid-cols-2 gap-x-4 gap-y-3 text-[11px] font-semibold uppercase tracking-wide text-white/80">
              {LOGIN_FEATURES.map(({ label, Icon }) => (
                <li key={label} className="flex items-center justify-center gap-1.5">
                  <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  {label}
                </li>
              ))}
            </ul>
          </div>
        </aside>

        <section className="relative flex flex-1 flex-col justify-start overflow-y-auto px-5 py-6 pb-[max(2.5rem,env(safe-area-inset-bottom))] md:justify-center md:px-12 md:py-10">
          <div
            className="pointer-events-none absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url('${LOGIN_BG_SRC}')` }}
            aria-hidden
          />
          <div
            className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/70 via-white/45 to-[#f7f4f3]/55"
            aria-hidden
          />
          <div className="relative z-10 mx-auto w-full max-w-sm">
          <h2 className="text-xl font-semibold text-gray-900">MKHub Sign in</h2>
          <p className={uiCx(uiTypography.helper, 'mt-1 mb-5')}>Enter your credentials to continue.</p>
          <form
            onSubmit={onSubmit}
            className="space-y-4"
            onFocusCapture={() => setFieldFocused(true)}
            onBlurCapture={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) setFieldFocused(false);
            }}
          >
            <AppInput
              id="login-identifier"
              name="username"
              label="Email or username"
              placeholder="you@company.com"
              value={identifier}
              onChange={(e) => {
                setIdentifier(e.target.value);
                if (error) setError('');
              }}
              onBlur={() => {
                if (rememberMe) saveIdentifier(identifier);
              }}
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              onFocus={(e) => scrollFocusedFieldIntoView(e.target)}
              leftIcon={<UserRound className="h-4 w-4" />}
            />
            <AppInput
              id="login-password"
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
            <div className={uiCx(uiLayout.actionsRow, 'justify-between gap-3')}>
              <AppCheckbox
                label="Remember me"
                checked={rememberMe}
                onChange={(checked) => {
                  setRememberMe(checked);
                  if (!checked) saveIdentifier('');
                  else saveIdentifier(identifier);
                }}
              />
              <AppButton
                type="button"
                variant="ghost"
                size="sm"
                className="h-auto shrink-0 px-0 py-0 text-brand-red hover:bg-transparent hover:text-brand-red/80"
                onClick={() => setForgotPasswordOpen(true)}
              >
                Forgot password?
              </AppButton>
            </div>
            {error ? (
              <div
                className={uiCx(
                  'border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800',
                  uiRadius.control,
                )}
                role="alert"
              >
                {error}
              </div>
            ) : null}
            <AppButton
              type="submit"
              className="w-full"
              size="lg"
              disabled={loggingIn || lockRemaining > 0}
              loading={loggingIn}
              leftIcon={<LogIn className="h-4 w-4" />}
            >
              {loggingIn
                ? 'Signing in…'
                : lockRemaining > 0
                  ? `Try again in ${lockRemaining}s`
                  : 'Sign in'}
            </AppButton>
          </form>
          <div className={fieldFocused ? 'hidden md:block' : undefined}>
            <LoginAppDownloadHint />
          </div>
          <div className="mt-6 border-t border-gray-100 pt-4 text-center text-xs text-gray-500">
            <a href="/privacy-policy" className="font-medium underline decoration-gray-300 underline-offset-4 hover:text-brand-red">
              Privacy Policy
            </a>
          </div>
          </div>
        </section>
      </div>

      <AppFormModal
        open={forgotPasswordOpen}
        onClose={closeForgotModal}
        title="Password Recovery"
        description={
          !forgotPasswordSent
            ? 'Enter your email or username to receive a password reset link.'
            : undefined
        }
        footer={
          !forgotPasswordSent ? (
            <div className={uiCx(uiLayout.actionsRow, 'w-full justify-end')}>
              <AppButton type="button" variant="secondary" size="sm" onClick={closeForgotModal}>
                Cancel
              </AppButton>
              <AppButton type="button" size="sm" onClick={() => void sendRecoveryEmail()}>
                Send Recovery Email
              </AppButton>
            </div>
          ) : (
            <div className={uiCx(uiLayout.actionsRow, 'w-full justify-end')}>
              <AppButton type="button" size="sm" onClick={closeForgotModal}>
                Close
              </AppButton>
            </div>
          )
        }
      >
        {!forgotPasswordSent ? (
          <AppInput
            label="Email or Username"
            placeholder="Enter your email or username"
            value={forgotIdentifier}
            onChange={(e) => setForgotIdentifier(e.target.value)}
            autoComplete="username"
          />
        ) : (
          <div className={uiCx(uiSpacing.sectionStack, 'py-2 text-center')}>
            <div className={uiCx(uiTypography.sectionTitle, 'text-green-600')}>✓ Password reset email sent</div>
            <p className={uiTypography.helper}>
              If the email or username exists in our system, you will receive an email with instructions to reset your
              password.
            </p>
          </div>
        )}
      </AppFormModal>
    </div>
  );
}
