import { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import {
  filterDocumentTypes,
  getDocumentTypeCategories,
  groupDocumentTypesByCategory,
  UNCATEGORIZED_CATEGORY_KEY,
} from '@/lib/documentTypeGrouping';
import { DocumentPagePreviewThumbnails } from '@/components/DocumentPagePreviewThumbnails';
import type { DocElement, DocumentPage, PageMargins } from '@/types/documentCreator';
import { AppInput, uiCx, uiSpacing, uiTypography } from '@/components/ui';

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

export type BackgroundTemplate = {
  id: string;
  name?: string;
  background_file_id?: string;
  default_elements?: DocElement[];
  margins?: PageMargins | null;
};

export const GRID_THUMB_WIDTH_PX = 160;
export const GRID_CARD_CLASS =
  'rounded-lg border border-gray-200 hover:border-brand-red hover:bg-brand-red/5 transition-colors overflow-hidden flex flex-col items-stretch text-left';
export const GRID_CLASS = 'grid grid-cols-2 sm:grid-cols-3 gap-3.5';
/** Fixed picker body so switching categories does not resize the modal (sized for a full “All” view). */
export const PICKER_BODY_HEIGHT_CLASS = 'h-[min(64vh,36rem)]';

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
      <div className="w-full bg-gray-50 flex items-center justify-center py-4 px-2 min-h-[200px]">
        <DocumentPagePreviewThumbnails
          pages={pages}
          templates={templates}
          maxPages={1}
          thumbWidthPx={GRID_THUMB_WIDTH_PX}
        />
      </div>
      <div className="px-2 pb-2 pt-1 min-w-0">
        <span className="text-sm font-medium text-gray-900 truncate block leading-tight">{name}</span>
        <span className="text-[11px] text-gray-500 truncate block leading-tight mt-0.5">{subtitle}</span>
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
  showBlank = false,
}: {
  documentTypes: DocumentTypePreset[];
  templates: BackgroundTemplate[];
  onSelect: (documentTypeId: string | null) => void;
  showBlank?: boolean;
}) {
  return (
    <div className={GRID_CLASS}>
      {showBlank && <BlankGridCard onClick={() => onSelect(null)} />}
      {documentTypes.map((dt) => (
        <DocumentTypeGridCard
          key={dt.id}
          name={dt.name}
          subtitle={dt.description || `${(dt.page_templates || []).length} page(s)`}
          pages={previewPagesFromDocumentType(dt, templates)}
          templates={templates}
          onClick={() => onSelect(dt.id)}
        />
      ))}
    </div>
  );
}

type CategoryNavItem = {
  value: 'all' | string;
  label: string;
  count: number;
};

function CategoryNavButton({
  item,
  selected,
  onSelect,
  layout,
}: {
  item: CategoryNavItem;
  selected: boolean;
  onSelect: (value: string) => void;
  layout: 'sidebar' | 'chip';
}) {
  const base =
    layout === 'sidebar'
      ? 'w-full flex items-center justify-between gap-1 px-2 py-1.5 rounded-md text-xs transition-colors border'
      : 'shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs transition-colors border whitespace-nowrap';

  return (
    <button
      type="button"
      onClick={() => onSelect(item.value)}
      aria-pressed={selected}
      className={uiCx(
        base,
        selected
          ? 'border-brand-red bg-red-50 text-brand-red font-semibold'
          : 'border-transparent text-gray-700 hover:bg-gray-100 hover:text-gray-900',
      )}
    >
      <span className="truncate min-w-0">{item.label}</span>
      <span className={uiCx('tabular-nums shrink-0', selected ? 'text-brand-red/80' : 'text-gray-400')}>
        {item.count}
      </span>
    </button>
  );
}

export type DocumentTypePickerProps = {
  documentTypes: DocumentTypePreset[];
  backgroundTemplates: BackgroundTemplate[];
  isLoading?: boolean;
  onSelect: (documentTypeId: string | null) => void;
  showBlank?: boolean;
  designSystem?: boolean;
};

