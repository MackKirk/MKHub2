import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, Layers, ListChecks } from 'lucide-react';
import toast from 'react-hot-toast';
import { BackgroundPagePicker } from '@/components/BackgroundPagePicker';
import {
  DocumentTypePicker,
  GRID_CARD_CLASS,
  GRID_CLASS,
  GRID_THUMB_WIDTH_PX,
  previewPagesFromDocumentType,
  type BackgroundTemplate,
  type DocumentTypePreset,
} from '@/components/DocumentTypePicker';
import {
  ScaledPagePreview,
} from '@/components/DocumentPagePreviewThumbnails';
import { withFileAccessToken } from '@/lib/api';
import type { DocumentCreationSelection } from '@/components/ChooseDocumentTypeModal';
import {
  fetchExpandedPages,
  filterPagesByIndices,
  getTemplatePageCount,
  isMultiPageTemplate,
  pageLabel,
} from '@/lib/documentTemplateUtils';
import { filterDocumentTypesForProjectScope } from '@/lib/documentTypeGrouping';
import { AppButton, uiCx, uiLayout, uiTypography } from '@/components/ui';

export type DocumentTemplateSelectionPhase = 'grid' | 'options' | 'pages';

export type DocumentTemplateSelectionPhaseContext = {
  templateName?: string;
  pageCount?: number;
};

export type DocumentTemplateSelectionFooter = {
  left?: React.ReactNode;
  right: React.ReactNode;
};

type DocumentTemplateSelectionPanelProps = {
  documentTypes: DocumentTypePreset[];
  backgroundTemplates: BackgroundTemplate[];
  isLoading?: boolean;
  disabled?: boolean;
  projectId?: string | null;
  subjectUserId?: string | null;
  mode: 'create' | 'add';
  showBlank?: boolean;
  designSystem?: boolean;
  onConfirm: (selection: DocumentCreationSelection) => void | Promise<void>;
  onFooterChange: (footer: DocumentTemplateSelectionFooter) => void;
  onPhaseChange?: (phase: DocumentTemplateSelectionPhase, ctx?: DocumentTemplateSelectionPhaseContext) => void;
  footerLeft?: React.ReactNode;
};

function TemplateTabButtons({
  tab,
  onTabChange,
  disabled,
}: {
  tab: 'template' | 'background';
  onTabChange: (tab: 'template' | 'background') => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex border-b border-gray-200 -mt-1 mb-4">
      <button
        type="button"
        disabled={disabled}
        onClick={() => onTabChange('template')}
        className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
          tab === 'template'
            ? 'border-brand-red text-brand-red'
            : 'border-transparent text-gray-600 hover:text-gray-900'
        }`}
      >
        From template
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onTabChange('background')}
        className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
          tab === 'background'
            ? 'border-brand-red text-brand-red'
            : 'border-transparent text-gray-600 hover:text-gray-900'
        }`}
      >
        From background
      </button>
    </div>
  );
}

