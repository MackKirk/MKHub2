import { useMemo, useState } from 'react';
import { Loader2, Search } from 'lucide-react';
import {
  GRID_CARD_CLASS,
  GRID_CLASS,
  PICKER_BODY_HEIGHT_CLASS,
} from '@/components/DocumentTypePicker';
import {
  AppInput,
  AppUserAvatar,
  SelectDropdownCheckbox,
  uiCx,
  uiTypography,
} from '@/components/ui';
import { getUserDisplayName } from '@/lib/userDisplay';
import { getProjectDivisionLabel } from '@/lib/projectListRowUtils';

type ProjectDivisionNode = {
  id?: string;
  label?: string;
  subdivisions?: ProjectDivisionNode[];
};

export type ShiftWorkerCandidate = {
  id: string;
  name?: string;
  username?: string;
  first_name?: string;
  last_name?: string;
  preferred_name?: string;
  profile_photo_file_id?: string | null;
  project_division_ids?: string[] | null;
  status?: string;
  is_active?: boolean;
};

type NavItem = { value: string; label: string; count: number };

function flattenDivisionIds(tree: ProjectDivisionNode[] | undefined): { id: string; label: string }[] {
  const out: { id: string; label: string }[] = [];
  if (!Array.isArray(tree)) return out;
  for (const d of tree) {
    if (d?.id) out.push({ id: String(d.id), label: d.label || 'Division' });
    for (const sub of d.subdivisions || []) {
      if (sub?.id) {
        out.push({
          id: String(sub.id),
          label: d.label ? `${d.label} — ${sub.label || 'Subdivision'}` : sub.label || 'Subdivision',
        });
      }
    }
  }
  return out;
}

function CategoryNavButton({
  item,
  selected,
  onSelect,
  layout,
}: {
  item: NavItem;
  selected: boolean;
  onSelect: (value: string) => void;
  layout: 'sidebar' | 'chip';
}) {
  if (layout === 'chip') {
    return (
      <button
        type="button"
        role="tab"
        aria-selected={selected}
        onClick={() => onSelect(item.value)}
        className={uiCx(
          'shrink-0 rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors',
          selected
            ? 'border-brand-red bg-red-50 text-brand-red'
            : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300',
        )}
      >
        {item.label}
        <span className="ml-1 tabular-nums text-gray-500">{item.count}</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onSelect(item.value)}
      className={uiCx(
        'w-full flex items-center justify-between gap-1 px-2 py-1.5 rounded-md text-sm text-left transition-colors border',
        selected
          ? 'border-brand-red bg-red-50 text-brand-red font-semibold ring-1 ring-inset ring-brand-red/30'
          : 'border-transparent text-gray-700 hover:bg-gray-50',
      )}
    >
      <span className="min-w-0 truncate">{item.label}</span>
      <span className={uiCx('shrink-0 tabular-nums text-xs', selected ? 'text-brand-red' : 'text-gray-500')}>
        {item.count}
      </span>
    </button>
  );
}

