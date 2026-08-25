import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { BackgroundPagePicker } from '@/components/BackgroundPagePicker';
import {
  DocumentTypePicker,
  type BackgroundTemplate,
  type DocumentTypePreset,
} from '@/components/DocumentTypePicker';
import type { DocumentPage } from '@/types/documentCreator';
import { AppButton, AppFormModal, uiCx, uiLayout } from '@/components/ui';

export type { DocumentTypePreset };

type BackgroundTemplateProp = {
  id: string;
  name: string;
  description?: string;
  background_file_id?: string;
};

type AddPageModalProps = {
  open: boolean;
  /** Backgrounds (DocumentTemplate) for "From background" tab */
  templates: BackgroundTemplateProp[];
  onClose: () => void;
  /** Add a single page with this background template id (or null for blank) */
  onAddPage: (templateId: string | null) => void;
  /** Add multiple pages (e.g. from a document type) */
  onAddPages: (pages: DocumentPage[]) => void;
  /** When set, placeholder tokens in template elements are replaced with this project's data */
  projectId?: string | null;
  /** When set, employee tokens are filled from this user's profile */
  subjectUserId?: string | null;
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

export function AddPageModal({
  open,
  templates,
  onClose,
  onAddPage,
  onAddPages,
  projectId,
  subjectUserId,
}: AddPageModalProps) {
  const [tab, setTab] = useState<'template' | 'background'>('template');

  const { data: documentTypes = [], isLoading: loadingTypes } = useQuery({
    queryKey: ['document-creator-document-types'],
    queryFn: () => api<DocumentTypePreset[]>('GET', '/document-creator/document-types'),
    enabled: open,
  });

  const { data: backgroundTemplates = [] } = useQuery({
    queryKey: ['document-creator-templates'],
    queryFn: () => api<BackgroundTemplate[]>('GET', '/document-creator/templates'),
    enabled: open && tab === 'template',
  });

  const handleSelectDocumentType = async (docTypeId: string | null) => {
    if (docTypeId === null) {
      onAddPage(null);
      onClose();
      return;
    }
    try {
      const params = new URLSearchParams();
      if (projectId) params.set('project_id', projectId);
      if (subjectUserId) params.set('subject_user_id', subjectUserId);
      const qs = params.toString() ? `?${params.toString()}` : '';
      const pages = await api<DocumentPage[]>(
        'GET',
        `/document-creator/document-types/${docTypeId}/expand-pages${qs}`,
      );
      if (pages && pages.length > 0) {
        onAddPages(pages);
        onClose();
      } else {
        onAddPage(null);
        onClose();
      }
    } catch {
      onAddPage(null);
      onClose();
    }
  };

  const handleSelectBackground = (templateId: string | null) => {
    onAddPage(templateId);
    onClose();
  };

  if (!open) return null;

  return (
    <AppFormModal
      open
      onClose={onClose}
      title="Add page(s)"
      description="Add pages from a document template or a single background."
      formWidth="wide"
      scrollBody={false}
      footer={
        <div className={uiCx(uiLayout.actionsRow, 'w-full justify-end')}>
          <AppButton variant="secondary" size="sm" type="button" onClick={onClose}>
            Cancel
          </AppButton>
        </div>
      }
    >
      <div className="flex border-b border-gray-200 -mt-1 mb-4">
        <button
          type="button"
          onClick={() => setTab('template')}
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
          onClick={() => setTab('background')}
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

      {tab === 'template' ? (
        documentTypes.length === 0 && !loadingTypes ? (
          <p className="text-sm text-gray-500 py-8 text-center">
            No document templates yet. Use &quot;From background&quot; to add a single page, or create templates in
            Document templates.
          </p>
        ) : (
          <DocumentTypePicker
            documentTypes={documentTypes}
            backgroundTemplates={backgroundTemplates}
            isLoading={loadingTypes}
            onSelect={handleSelectDocumentType}
          />
        )
      ) : (
        <BackgroundPagePicker templates={templates} onSelect={handleSelectBackground} />
      )}
    </AppFormModal>
  );
}
