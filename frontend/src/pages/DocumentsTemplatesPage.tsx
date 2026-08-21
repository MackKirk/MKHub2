import { useQuery } from '@tanstack/react-query';
import { FileStack } from 'lucide-react';
import { api } from '@/lib/api';
import DocumentTemplatesTab from '@/components/DocumentTemplatesTab';
import DocumentTypesTab from '@/components/DocumentTypesTab';
import {
  AppCard,
  AppEmptyState,
  AppPageHeader,
  uiCx,
  uiSpacing,
} from '@/components/ui';

export default function DocumentsTemplatesPage() {
  const { data: settingsPerms, isFetched } = useQuery({
    queryKey: ['me-settings-permissions'],
    queryFn: () => api<any>('GET', '/auth/me/settings-permissions'),
    refetchOnMount: 'always',
    staleTime: 0,
  });

  const canViewDocBg = !!settingsPerms?.can_view_document_backgrounds;
  const canEditDocBg = !!settingsPerms?.can_edit_document_backgrounds;
  const canViewDocTpl = !!settingsPerms?.can_view_document_templates;
  const canEditDocTpl = !!settingsPerms?.can_edit_document_templates;

  return (
    <div className={uiCx('w-full min-w-0', uiSpacing.pageStack, 'min-h-full bg-gray-50')}>
      <AppPageHeader
        title="Document Templates"
        subtitle="Background images and preset page layouts used in Document Builder."
        icon={<FileStack className="h-4 w-4" />}
      />

      {!isFetched ? (
        <AppCard>
          <AppEmptyState title="Loading…" description="Checking your permissions." />
        </AppCard>
      ) : !canViewDocBg && !canViewDocTpl ? (
        <AppCard>
          <AppEmptyState
            title="No access"
            description="You do not have permission to view document templates. Ask an administrator to grant Document creator template permissions."
          />
        </AppCard>
      ) : (
        <div className={uiSpacing.pageStack}>
          {canViewDocBg ? (
            <AppCard
              title="Background templates"
              subtitle="Page backgrounds (images) used when building documents in Document Builder."
              className="min-w-0"
            >
              <DocumentTemplatesTab readOnly={!canEditDocBg} />
            </AppCard>
          ) : null}
          {canViewDocTpl ? (
            <AppCard
              title="Document templates"
              subtitle="Preset layouts (ordered pages with backgrounds and fields) offered when creating a new document."
              className="min-w-0"
            >
              <DocumentTypesTab readOnly={!canEditDocTpl} />
            </AppCard>
          ) : null}
        </div>
      )}
    </div>
  );
}