export function ShiftWorkerDivisionPicker({
  employees,
  projectDivisions,
  value,
  onChange,
  disabled,
  loading = false,
}: {
  employees: ShiftWorkerCandidate[];
  projectDivisions?: ProjectDivisionNode[];
  value: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
  loading?: boolean;
}) {
  const [activeDivision, setActiveDivision] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const activeEmployees = useMemo(() => {
    return (Array.isArray(employees) ? employees : []).filter((e) => {
      if (!e?.id) return false;
      if (e.is_active === false) return false;
      const st = String(e.status || '').toLowerCase();
      if (st === 'inactive' || st === 'terminated' || st === 'disabled') return false;
      return true;
    });
  }, [employees]);

  const catalogDivisions = useMemo(
    () => flattenDivisionIds(projectDivisions),
    [projectDivisions],
  );

  const countByDivision = useMemo(() => {
    const map = new Map<string, number>();
    for (const emp of activeEmployees) {
      const ids = Array.isArray(emp.project_division_ids)
        ? emp.project_division_ids.map(String)
        : [];
      if (ids.length === 0) {
        map.set('unassigned', (map.get('unassigned') || 0) + 1);
        continue;
      }
      for (const id of ids) {
        map.set(id, (map.get(id) || 0) + 1);
      }
    }
    return map;
  }, [activeEmployees]);

  const navItems: NavItem[] = useMemo(() => {
    const items: NavItem[] = [
      { value: 'all', label: 'All', count: activeEmployees.length },
    ];
    for (const d of catalogDivisions) {
      const count = countByDivision.get(d.id) || 0;
      if (count <= 0) continue;
      items.push({
        value: d.id,
        label: d.label,
        count,
      });
    }
    // Divisions present on people but missing from catalog
    for (const [id, count] of countByDivision.entries()) {
      if (id === 'unassigned') continue;
      if (items.some((i) => i.value === id)) continue;
      items.push({
        value: id,
        label: getProjectDivisionLabel(id, projectDivisions as any[]),
        count,
      });
    }
    const unassigned = countByDivision.get('unassigned') || 0;
    if (unassigned > 0) {
      items.push({ value: 'unassigned', label: 'No division', count: unassigned });
    }
    return items;
  }, [activeEmployees.length, catalogDivisions, countByDivision, projectDivisions]);

  // Keep active division valid when nav shrinks
  const safeActive =
    navItems.some((i) => i.value === activeDivision) ? activeDivision : 'all';

  const filteredEmployees = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return activeEmployees
      .filter((emp) => {
        const ids = Array.isArray(emp.project_division_ids)
          ? emp.project_division_ids.map(String)
          : [];
        if (safeActive === 'all') {
          // keep
        } else if (safeActive === 'unassigned') {
          if (ids.length > 0) return false;
        } else if (!ids.includes(safeActive)) {
          return false;
        }
        if (!q) return true;
        const name = (getUserDisplayName(emp) || emp.name || emp.username || '').toLowerCase();
        return name.includes(q);
      })
      .sort((a, b) =>
        (getUserDisplayName(a) || a.name || '').localeCompare(
          getUserDisplayName(b) || b.name || '',
          undefined,
          { sensitivity: 'base' },
        ),
      );
  }, [activeEmployees, safeActive, searchQuery]);

  const selectedSet = useMemo(() => new Set((value || []).map(String)), [value]);

  const toggle = (id: string) => {
    if (disabled) return;
    const next = new Set(selectedSet);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(Array.from(next));
  };

  if (loading) {
    return (
      <div
        className={uiCx(
          PICKER_BODY_HEIGHT_CLASS,
          'flex items-center justify-center gap-2 text-sm text-gray-500',
        )}
      >
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        Loading people…
      </div>
    );
  }

  return (
    <div
      className={uiCx(
        PICKER_BODY_HEIGHT_CLASS,
        'flex flex-col gap-3 sm:flex-row sm:gap-4 sm:items-stretch',
      )}
    >
      <div
        className="flex sm:hidden gap-1.5 overflow-x-auto pb-1 -mx-1 px-1 shrink-0"
        role="tablist"
        aria-label="Divisions"
      >
        {navItems.map((item) => (
          <CategoryNavButton
            key={item.value}
            item={item}
            selected={safeActive === item.value}
            onSelect={setActiveDivision}
            layout="chip"
          />
        ))}
      </div>

      <nav
        className="hidden sm:flex sm:flex-col sm:w-40 sm:shrink-0 sm:min-h-0 sm:overflow-y-auto gap-0.5"
        aria-label="Divisions"
      >
        <p className={uiCx(uiTypography.overline, 'px-2 mb-1')}>Divisions</p>
        {navItems.map((item) => (
          <CategoryNavButton
            key={item.value}
            item={item}
            selected={safeActive === item.value}
            onSelect={setActiveDivision}
            layout="sidebar"
          />
        ))}
      </nav>

      <div className="min-w-0 flex-1 flex flex-col min-h-0 gap-3">
        <div className="shrink-0">
          <AppInput
            label="Search"
            placeholder="Search people…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            leftIcon={<Search className="h-4 w-4" />}
            aria-label="Search people"
          />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-0.5">
          {filteredEmployees.length === 0 ? (
            <p className={uiCx(uiTypography.helper, 'text-gray-500 py-6 text-center')}>
              No people in this division
              {searchQuery.trim() ? ' match your search' : ''}.
            </p>
          ) : (
            <div className={GRID_CLASS}>
              {filteredEmployees.map((emp) => {
                const selected = selectedSet.has(String(emp.id));
                const name = getUserDisplayName(emp) || emp.name || emp.username || 'Worker';
                return (
                  <button
                    key={emp.id}
                    type="button"
                    disabled={disabled}
                    aria-pressed={selected}
                    onClick={() => toggle(String(emp.id))}
                    title={name}
                    className={uiCx(
                      GRID_CARD_CLASS,
                      '!flex-row items-center gap-2.5 p-2 text-left',
                      selected &&
                        'border-brand-red bg-red-50 ring-1 ring-inset ring-brand-red/30',
                      disabled && 'opacity-60 cursor-not-allowed',
                    )}
                  >
                    <span className="relative shrink-0">
                      <AppUserAvatar
                        user={emp}
                        size="md"
                        className="!h-11 !w-11 !rounded-lg !text-sm"
                      />
                      <span
                        className="absolute -left-0.5 -top-0.5 pointer-events-none drop-shadow-sm"
                        aria-hidden
                      >
                        <SelectDropdownCheckbox checked={selected} />
                      </span>
                    </span>
                    <span className="min-w-0 flex-1 self-stretch flex items-center">
                      <span className="text-sm font-semibold text-gray-900 line-clamp-2 leading-snug">
                        {name}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <p
          className={uiCx(
            uiTypography.helper,
            'shrink-0 font-semibold',
            selectedSet.size > 0 ? 'text-gray-800' : 'text-gray-500',
          )}
        >
          {selectedSet.size} selected
        </p>
      </div>
    </div>
  );
}
