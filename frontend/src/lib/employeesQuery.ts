import { api } from '@/lib/api';

export const EMPLOYEES_DIRECTORY_LIMIT = 5000;

export type EmployeesDirectoryParams = {
  limit?: number;
  activeOnly?: boolean;
  sort?: 'recent' | 'name';
};

/** Shared React Query key — include params so limit/active/sort do not share stale cache entries. */
export function employeesDirectoryQueryKey(params: EmployeesDirectoryParams = {}) {
  return [
    'employees',
    'directory',
    {
      limit: params.limit ?? EMPLOYEES_DIRECTORY_LIMIT,
      activeOnly: params.activeOnly ?? false,
      sort: params.sort ?? 'recent',
    },
  ] as const;
}

export const employeesEstimatorPickerQueryKey = ['employees', 'estimator-picker'] as const;

export function fetchEmployeesDirectory(params: EmployeesDirectoryParams = {}) {
  const limit = params.limit ?? EMPLOYEES_DIRECTORY_LIMIT;
  const qs = new URLSearchParams({ limit: String(limit) });
  if (params.activeOnly) qs.set('active_only', 'true');
  if (params.sort) qs.set('sort', params.sort);
  return api<any[]>('GET', `/employees?${qs.toString()}`);
}

/** Full active employee directory sorted by name — used for estimator pickers. */
export function fetchEstimatorPickerEmployees() {
  return fetchEmployeesDirectory({
    limit: EMPLOYEES_DIRECTORY_LIMIT,
    activeOnly: true,
    sort: 'name',
  });
}
