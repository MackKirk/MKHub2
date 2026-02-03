/**
 * Sort an array by a label (e.g. for dropdowns). Uses localeCompare for alphabetical order, case-insensitive.
 */
export function sortByLabel<T>(items: T[], getLabel: (item: T) => string): T[] {
  return [...items].sort((a, b) =>
    (getLabel(a) || '').localeCompare(getLabel(b) || '', undefined, { sensitivity: 'base' })
  );
}
