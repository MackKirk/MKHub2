import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { BackgroundPagePicker } from '@/components/BackgroundPagePicker';
import OverlayPortal from '@/components/OverlayPortal';
import {
  DocumentTypePicker,
  type BackgroundTemplate,
  type DocumentTypePreset,
} from '@/components/DocumentTypePicker';
import { projectDocumentsChooseTypeQuickInfo } from '@/lib/formModalQuickInfo';
import { AppButton, AppFormModal, uiCx, uiLayout } from '@/components/ui';

export type { DocumentTypePreset };

export type DocumentCreationSelection =
  | { kind: 'blank' }
  | { kind: 'preset'; documentTypeId: string }
  | { kind: 'background'; templateId: string };

type ChooseDocumentTypeModalProps = {
  open: boolean;
  onClose: () => void;
  onSelect: (selection: DocumentCreationSelection) => void;
  designSystem?: boolean;
};

function TemplateIcon({ className }: { className?: string }) {
  return (
    <svg className={className ?? 'w-5 h-5'} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
    </svg>
  );
}

function ImageIcon({ className }: { className?: string }) {
  return (
    <svg className={className ?? 'w-5 h-5'} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 15l-5-5L5 21" />
    </svg>
  );
}

function DocumentCreationPickerTabs({
  tab,
  onTabChange,
}: {
  tab: 'template' | 'background';
  onTabChange: (tab: 'template' | 'background') => void;
}) {
  return (
    <div className="flex border-b border-gray-200 -mt-1 mb-4">
      <button
        type="button"
        onClick={() => onTabChange('template')}
        className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
          tab === 'template'
            ? 'border-brand-red text-brand-red'
            : 'border-transparent text-gray-600 hover:text-gray-900'
        }`}
      >
        <TemplateIcon className="w-4 h-4" />
        From template
      </button>
      <button
        type="button"
        onClick={() => onTabChange('background')}
        className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
          tab === 'background'
            ? 'border-brand-red text-brand-red'
            : 'border-transparent text-gray-600 hover:text-gray-900'
        }`}
      >
        <ImageIcon className="w-4 h-4" />
        From background
      </button>
    </div>
  );
}

function DocumentCreationPickerBody({
  tab,
  documentTypes,
  backgroundTemplates,
  isLoading,
  onSelectPreset,
  onSelectBackground,
  designSystem,
}: {
  tab: 'template' | 'background';
  documentTypes: DocumentTypePreset[];
  backgroundTemplates: BackgroundTemplate[];
  isLoading: boolean;
  onSelectPreset: (documentTypeId: string | null) => void;
  onSelectBackground: (templateId: string | null) => void;
  designSystem?: boolean;
}) {
  if (tab === 'template') {
    if (documentTypes.length === 0 && !isLoading) {
      return (
        <p className="text-sm text-gray-500 py-8 text-center">
          No document templates yet. Use &quot;From background&quot; to start with a single page, or create templates in
          Document templates.
        </p>
      );
    }
    return (
      <DocumentTypePicker
        documentTypes={documentTypes}
        backgroundTemplates={backgroundTemplates}
        isLoading={isLoading}
        onSelect={onSelectPreset}
        designSystem={designSystem}
      />
    );
  }

  return (
    <BackgroundPagePicker
      templates={backgroundTemplates.map((t) => ({
        id: t.id,
        name: t.name || 'Untitled',
        description: undefined,
        background_file_id: t.background_file_id,
      }))}
      onSelect={onSelectBackground}
      designSystem={designSystem}
    />
  );
}

export function ChooseDocumentTypeModal({
  open,
  onClose,
  onSelect,
  designSystem = false,
}: ChooseDocumentTypeModalProps) {
  const [tab, setTab] = useState<'template' | 'background'>('template');

  const { data: documentTypes = [], isLoading } = useQuery({
    queryKey: ['document-creator-document-types'],
    queryFn: () => api<DocumentTypePreset[]>('GET', '/document-creator/document-types'),
    enabled: open,
  });

  const { data: templates = [] } = useQuery({
    queryKey: ['document-creator-templates'],
    queryFn: () => api<BackgroundTemplate[]>('GET', '/document-creator/templates'),
    enabled: open,
  });

  const handleSelectPreset = (documentTypeId: string | null) => {
    onSelect(documentTypeId ? { kind: 'preset', documentTypeId } : { kind: 'blank' });
    onClose();
  };

  const handleSelectBackground = (templateId: string | null) => {
    onSelect(templateId ? { kind: 'background', templateId } : { kind: 'blank' });
    onClose();
  };

  if (!open) return null;

  const pickerBody = (
    <>
      <DocumentCreationPickerTabs tab={tab} onTabChange={setTab} />
      <DocumentCreationPickerBody
        tab={tab}
        documentTypes={documentTypes}
        backgroundTemplates={templates}
        isLoading={isLoading}
        onSelectPreset={handleSelectPreset}
        onSelectBackground={handleSelectBackground}
        designSystem={designSystem}
      />
    </>
  );

  if (designSystem) {
    return (
      <AppFormModal
        open
        onClose={onClose}
        title="Create document"
        description="Choose a document template, background, or start blank."
        quickInfo={projectDocumentsChooseTypeQuickInfo}
        formWidth="wide"
        footer={
          <div className={uiCx(uiLayout.actionsRow, 'w-full justify-end')}>
            <AppButton variant="secondary" size="sm" type="button" onClick={onClose}>
              Cancel
            </AppButton>
          </div>
        }
      >
        {pickerBody}
      </AppFormModal>
    );
  }

  return (
    <OverlayPortal>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
        <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[85vh] flex flex-col">
          <div className="p-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Create document</h2>
            <p className="text-sm text-gray-500 mt-0.5">Choose a document template, background, or start blank.</p>
          </div>
          <div className="p-4 overflow-y-auto flex-1">{pickerBody}</div>
          <div className="p-4 border-t border-gray-200 flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </OverlayPortal>
  );
}
