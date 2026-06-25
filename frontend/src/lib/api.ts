export type HttpMethod = 'GET'|'POST'|'PUT'|'PATCH'|'DELETE';

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
    if ('msg' in detail) return String((detail as { msg: unknown }).msg);
    if ('message' in detail) return String((detail as { message: unknown }).message);
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

export async function api<T=any>(method: HttpMethod, path: string, body?: any, headers?: Record<string,string>): Promise<T>{
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
  
  const r = await fetch(path, { method, headers: h, body: bodyData });
  if (r.status === 401) { 
    localStorage.removeItem('user_token'); 
    window.location.replace('/login'); 
    throw new Error('Unauthorized'); 
  }
  if (!r.ok) { 
    // FastAPI returns errors in {detail: "message"} format
    // Try to get the error message from the response
    let errorMessage = `HTTP ${r.status}: ${r.statusText}`;
    try {
      const contentType = r.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const err = await r.json();
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
    throw new Error(errorMessage);
  }
  const ct = r.headers.get('Content-Type')||'';
  if (ct.includes('application/json')) return await r.json();
  // @ts-ignore
  return await r.text();
}


