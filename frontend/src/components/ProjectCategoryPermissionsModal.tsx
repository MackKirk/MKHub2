import { useEffect, useMemo, useState } from 'react';
import OverlayPortal from '@/components/OverlayPortal';
import {
  buildProjectCategoryLevels,
  applyProjectCategoryAccessLevel,
  isProjectCategoryAllowAll,
  setAllProjectCategoriesAllowAll,
  type ProjectCategoryAllowLists,
} from '@/lib/projectCategoryPermissions';
import { PERMISSION_ACCESS_LEVEL_LABELS, type PermissionAccessLevel } from '@/lib/permissionAccessLevel';

export type ProjectCategoryItem = {
  id: string;
  label: string;
  icon?: string;
  group?: string;
};

type Props = {
  open: boolean;
  title: string;
  subtitle?: string;
  categories: ProjectCategoryItem[];
  readCategories: string[] | null;
  writeCategories: string[] | null;
  /** When false, only Blocked and View only are offered (macro permission is view-only). */
  macroCanEdit: boolean;
  groupLabels?: Record<string, string>;
  onClose: () => void;
  onSave: (lists: ProjectCategoryAllowLists) => void;
};

const GROUP_ORDER = ['commercial', 'production', 'financial', 'other'] as const;

export default function ProjectCategoryPermissionsModal({
  open,
  title,
  subtitle,
  categories,
  readCategories,
  writeCategories,
  macroCanEdit,
  groupLabels,
  onClose,
  onSave,
}: Props) {
  const allIds = useMemo(() => categories.map((c) => c.id), [categories]);

  const [allowAll, setAllowAll] = useState(true);
  const [lists, setLists] = useState<ProjectCategoryAllowLists>({ read: null, write: null });
  const levels = useMemo(
    () => buildProjectCategoryLevels(lists.read, lists.write, allIds, macroCanEdit),
    [lists, allIds, macroCanEdit]
  );

  useEffect(() => {
    if (!open) return;
    const initial = { read: readCategories, write: writeCategories };
    setAllowAll(isProjectCategoryAllowAll(initial));
    setLists(initial);
  }, [open, readCategories, writeCategories, macroCanEdit, categories.length]);

  const grouped = useMemo(() => {
    const hasGroups = categories.some((c) => c.group);
    if (!hasGroups) return null;
    const groups: Record<string, ProjectCategoryItem[]> = {
      commercial: [],
      production: [],
      financial: [],
      other: [],
    };
    categories.forEach((cat) => {
      const g = cat.group && cat.group in groups ? cat.group : 'other';
      groups[g].push(cat);
    });
    return groups;
  }, [categories]);

  const defaultGroupLabels: Record<string, string> = {
    commercial: 'Commercial',
    production: 'Production / Execution',
    financial: 'Financial',
    other: 'Other',
  };
  const labels = groupLabels ?? defaultGroupLabels;

  const options: { value: PermissionAccessLevel; label: string }[] = [
    { value: 'blocked', label: PERMISSION_ACCESS_LEVEL_LABELS.blocked },
    { value: 'view', label: PERMISSION_ACCESS_LEVEL_LABELS.view },
  ];
  if (macroCanEdit) {
    options.push({ value: 'edit', label: PERMISSION_ACCESS_LEVEL_LABELS.edit });
  }

  const renderRow = (cat: ProjectCategoryItem) => (
    <div
      key={cat.id}
      className="flex items-center gap-2 p-2 rounded border bg-white hover:bg-gray-50"
    >
      <div className="flex-1 min-w-0 flex items-center gap-2">
        {cat.icon && <span className="text-lg shrink-0">{cat.icon}</span>}
        <span className="text-sm text-gray-900 truncate">{cat.label}</span>
      </div>
      <select
        value={levels[cat.id] ?? (macroCanEdit ? 'edit' : 'view')}
        disabled={allowAll}
        onChange={(e) => {
          const level = e.target.value as PermissionAccessLevel;
          const base = allowAll ? { read: null, write: null } : lists;
          const next = applyProjectCategoryAccessLevel(
            cat.id,
            level,
            base.read,
            base.write,
            allIds,
            macroCanEdit
          );
          setLists(next);
          setAllowAll(false);
        }}
        className="shrink-0 text-xs border border-gray-300 rounded-md px-2 py-1 bg-white text-gray-800 focus:ring-1 focus:ring-brand-red focus:border-brand-red disabled:opacity-50 min-w-[7.5rem]"
        aria-label={`Access for ${cat.label}`}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );

  const handleAllowAllChange = () => {
    const next = !allowAll;
    setAllowAll(next);
    if (next) {
      setLists(setAllProjectCategoriesAllowAll());
    }
  };

  const handleSave = () => {
    if (allowAll) {
      onSave(setAllProjectCategoriesAllowAll());
    } else {
      onSave(lists);
    }
    onClose();
  };

  const hasBlockedAll =
    !allowAll && allIds.length > 0 && allIds.every((id) => (levels[id] ?? 'blocked') === 'blocked');

  if (!open) return null;

  return (
    <OverlayPortal>
      <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
          <div className="p-4 border-b flex items-center justify-between">
            <div>
              <div className="font-semibold">{title}</div>
              {subtitle && <div className="text-[10px] text-gray-500 mt-0.5">{subtitle}</div>}
            </div>
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
                onChange={handleAllowAllChange}
                className="mt-1 w-4 h-4 rounded border-gray-300 text-brand-red focus:ring-brand-red"
              />
              <div className="min-w-0">
                <div className="text-xs font-medium text-gray-900">Allow all categories</div>
                <div className="text-[10px] text-gray-500">
                  Default — user can access every category according to the permission above.
                </div>
              </div>
            </label>

            <div className={allowAll ? 'opacity-50 pointer-events-none' : ''}>
              <div className="text-xs font-semibold text-gray-600 mb-2 uppercase tracking-wide">
                Per category
              </div>
              {grouped ? (
                GROUP_ORDER.map((groupKey) => {
                  const list = grouped[groupKey];
                  if (!list.length) return null;
                  return (
                    <div key={groupKey} className="mb-3">
                      <div className="text-[10px] font-semibold text-gray-500 mb-1.5">
                        {labels[groupKey] ?? groupKey}
                      </div>
                      <div className="grid sm:grid-cols-1 gap-2">{list.map(renderRow)}</div>
                    </div>
                  );
                })
              ) : (
                <div className="grid sm:grid-cols-1 gap-2">{categories.map(renderRow)}</div>
              )}
              {hasBlockedAll && (
                <div className="mt-2 text-xs text-red-600">
                  At least one category must be allowed, or enable “Allow all categories”.
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
              onClick={handleSave}
              disabled={hasBlockedAll}
              className="px-4 py-2 rounded bg-brand-red hover:bg-red-700 text-white text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </OverlayPortal>
  );
}
