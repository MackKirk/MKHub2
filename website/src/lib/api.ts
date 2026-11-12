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

const ACCESS_KEY = 'mk_metals_portal_token';
const REFRESH_KEY = 'mk_metals_portal_refresh_token';

export function getToken() {
  return localStorage.getItem(ACCESS_KEY);
}

export function persistTokens(access: string, refresh?: string | null) {
  localStorage.setItem(ACCESS_KEY, access);
  if (refresh) localStorage.setItem(REFRESH_KEY, refresh);
}

export function clearTokens() {
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
}

async function tryRefresh(): Promise<boolean> {
  const rt = localStorage.getItem(REFRESH_KEY);
  if (!rt) return false;
  try {
    const res = await fetch('/portal/metals/auth/refresh', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: rt }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    if (data?.access_token) {
      persistTokens(data.access_token, data.refresh_token);
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

function detailMessage(data: unknown, fallback: string): string {
  if (!data || typeof data !== 'object') return fallback;
  const detail = (data as { detail?: unknown }).detail;
  if (typeof detail === 'string') return detail;
  if (detail && typeof detail === 'object' && 'message' in detail) {
    return String((detail as { message: unknown }).message);
  }
  return fallback;
}

export async function api<T = unknown>(
  method: string,
  path: string,
  body?: unknown,
  retry = true,
): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401 && retry) {
    const ok = await tryRefresh();
    if (ok) return api(method, path, body, false);
    clearTokens();
  }
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    throw new ApiError(res.status, detailMessage(data, res.statusText || 'Request failed'), data);
  }
  return data as T;
}

export async function apiForm<T = unknown>(path: string, form: FormData, retry = true): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(path, { method: 'POST', headers, body: form });
  if (res.status === 401 && retry) {
    const ok = await tryRefresh();
    if (ok) return apiForm(path, form, false);
    clearTokens();
  }
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    throw new ApiError(res.status, detailMessage(data, res.statusText || 'Request failed'), data);
  }
  return data as T;
}

export async function logout() {
  const rt = localStorage.getItem(REFRESH_KEY);
  const access = getToken();
  try {
    await fetch('/portal/metals/auth/logout', {
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
  clearTokens();
}

export type CatalogProduct = {
  id: string;
  slug: string;
  name: string;
  short_description?: string | null;
  description?: string | null;
  specs?: Record<string, unknown>;
  image_url?: string | null;
  category?: { id: string; slug: string; name: string } | null;
};

export type CatalogResponse = {
  categories: { id: string; slug: string; name: string; description?: string | null }[];
  items: CatalogProduct[];
  total: number;
};

export type Submission = {
  id: string;
  submission_code: string;
  kind: string;
  status: string;
  status_label: string;
  contact_name: string;
  contact_email: string;
  company_name?: string | null;
  notes?: string | null;
  created_at?: string | null;
  items: {
    id: string;
    description: string;
    gauge?: string | null;
    colour?: string | null;
    quantity: number;
  }[];
  files: { id: string; original_name?: string | null }[];
};