export function DocumentTypePicker({
  documentTypes,
  backgroundTemplates,
  isLoading = false,
  onSelect,
  showBlank = true,
  designSystem = true,
}: DocumentTypePickerProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<'all' | string>('all');
  const [categoryInitialized, setCategoryInitialized] = useState(false);

  const categories = useMemo(() => getDocumentTypeCategories(documentTypes), [documentTypes]);
  const hasUncategorized = useMemo(
    () => documentTypes.some((dt) => !(dt.category || '').trim()),
    [documentTypes],
  );

  const uncategorizedCount = useMemo(
    () => documentTypes.filter((dt) => !(dt.category || '').trim()).length,
    [documentTypes],
  );

  const navItems = useMemo((): CategoryNavItem[] => {
    const items: CategoryNavItem[] = [
      { value: 'all', label: 'All', count: documentTypes.length },
      ...categories.map((cat) => ({
        value: cat,
        label: cat,
        count: documentTypes.filter((dt) => (dt.category || '').trim() === cat).length,
      })),
    ];
    if (hasUncategorized) {
      items.push({
        value: UNCATEGORIZED_CATEGORY_KEY,
        label: 'Other',
        count: uncategorizedCount,
      });
    }
    return items;
  }, [categories, documentTypes, hasUncategorized, uncategorizedCount]);

  const showCategoryNav = categories.length > 0 || hasUncategorized;

  // Default to first named category; fall back to All.
  useEffect(() => {
    if (categoryInitialized) return;
    if (documentTypes.length === 0 && !isLoading) {
      setCategoryInitialized(true);
      return;
    }
    if (documentTypes.length === 0) return;
    setActiveCategory(categories[0] ?? 'all');
    setCategoryInitialized(true);
  }, [categoryInitialized, documentTypes.length, categories, isLoading]);

  // Keep selection valid if categories change.
  useEffect(() => {
    if (!categoryInitialized) return;
    const valid = navItems.some((item) => item.value === activeCategory);
    if (!valid) setActiveCategory(categories[0] ?? 'all');
  }, [navItems, activeCategory, categories, categoryInitialized]);

  const filteredTypes = useMemo(
    () => filterDocumentTypes(documentTypes, { query: searchQuery, category: activeCategory }),
    [documentTypes, searchQuery, activeCategory],
  );

  const { categories: groupedCategories, uncategorized } = useMemo(
    () => groupDocumentTypesByCategory(filteredTypes),
    [filteredTypes],
  );

  if (isLoading) {
    return designSystem ? (
      <p className={uiCx(uiTypography.helper, 'py-6 text-center')}>Loading...</p>
    ) : (
      <div className="text-sm text-gray-500 py-6 text-center">Loading...</div>
    );
  }

  const emptyOrSearchMiss = (
    <div className={designSystem ? uiSpacing.sectionStack : 'space-y-4'}>
      {showBlank && (
        <TemplateGrid
          documentTypes={[]}
          templates={backgroundTemplates}
          onSelect={onSelect}
          showBlank
        />
      )}
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
  );

  const allCategoriesView = (
    <div className={designSystem ? uiSpacing.sectionStack : 'space-y-6'}>
      {showBlank && (
        <TemplateGrid
          documentTypes={[]}
          templates={backgroundTemplates}
          onSelect={onSelect}
          showBlank
        />
      )}
      {groupedCategories.map(([categoryName, list]) => (
        <div key={categoryName}>
          <CategorySectionHeader title={categoryName} designSystem={designSystem} />
          <TemplateGrid
            documentTypes={list}
            templates={backgroundTemplates}
            onSelect={onSelect}
          />
        </div>
      ))}
      {uncategorized.length > 0 && (
        <div>
          <CategorySectionHeader title="Other" designSystem={designSystem} />
          <TemplateGrid
            documentTypes={uncategorized}
            templates={backgroundTemplates}
            onSelect={onSelect}
          />
        </div>
      )}
    </div>
  );

  const singleCategoryView = (
    <TemplateGrid
      documentTypes={filteredTypes}
      templates={backgroundTemplates}
      onSelect={onSelect}
      showBlank={showBlank}
    />
  );

  const gridContent =
    filteredTypes.length === 0
      ? emptyOrSearchMiss
      : activeCategory === 'all'
        ? allCategoriesView
        : singleCategoryView;

  const mainPanel = (
    <div className="min-w-0 flex-1 flex flex-col min-h-0 gap-3">
      <div className="shrink-0">
        <AppInput
          label="Search"
          placeholder="Search templates..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          leftIcon={<Search className="h-4 w-4" />}
          aria-label="Search templates"
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-0.5">{gridContent}</div>
    </div>
  );

  if (!showCategoryNav) {
    return (
      <div className={uiCx(PICKER_BODY_HEIGHT_CLASS, 'flex flex-col')}>{mainPanel}</div>
    );
  }

  return (
    <div
      className={uiCx(
        PICKER_BODY_HEIGHT_CLASS,
        'flex flex-col gap-3 sm:flex-row sm:gap-4 sm:items-stretch',
      )}
    >
      {/* Mobile: horizontal chips */}
      <div
        className="flex sm:hidden gap-1.5 overflow-x-auto pb-1 -mx-1 px-1 shrink-0"
        role="tablist"
        aria-label="Template categories"
      >
        {navItems.map((item) => (
          <CategoryNavButton
            key={item.value}
            item={item}
            selected={activeCategory === item.value}
            onSelect={setActiveCategory}
            layout="chip"
          />
        ))}
      </div>

      {/* Desktop: left sidebar */}
      <nav
        className="hidden sm:flex sm:flex-col sm:w-36 sm:shrink-0 sm:min-h-0 sm:overflow-y-auto gap-0.5"
        aria-label="Template categories"
      >
        <p className={uiCx(uiTypography.overline, 'px-2 mb-1')}>Categories</p>
        {navItems.map((item) => (
          <CategoryNavButton
            key={item.value}
            item={item}
            selected={activeCategory === item.value}
            onSelect={setActiveCategory}
            layout="sidebar"
          />
        ))}
      </nav>

      {mainPanel}
    </div>
  );
}
