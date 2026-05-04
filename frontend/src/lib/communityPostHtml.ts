import DOMPurify from 'dompurify';

const ALLOWED_TAGS = [
  'p',
  'br',
  'strong',
  'b',
  'em',
  'i',
  'u',
  's',
  'strike',
  'ul',
  'ol',
  'li',
  'a',
  'h1',
  'h2',
  'h3',
  'blockquote',
  'pre',
  'code',
  'span',
  'hr',
  'div',
  'iframe',
  'img',
];

const ALLOWED_ATTR = [
  'href',
  'target',
  'rel',
  'class',
  'style',
  'data-type',
  'data-id',
  'data-label',
  'data-entity-type',
  'data-entity-id',
  'data-mention-suggestion-char',
  /* Inline images (shared markup with training LessonImage) */
  'data-lesson-img-wrap',
  'data-align',
  'data-width',
  'data-height',
  'allow',
  'allowfullscreen',
  'frameborder',
  'title',
  'width',
  'height',
  'src',
  'alt',
];

/** Heuristic: stored community post body is HTML from TipTap vs legacy plain text. */
export function communityContentLooksLikeHtml(s: string): boolean {
  const t = (s || '').trim();
  if (!t.startsWith('<')) return false;
  return /<\/(p|div|ul|ol|h[1-3]|strong|em|blockquote|li|span|br)\b/i.test(t) || /<p[\s>\/]/i.test(t) || /<br\s*\/?>/i.test(t);
}

function escapePlain(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Wrap legacy plain-text posts for the TipTap editor. */
export function legacyPlainToEditorHtml(text: string): string {
  const raw = text ?? '';
  if (communityContentLooksLikeHtml(raw)) return raw || '<p></p>';
  if (!raw.trim()) return '<p></p>';
  const parts = raw.split(/\n\n+/);
  return parts
    .map((block) => {
      const lines = escapePlain(block).split('\n');
      const inner = lines.join('<br>');
      return `<p>${inner || '<br>'}</p>`;
    })
    .join('');
}

export function sanitizeCommunityPostHtml(html: string): string {
  return DOMPurify.sanitize(html || '', {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
    ADD_ATTR: ['target'],
  });
}

/** True if there is no visible text (ignores empty paragraphs / breaks). */
export function isCommunityEditorHtmlEmpty(html: string): boolean {
  if (typeof document === 'undefined') {
    const t = html.replace(/<[^>]+>/g, ' ').replace(/\u00a0/g, ' ').trim();
    return t.length === 0;
  }
  const doc = new DOMParser().parseFromString(html || '<p></p>', 'text/html');
  const text = (doc.body.textContent || '').replace(/\u00a0/g, ' ').trim();
  return text.length === 0;
}

/** Strip tags for native mobile preview (no HTML renderer). */
export function stripHtmlToPlain(html: string): string {
  const s = html || '';
  if (!communityContentLooksLikeHtml(s)) return s.trim();
  if (typeof document === 'undefined') {
    return s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }
  const d = document.createElement('div');
  d.innerHTML = s;
  return (d.textContent || '').replace(/\s+/g, ' ').trim();
}
