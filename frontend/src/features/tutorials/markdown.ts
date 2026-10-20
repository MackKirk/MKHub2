import DOMPurify from 'dompurify';

/** Escape HTML special chars before markdown transforms. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Minimal markdown → HTML for tutorial bodies.
 * Supports paragraphs, ul/ol, **bold**, *italic*, and [links](url).
 */
export function tutorialMarkdownToHtml(md: string): string {
  const raw = (md || '').replace(/\r\n/g, '\n').trim();
  if (!raw) return '';

  const lines = raw.split('\n');
  const blocks: string[] = [];
  let i = 0;

  const flushParagraph = (buf: string[]) => {
    const text = buf.join(' ').trim();
    if (!text) return;
    blocks.push(`<p>${inlineFormat(text)}</p>`);
  };

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i += 1;
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i])) {
        items.push(`<li>${inlineFormat(lines[i].replace(/^[-*]\s+/, ''))}</li>`);
        i += 1;
      }
      blocks.push(`<ul>${items.join('')}</ul>`);
      continue;
    }

    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
        items.push(`<li>${inlineFormat(lines[i].replace(/^\d+\.\s+/, ''))}</li>`);
        i += 1;
      }
      blocks.push(`<ol>${items.join('')}</ol>`);
      continue;
    }

    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^[-*]\s+/.test(lines[i]) && !/^\d+\.\s+/.test(lines[i])) {
      para.push(lines[i]);
      i += 1;
    }
    flushParagraph(para);
  }

  return blocks.join('');
}

function inlineFormat(text: string): string {
  let s = escapeHtml(text);
  // Links [label](url) — only http(s) or relative /
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, label, url) => {
    const u = String(url).trim();
    if (!/^(https?:\/\/|\/)/i.test(u)) return label;
    const safe = escapeHtml(u);
    return `<a href="${safe}" rel="noopener noreferrer">${label}</a>`;
  });
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*])\*([^*]+)\*(?!\*)/g, '$1<em>$2</em>');
  return s;
}

const ALLOWED_TAGS = ['p', 'ul', 'ol', 'li', 'strong', 'em', 'a', 'br'];
const ALLOWED_ATTR = ['href', 'rel', 'target'];

export function sanitizeTutorialHtml(html: string): string {
  return DOMPurify.sanitize(html || '', {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
  });
}

export function renderTutorialMarkdown(md: string): string {
  return sanitizeTutorialHtml(tutorialMarkdownToHtml(md));
}
