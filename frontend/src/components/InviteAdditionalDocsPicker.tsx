import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, X } from 'lucide-react';
import { api } from '@/lib/api';
import {
  GRID_CARD_CLASS,
  GRID_CLASS,
  PICKER_BODY_HEIGHT_CLASS,
  type BackgroundTemplate,
  type DocumentTypePreset,
} from '@/components/DocumentTypePicker';
import {
  InvitePickerContractThumb,
  InvitePickerPdfThumb,
  InvitePickerPreviewFrame,
} from '@/components/InvitePickerThumbs';
import {
  EMPLOYEE_CONTRACT_CATEGORY,
  isEmployeeContractCategory,
} from '@/lib/documentTypeGrouping';
import {
  AppButton,
  AppFormModal,
  AppInput,
  uiCx,
  uiLayout,
  uiSpacing,
  uiTypography,
} from '@/components/ui';

export type AdditionalDocSource = 'document_type' | 'onboarding_base';

export type AdditionalDocRef = {
  source: AdditionalDocSource;
  id: string;
  name: string;
};

const ADDITIONAL_DOCS_CATEGORY = 'Additional Docs';

type OnboardingBaseDoc = {
  id: string;
  name: string;
  display_name?: string | null;
  employee_visible?: boolean;
  package_role?: string | null;
  sort_order?: number;
};

type CatalogItem = {
  key: string;
  source: AdditionalDocSource;
  id: string;
  name: string;
  category: typeof EMPLOYEE_CONTRACT_CATEGORY | typeof ADDITIONAL_DOCS_CATEGORY;
  pageCount?: number;
  documentType?: DocumentTypePreset;
};

type Props = {
  value: AdditionalDocRef[];
  onChange: (next: AdditionalDocRef[]) => void;
  jobTitle?: string;
  disabled?: boolean;
};

type CategoryNavItem = {
  value: 'all' | string;
  label: string;
  count: number;
};

function selectedKey(ref: { source: string; id: string }) {
  return `${ref.source}:${ref.id}`;
}

function sourceBadge(source: AdditionalDocSource) {
  return source === 'document_type' ? 'Contract' : 'Doc';
}

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
          ? 'border-brand-red bg-red-50 text-brand-red font-semibold ring-1 ring-inset ring-brand-red/30'
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

