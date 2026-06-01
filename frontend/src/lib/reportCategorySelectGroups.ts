/** Shared Commercial / Production / Financial labels for report category selects. */
export const REPORT_CATEGORY_GROUP_LABELS = {
  commercial: {
    form: 'Commercial',
    filter: '📌 Commercial',
  },
  production: {
    form: 'Production / Execution',
    filter: '📌 Production / Execution',
  },
  financial: {
    form: 'Financial (Update Project Values)',
    filter: '📌 Financial (Update Project Values)',
  },
} as const;

export type ReportCategorySelectOption = { value: string; label: string };

export type ReportCategorySelectGroup = {
  label: string;
  options: ReportCategorySelectOption[];
};

type ReportCategoryRow = {
  id?: string;
  value?: string;
  label?: string;
  sort_index?: number;
};

function categoryValue(cat: ReportCategoryRow): string {
  return String(cat.value || cat.label || '');
}

function mapCategoryOptions(
  cats: ReportCategoryRow[],
  formatLabel: (cat: ReportCategoryRow) => string,
): ReportCategorySelectOption[] {
  return cats.map((cat) => ({
    value: categoryValue(cat),
    label: formatLabel(cat),
  }));
}

/**
 * Build grouped options for Notes/History category filter or New Note modal.
 * Preserves group order: Commercial → Production → Financial.
 */
export function buildReportCategorySelectGroups(params: {
  commercialCategories: ReportCategoryRow[];
  productionCategories: ReportCategoryRow[];
  financialCategories: ReportCategoryRow[];
  variant: 'filter' | 'form';
  categoryCounts?: Record<string, number>;
}): ReportCategorySelectGroup[] {
  const { commercialCategories, productionCategories, financialCategories, variant } = params;
  const labels = REPORT_CATEGORY_GROUP_LABELS;
  const groups: ReportCategorySelectGroup[] = [];

  if (variant === 'filter') {
    const counts = params.categoryCounts ?? {};
    groups.push({
      label: '',
      options: [{ value: '', label: `All (${counts[''] || 0})` }],
    });
  } else {
    groups.push({
      label: '',
      options: [{ value: '', label: 'Select category…' }],
    });
  }

  const formatFilter = (cat: ReportCategoryRow) => {
    const val = categoryValue(cat);
    const count = params.categoryCounts?.[val] ?? 0;
    return `${cat.label} (${count})`;
  };

  const formatOptionLabel =
    variant === 'filter'
      ? formatFilter
      : (cat: ReportCategoryRow) => String(cat.label || '');

  /** Notes UI always uses 📌 section headers (same as legacy filter optgroups). */
  const groupHeader = (key: keyof typeof labels) => labels[key].filter;

  if (commercialCategories.length > 0) {
    groups.push({
      label: groupHeader('commercial'),
      options: mapCategoryOptions(commercialCategories, formatOptionLabel),
    });
  }
  if (productionCategories.length > 0) {
    groups.push({
      label: groupHeader('production'),
      options: mapCategoryOptions(productionCategories, formatOptionLabel),
    });
  }
  if (financialCategories.length > 0) {
    groups.push({
      label: groupHeader('financial'),
      options: mapCategoryOptions(financialCategories, formatOptionLabel),
    });
  }

  return groups;
}

/** Flatten groups for value → label lookup. */
export function flattenReportCategorySelectGroups(
  groups: ReportCategorySelectGroup[],
): ReportCategorySelectOption[] {
  return groups.flatMap((g) => g.options);
}
