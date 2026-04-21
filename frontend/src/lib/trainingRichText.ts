import { withFileAccessToken } from '@/lib/api';

/**
 * Rewrite <img src="/files/{uuid}"> so authenticated GET works in the learner view.
 */
export function injectFileAccessTokensInHtml(html: string): string {
  if (!html) return html;
  return html.replace(
    /(<img\b[^>]*\bsrc=)(["'])(\/files\/[a-fA-F0-9-]+)\2/gi,
    (_m, pre: string, q: string, path: string) => `${pre}${q}${withFileAccessToken(path)}${q}`,
  );
}
