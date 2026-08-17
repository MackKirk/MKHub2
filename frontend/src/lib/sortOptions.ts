/**
 * Sort an array by a label (e.g. for dropdowns). Uses localeCompare for alphabetical order,
 * case-insensitive, with numeric collation so "2" comes before "10".
 */
export function sortByLabel<T>(items: T[], getLabel: (item: T) => string): T[] {
  return [...items].sort((a, b) =>
    (getLabel(a) || '').localeCompare(getLabel(b) || '', undefined, { sensitivity: 'base', numeric: true })
  );
}
