export class ApiError extends Error {
  status: number;
  detail: unknown;
  constructor(status: number, message: string, detail?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.detail = detail;
  }
}

const ACCESS_KEY = 'portal_token';
const REFRESH_KEY = 'portal_refresh_token';

export function getPortalToken() {
  return localStorage.getItem(ACCESS_KEY);
}

export function persistPortalTokens(access: string, refresh?: string | null) {
  localStorage.setItem(ACCESS_KEY, access);
  if (refresh) localStorage.setItem(REFRESH_KEY, refresh);
}

export function clearPortalTokens() {
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
}

async function tryRefresh(): Promise<boolean> {
  const rt = localStorage.getItem(REFRESH_KEY);
  if (!rt) return false;
  try {
    const res = await fetch('/portal/hub/auth/refresh', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: rt }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    if (data?.access_token) {
      persistPortalTokens(data.access_token, data.refresh_token);
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

export async function portalApi<T = unknown>(
  method: string,
  path: string,
  body?: unknown,
  retry = true,
): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  const token = getPortalToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401 && retry) {
    const ok = await tryRefresh();
    if (ok) return portalApi(method, path, body, false);
    clearPortalTokens();
  }
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const detail = data && typeof data === 'object' && 'detail' in data ? (data as { detail: unknown }).detail : data;
    const msg =
      typeof detail === 'string'
        ? detail
        : detail && typeof detail === 'object' && 'message' in detail
          ? String((detail as { message: unknown }).message)
          : res.statusText || 'Request failed';
    throw new ApiError(res.status, msg, detail);
  }
  return data as T;
}

export async function portalLogout() {
  const rt = localStorage.getItem(REFRESH_KEY);
  const access = getPortalToken();
  try {
    await fetch('/portal/hub/auth/logout', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(access ? { Authorization: `Bearer ${access}` } : {}),
      },
      body: JSON.stringify({ refresh_token: rt || '' }),
    });
  } catch {
    /* ignore */
  }
  clearPortalTokens();
}
