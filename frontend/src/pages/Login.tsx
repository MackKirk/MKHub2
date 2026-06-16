import { useState } from 'react';
import { api } from '@/lib/api';
import { resolvePostAuthDestination } from '@/lib/profileCompleteness';
import { useLocation, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  AppButton,
  AppFormModal,
  AppInput,
  uiBorders,
  uiColors,
  uiCx,
  uiLayout,
  uiRadius,
  uiShadows,
  uiSpacing,
  uiTypography,
} from '@/components/ui';

const LOGO_SRC = '/ui/assets/login/logo-light.svg';

export default function Login() {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [forgotPasswordOpen, setForgotPasswordOpen] = useState(false);
  const [forgotIdentifier, setForgotIdentifier] = useState('');
  const [forgotPasswordSent, setForgotPasswordSent] = useState(false);
  const [loggingIn, setLoggingIn] = useState(false);
  const nav = useNavigate();
  const loc = useLocation() as { state?: { from?: string } };

  const closeForgotModal = () => {
    setForgotPasswordOpen(false);
    setForgotIdentifier('');
    setForgotPasswordSent(false);
  };

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      const j = await api<{ access_token: string }>('POST', '/auth/login', { identifier, password });
      if (j && j.access_token) {
        localStorage.setItem('user_token', j.access_token);
        const requested = loc.state?.from ? String(loc.state.from) : '/home';
        setLoggingIn(true);
        try {
          const to = await resolvePostAuthDestination(requested);
          nav(to, { replace: true });
        } catch {
          nav(requested, { replace: true });
        } finally {
          setLoggingIn(false);
        }
      } else {
        setError('Invalid credentials');
      }
    } catch (err: any) {
      setError(err?.message || 'Login failed');
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
    <div
      className={uiCx(
        'relative flex min-h-screen items-center justify-center px-4 py-8',
        "bg-[url('/ui/assets/login/background.jpg')] bg-cover bg-center bg-no-repeat",
      )}
    >
      <div className="absolute inset-0 bg-black/40" aria-hidden />

      <div
        className={uiCx(
          'relative z-10 grid w-full max-w-[1024px] grid-cols-1 overflow-hidden md:grid-cols-2',
          uiRadius.card,
          uiShadows.hero,
          uiBorders.subtle,
          uiColors.surface,
        )}
      >
        <aside className="flex flex-col justify-between bg-gradient-to-br from-[#7f1010] to-[#a31414] p-9 text-white md:p-10">
          <div>
            <div className="flex items-center gap-3">
              <img src={LOGO_SRC} alt="" className="h-10 w-auto object-contain md:h-11" />
              <span className="text-xl font-bold tracking-tight text-white md:text-2xl">MKHub</span>
            </div>
            <h1 className="mt-8 text-3xl font-extrabold text-white md:text-4xl">Welcome back!</h1>
            <p className="mt-3 max-w-[36ch] text-base text-white/90 md:text-lg">
              Mack Kirk Operations Hub — customers, proposals, inventory, and projects in one secure place.
            </p>
          </div>
        </aside>

        <section className={uiCx('flex flex-col justify-center p-6 md:px-10 md:py-12')}>
          <h2 className="mb-4 text-xl font-semibold text-gray-900">Sign in</h2>
          <form onSubmit={onSubmit} className="space-y-4">
            <AppInput
              placeholder="Email or username"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              autoComplete="username"
            />
            <AppInput
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              error={error || undefined}
            />
            <AppButton type="submit" className="w-full" disabled={loggingIn} loading={loggingIn}>
              {loggingIn ? 'Signing in…' : 'Login'}
            </AppButton>
            <div className="text-center">
              <AppButton
                type="button"
                variant="ghost"
                size="sm"
                className="h-auto px-0 py-0 text-gray-600 underline hover:bg-transparent hover:text-brand-red"
                onClick={() => setForgotPasswordOpen(true)}
              >
                Forgot your password? Click here
              </AppButton>
            </div>
          </form>
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
