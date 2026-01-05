// Filter Builder Utilities - Shared across all pages

import { FilterOperator, FilterRule } from './types';

// Helper: Check if operator requires two values
export function isRangeOperator(operator: FilterOperator): boolean {
  return operator === 'is_between' || operator === 'between';
}

// Helper: Get operator label
export function getOperatorLabel(operator: FilterOperator): string {
  const labels: Record<FilterOperator, string> = {
    'is': 'Is',
    'is_not': 'Is not',
    'is_before': 'Is before',
    'is_after': 'Is after',
    'is_between': 'Is between',
    'is_equal_to': 'Is equal to',
    'greater_than': 'Greater than',
    'less_than': 'Less than',
    'between': 'Between',
  };
  return labels[operator] || operator;
}

