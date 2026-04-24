import DOMPurify from 'dompurify';
import type { Config } from 'dompurify';
import { isYoutubeEmbedIframeSrc } from '@/lib/youtubeEmbed';

const TRAINING_RICH_TEXT_SANITIZE: Config = {
  ADD_TAGS: ['mark', 'div', 'iframe'],
  ADD_ATTR: [
    'style',
    'target',
    'rel',
    'class',
    'data-color',
    'data-highlight',
    'data-width',
    'data-lesson-img-wrap',
    'data-align',
    'data-youtube-video',
    'src',
    'width',
    'height',
    'title',
    'allow',
    'allowfullscreen',
    'referrerpolicy',
    'loading',
    'frameborder',
  ],
};

let youtubeIframeHookInstalled = false;

function ensureYoutubeIframeHook(): void {
  if (youtubeIframeHookInstalled) return;
  youtubeIframeHookInstalled = true;
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node.nodeName !== 'IFRAME') return;
    const wrap = node.parentElement;
    if (!wrap?.hasAttribute('data-youtube-video')) {
      node.parentNode?.removeChild(node);
      return;
    }
    const src = (node as HTMLIFrameElement).getAttribute('src') || '';
    if (!isYoutubeEmbedIframeSrc(src)) {
      wrap.remove();
    }
  });
}

export function sanitizeTrainingRichTextHtml(html: string): string {
  ensureYoutubeIframeHook();
  return DOMPurify.sanitize(html || '', TRAINING_RICH_TEXT_SANITIZE);
}
