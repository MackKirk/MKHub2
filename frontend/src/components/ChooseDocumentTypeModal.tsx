import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { api } from '@/lib/api';
import {
  filterDocumentTypes,
  getDocumentTypeCategories,
  groupDocumentTypesByCategory,
  UNCATEGORIZED_CATEGORY_KEY,
} from '@/lib/documentTypeGrouping';
import OverlayPortal from '@/components/OverlayPortal';
import { DocumentPagePreviewThumbnails } from '@/components/DocumentPagePreviewThumbnails';
import { projectDocumentsChooseTypeQuickInfo } from '@/lib/formModalQuickInfo';
import type { DocElement, DocumentPage, PageMargins } from '@/types/documentCreator';
import {
  AppButton,
  AppFormModal,
  AppInput,
  AppQuickFilterRow,
  uiBorders,
  uiCx,
  uiLayout,
  uiRadius,
  uiSpacing,
  uiTypography,
} from '@/components/ui';

export type DocumentTypePreset = {
  id: string;
  name: string;
  description?: string | null;
  category?: string | null;
  page_templates: {
    template_id: string;
    label?: string;
    margins?: PageMargins | null;
    elements?: DocElement[];
  }[];
  created_at?: string | null;
};

type BackgroundTemplate = {
  id: string;
  name?: string;
  background_file_id?: string;
  default_elements?: DocElement[];
  margins?: PageMargins | null;
};

function previewPagesFromDocumentType(
  documentType: DocumentTypePreset,
  templates: BackgroundTemplate[],
): DocumentPage[] {
  return (documentType.page_templates || []).map((entry) => {
    const template = templates.find((t) => t.id === entry.template_id);
    const elements =
      Array.isArray(entry.elements) && entry.elements.length > 0
        ? entry.elements
        : template?.default_elements ?? [];
    return {
      template_id: entry.template_id ?? null,
      margins: entry.margins ?? template?.margins ?? null,
      elements,
    };
  });
}

type ChooseDocumentTypeModalProps = {
  open: boolean;
  onClose: () => void;
  /** Called with null for "Blank", or document type id when user picks a preset */
  onSelect: (documentTypeId: string | null) => void;
  designSystem?: boolean;
};

function CategorySectionHeader({
  title,
  designSystem,
}: {
  title: string;
  designSystem?: boolean;
}) {
  return (
    <h3
      className={
        designSystem
          ? uiCx(uiTypography.overline, 'mb-2')
          : 'text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2'
      }
    >
      {title}
    </h3>
  );
}

function DocumentTypeOptionButton({
  dt,
  templates,
  optionClass,
  designSystem,
  onSelect,
  onClose,
}: {
  dt: DocumentTypePreset;
  templates: BackgroundTemplate[];
  optionClass: string;
  designSystem?: boolean;
  onSelect: (documentTypeId: string | null) => void;
  onClose: () => void;
}) {
  return (
    <button
      type="button"
      onClick={() => {
        onSelect(dt.id);
        onClose();
      }}
      className={optionClass}
    >
      <DocumentPagePreviewThumbnails
        pages={previewPagesFromDocumentType(dt, templates)}
        templates={templates}
        maxPages={4}
      />
      <div className="min-w-0 flex-1">
        <span className={designSystem ? uiTypography.sectionTitle : 'font-medium text-gray-900'}>{dt.name}</span>
        <span
          className={
            designSystem ? uiCx(uiTypography.helper, 'mt-0.5 block') : 'text-xs text-gray-500 block mt-0.5'
          }
        >
          {dt.description || `${(dt.page_templates || []).length} page(s)`}
        </span>
      </div>
    </button>
  );
}

