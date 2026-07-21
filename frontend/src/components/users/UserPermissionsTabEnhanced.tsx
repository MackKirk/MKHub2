import { useEffect, useMemo, useRef, useState, useImperativeHandle, forwardRef, useCallback, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronRight, Shield } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import ProjectFilesCategoriesModal from '@/components/ProjectFilesCategoriesModal';
import ProjectReportCategoriesModal from '@/components/ProjectReportCategoriesModal';
import { CustomerPermissionsGrid } from '@/components/CustomerPermissionsGrid';
import { SupplierPermissionsGrid } from '@/components/SupplierPermissionsGrid';
import { ProductPermissionsGrid } from '@/components/ProductPermissionsGrid';
import { FleetPermissionsPanel } from '@/components/FleetPermissionsPanel';
import { CompanyAssetsPermissionsPanel } from '@/components/CompanyAssetsPermissionsPanel';
import { HrPermissionsPanel } from '@/components/HrPermissionsPanel';
import { TrainingPermissionsPanel } from '@/components/TrainingPermissionsPanel';
import { ProjectLinePermissionsGrid } from '@/components/ProjectLinePermissionsGrid';
import {
  applyCustomerAccessLevel,
  type CustomerAccessLevel,
} from '@/lib/customerPermissions';
import {
  applySupplierAccessLevel,
  type SupplierAccessLevel,
} from '@/lib/supplierPermissions';
import {
  applyProductAccessLevel,
  type ProductAccessLevel,
} from '@/lib/productPermissions';
import {
  applyFleetAccessLevel,
  applyFleetWorkOrderAssignLevel,
  filterFleetAreaPermissions,
  FLEET_ACCESS,
  syncFleetAccess,
  type FleetAccessLevel,
} from '@/lib/fleetPermissions';
import {
  applyCompanyAssetsAccessLevel,
  filterCompanyAssetsAreaPermissions,
  COMPANY_ASSETS_ACCESS,
  syncCompanyAssetsAccess,
  type CompanyAssetsAccessLevel,
} from '@/lib/companyAssetsPermissions';
import { DocumentsPermissionsPanel } from '@/components/DocumentsPermissionsPanel';
import CompanyFilesCategoriesModal from '@/components/CompanyFilesCategoriesModal';
import {
  applyDocumentsAccessLevel,
  applyCompanyFilesCategoryConfigToPayload,
  cloneCompanyFilesCategoryConfig,
  companyFilesCategoryConfigsEqual,
  EMPTY_COMPANY_FILES_CATEGORY_CONFIG,
  filterDocumentsAreaPermissions,
  resolveCompanyFilesCategoryConfigFromApi,
  syncCompanyFilesCategoryConfigAfterMacroChange,
  syncDocumentsAccess,
  type CompanyFilesCategoryConfigState,
  type DocumentsAccessLevel,
} from '@/lib/documentsPermissions';
import {
  applyHrAccessLevel,
  applyHrWriteOnlyLevel,
  HR_ACCESS,
  syncHrAccess,
  type HrAccessLevel,
} from '@/lib/hrPermissions';
import {
  applyTrainingAccessLevel,
  filterTrainingAreaPermissions,
  syncTrainingAccess,
  type TrainingAccessLevel,
} from '@/lib/trainingPermissions';
import {
  applyProjectLineAccessLevel,
  type ProjectLine,
  type ProjectLinePermissionRow,
} from '@/lib/projectLinePermissions';
import {
  EMPTY_LINE_CATEGORY_CONFIG,
  applyLineCategoryConfigToPayload,
  configsEqual,
  resolveCategoryConfigFromApi,
  lineMacroFilesWriteKey,
  lineMacroReportsWriteKey,
  type LineCategoryConfigState,
  clearLegacyProjectSubPermissions,
  clearLegacyCategoryConfigKeys,
  cloneLineCategoryConfigs,
  syncLineCategoryConfigAfterFilesMacroChange,
  syncLineCategoryConfigAfterReportsMacroChange,
} from '@/lib/projectLinePermissionKeys';
import type { PermissionAccessLevel } from '@/lib/permissionAccessLevel';
import {
  IMPLEMENTED_PERMISSIONS,
  isHiddenPermissionKey,
  isConstructionProjectPermissionKey,
  isRepairsProjectPermissionKey,
} from '@/lib/implementedPermissions';
import {
  applyPermissionUncheckCascade,
  canEnablePermission,
  permissionEnableBlockedMessage,
} from '@/lib/permissionDependencies';
import { USER_PERMISSIONS_FIELD_HINTS } from '@/lib/formModalQuickInfo';
import { permissionUi } from '@/components/permissionUi';
import { PermissionToggleLabel, PermissionToggleRow } from '@/components/PermissionToggleRow';
import {
  AppBadge,
  AppButton,
  AppCard,
  AppModal,
  AppSectionHeader,
  AppSelect,
  appSectionPresetProps,
  uiBorders,
  uiCx,
  uiLayout,
  uiSpacing,
  uiTypography,
} from '@/components/ui';

type PermItem = { id: string; key: string; label: string; description?: string };

function PermissionCheckboxItem({
  perm,
  checked,
  disabled,
  onToggle,
  className,
}: {
  perm: PermItem;
  checked: boolean;
  disabled: boolean;
  onToggle: () => void;
  className?: string;
}) {
  return (
    <PermissionToggleRow
      perm={perm}
      checked={checked}
      disabled={disabled}
      onToggle={onToggle}
      className={className}
      badge={!IMPLEMENTED_PERMISSIONS.has(perm.key) ? <AppBadge variant="warning">WIP</AppBadge> : null}
    />
  );
}

function PermissionColumnTitle({ children }: { children: ReactNode }) {
  return <div className={uiCx(permissionUi.columnTitle, 'mb-1.5')}>{children}</div>;
}

export type UserPermissionsRef = {
  hasUnsavedChanges: () => boolean;
  save: () => Promise<void>;
};

export type UserPermissionsTabProps = {
  userId: string;
  user?: any;
  onDirtyChange?: (dirty: boolean) => void;
  canEdit?: boolean;
  inlineSave?: boolean;
};

