import { withFileAccessToken } from '@/lib/api';

const FILE_PATH_RE = /^(\/files\/[a-fA-F0-9-]+)/i;

/** Path `/files/{uuid}` if src is relative or absolute URL to that file. */
function filePathFromImgSrc(src: string): string | null {
  const s = src.trim();
  const rel = s.match(FILE_PATH_RE);
  if (rel) return rel[1];
  try {
    const u = new URL(s);
    const m = u.pathname.match(/^(\/files\/[a-fA-F0-9-]+)$/i);
    if (m) return m[1];
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * Rewrite <img src="…"> when it targets `/files/{uuid}` so authenticated GET works
 * (query `access_token` — same as thumbnails / learner view).
 */
export function injectFileAccessTokensInHtml(html: string): string {
  if (!html) return html;
  return html.replace(/(<img\b[^>]*\bsrc=)(["'])([^"']+)\2/gi, (_m, pre: string, q: string, src: string) => {
    const path = filePathFromImgSrc(src);
    if (!path) return `${pre}${q}${src}${q}`;
    return `${pre}${q}${withFileAccessToken(path)}${q}`;
  });
}

/** Remove `access_token` from `/files/…` image URLs before persisting HTML. */
export function stripFileAccessTokensFromHtml(html: string): string {
  if (!html) return html;
  return html.replace(/(<img\b[^>]*\bsrc=)(["'])([^"']+)\2/gi, (_m, pre: string, q: string, src: string) => {
    const cleaned = stripAccessTokenFromFileSrc(src.trim());
    return `${pre}${q}${cleaned}${q}`;
  });
}

function stripAccessTokenFromFileSrc(src: string): string {
  const pathOnly = filePathFromImgSrc(src);
  if (!pathOnly) return src;
  try {
    const u = new URL(src, 'https://placeholder.local');
    if (!u.pathname.match(/^\/files\/[a-fA-F0-9-]+$/i)) return pathOnly;
    u.searchParams.delete('access_token');
    const qs = u.searchParams.toString();
    return `${pathOnly}${qs ? `?${qs}` : ''}`;
  } catch {
    return pathOnly;
  }
}

/** Normalize stored img src to `/files/{uuid}` (no query). */
export function canonicalTrainingFileSrc(src: string): string {
  if (!src) return '';
  const noToken = stripAccessTokenFromFileSrc(src.trim());
  const path = filePathFromImgSrc(noToken);
  if (path) return path;
  try {
    const u = new URL(noToken, typeof window !== 'undefined' ? window.location.origin : 'https://local.invalid');
    const m = u.pathname.match(/^(\/files\/[a-fA-F0-9-]+)$/i);
    if (m) return m[1];
  } catch {
    /* ignore */
  }
  return noToken;
}
