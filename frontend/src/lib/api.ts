export type HttpMethod = 'GET'|'POST'|'PUT'|'PATCH'|'DELETE';

export function getToken(){
  return localStorage.getItem('user_token');
}

export async function api<T=any>(method: HttpMethod, path: string, body?: any, headers?: Record<string,string>): Promise<T>{
  const h: Record<string,string> = { ...(headers||{}) };
  const t = getToken(); if (t) h.Authorization = 'Bearer ' + t;
  
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
  if (r.status === 401) { localStorage.removeItem('user_token'); location.href = '/login'; throw new Error('Unauthorized'); }
  if (!r.ok) { 
    // FastAPI returns errors in {detail: "message"} format
    // Try to get the error message from the response
    let errorMessage = `HTTP ${r.status}: ${r.statusText}`;
    try {
      const contentType = r.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const err = await r.json();
        errorMessage = err.detail || err.message || err.error || errorMessage;
      } else {
        // Try to get text response
        const text = await r.text();
        if (text) {
          // Try to parse as JSON if it looks like JSON
          if (text.trim().startsWith('{') || text.trim().startsWith('[')) {
            try {
              const parsed = JSON.parse(text);
              errorMessage = parsed.detail || parsed.message || parsed.error || text;
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


