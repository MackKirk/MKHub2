import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { isHiddenReportCategory } from '@/lib/reportCategories';
import OverlayPortal from '@/components/OverlayPortal';

export type ProjectReportCategoriesMode = 'read' | 'write';

type ReportCategory = {
  id?: string;
  label: string;
  value?: string;
  sort_index?: number;
  meta?: { group?: string };
};

function categoryKey(cat: ReportCategory): string {
  return String(cat.value || cat.label || '').trim() || 'uncategorized';
}

export default function ProjectReportCategoriesModal({
  mode,
  open,
  value,
  onClose,
  onSave,
}: {
  mode: ProjectReportCategoriesMode;
  open: boolean;
  value: string[] | null;
  onClose: () => void;
  onSave: (next: string[] | null) => void;
}) {
  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api<Record<string, unknown>>('GET', '/settings'),
    enabled: open,
  });

  const categories = useMemo(() => {
    const raw = (settings?.report_categories || []) as ReportCategory[];
    return [...raw]
      .filter((cat) => !isHiddenReportCategory(cat))
      .sort((a, b) => (a.sort_index || 0) - (b.sort_index || 0));
  }, [settings]);

  const [allowAll, setAllowAll] = useState<boolean>(value === null);
  const [selected, setSelected] = useState<string[]>(Array.isArray(value) ? value : []);

  useEffect(() => {
    if (!open) return;
    setAllowAll(value === null);
    setSelected(Array.isArray(value) ? value : []);
  }, [open, value]);

  const grouped = useMemo(() => {
    const groups: Record<string, ReportCategory[]> = {
      commercial: [],
      production: [],
      financial: [],
      other: [],
    };
    categories.forEach((cat) => {
      const g = cat.meta?.group || 'other';
      if (g in groups) groups[g].push(cat);
      else groups.other.push(cat);
    });
    return groups;
  }, [categories]);

  const groupLabels: Record<string, string> = {
    commercial: 'Commercial',
    production: 'Production / Execution',
    financial: 'Financial',
    other: 'Other',
  };

  if (!open) return null;

  const title =
    mode === 'read' ? 'View Notes/History Categories' : 'Edit Notes/History Categories';

  return (
    <OverlayPortal>
      <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
          <div className="p-4 border-b flex items-center justify-between">
            <div className="font-semibold">{title}</div>
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded hover:bg-gray-100 grid place-items-center text-xl"
              aria-label="Close"
            >
              ×
            </button>
          </div>

          <div className="p-4 overflow-y-auto flex-1 space-y-4">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={allowAll}
                onChange={() => setAllowAll((v) => !v)}
                className="mt-1 w-4 h-4 rounded border-gray-300 text-brand-red focus:ring-brand-red"
              />
              <div className="min-w-0">
                <div className="text-xs font-medium text-gray-900">Allow all categories</div>
                <div className="text-[10px] text-gray-500">
                  If enabled, this user can access all Notes/History categories.
                </div>
              </div>
            </label>

            <div className={`${allowAll ? 'opacity-50 pointer-events-none' : ''}`}>
              <div className="text-xs font-semibold text-gray-600 mb-2 uppercase tracking-wide">
                Allowed categories
              </div>
              {(['commercial', 'production', 'financial', 'other'] as const).map((groupKey) => {
                const list = grouped[groupKey];
                if (!list.length) return null;
                return (
                  <div key={groupKey} className="mb-3">
                    <div className="text-[10px] font-semibold text-gray-500 mb-1.5">
                      {groupLabels[groupKey]}
                    </div>
                    <div className="grid sm:grid-cols-2 gap-2">
                      {list.map((cat) => {
                        const key = categoryKey(cat);
                        const checked = selected.includes(key);
                        return (
                          <label
                            key={key}
                            className="flex items-center gap-2 p-2 rounded border hover:bg-gray-50 cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => {
                                setSelected((prev) =>
                                  checked ? prev.filter((x) => x !== key) : [...prev, key]
                                );
                              }}
                              className="w-4 h-4 rounded border-gray-300 text-brand-red focus:ring-brand-red"
                            />
                            <span className="text-sm">{cat.label}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
              {!allowAll && selected.length === 0 && (
                <div className="mt-2 text-xs text-red-600">
                  Select at least 1 category or enable “Allow all categories”.
                </div>
              )}
            </div>
          </div>

          <div className="p-4 border-t bg-gray-50 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded border bg-white hover:bg-gray-50 text-gray-700 text-sm font-medium"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                if (!allowAll && selected.length === 0) return;
                onSave(allowAll ? null : selected);
                onClose();
              }}
              className="px-4 py-2 rounded bg-brand-red hover:bg-red-700 text-white text-sm font-medium"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </OverlayPortal>
  );
}
