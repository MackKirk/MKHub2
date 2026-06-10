import { useEffect, useMemo, useRef, useState, useImperativeHandle, forwardRef, useCallback, type ReactNode } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, withFileAccessToken } from '@/lib/api';
import { mapEmployeeToAppUserSelect } from '@/lib/clientUi';
import { sortByLabel } from '@/lib/sortOptions';
import { formatDateLocal, getCurrentMonthLocal } from '@/lib/dateUtils';
import toast from 'react-hot-toast';
import GeoSelect from '@/components/GeoSelect';
import { useConfirm } from '@/components/ConfirmProvider';
import NationalitySelect from '@/components/NationalitySelect';
import AddressAutocomplete from '@/components/AddressAutocomplete';
import ClothSizeSelect from '@/components/ClothSizeSelect';
import { useUnsavedChangesGuard } from '@/hooks/useUnsavedChangesGuard';
import UserLoans from '@/components/UserLoans';
import UserReports from '@/components/UserReports';
import { DivisionIcon } from '@/components/DivisionIcon';
import { CanadianDriversLicenseSection } from '@/components/CanadianDriversLicenseSection';
import UserEmployeeReviewsTab from '@/components/UserEmployeeReviewsTab';
import ProjectFilesCategoriesModal from '@/components/ProjectFilesCategoriesModal';
import ProjectReportCategoriesModal from '@/components/ProjectReportCategoriesModal';
import { CustomerPermissionsGrid } from '@/components/CustomerPermissionsGrid';
import { ProjectLinePermissionsGrid } from '@/components/ProjectLinePermissionsGrid';
import {
  applyCustomerAccessLevel,
  type CustomerAccessLevel,
} from '@/lib/customerPermissions';
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
  AppBadge,
  AppButton,
  AppCard,
  AppCheckbox,
  AppControlLabelRow,
  AppDatePicker,
  AppEmptyState,
  AppFieldHint,
  AppFileUpload,
  AppFormModal,
  AppHeroEditButton,
  AppInput,
  AppMultiSelect,
  AppListCreateItem,
  AppListRowIconButton,
  AppModal,
  AppPageHeader,
  AppReadOnlyField,
  AppSectionHeader,
  AppSelect,
  AppSortableEntityList,
  AppSortableEntityListFlatBody,
  AppSortableEntityListHeader,
  AppSortableEntityListRow,
  AppSortableEntityListSortColumn,
  AppTabs,
  AppTextarea,
  AppUserSelect,
  type AppSectionPresetKey,
  AppTimePicker,
  FORM_MODAL_COMFORTABLE_DIALOG_COLLAPSED,
  FORM_MODAL_WIDE_DIALOG_COLLAPSED,
  FORM_MODAL_WIDE_DIALOG_EXPANDED,
  appSectionPresetProps,
  resolveAppSortableListPreset,
  sortListByAppColumn,
  uiBorders,
  uiColors,
  uiCx,
  uiLayout,
  uiRadius,
  uiShadows,
  uiSpacing,
  uiTypography,
  useLocalAppListSort,
} from '@/components/ui';
import { ChevronDown, RefreshCw, User as UserIcon } from 'lucide-react';
import {
  employeeTrainingRecordQuickInfo,
  userAddressQuickInfo,
  userBasicInfoQuickInfo,
  userContactQuickInfo,
  userEducationQuickInfo,
  userEmergencyContactsQuickInfo,
  userLegalDocumentsQuickInfo,
  userOrganizationQuickInfo,
  userSalaryQuickInfo,
} from '@/lib/formModalQuickInfo';
import { userProfileFieldHint } from '@/lib/userProfileFieldHints';
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

const USER_TAB_LABELS: Record<string, string> = {
  personal: 'Personal',
  job: 'Job',
  docs: 'Docs',
  timesheet: 'Timesheet',
  loans: 'Loans',
  training: 'Training',
  assets: 'Assets',
  reports: 'Reports',
  reviews: 'Reviews',
  permissions: 'Permissions',
  activity: 'Activity',
};

function UserAccountStatusBadge({
  isActive,
  saving,
  interactive,
  onClick,
  className,
}: {
  isActive?: boolean;
  saving?: boolean;
  interactive?: boolean;
  onClick?: () => void;
  className?: string;
}) {
  const active = isActive !== false;
  const label = saving ? 'Saving…' : active ? 'Active' : 'Inactive';
  const badge = (
    <AppBadge variant={active ? 'success' : 'danger'} className={uiCx('normal-case !tracking-normal', className)}>
      {label}
    </AppBadge>
  );
  if (interactive && onClick) {
    return (
      <button
        type="button"
        disabled={saving}
        onClick={onClick}
        title="Change account status"
        className="rounded-full border border-transparent transition-shadow hover:ring-2 hover:ring-offset-1 hover:ring-brand-red/40 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {badge}
      </button>
    );
  }
  return badge;
}

function UserInfoHeroField({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <span className={uiTypography.overline}>{label}</span>
      <div className={uiCx(uiTypography.sectionTitle, 'mt-0.5 text-xs')}>{value}</div>
    </div>
  );
}

function UserInfoReadOnlyField({ label, value }: { label: string; value: ReactNode }) {
  return <AppReadOnlyField label={label} value={value} />;
}

function UserInfoSectionCard({
  preset,
  title,
  description,
  editTitle,
  showEdit,
  onEditClick,
  children,
  className,
  bodyClassName,
}: {
  preset: AppSectionPresetKey;
  title: string;
  description?: string;
  editTitle?: string;
  showEdit?: boolean;
  onEditClick?: () => void;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <AppCard className={className} bodyClassName={uiCx(uiSpacing.cardPadding, bodyClassName)}>
      <AppSectionHeader
        title={title}
        description={description}
        {...appSectionPresetProps(preset)}
        action={
          showEdit && onEditClick ? (
            <AppHeroEditButton onClick={onEditClick} title={editTitle || `Edit ${title}`} />
          ) : null
        }
      />
      <div className={uiCx('mt-4', uiSpacing.sectionStack)}>{children}</div>
    </AppCard>
  );
}

function SyncBambooHRButton({ userId, onSuccess }: { userId: string; onSuccess?: () => void }) {
  const [syncing, setSyncing] = useState(false);
  const queryClient = useQueryClient();
  
  const handleSync = async () => {
    if (syncing) return;
    
    setSyncing(true);
    try {
      // force_update=true means we want to overwrite manually edited fields
      // This is the expected behavior when user clicks "Sync from BambooHR"
      const result = await api<any>('POST', `/employees/${userId}/sync-bamboohr`, {
        force_update: true
      });
      toast.success(result.message || 'User synced successfully from BambooHR');
      // Refresh the user profile data
      queryClient.invalidateQueries({ queryKey: ['userProfile', userId] });
      if (onSuccess) {
        onSuccess();
      }
    } catch (error: any) {
      toast.error(error?.message || 'Failed to sync from BambooHR');
    } finally {
      setSyncing(false);
    }
  };
  
  return (
    <AppButton
      type="button"
      variant="secondary"
      size="sm"
      onClick={handleSync}
      disabled={syncing}
      loading={syncing}
      leftIcon={<RefreshCw className="h-4 w-4" />}
      title="Sync user data from BambooHR"
    >
      {syncing ? 'Syncing...' : 'Sync from BambooHR'}
    </AppButton>
  );
}

function SyncPhotoButton({ userId, onSuccess }: { userId: string; onSuccess?: () => void }) {
  const [syncing, setSyncing] = useState(false);
  const queryClient = useQueryClient();
  const handleSync = async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      await api<any>('POST', `/employees/${userId}/sync-photo`);
      toast.success('Photo synced from BambooHR');
      queryClient.invalidateQueries({ queryKey: ['userProfile', userId] });
      if (onSuccess) onSuccess();
    } catch (error: any) {
      toast.error(error?.message || 'Failed to sync photo');
    } finally {
      setSyncing(false);
    }
  };
  return (
    <AppButton
      type="button"
      variant="secondary"
      size="sm"
      onClick={handleSync}
      disabled={syncing}
      loading={syncing}
      title="Sync profile photo from BambooHR"
    >
      {syncing ? 'Syncing...' : 'Sincronizar foto'}
    </AppButton>
  );
}

function SyncDocumentsButton({ userId, onSuccess }: { userId: string; onSuccess?: () => void }) {
  const [syncing, setSyncing] = useState(false);
  const queryClient = useQueryClient();
  const handleSync = async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      const result = await api<{ created?: number; skipped?: number }>('POST', `/employees/${userId}/sync-documents`);
      const created = result.created ?? 0;
      const skipped = result.skipped ?? 0;
      toast.success(`${created} document(s) created, ${skipped} already existed`);
      queryClient.invalidateQueries({ queryKey: ['userProfile', userId] });
      queryClient.invalidateQueries({ queryKey: ['user-docs', userId] });
      if (onSuccess) onSuccess();
    } catch (error: any) {
      toast.error(error?.message || 'Failed to sync documents');
    } finally {
      setSyncing(false);
    }
  };
  return (
    <AppButton
      type="button"
      variant="secondary"
      size="sm"
      onClick={handleSync}
      disabled={syncing}
      loading={syncing}
      title="Sync documents from BambooHR"
    >
      {syncing ? 'Syncing...' : 'Sincronizar documentos'}
    </AppButton>
  );
}

function BambooFilesLastSyncRow({
  userId,
  lastSyncIso,
  isAdmin,
}: {
  userId: string;
  lastSyncIso: string | null | undefined;
  isAdmin: boolean;
}) {
  const [saving, setSaving] = useState(false);
  const queryClient = useQueryClient();
  const display = (() => {
    if (!lastSyncIso) return '—';
    const ymd = String(lastSyncIso).slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
      const [y, m, d] = ymd.split('-').map(Number);
      return new Date(y, m - 1, d).toLocaleDateString(undefined, { dateStyle: 'medium' });
    }
    try {
      return new Date(lastSyncIso).toLocaleDateString(undefined, { dateStyle: 'medium' });
    } catch {
      return '—';
    }
  })();
  const saveToday = async () => {
    if (saving || !isAdmin) return;
    const d = new Date();
    const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    setSaving(true);
    try {
      await api('PUT', `/auth/users/${encodeURIComponent(userId)}/profile`, { bamboo_files_last_sync_at: ymd });
      toast.success('Last Update Sync saved');
      await queryClient.invalidateQueries({ queryKey: ['userProfile', userId] });
    } catch (e: any) {
      toast.error(e?.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="w-full mt-3 pt-3 border-t border-gray-100 flex flex-wrap items-center gap-3">
      <div className="text-xs text-gray-600">
        <span className="font-semibold text-gray-800">Last Update Sync (Bamboo files): </span>
        <span className="text-gray-900">{display}</span>
      </div>
      {isAdmin && (
        <button
          type="button"
          onClick={saveToday}
          disabled={saving}
          className="px-3 py-1.5 rounded-lg bg-white hover:bg-gray-50 text-gray-800 border border-gray-300 text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? 'Saving…' : "Save today's date"}
        </button>
      )}
    </div>
  );
}

export type UserPermissionsRef = {
  hasUnsavedChanges: () => boolean;
  save: () => Promise<void>;
};

const UserPermissions = forwardRef<UserPermissionsRef, { userId: string; onDirtyChange?: (dirty: boolean) => void; canEdit?: boolean }>(({ userId, onDirtyChange, canEdit = true }, ref) => {
  const queryClient = useQueryClient();
  const { data:user, refetch: refetchUser } = useQuery({ queryKey:['user', userId], queryFn: ()=> api<any>('GET', `/users/${userId}`) });
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
    setPermissions(perms);
    setInitialPermissions({ ...perms });

    const cfg = permissionsData?.configs || {};
    const nextConfigs: LineCategoryConfigs = {
      construction: resolveCategoryConfigFromApi(cfg, 'construction'),
      repairs: resolveCategoryConfigFromApi(cfg, 'repairs'),
    };
    setLineCategoryConfigs(nextConfigs);
    setInitialLineCategoryConfigs(cloneLineCategoryConfigs(nextConfigs));
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

    return false;
  }, [
    permissions,
    initialPermissions,
    isAdminLocal,
    initialIsAdmin,
    lineCategoryConfigs,
    initialLineCategoryConfigs,
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
      if (key === 'hr:users:view:general' || key === 'hr:users:view:timesheet' || key === 'hr:users:view:permissions' || key === 'hr:users:view:activity') {
        // Requires hr:users:read
        if (newValue && !prev['hr:users:read']) {
          toast.error('This permission requires "View Users List" to be enabled first');
          return prev;
        }
      }
      // Check dependencies for job compensation view permission
      else if (key === 'hr:users:view:job:compensation') {
        // Requires hr:users:read and hr:users:view:general
        if (newValue && (!prev['hr:users:read'] || !prev['hr:users:view:general'])) {
          toast.error('This permission requires "View Users List" and "View General Tab" to be enabled first');
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
        // Requires hr:users:read and hr:users:view:general
        if (newValue && (!prev['hr:users:read'] || !prev['hr:users:view:general'])) {
          toast.error('This permission requires "View Users List" and "View General Tab" to be enabled first');
          return prev;
        }
      } else if (key === 'hr:users:edit:timesheet') {
        // Requires hr:users:read and hr:users:view:timesheet
        if (newValue && (!prev['hr:users:read'] || !prev['hr:users:view:timesheet'])) {
          toast.error('This permission requires "View Users List" and "View Timesheet Tab" to be enabled first');
          return prev;
        }
      } else if (key === 'hr:users:edit:permissions') {
        // Requires hr:users:read and hr:users:view:permissions
        if (newValue && (!prev['hr:users:read'] || !prev['hr:users:view:permissions'])) {
          toast.error('This permission requires "View Users List" and "View Permissions Tab" to be enabled first');
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
                           viewKey.includes(':estimate:') ? 'View Estimate' :
                           viewKey.includes(':orders:') ? 'View Orders' :
                           viewKey.includes(':safety:') ? 'View Safety' : 'corresponding View permission';
          toast.error(`This permission requires "${viewLabel}" to be enabled first`);
          return prev;
        }
      }
      
      newPerms[key] = newValue;

      // Fleet & Equipment: enabling any fleet sub-permission turns on area access (matches UserDetail / backend hierarchy)
      if (newValue && key.startsWith('fleet:') && key !== 'fleet:access') {
        newPerms['fleet:access'] = true;
      }
      
      // If disabling a view permission, also disable the corresponding edit permission
      if (!newValue) {
        if (key === 'fleet:access') {
          Object.keys(newPerms).forEach((k) => {
            if (k.startsWith('fleet:') && k !== 'fleet:access') {
              newPerms[k] = false;
            }
          });
        } else if (key === 'fleet:vehicles:read') {
          newPerms['fleet:vehicles:write'] = false;
        } else if (key === 'fleet:equipment:read') {
          newPerms['fleet:equipment:write'] = false;
        } else if (key === 'hr:users:view:general') {
          newPerms['hr:users:edit:general'] = false;
        } else if (key === 'hr:users:view:timesheet') {
          newPerms['hr:users:edit:timesheet'] = false;
        } else if (key === 'hr:users:view:permissions') {
          newPerms['hr:users:edit:permissions'] = false;
        } else if (key === 'hr:users:view:general') {
          // If disabling View General Tab, also disable job compensation view
          newPerms['hr:users:view:job:compensation'] = false;
        } else if (key === 'hr:users:read') {
          // If disabling View Users List, disable all view, edit permissions and invite user
          newPerms['hr:users:write'] = false;
          newPerms['hr:users:view:general'] = false;
          newPerms['hr:users:view:job:compensation'] = false;
          newPerms['hr:users:view:timesheet'] = false;
          newPerms['hr:users:view:permissions'] = false;
          newPerms['hr:users:view:activity'] = false;
          newPerms['hr:users:edit:general'] = false;
          newPerms['hr:users:edit:timesheet'] = false;
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
          newPerms['business:projects:estimate:write'] = false;
          newPerms['business:projects:orders:write'] = false;
          newPerms['business:projects:safety:write'] = false;
        }
        // If disabling a view sub-permission, also disable the corresponding edit permission
        else if (key.startsWith('business:projects:') && key.endsWith(':read') && key !== 'business:projects:read') {
          const editKey = key.replace(':read', ':write');
          newPerms[editKey] = false;
        }
        return applyPermissionUncheckCascade(key, newPerms);
      }
      
      return newPerms;
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
    setPermissions((prev) => ({
      ...prev,
      ...Object.fromEntries((template.permission_keys || []).map((k) => [k, true])),
    }));
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
    setPermissions(next);
    toast.success(`Applied template "${template.name}" (replace)`);
    setShowApplyTemplateModal(false);
  }, [selectedTemplateId, permissionTemplates, permissionsData]);

  const handleSave = useCallback(async () => {
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
      clearLegacyProjectSubPermissions(payload);
      clearLegacyCategoryConfigKeys(payload);
      await api('PUT', `/permissions/users/${userId}`, payload);
      toast.success('Permissions saved');
      await refetch();
      
      // Update initial state to reflect saved state
      setInitialPermissions({ ...permissions });
      setInitialIsAdmin(isAdminLocal);
      setInitialLineCategoryConfigs(cloneLineCategoryConfigs(lineCategoryConfigs));
      
      // If editing own permissions, invalidate /auth/me cache to refresh permissions
      if (currentUser && currentUser.id === userId) {
        await queryClient.invalidateQueries({ queryKey: ['me'] });
        await queryClient.invalidateQueries({ queryKey: ['project-files-category-perms'] });
        await queryClient.invalidateQueries({ queryKey: ['project-reports-category-perms'] });
      }
    } catch (e: any) {
      toast.error(e?.detail || 'Failed to save permissions');
      throw e;
    }
  }, [
    user,
    isAdminLocal,
    userId,
    permissions,
    lineCategoryConfigs,
    currentUser,
    queryClient,
    refetchUser,
    refetch,
  ]);

  // Expose methods to parent via ref
  useImperativeHandle(ref, () => ({
    hasUnsavedChanges: () => hasUnsavedChanges,
    save: handleSave,
  }), [hasUnsavedChanges, handleSave]);


  if (!permissionsData) {
    return <div className="h-24 bg-gray-100 animate-pulse rounded" />;
  }

  return (
    <div className="space-y-6 pb-24">
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
      <div className="rounded-xl border bg-white p-4">
        {/* Header */}
        <div className="mb-4 flex items-center gap-2">
          <div className="w-8 h-8 rounded bg-amber-100 flex items-center justify-center">
            <svg className="w-5 h-5 text-amber-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <div className="flex-1">
            <h5 className="text-sm font-semibold text-amber-900">User Permissions</h5>
            <p className="text-xs text-gray-600 mt-0.5">
              {canEdit 
                ? "Manage granular permissions for this user. Permissions from roles are combined with these overrides. Permissions marked with [WIP] are not yet implemented in the system."
                : "View permissions assigned to this user. You have view-only access and cannot modify permissions."
              }
            </p>
          </div>
        </div>

        {/* Admin Access Section */}
        <div className="mb-6 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
          {canEdit ? (
            <label className="inline-flex items-start gap-2 cursor-pointer">
              <input 
                id="admin-checkbox"
                type="checkbox" 
                checked={isAdminLocal}
                disabled={!user}
                onChange={e=>{ 
                  setIsAdminLocal(e.target.checked);
                }} 
                className="mt-0.5 w-3.5 h-3.5 rounded border-gray-300 text-brand-red focus:ring-brand-red disabled:opacity-50 disabled:cursor-not-allowed"
              />
            <div className="flex-1">
              <div className="text-xs font-semibold text-yellow-900 flex items-center gap-2">
                Administrator Access
                <span className="text-[10px] px-1 py-0.5 bg-yellow-100 text-yellow-800 rounded border border-yellow-300">
                  System Role
                </span>
              </div>
              <div className="text-[10px] text-yellow-800 mt-1">
                ⚠️ <strong>Warning:</strong> This user will have access to all areas of the system and will be able to delete sensitive information. Only grant this to trusted users.
              </div>
              {isAdminLocal && (
                <div className="text-[10px] text-yellow-700 mt-2 font-medium">
                  ⚠️ When admin is enabled, all permission checks are bypassed. Individual permissions below are ignored.
                </div>
              )}
            </div>
          </label>
          ) : (
            <div className="inline-flex items-start gap-2">
              <input 
                id="admin-checkbox"
                type="checkbox" 
                checked={isAdminLocal}
                disabled
                className="mt-0.5 w-3.5 h-3.5 rounded border-gray-300 text-brand-red opacity-50"
              />
              <div className="flex-1">
                <div className="text-xs font-semibold text-yellow-900 flex items-center gap-2">
                  Administrator Access
                  <span className="text-[10px] px-1 py-0.5 bg-yellow-100 text-yellow-800 rounded border border-yellow-300">
                    System Role
                  </span>
                </div>
                <div className="text-[10px] text-yellow-800 mt-1">
                  Status: {isAdminLocal ? 'Enabled' : 'Disabled'}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Permission Template: select template then apply with Merge or Replace confirmation */}
        {canEdit && (
          <div className="mb-6 p-3 border rounded-lg bg-gray-50">
            <div className="text-sm font-medium text-gray-700 mb-2">Permission Template</div>
            <p className="text-xs text-gray-600 mb-3">
              Select a template and click Apply to prefill permissions. You will choose whether to merge (add to current) or replace (replace all with template).
            </p>
            <div className={uiCx(uiLayout.actionsRow, 'flex-wrap')}>
              <AppSelect
                className="min-w-[200px]"
                placeholder="— Select template —"
                value={selectedTemplateId}
                onChange={(e) => setSelectedTemplateId(e.target.value)}
                options={(permissionTemplates as { id: string; name: string }[]).map((t) => ({
                  value: t.id,
                  label: t.name,
                }))}
              />
              <AppButton
                type="button"
                variant="secondary"
                size="sm"
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
          </div>
        )}

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

        <div className="space-y-6">
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
                <div key={cat.category.id} className="border rounded-lg overflow-hidden">
                  {/* Category Header with Arrow */}
                  <div 
                    className="p-3 cursor-pointer hover:bg-gray-50 transition-colors flex items-center gap-2"
                    onClick={toggleExpand}
                  >
                    <div className="flex-shrink-0 w-4 h-4 flex items-center justify-center">
                      <svg 
                        className={`w-3 h-3 text-gray-600 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                        fill="none" 
                        stroke="currentColor" 
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                    <div className="flex-1">
                      <h4 className="text-xs font-semibold text-gray-900">{cat.category.label}</h4>
                      {cat.category.description && (
                        <p className="text-[10px] text-gray-500 mt-0.5">{cat.category.description}</p>
                      )}
                    </div>
                  </div>
                
                {/* Sub-permissions (shown when expanded) */}
                {isExpanded && subPermissions.length > 0 && (
                  <div className="px-4 pb-4 border-t border-gray-200 pt-3 mt-0">
                    {/* Special handling for HR category - group by area (users, attendance, community, etc.) */}
                    {cat.category.name === 'human_resources' ? (
                      <div className="space-y-4">
                        {/* Group permissions by area */}
                        {['users', 'attendance', 'community', 'reviews', 'timesheet'].map((area: string) => {
                          const areaPerms = subPermissions.filter((p: any) => p.key.includes(`hr:${area}`));
                          if (areaPerms.length === 0) return null;
                          
                          const areaLabel = area.charAt(0).toUpperCase() + area.slice(1);
                          const viewPerms = areaPerms.filter((p: any) => {
                            const key = p.key;
                            return key.includes(':view:') || (key.includes(':read') && !key.includes(':write') && !key.includes(':edit:'));
                          });
                          const editPerms = areaPerms.filter((p: any) => {
                            const key = p.key;
                            return key.includes(':edit:') || (key.includes(':write') && !key.includes(':view:')) || key.includes(':admin') || key.includes(':unrestricted') || key.includes(':approve');
                          });
                          
                          return (
                            <div key={area} className="border rounded-lg p-2.5 bg-gray-50">
                              <div className="text-xs font-semibold text-gray-700 mb-2">{areaLabel}</div>
                              <div className="grid md:grid-cols-2 gap-2.5">
                                {/* View Permissions Column */}
                                {viewPerms.length > 0 && (
                                  <div className="space-y-1.5">
                                    <div className="text-[10px] font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">View</div>
                                    {viewPerms.map((perm: any) => {
                                      const isViewPermission = perm.key.startsWith('hr:users:view:');
                                      const canEnable = canEdit && (!isViewPermission || canEnableEditPermission(perm.key, permissions));
                                      const isSubPermission = perm.key === 'hr:users:view:job:compensation';
                                      return (
                                      <label
                                        key={perm.id}
                                        className={`flex items-start gap-1.5 p-1.5 rounded bg-white ${canEnable ? 'hover:bg-gray-50 cursor-pointer' : 'cursor-default'} ${isSubPermission ? 'ml-4' : ''}`}
                                      >
                                        <input
                                          type="checkbox"
                                          checked={permissions[perm.key] || false}
                                          onChange={() => canEnable && handleToggle(perm.key)}
                                          disabled={!canEnable}
                                          className="mt-0.5 w-3.5 h-3.5 rounded border-gray-300 text-brand-red focus:ring-brand-red flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
                                        />
                                        <div className="flex-1 min-w-0">
                                          <div className="text-xs font-medium text-gray-900 flex items-center gap-1.5">
                                            <span className="truncate">{perm.label}</span>
                                            {!IMPLEMENTED_PERMISSIONS.has(perm.key) && (
                                              <span className="text-[10px] px-1 py-0.5 bg-yellow-100 text-yellow-800 rounded border border-yellow-300 flex-shrink-0">
                                                [WIP]
                                              </span>
                                            )}
                                          </div>
                                          {perm.description && (
                                            <div className="text-[10px] text-gray-500 mt-0.5 line-clamp-1">{perm.description}</div>
                                          )}
                                        </div>
                                      </label>
                                      );
                                    })}
                                  </div>
                                )}
                                {/* Edit Permissions Column */}
                                {editPerms.length > 0 && (
                                  <div className="space-y-1.5">
                                    <div className="text-[10px] font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">Edit</div>
                                    {editPerms.map((perm: any) => {
                                      const isEditPermission = perm.key.startsWith('hr:users:edit:') || perm.key === 'hr:users:write';
                                      const canEnable = canEdit && (!isEditPermission || canEnableEditPermission(perm.key, permissions));
                                      return (
                                        <label
                                          key={perm.id}
                                          className={`flex items-start gap-1.5 p-1.5 rounded bg-white ${canEnable ? 'hover:bg-gray-50 cursor-pointer' : 'cursor-default'}`}
                                        >
                                          <input
                                            type="checkbox"
                                            checked={permissions[perm.key] || false}
                                            onChange={() => canEnable && handleToggle(perm.key)}
                                            disabled={!canEnable}
                                            className="mt-0.5 w-3.5 h-3.5 rounded border-gray-300 text-brand-red focus:ring-brand-red flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
                                          />
                                          <div className="flex-1 min-w-0">
                                            <div className="text-xs font-medium text-gray-900 flex items-center gap-1.5">
                                              <span className="truncate">{perm.label}</span>
                                              {!IMPLEMENTED_PERMISSIONS.has(perm.key) && (
                                                <span className="text-[10px] px-1 py-0.5 bg-yellow-100 text-yellow-800 rounded border border-yellow-300 flex-shrink-0">
                                                  [WIP]
                                                </span>
                                              )}
                                            </div>
                                            {perm.description && (
                                              <div className="text-[10px] text-gray-500 mt-0.5 line-clamp-1">{perm.description}</div>
                                            )}
                                          </div>
                                        </label>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
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
                          <label className="flex items-start gap-1.5 p-2 rounded-lg bg-white border border-gray-200 hover:bg-gray-50 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={permissions[areaAccessPerm.key] || false}
                              onChange={() => canEdit && handleToggle(areaAccessPerm.key)}
                              disabled={!canEdit}
                              className="mt-0.5 w-3.5 h-3.5 rounded border-gray-300 text-brand-red focus:ring-brand-red flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="text-xs font-semibold text-gray-900">{areaAccessPerm.label}</div>
                              {areaAccessPerm.description && (
                                <div className="text-[10px] text-gray-500 mt-0.5">{areaAccessPerm.description}</div>
                              )}
                            </div>
                          </label>
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
                        
                        {/* Suppliers and Products */}
                        {['suppliers', 'products'].map((area: string) => {
                          const areaPerms = subPermissions.filter((p: any) => p.key.includes(`inventory:${area}`));
                          if (areaPerms.length === 0) return null;
                          
                          const areaLabel = area.charAt(0).toUpperCase() + area.slice(1);
                          const viewPerms = areaPerms.filter((p: any) => p.key.includes(':read'));
                          const editPerms = areaPerms.filter((p: any) => p.key.includes(':write'));
                          
                          return (
                            <div key={area} className="border rounded-lg p-2.5 bg-gray-50">
                              <div className="text-xs font-semibold text-gray-700 mb-2">{areaLabel}</div>
                              <div className="grid md:grid-cols-2 gap-2.5">
                                {/* View Permissions Column */}
                                {viewPerms.length > 0 && (
                                  <div className="space-y-1.5">
                                    <div className="text-[10px] font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">View</div>
                                    {viewPerms.map((perm: any) => (
                                      <label
                                        key={perm.id}
                                        className="flex items-start gap-1.5 p-1.5 rounded bg-white hover:bg-gray-50 cursor-pointer"
                                      >
                                        <input
                                          type="checkbox"
                                          checked={permissions[perm.key] || false}
                                          onChange={() => canEdit && handleToggle(perm.key)}
                                          disabled={!canEdit}
                                          className="mt-0.5 w-3.5 h-3.5 rounded border-gray-300 text-brand-red focus:ring-brand-red flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
                                        />
                                        <div className="flex-1 min-w-0">
                                          <div className="text-xs font-medium text-gray-900 flex items-center gap-1.5">
                                            <span className="truncate">{perm.label}</span>
                                            {!IMPLEMENTED_PERMISSIONS.has(perm.key) && (
                                              <span className="text-[10px] px-1 py-0.5 bg-yellow-100 text-yellow-800 rounded border border-yellow-300 flex-shrink-0">
                                                [WIP]
                                              </span>
                                            )}
                                          </div>
                                          {perm.description && (
                                            <div className="text-[10px] text-gray-500 mt-0.5 line-clamp-1">{perm.description}</div>
                                          )}
                                        </div>
                                      </label>
                                    ))}
                                  </div>
                                )}
                                {/* Edit Permissions Column */}
                                {editPerms.length > 0 && (
                                  <div className="space-y-1.5">
                                    <div className="text-[10px] font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">Edit</div>
                                    {editPerms.map((perm: any) => (
                                      <label
                                        key={perm.id}
                                        className="flex items-start gap-1.5 p-1.5 rounded bg-white hover:bg-gray-50 cursor-pointer"
                                      >
                                        <input
                                          type="checkbox"
                                          checked={permissions[perm.key] || false}
                                          onChange={() => canEdit && handleToggle(perm.key)}
                                          disabled={!canEdit}
                                          className="mt-0.5 w-3.5 h-3.5 rounded border-gray-300 text-brand-red focus:ring-brand-red flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
                                        />
                                        <div className="flex-1 min-w-0">
                                          <div className="text-xs font-medium text-gray-900 flex items-center gap-1.5">
                                            <span className="truncate">{perm.label}</span>
                                            {!IMPLEMENTED_PERMISSIONS.has(perm.key) && (
                                              <span className="text-[10px] px-1 py-0.5 bg-yellow-100 text-yellow-800 rounded border border-yellow-300 flex-shrink-0">
                                                [WIP]
                                              </span>
                                            )}
                                          </div>
                                          {perm.description && (
                                            <div className="text-[10px] text-gray-500 mt-0.5 line-clamp-1">{perm.description}</div>
                                          )}
                                        </div>
                                      </label>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : cat.category.name === 'fleet' ? (
                      /* Special handling for Fleet & Equipment category - group by vehicles and equipment */
                      <div className="space-y-4">
                        {areaAccessPerm && (
                          <label className="flex items-start gap-1.5 p-2 rounded-lg bg-white border border-gray-200 hover:bg-gray-50 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={permissions[areaAccessPerm.key] || false}
                              onChange={() => canEdit && handleToggle(areaAccessPerm.key)}
                              disabled={!canEdit}
                              className="mt-0.5 w-3.5 h-3.5 rounded border-gray-300 text-brand-red focus:ring-brand-red flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="text-xs font-semibold text-gray-900">{areaAccessPerm.label}</div>
                              {areaAccessPerm.description && (
                                <div className="text-[10px] text-gray-500 mt-0.5">{areaAccessPerm.description}</div>
                              )}
                            </div>
                          </label>
                        )}
                        {['vehicles', 'equipment'].map((area: string) => {
                          const areaPerms = subPermissions.filter((p: any) => p.key.includes(`fleet:${area}`));
                          if (areaPerms.length === 0) return null;
                          
                          const areaLabel = area.charAt(0).toUpperCase() + area.slice(1);
                          const viewPerms = areaPerms.filter((p: any) => p.key.includes(':read'));
                          const editPerms = areaPerms.filter((p: any) => p.key.includes(':write'));
                          
                          return (
                            <div key={area} className="border rounded-lg p-2.5 bg-gray-50">
                              <div className="text-xs font-semibold text-gray-700 mb-2">{areaLabel}</div>
                              <div className="grid md:grid-cols-2 gap-2.5">
                                {/* View Permissions Column */}
                                {viewPerms.length > 0 && (
                                  <div className="space-y-1.5">
                                    <div className="text-[10px] font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">View</div>
                                    {viewPerms.map((perm: any) => (
                                      <label
                                        key={perm.id}
                                        className="flex items-start gap-1.5 p-1.5 rounded bg-white hover:bg-gray-50 cursor-pointer"
                                      >
                                        <input
                                          type="checkbox"
                                          checked={permissions[perm.key] || false}
                                          onChange={() => canEdit && handleToggle(perm.key)}
                                          disabled={!canEdit}
                                          className="mt-0.5 w-3.5 h-3.5 rounded border-gray-300 text-brand-red focus:ring-brand-red flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
                                        />
                                        <div className="flex-1 min-w-0">
                                          <div className="text-xs font-medium text-gray-900 flex items-center gap-1.5">
                                            <span className="truncate">{perm.label}</span>
                                            {!IMPLEMENTED_PERMISSIONS.has(perm.key) && (
                                              <span className="text-[10px] px-1 py-0.5 bg-yellow-100 text-yellow-800 rounded border border-yellow-300 flex-shrink-0">
                                                [WIP]
                                              </span>
                                            )}
                                          </div>
                                          {perm.description && (
                                            <div className="text-[10px] text-gray-500 mt-0.5 line-clamp-1">{perm.description}</div>
                                          )}
                                        </div>
                                      </label>
                                    ))}
                                  </div>
                                )}
                                {/* Edit Permissions Column */}
                                {editPerms.length > 0 && (
                                  <div className="space-y-1.5">
                                    <div className="text-[10px] font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">Edit</div>
                                    {editPerms.map((perm: any) => {
                                      const canEnableFleetEdit = canEdit && canEnableEditPermission(perm.key, permissions);
                                      return (
                                      <label
                                        key={perm.id}
                                        className={`flex items-start gap-1.5 p-1.5 rounded bg-white ${canEnableFleetEdit ? 'hover:bg-gray-50 cursor-pointer' : 'cursor-default'}`}
                                      >
                                        <input
                                          type="checkbox"
                                          checked={permissions[perm.key] || false}
                                          onChange={() => canEnableFleetEdit && handleToggle(perm.key)}
                                          disabled={!canEnableFleetEdit}
                                          className="mt-0.5 w-3.5 h-3.5 rounded border-gray-300 text-brand-red focus:ring-brand-red flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
                                        />
                                        <div className="flex-1 min-w-0">
                                          <div className="text-xs font-medium text-gray-900 flex items-center gap-1.5">
                                            <span className="truncate">{perm.label}</span>
                                            {!IMPLEMENTED_PERMISSIONS.has(perm.key) && (
                                              <span className="text-[10px] px-1 py-0.5 bg-yellow-100 text-yellow-800 rounded border border-yellow-300 flex-shrink-0">
                                                [WIP]
                                              </span>
                                            )}
                                          </div>
                                          {perm.description && (
                                            <div className="text-[10px] text-gray-500 mt-0.5 line-clamp-1">{perm.description}</div>
                                          )}
                                        </div>
                                      </label>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
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
                            <div key={area} className="border rounded-lg p-2.5 bg-gray-50">
                              <div className="text-xs font-semibold text-gray-700 mb-2">{areaLabel}</div>
                              <div className="grid md:grid-cols-2 gap-2.5">
                                {/* View Permissions Column */}
                                {viewPerms.length > 0 && (
                                  <div className="space-y-1.5">
                                    <div className="text-[10px] font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">View</div>
                                    {viewPerms.map((perm: any) => (
                                      <label
                                        key={perm.id}
                                        className={`flex items-start gap-1.5 p-1.5 rounded bg-white ${canEdit ? 'hover:bg-gray-50 cursor-pointer' : 'cursor-default'}`}
                                      >
                                        <input
                                          type="checkbox"
                                          checked={permissions[perm.key] || false}
                                          onChange={() => canEdit && handleToggle(perm.key)}
                                          disabled={!canEdit}
                                          className="mt-0.5 w-3.5 h-3.5 rounded border-gray-300 text-brand-red focus:ring-brand-red flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
                                        />
                                        <div className="flex-1 min-w-0">
                                          <div className="text-xs font-medium text-gray-900 flex items-center gap-1.5">
                                            <span className="truncate">{perm.label}</span>
                                            {!IMPLEMENTED_PERMISSIONS.has(perm.key) && (
                                              <span className="text-[10px] px-1 py-0.5 bg-yellow-100 text-yellow-800 rounded border border-yellow-300 flex-shrink-0">
                                                [WIP]
                                              </span>
                                            )}
                                          </div>
                                          {perm.description && (
                                            <div className="text-[10px] text-gray-500 mt-0.5 line-clamp-1">{perm.description}</div>
                                          )}
                                        </div>
                                      </label>
                                    ))}
                                  </div>
                                )}
                                {/* Edit Permissions Column */}
                                {editPerms.length > 0 && (
                                  <div className="space-y-1.5">
                                    <div className="text-[10px] font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">Edit</div>
                                    {editPerms.map((perm: any) => {
                                      const canEnableEdit = canEdit && canEnableEditPermission(perm.key, permissions);
                                      return (
                                      <label
                                        key={perm.id}
                                        className={`flex items-start gap-1.5 p-1.5 rounded bg-white ${canEnableEdit ? 'hover:bg-gray-50 cursor-pointer' : 'cursor-default'}`}
                                      >
                                        <input
                                          type="checkbox"
                                          checked={permissions[perm.key] || false}
                                          onChange={() => canEnableEdit && handleToggle(perm.key)}
                                          disabled={!canEnableEdit}
                                          className="mt-0.5 w-3.5 h-3.5 rounded border-gray-300 text-brand-red focus:ring-brand-red flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
                                        />
                                        <div className="flex-1 min-w-0">
                                          <div className="text-xs font-medium text-gray-900 flex items-center gap-1.5">
                                            <span className="truncate">{perm.label}</span>
                                            {!IMPLEMENTED_PERMISSIONS.has(perm.key) && (
                                              <span className="text-[10px] px-1 py-0.5 bg-yellow-100 text-yellow-800 rounded border border-yellow-300 flex-shrink-0">
                                                [WIP]
                                              </span>
                                            )}
                                          </div>
                                          {perm.description && (
                                            <div className="text-[10px] text-gray-500 mt-0.5 line-clamp-1">{perm.description}</div>
                                          )}
                                        </div>
                                      </label>
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
                          <label
                            key={perm.id}
                            className={`flex items-start gap-1.5 p-1.5 rounded ${canEnable ? 'hover:bg-gray-50 cursor-pointer' : 'cursor-default'}`}
                          >
                            <input
                              type="checkbox"
                              checked={permissions[perm.key] || false}
                              onChange={() => canEnable && handleToggle(perm.key)}
                              disabled={!canEnable}
                              className="mt-0.5 w-3.5 h-3.5 rounded border-gray-300 text-brand-red focus:ring-brand-red disabled:opacity-50 disabled:cursor-not-allowed"
                            />
                            <div className="flex-1">
                              <div className="text-xs font-medium text-gray-900 flex items-center gap-1.5">
                                {perm.label}
                                {!IMPLEMENTED_PERMISSIONS.has(perm.key) && (
                                  <span className="text-[10px] px-1 py-0.5 bg-yellow-100 text-yellow-800 rounded border border-yellow-300">
                                    [WIP]
                                  </span>
                                )}
                              </div>
                              {perm.description && (
                                <div className="text-[10px] text-gray-500 mt-0.5">{perm.description}</div>
                              )}
                            </div>
                          </label>
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
          <div className="mt-6 p-3 bg-gray-50 border border-gray-200 rounded-lg text-center text-xs text-gray-600">
            You have view-only access. You need edit permissions to modify user permissions.
          </div>
        )}
      </div>
    </div>
  );
});

// Helper function to convert 24h time (HH:MM:SS or HH:MM) to 12h format (h:mm AM/PM)
function formatTime12h(timeStr: string | null | undefined): string {
  if (!timeStr || timeStr === '--:--' || timeStr === '-') return timeStr || '--:--';
  const parts = timeStr.split(':');
  if (parts.length < 2) return timeStr;
  const hours = parseInt(parts[0], 10);
  const minutes = parts[1];
  if (isNaN(hours)) return timeStr;
  const period = hours >= 12 ? 'PM' : 'AM';
  const hours12 = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
  return `${hours12}:${minutes} ${period}`;
}

// Convert UTC ISO string to local datetime-local format (YYYY-MM-DDTHH:mm)
const toLocalInputValue = (iso?: string | null) => {
  if (!iso) return '';
  const date = new Date(iso);
  // datetime-local input expects YYYY-MM-DDTHH:mm format in local time
  // Get local date components
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
};

function UserLabel({ id, fallback }:{ id:string, fallback:string }){
  const { data } = useQuery({ queryKey:['user-prof-opt', id], queryFn: ()=> api<any>('GET', `/auth/users/${id}/profile`), enabled: !!id });
  const fn = data?.profile?.preferred_name || data?.profile?.first_name || '';
  const ln = data?.profile?.last_name || '';
  const label = `${fn} ${ln}`.trim() || fallback;
  return <>{label}</>;
}

const USER_ACTIVITY_LOG_TZ = 'America/Vancouver';

function parseUtcForUserActivity(iso: string): Date {
  const s = iso.trim();
  if (!s) return new Date(NaN);
  if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(s)) return new Date(s);
  const normalized = s.includes('T') ? s : s.replace(' ', 'T');
  return new Date(normalized.endsWith('Z') ? normalized : `${normalized}Z`);
}

function formatUserActivityTime(iso: string): string {
  const d = parseUtcForUserActivity(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: USER_ACTIVITY_LOG_TZ,
    dateStyle: 'short',
    timeStyle: 'medium',
  }).format(d);
}

type ActivityPaginated<T> = {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
};

type UserActivityLogResponse = {
  last_login_at: string | null;
  logins: ActivityPaginated<{
    id: string;
    timestamp_utc: string;
    title: string;
    path: string | null;
    request_id: string | null;
  }>;
  audit: ActivityPaginated<{
    id: string;
    timestamp_utc: string;
    entity_type: string;
    entity_id: string;
    entity_display: string | null;
    action: string;
    source: string | null;
  }>;
};

type LoginActivityRow = UserActivityLogResponse['logins']['items'][number];

type AuditActivityDetail = {
  id: string;
  timestamp_utc: string;
  entity_type: string;
  entity_id: string;
  entity_display: string | null;
  action: string;
  actor_id: string | null;
  actor_name: string | null;
  actor_role: string | null;
  source: string | null;
  changes_json: Record<string, unknown> | unknown[] | null;
  context: Record<string, unknown> | null;
};

function activityAuditTitle(row: UserActivityLogResponse['audit']['items'][0]): string {
  const label = row.entity_display || row.entity_type.replace(/_/g, ' ');
  return `${row.action} · ${label}`;
}

function ActivityPager({
  page,
  totalPages,
  total,
  onPrev,
  onNext,
}: {
  page: number;
  totalPages: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
}) {
  if (total <= 0) return null;
  return (
    <div className="flex items-center justify-between gap-2 mt-2 text-[10px] text-gray-500">
      <span>
        Page {page} of {Math.max(totalPages, 1)} · {total} total
      </span>
      <div className="flex gap-1">
        <button
          type="button"
          disabled={page <= 1}
          onClick={onPrev}
          className="px-2 py-0.5 rounded border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Prev
        </button>
        <button
          type="button"
          disabled={totalPages <= 0 ? true : page >= totalPages}
          onClick={onNext}
          className="px-2 py-0.5 rounded border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Next
        </button>
      </div>
    </div>
  );
}

function UserActivityLogTab({ userId }: { userId: string }) {
  const [loginsPage, setLoginsPage] = useState(1);
  const [auditPage, setAuditPage] = useState(1);
  const pageSize = 15;

  const [loginModal, setLoginModal] = useState<LoginActivityRow | null>(null);
  const [auditModalId, setAuditModalId] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['user-activity-log', userId, loginsPage, auditPage, pageSize],
    queryFn: () =>
      api<UserActivityLogResponse>(
        'GET',
        `/users/${encodeURIComponent(userId)}/activity-log?logins_page=${loginsPage}&logins_page_size=${pageSize}&audit_page=${auditPage}&audit_page_size=${pageSize}`,
      ),
    enabled: !!userId,
  });

  useEffect(() => {
    if (!data) return;
    if (data.logins.total_pages > 0 && loginsPage > data.logins.total_pages) {
      setLoginsPage(data.logins.page);
    }
    if (data.audit.total_pages > 0 && auditPage > data.audit.total_pages) {
      setAuditPage(data.audit.page);
    }
  }, [data, loginsPage, auditPage]);

  const { data: auditDetail, isLoading: auditDetailLoading } = useQuery({
    queryKey: ['user-activity-audit-detail', userId, auditModalId],
    queryFn: () =>
      api<AuditActivityDetail>(
        'GET',
        `/users/${encodeURIComponent(userId)}/activity-log/audit/${encodeURIComponent(auditModalId!)}`,
      ),
    enabled: !!userId && !!auditModalId,
  });

  if (isLoading) {
    return <div className="h-24 animate-pulse bg-gray-100 rounded-lg" />;
  }
  if (error) {
    return (
      <div className="text-xs text-red-600 py-4">
        Could not load activity. Check that you have the &quot;View Activity Tab&quot; permission.
      </div>
    );
  }
  if (!data) return null;

  const lg = data.logins;
  const au = data.audit;

  return (
    <div className="space-y-5 pb-16 max-w-3xl">
      <div className="rounded-lg border border-gray-200 bg-gray-50/80 px-3 py-2">
        <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Last sign-in</div>
        <div className="text-xs text-gray-900 mt-0.5">{data.last_login_at ? formatUserActivityTime(data.last_login_at) : '—'}</div>
      </div>

      <section>
        <h3 className="text-xs font-semibold text-gray-800 mb-2">Sign-ins</h3>
        {lg.total === 0 ? (
          <p className="text-[11px] text-gray-500">No sign-in events recorded yet.</p>
        ) : (
          <>
            <div className="rounded border border-gray-200 divide-y divide-gray-100 bg-white" role="list">
              {lg.items.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  role="listitem"
                  onClick={() => setLoginModal(row)}
                  className="w-full flex items-center px-2 py-1.5 min-h-[2rem] text-left hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-red/35"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] text-gray-900 truncate">{row.title}</div>
                    <div className="text-[10px] text-gray-500 truncate">{formatUserActivityTime(row.timestamp_utc)}</div>
                  </div>
                </button>
              ))}
            </div>
            <ActivityPager
              page={lg.page}
              totalPages={lg.total_pages}
              total={lg.total}
              onPrev={() => setLoginsPage((p) => Math.max(1, p - 1))}
              onNext={() => setLoginsPage((p) => (lg.total_pages ? Math.min(lg.total_pages, p + 1) : p))}
            />
          </>
        )}
      </section>

      <section>
        <h3 className="text-xs font-semibold text-gray-800 mb-2">Audit (actions in the system)</h3>
        {au.total === 0 ? (
          <p className="text-[11px] text-gray-500">No audit entries for this user.</p>
        ) : (
          <>
            <div className="rounded border border-gray-200 divide-y divide-gray-100 bg-white" role="list">
              {au.items.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  role="listitem"
                  onClick={() => setAuditModalId(row.id)}
                  className="w-full flex items-center px-2 py-1.5 min-h-[2rem] text-left hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-red/35"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] text-gray-900 truncate" title={activityAuditTitle(row)}>
                      {activityAuditTitle(row)}
                    </div>
                    <div className="text-[10px] text-gray-500 truncate">{formatUserActivityTime(row.timestamp_utc)}</div>
                  </div>
                </button>
              ))}
            </div>
            <ActivityPager
              page={au.page}
              totalPages={au.total_pages}
              total={au.total}
              onPrev={() => setAuditPage((p) => Math.max(1, p - 1))}
              onNext={() => setAuditPage((p) => (au.total_pages ? Math.min(au.total_pages, p + 1) : p))}
            />
          </>
        )}
      </section>

      <AppModal
        open={!!loginModal}
        onClose={() => setLoginModal(null)}
        size="sm"
        title="Sign-in"
        footer={
          <div className={uiCx(uiLayout.actionsRow, 'w-full justify-end')}>
            <AppButton type="button" variant="secondary" size="sm" onClick={() => setLoginModal(null)}>
              Close
            </AppButton>
          </div>
        }
      >
        {loginModal ? (
          <div className={uiCx(uiTypography.helper, uiSpacing.sectionStack)}>
            <div>
              <span className="text-gray-500">Time (Vancouver)</span>
              <div className="font-mono">{formatUserActivityTime(loginModal.timestamp_utc)}</div>
            </div>
            <div>
              <span className="text-gray-500">Path</span>
              <div className="break-all font-mono">{loginModal.path || '—'}</div>
            </div>
            {loginModal.request_id ? (
              <div>
                <span className="text-gray-500">Request ID</span>
                <div className="break-all font-mono">{loginModal.request_id}</div>
              </div>
            ) : null}
          </div>
        ) : null}
      </AppModal>

      <AppModal
        open={!!auditModalId}
        onClose={() => setAuditModalId(null)}
        size="md"
        title="Audit action"
        footer={
          <div className={uiCx(uiLayout.actionsRow, 'w-full justify-end')}>
            <AppButton type="button" variant="secondary" size="sm" onClick={() => setAuditModalId(null)}>
              Close
            </AppButton>
          </div>
        }
      >
        <div className={uiCx(uiTypography.helper, uiSpacing.sectionStack)}>
          {auditDetailLoading ? (
            <div className={uiCx('h-16 animate-pulse bg-gray-100', uiRadius.control)} />
          ) : auditDetail ? (
            <>
              <div className="grid gap-1">
                <div>
                  <span className="text-gray-500">Time</span>
                  <div>{formatUserActivityTime(auditDetail.timestamp_utc)}</div>
                </div>
                <div>
                  <span className="text-gray-500">Action</span>
                  <div className="font-medium">{auditDetail.action}</div>
                </div>
                <div>
                  <span className="text-gray-500">Entity</span>
                  <div>
                    {auditDetail.entity_display || auditDetail.entity_type}{' '}
                    <span className="font-mono text-[10px] text-gray-500">({auditDetail.entity_id})</span>
                  </div>
                </div>
                {auditDetail.source ? (
                  <div>
                    <span className="text-gray-500">Source</span>
                    <div>{auditDetail.source}</div>
                  </div>
                ) : null}
              </div>
              {auditDetail.changes_json != null &&
              (Array.isArray(auditDetail.changes_json)
                ? auditDetail.changes_json.length > 0
                : typeof auditDetail.changes_json === 'object' && Object.keys(auditDetail.changes_json).length > 0) ? (
                <div>
                  <div className="mb-1 font-semibold text-gray-600">Changes</div>
                  <pre className={uiCx(uiTypography.helper, uiBorders.subtle, 'max-h-40 overflow-x-auto rounded bg-gray-50 p-2')}>
                    {JSON.stringify(auditDetail.changes_json, null, 2)}
                  </pre>
                </div>
              ) : null}
              {auditDetail.context && Object.keys(auditDetail.context).length > 0 ? (
                <div>
                  <div className="mb-1 font-semibold text-gray-600">Context</div>
                  <pre className={uiCx(uiTypography.helper, uiBorders.subtle, 'max-h-32 overflow-x-auto rounded bg-gray-50 p-2')}>
                    {JSON.stringify(auditDetail.context, null, 2)}
                  </pre>
                </div>
              ) : null}
            </>
          ) : (
            <div className="text-red-600">Could not load details.</div>
          )}
        </div>
      </AppModal>
    </div>
  );
}

export default function UserInfo(){
  const { userId } = useParams();
  const [sp] = useSearchParams();
  const tabParam = sp.get('tab') as ('personal'|'job'|'docs'|'timesheet'|'loans'|'training'|'assets'|'reports'|'reviews'|'permissions'|'activity') | null;
  const [tab, setTab] = useState<typeof tabParam | 'personal'>(tabParam || 'personal');
  const confirm = useConfirm();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({ queryKey:['userProfile', userId], queryFn: ()=> api<any>('GET', `/auth/users/${userId}/profile`) });
  const { data:me } = useQuery({ queryKey:['me'], queryFn: ()=> api<any>('GET','/auth/me') });
  const { data:settings } = useQuery({ queryKey:['settings'], queryFn: ()=> api<any>('GET','/settings') });
  const canEdit = !!(
    (me?.roles || []).some((r: string) => String(r || '').toLowerCase() === 'admin') || 
    (me?.permissions || []).includes('users:write')
  );
  const isAdmin = !!(me?.roles || []).some((r: string) => String(r || '').toLowerCase() === 'admin');
  const canSelfEdit = me && userId && String(me.id) === String(userId);
  
  // Check edit permissions for general tab (Personal, Job, Docs)
  const canEditGeneral = useMemo(() => {
    if (!me) return false;
    const isAdmin = (me?.roles || []).some((r: string) => String(r || '').toLowerCase() === 'admin');
    if (isAdmin) return true;
    const perms = me?.permissions || [];
    return perms.includes('hr:users:edit:general') || perms.includes('users:write'); // Legacy
  }, [me]);

  /** Matches PATCH /users/:id — admin, hr:users:write, or users:write only (not hr:users:edit:general). */
  const canManageAccountStatus = useMemo(() => {
    if (!me) return false;
    if ((me?.roles || []).some((r: string) => String(r || '').toLowerCase() === 'admin')) return true;
    const perms = me?.permissions || [];
    return perms.includes('hr:users:write') || perms.includes('users:write');
  }, [me]);
  
  // Check view permission for job compensation fields (Employment Type, Pay Type, Pay Rate)
  const canViewJobCompensation = useMemo(() => {
    if (!me) return false;
    const isAdmin = (me?.roles || []).some((r: string) => String(r || '').toLowerCase() === 'admin');
    if (isAdmin) return true;
    const perms = me?.permissions || [];
    // Only check for the specific permission - admins can always see it, but regular users need the specific permission
    return perms.includes('hr:users:view:job:compensation');
  }, [me]);
  
  // Check edit permissions for permissions tab
  const canEditPermissions = useMemo(() => {
    if (!me) return false;
    const isAdmin = (me?.roles || []).some((r: string) => String(r || '').toLowerCase() === 'admin');
    if (isAdmin) return true;
    const perms = me?.permissions || [];
    return perms.includes('hr:users:edit:permissions') || perms.includes('users:write'); // Legacy
  }, [me]);
  
  // Check edit permissions for timesheet tab
  const canEditTimesheet = useMemo(() => {
    if (!me) return false;
    const isAdmin = (me?.roles || []).some((r: string) => String(r || '').toLowerCase() === 'admin');
    if (isAdmin) return true;
    const perms = me?.permissions || [];
    return perms.includes('hr:users:edit:timesheet') || perms.includes('hr:attendance:write') || perms.includes('users:write'); // Legacy
  }, [me]);
  
  // Check view permissions for each tab
  const canViewGeneral = useMemo(() => {
    if (!me) return false;
    const isAdmin = (me?.roles || []).some((r: string) => String(r || '').toLowerCase() === 'admin');
    if (isAdmin) return true;
    const perms = me?.permissions || [];
    return perms.includes('hr:users:view:general') || perms.includes('users:read'); // Legacy
  }, [me]);
  
  const canViewLoans = useMemo(() => {
    if (!me) return false;
    const isAdmin = (me?.roles || []).some((r: string) => String(r || '').toLowerCase() === 'admin');
    if (isAdmin) return true;
    const perms = me?.permissions || [];
    return perms.includes('hr:users:view:general') || perms.includes('users:read'); // Legacy
  }, [me]);

  const canViewTraining = useMemo(() => {
    if (!me) return false;
    if (userId && String(me.id) === String(userId)) return true;
    const isAdmin = (me?.roles || []).some((r: string) => String(r || '').toLowerCase() === 'admin');
    if (isAdmin) return true;
    const perms = me?.permissions || [];
    return perms.includes('hr:users:view:general') || perms.includes('users:read');
  }, [me, userId]);

  const canEditTraining = useMemo(() => {
    if (!me) return false;
    if (canSelfEdit) return true;
    const isAdmin = (me?.roles || []).some((r: string) => String(r || '').toLowerCase() === 'admin');
    if (isAdmin) return true;
    const perms = me?.permissions || [];
    return perms.includes('hr:users:edit:general') || perms.includes('users:write');
  }, [me, canSelfEdit]);
  
  const canViewReports = useMemo(() => {
    if (!me) return false;
    const isAdmin = (me?.roles || []).some((r: string) => String(r || '').toLowerCase() === 'admin');
    if (isAdmin) return true;
    const perms = me?.permissions || [];
    return perms.includes('hr:users:view:general') || perms.includes('users:read'); // Using general view for now
  }, [me]);
  
  const canViewTimesheet = useMemo(() => {
    if (!me) return false;
    const isAdmin = (me?.roles || []).some((r: string) => String(r || '').toLowerCase() === 'admin');
    if (isAdmin) return true;
    const perms = me?.permissions || [];
    return perms.includes('hr:users:view:timesheet') || perms.includes('users:read'); // Legacy
  }, [me]);
  
  const canViewPermissions = useMemo(() => {
    if (!me) return false;
    const isAdmin = (me?.roles || []).some((r: string) => String(r || '').toLowerCase() === 'admin');
    if (isAdmin) return true;
    const perms = me?.permissions || [];
    return perms.includes('hr:users:view:permissions') || perms.includes('users:read'); // Legacy
  }, [me]);
  const canViewAssets = useMemo(() => {
    if (!me) return false;
    const isAdmin = (me?.roles || []).some((r: string) => String(r || '').toLowerCase() === 'admin');
    if (isAdmin) return true;
    const perms = me?.permissions || [];
    return (
      perms.includes('fleet:access') ||
      perms.includes('fleet:read') ||
      perms.includes('fleet:vehicles:read') ||
      perms.includes('fleet:equipment:read') ||
      perms.includes('equipment:read')
    );
  }, [me]);

  /** Activity tab: explicit HR permission or system admin (matches backend). */
  const canViewActivity = useMemo(() => {
    if (!me) return false;
    const isAdminRole = (me?.roles || []).some((r: string) => String(r || '').toLowerCase() === 'admin');
    if (isAdminRole) return true;
    const perms = me?.permissions || [];
    return perms.includes('hr:users:view:activity');
  }, [me]);

  const canViewReviews = useMemo(() => {
    if (!me) return false;
    const isAdminRole = (me?.roles || []).some((r: string) => String(r || '').toLowerCase() === 'admin');
    if (isAdminRole) return true;
    const perms = me?.permissions || [];
    return perms.includes('reviews:read') || perms.includes('reviews:admin') || perms.includes('hr:reviews:admin');
  }, [me]);

  const canImportLegacyReviews = useMemo(() => {
    if (!me) return false;
    const isAdminRole = (me?.roles || []).some((r: string) => String(r || '').toLowerCase() === 'admin');
    if (isAdminRole) return true;
    const perms = me?.permissions || [];
    return perms.includes('hr:reviews:admin') || perms.includes('reviews:admin');
  }, [me]);

  useEffect(() => {
    if (tab !== 'activity' || canViewActivity) return;
    if (canViewGeneral || canSelfEdit) setTab('personal');
  }, [tab, canViewActivity, canViewGeneral, canSelfEdit]);

  useEffect(() => {
    if (!tabParam) return;
    const ok: Record<string, boolean> = {
      personal: !!(canViewGeneral || canSelfEdit),
      job: !!canViewGeneral,
      docs: !!canViewGeneral,
      timesheet: !!canViewTimesheet,
      loans: !!canViewLoans,
      training: !!canViewTraining,
      assets: !!canViewAssets,
      reports: !!canViewReports,
      reviews: !!canViewReviews,
      permissions: !!canViewPermissions,
      activity: !!canViewActivity,
    };
    if (ok[tabParam]) setTab(tabParam);
  }, [
    userId,
    tabParam,
    canViewGeneral,
    canSelfEdit,
    canViewTimesheet,
    canViewLoans,
    canViewTraining,
    canViewAssets,
    canViewReports,
    canViewReviews,
    canViewPermissions,
    canViewActivity,
  ]);

  const canEditAssets = useMemo(() => {
    if (!me) return false;
    const isAdmin = (me?.roles || []).some((r: string) => String(r || '').toLowerCase() === 'admin');
    if (isAdmin) return true;
    const perms = me?.permissions || [];
    return perms.includes('equipment:write') || perms.includes('fleet:equipment:write');
  }, [me]);
  const canEditFleetAssets = useMemo(() => {
    if (!me) return false;
    const isAdmin = (me?.roles || []).some((r: string) => String(r || '').toLowerCase() === 'admin');
    if (isAdmin) return true;
    const perms = me?.permissions || [];
    return perms.includes('fleet:write') || perms.includes('fleet:vehicles:write');
  }, [me]);
  const p = data?.profile || {};
  const u = data?.user || {};
  const { data: visasData } = useQuery({ 
    queryKey:['employee-visas', userId], 
    queryFn: ()=> api<any[]>('GET', `/auth/users/${encodeURIComponent(String(userId))}/visas`).catch(() => []),
    enabled: !!userId
  });
  const hasVisas = visasData && visasData.length > 0;
  
  const [pending, setPending] = useState<any>({});
  const [dirty, setDirty] = useState<boolean>(false);
  const [permissionsDirty, setPermissionsDirty] = useState<boolean>(false);
  const [divisionsDirty, setDivisionsDirty] = useState<boolean>(false);
  const [projectDivisionsDirty, setProjectDivisionsDirty] = useState<boolean>(false);
  const [selectedDivisions, setSelectedDivisions] = useState<string[]>([]);
  const [selectedProjectDivisions, setSelectedProjectDivisions] = useState<string[]>([]);
  const [personalEditSection, setPersonalEditSection] = useState<UserPersonalEditSection | null>(null);
  const [jobEditSection, setJobEditSection] = useState<UserJobEditSection | null>(null);
  const [sectionModalPending, setSectionModalPending] = useState<Record<string, any>>({});
  const [orgModalDivisions, setOrgModalDivisions] = useState<string[]>([]);
  const [orgModalProjectDivisions, setOrgModalProjectDivisions] = useState<string[]>([]);
  const [orgModalDivisionsDirty, setOrgModalDivisionsDirty] = useState(false);
  const [orgModalProjectDivisionsDirty, setOrgModalProjectDivisionsDirty] = useState(false);
  const [sectionModalSaving, setSectionModalSaving] = useState(false);
  const [sendingAccessInvite, setSendingAccessInvite] = useState(false);
  const [savingAccountStatus, setSavingAccountStatus] = useState(false);
  const [accountStatusModalOpen, setAccountStatusModalOpen] = useState(false);
  const [accountStatusDraft, setAccountStatusDraft] = useState(true);
  const [deletingUser, setDeletingUser] = useState(false);
  
  // Auto-fill work_eligibility_status if user has visas but no status
  useEffect(() => {
    const hasNoStatus = !p.work_eligibility_status || (typeof p.work_eligibility_status === 'string' && p.work_eligibility_status.trim() === '');
    if (hasVisas && hasNoStatus && userId && personalEditSection !== 'legal') {
      const autoFillStatus = 'Temporary Resident (with work authorization)';
      // Only auto-save if user has edit permissions
      if (canEdit || canEditGeneral) {
        api('PUT', `/auth/users/${encodeURIComponent(String(userId))}/profile`, { work_eligibility_status: autoFillStatus })
          .then(() => {
            queryClient.invalidateQueries({ queryKey: ['userProfile', userId] });
            queryClient.refetchQueries({ queryKey: ['userProfile', userId] });
          })
          .catch((e) => {
            console.error('Failed to auto-fill work_eligibility_status:', e);
          });
      }
    }
  }, [hasVisas, p.work_eligibility_status, userId, canEdit, canEditGeneral, personalEditSection, queryClient]);
  const [isEmployeeCardMinimized, setIsEmployeeCardMinimized] = useState(false);
  const permissionsRef = useRef<UserPermissionsRef>(null);
  const { data: usersOptionsRaw } = useQuery({
    queryKey: ['users-options', { limit: 5000 }],
    queryFn: () => api<any[]>('GET', '/auth/users/options?limit=5000'),
  });
  const usersOptions = useMemo(() => {
    const arr = [...(usersOptionsRaw || [])];
    arr.sort((a: any, b: any) => {
      const la = String(a?.name ?? a?.username ?? a?.email ?? a?.id ?? '').toLowerCase();
      const lb = String(b?.name ?? b?.username ?? b?.email ?? b?.id ?? '').toLowerCase();
      return la.localeCompare(lb, undefined, { sensitivity: 'base' });
    });
    return arr;
  }, [usersOptionsRaw]);
  const { data: supervisorProfile } = useQuery({
    queryKey: ['supervisor-profile', p?.manager_user_id],
    queryFn: ()=> api<any>('GET', `/auth/users/${p.manager_user_id}/profile`),
    enabled: !!p?.manager_user_id,
  });
  const supervisorName = useMemo(()=>{
    if (supervisorProfile?.profile) {
      const fn = supervisorProfile.profile.first_name||'';
      const ln = supervisorProfile.profile.last_name||'';
      const full = `${fn} ${ln}`.trim();
      if (full) return full;
    }
    if(!p?.manager_user_id) return '';
    const row = (usersOptions || []).find((x: any) => String(x.id) === String(p.manager_user_id));
    return row ? String(row.name || row.username || row.email || '') : '';
  }, [usersOptions, p?.manager_user_id, supervisorProfile]);

  function calcAge(dob?: string){
    if(!dob) return '';
    try{ const d = new Date(dob); const now = new Date(); let a = now.getFullYear()-d.getFullYear(); const m = now.getMonth()-d.getMonth(); if(m<0 || (m===0 && now.getDate()<d.getDate())) a--; return a>0? `${a}y` : '—'; }catch{ return ''; }
  }
  function tenure(from?: string){
    if(!from) return '';
    try{ const s=new Date(from); const now=new Date(); let months=(now.getFullYear()-s.getFullYear())*12+(now.getMonth()-s.getMonth()); if(now.getDate()<s.getDate()) months--; const y=Math.floor(months/12); const m=months%12; return y>0? `${y}y ${m}m` : `${m}m`; }catch{ return ''; }
  }

  useEffect(()=>{ 
    setPending({}); 
    setDirty(false); 
    setPermissionsDirty(false);
    setDivisionsDirty(false);
    setProjectDivisionsDirty(false);
    const divisions = (u?.divisions || []).map((d: any) => String(d.id));
    setSelectedDivisions(divisions);
    const projectDivs = Array.isArray(p?.project_division_ids) ? p.project_division_ids.map((id: any) => String(id)) : [];
    setSelectedProjectDivisions(projectDivs);
  }, [userId, data?.profile, u?.divisions, p?.project_division_ids]);

  const handleTabChange = async (newTab: typeof tabParam | 'personal') => {
    // Check if user has permission to view this tab
    const isGeneralTab = ['personal', 'job', 'docs'].includes(newTab);
    const isTimesheetTab = newTab === 'timesheet';
    const isLoansTab = newTab === 'loans';
    const isTrainingTab = newTab === 'training';
    const isReportsTab = newTab === 'reports';
    const isPermissionsTab = newTab === 'permissions';
    const isActivityTab = newTab === 'activity';
    const isReviewsTab = newTab === 'reviews';

    if (isActivityTab && !canViewActivity) {
      toast.error('You do not have permission to view this tab');
      return;
    }
    if (isReviewsTab && !canViewReviews) {
      toast.error('You do not have permission to view this tab');
      return;
    }

    if (isGeneralTab && !canViewGeneral) {
      toast.error('You do not have permission to view this tab');
      return;
    }
    if (isTimesheetTab && !canViewTimesheet) {
      toast.error('You do not have permission to view this tab');
      return;
    }
    if (isLoansTab && !canViewLoans) {
      return;
    }
    if (isTrainingTab && !canViewTraining) {
      toast.error('You do not have permission to view this tab');
      return;
    }
    if (newTab === 'assets' && !canViewAssets) {
      toast.error('You do not have permission to view this tab');
      return;
    }
    if (isReportsTab && !canViewReports) {
      toast.error('You do not have permission to view this tab');
      return;
    }
    if (isPermissionsTab && !canViewPermissions) {
      toast.error('You do not have permission to view this tab');
      return;
    }
    
    // Check if there are unsaved changes before switching tabs
    const hasUnsaved = dirty || permissionsDirty || divisionsDirty;
    
    if (hasUnsaved && tab !== newTab) {
      const result = await confirm({
        title: 'Unsaved Changes',
        message: 'You have unsaved changes. What would you like to do?',
        confirmText: 'Save and Continue',
        cancelText: 'Cancel',
        showDiscard: true,
        discardText: 'Discard Changes'
      });
      
      if (result === 'confirm') {
        // Save before leaving
        await saveAll();
        setTab(newTab);
      } else if (result === 'discard') {
        // Discard changes and leave
        setPending({});
        setDirty(false);
        setPermissionsDirty(false);
        setDivisionsDirty(false);
        setSelectedDivisions((u?.divisions || []).map((d: any) => String(d.id)));
        setTab(newTab);
      }
      // If cancelled, do nothing (stay on current tab)
    } else {
      // No unsaved changes, proceed normally
      setTab(newTab);
    }
  };

  const closePersonalEditModal = () => {
    setPersonalEditSection(null);
    setSectionModalPending({});
  };

  const closeJobEditModal = () => {
    setJobEditSection(null);
    setSectionModalPending({});
    setOrgModalDivisionsDirty(false);
    setOrgModalProjectDivisionsDirty(false);
  };

  const openPersonalEditModal = (section: UserPersonalEditSection) => {
    setSectionModalPending({});
    setPersonalEditSection(section);
  };

  const openJobEditModal = (section: UserJobEditSection) => {
    setSectionModalPending({});
    if (section === 'organization') {
      setOrgModalDivisions((u?.divisions || []).map((d: any) => String(d.id)));
      setOrgModalProjectDivisions(
        Array.isArray(p?.project_division_ids) ? p.project_division_ids.map((id: any) => String(id)) : [],
      );
      setOrgModalDivisionsDirty(false);
      setOrgModalProjectDivisionsDirty(false);
    }
    setJobEditSection(section);
  };

  const refreshUserProfile = async () => {
    await queryClient.invalidateQueries({ queryKey: ['userProfile', userId] });
    await queryClient.refetchQueries({ queryKey: ['userProfile', userId] });
  };

  const saveSectionModalProfile = async () => {
    if (sectionModalSaving) return;
    if (!Object.keys(sectionModalPending).length) {
      closePersonalEditModal();
      return;
    }
    try {
      setSectionModalSaving(true);
      if (canEdit || canEditGeneral) {
        await api('PUT', `/auth/users/${encodeURIComponent(String(userId || ''))}/profile`, sectionModalPending);
      } else if (canSelfEdit) {
        await api('PUT', `/auth/me/profile`, sectionModalPending);
      } else {
        throw new Error('Not allowed');
      }
      toast.success('Saved');
      await refreshUserProfile();
      closePersonalEditModal();
    } catch (e: any) {
      toast.error(e?.message || 'Failed to save');
    } finally {
      setSectionModalSaving(false);
    }
  };

  const saveOrganizationModal = async () => {
    if (sectionModalSaving) return;
    const hasProfileChanges = Object.keys(sectionModalPending).length > 0;
    if (!hasProfileChanges && !orgModalDivisionsDirty && !orgModalProjectDivisionsDirty) {
      closeJobEditModal();
      return;
    }
    try {
      setSectionModalSaving(true);
      if (hasProfileChanges) {
        if (canEdit || canEditGeneral) {
          await api('PUT', `/auth/users/${encodeURIComponent(String(userId || ''))}/profile`, sectionModalPending);
        } else if (canSelfEdit) {
          await api('PUT', `/auth/me/profile`, sectionModalPending);
        } else {
          throw new Error('Not allowed');
        }
      }
      if (orgModalDivisionsDirty && (canEdit || canEditGeneral)) {
        await api('PUT', `/employees/${encodeURIComponent(String(userId || ''))}/divisions`, orgModalDivisions);
      }
      if (orgModalProjectDivisionsDirty && (canEdit || canEditGeneral)) {
        await api('PUT', `/employees/${encodeURIComponent(String(userId || ''))}/project-divisions`, orgModalProjectDivisions);
      }
      toast.success('Saved');
      await refreshUserProfile();
      closeJobEditModal();
    } catch (e: any) {
      toast.error(e?.message || 'Failed to save');
    } finally {
      setSectionModalSaving(false);
    }
  };

  const saveSalaryModal = async () => {
    if (sectionModalSaving) return;
    if (!Object.keys(sectionModalPending).length) {
      closeJobEditModal();
      return;
    }
    try {
      setSectionModalSaving(true);
      if (canEdit || canEditGeneral) {
        await api('PUT', `/auth/users/${encodeURIComponent(String(userId || ''))}/profile`, sectionModalPending);
      } else {
        throw new Error('Not allowed');
      }
      toast.success('Saved');
      await refreshUserProfile();
      closeJobEditModal();
    } catch (e: any) {
      toast.error(e?.message || 'Failed to save');
    } finally {
      setSectionModalSaving(false);
    }
  };

  const collectSectionModalChanges = (kv: Record<string, any>) => {
    setSectionModalPending((s) => ({ ...s, ...kv }));
  };

  const collectChanges = (kv: Record<string, any>) => {
    // Check if divisions changed
    if (kv._divisions_changed) {
      setSelectedDivisions(kv._selected_divisions || []);
      setDivisionsDirty(true);
      // Remove internal flags from pending
      const { _divisions_changed, _selected_divisions, ...rest } = kv;
      if (Object.keys(rest).length > 0) {
        setPending((s:any)=> ({ ...s, ...rest }));
        setDirty(true);
      }
    } else {
      setPending((s:any)=> ({ ...s, ...kv }));
      setDirty(true);
    }
  };

  const saveAll = async()=>{
    try{
      // Store old manager_user_id to invalidate old supervisor query if it changed
      const oldManagerUserId = p?.manager_user_id;
      
      // Save profile changes if any
      if(dirty) {
        console.log('Saving pending changes with work_eligibility_status:', pending.work_eligibility_status);
        if (canEdit || canEditGeneral) {
          await api('PUT', `/auth/users/${encodeURIComponent(String(userId||''))}/profile`, pending);
        } else if (canSelfEdit) {
          await api('PUT', `/auth/me/profile`, pending);
        } else {
          throw new Error('Not allowed');
        }
        setDirty(false);
        setPending({});
        
        // Invalidate and refetch user profile to get updated data
        await queryClient.invalidateQueries({ queryKey: ['userProfile', userId] });
        await queryClient.refetchQueries({ queryKey: ['userProfile', userId] });
        // Wait a bit for the refetch to complete
        await new Promise(resolve => setTimeout(resolve, 300));
        
        // If manager_user_id changed, invalidate both old and new supervisor queries
        const newManagerUserId = pending.manager_user_id !== undefined ? pending.manager_user_id : oldManagerUserId;
        if (oldManagerUserId !== newManagerUserId) {
          if (oldManagerUserId) {
            await queryClient.invalidateQueries({ queryKey: ['supervisor-profile', oldManagerUserId] });
          }
          if (newManagerUserId) {
            await queryClient.invalidateQueries({ queryKey: ['supervisor-profile', newManagerUserId] });
            await queryClient.refetchQueries({ queryKey: ['supervisor-profile', newManagerUserId] });
          }
        } else if (oldManagerUserId) {
          // Even if manager didn't change, refetch supervisor profile to ensure it's up to date
          await queryClient.invalidateQueries({ queryKey: ['supervisor-profile', oldManagerUserId] });
          await queryClient.refetchQueries({ queryKey: ['supervisor-profile', oldManagerUserId] });
        }
        
        // Invalidate users-options in case user data changed
        await queryClient.invalidateQueries({ queryKey: ['users-options'] });
      }
      
      // Save divisions if any changes
      if (divisionsDirty && (canEdit || canEditGeneral)) {
        await api('PUT', `/employees/${encodeURIComponent(String(userId||''))}/divisions`, selectedDivisions);
        setDivisionsDirty(false);
        // Invalidate and refetch user profile to get updated divisions
        await queryClient.invalidateQueries({ queryKey: ['userProfile', userId] });
        await queryClient.refetchQueries({ queryKey: ['userProfile', userId] });
        // Wait a bit for the refetch to complete
        await new Promise(resolve => setTimeout(resolve, 200));
        // The useEffect will automatically update selectedDivisions when u?.divisions changes
      }
      
      // Save project divisions if any changes
      if (projectDivisionsDirty && (canEdit || canEditGeneral)) {
        await api('PUT', `/employees/${encodeURIComponent(String(userId||''))}/project-divisions`, selectedProjectDivisions);
        setProjectDivisionsDirty(false);
        // Invalidate and refetch user profile to get updated project divisions
        await queryClient.invalidateQueries({ queryKey: ['userProfile', userId] });
        await queryClient.refetchQueries({ queryKey: ['userProfile', userId] });
      }
      
      // Save permissions if any
      if (permissionsDirty && permissionsRef.current) {
        await permissionsRef.current.save();
        setPermissionsDirty(false);
      }
      
      if (dirty || permissionsDirty || divisionsDirty || projectDivisionsDirty) {
        toast.success('Saved');
      }
    }catch(e: any){ 
      console.error('Save error:', e);
      toast.error(e?.message || e?.detail || 'Failed to save'); 
    }
  };

  // Use unsaved changes guard
  const hasUnsaved = dirty || permissionsDirty || divisionsDirty;
  useUnsavedChangesGuard(hasUnsaved, saveAll);
  
  const navigate = useNavigate();

  const handleAccountStatusChange = async (
    nextActive: boolean,
    options?: { skipDeactivateConfirm?: boolean },
  ): Promise<boolean> => {
    if (!userId || savingAccountStatus) return false;
    if (!nextActive && !options?.skipDeactivateConfirm) {
      const result = await confirm({
        title: 'Deactivate account',
        message:
          'This user will not be able to sign in or use the app until the account is activated again. Active sessions will be ended and access invites cannot be sent. Continue?',
        confirmText: 'Deactivate',
        cancelText: 'Cancel',
      });
      if (result !== 'confirm') return false;
    }
    setSavingAccountStatus(true);
    try {
      await api('PATCH', `/users/${encodeURIComponent(String(userId))}`, { is_active: nextActive });
      toast.success(nextActive ? 'Account activated' : 'Account deactivated');
      await queryClient.invalidateQueries({ queryKey: ['userProfile', userId] });
      await queryClient.invalidateQueries({ queryKey: ['user', userId] });
      if (!nextActive && me && String(me.id) === String(userId)) {
        localStorage.removeItem('user_token');
        window.location.replace('/login');
        return true;
      }
      return true;
    } catch (e: any) {
      toast.error(e?.message || e?.detail || 'Failed to update account status');
      return false;
    } finally {
      setSavingAccountStatus(false);
    }
  };

  const openAccountStatusModal = () => {
    setAccountStatusDraft(!!u?.is_active);
    setAccountStatusModalOpen(true);
  };

  const saveAccountStatusFromModal = async () => {
    const current = !!u?.is_active;
    if (accountStatusDraft === current) {
      setAccountStatusModalOpen(false);
      return;
    }
    const ok = await handleAccountStatusChange(accountStatusDraft, { skipDeactivateConfirm: true });
    if (ok) setAccountStatusModalOpen(false);
  };

  const todayLabel = useMemo(() => {
    return new Date().toLocaleDateString('en-CA', {
      weekday: 'long',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }, []);

  const userTabItems = useMemo(
    () =>
      ([
        ...(canViewGeneral || canSelfEdit ? (['personal', 'job', 'docs'] as const) : []),
        ...(canViewTimesheet || canSelfEdit ? (['timesheet'] as const) : []),
        ...(canViewLoans ? (['loans'] as const) : []),
        ...(canViewTraining ? (['training'] as const) : []),
        ...(canViewAssets ? (['assets'] as const) : []),
        ...(canViewReports ? (['reports'] as const) : []),
        ...(canViewReviews ? (['reviews'] as const) : []),
        ...(canViewPermissions ? (['permissions'] as const) : []),
        ...(canViewActivity ? (['activity'] as const) : []),
      ] as const).map((k) => ({ key: k, label: USER_TAB_LABELS[k] || k })),
    [
      canViewGeneral,
      canSelfEdit,
      canViewTimesheet,
      canViewLoans,
      canViewTraining,
      canViewAssets,
      canViewReports,
      canViewReviews,
      canViewPermissions,
      canViewActivity,
    ],
  );

  const employeeSubtitle =
    `${p.job_title || '—'}${
      u?.divisions && u.divisions.length > 0
        ? ` • ${u.divisions.map((d: any) => d.label).join(', ')}`
        : p.division
          ? ` • ${p.division}`
          : ''
    }`;

  return (
    <div className={uiCx('w-full min-w-0', uiSpacing.pageStack, 'min-h-full bg-gray-50')}>
      <AppPageHeader
        title="User Information"
        subtitle="Personal details, employment, and documents."
        icon={<UserIcon className="h-4 w-4" />}
        onBack={() => navigate('/users')}
        backLabel="Back to Users"
        actions={
          <div className={uiCx(uiLayout.actionsRow, 'flex-col items-end gap-2 sm:flex-row sm:items-center')}>
            {isAdmin && userId && !canSelfEdit ? (
              <AppButton
                type="button"
                variant="danger"
                size="sm"
                disabled={deletingUser}
                loading={deletingUser}
                title="Administrator only — permanently delete this user"
                onClick={async () => {
                  if (!userId || deletingUser) return;
                  const choice = await confirm({
                    title: 'Delete user',
                    message: `Permanently delete ${u?.username || String(userId)}? This removes the account and related data where the database allows. This cannot be undone.`,
                    confirmText: 'Delete user',
                    cancelText: 'Cancel',
                  });
                  if (choice !== 'confirm') return;
                  setDeletingUser(true);
                  try {
                    await api('DELETE', `/users/${encodeURIComponent(String(userId))}`);
                    toast.success('User deleted');
                    queryClient.invalidateQueries({ queryKey: ['user'] });
                    navigate('/users');
                  } catch (e: any) {
                    toast.error(e?.message || e?.detail || 'Failed to delete user');
                  } finally {
                    setDeletingUser(false);
                  }
                }}
              >
                {deletingUser ? 'Deleting…' : 'Delete user'}
              </AppButton>
            ) : null}
            {canEditGeneral && userId && u?.is_active ? (
              <AppButton
                type="button"
                size="sm"
                disabled={sendingAccessInvite}
                loading={sendingAccessInvite}
                title="Email username, password setup link, and login URL"
                onClick={async () => {
                  if (!userId || sendingAccessInvite) return;
                  setSendingAccessInvite(true);
                  try {
                    const res = await api<{
                      email_sent?: boolean;
                      email_error?: string | null;
                      reset_expires_hours?: number;
                    }>('POST', `/auth/users/${encodeURIComponent(String(userId))}/send-access-invite`, {});
                    if (res?.email_sent) {
                      toast.success(
                        `Access invite sent${typeof res.reset_expires_hours === 'number' ? ` (password link valid ${res.reset_expires_hours}h)` : ''}`,
                      );
                    } else if (res?.email_error) {
                      toast.error(String(res.email_error));
                    } else {
                      toast.error('Email was not sent. Check SMTP, MAIL_FROM, and PUBLIC_BASE_URL.');
                    }
                  } catch (e: any) {
                    toast.error(e?.message || e?.detail || 'Failed to send access invite');
                  } finally {
                    setSendingAccessInvite(false);
                  }
                }}
              >
                {sendingAccessInvite ? 'Sending…' : 'Send access invite'}
              </AppButton>
            ) : null}
            <div className="text-right">
              <div className={uiTypography.overline}>Today</div>
              <div className={uiCx(uiTypography.sectionTitle, 'mt-0.5')}>{todayLabel}</div>
            </div>
          </div>
        }
      />

      <div className={uiSpacing.pageStack}>
        <AppCard bodyClassName={uiCx(uiSpacing.cardPadding, 'relative')}>
          {isEmployeeCardMinimized ? (
            <div className="flex items-center gap-2 pr-8">
              <img
                className={uiCx('h-10 w-10 object-cover', uiRadius.control, uiBorders.subtle)}
                src={
                  p.profile_photo_file_id
                    ? withFileAccessToken(`/files/${p.profile_photo_file_id}/thumbnail?w=80`)
                    : '/ui/assets/placeholders/user.png'
                }
                alt={`${p.first_name || u?.username} ${p.last_name || ''}`}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <div className={uiCx(uiTypography.sectionTitle, 'truncate text-sm')}>
                      {p.first_name || u?.username} {p.last_name || ''}
                      {u?.username ? ` (${u.username})` : ''}
                    </div>
                    <div className={uiCx(uiTypography.helper, 'mt-0.5 truncate')}>{employeeSubtitle}</div>
                  </div>
                  <div className="shrink-0">
                    <UserAccountStatusBadge
                      isActive={u?.is_active}
                      saving={savingAccountStatus}
                      interactive={!!(canManageAccountStatus && userId && data)}
                      onClick={canManageAccountStatus && userId && data ? openAccountStatusModal : undefined}
                    />
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-3">
              <div className="flex shrink-0 flex-col items-center">
                <img
                  className={uiCx('h-24 w-24 border-2 border-gray-200 object-cover', uiRadius.card)}
                  src={
                    p.profile_photo_file_id
                      ? withFileAccessToken(`/files/${p.profile_photo_file_id}/thumbnail?w=240`)
                      : '/ui/assets/placeholders/user.png'
                  }
                  alt={`${p.first_name || u?.username} ${p.last_name || ''}`}
                />
                <div className="mt-2 flex w-full max-w-[9rem] flex-col items-center">
                  <UserAccountStatusBadge
                    isActive={u?.is_active}
                    saving={savingAccountStatus}
                    interactive={!!(canManageAccountStatus && userId && data)}
                    onClick={canManageAccountStatus && userId && data ? openAccountStatusModal : undefined}
                    className="w-full justify-center"
                  />
                </div>
              </div>
              <div className="min-w-0 flex-1">
                <div className="mb-2">
                  <h1 className={uiTypography.sectionTitle}>
                    {p.first_name || u?.username} {p.last_name || ''}
                    {u?.username ? ` (${u.username})` : ''}
                  </h1>
                  <div className={uiCx(uiTypography.helper, 'mt-0.5')}>{employeeSubtitle}</div>
                </div>
                <div className={uiCx('grid gap-x-3 gap-y-1.5 md:grid-cols-3')}>
                  <UserInfoHeroField label="Phone" value={p.phone || '—'} />
                  <UserInfoHeroField label="Personal Email" value={u?.email || u?.email_personal || '—'} />
                  <UserInfoHeroField label="Work Email" value={p.work_email || '—'} />
                  <UserInfoHeroField
                    label="Hire Date"
                    value={
                      <>
                        {p.hire_date ? String(p.hire_date).slice(0, 10) : '—'}
                        {p.hire_date ? ` (${tenure(p.hire_date)})` : ''}
                      </>
                    }
                  />
                  <UserInfoHeroField label="Supervisor" value={supervisorName || '—'} />
                  <UserInfoHeroField label="Age" value={calcAge(p.date_of_birth) || '—'} />
                </div>
              </div>
            </div>
          )}
          <AppButton
            type="button"
            variant="ghost"
            size="sm"
            className="absolute bottom-2 right-2 !h-7 !w-7 !p-0"
            onClick={() => setIsEmployeeCardMinimized(!isEmployeeCardMinimized)}
            title={isEmployeeCardMinimized ? 'Expand' : 'Minimize'}
            aria-label={isEmployeeCardMinimized ? 'Expand employee card' : 'Minimize employee card'}
          >
            <ChevronDown className={uiCx('h-3.5 w-3.5 transition-transform', isEmployeeCardMinimized ? '' : 'rotate-180')} />
          </AppButton>
        </AppCard>

        <AppCard bodyClassName={uiSpacing.cardPadding}>
          <AppTabs
            tabs={userTabItems}
            value={tab}
            onChange={(key) => void handleTabChange(key as typeof tab)}
          />
        </AppCard>
      </div>

      <AppCard bodyClassName={uiSpacing.cardPadding}>
          {isLoading? <div className={uiCx('h-24 animate-pulse rounded bg-gray-100', uiRadius.control)}/> : (
            <>
              {!canViewGeneral && !canViewTimesheet && !canViewLoans && !canViewTraining && !canViewAssets && !canViewReports && !canViewReviews && !canViewPermissions && !canViewActivity && !canSelfEdit && (
                <AppEmptyState
                  title="Access Denied"
                  description="You do not have permission to view this user's information."
                  className="border-0 bg-transparent p-0 shadow-none"
                />
              )}
              {tab==='personal' && canViewGeneral && (
                <div className="space-y-6">
                  <BasicInformationSection 
                    p={p} 
                    editable={false}
                    userId={String(userId)} 
                    profileData={data}
                    onEditClick={() => openPersonalEditModal('basic')}
                    canEdit={canEditGeneral || !!canSelfEdit}
                  />
                  <AddressSectionCard 
                    p={p} 
                    editable={false}
                    userId={String(userId)} 
                    selfEdit={!!canSelfEdit}
                    onEditClick={() => openPersonalEditModal('address')}
                    canEdit={canEditGeneral || !!canSelfEdit}
                  />
                  <ContactSection 
                    p={p} 
                    editable={false}
                    userId={String(userId)} 
                    selfEdit={!!canSelfEdit}
                    onEditClick={() => openPersonalEditModal('contact')}
                    canEdit={canEditGeneral || !!canSelfEdit}
                  />
                  <EducationSectionCard 
                    userId={String(userId)} 
                    canEdit={false}
                    onEditClick={() => openPersonalEditModal('education')}
                    canEditButton={canEditGeneral || !!canSelfEdit}
                  />
                  <LegalDocumentsSection 
                    p={p} 
                    editable={false}
                    userId={String(userId)} 
                    onEditClick={() => openPersonalEditModal('legal')}
                    canEdit={canEditGeneral || !!canSelfEdit}
                    canSelfEdit={!!canSelfEdit}
                  />
                  <EmergencyContactsSectionCard 
                    userId={String(userId)} 
                    canEdit={false}
                    onEditClick={() => openPersonalEditModal('emergency')}
                    canEditButton={canEditGeneral || !!canSelfEdit}
                  />
                </div>
              )}
              {tab==='job' && canViewGeneral && (
                <div className="space-y-6">
                  <OrganizationSection 
                    p={p} 
                    editable={false}
                    userId={String(userId)} 
                    usersOptions={usersOptions||[]}
                    canViewCompensation={canViewJobCompensation} 
                    settings={settings} 
                    userDivisions={u?.divisions || []}
                    selectedDivisions={selectedDivisions}
                    selectedProjectDivisions={selectedProjectDivisions}
                    onEditClick={(canEditGeneral || !!canSelfEdit) ? () => openJobEditModal('organization') : undefined}
                  />
                  {canViewJobCompensation && (
                    <SalarySection
                      p={p}
                      editable={false}
                      userId={String(userId)}
                      settings={settings}
                      canEdit={canEditGeneral}
                      onEditClick={() => openJobEditModal('salary')}
                    />
                  )}
                  <TimeOffSection userId={String(userId)} canEdit={canEditGeneral} />
                </div>
              )}
              {tab==='docs' && canViewGeneral && <UserDocuments userId={String(userId)} canEdit={canEditGeneral} />}
              {tab==='timesheet' && canViewTimesheet && <TimesheetBlock userId={String(userId)} canEdit={canEditTimesheet} />}
              {tab==='loans' && canViewLoans && <UserLoans userId={String(userId)} canEdit={canEditGeneral || (me?.roles || []).some((r: string) => String(r || '').toLowerCase() === 'admin') || (me?.permissions || []).includes('hr:users:write') || (me?.permissions || []).includes('users:write')} />}
              {tab==='training' && canViewTraining && (
                <div className="space-y-6 pb-24">
                  <EmployeeTrainingSection variant="user" userId={String(userId)} canEdit={canEditTraining} />
                </div>
              )}
              {tab==='assets' && canViewAssets && (
                <UserAssetsSection
                  userId={String(userId)}
                  canEditEquipment={canEditAssets}
                  canEditFleet={canEditFleetAssets}
                />
              )}
              {tab==='reports' && canViewReports && <UserReports userId={String(userId)} canEdit={canEditGeneral || (me?.roles || []).some((r: string) => String(r || '').toLowerCase() === 'admin') || (me?.permissions || []).includes('hr:users:write') || (me?.permissions || []).includes('users:write')} />}
              {tab === 'reviews' && canViewReviews && userId && (
                <UserEmployeeReviewsTab
                  userId={String(userId)}
                  enabled={tab === 'reviews'}
                  canImportLegacy={canImportLegacyReviews}
                />
              )}
              {tab==='permissions' && canViewPermissions && <UserPermissions ref={permissionsRef} userId={String(userId)} onDirtyChange={setPermissionsDirty} canEdit={canEditPermissions} />}
              {tab === 'activity' && canViewActivity && userId && <UserActivityLogTab userId={String(userId)} />}
            </>
          )}
      </AppCard>
      {(tab === 'permissions' && canEditPermissions) && (
        <div className="fixed bottom-0 left-0 right-0 z-40">
          <div className="mx-auto max-w-[1200px] px-4">
            <AppCard className={uiCx('mb-3', uiShadows.hero)} bodyClassName={uiCx(uiSpacing.cardPadding, uiLayout.actionsRow)}>
              <div className={uiCx(uiTypography.helper, permissionsDirty ? 'text-amber-700' : 'text-green-700')}>
                {permissionsDirty ? 'You have unsaved changes' : 'All changes saved'}
              </div>
              <AppButton
                type="button"
                size="sm"
                className="ml-auto"
                disabled={!permissionsDirty}
                onClick={async () => {
                  await permissionsRef.current?.save();
                }}
              >
                Save
              </AppButton>
            </AppCard>
          </div>
        </div>
      )}

      <AppCard bodyClassName={uiSpacing.cardPadding}>
        <AppSectionHeader title="Record audit" />
        <div className={uiCx(uiTypography.helper, 'mt-3 space-y-1')}>
          <div>
            <span className="font-semibold text-gray-800">Last profile change: </span>
            {(() => {
              const iso = p?.updated_at;
              if (!iso) return '—';
              try {
                return new Date(iso as string).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
              } catch {
                return '—';
              }
            })()}
            {p?.updated_by_name ? <span className="text-gray-700"> · {p.updated_by_name}</span> : null}
          </div>
          <p className="text-gray-500">
            Updates automatically when someone saves this employee (profile, departments, or account fields). This is separate from the manual{' '}
            <span className="font-medium text-gray-700">Last Update Sync (Bamboo files)</span> field.
          </p>
        </div>
      </AppCard>

      <AppModal
        open={accountStatusModalOpen}
        onClose={() => {
          if (!savingAccountStatus) setAccountStatusModalOpen(false);
        }}
        size="sm"
        title="Account status"
        description="Controls whether this person can sign in to MK Hub. This is separate from employment status on the Job tab (hire / termination dates)."
        footer={
          <div className={uiCx(uiLayout.actionsRow, 'w-full justify-end')}>
            <AppButton
              type="button"
              variant="secondary"
              size="sm"
              disabled={savingAccountStatus}
              onClick={() => setAccountStatusModalOpen(false)}
            >
              Cancel
            </AppButton>
            <AppButton
              type="button"
              size="sm"
              disabled={savingAccountStatus}
              loading={savingAccountStatus}
              onClick={() => void saveAccountStatusFromModal()}
            >
              {savingAccountStatus ? 'Saving…' : 'Save'}
            </AppButton>
          </div>
        }
      >
        <fieldset className={uiSpacing.sectionStack}>
          <legend className="sr-only">Account status</legend>
          <label
            className={uiCx(
              'flex cursor-pointer items-start gap-3 rounded-lg border p-3',
              accountStatusDraft ? 'border-green-300 bg-green-50/60' : 'border-gray-200 hover:bg-gray-50/80',
            )}
          >
            <input
              type="radio"
              name="account-status"
              className="mt-0.5 text-brand-red focus:ring-brand-red"
              checked={accountStatusDraft === true}
              disabled={savingAccountStatus}
              onChange={() => setAccountStatusDraft(true)}
            />
            <span>
              <span className={uiTypography.sectionTitle}>Active</span>
              <span className={uiCx(uiTypography.helper, 'mt-0.5 block')}>Can sign in and use the app.</span>
            </span>
          </label>
          <label
            className={uiCx(
              'flex cursor-pointer items-start gap-3 rounded-lg border p-3',
              !accountStatusDraft ? 'border-red-300 bg-red-50/60' : 'border-gray-200 hover:bg-gray-50/80',
            )}
          >
            <input
              type="radio"
              name="account-status"
              className="mt-0.5 text-brand-red focus:ring-brand-red"
              checked={accountStatusDraft === false}
              disabled={savingAccountStatus}
              onChange={() => setAccountStatusDraft(false)}
            />
            <span>
              <span className={uiTypography.sectionTitle}>Inactive</span>
              <span className={uiCx(uiTypography.helper, 'mt-0.5 block')}>
                Cannot sign in; sessions end; access invites cannot be sent until reactivated.
              </span>
            </span>
          </label>
        </fieldset>
      </AppModal>

      <AppFormModal
        open={personalEditSection === 'basic'}
        onClose={closePersonalEditModal}
        title="Edit Basic Information"
        description="Legal name and identity details for this employee."
        formWidth="comfortable"
        quickInfo={userBasicInfoQuickInfo}
        footer={
          <div className={uiCx(uiLayout.actionsRow, 'w-full justify-end')}>
            <AppButton type="button" variant="secondary" size="sm" onClick={closePersonalEditModal}>
              Cancel
            </AppButton>
            <AppButton type="button" size="sm" loading={sectionModalSaving} disabled={sectionModalSaving} onClick={saveSectionModalProfile}>
              Save
            </AppButton>
          </div>
        }
      >
        <BasicInformationSection
          embedded
          p={p}
          editable
          selfEdit={!!canSelfEdit}
          userId={String(userId)}
          profileData={data}
          collectChanges={collectSectionModalChanges}
        />
      </AppFormModal>

      <AppFormModal
        open={personalEditSection === 'address'}
        onClose={closePersonalEditModal}
        title="Edit Address"
        description="Primary mailing and location address."
        formWidth="wide"
        quickInfo={userAddressQuickInfo}
        footer={
          <div className={uiCx(uiLayout.actionsRow, 'w-full justify-end')}>
            <AppButton type="button" variant="secondary" size="sm" onClick={closePersonalEditModal}>
              Cancel
            </AppButton>
            <AppButton type="button" size="sm" loading={sectionModalSaving} disabled={sectionModalSaving} onClick={saveSectionModalProfile}>
              Save
            </AppButton>
          </div>
        }
      >
        <AddressSectionCard
          embedded
          p={p}
          editable
          selfEdit={!!canSelfEdit}
          userId={String(userId)}
          collectChanges={collectSectionModalChanges}
        />
      </AppFormModal>

      <AppFormModal
        open={personalEditSection === 'contact'}
        onClose={closePersonalEditModal}
        title="Edit Contact"
        description="Personal phone numbers for reaching this employee."
        formWidth="comfortable"
        quickInfo={userContactQuickInfo}
        footer={
          <div className={uiCx(uiLayout.actionsRow, 'w-full justify-end')}>
            <AppButton type="button" variant="secondary" size="sm" onClick={closePersonalEditModal}>
              Cancel
            </AppButton>
            <AppButton type="button" size="sm" loading={sectionModalSaving} disabled={sectionModalSaving} onClick={saveSectionModalProfile}>
              Save
            </AppButton>
          </div>
        }
      >
        <ContactSection
          embedded
          p={p}
          editable
          selfEdit={!!canSelfEdit}
          userId={String(userId)}
          collectChanges={collectSectionModalChanges}
        />
      </AppFormModal>

      <AppFormModal
        open={personalEditSection === 'education'}
        onClose={closePersonalEditModal}
        title="Edit Education"
        description="Degrees and institutions on file."
        formWidth="wide"
        quickInfo={userEducationQuickInfo}
        footer={
          <div className={uiCx(uiLayout.actionsRow, 'w-full justify-end')}>
            <AppButton type="button" variant="secondary" size="sm" onClick={closePersonalEditModal}>
              Done
            </AppButton>
          </div>
        }
      >
        <EducationSectionCard embedded userId={String(userId)} canEdit={canEditGeneral || !!canSelfEdit} />
      </AppFormModal>

      <AppFormModal
        open={personalEditSection === 'legal'}
        onClose={closePersonalEditModal}
        title="Edit Legal & Documents"
        description="SIN, work eligibility, and supporting documents."
        formWidth="wide"
        quickInfo={userLegalDocumentsQuickInfo}
        footer={
          <div className={uiCx(uiLayout.actionsRow, 'w-full justify-end')}>
            <AppButton type="button" variant="secondary" size="sm" onClick={closePersonalEditModal}>
              Cancel
            </AppButton>
            <AppButton type="button" size="sm" loading={sectionModalSaving} disabled={sectionModalSaving} onClick={saveSectionModalProfile}>
              Save
            </AppButton>
          </div>
        }
      >
        <LegalDocumentsSection
          embedded
          p={p}
          editable
          userId={String(userId)}
          collectChanges={collectSectionModalChanges}
          pending={sectionModalPending}
          canSelfEdit={!!canSelfEdit}
        />
      </AppFormModal>

      <AppFormModal
        open={personalEditSection === 'emergency'}
        onClose={closePersonalEditModal}
        title="Edit Emergency Contacts"
        description="People to contact in an emergency."
        formWidth="wide"
        quickInfo={userEmergencyContactsQuickInfo}
        footer={
          <div className={uiCx(uiLayout.actionsRow, 'w-full justify-end')}>
            <AppButton type="button" variant="secondary" size="sm" onClick={closePersonalEditModal}>
              Done
            </AppButton>
          </div>
        }
      >
        <EmergencyContactsSectionCard embedded userId={String(userId)} canEdit={canEditGeneral || !!canSelfEdit} />
      </AppFormModal>

      <AppFormModal
        open={jobEditSection === 'organization'}
        onClose={closeJobEditModal}
        title="Edit Organization"
        description="Job title, supervisor, departments, and work contact details."
        formWidth="wide"
        quickInfo={userOrganizationQuickInfo}
        footer={
          <div className={uiCx(uiLayout.actionsRow, 'w-full justify-end')}>
            <AppButton type="button" variant="secondary" size="sm" onClick={closeJobEditModal}>
              Cancel
            </AppButton>
            <AppButton type="button" size="sm" loading={sectionModalSaving} disabled={sectionModalSaving} onClick={saveOrganizationModal}>
              Save
            </AppButton>
          </div>
        }
      >
        <OrganizationSection
          embedded
          p={p}
          editable
          userId={String(userId)}
          collectChanges={collectSectionModalChanges}
          usersOptions={usersOptions || []}
          settings={settings}
          userDivisions={u?.divisions || []}
          selectedDivisions={orgModalDivisions}
          onDivisionsChange={(divisions) => {
            setOrgModalDivisions(divisions);
            setOrgModalDivisionsDirty(true);
          }}
          selectedProjectDivisions={orgModalProjectDivisions}
          onProjectDivisionsChange={(divisions) => {
            setOrgModalProjectDivisions(divisions);
            setOrgModalProjectDivisionsDirty(true);
            collectSectionModalChanges({ project_division_ids: divisions });
          }}
        />
      </AppFormModal>

      <AppFormModal
        open={jobEditSection === 'salary'}
        onClose={closeJobEditModal}
        title="Edit Salary"
        description="Current pay rate and type on file."
        formWidth="comfortable"
        quickInfo={userSalaryQuickInfo}
        footer={
          <div className={uiCx(uiLayout.actionsRow, 'w-full justify-end')}>
            <AppButton type="button" variant="secondary" size="sm" onClick={closeJobEditModal}>
              Cancel
            </AppButton>
            <AppButton type="button" size="sm" loading={sectionModalSaving} disabled={sectionModalSaving} onClick={saveSalaryModal}>
              Save
            </AppButton>
          </div>
        }
      >
        <SalarySection
          embedded
          p={p}
          editable
          userId={String(userId)}
          collectChanges={collectSectionModalChanges}
          settings={settings}
          canEdit={canEditGeneral}
        />
      </AppFormModal>

      {canEdit && (
        <AppCard bodyClassName={uiSpacing.cardPadding}>
          <AppSectionHeader
            title="BambooHR Integration"
            description="Sync profile data, photo, and documents from BambooHR."
          />
          <div className={uiCx(uiLayout.actionsRow, 'mt-3 flex-wrap')}>
            <SyncBambooHRButton userId={String(userId)} onSuccess={() => { window.location.reload(); }} />
            <SyncPhotoButton userId={String(userId)} onSuccess={() => { window.location.reload(); }} />
            <SyncDocumentsButton userId={String(userId)} onSuccess={() => { window.location.reload(); }} />
          </div>
          {userId ? (
            <BambooFilesLastSyncRow
              userId={String(userId)}
              lastSyncIso={p.bamboo_files_last_sync_at}
              isAdmin={isAdmin}
            />
          ) : null}
        </AppCard>
      )}
    </div>
  );
}

function LabelVal({label, value}:{label:string, value:any}){
  return (
    <div>
      <div className="text-sm text-gray-600">{label}</div>
      <div className="font-medium break-words">{String(value??'')}</div>
    </div>
  );
}

type UserPersonalEditSection = 'basic' | 'address' | 'contact' | 'education' | 'legal' | 'emergency';
type UserJobEditSection = 'organization' | 'salary';

function EditableGrid({p, fields, editable, selfEdit, userId, collectChanges, inlineSave=true, fieldOptions, onSaved, showFieldHints}:{p:any, fields:[string,string][], editable:boolean, selfEdit:boolean, userId:string, collectChanges?: (kv:Record<string,any>)=>void, inlineSave?: boolean, fieldOptions?: Record<string, string[]>, onSaved?: () => void, showFieldHints?: boolean}){
  const [form, setForm] = useState<any>(()=>({ ...p }));
  const [isSaving, setIsSaving] = useState(false);
  const prevEditableRef = useRef(editable);
  useEffect(() => {
    // When entering edit mode, initialize form with current p values
    if (editable && !prevEditableRef.current) {
      setForm({ ...p });
    }
    // When exiting edit mode, update form with latest p values
    if (!editable && prevEditableRef.current) {
      setForm({ ...p });
    }
    prevEditableRef.current = editable;
  }, [editable, p]);
  const save = async()=>{
    try{
      if (editable) {
        await api('PUT', `/auth/users/${encodeURIComponent(userId)}/profile`, form);
      } else if (selfEdit) {
        await api('PUT', `/auth/me/profile`, form);
      } else {
        throw new Error('Not allowed');
      }
      toast.success('Saved');
      onSaved?.();
    }catch(_e){ toast.error('Failed to save'); }
  };
  // Only make editable if explicitly set to editable (not just because selfEdit is true)
  const isEditable = !!editable;
  
  // Phone formatting function (same as in emergency contacts)
  const formatPhone = (v:string)=>{
    const d = String(v||'').replace(/\D+/g,'').slice(0,11);
    if (d.length<=3) return d;
    if (d.length<=6) return `(${d.slice(0,3)}) ${d.slice(3)}`;
    if (d.length<=10) return `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`;
    return `+${d.slice(0,1)} (${d.slice(1,4)}) ${d.slice(4,7)}-${d.slice(7,11)}`;
  };

  // SIN Number formatting function (NNN-NNN-NNN)
  const formatSIN = (v:string)=>{
    const d = String(v||'').replace(/\D+/g,'').slice(0,9);
    if (d.length<=3) return d;
    if (d.length<=6) return `${d.slice(0,3)}-${d.slice(3)}`;
    return `${d.slice(0,3)}-${d.slice(3,6)}-${d.slice(6)}`;
  };
  
  const genderOptions = ['Male', 'Female', 'Other', 'Prefer not to say'];
  const maritalStatusOptions = ['Single', 'Married', 'Common-law', 'Divorced', 'Widowed', 'Prefer not to say'];
  
  const setField = (key: string, value: string) => {
    setForm((s: any) => ({ ...s, [key]: value }));
    collectChanges && collectChanges({ [key]: value });
  };

  return (
    <div>
      <div className="grid gap-4 md:grid-cols-2">
        {fields.map(([label, key]) => {
          const options =
            fieldOptions?.[key] || (key === 'gender' ? genderOptions : key === 'marital_status' ? maritalStatusOptions : null);
          const readValue =
            key === 'date_of_birth' || key === 'hire_date' || key === 'termination_date'
              ? String(p[key] ?? '').slice(0, 10)
              : String(p[key] ?? '');

          const hint = showFieldHints ? userProfileFieldHint(key) : undefined;

          return (
            <div key={key}>
              {isEditable ? (
                key === 'date_of_birth' || key === 'hire_date' || key === 'termination_date' ? (
                  <AppDatePicker
                    label={label}
                    value={(form[key] || '').slice(0, 10)}
                    onChange={(e) => setField(key, e.target.value)}
                    fieldHint={hint}
                  />
                ) : key === 'nationality' ? (
                  <div className="space-y-1.5">
                    <AppControlLabelRow
                      label={label}
                      fieldHint={hint ? <AppFieldHint hint={hint} /> : undefined}
                    />
                    <NationalitySelect
                      value={form[key] || ''}
                      onChange={(v) => setField(key, v)}
                      className="w-full"
                    />
                  </div>
                ) : options ? (
                  <AppSelect
                    label={label}
                    placeholder="Select..."
                    value={form[key] || ''}
                    onChange={(e) => setField(key, e.target.value)}
                    options={options.map((opt) => ({ value: opt, label: opt }))}
                    fieldHint={hint}
                  />
                ) : key === 'phone' || key === 'mobile_phone' ? (
                  <AppInput
                    label={label}
                    value={form[key] || ''}
                    onChange={(e) => setField(key, formatPhone(e.target.value))}
                    fieldHint={hint}
                  />
                ) : key === 'sin_number' ? (
                  <AppInput
                    label={label}
                    value={form[key] || ''}
                    onChange={(e) => setField(key, formatSIN(e.target.value))}
                    maxLength={11}
                    placeholder="123-456-789"
                    fieldHint={hint}
                  />
                ) : (
                  <AppInput
                    label={label}
                    value={form[key] || ''}
                    onChange={(e) => setField(key, e.target.value)}
                    fieldHint={hint}
                  />
                )
              ) : (
                <UserInfoReadOnlyField label={label} value={readValue} />
              )}
            </div>
          );
        })}
      </div>
      {isEditable && inlineSave ? (
        <div className="mt-4 text-right">
          <AppButton type="button" size="sm" disabled={isSaving} loading={isSaving} onClick={save}>
            {isSaving ? 'Saving...' : 'Save'}
          </AppButton>
        </div>
      ) : null}
    </div>
  );
}

function ClothSizeField({ p, editable, userId, collectChanges, profileData, showFieldHints }: { p: any; editable: boolean; userId: string; collectChanges?: (kv: Record<string, any>) => void; profileData?: any; showFieldHints?: boolean }) {
  const queryClient = useQueryClient();
  // Use refetched data if available, otherwise use p prop
  const currentProfile = profileData?.profile || p;
  const [form, setForm] = useState<any>(() => ({ cloth_size: currentProfile.cloth_size || '' }));
  const [customSizes, setCustomSizes] = useState<string[]>(() => {
    // Initialize custom sizes from profile if available (now global)
    const custom = currentProfile.cloth_sizes_custom;
    if (custom && Array.isArray(custom)) {
      return custom;
    }
    return [];
  });
  const prevEditableRef = useRef(editable);
  
  // Update custom sizes when profile data changes (after refetch)
  useEffect(() => {
    const custom = currentProfile.cloth_sizes_custom;
    if (custom && Array.isArray(custom)) {
      setCustomSizes(custom);
    } else {
      setCustomSizes([]);
    }
  }, [currentProfile.cloth_sizes_custom]);
  
  useEffect(() => {
    if (editable && !prevEditableRef.current) {
      setForm({ cloth_size: currentProfile.cloth_size || '' });
    }
    if (!editable && prevEditableRef.current) {
      setForm({ cloth_size: currentProfile.cloth_size || '' });
    }
    prevEditableRef.current = editable;
  }, [editable, currentProfile.cloth_size]);
  
  // Refresh custom sizes from backend
  const handleRefreshCustomSizes = async () => {
    // Invalidate both user profile and my profile queries to refetch custom sizes
    await queryClient.invalidateQueries({ queryKey: ['userProfile', userId] });
    await queryClient.invalidateQueries({ queryKey: ['meProfile'] });
    // Refetch and wait for completion
    await Promise.all([
      queryClient.refetchQueries({ queryKey: ['userProfile', userId] }),
      queryClient.refetchQueries({ queryKey: ['meProfile'] })
    ]);
  };
  
  const isEditable = !!editable;
  
  return (
    <div>
      {isEditable ? (
        <div className="space-y-1.5">
          <AppControlLabelRow
            label="Cloth Size"
            fieldHint={
              showFieldHints && userProfileFieldHint('cloth_size') ? (
                <AppFieldHint hint={userProfileFieldHint('cloth_size')!} />
              ) : undefined
            }
          />
          <ClothSizeSelect
            value={form.cloth_size || ''}
            onChange={(value) => {
              setForm((s: any) => ({ ...s, cloth_size: value }));
              collectChanges && collectChanges({ cloth_size: value });
            }}
            allowCustom={true}
            customSizes={customSizes}
            useGlobalCustomSizes={true}
            onRefreshCustomSizes={handleRefreshCustomSizes}
            className="w-full"
          />
        </div>
      ) : (
        <UserInfoReadOnlyField label="Cloth Size" value={String(p.cloth_size || '')} />
      )}
    </div>
  );
}

function AddressSection({ p, editable, selfEdit, userId, collectChanges, inlineSave=true, onSaved, showFieldHints }:{ p:any, editable:boolean, selfEdit:boolean, userId:string, collectChanges?: (kv:Record<string,any>)=>void, inlineSave?: boolean, onSaved?: () => void, showFieldHints?: boolean }){
  const [form, setForm] = useState<any>(()=>({
    address_line1: p.address_line1||'',
    address_line1_complement: p.address_line1_complement||'',
    address_line2: p.address_line2||'',
    address_line2_complement: p.address_line2_complement||'',
    city: p.city||'',
    province: p.province||'',
    postal_code: p.postal_code||'',
    country: p.country||'',
  }));
  const [isSaving, setIsSaving] = useState(false);
  
  // Update form when profile data changes
  useEffect(() => {
    setForm({
      address_line1: p.address_line1||'',
      address_line1_complement: p.address_line1_complement||'',
      address_line2: p.address_line2||'',
      address_line2_complement: p.address_line2_complement||'',
      city: p.city||'',
      province: p.province||'',
      postal_code: p.postal_code||'',
      country: p.country||'',
    });
  }, [p.address_line1, p.address_line1_complement, p.address_line2, p.address_line2_complement, p.city, p.province, p.postal_code, p.country]);
  const save = async()=>{
    if (isSaving) return;
    try{
      setIsSaving(true);
      if (editable) {
        await api('PUT', `/auth/users/${encodeURIComponent(userId)}/profile`, form);
      } else if (selfEdit) {
        await api('PUT', `/auth/me/profile`, form);
      } else {
        throw new Error('Not allowed');
      }
      toast.success('Saved');
      onSaved?.();
    }catch(_e){ toast.error('Failed to save'); }
    finally{ setIsSaving(false); }
  };
  // Only make editable if explicitly set to editable (not just because selfEdit is true)
  const isEditable = !!editable;
  const addressHint = (key: string) =>
    showFieldHints && userProfileFieldHint(key) ? <AppFieldHint hint={userProfileFieldHint(key)!} /> : undefined;

  return (
    <div>
      <div className="grid md:grid-cols-2 gap-4">
        {/* Left column: Address lines and Postal code */}
        <div className="space-y-4">
          <div>
            {isEditable? (
              <div className="space-y-1.5">
                <AppControlLabelRow label="Address line 1" fieldHint={addressHint('address_line1')} />
              <AddressAutocomplete
                value={form.address_line1 || ''}
                onChange={(value) => {
                  setForm((s:any)=>({ ...s, address_line1: value }));
                  collectChanges && collectChanges({ address_line1: value });
                }}
                onAddressSelect={(address) => {
                  setForm((currentForm: any) => {
                    const updatedForm = {
                      ...currentForm,
                      address_line1: address.address_line1 !== undefined ? address.address_line1 : currentForm.address_line1,
                      city: address.city !== undefined ? address.city : currentForm.city,
                      province: address.province !== undefined ? address.province : currentForm.province,
                      postal_code: address.postal_code !== undefined ? address.postal_code : currentForm.postal_code,
                      country: address.country !== undefined ? address.country : currentForm.country,
                    };
                    // Call collectChanges with the updated form
                    if (collectChanges) {
                      collectChanges({
                        address_line1: updatedForm.address_line1,
                        city: updatedForm.city,
                        province: updatedForm.province,
                        postal_code: updatedForm.postal_code,
                        country: updatedForm.country,
                      });
                    }
                    return updatedForm;
                  });
                }}
                placeholder="Start typing an address..."
                className="w-full rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs text-gray-900 focus:ring-1 focus:ring-gray-400 focus:border-gray-400"
              />
              </div>
            ) : (
              <UserInfoReadOnlyField label="Address line 1" value={String(p.address_line1 || '')} />
            )}
          </div>
          <div>
            {isEditable? (
              <div className="space-y-1.5">
                <AppControlLabelRow label="Address line 2" fieldHint={addressHint('address_line2')} />
              <AddressAutocomplete
                value={form.address_line2 || ''}
                onChange={(value) => {
                  setForm((s:any)=>({ ...s, address_line2: value }));
                  collectChanges && collectChanges({ address_line2: value });
                }}
                placeholder="Start typing an address..."
                className="w-full rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs text-gray-900 focus:ring-1 focus:ring-gray-400 focus:border-gray-400"
              />
              </div>
            ) : (
              <UserInfoReadOnlyField label="Address line 2" value={String(p.address_line2 || '')} />
            )}
          </div>
          <div>
            {isEditable ? (
              <AppInput
                label="Postal code"
                value={form.postal_code || ''}
                onChange={(e) => {
                  setForm((s: any) => ({ ...s, postal_code: e.target.value }));
                  collectChanges && collectChanges({ postal_code: e.target.value });
                }}
                fieldHint={showFieldHints ? userProfileFieldHint('postal_code') : undefined}
              />
            ) : (
              <UserInfoReadOnlyField label="Postal code" value={String(p.postal_code || '')} />
            )}
          </div>
        </div>
        
        {/* Right column: City, Province, Country */}
        <div className="space-y-4">
          <div>
            {isEditable ? (
              <AppInput
                label="City"
                value={form.city || ''}
                onChange={(e) => {
                  setForm((s: any) => ({ ...s, city: e.target.value }));
                  collectChanges && collectChanges({ city: e.target.value });
                }}
                fieldHint={showFieldHints ? userProfileFieldHint('city') : undefined}
              />
            ) : (
              <UserInfoReadOnlyField label="City" value={String(p.city || '')} />
            )}
          </div>
          <div>
            {isEditable ? (
              <AppInput
                label="Province/State"
                value={form.province || ''}
                onChange={(e) => {
                  setForm((s: any) => ({ ...s, province: e.target.value }));
                  collectChanges && collectChanges({ province: e.target.value });
                }}
                fieldHint={showFieldHints ? userProfileFieldHint('province') : undefined}
              />
            ) : (
              <UserInfoReadOnlyField label="Province/State" value={String(p.province || '')} />
            )}
          </div>
          <div>
            {isEditable ? (
              <AppInput
                label="Country"
                value={form.country || ''}
                onChange={(e) => {
                  setForm((s: any) => ({ ...s, country: e.target.value }));
                  collectChanges && collectChanges({ country: e.target.value });
                }}
                fieldHint={showFieldHints ? userProfileFieldHint('country') : undefined}
              />
            ) : (
              <UserInfoReadOnlyField label="Country" value={String(p.country || '')} />
            )}
          </div>
        </div>
      </div>
      {isEditable && inlineSave ? (
        <div className="mt-4 text-right">
          <AppButton type="button" size="sm" disabled={isSaving} loading={isSaving} onClick={save}>
            {isSaving ? 'Saving...' : 'Save'}
          </AppButton>
        </div>
      ) : null}
    </div>
  );
}

function SectionGrid({ p, keys }:{ p:any, keys:string[] }){
  return (
    <div className="grid md:grid-cols-2 gap-4">
      {keys.map((k)=> (
        <div key={k}>
          <div className="text-sm text-gray-600">{k.replace(/_/g,' ').replace(/^./,s=>s.toUpperCase())}</div>
          <div className="font-medium break-words">{String((k==='date_of_birth'||k==='hire_date'||k==='termination_date')? (p[k]||'').slice(0,10) : (p[k]||''))}</div>
        </div>
      ))}
    </div>
  );
}

const EDUCATION_LIST_MIN_WIDTH = 'min-w-[520px]';
const EDUCATION_LIST_GRID_EDIT = 'grid-cols-[minmax(0,2.2fr)_minmax(0,1.6fr)_minmax(0,1.2fr)_auto]';
const EDUCATION_LIST_GRID_READ = 'grid-cols-[minmax(0,2.2fr)_minmax(0,1.6fr)_minmax(0,1.2fr)]';

function formatEducationPeriod(start?: string | null, end?: string | null): string {
  const fmt = (d?: string | null) => {
    if (!d) return '';
    try {
      const iso = d.length === 7 ? `${d}-01` : d;
      return new Date(iso).toLocaleDateString('en-CA', { month: 'short', year: 'numeric' });
    } catch {
      return String(d).slice(0, 7);
    }
  };
  const from = fmt(start);
  const to = fmt(end);
  if (from && to) return `${from} — ${to}`;
  if (from) return `${from} — Present`;
  return to || '—';
}

function EducationSection({
  userId,
  canEdit,
  showFieldHints,
  embedded,
}: {
  userId: string;
  canEdit: boolean;
  showFieldHints?: boolean;
  embedded?: boolean;
}) {
  const confirm = useConfirm();
  const { data: rows, refetch, isLoading } = useQuery({
    queryKey: ['education', userId],
    queryFn: () => api<any[]>('GET', `/auth/users/${encodeURIComponent(userId)}/education`),
  });
  const [showAdd, setShowAdd] = useState(false);
  const [inst, setInst] = useState('');
  const [degree, setDegree] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [isAddingEducation, setIsAddingEducation] = useState(false);
  const listGrid = canEdit ? EDUCATION_LIST_GRID_EDIT : EDUCATION_LIST_GRID_READ;

  const resetAddForm = () => {
    setInst('');
    setDegree('');
    setStart('');
    setEnd('');
  };

  const closeAddModal = () => {
    setShowAdd(false);
    resetAddForm();
  };

  const add = async () => {
    if (isAddingEducation) return;
    try {
      if (!inst.trim()) {
        toast.error('Institution required');
        return;
      }
      setIsAddingEducation(true);
      const startDate = start ? `${start.slice(0, 7)}-01` : null;
      const endDate = end ? `${end.slice(0, 7)}-01` : null;
      await api('POST', `/auth/users/${encodeURIComponent(userId)}/education`, {
        college_institution: inst,
        degree,
        start_date: startDate,
        end_date: endDate,
      });
      toast.success('Added');
      closeAddModal();
      await refetch();
    } catch (_e) {
      toast.error('Failed');
    } finally {
      setIsAddingEducation(false);
    }
  };

  const del = async (id: string) => {
    const result = await confirm({
      title: 'Delete education record',
      message: 'Remove this school or degree from the profile?',
      confirmText: 'Delete',
      cancelText: 'Cancel',
    });
    if (result !== 'confirm') return;
    try {
      await api('DELETE', `/auth/users/${encodeURIComponent(userId)}/education/${encodeURIComponent(id)}`);
      toast.success('Deleted');
      await refetch();
    } catch (_e) {
      toast.error('Failed');
    }
  };

  const educationList = (
    <AppSortableEntityList layout="flat">
      <AppSortableEntityListHeader gridCols={listGrid} minWidth={EDUCATION_LIST_MIN_WIDTH} variant="flat">
        <div className="min-w-0">Institution</div>
        <div className="min-w-0">Degree</div>
        <div className="min-w-0">Dates</div>
        {canEdit ? <div className="min-w-0 w-10" aria-hidden /> : null}
      </AppSortableEntityListHeader>
      <AppSortableEntityListFlatBody gridCols={listGrid} minWidth={EDUCATION_LIST_MIN_WIDTH}>
        {(rows || []).map((e: any) => {
          const degreeLine = [e.degree, e.major_specialization].filter(Boolean).join(' · ');
          return (
            <AppSortableEntityListRow
              key={e.id}
              as="div"
              variant="flat"
              gridCols={listGrid}
              minWidth={EDUCATION_LIST_MIN_WIDTH}
            >
              <div className={uiCx(uiTypography.sectionTitle, 'min-w-0 truncate text-sm')}>
                {e.college_institution || '—'}
              </div>
              <div className={uiCx(uiTypography.helper, 'min-w-0 truncate font-medium text-gray-800')}>
                {degreeLine || '—'}
              </div>
              <div className={uiCx(uiTypography.helper, 'min-w-0 whitespace-nowrap')}>
                {formatEducationPeriod(e.start_date, e.end_date)}
              </div>
              {canEdit ? (
                <div className="flex justify-end">
                  <AppListRowIconButton preset="delete" label="Delete record" onClick={() => del(e.id)} />
                </div>
              ) : null}
            </AppSortableEntityListRow>
          );
        })}
      </AppSortableEntityListFlatBody>
    </AppSortableEntityList>
  );

  if (!embedded) {
    if (isLoading || !(rows || []).length) return null;
    return <div className="overflow-x-auto">{educationList}</div>;
  }

  return (
    <div>
      {isLoading ? (
        <div className={uiCx('h-28 animate-pulse rounded-lg bg-gray-100', uiRadius.control)} />
      ) : (
        <div className="flex flex-col gap-2 overflow-x-auto rounded-lg border border-gray-200 bg-white p-4">
          {canEdit ? (
            <AppListCreateItem
              label="Add education"
              layout="row"
              className={uiCx('w-full', EDUCATION_LIST_MIN_WIDTH)}
              onClick={() => setShowAdd(true)}
            />
          ) : null}
          {!(rows || []).length ? (
            <AppEmptyState
              title="No education records yet"
              description="Add schools and degrees using “Add education” above."
              className="border-0 bg-transparent p-0 py-6 shadow-none"
            />
          ) : (
            educationList
          )}
        </div>
      )}

      <AppFormModal
        open={showAdd}
        onClose={closeAddModal}
        title="Add education"
        description="School, degree, and study dates."
        formWidth="comfortable"
        quickInfo={userEducationQuickInfo}
        footer={
          <div className={uiCx(uiLayout.actionsRow, 'w-full justify-end')}>
            <AppButton type="button" variant="secondary" size="sm" onClick={closeAddModal}>
              Cancel
            </AppButton>
            <AppButton type="button" size="sm" disabled={isAddingEducation} loading={isAddingEducation} onClick={add}>
              {isAddingEducation ? 'Saving…' : 'Save'}
            </AppButton>
          </div>
        }
      >
        <div className="grid gap-2.5 md:grid-cols-2">
          <AppInput
            label="Institution"
            value={inst}
            onChange={(e) => setInst(e.target.value)}
            fieldHint={showFieldHints ? userProfileFieldHint('college_institution') : undefined}
          />
          <AppInput
            label="Degree"
            value={degree}
            onChange={(e) => setDegree(e.target.value)}
            fieldHint={showFieldHints ? userProfileFieldHint('degree') : undefined}
          />
          <AppDatePicker
            label="Start date"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            fieldHint={showFieldHints ? userProfileFieldHint('education_start') : undefined}
          />
          <AppDatePicker
            label="End date"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            fieldHint={showFieldHints ? userProfileFieldHint('education_end') : undefined}
          />
        </div>
      </AppFormModal>
    </div>
  );
}

function JobSection({ type, p, editable, userId, collectChanges, usersOptions, settings, canViewCompensation = false, userDivisions = [], selectedDivisions = [], onDivisionsChange }: { type:'employment'|'organization', p:any, editable:boolean, userId:string, collectChanges: (kv:Record<string,any>)=>void, usersOptions:any[], settings:any, canViewCompensation?: boolean, userDivisions?: any[], selectedDivisions?: string[], onDivisionsChange?: (divisions: string[]) => void }){
  const isEditable = !!editable;
  const [form, setForm] = useState<any>(()=>({
    hire_date: p.hire_date||'',
    termination_date: p.termination_date||'',
    job_title: p.job_title||'',
    division: p.division||'',
    work_email: p.work_email||'',
    work_phone: p.work_phone||'',
    manager_user_id: p.manager_user_id||'',
    pay_rate: p.pay_rate||'',
    pay_type: p.pay_type||'',
    employment_type: p.employment_type||'',
  }));
  const [departmentDropdownOpen, setDepartmentDropdownOpen] = useState(false);
  const onField = (key:string, value:any)=>{ setForm((s:any)=>({ ...s, [key]: value })); collectChanges({ [key]: value }); };
  
  const handleDepartmentToggle = (divisionId: string) => {
    const newSelection = selectedDivisions.includes(divisionId)
      ? selectedDivisions.filter(id => id !== divisionId)
      : [...selectedDivisions, divisionId];
    // Notify parent of changes - divisions will be saved separately via PATCH /users/{user_id}
    if (onDivisionsChange) {
      onDivisionsChange(newSelection);
    }
    collectChanges({ _divisions_changed: true, _selected_divisions: newSelection });
  };
  if (type==='employment'){
    const isActive = !p.termination_date || String(p.termination_date||'').trim() === '';
    const statusColor = isActive ? 'green' : 'red';
    const statusBg = isActive ? 'bg-green-100' : 'bg-red-100';
    const statusText = isActive ? 'text-green-700' : 'text-red-700';
    const statusLabel = isActive ? 'Active' : 'Terminated';
    
    return (
      <div className="space-y-4">
        {/* Employment Details Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Employment Status Card */}
          <div className="rounded-lg border border-gray-200 bg-white p-3">
            <div className="flex items-center justify-center mb-2">
              <div className={`w-8 h-8 rounded ${statusBg} flex items-center justify-center`}>
                {isActive ? (
                  <svg className={`w-5 h-5 ${statusText}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                ) : (
                  <svg className={`w-5 h-5 ${statusText}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                )}
              </div>
            </div>
            <div className="text-center">
              <div className={`text-sm font-semibold ${isActive ? 'text-green-600' : 'text-red-600'}`}>
                {statusLabel}
              </div>
              <div className="text-xs font-medium text-gray-700 mt-0.5">
                Employment Status
              </div>
              <p className="text-[10px] text-gray-500 mt-1 px-0.5 leading-snug max-w-[11rem] mx-auto">
                From termination date in HR below, not the system account badge under the photo.
              </p>
            </div>
          </div>
          
          {/* Hire Date Card */}
          <div className="rounded-lg border border-gray-200 bg-white p-3">
            <div className="flex items-center justify-center mb-2">
              <div className="w-8 h-8 rounded bg-blue-100 flex items-center justify-center">
                <svg className="w-5 h-5 text-blue-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
            </div>
            <div className="text-center">
              {isEditable ? (
                <input type="date" className="w-full text-center text-sm font-semibold text-gray-900 border-0 bg-transparent focus:outline-none focus:ring-0" value={(form.hire_date||'').slice(0,10)} onChange={e=>onField('hire_date', e.target.value)} />
              ) : (
                <div className="text-sm font-semibold text-gray-900">
                  {String(p.hire_date||'').slice(0,10) || '—'}
                </div>
              )}
              <div className="text-xs font-medium text-gray-700 mt-0.5">
                Hire Date
              </div>
            </div>
          </div>
          
          {/* Termination Date Card */}
          <div className="rounded-lg border border-gray-200 bg-white p-3">
            <div className="flex items-center justify-center mb-2">
              <div className="w-8 h-8 rounded bg-orange-100 flex items-center justify-center">
                <svg className="w-5 h-5 text-orange-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
            </div>
            <div className="text-center">
              {isEditable ? (
                <input type="date" className="w-full text-center text-sm font-semibold text-gray-900 border-0 bg-transparent focus:outline-none focus:ring-0" value={(form.termination_date||'').slice(0,10)} onChange={e=>onField('termination_date', e.target.value)} />
              ) : (
                <div className="text-sm font-semibold text-gray-900">
                  {String(p.termination_date||'').slice(0,10) || '—'}
                </div>
              )}
              <div className="text-xs font-medium text-gray-700 mt-0.5">
                Termination Date
              </div>
            </div>
          </div>
          
        </div>
      </div>
    );
  }
  // organization
  const supervisor = useMemo(()=>{
    if(!p?.manager_user_id) return '';
    const row = (usersOptions || []).find((x: any) => String(x.id) === String(p.manager_user_id));
    return row ? String(row.name || row.username || row.email || '') : '';
  }, [usersOptions, p?.manager_user_id]);
  return (
    <div className="grid md:grid-cols-2 gap-4">
      <div className="relative">
        <div className="text-sm text-gray-600">Department</div>
        {isEditable? (
          (settings?.divisions?.length ? (
            <div className="relative">
              <button
                type="button"
                onClick={() => setDepartmentDropdownOpen(!departmentDropdownOpen)}
                className="w-full rounded-lg border px-3 py-2 text-left bg-white flex items-center justify-between"
              >
                <span className={selectedDivisions.length === 0 ? 'text-gray-400' : ''}>
                  {selectedDivisions.length === 0 
                    ? 'Select departments...' 
                    : selectedDivisions.map((id: string) => {
                        const division = settings.divisions.find((d: any) => String(d.id) === id);
                        return division?.label || '';
                      }).filter(Boolean).join(', ') || 'No departments selected'}
                </span>
                <span className="text-gray-400">▼</span>
              </button>
              {departmentDropdownOpen && (
                <>
                  <div 
                    className="fixed inset-0 z-10" 
                    onClick={() => setDepartmentDropdownOpen(false)}
                  />
                  <div className="absolute z-20 w-full mt-1 bg-white border rounded-lg shadow-lg max-h-60 overflow-y-auto">
                    {settings.divisions.map((it: any) => (
                      <label
                        key={it.id}
                        className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          checked={selectedDivisions.includes(String(it.id))}
                          onChange={() => handleDepartmentToggle(String(it.id))}
                          className="rounded border-gray-300 text-brand-red focus:ring-brand-red"
                        />
                        <span className="text-sm">{it.label}</span>
                      </label>
                    ))}
                  </div>
                </>
              )}
            </div>
          ) : (
            <input className="w-full rounded-lg border px-3 py-2" value={form.division} onChange={e=>onField('division', e.target.value)} />
          ))
        ) : (
          <div className="text-gray-900 font-medium py-1">
            {userDivisions && userDivisions.length > 0
              ? userDivisions.map((d: any) => d.label).join(', ')
              : String(p.division||'') || '—'}
          </div>
        )}
      </div>
      <div>
        <div className="text-sm text-gray-600">Supervisor</div>
        {isEditable? (
          <select className="w-full rounded-lg border px-3 py-2" value={form.manager_user_id} onChange={e=>onField('manager_user_id', e.target.value)}>
            <option value="">Select...</option>
            {(usersOptions || []).map((u: any) => (
              <option key={u.id} value={u.id}>
                {String(u.name || u.username || u.email || u.id)}
              </option>
            ))}
          </select>
        ) : (
          <div className="text-gray-900 font-medium py-1">{supervisor||'—'}</div>
        )}
      </div>
      <div>
        <div className="text-sm text-gray-600">Work email</div>
        {isEditable? <input className="w-full rounded-lg border px-3 py-2" value={form.work_email} onChange={e=>onField('work_email', e.target.value)} /> : <div className="text-gray-900 font-medium py-1">{String(p.work_email||'') || '—'}</div>}
      </div>
      <div>
        <div className="text-sm text-gray-600">Work phone</div>
        {isEditable? <input className="w-full rounded-lg border px-3 py-2" value={form.work_phone} onChange={e=>onField('work_phone', e.target.value)} /> : <div className="text-gray-900 font-medium py-1">{String(p.work_phone||'') || '—'}</div>}
      </div>
    </div>
  );
}

// Helper functions for attendance display (same as Attendance.tsx)
const formatDateTime = (iso?: string | null) => {
  if (!iso) return '--';
  return new Date(iso).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
};

const formatHours = (hours?: number | null) => {
  if (hours === undefined || hours === null) return '--';
  const totalMinutes = Math.round(hours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h}h ${m.toString().padStart(2, '0')}m`;
};

const formatBreak = (breakMinutes?: number | null) => {
  if (breakMinutes === undefined || breakMinutes === null || breakMinutes === 0) return '--';
  const h = Math.floor(breakMinutes / 60);
  const m = breakMinutes % 60;
  if (h > 0) {
    return `${h}h ${m.toString().padStart(2, '0')}m`;
  }
  return `${m}m`;
};

const PREDEFINED_JOBS = [
  { id: '0', code: '0', name: 'No Project Assigned' },
  { id: '37', code: '37', name: 'Repairs' },
  { id: '47', code: '47', name: 'Shop' },
  { id: '53', code: '53', name: 'YPK Developments' },
  { id: '136', code: '136', name: 'Stat Holiday' },
];

type Attendance = {
  id: string;
  worker_id: string;
  worker_name: string;
  type?: 'in' | 'out';
  clock_in_time?: string | null;
  clock_out_time?: string | null;
  time_selected_utc?: string | null;
  time_entered_utc?: string | null;
  status: string;
  source: string;
  shift_id?: string | null;
  job_name?: string | null;
  project_name?: string | null;
  job_type?: string | null;
  hours_worked?: number | null;
  break_minutes?: number | null;
  reason_text?: string | null;
  shift_deleted?: boolean;
  shift_deleted_by?: string | null;
  shift_deleted_at?: string | null;
  gps_lat?: number | null;
  gps_lng?: number | null;
  created_at?: string | null;
  approved_at?: string | null;
  approved_by?: string | null;
};

type AttendanceEvent = {
  event_id: string;
  worker_id: string;
  worker_name: string;
  job_name?: string | null;
  project_name?: string | null;
  job_type?: string | null;
  shift_id?: string | null;
  shift_deleted?: boolean;
  shift_deleted_by?: string | null;
  shift_deleted_at?: string | null;
  clock_in_id?: string | null;
  clock_in_time?: string | null;
  clock_in_status?: string | null;
  clock_in_reason?: string | null;
  clock_out_id?: string | null;
  clock_out_time?: string | null;
  clock_out_status?: string | null;
  clock_out_reason?: string | null;
  hours_worked?: number | null;
  break_minutes?: number | null;
  is_hours_worked?: boolean;
};

type Project = {
  id: string;
  code?: string;
  name: string;
};

const buildEvents = (attendances: Attendance[]): AttendanceEvent[] => {
  const events: AttendanceEvent[] = attendances.map((att) => {
    // Check if this is a "hours worked" entry
    const isHoursWorked = att.reason_text?.includes('HOURS_WORKED:') || false;
    
    // For "hours worked", extract hours from reason_text
    let hoursWorked: number | null = null;
    if (isHoursWorked && att.clock_in_time && att.clock_out_time) {
      // Extract hours from reason_text
      const parts = (att.reason_text || '').split('|');
      for (const part of parts) {
        if (part.startsWith('HOURS_WORKED:')) {
          try {
            hoursWorked = parseFloat(part.replace('HOURS_WORKED:', ''));
          } catch {
            // If parsing fails, calculate from times
            const diff = new Date(att.clock_out_time).getTime() - new Date(att.clock_in_time).getTime();
            hoursWorked = diff / (1000 * 60 * 60);
          }
          break;
        }
      }
    } else if (att.clock_in_time && att.clock_out_time) {
      const diff = new Date(att.clock_out_time).getTime() - new Date(att.clock_in_time).getTime();
      hoursWorked = diff / (1000 * 60 * 60);
    }
    
    // Subtract break minutes from hours_worked if break exists
    if (hoursWorked !== null && att.break_minutes !== null && att.break_minutes !== undefined && att.break_minutes > 0) {
      hoursWorked = Math.max(0, hoursWorked - (att.break_minutes / 60));
    }
    
    return {
      event_id: att.id,
      worker_id: att.worker_id,
      worker_name: att.worker_name,
      job_name: att.job_name,
      project_name: att.project_name,
      job_type: att.job_type,
      shift_id: att.shift_id,
      shift_deleted: !!att.shift_deleted,
      shift_deleted_by: att.shift_deleted_by || null,
      shift_deleted_at: att.shift_deleted_at || null,
      clock_in_id: att.clock_in_time ? att.id : null,
      clock_in_time: att.clock_in_time || null,
      clock_in_status: att.clock_in_time ? att.status : null,
      clock_in_reason: att.clock_in_time ? att.reason_text : null,
      clock_out_id: att.clock_out_time ? att.id : null,
      clock_out_time: att.clock_out_time || null,
      clock_out_status: att.clock_out_time ? att.status : null,
      clock_out_reason: att.clock_out_time ? att.reason_text : null,
      hours_worked: hoursWorked,
      break_minutes: att.break_minutes || null,
      is_hours_worked: isHoursWorked,
    };
  });
  
  return events.sort(
    (a, b) =>
      new Date(b.clock_in_time || b.clock_out_time || '').getTime() -
      new Date(a.clock_in_time || a.clock_out_time || '').getTime()
  );
};

function TimesheetBlock({ userId, canEdit = true }:{ userId:string, canEdit?: boolean }){
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [refreshKey, setRefreshKey] = useState(0);
  const [filters, setFilters] = useState({
    start_date: '',
    end_date: '',
    status: '',
    project_id: '',
  });
  const [showModal, setShowModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState<AttendanceEvent | null>(null);
  const [formData, setFormData] = useState({
    worker_id: userId, // Always set to the current user
    job_type: '0',
    clock_in_time: '',
    clock_out_time: '',
    status: 'approved',
    entry_mode: 'time' as 'time' | 'hours',
    hours_worked: '',
  });
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [selectedEvents, setSelectedEvents] = useState<Set<string>>(new Set());
  const [deletingSelected, setDeletingSelected] = useState(false);
  
  // Manual break time
  const [insertBreakTime, setInsertBreakTime] = useState<boolean>(false);
  const [breakHours, setBreakHours] = useState<string>('0');
  const [breakMinutes, setBreakMinutes] = useState<string>('0');

  // Build query string for filters (always include worker_id)
  const queryParams = new URLSearchParams();
  queryParams.set('worker_id', userId); // Always filter by this user
  if (filters.start_date) queryParams.set('start_date', filters.start_date);
  if (filters.end_date) queryParams.set('end_date', filters.end_date);
  if (filters.status) queryParams.set('status', filters.status);
  if (filters.project_id) queryParams.set('project_id', filters.project_id);
  const queryString = queryParams.toString();
  const url = `/settings/attendance/list?${queryString}`;

  const { data: attendances, isLoading, error, refetch } = useQuery({
    queryKey: ['user-attendance', queryString, refreshKey],
    queryFn: async () => {
      const result = await api<Attendance[]>('GET', url);
      return Array.isArray(result) ? result : [];
    },
  });

  const attendanceEvents = useMemo(
    () => buildEvents(Array.isArray(attendances) ? attendances : []),
    [attendances]
  );

  const { data: projects = [] } = useQuery({
    queryKey: ['attendance-projects'],
    queryFn: async () => {
      const result = await api<Project[]>('GET', '/projects?limit=100');
      return Array.isArray(result) ? result : [];
    },
  });

  const jobOptions = useMemo(() => {
    const projectsArray = Array.isArray(projects) ? projects : [];
    const projectJobs = projectsArray.map((p) => ({
      id: p.id,
      code: p.code || p.id,
      name: p.name,
    }));
    return [...PREDEFINED_JOBS, ...projectJobs];
  }, [projects]);

  // Fetch timesheet settings to check if user is eligible for break
  const { data: settingsData } = useQuery({ 
    queryKey:['settings-bundle'], 
    queryFn: ()=> api<Record<string, any[]>>('GET','/settings') 
  });
  const timesheetItems = (settingsData?.timesheet||[]) as any[];
  const breakEmployeesItem = timesheetItems.find((i: any)=> i.label === 'break_eligible_employees');
  const isEligibleForBreak = useMemo(() => {
    if (!breakEmployeesItem?.value) return false;
    try {
      const employeeIds = JSON.parse(breakEmployeesItem.value);
      return Array.isArray(employeeIds) && employeeIds.includes(userId);
    } catch {
      return false;
    }
  }, [breakEmployeesItem?.value, userId]);

  // Toggle eligible for break
  const toggleEligibleForBreak = async (checked: boolean) => {
    if (!canEdit) {
      toast.error('You do not have permission to edit attendance settings');
      return;
    }
    try {
      let updatedEmployeeIds: string[] = [];
      if (breakEmployeesItem?.value) {
        try {
          updatedEmployeeIds = JSON.parse(breakEmployeesItem.value);
          if (!Array.isArray(updatedEmployeeIds)) updatedEmployeeIds = [];
        } catch {
          updatedEmployeeIds = [];
        }
      }

      if (checked) {
        if (!updatedEmployeeIds.includes(userId)) {
          updatedEmployeeIds.push(userId);
        }
      } else {
        updatedEmployeeIds = updatedEmployeeIds.filter((id: string) => id !== userId);
      }

      const employeesJson = JSON.stringify(updatedEmployeeIds);
      if (breakEmployeesItem) {
        await api('PUT', `/settings/timesheet/${encodeURIComponent(breakEmployeesItem.id)}?label=break_eligible_employees&value=${encodeURIComponent(employeesJson)}`);
      } else {
        await api('POST', `/settings/timesheet?label=break_eligible_employees&value=${encodeURIComponent(employeesJson)}`);
      }

      queryClient.invalidateQueries({ queryKey: ['settings-bundle'] });
      toast.success(checked ? 'User marked as eligible for break' : 'User removed from break eligibility');
    } catch (_e) {
      toast.error('Failed to update break eligibility');
    }
  };

  const resetForm = () => {
    setFormData({
      worker_id: userId,
      job_type: '0',
      clock_in_time: '',
      clock_out_time: '',
      status: 'approved',
      entry_mode: 'time',
      hours_worked: '',
    });
    setInsertBreakTime(false);
    setBreakHours('0');
    setBreakMinutes('0');
  };

  const closeAttendanceModal = () => {
    setShowModal(false);
    setEditingEvent(null);
    resetForm();
  };

  useEffect(() => {
    if (!showModal) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeAttendanceModal(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showModal]);

  useEffect(() => {
    if (!showModal) return;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, [showModal]);

  const handleOpenModal = (event?: AttendanceEvent) => {
    if (!canEdit) {
      toast.error('You do not have permission to edit attendance records');
      return;
    }
    if (event) {
      setEditingEvent(event);
      const att = attendances?.find(a => a.id === event.event_id);
      if (att) {
        const isHoursWorked = att.reason_text?.includes('HOURS_WORKED:') || false;
        let hoursWorked = '';
        if (isHoursWorked && att.reason_text) {
          const parts = att.reason_text.split('|');
          for (const part of parts) {
            if (part.startsWith('HOURS_WORKED:')) {
              hoursWorked = part.replace('HOURS_WORKED:', '');
              break;
            }
          }
        }
        
        // Convert UTC times to local datetime-local format
        let clockInTimeValue = '';
        if (isHoursWorked) {
          // For "hours worked", clock_in_time contains the date at midnight (YYYY-MM-DDT00:00:00Z)
          // Extract date part and format for date input
          if (att.clock_in_time) {
            const datePart = formatDateLocal(new Date(att.clock_in_time));
            clockInTimeValue = `${datePart}T00:00`; // Set to midnight for date input
          } else if (att.clock_out_time) {
            // Fallback to clock_out_time if clock_in_time is not available
            const datePart = formatDateLocal(new Date(att.clock_out_time));
            clockInTimeValue = `${datePart}T00:00`;
          }
        } else {
          clockInTimeValue = toLocalInputValue(att.clock_in_time);
        }
        
        setFormData({
          worker_id: userId,
          job_type: event.job_type || '0',
          clock_in_time: clockInTimeValue || (formatDateLocal(new Date()) + 'T00:00'),
          clock_out_time: toLocalInputValue(att.clock_out_time),
          status: att.status,
          entry_mode: isHoursWorked ? 'hours' : 'time',
          hours_worked: hoursWorked,
        });
        
        // Load manual break time if exists
        if (att.break_minutes && att.break_minutes > 0) {
          const breakH = Math.floor(att.break_minutes / 60);
          const breakM = att.break_minutes % 60;
          setInsertBreakTime(true);
          setBreakHours(String(breakH));
          setBreakMinutes(String(breakM).padStart(2, '0'));
        } else {
          setInsertBreakTime(false);
          setBreakHours('0');
          setBreakMinutes('0');
        }
      }
    } else {
      const local = formatDateLocal(new Date()) + 'T00:00';
      setEditingEvent(null);
      setFormData({
        worker_id: userId,
        job_type: '0',
        clock_in_time: local,
        clock_out_time: '',
        status: 'approved',
        entry_mode: 'time',
        hours_worked: '',
      });
      setInsertBreakTime(false);
      setBreakHours('0');
      setBreakMinutes('0');
    }
    setShowModal(true);
  };

  const handleDeleteEvent = async (event: AttendanceEvent) => {
    if (!canEdit) {
      toast.error('You do not have permission to delete attendance records');
      return;
    }
    const result = await confirm({
      title: 'Delete Attendance Event',
      message: 'Are you sure you want to delete this attendance event? This action cannot be undone.',
      confirmText: 'Delete',
      cancelText: 'Cancel',
    });
    if (result !== 'confirm') {
      return;
    }
    setDeletingId(event.event_id);
    try {
      const attendanceId = event.clock_in_id || event.clock_out_id || event.event_id;
      await api('DELETE', `/settings/attendance/${attendanceId}`);
      
      await queryClient.invalidateQueries({
        queryKey: ['user-attendance'],
        exact: false,
      });
      await queryClient.refetchQueries({
        queryKey: ['user-attendance'],
        exact: false,
      });
      setRefreshKey(prev => prev + 1);
      
      toast.success('Attendance event deleted');
    } catch (e: any) {
      toast.error(e?.message || 'Failed to delete attendance event');
    } finally {
      setDeletingId(null);
    }
  };

  const handleToggleSelect = (eventId: string) => {
    if (!canEdit) return;
    setSelectedEvents(prev => {
      const newSet = new Set(prev);
      if (newSet.has(eventId)) {
        newSet.delete(eventId);
      } else {
        newSet.add(eventId);
      }
      return newSet;
    });
  };

  const handleSelectAll = () => {
    if (!canEdit) return;
    if (selectedEvents.size === attendanceEvents.length) {
      setSelectedEvents(new Set());
    } else {
      setSelectedEvents(new Set(attendanceEvents.map((e) => e.event_id)));
    }
  };

  const handleDeleteSelected = async () => {
    if (!canEdit) {
      toast.error('You do not have permission to delete attendance records');
      return;
    }
    if (selectedEvents.size === 0) return;
    
    const result = await confirm({
      title: 'Delete Selected Attendance Events',
      message: `Are you sure you want to delete ${selectedEvents.size} attendance event(s)? This action cannot be undone.`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
    });
    
    if (result !== 'confirm') return;
    
    setDeletingSelected(true);
    try {
      const deletePromises = Array.from(selectedEvents).map(eventId => {
        return api('DELETE', `/settings/attendance/${eventId}`).catch((e: any) => {
          console.error(`Failed to delete ${eventId}:`, e);
          return null;
        });
      });
      
      await Promise.all(deletePromises);
      
      await queryClient.invalidateQueries({
        queryKey: ['user-attendance'],
        exact: false,
      });
      await queryClient.refetchQueries({
        queryKey: ['user-attendance'],
        exact: false,
      });
      setRefreshKey(prev => prev + 1);
      
      setSelectedEvents(new Set());
      toast.success(`Deleted ${selectedEvents.size} attendance event(s)`);
    } catch (e: any) {
      toast.error('Failed to delete some attendance events');
    } finally {
      setDeletingSelected(false);
    }
  };

  const handleSubmit = async () => {
    if (!canEdit) {
      toast.error('You do not have permission to edit attendance records');
      return;
    }
    if (!formData.clock_in_time) {
      toast.error('Clock-in time is required');
      return;
    }

    if (editingEvent) {
      if (!formData.clock_in_time) {
        toast.error('Clock-in time is required');
        return;
      }
    } else {
      if (formData.entry_mode === 'time') {
        if (!formData.clock_in_time || !formData.clock_out_time) {
          toast.error('Clock-in and clock-out times are required');
          return;
        }
      } else {
        if (!formData.clock_in_time) {
          toast.error('Clock-in time is required when using hours worked');
          return;
        }
        const hours = parseFloat(formData.hours_worked || '0');
        if (!formData.hours_worked || isNaN(hours) || hours <= 0) {
          toast.error('Please enter a valid number of hours worked');
          return;
        }
      }
    }

    const toUtcISOString = (localValue?: string) => {
      if (!localValue) return null;
      const [datePart, timePart] = localValue.split('T');
      if (!datePart || !timePart) return null;
      const [year, month, day] = datePart.split('-').map(Number);
      const [hours, minutes] = timePart.split(':').map(Number);
      const localDate = new Date(year, month - 1, day, hours, minutes || 0, 0, 0);
      return localDate.toISOString();
    };

    let clockInUtc = toUtcISOString(formData.clock_in_time);
    let clockOutUtc = toUtcISOString(formData.clock_out_time);

    let reasonText = `JOB_TYPE:${formData.job_type}`;
    if (formData.entry_mode === 'hours' && formData.clock_in_time) {
      const hours = parseFloat(formData.hours_worked || '0');
      if (hours > 0) {
        const datePart = formData.clock_in_time.slice(0, 10);
        const midnightLocal = `${datePart}T00:00`;
        clockInUtc = toUtcISOString(midnightLocal);
        if (clockInUtc) {
          const inDate = new Date(clockInUtc);
          const outDate = new Date(inDate.getTime() + hours * 3600000);
          clockOutUtc = outDate.toISOString();
        }
        reasonText = `JOB_TYPE:${formData.job_type}|HOURS_WORKED:${hours}`;
      }
    }

    try {
      if (editingEvent) {
        const attendanceId = editingEvent.clock_in_id || editingEvent.clock_out_id;
        if (!attendanceId) {
          toast.error('Cannot find attendance record to update');
          return;
        }

        const updatePayload: any = {
          clock_in_time: clockInUtc,
          clock_out_time: clockOutUtc,
          status: formData.status,
          ...(editingEvent.shift_id ? {} : { reason_text: reasonText }),
        };
        
        if (clockOutUtc && insertBreakTime) {
          const breakTotalMinutes = parseInt(breakHours) * 60 + parseInt(breakMinutes);
          updatePayload.manual_break_minutes = breakTotalMinutes;
        }
        
        await api('PUT', `/settings/attendance/${attendanceId}`, updatePayload);
        
        toast.success('Attendance event updated');
        
        await queryClient.invalidateQueries({
          queryKey: ['user-attendance'],
          exact: false,
        });
        await queryClient.refetchQueries({
          queryKey: ['user-attendance'],
          exact: false,
        });
        setRefreshKey(prev => prev + 1);
        
        closeAttendanceModal();
      } else {
        const createPayload: any = {
          worker_id: userId,
          type: clockInUtc && clockOutUtc ? 'in' : (clockInUtc ? 'in' : 'out'),
          time_selected_utc: clockInUtc || clockOutUtc,
          clock_in_time: clockInUtc,
          clock_out_time: clockOutUtc,
          status: formData.status,
          reason_text: reasonText,
        };
        
        if (clockOutUtc && insertBreakTime) {
          const breakTotalMinutes = parseInt(breakHours) * 60 + parseInt(breakMinutes);
          createPayload.manual_break_minutes = breakTotalMinutes;
        }
        
        await api('POST', '/settings/attendance/manual', createPayload);
        
        toast.success('Attendance event created');
        
        await queryClient.invalidateQueries({
          queryKey: ['user-attendance'],
          exact: false,
        });
        await queryClient.refetchQueries({
          queryKey: ['user-attendance'],
          exact: false,
        });
        setRefreshKey(prev => prev + 1);
        
        closeAttendanceModal();
      }
    } catch (e: any) {
      const errorMsg = e.message || 'Failed to save attendance event';
      toast.error(errorMsg);
      if (errorMsg.includes('Cannot create attendance') || errorMsg.includes('Cannot update attendance')) {
        return; // Don't close modal on conflict
      }
    }
  };

  const isSubmitDisabled = editingEvent
    ? (!formData.worker_id || !formData.clock_in_time)
    : !formData.clock_in_time
    ? true
    : formData.entry_mode === 'time'
    ? !formData.clock_out_time
    : !formData.hours_worked || parseFloat(formData.hours_worked || '0') <= 0;

  return (
    <div className="space-y-6 pb-24">
      <UserInfoSectionCard preset="timesheet" title="Timesheet">
        <div className="flex flex-wrap items-center gap-2">
          <AppCheckbox
            label="Eligible for Break"
            checked={isEligibleForBreak}
            disabled={!canEdit}
            onChange={(checked) => {
              if (canEdit) toggleEligibleForBreak(checked);
            }}
          />
          <span className={uiTypography.helper}>(Break will be deducted for shifts of 5 hours or more)</span>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <AppDatePicker
            label="Start Date"
            value={filters.start_date}
            onChange={(e) => setFilters({ ...filters, start_date: e.target.value })}
          />
          <AppDatePicker
            label="End Date"
            value={filters.end_date}
            onChange={(e) => setFilters({ ...filters, end_date: e.target.value })}
          />
          <AppSelect
            label="Project/Job"
            placeholder="All Projects/Jobs"
            value={filters.project_id}
            onChange={(e) => setFilters({ ...filters, project_id: e.target.value })}
            optionGroups={[
              { label: '', options: [{ value: '', label: 'All Projects/Jobs' }] },
              {
                label: 'Jobs',
                options: PREDEFINED_JOBS.map((job) => ({
                  value: `job_${job.id}`,
                  label: `${job.code ? `${job.code} - ` : ''}${job.name}`,
                })),
              },
              {
                label: 'Projects',
                options: (Array.isArray(projects) ? projects : []).map((proj) => ({
                  value: String(proj.id),
                  label: `${proj.code ? `${proj.code} - ` : ''}${proj.name}`,
                })),
              },
            ]}
          />
          <AppSelect
            label="Status"
            placeholder="All Statuses"
            value={filters.status}
            onChange={(e) => setFilters({ ...filters, status: e.target.value })}
            options={[
              { value: '', label: 'All Statuses' },
              { value: 'approved', label: 'Approved' },
              { value: 'pending', label: 'Pending' },
              { value: 'rejected', label: 'Rejected' },
            ]}
          />
        </div>

        {/* Error message */}
        {error && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800">
            Error loading attendance records: {String(error)}
          </div>
        )}

        {/* Bulk Actions */}
        {canEdit && selectedEvents.size > 0 && (
          <div className="mb-4 rounded-xl border bg-blue-50 p-3 flex items-center justify-between">
            <div className="text-xs font-medium text-blue-900">
              {selectedEvents.size} event(s) selected
            </div>
            <button
              onClick={handleDeleteSelected}
              disabled={deletingSelected}
              className="px-2 py-1 text-xs bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {deletingSelected ? 'Deleting...' : 'Delete All Selected'}
            </button>
          </div>
        )}

        {/* Table */}
        <div className="rounded-xl border overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="p-2.5 text-left w-12">
                  {canEdit && (
                    <input
                      type="checkbox"
                      checked={attendanceEvents.length > 0 && selectedEvents.size === attendanceEvents.length}
                      onChange={handleSelectAll}
                      className="w-3.5 h-3.5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                    />
                  )}
                </th>
                <th className="p-2.5 text-left text-xs font-medium text-gray-600">Clock In</th>
                <th className="p-2.5 text-left text-xs font-medium text-gray-600">Clock Out</th>
                <th className="p-2.5 text-left text-xs font-medium text-gray-600">Job/Project</th>
                <th className="p-2.5 text-left text-xs font-medium text-gray-600">Hours</th>
                <th className="p-2.5 text-left text-xs font-medium text-gray-600">Break</th>
                <th className="p-2.5 text-left text-xs font-medium text-gray-600">Status</th>
                <th className="p-2.5 text-left text-xs font-medium text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody>
              {canEdit && (
                <tr>
                  <td colSpan={8} className="p-0 align-top">
                    <button
                      type="button"
                      onClick={() => handleOpenModal()}
                      className="w-full border-2 border-dashed border-gray-300 rounded-t-xl p-2.5 hover:border-brand-red hover:bg-gray-50 flex items-center justify-center gap-2 min-h-[52px] text-gray-600 hover:text-brand-red transition-colors"
                    >
                      <span className="text-lg font-medium">+</span>
                      <span className="text-sm font-medium">New Attendance</span>
                    </button>
                  </td>
                </tr>
              )}
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="p-4">
                    <div className="h-6 bg-gray-100 animate-pulse rounded" />
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={8} className="p-4 text-center text-xs text-red-600">
                    Error loading data. Please check console for details.
                  </td>
                </tr>
              ) : attendanceEvents.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-4 text-center text-xs text-gray-500">
                    No attendance records found
                  </td>
                </tr>
              ) : (
                attendanceEvents.map((event) => (
                  <tr key={event.event_id} className="border-t border-gray-200 hover:bg-gray-50">
                    <td className="p-2.5">
                      {canEdit && (
                        <input
                          type="checkbox"
                          checked={selectedEvents.has(event.event_id)}
                          onChange={() => handleToggleSelect(event.event_id)}
                          className="w-3.5 h-3.5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                        />
                      )}
                    </td>
                    <td className="p-2.5 text-xs text-gray-900">
                      {event.is_hours_worked ? '—' : (event.clock_in_time ? formatDateTime(event.clock_in_time) : '—')}
                    </td>
                    <td className="p-2.5 text-xs text-gray-900">
                      {event.is_hours_worked ? '—' : (event.clock_out_time ? formatDateTime(event.clock_out_time) : '—')}
                    </td>
                    <td className="p-2.5 text-xs text-gray-900">
                      {event.job_name ||
                        event.project_name ||
                        (event.job_type
                          ? jobOptions.find((j) => j.id === event.job_type)?.name || 'Unknown'
                          : 'No Project')}
                    </td>
                    <td className="p-2.5 text-xs text-gray-900">{formatHours(event.hours_worked)}</td>
                    <td className="p-2.5 text-xs text-gray-900">{formatBreak(event.break_minutes)}</td>
                    <td className="p-2.5">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                          event.clock_in_status === 'approved' &&
                          (!event.clock_out_status || event.clock_out_status === 'approved')
                            ? 'bg-green-100 text-green-800'
                            : event.clock_in_status === 'pending' ||
                              event.clock_out_status === 'pending'
                            ? 'bg-yellow-100 text-yellow-800'
                            : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {event.clock_in_status === 'approved' &&
                        (!event.clock_out_status || event.clock_out_status === 'approved')
                          ? 'Approved'
                          : event.clock_in_status === 'pending' ||
                            event.clock_out_status === 'pending'
                          ? 'Pending'
                          : 'Rejected'}
                      </span>
                    </td>
                    <td className="p-2.5">
                      <div className="flex items-center gap-1.5">
                        {canEdit ? (
                          <>
                            <button
                              onClick={() => handleOpenModal(event)}
                              className="text-blue-600 hover:text-blue-800 text-[10px]"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => handleDeleteEvent(event)}
                              disabled={deletingId === event.event_id}
                              className="text-red-600 hover:text-red-800 text-[10px] disabled:opacity-50"
                            >
                              {deletingId === event.event_id ? 'Deleting...' : 'Delete'}
                            </button>
                          </>
                        ) : (
                          <span className="text-[10px] text-gray-500">View only</span>
                        )}
                        {event.shift_deleted && (
                          <span 
                            className="text-yellow-600" 
                            title={event.shift_deleted_by ? `The shift related to this attendance was deleted by ${event.shift_deleted_by}${event.shift_deleted_at ? ` on ${new Date(event.shift_deleted_at).toLocaleDateString()}` : ''}` : 'The shift related to this attendance was deleted'}
                          >
                            <svg className="w-3 h-3 inline-block" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </UserInfoSectionCard>

      <AppFormModal
        open={showModal}
        onClose={closeAttendanceModal}
        title={editingEvent ? 'Edit Attendance Event' : 'New Attendance Event'}
        description={editingEvent ? 'Update clock-in/out or hours worked' : 'Add a new attendance record'}
        footer={
          <div className={uiCx(uiLayout.actionsRow, 'w-full justify-end')}>
            <AppButton type="button" variant="secondary" size="sm" onClick={closeAttendanceModal}>
              Cancel
            </AppButton>
            <AppButton type="button" size="sm" disabled={isSubmitDisabled} onClick={handleSubmit}>
              {editingEvent ? 'Update' : 'Create'}
            </AppButton>
          </div>
        }
      >
        <div className={uiSpacing.sectionStack}>
              <AppSelect
                label="Job *"
                required
                value={formData.job_type}
                onChange={(e) => setFormData({ ...formData, job_type: e.target.value })}
                options={jobOptions.map((job) => ({
                  value: job.id,
                  label: `${job.code} - ${job.name}`,
                }))}
              />
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">
                  Entry Type
                </label>
                <div className="inline-flex rounded-lg border border-gray-300 bg-gray-50 overflow-hidden text-xs">
                  <button
                    type="button"
                    onClick={() => {
                      setFormData((prev) => ({
                        ...prev,
                        entry_mode: 'time',
                        hours_worked: '',
                      }));
                    }}
                    className={`px-2.5 py-1.5 ${
                      formData.entry_mode === 'time'
                        ? 'bg-white text-gray-900'
                        : 'text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    Clock In / Out
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setFormData((prev) => {
                        const datePart = prev.clock_in_time ? prev.clock_in_time.slice(0, 10) : formatDateLocal(new Date());
                        let hoursWorked = '';
                        if (prev.clock_in_time && prev.clock_out_time) {
                          const inTime = new Date(prev.clock_in_time);
                          const outTime = new Date(prev.clock_out_time);
                          const diffMs = outTime.getTime() - inTime.getTime();
                          const diffHours = diffMs / (1000 * 60 * 60);
                          if (diffHours > 0) {
                            hoursWorked = diffHours.toString();
                          }
                        }
                        return {
                          ...prev,
                          entry_mode: 'hours',
                          clock_in_time: `${datePart}T00:00`,
                          clock_out_time: '',
                          hours_worked: hoursWorked,
                        };
                      });
                    }}
                    className={`px-2.5 py-1.5 border-l border-gray-300 ${
                      formData.entry_mode === 'hours'
                        ? 'bg-white text-gray-900'
                        : 'text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    Hours Worked
                  </button>
                </div>
                <p className="mt-1 text-[10px] text-gray-500">
                  {formData.entry_mode === 'time'
                    ? 'Enter exact clock-in and clock-out times.'
                    : 'Enter start time and total hours; clock-out will be calculated automatically.'}
                </p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">
                  {formData.entry_mode === 'time'
                    ? 'Clock In Time * (Local)'
                    : 'Work Date *'}
                </label>
                {formData.entry_mode === 'time' ? (
                  <AppInput
                    type="datetime-local"
                    value={formData.clock_in_time}
                    onChange={(e) => setFormData({ ...formData, clock_in_time: e.target.value })}
                    required
                  />
                ) : (
                  <AppDatePicker
                    value={formData.clock_in_time ? formData.clock_in_time.slice(0, 10) : ''}
                    onChange={(e) => {
                      const date = e.target.value;
                      setFormData((prev) => ({
                        ...prev,
                        clock_in_time: date ? `${date}T00:00` : '',
                      }));
                    }}
                    required
                  />
                )}
              </div>
              {formData.entry_mode === 'time' && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1.5">
                      {editingEvent
                        ? 'Clock Out Time (Local) - Optional'
                        : 'Clock Out Time * (Local)'}
                    </label>
                    <AppInput
                      type="datetime-local"
                      value={formData.clock_out_time}
                      onChange={(e) => setFormData({ ...formData, clock_out_time: e.target.value })}
                      required={!editingEvent}
                    />
                  </div>
                  {/* Manual Break Time (always available in clock in/out mode) */}
                  <div>
                    <AppCheckbox
                      label="Insert Break Time"
                      checked={insertBreakTime}
                      onChange={setInsertBreakTime}
                    />
                    {insertBreakTime && (
                      <div className={uiCx('ml-6', uiSpacing.sectionStack)}>
                        <div className={uiCx(uiLayout.actionsRow, 'items-end')}>
                          <AppSelect
                            className="min-w-0 flex-1"
                            label="Hours"
                            value={breakHours}
                            onChange={(e) => setBreakHours(e.target.value)}
                            options={Array.from({ length: 3 }, (_, i) => ({
                              value: String(i),
                              label: String(i),
                            }))}
                          />
                          <AppSelect
                            className="min-w-0 flex-1"
                            label="Minutes"
                            value={breakMinutes}
                            onChange={(e) => setBreakMinutes(e.target.value)}
                            options={Array.from({ length: 12 }, (_, i) => {
                              const m = i * 5;
                              const v = String(m).padStart(2, '0');
                              return { value: v, label: v };
                            })}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}
              {formData.entry_mode === 'hours' && (
                <>
                  <AppInput
                    label="Hours Worked *"
                    type="number"
                    min={0}
                    step="0.25"
                    value={formData.hours_worked}
                    onChange={(e) => setFormData({ ...formData, hours_worked: e.target.value })}
                    placeholder="e.g. 8"
                    required
                  />
                  <div>
                    <AppCheckbox
                      label="Insert Break Time"
                      checked={insertBreakTime}
                      onChange={setInsertBreakTime}
                    />
                    {insertBreakTime && (
                      <div className={uiCx('ml-6 mt-2', uiSpacing.sectionStack)}>
                        <div className={uiCx(uiLayout.actionsRow, 'items-end')}>
                          <AppSelect
                            className="min-w-0 flex-1"
                            label="Hours"
                            value={breakHours}
                            onChange={(e) => setBreakHours(e.target.value)}
                            options={Array.from({ length: 3 }, (_, i) => ({
                              value: String(i),
                              label: String(i),
                            }))}
                          />
                          <AppSelect
                            className="min-w-0 flex-1"
                            label="Minutes"
                            value={breakMinutes}
                            onChange={(e) => setBreakMinutes(e.target.value)}
                            options={Array.from({ length: 12 }, (_, i) => {
                              const m = i * 5;
                              const v = String(m).padStart(2, '0');
                              return { value: v, label: v };
                            })}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}
              {editingEvent && (
                <AppSelect
                  label="Status *"
                  required
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  options={[
                    { value: 'approved', label: 'Approved' },
                    { value: 'pending', label: 'Pending' },
                    { value: 'rejected', label: 'Rejected' },
                  ]}
                />
              )}
        </div>
      </AppFormModal>
    </div>
  );
}


function SalarySection({ p, editable, userId, collectChanges, settings, canEdit, onEditClick, embedded }: { p:any, editable:boolean, userId:string, collectChanges?: (kv:Record<string,any>)=>void, settings?: any, canEdit:boolean, onEditClick?: () => void, embedded?: boolean }){
  const isEditable = !!editable;
  const showFieldHints = !!embedded;
  const [form, setForm] = useState<any>(()=>({
    pay_rate: p.pay_rate||'',
    pay_type: p.pay_type||'',
  }));
  const [showPayRate, setShowPayRate] = useState(false);
  const prevEditableRef = useRef(editable);
  
  useEffect(() => {
    // When entering edit mode, initialize form with current p values
    if (editable && !prevEditableRef.current) {
      setForm({ pay_rate: p.pay_rate||'', pay_type: p.pay_type||'' });
    }
    // When exiting edit mode, update form with latest p values
    if (!editable && prevEditableRef.current) {
      setForm({ pay_rate: p.pay_rate||'', pay_type: p.pay_type||'' });
    }
    prevEditableRef.current = editable;
  }, [editable, p.pay_rate, p.pay_type]);
  
  const onField = (key:string, value:any)=>{ 
    setForm((s:any)=>({ ...s, [key]: value })); 
    collectChanges?.({ [key]: value }); 
  };

  const fields = (
    <div className="grid gap-4 md:grid-cols-2">
        <AppCard bodyClassName={uiSpacing.cardPadding}>
          <div className={uiCx(uiLayout.actionsRow, 'mb-2')}>
            <span className={uiTypography.overline}>Pay Rate</span>
            {!isEditable ? (
              <AppButton type="button" variant="ghost" size="sm" onClick={() => setShowPayRate(!showPayRate)}>
                {showPayRate ? 'Hide' : 'Show'}
              </AppButton>
            ) : null}
          </div>
          {isEditable ? (
            <AppInput
              label="Pay rate"
              value={form.pay_rate}
              onChange={(e) => onField('pay_rate', e.target.value)}
              placeholder="$29.00 / Hour"
              fieldHint={showFieldHints ? userProfileFieldHint('pay_rate') : undefined}
            />
          ) : (
            <div className={uiTypography.sectionTitle}>{showPayRate ? String(p.pay_rate || '') || '—' : '••••'}</div>
          )}
        </AppCard>
        <AppCard bodyClassName={uiSpacing.cardPadding}>
          <span className={uiTypography.overline}>Pay Type</span>
          <div className="mt-2">
            {isEditable ? (
              settings?.pay_types?.length ? (
                <AppSelect
                  label="Pay type"
                  placeholder="Select..."
                  value={form.pay_type}
                  onChange={(e) => onField('pay_type', e.target.value)}
                  fieldHint={showFieldHints ? userProfileFieldHint('pay_type') : undefined}
                  options={sortByLabel(settings.pay_types, (it: any) => (it.label || '').toString()).map((it: any) => ({
                    value: it.label,
                    label: it.label,
                  }))}
                />
              ) : (
                <AppInput
                  label="Pay type"
                  value={form.pay_type}
                  onChange={(e) => onField('pay_type', e.target.value)}
                  placeholder="Hourly / Salary / Contract..."
                  fieldHint={showFieldHints ? userProfileFieldHint('pay_type') : undefined}
                />
              )
            ) : (
              <div className={uiTypography.sectionTitle}>{String(p.pay_type || '') || '—'}</div>
            )}
          </div>
        </AppCard>
      </div>
  );

  if (embedded) return fields;

  return (
    <UserInfoSectionCard
      preset="billing"
      title="Salary"
      description="Current pay rate and type on file."
      showEdit={!isEditable && !!onEditClick && canEdit}
      onEditClick={onEditClick}
      editTitle="Edit Salary"
    >
      {fields}
      <SalaryHistorySection userId={userId} canEdit={canEdit} settings={settings} />
    </UserInfoSectionCard>
  );
}

function SalaryHistorySection({ userId, canEdit, settings }:{ userId:string, canEdit:boolean, settings?: any }){
  const queryClient = useQueryClient();
  const { data:rows, refetch, isLoading } = useQuery({
    queryKey:['salary-history', userId],
    queryFn: ()=> api<any[]>('GET', `/employees/${userId}/salary-history`)
  });

  const [showAdd, setShowAdd] = useState(false);
  const [effectiveDate, setEffectiveDate] = useState('');
  const [payType, setPayType] = useState('');
  const [newSalary, setNewSalary] = useState('');
  const [justification, setJustification] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const reset = ()=>{
    setEffectiveDate('');
    setPayType('');
    setNewSalary('');
    setJustification('');
    setNotes('');
  };

  const save = async()=>{
    if (saving) return;
    if (!effectiveDate) { toast.error('Effective date is required'); return; }
    if (!String(newSalary||'').trim()) { toast.error('Pay rate is required'); return; }
    if (!String(justification||'').trim()) { toast.error('Change reason is required'); return; }

    setSaving(true);
    try{
      await api('POST', `/employees/${userId}/salary-history`, {
        effective_date: `${effectiveDate}T00:00:00Z`,
        new_salary: String(newSalary).trim(),
        pay_type: String(payType||'').trim() || null,
        justification: String(justification).trim(),
        notes: String(notes||'').trim() || null,
      });
      toast.success('Salary change saved');
      setShowAdd(false);
      reset();
      await refetch();
      await queryClient.invalidateQueries({ queryKey: ['userProfile', userId] });
    }catch(e:any){
      toast.error(e?.message || 'Failed to save salary change');
    }finally{
      setSaving(false);
    }
  };

  const formatDate = (iso?: string | null)=>{
    if(!iso) return '—';
    try{
      return new Date(iso).toLocaleDateString(undefined, { timeZone: 'UTC' });
    }catch{
      return String(iso).slice(0,10);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs font-medium text-gray-700">History</div>
        {canEdit && (
          <button
            onClick={()=>setShowAdd(true)}
            className="px-2.5 py-1 rounded border border-green-300 text-green-700 text-xs font-medium hover:bg-green-50"
          >
            New Entry
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="text-xs text-gray-600">Loading...</div>
      ) : (rows && rows.length > 0) ? (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b">
                <th className="text-left py-1.5 px-2 font-medium text-gray-600">Effective date</th>
                <th className="text-left py-1.5 px-2 font-medium text-gray-600">Pay type</th>
                <th className="text-left py-1.5 px-2 font-medium text-gray-600">Pay rate</th>
                <th className="text-left py-1.5 px-2 font-medium text-gray-600">Change reason</th>
                <th className="text-left py-1.5 px-2 font-medium text-gray-600">Comment</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r:any)=> {
                const prev = String(r.previous_salary||'').trim();
                const next = String(r.new_salary||'').trim();
                const payLabel = prev ? `${next} (was ${prev})` : (next || '—');
                return (
                  <tr key={r.id} className="border-b align-top">
                    <td className="py-1.5 px-2 whitespace-nowrap text-gray-900">{formatDate(r.effective_date)}</td>
                    <td className="py-1.5 px-2 whitespace-nowrap text-gray-900">{String(r.pay_type||'') || '—'}</td>
                    <td className="py-1.5 px-2 whitespace-nowrap text-gray-900">{payLabel}</td>
                    <td className="py-1.5 px-2 whitespace-pre-line text-gray-900">{String(r.justification||'') || '—'}</td>
                    <td className="py-1.5 px-2 whitespace-pre-line text-gray-900">{String(r.notes||'') || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="text-xs text-gray-600 py-3 text-center">No salary history yet.</div>
      )}

      <AppFormModal
        open={showAdd}
        onClose={() => {
          setShowAdd(false);
          reset();
        }}
        title="New salary entry"
        footer={
          <div className={uiCx(uiLayout.actionsRow, 'w-full justify-end')}>
            <AppButton
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                setShowAdd(false);
                reset();
              }}
            >
              Cancel
            </AppButton>
            <AppButton type="button" size="sm" disabled={saving} loading={saving} onClick={save}>
              {saving ? 'Saving...' : 'Save'}
            </AppButton>
          </div>
        }
      >
        <div className={uiSpacing.sectionStack}>
          <div className="grid gap-2.5 md:grid-cols-2">
            <AppDatePicker
              label="Effective date *"
              value={effectiveDate}
              onChange={(e) => setEffectiveDate(e.target.value)}
            />
            {settings?.pay_types?.length ? (
              <AppSelect
                label="Pay type"
                placeholder="Select..."
                value={payType}
                onChange={(e) => setPayType(e.target.value)}
                options={sortByLabel(settings.pay_types, (it: any) => (it.label || '').toString()).map((it: any) => ({
                  value: it.label,
                  label: it.label,
                }))}
              />
            ) : (
              <AppInput
                label="Pay type"
                value={payType}
                onChange={(e) => setPayType(e.target.value)}
                placeholder="Hourly / Salary / Contract..."
              />
            )}
          </div>
          <AppInput
            label="Pay rate *"
            value={newSalary}
            onChange={(e) => setNewSalary(e.target.value)}
            placeholder="$29.00 / Hour"
          />
          <AppTextarea
            label="Change reason *"
            rows={3}
            value={justification}
            onChange={(e) => setJustification(e.target.value)}
            placeholder="Reason for the salary change..."
          />
          <AppTextarea
            label="Comment"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional notes..."
          />
        </div>
      </AppFormModal>
    </div>
  );
}


// Division icons use images from @/icons via DivisionIcon component
const getDivisionIcon = (label: string) => <DivisionIcon label={label} size={14} />;

// Personal tab sections
function BasicInformationFields({
  p,
  editable,
  selfEdit,
  userId,
  collectChanges,
  profileData,
  onSaved,
  showFieldHints,
}: {
  p: any;
  editable: boolean;
  selfEdit: boolean;
  userId: string;
  collectChanges?: (kv: Record<string, any>) => void;
  profileData?: any;
  onSaved?: () => void;
  showFieldHints?: boolean;
}) {
  const isEditable = !!editable;
  return (
    <>
      <EditableGrid
        p={p}
        editable={isEditable}
        selfEdit={selfEdit}
        userId={userId}
        collectChanges={collectChanges}
        inlineSave={!collectChanges}
        onSaved={onSaved}
        showFieldHints={showFieldHints}
        fields={[
          ['First name', 'first_name'],
          ['Last name', 'last_name'],
          ['Middle name', 'middle_name'],
          ['Prefered name', 'preferred_name'],
          ['Gender', 'gender'],
          ['Marital status', 'marital_status'],
          ['Date of birth', 'date_of_birth'],
          ['Nationality', 'nationality'],
        ]}
      />
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <ClothSizeField
          p={p}
          editable={isEditable}
          userId={userId}
          collectChanges={collectChanges}
          profileData={profileData}
          showFieldHints={showFieldHints}
        />
      </div>
    </>
  );
}

function BasicInformationSection({ p, editable, userId, collectChanges, profileData, onEditClick, canEdit, selfEdit, embedded }: { p: any, editable: boolean, userId: string, collectChanges?: (kv: Record<string, any>) => void, profileData?: any, onEditClick?: () => void, canEdit?: boolean, selfEdit?: boolean, embedded?: boolean, onSaved?: () => void }) {
  const isEditable = !!editable;
  const fields = (
    <BasicInformationFields
      p={p}
      editable={isEditable}
      selfEdit={!!selfEdit}
      userId={userId}
      collectChanges={collectChanges}
      profileData={profileData}
      showFieldHints={!!embedded}
    />
  );
  if (embedded) return fields;
  return (
    <UserInfoSectionCard
      preset="basicInformation"
      title="Basic Information"
      description="Legal name and identity details for this employee."
      showEdit={!isEditable && !!canEdit}
      onEditClick={onEditClick}
      editTitle="Edit Basic Information"
    >
      {fields}
    </UserInfoSectionCard>
  );
}

function AddressSectionCard({ p, editable, userId, collectChanges, onEditClick, canEdit, selfEdit, embedded, onSaved }: { p: any, editable: boolean, userId: string, collectChanges?: (kv: Record<string, any>) => void, onEditClick?: () => void, canEdit?: boolean, selfEdit?: boolean, embedded?: boolean, onSaved?: () => void }) {
  const isEditable = !!editable;
  const fields = (
    <AddressSection
      p={p}
      editable={isEditable}
      selfEdit={!!selfEdit}
      userId={userId}
      collectChanges={collectChanges}
      inlineSave={!collectChanges}
      onSaved={onSaved}
      showFieldHints={!!embedded}
    />
  );
  if (embedded) return fields;
  return (
    <UserInfoSectionCard
      preset="address"
      title="Address"
      description="Primary mailing and location address."
      showEdit={!isEditable && !!canEdit}
      onEditClick={onEditClick}
      editTitle="Edit Address"
    >
      {fields}
    </UserInfoSectionCard>
  );
}

function ContactSection({ p, editable, userId, collectChanges, onEditClick, canEdit, selfEdit, embedded, onSaved }: { p: any, editable: boolean, userId: string, collectChanges?: (kv: Record<string, any>) => void, onEditClick?: () => void, canEdit?: boolean, selfEdit?: boolean, embedded?: boolean, onSaved?: () => void }) {
  const isEditable = !!editable;
  const fields = (
    <EditableGrid
      p={p}
      editable={isEditable}
      selfEdit={!!selfEdit}
      userId={userId}
      collectChanges={collectChanges}
      inlineSave={!collectChanges}
      onSaved={onSaved}
      showFieldHints={!!embedded}
      fields={[
        ['Phone 1', 'phone'],
        ['Phone 2', 'mobile_phone'],
      ]}
    />
  );
  if (embedded) return fields;
  return (
    <UserInfoSectionCard
      preset="contact"
      title="Contact"
      description="Personal phone numbers for reaching this employee."
      showEdit={!isEditable && !!canEdit}
      onEditClick={onEditClick}
      editTitle="Edit Contact"
    >
      {fields}
    </UserInfoSectionCard>
  );
}

function EducationSectionCard({ userId, canEdit, onEditClick, canEditButton, embedded }: { userId: string, canEdit: boolean, onEditClick?: () => void, canEditButton?: boolean, embedded?: boolean }) {
  const fields = (
    <EducationSection userId={userId} canEdit={canEdit} showFieldHints={!!embedded} embedded={!!embedded} />
  );
  if (embedded) return fields;
  return (
    <UserInfoSectionCard
      preset="education"
      title="Education"
      description="Degrees and institutions on file."
      showEdit={!canEdit && !!canEditButton}
      onEditClick={onEditClick}
      editTitle="Edit Education"
    >
      {fields}
    </UserInfoSectionCard>
  );
}

function LegalDocumentsFields({
  p,
  editable,
  userId,
  collectChanges,
  pending,
  canSelfEdit,
  showFieldHints,
}: {
  p: any;
  editable: boolean;
  userId: string;
  collectChanges?: (kv: Record<string, any>) => void;
  pending?: any;
  canSelfEdit?: boolean;
  showFieldHints?: boolean;
}) {
  const isEditable = !!editable;
  const mergedProfile = { ...p, ...(pending || {}) };
  return (
    <div className={uiSpacing.sectionStack}>
      {isEditable ? (
        <EditableGrid
          p={mergedProfile}
          editable={isEditable}
          selfEdit={!!canSelfEdit}
          userId={userId}
          collectChanges={collectChanges}
          inlineSave={false}
          showFieldHints={showFieldHints}
          fields={[
            ['SIN Number', 'sin_number'],
            ['Work Eligibility Status', 'work_eligibility_status'],
          ]}
          fieldOptions={{
            work_eligibility_status: [
              'Canadian Citizen',
              'Permanent Resident',
              'Temporary Resident (with work authorization)',
              'Other',
            ],
          }}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <UserInfoReadOnlyField label="SIN Number" value={mergedProfile.sin_number} />
          <UserInfoReadOnlyField label="Work Eligibility Status" value={mergedProfile.work_eligibility_status} />
        </div>
      )}
      <WorkEligibilityDocumentsSection
        userId={userId}
        canEdit={isEditable}
        profile={mergedProfile}
        onProfileFieldsChange={collectChanges || (() => undefined)}
        showFieldHints={showFieldHints}
      />
    </div>
  );
}

function LegalDocumentsSection({ p, editable, userId, collectChanges, pending, onEditClick, canEdit, canSelfEdit, embedded }: { p: any, editable: boolean, userId: string, collectChanges?: (kv: Record<string, any>) => void, pending?: any, onEditClick?: () => void, canEdit?: boolean, canSelfEdit?: boolean, embedded?: boolean }) {
  const isEditable = !!editable;
  const fields = (
    <LegalDocumentsFields
      p={p}
      editable={isEditable}
      userId={userId}
      collectChanges={collectChanges}
      pending={pending}
      canSelfEdit={canSelfEdit}
      showFieldHints={!!embedded}
    />
  );
  if (embedded) return fields;
  return (
    <UserInfoSectionCard
      preset="documents"
      title="Legal & Documents"
      description="SIN, work eligibility, and supporting documents."
      showEdit={!isEditable && !!canEdit}
      onEditClick={onEditClick}
      editTitle="Edit Legal & Documents"
    >
      {fields}
    </UserInfoSectionCard>
  );
}

function EmergencyContactsSectionCard({ userId, canEdit, onEditClick, canEditButton, embedded }: { userId: string, canEdit: boolean, onEditClick?: () => void, canEditButton?: boolean, embedded?: boolean }) {
  const fields = <EmergencyContactsSection userId={userId} canEdit={canEdit} showFieldHints={!!embedded} />;
  if (embedded) return fields;
  return (
    <UserInfoSectionCard
      preset="emergency"
      title="Emergency Contacts"
      description="People to contact in an emergency."
      showEdit={!canEdit && !!canEditButton}
      onEditClick={onEditClick}
      editTitle="Edit Emergency Contacts"
    >
      {fields}
    </UserInfoSectionCard>
  );
}

function OrganizationSection({ p, editable, userId, collectChanges, usersOptions, settings, userDivisions, selectedDivisions, onDivisionsChange, selectedProjectDivisions, onProjectDivisionsChange, canViewCompensation, onEditClick, embedded }: { p:any, editable:boolean, userId:string, collectChanges?: (kv:Record<string,any>)=>void, usersOptions:any[], settings:any, userDivisions?: any[], selectedDivisions?: string[], onDivisionsChange?: (divisions: string[]) => void, selectedProjectDivisions?: string[], onProjectDivisionsChange?: (divisions: string[]) => void, canViewCompensation?: boolean, onEditClick?: () => void, embedded?: boolean }){
  const isEditable = !!editable;
  const showFieldHints = !!embedded;
  const { data: projectDivisions } = useQuery({ 
    queryKey:['project-divisions'], 
    queryFn: ()=> api<any[]>('GET','/settings/project-divisions'), 
    staleTime: 300_000 
  });
  
  const [form, setForm] = useState<any>(()=>({
    job_title: p.job_title||'',
    manager_user_id: p.manager_user_id||'',
    employment_type: p.employment_type||'',
    hire_date: p.hire_date||'',
    termination_date: p.termination_date||'',
    work_email: p.work_email||'',
    work_phone: p.work_phone||'',
  }));
  const prevEditableRef = useRef(editable);
  
  useEffect(() => {
    if (editable && !prevEditableRef.current) {
      setForm({ job_title: p.job_title||'', manager_user_id: p.manager_user_id||'', employment_type: p.employment_type||'', hire_date: p.hire_date||'', termination_date: p.termination_date||'', work_email: p.work_email||'', work_phone: p.work_phone||'' });
      if (onProjectDivisionsChange) {
        const projectDivs = Array.isArray(p.project_division_ids) ? p.project_division_ids.map((id: any) => String(id)) : [];
        onProjectDivisionsChange(projectDivs);
      }
    }
    if (!editable && prevEditableRef.current) {
      setForm({ job_title: p.job_title||'', manager_user_id: p.manager_user_id||'', employment_type: p.employment_type||'', hire_date: p.hire_date||'', termination_date: p.termination_date||'', work_email: p.work_email||'', work_phone: p.work_phone||'' });
      if (onProjectDivisionsChange) {
        const projectDivs = Array.isArray(p.project_division_ids) ? p.project_division_ids.map((id: any) => String(id)) : [];
        onProjectDivisionsChange(projectDivs);
      }
    }
    prevEditableRef.current = editable;
  }, [editable, p.job_title, p.manager_user_id, p.project_division_ids, onProjectDivisionsChange]);
  
  const onField = (key:string, value:any)=>{ 
    setForm((s:any)=>({ ...s, [key]: value })); 
    collectChanges?.({ [key]: value }); 
  };
  
  const supervisorUsers = useMemo(
    () => (usersOptions || []).map((u: any) => mapEmployeeToAppUserSelect(u as Record<string, unknown>)),
    [usersOptions],
  );

  const departmentOptions = useMemo(
    () =>
      sortByLabel(settings?.divisions || [], (d: any) => String(d.label || '')).map((d: any) => ({
        value: String(d.id),
        label: String(d.label),
      })),
    [settings?.divisions],
  );

  const departmentsDisplay = useMemo(() => {
    if (selectedDivisions?.length && settings?.divisions?.length) {
      return selectedDivisions
        .map((id: string) => settings.divisions.find((d: any) => String(d.id) === id)?.label || '')
        .filter(Boolean)
        .join(', ');
    }
    if (userDivisions?.length) return userDivisions.map((d: any) => d.label).join(', ');
    return String(p.division || '');
  }, [selectedDivisions, settings?.divisions, userDivisions, p.division]);

  const { data: supervisorProfile } = useQuery({
    queryKey: ['supervisor-profile-org', p?.manager_user_id],
    queryFn: ()=> api<any>('GET', `/auth/users/${p.manager_user_id}/profile`),
    enabled: !!p?.manager_user_id,
  });
  
  const supervisor = useMemo(()=>{
    if (supervisorProfile?.profile) {
      const fn = supervisorProfile.profile.first_name||'';
      const ln = supervisorProfile.profile.last_name||'';
      const full = `${fn} ${ln}`.trim();
      if (full) return full;
    }
    if(!p?.manager_user_id) return '';
    const row = (usersOptions || []).find((x: any) => String(x.id) === String(p.manager_user_id));
    return row ? String(row.name || row.username || row.email || '') : '';
  }, [usersOptions, p?.manager_user_id, supervisorProfile]);
  
  // Flatten project divisions (main divisions + subdivisions)
  const allProjectDivisions = useMemo(() => {
    if (!projectDivisions) return [];
    const flat: any[] = [];
    projectDivisions.forEach((div: any) => {
      flat.push({ ...div, isMain: true });
      if (div.subdivisions && Array.isArray(div.subdivisions)) {
        div.subdivisions.forEach((sub: any) => {
          flat.push({ ...sub, isMain: false, parentLabel: div.label });
        });
      }
    });
    return flat;
  }, [projectDivisions]);

  const projectDivisionOptions = useMemo(
    () =>
      allProjectDivisions.map((d: any) => ({
        value: String(d.id),
        label: d.isMain ? String(d.label) : `${d.parentLabel} - ${d.label}`,
      })),
    [allProjectDivisions],
  );

  const fields = (
    <>
      <div className="grid gap-4 md:grid-cols-2">
        {isEditable ? (
          <AppInput
            label="Job Title"
            value={form.job_title}
            onChange={(e) => onField('job_title', e.target.value)}
            placeholder="e.g. Project Manager"
            fieldHint={showFieldHints ? userProfileFieldHint('job_title') : undefined}
          />
        ) : (
          <UserInfoReadOnlyField label="Job Title" value={String(p.job_title || '')} />
        )}
        {isEditable ? (
          <AppSelect
            label="Employment Type"
            placeholder="Select..."
            value={form.employment_type}
            onChange={(e) => onField('employment_type', e.target.value)}
            fieldHint={showFieldHints ? userProfileFieldHint('employment_type') : undefined}
            options={[
              { value: 'Full-time', label: 'Full-time' },
              { value: 'Hourly', label: 'Hourly' },
              { value: 'Part-time', label: 'Part-time' },
              { value: 'Salary', label: 'Salary' },
            ]}
          />
        ) : (
          <UserInfoReadOnlyField label="Employment Type" value={String(p.employment_type || '')} />
        )}
        {isEditable ? (
          <AppUserSelect
            label="Supervisor"
            placeholder="Select..."
            value={form.manager_user_id}
            onChange={(id) => onField('manager_user_id', id)}
            users={supervisorUsers}
            fieldHint={showFieldHints ? userProfileFieldHint('manager_user_id') : undefined}
          />
        ) : (
          <UserInfoReadOnlyField label="Supervisor" value={supervisor} />
        )}
        {isEditable ? (
          <AppDatePicker
            label="Hire Date"
            value={(form.hire_date || '').slice(0, 10)}
            onChange={(e) => onField('hire_date', e.target.value)}
            fieldHint={showFieldHints ? userProfileFieldHint('hire_date') : undefined}
          />
        ) : (
          <UserInfoReadOnlyField label="Hire Date" value={String(p.hire_date || '').slice(0, 10)} />
        )}
        {isEditable && settings?.divisions?.length ? (
          <AppMultiSelect
            label="Departments"
            searchable
            placeholder="Select departments..."
            value={selectedDivisions || []}
            onChange={(vals) => {
              onDivisionsChange?.(vals);
              collectChanges?.({ _divisions_changed: true, _selected_divisions: vals });
            }}
            options={departmentOptions}
            fieldHint={showFieldHints ? userProfileFieldHint('departments') : undefined}
          />
        ) : (
          <UserInfoReadOnlyField label="Departments" value={departmentsDisplay} />
        )}
        {isEditable ? (
          <AppDatePicker
            label="Termination Date"
            value={(form.termination_date || '').slice(0, 10)}
            onChange={(e) => onField('termination_date', e.target.value)}
            fieldHint={showFieldHints ? userProfileFieldHint('termination_date') : undefined}
          />
        ) : (
          <UserInfoReadOnlyField label="Termination Date" value={String(p.termination_date || '').slice(0, 10)} />
        )}
        {isEditable ? (
          <AppInput
            label="Work email"
            value={form.work_email}
            onChange={(e) => onField('work_email', e.target.value)}
            fieldHint={showFieldHints ? userProfileFieldHint('work_email') : undefined}
          />
        ) : (
          <UserInfoReadOnlyField label="Work email" value={String(p.work_email || '')} />
        )}
        {isEditable ? (
          <AppInput
            label="Work phone"
            value={form.work_phone}
            onChange={(e) => onField('work_phone', e.target.value)}
            fieldHint={showFieldHints ? userProfileFieldHint('work_phone') : undefined}
          />
        ) : (
          <UserInfoReadOnlyField label="Work phone" value={String(p.work_phone || '')} />
        )}
      </div>
      <div>
        {isEditable ? (
          projectDivisions && projectDivisions.length > 0 ? (
            <AppMultiSelect
              label="Project Divisions"
              searchable
              placeholder="Select project divisions..."
              value={selectedProjectDivisions || []}
              onChange={(vals) => {
                onProjectDivisionsChange?.(vals);
                collectChanges?.({ project_division_ids: vals });
              }}
              options={projectDivisionOptions}
              fieldHint={showFieldHints ? userProfileFieldHint('project_division_ids') : undefined}
            />
          ) : (
            <p className={uiTypography.helper}>Loading project divisions...</p>
          )
        ) : (
          <div>
            <div className={uiTypography.helper}>Project Divisions</div>
            <div className={uiCx('mt-1.5', uiSpacing.sectionStack)}>
              {(selectedProjectDivisions || []).length > 0
                ? (selectedProjectDivisions || []).map((id: string) => {
                    const division = allProjectDivisions.find((d: any) => String(d.id) === id);
                    if (!division) return null;
                    const divisionLabel = division.isMain
                      ? division.label
                      : `${division.parentLabel} - ${division.label}`;
                    const divisionIcon = getDivisionIcon(division.isMain ? division.label : division.parentLabel);
                    return (
                      <div key={id} className="flex items-center gap-1.5">
                        <span className="inline-flex items-center">{divisionIcon}</span>
                        <span className={uiTypography.sectionTitle}>{divisionLabel}</span>
                      </div>
                    );
                  })
                : <span className={uiTypography.sectionTitle}>—</span>}
            </div>
          </div>
        )}
      </div>
    </>
  );

  if (embedded) return fields;

  return (
    <UserInfoSectionCard
      preset="employment"
      title="Organization"
      description="Job title, supervisor, departments, and work contact details."
      showEdit={!isEditable && !!onEditClick}
      onEditClick={onEditClick}
      editTitle="Edit Organization"
    >
      {fields}
    </UserInfoSectionCard>
  );
}

function TimeOffSection({ userId, canEdit }:{ userId:string, canEdit:boolean }){
  const { data:me } = useQuery({ queryKey:['me'], queryFn: ()=> api<any>('GET','/auth/me') });
  
  // Ensure canEdit is true for admins
  const hasEditPermission = canEdit || (me?.roles || []).some((r: string) => String(r || '').toLowerCase() === 'admin') || (me?.permissions || []).includes('users:write');
  const isAdmin = (me?.roles || []).some((r: string) => String(r || '').toLowerCase() === 'admin');
  
  const { data:balances, refetch:refetchBalances } = useQuery({ 
    queryKey:['time-off-balance', userId], 
    queryFn: ()=> api<any[]>('GET', `/employees/${userId}/time-off/balance`) 
  });
  const { data:requests, refetch:refetchRequests } = useQuery({ 
    queryKey:['time-off-requests', userId], 
    queryFn: ()=> api<any[]>('GET', `/employees/${userId}/time-off/requests`) 
  });
  const { data:history, refetch:refetchHistory } = useQuery({ 
    queryKey:['time-off-history', userId], 
    queryFn: ()=> api<any[]>('GET', `/employees/${userId}/time-off/history`) 
  });
  const [showRequestForm, setShowRequestForm] = useState(false);
  const [policyName, setPolicyName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [hours, setHours] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncingHistory, setSyncingHistory] = useState(false);
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [adjustingBalance, setAdjustingBalance] = useState<any>(null);
  const [selectedPolicyName, setSelectedPolicyName] = useState('');
  const [adjustmentType, setAdjustmentType] = useState<'add' | 'subtract'>('add');
  const [adjustmentDays, setAdjustmentDays] = useState('');
  const [effectiveDate, setEffectiveDate] = useState(new Date().toISOString().split('T')[0]);
  const [adjustmentNote, setAdjustmentNote] = useState('');
  const [adjusting, setAdjusting] = useState(false);
  const [deletingHistoryId, setDeletingHistoryId] = useState<string | null>(null);
  const [showEditHistoryModal, setShowEditHistoryModal] = useState(false);
  const [editHistoryForm, setEditHistoryForm] = useState<{
    id: string;
    policy_name: string;
    transaction_date: string;
    description: string;
    used_days: string;
    earned_days: string;
  } | null>(null);
  const [savingHistoryEdit, setSavingHistoryEdit] = useState(false);

  const calculateHours = () => {
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      setHours(String(days * 8));
    }
  };
  
  useEffect(() => {
    calculateHours();
  }, [startDate, endDate]);
  
  const handleSync = async () => {
    setSyncing(true);
    try {
      await api('POST', `/employees/${userId}/time-off/balance/sync`);
      toast.success('Time off balance synced from BambooHR');
      refetchBalances();
    } catch (error: any) {
      toast.error(error?.message || 'Failed to sync balance');
    } finally {
      setSyncing(false);
    }
  };
  
  const handleSyncHistory = async () => {
    setSyncingHistory(true);
    try {
      await api('POST', `/employees/${userId}/time-off/history/sync`);
      toast.success('Time off history synced from BambooHR');
      refetchHistory();
    } catch (error: any) {
      toast.error(error?.message || 'Failed to sync history');
    } finally {
      setSyncingHistory(false);
    }
  };
  
  const handleSubmit = async () => {
    if (!policyName || !startDate || !endDate) {
      toast.error('Please fill in all required fields');
      return;
    }
    
    setSubmitting(true);
    try {
      await api('POST', `/employees/${userId}/time-off/requests`, {
        policy_name: policyName,
        start_date: startDate,
        end_date: endDate,
        hours: hours ? parseFloat(hours) : undefined,
        notes: notes
      });
      toast.success('Time off request submitted');
      setShowRequestForm(false);
      setPolicyName('');
      setStartDate('');
      setEndDate('');
      setHours('');
      setNotes('');
      refetchRequests();
      refetchBalances();
    } catch (error: any) {
      toast.error(error?.message || 'Failed to submit request');
    } finally {
      setSubmitting(false);
    }
  };
  
  const handleCancel = async (requestId: string) => {
    try {
      await api('PATCH', `/employees/${userId}/time-off/requests/${requestId}`, {
        status: 'cancelled'
      });
      toast.success('Request cancelled');
      refetchRequests();
      refetchBalances();
    } catch (error: any) {
      toast.error(error?.message || 'Failed to cancel request');
    }
  };
  
  const handleOpenAdjust = (balance: any) => {
    setAdjustingBalance(balance);
    setSelectedPolicyName(balance.policy_name || '');
    setAdjustmentType('add');
    setAdjustmentDays('');
    setEffectiveDate(new Date().toISOString().split('T')[0]);
    setAdjustmentNote('');
    setShowAdjustModal(true);
  };
  
  const handleAdjust = async () => {
    const policyName = selectedPolicyName || adjustingBalance?.policy_name;
    if (!policyName || !adjustmentDays || !effectiveDate || !adjustmentNote.trim()) {
      toast.error('Please fill in all required fields');
      return;
    }
    
    const days = parseFloat(adjustmentDays);
    if (isNaN(days) || days <= 0) {
      toast.error('Amount must be greater than 0');
      return;
    }
    
    setAdjusting(true);
    try {
      await api('POST', `/employees/${userId}/time-off/balance/adjust`, {
        policy_name: policyName,
        adjustment_type: adjustmentType,
        amount_days: days,
        effective_date: effectiveDate,
        note: adjustmentNote.trim()
      });
      toast.success('Balance adjusted successfully');
      setShowAdjustModal(false);
      setAdjustingBalance(null);
      setSelectedPolicyName('');
      setAdjustmentDays('');
      setAdjustmentNote('');
      refetchBalances();
      refetchHistory();
    } catch (error: any) {
      toast.error(error?.message || 'Failed to adjust balance');
    } finally {
      setAdjusting(false);
    }
  };
  
  const handleDeleteHistoryEntry = async (entryId: string) => {
    if (!isAdmin) return;
    if (deletingHistoryId) return;
    setDeletingHistoryId(entryId);
    try {
      await api('DELETE', `/employees/${userId}/time-off/history/${encodeURIComponent(entryId)}`);
      toast.success('History entry deleted');
      refetchHistory();
      refetchBalances();
    } catch (error: any) {
      toast.error(error?.message || 'Failed to delete entry');
    } finally {
      setDeletingHistoryId(null);
    }
  };
  
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved': return 'bg-green-100 text-green-800';
      case 'rejected': return 'bg-red-100 text-red-800';
      case 'cancelled': return 'bg-gray-100 text-gray-800';
      default: return 'bg-yellow-100 text-yellow-800';
    }
  };
  
  const availablePolicies = balances?.map((b: any) => b.policy_name) || [];
  const totalBalance = balances?.reduce((sum: number, b: any) => sum + b.balance_hours, 0) || 0;

  const openEditHistoryModal = (h: any) => {
    setEditHistoryForm({
      id: String(h.id),
      policy_name: String(h.policy_name || ''),
      transaction_date: h.transaction_date ? String(h.transaction_date).slice(0, 10) : '',
      description: h.description != null ? String(h.description) : '',
      used_days: h.used_days != null && h.used_days !== '' ? String(h.used_days) : '',
      earned_days: h.earned_days != null && h.earned_days !== '' ? String(h.earned_days) : '',
    });
    setShowEditHistoryModal(true);
  };

  const handleSaveHistoryEdit = async () => {
    if (!editHistoryForm || !isAdmin) return;
    const { id, policy_name, transaction_date, description, used_days, earned_days } = editHistoryForm;
    if (!transaction_date) {
      toast.error('Transaction date is required');
      return;
    }
    const u = used_days.trim() ? parseFloat(used_days) : 0;
    const e = earned_days.trim() ? parseFloat(earned_days) : 0;
    if ((!used_days.trim() || isNaN(u) || u === 0) && (!earned_days.trim() || isNaN(e) || e === 0)) {
      toast.error('Enter at least one non-zero value for used days or earned days');
      return;
    }
    setSavingHistoryEdit(true);
    try {
      await api('PATCH', `/employees/${userId}/time-off/history/${encodeURIComponent(id)}`, {
        policy_name: policy_name.trim() || undefined,
        transaction_date,
        description: description.trim() || null,
        used_days: used_days.trim() ? parseFloat(used_days) : null,
        earned_days: earned_days.trim() ? parseFloat(earned_days) : null,
      });
      toast.success('History entry updated');
      setShowEditHistoryModal(false);
      setEditHistoryForm(null);
      await refetchHistory();
      await refetchBalances();
    } catch (err: any) {
      toast.error(err?.message || err?.detail || 'Failed to update entry');
    } finally {
      setSavingHistoryEdit(false);
    }
  };
  
  // Ensure we always show cards for main policies (Sick Leave and Vacation), even if they don't exist in DB
  const defaultPolicies = ['Sick Leave', 'Vacation'];
  const displayedBalances = useMemo(() => {
    if (!balances || balances.length === 0) {
      // If no balances, show default policies as empty cards
      return defaultPolicies.map(policy => ({
        id: `default-${policy}`,
        policy_name: policy,
        balance_hours: 0,
        accrued_hours: 0,
        used_hours: 0,
        year: new Date().getFullYear(),
        isDefault: true
      }));
    }
    
    // Merge existing balances with default policies
    const existingPolicyNames = balances.map((b: any) => b.policy_name);
    const missingPolicies = defaultPolicies.filter(p => 
      !existingPolicyNames.some((name: string) => name.toLowerCase().includes(p.toLowerCase()))
    );
    
    const result = [...balances];
    missingPolicies.forEach(policy => {
      result.push({
        id: `default-${policy}`,
        policy_name: policy,
        balance_hours: 0,
        accrued_hours: 0,
        used_hours: 0,
        year: new Date().getFullYear(),
        isDefault: true
      });
    });
    
    return result;
  }, [balances]);
  const pendingRequests = requests?.filter((r: any) => r.status === 'pending') || [];
  const upcomingRequests = requests?.filter((r: any) => {
    if (r.status !== 'approved') return false;
    const endDate = new Date(r.end_date);
    return endDate >= new Date();
  }) || [];
  const historyRequests = requests?.filter((r: any) => {
    if (r.status === 'pending') return false;
    const endDate = new Date(r.end_date);
    return endDate < new Date() || r.status !== 'approved';
  }) || [];
  
  // Convert hours to days (assuming 8 hours per day)
  const hoursToDays = (hours: number) => {
    return (hours / 8).toFixed(1);
  };
  
  return (
    <UserInfoSectionCard preset="timesheet" title="Time Off">
      <div className={uiSpacing.sectionStack}>
        {/* Top Row: Balance (left) and Upcoming (right) */}
        <div className="grid md:grid-cols-2 gap-4">
          {/* Balance Section - Left */}
          <div className="rounded-lg border bg-gray-50 p-4">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded bg-green-100 flex items-center justify-center">
                  <svg className="w-5 h-5 text-green-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <h5 className="text-sm font-semibold text-green-900">Available Balance</h5>
              </div>
            </div>
          {displayedBalances && displayedBalances.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {displayedBalances.map((b: any) => {
                const balanceDays = hoursToDays(b.balance_hours);
                const isNegative = b.balance_hours < 0;
                const isSickLeave = b.policy_name.toLowerCase().includes('sick');
                const isVacation = b.policy_name.toLowerCase().includes('vacation') || b.policy_name.toLowerCase().includes('holiday');
                return (
                  <div key={b.id} className="p-3 bg-white rounded-lg border border-gray-200 relative">
                    {/* Edit button in top right corner */}
                    {hasEditPermission && (
                      <button
                        onClick={() => handleOpenAdjust(b)}
                        className="absolute top-1.5 right-1.5 p-1 rounded hover:bg-gray-100 text-gray-500 hover:text-brand-red transition-colors"
                        title="Adjust Balance"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                    )}
                    {/* Icon and Balance */}
                    <div className="flex items-center justify-center mb-2">
                      {isSickLeave ? (
                        <div className="w-8 h-8 rounded bg-red-100 flex items-center justify-center">
                          <svg className="w-5 h-5 text-red-600" viewBox="0 0 24 24" fill="none">
                            <path d="M12 8v4m0 4h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
                          </svg>
                        </div>
                      ) : isVacation ? (
                        <div className="w-8 h-8 rounded bg-blue-100 flex items-center justify-center">
                          <svg className="w-5 h-5 text-blue-600" viewBox="0 0 24 24" fill="none">
                            <path d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </div>
                      ) : (
                        <div className="w-8 h-8 rounded bg-green-100 flex items-center justify-center">
                          <svg className="w-5 h-5 text-green-600" viewBox="0 0 24 24" fill="none">
                            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
                            <path d="M12 8v4l3 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </div>
                      )}
                    </div>
                    <div className="text-center">
                      <div className={`text-sm font-semibold ${isNegative ? 'text-red-600' : isSickLeave ? 'text-red-600' : isVacation ? 'text-blue-600' : 'text-green-600'}`}>
                        {isNegative ? '-' : ''}{balanceDays} Days
                      </div>
                      <div className="text-xs font-medium text-gray-700 mt-0.5">
                        {b.policy_name}
                      </div>
                      {b.isDefault && (
                        <div className="text-[10px] text-orange-600 mt-0.5">(Not yet created)</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>
        
          {/* Upcoming Time Off - Right */}
          <div className="rounded-lg border bg-gray-50 p-4">
            <div className="flex items-center justify-between mb-3">
              <h5 className="font-semibold flex items-center gap-2 text-sm">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Upcoming Time Off
              </h5>
              {availablePolicies.length > 0 && (
                <button
                  onClick={() => setShowRequestForm(true)}
                  className="px-2 py-1 rounded border border-blue-300 text-blue-700 text-xs font-medium hover:bg-blue-50"
                >
                  Request Time Off
                </button>
              )}
            </div>
          {upcomingRequests.length > 0 || pendingRequests.length > 0 ? (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {[...pendingRequests, ...upcomingRequests].slice(0, 5).map((r: any) => (
                <div key={r.id} className="p-2 border rounded text-sm">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium">{r.policy_name}</div>
                      <div className="text-xs text-gray-600">
                        {new Date(r.start_date).toLocaleDateString()} - {new Date(r.end_date).toLocaleDateString()}
                      </div>
                    </div>
                    <span className={`px-2 py-0.5 rounded text-xs ${getStatusColor(r.status)}`}>
                      {r.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-gray-600 py-8 text-center">
              <div className="text-4xl mb-2">🏖️</div>
              <div>No upcoming time off.</div>
              <div className="text-xs text-gray-500 mt-1">Do you need to get away?</div>
            </div>
          )}
        </div>
      </div>
      
        {/* History Section - Bottom */}
        <div className="rounded-lg border bg-gray-50 p-4">
          <div className="flex items-center justify-between mb-3">
            <h5 className="font-semibold flex items-center gap-2 text-sm">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              History
            </h5>
            <div className="flex items-center gap-2">
              {hasEditPermission && (
                <button
                  onClick={handleSyncHistory}
                  disabled={syncingHistory}
                  className="px-2 py-1.5 rounded border border-gray-300 text-gray-700 text-xs font-medium hover:bg-gray-100 disabled:opacity-50"
                >
                  {syncingHistory ? 'Syncing...' : 'Sync History'}
                </button>
              )}
            </div>
          </div>
        {history && history.length > 0 ? (() => {
          // Group history by policy
          const groupedHistory = history.reduce((acc: any, h: any) => {
            if (!acc[h.policy_name]) {
              acc[h.policy_name] = [];
            }
            acc[h.policy_name].push(h);
            return acc;
          }, {});
          
          // Check if entry is a manual adjustment or manual history entry
          const isManualAdjustment = (desc: string) => {
            return desc && (desc.includes('Adjusted by') || desc.includes('Manual') || desc.includes('(by '));
          };
          
          return (
            <div className="space-y-4">
              {Object.entries(groupedHistory).map(([policyName, entries]: [string, any]) => (
                <div key={policyName} className="border rounded-lg overflow-hidden">
                  <div className="bg-gray-50 px-4 py-2 border-b">
                    <h6 className="font-semibold text-sm text-gray-900">{policyName}</h6>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-gray-50">
                          <th className="text-left py-2 px-3 font-semibold text-xs">Date</th>
                          <th className="text-left py-2 px-3 font-semibold text-xs">Description</th>
                          <th className="text-right py-2 px-3 font-semibold text-xs">Used Days (-)</th>
                          <th className="text-right py-2 px-3 font-semibold text-xs">Earned Days (+)</th>
                          <th className="text-right py-2 px-3 font-semibold text-xs">Balance</th>
                          {isAdmin && <th className="text-right py-2 px-3 font-semibold text-xs min-w-[5.5rem]"> </th>}
                        </tr>
                      </thead>
                      <tbody>
                        {entries.map((h: any) => {
                          const isAdjustment = isManualAdjustment(h.description || '');
                          return (
                            <tr key={h.id} className={`border-b ${isAdjustment ? 'bg-blue-50' : ''}`}>
                              <td className="py-2 px-3">
                                {new Date(h.transaction_date).toLocaleDateString(undefined, { 
                                  year: 'numeric',
                                  month: 'short',
                                  day: 'numeric',
                                  timeZone: 'UTC' 
                                })}
                              </td>
                              <td className="py-2 px-3">
                                <div className="flex items-center gap-2">
                                  {isAdjustment && (
                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                                      <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                                        <path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z" />
                                        <path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z" />
                                      </svg>
                                      Adjustment
                                    </span>
                                  )}
                                  <span className="whitespace-pre-line text-xs">{h.description || 'Time off transaction'}</span>
                                </div>
                              </td>
                              <td className="py-2 px-3 text-right">
                                {h.used_days ? (
                                  <span className="text-red-600 font-medium">
                                    {h.used_days < 0 ? parseFloat(h.used_days).toFixed(2) : `-${parseFloat(h.used_days).toFixed(2)}`}
                                  </span>
                                ) : '—'}
                              </td>
                              <td className="py-2 px-3 text-right">
                                {h.earned_days ? (
                                  <span className="text-green-600 font-medium">
                                    +{parseFloat(h.earned_days).toFixed(2)}
                                  </span>
                                ) : '—'}
                              </td>
                              <td className="py-2 px-3 text-right font-semibold">
                                {parseFloat(h.balance_after).toFixed(2)} days
                              </td>
                              {isAdmin && (
                                <td className="py-2 px-3 text-right">
                                  <div className="flex items-center justify-end gap-0.5">
                                    <button
                                      type="button"
                                      onClick={() => openEditHistoryModal(h)}
                                      disabled={!!deletingHistoryId || savingHistoryEdit}
                                      className="p-1 rounded text-gray-400 hover:text-blue-700 hover:bg-blue-50 disabled:opacity-50"
                                      title="Edit entry"
                                    >
                                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                      </svg>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteHistoryEntry(h.id)}
                                      disabled={!!deletingHistoryId || savingHistoryEdit}
                                      className="p-1 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-50"
                                      title="Delete entry"
                                    >
                                      {deletingHistoryId === h.id ? (
                                        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                        </svg>
                                      ) : (
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                      )}
                                    </button>
                                  </div>
                                </td>
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          );
        })() : historyRequests.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-2 font-semibold">Date</th>
                  <th className="text-left py-2 px-2 font-semibold">Description</th>
                  <th className="text-right py-2 px-2 font-semibold">Used Days (-)</th>
                  <th className="text-right py-2 px-2 font-semibold">Earned Days (+)</th>
                  <th className="text-right py-2 px-2 font-semibold">Balance</th>
                </tr>
              </thead>
              <tbody>
                {historyRequests.map((r: any) => {
                  const days = hoursToDays(r.hours);
                  return (
                    <tr key={r.id} className="border-b">
                      <td className="py-2 px-2">{new Date(r.requested_at).toLocaleDateString()}</td>
                      <td className="py-2 px-2">
                        {r.policy_name} - {r.status}
                        {r.notes && <div className="text-xs text-gray-500">{r.notes}</div>}
                      </td>
                      <td className="py-2 px-2 text-right">
                        {r.status === 'approved' ? `-${days}` : '—'}
                      </td>
                      <td className="py-2 px-2 text-right">—</td>
                      <td className="py-2 px-2 text-right">—</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-sm text-gray-600 py-4 text-center">
            No history available. Click "Sync History" to load from BambooHR.
          </div>
        )}
        </div>
      </div>
      
      <AppFormModal
        open={showRequestForm}
        onClose={() => {
          setShowRequestForm(false);
          setPolicyName('');
          setStartDate('');
          setEndDate('');
          setHours('');
          setNotes('');
        }}
        title="Request Time Off"
        footer={
          <div className={uiCx(uiLayout.actionsRow, 'w-full justify-end')}>
            <AppButton
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                setShowRequestForm(false);
                setPolicyName('');
                setStartDate('');
                setEndDate('');
                setHours('');
                setNotes('');
              }}
            >
              Cancel
            </AppButton>
            <AppButton
              type="button"
              size="sm"
              disabled={submitting || !policyName || !startDate || !endDate}
              loading={submitting}
              onClick={handleSubmit}
            >
              {submitting ? 'Submitting...' : 'Submit Request'}
            </AppButton>
          </div>
        }
      >
        <div className={uiSpacing.sectionStack}>
              <div>
                <AppSelect
                  label="Policy*"
                  placeholder="Select policy..."
                  value={policyName}
                  onChange={(e) => setPolicyName(e.target.value)}
                  options={availablePolicies.map((p: string) => ({ value: p, label: p }))}
                />
                {policyName && balances && (() => {
                  const selectedBalance = balances.find((b: any) => b.policy_name === policyName);
                  const isSickLeave = policyName.toLowerCase().includes('sick');
                  if (selectedBalance) {
                    const availableDays = hoursToDays(selectedBalance.balance_hours);
                    return (
                      <div className={`mt-1 text-xs ${parseFloat(availableDays) >= 0 ? 'text-gray-600' : 'text-orange-600'}`}>
                        Available balance: {availableDays} days
                        {isSickLeave && (
                          <div className="mt-1 p-2 bg-blue-50 border border-blue-200 rounded text-blue-800">
                            <svg className="w-4 h-4 inline mr-1" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                            </svg>
                            Sick leave requests are allowed even without sufficient balance.
                          </div>
                        )}
                      </div>
                    );
                  }
                  return null;
                })()}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <AppDatePicker
                  label="Start Date*"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
                <AppDatePicker
                  label="End Date*"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
              {startDate && endDate && policyName && (() => {
                const days = Math.ceil((new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24)) + 1;
                const selectedBalance = balances?.find((b: any) => b.policy_name === policyName);
                const isSickLeave = policyName.toLowerCase().includes('sick');
                const availableDays = selectedBalance ? parseFloat(hoursToDays(selectedBalance.balance_hours)) : 0;
                const hasEnoughBalance = isSickLeave || availableDays >= days;
                return (
                  <div className={`p-3 rounded-lg border ${hasEnoughBalance ? 'bg-green-50 border-green-200' : 'bg-yellow-50 border-yellow-200'}`}>
                    <div className="text-sm font-medium text-gray-700">
                      Request Summary
                    </div>
                    <div className="text-xs text-gray-600 mt-1">
                      You are requesting <strong>{days} days</strong> of {policyName}
                    </div>
                    <div className="text-xs text-gray-600">
                      Available balance: <strong>{availableDays.toFixed(1)} days</strong>
                    </div>
                    {!hasEnoughBalance && !isSickLeave && (
                      <div className="text-xs text-red-600 mt-1 font-medium">
                        Insufficient balance. You need {days} days but only have {availableDays.toFixed(1)} days available.
                      </div>
                    )}
                  </div>
                );
              })()}
              <AppInput
                label="Hours (auto-calculated)"
                type="number"
                step="0.5"
                value={hours}
                onChange={(e) => setHours(e.target.value)}
              />
              <AppTextarea
                label={policyName?.toLowerCase().includes('sick') ? 'Reason/Justification*' : 'Notes (optional)'}
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={
                  policyName?.toLowerCase().includes('sick')
                    ? 'Please provide a reason for your sick leave request...'
                    : 'Reason for time off...'
                }
              />
        </div>
      </AppFormModal>

      <AppFormModal
        open={showAdjustModal && !!adjustingBalance}
        onClose={() => {
          setShowAdjustModal(false);
          setAdjustingBalance(null);
          setSelectedPolicyName('');
        }}
        title={
          adjustingBalance?.policy_name
            ? `Adjust ${adjustingBalance.policy_name} Balance`
            : 'Adjust Time Off Balance'
        }
        footer={
          <div className={uiCx(uiLayout.actionsRow, 'w-full justify-end')}>
            <AppButton
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                setShowAdjustModal(false);
                setAdjustingBalance(null);
                setSelectedPolicyName('');
              }}
            >
              Cancel
            </AppButton>
            <AppButton
              type="button"
              size="sm"
              disabled={
                adjusting ||
                !adjustmentDays ||
                !effectiveDate ||
                !adjustmentNote.trim() ||
                (!selectedPolicyName && !adjustingBalance?.policy_name)
              }
              loading={adjusting}
              onClick={handleAdjust}
            >
              {adjusting ? 'Saving...' : 'Save'}
            </AppButton>
          </div>
        }
      >
        {adjustingBalance ? (
            <div className={uiSpacing.sectionStack}>
              {/* Policy Selection - always show if multiple balances exist, or if no policy selected */}
              {((displayedBalances && displayedBalances.length > 1) || !adjustingBalance.policy_name) && (
                <AppSelect
                  label="Policy*"
                  placeholder="Select policy..."
                  value={selectedPolicyName || adjustingBalance.policy_name || ''}
                  onChange={(e) => {
                    setSelectedPolicyName(e.target.value);
                    const selectedBalance = displayedBalances?.find((b: any) => b.policy_name === e.target.value);
                    if (selectedBalance) {
                      setAdjustingBalance(selectedBalance);
                    } else {
                      setAdjustingBalance({ policy_name: e.target.value, balance_hours: undefined });
                    }
                  }}
                  options={
                    displayedBalances && displayedBalances.length > 0
                      ? displayedBalances.map((b: any) => ({ value: b.policy_name, label: b.policy_name }))
                      : [
                          { value: 'Vacation', label: 'Vacation' },
                          { value: 'Sick Leave', label: 'Sick Leave' },
                          { value: 'Personal Days', label: 'Personal Days' },
                          { value: 'Holiday', label: 'Holiday' },
                        ]
                  }
                />
              )}

              <div>
                <AppControlLabelRow label="Amount*" />
                <div className={uiCx(uiLayout.actionsRow, 'items-end')}>
                  <AppSelect
                    className="w-32 shrink-0"
                    value={adjustmentType}
                    onChange={(e) => setAdjustmentType(e.target.value as 'add' | 'subtract')}
                    options={[
                      { value: 'add', label: 'Add' },
                      { value: 'subtract', label: 'Subtract' },
                    ]}
                  />
                  <AppInput
                    className="min-w-0 flex-1"
                    type="number"
                    step="0.5"
                    min="0.5"
                    value={adjustmentDays}
                    onChange={(e) => setAdjustmentDays(e.target.value)}
                    placeholder="0"
                  />
                  <span className={uiCx(uiTypography.helper, 'shrink-0 px-1 pb-2')}>days</span>
                </div>
              </div>

              <AppDatePicker
                label="Effective Date*"
                value={effectiveDate}
                onChange={(e) => setEffectiveDate(e.target.value)}
              />

              <AppTextarea
                label="Note*"
                rows={3}
                value={adjustmentNote}
                onChange={(e) => setAdjustmentNote(e.target.value)}
                placeholder="Reason for adjustment..."
              />
              
              {/* Summary */}
              {adjustingBalance.policy_name && (
                <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-700">Current {adjustingBalance.policy_name} Balance:</span>
                      <span className="font-semibold">
                        {adjustingBalance.balance_hours !== undefined 
                          ? hoursToDays(adjustingBalance.balance_hours) 
                          : '0'} days
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-700">
                        {adjustmentType === 'add' ? 'Added' : 'Subtracted'}:
                      </span>
                      <span className={`font-semibold ${adjustmentType === 'add' ? 'text-green-600' : 'text-red-600'}`}>
                        {adjustmentDays ? (adjustmentType === 'add' ? '+' : '-') + adjustmentDays : '0'} days
                      </span>
                    </div>
                    <div className="flex justify-between pt-2 border-t border-blue-300">
                      <span className="font-semibold text-gray-900">New {adjustingBalance.policy_name} Balance:</span>
                      <span className="font-bold text-brand-red">
                        {adjustmentDays
                          ? (parseFloat(adjustingBalance.balance_hours !== undefined ? hoursToDays(adjustingBalance.balance_hours) : '0') + 
                             (adjustmentType === 'add' ? parseFloat(adjustmentDays) : -parseFloat(adjustmentDays))).toFixed(1)
                          : (adjustingBalance.balance_hours !== undefined ? hoursToDays(adjustingBalance.balance_hours) : '0')} days
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
        ) : null}
      </AppFormModal>

      <AppFormModal
        open={showEditHistoryModal && !!editHistoryForm}
        onClose={() => {
          if (!savingHistoryEdit) {
            setShowEditHistoryModal(false);
            setEditHistoryForm(null);
          }
        }}
        title="Edit time off history"
        footer={
          <div className={uiCx(uiLayout.actionsRow, 'w-full justify-end')}>
            <AppButton
              type="button"
              variant="secondary"
              size="sm"
              disabled={savingHistoryEdit}
              onClick={() => {
                if (!savingHistoryEdit) {
                  setShowEditHistoryModal(false);
                  setEditHistoryForm(null);
                }
              }}
            >
              Cancel
            </AppButton>
            <AppButton
              type="button"
              size="sm"
              disabled={savingHistoryEdit}
              loading={savingHistoryEdit}
              onClick={() => void handleSaveHistoryEdit()}
            >
              {savingHistoryEdit ? 'Saving…' : 'Save'}
            </AppButton>
          </div>
        }
      >
        {editHistoryForm ? (
          <div className={uiSpacing.sectionStack}>
            <AppSelect
              label="Policy*"
              value={editHistoryForm.policy_name}
              onChange={(e) => setEditHistoryForm((f) => (f ? { ...f, policy_name: e.target.value } : f))}
              options={Array.from(
                new Set(
                  [...(availablePolicies || []), editHistoryForm.policy_name, 'Sick Leave', 'Vacation'].filter(Boolean),
                ),
              ).map((p: string) => ({ value: p, label: p }))}
            />
            <AppDatePicker
              label="Transaction date*"
              value={editHistoryForm.transaction_date}
              onChange={(e) => setEditHistoryForm((f) => (f ? { ...f, transaction_date: e.target.value } : f))}
            />
            <AppInput
              label="Description"
              value={editHistoryForm.description}
              onChange={(e) => setEditHistoryForm((f) => (f ? { ...f, description: e.target.value } : f))}
              placeholder="Optional"
            />
            <div className="grid grid-cols-2 gap-3">
              <AppInput
                label="Used days (-)"
                type="number"
                step="0.5"
                min={0}
                value={editHistoryForm.used_days}
                onChange={(e) => setEditHistoryForm((f) => (f ? { ...f, used_days: e.target.value } : f))}
                placeholder="0"
              />
              <AppInput
                label="Earned days (+)"
                type="number"
                step="0.5"
                min={0}
                value={editHistoryForm.earned_days}
                onChange={(e) => setEditHistoryForm((f) => (f ? { ...f, earned_days: e.target.value } : f))}
                placeholder="0"
              />
            </div>
            <p className={uiTypography.helper}>At least one of used days or earned days must be non-zero.</p>
          </div>
        ) : null}
      </AppFormModal>
    </UserInfoSectionCard>
  );
}

/** Format API date/datetime for asset tables; avoids showing one calendar day early when the API stores UTC midnight for a business date. */
function formatAssetDisplayDate(iso: string | null | undefined): string {
  if (iso == null || iso === '') return '—';
  const s = String(iso).trim();
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return '—';
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, day] = s.split('-').map(Number);
    return new Date(y, m - 1, day).toLocaleDateString('en-US', { dateStyle: 'short' });
  }
  if (
    d.getUTCHours() === 0 &&
    d.getUTCMinutes() === 0 &&
    d.getUTCSeconds() === 0 &&
    d.getUTCMilliseconds() === 0
  ) {
    return d.toLocaleDateString('en-US', { timeZone: 'UTC', year: 'numeric', month: 'short', day: 'numeric' });
  }
  return d.toLocaleDateString('en-US', { dateStyle: 'short' });
}

function UserAssetsSection({
  userId,
  canEditEquipment,
  canEditFleet,
}: {
  userId: string;
  canEditEquipment: boolean;
  canEditFleet: boolean;
}) {
  const { data: me } = useQuery({ queryKey: ['me'], queryFn: () => api<any>('GET', '/auth/me') });
  const isAdmin = useMemo(() => {
    if (!me) return false;
    return (me?.roles || []).some((r: string) => String(r || '').toLowerCase() === 'admin');
  }, [me]);
  const confirm = useConfirm();
  const { data: assetsData, refetch: refetchAssets } = useQuery({
    queryKey: ['user-assets', userId],
    queryFn: () => api<any>('GET', `/fleet/users/${encodeURIComponent(userId)}/assets`),
    enabled: !!userId,
  });
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  const [showVehicleCheckoutModal, setShowVehicleCheckoutModal] = useState(false);
  const [showCheckinModal, setShowCheckinModal] = useState(false);
  const [checkinEquipmentId, setCheckinEquipmentId] = useState<string | null>(null);
  const [returnFleetContext, setReturnFleetContext] = useState<{
    fleetAssetId: string;
    fleetAssetType: string | null;
    minOdometerIn: number | null;
    minHoursIn: number | null;
  } | null>(null);
  const [checkoutSubmitting, setCheckoutSubmitting] = useState(false);
  const [checkinSubmitting, setCheckinSubmitting] = useState(false);
  const [fleetReturnSubmitting, setFleetReturnSubmitting] = useState(false);

  const current_checkouts = assetsData?.current_checkouts ?? [];
  const current_assignments = assetsData?.current_assignments ?? [];
  const checkout_history = assetsData?.checkout_history ?? [];
  const assignment_history = assetsData?.assignment_history ?? [];

  const { data: availableEquipment, isLoading: loadingAvailable } = useQuery({
    queryKey: ['fleet-equipment-available'],
    queryFn: () => api<any>('GET', '/fleet/equipment?assigned=false&status=active&limit=100'),
    enabled: showCheckoutModal && !!userId,
  });
  const availableList = availableEquipment?.items ?? availableEquipment ?? [];

  const { data: availableFleetVehicles, isLoading: loadingFleetAvailable } = useQuery({
    queryKey: ['fleet-vehicles-unassigned'],
    queryFn: () =>
      api<any>('GET', '/fleet/assets?asset_type=vehicle&assigned=false&limit=100'),
    enabled: showVehicleCheckoutModal && !!userId,
  });
  const fleetVehicleList = availableFleetVehicles?.items ?? [];

  const handleCheckin = (equipmentId: string) => {
    setCheckinEquipmentId(equipmentId);
    setShowCheckinModal(true);
  };

  const handleFleetReturn = (
    fleetAssetId: string,
    row?: { fleet_asset_type?: string | null; odometer_out?: number | null; hours_out?: number | null },
  ) => {
    const t = row?.fleet_asset_type ?? null;
    const minOdom =
      t === 'vehicle' && row?.odometer_out != null && !Number.isNaN(Number(row.odometer_out))
        ? Number(row.odometer_out)
        : null;
    const minHrs =
      (t === 'heavy_machinery' || t === 'other') &&
      row?.hours_out != null &&
      !Number.isNaN(Number(row.hours_out))
        ? Number(row.hours_out)
        : null;
    setReturnFleetContext({
      fleetAssetId,
      fleetAssetType: t,
      minOdometerIn: minOdom,
      minHoursIn: minHrs,
    });
  };

  const handleFleetReturnSubmit = async (payload: {
    odometer_in?: number;
    hours_in?: number;
    notes_in?: string;
  }) => {
    if (!returnFleetContext) return;
    setFleetReturnSubmitting(true);
    try {
      await api('POST', `/fleet/assets/${returnFleetContext.fleetAssetId}/return`, payload);
      toast.success(
        returnFleetContext.fleetAssetType === 'vehicle' ? 'Vehicle returned' : 'Return recorded',
      );
      setReturnFleetContext(null);
      refetchAssets();
    } catch (e: any) {
      toast.error(e?.message || 'Return failed');
    } finally {
      setFleetReturnSubmitting(false);
    }
  };

  const handleDeleteCheckout = async (checkoutId: string) => {
    if (!isAdmin) return;
    const result = await confirm({
      title: 'Delete checkout?',
      message: 'This will permanently delete this checkout record. This action cannot be undone.',
      confirmText: 'Delete',
      cancelText: 'Cancel',
    });
    if (result !== 'confirm') return;
    try {
      await api('DELETE', `/fleet/equipment/checkouts/${checkoutId}`);
      toast.success('Checkout deleted');
      refetchAssets();
    } catch (e: any) {
      toast.error(e?.message || 'Failed to delete checkout');
    }
  };

  const handleDeleteAssignment = async (assignmentId: string) => {
    if (!isAdmin) return;
    const result = await confirm({
      title: 'Delete assignment?',
      message: 'This will permanently delete this assignment record. This action cannot be undone.',
      confirmText: 'Delete',
      cancelText: 'Cancel',
    });
    if (result !== 'confirm') return;
    try {
      await api('DELETE', `/fleet/assets/assignments/${assignmentId}`);
      toast.success('Assignment deleted');
      refetchAssets();
    } catch (e: any) {
      toast.error(e?.message || 'Failed to delete assignment');
    }
  };
  const handleCheckinSubmit = async (payload: { actual_return_date: string; condition_in: string; notes_in?: string }) => {
    if (!checkinEquipmentId) return;
    setCheckinSubmitting(true);
    try {
      await api('POST', `/fleet/equipment/${checkinEquipmentId}/checkin`, payload);
      toast.success('Equipment checked in');
      setShowCheckinModal(false);
      setCheckinEquipmentId(null);
      refetchAssets();
    } catch (e: any) {
      toast.error(e?.message || 'Check-in failed');
    } finally {
      setCheckinSubmitting(false);
    }
  };

  return (
    <div className="rounded-xl border bg-white p-4 space-y-6 pb-24">
      <div className="flex items-center justify-between">
        <h5 className="font-semibold text-gray-900 flex items-center gap-2">
          <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          Assets
        </h5>
        <div className="flex flex-wrap items-center gap-2">
          {canEditEquipment && (
            <button
              type="button"
              onClick={() => setShowCheckoutModal(true)}
              className="px-3 py-1.5 rounded-lg border border-brand-red text-brand-red text-xs font-medium hover:bg-red-50"
            >
              Check out equipment
            </button>
          )}
          {canEditFleet && (
            <button
              type="button"
              onClick={() => setShowVehicleCheckoutModal(true)}
              className="px-3 py-1.5 rounded-lg border border-slate-700 text-slate-800 text-xs font-medium hover:bg-slate-100"
            >
              Check out vehicle
            </button>
          )}
        </div>
      </div>

      {/* Currently with this employee */}
      <div className="rounded-lg border bg-gray-50 p-4">
        <h6 className="text-sm font-semibold text-gray-900 mb-3">Currently with this employee</h6>
        {current_checkouts.length === 0 && current_assignments.length === 0 ? (
          <p className="text-sm text-gray-500">No assets currently assigned.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-100">
                  <th className="text-left py-2 px-3 font-semibold text-xs">Type</th>
                  <th className="text-left py-2 px-3 font-semibold text-xs">Name</th>
                  <th className="text-left py-2 px-3 font-semibold text-xs">Checked out</th>
                  <th className="text-left py-2 px-3 font-semibold text-xs">Expected return</th>
                  {(canEditEquipment || canEditFleet) && <th className="text-right py-2 px-3 font-semibold text-xs w-24"> </th>}
                </tr>
              </thead>
              <tbody>
                {current_checkouts.map((c: any) => (
                  <tr key={c.id} className="border-b">
                    <td className="py-2 px-3">Equipment</td>
                    <td className="py-2 px-3 font-medium">{c.equipment_name || c.equipment_id}</td>
                    <td className="py-2 px-3">{formatAssetDisplayDate(c.checked_out_at)}</td>
                    <td className="py-2 px-3">{formatAssetDisplayDate(c.expected_return_date)}</td>
                    {canEditEquipment && (
                      <td className="py-2 px-3 text-right">
                        <button
                          type="button"
                          onClick={() => handleCheckin(c.equipment_id)}
                          className="text-xs px-2 py-1 rounded border border-gray-300 hover:bg-gray-100"
                        >
                          Check in
                        </button>
                      </td>
                    )}
                    {!canEditEquipment && canEditFleet && <td className="py-2 px-3 text-right">—</td>}
                  </tr>
                ))}
                {current_assignments.map((a: any) => (
                  <tr key={a.id} className="border-b">
                    <td className="py-2 px-3">{a.target_type === 'fleet' ? 'Fleet' : 'Equipment'}</td>
                    <td className="py-2 px-3 font-medium">{a.asset_name || a.equipment_id || a.fleet_asset_id}</td>
                    <td className="py-2 px-3">{formatAssetDisplayDate(a.assigned_at)}</td>
                    <td className="py-2 px-3">{formatAssetDisplayDate(a.expected_return_at)}</td>
                    {canEditFleet && a.target_type === 'fleet' && a.fleet_asset_id ? (
                      <td className="py-2 px-3 text-right">
                        <button
                          type="button"
                          onClick={() =>
                            handleFleetReturn(String(a.fleet_asset_id), {
                              fleet_asset_type: a.fleet_asset_type,
                              odometer_out: a.odometer_out,
                              hours_out: a.hours_out,
                            })
                          }
                          className="text-xs px-2 py-1 rounded border border-gray-300 hover:bg-gray-100"
                        >
                          Return vehicle
                        </button>
                      </td>
                    ) : (
                      (canEditEquipment || canEditFleet) && <td className="py-2 px-3 text-right">—</td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* History */}
      <div className="rounded-lg border bg-gray-50 p-4">
        <h6 className="text-sm font-semibold text-gray-900 mb-3">History</h6>
        {checkout_history.length === 0 && assignment_history.length === 0 ? (
          <p className="text-sm text-gray-500">No history yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-100">
                  <th className="text-left py-2 px-3 font-semibold text-xs">Type</th>
                  <th className="text-left py-2 px-3 font-semibold text-xs">Name</th>
                  <th className="text-left py-2 px-3 font-semibold text-xs">Checked out</th>
                  <th className="text-left py-2 px-3 font-semibold text-xs">Returned</th>
                  <th className="text-left py-2 px-3 font-semibold text-xs">Status</th>
                  {isAdmin && <th className="text-right py-2 px-3 font-semibold text-xs w-12"> </th>}
                </tr>
              </thead>
              <tbody>
                {checkout_history.map((c: any) => (
                  <tr key={c.id} className="border-b">
                    <td className="py-2 px-3">Equipment</td>
                    <td className="py-2 px-3">{c.equipment_name || c.equipment_id}</td>
                    <td className="py-2 px-3">{formatAssetDisplayDate(c.checked_out_at)}</td>
                    <td className="py-2 px-3">{formatAssetDisplayDate(c.actual_return_date)}</td>
                    <td className="py-2 px-3">{c.status || '—'}</td>
                    {isAdmin && (
                      <td className="py-2 px-3 text-right">
                        <button
                          type="button"
                          onClick={() => handleDeleteCheckout(c.id)}
                          className="text-red-600 hover:text-red-700"
                          title="Delete checkout (admin only)"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
                {assignment_history.map((a: any) => (
                  <tr key={a.id} className="border-b">
                    <td className="py-2 px-3">{a.target_type === 'fleet' ? 'Fleet' : 'Equipment'}</td>
                    <td className="py-2 px-3">{a.asset_name || a.equipment_id || a.fleet_asset_id}</td>
                    <td className="py-2 px-3">{formatAssetDisplayDate(a.assigned_at)}</td>
                    <td className="py-2 px-3">{formatAssetDisplayDate(a.returned_at)}</td>
                    <td className="py-2 px-3">{a.returned_at ? 'Returned' : 'Active'}</td>
                    {isAdmin && (
                      <td className="py-2 px-3 text-right">
                        <button
                          type="button"
                          onClick={() => handleDeleteAssignment(a.id)}
                          className="text-red-600 hover:text-red-700"
                          title="Delete assignment (admin only)"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Checkout modal */}
      {showCheckoutModal && (
        <UserAssetsCheckoutModal
          userId={userId}
          availableEquipment={Array.isArray(availableList) ? availableList : []}
          loading={loadingAvailable}
          onClose={() => setShowCheckoutModal(false)}
          onSuccess={() => {
            setShowCheckoutModal(false);
            refetchAssets();
          }}
        />
      )}

      {/* Check-in modal */}
      {showCheckinModal && checkinEquipmentId && (
        <UserAssetsCheckinModal
          equipmentId={checkinEquipmentId}
          onClose={() => {
            setShowCheckinModal(false);
            setCheckinEquipmentId(null);
          }}
          onSubmit={handleCheckinSubmit}
          submitting={checkinSubmitting}
        />
      )}

      {/* Vehicle assign (checkout) modal */}
      {showVehicleCheckoutModal && (
        <UserFleetVehicleCheckoutModal
          userId={userId}
          availableVehicles={Array.isArray(fleetVehicleList) ? fleetVehicleList : []}
          loading={loadingFleetAvailable}
          onClose={() => setShowVehicleCheckoutModal(false)}
          onSuccess={() => {
            setShowVehicleCheckoutModal(false);
            refetchAssets();
          }}
        />
      )}

      {/* Fleet return modal */}
      {returnFleetContext && (
        <UserFleetReturnModal
          key={returnFleetContext.fleetAssetId}
          fleetAssetType={returnFleetContext.fleetAssetType}
          minOdometerIn={returnFleetContext.minOdometerIn}
          minHoursIn={returnFleetContext.minHoursIn}
          onClose={() => setReturnFleetContext(null)}
          onSubmit={handleFleetReturnSubmit}
          submitting={fleetReturnSubmitting}
        />
      )}
    </div>
  );
}

function UserAssetsCheckoutModal({
  userId,
  availableEquipment,
  loading,
  onClose,
  onSuccess,
}: {
  userId: string;
  availableEquipment: any[];
  loading: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [selectedId, setSelectedId] = useState('');
  const [condition, setCondition] = useState<'new' | 'good' | 'fair' | 'poor'>('good');
  const [expectedReturnDate, setExpectedReturnDate] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedId) {
      toast.error('Select equipment');
      return;
    }
    setSubmitting(true);
    try {
      await api('POST', `/fleet/equipment/${selectedId}/checkout`, {
        checked_out_by_user_id: userId,
        checked_out_at: new Date().toISOString(),
        expected_return_date: expectedReturnDate || undefined,
        condition_out: condition,
        notes_out: notes || undefined,
      });
      toast.success('Equipment checked out');
      onSuccess();
    } catch (err: any) {
      toast.error(err?.message || 'Checkout failed');
    } finally {
      setSubmitting(false);
    }
  };

  const formId = 'user-assets-equipment-checkout-form';

  return (
    <AppFormModal
      open
      onClose={onClose}
      title="Check out equipment"
      footer={
        <div className={uiCx(uiLayout.actionsRow, 'w-full justify-end')}>
          <AppButton type="button" variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </AppButton>
          <AppButton type="submit" form={formId} size="sm" disabled={submitting} loading={submitting}>
            {submitting ? 'Saving...' : 'Check out'}
          </AppButton>
        </div>
      }
    >
      <form id={formId} className={uiSpacing.sectionStack} onSubmit={handleSubmit}>
        <AppSelect
          label="Equipment *"
          required
          disabled={loading}
          placeholder="Select..."
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          options={availableEquipment.map((eq: any) => ({
            value: String(eq.id),
            label: String(eq.name || eq.serial_number || eq.id),
          }))}
        />
        <AppSelect
          label="Condition"
          value={condition}
          onChange={(e) => setCondition(e.target.value as typeof condition)}
          options={[
            { value: 'new', label: 'New' },
            { value: 'good', label: 'Good' },
            { value: 'fair', label: 'Fair' },
            { value: 'poor', label: 'Poor' },
          ]}
        />
        <AppDatePicker
          label="Expected return date"
          value={expectedReturnDate}
          onChange={(e) => setExpectedReturnDate(e.target.value)}
        />
        <AppTextarea label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
      </form>
    </AppFormModal>
  );
}

function UserAssetsCheckinModal({
  equipmentId,
  onClose,
  onSubmit,
  submitting,
}: {
  equipmentId: string;
  onClose: () => void;
  onSubmit: (p: { actual_return_date: string; condition_in: string; notes_in?: string }) => Promise<void>;
  submitting: boolean;
}) {
  const [actualReturnDate, setActualReturnDate] = useState(new Date().toISOString().split('T')[0]);
  const [condition, setCondition] = useState<'new' | 'good' | 'fair' | 'poor'>('good');
  const [notes, setNotes] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSubmit({
      actual_return_date: new Date(actualReturnDate).toISOString(),
      condition_in: condition,
      notes_in: notes || undefined,
    });
  };

  const formId = 'user-assets-equipment-checkin-form';

  return (
    <AppFormModal
      open
      onClose={onClose}
      title="Check in equipment"
      footer={
        <div className={uiCx(uiLayout.actionsRow, 'w-full justify-end')}>
          <AppButton type="button" variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </AppButton>
          <AppButton type="submit" form={formId} size="sm" disabled={submitting} loading={submitting}>
            {submitting ? 'Saving...' : 'Check in'}
          </AppButton>
        </div>
      }
    >
      <form id={formId} className={uiSpacing.sectionStack} onSubmit={handleSubmit}>
        <AppDatePicker
          label="Return date *"
          required
          value={actualReturnDate}
          onChange={(e) => setActualReturnDate(e.target.value)}
        />
        <AppSelect
          label="Condition in"
          value={condition}
          onChange={(e) => setCondition(e.target.value as typeof condition)}
          options={[
            { value: 'new', label: 'New' },
            { value: 'good', label: 'Good' },
            { value: 'fair', label: 'Fair' },
            { value: 'poor', label: 'Poor' },
          ]}
        />
        <AppTextarea label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
      </form>
    </AppFormModal>
  );
}

function UserFleetVehicleCheckoutModal({
  userId,
  availableVehicles,
  loading,
  onClose,
  onSuccess,
}: {
  userId: string;
  availableVehicles: any[];
  loading: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [selectedId, setSelectedId] = useState('');
  const [expectedReturnDate, setExpectedReturnDate] = useState('');
  const [notes, setNotes] = useState('');
  const [odometerOut, setOdometerOut] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedId) {
      toast.error('Select a vehicle');
      return;
    }
    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        assigned_to_user_id: userId,
        notes_out: notes || undefined,
      };
      if (expectedReturnDate) {
        payload.expected_return_at = new Date(`${expectedReturnDate}T12:00:00`).toISOString();
      }
      if (odometerOut.trim() !== '') {
        const n = parseInt(odometerOut, 10);
        if (!Number.isNaN(n)) payload.odometer_out = n;
      }
      await api('POST', `/fleet/assets/${selectedId}/assign`, payload);
      toast.success('Vehicle assigned');
      onSuccess();
    } catch (err: any) {
      toast.error(err?.message || 'Assignment failed');
    } finally {
      setSubmitting(false);
    }
  };

  const vehicleLabel = (v: any) => {
    const parts = [v.name, v.license_plate, v.make && v.model ? `${v.make} ${v.model}` : v.make || v.model].filter(Boolean);
    return parts.length ? parts.join(' · ') : v.id;
  };

  const formId = 'user-fleet-vehicle-checkout-form';

  return (
    <AppFormModal
      open
      onClose={onClose}
      title="Check out vehicle"
      footer={
        <div className={uiCx(uiLayout.actionsRow, 'w-full justify-end')}>
          <AppButton type="button" variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </AppButton>
          <AppButton
            type="submit"
            form={formId}
            size="sm"
            disabled={submitting || loading}
            loading={submitting}
          >
            {submitting ? 'Saving...' : 'Assign vehicle'}
          </AppButton>
        </div>
      }
    >
      <form id={formId} className={uiSpacing.sectionStack} onSubmit={handleSubmit}>
        <AppSelect
          label="Vehicle *"
          required
          disabled={loading}
          placeholder="Select..."
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          options={availableVehicles.map((v: any) => ({
            value: String(v.id),
            label: vehicleLabel(v),
          }))}
          helperText={
            !loading && availableVehicles.length === 0
              ? 'No unassigned vehicles. Assign a driver elsewhere or return a vehicle first.'
              : undefined
          }
        />
        <AppInput
          label="Odometer (out)"
          type="number"
          min={0}
          value={odometerOut}
          onChange={(e) => setOdometerOut(e.target.value)}
          placeholder="Optional"
        />
        <AppDatePicker
          label="Expected return date"
          value={expectedReturnDate}
          onChange={(e) => setExpectedReturnDate(e.target.value)}
        />
        <AppTextarea label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
      </form>
    </AppFormModal>
  );
}

function UserFleetReturnModal({
  fleetAssetType,
  minOdometerIn,
  minHoursIn,
  onClose,
  onSubmit,
  submitting,
}: {
  fleetAssetType: string | null;
  minOdometerIn: number | null;
  minHoursIn: number | null;
  onClose: () => void;
  onSubmit: (p: { odometer_in?: number; hours_in?: number; notes_in?: string }) => Promise<void>;
  submitting: boolean;
}) {
  const [odometerIn, setOdometerIn] = useState('');
  const [hoursIn, setHoursIn] = useState('');
  const [notes, setNotes] = useState('');

  const isVehicle = fleetAssetType === 'vehicle';
  const isHoursAsset = fleetAssetType === 'heavy_machinery' || fleetAssetType === 'other';
  const title =
    isVehicle ? 'Return vehicle' : isHoursAsset ? 'Return fleet asset' : 'Return fleet asset';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload: { odometer_in?: number; hours_in?: number; notes_in?: string } = {};
    if (odometerIn.trim() !== '') {
      const n = parseInt(odometerIn, 10);
      if (!Number.isNaN(n)) {
        if (minOdometerIn != null && n < minOdometerIn) {
          toast.error(
            `Odometer in must be at least ${minOdometerIn.toLocaleString()} (reading at check-out).`,
          );
          return;
        }
        payload.odometer_in = n;
      }
    }
    if (hoursIn.trim() !== '') {
      const h = parseFloat(hoursIn);
      if (!Number.isNaN(h)) {
        if (minHoursIn != null && h < minHoursIn) {
          toast.error(
            `Hours in must be at least ${minHoursIn.toLocaleString()} (reading at check-out).`,
          );
          return;
        }
        payload.hours_in = h;
      }
    }
    if (notes.trim()) payload.notes_in = notes.trim();
    await onSubmit(payload);
  };

  const formId = 'user-fleet-return-form';

  return (
    <AppFormModal
      open
      onClose={onClose}
      title={title}
      footer={
        <div className={uiCx(uiLayout.actionsRow, 'w-full justify-end')}>
          <AppButton type="button" variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </AppButton>
          <AppButton type="submit" form={formId} size="sm" disabled={submitting} loading={submitting}>
            {submitting ? 'Saving...' : 'Confirm return'}
          </AppButton>
        </div>
      }
    >
      <form id={formId} className={uiSpacing.sectionStack} onSubmit={handleSubmit}>
        {(isVehicle || (!isHoursAsset && !isVehicle)) && (
          <AppInput
            label="Odometer (in)"
            type="number"
            min={minOdometerIn != null ? minOdometerIn : 0}
            value={odometerIn}
            onChange={(e) => setOdometerIn(e.target.value)}
            placeholder={minOdometerIn != null ? `Min ${minOdometerIn.toLocaleString()}` : 'Optional'}
            helperText={
              minOdometerIn != null
                ? `Must be at least ${minOdometerIn.toLocaleString()} (check-out).`
                : undefined
            }
          />
        )}
        {(isHoursAsset || (!isHoursAsset && !isVehicle)) && (
          <AppInput
            label="Hours (in)"
            type="number"
            step="any"
            min={minHoursIn != null ? minHoursIn : 0}
            value={hoursIn}
            onChange={(e) => setHoursIn(e.target.value)}
            placeholder={minHoursIn != null ? `Min ${minHoursIn.toLocaleString()}` : 'Optional'}
            helperText={
              minHoursIn != null ? `Must be at least ${minHoursIn.toLocaleString()} (check-out).` : undefined
            }
          />
        )}
        <AppTextarea label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
      </form>
    </AppFormModal>
  );
}

const TRAINING_CATEGORIES = ['', 'Safety', 'Compliance', 'Technical skills', 'Soft skills', 'Leadership', 'Other'];
const TRAINING_FORMATS = ['', 'in_person', 'online', 'hybrid'];
const TRAINING_STATUSES = ['completed', 'in_progress', 'scheduled', 'expired'];

/** Docs tab folder for certificate files uploaded from Training & courses modal. */
const TRAINING_CERTIFICATES_FOLDER_NAME = 'Training certificates';

async function getOrCreateTrainingCertificatesFolderId(userId: string): Promise<string> {
  const folders = await api<any[]>('GET', `/auth/users/${encodeURIComponent(userId)}/folders`);
  const match = (folders || []).find(
    (f: any) => !f.parent_id && String(f.name || '').trim() === TRAINING_CERTIFICATES_FOLDER_NAME,
  );
  if (match?.id) return String(match.id);
  try {
    const res = await api<{ id: string }>('POST', `/auth/users/${encodeURIComponent(userId)}/folders`, {
      name: TRAINING_CERTIFICATES_FOLDER_NAME,
    });
    return String(res.id);
  } catch {
    const again = await api<any[]>('GET', `/auth/users/${encodeURIComponent(userId)}/folders`);
    const m2 = (again || []).find(
      (f: any) => !f.parent_id && String(f.name || '').trim() === TRAINING_CERTIFICATES_FOLDER_NAME,
    );
    if (m2?.id) return String(m2.id);
    throw new Error('Could not resolve Training certificates folder');
  }
}

async function uploadTrainingCertificateToDocs(
  userId: string,
  file: File,
  meta: { docTitle?: string; issuedDate?: string; expiryDate?: string; trainingTitle: string },
) {
  const name = file.name;
  const contentType = file.type || 'application/octet-stream';
  const folderId = await getOrCreateTrainingCertificatesFolderId(userId);
  const up = await api<any>('POST', '/files/upload', {
    original_name: name,
    content_type: contentType,
    employee_id: userId,
    project_id: null,
    client_id: null,
    category_id: userId,
  });
  const putResp = await fetch(up.upload_url, {
    method: 'PUT',
    headers: { 'Content-Type': contentType, 'x-ms-blob-type': 'BlockBlob' },
    body: file,
  });
  if (!putResp.ok) {
    throw new Error(`Upload failed (${putResp.status})`);
  }
  const conf = await api<{ id: string }>('POST', '/files/confirm', {
    key: up.key,
    size_bytes: file.size,
    checksum_sha256: 'na',
    content_type: contentType,
  });
  const title =
    (meta.docTitle && meta.docTitle.trim()) || `${meta.trainingTitle} — ${name}`;
  await api('POST', `/auth/users/${encodeURIComponent(userId)}/documents`, {
    folder_id: folderId,
    title,
    file_id: conf.id,
    issued_date: meta.issuedDate?.trim() || undefined,
    expiry_date: meta.expiryDate?.trim() || undefined,
    notes: 'Uploaded from Training & courses (employee HR record).',
  });
}

async function uploadTrainingCertificateToWorkerFiles(
  workerId: string,
  file: File,
  meta: { docTitle?: string; trainingTitle: string },
) {
  const name = file.name;
  const contentType = file.type || 'application/octet-stream';
  const up = await api<any>('POST', '/files/upload', {
    original_name: name,
    content_type: contentType,
    employee_id: null,
    project_id: null,
    client_id: null,
    category_id: 'files',
  });
  const putResp = await fetch(up.upload_url, {
    method: 'PUT',
    headers: { 'Content-Type': contentType, 'x-ms-blob-type': 'BlockBlob' },
    body: file,
  });
  if (!putResp.ok) {
    throw new Error(`Upload failed (${putResp.status})`);
  }
  const conf = await api<{ id: string }>('POST', '/files/confirm', {
    key: up.key,
    size_bytes: file.size,
    checksum_sha256: 'na',
    content_type: contentType,
  });
  const title = (meta.docTitle && meta.docTitle.trim()) || `${meta.trainingTitle} — ${name}`;
  const q = new URLSearchParams({
    file_object_id: conf.id,
    category: 'Training certificates',
    original_name: title,
  });
  await api<{ id: string }>('POST', `/subcontractors/workers/${encodeURIComponent(workerId)}/files?${q.toString()}`);
}

function trainingStatusPill(status: string | null | undefined) {
  const s = (status || '').toLowerCase().replace(/_/g, ' ');
  const base = 'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border';
  if (s === 'completed') return <span className={`${base} bg-emerald-50 text-emerald-800 border-emerald-200`}>Completed</span>;
  if (s === 'expired') return <span className={`${base} bg-gray-100 text-gray-700 border-gray-200`}>Expired</span>;
  if (s === 'scheduled') return <span className={`${base} bg-sky-50 text-sky-800 border-sky-200`}>Scheduled</span>;
  if (s === 'in progress') return <span className={`${base} bg-amber-50 text-amber-900 border-amber-200`}>In progress</span>;
  return <span className={`${base} bg-slate-50 text-slate-700 border-slate-200`}>{status || '—'}</span>;
}

function TrainingDetailField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div
      className={uiCx(
        'grid grid-cols-1 gap-1 border-b border-gray-100 py-3 last:border-0 sm:grid-cols-[9.5rem_minmax(0,1fr)] sm:items-start sm:gap-x-4 sm:py-2.5',
      )}
    >
      <dt className={uiTypography.helper}>{label}</dt>
      <dd className={uiCx(uiTypography.body, 'min-w-0 break-words font-medium text-gray-900')}>{children}</dd>
    </div>
  );
}

function _parseYmdLocal(iso: string): Date | null {
  const s = String(iso || '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T12:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function _calendarInclusiveDays(startIso: string, endIso: string): number {
  const a = _parseYmdLocal(startIso);
  const b = _parseYmdLocal(endIso || startIso);
  if (!a || !b) return 0;
  if (b < a) return 0;
  return Math.round((b.getTime() - a.getTime()) / 86400000) + 1;
}

/** Inclusive range; skips Sat/Sun when includeWeekends is false. Falls back to at least 1 calendar day if no weekdays match. */
function _workdaysInclusive(startIso: string, endIso: string, includeWeekends: boolean): number {
  const a = _parseYmdLocal(startIso);
  const b = _parseYmdLocal(endIso || startIso);
  if (!a || !b || b < a) return 0;
  let n = 0;
  for (let d = new Date(a); d <= b; d.setDate(d.getDate() + 1)) {
    const w = d.getDay();
    if (includeWeekends || (w !== 0 && w !== 6)) n++;
  }
  if (n === 0) return Math.max(1, _calendarInclusiveDays(startIso, endIso || startIso));
  return n;
}

/** Expects HTML time values "HH:mm". If end <= start, assumes same session past midnight. */
function _dailyHoursFromTimes(timeStart: string, timeEnd: string): number | null {
  const ts = String(timeStart || '').trim();
  const te = String(timeEnd || '').trim();
  if (!ts || !te) return null;
  const [sh, sm] = ts.split(':').map((x) => parseInt(x, 10));
  const [eh, em] = te.split(':').map((x) => parseInt(x, 10));
  if ([sh, sm, eh, em].some((x) => Number.isNaN(x))) return null;
  let startM = sh * 60 + sm;
  let endM = eh * 60 + em;
  let diff = endM - startM;
  if (diff <= 0) diff += 24 * 60;
  return diff / 60;
}

function _parseSessionTimeToHHmm(sessionTime: string): { time_start: string; time_end: string } {
  const s = String(sessionTime || '').trim();
  const m = s.match(/(\d{1,2}:\d{2})\s*[–—-]\s*(\d{1,2}:\d{2})/);
  if (!m) return { time_start: '', time_end: '' };
  const pad = (t: string) => {
    const [h, mi] = t.split(':').map((x) => parseInt(x, 10));
    if (Number.isNaN(h) || Number.isNaN(mi)) return '';
    return `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`;
  };
  return { time_start: pad(m[1]), time_end: pad(m[2]) };
}

function EmployeeTrainingSection(
  props:
    | { variant: 'user'; userId: string; canEdit: boolean }
    | { variant: 'worker'; workerId: string; canEdit: boolean },
) {
  const isWorker = props.variant === 'worker';
  const subjectId = isWorker ? props.workerId : props.userId;
  const { canEdit } = props;
  const trainingRecordsBase = isWorker
    ? `/subcontractors/workers/${encodeURIComponent(subjectId)}/training-records`
    : `/auth/users/${encodeURIComponent(subjectId)}/training-records`;
  const trainingMatrixBase = isWorker
    ? `/subcontractors/workers/${encodeURIComponent(subjectId)}/training-matrix`
    : `/auth/users/${encodeURIComponent(subjectId)}/training-matrix`;
  const trainingQueryScope = isWorker ? ('worker' as const) : ('user' as const);

  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const { data: rows = [], refetch, isLoading } = useQuery({
    queryKey: ['employee-training-records', trainingQueryScope, subjectId],
    queryFn: () => api<any[]>('GET', trainingRecordsBase),
    enabled: !!subjectId,
  });
  const { data: matrixSnap, isLoading: matrixLoading } = useQuery({
    queryKey: ['user-training-matrix', trainingQueryScope, subjectId],
    queryFn: () =>
      api<{ items: Array<{ id: string; label: string; cell_kind: string; display: string; record: any | null }> }>(
        'GET',
        trainingMatrixBase,
      ),
    enabled: !!subjectId,
  });
  const { data: matrixCatalog } = useQuery({
    queryKey: ['training-matrix-catalog'],
    queryFn: () => api<{ items: Array<{ id: string; label: string; cell_kind: string }> }>('GET', '/auth/training-records/matrix-catalog'),
  });
  const [modalOpen, setModalOpen] = useState(false);
  const [viewingRecord, setViewingRecord] = useState<any | null>(null);
  const [editing, setEditing] = useState<any | null>(null);
  const [saving, setSaving] = useState(false);
  const [certificateFile, setCertificateFile] = useState<File | null>(null);
  const [certificateDocTitle, setCertificateDocTitle] = useState('');
  const [includeWeekends, setIncludeWeekends] = useState(false);
  const [differentCompletionDate, setDifferentCompletionDate] = useState(false);
  const [form, setForm] = useState({
    title: '',
    provider: '',
    category: '',
    delivery_format: '',
    start_date: '',
    end_date: '',
    completion_date: '',
    status: 'completed',
    certificate_number: '',
    expiry_date: '',
    notes: '',
    crew: '',
    location: '',
    session_time: '',
    time_start: '',
    time_end: '',
    matrix_training_id: '',
  });

  const resetForm = (defaults?: Partial<typeof form>) => {
    setIncludeWeekends(false);
    setDifferentCompletionDate(false);
    setForm({
      title: '',
      provider: '',
      category: '',
      delivery_format: '',
      start_date: '',
      end_date: '',
      completion_date: '',
      status: 'completed',
      certificate_number: '',
      expiry_date: '',
      notes: '',
      crew: '',
      location: '',
      session_time: '',
      time_start: '',
      time_end: '',
      matrix_training_id: '',
      ...defaults,
    });
  };

  const openAdd = () => {
    setEditing(null);
    resetForm();
    setCertificateFile(null);
    setCertificateDocTitle('');
    setModalOpen(true);
  };

  const openAddForMatrix = (slot: { id: string; label: string }) => {
    setEditing(null);
    resetForm({ title: slot.label, matrix_training_id: slot.id });
    setCertificateFile(null);
    setCertificateDocTitle('');
    setModalOpen(true);
  };

  const openView = (r: any) => {
    setViewingRecord(r);
  };

  const closeView = () => {
    setViewingRecord(null);
  };

  const openEdit = (r: any) => {
    setEditing(r);
    const st = r.session_time != null ? String(r.session_time) : '';
    const parsed = _parseSessionTimeToHHmm(st);
    const endD = r.end_date ? String(r.end_date).slice(0, 10) : '';
    const compD = r.completion_date ? String(r.completion_date).slice(0, 10) : '';
    const useDifferentComp = compD !== '' && compD !== endD;
    setDifferentCompletionDate(useDifferentComp);
    setForm({
      title: r.title || '',
      provider: r.provider || '',
      category: r.category || '',
      delivery_format: r.delivery_format || '',
      start_date: r.start_date ? String(r.start_date).slice(0, 10) : '',
      end_date: endD,
      completion_date: compD,
      status: r.status || 'completed',
      certificate_number: r.certificate_number || '',
      expiry_date: r.expiry_date ? String(r.expiry_date).slice(0, 10) : '',
      notes: r.notes || '',
      crew: r.crew != null ? String(r.crew) : '',
      location: r.location != null ? String(r.location) : '',
      session_time: st,
      time_start: parsed.time_start,
      time_end: parsed.time_end,
      matrix_training_id: r.matrix_training_id != null ? String(r.matrix_training_id) : '',
    });
    setCertificateFile(null);
    setCertificateDocTitle('');
    setIncludeWeekends(false);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditing(null);
    setCertificateFile(null);
    setCertificateDocTitle('');
    setIncludeWeekends(false);
    setDifferentCompletionDate(false);
  };

  /** Matrix slots without a linked HR record yet — shortcuts only; filled slots live in Training & courses above. */
  const matrixShortcutItems = useMemo(
    () => (matrixSnap?.items || []).filter((row) => !row.record),
    [matrixSnap?.items],
  );

  const trainingDurationHint = useMemo(() => {
    const startD = form.start_date.trim();
    const endD = form.end_date.trim() || startD;
    const ts = form.time_start.trim();
    const te = form.time_end.trim();
    if (!startD || !ts || !te) return null;
    const perDay = _dailyHoursFromTimes(ts, te);
    if (perDay == null) return null;
    const days = _workdaysInclusive(startD, endD, includeWeekends);
    if (days <= 0) return null;
    return { days, perDay };
  }, [form.start_date, form.end_date, form.time_start, form.time_end, includeWeekends]);

  const computedDurationHours = useMemo(() => {
    if (!trainingDurationHint) return null;
    return Math.round(trainingDurationHint.perDay * trainingDurationHint.days * 100) / 100;
  }, [trainingDurationHint]);

  const effectiveCompletionDate = (): string => {
    if (differentCompletionDate) return form.completion_date.trim();
    return form.end_date.trim() || form.start_date.trim();
  };

  const buildPayload = () => {
    const needsCompletion = form.status === 'completed' || form.status === 'expired';
    const cdTrim = effectiveCompletionDate();
    const duration_hours =
      computedDurationHours != null
        ? computedDurationHours
        : editing?.duration_hours != null && !Number.isNaN(Number(editing.duration_hours))
          ? Number(editing.duration_hours)
          : undefined;
    const ts = form.time_start.trim();
    const te = form.time_end.trim();
    const session_time =
      ts && te ? `${ts}–${te}` : form.session_time.trim() || undefined;
    return {
      title: form.title.trim(),
      provider: form.provider.trim() || undefined,
      category: form.category.trim() || undefined,
      delivery_format: form.delivery_format.trim() || undefined,
      start_date: form.start_date || undefined,
      end_date: form.end_date || undefined,
      completion_date: (needsCompletion ? cdTrim : cdTrim || null) as string | null,
      duration_hours,
      status: form.status || 'completed',
      certificate_number: form.certificate_number.trim() || undefined,
      expiry_date: form.expiry_date || undefined,
      notes: form.notes.trim() || undefined,
      crew: form.crew.trim() || undefined,
      location: form.location.trim() || undefined,
      session_time,
      matrix_training_id: form.matrix_training_id.trim() ? form.matrix_training_id.trim() : null,
    };
  };

  const submitTrainingRecord = async () => {
    if (!form.title.trim()) {
      toast.error('Title is required');
      return;
    }
    const needsCompletion = form.status === 'completed' || form.status === 'expired';
    if (needsCompletion && !effectiveCompletionDate()) {
      toast.error(
        differentCompletionDate
          ? 'Completion date is required when using a different completion date'
          : 'End date (or start date) is required for completed or expired records',
      );
      return;
    }
    let payload: Record<string, unknown>;
    try {
      payload = buildPayload();
    } catch (err: any) {
      toast.error(err?.message || 'Invalid form');
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await api('PATCH', `${trainingRecordsBase}/${encodeURIComponent(editing.id)}`, payload);
      } else {
        await api('POST', trainingRecordsBase, payload);
      }
      if (certificateFile && canEdit) {
        try {
          if (isWorker) {
            await uploadTrainingCertificateToWorkerFiles(subjectId, certificateFile, {
              docTitle: certificateDocTitle,
              trainingTitle: form.title.trim(),
            });
            toast.success(
              editing
                ? 'Record updated; certificate saved to worker Documents.'
                : 'Record added; certificate saved to worker Documents.',
            );
          } else {
            await uploadTrainingCertificateToDocs(subjectId, certificateFile, {
              docTitle: certificateDocTitle,
              issuedDate: effectiveCompletionDate(),
              expiryDate: form.expiry_date,
              trainingTitle: form.title.trim(),
            });
            toast.success(
              editing ? 'Record updated; certificate saved to Docs.' : 'Record added; certificate saved to Docs.',
            );
          }
        } catch (upErr: any) {
          console.error(upErr);
          toast.error(
            editing
              ? 'Record updated, but certificate upload failed. Try again from the Docs tab.'
              : 'Record added, but certificate upload failed. Try again from the Docs tab.',
          );
        }
      } else {
        toast.success(editing ? 'Record updated' : 'Record added');
      }
      if (!isWorker) {
        queryClient.invalidateQueries({ queryKey: ['user-docs', subjectId] });
        queryClient.invalidateQueries({ queryKey: ['user-folders', subjectId] });
      } else {
        queryClient.invalidateQueries({ queryKey: ['subcontractor-worker-files', subjectId] });
      }
      queryClient.invalidateQueries({ queryKey: ['user-training-matrix', trainingQueryScope, subjectId] });
      closeModal();
      refetch();
    } catch (err: any) {
      toast.error(err?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (r: any) => {
    const res = await confirm({
      title: 'Delete training record?',
      message: 'This cannot be undone.',
      confirmText: 'Delete',
      cancelText: 'Cancel',
    });
    if (res !== 'confirm') return;
    try {
      await api('DELETE', `${trainingRecordsBase}/${encodeURIComponent(r.id)}`);
      toast.success('Deleted');
      queryClient.invalidateQueries({ queryKey: ['user-training-matrix', trainingQueryScope, subjectId] });
      refetch();
    } catch (err: any) {
      toast.error(err?.message || 'Delete failed');
    }
  };

  const fmtDate = (s: string | null | undefined) => {
    if (!s) return '—';
    return String(s).slice(0, 10);
  };

  const formatLabel = (v: string) => {
    if (v === 'in_person') return 'In person';
    if (v === 'online') return 'Online';
    if (v === 'hybrid') return 'Hybrid';
    return v || '—';
  };

  const trainingTitle = isWorker ? 'Training' : 'Training & courses';
  const trainingDescription = isWorker
    ? 'Training matrix records required for site access.'
    : 'HR training history, including optional sync from completed internal LMS courses. Use Start date for scheduled or in-progress rows so they show on the team training calendar.';

  const matrixSelectOptions = useMemo(
    () => (matrixCatalog?.items ?? []).map((opt) => ({ value: opt.id, label: opt.label })),
    [matrixCatalog?.items],
  );

  const categorySelectOptions = useMemo(
    () => TRAINING_CATEGORIES.filter(Boolean).map((c) => ({ value: c, label: c })),
    [],
  );

  const formatSelectOptions = useMemo(
    () =>
      TRAINING_FORMATS.filter(Boolean).map((c) => ({
        value: c,
        label: formatLabel(c),
      })),
    [],
  );

  const statusSelectOptions = useMemo(
    () =>
      TRAINING_STATUSES.map((s) => ({
        value: s,
        label: s.replace('_', ' '),
      })),
    [],
  );

  const needsCompletionDate = form.status === 'completed' || form.status === 'expired';
  const endDateLabel =
    needsCompletionDate && !differentCompletionDate ? 'End date *' : 'End date';

  const trainingListPreset = canEdit ? 'workerTraining' : 'workerTrainingReadOnly';

  type TrainingSortColumn =
    | 'type'
    | 'title'
    | 'provider'
    | 'category'
    | 'crew'
    | 'start'
    | 'completed'
    | 'hours'
    | 'status'
    | 'expires';
  const { sortBy, sortDir, setSort } = useLocalAppListSort<TrainingSortColumn>('title', 'asc');

  const sortedTrainingRows = useMemo(
    () =>
      sortListByAppColumn(rows as any[], sortBy, sortDir, {
        type: (r) => r.item_type_label || '',
        title: (r) => r.title || '',
        provider: (r) => r.provider || '',
        category: (r) => r.category || '',
        crew: (r) => r.crew || '',
        start: (r) => r.start_date || '',
        completed: (r) => r.completion_date || '',
        hours: (r) => r.duration_hours ?? null,
        status: (r) => r.status || '',
        expires: (r) => r.expiry_date || '',
      }),
    [rows, sortBy, sortDir],
  );

  const certificateUploadHint = isWorker
    ? "Certificate file\n\nOptional. Saves to this worker's Documents tab under Training certificates when you save."
    : `Certificate file\n\nOptional. Saves to Docs → ${TRAINING_CERTIFICATES_FOLDER_NAME} (folder is created automatically if missing).`;

  return (
    <AppCard>
      <AppSectionHeader
        title={trainingTitle}
        description={trainingDescription}
        {...appSectionPresetProps('education')}
      />

      <div className="mt-4 space-y-4">
        {isLoading ? (
          <div className="h-28 animate-pulse rounded-lg bg-slate-100" />
        ) : (
          <div className="flex flex-col gap-2 overflow-x-auto rounded-lg border border-gray-200 bg-white p-4">
            {(rows as any[]).length > 0 ? (
              <p className={uiCx(uiTypography.helper, 'mb-1')}>
                Click a row to view full details.
              </p>
            ) : null}
            {canEdit && (
              <AppListCreateItem
                label="Add record"
                layout="row"
                className={uiCx('w-full', resolveAppSortableListPreset(trainingListPreset).minWidth)}
                onClick={openAdd}
              />
            )}
            {!(rows as any[]).length ? (
              <AppEmptyState
                title="No training records yet"
                description={
                  canEdit
                    ? 'Add courses, certifications, or renewals using “Add record” above.'
                    : undefined
                }
                className="border-0 bg-transparent p-0 py-6 shadow-none"
              />
            ) : (
              <AppSortableEntityList layout="flat">
                <AppSortableEntityListHeader preset={trainingListPreset} variant="flat">
                  <AppSortableEntityListSortColumn
                    label="Type"
                    column="type"
                    sortBy={sortBy}
                    sortDir={sortDir}
                    onSort={setSort}
                  />
                  <AppSortableEntityListSortColumn
                    label="Title"
                    column="title"
                    sortBy={sortBy}
                    sortDir={sortDir}
                    onSort={setSort}
                  />
                  <AppSortableEntityListSortColumn
                    label="Provider"
                    column="provider"
                    sortBy={sortBy}
                    sortDir={sortDir}
                    onSort={setSort}
                  />
                  <AppSortableEntityListSortColumn
                    label="Category"
                    column="category"
                    sortBy={sortBy}
                    sortDir={sortDir}
                    onSort={setSort}
                  />
                  <AppSortableEntityListSortColumn
                    label="Crew"
                    column="crew"
                    sortBy={sortBy}
                    sortDir={sortDir}
                    onSort={setSort}
                  />
                  <AppSortableEntityListSortColumn
                    label="Start"
                    column="start"
                    sortBy={sortBy}
                    sortDir={sortDir}
                    onSort={setSort}
                  />
                  <AppSortableEntityListSortColumn
                    label="Completed"
                    column="completed"
                    sortBy={sortBy}
                    sortDir={sortDir}
                    onSort={setSort}
                  />
                  <AppSortableEntityListSortColumn
                    label="Hrs"
                    column="hours"
                    sortBy={sortBy}
                    sortDir={sortDir}
                    onSort={setSort}
                  />
                  <AppSortableEntityListSortColumn
                    label="Status"
                    column="status"
                    sortBy={sortBy}
                    sortDir={sortDir}
                    onSort={setSort}
                  />
                  <AppSortableEntityListSortColumn
                    label="Expires"
                    column="expires"
                    sortBy={sortBy}
                    sortDir={sortDir}
                    onSort={setSort}
                  />
                  {canEdit ? <div className="min-w-0 w-24" aria-hidden /> : null}
                </AppSortableEntityListHeader>
                <AppSortableEntityListFlatBody preset={trainingListPreset}>
                  {sortedTrainingRows.map((r) => (
                    <AppSortableEntityListRow
                      key={r.id}
                      as="div"
                      variant="flat"
                      preset={trainingListPreset}
                      className="group cursor-pointer"
                      role="button"
                      tabIndex={0}
                      onClick={() => openView(r)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          openView(r);
                        }
                      }}
                    >
                      <span
                        className={uiCx(uiTypography.helper, 'min-w-0 truncate text-slate-600')}
                        title={r.item_type_label || ''}
                      >
                        {r.item_type_label || '—'}
                      </span>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="truncate text-sm font-bold text-gray-900 transition-colors group-hover:text-[#7f1010]">
                            {r.title}
                          </span>
                          {r.training_source === 'lms' && (
                            <span className="rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-800">
                              Internal LMS
                            </span>
                          )}
                        </div>
                      </div>
                      <span className={uiCx(uiTypography.helper, 'min-w-0 truncate text-gray-700')}>
                        {r.provider || '—'}
                      </span>
                      <span className={uiCx(uiTypography.helper, 'min-w-0 truncate text-gray-700')}>
                        {r.category || '—'}
                      </span>
                      <span
                        className={uiCx(uiTypography.helper, 'min-w-0 truncate text-gray-700')}
                        title={r.crew || ''}
                      >
                        {r.crew || '—'}
                      </span>
                      <span className={uiCx(uiTypography.helper, 'min-w-0 whitespace-nowrap text-gray-700')}>
                        {fmtDate(r.start_date)}
                      </span>
                      <span className={uiCx(uiTypography.helper, 'min-w-0 whitespace-nowrap text-gray-700')}>
                        {fmtDate(r.completion_date)}
                      </span>
                      <span className={uiCx(uiTypography.helper, 'min-w-0 text-gray-700')}>
                        {r.duration_hours != null ? r.duration_hours : '—'}
                      </span>
                      <div className="min-w-0">{trainingStatusPill(r.status)}</div>
                      <span className={uiCx(uiTypography.helper, 'min-w-0 whitespace-nowrap text-gray-700')}>
                        {fmtDate(r.expiry_date)}
                      </span>
                      {canEdit ? (
                        <div
                          className="flex w-24 shrink-0 items-center justify-end gap-1.5"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <AppListRowIconButton
                            preset="edit"
                            label="Edit training record"
                            onClick={() => openEdit(r)}
                          />
                          <AppListRowIconButton
                            preset="delete"
                            label="Delete training record"
                            onClick={() => void handleDelete(r)}
                          />
                        </div>
                      ) : null}
                    </AppSortableEntityListRow>
                  ))}
                </AppSortableEntityListFlatBody>
              </AppSortableEntityList>
            )}
          </div>
        )}
      </div>

      <div className="mt-6 border-t border-gray-200 pt-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-100">
              <svg className="h-4 w-4 text-emerald-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 4v16m8-8H4"
                />
              </svg>
            </div>
            <div className="min-w-0">
              <h5 className="text-sm font-semibold text-emerald-950">Standard training matrix</h5>
              <p className="mt-0.5 text-xs text-gray-500">
                Shortcuts to add a linked record for a checklist slot. After you save, it appears in{' '}
                <span className="font-medium text-gray-700">{trainingTitle}</span> above and leaves this list.
              </p>
            </div>
          </div>
        </div>
        {matrixLoading ? (
          <div className="h-24 animate-pulse rounded-lg bg-slate-100" />
        ) : matrixShortcutItems.length === 0 ? (
          <div className="rounded-lg border border-emerald-100 bg-emerald-50/50 px-4 py-3 text-sm text-emerald-900">
            All standard matrix slots are covered in <span className="font-semibold">{trainingTitle}</span> above.
          </div>
        ) : canEdit ? (
          <div className="flex flex-wrap gap-2">
            {matrixShortcutItems.map((row) => (
              <button
                key={row.id}
                type="button"
                onClick={() => openAddForMatrix({ id: row.id, label: row.label })}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-left text-xs font-semibold text-gray-800 shadow-sm transition-colors hover:border-brand-red hover:text-brand-red"
              >
                <span className="text-brand-red">+</span>
                <span>{row.label}</span>
              </button>
            ))}
          </div>
        ) : (
          <p className="rounded-lg border border-dashed border-gray-200 bg-slate-50/60 px-4 py-3 text-xs text-gray-600">
            Not yet linked in {trainingTitle}:{' '}
            <span className="font-medium text-gray-800">{matrixShortcutItems.map((r) => r.label).join(', ')}</span>
          </p>
        )}
      </div>

      {viewingRecord ? (
        <AppFormModal
          open
          onClose={closeView}
          layout="detail"
          size="md"
          title="Training record details"
          description={viewingRecord.title || 'Training record'}
          bodyClassName={uiCx(uiSpacing.cardPadding, 'min-w-0')}
          footer={
            <div className={uiCx(uiLayout.actionsRow, 'w-full justify-end')}>
              <AppButton type="button" variant="secondary" size="sm" onClick={closeView}>
                Close
              </AppButton>
              {canEdit ? (
                <AppButton
                  type="button"
                  size="sm"
                  onClick={() => {
                    const r = viewingRecord;
                    closeView();
                    openEdit(r);
                  }}
                >
                  Edit
                </AppButton>
              ) : null}
            </div>
          }
        >
          <AppCard bodyClassName={uiCx(uiSpacing.cardPadding, 'min-w-0')}>
            <dl className="min-w-0">
              <TrainingDetailField label="Type">{viewingRecord.item_type_label || '—'}</TrainingDetailField>
              <TrainingDetailField label="Title">
                <div className="flex flex-wrap items-center gap-2">
                  <span>{viewingRecord.title || '—'}</span>
                  {viewingRecord.training_source === 'lms' ? (
                    <span className="rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-800">
                      Internal LMS
                    </span>
                  ) : null}
                </div>
              </TrainingDetailField>
              <TrainingDetailField label="Status">{trainingStatusPill(viewingRecord.status)}</TrainingDetailField>
              <TrainingDetailField label="Provider">{viewingRecord.provider || '—'}</TrainingDetailField>
              <TrainingDetailField label="Category">{viewingRecord.category || '—'}</TrainingDetailField>
              <TrainingDetailField label="Format">
                {viewingRecord.delivery_format ? formatLabel(viewingRecord.delivery_format) : '—'}
              </TrainingDetailField>
              <TrainingDetailField label="Crew">{viewingRecord.crew || '—'}</TrainingDetailField>
              <TrainingDetailField label="Location">{viewingRecord.location || '—'}</TrainingDetailField>
              <TrainingDetailField label="Start date">
                {viewingRecord.start_date ? String(viewingRecord.start_date).slice(0, 10) : '—'}
              </TrainingDetailField>
              <TrainingDetailField label="End date">
                {viewingRecord.end_date ? String(viewingRecord.end_date).slice(0, 10) : '—'}
              </TrainingDetailField>
              <TrainingDetailField label="Completed">
                {viewingRecord.completion_date ? String(viewingRecord.completion_date).slice(0, 10) : '—'}
              </TrainingDetailField>
              <TrainingDetailField label="Session time">{viewingRecord.session_time || '—'}</TrainingDetailField>
              <TrainingDetailField label="Duration (hours)">
                {viewingRecord.duration_hours != null ? viewingRecord.duration_hours : '—'}
              </TrainingDetailField>
              <TrainingDetailField label="Certificate / reference #">
                {viewingRecord.certificate_number || '—'}
              </TrainingDetailField>
              <TrainingDetailField label="Expires">
                {viewingRecord.expiry_date ? String(viewingRecord.expiry_date).slice(0, 10) : '—'}
              </TrainingDetailField>
              <TrainingDetailField label="Matrix slot">
                {viewingRecord.matrix_training_id
                  ? matrixCatalog?.items?.find((x) => x.id === String(viewingRecord.matrix_training_id))?.label ||
                    viewingRecord.matrix_training_id
                  : '—'}
              </TrainingDetailField>
              <TrainingDetailField label="Notes">
                {viewingRecord.notes ? (
                  <span className="whitespace-pre-wrap font-normal text-gray-700">{viewingRecord.notes}</span>
                ) : (
                  '—'
                )}
              </TrainingDetailField>
            </dl>
          </AppCard>
        </AppFormModal>
      ) : null}

      <AppFormModal
        open={modalOpen}
        onClose={closeModal}
        title={editing ? 'Edit training record' : 'Add training record'}
        description="For completed or expired, the end date counts as completion unless you choose a different completion date."
        formWidth="wide"
        quickInfo={employeeTrainingRecordQuickInfo({
          isWorker,
          editing: !!editing,
          hasCertificateFile: !!certificateFile,
        })}
        dialogClassName={FORM_MODAL_WIDE_DIALOG_COLLAPSED}
        dialogClassNameExpanded={FORM_MODAL_WIDE_DIALOG_EXPANDED}
        footer={
          <div className={uiCx(uiLayout.actionsRow, 'w-full justify-end')}>
            <AppButton type="button" variant="secondary" size="sm" onClick={closeModal} disabled={saving}>
              Cancel
            </AppButton>
            <AppButton
              type="button"
              size="sm"
              loading={saving}
              disabled={saving}
              onClick={() => void submitTrainingRecord()}
            >
              {saving ? 'Saving…' : 'Save'}
            </AppButton>
          </div>
        }
      >
        <AppInput
          label="Title *"
          value={form.title}
          onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          required
          fieldHint="Title\n\nCourse, certification, or matrix training name shown in the list."
        />
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:items-start">
          <AppSelect
            label="Matrix slot (optional)"
            value={form.matrix_training_id}
            options={matrixSelectOptions}
            placeholder="Select matrix slot…"
            onChange={(e) => {
              const v = e.target.value;
              const slotLabel =
                matrixCatalog?.items?.find((x) => x.id === v)?.label?.trim() || '';
              setForm((f) => ({
                ...f,
                matrix_training_id: v,
                ...(!editing && slotLabel ? { title: slotLabel } : {}),
              }));
            }}
            fieldHint="Matrix slot\n\nLinks this record to a standard training matrix item."
          />
          <AppSelect
            label="Status"
            value={form.status}
            options={statusSelectOptions}
            onChange={(e) => {
              const ns = e.target.value;
              setForm((f) => {
                let cd = f.completion_date;
                if (
                  (ns === 'completed' || ns === 'expired') &&
                  differentCompletionDate &&
                  !cd.trim()
                ) {
                  cd =
                    f.end_date.trim() ||
                    f.start_date.trim() ||
                    new Date().toISOString().slice(0, 10);
                }
                return { ...f, status: ns, completion_date: cd };
              });
            }}
            fieldHint="Status\n\nCompleted or expired require an end date (or separate completion date)."
          />
        </div>
        <AppInput
          label="Provider"
          value={form.provider}
          onChange={(e) => setForm((f) => ({ ...f, provider: e.target.value }))}
          placeholder="Organization or trainer"
        />
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:items-start">
          <AppSelect
            label="Category"
            value={form.category}
            options={categorySelectOptions}
            placeholder="Select category…"
            onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
          />
          <AppSelect
            label="Format"
            value={form.delivery_format}
            options={formatSelectOptions}
            placeholder="Select format…"
            onChange={(e) => setForm((f) => ({ ...f, delivery_format: e.target.value }))}
          />
          <AppInput
            label="Crew"
            value={form.crew}
            onChange={(e) => setForm((f) => ({ ...f, crew: e.target.value }))}
            placeholder="e.g. Repairs, Metal, Office"
          />
          <AppInput
            label="Location"
            value={form.location}
            onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
            placeholder="Address or room"
          />
          <AppDatePicker
            label="Start date"
            value={form.start_date}
            onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))}
          />
          <AppDatePicker
            label={endDateLabel}
            value={form.end_date}
            onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))}
            helperText={
              !differentCompletionDate && needsCompletionDate
                ? 'Also used as completion date.'
                : undefined
            }
          />
          <AppTimePicker
            label="Start time"
            value={form.time_start}
            onChange={(e) =>
              setForm((f) => ({ ...f, time_start: e.target.value, session_time: '' }))
            }
            fieldHint="Start time\n\nDaily session start; used with end time to calculate duration."
          />
          <AppTimePicker
            label="End time"
            value={form.time_end}
            onChange={(e) =>
              setForm((f) => ({ ...f, time_end: e.target.value, session_time: '' }))
            }
            fieldHint="End time\n\nDaily session end; must be after start time for duration."
          />
          <AppInput
            label="Certificate / reference #"
            value={form.certificate_number}
            onChange={(e) => setForm((f) => ({ ...f, certificate_number: e.target.value }))}
          />
          <AppDatePicker
            label="Expiry / renewal date"
            value={form.expiry_date}
            onChange={(e) => setForm((f) => ({ ...f, expiry_date: e.target.value }))}
          />
        </div>
        <div className={uiSpacing.sectionStack}>
          <AppCheckbox
            label="Use different completion date"
            checked={differentCompletionDate}
            onChange={(on) => {
              setDifferentCompletionDate(on);
              if (on) {
                setForm((f) => ({
                  ...f,
                  completion_date:
                    f.completion_date.trim() ||
                    f.end_date.trim() ||
                    f.start_date.trim() ||
                    new Date().toISOString().slice(0, 10),
                }));
              }
            }}
          />
          {differentCompletionDate ? (
            <AppDatePicker
              label={needsCompletionDate ? 'Completion date *' : 'Completion date'}
              value={form.completion_date}
              onChange={(e) => setForm((f) => ({ ...f, completion_date: e.target.value }))}
              className="max-w-xs"
            />
          ) : null}
          <AppCheckbox
            label="Include weekends"
            checked={includeWeekends}
            onChange={setIncludeWeekends}
          />
        </div>
        <div className={uiSpacing.sectionStack}>
          <AppControlLabelRow
            label="Duration (hours)"
            fieldHint={
              <AppFieldHint hint="Duration\n\nCalculated from dates and daily start/end times." />
            }
          />
          {computedDurationHours != null && trainingDurationHint ? (
            <p
              className={uiCx(
                uiRadius.control,
                uiBorders.subtle,
                'bg-gray-50/80 px-3 py-2',
                uiTypography.body,
              )}
            >
              <span className="font-semibold tabular-nums">{computedDurationHours}</span>
              <span className="text-gray-600">
                {' '}
                ({trainingDurationHint.days} day(s) × {trainingDurationHint.perDay.toFixed(2)} h/day)
              </span>
            </p>
          ) : (
            <p
              className={uiCx(
                uiRadius.control,
                'border border-dashed border-gray-200 bg-gray-50/50 px-3 py-2',
                uiTypography.helper,
              )}
            >
              Set start and end dates plus daily start and end times to calculate hours
              {includeWeekends ? ' (all days)' : ' (weekdays only unless weekends are included)'}.
              {editing?.duration_hours != null
                ? ` Saved value: ${editing.duration_hours} h (unchanged until recalculated).`
                : ''}
            </p>
          )}
        </div>
        {canEdit ? (
          <div
            className={uiCx(
              uiSpacing.sectionStack,
              uiRadius.card,
              uiBorders.subtle,
              uiSpacing.compactCardPadding,
              'bg-gray-50/40',
            )}
          >
            <AppFileUpload
              mode="single"
              value={certificateFile}
              onChange={setCertificateFile}
              label="Certificate file (optional)"
              fieldHint={certificateUploadHint}
              helperText="PDF, image, or other — one file per save."
            />
            <AppInput
              label={isWorker ? 'Document title (optional)' : 'Document title in Docs (optional)'}
              value={certificateDocTitle}
              onChange={(e) => setCertificateDocTitle(e.target.value)}
              placeholder={
                form.title.trim()
                  ? `Default: “${form.title.trim()} — file name”`
                  : 'Default: training title — file name'
              }
            />
          </div>
        ) : null}
        <AppTextarea
          label="Notes"
          value={form.notes}
          onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
          rows={5}
          fieldHint="Notes\n\nInternal comments or renewal reminders."
        />
      </AppFormModal>
    </AppCard>
  );
}

function EmergencyContactsSection({ userId, canEdit, showFieldHints }: { userId: string; canEdit: boolean; showFieldHints?: boolean }) {
  const { data, refetch } = useQuery({ 
    queryKey:['emergency-contacts', userId], 
    queryFn: ()=> api<any[]>('GET', `/auth/users/${encodeURIComponent(userId)}/emergency-contacts`) 
  });
  const confirm = useConfirm();
  const [editId, setEditId] = useState<string|null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [relationship, setRelationship] = useState('');
  const [mobilePhone, setMobilePhone] = useState('');
  const [homePhone, setHomePhone] = useState('');
  const [workPhone, setWorkPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [isPrimary, setIsPrimary] = useState(false);
  const [eName, setEName] = useState('');
  const [eRelationship, setERelationship] = useState('');
  const [eMobilePhone, setEMobilePhone] = useState('');
  const [eHomePhone, setEHomePhone] = useState('');
  const [eWorkPhone, setEWorkPhone] = useState('');
  const [eEmail, setEEmail] = useState('');
  const [eAddress, setEAddress] = useState('');
  const [eIsPrimary, setEIsPrimary] = useState(false);
  
  const formatPhone = (v:string)=>{
    const d = String(v||'').replace(/\D+/g,'').slice(0,11);
    if (d.length<=3) return d;
    if (d.length<=6) return `(${d.slice(0,3)}) ${d.slice(3)}`;
    if (d.length<=10) return `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`;
    return `+${d.slice(0,1)} (${d.slice(1,4)}) ${d.slice(4,7)}-${d.slice(7,11)}`;
  };
  
  const beginEdit = (c:any)=>{
    setEditId(c.id);
    setEName(c.name||'');
    setERelationship(c.relationship||'');
    setEMobilePhone(c.mobile_phone||'');
    setEHomePhone(c.home_phone||'');
    setEWorkPhone(c.work_phone||'');
    setEEmail(c.email||'');
    setEAddress(c.address||'');
    setEIsPrimary(c.is_primary||false);
  };
  
  const cancelEdit = ()=>{
    setEditId(null);
  };
  
  const handleCreate = async () => {
    if (!name.trim()) {
      toast.error('Name is required');
      return;
    }
    try {
      await api('POST', `/auth/users/${encodeURIComponent(userId)}/emergency-contacts`, {
        name,
        relationship,
        mobile_phone: mobilePhone,
        home_phone: homePhone,
        work_phone: workPhone,
        email,
        address,
        is_primary: isPrimary
      });
      toast.success('Emergency contact created');
      setName('');
      setRelationship('');
      setMobilePhone('');
      setHomePhone('');
      setWorkPhone('');
      setEmail('');
      setAddress('');
      setIsPrimary(false);
      setCreateOpen(false);
      refetch();
    } catch (error: any) {
      toast.error(error?.message || 'Failed to create contact');
    }
  };
  
  const handleUpdate = async (contactId: string) => {
    if (!eName.trim()) {
      toast.error('Name is required');
      return;
    }
    try {
      await api('PATCH', `/auth/users/${encodeURIComponent(userId)}/emergency-contacts/${contactId}`, {
        name: eName,
        relationship: eRelationship,
        mobile_phone: eMobilePhone,
        home_phone: eHomePhone,
        work_phone: eWorkPhone,
        email: eEmail,
        address: eAddress,
        is_primary: eIsPrimary
      });
      toast.success('Emergency contact updated');
      setEditId(null);
      refetch();
    } catch (error: any) {
      toast.error(error?.message || 'Failed to update contact');
    }
  };
  
  const handleDelete = async (contactId: string) => {
    const result = await confirm({ title:'Delete emergency contact', message:'Are you sure you want to delete this emergency contact? This action cannot be undone.', confirmText:'Delete', cancelText:'Cancel' });
    if(result !== 'confirm') return;
    try {
      await api('DELETE', `/auth/users/${encodeURIComponent(userId)}/emergency-contacts/${contactId}`);
      toast.success('Emergency contact deleted');
      refetch();
    } catch (error: any) {
      toast.error(error?.message || 'Failed to delete contact');
    }
  };
  
  const handleSetPrimary = async (contactId: string) => {
    try {
      await api('PATCH', `/auth/users/${encodeURIComponent(userId)}/emergency-contacts/${contactId}`, {
        is_primary: true
      });
      toast.success('Primary contact updated');
      refetch();
    } catch (error: any) {
      toast.error(error?.message || 'Failed to update contact');
    }
  };
  
  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div></div>
        {canEdit && (
          <button 
            onClick={() => setCreateOpen(true)} 
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-brand-red to-[#ee2b2b] text-white font-semibold"
          >
            New Contact
          </button>
        )}
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        {(data||[]).map((c: any) => (
          <div key={c.id} className="rounded-xl border bg-white overflow-hidden flex">
            <div className="w-28 bg-gray-100 flex items-center justify-center">
              <div className="w-20 h-20 rounded bg-gray-200 grid place-items-center text-lg font-bold text-gray-600">
                {(c.name||'?').slice(0,2).toUpperCase()}
              </div>
            </div>
            <div className="flex-1 p-3 text-sm">
              {editId === c.id ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="font-semibold">Edit contact</div>
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-gray-600">Primary</label>
                      <input 
                        type="checkbox" 
                        checked={eIsPrimary} 
                        onChange={e => setEIsPrimary(e.target.checked)}
                        className="rounded"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="col-span-2">
                      <label className="text-xs text-gray-600">Name *</label>
                      <input 
                        className="border rounded px-2 py-1 w-full" 
                        value={eName} 
                        onChange={e => setEName(e.target.value)} 
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-600">Relationship</label>
                      <input 
                        className="border rounded px-2 py-1 w-full" 
                        value={eRelationship} 
                        onChange={e => setERelationship(e.target.value)} 
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-600">Mobile Phone</label>
                      <input 
                        className="border rounded px-2 py-1 w-full" 
                        value={eMobilePhone} 
                        onChange={e => setEMobilePhone(formatPhone(e.target.value))} 
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-600">Home Phone</label>
                      <input 
                        className="border rounded px-2 py-1 w-full" 
                        value={eHomePhone} 
                        onChange={e => setEHomePhone(formatPhone(e.target.value))} 
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-600">Work Phone</label>
                      <input 
                        className="border rounded px-2 py-1 w-full" 
                        value={eWorkPhone} 
                        onChange={e => setEWorkPhone(formatPhone(e.target.value))} 
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="text-xs text-gray-600">Email</label>
                      <input 
                        className="border rounded px-2 py-1 w-full" 
                        type="email"
                        value={eEmail} 
                        onChange={e => setEEmail(e.target.value)} 
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="text-xs text-gray-600">Address</label>
                      <input 
                        className="border rounded px-2 py-1 w-full" 
                        value={eAddress} 
                        onChange={e => setEAddress(e.target.value)} 
                      />
                    </div>
                  </div>
                  <div className="text-right space-x-2">
                    <button onClick={cancelEdit} className="px-2 py-1 rounded bg-gray-100">Cancel</button>
                    <button onClick={() => handleUpdate(c.id)} className="px-2 py-1 rounded bg-brand-red text-white">Save</button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <div className="font-semibold">{c.name}</div>
                    {canEdit && (
                      <div className="flex items-center gap-2">
                        {c.is_primary && <span className="text-[11px] bg-green-50 text-green-700 border border-green-200 rounded-full px-2">Primary</span>}
                        {!c.is_primary && (
                          <button 
                            onClick={() => handleSetPrimary(c.id)} 
                            className="px-2 py-1 rounded bg-gray-100 text-xs"
                          >
                            Set Primary
                          </button>
                        )}
                        <button onClick={() => beginEdit(c)} className="px-2 py-1 rounded bg-gray-100 text-xs">Edit</button>
                        <button onClick={() => handleDelete(c.id)} className="px-2 py-1 rounded bg-gray-100 text-xs">Delete</button>
                      </div>
                    )}
                  </div>
                  {c.relationship && (
                    <div className="text-gray-600 text-xs mt-1">{c.relationship}</div>
                  )}
                  <div className="mt-2 space-y-1">
                    {c.mobile_phone && (
                      <div>
                        <div className="text-[11px] uppercase text-gray-500">Mobile</div>
                        <div className="text-gray-700">{c.mobile_phone}</div>
                      </div>
                    )}
                    {c.home_phone && (
                      <div>
                        <div className="text-[11px] uppercase text-gray-500">Home</div>
                        <div className="text-gray-700">{c.home_phone}</div>
                      </div>
                    )}
                    {c.work_phone && (
                      <div>
                        <div className="text-[11px] uppercase text-gray-500">Work</div>
                        <div className="text-gray-700">{c.work_phone}</div>
                      </div>
                    )}
                    {c.email && (
                      <div>
                        <div className="text-[11px] uppercase text-gray-500">Email</div>
                        <div className="text-gray-700">{c.email}</div>
                      </div>
                    )}
                    {c.address && (
                      <div>
                        <div className="text-[11px] uppercase text-gray-500">Address</div>
                        <div className="text-gray-700">{c.address}</div>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        ))}
        {(!data || !data.length) && (
          <div className="text-sm text-gray-600 col-span-2 py-8 text-center">
            No emergency contacts. {canEdit && 'Click "New Contact" to add one.'}
          </div>
        )}
      </div>
      
      <AppFormModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="New Emergency Contact"
        description="Add a person to call in an emergency."
        formWidth="comfortable"
        quickInfo={userEmergencyContactsQuickInfo}
        footer={
          <div className={uiCx(uiLayout.actionsRow, 'w-full justify-end')}>
            <AppButton type="button" variant="secondary" size="sm" onClick={() => setCreateOpen(false)}>
              Cancel
            </AppButton>
            <AppButton type="button" size="sm" onClick={handleCreate}>
              Create
            </AppButton>
          </div>
        }
      >
        <div className="grid gap-3 md:grid-cols-2">
          <AppInput
            className="md:col-span-2"
            label="Name *"
            value={name}
            onChange={(e) => setName(e.target.value)}
            fieldHint={showFieldHints ? userProfileFieldHint('emergency_name') : undefined}
          />
          <AppInput
            label="Relationship"
            value={relationship}
            onChange={(e) => setRelationship(e.target.value)}
            fieldHint={showFieldHints ? userProfileFieldHint('emergency_relationship') : undefined}
          />
          <AppCheckbox label="Set as primary contact" checked={isPrimary} onChange={setIsPrimary} />
          <AppInput
            label="Mobile Phone"
            value={mobilePhone}
            onChange={(e) => setMobilePhone(formatPhone(e.target.value))}
            fieldHint={showFieldHints ? userProfileFieldHint('emergency_mobile_phone') : undefined}
          />
          <AppInput
            label="Home Phone"
            value={homePhone}
            onChange={(e) => setHomePhone(formatPhone(e.target.value))}
            fieldHint={showFieldHints ? userProfileFieldHint('emergency_home_phone') : undefined}
          />
          <AppInput
            label="Work Phone"
            value={workPhone}
            onChange={(e) => setWorkPhone(formatPhone(e.target.value))}
            fieldHint={showFieldHints ? userProfileFieldHint('emergency_work_phone') : undefined}
          />
          <AppInput
            className="md:col-span-2"
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            fieldHint={showFieldHints ? userProfileFieldHint('emergency_email') : undefined}
          />
          <AppInput
            className="md:col-span-2"
            label="Address"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            fieldHint={showFieldHints ? userProfileFieldHint('emergency_address') : undefined}
          />
        </div>
      </AppFormModal>
    </div>
  );
}

// Work Eligibility Documents Section — driver's licence; visa & immigration hidden for Canadian citizens
function WorkEligibilityDocumentsSection({
  userId,
  canEdit,
  profile,
  onProfileFieldsChange,
  showFieldHints,
}: {
  userId: string;
  canEdit: boolean;
  profile: Record<string, any>;
  onProfileFieldsChange: (kv: Record<string, any>) => void;
  showFieldHints?: boolean;
}) {
  const wes = (profile.work_eligibility_status || '').trim();
  const hideVisaAndImmigration = wes === 'Canadian Citizen';

  return (
    <div className="space-y-4">
      <CanadianDriversLicenseSection
        editable={canEdit}
        profile={profile}
        onFieldsChange={onProfileFieldsChange}
        showFieldHints={showFieldHints}
      />
      {!hideVisaAndImmigration ? (
        <>
          <VisaInformationSection userId={userId} canEdit={canEdit} isRequired={false} showInlineForm={false} />
          <ImmigrationStatusDocumentSection userId={userId} canEdit={canEdit} isRequired={false} />
        </>
      ) : null}
    </div>
  );
}

// PR Card Upload Section (for Canadian Citizen and Permanent Resident)
function PRCardUploadSection({ userId, canEdit }: { userId: string; canEdit: boolean }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const queryClient = useQueryClient();
  const { data: prCardFile, refetch } = useQuery({
    queryKey: ['pr-card-file', userId],
    queryFn: () => api<any>('GET', `/auth/users/${encodeURIComponent(userId)}/profile`),
  });
  const prCardFileId = prCardFile?.profile?.pr_card_file_id;

  const handleUpload = async () => {
    const f = fileRef.current?.files?.[0];
    if (!f) return;
    
    // Validate file type
    const isPDF = f.type === 'application/pdf';
    const isImage = f.type.startsWith('image/');
    if (!isPDF && !isImage) {
      toast.error('Please upload a PDF or image file');
      return;
    }

    setUploading(true);
    try {
      const up: any = await api('POST', '/files/upload', {
        project_id: null,
        client_id: null,
        employee_id: userId,
        category_id: 'pr-card',
        original_name: f.name,
        content_type: f.type || 'application/pdf'
      });
      const put = await fetch(up.upload_url, {
        method: 'PUT',
        headers: { 'Content-Type': f.type || 'application/pdf', 'x-ms-blob-type': 'BlockBlob' },
        body: f
      });
      if (!put.ok) throw new Error('upload failed');
      const conf: any = await api('POST', '/files/confirm', {
        key: up.key,
        size_bytes: f.size,
        checksum_sha256: 'na',
        content_type: f.type || 'application/pdf'
      });
      await api('PUT', `/auth/users/${encodeURIComponent(userId)}/profile`, {
        pr_card_file_id: conf.id
      });
      toast.success('PR Card uploaded successfully');
      await refetch();
      await queryClient.invalidateQueries({ queryKey: ['userProfile', userId] });
    } catch (e: any) {
      toast.error(e?.message || 'Failed to upload PR Card');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div className="rounded-xl border bg-white p-4">
      <div className="mb-4 flex items-center gap-2">
        <div className="w-8 h-8 rounded bg-amber-100 flex items-center justify-center">
          <svg className="w-5 h-5 text-amber-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 104 0m-5 8a2 2 0 100-4 2 2 0 000 4zm0 0c1.306 0 2.417.835 2.83 2M9 14a3.001 3.001 0 00-2.83 2M15 11h3m-3 4h2" />
          </svg>
        </div>
        <h5 className="font-semibold text-amber-900">PR Card (Optional)</h5>
      </div>
      {prCardFileId ? (
        <div className="space-y-3">
          <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
            <div className="flex-1">
              <div className="text-sm font-medium text-gray-900">PR Card Document</div>
              <div className="text-xs text-gray-500">Document uploaded</div>
            </div>
            <a
              href={withFileAccessToken(`/files/${prCardFileId}/download`)}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1.5 rounded border border-amber-300 text-amber-700 text-sm font-medium hover:bg-amber-50"
            >
              View
            </a>
            {canEdit && (
              <button
                onClick={async () => {
                  try {
                    await api('PUT', `/auth/users/${encodeURIComponent(userId)}/profile`, { pr_card_file_id: null });
                    toast.success('PR Card removed');
                    await refetch();
                    await queryClient.invalidateQueries({ queryKey: ['userProfile', userId] });
                  } catch (e: any) {
                    toast.error(e?.message || 'Failed to remove PR Card');
                  }
                }}
                className="px-3 py-1.5 rounded border border-red-300 text-red-700 text-sm font-medium hover:bg-red-50"
              >
                Remove
              </button>
            )}
          </div>
          {canEdit && (
            <div>
              <input ref={fileRef} type="file" accept=".pdf,image/*" className="hidden" onChange={handleUpload} />
              <button
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="px-3 py-1.5 rounded border border-amber-300 text-amber-700 text-sm font-medium hover:bg-amber-50 disabled:opacity-50"
              >
                {uploading ? 'Uploading...' : 'Replace Document'}
              </button>
            </div>
          )}
        </div>
      ) : (
        canEdit && (
          <div>
            <input ref={fileRef} type="file" accept=".pdf,image/*" className="hidden" onChange={handleUpload} />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="px-3 py-1.5 rounded border border-amber-300 text-amber-700 text-sm font-medium hover:bg-amber-50 disabled:opacity-50"
            >
              {uploading ? 'Uploading...' : 'Upload Document'}
            </button>
          </div>
        )
      )}
    </div>
  );
}

// Helper function to get or create "Personal Documents" folder
async function getOrCreatePersonalDocumentsFolder(userId: string): Promise<string> {
  try {
    // Get all folders
    const folders: any[] = await api('GET', `/auth/users/${encodeURIComponent(userId)}/folders`);
    // Find "Personal Documents" folder
    const personalFolder = folders.find((f: any) => f.name === 'Personal Documents');
    if (personalFolder) {
      return personalFolder.id;
    }
    // Create if doesn't exist
    const newFolder: any = await api('POST', `/auth/users/${encodeURIComponent(userId)}/folders`, {
      name: 'Personal Documents'
    });
    return newFolder.id;
  } catch (e: any) {
    console.error('Failed to get or create Personal Documents folder:', e);
    throw e;
  }
}

// Immigration Status Document Upload Section (optional)
function ImmigrationStatusDocumentSection({ userId, canEdit, isRequired }: { userId: string; canEdit: boolean; isRequired?: boolean }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const queryClient = useQueryClient();
  const { data: permitFile, refetch } = useQuery({
    queryKey: ['permit-file', userId],
    queryFn: () => api<any>('GET', `/auth/users/${encodeURIComponent(userId)}/profile`),
  });
  const permitFileId = permitFile?.profile?.permit_file_id;

  const handleUpload = async () => {
    const f = fileRef.current?.files?.[0];
    if (!f) return;
    
    // Validate file type
    const isPDF = f.type === 'application/pdf';
    const isImage = f.type.startsWith('image/');
    if (!isPDF && !isImage) {
      toast.error('Please upload a PDF or image file');
      return;
    }

    setUploading(true);
    try {
      const up: any = await api('POST', '/files/upload', {
        project_id: null,
        client_id: null,
        employee_id: userId,
        category_id: 'permit',
        original_name: f.name,
        content_type: f.type || 'application/pdf'
      });
      const put = await fetch(up.upload_url, {
        method: 'PUT',
        headers: { 'Content-Type': f.type || 'application/pdf', 'x-ms-blob-type': 'BlockBlob' },
        body: f
      });
      if (!put.ok) throw new Error('upload failed');
      const conf: any = await api('POST', '/files/confirm', {
        key: up.key,
        size_bytes: f.size,
        checksum_sha256: 'na',
        content_type: f.type || 'application/pdf'
      });
      // Save to profile
      await api('PUT', `/auth/users/${encodeURIComponent(userId)}/profile`, {
        permit_file_id: conf.id
      });
      // Also add to Personal Documents folder
      try {
        const personalFolderId = await getOrCreatePersonalDocumentsFolder(userId);
        await api('POST', `/auth/users/${encodeURIComponent(userId)}/documents`, {
          folder_id: personalFolderId,
          title: `Immigration Status Document - ${f.name}`,
          file_id: conf.id
        });
      } catch (e: any) {
        console.error('Failed to add document to Personal Documents folder:', e);
        // Don't fail the whole upload if folder creation fails
      }
      toast.success('Immigration Status Document uploaded successfully');
      await refetch();
      await queryClient.invalidateQueries({ queryKey: ['userProfile', userId] });
      await queryClient.invalidateQueries({ queryKey: ['user-docs', userId] });
      await queryClient.invalidateQueries({ queryKey: ['user-folders', userId] });
    } catch (e: any) {
      toast.error(e?.message || 'Failed to upload Immigration Status Document');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div className="rounded-xl border bg-white p-4">
      <div className="mb-4 flex items-center gap-2">
        <div className="w-8 h-8 rounded bg-amber-100 flex items-center justify-center">
          <svg className="w-5 h-5 text-amber-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 104 0m-5 8a2 2 0 100-4 2 2 0 000 4zm0 0c1.306 0 2.417.835 2.83 2M9 14a3.001 3.001 0 00-2.83 2M15 11h3m-3 4h2" />
          </svg>
        </div>
        <h5 className="font-semibold text-amber-900">Immigration Status Document {isRequired && <span className="text-red-600">*</span>}</h5>
      </div>
      {permitFileId ? (
        <div className="space-y-3">
          <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
            <div className="flex-1">
              <div className="text-sm font-medium text-gray-900">Immigration Status Document</div>
              <div className="text-xs text-gray-500">Document uploaded</div>
            </div>
            <a
              href={withFileAccessToken(`/files/${permitFileId}/download`)}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
            >
              View
            </a>
            {canEdit && (
              <button
                type="button"
                onClick={async () => {
                  try {
                    await api('PUT', `/auth/users/${encodeURIComponent(userId)}/profile`, { permit_file_id: null });
                    toast.success('Immigration Status Document removed');
                    await refetch();
                    await queryClient.invalidateQueries({ queryKey: ['userProfile', userId] });
                  } catch (e: any) {
                    toast.error(e?.message || 'Failed to remove Immigration Status Document');
                  }
                }}
                className="rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-700 shadow-sm hover:bg-red-50"
              >
                Remove
              </button>
            )}
          </div>
          {canEdit && (
            <div>
              <input ref={fileRef} type="file" accept=".pdf,image/*" className="hidden" onChange={handleUpload} />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="rounded-lg bg-brand-red px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-red-800 disabled:opacity-50"
              >
                {uploading ? 'Uploading...' : 'Replace Document'}
              </button>
            </div>
          )}
        </div>
      ) : (
        <div>
          {canEdit ? (
            <>
              <input ref={fileRef} type="file" accept=".pdf,image/*" className="hidden" onChange={handleUpload} />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="rounded-lg bg-brand-red px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-red-800 disabled:opacity-50"
              >
                {uploading ? 'Uploading...' : 'Upload Document'}
              </button>
              {isRequired && !permitFileId && (
                <div className="mt-2 text-sm text-red-600">Immigration Status Document is required</div>
              )}
            </>
          ) : (
            <div className="text-sm text-gray-600">No permit document uploaded</div>
          )}
        </div>
      )}
    </div>
  );
}

function VisaInformationSection({ userId, canEdit, isRequired = false, showInlineForm = false }:{ userId:string, canEdit:boolean, isRequired?: boolean, showInlineForm?: boolean }){
  const { data, refetch } = useQuery({ 
    queryKey:['employee-visas', userId], 
    queryFn: ()=> api<any[]>('GET', `/auth/users/${encodeURIComponent(userId)}/visas`) 
  });
  const [editId, setEditId] = useState<string|null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [visaType, setVisaType] = useState('');
  const [visaNumber, setVisaNumber] = useState('');
  const [issuingCountry, setIssuingCountry] = useState('');
  const [issuedDate, setIssuedDate] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [status, setStatus] = useState('Active');
  const [notes, setNotes] = useState('');
  const [eVisaType, setEVisaType] = useState('');
  const [eVisaNumber, setEVisaNumber] = useState('');
  const [eIssuingCountry, setEIssuingCountry] = useState('');
  const [eIssuedDate, setEIssuedDate] = useState('');
  const [eExpiryDate, setEExpiryDate] = useState('');
  const [eStatus, setEStatus] = useState('Active');
  const [eNotes, setENotes] = useState('');
  
  const getStatusColor = (status: string | null) => {
    if (!status) return 'bg-gray-100 text-gray-800';
    const s = status.toLowerCase();
    if (s.includes('current') || s.includes('active')) return 'bg-green-100 text-green-800';
    if (s.includes('expired')) return 'bg-red-100 text-red-800';
    if (s.includes('pending')) return 'bg-yellow-100 text-yellow-800';
    return 'bg-gray-100 text-gray-800';
  };
  
  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '—';
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
    } catch {
      return dateStr;
    }
  };
  
  const getDateForInput = (dateStr: string | null) => {
    if (!dateStr) return '';
    try {
      const date = new Date(dateStr);
      return date.toISOString().split('T')[0];
    } catch {
      return '';
    }
  };
  
  const beginEdit = (v:any)=>{
    setEditId(v.id);
    setEVisaType(v.visa_type||'');
    setEVisaNumber(v.visa_number||'');
    setEIssuingCountry(v.issuing_country||'');
    setEIssuedDate(getDateForInput(v.issued_date));
    setEExpiryDate(getDateForInput(v.expiry_date));
    setEStatus(v.status||'Active');
    setENotes(v.notes||'');
  };
  
  const cancelEdit = ()=>{
    setEditId(null);
  };
  
  const handleCreate = async () => {
    if (!visaType.trim()) {
      toast.error('Visa type is required');
      return;
    }
    try {
      await api('POST', `/auth/users/${encodeURIComponent(userId)}/visas`, {
        visa_type: visaType,
        visa_number: visaNumber,
        issuing_country: issuingCountry,
        issued_date: issuedDate || null,
        expiry_date: expiryDate || null,
        status: status,
        notes: notes
      });
      toast.success('Visa entry created');
      setVisaType('');
      setVisaNumber('');
      setIssuingCountry('');
      setIssuedDate('');
      setExpiryDate('');
      setStatus('Active');
      setNotes('');
      setCreateOpen(false);
      await refetch();
    } catch (error: any) {
      toast.error(error?.message || 'Failed to create visa entry');
    }
  };
  
  const handleUpdate = async (visaId: string) => {
    if (!eVisaType.trim()) {
      toast.error('Visa type is required');
      return;
    }
    try {
      await api('PATCH', `/auth/users/${encodeURIComponent(userId)}/visas/${visaId}`, {
        visa_type: eVisaType,
        visa_number: eVisaNumber,
        issuing_country: eIssuingCountry,
        issued_date: eIssuedDate || null,
        expiry_date: eExpiryDate || null,
        status: eStatus,
        notes: eNotes
      });
      toast.success('Visa entry updated');
      setEditId(null);
      refetch();
    } catch (error: any) {
      toast.error(error?.message || 'Failed to update visa entry');
    }
  };
  
  const handleDelete = async (visaId: string) => {
    if (!confirm('Delete this visa entry?')) return;
    try {
      await api('DELETE', `/auth/users/${encodeURIComponent(userId)}/visas/${visaId}`);
      toast.success('Visa entry deleted');
      refetch();
    } catch (error: any) {
      toast.error(error?.message || 'Failed to delete visa entry');
    }
  };
  
  // Determine status based on expiry date
  const getEffectiveStatus = (v: any) => {
    if (v.status) return v.status;
    if (v.expiry_date) {
      const expiry = new Date(v.expiry_date);
      const now = new Date();
      return expiry < now ? 'EXPIRED' : 'CURRENT';
    }
    return 'CURRENT';
  };
  
  return (
    <div className="rounded-xl border bg-white p-4">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded bg-amber-100 flex items-center justify-center">
            <svg className="w-5 h-5 text-amber-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 104 0m-5 8a2 2 0 100-4 2 2 0 000 4zm0 0c1.306 0 2.417.835 2.83 2M9 14a3.001 3.001 0 00-2.83 2M15 11h3m-3 4h2" />
            </svg>
          </div>
          <h5 className="font-semibold text-amber-900">Visa Information {isRequired && <span className="text-red-600">*</span>}</h5>
        </div>
        {canEdit && !showInlineForm && data && data.length > 0 ? (
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="rounded-lg bg-brand-red px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-red-800"
          >
            Add Entry
          </button>
        ) : null}
      </div>
      
      {data && data.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="pb-2 font-medium text-gray-600">Date</th>
                <th className="pb-2 font-medium text-gray-600">Visa</th>
                <th className="pb-2 font-medium text-gray-600">Issuing Country</th>
                <th className="pb-2 font-medium text-gray-600">Issued</th>
                <th className="pb-2 font-medium text-gray-600">Expiration</th>
                <th className="pb-2 font-medium text-gray-600">Status</th>
                <th className="pb-2 font-medium text-gray-600">Note</th>
                {canEdit && <th className="pb-2 font-medium text-gray-600">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {data.map((v: any) => {
                const effectiveStatus = getEffectiveStatus(v);
                const isEditing = editId === v.id;
                return isEditing ? (
                  <tr key={v.id} className="border-b">
                    <td colSpan={canEdit ? 8 : 7} className="py-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs text-gray-600">Visa Type *</label>
                          <input 
                            className="border rounded px-2 py-1 w-full text-sm" 
                            value={eVisaType} 
                            onChange={e => setEVisaType(e.target.value)} 
                          />
                        </div>
                        <div>
                          <label className="text-xs text-gray-600">Visa Number</label>
                          <input 
                            className="border rounded px-2 py-1 w-full text-sm" 
                            value={eVisaNumber} 
                            onChange={e => setEVisaNumber(e.target.value)} 
                          />
                        </div>
                        <div>
                          <label className="text-xs text-gray-600">Issuing Country</label>
                          <input 
                            className="border rounded px-2 py-1 w-full text-sm" 
                            value={eIssuingCountry} 
                            onChange={e => setEIssuingCountry(e.target.value)} 
                          />
                        </div>
                        <div>
                          <label className="text-xs text-gray-600">Status</label>
                          <select 
                            className="border rounded px-2 py-1 w-full text-sm" 
                            value={eStatus} 
                            onChange={e => setEStatus(e.target.value)}
                          >
                            <option value="CURRENT">CURRENT</option>
                            <option value="EXPIRED">EXPIRED</option>
                            <option value="PENDING">PENDING</option>
                            <option value="Active">Active</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-xs text-gray-600">Issued Date</label>
                          <input 
                            type="date"
                            className="border rounded px-2 py-1 w-full text-sm" 
                            value={eIssuedDate} 
                            onChange={e => setEIssuedDate(e.target.value)} 
                          />
                        </div>
                        <div>
                          <label className="text-xs text-gray-600">Expiry Date</label>
                          <input 
                            type="date"
                            className="border rounded px-2 py-1 w-full text-sm" 
                            value={eExpiryDate} 
                            onChange={e => setEExpiryDate(e.target.value)} 
                          />
                        </div>
                        <div className="col-span-2">
                          <label className="text-xs text-gray-600">Notes</label>
                          <input 
                            className="border rounded px-2 py-1 w-full text-sm" 
                            value={eNotes} 
                            onChange={e => setENotes(e.target.value)} 
                          />
                        </div>
                        <div className="col-span-2 text-right space-x-2">
                          <button onClick={cancelEdit} className="px-2 py-1 rounded bg-gray-100 text-xs">Cancel</button>
                          <button onClick={() => handleUpdate(v.id)} className="px-2 py-1 rounded bg-brand-red text-white text-xs">Save</button>
                        </div>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr key={v.id} className="border-b hover:bg-gray-50">
                    <td className="py-2">{formatDate(v.issued_date)}</td>
                    <td className="py-2 font-medium">{v.visa_type || '—'}</td>
                    <td className="py-2">{v.issuing_country || '—'}</td>
                    <td className="py-2">{formatDate(v.issued_date)}</td>
                    <td className="py-2">{formatDate(v.expiry_date)}</td>
                    <td className="py-2">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${getStatusColor(effectiveStatus)}`}>
                        {effectiveStatus}
                      </span>
                    </td>
                    <td className="py-2 text-gray-600">{v.notes || '—'}</td>
                    {canEdit && (
                      <td className="py-2">
                        <div className="flex items-center gap-2">
                          <button onClick={() => beginEdit(v)} className="px-2 py-1 rounded bg-gray-100 text-xs">Edit</button>
                          <button onClick={() => handleDelete(v.id)} className="px-2 py-1 rounded bg-gray-100 text-xs text-red-600">Delete</button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="py-8">
          {canEdit ? (
            <div className="flex flex-col items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => setCreateOpen(true)}
                className="rounded-lg bg-brand-red px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-red-800"
              >
                Add Entry
              </button>
              {isRequired ? <p className="text-sm text-red-600">Visa information is required</p> : null}
            </div>
          ) : (
            <p className="text-center text-sm text-gray-500">—</p>
          )}
        </div>
      )}
      
      <AppFormModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Add Visa Entry"
        formWidth="comfortable"
        footer={
          <div className={uiCx(uiLayout.actionsRow, 'w-full justify-end')}>
            <AppButton type="button" variant="secondary" size="sm" onClick={() => setCreateOpen(false)}>
              Cancel
            </AppButton>
            <AppButton type="button" size="sm" onClick={handleCreate}>
              Create
            </AppButton>
          </div>
        }
      >
        <div className="grid grid-cols-2 gap-3">
          <AppInput
            className="col-span-2"
            label="Visa Type *"
            value={visaType}
            onChange={(e) => setVisaType(e.target.value)}
            placeholder="e.g., Work Permit"
          />
          <AppInput label="Visa Number" value={visaNumber} onChange={(e) => setVisaNumber(e.target.value)} />
          <AppInput
            label="Issuing Country"
            value={issuingCountry}
            onChange={(e) => setIssuingCountry(e.target.value)}
          />
          <AppDatePicker label="Issued Date" value={issuedDate} onChange={(e) => setIssuedDate(e.target.value)} />
          <AppDatePicker label="Expiry Date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} />
          <AppSelect
            label="Status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            options={[
              { value: 'CURRENT', label: 'CURRENT' },
              { value: 'EXPIRED', label: 'EXPIRED' },
              { value: 'PENDING', label: 'PENDING' },
              { value: 'Active', label: 'Active' },
            ]}
          />
          <AppInput
            className="col-span-2"
            label="Notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g., LMIA #9164748, Roofer"
          />
        </div>
      </AppFormModal>
    </div>
  );
}

function UserDocuments({ userId, canEdit }:{ userId:string, canEdit:boolean }){
  const confirm = useConfirm();
  const { data:folders, refetch: refetchFolders } = useQuery({ queryKey:['user-folders', userId], queryFn: ()=> api<any[]>('GET', `/auth/users/${encodeURIComponent(userId)}/folders`) });
  const [activeFolderId, setActiveFolderId] = useState<string>('all');
  const { data: allDocsRaw, refetch, isLoading: docsLoading, isError: docsError } = useQuery({
    queryKey:['user-docs', userId],
    queryFn: async ()=>{
      const res = await api<any>('GET', `/auth/users/${encodeURIComponent(userId)}/documents`);
      return res;
    },
  });
  const allDocs = useMemo(()=> {
    if (Array.isArray(allDocsRaw)) return allDocsRaw;
    if (allDocsRaw && typeof allDocsRaw === 'object' && Array.isArray((allDocsRaw as any).data)) return (allDocsRaw as any).data;
    return [];
  }, [allDocsRaw]);
  const [showUpload, setShowUpload] = useState(false);
  const [fileObj, setFileObj] = useState<File|null>(null);
  const [title, setTitle] = useState<string>('');
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderParentId, setNewFolderParentId] = useState<string| null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [draggedFileId, setDraggedFileId] = useState<string|null>(null);
  const [renameFolder, setRenameFolder] = useState<{id:string, name:string}|null>(null);
  const [moveDoc, setMoveDoc] = useState<{id:string}|null>(null);
  const [renameDoc, setRenameDoc] = useState<{id:string, title:string}|null>(null);
  const [fileSearchQuery, setFileSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'uploaded_at'|'name'|'type'>('uploaded_at');
  const [sortOrder, setSortOrder] = useState<'asc'|'desc'>('desc');
  const [previewImage, setPreviewImage] = useState<{ url: string; name: string } | null>(null);
  const [previewPdf, setPreviewPdf] = useState<{ url: string; name: string } | null>(null);
  const [previewExcel, setPreviewExcel] = useState<{ url: string; name: string } | null>(null);
  const [uploadTargetFolderId, setUploadTargetFolderId] = useState<string>('');
  const defaultFoldersCreatedRef = useRef(false);

  useEffect(() => {
    if (!canEdit || !folders || folders.length > 0 || defaultFoldersCreatedRef.current) return;
    defaultFoldersCreatedRef.current = true;
    const names = ['HR Documents', 'Contracts', 'Training', 'Training certificates', 'Other'];
    (async () => {
      for (const name of names) {
        try { await api('POST', `/auth/users/${encodeURIComponent(userId)}/folders`, { name }); } catch (_) { /* ignore */ }
      }
      refetchFolders();
    })();
  }, [userId, canEdit, folders, refetchFolders]);

  const closeNewFolderModal = () => {
    setShowNewFolder(false);
    setNewFolderName('');
    setNewFolderParentId(null);
  };

  useEffect(() => {
    if (!showNewFolder) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeNewFolderModal(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showNewFolder]);

  useEffect(() => {
    if (!showNewFolder) return;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, [showNewFolder]);

  const fileExt = (name?:string)=>{
    const n = String(name||'').toLowerCase();
    const m = n.match(/\.([a-z0-9]+)$/); return m? m[1] : '';
  };
  const extStyle = (ext:string)=>{
    const e = ext.toLowerCase();
    if(e==='pdf') return { bg:'bg-[#e74c3c]', txt:'text-white' };
    if(['xls','xlsx','csv'].includes(e)) return { bg:'bg-[#27ae60]', txt:'text-white' };
    if(['doc','docx','odt','rtf'].includes(e)) return { bg:'bg-[#2980b9]', txt:'text-white' };
    if(['ppt','pptx','key'].includes(e)) return { bg:'bg-[#d35400]', txt:'text-white' };
    if(['png','jpg','jpeg','webp','gif','bmp','svg','heic','heif'].includes(e)) return { bg:'bg-[#8e44ad]', txt:'text-white' };
    if(['zip','rar','7z','tar','gz'].includes(e)) return { bg:'bg-[#34495e]', txt:'text-white' };
    if(['txt','md','json','xml','yaml','yml'].includes(e)) return { bg:'bg-[#16a085]', txt:'text-white' };
    return { bg:'bg-gray-300', txt:'text-gray-800' };
  };

  const upload = async()=>{
    try{
      if(!fileObj){ toast.error('Select a file'); return; }
      const name = fileObj.name; const type = fileObj.type || 'application/octet-stream';
      const up = await api('POST','/files/upload',{ original_name: name, content_type: type, employee_id: userId, project_id: null, client_id: null, category_id: userId });
      await fetch(up.upload_url, { method:'PUT', headers:{ 'Content-Type': type, 'x-ms-blob-type':'BlockBlob' }, body: fileObj });
      const conf = await api('POST','/files/confirm',{ key: up.key, size_bytes: fileObj.size, checksum_sha256: 'na', content_type: type });
      const payload: any = { title: title || name, file_id: conf.id };
      if(uploadTargetFolderId) payload.folder_id = uploadTargetFolderId;
      await api('POST', `/auth/users/${encodeURIComponent(userId)}/documents`, payload);
      toast.success('Uploaded'); setShowUpload(false); setFileObj(null); setTitle(''); setUploadTargetFolderId(''); await refetch();
    }catch(_e){ toast.error('Upload failed'); }
  };

  const uploadToFolder = async(folderId:string, file: File)=>{
    try{
      const name = file.name; const type = file.type || 'application/octet-stream';
      const up = await api('POST','/files/upload',{ original_name: name, content_type: type, employee_id: userId, project_id: null, client_id: null, category_id: userId });
      await fetch(up.upload_url, { method:'PUT', headers:{ 'Content-Type': type, 'x-ms-blob-type':'BlockBlob' }, body: file });
      const conf = await api('POST','/files/confirm',{ key: up.key, size_bytes: file.size, checksum_sha256: 'na', content_type: type });
      await api('POST', `/auth/users/${encodeURIComponent(userId)}/documents`, { folder_id: folderId, title: name, file_id: conf.id });
    }catch(_e){ /* noop per-file */ }
  };

  const del = async(id:string, title?:string)=>{
    const choice = await confirm({ title:'Delete file', message:`Are you sure you want to delete "${title||'file'}"?` });
    if (choice !== 'confirm') return;
    try{ await api('DELETE', `/auth/users/${encodeURIComponent(userId)}/documents/${encodeURIComponent(id)}`); await refetch(); }
    catch(_e){ toast.error('Delete failed'); }
  };
  const createFolder = async()=>{
    try{
      const name = newFolderName.trim(); if(!name){ toast.error('Folder name required'); return; }
      const body:any = { name };
      if(newFolderParentId) body.parent_id = newFolderParentId;
      await api('POST', `/auth/users/${encodeURIComponent(userId)}/folders`, body);
      toast.success('Folder created'); closeNewFolderModal(); await refetchFolders();
    }catch(_e){ toast.error('Failed to create folder'); }
  };

  const doRenameFolder = async()=>{
    try{
      if(!renameFolder) return; const nm = (renameFolder.name||'').trim(); if(!nm){ toast.error('Folder name required'); return; }
      await api('PUT', `/auth/users/${encodeURIComponent(userId)}/folders/${encodeURIComponent(renameFolder.id)}`, { name: nm });
      toast.success('Renamed'); setRenameFolder(null); await refetchFolders();
    }catch(_e){ toast.error('Failed to rename'); }
  };

  const removeFolder = async(id:string)=>{
    try{ await api('DELETE', `/auth/users/${encodeURIComponent(userId)}/folders/${encodeURIComponent(id)}`); toast.success('Folder deleted'); if(activeFolderId===id) setActiveFolderId('all'); await refetchFolders(); }
    catch(e:any){ toast.error(e?.detail||'Cannot delete folder'); }
  };

  const doMoveDoc = async()=>{
    try{
      if(!moveDoc) return;
      const target = (document.getElementById('move-target') as HTMLSelectElement)?.value || '';
      if(!target){ toast.error('Select destination folder'); return; }
      await api('PUT', `/auth/users/${encodeURIComponent(userId)}/documents/${encodeURIComponent(moveDoc.id)}`, { folder_id: target });
      setMoveDoc(null); await refetch();
    }catch(_e){ toast.error('Failed to move'); }
  };

  const doRenameDoc = async()=>{
    try{
      if(!renameDoc) return; const t = (renameDoc.title||'').trim(); if(!t){ toast.error('Title required'); return; }
      await api('PUT', `/auth/users/${encodeURIComponent(userId)}/documents/${encodeURIComponent(renameDoc.id)}`, { title: t });
      toast.success('Renamed'); setRenameDoc(null); await refetch();
    }catch(_e){ toast.error('Failed to rename'); }
  };

  const docs = allDocs;
  const currentDocs = useMemo(()=>
    activeFolderId==='all' ? docs : docs.filter((d:any)=> d.folder_id === activeFolderId),
  [docs, activeFolderId]);
  const topFolders = useMemo(()=> (folders||[]).filter((f:any)=> !f.parent_id), [folders]);
  const folderDocCount = useCallback((folderId: string)=> docs.filter((d:any)=> d.folder_id === folderId).length, [docs]);
  const childFolders = useMemo(()=> (folders||[]).filter((f:any)=> f.parent_id===activeFolderId), [folders, activeFolderId]);
  const currentParentFolderId = useMemo(()=>{
    if(activeFolderId==='all') return null;
    const f = (folders||[]).find((x:any)=> x.id===activeFolderId);
    return f?.parent_id ?? null;
  }, [folders, activeFolderId]);
  const locationBreadcrumb = useMemo(()=>{
    if(activeFolderId==='all') return [] as { id: string|null; name: string }[];
    const map = new Map<string, any>(); (folders||[]).forEach((f:any)=> map.set(f.id, f));
    const path: { id: string|null; name: string }[] = [{ id: null, name: 'Root' }];
    let cur: any = map.get(activeFolderId);
    const chain: any[] = [];
    while(cur){ chain.unshift(cur); cur = cur.parent_id ? map.get(cur.parent_id) : null; }
    chain.forEach((f: any)=> path.push({ id: f.id, name: f.name }));
    return path;
  }, [folders, activeFolderId]);
  const getDocTypeLabel = (d: any): string => {
    const name = String(d?.title || '');
    const ext = (name.includes('.') ? name.split('.').pop() : '').toLowerCase();
    if(['pdf'].includes(ext)) return 'PDF';
    if(['xlsx','xls','csv'].includes(ext)) return 'Excel';
    if(['doc','docx'].includes(ext)) return 'Word';
    if(['ppt','pptx'].includes(ext)) return 'PowerPoint';
    return ext ? ext.toUpperCase() : 'File';
  };

  const getFileTypeForDoc = (d: any): 'image' | 'pdf' | 'excel' | 'other' => {
    const name = String(d?.title || '');
    const ext = (name.includes('.') ? name.split('.').pop() : '').toLowerCase() || '';
    if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'svg'].includes(ext)) return 'image';
    if (ext === 'pdf') return 'pdf';
    if (['xlsx', 'xls', 'csv'].includes(ext)) return 'excel';
    return 'other';
  };

  const fetchEmployeeDocDownloadUrl = async (fileId: string) => {
    try {
      const r: any = await api('GET', withFileAccessToken(`/files/${encodeURIComponent(fileId)}/download`));
      return String(r.download_url || '');
    } catch {
      toast.error('Download link unavailable');
      return '';
    }
  };

  const handleEmployeeDocPreview = async (d: any) => {
    const fileId = d.file_id;
    if (!fileId) return;
    const name = d.title || 'Document';
    try {
      const r: any = await api('GET', withFileAccessToken(`/files/${encodeURIComponent(fileId)}/preview`));
      const url = String(r.preview_url || r.download_url || '');
      if (!url) {
        toast.error('Preview not available');
        return;
      }
      const ft = getFileTypeForDoc(d);
      if (ft === 'image') setPreviewImage({ url, name });
      else if (ft === 'pdf') setPreviewPdf({ url, name });
      else if (ft === 'excel') setPreviewExcel({ url, name });
      else window.open(url, '_blank', 'noopener,noreferrer');
    } catch {
      toast.error('Preview not available');
    }
  };
  const handleSort = (col: 'uploaded_at'|'name'|'type')=>{
    if(sortBy===col) setSortOrder(o=> o==='asc' ? 'desc' : 'asc');
    else { setSortBy(col); setSortOrder('asc'); }
  };
  const currentFiles = useMemo(()=>{
    const q = fileSearchQuery.trim().toLowerCase();
    let list = q ? currentDocs.filter((d:any)=> (d.title||'').toLowerCase().includes(q)) : currentDocs;
    const sorted = [...list].sort((a:any,b:any)=>{
      let av: any, bv: any;
      if(sortBy==='uploaded_at'){ av = a.created_at||''; bv = b.created_at||''; }
      else if(sortBy==='name'){ av = (a.title||'').toLowerCase(); bv = (b.title||'').toLowerCase(); }
      else { av = getDocTypeLabel(a).toLowerCase(); bv = getDocTypeLabel(b).toLowerCase(); }
      if(av<bv) return sortOrder==='asc' ? -1 : 1;
      if(av>bv) return sortOrder==='asc' ? 1 : -1;
      return 0;
    });
    return sorted;
  }, [currentDocs, fileSearchQuery, sortBy, sortOrder]);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-white p-4">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded bg-blue-100 flex items-center justify-center">
            <svg className="w-5 h-5 text-blue-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
            </svg>
          </div>
          <h2 className="text-sm font-semibold text-gray-900">Files</h2>
        </div>
        <div className="rounded-xl border bg-white overflow-hidden">
          <div className="flex min-h-[400px]" style={{ height: 'calc(100vh - 380px)' }}>
            {/* Left Sidebar */}
            <div className="w-64 border-r bg-gray-50 flex flex-col flex-shrink-0">
              <div className="p-3 border-b">
                <div className="text-xs font-semibold text-gray-700">File Categories</div>
              </div>
              <div className="flex-1 overflow-y-auto">
                <button
                  type="button"
                  onClick={()=> setActiveFolderId('all')}
                  className={`w-full text-left px-3 py-2 border-b hover:bg-white transition-colors ${activeFolderId==='all' ? 'bg-white border-l-4 border-l-brand-red font-semibold' : 'text-gray-700'}`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xs">📁</span>
                    <span className="text-xs">All Files</span>
                    <span className="ml-auto text-[10px] text-gray-500">({docs.length})</span>
                  </div>
                </button>
                {topFolders.map((f: any)=> (
                  <button
                    key={f.id}
                    type="button"
                    onClick={()=> setActiveFolderId(f.id)}
                    className={`w-full text-left px-3 py-2 border-b hover:bg-white transition-colors ${activeFolderId===f.id ? 'bg-white border-l-4 border-l-brand-red font-semibold' : 'text-gray-700'}`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-xs">📁</span>
                      <span className="text-xs truncate">{f.name}</span>
                      <span className="ml-auto text-[10px] text-gray-500">({folderDocCount(f.id)})</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
            {/* Right content */}
            <div
              className={`flex-1 overflow-y-auto p-4 ${isDragging && canEdit ? 'bg-blue-50 border-2 border-dashed border-blue-400' : ''}`}
              onDragOver={canEdit ? (e)=>{ e.preventDefault(); e.stopPropagation(); setIsDragging(true); } : undefined}
              onDragLeave={canEdit ? (e)=>{ e.preventDefault(); setIsDragging(false); } : undefined}
              onDrop={canEdit ? async (e)=>{
                e.preventDefault(); setIsDragging(false);
                if(e.dataTransfer.files?.length){
                  if(activeFolderId==='all'){
                    for(const file of Array.from(e.dataTransfer.files)){
                      const name = file.name; const type = file.type || 'application/octet-stream';
                      const up = await api('POST','/files/upload',{ original_name: name, content_type: type, employee_id: userId, project_id: null, client_id: null, category_id: userId });
                      await fetch(up.upload_url, { method:'PUT', headers:{ 'Content-Type': type, 'x-ms-blob-type':'BlockBlob' }, body: file });
                      const conf = await api('POST','/files/confirm',{ key: up.key, size_bytes: file.size, checksum_sha256: 'na', content_type: type });
                      await api('POST', `/auth/users/${encodeURIComponent(userId)}/documents`, { title: name, file_id: conf.id });
                    }
                  } else {
                    for(const file of Array.from(e.dataTransfer.files)) await uploadToFolder(activeFolderId, file as File);
                  }
                  toast.success('Uploaded'); await refetch();
                }
                if(draggedFileId && activeFolderId!=='all'){
                  try{ await api('PUT', `/auth/users/${encodeURIComponent(userId)}/documents/${encodeURIComponent(draggedFileId)}`, { folder_id: activeFolderId }); toast.success('Moved'); await refetch(); } catch(_){ toast.error('Failed to move'); }
                  setDraggedFileId(null);
                }
              } : undefined}
            >
              <div className="mb-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="relative flex-1 max-w-sm">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                    </span>
                    <input
                      type="text"
                      value={fileSearchQuery}
                      onChange={e=> setFileSearchQuery(e.target.value)}
                      placeholder="Search by file name..."
                      className="w-full pl-8 pr-3 py-1.5 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-red focus:border-brand-red"
                    />
                  </div>
                  <div className="text-xs font-semibold text-gray-700 whitespace-nowrap">
                    {activeFolderId==='all' ? 'All Files' : (folders||[]).find((x:any)=> x.id===activeFolderId)?.name || 'Files'}
                    <span className="ml-1 text-gray-500">({currentFiles.length})</span>
                  </div>
                </div>
                {canEdit && (
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button type="button" onClick={()=> { setNewFolderParentId(activeFolderId==='all' ? null : activeFolderId); setShowNewFolder(true); }} className="px-2 py-1.5 rounded border border-gray-300 bg-white text-gray-700 text-xs font-medium hover:bg-gray-50 flex items-center gap-1">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 13h6m-3-3v6m-10 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" /></svg>
                      Add folder
                    </button>
                    <button type="button" onClick={()=> { setShowUpload(true); setUploadTargetFolderId(activeFolderId==='all' ? '' : activeFolderId); }} className="px-2 py-1.5 rounded bg-brand-red text-white text-xs font-medium">+ Upload File</button>
                  </div>
                )}
              </div>
              {activeFolderId!=='all' && locationBreadcrumb.length>0 && (
                <div className="mb-3 flex flex-wrap items-center gap-1">
                  <span className="text-xs text-gray-500">Location:</span>
                  {locationBreadcrumb.map((item, idx)=> (
                    <span key={item.id ?? 'root'} className="inline-flex items-center gap-1">
                      {idx>0 && <span className="text-gray-400 text-xs">/</span>}
                      <button type="button" onClick={()=> setActiveFolderId(item.id === null ? 'all' : item.id)} className={`px-2 py-1 rounded text-xs font-medium truncate max-w-[140px] ${item.id===activeFolderId ? 'bg-brand-red text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>{item.name}</button>
                    </span>
                  ))}
                </div>
              )}
              {docsLoading && (
                <div className="rounded-lg border bg-white p-6 text-center text-sm text-gray-500">Loading documents…</div>
              )}
              {docsError && (
                <div className="rounded-lg border bg-white p-6 text-center">
                  <p className="text-sm text-gray-600 mb-2">Failed to load documents.</p>
                  <button type="button" onClick={()=> refetch()} className="px-3 py-1.5 rounded bg-brand-red text-white text-sm">Retry</button>
                </div>
              )}
              {!docsLoading && !docsError && (
              <div className="rounded-lg border overflow-hidden bg-white">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-700 w-12"></th>
                        <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-700 cursor-pointer hover:bg-gray-100 select-none" onClick={()=> handleSort('name')}>
                          <div className="flex items-center gap-1">Name {sortBy==='name' && <span className="text-xs">{sortOrder==='asc' ? '↑' : '↓'}</span>}</div>
                        </th>
                        <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-700 cursor-pointer hover:bg-gray-100 select-none" onClick={()=> handleSort('type')}>
                          <div className="flex items-center gap-1">Type {sortBy==='type' && <span className="text-xs">{sortOrder==='asc' ? '↑' : '↓'}</span>}</div>
                        </th>
                        <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-700 cursor-pointer hover:bg-gray-100 select-none" onClick={()=> handleSort('uploaded_at')}>
                          <div className="flex items-center gap-1">Upload Date {sortBy==='uploaded_at' && <span className="text-xs">{sortOrder==='asc' ? '↑' : '↓'}</span>}</div>
                        </th>
                        <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-700 w-24">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {activeFolderId!=='all' && (
                        <tr className="hover:bg-gray-50 cursor-pointer bg-gray-50/50" onClick={()=> setActiveFolderId(currentParentFolderId ?? 'all')}>
                          <td className="px-3 py-2"><div className="w-8 h-10 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" /></svg></div></td>
                          <td className="px-3 py-2"><div className="text-xs font-semibold text-gray-600">..</div></td>
                          <td className="px-3 py-2 text-xs text-gray-500">—</td>
                          <td className="px-3 py-2 text-xs text-gray-500">—</td>
                          <td className="px-3 py-2"></td>
                        </tr>
                      )}
                      {activeFolderId!=='all' && childFolders.map((f: any)=> (
                        <tr key={f.id} className="hover:bg-gray-50 cursor-pointer" onClick={()=> setActiveFolderId(f.id)}>
                          <td className="px-3 py-2"><div className="w-8 h-10 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg></div></td>
                          <td className="px-3 py-2"><div className="text-xs font-semibold truncate max-w-xs">{f.name}</div></td>
                          <td className="px-3 py-2 text-xs text-gray-600">Folder</td>
                          <td className="px-3 py-2 text-xs text-gray-500">—</td>
                          <td className="px-3 py-2" onClick={e=> e.stopPropagation()}>{canEdit && <button type="button" onClick={()=> removeFolder(f.id)} className="p-1 rounded hover:bg-red-50 text-red-600 text-xs" title="Delete folder">🗑️</button>}</td>
                        </tr>
                      ))}
                      {currentFiles.map((d: any)=>{
                        const ext = fileExt(d.title);
                        const s = extStyle(ext);
                        const name = d.title || 'Document';
                        return (
                          <tr
                            key={d.id}
                            draggable={canEdit}
                            onDragStart={()=> canEdit && setDraggedFileId(d.id)}
                            onDragEnd={()=> setDraggedFileId(null)}
                            className={`hover:bg-gray-50 ${canEdit ? 'cursor-move' : ''}`}
                          >
                            <td className="px-3 py-2">
                              <button
                                type="button"
                                className={`w-8 h-10 rounded-lg ${s.bg} ${s.txt} flex items-center justify-center text-[10px] font-extrabold select-none cursor-pointer border-0`}
                                onClick={() => handleEmployeeDocPreview(d)}
                              >
                                {ext?.toUpperCase() || 'FILE'}
                              </button>
                            </td>
                            <td className="px-3 py-2">
                              <button
                                type="button"
                                className="text-left w-full min-w-0"
                                onClick={() => handleEmployeeDocPreview(d)}
                              >
                                <div className="text-xs font-semibold truncate max-w-xs cursor-pointer hover:underline">{name}</div>
                              </button>
                            </td>
                            <td className="px-3 py-2 text-xs text-gray-600">{getDocTypeLabel(d)}</td>
                            <td className="px-3 py-2 text-xs text-gray-600">{d.created_at ? String(d.created_at).slice(0,10) : '—'}</td>
                            <td className="px-3 py-2">
                              <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
                                {d.file_id && (
                                  <button
                                    type="button"
                                    title="Download"
                                    className="p-1 rounded hover:bg-gray-100 text-xs"
                                    onClick={async () => {
                                      const url = await fetchEmployeeDocDownloadUrl(d.file_id);
                                      if (url) window.open(url, '_blank', 'noopener,noreferrer');
                                    }}
                                  >
                                    ⬇️
                                  </button>
                                )}
                                {canEdit && <>
                                  <button type="button" title="Rename" onClick={()=> setRenameDoc({ id: d.id, title: d.title||'' })} className="p-1 rounded hover:bg-gray-100 text-xs">✏️</button>
                                  <button type="button" title="Move" onClick={()=> setMoveDoc({ id: d.id })} className="p-1 rounded hover:bg-gray-100 text-xs">📁</button>
                                  <button type="button" title="Delete" onClick={()=> del(d.id, d.title)} className="p-1 rounded hover:bg-red-50 text-red-600 text-xs">🗑️</button>
                                </>}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {currentFiles.length===0 && (activeFolderId==='all' ? docs.length===0 : currentDocs.length===0) && (
                  <div className="p-4 text-sm text-gray-500 text-center">No documents</div>
                )}
              </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <AppFormModal
        open={showUpload}
        onClose={() => setShowUpload(false)}
        title="Add file"
        footer={
          <div className={uiCx(uiLayout.actionsRow, 'w-full justify-end')}>
            <AppButton type="button" variant="secondary" size="sm" onClick={() => setShowUpload(false)}>
              Cancel
            </AppButton>
            <AppButton type="button" size="sm" onClick={upload}>
              Upload
            </AppButton>
          </div>
        }
      >
        <div className={uiSpacing.sectionStack}>
          <AppSelect
            label="Folder"
            value={uploadTargetFolderId}
            onChange={(e) => setUploadTargetFolderId(e.target.value)}
            options={[
              { value: '', label: 'All Files (uncategorized)' },
              ...sortByLabel(folders || [], (f: any) => (f.name || '').toString()).map((f: any) => ({
                value: String(f.id),
                label: String(f.name),
              })),
            ]}
          />
          <AppInput
            label="Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Optional title"
          />
          <AppFileUpload label="File" onChange={(file) => setFileObj(file)} />
        </div>
      </AppFormModal>

      <AppFormModal
        open={showNewFolder}
        onClose={closeNewFolderModal}
        title={newFolderParentId ? 'New subfolder' : 'New folder'}
        description={newFolderParentId ? 'Create a folder inside the current one' : 'Create a new top-level folder'}
        footer={
          <div className={uiCx(uiLayout.actionsRow, 'w-full justify-end')}>
            <AppButton type="button" variant="secondary" size="sm" onClick={closeNewFolderModal}>
              Cancel
            </AppButton>
            <AppButton type="button" size="sm" disabled={!newFolderName.trim()} onClick={createFolder}>
              Create
            </AppButton>
          </div>
        }
      >
        <AppInput
          label="Folder name"
          value={newFolderName}
          onChange={(e) => setNewFolderName(e.target.value)}
          placeholder="e.g., Hiring pack"
          onKeyDown={(e) => {
            if (e.key === 'Enter') createFolder();
            if (e.key === 'Escape') closeNewFolderModal();
          }}
        />
      </AppFormModal>

      <AppFormModal
        open={!!renameFolder}
        onClose={() => setRenameFolder(null)}
        title="Rename folder"
        footer={
          <div className={uiCx(uiLayout.actionsRow, 'w-full justify-end')}>
            <AppButton type="button" variant="secondary" size="sm" onClick={() => setRenameFolder(null)}>
              Cancel
            </AppButton>
            <AppButton type="button" size="sm" onClick={doRenameFolder}>
              Save
            </AppButton>
          </div>
        }
      >
        {renameFolder ? (
          <AppInput
            label="Folder name"
            value={renameFolder.name}
            onChange={(e) => setRenameFolder({ id: renameFolder.id, name: e.target.value })}
          />
        ) : null}
      </AppFormModal>

      <AppFormModal
        open={!!moveDoc}
        onClose={() => setMoveDoc(null)}
        title="Move file"
        footer={
          <div className={uiCx(uiLayout.actionsRow, 'w-full justify-end')}>
            <AppButton type="button" variant="secondary" size="sm" onClick={() => setMoveDoc(null)}>
              Cancel
            </AppButton>
            <AppButton type="button" size="sm" onClick={doMoveDoc}>
              Move
            </AppButton>
          </div>
        }
      >
        <AppSelect
          label="Destination folder"
          placeholder="Select..."
          options={sortByLabel(folders || [], (f: any) => (f.name || '').toString()).map((f: any) => ({
            value: String(f.id),
            label: String(f.name),
          }))}
          onChange={(e) => {
            const sel = document.getElementById('move-target') as HTMLSelectElement | null;
            if (sel) sel.value = e.target.value;
          }}
        />
        <select id="move-target" className="sr-only" defaultValue="" tabIndex={-1} aria-hidden>
          <option value="" disabled>
            Select...
          </option>
          {sortByLabel(folders || [], (f: any) => (f.name || '').toString()).map((f: any) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
      </AppFormModal>

      <AppFormModal
        open={!!renameDoc}
        onClose={() => setRenameDoc(null)}
        title="Rename file"
        footer={
          <div className={uiCx(uiLayout.actionsRow, 'w-full justify-end')}>
            <AppButton type="button" variant="secondary" size="sm" onClick={() => setRenameDoc(null)}>
              Cancel
            </AppButton>
            <AppButton type="button" size="sm" onClick={doRenameDoc}>
              Save
            </AppButton>
          </div>
        }
      >
        {renameDoc ? (
          <AppInput
            label="Title"
            value={renameDoc.title}
            onChange={(e) => setRenameDoc({ id: renameDoc.id, title: e.target.value })}
          />
        ) : null}
      </AppFormModal>

      {previewImage && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={() => setPreviewImage(null)}>
          <div className="w-full h-full max-w-[95vw] max-h-[95vh] bg-white rounded-lg overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="p-3 border-b flex items-center justify-between flex-shrink-0">
              <h3 className="text-sm font-semibold truncate pr-2">{previewImage.name}</h3>
              <div className="flex items-center gap-2 flex-shrink-0">
                <a
                  href={previewImage.url}
                  download={previewImage.name}
                  className="text-xs px-2 py-1 rounded border hover:bg-gray-50"
                  title="Download"
                >
                  ⬇️
                </a>
                <a
                  href={previewImage.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs px-2 py-1 rounded border hover:bg-gray-50"
                  title="Open in new tab"
                >
                  🔗
                </a>
                <button
                  type="button"
                  onClick={() => setPreviewImage(null)}
                  className="text-lg font-bold text-gray-400 hover:text-gray-600 w-6 h-6"
                >
                  ×
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-3 min-h-0 flex items-center justify-center">
              <img src={previewImage.url} alt={previewImage.name} className="max-w-full max-h-full h-auto object-contain" />
            </div>
          </div>
        </div>
      )}

      {previewPdf && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={() => setPreviewPdf(null)}>
          <div className="w-full h-full max-w-[95vw] max-h-[95vh] bg-white rounded-lg overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="p-3 border-b flex items-center justify-between flex-shrink-0">
              <h3 className="text-sm font-semibold truncate pr-2">{previewPdf.name}</h3>
              <div className="flex items-center gap-2 flex-shrink-0">
                <a
                  href={previewPdf.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs px-2 py-1 rounded border hover:bg-gray-50"
                  title="Open in new tab"
                >
                  🔗
                </a>
                <button
                  type="button"
                  onClick={() => setPreviewPdf(null)}
                  className="text-lg font-bold text-gray-400 hover:text-gray-600 w-6 h-6"
                >
                  ×
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-hidden min-h-0">
              <iframe src={previewPdf.url} className="w-full h-full border-0" title={previewPdf.name} />
            </div>
          </div>
        </div>
      )}

      {previewExcel && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={() => setPreviewExcel(null)}>
          <div className="w-full h-full max-w-[95vw] max-h-[95vh] bg-white rounded-lg overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="p-3 border-b flex items-center justify-between flex-shrink-0">
              <h3 className="text-sm font-semibold truncate pr-2">{previewExcel.name}</h3>
              <div className="flex items-center gap-2 flex-shrink-0">
                <a
                  href={previewExcel.url}
                  download={previewExcel.name}
                  className="text-xs px-2 py-1 rounded border hover:bg-gray-50"
                  title="Download"
                >
                  ⬇️
                </a>
                <a
                  href={previewExcel.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs px-2 py-1 rounded border hover:bg-gray-50"
                  title="Open in new tab"
                >
                  🔗
                </a>
                <button
                  type="button"
                  onClick={() => setPreviewExcel(null)}
                  className="text-lg font-bold text-gray-400 hover:text-gray-600 w-6 h-6"
                >
                  ×
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-hidden min-h-0">
              <iframe
                src={`https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(previewExcel.url)}`}
                className="w-full h-full border-0"
                title={previewExcel.name}
                allow="fullscreen"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export { EmployeeTrainingSection };
