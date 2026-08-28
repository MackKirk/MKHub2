export const PROPERTIES_ACCESS = 'properties:access';

export function hasPropertiesAccess(permissions: string[] = [], roles: string[] = []): boolean {
  if (roles.includes('admin')) return true;
  return permissions.includes(PROPERTIES_ACCESS);
}

export function canReadCompanyProperties(permissions: string[] = [], roles: string[] = []): boolean {
  if (roles.includes('admin')) return true;
  return (
    permissions.includes('properties:company:read') ||
    permissions.includes('properties:company:write')
  );
}

export function canWriteCompanyProperties(permissions: string[] = [], roles: string[] = []): boolean {
  if (roles.includes('admin')) return true;
  return permissions.includes('properties:company:write');
}

export function canReadFamilyProperties(permissions: string[] = [], roles: string[] = []): boolean {
  if (roles.includes('admin')) return true;
  return (
    permissions.includes('properties:family:read') ||
    permissions.includes('properties:family:write')
  );
}

export function canWriteFamilyProperties(permissions: string[] = [], roles: string[] = []): boolean {
  if (roles.includes('admin')) return true;
  return permissions.includes('properties:family:write');
}

export function canReadPropertyDocuments(permissions: string[] = [], roles: string[] = []): boolean {
  if (roles.includes('admin')) return true;
  return (
    permissions.includes('properties:documents:read') ||
    permissions.includes('properties:documents:write')
  );
}

export function canWritePropertyDocuments(permissions: string[] = [], roles: string[] = []): boolean {
  if (roles.includes('admin')) return true;
  return permissions.includes('properties:documents:write');
}

export function canReadPropertyPermits(permissions: string[] = [], roles: string[] = []): boolean {
  if (roles.includes('admin')) return true;
  return (
    permissions.includes('properties:permits:read') ||
    permissions.includes('properties:permits:write')
  );
}

export function canWritePropertyPermits(permissions: string[] = [], roles: string[] = []): boolean {
  if (roles.includes('admin')) return true;
  return permissions.includes('properties:permits:write');
}

export function canEditProperty(
  visibility: string,
  permissions: string[] = [],
  roles: string[] = [],
): boolean {
  if (visibility === 'family') return canWriteFamilyProperties(permissions, roles);
  return canWriteCompanyProperties(permissions, roles);
}

export type PropertyTab =
  | 'overview'
  | 'leases'
  | 'insurance'
  | 'tax'
  | 'permits'
  | 'people'
  | 'maintenance'
  | 'documents';

export const PROPERTY_TABS: PropertyTab[] = [
  'overview',
  'leases',
  'insurance',
  'tax',
  'permits',
  'people',
  'maintenance',
  'documents',
];
