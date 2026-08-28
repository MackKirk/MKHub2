import { useCallback, useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import {
  DocumentTemplateSelectionPanel,
  type DocumentTemplateSelectionFooter,
  type DocumentTemplateSelectionPhase,
  type DocumentTemplateSelectionPhaseContext,
} from '@/components/DocumentTemplateSelectionPanel';
import type { DocumentPage } from '@/types/documentCreator';
import { getTemplateSelectionModalCopy } from '@/lib/documentTemplateUtils';
import { projectDocumentsChooseTypeQuickInfo } from '@/lib/formModalQuickInfo';
import { AppButton, AppFormModal, uiCx, uiLayout } from '@/components/ui';

export type DocumentCreationSelection =
  | { kind: 'blank' }
  | { kind: 'background'; templateId: string }
  | { kind: 'preset'; documentTypeId: string; pages?: DocumentPage[] };

export type { DocumentTypePreset } from '@/components/DocumentTypePicker';

type ChooseDocumentTypeModalProps = {
  open: boolean;
  onClose: () => void;
  onSelect: (selection: DocumentCreationSelection) => void;
  designSystem?: boolean;
  projectId?: string;
  subjectUserId?: string;
};

export function ChooseDocumentTypeModal({
  open,
  onClose,
  onSelect,
  designSystem = false,
  projectId,
  subjectUserId,
}: ChooseDocumentTypeModalProps) {
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

  const { data: documentTypes = [], isLoading } = useQuery({
    queryKey: ['document-creator-document-types'],
    queryFn: () => api<import('@/components/DocumentTypePicker').DocumentTypePreset[]>('GET', '/document-creator/document-types'),
    enabled: open,
  });

  const { data: templates = [] } = useQuery({
    queryKey: ['document-creator-templates'],
    queryFn: () => api<import('@/components/DocumentTypePicker').BackgroundTemplate[]>('GET', '/document-creator/templates'),
    enabled: open,
  });

  const handleConfirm = useCallback(
    async (selection: DocumentCreationSelection) => {
      onSelect(selection);
      onClose();
    },
    [onClose, onSelect],
  );

  if (!open) return null;

  const cancelButton = (
    <AppButton variant="secondary" size="sm" type="button" onClick={onClose}>
      Cancel
    </AppButton>
  );

  const modalCopy = getTemplateSelectionModalCopy(phase, 'create', phaseCtx);

  const pickerBody = (
    <DocumentTemplateSelectionPanel
      documentTypes={documentTypes}
      backgroundTemplates={templates}
      isLoading={isLoading}
      mode="create"
      projectId={projectId}
      subjectUserId={subjectUserId}
      onConfirm={handleConfirm}
      onFooterChange={setFooter}
      onPhaseChange={handlePhaseChange}
      designSystem={designSystem}
    />
  );

  if (designSystem) {
    return (
      <AppFormModal
        open
        onClose={onClose}
        title={phase === 'grid' ? 'Create document' : modalCopy.title}
        description={modalCopy.description}
        quickInfo={phase === 'grid' ? projectDocumentsChooseTypeQuickInfo : undefined}
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
        {pickerBody}
      </AppFormModal>
    );
  }

  return null;
}
