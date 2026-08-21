export type HttpMethod = 'GET'|'POST'|'PUT'|'PATCH'|'DELETE';

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

export function getApiErrorCode(err: unknown): string | null {
  if (!(err instanceof ApiError)) return null;
  const d = err.detail;
  if (d && typeof d === 'object' && !Array.isArray(d) && 'code' in d) {
    return String((d as { code: unknown }).code);
  }
  return null;
}

/** Detect OCC / soft-lock save conflicts, including fallback when detail is a plain string. */
export function isDocumentConcurrencyError(err: unknown): boolean {
  const code = getApiErrorCode(err);
  if (
    code === 'document_version_conflict' ||
    code === 'document_in_use' ||
    code === 'expected_updated_at_required' ||
    (typeof code === 'string' && code.startsWith('expected_updated_at'))
  ) {
    return true;
  }
  const msg = err instanceof Error ? err.message : String(err ?? '');
  return /expected_updated_at/i.test(msg) || /document_version_conflict|document_in_use/i.test(msg);
}

export function formatApiErrorDetail(detail: unknown): string {
  if (detail == null) return '';
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((item) => {
        if (typeof item === 'string') return item;
        if (item && typeof item === 'object' && 'msg' in item) {
          return String((item as { msg: unknown }).msg);
        }
        try {
          return JSON.stringify(item);
        } catch {
          return String(item);
        }
      })
      .filter(Boolean)
      .join('; ');
  }
  if (typeof detail === 'object') {
    if ('message' in detail && (detail as { message: unknown }).message != null) {
      return String((detail as { message: unknown }).message);
    }
    if ('msg' in detail) return String((detail as { msg: unknown }).msg);
    try {
      return JSON.stringify(detail);
    } catch {
      return String(detail);
    }
  }
  return String(detail);
}

export function getToken(){
  return localStorage.getItem('user_token');
}

/** Append JWT for GET /files/* (thumbnails, etc.) where <img> cannot send Authorization. */
export function withFileAccessToken(url: string): string {
  const t = getToken();
  if (!t) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}access_token=${encodeURIComponent(t)}`;
}

/**
 * For JSON fields built by the API (`logo_url`, `cover_image_url`, community avatars, etc.):
 * same-origin `/files/...` URLs need the query token because `<img>` cannot send Authorization.
 */
export function withFileAccessTokenIfNeeded(url: string | null | undefined): string {
  const u = url ?? '';
  if (!u.startsWith('/files/')) return u;
  return withFileAccessToken(u);
}

/** Fetch a binary endpoint (PDF/PNG) with the session Bearer token. */
export async function fetchAuthorizedBinary(url: string, signal?: AbortSignal): Promise<ArrayBuffer> {
  const t = getToken();
  const r = await fetch(url, {
    headers: { Authorization: 'Bearer ' + (t || '') },
    signal,
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error((err as { detail?: string }).detail || r.statusText || 'Request failed');
  }
  return r.arrayBuffer();
}

export async function api<T=any>(
  method: HttpMethod,
  path: string,
  body?: any,
  headers?: Record<string,string>,
  signal?: AbortSignal,
): Promise<T>{
  const h: Record<string,string> = { ...(headers||{}) };
  const t = getToken(); if (t) h.Authorization = 'Bearer ' + t;
  // Ensure API requests are never treated as page loads by SPA middleware (Accept: text/html)
  h.Accept = h.Accept || 'application/json';
  
  // If body is FormData, don't set Content-Type (browser will set it with boundary)
  // Otherwise, default to application/json
  let bodyData: any = undefined;
  if (body) {
    if (body instanceof FormData) {
      // Don't set Content-Type for FormData - browser will set it automatically
      bodyData = body;
    } else {
      h['Content-Type'] = 'application/json';
      bodyData = JSON.stringify(body);
    }
  } else {
    h['Content-Type'] = 'application/json';
  }
  
  const r = await fetch(path, { method, headers: h, body: bodyData, signal });
  const requestPath = path.split('?')[0];
  const isLoginAttempt = method === 'POST' && (requestPath === '/auth/login' || requestPath.endsWith('/auth/login'));
  if (r.status === 401 && !isLoginAttempt) {
    localStorage.removeItem('user_token');
    window.location.replace('/login');
    throw new Error('Unauthorized');
  }
  if (!r.ok) { 
    // FastAPI returns errors in {detail: "message"} format
    // Try to get the error message from the response
    let errorMessage = `HTTP ${r.status}: ${r.statusText}`;
    let detail: unknown = undefined;
    try {
      const contentType = r.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const err = await r.json();
        detail = err.detail !== undefined ? err.detail : err;
        errorMessage =
          formatApiErrorDetail(err.detail) || err.message || err.error || errorMessage;
      } else {
        // Try to get text response
        const text = await r.text();
        if (text) {
          // Try to parse as JSON if it looks like JSON
          if (text.trim().startsWith('{') || text.trim().startsWith('[')) {
            try {
              const parsed = JSON.parse(text);
              detail = parsed.detail !== undefined ? parsed.detail : parsed;
              errorMessage =
                formatApiErrorDetail(parsed.detail) || parsed.message || parsed.error || text;
            } catch {
              errorMessage = text;
            }
          } else {
            errorMessage = text;
          }
        }
      }
    } catch (e) {
      // If all else fails, use the default message
      console.error('Error parsing error response:', e);
    }
    throw new ApiError(r.status, errorMessage, detail);
  }
  const ct = r.headers.get('Content-Type')||'';
  if (ct.includes('application/json')) return await r.json();
  // @ts-ignore
  return await r.text();
}


