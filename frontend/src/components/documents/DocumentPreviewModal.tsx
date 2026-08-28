import { useQuery } from '@tanstack/react-query';
import { api, withFileAccessToken } from '@/lib/api';
import DocumentPreview from '@/components/DocumentPreview';
import type { DocumentPage, DocumentSignerRoleDef, PageMargins } from '@/types/documentCreator';
import {
  AppButton,
  AppFormModal,
  AppEmptyState,
  uiCx,
  uiTypography,
} from '@/components/ui';

type Template = { id: string; background_file_id?: string; margins?: PageMargins | null };

type FullDocument = {
  id: string;
  title: string;
  pages?: DocumentPage[];
  signer_roles?: DocumentSignerRoleDef[];
};

type DocumentPreviewModalProps = {
  documentId: string | null;
  documentTitle?: string;
  open: boolean;
  onClose: () => void;
};

const DEFAULT_MARGINS: PageMargins = { left_pct: 0, right_pct: 0, top_pct: 0, bottom_pct: 0 };

export default function DocumentPreviewModal({
  documentId,
  documentTitle,
  open,
  onClose,
}: DocumentPreviewModalProps) {
  const { data: doc, isLoading, isError } = useQuery({
    queryKey: ['document-creator-doc', documentId, 'preview'],
    queryFn: () => api<FullDocument>('GET', `/document-creator/documents/${documentId}`),
    enabled: open && !!documentId,
    staleTime: 30_000,
  });

  const { data: templates = [] } = useQuery({
    queryKey: ['document-creator-templates'],
    queryFn: () => api<Template[]>('GET', '/document-creator/templates'),
    enabled: open,
    staleTime: 60_000,
  });

  const pages = (Array.isArray(doc?.pages) ? doc.pages : []) as DocumentPage[];
  const title = documentTitle || doc?.title || 'Document preview';

  if (!open) return null;

  return (
    <AppFormModal
      open
      onClose={onClose}
      title={title}
      description="Read-only preview"
      formWidth="wide"
      scrollBody={false}
      footer={
        <div className="flex w-full justify-end">
          <AppButton type="button" variant="secondary" size="sm" onClick={onClose}>
            Close
          </AppButton>
        </div>
      }
    >
      {isLoading ? (
        <p className={uiCx(uiTypography.helper, 'py-8 text-center')}>Loading preview…</p>
      ) : isError || !doc ? (
        <AppEmptyState title="Could not load preview" description="Try again or open the editor." />
      ) : pages.length === 0 ? (
        <AppEmptyState title="No pages" description="This document has no pages yet." />
      ) : (
        <div className="max-h-[min(70vh,720px)] space-y-6 overflow-y-auto py-2">
          {pages.map((page, pageIndex) => {
            const tmpl = templates.find((t) => t.id === (page.template_id ?? ''));
            const bgUrl = tmpl?.background_file_id
              ? withFileAccessToken(`/files/${tmpl.background_file_id}/thumbnail?w=800`)
              : null;
            const margins: PageMargins = {
              ...DEFAULT_MARGINS,
              ...tmpl?.margins,
              ...page.margins,
            };
            return (
              <section key={pageIndex} className="flex flex-col items-center">
                <DocumentPreview
                  embedded
                  backgroundUrl={bgUrl}
                  elements={page.elements ?? []}
                  margins={margins}
                  blockAreasVisible
                  lockBlockElements
                  showElementOptionsPopover={false}
                  signerRoles={doc.signer_roles}
                  selectedElementIds={[]}
                  zoom={1}
                />
              </section>
            );
          })}
        </div>
      )}
    </AppFormModal>
  );
}
