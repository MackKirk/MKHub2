export type HttpMethod = 'GET'|'POST'|'PUT'|'PATCH'|'DELETE';

export function getToken(){
  return localStorage.getItem('user_token');
}

export async function api<T=any>(method: HttpMethod, path: string, body?: any, headers?: Record<string,string>): Promise<T>{
  const h: Record<string,string> = { 'Content-Type':'application/json', ...(headers||{}) };
  const t = getToken(); if (t) h.Authorization = 'Bearer ' + t;
  const r = await fetch(path, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
  if (r.status === 401) { localStorage.removeItem('user_token'); location.href = '/login'; throw new Error('Unauthorized'); }
  if (!r.ok) { 
    try{ const err = await r.json(); throw new Error(err.detail || err.message || `HTTP ${r.status}`); }
    catch(_e){ throw new Error(`HTTP ${r.status}: ${r.statusText}`); }
  }
  const ct = r.headers.get('Content-Type')||'';
  if (ct.includes('application/json')) return await r.json();
  // @ts-ignore
  return await r.text();
}