export const UserPermissionsSection = forwardRef<UserPermissionsRef, UserPermissionsTabProps>(
  ({ userId, user: userProp, onDirtyChange, canEdit = true, inlineSave = false }, ref) => {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const { data: userFromQuery, refetch: refetchUser } = useQuery({ queryKey:['user', userId], queryFn: ()=> api<any>('GET', `/users/${userId}`) });
  const user = userProp || userFromQuery;
  const { data:permissionsData, refetch } = useQuery({ 
    queryKey:['user-permissions', userId], 
    queryFn: ()=> api<any>('GET', `/permissions/users/${userId}`) 
  });
  const { data: currentUser } = useQuery({ queryKey: ['me'], queryFn: () => api<any>('GET', '/auth/me') });
  const { data: permissionTemplates = [] } = useQuery({
    queryKey: ['permission-templates'],
    queryFn: () => api<{ id: string; name: string; permission_keys: string[] }[]>('GET', '/permissions/templates'),
  });
  const [permissions, setPermissions] = useState<Record<string, boolean>>({});
  const [initialPermissions, setInitialPermissions] = useState<Record<string, boolean>>({});
  const [isAdminLocal, setIsAdminLocal] = useState<boolean>(false);
  const [initialIsAdmin, setInitialIsAdmin] = useState<boolean>(false);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [showApplyTemplateModal, setShowApplyTemplateModal] = useState(false);

  type LineCategoryConfigs = Record<ProjectLine, LineCategoryConfigState>;
  const [lineCategoryConfigs, setLineCategoryConfigs] = useState<LineCategoryConfigs>({
    construction: { ...EMPTY_LINE_CATEGORY_CONFIG },
    repairs: { ...EMPTY_LINE_CATEGORY_CONFIG },
  });
  const [initialLineCategoryConfigs, setInitialLineCategoryConfigs] = useState<LineCategoryConfigs>({
    construction: { ...EMPTY_LINE_CATEGORY_CONFIG },
    repairs: { ...EMPTY_LINE_CATEGORY_CONFIG },
  });
  const [companyFilesCategoryConfig, setCompanyFilesCategoryConfig] =
    useState<CompanyFilesCategoryConfigState>({ ...EMPTY_COMPANY_FILES_CATEGORY_CONFIG });
  const [initialCompanyFilesCategoryConfig, setInitialCompanyFilesCategoryConfig] =
    useState<CompanyFilesCategoryConfigState>({ ...EMPTY_COMPANY_FILES_CATEGORY_CONFIG });
  const [showCompanyFilesCategoriesModal, setShowCompanyFilesCategoriesModal] = useState(false);
  const [categoryModal, setCategoryModal] = useState<{
    line: ProjectLine;
    feature: 'files' | 'reports';
  } | null>(null);

  const permissionsHydratedForUser = useRef<string | null>(null);

  // Reset hydration when switching users
  useEffect(() => {
    permissionsHydratedForUser.current = null;
  }, [userId]);

  // Initialize permissions from API (once per user load — do not wipe modal edits on refetch)
  useEffect(() => {
    if (!permissionsData?.permissions_by_category) return;
    if (permissionsHydratedForUser.current === userId) return;

    const perms: Record<string, boolean> = {};
    permissionsData.permissions_by_category.forEach((cat: any) => {
      cat.permissions.forEach((perm: any) => {
        perms[perm.key] = perm.is_granted;
      });
    });
    setPermissions(syncTrainingAccess(syncHrAccess(syncDocumentsAccess(syncFleetAccess(syncCompanyAssetsAccess(perms))))));
    setInitialPermissions(syncTrainingAccess(syncHrAccess(syncDocumentsAccess(syncFleetAccess(syncCompanyAssetsAccess({ ...perms }))))));

    const cfg = permissionsData?.configs || {};
    const nextConfigs: LineCategoryConfigs = {
      construction: resolveCategoryConfigFromApi(cfg, 'construction'),
      repairs: resolveCategoryConfigFromApi(cfg, 'repairs'),
    };
    setLineCategoryConfigs(nextConfigs);
    setInitialLineCategoryConfigs(cloneLineCategoryConfigs(nextConfigs));

    const companyFilesCfg = resolveCompanyFilesCategoryConfigFromApi(
      (permissionsData?.configs || {}) as Record<string, unknown>,
    );
    setCompanyFilesCategoryConfig(companyFilesCfg);
    setInitialCompanyFilesCategoryConfig(cloneCompanyFilesCategoryConfig(companyFilesCfg));

    permissionsHydratedForUser.current = userId;
  }, [permissionsData, userId]);

  // Initialize admin state from user data
  useEffect(() => {
    if (user) {
      const adminStatus = (user.roles||[]).some((r: string) => String(r || '').toLowerCase() === 'admin');
      setIsAdminLocal(adminStatus);
      setInitialIsAdmin(adminStatus);
    }
  }, [user]);

  // Check if there are unsaved changes
  const hasUnsavedChanges = useMemo(() => {
    // Check admin status change
    if (isAdminLocal !== initialIsAdmin) return true;
    
    // Check permissions changes
    const currentKeys = Object.keys(permissions);
    const initialKeys = Object.keys(initialPermissions);
    
    if (currentKeys.length !== initialKeys.length) return true;
    
    for (const key of currentKeys) {
      if (permissions[key] !== initialPermissions[key]) return true;
    }
    
    for (const key of initialKeys) {
      if (permissions[key] !== initialPermissions[key]) return true;
    }
    
    if (!configsEqual(lineCategoryConfigs.construction, initialLineCategoryConfigs.construction)) {
      return true;
    }
    if (!configsEqual(lineCategoryConfigs.repairs, initialLineCategoryConfigs.repairs)) {
      return true;
    }
    if (
      !companyFilesCategoryConfigsEqual(
        companyFilesCategoryConfig,
        initialCompanyFilesCategoryConfig,
      )
    ) {
      return true;
    }

    return false;
  }, [
    permissions,
    initialPermissions,
    isAdminLocal,
    initialIsAdmin,
    lineCategoryConfigs,
    initialLineCategoryConfigs,
    companyFilesCategoryConfig,
    initialCompanyFilesCategoryConfig,
  ]);

  const openProjectFilesCategoriesModal = (line: ProjectLine) => {
    setCategoryModal({ line, feature: 'files' });
  };

  const openProjectReportsCategoriesModal = (line: ProjectLine) => {
    setCategoryModal({ line, feature: 'reports' });
  };

  // Notify parent of dirty state changes
  useEffect(() => {
    onDirtyChange?.(hasUnsavedChanges);
  }, [hasUnsavedChanges, onDirtyChange]);

  const handleToggle = (key: string) => {
    setPermissions((prev) => {
      const newPerms = { ...prev };
      const newValue = !prev[key];

      if (newValue && !canEnablePermission(key, prev)) {
        toast.error(permissionEnableBlockedMessage(key) || 'Required permissions must be enabled first');
        return prev;
      }
      
      // Check dependencies for view permissions
      if (
        key === 'hr:users:view:general' ||
        key === 'hr:users:view:job' ||
        key === 'hr:users:view:docs' ||
        key === 'hr:users:view:timesheet' ||
        key === 'hr:users:view:loans' ||
        key === 'hr:users:view:training' ||
        key === 'hr:users:view:assets' ||
        key === 'hr:users:view:reports' ||
        key === 'hr:users:view:permissions' ||
        key === 'hr:users:view:activity'
      ) {
        // Requires hr:users:read
        if (newValue && !prev['hr:users:read']) {
          toast.error('This permission requires "View Users List" to be enabled first');
          return prev;
        }
      }
      // Check dependencies for job compensation view permission
      else if (key === 'hr:users:view:job:compensation') {
        // Requires hr:users:read and hr:users:view:job
        if (newValue && (!prev['hr:users:read'] || !prev['hr:users:view:job'])) {
          toast.error('This permission requires "View Users List" and "Job" view to be enabled first');
          return prev;
        }
      }
      // Check dependencies for invite user permission
      else if (key === 'hr:users:write') {
        // Requires hr:users:read
        if (newValue && !prev['hr:users:read']) {
          toast.error('This permission requires "View Users List" to be enabled first');
          return prev;
        }
      }
      // Check dependencies for Edit Projects & Opportunities
      else if (key === 'business:projects:write') {
        // Requires business:projects:read (View Projects & Opportunities)
        if (newValue && !prev['business:projects:read']) {
          toast.error('This permission requires "View Projects & Opportunities" to be enabled first');
          return prev;
        }
      }
      // Check dependencies for Edit Quotations
      else if (key === 'sales:quotations:write') {
        // Requires sales:quotations:read (View Quotations)
        if (newValue && !prev['sales:quotations:read']) {
          toast.error('This permission requires "View Quotations" to be enabled first');
          return prev;
        }
      }
      // Check dependencies for Edit Customers
      else if (key === 'business:customers:write') {
        // Requires business:customers:read (View Customers)
        if (newValue && !prev['business:customers:read']) {
          toast.error('This permission requires "View Customers" to be enabled first');
          return prev;
        }
      }
      // Check dependencies for edit permissions
      else if (key === 'hr:users:edit:general') {
        if (newValue && (!prev['hr:users:read'] || !prev['hr:users:view:general'])) {
          toast.error('This permission requires "View Users List" and "Personal" view to be enabled first');
          return prev;
        }
      } else if (key === 'hr:users:edit:job') {
        if (newValue && (!prev['hr:users:read'] || !prev['hr:users:view:job'])) {
          toast.error('This permission requires "View Users List" and "Job" view to be enabled first');
          return prev;
        }
      } else if (key === 'hr:users:edit:docs') {
        if (newValue && (!prev['hr:users:read'] || !prev['hr:users:view:docs'])) {
          toast.error('This permission requires "View Users List" and "Docs" view to be enabled first');
          return prev;
        }
      } else if (key === 'hr:users:edit:timesheet') {
        if (newValue && (!prev['hr:users:read'] || !prev['hr:users:view:timesheet'])) {
          toast.error('This permission requires "View Users List" and "Timesheet" view to be enabled first');
          return prev;
        }
      } else if (key === 'hr:users:edit:loans') {
        if (newValue && (!prev['hr:users:read'] || !prev['hr:users:view:loans'])) {
          toast.error('This permission requires "View Users List" and "Loans" view to be enabled first');
          return prev;
        }
      } else if (key === 'hr:users:edit:training') {
        if (newValue && (!prev['hr:users:read'] || !prev['hr:users:view:training'])) {
          toast.error('This permission requires "View Users List" and "Training" view to be enabled first');
          return prev;
        }
      } else if (key === 'hr:users:edit:assets') {
        if (newValue && (!prev['hr:users:read'] || !prev['hr:users:view:assets'])) {
          toast.error('This permission requires "View Users List" and "Assets" view to be enabled first');
          return prev;
        }
      } else if (key === 'hr:users:edit:reports') {
        if (newValue && (!prev['hr:users:read'] || !prev['hr:users:view:reports'])) {
          toast.error('This permission requires "View Users List" and "Reports" view to be enabled first');
          return prev;
        }
      } else if (key === 'hr:users:edit:permissions') {
        if (newValue && (!prev['hr:users:read'] || !prev['hr:users:view:permissions'])) {
          toast.error('This permission requires "View Users List" and "Permissions" view to be enabled first');
          return prev;
        }
      }
      // Check dependencies for Edit Projects & Opportunities
      else if (key === 'business:projects:write') {
        // Requires business:projects:read (View Projects & Opportunities)
        if (newValue && !prev['business:projects:read']) {
          toast.error('This permission requires "View Projects & Opportunities" to be enabled first');
          return prev;
        }
      }
      // Check dependencies for Edit Quotations
      else if (key === 'sales:quotations:write') {
        // Requires sales:quotations:read (View Quotations)
        if (newValue && !prev['sales:quotations:read']) {
          toast.error('This permission requires "View Quotations" to be enabled first');
          return prev;
        }
      }
      // Check dependencies for Projects & Opportunities view sub-permissions
      else if (key.startsWith('business:projects:') && key.endsWith(':read') && key !== 'business:projects:read') {
        // Requires business:projects:read (View Projects & Opportunities)
        if (newValue && !prev['business:projects:read']) {
          toast.error('This permission requires "View Projects & Opportunities" to be enabled first');
          return prev;
        }
      }
      // Check dependencies for Projects & Opportunities edit sub-permissions
      else if (key.startsWith('business:projects:') && key.endsWith(':write') && key !== 'business:projects:write') {
        // Get the corresponding view permission key
        const viewKey = key.replace(':write', ':read');
        // Requires only the corresponding view permission
        if (newValue && !prev[viewKey]) {
          const viewLabel = viewKey.includes(':reports:') ? 'View Notes/History' :
                           viewKey.includes(':workload:') ? 'View Workload' :
                           viewKey.includes(':timesheet:') ? 'View Timesheet' :
                           viewKey.includes(':files:') ? 'View Files' :
                           viewKey.includes(':documents:') ? 'View Documents' :
                           viewKey.includes(':proposal:') ? 'View Proposal' :
                           viewKey.includes(':costs:') ? 'View Costs' :
                           viewKey.includes(':estimate:') ? 'View Costs' :
                           viewKey.includes(':orders:') ? 'View Orders' :
                           viewKey.includes(':safety:') ? 'View Safety' : 'corresponding View permission';
          toast.error(`This permission requires "${viewLabel}" to be enabled first`);
          return prev;
        }
      }
      
      newPerms[key] = newValue;

      // Fleet: enabling sub-permissions turns on fleet:access (equipment uses company_assets)
      if (newValue && key.startsWith('fleet:') && key !== FLEET_ACCESS && !key.startsWith('fleet:equipment:')) {
        newPerms[FLEET_ACCESS] = true;
      }
      if (
        newValue &&
        (key.startsWith('fleet:equipment:') || key.startsWith('company_cards:')) &&
        key !== COMPANY_ASSETS_ACCESS
      ) {
        newPerms[COMPANY_ASSETS_ACCESS] = true;
      }
      if (newValue && key.startsWith('hr:') && key !== HR_ACCESS) {
        newPerms[HR_ACCESS] = true;
      }
      
      // If disabling a view permission, also disable the corresponding edit permission
      if (!newValue) {
        if (key === FLEET_ACCESS) {
          Object.keys(newPerms).forEach((k) => {
            if (
              k.startsWith('fleet:') &&
              k !== FLEET_ACCESS &&
              !k.startsWith('fleet:equipment:')
            ) {
              newPerms[k] = false;
            }
          });
        } else if (key === COMPANY_ASSETS_ACCESS) {
          Object.keys(newPerms).forEach((k) => {
            if (k.startsWith('fleet:equipment:') || k.startsWith('company_cards:')) {
              newPerms[k] = false;
            }
          });
        } else if (key === HR_ACCESS) {
          Object.keys(newPerms).forEach((k) => {
            if (k.startsWith('hr:') && k !== HR_ACCESS) {
              newPerms[k] = false;
            }
          });
        } else if (key === 'fleet:vehicles:read') {
          newPerms['fleet:vehicles:write'] = false;
        } else if (key === 'fleet:equipment:read') {
          newPerms['fleet:equipment:write'] = false;
        } else if (key === 'hr:users:view:general') {
          newPerms['hr:users:edit:general'] = false;
        } else if (key === 'hr:users:view:job') {
          newPerms['hr:users:edit:job'] = false;
          newPerms['hr:users:view:job:compensation'] = false;
        } else if (key === 'hr:users:view:docs') {
          newPerms['hr:users:edit:docs'] = false;
        } else if (key === 'hr:users:view:timesheet') {
          newPerms['hr:users:edit:timesheet'] = false;
        } else if (key === 'hr:users:view:loans') {
          newPerms['hr:users:edit:loans'] = false;
        } else if (key === 'hr:users:view:training') {
          newPerms['hr:users:edit:training'] = false;
        } else if (key === 'hr:users:view:assets') {
          newPerms['hr:users:edit:assets'] = false;
        } else if (key === 'hr:users:view:reports') {
          newPerms['hr:users:edit:reports'] = false;
        } else if (key === 'hr:users:view:permissions') {
          newPerms['hr:users:edit:permissions'] = false;
        } else if (key === 'hr:users:read') {
          // If disabling View Users List, disable all view, edit permissions and invite user
          newPerms['hr:users:write'] = false;
          newPerms['hr:users:view:general'] = false;
          newPerms['hr:users:view:job'] = false;
          newPerms['hr:users:view:job:compensation'] = false;
          newPerms['hr:users:view:docs'] = false;
          newPerms['hr:users:view:timesheet'] = false;
          newPerms['hr:users:view:loans'] = false;
          newPerms['hr:users:view:training'] = false;
          newPerms['hr:users:view:assets'] = false;
          newPerms['hr:users:view:reports'] = false;
          newPerms['hr:users:view:permissions'] = false;
          newPerms['hr:users:view:activity'] = false;
          newPerms['hr:users:edit:general'] = false;
          newPerms['hr:users:edit:job'] = false;
          newPerms['hr:users:edit:docs'] = false;
          newPerms['hr:users:edit:timesheet'] = false;
          newPerms['hr:users:edit:loans'] = false;
          newPerms['hr:users:edit:training'] = false;
          newPerms['hr:users:edit:assets'] = false;
          newPerms['hr:users:edit:reports'] = false;
          newPerms['hr:users:edit:permissions'] = false;
        }
        // If disabling View Customers, disable Edit Customers
        else if (key === 'business:customers:read') {
          newPerms['business:customers:write'] = false;
        }
        // If disabling View Quotations, disable Edit Quotations
        else if (key === 'sales:quotations:read') {
          newPerms['sales:quotations:write'] = false;
        }
        // If disabling View Projects & Opportunities, disable Edit Projects & Opportunities and all view sub-permissions
        else if (key === 'business:projects:read') {
          newPerms['business:projects:write'] = false;
          newPerms['business:projects:reports:read'] = false;
          newPerms['business:projects:workload:read'] = false;
          newPerms['business:projects:timesheet:read'] = false;
          newPerms['business:projects:files:read'] = false;
          newPerms['business:projects:documents:read'] = false;
          newPerms['business:projects:documents:write'] = false;
          newPerms['business:projects:proposal:read'] = false;
          newPerms['business:projects:costs:read'] = false;
          newPerms['business:projects:estimate:read'] = false;
          newPerms['business:projects:orders:read'] = false;
          newPerms['business:projects:safety:read'] = false;
        }
        // If disabling Edit Projects & Opportunities, disable all edit sub-permissions
        else if (key === 'business:projects:write') {
          newPerms['business:projects:reports:write'] = false;
          newPerms['business:projects:workload:write'] = false;
          newPerms['business:projects:timesheet:write'] = false;
          newPerms['business:projects:files:write'] = false;
          newPerms['business:projects:documents:write'] = false;
          newPerms['business:projects:proposal:write'] = false;
          newPerms['business:projects:costs:write'] = false;
          newPerms['business:projects:estimate:write'] = false;
          newPerms['business:projects:orders:write'] = false;
          newPerms['business:projects:safety:write'] = false;
        }
        // If disabling a view sub-permission, also disable the corresponding edit permission
        else if (key.startsWith('business:projects:') && key.endsWith(':read') && key !== 'business:projects:read') {
          const editKey = key.replace(':read', ':write');
          newPerms[editKey] = false;
        }
        return syncTrainingAccess(syncHrAccess(syncDocumentsAccess(syncFleetAccess(syncCompanyAssetsAccess(applyPermissionUncheckCascade(key, newPerms))))));
      }
      
      return syncTrainingAccess(syncHrAccess(syncDocumentsAccess(syncFleetAccess(syncCompanyAssetsAccess(newPerms)))));
    });
  };
  
  const canEnableEditPermission = (permKey: string, permissions: Record<string, boolean>): boolean =>
    canEnablePermission(permKey, permissions);

  const handleCustomerAccessLevel = useCallback(
    (readKey: string, writeKey: string | undefined, level: CustomerAccessLevel) => {
      setPermissions((prev) => applyCustomerAccessLevel(prev, readKey, writeKey, level));
    },
    []
  );

  const handleSupplierAccessLevel = useCallback(
    (readKey: string, writeKey: string | undefined, level: SupplierAccessLevel) => {
      setPermissions((prev) => applySupplierAccessLevel(prev, readKey, writeKey, level));
    },
    []
  );

  const handleProductAccessLevel = useCallback(
    (readKey: string, writeKey: string | undefined, level: ProductAccessLevel) => {
      setPermissions((prev) => applyProductAccessLevel(prev, readKey, writeKey, level));
    },
    []
  );

  const handleFleetAccessLevel = useCallback(
    (readKey: string, writeKey: string | undefined, level: FleetAccessLevel) => {
      setPermissions((prev) => applyFleetAccessLevel(prev, readKey, writeKey, level));
    },
    []
  );

  const handleFleetAssignLevel = useCallback((level: FleetAccessLevel) => {
    setPermissions((prev) => applyFleetWorkOrderAssignLevel(prev, level));
  }, []);

  const handleCompanyAssetsAccessLevel = useCallback(
    (readKey: string, writeKey: string | undefined, level: CompanyAssetsAccessLevel) => {
      setPermissions((prev) => {
        const next = applyCompanyAssetsAccessLevel(prev, readKey, writeKey, level);
        return syncCompanyAssetsAccess(next);
      });
    },
    []
  );

  const handleDocumentsAccessLevel = useCallback(
    (readKey: string, writeKey: string | undefined, level: DocumentsAccessLevel) => {
      setPermissions((prev) => applyDocumentsAccessLevel(prev, readKey, writeKey, level));
      setCompanyFilesCategoryConfig((prev) =>
        syncCompanyFilesCategoryConfigAfterMacroChange(prev, level),
      );
    },
    []
  );

  const handleHrAccessLevel = useCallback(
    (readKey: string, writeKey: string | undefined, level: HrAccessLevel) => {
      setPermissions((prev) => syncHrAccess(applyHrAccessLevel(prev, readKey, writeKey, level)));
    },
    []
  );

  const handleHrWriteOnlyLevel = useCallback((key: string, level: HrAccessLevel) => {
    setPermissions((prev) => syncHrAccess(applyHrWriteOnlyLevel(prev, key, level)));
  }, []);

  const handleTrainingAccessLevel = useCallback(
    (readKey: string, writeKey: string | undefined, level: TrainingAccessLevel) => {
      setPermissions((prev) => applyTrainingAccessLevel(prev, readKey, writeKey, level));
    },
    [],
  );

  const handleProjectLineAccessLevel = useCallback(
    (
      line: ProjectLine,
      areaPerms: { id: string; key: string; label: string; description?: string }[],
      row: ProjectLinePermissionRow,
      level: PermissionAccessLevel
    ) => {
      setPermissions((prev) => applyProjectLineAccessLevel(line, areaPerms, prev, row, level));
      if (row.kind === 'pair' && row.configKind?.endsWith('-files')) {
        setLineCategoryConfigs((prev) => ({
          ...prev,
          [line]: syncLineCategoryConfigAfterFilesMacroChange(prev[line], level),
        }));
      }
      if (row.kind === 'pair' && row.configKind?.endsWith('-reports')) {
        setLineCategoryConfigs((prev) => ({
          ...prev,
          [line]: syncLineCategoryConfigAfterReportsMacroChange(prev[line], level),
        }));
      }
    },
    []
  );

  const applyTemplateMerge = useCallback(() => {
    if (!selectedTemplateId) return;
    const template = (permissionTemplates as { id: string; name: string; permission_keys: string[] }[]).find((t) => t.id === selectedTemplateId);
    if (!template?.permission_keys?.length) {
      toast.error('Template has no permissions');
      return;
    }
    setPermissions((prev) =>
      syncTrainingAccess(syncHrAccess(
        syncDocumentsAccess(
          syncFleetAccess(
            syncCompanyAssetsAccess({
              ...prev,
              ...Object.fromEntries((template.permission_keys || []).map((k) => [k, true])),
            }),
          ),
        ),
      )),
    );
    toast.success(`Applied template "${template.name}" (merge)`);
    setShowApplyTemplateModal(false);
  }, [selectedTemplateId, permissionTemplates]);

  const applyTemplateReplace = useCallback(() => {
    if (!selectedTemplateId) return;
    const template = (permissionTemplates as { id: string; name: string; permission_keys: string[] }[]).find((t) => t.id === selectedTemplateId);
    if (!template) return;
    const templateKeySet = new Set(template.permission_keys || []);
    const allKeys: string[] = [];
    (permissionsData?.permissions_by_category || []).forEach((cat: any) => {
      (cat.permissions || []).forEach((p: any) => {
        if (p.key) allKeys.push(p.key);
      });
    });
    const next: Record<string, boolean> = {};
    allKeys.forEach((k) => { next[k] = templateKeySet.has(k); });
    Object.keys(next).forEach((key) => {
      if (next[key] && key.includes(':')) {
        const area = key.split(':')[0];
        const areaAccessKey = `${area}:access`;
        if (allKeys.includes(areaAccessKey)) next[areaAccessKey] = true;
      }
    });
    setPermissions(syncTrainingAccess(syncHrAccess(syncDocumentsAccess(syncFleetAccess(syncCompanyAssetsAccess(next))))));
    setShowApplyTemplateModal(false);
  }, [selectedTemplateId, permissionTemplates, permissionsData]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      // Save admin role if changed
      if (user) {
        const isAdmin = (user.roles||[]).some((r: string) => String(r || '').toLowerCase() === 'admin');
        if (isAdmin !== isAdminLocal) {
          let newRoles = [...(user.roles||[])];
          if (isAdminLocal) {
            if (!newRoles.some((r: string) => String(r || '').toLowerCase() === 'admin')) {
              newRoles.push('admin');
            }
          } else {
            newRoles = newRoles.filter((r: string) => String(r || '').toLowerCase() !== 'admin');
          }
          await api('PATCH', `/users/${userId}`, { roles: newRoles, is_active: user.is_active });
          await refetchUser();
        }
      }
      // Save permissions (only keys defined in DB — avoids invalid key errors after seed/migrations)
      const validPermKeys = new Set<string>();
      (permissionsData?.permissions_by_category || []).forEach((cat: any) => {
        (cat.permissions || []).forEach((p: any) => {
          if (p.key) validPermKeys.add(p.key);
        });
      });
      const payload: Record<string, boolean | string[]> = {};
      validPermKeys.forEach((key) => {
        payload[key] = !!permissions[key];
      });
      applyLineCategoryConfigToPayload(payload, 'construction', lineCategoryConfigs.construction);
      applyLineCategoryConfigToPayload(payload, 'repairs', lineCategoryConfigs.repairs);
      applyCompanyFilesCategoryConfigToPayload(payload, companyFilesCategoryConfig);
      clearLegacyProjectSubPermissions(payload);
      clearLegacyCategoryConfigKeys(payload);
      // clearLegacy may set retired keys (estimate/orders); only send active defs + config keys
      for (const key of Object.keys(payload)) {
        if (typeof payload[key] === 'boolean' && !validPermKeys.has(key)) {
          delete payload[key];
        }
      }
      await api('PUT', `/permissions/users/${userId}`, payload);
      toast.success('Permissions saved');
      await refetch();
      
      // Update initial state to reflect saved state
      setInitialPermissions({ ...permissions });
      setInitialIsAdmin(isAdminLocal);
      setInitialLineCategoryConfigs(cloneLineCategoryConfigs(lineCategoryConfigs));
      setInitialCompanyFilesCategoryConfig(
        cloneCompanyFilesCategoryConfig(companyFilesCategoryConfig),
      );
      
      // If editing own permissions, invalidate /auth/me cache to refresh permissions
      if (currentUser && currentUser.id === userId) {
        await queryClient.invalidateQueries({ queryKey: ['me'] });
        await queryClient.invalidateQueries({ queryKey: ['project-files-category-perms'] });
        await queryClient.invalidateQueries({ queryKey: ['project-reports-category-perms'] });
        await queryClient.invalidateQueries({ queryKey: ['company-files-department-perms'] });
        await queryClient.invalidateQueries({ queryKey: ['company-files-departments'] });
      }
    } catch (e: any) {
      toast.error(e?.detail || 'Failed to save permissions');
      throw e;
    } finally {
      setSaving(false);
    }
  }, [
    user,
    isAdminLocal,
    userId,
    permissions,
    lineCategoryConfigs,
    companyFilesCategoryConfig,
    currentUser,
    queryClient,
    refetchUser,
    refetch,
    permissionsData,
  ]);

  // Expose methods to parent via ref
  useImperativeHandle(ref, () => ({
    hasUnsavedChanges: () => hasUnsavedChanges,
    save: handleSave,
  }), [hasUnsavedChanges, handleSave]);


  if (!permissionsData) {
    return (
      <div className="space-y-6 pb-24">
        <AppCard bodyClassName={uiSpacing.cardPadding}>
          <div className="h-24 animate-pulse rounded-lg bg-gray-100" />
        </AppCard>
      </div>
    );
  }

  const permissionsDescription = canEdit
    ? 'Manage granular permissions for this user. Permissions from roles are combined with these overrides. Permissions marked with WIP are not yet implemented.'
    : 'View permissions assigned to this user. You have view-only access and cannot modify permissions.';

  return (
    <div className="space-y-6 pb-24">
      {showCompanyFilesCategoriesModal ? (
        <CompanyFilesCategoriesModal
          open
          readCategories={companyFilesCategoryConfig.read}
          writeCategories={companyFilesCategoryConfig.write}
          macroCanEdit={!!permissions['documents:write']}
          onClose={() => setShowCompanyFilesCategoriesModal(false)}
          onSave={({ read, write }) => {
            setCompanyFilesCategoryConfig({
              read: read ? [...read] : null,
              write: write ? [...write] : null,
            });
            setShowCompanyFilesCategoriesModal(false);
          }}
        />
      ) : null}
      {categoryModal?.feature === 'files' && (
        <ProjectFilesCategoriesModal
          open
          readCategories={lineCategoryConfigs[categoryModal.line].filesRead}
          writeCategories={lineCategoryConfigs[categoryModal.line].filesWrite}
          macroCanEdit={permissions[lineMacroFilesWriteKey(categoryModal.line)] === true}
          onClose={() => setCategoryModal(null)}
          onSave={({ read, write }) => {
            const line = categoryModal.line;
            setLineCategoryConfigs((prev) => ({
              ...prev,
              [line]: {
                ...prev[line],
                filesRead: read ? [...read] : null,
                filesWrite: write ? [...write] : null,
              },
            }));
            setCategoryModal(null);
          }}
        />
      )}
      {categoryModal?.feature === 'reports' && (
        <ProjectReportCategoriesModal
          open
          readCategories={lineCategoryConfigs[categoryModal.line].reportsRead}
          writeCategories={lineCategoryConfigs[categoryModal.line].reportsWrite}
          macroCanEdit={permissions[lineMacroReportsWriteKey(categoryModal.line)] === true}
          onClose={() => setCategoryModal(null)}
          onSave={({ read, write }) => {
            const line = categoryModal.line;
            setLineCategoryConfigs((prev) => ({
              ...prev,
              [line]: {
                ...prev[line],
                reportsRead: read ? [...read] : null,
                reportsWrite: write ? [...write] : null,
              },
            }));
            setCategoryModal(null);
          }}
        />
      )}
      <AppCard bodyClassName={uiCx(uiSpacing.cardPadding, 'min-w-0')}>
        <AppSectionHeader
          title="Permissions"
          description={permissionsDescription}
          icon={<Shield className="h-4 w-4" />}
          iconClassName="bg-amber-100 text-amber-800"
          {...appSectionPresetProps('description')}
        />

        <AppCard
          className="mt-4 border-amber-200 bg-amber-50/80"
          bodyClassName={uiCx(uiSpacing.cardPadding, 'min-w-0')}
        >
          <PermissionToggleLabel
            label={
              <span className="flex flex-wrap items-center gap-2">
                Administrator access
                <AppBadge variant="warning">System role</AppBadge>
              </span>
            }
            checked={isAdminLocal}
            disabled={!canEdit || !user}
            onToggle={canEdit && user ? () => setIsAdminLocal(!isAdminLocal) : undefined}
          />
          <p className={uiCx(uiTypography.helper, 'mt-2 text-amber-900')}>
            <strong>Warning:</strong> This user will have access to all areas of the system and can delete sensitive
            information. Only grant this to trusted users.
          </p>
          {isAdminLocal ? (
            <p className={uiCx(uiTypography.helper, 'mt-2 font-medium text-amber-800')}>
              When admin is enabled, all permission checks are bypassed. Individual permissions below are ignored.
            </p>
          ) : null}
        </AppCard>

        {canEdit ? (
          <AppCard className="mt-4" bodyClassName={uiCx(uiSpacing.cardPadding, 'min-w-0')}>
            <AppSectionHeader
              title="Permission template"
              description="Select a template and apply to prefill permissions — merge adds to current settings, replace overwrites them."
            />
            <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
              <AppSelect
                className="min-w-0"
                label="Template"
                placeholder="Select template…"
                value={selectedTemplateId}
                onChange={(e) => setSelectedTemplateId(e.target.value)}
                options={(permissionTemplates as { id: string; name: string }[]).map((t) => ({
                  value: t.id,
                  label: t.name,
                }))}
                fieldHint={USER_PERMISSIONS_FIELD_HINTS.template}
              />
              <AppButton
                type="button"
                variant="secondary"
                size="sm"
                className="w-full sm:w-auto"
                onClick={() => {
                  if (!selectedTemplateId) {
                    toast.error('Select a template first');
                    return;
                  }
                  setShowApplyTemplateModal(true);
                }}
              >
                Apply template
              </AppButton>
            </div>
          </AppCard>
        ) : null}

        <AppModal
          open={showApplyTemplateModal}
          onClose={() => setShowApplyTemplateModal(false)}
          size="sm"
          title="Apply permission template"
          description={
            <>
              How do you want to apply the template? <strong>Merge</strong> adds the template&apos;s permissions to the current ones.{' '}
              <strong>Replace</strong> clears current permissions and sets only those in the template.
            </>
          }
          footer={
            <div className={uiCx(uiLayout.actionsRow, 'w-full flex-wrap justify-end')}>
              <AppButton type="button" variant="secondary" size="sm" onClick={() => setShowApplyTemplateModal(false)}>
                Cancel
              </AppButton>
              <AppButton type="button" variant="secondary" size="sm" onClick={applyTemplateMerge}>
                Merge
              </AppButton>
              <AppButton type="button" size="sm" onClick={applyTemplateReplace}>
                Replace
              </AppButton>
            </div>
          }
        >
          <span className="sr-only">Choose merge or replace.</span>
        </AppModal>

        <div className="mt-4 space-y-4">
          {(() => {
            // Process categories and reorganize them to match sidebar language:
            // Production (Sales), Repairs & Maintenance, Business, Quotations.
            const processedCategories: any[] = [];
            let businessCategory: any = null;
            let inventoryCategory: any = null;
            let quotationsCategory: any = null;
            permissionsData.permissions_by_category?.forEach((cat: any) => {
              if (cat.category.name === 'business') {
                const constructionPerms = cat.permissions.filter((p: any) => isConstructionProjectPermissionKey(p.key));
                const repairsPerms = cat.permissions.filter((p: any) => isRepairsProjectPermissionKey(p.key));
                const hasCustomers = cat.permissions.some((p: any) => p.key.includes('business:customers'));

                if (constructionPerms.length > 0) {
                  processedCategories.push({
                    ...cat,
                    category: {
                      ...cat.category,
                      name: 'construction',
                      label: 'Production (Sales)',
                      id: 'construction',
                    },
                    permissions: constructionPerms,
                  });
                }

                if (repairsPerms.length > 0) {
                  processedCategories.push({
                    ...cat,
                    category: {
                      ...cat.category,
                      name: 'repairs_maintenance',
                      label: 'Repairs & Maintenance',
                      id: 'repairs_maintenance',
                    },
                    permissions: repairsPerms,
                  });
                }

                if (hasCustomers) {
                  businessCategory = {
                    ...cat,
                    permissions: cat.permissions.filter((p: any) => p.key.includes('business:customers')),
                  };
                }
              } else if (cat.category.name === 'inventory') {
                inventoryCategory = cat;
              } else if (cat.category.name === 'sales') {
                quotationsCategory = cat;
              } else if (cat.category.name === 'fleet') {
                const fleetOnlyPerms = filterFleetAreaPermissions(cat.permissions);
                if (fleetOnlyPerms.length > 0) {
                  processedCategories.push({
                    ...cat,
                    category: {
                      ...cat.category,
                      name: 'fleet',
                      label: 'Fleet',
                      id: 'fleet',
                      description: 'Fleet dashboard, assets, work orders, and inspections.',
                    },
                    permissions: fleetOnlyPerms,
                  });
                }
              } else if (cat.category.name === 'company_assets') {
                processedCategories.push({
                  ...cat,
                  category: {
                    ...cat.category,
                    name: 'company_assets',
                    label: 'Company Assets',
                    id: 'company_assets',
                    description: 'Equipment and corporate cards.',
                  },
                  permissions: filterCompanyAssetsAreaPermissions(cat.permissions),
                });
              } else if (cat.category.name === 'documents') {
                processedCategories.push({
                  ...cat,
                  category: {
                    ...cat.category,
                    name: 'documents',
                    label: 'Company Files',
                    id: 'documents',
                    description: 'Company files library — view, upload, move, and delete.',
                  },
                  permissions: filterDocumentsAreaPermissions(cat.permissions),
                });
              } else if (cat.category.name === 'training') {
                processedCategories.push({
                  ...cat,
                  category: {
                    ...cat.category,
                    label: 'Training & Learning',
                    description: 'Organization training dashboard and LMS administration.',
                  },
                  permissions: filterTrainingAreaPermissions(cat.permissions),
                });
              } else if (cat.category.name === 'work_orders' || cat.category.name === 'inspections') {
                // Legacy categories — superseded by fleet:* keys in UI
              } else {
                processedCategories.push(cat);
              }
            });

            if (businessCategory || inventoryCategory) {
              const combinedPermissions = [
                ...(businessCategory?.permissions || []),
                ...(inventoryCategory?.permissions || []),
              ].filter((p: any) => p.key !== 'business:access' && !isHiddenPermissionKey(p.key));
              if (combinedPermissions.length > 0) {
                processedCategories.push({
                  category: {
                    id: 'business',
                    name: 'business',
                    label: 'Business',
                    description:
                      inventoryCategory?.category?.description ||
                      'Customers, suppliers, and products permissions.',
                  },
                  permissions: combinedPermissions,
                });
              }
            }

            processedCategories.push({
              category: {
                id: 'quotations',
                name: 'quotations',
                label: 'Quotations',
                description:
                  quotationsCategory?.category?.description ||
                  'Permissions for Quotations area. Blocking access blocks all sub-permissions.',
              },
              permissions: quotationsCategory?.permissions || [],
            });

            const orderedPrimaryNames = ['construction', 'repairs_maintenance', 'business', 'quotations'];
            const primaryCategories = orderedPrimaryNames
              .map((name) => processedCategories.find((c: any) => c.category?.name === name))
              .filter(Boolean);
            const remainingCategories = processedCategories.filter(
              (c: any) => !orderedPrimaryNames.includes(c.category?.name)
            );
            const finalCategories = [...primaryCategories, ...remainingCategories];

            return finalCategories.map((cat: any) => {
              // Area access checkbox (deprecated for business:access — granular perms only)
              const areaAccessPerm = cat.permissions.find(
                (p: any) =>
                  p.key.endsWith(':access') &&
                  p.key !== 'business:access' &&
                  !isHiddenPermissionKey(p.key)
              );
              const subPermissions = cat.permissions.filter(
                (p: any) =>
                  p.key !== 'business:access' &&
                  !p.key.endsWith(':access') &&
                  !isHiddenPermissionKey(p.key)
              );
              const hasAreaAccess = areaAccessPerm && permissions[areaAccessPerm.key];
              const categoryId = cat.category.id;
              const isExpanded = expandedCategories.has(categoryId);
              
              const toggleExpand = () => {
                setExpandedCategories(prev => {
                  const next = new Set(prev);
                  if (next.has(categoryId)) {
                    next.delete(categoryId);
                  } else {
                    next.add(categoryId);
                  }
                  return next;
                });
              };
              
              return (
                <div key={cat.category.id} className={uiCx('mt-4 overflow-hidden rounded-lg border', uiBorders.subtle)}>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 p-3 text-left transition-colors hover:bg-gray-50"
                    onClick={toggleExpand}
                  >
                    <ChevronRight
                      className={uiCx('h-4 w-4 shrink-0 text-gray-500 transition-transform', isExpanded && 'rotate-90')}
                      aria-hidden
                    />
                    <div className="flex-1">
                      <h4 className={uiTypography.sectionTitle}>{cat.category.label}</h4>
                      {cat.category.description ? (
                        <p className={uiTypography.sectionSubtitle}>{cat.category.description}</p>
                      ) : null}
                    </div>
                  </button>
                
                {isExpanded && subPermissions.length > 0 && (
                  <div className={uiCx('border-t bg-gray-50/40 px-4 pb-4 pt-3', uiBorders.subtle)}>
                    {/* Special handling for HR category - group by area (users, attendance, community, etc.) */}
                    {cat.category.name === 'human_resources' ? (
                      <HrPermissionsPanel
                        areaPerms={subPermissions}
                        permissions={permissions}
                        canEdit={canEdit}
                        onAccessLevelChange={handleHrAccessLevel}
                        onWriteOnlyChange={handleHrWriteOnlyLevel}
                      />
                    ) : cat.category.name === 'training' ? (
                      <TrainingPermissionsPanel
                        areaPerms={subPermissions}
                        permissions={permissions}
                        canEdit={canEdit}
                        onAccessLevelChange={handleTrainingAccessLevel}
                      />
                    ) : cat.category.name === 'repairs_maintenance' ? (
                      <div className="space-y-4">
                        {(() => {
                          const areaPerms = subPermissions.filter((p: any) =>
                            p.key.startsWith('business:rm:projects')
                          );
                          if (areaPerms.length === 0) return null;
                          return (
                            <ProjectLinePermissionsGrid
                              line="repairs"
                              areaPerms={areaPerms}
                              permissions={permissions}
                              canEdit={canEdit}
                              onAccessLevelChange={(row, level) =>
                                handleProjectLineAccessLevel('repairs', areaPerms, row, level)
                              }
                              onConfigureProjectFiles={openProjectFilesCategoriesModal}
                              onConfigureProjectReports={openProjectReportsCategoriesModal}
                            />
                          );
                        })()}
                      </div>
                    ) : cat.category.name === 'business' ? (
                      /* Special handling for Business category - Customers, Suppliers and Products */
                      <div className="space-y-4">
                        {areaAccessPerm && (
                          <PermissionToggleLabel
                            label={areaAccessPerm.label}
                            description={areaAccessPerm.description}
                            checked={!!permissions[areaAccessPerm.key]}
                            disabled={!canEdit}
                            onToggle={() => handleToggle(areaAccessPerm.key)}
                          />
                        )}
                        {/* Customers */}
                        {(() => {
                          const areaPerms = subPermissions.filter((p: any) =>
                            p.key.startsWith('business:customers:')
                          );
                          return (
                            <CustomerPermissionsGrid
                              areaPerms={areaPerms}
                              permissions={permissions}
                              canEdit={canEdit}
                              onAccessLevelChange={handleCustomerAccessLevel}
                            />
                          );
                        })()}

                        {(() => {
                          const areaPerms = subPermissions.filter((p: any) =>
                            p.key.startsWith('inventory:suppliers:')
                          );
                          if (areaPerms.length === 0) return null;
                          return (
                            <SupplierPermissionsGrid
                              areaPerms={areaPerms}
                              permissions={permissions}
                              canEdit={canEdit}
                              onAccessLevelChange={handleSupplierAccessLevel}
                            />
                          );
                        })()}

                        {(() => {
                          const areaPerms = subPermissions.filter((p: any) =>
                            p.key.startsWith('inventory:products:')
                          );
                          if (areaPerms.length === 0) return null;
                          return (
                            <ProductPermissionsGrid
                              areaPerms={areaPerms}
                              permissions={permissions}
                              canEdit={canEdit}
                              onAccessLevelChange={handleProductAccessLevel}
                            />
                          );
                        })()}
                      </div>
                    ) : cat.category.name === 'fleet' ? (
                      <FleetPermissionsPanel
                        areaPerms={subPermissions}
                        permissions={permissions}
                        canEdit={canEdit}
                        onAccessLevelChange={handleFleetAccessLevel}
                        onAssignChange={handleFleetAssignLevel}
                      />
                    ) : cat.category.name === 'company_assets' ? (
                      <CompanyAssetsPermissionsPanel
                        areaPerms={subPermissions}
                        permissions={permissions}
                        canEdit={canEdit}
                        onAccessLevelChange={handleCompanyAssetsAccessLevel}
                      />
                    ) : cat.category.name === 'documents' ? (
                      <DocumentsPermissionsPanel
                        areaPerms={subPermissions}
                        permissions={permissions}
                        canEdit={canEdit}
                        onAccessLevelChange={handleDocumentsAccessLevel}
                        onConfigureCategories={
                          canEdit ? () => setShowCompanyFilesCategoriesModal(true) : undefined
                        }
                      />
                    ) : cat.category.name === 'construction' ? (
                      <div className="space-y-4">
                        {(() => {
                          const areaPerms = subPermissions.filter((p: any) =>
                            p.key.startsWith('business:construction:projects')
                          );
                          if (areaPerms.length === 0) return null;
                          return (
                            <ProjectLinePermissionsGrid
                              line="construction"
                              areaPerms={areaPerms}
                              permissions={permissions}
                              canEdit={canEdit}
                              onAccessLevelChange={(row, level) =>
                                handleProjectLineAccessLevel('construction', areaPerms, row, level)
                              }
                              onConfigureProjectFiles={openProjectFilesCategoriesModal}
                              onConfigureProjectReports={openProjectReportsCategoriesModal}
                            />
                          );
                        })()}
                      </div>
                    ) : cat.category.name === 'quotations' ? (
                      /* Special handling for Quotations category */
                      <div className="space-y-4">
                        {['quotations'].map((area: string) => {
                          const areaPerms = subPermissions.filter((p: any) => p.key.includes(`sales:${area}`));
                          if (areaPerms.length === 0) return null;
                          
                          const areaLabel = area.charAt(0).toUpperCase() + area.slice(1);
                          const viewPerms = areaPerms.filter((p: any) => p.key.includes(':read'));
                          const editPerms = areaPerms.filter((p: any) => p.key.includes(':write'));
                          
                          return (
                            <div key={area} className="rounded-lg bg-gray-50/80 p-2.5">
                              <div className={uiCx(permissionUi.subgroupTitle, 'mb-2')}>{areaLabel}</div>
                              <div className="grid md:grid-cols-2 gap-2.5">
                                {/* View Permissions Column */}
                                {viewPerms.length > 0 && (
                                  <div className="space-y-1.5">
                                    <PermissionColumnTitle>View</PermissionColumnTitle>
                                    {viewPerms.map((perm: any) => (
                                        <PermissionCheckboxItem
                                          key={perm.id}
                                          perm={perm}
                                          checked={!!permissions[perm.key]}
                                          disabled={!canEdit}
                                          onToggle={() => handleToggle(perm.key)}
                                        />
                                    ))}
                                  </div>
                                )}
                                {/* Edit Permissions Column */}
                                {editPerms.length > 0 && (
                                  <div className="space-y-1.5">
                                    <PermissionColumnTitle>Edit</PermissionColumnTitle>
                                    {editPerms.map((perm: any) => {
                                      const canEnableEdit = canEdit && canEnableEditPermission(perm.key, permissions);
                                      return (
                                        <PermissionCheckboxItem
                                          key={perm.id}
                                          perm={perm}
                                          checked={!!permissions[perm.key]}
                                          disabled={!canEnableEdit}
                                          onToggle={() => handleToggle(perm.key)}
                                        />
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      /* Default layout for other categories */
                      <div className="space-y-1.5">
                        {subPermissions.map((perm: any) => {
                          const isEditPermission = perm.key.startsWith('hr:users:edit:') || perm.key === 'hr:users:write';
                          const canEnable = canEdit && (!isEditPermission || canEnableEditPermission(perm.key, permissions));
                          return (
                          <PermissionCheckboxItem
                            key={perm.id}
                            perm={perm}
                            checked={!!permissions[perm.key]}
                            disabled={!canEnable}
                            onToggle={() => handleToggle(perm.key)}
                          />
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
              );
            });
            
            return processedCategories;
          })()}
        </div>
        
        {!canEdit && (
          <AppCard
            className="mt-6"
            bodyClassName={uiCx(uiSpacing.cardPadding, 'text-center')}
          >
            <p className={uiTypography.helper}>
              You have view-only access. You need edit permissions to modify user permissions.
            </p>
          </AppCard>
        )}

        {inlineSave && canEdit ? (
          <div className={uiCx(uiLayout.actionsRow, 'mt-6 justify-end')}>
            <AppButton type="button" disabled={saving} onClick={() => void handleSave()}>
              {saving ? 'Saving…' : 'Save permissions'}
            </AppButton>
          </div>
        ) : null}
      </AppCard>
    </div>
  );
});

UserPermissionsSection.displayName = 'UserPermissionsSection';

export default UserPermissionsSection;
