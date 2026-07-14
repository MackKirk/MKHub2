import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { getToken } from '@/lib/api';

const DEDUPE_MS = 10 * 60 * 1000;

const SKIP_PATHS = new Set([
  '/',
  '/index.html',
  '/login',
  '/register',
  '/password-reset',
  '/privacy',
  '/privacy-policy',
  '/install',
]);

function shouldTrackPageView(pathname: string): boolean {
  if (!pathname || SKIP_PATHS.has(pathname)) return false;
  if (pathname.startsWith('/onboarding')) return false;
  return true;
}

/** Fire-and-forget SPA page view logging (pathname only; deduped client-side). */
export function usePageViewTracker(): void {
  const location = useLocation();
  const lastRef = useRef<{ path: string; at: number } | null>(null);

  useEffect(() => {
    const pathname = location.pathname;
    if (!getToken() || !shouldTrackPageView(pathname)) return;

    const now = Date.now();
    const last = lastRef.current;
    if (last && last.path === pathname && now - last.at < DEDUPE_MS) return;
    lastRef.current = { path: pathname, at: now };

    const token = getToken();
    fetch('/users/me/page-views', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ path: pathname }),
      keepalive: true,
    }).catch(() => {
      /* non-blocking */
    });
  }, [location.pathname]);
}
