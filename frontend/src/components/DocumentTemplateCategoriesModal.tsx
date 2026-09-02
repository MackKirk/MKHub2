import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import ProjectCategoryPermissionsModal, {
  type ProjectCategoryItem,
} from '@/components/ProjectCategoryPermissionsModal';
import { formModalQuickInfo, uiLabel } from '@/lib/formModalQuickInfo';

type SettingsListItem = { id: string; label: string; sort_index?: number };

export default function DocumentTemplateCategoriesModal({
  open,
  readCategories,
  onClose,
  onSave,
}: {
  open: boolean;
  readCategories: string[];
  onClose: () => void;
  onSave: (readIds: string[]) => void;
}) {
  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api<Record<string, SettingsListItem[]>>('GET', '/settings'),
    enabled: open,
  });

  const items: ProjectCategoryItem[] = useMemo(() => {
    const rows = settings?.document_template_categories || [];
    return [...rows]
      .sort(
        (a, b) =>
          (a.sort_index ?? 0) - (b.sort_index ?? 0) || String(a.label).localeCompare(String(b.label)),
      )
      .map((row) => ({
        id: String(row.id),
        label: String(row.label || row.id),
      }));
  }, [settings?.document_template_categories]);

  return (
    <ProjectCategoryPermissionsModal
      open={open}
      title="Document templates — category access"
      subtitle="Choose which template categories this user can see and use."
      quickInfo={formModalQuickInfo({
        purpose: (
          <>
            Controls which document template categories this user can see and use when creating documents, and which
            categories they can assign when managing templates.
          </>
        ),
        howToUse: (
          <>
            Turn on {uiLabel('View')} for each category they need. Leave categories blocked if they should not appear
            when creating a document or in the templates list.
          </>
        ),
        behavior: (
          <>
            {uiLabel('Document Builder - Templates')} only unlocks the templates admin page. Uncategorized templates
            and blank pages stay available with Document Builder. Saving with nothing checked means no categorized
            templates.
          </>
        ),
        actions: (
          <>
            {uiLabel('Save')} applies this allow-list when you save the user permissions. {uiLabel('Cancel')} discards
            changes in this panel.
          </>
        ),
      })}
      categories={items}
      readCategories={readCategories}
      writeCategories={[]}
      macroCanEdit={false}
      allowEmpty
      allowAllDescription="Grants every template category listed here. After new categories are added in Settings, open this panel again to include them (or use Allow all)."
      onClose={onClose}
      onSave={({ read }) => {
        const nextRead = read === null ? items.map((item) => item.id) : [...(read || [])];
        onSave(nextRead);
      }}
    />
  );
}
