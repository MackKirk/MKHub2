import { FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Eye, EyeOff, Lock, UserRound } from 'lucide-react';
import { ApiError, persistPortalTokens, portalApi } from '@/lib/api';
import PortalAuthLayout from '@/components/PortalAuthLayout';
import { AppButton, AppEmptyState, AppInput, uiCx, uiTypography } from '@/lib/ui';

type InviteInfo = {
  email: string;
  client_name?: string | null;
};

function scrollFocusedFieldIntoView(target: EventTarget | null) {
  const el = target instanceof HTMLElement ? target : null;
  if (!el) return;
  window.setTimeout(() => {
    el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
  }, 350);
}

export default function AcceptInvite() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const navigate = useNavigate();
  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setLoadError('Missing invite token');
      return;
    }
    portalApi<InviteInfo>('GET', `/portal/hub/auth/invite/${encodeURIComponent(token)}`)
      .then(setInfo)
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : 'Invalid invite'));
  }, [token]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!token || busy) return;
    setBusy(true);
    try {
      const data = await portalApi<{ access_token: string; refresh_token: string }>(
        'POST',
        '/portal/hub/auth/accept-invite',
        { token, password, name: name || undefined },
      );
      persistPortalTokens(data.access_token, data.refresh_token);
      toast.success('Account ready');
      navigate('/');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not accept invite');
    } finally {
      setBusy(false);
    }
  }

  if (loadError) {
    return (
      <PortalAuthLayout>
        <AppEmptyState title="Invite unavailable" description={loadError} className="py-6" />
        <p className="mt-4 text-center text-sm">
          <Link to="/login" className="font-semibold text-brand-red hover:text-brand-red/80">
            Go to sign in
          </Link>
        </p>
      </PortalAuthLayout>
    );
  }

  if (!info) {
    return (
      <PortalAuthLayout>
        <p className={uiTypography.helper}>Loading invite…</p>
      </PortalAuthLayout>
    );
  }

  return (
    <PortalAuthLayout>
      <h2 className="text-xl font-semibold text-gray-900">Create your portal account</h2>
      <p className={uiCx(uiTypography.helper, 'mt-1 mb-5')}>
        Company: <span className="font-semibold text-gray-800">{info.client_name || '—'}</span>
      </p>
      <form onSubmit={onSubmit} className="space-y-4">
        <AppInput
          id="portal-invite-email"
          label="Email"
          type="email"
          value={info.email}
          readOnly
          className="opacity-90"
        />
        <AppInput
          id="portal-invite-name"
          label="Your name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="name"
          onFocus={(e) => scrollFocusedFieldIntoView(e.target)}
          leftIcon={<UserRound className="h-4 w-4" />}
        />
        <AppInput
          id="portal-invite-password"
          label="Password"
          type={showPassword ? 'text' : 'password'}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={8}
          required
          autoComplete="new-password"
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
          helperText="At least 8 characters. If you already have an account, use your existing password."
        />
        <AppButton type="submit" className="w-full" size="lg" disabled={busy} loading={busy}>
          {busy ? 'Creating…' : 'Create account'}
        </AppButton>
      </form>
      <p className="mt-4 text-center text-sm">
        <Link to="/login" className="font-semibold text-brand-red hover:text-brand-red/80">
          Already have an account? Sign in
        </Link>
      </p>
    </PortalAuthLayout>
  );
}
