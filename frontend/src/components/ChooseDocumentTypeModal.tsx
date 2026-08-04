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
  AppSelect,
  uiCx,
  uiLayout,
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

const GRID_THUMB_WIDTH_PX = 72;
const GRID_CARD_CLASS =
  'rounded-lg border border-gray-200 hover:border-brand-red hover:bg-brand-red/5 transition-colors overflow-hidden flex flex-col items-stretch text-left';
const GRID_CLASS = 'grid grid-cols-3 sm:grid-cols-4 gap-2.5';

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

function DocumentTypeGridCard({
  name,
  subtitle,
  pages,
  templates,
  onClick,
}: {
  name: string;
  subtitle: string;
  pages: DocumentPage[];
  templates: BackgroundTemplate[];
  onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} className={GRID_CARD_CLASS} title={name}>
      <div className="w-full bg-gray-50 flex items-center justify-center py-3 px-1.5 min-h-[110px]">
        <DocumentPagePreviewThumbnails
          pages={pages}
          templates={templates}
          maxPages={1}
          thumbWidthPx={GRID_THUMB_WIDTH_PX}
        />
      </div>
      <div className="px-1.5 pb-1.5 pt-0.5 min-w-0">
        <span className="text-xs font-medium text-gray-900 truncate block leading-tight">{name}</span>
        <span className="text-[10px] text-gray-500 truncate block leading-tight mt-0.5">{subtitle}</span>
      </div>
    </button>
  );
}

function BlankGridCard({ onClick }: { onClick: () => void }) {
  return (
    <DocumentTypeGridCard
      name="Blank (single page)"
      subtitle="No background, one empty page"
      pages={[]}
      templates={[]}
      onClick={onClick}
    />
  );
}

function TemplateGrid({
  documentTypes,
  templates,
  onSelect,
  onClose,
  showBlank = false,
}: {
  documentTypes: DocumentTypePreset[];
  templates: BackgroundTemplate[];
  onSelect: (documentTypeId: string | null) => void;
  onClose: () => void;
  showBlank?: boolean;
}) {
  return (
    <div className={GRID_CLASS}>
      {showBlank && (
        <BlankGridCard
          onClick={() => {
            onSelect(null);
            onClose();
          }}
        />
      )}
      {documentTypes.map((dt) => (
        <DocumentTypeGridCard
          key={dt.id}
          name={dt.name}
          subtitle={dt.description || `${(dt.page_templates || []).length} page(s)`}
          pages={previewPagesFromDocumentType(dt, templates)}
          templates={templates}
          onClick={() => {
            onSelect(dt.id);
            onClose();
          }}
        />
      ))}
    </div>
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

  const showCategorySelect = categories.length > 0 || hasUncategorized;

  const categoryOptions = useMemo(() => {
    const options = [
      { value: 'all', label: `All categories (${documentTypes.length})` },
      ...categories.map((cat) => ({
        value: cat,
        label: `${cat} (${documentTypes.filter((dt) => (dt.category || '').trim() === cat).length})`,
      })),
    ];
    if (hasUncategorized) {
      options.push({
        value: UNCATEGORIZED_CATEGORY_KEY,
        label: `Other (${documentTypes.filter((dt) => !(dt.category || '').trim()).length})`,
      });
    }
    return options;
  }, [categories, documentTypes, hasUncategorized]);

  const showSectionHeaders = activeCategory === 'all';

  if (isLoading) {
    return designSystem ? (
      <p className={uiCx(uiTypography.helper, 'py-6 text-center')}>Loading...</p>
    ) : (
      <div className="text-sm text-gray-500 py-6 text-center">Loading...</div>
    );
  }

  return (
    <div className={designSystem ? uiSpacing.sectionStack : 'space-y-4'}>
      <div className={uiCx(uiLayout.actionsRow, 'flex-wrap items-stretch gap-3')}>
        <div className="min-w-0 flex-1">
          <AppInput
            label="Search"
            placeholder="Search templates..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            leftIcon={<Search className="h-4 w-4" />}
            aria-label="Search templates"
          />
        </div>
        {showCategorySelect && (
          <div className="w-full sm:w-[220px] shrink-0">
            <AppSelect
              label="Category"
              value={activeCategory}
              onChange={(e) => setActiveCategory(e.target.value)}
              options={categoryOptions}
              searchable={categoryOptions.length > 6}
            />
          </div>
        )}
      </div>

      {filteredTypes.length === 0 ? (
        <div className={designSystem ? uiSpacing.sectionStack : 'space-y-4'}>
          <TemplateGrid
            documentTypes={[]}
            templates={templates}
            onSelect={onSelect}
            onClose={onClose}
            showBlank
          />
          <p
            className={
              designSystem
                ? uiCx(uiTypography.helper, 'py-2 text-center')
                : 'text-sm text-gray-500 py-2 text-center'
            }
          >
            No templates match your search.
          </p>
        </div>
      ) : showSectionHeaders ? (
        <div className={designSystem ? uiSpacing.sectionStack : 'space-y-6'}>
          <TemplateGrid
            documentTypes={[]}
            templates={templates}
            onSelect={onSelect}
            onClose={onClose}
            showBlank
          />
          {groupedCategories.map(([categoryName, list]) => (
            <div key={categoryName}>
              <CategorySectionHeader title={categoryName} designSystem={designSystem} />
              <TemplateGrid
                documentTypes={list}
                templates={templates}
                onSelect={onSelect}
                onClose={onClose}
              />
            </div>
          ))}
          {uncategorized.length > 0 && (
            <div>
              <CategorySectionHeader title="Other" designSystem={designSystem} />
              <TemplateGrid
                documentTypes={uncategorized}
                templates={templates}
                onSelect={onSelect}
                onClose={onClose}
              />
            </div>
          )}
        </div>
      ) : (
        <TemplateGrid
          documentTypes={filteredTypes}
          templates={templates}
          onSelect={onSelect}
          onClose={onClose}
          showBlank
        />
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
