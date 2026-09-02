import { useCallback, useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import {
  DocumentTemplateSelectionPanel,
  type DocumentTemplateSelectionFooter,
  type DocumentTemplateSelectionPhase,
  type DocumentTemplateSelectionPhaseContext,
} from '@/components/DocumentTemplateSelectionPanel';
import type { DocumentCreationSelection } from '@/components/ChooseDocumentTypeModal';
import { fetchExpandedPages, getTemplateSelectionModalCopy } from '@/lib/documentTemplateUtils';
import type { DocumentPage } from '@/types/documentCreator';
import { AppButton, AppFormModal, uiCx, uiLayout } from '@/components/ui';

type BackgroundTemplateProp = {
  id: string;
  name: string;
  description?: string;
  background_file_id?: string;
};

type AddPageModalProps = {
  open: boolean;
  templates: BackgroundTemplateProp[];
  onClose: () => void;
  onAddPage: (templateId: string | null) => void;
  onAddPages: (pages: DocumentPage[]) => void;
  projectId?: string | null;
  subjectUserId?: string | null;
};

export function AddPageModal({
  open,
  templates,
  onClose,
  onAddPage,
  onAddPages,
  projectId,
  subjectUserId,
}: AddPageModalProps) {
  const [footer, setFooter] = useState<DocumentTemplateSelectionFooter>({ right: null });
  const [phase, setPhase] = useState<DocumentTemplateSelectionPhase>('grid');
  const [phaseCtx, setPhaseCtx] = useState<DocumentTemplateSelectionPhaseContext>();

  useEffect(() => {
    if (!open) return;
    setPhase('grid');
    setPhaseCtx(undefined);
    setFooter({ right: null });
  }, [open]);

  const handlePhaseChange = useCallback(
    (next: DocumentTemplateSelectionPhase, ctx?: DocumentTemplateSelectionPhaseContext) => {
      setPhase(next);
      setPhaseCtx(ctx);
    },
    [],
  );

  const { data: documentTypes = [], isLoading: loadingTypes } = useQuery({
    queryKey: ['document-creator-document-types'],
    queryFn: () => api<import('@/components/DocumentTypePicker').DocumentTypePreset[]>('GET', '/document-creator/document-types?for_picker=1'),
    enabled: open,
  });

  const { data: backgroundTemplates = [] } = useQuery({
    queryKey: ['document-creator-templates'],
    queryFn: () => api<import('@/components/DocumentTypePicker').BackgroundTemplate[]>('GET', '/document-creator/templates'),
    enabled: open,
  });

  const handleConfirm = useCallback(
    async (selection: DocumentCreationSelection) => {
      if (selection.kind === 'blank') {
        onAddPage(null);
        onClose();
        return;
      }
      if (selection.kind === 'background') {
        onAddPage(selection.templateId);
        onClose();
        return;
      }
      if (selection.kind === 'preset') {
        if (selection.pages?.length) {
          onAddPages(selection.pages);
          onClose();
          return;
        }
        const pages = await fetchExpandedPages(selection.documentTypeId, {
          projectId,
          subjectUserId,
        });
        if (pages.length > 0) {
          onAddPages(pages);
        } else {
          onAddPage(null);
        }
        onClose();
      }
    },
    [onAddPage, onAddPages, onClose, projectId, subjectUserId],
  );

  if (!open) return null;

  const cancelButton = (
    <AppButton variant="secondary" size="sm" type="button" onClick={onClose}>
      Cancel
    </AppButton>
  );

  const modalCopy = getTemplateSelectionModalCopy(phase, 'add', phaseCtx);

  return (
    <AppFormModal
      open
      onClose={onClose}
      title={modalCopy.title}
      description={modalCopy.description}
      formWidth={phase === 'options' ? 'default' : 'wide'}
      scrollBody={false}
      footer={
        <div className={uiCx(uiLayout.actionsRow, 'w-full justify-between')}>
          <div>{footer.left}</div>
          <div className={uiCx(uiLayout.actionsRow)}>
            {footer.right ?? cancelButton}
            {footer.right ? cancelButton : null}
          </div>
        </div>
      }
    >
      <DocumentTemplateSelectionPanel
        documentTypes={documentTypes}
        backgroundTemplates={backgroundTemplates.length ? backgroundTemplates : templates.map((t) => ({
          id: t.id,
          name: t.name,
          background_file_id: t.background_file_id,
        }))}
        isLoading={loadingTypes}
        mode="add"
        projectId={projectId}
        subjectUserId={subjectUserId}
        onConfirm={handleConfirm}
        onFooterChange={setFooter}
        onPhaseChange={handlePhaseChange}
      />
    </AppFormModal>
  );
}
