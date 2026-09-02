import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { PermissionAccessLevelSelect } from '@/components/PermissionAccessLevelSelect';
import {
  buildProjectCategoryLevels,
  applyProjectCategoryAccessLevel,
  isProjectCategoryAllowAll,
  setAllProjectCategoriesAllowAll,
  type ProjectCategoryAllowLists,
} from '@/lib/projectCategoryPermissions';
import { permissionUi } from '@/components/permissionUi';
import { PermissionToggleLabel } from '@/components/PermissionToggleRow';
import { PERMISSION_ACCESS_LEVEL_LABELS, type PermissionAccessLevel } from '@/lib/permissionAccessLevel';
import {
  AppButton,
  AppFormModal,
  uiCx,
  uiLayout,
  uiSpacing,
} from '@/components/ui';

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
  /** Optional quick-info panel (? in header). */
  quickInfo?: ReactNode;
  categories: ProjectCategoryItem[];
  readCategories: string[] | null;
  writeCategories: string[] | null;
  /** When false, only Blocked and View only are offered (macro permission is view-only). */
  macroCanEdit: boolean;
  /** When true, saving with every category blocked is allowed (deny-by-default). */
  allowEmpty?: boolean;
  allowAllLabel?: string;
  allowAllDescription?: string;
  groupLabels?: Record<string, string>;
  onClose: () => void;
  onSave: (lists: ProjectCategoryAllowLists) => void;
};

const GROUP_ORDER = ['commercial', 'production', 'financial', 'other'] as const;

export default function ProjectCategoryPermissionsModal({
  open,
  title,
  subtitle,
  quickInfo,
  categories,
  readCategories,
  writeCategories,
  macroCanEdit,
  allowEmpty = false,
  allowAllLabel = 'Allow all categories',
  allowAllDescription = 'Default — user can access every category according to the permission above.',
  groupLabels,
  onClose,
  onSave,
}: Props) {
  const allIds = useMemo(() => categories.map((c) => c.id), [categories]);

  const [allowAll, setAllowAll] = useState(true);
  const [lists, setLists] = useState<ProjectCategoryAllowLists>({ read: null, write: null });
  const levels = useMemo(
    () => buildProjectCategoryLevels(lists.read, lists.write, allIds, macroCanEdit),
    [lists, allIds, macroCanEdit],
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
    <div key={cat.id} className="flex items-center gap-3 border-b border-gray-200/80 py-2 last:border-0">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {cat.icon ? <span className="shrink-0 text-lg">{cat.icon}</span> : null}
        <span className={uiCx(permissionUi.rowTitle, 'truncate')}>{cat.label}</span>
      </div>
      <PermissionAccessLevelSelect
        value={levels[cat.id] ?? (macroCanEdit ? 'edit' : 'view')}
        disabled={allowAll}
        options={options}
        onChange={(level) => {
          const base = allowAll ? { read: null, write: null } : lists;
          const next = applyProjectCategoryAccessLevel(
            cat.id,
            level,
            base.read,
            base.write,
            allIds,
            macroCanEdit,
          );
          setLists(next);
          setAllowAll(false);
        }}
        aria-label={`Access for ${cat.label}`}
      />
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
    !allowEmpty &&
    !allowAll &&
    allIds.length > 0 &&
    allIds.every((id) => (levels[id] ?? 'blocked') === 'blocked');

  return (
    <AppFormModal
      open={open}
      onClose={onClose}
      title={title}
      description={subtitle}
      quickInfo={quickInfo}
      formWidth="comfortable"
      footer={
        <div className={uiCx(uiLayout.actionsRow, 'justify-end')}>
          <AppButton type="button" variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </AppButton>
          <AppButton type="button" size="sm" onClick={handleSave} disabled={hasBlockedAll}>
            Save
          </AppButton>
        </div>
      }
    >
      <div className={uiSpacing.sectionStack}>
        <PermissionToggleLabel
          label={allowAllLabel}
          description={allowAllDescription}
          checked={allowAll}
          onToggle={handleAllowAllChange}
        />

        <div className={allowAll ? 'pointer-events-none opacity-50' : ''}>
          <div className={uiCx(permissionUi.columnTitle, 'mb-2')}>Per category</div>
          {grouped ? (
            GROUP_ORDER.map((groupKey) => {
              const list = grouped[groupKey];
              if (!list.length) return null;
              return (
                <div key={groupKey} className="mb-3 rounded-lg bg-gray-50/80 p-2.5">
                  <div className={uiCx(permissionUi.subgroupTitle)}>{labels[groupKey] ?? groupKey}</div>
                  <div>{list.map(renderRow)}</div>
                </div>
              );
            })
          ) : (
            <div className="rounded-lg bg-gray-50/80 p-2.5">{categories.map(renderRow)}</div>
          )}
          {hasBlockedAll ? (
            <div className="mt-2 text-xs text-red-600">
              At least one category must be allowed, or enable “Allow all categories”.
            </div>
          ) : null}
        </div>
      </div>
    </AppFormModal>
  );
}
