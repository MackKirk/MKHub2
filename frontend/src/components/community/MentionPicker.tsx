import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export type MentionEntity = {
  entity_type: 'user' | 'division' | 'community_group';
  entity_id: string;
  label: string;
};

type Suggestion = {
  entity_type: string;
  entity_id: string;
  label: string;
  subtitle?: string;
};

type Props = {
  mentions: MentionEntity[];
  onChange: (next: MentionEntity[]) => void;
};

export default function MentionPicker({ mentions, onChange }: Props) {
  const [q, setQ] = useState('');
  const { data: suggestions = [] } = useQuery({
    queryKey: ['community-mention-suggest', q],
    queryFn: () =>
      api<Suggestion[]>('GET', `/community/posts/mentions/suggest?q=${encodeURIComponent(q)}&limit=30`).catch(() => []),
    enabled: q.trim().length >= 1,
  });

  const add = (s: Suggestion) => {
    const et = s.entity_type as MentionEntity['entity_type'];
    if (!['user', 'division', 'community_group'].includes(et)) return;
    const key = `${et}:${s.entity_id}`;
    if (mentions.some((m) => `${m.entity_type}:${m.entity_id}` === key)) return;
    onChange([...mentions, { entity_type: et, entity_id: s.entity_id, label: s.label }]);
    setQ('');
  };

  const remove = (key: string) => {
    onChange(mentions.filter((m) => `${m.entity_type}:${m.entity_id}` !== key));
  };

  return (
    <div className="space-y-2.5">
      <div>
        <span className="text-sm font-medium text-gray-800">Notify (optional)</span>
        <p className="text-xs text-gray-500 mt-0.5">Mention people, a division, or a group—they receive a notification.</p>
      </div>
      <div className="flex flex-wrap gap-2 min-h-[1.75rem]">
        {mentions.map((m) => (
          <span
            key={`${m.entity_type}:${m.entity_id}`}
            className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs font-medium text-gray-800"
          >
            @{m.label}
            <button
              type="button"
              className="rounded p-0.5 text-gray-500 hover:bg-gray-200 hover:text-red-700"
              aria-label={`Remove ${m.label}`}
              onClick={() => remove(`${m.entity_type}:${m.entity_id}`)}
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <input
        type="text"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search people, divisions, groups…"
        className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm shadow-sm focus:ring-2 focus:ring-brand-red/30 focus:border-brand-red"
        autoComplete="off"
      />
      {q.trim().length >= 1 && suggestions.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white shadow-md max-h-48 overflow-y-auto">
          {suggestions.map((s) => (
            <button
              key={`${s.entity_type}-${s.entity_id}`}
              type="button"
              className="w-full border-b border-gray-100 px-3 py-2.5 text-left text-sm last:border-0 hover:bg-gray-50"
              onClick={() => add(s)}
            >
              <div className="font-medium text-gray-900">{s.label}</div>
              {s.subtitle && <div className="text-xs text-gray-500 mt-0.5">{s.subtitle}</div>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
