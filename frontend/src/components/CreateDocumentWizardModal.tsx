import { useCallback, useEffect, useMemo, useState } from 'react';

import { useQuery } from '@tanstack/react-query';

import { Briefcase, FileText, Share2, UserRound } from 'lucide-react';

import { api } from '@/lib/api';

import {

  DocumentTemplateSelectionPanel,

  type DocumentTemplateSelectionFooter,

  type DocumentTemplateSelectionPhase,

  type DocumentTemplateSelectionPhaseContext,

} from '@/components/DocumentTemplateSelectionPanel';

import type { BackgroundTemplate, DocumentTypePreset } from '@/components/DocumentTypePicker';

import type { DocumentCreationSelection } from '@/components/ChooseDocumentTypeModal';

import type { DocumentCreateScope, DocumentCreateScopeKind } from '@/lib/documentCreateScope';

import { getTemplateSelectionModalCopy } from '@/lib/documentTemplateUtils';

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

  const [layoutFooter, setLayoutFooter] = useState<DocumentTemplateSelectionFooter>({ right: null });

  const [templatePhase, setTemplatePhase] = useState<DocumentTemplateSelectionPhase>('grid');

  const [templatePhaseCtx, setTemplatePhaseCtx] = useState<DocumentTemplateSelectionPhaseContext>();



  useEffect(() => {

    if (!open) return;

    setStep(1);

    setScopeKind(null);

    setProjectId('');

    setUserId('');

    setLayoutFooter({ right: null });

    setTemplatePhase('grid');

    setTemplatePhaseCtx(undefined);

  }, [open]);



  const handleTemplatePhaseChange = useCallback(

    (phase: DocumentTemplateSelectionPhase, ctx?: DocumentTemplateSelectionPhaseContext) => {

      setTemplatePhase(phase);

      setTemplatePhaseCtx(ctx);

    },

    [],

  );



  const { data: documentTypes = [], isLoading: typesLoading } = useQuery({

    queryKey: ['document-creator-document-types'],

    queryFn: () => api<DocumentTypePreset[]>('GET', '/document-creator/document-types?for_picker=1'),

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



  const resolveScope = useCallback((): DocumentCreateScope | null => {

    if (scopeKind === 'standalone') return { kind: 'standalone' };

    if (scopeKind === 'project' && projectId) return { kind: 'project', projectId };

    if (scopeKind === 'user' && userId) return { kind: 'user', userId };

    return null;

  }, [scopeKind, projectId, userId]);



  const emitSelection = useCallback(

    (selection: DocumentCreationSelection) => {

      const scope = resolveScope();

      if (!scope) return;

      onComplete({ scope, selection });

    },

    [onComplete, resolveScope],

  );



  const layoutScopeProjectId = scopeKind === 'project' ? projectId : undefined;

  const layoutScopeUserId = scopeKind === 'user' ? userId : undefined;

  const step2Back = useMemo(

    () => (

      <AppButton

        variant="secondary"

        size="sm"

        type="button"

        disabled={creating}

        onClick={() => setStep(1)}

      >

        Back

      </AppButton>

    ),

    [creating],

  );



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
                const kind = card.kind;
                if (kind === 'shared') return;
                setScopeKind(kind);

                if (kind !== 'project') setProjectId('');

                if (kind !== 'user') setUserId('');

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

    <DocumentTemplateSelectionPanel

      documentTypes={documentTypes}

      backgroundTemplates={templates}

      isLoading={typesLoading || creating}

      disabled={creating}

      mode="create"

      projectId={layoutScopeProjectId}

      subjectUserId={layoutScopeUserId}

      onConfirm={emitSelection}

      onFooterChange={setLayoutFooter}

      onPhaseChange={handleTemplatePhaseChange}

      footerLeft={step2Back}

      designSystem

    />

  );



  const cancelButton = (

    <AppButton variant="secondary" size="sm" type="button" disabled={creating} onClick={onClose}>

      Cancel

    </AppButton>

  );



  const step2FooterRight = layoutFooter.right ?? cancelButton;

  const step2ModalCopy = getTemplateSelectionModalCopy(templatePhase, 'create', templatePhaseCtx);



  return (

    <AppFormModal

      open

      onClose={creating ? () => undefined : onClose}

      title={

        step === 1

          ? 'Create document'

          : templatePhase === 'grid'

            ? 'Choose layout'

            : step2ModalCopy.title

      }

      description={

        step === 1

          ? 'Choose whether this document belongs to a project, an employee, or stands alone.'

          : step2ModalCopy.description

      }

      quickInfo={step === 2 && templatePhase === 'grid' ? projectDocumentsChooseTypeQuickInfo : undefined}

      formWidth="wide"

      scrollBody={step === 1}

      footer={

        <div className={uiCx(uiLayout.actionsRow, 'w-full justify-between')}>

          <div>{step === 2 ? layoutFooter.left : null}</div>

          <div className={uiCx(uiLayout.actionsRow)}>

            {step === 1 ? (

              <>

                {cancelButton}

                <AppButton

                  size="sm"

                  type="button"

                  disabled={!scopeReady || creating}

                  onClick={() => setStep(2)}

                >

                  Next

                </AppButton>

              </>

            ) : (

              <>

                {step2FooterRight}

                {!layoutFooter.right ? null : cancelButton}

              </>

            )}

          </div>

        </div>

      }

    >

      {step === 1 ? step1 : step2}

    </AppFormModal>

  );

}