export default function InviteAdditionalDocsPicker({ value, onChange, jobTitle, disabled }: Props) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [draft, setDraft] = useState<Set<string>>(() => new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<'all' | string>('all');
  const [suggestionDismissed, setSuggestionDismissed] = useState(false);

  useEffect(() => {
    if (!pickerOpen) return;
    setDraft(new Set(value.map(selectedKey)));
    setSearchQuery('');
    setActiveCategory('all');
  }, [pickerOpen, value]);

  const { data: documentTypes = [], isLoading: typesLoading } = useQuery({
    queryKey: ['document-creator-document-types-picker'],
    queryFn: () => api<DocumentTypePreset[]>('GET', '/document-creator/document-types?for_picker=1'),
    enabled: pickerOpen || Boolean(jobTitle?.trim()),
    staleTime: 60_000,
  });

  const { data: backgroundTemplates = [] } = useQuery({
    queryKey: ['document-creator-templates'],
    queryFn: () => api<BackgroundTemplate[]>('GET', '/document-creator/templates'),
    enabled: pickerOpen,
    staleTime: 60_000,
  });

  const { data: baseDocs = [], isLoading: formsLoading } = useQuery({
    queryKey: ['onb-base-docs'],
    queryFn: () => api<OnboardingBaseDoc[]>('GET', '/onboarding/base-documents'),
    enabled: pickerOpen || Boolean(jobTitle?.trim()),
    staleTime: 60_000,
  });

  const catalog = useMemo((): CatalogItem[] => {
    const contracts: CatalogItem[] = documentTypes
      .filter((dt) => isEmployeeContractCategory(dt.category))
      .map((dt) => ({
        key: `document_type:${dt.id}`,
        source: 'document_type' as const,
        id: String(dt.id),
        name: String(dt.name || '').trim() || 'Untitled',
        category: EMPLOYEE_CONTRACT_CATEGORY,
        pageCount: (dt.page_templates || []).length || 1,
        documentType: dt,
      }));

    const forms: CatalogItem[] = baseDocs
      .filter(
        (d) =>
          d.employee_visible !== false &&
          (d.package_role || '').trim().toLowerCase() === 'additional',
      )
      .sort((a, b) => {
        const orderDiff = (a.sort_order ?? 0) - (b.sort_order ?? 0);
        if (orderDiff !== 0) return orderDiff;
        const labelA = ((a.display_name || '').trim() || a.name).toLowerCase();
        const labelB = ((b.display_name || '').trim() || b.name).toLowerCase();
        return labelA.localeCompare(labelB);
      })
      .map((d) => ({
        key: `onboarding_base:${d.id}`,
        source: 'onboarding_base' as const,
        id: String(d.id),
        name: ((d.display_name || '').trim() || d.name).trim() || 'Untitled',
        category: ADDITIONAL_DOCS_CATEGORY,
      }));

    return [...contracts, ...forms];
  }, [documentTypes, baseDocs]);

  const catalogByKey = useMemo(() => {
    const map = new Map<string, CatalogItem>();
    for (const item of catalog) map.set(item.key, item);
    return map;
  }, [catalog]);

  const navItems = useMemo((): CategoryNavItem[] => {
    const contractCount = catalog.filter((c) => c.category === EMPLOYEE_CONTRACT_CATEGORY).length;
    const formsCount = catalog.filter((c) => c.category === ADDITIONAL_DOCS_CATEGORY).length;
    return [
      { value: 'all', label: 'All', count: catalog.length },
      { value: EMPLOYEE_CONTRACT_CATEGORY, label: EMPLOYEE_CONTRACT_CATEGORY, count: contractCount },
      { value: ADDITIONAL_DOCS_CATEGORY, label: ADDITIONAL_DOCS_CATEGORY, count: formsCount },
    ];
  }, [catalog]);

  const filteredCatalog = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return catalog.filter((item) => {
      if (activeCategory !== 'all' && item.category !== activeCategory) return false;
      if (!q) return true;
      return item.name.toLowerCase().includes(q) || item.category.toLowerCase().includes(q);
    });
  }, [catalog, activeCategory, searchQuery]);

  const suggestion = useMemo(() => {
    const jt = (jobTitle || '').trim().toLowerCase();
    if (!jt || suggestionDismissed) return null;
    const selected = new Set(value.map(selectedKey));
    for (const item of catalog) {
      if (item.name.toLowerCase().includes(jt) && !selected.has(item.key)) {
        return { source: item.source, id: item.id, name: item.name };
      }
    }
    return null;
  }, [jobTitle, suggestionDismissed, catalog, value]);

  const isLoading = typesLoading || formsLoading;

  const toggleDraft = (key: string) => {
    setDraft((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const applyDraft = () => {
    const byKey = new Map(value.map((v) => [selectedKey(v), v]));
    const next: AdditionalDocRef[] = [];
    // Keep existing order for still-selected items
    for (const ref of value) {
      const key = selectedKey(ref);
      if (draft.has(key)) next.push(ref);
    }
    // Append newly selected
    for (const key of draft) {
      if (byKey.has(key)) continue;
      const item = catalogByKey.get(key);
      if (!item) continue;
      next.push({ source: item.source, id: item.id, name: item.name });
    }
    onChange(next);
    setPickerOpen(false);
  };

  const closePicker = () => setPickerOpen(false);

  const draftCount = draft.size;
  const addLabel =
    draftCount === 0 ? 'Add documents' : draftCount === 1 ? 'Add 1 document' : `Add ${draftCount} documents`;

  const removeDoc = (ref: AdditionalDocRef) => {
    onChange(value.filter((v) => !(v.source === ref.source && v.id === ref.id)));
  };

  const addSuggestion = (ref: AdditionalDocRef) => {
    if (value.some((v) => selectedKey(v) === selectedKey(ref))) return;
    onChange([...value, ref]);
  };

  return (
    <div className={uiSpacing.sectionStack}>
      {suggestion ? (
        <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>
              Suggested for <span className="font-medium">{jobTitle}</span>: {suggestion.name}
            </span>
            <div className={uiLayout.actionsRow}>
              <AppButton
                type="button"
                size="sm"
                variant="secondary"
                disabled={disabled}
                onClick={() => setSuggestionDismissed(true)}
              >
                Dismiss
              </AppButton>
              <AppButton
                type="button"
                size="sm"
                disabled={disabled}
                onClick={() => {
                  addSuggestion(suggestion);
                  setSuggestionDismissed(true);
                }}
              >
                Add
              </AppButton>
            </div>
          </div>
        </div>
      ) : null}

      {value.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {value.map((ref) => (
            <span
              key={selectedKey(ref)}
              className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-gray-200 bg-white px-2.5 py-1 text-xs text-gray-800"
            >
              <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium uppercase text-gray-600">
                {sourceBadge(ref.source)}
              </span>
              <span className="truncate">{ref.name}</span>
              <button
                type="button"
                className="rounded p-0.5 text-gray-500 hover:bg-gray-100 hover:text-gray-800 disabled:opacity-50"
                disabled={disabled}
                aria-label={`Remove ${ref.name}`}
                onClick={() => removeDoc(ref)}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          ))}
        </div>
      ) : (
        <p className={uiTypography.helper}>
          No additional documents. Optional — pick contracts and docs for this hire.
        </p>
      )}

      <div>
        <AppButton
          type="button"
          size="sm"
          variant="secondary"
          disabled={disabled}
          onClick={() => setPickerOpen(true)}
        >
          Add documents
        </AppButton>
      </div>

      <AppFormModal
        open={pickerOpen}
        onClose={closePicker}
        title="Add documents"
        description="Choose optional contracts and docs for this hire."
        formWidth="wide"
        scrollBody={false}
        footer={
          <div className={uiCx(uiLayout.actionsRow, 'w-full justify-between')}>
            <span className={uiTypography.helper}>
              {draftCount === 0 ? 'None selected' : `${draftCount} selected`}
            </span>
            <div className={uiCx(uiLayout.actionsRow)}>
              <AppButton type="button" variant="secondary" size="sm" onClick={closePicker}>
                Cancel
              </AppButton>
              <AppButton type="button" size="sm" onClick={applyDraft}>
                {addLabel}
              </AppButton>
            </div>
          </div>
        }
      >
        <div
          className={uiCx(
            PICKER_BODY_HEIGHT_CLASS,
            'flex flex-col gap-3 sm:flex-row sm:gap-4 sm:items-stretch',
          )}
        >
          <div
            className="flex sm:hidden gap-1.5 overflow-x-auto pb-1 -mx-1 px-1 shrink-0"
            role="tablist"
            aria-label="Document categories"
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

          <nav
            className="hidden sm:flex sm:flex-col sm:w-40 sm:shrink-0 sm:min-h-0 sm:overflow-y-auto gap-0.5"
            aria-label="Document categories"
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

          <div className="min-w-0 flex-1 flex flex-col min-h-0 gap-3">
            <div className="shrink-0">
              <AppInput
                label="Search"
                placeholder="Search documents..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                leftIcon={<Search className="h-4 w-4" />}
                aria-label="Search documents"
              />
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-0.5">
              {isLoading ? (
                <p className={uiCx(uiTypography.helper, 'py-8 text-center')}>Loading…</p>
              ) : filteredCatalog.length === 0 ? (
                <p className={uiCx(uiTypography.helper, 'py-8 text-center')}>
                  {catalog.length === 0
                    ? 'No documents available. Add Employee Contract types in Document Builder or mark Onboarding Admin docs as Additional.'
                    : 'No documents match this search.'}
                </p>
              ) : (
                <div className={GRID_CLASS}>
                  {filteredCatalog.map((item) => {
                    const selected = draft.has(item.key);
                    const subtitle =
                      item.source === 'document_type'
                        ? `${item.pageCount ?? 1} page(s)`
                        : 'Doc';
                    const checkbox = (
                      <span
                        className={uiCx(
                          'absolute top-2 right-2 z-10 flex h-5 w-5 items-center justify-center rounded border',
                          selected
                            ? 'border-brand-red bg-brand-red text-white'
                            : 'border-gray-300 bg-white text-transparent',
                        )}
                        aria-hidden
                      >
                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      </span>
                    );
                    return (
                      <button
                        key={item.key}
                        type="button"
                        disabled={disabled}
                        aria-pressed={selected}
                        onClick={() => toggleDraft(item.key)}
                        className={uiCx(
                          GRID_CARD_CLASS,
                          selected && 'border-brand-red bg-red-50 ring-2 ring-inset ring-brand-red/40',
                          disabled && 'opacity-60 cursor-not-allowed',
                        )}
                        title={item.name}
                      >
                        <InvitePickerPreviewFrame checkbox={checkbox}>
                          {item.source === 'document_type' && item.documentType ? (
                            <InvitePickerContractThumb
                              documentType={item.documentType}
                              backgroundTemplates={backgroundTemplates}
                            />
                          ) : (
                            <InvitePickerPdfThumb docId={item.id} />
                          )}
                        </InvitePickerPreviewFrame>
                        <div className="px-2 pb-2 pt-1 min-w-0">
                          <span className="text-sm font-medium text-gray-900 truncate block leading-tight">
                            {item.name}
                          </span>
                          <span className="text-[11px] text-gray-500 truncate block leading-tight mt-0.5">
                            {subtitle}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </AppFormModal>
    </div>
  );
}
