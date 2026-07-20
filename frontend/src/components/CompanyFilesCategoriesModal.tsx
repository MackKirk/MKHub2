import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import ProjectCategoryPermissionsModal, {
  type ProjectCategoryItem,
} from '@/components/ProjectCategoryPermissionsModal';
import type { ProjectCategoryAllowLists } from '@/lib/projectCategoryPermissions';

type Department = { id: string; label: string; sort_index?: number };

export default function CompanyFilesCategoriesModal({
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
  const { data: departments } = useQuery({
    queryKey: ['company-files-departments-admin'],
    queryFn: () => api<Department[]>('GET', '/company/files/departments/all'),
    enabled: open,
  });

  const items: ProjectCategoryItem[] = useMemo(() => {
    return (departments || []).map((d) => ({
      id: String(d.id),
      label: String(d.label || d.id),
      icon: '📁',
    }));
  }, [departments]);

  return (
    <ProjectCategoryPermissionsModal
      open={open}
      title="Company Files — category access"
      subtitle="Set view-only or edit per file category. Applies when Company Files permission above is not Blocked."
      categories={items}
      readCategories={readCategories}
      writeCategories={writeCategories}
      macroCanEdit={macroCanEdit}
      onClose={onClose}
      onSave={onSave}
    />
  );
}
