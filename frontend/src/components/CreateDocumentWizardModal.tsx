import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Briefcase, FileText, Share2, UserRound } from 'lucide-react';
import { api } from '@/lib/api';
import { BackgroundPagePicker } from '@/components/BackgroundPagePicker';
import {
  DocumentTypePicker,
  type BackgroundTemplate,
  type DocumentTypePreset,
} from '@/components/DocumentTypePicker';
import type { DocumentCreationSelection } from '@/components/ChooseDocumentTypeModal';
import type { DocumentCreateScope, DocumentCreateScopeKind } from '@/lib/documentCreateScope';
import { projectDocumentsChooseTypeQuickInfo } from '@/lib/formModalQuickInfo';
import {
  AppButton,
  AppFormModal,
  AppProjectSelect,
  AppUserSelect,
  uiCx,
  uiLayout,
} from '@/components/ui';

export type CreateDocumentWizardResult = {
  scope: DocumentCreateScope;
  selection: DocumentCreationSelection;
};

type CreateDocumentWizardModalProps = {
  open: boolean;
  onClose: () => void;
  onComplete: (result: CreateDocumentWizardResult) => void;
  creating?: boolean;
};

function TemplateIcon({ className }: { className?: string }) {
  return (
    <svg className={className ?? 'w-5 h-5'} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z"
      />
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

type ScopeCardDef =
  | {
      kind: DocumentCreateScopeKind;
      title: string;
      description: string;
      icon: typeof Briefcase;
      comingSoon?: false;
    }
  | {
      kind: 'shared';
      title: string;
      description: string;
      icon: typeof Briefcase;
      comingSoon: true;
    };

const SCOPE_CARDS: ScopeCardDef[] = [
  {
    kind: 'project',
    title: 'Project',
    description: 'Link this document to a project or opportunity',
    icon: Briefcase,
  },
  {
    kind: 'user',
    title: 'User',
    description: 'Link this document to an employee',
    icon: UserRound,
  },
  {
    kind: 'standalone',
    title: 'Standalone',
    description: 'Keep it only in Document Builder',
    icon: FileText,
  },
  {
    kind: 'shared',
    title: 'Shared',
    description: 'Share documents with others',
    icon: Share2,
    comingSoon: true,
  },
];

export function CreateDocumentWizardModal({
  open,
  onClose,
  onComplete,
  creating = false,
}: CreateDocumentWizardModalProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [scopeKind, setScopeKind] = useState<DocumentCreateScopeKind | null>(null);
  const [projectId, setProjectId] = useState('');
  const [userId, setUserId] = useState('');
  const [pickerTab, setPickerTab] = useState<'template' | 'background'>('template');

  useEffect(() => {
    if (!open) return;
    setStep(1);
    setScopeKind(null);
    setProjectId('');
    setUserId('');
    setPickerTab('template');
  }, [open]);

  const { data: documentTypes = [], isLoading: typesLoading } = useQuery({
    queryKey: ['document-creator-document-types'],
    queryFn: () => api<DocumentTypePreset[]>('GET', '/document-creator/document-types'),
    enabled: open && step === 2,
  });

  const { data: templates = [] } = useQuery({
    queryKey: ['document-creator-templates'],
    queryFn: () => api<BackgroundTemplate[]>('GET', '/document-creator/templates'),
    enabled: open && step === 2,
  });

  const scopeReady =
    scopeKind === 'standalone' ||
    (scopeKind === 'project' && !!projectId) ||
    (scopeKind === 'user' && !!userId);

  const resolveScope = (): DocumentCreateScope | null => {
    if (scopeKind === 'standalone') return { kind: 'standalone' };
    if (scopeKind === 'project' && projectId) return { kind: 'project', projectId };
    if (scopeKind === 'user' && userId) return { kind: 'user', userId };
    return null;
  };

  const emitSelection = (selection: DocumentCreationSelection) => {
    const scope = resolveScope();
    if (!scope) return;
    onComplete({ scope, selection });
  };

  if (!open) return null;

  const step1 = (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">Choose where this document belongs.</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
        {SCOPE_CARDS.map((card) => {
          const Icon = card.icon;
          if (card.comingSoon) {
            return (
              <div
                key={card.kind}
                aria-disabled
                className="relative p-5 border-2 border-dashed border-gray-200 rounded-lg text-left bg-gray-50/80 cursor-not-allowed select-none"
              >
                <span className="absolute top-3 right-3 text-[10px] font-semibold uppercase tracking-wide text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                  Coming soon
                </span>
                <Icon className="h-5 w-5 mb-2 text-gray-400" />
                <div className="font-semibold text-gray-500 mb-1">{card.title}</div>
                <div className="text-sm text-gray-400">{card.description}</div>
              </div>
            );
          }
          const selected = scopeKind === card.kind;
          return (
            <button
              key={card.kind}
              type="button"
              disabled={creating}
              onClick={() => {
                setScopeKind(card.kind);
                if (card.kind !== 'project') setProjectId('');
                if (card.kind !== 'user') setUserId('');
              }}
              className={uiCx(
                'p-5 border-2 rounded-lg text-left transition-all',
                selected
                  ? 'border-brand-red bg-red-50'
                  : 'border-gray-200 hover:border-brand-red hover:bg-red-50/60',
              )}
            >
              <Icon className={uiCx('h-5 w-5 mb-2', selected ? 'text-brand-red' : 'text-gray-500')} />
              <div className="font-semibold text-gray-900 mb-1">{card.title}</div>
              <div className="text-sm text-gray-600">{card.description}</div>
            </button>
          );
        })}
      </div>

      {scopeKind === 'project' ? (
        <div className="pt-1">
          <AppProjectSelect
            label="Project or opportunity"
            value={projectId}
            onChange={setProjectId}
            includeBidding
            placeholder="Search by name, code, or address…"
            disabled={creating}
          />
        </div>
      ) : null}

      {scopeKind === 'user' ? (
        <div className="pt-1">
          <AppUserSelect
            label="Employee"
            value={userId}
            onChange={setUserId}
            placeholder="Search employees…"
            disabled={creating}
          />
        </div>
      ) : null}
    </div>
  );

  const step2 = (
    <>
      <div className="flex border-b border-gray-200 -mt-1 mb-4">
        <button
          type="button"
          disabled={creating}
          onClick={() => setPickerTab('template')}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
            pickerTab === 'template'
              ? 'border-brand-red text-brand-red'
              : 'border-transparent text-gray-600 hover:text-gray-900'
          }`}
        >
          <TemplateIcon className="w-4 h-4" />
          From template
        </button>
        <button
          type="button"
          disabled={creating}
          onClick={() => setPickerTab('background')}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
            pickerTab === 'background'
              ? 'border-brand-red text-brand-red'
              : 'border-transparent text-gray-600 hover:text-gray-900'
          }`}
        >
          <ImageIcon className="w-4 h-4" />
          From background
        </button>
      </div>
      {pickerTab === 'template' ? (
        documentTypes.length === 0 && !typesLoading ? (
          <p className="text-sm text-gray-500 py-8 text-center">
            No document templates yet. Use &quot;From background&quot; to start with a single page, or create templates
            in Document templates.
          </p>
        ) : (
          <DocumentTypePicker
            documentTypes={documentTypes}
            backgroundTemplates={templates}
            isLoading={typesLoading || creating}
            onSelect={(documentTypeId) =>
              emitSelection(documentTypeId ? { kind: 'preset', documentTypeId } : { kind: 'blank' })
            }
            designSystem
          />
        )
      ) : (
        <BackgroundPagePicker
          templates={templates.map((t) => ({
            id: t.id,
            name: t.name || 'Untitled',
            description: undefined,
            background_file_id: t.background_file_id,
          }))}
          onSelect={(templateId) =>
            emitSelection(templateId ? { kind: 'background', templateId } : { kind: 'blank' })
          }
          designSystem
        />
      )}
    </>
  );

  return (
    <AppFormModal
      open
      onClose={creating ? () => undefined : onClose}
      title={step === 1 ? 'Create document' : 'Choose layout'}
      description={
        step === 1
          ? 'Choose whether this document belongs to a project, an employee, or stands alone.'
          : 'Choose a document template, background, or start blank.'
      }
      quickInfo={step === 2 ? projectDocumentsChooseTypeQuickInfo : undefined}
      formWidth="wide"
      scrollBody={step === 2 ? false : true}
      footer={
        <div className={uiCx(uiLayout.actionsRow, 'w-full justify-between')}>
          <div>
            {step === 2 ? (
              <AppButton
                variant="secondary"
                size="sm"
                type="button"
                disabled={creating}
                onClick={() => setStep(1)}
              >
                Back
              </AppButton>
            ) : null}
          </div>
          <div className={uiCx(uiLayout.actionsRow)}>
            <AppButton variant="secondary" size="sm" type="button" disabled={creating} onClick={onClose}>
              Cancel
            </AppButton>
            {step === 1 ? (
              <AppButton
                size="sm"
                type="button"
                disabled={!scopeReady || creating}
                onClick={() => setStep(2)}
              >
                Next
              </AppButton>
            ) : null}
          </div>
        </div>
      }
    >
      {step === 1 ? step1 : step2}
    </AppFormModal>
  );
}
