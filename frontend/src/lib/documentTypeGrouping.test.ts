import { describe, expect, it } from 'vitest';
import {
  EMPLOYEE_CONTRACT_CATEGORY,
  filterDocumentTypesForProjectScope,
  getDocumentTypeCategories,
  isEmployeeContractCategory,
  type DocumentTypeWithCategory,
} from '@/lib/documentTypeGrouping';

const types: DocumentTypeWithCategory[] = [
  { id: '1', name: 'Proposal', category: 'Commercial' },
  { id: '2', name: 'Offer letter', category: 'Employee Contract' },
  { id: '3', name: 'NDA', category: 'employee contract' },
  { id: '4', name: 'Blank-ish', category: '  EMPLOYEE CONTRACT  ' },
  { id: '5', name: 'Other', category: null },
];

describe('isEmployeeContractCategory', () => {
  it('matches case-insensitively and trims', () => {
    expect(isEmployeeContractCategory(EMPLOYEE_CONTRACT_CATEGORY)).toBe(true);
    expect(isEmployeeContractCategory('employee contract')).toBe(true);
    expect(isEmployeeContractCategory('  Employee Contract  ')).toBe(true);
    expect(isEmployeeContractCategory('Commercial')).toBe(false);
    expect(isEmployeeContractCategory(null)).toBe(false);
    expect(isEmployeeContractCategory('')).toBe(false);
  });
});

describe('filterDocumentTypesForProjectScope', () => {
  it('is a no-op (category access is enforced via permissions)', () => {
    expect(filterDocumentTypesForProjectScope(types).map((t) => t.id)).toEqual(
      types.map((t) => t.id),
    );
  });
});
