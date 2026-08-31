export type DocumentTypeWithCategory = {
  id: string;
  name: string;
  description?: string | null;
  category?: string | null;
};

export const UNCATEGORIZED_CATEGORY_KEY = '__uncategorized__';

/** Canonical label for HR employee-contract templates (match is case-insensitive). */
export const EMPLOYEE_CONTRACT_CATEGORY = 'Employee Contract';

export function isEmployeeContractCategory(category: string | null | undefined): boolean {
  return (category || '').trim().toLowerCase() === EMPLOYEE_CONTRACT_CATEGORY.toLowerCase();
}

/** Hide Employee Contract templates when creating/adding pages under a project/opportunity. */
export function filterDocumentTypesForProjectScope<T extends DocumentTypeWithCategory>(types: T[]): T[] {
  return types.filter((dt) => !isEmployeeContractCategory(dt.category));
}

export function groupDocumentTypesByCategory<T extends DocumentTypeWithCategory>(
  types: T[],
): { categories: [string, T[]][]; uncategorized: T[] } {
  const map = new Map<string, T[]>();
  const uncategorized: T[] = [];
  for (const dt of types) {
    const cat = (dt.category || '').trim();
    if (!cat) {
      uncategorized.push(dt);
    } else {
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(dt);
    }
  }
  const categories = Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  return { categories, uncategorized };
}

export function getDocumentTypeCategories(types: DocumentTypeWithCategory[]): string[] {
  const set = new Set<string>();
  for (const dt of types) {
    const cat = (dt.category || '').trim();
    if (cat) set.add(cat);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

export type DocumentTypeFilterOptions = {
  query?: string;
  category?: 'all' | string;
};

export function filterDocumentTypes<T extends DocumentTypeWithCategory>(
  types: T[],
  { query, category = 'all' }: DocumentTypeFilterOptions,
): T[] {
  const q = (query || '').trim().toLowerCase();

  return types.filter((dt) => {
    const cat = (dt.category || '').trim();

    if (category !== 'all') {
      if (category === UNCATEGORIZED_CATEGORY_KEY) {
        if (cat) return false;
      } else if (cat !== category) {
        return false;
      }
    }

    if (q) {
      const name = (dt.name || '').toLowerCase();
      const desc = (dt.description || '').toLowerCase();
      if (!name.includes(q) && !desc.includes(q)) return false;
    }

    return true;
  });
}