function DocumentTypeOptions({
  documentTypes,
  templates,
  isLoading,
  onSelect,
  onClose,
  designSystem,
}: {
  documentTypes: DocumentTypePreset[];
  templates: BackgroundTemplate[];
  isLoading: boolean;
  onSelect: (documentTypeId: string | null) => void;
  onClose: () => void;
  designSystem?: boolean;
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<'all' | string>('all');

  const optionClass = designSystem
    ? uiCx(
        'flex w-full items-center gap-3 text-left transition-colors',
        uiRadius.control,
        uiBorders.subtle,
        uiSpacing.cardPadding,
        'hover:border-brand-red/50 hover:bg-gray-50',
      )
    : 'flex w-full items-center gap-3 text-left p-3 rounded-lg border border-gray-200 hover:border-brand-red/50 hover:bg-gray-50 transition-colors';

  const categories = useMemo(() => getDocumentTypeCategories(documentTypes), [documentTypes]);
  const hasUncategorized = useMemo(
    () => documentTypes.some((dt) => !(dt.category || '').trim()),
    [documentTypes],
  );

  const filteredTypes = useMemo(
    () => filterDocumentTypes(documentTypes, { query: searchQuery, category: activeCategory }),
    [documentTypes, searchQuery, activeCategory],
  );

  const { categories: groupedCategories, uncategorized } = useMemo(
    () => groupDocumentTypesByCategory(filteredTypes),
    [filteredTypes],
  );

  const showQuickFilters = categories.length > 0 || hasUncategorized;

  const quickFilterSegments = useMemo(() => {
    const segments = [
      {
        key: 'all',
        label: 'All',
        active: activeCategory === 'all',
        count: documentTypes.length,
        onClick: () => setActiveCategory('all'),
      },
      ...categories.map((cat) => ({
        key: cat,
        label: cat,
        active: activeCategory === cat,
        count: documentTypes.filter((dt) => (dt.category || '').trim() === cat).length,
        onClick: () => setActiveCategory(cat),
      })),
    ];
    if (hasUncategorized) {
      segments.push({
        key: UNCATEGORIZED_CATEGORY_KEY,
        label: 'Other',
        active: activeCategory === UNCATEGORIZED_CATEGORY_KEY,
        count: documentTypes.filter((dt) => !(dt.category || '').trim()).length,
        onClick: () => setActiveCategory(UNCATEGORIZED_CATEGORY_KEY),
      });
    }
    return segments;
  }, [activeCategory, categories, documentTypes, hasUncategorized]);

  if (isLoading) {
    return designSystem ? (
      <p className={uiCx(uiTypography.helper, 'py-6 text-center')}>Loading...</p>
    ) : (
      <div className="text-sm text-gray-500 py-6 text-center">Loading...</div>
    );
  }

  return (
    <div className={designSystem ? uiSpacing.sectionStack : 'space-y-4'}>
      <div className={designSystem ? undefined : 'space-y-3'}>
        <AppInput
          placeholder="Search templates..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          leftIcon={<Search className="h-4 w-4" />}
          aria-label="Search templates"
        />
        {showQuickFilters && <AppQuickFilterRow segments={quickFilterSegments} className="!mt-0 !border-t-0 !pt-0" />}
      </div>

      <button
        type="button"
        onClick={() => {
          onSelect(null);
          onClose();
        }}
        className={optionClass}
      >
        <DocumentPagePreviewThumbnails pages={[]} templates={templates} maxPages={1} />
        <div className="min-w-0 flex-1">
          <span className={designSystem ? uiTypography.sectionTitle : 'font-medium text-gray-900'}>
            Blank (single page)
          </span>
          <span
            className={
              designSystem ? uiCx(uiTypography.helper, 'mt-0.5 block') : 'text-xs text-gray-500 block mt-0.5'
            }
          >
            No background, one empty page
          </span>
        </div>
      </button>

      {filteredTypes.length === 0 ? (
        <p
          className={
            designSystem
              ? uiCx(uiTypography.helper, 'py-4 text-center')
              : 'text-sm text-gray-500 py-4 text-center'
          }
        >
          No templates match your search.
        </p>
      ) : (
        <div className={designSystem ? uiSpacing.sectionStack : 'space-y-6'}>
          {groupedCategories.map(([categoryName, list]) => (
            <div key={categoryName}>
              <CategorySectionHeader title={categoryName} designSystem={designSystem} />
              <div className={designSystem ? uiSpacing.sectionStack : 'space-y-2'}>
                {list.map((dt) => (
                  <DocumentTypeOptionButton
                    key={dt.id}
                    dt={dt}
                    templates={templates}
                    optionClass={optionClass}
                    designSystem={designSystem}
                    onSelect={onSelect}
                    onClose={onClose}
                  />
                ))}
              </div>
            </div>
          ))}
          {uncategorized.length > 0 && (
            <div>
              <CategorySectionHeader title="Other" designSystem={designSystem} />
              <div className={designSystem ? uiSpacing.sectionStack : 'space-y-2'}>
                {uncategorized.map((dt) => (
                  <DocumentTypeOptionButton
                    key={dt.id}
                    dt={dt}
                    templates={templates}
                    optionClass={optionClass}
                    designSystem={designSystem}
                    onSelect={onSelect}
                    onClose={onClose}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function ChooseDocumentTypeModal({
  open,
  onClose,
  onSelect,
  designSystem = false,
}: ChooseDocumentTypeModalProps) {
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

  if (!open) return null;

  if (designSystem) {
    return (
      <AppFormModal
        open
        onClose={onClose}
        title="Create document"
        description="Choose a document template or start blank."
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
        <DocumentTypeOptions
          documentTypes={documentTypes}
          templates={templates}
          isLoading={isLoading}
          onSelect={onSelect}
          onClose={onClose}
          designSystem
        />
      </AppFormModal>
    );
  }

  return (
    <OverlayPortal>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
        <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[85vh] flex flex-col">
          <div className="p-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Create document</h2>
            <p className="text-sm text-gray-500 mt-0.5">Choose a document template or start blank.</p>
          </div>
          <div className="p-4 overflow-y-auto flex-1">
            <DocumentTypeOptions
              documentTypes={documentTypes}
              templates={templates}
              isLoading={isLoading}
              onSelect={onSelect}
              onClose={onClose}
            />
          </div>
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
