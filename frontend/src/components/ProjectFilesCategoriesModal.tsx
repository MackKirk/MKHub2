import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import ProjectCategoryPermissionsModal, {
  type ProjectCategoryItem,
} from '@/components/ProjectCategoryPermissionsModal';
import type { ProjectCategoryAllowLists } from '@/lib/projectCategoryPermissions';

export default function ProjectFilesCategoriesModal({
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
  const { data: categories } = useQuery({
    queryKey: ['file-categories'],
    queryFn: () => api<any[]>('GET', '/clients/file-categories'),
    enabled: open,
  });

  const items: ProjectCategoryItem[] = useMemo(() => {
    return (categories || [])
      .filter((c: any) => String(c?.id || '') !== 'photos')
      .map((c: any) => ({
        id: String(c.id),
        label: String(c.name || c.id),
        icon: c.icon || '📁',
      }));
  }, [categories]);

  return (
    <ProjectCategoryPermissionsModal
      open={open}
      title="Files — category access"
      subtitle="Set view-only or edit per file category. Applies when Files permission above is not Blocked."
      categories={items}
      readCategories={readCategories}
      writeCategories={writeCategories}
      macroCanEdit={macroCanEdit}
      onClose={onClose}
      onSave={onSave}
    />
  );
}
