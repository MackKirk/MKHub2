import Mention from '@tiptap/extension-mention';
import type { SuggestionKeyDownProps, SuggestionProps } from '@tiptap/suggestion';
import { api } from '@/lib/api';

export type CommunityMentionItem = {
  id: string;
  label: string;
  subtitle?: string;
  entityType: 'user' | 'division' | 'community_group';
  entityId: string;
};

export const CommunityMention = Mention.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      entityType: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-entity-type'),
        renderHTML: (attributes) =>
          attributes.entityType ? { 'data-entity-type': attributes.entityType } : {},
      },
      entityId: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-entity-id'),
        renderHTML: (attributes) => (attributes.entityId ? { 'data-entity-id': attributes.entityId } : {}),
      },
    };
  },
});

export async function fetchMentionItems(query: string): Promise<CommunityMentionItem[]> {
  const list = await api<
    Array<{ entity_type: string; entity_id: string; label: string; subtitle?: string }>
  >('GET', `/community/posts/mentions/suggest?q=${encodeURIComponent(query)}&limit=24`).catch(() => []);
  const allowed = new Set(['user', 'division', 'community_group']);
  return (Array.isArray(list) ? list : [])
    .filter((s) => allowed.has(s.entity_type) && s.entity_id)
    .map((s) => ({
      id: s.entity_id,
      label: s.label,
      subtitle: s.subtitle,
      entityType: s.entity_type as CommunityMentionItem['entityType'],
      entityId: s.entity_id,
    }));
}

const SUGGEST_LISTBOX_CLASS =
  'community-mention-suggest overflow-hidden rounded-lg border border-gray-200 bg-white shadow-xl min-w-[220px] max-w-[min(100vw-16px,360px)] overflow-y-auto';

/** Body + z-index above `#overlay-root` (100000); flip + maxHeight so the list is not clipped by modals or the viewport. */
export function createMentionSuggestionRender(zIndex = 200000) {
  let root: HTMLDivElement | null = null;
  let propsRef: SuggestionProps<CommunityMentionItem, CommunityMentionItem> | null = null;
  let selectedIndex = 0;

  function onReposition() {
    positionEl(propsRef?.clientRect);
  }

  function destroyRoot() {
    if (typeof window !== 'undefined') {
      window.removeEventListener('scroll', onReposition, true);
      window.removeEventListener('resize', onReposition);
    }
    root?.remove();
    root = null;
    propsRef = null;
  }

  function positionEl(clientRect: (() => DOMRect | null) | null | undefined) {
    if (!root || !clientRect) return;
    const rect = clientRect();
    if (!rect) return;

    const margin = 8;
    const gap = 6;
    const preferredMax = 280;

    const vw = typeof window !== 'undefined' ? window.innerWidth : 1200;
    const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
    const panelW = Math.min(360, vw - margin * 2);

    root.style.position = 'fixed';
    root.style.zIndex = String(zIndex);
    root.style.overflowY = 'auto';
    root.style.minWidth = '220px';
    root.style.maxWidth = `${panelW}px`;
    root.style.left = `${Math.max(margin, Math.min(rect.left, vw - panelW - margin))}px`;

    const spaceBelow = vh - rect.bottom - margin;
    const spaceAbove = rect.top - margin;
    const openUp = spaceBelow < 120 && spaceAbove > spaceBelow;

    if (openUp) {
      root.style.top = 'auto';
      root.style.bottom = `${vh - rect.top + gap}px`;
      root.style.maxHeight = `${Math.min(preferredMax, Math.max(120, spaceAbove - gap))}px`;
    } else {
      root.style.bottom = 'auto';
      root.style.top = `${rect.bottom + gap}px`;
      root.style.maxHeight = `${Math.min(preferredMax, Math.max(120, spaceBelow - gap))}px`;
    }
  }

  function renderButtons() {
    if (!root || !propsRef) return;
    root.innerHTML = '';
    root.setAttribute('role', 'listbox');

    if (propsRef.items.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'px-3 py-2 text-xs text-gray-500';
      empty.textContent = 'No matches';
      root.appendChild(empty);
      return;
    }

    propsRef.items.forEach((item, index) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.setAttribute('role', 'option');
      btn.className =
        'community-mention-suggest__item w-full border-b border-gray-100 px-3 py-2 text-left text-sm last:border-0 hover:bg-gray-50';
      if (index === selectedIndex) btn.classList.add('bg-red-50');

      const t1 = document.createElement('div');
      t1.className = 'font-medium text-gray-900';
      t1.textContent = item.label;
      btn.appendChild(t1);
      if (item.subtitle) {
        const t2 = document.createElement('div');
        t2.className = 'text-xs text-gray-500 mt-0.5';
        t2.textContent = item.subtitle;
        btn.appendChild(t2);
      }

      btn.addEventListener('mousedown', (e) => e.preventDefault());
      btn.addEventListener('click', () => {
        propsRef?.command(item);
      });
      root.appendChild(btn);
    });
  }

  function updateHighlight() {
    if (!root) return;
    const buttons = root.querySelectorAll('.community-mention-suggest__item');
    buttons.forEach((b, i) => {
      b.classList.toggle('bg-red-50', i === selectedIndex);
    });
  }

  return {
    onStart: (props: SuggestionProps<CommunityMentionItem, CommunityMentionItem>) => {
      destroyRoot();
      root = document.createElement('div');
      root.className = SUGGEST_LISTBOX_CLASS;
      document.body.appendChild(root);
      propsRef = props;
      selectedIndex = 0;
      positionEl(props.clientRect);
      renderButtons();
      positionEl(props.clientRect);
      if (typeof window !== 'undefined') {
        window.addEventListener('scroll', onReposition, true);
        window.addEventListener('resize', onReposition);
      }
    },
    onUpdate: (props: SuggestionProps<CommunityMentionItem, CommunityMentionItem>) => {
      propsRef = props;
      selectedIndex = Math.min(selectedIndex, Math.max(0, props.items.length - 1));
      if (!root) {
        root = document.createElement('div');
        root.className = SUGGEST_LISTBOX_CLASS;
        document.body.appendChild(root);
        if (typeof window !== 'undefined') {
          window.addEventListener('scroll', onReposition, true);
          window.addEventListener('resize', onReposition);
        }
      }
      positionEl(props.clientRect);
      renderButtons();
      positionEl(props.clientRect);
    },
    onExit: () => {
      destroyRoot();
    },
    onKeyDown: ({ event }: SuggestionKeyDownProps) => {
      if (!propsRef || !root) return false;
      const n = propsRef.items.length;
      if (event.key === 'Escape') {
        return false;
      }
      if (event.key === 'ArrowDown') {
        if (n === 0) return false;
        selectedIndex = (selectedIndex + 1) % n;
        updateHighlight();
        return true;
      }
      if (event.key === 'ArrowUp') {
        if (n === 0) return false;
        selectedIndex = selectedIndex <= 0 ? n - 1 : selectedIndex - 1;
        updateHighlight();
        return true;
      }
      if (event.key === 'Enter') {
        const item = propsRef.items[selectedIndex];
        if (item) propsRef.command(item);
        return true;
      }
      return false;
    },
  };
}
