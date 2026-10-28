import {
  canViewDocumentBuilder,
  canViewDocumentHubTemplates,
  canViewSignatureEditor,
  canViewSignatureRequests,
} from '@/lib/documentHubPermissions';
import {
  hasConstructionProjectsOpportunitiesPermission,
  hasRmProjectsOpportunitiesPermission,
} from '@/lib/projectLinePermissionKeys';
import { hasAnySettingsPermission } from '@/lib/settingsPermissions';

export type EvaluatePermissionOptions = {
  /** From /auth/me/settings-permissions when available; else falls back to permission keys. */
  canAccessSettings?: boolean;
};

/**
 * Shared permission evaluation for menu + route gates.
 * Keep AppShell and RequirePermission in sync via this function.
 */
export function evaluatePermission(
  requiredPermission: string | undefined,
  permissionsSet: Set<string>,
  isAdmin = false,
  options: EvaluatePermissionOptions = {},
): boolean {
  if (!requiredPermission) return true;
  if (isAdmin) return true;

  const has = permissionsSet.has(requiredPermission);
  const legacyBizWrite = permissionsSet.has('business:projects:write');

  if (requiredPermission === 'business:construction:projects:read') {
    return hasConstructionProjectsOpportunitiesPermission(permissionsSet, isAdmin);
  }
  if (requiredPermission === 'business:rm:projects:read') {
    return hasRmProjectsOpportunitiesPermission(permissionsSet, isAdmin);
  }
  if (requiredPermission === 'business:projects:read') {
    return hasConstructionProjectsOpportunitiesPermission(permissionsSet, isAdmin);
  }
  if (
    requiredPermission === 'business:construction:projects:write' ||
    requiredPermission === 'business:projects:write'
  ) {
    return has || legacyBizWrite || permissionsSet.has('business:construction:projects:write');
  }
  if (requiredPermission === 'business:rm:projects:write') {
    return has || legacyBizWrite || permissionsSet.has('business:rm:projects:write');
  }
  if (requiredPermission.startsWith('hr:')) {
    const legacyPerm = requiredPermission.replace('hr:', '');
    return has || permissionsSet.has(legacyPerm);
  }
  if (requiredPermission === 'fleet:access') {
    return (
      has ||
      permissionsSet.has('fleet:read') ||
      permissionsSet.has('fleet:vehicles:read') ||
      permissionsSet.has('fleet:vehicles:write') ||
      permissionsSet.has('fleet:equipment:read') ||
      permissionsSet.has('fleet:equipment:write')
    );
  }
  if (requiredPermission === 'properties:access') {
    return (
      has ||
      permissionsSet.has('properties:dashboard:read') ||
      permissionsSet.has('properties:company:read') ||
      permissionsSet.has('properties:family:read')
    );
  }
  if (requiredPermission === 'fleet:vehicles:read') {
    return has || permissionsSet.has('fleet:read');
  }
  if (requiredPermission === 'fleet:work_orders:read') {
    return has || permissionsSet.has('work_orders:read');
  }
  if (requiredPermission === 'fleet:inspections:read') {
    return (
      has ||
      permissionsSet.has('inspections:read') ||
      permissionsSet.has('fleet:inspections:write')
    );
  }
  if (requiredPermission === 'equipment:read') {
    return (
      has ||
      permissionsSet.has('fleet:equipment:read') ||
      permissionsSet.has('fleet:equipment:write')
    );
  }
  if (requiredPermission === 'fleet:equipment:read') {
    return (
      has ||
      permissionsSet.has('fleet:equipment:write') ||
      permissionsSet.has('equipment:read') ||
      permissionsSet.has('equipment:write')
    );
  }
  if (requiredPermission === 'fleet:equipment:work_orders:read') {
    return has || permissionsSet.has('fleet:equipment:work_orders:write');
  }
  if (requiredPermission === 'hr:onboarding:read') {
    return has || permissionsSet.has('hr:onboarding:write');
  }
  if (requiredPermission === 'company_cards:read') {
    return has || permissionsSet.has('company_cards:write');
  }
  if (requiredPermission === 'fuel_cards:read') {
    return has || permissionsSet.has('fuel_cards:write');
  }
  if (requiredPermission === 'documents:read') {
    return (
      has ||
      permissionsSet.has('documents:write') ||
      permissionsSet.has('documents:delete') ||
      permissionsSet.has('documents:move')
    );
  }
  if (requiredPermission === 'document_hub:builder:read') {
    return canViewDocumentBuilder(isAdmin, permissionsSet);
  }
  if (requiredPermission === 'document_hub:signature_requests:read') {
    return canViewSignatureRequests(isAdmin, permissionsSet);
  }
  if (requiredPermission === 'document_hub:signature_editor:read') {
    return canViewSignatureEditor(isAdmin, permissionsSet);
  }
  if (requiredPermission === 'document_hub:backgrounds:read') {
    return has || canViewDocumentHubTemplates(isAdmin, permissionsSet);
  }
  if (requiredPermission === 'document_hub:templates:read') {
    return canViewDocumentHubTemplates(isAdmin, permissionsSet);
  }
  if (requiredPermission === 'settings:document_backgrounds:read') {
    return (
      has ||
      permissionsSet.has('settings:document_backgrounds:write') ||
      permissionsSet.has('document_hub:backgrounds:read') ||
      permissionsSet.has('document_hub:backgrounds:write')
    );
  }
  if (requiredPermission === 'settings:document_templates:read') {
    return (
      has ||
      permissionsSet.has('settings:document_templates:write') ||
      permissionsSet.has('document_hub:templates:read') ||
      permissionsSet.has('document_hub:templates:write')
    );
  }
  if (requiredPermission === 'settings:access') {
    if (typeof options.canAccessSettings === 'boolean') {
      return options.canAccessSettings;
    }
    return hasAnySettingsPermission(permissionsSet, isAdmin);
  }
  // Virtual keys matching Training menu visibility (AppShell).
  if (requiredPermission === 'training:dashboard:access') {
    return (
      permissionsSet.has('training:dashboard:read') ||
      permissionsSet.has('training:manage') ||
      permissionsSet.has('users:write') ||
      permissionsSet.has('users:read') ||
      permissionsSet.has('hr:users:read') ||
      permissionsSet.has('hr:users:view:general')
    );
  }
  if (requiredPermission === 'training:admin:access') {
    return (
      permissionsSet.has('training:admin:read') ||
      permissionsSet.has('training:admin:write') ||
      permissionsSet.has('training:manage') ||
      permissionsSet.has('users:write')
    );
  }
  if (requiredPermission === 'business:projects:safety:read') {
    return (
      has ||
      permissionsSet.has('business:construction:projects:safety:read') ||
      permissionsSet.has('business:construction:projects:safety:write') ||
      permissionsSet.has('business:rm:projects:safety:read') ||
      permissionsSet.has('business:rm:projects:safety:write')
    );
  }
  if (requiredPermission === 'business:projects:safety:write') {
    return (
      has ||
      permissionsSet.has('business:construction:projects:safety:write') ||
      permissionsSet.has('business:rm:projects:safety:write')
    );
  }
  return has;
}
