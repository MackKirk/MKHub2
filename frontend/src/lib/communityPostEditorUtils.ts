import type { Editor } from '@tiptap/core';
import type { JSONContent } from '@tiptap/core';

const MENTION_ENTITY_TYPES = new Set(['user', 'division', 'community_group']);

export function extractMentionsFromDoc(doc: JSONContent): { entity_type: string; entity_id: string }[] {
  const out: { entity_type: string; entity_id: string }[] = [];
  const seen = new Set<string>();

  function walk(node: JSONContent | undefined) {
    if (!node) return;
    if (node.type === 'mention' && node.attrs) {
      const et = String(node.attrs.entityType || '').toLowerCase();
      const eid = String(node.attrs.entityId || '').trim();
      if (et && eid && MENTION_ENTITY_TYPES.has(et)) {
        const k = `${et}:${eid}`;
        if (!seen.has(k)) {
          seen.add(k);
          out.push({ entity_type: et, entity_id: eid });
        }
      }
    }
    if (Array.isArray(node.content)) {
      node.content.forEach(walk);
    }
  }

  walk(doc);
  return out;
}

export function extractMentionsFromEditor(editor: Editor | null): { entity_type: string; entity_id: string }[] {
  if (!editor) return [];
  try {
    return extractMentionsFromDoc(editor.getJSON());
  } catch {
    return [];
  }
}