export function DocumentTemplateSelectionPanel({
  documentTypes,
  backgroundTemplates,
  isLoading = false,
  disabled = false,
  projectId,
  subjectUserId,
  mode,
  showBlank = true,
  designSystem = true,
  onConfirm,
  onFooterChange,
  onPhaseChange,
  footerLeft,
}: DocumentTemplateSelectionPanelProps) {
  const [tab, setTab] = useState<'template' | 'background'>('template');
  const [view, setView] = useState<DocumentTemplateSelectionPhase>('grid');
  const [selectedTypeId, setSelectedTypeId] = useState<string | null>(null);
  const [selectedPageIndices, setSelectedPageIndices] = useState<Set<number>>(() => new Set());
  const [busy, setBusy] = useState(false);

  const scope = useMemo(
    () => ({ projectId: projectId ?? undefined, subjectUserId: subjectUserId ?? undefined }),
    [projectId, subjectUserId],
  );

  const visibleDocumentTypes = useMemo(
    () => (projectId ? filterDocumentTypesForProjectScope(documentTypes) : documentTypes),
    [documentTypes, projectId],
  );

  const selectedType = useMemo(
    () => visibleDocumentTypes.find((dt) => dt.id === selectedTypeId) ?? null,
    [visibleDocumentTypes, selectedTypeId],
  );

  const resetSelection = useCallback(() => {
    setSelectedTypeId(null);
    setSelectedPageIndices(new Set());
    setView('grid');
  }, []);

  useEffect(() => {
    if (tab === 'background') resetSelection();
  }, [tab, resetSelection]);

  useEffect(() => {
    if (!onPhaseChange) return;
    if (view === 'grid' || !selectedType) {
      onPhaseChange('grid');
      return;
    }
    onPhaseChange(view, {
      templateName: selectedType.name,
      pageCount: getTemplatePageCount(selectedType),
    });
  }, [onPhaseChange, selectedType, view]);

  const confirmPreset = useCallback(
    async (documentTypeId: string, pageIndices?: number[]) => {
      setBusy(true);
      try {
        if (pageIndices && pageIndices.length > 0) {
          const expanded = await fetchExpandedPages(documentTypeId, scope);
          const subset = filterPagesByIndices(expanded, pageIndices);
          if (subset.length === 0) throw new Error('No pages selected');
          await onConfirm({ kind: 'preset', documentTypeId, pages: subset });
        } else {
          await onConfirm({ kind: 'preset', documentTypeId });
        }
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : 'Failed to load template pages');
      } finally {
        setBusy(false);
      }
    },
    [onConfirm, scope],
  );

  const handleTemplateSelect = useCallback(
    async (documentTypeId: string | null) => {
      if (disabled || busy) return;
      if (documentTypeId === null) {
        await onConfirm({ kind: 'blank' });
        return;
      }
      const dt = visibleDocumentTypes.find((d) => d.id === documentTypeId);
      if (!dt) return;
      if (!isMultiPageTemplate(dt)) {
        await onConfirm({ kind: 'preset', documentTypeId });
      }
    },
    [busy, disabled, visibleDocumentTypes, onConfirm],
  );

  const handleTemplatePick = useCallback(
    (documentTypeId: string) => {
      if (disabled || busy) return;
      const dt = visibleDocumentTypes.find((d) => d.id === documentTypeId);
      if (!dt) return;
      if (!isMultiPageTemplate(dt)) return;
      setSelectedTypeId(documentTypeId);
      setSelectedPageIndices(new Set());
      setView('options');
    },
    [busy, disabled, visibleDocumentTypes],
  );

  const handleBackgroundSelect = useCallback(
    async (templateId: string | null) => {
      if (disabled || busy) return;
      if (templateId === null) {
        await onConfirm({ kind: 'blank' });
        return;
      }
      await onConfirm({ kind: 'background', templateId });
    },
    [busy, disabled, onConfirm],
  );

  const handleUseAllPages = useCallback(async () => {
    if (!selectedTypeId) return;
    await confirmPreset(selectedTypeId);
  }, [confirmPreset, selectedTypeId]);

  const handleConfirmPageSubset = useCallback(async () => {
    if (!selectedTypeId || selectedPageIndices.size === 0) return;
    await confirmPreset(selectedTypeId, [...selectedPageIndices].sort((a, b) => a - b));
  }, [confirmPreset, selectedTypeId, selectedPageIndices]);

  const togglePageIndex = (index: number) => {
    setSelectedPageIndices((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const pagePickerPreviewPages = useMemo(() => {
    if (!selectedType) return [];
    return previewPagesFromDocumentType(selectedType, backgroundTemplates);
  }, [selectedType, backgroundTemplates]);

  const openPagePicker = useCallback(() => {
    setSelectedPageIndices(new Set());
    setView('pages');
  }, []);

  const primaryLabel =
    mode === 'add'
      ? selectedPageIndices.size === 1
        ? 'Add 1 page'
        : `Add ${selectedPageIndices.size} pages`
      : 'Create document';

  useEffect(() => {
    if (view !== 'grid') return;
    onFooterChange({ left: footerLeft, right: null });
  }, [footerLeft, onFooterChange, view]);

  useEffect(() => {
    if (view !== 'options' || !selectedType) return;
    onFooterChange({
      left: (
        <AppButton
          variant="secondary"
          size="sm"
          type="button"
          disabled={disabled || busy}
          onClick={resetSelection}
        >
          Back to templates
        </AppButton>
      ),
      right: null,
    });
  }, [busy, disabled, onFooterChange, resetSelection, selectedType, view]);

  useEffect(() => {
    if (view !== 'pages' || !selectedType) return;
    onFooterChange({
      left: (
        <AppButton
          variant="secondary"
          size="sm"
          type="button"
          disabled={disabled || busy}
          onClick={() => setView('options')}
        >
          Back
        </AppButton>
      ),
      right: (
        <AppButton
          size="sm"
          type="button"
          disabled={disabled || busy || selectedPageIndices.size === 0}
          loading={busy}
          onClick={() => void handleConfirmPageSubset()}
        >
          {primaryLabel}
        </AppButton>
      ),
    });
  }, [
    busy,
    disabled,
    handleConfirmPageSubset,
    onFooterChange,
    primaryLabel,
    selectedPageIndices.size,
    selectedType,
    view,
  ]);

  const optionsView = selectedType ? (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <button
          type="button"
          disabled={disabled || busy}
          onClick={() => void handleUseAllPages()}
          className={uiCx(
            'p-4 border-2 rounded-lg text-left transition-all flex flex-col gap-2',
            'border-gray-200 hover:border-brand-red hover:bg-red-50/60',
            (disabled || busy) && 'opacity-60 cursor-not-allowed',
          )}
        >
          <Layers className="h-5 w-5 text-brand-red shrink-0" />
          <div>
            <div className="font-semibold text-gray-900 mb-0.5">
              Use all {getTemplatePageCount(selectedType)} pages
            </div>
            <div className="text-sm text-gray-600">
              Include every page from this template in order.
            </div>
          </div>
        </button>
        <button
          type="button"
          disabled={disabled || busy}
          onClick={openPagePicker}
          className={uiCx(
            'p-4 border-2 rounded-lg text-left transition-all flex flex-col gap-2',
            'border-gray-200 hover:border-brand-red hover:bg-red-50/60',
            (disabled || busy) && 'opacity-60 cursor-not-allowed',
          )}
        >
          <ListChecks className="h-5 w-5 text-brand-red shrink-0" />
          <div>
            <div className="font-semibold text-gray-900 mb-0.5">Choose pages</div>
            <div className="text-sm text-gray-600">Pick which pages to include.</div>
          </div>
        </button>
      </div>
    </div>
  ) : null;

  const pagePickerView = selectedType ? (
    <div className="flex flex-col min-h-0 gap-3 h-[min(64vh,36rem)]">
      <button
        type="button"
        onClick={() => setView('options')}
        className="inline-flex items-center gap-1 text-sm font-medium text-gray-600 hover:text-gray-900 w-fit"
      >
        <ChevronLeft className="h-4 w-4" />
        {selectedType.name}
      </button>
      <div className="flex items-center justify-between gap-2 shrink-0">
        <p className={uiTypography.helper}>Select one or more pages to include.</p>
        <div className="flex gap-2 shrink-0">
          <button
            type="button"
            className="text-xs font-medium text-brand-red hover:underline"
            onClick={() =>
              setSelectedPageIndices(
                new Set(Array.from({ length: pagePickerPreviewPages.length }, (_, i) => i)),
              )
            }
          >
            Select all
          </button>
          <button
            type="button"
            className="text-xs font-medium text-gray-600 hover:underline"
            onClick={() => setSelectedPageIndices(new Set())}
          >
            Clear
          </button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-0.5">
        <div className={GRID_CLASS}>
          {pagePickerPreviewPages.map((page, index) => {
            const checked = selectedPageIndices.has(index);
            const label = pageLabel(selectedType, index);
            const template = backgroundTemplates.find((t) => t.id === (page.template_id ?? ''));
            const backgroundUrl = template?.background_file_id
              ? withFileAccessToken(`/files/${template.background_file_id}/thumbnail?w=512`)
              : null;
            return (
              <button
                key={index}
                type="button"
                disabled={disabled || busy}
                onClick={() => togglePageIndex(index)}
                className={uiCx(
                  GRID_CARD_CLASS,
                  checked && 'border-brand-red bg-red-50 ring-2 ring-inset ring-brand-red/40',
                  (disabled || busy) && 'opacity-60 cursor-not-allowed',
                )}
                aria-pressed={checked}
              >
                <div className="relative w-full bg-gray-50 px-2 py-3 min-h-[200px]">
                  <span
                    className={uiCx(
                      'absolute top-2 right-2 z-10 flex h-5 w-5 items-center justify-center rounded border',
                      checked
                        ? 'border-brand-red bg-brand-red text-white'
                        : 'border-gray-300 bg-white text-transparent',
                    )}
                    aria-hidden
                  >
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </span>
                  <ScaledPagePreview
                    page={page}
                    backgroundUrl={backgroundUrl}
                    thumbWidthPx={GRID_THUMB_WIDTH_PX}
                    fillWidth
                  />
                </div>
                <div className="px-2 pb-2 pt-1 min-w-0">
                  <span className="text-sm font-medium text-gray-900 truncate block leading-tight">{label}</span>
                  <span className="text-[11px] text-gray-500 truncate block leading-tight mt-0.5">
                    Page {index + 1}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  ) : null;

  const templateGrid =
    visibleDocumentTypes.length === 0 && !isLoading ? (
      <p className="text-sm text-gray-500 py-8 text-center">
        No document templates yet. Use &quot;From background&quot; to start with a single page, or create templates
        in Document templates.
      </p>
    ) : (
      <DocumentTypePicker
        documentTypes={visibleDocumentTypes}
        backgroundTemplates={backgroundTemplates}
        isLoading={isLoading || busy}
        onSelect={handleTemplateSelect}
        onPick={handleTemplatePick}
        showBlank={showBlank}
        designSystem={designSystem}
      />
    );

  return (
    <>
      {view === 'grid' ? (
        <>
          <TemplateTabButtons tab={tab} onTabChange={setTab} disabled={disabled || busy} />
          {tab === 'template' ? (
            templateGrid
          ) : (
            <BackgroundPagePicker
              templates={backgroundTemplates.map((t) => ({
                id: t.id,
                name: t.name || 'Untitled',
                description: undefined,
                background_file_id: t.background_file_id,
              }))}
              onSelect={(id) => void handleBackgroundSelect(id)}
              designSystem={designSystem}
            />
          )}
        </>
      ) : view === 'options' ? (
        optionsView
      ) : (
        pagePickerView
      )}
    </>
  );
}
