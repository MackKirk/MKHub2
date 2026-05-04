import { mergeAttributes } from '@tiptap/core';
import Image from '@tiptap/extension-image';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { LessonImageNodeView } from '@/pages/training/LessonImageNodeView';
import { canonicalTrainingFileSrc } from '@/lib/trainingRichText';

export type ImageAlign = 'left' | 'center' | 'right';

/** Read stored width from wrapper (preferred) or legacy img attrs. */
function readLessonImageWidthFromDom(wrap: HTMLElement | null, img: HTMLElement): string | null {
  if (wrap) {
    const ws = wrap.getAttribute('style') || '';
    const mw = ws.match(/(?:^|;)\s*width:\s*([^;]+)/i);
    if (mw) return mw[1].trim().replace(/^["']|["']$/g, '').replace(/\s*!important\s*$/i, '');
  }
  const dw = img.getAttribute('data-width')?.trim();
  if (dw) return dw;
  const ist = img.getAttribute('style') || '';
  const im = ist.match(/width:\s*([^;]+)/i);
  return im ? im[1].trim().replace(/^["']|["']$/g, '') : null;
}

function readLessonImageHeightFromDom(img: HTMLElement): string | null {
  const dh = img.getAttribute('data-height')?.trim();
  if (dh) return dh;
  const ist = img.getAttribute('style') || '';
  const m = ist.match(/(?:^|;)\s*height:\s*([^;]+)/i);
  if (m) return m[1].trim().replace(/^["']|["']$/g, '').replace(/\s*!important\s*$/i, '');
  const ha = img.getAttribute('height');
  if (ha && /^\d+$/.test(ha)) return `${ha}px`;
  return null;
}

export const LessonImage = Image.extend({
  name: 'image',

  addAttributes() {
    return {
      ...this.parent?.(),
      align: {
        default: 'left',
        parseHTML: (element: HTMLElement) => {
          const wrap = element.closest?.('[data-lesson-img-wrap]');
          if (wrap) return (wrap.getAttribute('data-align') || 'left') as ImageAlign;
          return 'left';
        },
      },
      width: {
        default: null as string | null,
        parseHTML: (element: HTMLElement) => {
          const wrap = element.closest?.('[data-lesson-img-wrap]') as HTMLElement | null;
          const img =
            element.tagName === 'IMG' ? element : (wrap?.querySelector('img') as HTMLElement | null);
          if (!img) return readLessonImageWidthFromDom(wrap, element);
          return readLessonImageWidthFromDom(wrap, img);
        },
      },
      height: {
        default: null as string | null,
        parseHTML: (element: HTMLElement) => {
          const img =
            element.tagName === 'IMG'
              ? element
              : (element.querySelector?.('img') as HTMLElement | null) ||
                (element.closest?.('[data-lesson-img-wrap]') as HTMLElement | null)?.querySelector?.('img');
          if (!img) return null;
          return readLessonImageHeightFromDom(img);
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-lesson-img-wrap]',
        getAttrs: (dom) => {
          if (!(dom instanceof HTMLElement)) return false;
          const img = dom.querySelector('img');
          if (!img) return false;
          const align = (dom.getAttribute('data-align') || 'left') as ImageAlign;
          const src = canonicalTrainingFileSrc(img.getAttribute('src') || '');
          const alt = img.getAttribute('alt') || '';
          const title = img.getAttribute('title') || '';
          const width = readLessonImageWidthFromDom(dom, img);
          const height = readLessonImageHeightFromDom(img);
          return { src, alt, title, align, width, height };
        },
      },
      {
        tag: 'span[data-lesson-img-wrap]',
        getAttrs: (dom) => {
          if (!(dom instanceof HTMLElement)) return false;
          const img = dom.querySelector('img');
          if (!img) return false;
          const align = (dom.getAttribute('data-align') || 'left') as ImageAlign;
          const src = canonicalTrainingFileSrc(img.getAttribute('src') || '');
          const alt = img.getAttribute('alt') || '';
          const title = img.getAttribute('title') || '';
          const width = readLessonImageWidthFromDom(dom, img);
          const height = readLessonImageHeightFromDom(img);
          return { src, alt, title, align, width, height };
        },
      },
      {
        tag: 'img[src]:not([src^="data:"])',
        getAttrs: (dom) => {
          if (!(dom instanceof HTMLElement)) return false;
          const src = canonicalTrainingFileSrc(dom.getAttribute('src') || '');
          const wrap = dom.closest?.('[data-lesson-img-wrap]') as HTMLElement | null;
          const width = readLessonImageWidthFromDom(wrap, dom);
          const height = readLessonImageHeightFromDom(dom);
          return {
            src,
            alt: dom.getAttribute('alt'),
            title: dom.getAttribute('title'),
            align: 'left' as ImageAlign,
            width,
            height,
          };
        },
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    const align = (node.attrs.align as ImageAlign) || 'left';
    const imgAttrs = mergeAttributes(this.options.HTMLAttributes, HTMLAttributes);
    const w = node.attrs.width as string | null | undefined;
    const h = node.attrs.height as string | null | undefined;
    const wrapParts = ['display:inline-block', 'vertical-align:bottom', 'max-width:100%'];
    if (w) {
      wrapParts.push(`width:${w}`);
      imgAttrs['data-width'] = w;
    }
    const prev = typeof imgAttrs.style === 'string' ? imgAttrs.style : '';
    let imgBlock: string;
    if (w && h) {
      imgAttrs['data-height'] = h;
      imgBlock = `width:100%;max-width:100%;height:${h};object-fit:fill;display:block;`;
    } else if (w) {
      imgBlock = 'width:100%;max-width:100%;height:auto;object-fit:contain;display:block;';
    } else if (h) {
      imgAttrs['data-height'] = h;
      imgBlock = `max-width:100%;height:${h};object-fit:fill;display:block;`;
    } else {
      imgBlock = 'max-width:100%;height:auto;object-fit:contain;display:block;';
    }
    imgAttrs.style = prev ? `${prev}; ${imgBlock}` : imgBlock;
    return [
      'span',
      {
        class: 'lesson-img-wrap lesson-img-wrap--inline',
        'data-lesson-img-wrap': '',
        'data-align': align,
        style: `${wrapParts.join(';')};`,
      },
      ['img', imgAttrs],
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(LessonImageNodeView, {
      /**
       * TipTap's default NodeView.stopEvent returns true for drag* on inner targets (e.g. <img>),
       * so ProseMirror never runs dragstart/drop (eventBelongsToView becomes false). We must let
       * PM handle drag/drop for moving inline images; keep true only on resize handles.
       */
      stopEvent: ({ event }) => {
        const t = event.target;
        if (!(t instanceof HTMLElement)) return false;
        if (event.type.startsWith('drag') || event.type === 'drop') return false;
        if (t.closest('.lesson-img-resize-handle')) {
          if (event.type === 'mousedown' || event.type === 'pointerdown' || event.type === 'click') {
            return true;
          }
        }
        return false;
      },
    });
  },

  addCommands() {
    return {
      ...this.parent?.(),
      setImage:
        (options) =>
        ({ state, dispatch }) => {
          const attrs = {
            align: 'left' as ImageAlign,
            width: null as string | null,
            height: null as string | null,
            ...options,
          };
          const type = state.schema.nodes[this.name];
          if (!type) return false;
          const node = type.create(attrs);
          const { $from } = state.selection;
          if (!$from.parent.type.contentMatch.matchType(type)) return false;
          const tr = state.tr.replaceSelectionWith(node, false);
          dispatch?.(tr);
          return true;
        },
    };
  },
}).configure({
  inline: true,
  allowBase64: false,
  HTMLAttributes: {
    class: 'rounded-lg max-w-full h-auto object-contain align-middle',
  },
});
