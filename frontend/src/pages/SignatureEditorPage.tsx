import { useCallback, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PenLine } from 'lucide-react';
import toast from 'react-hot-toast';
import { api, fetchAuthorizedBinary } from '@/lib/api';
import { isAdminRole } from '@/lib/projectLinePermissionKeys';
import {
  canEditSignatureEditor,
  canViewSignatureEditor,
} from '@/lib/documentHubPermissions';
import PdfSignatureDocumentLibrary, {
  type PdfSignatureLibraryDoc,
} from '@/components/PdfSignatureDocumentLibrary';
import SignatureTemplateEditor, {
  type SigTemplatePayload,
} from '@/components/SignatureTemplateEditor';
import { AppEmptyState, AppPageHeader, AppCard, uiCx, uiSpacing } from '@/components/ui';

type SigDoc = PdfSignatureLibraryDoc & { file_id?: string };

export default function SignatureEditorPage() {
  const qc = useQueryClient();
  const { data: me, isFetched } = useQuery({
    queryKey: ['me'],
    queryFn: () => api<{ roles?: string[]; permissions?: string[] }>('GET', '/auth/me'),
  });
  const isAdmin = isAdminRole(me?.roles);
  const perms = new Set((me?.permissions || []).map(String));
  const canEdit = canEditSignatureEditor(isAdmin, perms);
  const canView = canViewSignatureEditor(isAdmin, perms);

  const { data: documents = [] } = useQuery({
    queryKey: ['document-signature-templates'],
    queryFn: () => api<SigDoc[]>('GET', '/document-signature-templates'),
    enabled: isFetched && canView,
  });

  const [templateDoc, setTemplateDoc] = useState<SigDoc | null>(null);

  const loadPdf = useCallback(async () => {
    if (!templateDoc) throw new Error('No document selected');
    return fetchAuthorizedBinary(`/document-signature-templates/${templateDoc.id}/preview`);
  }, [templateDoc]);

  const saveTemplate = useCallback(
    async (payload: { signature_template: SigTemplatePayload }) => {
      if (!templateDoc) throw new Error('No document selected');
      await api('PUT', `/document-signature-templates/${templateDoc.id}`, payload);
    },
    [templateDoc],
  );

  return (
    <div className={uiCx('w-full min-w-0 overflow-x-hidden', uiSpacing.pageStack, 'min-h-full bg-gray-50')}>
      <AppPageHeader
        title="Signature Editor"
        subtitle="Upload PDFs and place signature, date, and fill-in fields for later sending."
        icon={<PenLine className="h-4 w-4" />}
      />

      {!isFetched ? (
        <AppCard>
          <AppEmptyState title="Loading…" description="Checking your permissions." />
        </AppCard>
      ) : !canView ? (
        <AppCard>
          <AppEmptyState
            title="No access"
            description="You do not have permission to view the Signature Editor."
          />
        </AppCard>
      ) : (
        <PdfSignatureDocumentLibrary
          documents={documents}
          fileCategoryId="document-signature-template"
          thumbnailUrl={(id) => `/document-signature-templates/${id}/thumbnail`}
          previewUrl={(id) => `/document-signature-templates/${id}/preview`}
          readOnly={!canEdit}
          sectionTitle="Signature documents (PDF)"
          emptyTitle="No signature documents yet."
          emptyDescription="Upload PDFs above to place signature fields."
          onCreate={async (name, fileId) => {
            await api('POST', '/document-signature-templates', { name, file_id: fileId });
            await qc.invalidateQueries({ queryKey: ['document-signature-templates'] });
          }}
          onDelete={async (doc) => {
            await api('DELETE', `/document-signature-templates/${doc.id}`);
            await qc.invalidateQueries({ queryKey: ['document-signature-templates'] });
          }}
          onEditTemplate={(doc) => setTemplateDoc(doc)}
        />
      )}

      {templateDoc ? (
        <SignatureTemplateEditor
          docId={templateDoc.id}
          docName={templateDoc.name}
          initialTemplate={templateDoc.signature_template as SigTemplatePayload | null | undefined}
          loadPdf={loadPdf}
          saveTemplate={saveTemplate}
          onClose={() => setTemplateDoc(null)}
          onSaved={() => {
            void qc.invalidateQueries({ queryKey: ['document-signature-templates'] });
            toast.success('Signature template saved');
          }}
        />
      ) : null}
    </div>
  );
}
