import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { isHiddenReportCategory } from '@/lib/reportCategories';
import ProjectCategoryPermissionsModal, {
  type ProjectCategoryItem,
} from '@/components/ProjectCategoryPermissionsModal';
import type { ProjectCategoryAllowLists } from '@/lib/projectCategoryPermissions';

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
  open,
  readCategories,
  writeCategories,
  macroCanEdit,
  onClose,
  onSave,
}: {
  open: boolean;
  readCategories: string[] | null;
  writeCategories: string[] | null;
  macroCanEdit: boolean;
  onClose: () => void;
  onSave: (lists: ProjectCategoryAllowLists) => void;
}) {
  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api<Record<string, unknown>>('GET', '/settings'),
    enabled: open,
  });

  const items: ProjectCategoryItem[] = useMemo(() => {
    const raw = (settings?.report_categories || []) as ReportCategory[];
    return [...raw]
      .filter((cat) => !isHiddenReportCategory(cat))
      .sort((a, b) => (a.sort_index || 0) - (b.sort_index || 0))
      .map((cat) => ({
        id: categoryKey(cat),
        label: cat.label,
        group: cat.meta?.group || 'other',
      }));
  }, [settings]);

  return (
    <ProjectCategoryPermissionsModal
      open={open}
      title="Notes/History — category access"
      subtitle="Set view-only or edit per report category. Applies when Notes/History permission above is not Blocked."
      categories={items}
      readCategories={readCategories}
      writeCategories={writeCategories}
      macroCanEdit={macroCanEdit}
      onClose={onClose}
      onSave={onSave}
    />
  );
}
