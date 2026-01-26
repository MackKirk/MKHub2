import { useEffect, useMemo, useRef, useState, useImperativeHandle, forwardRef, useCallback } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
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

// List of implemented permissions (permissions that are actually checked in the codebase)
const IMPLEMENTED_PERMISSIONS = new Set([
  // Legacy permissions
  "users:read", "users:write",
  "timesheet:read", "timesheet:write", "timesheet:approve", "timesheet:unrestricted_clock", // Legacy, mantido para compatibilidade
  "clients:read", "clients:write",
  "inventory:read", "inventory:write",
  "reviews:read", "reviews:admin",
  // Human Resources permissions
  "hr:access",
  "hr:users:read", "hr:users:write",
  "hr:users:view:general", "hr:users:view:job:compensation", "hr:users:edit:general",
  "hr:users:view:timesheet", "hr:users:edit:timesheet", "hr:users:view:permissions", "hr:users:edit:permissions",
  "hr:attendance:read", "hr:attendance:write",
  "hr:community:read", "hr:community:write",
  "hr:reviews:admin",
  "hr:timesheet:read", "hr:timesheet:write", "hr:timesheet:approve", "hr:timesheet:unrestricted_clock",
  // Settings permissions
  "settings:access",
  // Documents permissions
  "documents:access",
  "documents:read", "documents:write", "documents:delete", "documents:move",
  // Fleet & Equipment permissions
  "fleet:access",
  "fleet:vehicles:read", "fleet:vehicles:write",
  "fleet:equipment:read", "fleet:equipment:write",
  // Inventory permissions
  "inventory:access",
  "inventory:suppliers:read", "inventory:suppliers:write",
  "inventory:products:read", "inventory:products:write",
  // Business permissions
  "business:access",
  "business:customers:read", "business:customers:write",
  "business:projects:read", "business:projects:write",
  "business:projects:reports:read", "business:projects:reports:write",
  "business:projects:workload:read", "business:projects:workload:write",
  "business:projects:timesheet:read", "business:projects:timesheet:write",
  "business:projects:files:read", "business:projects:files:write",
  "business:projects:proposal:read", "business:projects:proposal:write",
  "business:projects:estimate:read", "business:projects:estimate:write",
  "business:projects:orders:read", "business:projects:orders:write",
  // Sales permissions
  "sales:access",
  "sales:quotations:read", "sales:quotations:write",
]);

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
    <button
      onClick={handleSync}
      disabled={syncing}
      className="px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-300 text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-colors"
      title="Sync user data from BambooHR"
    >
      {syncing ? (
        <>
          <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          Syncing...
        </>
      ) : (
        <>
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Sync from BambooHR
        </>
      )}
    </button>
  );
}

export type UserPermissionsRef = {
  hasUnsavedChanges: () => boolean;
  save: () => Promise<void>;
};

type ProjectFilesCategoriesMode = 'read' | 'write';

function ProjectFilesCategoriesModal({
  mode,
  open,
  value,
  onClose,
  onSave,
}: {
  mode: ProjectFilesCategoriesMode;
  open: boolean;
  value: string[] | null; // null => all categories allowed
  onClose: () => void;
  onSave: (next: string[] | null) => void;
}) {
  const { data: categories } = useQuery({
    queryKey: ['file-categories'],
    queryFn: () => api<any[]>('GET', '/clients/file-categories'),
    enabled: open,
  });

  const visibleCategories = useMemo(() => {
    return (categories || []).filter((c: any) => String(c?.id || '') !== 'photos');
  }, [categories]);

  const [allowAll, setAllowAll] = useState<boolean>(value === null);
  const [selected, setSelected] = useState<string[]>(Array.isArray(value) ? value : []);

  useEffect(() => {
    if (!open) return;
    setAllowAll(value === null);
    setSelected(Array.isArray(value) ? value : []);
  }, [open, value]);

  if (!open) return null;

  const title = mode === 'read' ? 'View Files Categories' : 'Edit Files Categories';

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="p-4 border-b flex items-center justify-between">
          <div className="font-semibold">{title}</div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded hover:bg-gray-100 grid place-items-center text-xl"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="p-4 overflow-y-auto flex-1 space-y-4">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={allowAll}
              onChange={() => setAllowAll((v) => !v)}
              className="mt-1 w-4 h-4 rounded border-gray-300 text-brand-red focus:ring-brand-red"
            />
            <div className="min-w-0">
              <div className="text-xs font-medium text-gray-900">Allow all categories</div>
              <div className="text-[10px] text-gray-500">If enabled, this user can access all file categories.</div>
            </div>
          </label>

          <div className={`${allowAll ? 'opacity-50 pointer-events-none' : ''}`}>
            <div className="text-xs font-semibold text-gray-600 mb-2 uppercase tracking-wide">Allowed categories</div>
            <div className="grid sm:grid-cols-2 gap-2">
              {visibleCategories.map((cat: any) => {
                const checked = selected.includes(cat.id);
                return (
                  <label key={cat.id} className="flex items-center gap-2 p-2 rounded border hover:bg-gray-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => {
                        setSelected((prev) => (checked ? prev.filter((x) => x !== cat.id) : [...prev, cat.id]));
                      }}
                      className="w-4 h-4 rounded border-gray-300 text-brand-red focus:ring-brand-red"
                    />
                    <span className="text-lg">{cat.icon || '📁'}</span>
                    <span className="text-sm">{cat.name}</span>
                  </label>
                );
              })}
            </div>
            {!allowAll && selected.length === 0 && (
              <div className="mt-2 text-xs text-red-600">Select at least 1 category or enable “Allow all categories”.</div>
            )}
          </div>
        </div>

        <div className="p-4 border-t bg-gray-50 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded border bg-white hover:bg-gray-50 text-gray-700 text-sm font-medium"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              if (!allowAll && selected.length === 0) return;
              onSave(allowAll ? null : selected);
              onClose();
            }}
            className="px-4 py-2 rounded bg-brand-red hover:bg-red-700 text-white text-sm font-medium"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

const UserPermissions = forwardRef<UserPermissionsRef, { userId: string; onDirtyChange?: (dirty: boolean) => void; canEdit?: boolean }>(({ userId, onDirtyChange, canEdit = true }, ref) => {
  const queryClient = useQueryClient();
  const { data:user, refetch: refetchUser } = useQuery({ queryKey:['user', userId], queryFn: ()=> api<any>('GET', `/users/${userId}`) });
  const { data:permissionsData, refetch } = useQuery({ 
    queryKey:['user-permissions', userId], 
    queryFn: ()=> api<any>('GET', `/permissions/users/${userId}`) 
  });
  const { data: currentUser } = useQuery({ queryKey: ['me'], queryFn: () => api<any>('GET', '/auth/me') });
  const [permissions, setPermissions] = useState<Record<string, boolean>>({});
  const [initialPermissions, setInitialPermissions] = useState<Record<string, boolean>>({});
  const [isAdminLocal, setIsAdminLocal] = useState<boolean>(false);
  const [initialIsAdmin, setInitialIsAdmin] = useState<boolean>(false);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  // Project > Files per-category config (null means "all categories")
  const [projectFilesReadCategories, setProjectFilesReadCategories] = useState<string[] | null>(null);
  const [projectFilesWriteCategories, setProjectFilesWriteCategories] = useState<string[] | null>(null);
  const [initialProjectFilesReadCategories, setInitialProjectFilesReadCategories] = useState<string[] | null>(null);
  const [initialProjectFilesWriteCategories, setInitialProjectFilesWriteCategories] = useState<string[] | null>(null);
  const [projectFilesCategoriesModalOpen, setProjectFilesCategoriesModalOpen] = useState(false);
  const [projectFilesCategoriesMode, setProjectFilesCategoriesMode] = useState<ProjectFilesCategoriesMode>('read');

  // Initialize permissions from API data
  useEffect(() => {
    if (permissionsData?.permissions_by_category) {
      const perms: Record<string, boolean> = {};
      permissionsData.permissions_by_category.forEach((cat: any) => {
        cat.permissions.forEach((perm: any) => {
          perms[perm.key] = perm.is_granted;
        });
      });
      setPermissions(perms);
      setInitialPermissions({ ...perms });
    }

    // Initialize configs from API data (null => allow all)
    const cfg = permissionsData?.configs || {};
    const readCfg = Array.isArray(cfg['business:projects:files:categories:read']) ? cfg['business:projects:files:categories:read'] : null;
    const writeCfg = Array.isArray(cfg['business:projects:files:categories:write']) ? cfg['business:projects:files:categories:write'] : null;
    setProjectFilesReadCategories(readCfg);
    setProjectFilesWriteCategories(writeCfg);
    setInitialProjectFilesReadCategories(readCfg);
    setInitialProjectFilesWriteCategories(writeCfg);
  }, [permissionsData]);

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
    
    const norm = (v: string[] | null) => {
      if (v === null) return null;
      return Array.from(new Set(v.map(String))).sort();
    };
    const aRead = norm(projectFilesReadCategories);
    const bRead = norm(initialProjectFilesReadCategories);
    const aWrite = norm(projectFilesWriteCategories);
    const bWrite = norm(initialProjectFilesWriteCategories);
    if (JSON.stringify(aRead) !== JSON.stringify(bRead)) return true;
    if (JSON.stringify(aWrite) !== JSON.stringify(bWrite)) return true;

    return false;
  }, [
    permissions,
    initialPermissions,
    isAdminLocal,
    initialIsAdmin,
    projectFilesReadCategories,
    initialProjectFilesReadCategories,
    projectFilesWriteCategories,
    initialProjectFilesWriteCategories,
  ]);

  const openProjectFilesCategoriesModal = (mode: ProjectFilesCategoriesMode) => {
    setProjectFilesCategoriesMode(mode);
    setProjectFilesCategoriesModalOpen(true);
  };

  // Notify parent of dirty state changes
  useEffect(() => {
    onDirtyChange?.(hasUnsavedChanges);
  }, [hasUnsavedChanges, onDirtyChange]);

  const handleToggle = (key: string) => {
    setPermissions((prev) => {
      const newPerms = { ...prev };
      const newValue = !prev[key];
      
      // Check dependencies for view permissions
      if (key === 'hr:users:view:general' || key === 'hr:users:view:timesheet' || key === 'hr:users:view:permissions') {
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
          const viewLabel = viewKey.includes(':reports:') ? 'View Reports' :
                           viewKey.includes(':workload:') ? 'View Workload' :
                           viewKey.includes(':timesheet:') ? 'View Timesheet' :
                           viewKey.includes(':files:') ? 'View Files' :
                           viewKey.includes(':proposal:') ? 'View Proposal' :
                           viewKey.includes(':estimate:') ? 'View Estimate' :
                           viewKey.includes(':orders:') ? 'View Orders' : 'corresponding View permission';
          toast.error(`This permission requires "${viewLabel}" to be enabled first`);
          return prev;
        }
      }
      
      newPerms[key] = newValue;
      
      // If disabling a view permission, also disable the corresponding edit permission
      if (!newValue) {
        if (key === 'hr:users:view:general') {
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
          newPerms['business:projects:proposal:read'] = false;
          newPerms['business:projects:estimate:read'] = false;
          newPerms['business:projects:orders:read'] = false;
        }
        // If disabling Edit Projects & Opportunities, disable all edit sub-permissions
        else if (key === 'business:projects:write') {
          newPerms['business:projects:reports:write'] = false;
          newPerms['business:projects:workload:write'] = false;
          newPerms['business:projects:timesheet:write'] = false;
          newPerms['business:projects:files:write'] = false;
          newPerms['business:projects:proposal:write'] = false;
          newPerms['business:projects:estimate:write'] = false;
          newPerms['business:projects:orders:write'] = false;
        }
        // If disabling a view sub-permission, also disable the corresponding edit permission
        else if (key.startsWith('business:projects:') && key.endsWith(':read') && key !== 'business:projects:read') {
          const editKey = key.replace(':read', ':write');
          newPerms[editKey] = false;
        }
      }
      
      return newPerms;
    });
  };
  
  // Helper function to check if a permission can be enabled (for both view and edit permissions)
  const canEnableEditPermission = (permKey: string, permissions: Record<string, boolean>): boolean => {
    // View permissions require hr:users:read
    if (permKey === 'hr:users:view:general' || permKey === 'hr:users:view:timesheet' || permKey === 'hr:users:view:permissions') {
      return !!permissions['hr:users:read'];
    }
    // Job compensation view requires hr:users:read and hr:users:view:general
    if (permKey === 'hr:users:view:job:compensation') {
      return !!(permissions['hr:users:read'] && permissions['hr:users:view:general']);
    }
    // Invite user requires hr:users:read
    if (permKey === 'hr:users:write') {
      return !!permissions['hr:users:read'];
    }
    // Edit Projects & Opportunities requires View Projects & Opportunities
    if (permKey === 'business:projects:write') {
      return !!permissions['business:projects:read'];
    }
    // Edit Customers requires View Customers
    if (permKey === 'business:customers:write') {
      return !!permissions['business:customers:read'];
    }
    // Edit Quotations requires View Quotations
    if (permKey === 'sales:quotations:write') {
      return !!permissions['sales:quotations:read'];
    }
    // Edit permissions require hr:users:read and the corresponding view permission
    if (permKey === 'hr:users:edit:general') {
      return !!(permissions['hr:users:read'] && permissions['hr:users:view:general']);
    } else if (permKey === 'hr:users:edit:timesheet') {
      return !!(permissions['hr:users:read'] && permissions['hr:users:view:timesheet']);
    } else if (permKey === 'hr:users:edit:permissions') {
      return !!(permissions['hr:users:read'] && permissions['hr:users:view:permissions']);
    }
    // Projects & Opportunities view sub-permissions require business:projects:read
    if (permKey.startsWith('business:projects:') && permKey.endsWith(':read') && permKey !== 'business:projects:read') {
      return !!permissions['business:projects:read'];
    }
    // Projects & Opportunities edit sub-permissions require only the corresponding view permission
    if (permKey.startsWith('business:projects:') && permKey.endsWith(':write') && permKey !== 'business:projects:write') {
      const viewKey = permKey.replace(':write', ':read');
      return !!permissions[viewKey];
    }
    return true; // Default: no restrictions
  };

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
      // Save permissions
      const payload: any = {
        ...permissions,
        // Config keys: null means "all categories" => send [] to clear override
        'business:projects:files:categories:read': projectFilesReadCategories ?? [],
        'business:projects:files:categories:write': projectFilesWriteCategories ?? [],
      };
      await api('PUT', `/permissions/users/${userId}`, payload);
      toast.success('Permissions saved');
      await refetch();
      
      // Update initial state to reflect saved state
      setInitialPermissions({ ...permissions });
      setInitialIsAdmin(isAdminLocal);
      setInitialProjectFilesReadCategories(projectFilesReadCategories);
      setInitialProjectFilesWriteCategories(projectFilesWriteCategories);
      
      // If editing own permissions, invalidate /auth/me cache to refresh permissions
      if (currentUser && currentUser.id === userId) {
        await queryClient.invalidateQueries({ queryKey: ['me'] });
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
    projectFilesReadCategories,
    projectFilesWriteCategories,
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
      <ProjectFilesCategoriesModal
        mode={projectFilesCategoriesMode}
        open={projectFilesCategoriesModalOpen}
        value={projectFilesCategoriesMode === 'read' ? projectFilesReadCategories : projectFilesWriteCategories}
        onClose={() => setProjectFilesCategoriesModalOpen(false)}
        onSave={(next) => {
          if (projectFilesCategoriesMode === 'read') setProjectFilesReadCategories(next);
          else setProjectFilesWriteCategories(next);
        }}
      />
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

        <div className="space-y-6">
          {(() => {
            // Process categories and reorganize them
            const processedCategories: any[] = [];
            let businessCategory: any = null;
            let inventoryCategory: any = null;
            
            permissionsData.permissions_by_category?.forEach((cat: any) => {
              if (cat.category.name === 'business') {
                // Split business into Services (projects) and Business (customers)
                const hasProjects = cat.permissions.some((p: any) => p.key.includes('business:projects'));
                const hasCustomers = cat.permissions.some((p: any) => p.key.includes('business:customers'));
                
                if (hasProjects) {
                  // Create Services category with only projects
                  processedCategories.push({
                    ...cat,
                    category: {
                      ...cat.category,
                      name: 'services',
                      label: 'Services',
                      id: 'services'
                    },
                    permissions: cat.permissions.filter((p: any) => p.key.includes('business:projects'))
                  });
                }
                
                if (hasCustomers) {
                  // Store customers for later (will be added to Business)
                  businessCategory = {
                    ...cat,
                    permissions: cat.permissions.filter((p: any) => p.key.includes('business:customers'))
                  };
                }
              } else if (cat.category.name === 'inventory') {
                // Store inventory for later (will be renamed to Business and combined with customers)
                inventoryCategory = cat;
              } else if (cat.category.name === 'sales') {
                // Sales category (if exists from backend)
                processedCategories.push(cat);
              } else {
                // Other categories as-is
                processedCategories.push(cat);
              }
            });
            
            // Create Business category combining customers + inventory
            // Insert it after Services (position 1) and before Sales
            if (businessCategory || inventoryCategory) {
              const combinedPermissions = [
                ...(businessCategory?.permissions || []),
                ...(inventoryCategory?.permissions || [])
              ];
              
              if (combinedPermissions.length > 0) {
                const businessCat = {
                  category: {
                    id: 'business',
                    name: 'business',
                    label: 'Business',
                    description: inventoryCategory?.category?.description || 'Permissions for Business area. Blocking access blocks all sub-permissions.'
                  },
                  permissions: combinedPermissions
                };
                // Insert Business after Services (index 1) if Services exists, otherwise at the beginning
                const servicesIndex = processedCategories.findIndex((c: any) => c.category.name === 'services');
                if (servicesIndex >= 0) {
                  processedCategories.splice(servicesIndex + 1, 0, businessCat);
                } else {
                  processedCategories.unshift(businessCat);
                }
              }
            }
            
            // Create Sales category if it doesn't exist
            const hasSales = processedCategories.some((c: any) => c.category.name === 'sales');
            if (!hasSales) {
              // Insert Sales after Business (position 2) if Business exists
              const businessIndex = processedCategories.findIndex((c: any) => c.category.name === 'business');
              const salesCat = {
                category: {
                  id: 'sales',
                  name: 'sales',
                  label: 'Sales',
                  description: 'Permissions for Sales area. Blocking access blocks all sub-permissions.'
                },
                permissions: []
              };
              if (businessIndex >= 0) {
                processedCategories.splice(businessIndex + 1, 0, salesCat);
              } else {
                processedCategories.push(salesCat);
              }
            }
            
            
            return processedCategories.map((cat: any) => {
              // Find area access permission (first permission, ends with :access)
              const areaAccessPerm = cat.permissions.find((p: any) => p.key.endsWith(':access'));
              const subPermissions = cat.permissions.filter((p: any) => !p.key.endsWith(':access'));
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
                    ) : cat.category.name === 'business' ? (
                      /* Special handling for Business category - Customers, Suppliers and Products */
                      <div className="space-y-4">
                        {/* Customers */}
                        {(() => {
                          const areaPerms = subPermissions.filter((p: any) => p.key.includes('business:customers'));
                          if (areaPerms.length > 0) {
                            const viewPerms = areaPerms.filter((p: any) => p.key.includes(':read'));
                            const editPerms = areaPerms.filter((p: any) => p.key.includes(':write'));
                            
                            return (
                              <div className="border rounded-lg p-2.5 bg-gray-50">
                                <div className="text-xs font-semibold text-gray-700 mb-2">Customers</div>
                                <div className="grid md:grid-cols-2 gap-2.5">
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
                                  {editPerms.length > 0 && (
                                    <div className="space-y-1.5">
                                      <div className="text-[10px] font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">Edit</div>
                                      {editPerms.map((perm: any) => {
                                        const canEnable = canEdit && canEnableEditPermission(perm.key, permissions);
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
                          }
                          return null;
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
                    ) : cat.category.name === 'services' ? (
                      /* Special handling for Services category - only Projects & Opportunities */
                      <div className="space-y-4">
                        {/* Projects & Opportunities */}
                        {(() => {
                          const allProjectsPerms = subPermissions.filter((p: any) => p.key.includes('business:projects'));
                          if (allProjectsPerms.length === 0) return null;
                          
                          // Main permissions (business:projects:read and business:projects:write)
                          const mainViewPerm = allProjectsPerms.find((p: any) => p.key === 'business:projects:read');
                          const mainEditPerm = allProjectsPerms.find((p: any) => p.key === 'business:projects:write');
                          
                          // Sub-permissions (reports, workload, timesheet, files, proposal, estimate, orders)
                          const subViewPerms = allProjectsPerms.filter((p: any) => 
                            p.key.includes(':read') && 
                            p.key !== 'business:projects:read' &&
                            (p.key.includes(':reports:') || p.key.includes(':workload:') || p.key.includes(':timesheet:') || 
                             p.key.includes(':files:') || p.key.includes(':proposal:') || p.key.includes(':estimate:') || p.key.includes(':orders:'))
                          );
                          const subEditPerms = allProjectsPerms.filter((p: any) => 
                            p.key.includes(':write') && 
                            p.key !== 'business:projects:write' &&
                            (p.key.includes(':reports:') || p.key.includes(':workload:') || p.key.includes(':timesheet:') || 
                             p.key.includes(':files:') || p.key.includes(':proposal:') || p.key.includes(':estimate:') || p.key.includes(':orders:'))
                          );
                          
                          return (
                            <div className="border rounded-lg p-2.5 bg-gray-50">
                              <div className="text-xs font-semibold text-gray-700 mb-2">Projects & Opportunities</div>
                              <div className="grid md:grid-cols-2 gap-2.5">
                                {/* View Permissions Column */}
                                <div className="space-y-1.5">
                                  <div className="text-[10px] font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">View</div>
                                  {/* Main View Projects & Opportunities permission */}
                                  {mainViewPerm && (
                                    <label
                                      className="flex items-start gap-1.5 p-1.5 rounded bg-white hover:bg-gray-50 cursor-pointer"
                                    >
                                      <input
                                        type="checkbox"
                                        checked={permissions[mainViewPerm.key] || false}
                                        onChange={() => canEdit && handleToggle(mainViewPerm.key)}
                                        disabled={!canEdit}
                                        className="mt-0.5 w-3.5 h-3.5 rounded border-gray-300 text-brand-red focus:ring-brand-red flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
                                      />
                                      <div className="flex-1 min-w-0">
                                        <div className="text-xs font-medium text-gray-900 flex items-center gap-1.5">
                                          <span className="truncate">{mainViewPerm.label}</span>
                                          {!IMPLEMENTED_PERMISSIONS.has(mainViewPerm.key) && (
                                            <span className="text-[10px] px-1 py-0.5 bg-yellow-100 text-yellow-800 rounded border border-yellow-300 flex-shrink-0">
                                              [WIP]
                                            </span>
                                          )}
                                        </div>
                                        {mainViewPerm.description && (
                                          <div className="text-[10px] text-gray-500 mt-0.5 line-clamp-1">{mainViewPerm.description}</div>
                                        )}
                                      </div>
                                    </label>
                                  )}
                                  {/* Sub-permissions (identadas) */}
                                  {subViewPerms.map((perm: any) => {
                                    const canEnable = canEdit && canEnableEditPermission(perm.key, permissions);
                                    return (
                                    <label
                                      key={perm.id}
                                      className={`flex items-start gap-1.5 p-1.5 rounded bg-white ${canEnable ? 'hover:bg-gray-50 cursor-pointer' : 'cursor-default'} ml-4`}
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
                                          {perm.key === 'business:projects:files:read' && !!permissions[perm.key] && canEdit && (
                                            <button
                                              type="button"
                                              onClick={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                openProjectFilesCategoriesModal('read');
                                              }}
                                              className="ml-auto w-5 h-5 rounded hover:bg-gray-100 grid place-items-center text-gray-500 hover:text-gray-800"
                                              title="Configure allowed file categories"
                                              aria-label="Configure allowed file categories"
                                            >
                                              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                              </svg>
                                            </button>
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
                                
                                {/* Edit Permissions Column */}
                                <div className="space-y-1.5">
                                  <div className="text-[10px] font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">Edit</div>
                                  {/* Main Edit Projects & Opportunities permission */}
                                  {mainEditPerm && (() => {
                                    const canEnable = canEdit && canEnableEditPermission(mainEditPerm.key, permissions);
                                    return (
                                    <label
                                      className={`flex items-start gap-1.5 p-1.5 rounded bg-white ${canEnable ? 'hover:bg-gray-50 cursor-pointer' : 'cursor-default'}`}
                                    >
                                      <input
                                        type="checkbox"
                                        checked={permissions[mainEditPerm.key] || false}
                                        onChange={() => canEnable && handleToggle(mainEditPerm.key)}
                                        disabled={!canEnable}
                                        className="mt-0.5 w-3.5 h-3.5 rounded border-gray-300 text-brand-red focus:ring-brand-red flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
                                      />
                                      <div className="flex-1 min-w-0">
                                        <div className="text-xs font-medium text-gray-900 flex items-center gap-1.5">
                                          <span className="truncate">{mainEditPerm.label}</span>
                                          {!IMPLEMENTED_PERMISSIONS.has(mainEditPerm.key) && (
                                            <span className="text-[10px] px-1 py-0.5 bg-yellow-100 text-yellow-800 rounded border border-yellow-300 flex-shrink-0">
                                              [WIP]
                                            </span>
                                          )}
                                        </div>
                                        {mainEditPerm.description && (
                                          <div className="text-[10px] text-gray-500 mt-0.5 line-clamp-1">{mainEditPerm.description}</div>
                                        )}
                                      </div>
                                    </label>
                                    );
                                  })()}
                                  {/* Sub-permissions (identadas) */}
                                  {subEditPerms.map((perm: any) => {
                                    const canEnable = canEdit && canEnableEditPermission(perm.key, permissions);
                                    return (
                                    <label
                                      key={perm.id}
                                      className={`flex items-start gap-1.5 p-1.5 rounded bg-white ${canEnable ? 'hover:bg-gray-50 cursor-pointer' : 'cursor-default'} ml-4`}
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
                                          {perm.key === 'business:projects:files:write' && !!permissions[perm.key] && canEdit && (
                                            <button
                                              type="button"
                                              onClick={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                openProjectFilesCategoriesModal('write');
                                              }}
                                              className="ml-auto w-5 h-5 rounded hover:bg-gray-100 grid place-items-center text-gray-500 hover:text-gray-800"
                                              title="Configure allowed file categories"
                                              aria-label="Configure allowed file categories"
                                            >
                                              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                              </svg>
                                            </button>
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
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    ) : cat.category.name === 'services' ? (
                      /* Special handling for Services category - only Projects & Opportunities */
                      <div className="space-y-4">
                        {/* Projects & Opportunities */}
                        {(() => {
                          const allProjectsPerms = subPermissions.filter((p: any) => p.key.includes('business:projects'));
                          if (allProjectsPerms.length === 0) return null;
                          
                          // Main permissions (business:projects:read and business:projects:write)
                          const mainViewPerm = allProjectsPerms.find((p: any) => p.key === 'business:projects:read');
                          const mainEditPerm = allProjectsPerms.find((p: any) => p.key === 'business:projects:write');
                          
                          // Sub-permissions (reports, workload, timesheet, files, proposal, estimate, orders)
                          const subViewPerms = allProjectsPerms.filter((p: any) => 
                            p.key.includes(':read') && 
                            p.key !== 'business:projects:read' &&
                            (p.key.includes(':reports:') || p.key.includes(':workload:') || p.key.includes(':timesheet:') || 
                             p.key.includes(':files:') || p.key.includes(':proposal:') || p.key.includes(':estimate:') || p.key.includes(':orders:'))
                          );
                          const subEditPerms = allProjectsPerms.filter((p: any) => 
                            p.key.includes(':write') && 
                            p.key !== 'business:projects:write' &&
                            (p.key.includes(':reports:') || p.key.includes(':workload:') || p.key.includes(':timesheet:') || 
                             p.key.includes(':files:') || p.key.includes(':proposal:') || p.key.includes(':estimate:') || p.key.includes(':orders:'))
                          );
                          
                          return (
                            <div className="border rounded-lg p-2.5 bg-gray-50">
                              <div className="text-xs font-semibold text-gray-700 mb-2">Projects & Opportunities</div>
                              <div className="grid md:grid-cols-2 gap-2.5">
                                {/* View Permissions Column */}
                                <div className="space-y-1.5">
                                  <div className="text-[10px] font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">View</div>
                                  {/* Main View Projects & Opportunities permission */}
                                  {mainViewPerm && (
                                    <label
                                      className="flex items-start gap-1.5 p-1.5 rounded bg-white hover:bg-gray-50 cursor-pointer"
                                    >
                                      <input
                                        type="checkbox"
                                        checked={permissions[mainViewPerm.key] || false}
                                        onChange={() => canEdit && handleToggle(mainViewPerm.key)}
                                        disabled={!canEdit}
                                        className="mt-0.5 w-3.5 h-3.5 rounded border-gray-300 text-brand-red focus:ring-brand-red flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
                                      />
                                      <div className="flex-1 min-w-0">
                                        <div className="text-xs font-medium text-gray-900 flex items-center gap-1.5">
                                          <span className="truncate">{mainViewPerm.label}</span>
                                          {!IMPLEMENTED_PERMISSIONS.has(mainViewPerm.key) && (
                                            <span className="text-[10px] px-1 py-0.5 bg-yellow-100 text-yellow-800 rounded border border-yellow-300 flex-shrink-0">
                                              [WIP]
                                            </span>
                                          )}
                                        </div>
                                        {mainViewPerm.description && (
                                          <div className="text-[10px] text-gray-500 mt-0.5 line-clamp-1">{mainViewPerm.description}</div>
                                        )}
                                      </div>
                                    </label>
                                  )}
                                  {/* Sub-permissions (identadas) */}
                                  {subViewPerms.map((perm: any) => {
                                    const canEnable = canEdit && canEnableEditPermission(perm.key, permissions);
                                    return (
                                    <label
                                      key={perm.id}
                                      className={`flex items-start gap-1.5 p-1.5 rounded bg-white ${canEnable ? 'hover:bg-gray-50 cursor-pointer' : 'cursor-default'} ml-4`}
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
                                
                                {/* Edit Permissions Column */}
                                <div className="space-y-1.5">
                                  <div className="text-[10px] font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">Edit</div>
                                  {/* Main Edit Projects & Opportunities permission */}
                                  {mainEditPerm && (() => {
                                    const canEnable = canEdit && canEnableEditPermission(mainEditPerm.key, permissions);
                                    return (
                                    <label
                                      className={`flex items-start gap-1.5 p-1.5 rounded bg-white ${canEnable ? 'hover:bg-gray-50 cursor-pointer' : 'cursor-default'}`}
                                    >
                                      <input
                                        type="checkbox"
                                        checked={permissions[mainEditPerm.key] || false}
                                        onChange={() => canEnable && handleToggle(mainEditPerm.key)}
                                        disabled={!canEnable}
                                        className="mt-0.5 w-3.5 h-3.5 rounded border-gray-300 text-brand-red focus:ring-brand-red flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
                                      />
                                      <div className="flex-1 min-w-0">
                                        <div className="text-xs font-medium text-gray-900 flex items-center gap-1.5">
                                          <span className="truncate">{mainEditPerm.label}</span>
                                          {!IMPLEMENTED_PERMISSIONS.has(mainEditPerm.key) && (
                                            <span className="text-[10px] px-1 py-0.5 bg-yellow-100 text-yellow-800 rounded border border-yellow-300 flex-shrink-0">
                                              [WIP]
                                            </span>
                                          )}
                                        </div>
                                        {mainEditPerm.description && (
                                          <div className="text-[10px] text-gray-500 mt-0.5 line-clamp-1">{mainEditPerm.description}</div>
                                        )}
                                      </div>
                                    </label>
                                    );
                                  })()}
                                  {/* Sub-permissions (identadas) */}
                                  {subEditPerms.map((perm: any) => {
                                    const canEnable = canEdit && canEnableEditPermission(perm.key, permissions);
                                    return (
                                    <label
                                      key={perm.id}
                                      className={`flex items-start gap-1.5 p-1.5 rounded bg-white ${canEnable ? 'hover:bg-gray-50 cursor-pointer' : 'cursor-default'} ml-4`}
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
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    ) : cat.category.name === 'business' ? (
                      /* Special handling for Business category - Customers, Suppliers and Products */
                      <div className="space-y-4">
                        {/* Customers */}
                        {(() => {
                          const areaPerms = subPermissions.filter((p: any) => p.key.includes('business:customers'));
                          if (areaPerms.length > 0) {
                            const viewPerms = areaPerms.filter((p: any) => p.key.includes(':read'));
                            const editPerms = areaPerms.filter((p: any) => p.key.includes(':write'));
                            
                            return (
                              <div className="border rounded-lg p-2.5 bg-gray-50">
                                <div className="text-xs font-semibold text-gray-700 mb-2">Customers</div>
                                <div className="grid md:grid-cols-2 gap-2.5">
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
                                  {editPerms.length > 0 && (
                                    <div className="space-y-1.5">
                                      <div className="text-[10px] font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">Edit</div>
                                      {editPerms.map((perm: any) => {
                                        const canEnable = canEdit && canEnableEditPermission(perm.key, permissions);
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
                          }
                          return null;
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
                    ) : cat.category.name === 'sales' ? (
                      /* Special handling for Sales category - Quotations permissions */
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

export default function UserInfo(){
  const { userId } = useParams();
  const [sp] = useSearchParams();
  const tabParam = sp.get('tab') as ('personal'|'job'|'docs'|'timesheet'|'loans'|'reports'|'permissions') | null;
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
  const canSelfEdit = me && userId && String(me.id) === String(userId);
  
  // Check edit permissions for general tab (Personal, Job, Docs)
  const canEditGeneral = useMemo(() => {
    if (!me) return false;
    const isAdmin = (me?.roles || []).some((r: string) => String(r || '').toLowerCase() === 'admin');
    if (isAdmin) return true;
    const perms = me?.permissions || [];
    return perms.includes('hr:users:edit:general') || perms.includes('users:write'); // Legacy
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
  const [isEditingPersonal, setIsEditingPersonal] = useState(false);
  
  // Auto-fill work_eligibility_status if user has visas but no status
  useEffect(() => {
    const hasNoStatus = !p.work_eligibility_status || (typeof p.work_eligibility_status === 'string' && p.work_eligibility_status.trim() === '');
    if (hasVisas && hasNoStatus && userId && !isEditingPersonal) {
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
  }, [hasVisas, p.work_eligibility_status, userId, canEdit, canEditGeneral, isEditingPersonal, queryClient]);
  const [isEditingJob, setIsEditingJob] = useState(false);
  const [isEmployeeCardMinimized, setIsEmployeeCardMinimized] = useState(false);
  const permissionsRef = useRef<UserPermissionsRef>(null);
  const { data:usersOptions } = useQuery({ queryKey:['users-options'], queryFn: ()=> api<any[]>('GET','/auth/users/options') });
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
    const row = (usersOptions||[]).find((x:any)=> String(x.id)===String(p.manager_user_id));
    return row? (row.username || row.email) : '';
  }, [usersOptions, p?.manager_user_id, supervisorProfile]);

  const heroBgUrl = (()=>{
    const branding = (settings?.branding||[]) as any[];
    const hero = branding.find((i:any)=> ['user_hero_background_url','hero_background_url','user hero background','hero background'].includes(String(i.label||'').toLowerCase()));
    return hero?.value || '/ui/assets/login/background.jpg';
  })();
  const [heroResolvedUrl, setHeroResolvedUrl] = useState<string>('');
  useEffect(()=>{
    (async()=>{
      try{
        if(!heroBgUrl){ setHeroResolvedUrl('/ui/assets/login/background.jpg'); return; }
        if(heroBgUrl.startsWith('/files/')){
          const r:any = await api('GET', heroBgUrl);
          setHeroResolvedUrl(r.download_url||'/ui/assets/login/background.jpg');
        } else {
          setHeroResolvedUrl(heroBgUrl);
        }
      }catch{ setHeroResolvedUrl('/ui/assets/login/background.jpg'); }
    })();
  }, [heroBgUrl]);

  

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
    const isReportsTab = newTab === 'reports';
    const isPermissionsTab = newTab === 'permissions';
    
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

  const todayLabel = useMemo(() => {
    return new Date().toLocaleDateString('en-CA', {
      weekday: 'long',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }, []);

  return (
    <div>
      <div className="rounded-xl border bg-white p-4 mb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 flex-1">
            <button
              onClick={() => navigate('/users')}
              className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors flex items-center justify-center"
              title="Back to Users"
            >
              <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </button>
            <div className="w-8 h-8 rounded bg-blue-100 flex items-center justify-center">
              <svg className="w-5 h-5 text-blue-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <div>
              <h5 className="text-sm font-semibold text-blue-900">User Information</h5>
              <p className="text-xs text-gray-600 mt-0.5">Personal details, employment, and documents.</p>
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] text-gray-400 mb-1 font-medium uppercase tracking-wide">Today</div>
            <div className="text-xs font-semibold text-gray-700">{todayLabel}</div>
          </div>
        </div>
      </div>
      <div className="space-y-4">
        {/* Employee Info Card */}
        <div className="rounded-xl border bg-white p-3 relative">
          {isEmployeeCardMinimized ? (
            /* Minimized View */
            <div className="flex gap-2 items-center pr-8">
              <img 
                className="w-10 h-10 object-cover rounded-lg border border-gray-200" 
                src={p.profile_photo_file_id? `/files/${p.profile_photo_file_id}/thumbnail?w=80`:'/ui/assets/placeholders/user.png'} 
                alt={`${p.first_name||u?.username} ${p.last_name||''}`}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold text-gray-900 truncate">
                      {p.first_name||u?.username} {p.last_name||''}{u?.username ? ` (${u.username})` : ''}
                    </div>
                    <div className="text-[10px] text-gray-600 truncate mt-0.5">
                      {p.job_title||'—'}{u?.divisions && u.divisions.length > 0 ? ` • ${u.divisions.map((d: any) => d.label).join(', ')}` : (p.division ? ` • ${p.division}` : '')}
                    </div>
                  </div>
                  <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium flex-shrink-0 ${
                    u?.is_active 
                      ? 'bg-green-100 text-green-800' 
                      : 'bg-red-100 text-red-800'
                  }`}>
                    {u?.is_active? 'Active':'Terminated'}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            /* Expanded View */
            <div className="flex gap-3 items-start">
              {/* Profile Photo */}
              <div className="flex-shrink-0 flex flex-col items-center">
                <img 
                  className="w-24 h-24 object-cover rounded-xl border-2 border-gray-200" 
                  src={p.profile_photo_file_id? `/files/${p.profile_photo_file_id}/thumbnail?w=240`:'/ui/assets/placeholders/user.png'} 
                  alt={`${p.first_name||u?.username} ${p.last_name||''}`}
                />
                <div className="mt-2">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${
                    u?.is_active 
                      ? 'bg-green-100 text-green-800' 
                      : 'bg-red-100 text-red-800'
                  }`}>
                    {u?.is_active? 'Active':'Terminated'}
                  </span>
                </div>
              </div>
              
              {/* Employee Details */}
              <div className="flex-1 min-w-0">
                <div className="mb-2">
                  <h1 className="text-sm font-bold text-gray-900">
                    {p.first_name||u?.username} {p.last_name||''}{u?.username ? ` (${u.username})` : ''}
                  </h1>
                  <div className="text-xs text-gray-600 mt-0.5">
                    {p.job_title||'—'}{u?.divisions && u.divisions.length > 0 ? ` • ${u.divisions.map((d: any) => d.label).join(', ')}` : (p.division ? ` • ${p.division}` : '')}
                  </div>
                </div>
                
                {/* Info Grid */}
                <div className="grid md:grid-cols-3 gap-x-3 gap-y-1.5">
                  <div>
                    <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">Phone</span>
                    <div className="text-xs font-semibold text-gray-900 mt-0.5">{p.phone||'—'}</div>
                  </div>
                  <div>
                    <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">Personal Email</span>
                    <div className="text-xs font-semibold text-gray-900 mt-0.5">{u?.email||u?.email_personal||'—'}</div>
                  </div>
                  <div>
                    <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">Work Email</span>
                    <div className="text-xs font-semibold text-gray-900 mt-0.5">{p.work_email||'—'}</div>
                  </div>
                  <div>
                    <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">Hire Date</span>
                    <div className="text-xs font-semibold text-gray-900 mt-0.5">
                      {p.hire_date? String(p.hire_date).slice(0,10):'—'}{p.hire_date? ` (${tenure(p.hire_date)})`:''}
                    </div>
                  </div>
                  <div>
                    <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">Supervisor</span>
                    <div className="text-xs font-semibold text-gray-900 mt-0.5">{supervisorName||'—'}</div>
                  </div>
                  <div>
                    <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">Age</span>
                    <div className="text-xs font-semibold text-gray-900 mt-0.5">{calcAge(p.date_of_birth)||'—'}</div>
                  </div>
                </div>
              </div>
            </div>
          )}
          
          {/* Minimize/Expand Button */}
          <button
            onClick={() => setIsEmployeeCardMinimized(!isEmployeeCardMinimized)}
            className="absolute bottom-2 right-2 p-1 rounded hover:bg-gray-100 transition-colors text-gray-500 hover:text-gray-700"
            title={isEmployeeCardMinimized ? 'Expand' : 'Minimize'}
          >
            <svg 
              className={`w-3 h-3 transition-transform ${isEmployeeCardMinimized ? '' : 'rotate-180'}`}
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>
        
        {/* Navigation Tabs */}
        <div className="rounded-xl border bg-white p-3">
          <div className="flex flex-wrap gap-2">
            {([
              ...(canViewGeneral || canSelfEdit ? ['personal','job','docs'] : []),
              ...(canViewTimesheet || canSelfEdit ? ['timesheet'] : []),
              ...(canViewLoans ? ['loans'] : []),
              ...(canViewReports ? ['reports'] : []),
              ...(canViewPermissions ? ['permissions'] : [])
            ] as const).map((k)=> (
              <button
                key={k}
                onClick={()=>handleTabChange(k as any)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                  tab===k
                    ? 'bg-brand-red text-white border-brand-red' 
                    : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50 hover:border-gray-400'
                }`}
              >
                {String(k).replace(/^./,s=>s.toUpperCase())}
              </button>
            ))}
          </div>
        </div>
      </div>
      
      {/* Main Content Card */}
      <div className="rounded-xl border bg-white">
        <div className="p-5">
          {isLoading? <div className="h-24 animate-pulse bg-gray-100 rounded"/> : (
            <>
              {!canViewGeneral && !canViewTimesheet && !canViewLoans && !canViewReports && !canViewPermissions && !canSelfEdit && (
                <div className="text-center py-12">
                  <div className="text-red-600 font-semibold mb-2">Access Denied</div>
                  <div className="text-gray-600">You do not have permission to view this user's information.</div>
                </div>
              )}
              {tab==='personal' && canViewGeneral && (
                <div className="space-y-6 pb-24">
                  <BasicInformationSection 
                    p={p} 
                    editable={isEditingPersonal && (canEditGeneral || !!canSelfEdit)} 
                    userId={String(userId)} 
                    collectChanges={collectChanges} 
                    profileData={data}
                    onEditClick={() => setIsEditingPersonal(true)}
                    canEdit={canEditGeneral || !!canSelfEdit}
                  />
                  <AddressSectionCard 
                    p={p} 
                    editable={isEditingPersonal && (canEditGeneral || !!canSelfEdit)} 
                    userId={String(userId)} 
                    collectChanges={collectChanges}
                    onEditClick={() => setIsEditingPersonal(true)}
                    canEdit={canEditGeneral || !!canSelfEdit}
                  />
                  <ContactSection 
                    p={p} 
                    editable={isEditingPersonal && (canEditGeneral || !!canSelfEdit)} 
                    userId={String(userId)} 
                    collectChanges={collectChanges}
                    onEditClick={() => setIsEditingPersonal(true)}
                    canEdit={canEditGeneral || !!canSelfEdit}
                  />
                  <EducationSectionCard 
                    userId={String(userId)} 
                    canEdit={isEditingPersonal && (canEditGeneral || !!canSelfEdit)}
                    onEditClick={() => setIsEditingPersonal(true)}
                    canEditButton={canEditGeneral || !!canSelfEdit}
                  />
                  <LegalDocumentsSection 
                    p={p} 
                    editable={isEditingPersonal && (canEditGeneral || !!canSelfEdit)} 
                    userId={String(userId)} 
                    collectChanges={collectChanges}
                    pending={pending}
                    onEditClick={() => setIsEditingPersonal(true)}
                    canEdit={canEditGeneral || !!canSelfEdit}
                    canSelfEdit={!!canSelfEdit}
                  />
                  <EmergencyContactsSectionCard 
                    userId={String(userId)} 
                    canEdit={isEditingPersonal && (canEditGeneral || !!canSelfEdit)}
                    onEditClick={() => setIsEditingPersonal(true)}
                    canEditButton={canEditGeneral || !!canSelfEdit}
                  />
                </div>
              )}
              {tab==='job' && canViewGeneral && (
                <div className="space-y-6 pb-24">
                  <OrganizationSection 
                    p={p} 
                    editable={isEditingJob && (canEditGeneral || !!canSelfEdit)} 
                    userId={String(userId)} 
                    collectChanges={collectChanges} 
                    usersOptions={usersOptions||[]}
                    canViewCompensation={canViewJobCompensation} 
                    settings={settings} 
                    userDivisions={u?.divisions || []}
                    selectedDivisions={selectedDivisions}
                    onDivisionsChange={(divisions) => {
                      setSelectedDivisions(divisions);
                      setDivisionsDirty(true);
                    }}
                    selectedProjectDivisions={selectedProjectDivisions}
                    onProjectDivisionsChange={(divisions) => {
                      setSelectedProjectDivisions(divisions);
                      setProjectDivisionsDirty(true);
                    }}
                    onEditClick={() => setIsEditingJob(true)}
                  />
                  {canViewJobCompensation && (
                    <SalarySection p={p} editable={isEditingJob && (canEditGeneral || !!canSelfEdit)} userId={String(userId)} collectChanges={collectChanges} settings={settings} canEdit={canEditGeneral} />
                  )}
                  <TimeOffSection userId={String(userId)} canEdit={canEditGeneral} />
                </div>
              )}
              {tab==='docs' && canViewGeneral && <UserDocuments userId={String(userId)} canEdit={canEditGeneral} />}
              {tab==='timesheet' && canViewTimesheet && <TimesheetBlock userId={String(userId)} canEdit={canEditTimesheet} />}
              {tab==='loans' && canViewLoans && <UserLoans userId={String(userId)} canEdit={canEditGeneral || (me?.roles || []).some((r: string) => String(r || '').toLowerCase() === 'admin') || (me?.permissions || []).includes('hr:users:write') || (me?.permissions || []).includes('users:write')} />}
              {tab==='reports' && canViewReports && <UserReports userId={String(userId)} canEdit={canEditGeneral || (me?.roles || []).some((r: string) => String(r || '').toLowerCase() === 'admin') || (me?.permissions || []).includes('hr:users:write') || (me?.permissions || []).includes('users:write')} />}
              {tab==='permissions' && canViewPermissions && <UserPermissions ref={permissionsRef} userId={String(userId)} onDirtyChange={setPermissionsDirty} canEdit={canEditPermissions} />}
            </>
          )}
        </div>
      </div>
      {((isEditingPersonal || isEditingJob) && (canEditGeneral || canSelfEdit)) && (
        <div className="fixed bottom-0 left-0 right-0 z-40">
          <div className="max-w-[1200px] mx-auto px-4">
            <div className="mb-3 rounded-xl border bg-white shadow-hero p-3 flex items-center gap-3">
              <div className={`text-sm ${(dirty || divisionsDirty)? 'text-amber-700':'text-green-700'}`}>{(dirty || divisionsDirty)? 'You have unsaved changes':'All changes saved'}</div>
              <div className="flex gap-3 ml-auto">
                <button 
                  onClick={() => {
                    setIsEditingPersonal(false);
                    setIsEditingJob(false);
                    setPending({});
                    setDirty(false);
                    setDivisionsDirty(false);
                    // Reset divisions to original
                    const divisions = (u?.divisions || []).map((d: any) => String(d.id));
                    setSelectedDivisions(divisions);
                  }}
                  className="px-4 py-2 rounded border bg-white text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button 
                  onClick={async () => {
                    await saveAll();
                    setIsEditingPersonal(false);
                    setIsEditingJob(false);
                  }} 
                  disabled={!dirty && !divisionsDirty} 
                  className={`px-4 py-2 rounded text-white ${(dirty || divisionsDirty)? 'bg-gradient-to-r from-brand-red to-[#ee2b2b]':'bg-gray-400 cursor-not-allowed'}`}
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {(tab === 'permissions' && canEditPermissions) && (
        <div className="fixed bottom-0 left-0 right-0 z-40">
          <div className="max-w-[1200px] mx-auto px-4">
            <div className="mb-3 rounded-xl border bg-white shadow-hero p-2.5 flex items-center gap-3">
              <div className={`text-xs ${permissionsDirty? 'text-amber-700':'text-green-700'}`}>{permissionsDirty? 'You have unsaved changes':'All changes saved'}</div>
              <button onClick={async () => { await permissionsRef.current?.save(); }} disabled={!permissionsDirty} className={`ml-auto px-3 py-1.5 text-xs rounded text-white ${permissionsDirty? 'bg-gradient-to-r from-brand-red to-[#ee2b2b]':'bg-gray-400 cursor-not-allowed'}`}>Save</button>
            </div>
          </div>
        </div>
      )}
      
      {/* BambooHR Actions - Moved to bottom */}
      {canEdit && (
        <div className="rounded-xl border bg-white p-3 mt-6">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-6 h-6 rounded bg-gray-100 flex items-center justify-center">
              <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </div>
            <h5 className="text-xs font-semibold text-gray-900">BambooHR Integration</h5>
          </div>
          <div className="flex gap-2">
            <SyncBambooHRButton userId={String(userId)} onSuccess={() => { window.location.reload(); }} />
          </div>
        </div>
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

function EditableGrid({p, fields, editable, selfEdit, userId, collectChanges, inlineSave=true, fieldOptions}:{p:any, fields:[string,string][], editable:boolean, selfEdit:boolean, userId:string, collectChanges?: (kv:Record<string,any>)=>void, inlineSave?: boolean, fieldOptions?: Record<string, string[]>}){
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
  
  return (
    <div>
      <div className="grid md:grid-cols-2 gap-4">
        {fields.map(([label,key])=> {
          const options = fieldOptions?.[key] || (key === 'gender' ? genderOptions : key === 'marital_status' ? maritalStatusOptions : null);
          
          return (
            <div key={key}>
              <div className="text-xs font-medium text-gray-600 mb-1.5">{label}</div>
              {isEditable ? (
                (key==='date_of_birth' || key==='hire_date' || key==='termination_date') ? (
                  <input type="date" value={(form[key]||'').slice(0,10)} onChange={e=> { setForm((s:any)=>({ ...s, [key]: e.target.value })); collectChanges && collectChanges({ [key]: e.target.value }); }} className="w-full rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs text-gray-900 focus:ring-1 focus:ring-gray-400 focus:border-gray-400"/>
                ) : key === 'nationality' ? (
                  <NationalitySelect value={form[key]||''} onChange={v=> { setForm((s:any)=>({ ...s, [key]: v })); collectChanges && collectChanges({ [key]: v }); }} className="w-full" />
                ) : options ? (
                  <select value={form[key]||''} onChange={e=> { setForm((s:any)=>({ ...s, [key]: e.target.value })); collectChanges && collectChanges({ [key]: e.target.value }); }} className="w-full rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs text-gray-900 focus:ring-1 focus:ring-gray-400 focus:border-gray-400">
                    <option value="">Select...</option>
                    {options.map(opt => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                ) : (key === 'phone' || key === 'mobile_phone') ? (
                  <input value={form[key]||''} onChange={e=> { const formatted = formatPhone(e.target.value); setForm((s:any)=>({ ...s, [key]: formatted })); collectChanges && collectChanges({ [key]: formatted }); }} className="w-full rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs text-gray-900 focus:ring-1 focus:ring-gray-400 focus:border-gray-400"/>
                ) : key === 'sin_number' ? (
                  <input value={form[key]||''} onChange={e=> { const formatted = formatSIN(e.target.value); setForm((s:any)=>({ ...s, [key]: formatted })); collectChanges && collectChanges({ [key]: formatted }); }} maxLength={11} placeholder="123-456-789" className="w-full rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs text-gray-900 focus:ring-1 focus:ring-gray-400 focus:border-gray-400"/>
                ) : (
                  <input value={form[key]||''} onChange={e=> { setForm((s:any)=>({ ...s, [key]: e.target.value })); collectChanges && collectChanges({ [key]: e.target.value }); }} className="w-full rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs text-gray-900 focus:ring-1 focus:ring-gray-400 focus:border-gray-400"/>
                )
              ) : (
                <div className="text-sm font-semibold text-gray-900">{(key==='date_of_birth' || key==='hire_date' || key==='termination_date')? (String(p[key]??'').slice(0,10) || '—') : (String(p[key]??'') || '—')}</div>
              )}
            </div>
          );
        })}
      </div>
      {isEditable && inlineSave && (
        <div className="mt-4 text-right">
          <button onClick={save} disabled={isSaving} className="px-4 py-2 rounded bg-brand-red text-white disabled:opacity-50 disabled:cursor-not-allowed">
            {isSaving ? 'Saving...' : 'Save'}
          </button>
        </div>
      )}
    </div>
  );
}

function ClothSizeField({ p, editable, userId, collectChanges, profileData }: { p: any; editable: boolean; userId: string; collectChanges?: (kv: Record<string, any>) => void; profileData?: any }) {
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
      <div className="text-xs font-medium text-gray-600 mb-1.5">Cloth Size</div>
      {isEditable ? (
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
      ) : (
        <div className="text-sm font-semibold text-gray-900">{String(p.cloth_size || '') || '—'}</div>
      )}
    </div>
  );
}

function AddressSection({ p, editable, selfEdit, userId, collectChanges, inlineSave=true }:{ p:any, editable:boolean, selfEdit:boolean, userId:string, collectChanges?: (kv:Record<string,any>)=>void, inlineSave?: boolean }){
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
    }catch(_e){ toast.error('Failed to save'); }
    finally{ setIsSaving(false); }
  };
  // Only make editable if explicitly set to editable (not just because selfEdit is true)
  const isEditable = !!editable;
  return (
    <div>
      <div className="grid md:grid-cols-2 gap-4">
        {/* Left column: Address lines and Postal code */}
        <div className="space-y-4">
          <div>
            <div className="text-xs font-medium text-gray-600 mb-1.5">Address line 1</div>
            {isEditable? (
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
            ) : (
              <div className="text-sm font-semibold text-gray-900 break-words">{String(p.address_line1||'') || '—'}</div>
            )}
          </div>
          <div>
            <div className="text-xs font-medium text-gray-600 mb-1.5">Address line 2</div>
            {isEditable? (
              <AddressAutocomplete
                value={form.address_line2 || ''}
                onChange={(value) => {
                  setForm((s:any)=>({ ...s, address_line2: value }));
                  collectChanges && collectChanges({ address_line2: value });
                }}
                placeholder="Start typing an address..."
                className="w-full rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs text-gray-900 focus:ring-1 focus:ring-gray-400 focus:border-gray-400"
              />
            ) : (
              <div className="text-sm font-semibold text-gray-900 break-words">{String(p.address_line2||'') || '—'}</div>
            )}
          </div>
          <div>
            <div className="text-xs font-medium text-gray-600 mb-1.5">Postal code</div>
            {isEditable ? (
              <input 
              value={form.postal_code || ''} 
              onChange={(e) => {
                setForm((s:any)=>({ ...s, postal_code: e.target.value }));
                collectChanges && collectChanges({ postal_code: e.target.value });
              }}
              className="w-full rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs text-gray-900 focus:ring-1 focus:ring-gray-400 focus:border-gray-400"
            />
            ) : (
              <div className="text-sm font-semibold text-gray-900 break-words">{String(p.postal_code||'') || '—'}</div>
            )}
          </div>
        </div>
        
        {/* Right column: City, Province, Country */}
        <div className="space-y-4">
          <div>
            <div className="text-xs font-medium text-gray-600 mb-1.5">City</div>
            {isEditable ? (
              <input 
              value={form.city || ''} 
              onChange={(e) => {
                setForm((s:any)=>({ ...s, city: e.target.value }));
                collectChanges && collectChanges({ city: e.target.value });
              }}
              className="w-full rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs text-gray-900 focus:ring-1 focus:ring-gray-400 focus:border-gray-400"
            />
            ) : (
              <div className="text-sm font-semibold text-gray-900 break-words">{String(p.city||'') || '—'}</div>
            )}
          </div>
          <div>
            <div className="text-xs font-medium text-gray-600 mb-1.5">Province/State</div>
            {isEditable ? (
              <input 
              value={form.province || ''} 
              onChange={(e) => {
                setForm((s:any)=>({ ...s, province: e.target.value }));
                collectChanges && collectChanges({ province: e.target.value });
              }}
              className="w-full rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs text-gray-900 focus:ring-1 focus:ring-gray-400 focus:border-gray-400"
            />
            ) : (
              <div className="text-sm font-semibold text-gray-900 break-words">{String(p.province||'') || '—'}</div>
            )}
          </div>
          <div>
            <div className="text-xs font-medium text-gray-600 mb-1.5">Country</div>
            {isEditable ? (
              <input 
              value={form.country || ''} 
              onChange={(e) => {
                setForm((s:any)=>({ ...s, country: e.target.value }));
                collectChanges && collectChanges({ country: e.target.value });
              }}
              className="w-full rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs text-gray-900 focus:ring-1 focus:ring-gray-400 focus:border-gray-400"
            />
            ) : (
              <div className="text-sm font-semibold text-gray-900 break-words">{String(p.country||'') || '—'}</div>
            )}
          </div>
        </div>
      </div>
      {isEditable && inlineSave && (
        <div className="mt-4 text-right">
          <button onClick={save} disabled={isSaving} className="px-4 py-2 rounded bg-brand-red text-white disabled:opacity-50 disabled:cursor-not-allowed">
            {isSaving ? 'Saving...' : 'Save'}
          </button>
        </div>
      )}
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

function EducationSection({ userId, canEdit }:{ userId:string, canEdit:boolean }){
  const { data:rows, refetch, isLoading } = useQuery({ queryKey:['education', userId], queryFn: ()=> api<any[]>( 'GET', `/auth/users/${encodeURIComponent(userId)}/education`) });
  const [showAdd, setShowAdd] = useState(false);
  const [inst, setInst] = useState('');
  const [degree, setDegree] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [isAddingEducation, setIsAddingEducation] = useState(false);
  const add = async()=>{
    if (isAddingEducation) return;
    try{
      if(!inst.trim()){ toast.error('Institution required'); return; }
      setIsAddingEducation(true);
      // Convert month input (YYYY-MM) to full date (YYYY-MM-01) for API
      const startDate = start ? `${start}-01` : null;
      const endDate = end ? `${end}-01` : null;
      await api('POST', `/auth/users/${encodeURIComponent(userId)}/education`, { college_institution: inst, degree, start_date:startDate, end_date:endDate });
      toast.success('Added'); setShowAdd(false); setInst(''); setDegree(''); setStart(''); setEnd(''); await refetch();
    }catch(_e){ toast.error('Failed'); }
    finally{ setIsAddingEducation(false); }
  };
  const del = async(id:string)=>{
    try{ await api('DELETE', `/auth/users/${encodeURIComponent(userId)}/education/${encodeURIComponent(id)}`); await refetch(); }catch(_e){ toast.error('Failed'); }
  };
  const formatDateMonthYear = (dateStr: string | null | undefined) => {
    if (!dateStr) return '';
    try {
      const date = new Date(dateStr);
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const year = date.getFullYear();
      return `${year}-${month}`;
    } catch {
      return dateStr.slice(0, 7); // Fallback to YYYY-MM format
    }
  };

  return (
    <div>
      {isLoading ? (
        <div className="text-sm text-gray-600">Loading...</div>
      ) : (rows||[]).length ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {(rows||[]).map((e:any)=> (
            <div key={e.id} className="border rounded-lg p-4 text-sm">
              <div className="font-medium text-gray-900 mb-1">{e.college_institution||'Institution'}</div>
              <div className="text-gray-600 mb-1">{e.degree||''} {e.major_specialization? `· ${e.major_specialization}`:''}</div>
              <div className="text-gray-500 text-xs">
                {formatDateMonthYear(e.start_date)}{(e.start_date||e.end_date)? ' — ':''}{formatDateMonthYear(e.end_date)}
              </div>
              {canEdit && (
                <div className="mt-3 pt-3 border-t">
                  <button onClick={()=>del(e.id)} className="px-2 py-1 rounded border text-xs hover:bg-gray-50">Delete</button>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="text-sm text-gray-600">No education records</div>
      )}
      {canEdit && (
        <div className="mt-3">
          {!showAdd ? (
            <button onClick={()=>setShowAdd(true)} className="px-3 py-2 rounded bg-brand-red text-white">Add education</button>
          ) : (
                                <div className="grid md:grid-cols-2 gap-2.5">
              <div>
                <div className="text-xs text-gray-600">Institution</div>
                <input className="w-full rounded-lg border px-3 py-2" value={inst} onChange={e=>setInst(e.target.value)} />
              </div>
              <div>
                <div className="text-xs text-gray-600">Degree</div>
                <input className="w-full rounded-lg border px-3 py-2" value={degree} onChange={e=>setDegree(e.target.value)} />
              </div>
              <div>
                <div className="text-xs text-gray-600">Start date</div>
                <input type="month" className="w-full rounded-lg border px-3 py-2" value={start} onChange={e=>setStart(e.target.value)} />
              </div>
              <div>
                <div className="text-xs text-gray-600">End date</div>
                <input type="month" className="w-full rounded-lg border px-3 py-2" value={end} onChange={e=>setEnd(e.target.value)} />
              </div>
              <div className="md:col-span-2 text-right">
                <button onClick={()=>setShowAdd(false)} className="px-3 py-2 rounded border mr-2">Cancel</button>
                <button onClick={add} disabled={isAddingEducation} className="px-3 py-2 rounded bg-brand-red text-white disabled:opacity-50 disabled:cursor-not-allowed">
                  {isAddingEducation ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
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
    const row = (usersOptions||[]).find((x:any)=> String(x.id)===String(p.manager_user_id));
    return row? (row.username || row.email) : '';
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
            {(usersOptions||[]).map((u:any)=> (
              <option key={u.id} value={u.id}><UserLabel id={u.id} fallback={u.username||u.email} /></option>
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
      const result = await api<Project[]>('GET', '/projects');
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
        
        setShowModal(false);
        resetForm();
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
        
        setShowModal(false);
        resetForm();
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
      {/* Timesheet Section */}
      <div className="rounded-xl border bg-white p-4">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded bg-indigo-100 flex items-center justify-center">
              <svg className="w-5 h-5 text-indigo-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h5 className="text-sm font-semibold text-indigo-900">Timesheet</h5>
          </div>
          {canEdit && (
            <button
              onClick={() => handleOpenModal()}
              className="px-2 py-1 text-xs bg-[#d11616] text-white rounded-lg font-medium hover:bg-[#b01414] transition-colors"
            >
              + New Attendance
            </button>
          )}
        </div>

        {/* Eligible for Break checkbox */}
        <div className="mb-4 flex items-center gap-2">
          <input
            type="checkbox"
            id="eligible-for-break"
            checked={isEligibleForBreak}
            onChange={(e) => canEdit && toggleEligibleForBreak(e.target.checked)}
            disabled={!canEdit}
            className="w-3.5 h-3.5 text-brand-red border-gray-300 rounded focus:ring-brand-red disabled:opacity-50 disabled:cursor-not-allowed"
          />
          <label htmlFor="eligible-for-break" className={`text-xs font-medium text-gray-700 ${canEdit ? 'cursor-pointer' : 'cursor-default'}`}>
            Eligible for Break
          </label>
          <span className="text-[10px] text-gray-500">(Break will be deducted for shifts of 5 hours or more)</span>
        </div>

        {/* Filters */}
        <div className="mb-4 grid grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Start Date</label>
            <input
              type="date"
              value={filters.start_date}
              onChange={(e) => setFilters({ ...filters, start_date: e.target.value })}
              className="w-full rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs text-gray-900 focus:ring-1 focus:ring-gray-400 focus:border-gray-400"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">End Date</label>
            <input
              type="date"
              value={filters.end_date}
              onChange={(e) => setFilters({ ...filters, end_date: e.target.value })}
              className="w-full rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs text-gray-900 focus:ring-1 focus:ring-gray-400 focus:border-gray-400"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Project/Job</label>
            <select
              value={filters.project_id}
              onChange={(e) => setFilters({ ...filters, project_id: e.target.value })}
              className="w-full rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs text-gray-900 focus:ring-1 focus:ring-gray-400 focus:border-gray-400"
            >
              <option value="">All Projects/Jobs</option>
              <optgroup label="Jobs">
                {PREDEFINED_JOBS.map((job) => (
                  <option key={`job_${job.id}`} value={`job_${job.id}`}>
                    {job.code ? `${job.code} - ` : ''}{job.name}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Projects">
                {(Array.isArray(projects) ? projects : []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.code ? `${p.code} - ` : ''}{p.name}
                  </option>
                ))}
              </optgroup>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Status</label>
            <select
              value={filters.status}
              onChange={(e) => setFilters({ ...filters, status: e.target.value })}
              className="w-full rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs text-gray-900 focus:ring-1 focus:ring-gray-400 focus:border-gray-400"
            >
              <option value="">All Statuses</option>
              <option value="approved">Approved</option>
              <option value="pending">Pending</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>
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
      </div>

      {/* Modal - same as Attendance.tsx */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-4 max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-bold mb-4">
              {editingEvent ? 'Edit Attendance Event' : 'New Attendance Event'}
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Job *</label>
                <select
                  value={formData.job_type}
                  onChange={(e) => setFormData({ ...formData, job_type: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs text-gray-900 focus:ring-1 focus:ring-gray-400 focus:border-gray-400"
                  required
                >
                  {jobOptions.map((job) => (
                    <option key={job.id} value={job.id}>
                      {job.code} - {job.name}
                    </option>
                  ))}
                </select>
              </div>
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
                  <input
                    type="datetime-local"
                    value={formData.clock_in_time}
                    onChange={(e) =>
                      setFormData({ ...formData, clock_in_time: e.target.value })
                    }
                    className="w-full rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs text-gray-900 focus:ring-1 focus:ring-gray-400 focus:border-gray-400"
                    required
                  />
                ) : (
                  <input
                    type="date"
                    value={formData.clock_in_time ? formData.clock_in_time.slice(0, 10) : ''}
                    onChange={(e) => {
                      const date = e.target.value;
                      setFormData((prev) => ({
                        ...prev,
                        clock_in_time: date ? `${date}T00:00` : '',
                      }));
                    }}
                    className="w-full rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs text-gray-900 focus:ring-1 focus:ring-gray-400 focus:border-gray-400"
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
                    <input
                      type="datetime-local"
                      value={formData.clock_out_time}
                      onChange={(e) =>
                        setFormData({ ...formData, clock_out_time: e.target.value })
                      }
                      className="w-full rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs text-gray-900 focus:ring-1 focus:ring-gray-400 focus:border-gray-400"
                      required={!editingEvent}
                    />
                  </div>
                  {/* Manual Break Time (always available in clock in/out mode) */}
                  <div>
                    <label className="flex items-center gap-2 mb-2">
                      <input
                        type="checkbox"
                        checked={insertBreakTime}
                        onChange={(e) => setInsertBreakTime(e.target.checked)}
                        className="w-3.5 h-3.5 rounded border-gray-300 text-brand-red focus:ring-brand-red"
                      />
                      <span className="text-xs font-medium text-gray-700">Insert Break Time</span>
                    </label>
                    {insertBreakTime && (
                      <div className="ml-6 space-y-2">
                        <div className="flex gap-2 items-center">
                          <label className="text-[10px] text-gray-600 w-12">Hours:</label>
                          <select
                            value={breakHours}
                            onChange={(e) => setBreakHours(e.target.value)}
                            className="flex-1 border rounded px-2.5 py-1.5 text-xs"
                          >
                            {Array.from({ length: 3 }, (_, i) => (
                              <option key={i} value={String(i)}>
                                {i}
                              </option>
                            ))}
                          </select>
                          <label className="text-[10px] text-gray-600 w-12 ml-2">Minutes:</label>
                          <select
                            value={breakMinutes}
                            onChange={(e) => setBreakMinutes(e.target.value)}
                            className="flex-1 border rounded px-2.5 py-1.5 text-xs"
                          >
                            {Array.from({ length: 12 }, (_, i) => {
                              const m = i * 5;
                              return (
                                <option key={m} value={String(m).padStart(2, '0')}>
                                  {String(m).padStart(2, '0')}
                                </option>
                              );
                            })}
                          </select>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}
              {formData.entry_mode === 'hours' && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1.5">
                      Hours Worked *
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.25"
                      value={formData.hours_worked}
                      onChange={(e) =>
                        setFormData({ ...formData, hours_worked: e.target.value })
                      }
                      className="w-full rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs text-gray-900 focus:ring-1 focus:ring-gray-400 focus:border-gray-400"
                      placeholder="e.g. 8"
                      required
                    />
                  </div>
                  {/* Manual Break Time (for hours worked mode) */}
                  <div>
                    <label className="flex items-center gap-2 mb-2">
                      <input
                        type="checkbox"
                        checked={insertBreakTime}
                        onChange={(e) => setInsertBreakTime(e.target.checked)}
                        className="w-3.5 h-3.5 rounded border-gray-300 text-brand-red focus:ring-brand-red"
                      />
                      <span className="text-xs font-medium text-gray-700">Insert Break Time</span>
                    </label>
                    {insertBreakTime && (
                      <div className="ml-6 space-y-2">
                        <div className="flex gap-2 items-center">
                          <label className="text-[10px] text-gray-600 w-12">Hours:</label>
                          <select
                            value={breakHours}
                            onChange={(e) => setBreakHours(e.target.value)}
                            className="flex-1 border rounded px-2.5 py-1.5 text-xs"
                          >
                            {Array.from({ length: 3 }, (_, i) => (
                              <option key={i} value={String(i)}>
                                {i}
                              </option>
                            ))}
                          </select>
                          <label className="text-[10px] text-gray-600 w-12 ml-2">Minutes:</label>
                          <select
                            value={breakMinutes}
                            onChange={(e) => setBreakMinutes(e.target.value)}
                            className="flex-1 border rounded px-2.5 py-1.5 text-xs"
                          >
                            {Array.from({ length: 12 }, (_, i) => {
                              const m = i * 5;
                              return (
                                <option key={m} value={String(m).padStart(2, '0')}>
                                  {String(m).padStart(2, '0')}
                                </option>
                              );
                            })}
                          </select>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}
              {editingEvent && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">Status *</label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                    className="w-full rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs text-gray-900 focus:ring-1 focus:ring-gray-400 focus:border-gray-400"
                    required
                  >
                    <option value="approved">Approved</option>
                    <option value="pending">Pending</option>
                    <option value="rejected">Rejected</option>
                  </select>
                </div>
              )}
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={() => {
                  setShowModal(false);
                  resetForm();
                }}
                className="px-3 py-1.5 text-xs border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={isSubmitDisabled}
                className="px-3 py-1.5 text-xs bg-[#d11616] text-white rounded-lg hover:bg-[#b01414] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {editingEvent ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


function SalarySection({ p, editable, userId, collectChanges, settings, canEdit }:{ p:any, editable:boolean, userId:string, collectChanges: (kv:Record<string,any>)=>void, settings?: any, canEdit:boolean }){
  const isEditable = !!editable;
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
    collectChanges({ [key]: value }); 
  };

  return (
    <div className="rounded-xl border bg-white p-4">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded bg-green-100 flex items-center justify-center">
            <svg className="w-5 h-5 text-green-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h5 className="text-sm font-semibold text-green-900">Salary</h5>
        </div>
      </div>
      {/* Current Salary */}
      <div className="mb-4">
        <div className="grid md:grid-cols-2 gap-4">
          {/* Pay Rate Card */}
          <div className="rounded-lg border-2 border-gray-200 bg-gray-50 p-3">
            <div className="flex items-center justify-between mb-1.5">
              <div className="text-[10px] font-medium text-gray-600 uppercase tracking-wide">Pay Rate</div>
              {!isEditable && (
                <button
                  onClick={() => setShowPayRate(!showPayRate)}
                  className="text-gray-500 hover:text-gray-700 transition-colors"
                  type="button"
                >
                  {showPayRate ? (
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  ) : (
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                    </svg>
                  )}
                </button>
              )}
            </div>
            {isEditable? (
              <input className="w-full rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs text-gray-900 focus:ring-1 focus:ring-gray-400 focus:border-gray-400" value={form.pay_rate} onChange={e=>onField('pay_rate', e.target.value)} placeholder="$29.00 / Hour" />
            ) : (
              <div className="text-sm font-semibold text-gray-900">
                {showPayRate ? (String(p.pay_rate||'') || '—') : '••••'}
              </div>
            )}
          </div>

          {/* Pay Type Card */}
          <div className="rounded-lg border-2 border-gray-200 bg-gray-50 p-3">
            <div className="text-[10px] font-medium text-gray-600 uppercase tracking-wide mb-1.5">Pay Type</div>
            {isEditable? (
              (settings?.pay_types?.length ? (
                <select className="w-full rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs text-gray-900 focus:ring-1 focus:ring-gray-400 focus:border-gray-400" value={form.pay_type} onChange={e=>onField('pay_type', e.target.value)}>
                  <option value="">Select...</option>
                  {settings.pay_types.map((it:any)=> <option key={it.id} value={it.label}>{it.label}</option>)}
                </select>
              ) : (
                <input className="w-full rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs text-gray-900 focus:ring-1 focus:ring-gray-400 focus:border-gray-400" value={form.pay_type} onChange={e=>onField('pay_type', e.target.value)} placeholder="Hourly / Salary / Contract..." />
              ))
            ) : (
              <div className="text-sm font-semibold text-gray-900">{String(p.pay_type||'') || '—'}</div>
            )}
          </div>
        </div>
      </div>

      {/* Salary History */}
      <SalaryHistorySection userId={userId} canEdit={canEdit} settings={settings} />
    </div>
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

      {showAdd && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl w-full max-w-lg p-4">
            <div className="text-lg font-semibold mb-4">New salary entry</div>
            <div className="space-y-3">
                                <div className="grid md:grid-cols-2 gap-2.5">
                <div>
                  <div className="text-xs text-gray-600">Effective date *</div>
                  <input type="date" className="w-full rounded-lg border px-3 py-2" value={effectiveDate} onChange={e=>setEffectiveDate(e.target.value)} />
                </div>
                <div>
                  <div className="text-xs text-gray-600">Pay type</div>
                  {(settings?.pay_types?.length ? (
                    <select className="w-full rounded-lg border px-3 py-2" value={payType} onChange={e=>setPayType(e.target.value)}>
                      <option value="">Select...</option>
                      {settings.pay_types.map((it:any)=> <option key={it.id} value={it.label}>{it.label}</option>)}
                    </select>
                  ) : (
                    <input className="w-full rounded-lg border px-3 py-2" value={payType} onChange={e=>setPayType(e.target.value)} placeholder="Hourly / Salary / Contract..." />
                  ))}
                </div>
              </div>

              <div>
                <div className="text-xs text-gray-600">Pay rate *</div>
                <input className="w-full rounded-lg border px-3 py-2" value={newSalary} onChange={e=>setNewSalary(e.target.value)} placeholder="$29.00 / Hour" />
              </div>

              <div>
                <div className="text-xs text-gray-600">Change reason *</div>
                <textarea className="w-full rounded-lg border px-3 py-2" rows={3} value={justification} onChange={e=>setJustification(e.target.value)} placeholder="Reason for the salary change..." />
              </div>

              <div>
                <div className="text-xs text-gray-600">Comment</div>
                <textarea className="w-full rounded-lg border px-3 py-2" rows={2} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Optional notes..." />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => { setShowAdd(false); reset(); }}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={save}
                disabled={saving}
                className="px-4 py-2 bg-[#d11616] text-white rounded-lg hover:bg-[#b01414] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


// Icon mapping for divisions (same as Projects.tsx)
const getDivisionIcon = (label: string): string => {
  const iconMap: Record<string, string> = {
    'Roofing': '🏠',
    'Concrete Restoration & Waterproofing': '🏗️',
    'Cladding & Exterior Finishes': '🧱',
    'Repairs & Maintenance': '🔧',
    'Mechanical': '🔩',
    'Electrical': '⚡',
    'Carpentry': '🪵',
    'Welding & Custom Fabrication': '🔥',
    'Structural Upgrading': '📐',
    'Solar PV': '☀️',
    'Green Roofing': '🌱',
  };
  return iconMap[label] || '📦';
};

// Personal tab sections
function BasicInformationSection({ p, editable, userId, collectChanges, profileData, onEditClick, canEdit }: { p: any, editable: boolean, userId: string, collectChanges: (kv: Record<string, any>) => void, profileData?: any, onEditClick?: () => void, canEdit?: boolean }) {
  const isEditable = !!editable;
  return (
    <div className="rounded-xl border bg-white p-4">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded bg-blue-100 flex items-center justify-center">
            <svg className="w-5 h-5 text-blue-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </div>
          <h5 className="text-sm font-semibold text-blue-900">Basic Information</h5>
        </div>
        {!isEditable && onEditClick && canEdit && (
          <button
            onClick={onEditClick}
            className="p-1.5 rounded hover:bg-gray-100 text-gray-600 hover:text-brand-red transition-colors"
            title="Edit Basic Information"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
        )}
      </div>
      <div className="space-y-4">
        <EditableGrid p={p} editable={isEditable} selfEdit={false} userId={userId} collectChanges={collectChanges} inlineSave={false} fields={[['First name','first_name'],['Last name','last_name'],['Middle name','middle_name'],['Prefered name','preferred_name'],['Gender','gender'],['Marital status','marital_status'],['Date of birth','date_of_birth'],['Nationality','nationality']]} />
        <div className="grid md:grid-cols-2 gap-4">
          <ClothSizeField p={p} editable={isEditable} userId={userId} collectChanges={collectChanges} profileData={profileData} />
        </div>
      </div>
    </div>
  );
}

function AddressSectionCard({ p, editable, userId, collectChanges, onEditClick, canEdit }: { p: any, editable: boolean, userId: string, collectChanges: (kv: Record<string, any>) => void, onEditClick?: () => void, canEdit?: boolean }) {
  const isEditable = !!editable;
  return (
    <div className="rounded-xl border bg-white p-4">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded bg-green-100 flex items-center justify-center">
            <svg className="w-5 h-5 text-green-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <h5 className="text-sm font-semibold text-green-900">Address</h5>
        </div>
        {!isEditable && onEditClick && canEdit && (
          <button
            onClick={onEditClick}
            className="p-1.5 rounded hover:bg-gray-100 text-gray-600 hover:text-brand-red transition-colors"
            title="Edit Address"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
        )}
      </div>
      <div className="space-y-4">
        <AddressSection p={p} editable={isEditable} selfEdit={false} userId={userId} collectChanges={collectChanges} inlineSave={false} />
      </div>
    </div>
  );
}

function ContactSection({ p, editable, userId, collectChanges, onEditClick, canEdit }: { p: any, editable: boolean, userId: string, collectChanges: (kv: Record<string, any>) => void, onEditClick?: () => void, canEdit?: boolean }) {
  const isEditable = !!editable;
  return (
    <div className="rounded-xl border bg-white p-4">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded bg-yellow-100 flex items-center justify-center">
            <svg className="w-5 h-5 text-yellow-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
            </svg>
          </div>
          <h5 className="text-sm font-semibold text-yellow-900">Contact</h5>
        </div>
        {!isEditable && onEditClick && canEdit && (
          <button
            onClick={onEditClick}
            className="p-1.5 rounded hover:bg-gray-100 text-gray-600 hover:text-brand-red transition-colors"
            title="Edit Contact"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
        )}
      </div>
      <div className="space-y-4">
        <EditableGrid p={p} editable={isEditable} selfEdit={false} userId={userId} collectChanges={collectChanges} inlineSave={false} fields={[['Phone 1','phone'],['Phone 2','mobile_phone']]} />
      </div>
    </div>
  );
}

function EducationSectionCard({ userId, canEdit, onEditClick, canEditButton }: { userId: string, canEdit: boolean, onEditClick?: () => void, canEditButton?: boolean }) {
  return (
    <div className="rounded-xl border bg-white p-4">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded bg-indigo-100 flex items-center justify-center">
            <svg className="w-5 h-5 text-indigo-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
          </div>
          <h5 className="text-sm font-semibold text-indigo-900">Education</h5>
        </div>
        {!canEdit && onEditClick && canEditButton && (
          <button
            onClick={onEditClick}
            className="p-1.5 rounded hover:bg-gray-100 text-gray-600 hover:text-brand-red transition-colors"
            title="Edit Education"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
        )}
      </div>
      <div className="space-y-4">
        <EducationSection userId={userId} canEdit={canEdit} />
      </div>
    </div>
  );
}

function LegalDocumentsSection({ p, editable, userId, collectChanges, pending, onEditClick, canEdit, canSelfEdit }: { p: any, editable: boolean, userId: string, collectChanges: (kv: Record<string, any>) => void, pending: any, onEditClick?: () => void, canEdit?: boolean, canSelfEdit?: boolean }) {
  const isEditable = !!editable;
  return (
    <div className="rounded-xl border bg-white p-4">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded bg-red-100 flex items-center justify-center">
            <svg className="w-5 h-5 text-red-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <h5 className="text-sm font-semibold text-red-900">Legal & Documents</h5>
        </div>
        {!isEditable && onEditClick && canEdit && (
          <button
            onClick={onEditClick}
            className="p-1.5 rounded hover:bg-gray-100 text-gray-600 hover:text-brand-red transition-colors"
            title="Edit Legal & Documents"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
        )}
      </div>
      <div className="space-y-4">
        <div className="grid md:grid-cols-2 gap-4">
          <EditableGrid p={p} editable={isEditable} selfEdit={!!canSelfEdit} userId={userId} collectChanges={collectChanges} inlineSave={false} fields={[['SIN Number','sin_number']]} />
          <EditableGrid p={p} editable={isEditable} selfEdit={!!canSelfEdit} userId={userId} collectChanges={collectChanges} inlineSave={false} fields={[['Work Eligibility Status','work_eligibility_status']]} fieldOptions={{ work_eligibility_status: ['Canadian Citizen', 'Permanent Resident', 'Temporary Resident (with work authorization)', 'Other'] }} />
        </div>
        <WorkEligibilityDocumentsSection 
          userId={userId} 
          canEdit={isEditable} 
          workEligibilityStatus={isEditable && pending.work_eligibility_status !== undefined ? pending.work_eligibility_status : (p.work_eligibility_status || '')}
        />
      </div>
    </div>
  );
}

function EmergencyContactsSectionCard({ userId, canEdit, onEditClick, canEditButton }: { userId: string, canEdit: boolean, onEditClick?: () => void, canEditButton?: boolean }) {
  return (
    <div className="rounded-xl border bg-white p-4">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded bg-orange-100 flex items-center justify-center">
            <svg className="w-5 h-5 text-orange-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h5 className="text-sm font-semibold text-orange-900">Emergency Contacts</h5>
        </div>
        {!canEdit && onEditClick && canEditButton && (
          <button
            onClick={onEditClick}
            className="p-1.5 rounded hover:bg-gray-100 text-gray-600 hover:text-brand-red transition-colors"
            title="Edit Emergency Contacts"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
        )}
      </div>
      <div className="space-y-4">
        <EmergencyContactsSection userId={userId} canEdit={canEdit} />
      </div>
    </div>
  );
}

function OrganizationSection({ p, editable, userId, collectChanges, usersOptions, settings, userDivisions, selectedDivisions, onDivisionsChange, selectedProjectDivisions, onProjectDivisionsChange, canViewCompensation, onEditClick }: { p:any, editable:boolean, userId:string, collectChanges: (kv:Record<string,any>)=>void, usersOptions:any[], settings:any, userDivisions?: any[], selectedDivisions?: string[], onDivisionsChange?: (divisions: string[]) => void, selectedProjectDivisions?: string[], onProjectDivisionsChange?: (divisions: string[]) => void, canViewCompensation?: boolean, onEditClick?: () => void }){
  const isEditable = !!editable;
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
  const [departmentDropdownOpen, setDepartmentDropdownOpen] = useState(false);
  const [projectDivisionDropdownOpen, setProjectDivisionDropdownOpen] = useState(false);
  
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
    collectChanges({ [key]: value }); 
  };
  
  const handleDepartmentToggle = (divisionId: string) => {
    const newSelection = selectedDivisions?.includes(divisionId)
      ? selectedDivisions.filter(id => id !== divisionId)
      : [...(selectedDivisions || []), divisionId];
    if (onDivisionsChange) {
      onDivisionsChange(newSelection);
    }
    collectChanges({ _divisions_changed: true, _selected_divisions: newSelection });
  };
  
  const handleProjectDivisionToggle = (divisionId: string) => {
    const current = selectedProjectDivisions || [];
    const newSelection = current.includes(divisionId)
      ? current.filter(id => id !== divisionId)
      : [...current, divisionId];
    if (onProjectDivisionsChange) {
      onProjectDivisionsChange(newSelection);
    }
    collectChanges({ project_division_ids: newSelection });
  };
  
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
    const row = (usersOptions||[]).find((x:any)=> String(x.id)===String(p.manager_user_id));
    return row? (row.username || row.email) : '';
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
  
  return (
    <div className="rounded-xl border bg-white p-4">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded bg-purple-100 flex items-center justify-center">
            <svg className="w-5 h-5 text-purple-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          </div>
          <h5 className="text-sm font-semibold text-purple-900">Organization</h5>
        </div>
        {!isEditable && onEditClick && (
          <button
            onClick={onEditClick}
            className="p-1.5 rounded hover:bg-gray-100 text-gray-600 hover:text-brand-red transition-colors"
            title="Edit Organization"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
        )}
      </div>
      
      <div className="space-y-4">
        {/* Job Title | Employment Type */}
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <div className="text-xs font-medium text-gray-600 mb-1.5">Job Title</div>
            {isEditable? (
              <input className="w-full rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs text-gray-900 focus:ring-1 focus:ring-gray-400 focus:border-gray-400" value={form.job_title} onChange={e=>onField('job_title', e.target.value)} placeholder="e.g. Project Manager" />
            ) : (
              <div className="text-sm font-semibold text-gray-900">{String(p.job_title||'') || '—'}</div>
            )}
          </div>
          <div>
            <div className="text-xs font-medium text-gray-600 mb-1.5">Employment Type</div>
            {isEditable? (
              <select className="w-full rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs text-gray-900 focus:ring-1 focus:ring-gray-400 focus:border-gray-400" value={form.employment_type} onChange={e=>onField('employment_type', e.target.value)}>
                <option value="">Select...</option>
                <option value="Full-time">Full-time</option>
                <option value="Hourly">Hourly</option>
                <option value="Part-time">Part-time</option>
                <option value="Salary">Salary</option>
              </select>
            ) : (
              <div className="text-sm font-semibold text-gray-900">{String(p.employment_type||'') || '—'}</div>
            )}
          </div>
        </div>
        
        {/* Supervisor | Hire Date */}
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <div className="text-xs font-medium text-gray-600 mb-1.5">Supervisor</div>
            {isEditable? (
              <select className="w-full rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs text-gray-900 focus:ring-1 focus:ring-gray-400 focus:border-gray-400" value={form.manager_user_id} onChange={e=>onField('manager_user_id', e.target.value)}>
                <option value="">Select...</option>
                {(usersOptions||[]).map((u:any)=> (
                  <option key={u.id} value={u.id}><UserLabel id={u.id} fallback={u.username||u.email} /></option>
                ))}
              </select>
            ) : (
              <div className="text-sm font-semibold text-gray-900">{supervisor||'—'}</div>
            )}
          </div>
          <div>
            <div className="text-xs font-medium text-gray-600 mb-1.5">Hire Date</div>
            {isEditable? (
              <input type="date" className="w-full rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs text-gray-900 focus:ring-1 focus:ring-gray-400 focus:border-gray-400" value={(form.hire_date||'').slice(0,10)} onChange={e=>onField('hire_date', e.target.value)} />
            ) : (
              <div className="text-sm font-semibold text-gray-900">{String(p.hire_date||'').slice(0,10) || '—'}</div>
            )}
          </div>
        </div>
        
        {/* Department | Termination Date */}
        <div className="grid md:grid-cols-2 gap-4">
          {/* Departments */}
          <div className="relative">
            <div className="text-xs font-medium text-gray-600 mb-1.5">Departments</div>
            {isEditable? (
              (settings?.divisions?.length ? (
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setDepartmentDropdownOpen(!departmentDropdownOpen)}
                    className="w-full rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs text-left flex items-center justify-between"
                  >
                    <span className={selectedDivisions && selectedDivisions.length > 0 ? 'text-gray-900' : 'text-gray-400'}>
                      {selectedDivisions && selectedDivisions.length > 0 
                        ? selectedDivisions.map((id: string) => {
                            const division = settings.divisions.find((d: any) => String(d.id) === id);
                            return division?.label || '';
                          }).filter(Boolean).join(', ')
                        : 'Select departments...'}
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
                              checked={selectedDivisions && selectedDivisions.includes(String(it.id))}
                              onChange={() => {
                                const newSelection = selectedDivisions && selectedDivisions.includes(String(it.id))
                                  ? selectedDivisions.filter(id => id !== String(it.id))
                                  : [...(selectedDivisions || []), String(it.id)];
                                if (onDivisionsChange) {
                                  onDivisionsChange(newSelection);
                                }
                              }}
                              className="rounded border-gray-300"
                            />
                            <span className="text-xs text-gray-900">{it.label}</span>
                          </label>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <div className="text-sm font-semibold text-gray-900">
                  {selectedDivisions && selectedDivisions.length > 0 && settings?.divisions
                    ? selectedDivisions.map((id: string) => {
                        const division = settings.divisions.find((d: any) => String(d.id) === id);
                        return division?.label || '';
                      }).filter(Boolean).join(', ')
                    : (userDivisions && userDivisions.length > 0
                      ? userDivisions.map((d: any) => d.label).join(', ')
                      : (p.division || '—'))}
                </div>
              ))
            ) : (
              <div className="text-sm font-semibold text-gray-900">
                {selectedDivisions && selectedDivisions.length > 0 && settings?.divisions
                  ? selectedDivisions.map((id: string) => {
                      const division = settings.divisions.find((d: any) => String(d.id) === id);
                      return division?.label || '';
                    }).filter(Boolean).join(', ')
                  : (userDivisions && userDivisions.length > 0
                    ? userDivisions.map((d: any) => d.label).join(', ')
                    : (p.division || '—'))}
              </div>
            )}
          </div>
          <div>
            <div className="text-xs font-medium text-gray-600 mb-1.5">Termination Date</div>
            {isEditable? (
              <input type="date" className="w-full rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs text-gray-900 focus:ring-1 focus:ring-gray-400 focus:border-gray-400" value={(form.termination_date||'').slice(0,10)} onChange={e=>onField('termination_date', e.target.value)} />
            ) : (
              <div className="text-sm font-semibold text-gray-900">{String(p.termination_date||'').slice(0,10) || '—'}</div>
            )}
          </div>
        </div>
        
        {/* Work email and Work phone */}
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <div className="text-xs font-medium text-gray-600 mb-1.5">Work email</div>
            {isEditable? <input className="w-full rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs text-gray-900 focus:ring-1 focus:ring-gray-400 focus:border-gray-400" value={form.work_email} onChange={e=>onField('work_email', e.target.value)} /> : <div className="text-sm font-semibold text-gray-900">{String(p.work_email||'') || '—'}</div>}
          </div>
          <div>
            <div className="text-xs font-medium text-gray-600 mb-1.5">Work phone</div>
            {isEditable? <input className="w-full rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs text-gray-900 focus:ring-1 focus:ring-gray-400 focus:border-gray-400" value={form.work_phone} onChange={e=>onField('work_phone', e.target.value)} /> : <div className="text-sm font-semibold text-gray-900">{String(p.work_phone||'') || '—'}</div>}
          </div>
        </div>
        
        {/* Project Divisions */}
        <div className="relative">
          <div className="text-xs font-medium text-gray-600 mb-1.5">Project Divisions</div>
          {isEditable? (
            projectDivisions && projectDivisions.length > 0 ? (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setProjectDivisionDropdownOpen(!projectDivisionDropdownOpen)}
                  className="w-full rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs text-left flex items-center justify-between"
                >
                  <span className={(selectedProjectDivisions || []).length > 0 ? 'text-gray-900' : 'text-gray-400'}>
                    {(selectedProjectDivisions || []).length > 0 
                      ? (selectedProjectDivisions || []).map((id: string) => {
                          const division = allProjectDivisions.find((d: any) => String(d.id) === id);
                          return division ? (division.isMain ? division.label : `${division.parentLabel} - ${division.label}`) : '';
                        }).filter(Boolean).join(', ')
                      : 'Select project divisions...'}
                  </span>
                  <span className="text-gray-400">▼</span>
                </button>
                {projectDivisionDropdownOpen && (
                  <>
                    <div 
                      className="fixed inset-0 z-10" 
                      onClick={() => setProjectDivisionDropdownOpen(false)}
                    />
                    <div className="absolute z-20 w-full mt-1 bg-white border rounded-lg shadow-lg max-h-60 overflow-y-auto">
                      {projectDivisions.map((div: any) => (
                        <div key={div.id}>
                          <label
                            className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer font-medium"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <input
                              type="checkbox"
                              checked={(selectedProjectDivisions || []).includes(String(div.id))}
                              onChange={() => handleProjectDivisionToggle(String(div.id))}
                              className="rounded border-gray-300 text-brand-red focus:ring-brand-red"
                            />
                            <span className="text-xs">{div.label}</span>
                          </label>
                          {div.subdivisions && div.subdivisions.length > 0 && (
                            <div className="pl-6">
                              {div.subdivisions.map((sub: any) => (
                                <label
                                  key={sub.id}
                                  className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <input
                                    type="checkbox"
                                    checked={(selectedProjectDivisions || []).includes(String(sub.id))}
                                    onChange={() => handleProjectDivisionToggle(String(sub.id))}
                                    className="rounded border-gray-300 text-brand-red focus:ring-brand-red"
                                  />
                                  <span className="text-xs text-gray-600">{sub.label}</span>
                                </label>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div className="text-xs text-gray-500">Loading project divisions...</div>
            )
          ) : (
            <div className="space-y-1.5">
              {(selectedProjectDivisions || []).length > 0
                ? (selectedProjectDivisions || []).map((id: string) => {
                    const division = allProjectDivisions.find((d: any) => String(d.id) === id);
                    if (!division) return null;
                    const divisionLabel = division.isMain ? division.label : `${division.parentLabel} - ${division.label}`;
                    const divisionIcon = getDivisionIcon(division.isMain ? division.label : division.parentLabel);
                    return (
                      <div key={id} className="flex items-center gap-1.5">
                        <span className="text-xs">{divisionIcon}</span>
                        <span className="text-sm font-semibold text-gray-900">{divisionLabel}</span>
                      </div>
                    );
                  }).filter(Boolean)
                : <div className="text-sm font-semibold text-gray-900">—</div>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function TimeOffSection({ userId, canEdit }:{ userId:string, canEdit:boolean }){
  const { data:me } = useQuery({ queryKey:['me'], queryFn: ()=> api<any>('GET','/auth/me') });
  
  // Ensure canEdit is true for admins
  const hasEditPermission = canEdit || (me?.roles || []).some((r: string) => String(r || '').toLowerCase() === 'admin') || (me?.permissions || []).includes('users:write');
  
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
    <div className="rounded-xl border bg-white p-4">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded bg-blue-100 flex items-center justify-center">
            <svg className="w-5 h-5 text-blue-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h5 className="font-semibold text-blue-900">Time Off</h5>
        </div>
      </div>
      <div className="space-y-4">
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
          
          // Check if entry is a manual adjustment
          const isManualAdjustment = (desc: string) => {
            return desc && desc.includes('Adjusted by');
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
      
      {/* Request Form Modal */}
      {showRequestForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl w-full max-w-md p-4">
            <div className="text-lg font-semibold mb-4">Request Time Off</div>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-600">Policy*</label>
                <select
                  className="w-full border rounded px-3 py-2"
                  value={policyName}
                  onChange={(e) => setPolicyName(e.target.value)}
                >
                  <option value="">Select policy...</option>
                  {availablePolicies.map((p: string) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
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
                <div>
                  <label className="text-xs text-gray-600">Start Date*</label>
                  <input
                    type="date"
                    className="w-full border rounded px-3 py-2"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-600">End Date*</label>
                  <input
                    type="date"
                    className="w-full border rounded px-3 py-2"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                  />
                </div>
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
              <div>
                <label className="text-xs text-gray-600">Hours (auto-calculated)</label>
                <input
                  type="number"
                  step="0.5"
                  className="w-full border rounded px-3 py-2"
                  value={hours}
                  onChange={(e) => setHours(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs text-gray-600">
                  {policyName?.toLowerCase().includes('sick') ? 'Reason/Justification*' : 'Notes (optional)'}
                </label>
                <textarea
                  className="w-full border rounded px-3 py-2"
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder={policyName?.toLowerCase().includes('sick') ? 'Please provide a reason for your sick leave request...' : 'Reason for time off...'}
                />
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => {
                  setShowRequestForm(false);
                  setPolicyName('');
                  setStartDate('');
                  setEndDate('');
                  setHours('');
                  setNotes('');
                }}
                className="px-3 py-2 rounded border"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting || !policyName || !startDate || !endDate}
                className="px-3 py-2 rounded bg-brand-red text-white disabled:opacity-50"
              >
                {submitting ? 'Submitting...' : 'Submit Request'}
              </button>
            </div>
          </div>
        </div>
      )}
      
      {showAdjustModal && adjustingBalance && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setShowAdjustModal(false)}>
          <div className="bg-white rounded-xl w-full max-w-lg p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-semibold text-brand-red">
                {adjustingBalance.policy_name ? `Adjust ${adjustingBalance.policy_name} Balance` : 'Adjust Time Off Balance'}
              </h3>
              <button
                onClick={() => {
                  setShowAdjustModal(false);
                  setAdjustingBalance(null);
                  setSelectedPolicyName('');
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            {/* Adjustment Form */}
            <div className="space-y-4">
              {/* Policy Selection - always show if multiple balances exist, or if no policy selected */}
              {((displayedBalances && displayedBalances.length > 1) || !adjustingBalance.policy_name) && (
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Policy*</label>
                  <select
                    value={selectedPolicyName || adjustingBalance.policy_name || ''}
                    onChange={(e) => {
                      setSelectedPolicyName(e.target.value);
                      // Update adjustingBalance with selected policy
                      const selectedBalance = displayedBalances?.find((b: any) => b.policy_name === e.target.value);
                      if (selectedBalance) {
                        setAdjustingBalance(selectedBalance);
                      } else {
                        setAdjustingBalance({ policy_name: e.target.value, balance_hours: undefined });
                      }
                    }}
                    className="w-full border rounded px-3 py-2"
                  >
                    <option value="">Select policy...</option>
                    {displayedBalances && displayedBalances.length > 0 ? (
                      displayedBalances.map((b: any) => (
                        <option key={b.id} value={b.policy_name}>{b.policy_name}</option>
                      ))
                    ) : (
                      <>
                        <option value="Vacation">Vacation</option>
                        <option value="Sick Leave">Sick Leave</option>
                        <option value="Personal Days">Personal Days</option>
                        <option value="Holiday">Holiday</option>
                      </>
                    )}
                  </select>
                </div>
              )}
              
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Amount*</label>
                <div className="flex gap-2">
                  <select
                    value={adjustmentType}
                    onChange={(e) => setAdjustmentType(e.target.value as 'add' | 'subtract')}
                    className="border rounded px-3 py-2 text-sm"
                  >
                    <option value="add">Add</option>
                    <option value="subtract">Subtract</option>
                  </select>
                  <input
                    type="number"
                    step="0.5"
                    min="0.5"
                    value={adjustmentDays}
                    onChange={(e) => setAdjustmentDays(e.target.value)}
                    className="flex-1 border rounded px-3 py-2"
                    placeholder="0"
                  />
                  <span className="px-3 py-2 text-sm text-gray-600">days</span>
                </div>
              </div>
              
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Effective Date*</label>
                <input
                  type="date"
                  value={effectiveDate}
                  onChange={(e) => setEffectiveDate(e.target.value)}
                  className="w-full border rounded px-3 py-2"
                />
              </div>
              
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Note*</label>
                <textarea
                  value={adjustmentNote}
                  onChange={(e) => setAdjustmentNote(e.target.value)}
                  className="w-full border rounded px-3 py-2"
                  rows={3}
                  placeholder="Reason for adjustment..."
                />
              </div>
              
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
            
            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={() => {
                  setShowAdjustModal(false);
                  setAdjustingBalance(null);
                  setSelectedPolicyName('');
                }}
                className="px-4 py-2 rounded border text-sm hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleAdjust}
                disabled={adjusting || !adjustmentDays || !effectiveDate || !adjustmentNote.trim() || (!selectedPolicyName && !adjustingBalance?.policy_name)}
                className="px-4 py-2 rounded bg-brand-red text-white text-sm disabled:opacity-50 hover:bg-red-700"
              >
                {adjusting ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function EmergencyContactsSection({ userId, canEdit }:{ userId:string, canEdit:boolean }){
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
      
      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="w-[800px] max-w-[95vw] bg-white rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b flex items-center justify-between">
              <div className="font-semibold">New Emergency Contact</div>
              <button 
                onClick={() => { setCreateOpen(false); }} 
                className="text-gray-500 hover:text-gray-700 text-2xl font-bold w-8 h-8 flex items-center justify-center rounded hover:bg-gray-100"
              >
                ×
              </button>
            </div>
            <div className="p-4 grid md:grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="text-xs text-gray-600">Name *</label>
                <input 
                  className="border rounded px-3 py-2 w-full" 
                  value={name} 
                  onChange={e => setName(e.target.value)} 
                />
              </div>
              <div>
                <label className="text-xs text-gray-600">Relationship</label>
                <input 
                  className="border rounded px-3 py-2 w-full" 
                  value={relationship} 
                  onChange={e => setRelationship(e.target.value)} 
                />
              </div>
              <div>
                <label className="text-xs text-gray-600">Primary</label>
                <div className="flex items-center gap-2 mt-2">
                  <input 
                    type="checkbox" 
                    checked={isPrimary} 
                    onChange={e => setIsPrimary(e.target.checked)}
                    className="rounded"
                  />
                  <span className="text-xs text-gray-600">Set as primary contact</span>
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-600">Mobile Phone</label>
                <input 
                  className="border rounded px-3 py-2 w-full" 
                  value={mobilePhone} 
                  onChange={e => setMobilePhone(formatPhone(e.target.value))} 
                />
              </div>
              <div>
                <label className="text-xs text-gray-600">Home Phone</label>
                <input 
                  className="border rounded px-3 py-2 w-full" 
                  value={homePhone} 
                  onChange={e => setHomePhone(formatPhone(e.target.value))} 
                />
              </div>
              <div>
                <label className="text-xs text-gray-600">Work Phone</label>
                <input 
                  className="border rounded px-3 py-2 w-full" 
                  value={workPhone} 
                  onChange={e => setWorkPhone(formatPhone(e.target.value))} 
                />
              </div>
              <div className="col-span-2">
                <label className="text-xs text-gray-600">Email</label>
                <input 
                  className="border rounded px-3 py-2 w-full" 
                  type="email"
                  value={email} 
                  onChange={e => setEmail(e.target.value)} 
                />
              </div>
              <div className="col-span-2">
                <label className="text-xs text-gray-600">Address</label>
                <input 
                  className="border rounded px-3 py-2 w-full" 
                  value={address} 
                  onChange={e => setAddress(e.target.value)} 
                />
              </div>
              <div className="col-span-2 text-right">
                <button 
                  onClick={handleCreate}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-brand-red to-[#ee2b2b] text-white font-semibold"
                >
                  Create
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Work Eligibility Documents Section - always shows Visa Information and Immigration Status Document
function WorkEligibilityDocumentsSection({ userId, canEdit, workEligibilityStatus }: { userId: string; canEdit: boolean; workEligibilityStatus?: string }) {
  // Always show both sections regardless of status
  return (
    <div className="space-y-4">
      <VisaInformationSection userId={userId} canEdit={canEdit} isRequired={false} showInlineForm={false} />
      <ImmigrationStatusDocumentSection userId={userId} canEdit={canEdit} isRequired={false} />
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
              href={`/files/${prCardFileId}/download`}
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
      <div className="text-xs text-gray-500 mb-3">Examples: Work Permit, Study Permit, PGWP, PR Card...</div>
      {permitFileId ? (
        <div className="space-y-3">
          <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
            <div className="flex-1">
              <div className="text-sm font-medium text-gray-900">Immigration Status Document</div>
              <div className="text-xs text-gray-500">Document uploaded</div>
            </div>
            <a
              href={`/files/${permitFileId}/download`}
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
                    await api('PUT', `/auth/users/${encodeURIComponent(userId)}/profile`, { permit_file_id: null });
                    toast.success('Immigration Status Document removed');
                    await refetch();
                    await queryClient.invalidateQueries({ queryKey: ['userProfile', userId] });
                  } catch (e: any) {
                    toast.error(e?.message || 'Failed to remove Immigration Status Document');
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
        <div>
          {canEdit ? (
            <>
              <input ref={fileRef} type="file" accept=".pdf,image/*" className="hidden" onChange={handleUpload} />
              <button
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="px-3 py-1.5 rounded border border-amber-300 text-amber-700 text-sm font-medium hover:bg-amber-50 disabled:opacity-50"
              >
                {uploading ? 'Uploading...' : 'Upload Document'}
              </button>
              {isRequired && !permitFileId && (
                <div className="text-xs text-red-600 mt-1">Immigration Status Document is required</div>
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
        {canEdit && !showInlineForm && (
          <button 
            onClick={() => setCreateOpen(true)} 
            className="px-3 py-1.5 rounded border border-amber-300 text-amber-700 text-sm font-medium hover:bg-amber-50"
          >
            Add Entry
          </button>
        )}
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
        <div className="text-sm text-gray-600 py-8 text-center">
          {isRequired ? 'Visa information is required' : 'No visa information. This is optional.'}
        </div>
      )}
      
      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="w-[600px] max-w-[95vw] bg-white rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b flex items-center justify-between">
              <div className="font-semibold">Add Visa Entry</div>
              <button 
                onClick={() => { setCreateOpen(false); }} 
                className="text-gray-500 hover:text-gray-700 text-2xl font-bold w-8 h-8 flex items-center justify-center rounded hover:bg-gray-100"
              >
                ×
              </button>
            </div>
            <div className="p-4 grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="text-xs text-gray-600">Visa Type *</label>
                <input 
                  className="border rounded px-3 py-2 w-full" 
                  value={visaType} 
                  onChange={e => setVisaType(e.target.value)} 
                  placeholder="e.g., Work Permit"
                />
              </div>
              <div>
                <label className="text-xs text-gray-600">Visa Number</label>
                <input 
                  className="border rounded px-3 py-2 w-full" 
                  value={visaNumber} 
                  onChange={e => setVisaNumber(e.target.value)} 
                />
              </div>
              <div>
                <label className="text-xs text-gray-600">Issuing Country</label>
                <input 
                  className="border rounded px-3 py-2 w-full" 
                  value={issuingCountry} 
                  onChange={e => setIssuingCountry(e.target.value)} 
                />
              </div>
              <div>
                <label className="text-xs text-gray-600">Issued Date</label>
                <input 
                  type="date"
                  className="border rounded px-3 py-2 w-full" 
                  value={issuedDate} 
                  onChange={e => setIssuedDate(e.target.value)} 
                />
              </div>
              <div>
                <label className="text-xs text-gray-600">Expiry Date</label>
                <input 
                  type="date"
                  className="border rounded px-3 py-2 w-full" 
                  value={expiryDate} 
                  onChange={e => setExpiryDate(e.target.value)} 
                />
              </div>
              <div>
                <label className="text-xs text-gray-600">Status</label>
                <select 
                  className="border rounded px-3 py-2 w-full" 
                  value={status} 
                  onChange={e => setStatus(e.target.value)}
                >
                  <option value="CURRENT">CURRENT</option>
                  <option value="EXPIRED">EXPIRED</option>
                  <option value="PENDING">PENDING</option>
                  <option value="Active">Active</option>
                </select>
              </div>
              <div className="col-span-2">
                <label className="text-xs text-gray-600">Notes</label>
                <input 
                  className="border rounded px-3 py-2 w-full" 
                  value={notes} 
                  onChange={e => setNotes(e.target.value)} 
                  placeholder="e.g., LMIA #9164748, Roofer"
                />
              </div>
              <div className="col-span-2 text-right">
                <button 
                  onClick={handleCreate}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-brand-red to-[#ee2b2b] text-white font-semibold"
                >
                  Create
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function UserDocuments({ userId, canEdit }:{ userId:string, canEdit:boolean }){
  const confirm = useConfirm();
  const { data:folders, refetch: refetchFolders } = useQuery({ queryKey:['user-folders', userId], queryFn: ()=> api<any[]>('GET', `/auth/users/${encodeURIComponent(userId)}/folders`) });
  const [activeFolderId, setActiveFolderId] = useState<string>('all');
  const { data:docs, refetch } = useQuery({ queryKey:['user-docs', userId, activeFolderId], queryFn: ()=> {
    const qs = activeFolderId!=='all'? (`?folder_id=${encodeURIComponent(activeFolderId)}`): '';
    return api<any[]>('GET', `/auth/users/${encodeURIComponent(userId)}/documents${qs}`);
  }});
  const [showUpload, setShowUpload] = useState(false);
  const [fileObj, setFileObj] = useState<File|null>(null);
  const [title, setTitle] = useState<string>('');
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderParentId, setNewFolderParentId] = useState<string| null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [renameFolder, setRenameFolder] = useState<{id:string, name:string}|null>(null);
  const [moveDoc, setMoveDoc] = useState<{id:string}|null>(null);
  const [renameDoc, setRenameDoc] = useState<{id:string, title:string}|null>(null);
  const [inlineRenameFolderId, setInlineRenameFolderId] = useState<string| null>(null);
  const [inlineRenameFolderName, setInlineRenameFolderName] = useState<string>('');
  const [selectMode, setSelectMode] = useState<boolean>(false);
  const [selectedDocIds, setSelectedDocIds] = useState<Set<string>>(new Set());
  const [preview, setPreview] = useState<{ url:string, title:string, ext:string }|null>(null);

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
      if(activeFolderId==='all'){ toast.error('Select a folder first'); return; }
      const name = fileObj.name; const type = fileObj.type || 'application/octet-stream';
      const up = await api('POST','/files/upload',{ original_name: name, content_type: type, employee_id: userId, project_id: null, client_id: null, category_id: userId });
      await fetch(up.upload_url, { method:'PUT', headers:{ 'Content-Type': type, 'x-ms-blob-type':'BlockBlob' }, body: fileObj });
      const conf = await api('POST','/files/confirm',{ key: up.key, size_bytes: fileObj.size, checksum_sha256: 'na', content_type: type });
      await api('POST', `/auth/users/${encodeURIComponent(userId)}/documents`, { folder_id: activeFolderId, title: title || name, file_id: conf.id });
      toast.success('Uploaded'); setShowUpload(false); setFileObj(null); setTitle(''); await refetch();
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
    const ok = await confirm({ title:'Delete file', message:`Are you sure you want to delete "${title||'file'}"?` });
    if(!ok) return;
    try{ await api('DELETE', `/auth/users/${encodeURIComponent(userId)}/documents/${encodeURIComponent(id)}`); await refetch(); }
    catch(_e){ toast.error('Delete failed'); }
  };
  const createFolder = async()=>{
    try{
      const name = newFolderName.trim(); if(!name){ toast.error('Folder name required'); return; }
      const body:any = { name };
      if(newFolderParentId) body.parent_id = newFolderParentId;
      const r = await api('POST', `/auth/users/${encodeURIComponent(userId)}/folders`, body);
      toast.success('Folder created'); setShowNewFolder(false); setNewFolderName(''); setNewFolderParentId(null); await refetchFolders();
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
      if(!moveDoc) return; if(activeFolderId==='all'){ toast.error('Open a folder to move into another'); return; }
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

  const topFolders = useMemo(()=> (folders||[]).filter((f:any)=> !f.parent_id), [folders]);
  const childFolders = useMemo(()=> (folders||[]).filter((f:any)=> f.parent_id===activeFolderId), [folders, activeFolderId]);
  const breadcrumb = useMemo(()=>{
    if(activeFolderId==='all') return [] as any[];
    const map = new Map<string, any>(); (folders||[]).forEach((f:any)=> map.set(f.id, f));
    const path: any[] = []; let cur = map.get(activeFolderId);
    while(cur){ path.unshift(cur); cur = cur.parent_id? map.get(cur.parent_id): null; }
    return path;
  }, [folders, activeFolderId]);

  return (
    <div>
      {activeFolderId==='all' ? (
        <>
          <div className="mb-3 flex items-center gap-2">
            <div className="text-sm font-semibold">Folders</div>
            {canEdit && <button onClick={()=> { setNewFolderParentId(null); setShowNewFolder(true); }} className="ml-auto px-3 py-2 rounded-lg border">New folder</button>}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-2">
            {topFolders.map((f:any)=> (
              <div key={f.id}
                   className="relative rounded-lg border p-3 h-28 bg-white hover:bg-gray-50 select-none group flex flex-col items-center justify-center"
                   onClick={(e)=>{
                     // avoid triggering when clicking action buttons
                     const target = e.target as HTMLElement; if(target.closest('.folder-actions')) return; setActiveFolderId(f.id);
                   }}
                   onDragOver={(e)=>{ e.preventDefault(); }}
                   onDrop={async(e)=>{ e.preventDefault();
                     const movedDocId = e.dataTransfer.getData('application/x-mkhub-doc');
                     if(movedDocId){
                       try{ await api('PUT', `/auth/users/${encodeURIComponent(userId)}/documents/${encodeURIComponent(movedDocId)}`, { folder_id: f.id }); toast.success('Moved'); if(activeFolderId===f.id){ await refetch(); } else { setActiveFolderId(f.id); } }
                       catch(_e){ toast.error('Failed to move'); }
                       return;
                     }
                     if(e.dataTransfer.files?.length){ const arr=Array.from(e.dataTransfer.files); for(const file of arr){ await uploadToFolder(f.id, file); } toast.success('Uploaded'); }
                   }}>
                 <div className="text-4xl">📁</div>
                 <div className="mt-1 text-sm font-medium truncate text-center w-full" title={f.name}>
                  {inlineRenameFolderId===f.id ? (
                    <input autoFocus className="border rounded px-2 py-1 w-full"
                           value={inlineRenameFolderName}
                           onChange={e=> setInlineRenameFolderName(e.target.value)}
                           onBlur={async()=>{ if(inlineRenameFolderName.trim()){ await api('PUT', `/auth/users/${encodeURIComponent(userId)}/folders/${encodeURIComponent(f.id)}`, { name: inlineRenameFolderName.trim() }); await refetchFolders(); } setInlineRenameFolderId(null); }}
                           onKeyDown={async(e)=>{ if(e.key==='Enter'){ (e.target as HTMLInputElement).blur(); } if(e.key==='Escape'){ setInlineRenameFolderId(null); } }}
                    />
                  ) : f.name}
                </div>
                {canEdit && (
                  <div className="folder-actions absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                    <button title="Rename" className="p-1 rounded hover:bg-gray-100" onClick={()=> { setInlineRenameFolderId(f.id); setInlineRenameFolderName(f.name); }}>✏️</button>
                    <button title="Delete" className="p-1 rounded hover:bg-gray-100 text-red-600" onClick={()=> removeFolder(f.id)}>🗑️</button>
                  </div>
                )}
              </div>
            ))}
            {!topFolders.length && <div className="text-sm text-gray-600">No folders yet</div>}
          </div>
        </>
      ) : (
        <>
          <div className="mb-3 flex items-center gap-2">
            <button title="Home" onClick={()=> setActiveFolderId('all')} className="px-2 py-2 rounded-lg border">🏠</button>
            <button
              title="Up one level"
              onClick={()=>{
                if (breadcrumb.length>1){ setActiveFolderId(breadcrumb[breadcrumb.length-2].id); } else { setActiveFolderId('all'); }
              }}
              className="px-2 py-2 rounded-lg border"
            >⬆️</button>
            <div className="text-sm font-semibold flex gap-2 items-center">
              {breadcrumb.map((f:any, idx:number)=> (
                <span key={f.id} className="flex items-center gap-2">
                  {idx>0 && <span className="opacity-60">/</span>}
                  <button className="underline" onClick={()=> setActiveFolderId(f.id)}>{f.name}</button>
                </span>
              ))}
            </div>
            {canEdit && <>
              <button onClick={()=> { setNewFolderParentId(activeFolderId); setShowNewFolder(true); }} className="ml-auto px-3 py-2 rounded-lg border">New subfolder</button>
              <button onClick={()=> setShowUpload(true)} className="px-3 py-2 rounded-lg bg-brand-red text-white">Add file</button>
            </>}
          </div>
          <div
            className={`rounded-lg border ${isDragging? 'ring-2 ring-brand-red':''}`}
            onDragEnter={(e)=>{ e.preventDefault(); setIsDragging(true); }}
            onDragOver={(e)=>{ e.preventDefault(); setIsDragging(true); }}
            onDragLeave={(e)=>{ e.preventDefault(); setIsDragging(false); }}
            onDrop={async(e)=>{ e.preventDefault(); setIsDragging(false); const files = Array.from(e.dataTransfer.files||[]); if(!files.length) return; for(const file of files){ await uploadToFolder(activeFolderId, file as File); } toast.success('Uploaded'); await refetch(); }}
          >
            <div className="p-4">
              {childFolders.length>0 && (
                <div className="mb-3">
                  <div className="text-xs text-gray-600 mb-1">Subfolders</div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-2">
                    {childFolders.map((f:any)=> (
                      <div key={f.id}
                           className="relative rounded-lg border p-3 h-28 bg-white hover:bg-gray-50 select-none group flex flex-col items-center justify-center"
                           onClick={(e)=>{ const t=e.target as HTMLElement; if(t.closest('.folder-actions')) return; setActiveFolderId(f.id); }}
                           onDragOver={(e)=>{ e.preventDefault(); }}
                           onDrop={async(e)=>{ e.preventDefault();
                             const movedDocId = e.dataTransfer.getData('application/x-mkhub-doc');
                             if(movedDocId){
                               try{ await api('PUT', `/auth/users/${encodeURIComponent(userId)}/documents/${encodeURIComponent(movedDocId)}`, { folder_id: f.id }); toast.success('Moved'); if(activeFolderId===f.id){ await refetch(); } else { setActiveFolderId(f.id); } }
                               catch(_e){ toast.error('Failed to move'); }
                               return;
                             }
                             if(e.dataTransfer.files?.length){ const arr=Array.from(e.dataTransfer.files); for(const file of arr){ await uploadToFolder(f.id, file); } toast.success('Uploaded'); }
                           }}>
                        <div className="text-4xl">📁</div>
                        <div className="mt-1 text-sm font-medium truncate text-center w-full" title={f.name}>
                          {inlineRenameFolderId===f.id ? (
                            <input autoFocus className="border rounded px-2 py-1 w-full"
                                   value={inlineRenameFolderName}
                                   onChange={e=> setInlineRenameFolderName(e.target.value)}
                                   onBlur={async()=>{ if(inlineRenameFolderName.trim()){ await api('PUT', `/auth/users/${encodeURIComponent(userId)}/folders/${encodeURIComponent(f.id)}`, { name: inlineRenameFolderName.trim() }); await refetchFolders(); } setInlineRenameFolderId(null); }}
                                   onKeyDown={async(e)=>{ if(e.key==='Enter'){ (e.target as HTMLInputElement).blur(); } if(e.key==='Escape'){ setInlineRenameFolderId(null); } }}
                            />
                          ) : f.name}
                        </div>
                        {canEdit && (
                          <div className="folder-actions absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                            <button title="Rename" className="p-1 rounded hover:bg-gray-100" onClick={()=> { setInlineRenameFolderId(f.id); setInlineRenameFolderName(f.name); }}>✏️</button>
                            <button title="Delete" className="p-1 rounded hover:bg-gray-100 text-red-600" onClick={()=> removeFolder(f.id)}>🗑️</button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="mb-3 flex items-center gap-2">
                <div className="text-xs text-gray-600">Drag & drop files anywhere below to upload into this folder</div>
                {canEdit && <button className="ml-auto text-sm px-3 py-1.5 rounded border" onClick={()=> { setSelectMode(s=> !s); if(selectMode) setSelectedDocIds(new Set()); }}>{selectMode? 'Done':'Select'}</button>}
              </div>
              {selectMode && selectedDocIds.size>0 && (
                <div className="mb-3 flex items-center gap-2">
                  <div className="text-sm">{selectedDocIds.size} selected</div>
                  <select id="bulk-move-target" className="border rounded px-2 py-1">
                    <option value="" disabled selected>Select destination</option>
                    {(folders||[]).map((f:any)=> <option key={f.id} value={f.id}>{f.name}</option>)}
                  </select>
                  <button className="px-3 py-1.5 rounded bg-brand-red text-white" onClick={async()=>{
                    const sel = (document.getElementById('bulk-move-target') as HTMLSelectElement);
                    const dest = sel?.value || '';
                    if(!dest){ toast.error('Select destination folder'); return; }
                    try{
                      for(const id of Array.from(selectedDocIds)){ await api('PUT', `/auth/users/${encodeURIComponent(userId)}/documents/${encodeURIComponent(id)}`, { folder_id: dest }); }
                      toast.success('Moved'); setSelectedDocIds(new Set()); await refetch();
                    }catch(_e){ toast.error('Failed'); }
                  }}>Move</button>
                  <button className="px-3 py-1.5 rounded border" onClick={()=> setSelectedDocIds(new Set())}>Clear</button>
                </div>
              )}
              <div className="rounded-lg border overflow-hidden bg-white">
                {(docs||[]).map((d:any)=> (
                  <div key={d.id} className={`flex items-center gap-3 px-3 py-2 hover:bg-gray-50 ${selectMode && selectedDocIds.has(d.id)? 'bg-red-50':''}`} draggable={canEdit}
                       onDragStart={(e)=>{ try{ e.dataTransfer.setData('application/x-mkhub-doc', d.id); e.dataTransfer.effectAllowed='move'; }catch(_){} }}>
                    {selectMode && (
                      <input type="checkbox" className="mr-1" checked={selectedDocIds.has(d.id)} onChange={(e)=>{
                        setSelectedDocIds(prev=>{ const next = new Set(prev); if(e.target.checked) next.add(d.id); else next.delete(d.id); return next; });
                      }} />
                    )}
                    {(()=>{ const ext=fileExt(d.title).toUpperCase(); const s=extStyle(ext);
                      return (
                        <div className={`w-10 h-12 rounded-lg ${s.bg} ${s.txt} flex items-center justify-center text-[10px] font-extrabold select-none`}>{ext||'FILE'}</div>
                      ); })()}
                    <div className="flex-1 min-w-0" onClick={async()=>{
                      try{
                        const r:any = await api('GET', `/files/${encodeURIComponent(d.file_id)}/download`);
                        const ext = fileExt(d.title);
                        setPreview({ url: r.download_url||'', title: d.title||'Preview', ext });
                      }catch(_e){ toast.error('Preview not available'); }
                    }}>
                      <div className="font-medium truncate cursor-pointer hover:underline">{d.title||'Document'}</div>
                      <div className="text-[11px] text-gray-600 truncate">Uploaded {String(d.created_at||'').slice(0,10)}</div>
                    </div>
                    <div className="ml-auto flex items-center gap-1">
                      <a title="Download" className="p-2 rounded hover:bg-gray-100" href={`/files/${d.file_id}/download`} target="_blank">⬇️</a>
                      {canEdit && <>
                        <button title="Rename" onClick={()=> setRenameDoc({ id: d.id, title: d.title||'' })} className="p-2 rounded hover:bg-gray-100">✏️</button>
                        <button title="Move" onClick={()=> setMoveDoc({ id: d.id })} className="p-2 rounded hover:bg-gray-100">📁</button>
                        <button title="Delete" onClick={()=>del(d.id, d.title)} className="p-2 rounded hover:bg-gray-100 text-red-600">🗑️</button>
                      </>}
                    </div>
                  </div>
                ))}
                {!(docs||[]).length && <div className="px-3 py-3 text-sm text-gray-600">No documents in this folder</div>}
              </div>
            </div>
          </div>
        </>
      )}

      {showUpload && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl w-full max-w-md p-4">
            <div className="text-lg font-semibold mb-2">Add file</div>
            <div className="space-y-3">
              <div>
                <div className="text-xs text-gray-600">Folder</div>
                <select className="border rounded px-3 py-2 w-full" value={activeFolderId==='all'? '': activeFolderId} onChange={e=> setActiveFolderId(e.target.value||'all')}>
                  <option value="">Select a folder</option>
                  {(folders||[]).map((f:any)=> <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
              </div>
              <div>
                <div className="text-xs text-gray-600">Title</div>
                <input className="border rounded px-3 py-2 w-full" value={title} onChange={e=> setTitle(e.target.value)} placeholder="Optional title" />
              </div>
              <div>
                <div className="text-xs text-gray-600">File</div>
                <input type="file" onChange={e=> setFileObj(e.target.files?.[0]||null)} />
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={()=>setShowUpload(false)} className="px-3 py-2 rounded border">Cancel</button>
              <button onClick={upload} className="px-3 py-2 rounded bg-brand-red text-white">Upload</button>
            </div>
          </div>
        </div>
      )}

      {showNewFolder && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl w-full max-w-sm p-4">
            <div className="text-lg font-semibold mb-2">{newFolderParentId? 'New subfolder':'New folder'}</div>
            <div>
              <div className="text-xs text-gray-600">Folder name</div>
              <input className="border rounded px-3 py-2 w-full" value={newFolderName} onChange={e=> setNewFolderName(e.target.value)} placeholder="e.g., Hiring pack" />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={()=>setShowNewFolder(false)} className="px-3 py-2 rounded border">Cancel</button>
              <button onClick={createFolder} className="px-3 py-2 rounded bg-brand-red text-white">Create</button>
            </div>
          </div>
        </div>
      )}

      {renameFolder && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl w-full max-w-sm p-4">
            <div className="text-lg font-semibold mb-2">Rename folder</div>
            <div>
              <div className="text-xs text-gray-600">Folder name</div>
              <input className="border rounded px-3 py-2 w-full" value={renameFolder.name} onChange={e=> setRenameFolder({ id: renameFolder.id, name: e.target.value })} />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={()=>setRenameFolder(null)} className="px-3 py-2 rounded border">Cancel</button>
              <button onClick={doRenameFolder} className="px-3 py-2 rounded bg-brand-red text-white">Save</button>
            </div>
          </div>
        </div>
      )}

      {moveDoc && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl w-full max-w-sm p-4">
            <div className="text-lg font-semibold mb-2">Move file</div>
            <div>
              <div className="text-xs text-gray-600">Destination folder</div>
              <select id="move-target" className="border rounded px-3 py-2 w-full" defaultValue="">
                <option value="" disabled>Select...</option>
                {(folders||[]).map((f:any)=> <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={()=>setMoveDoc(null)} className="px-3 py-2 rounded border">Cancel</button>
              <button onClick={doMoveDoc} className="px-3 py-2 rounded bg-brand-red text-white">Move</button>
            </div>
          </div>
        </div>
      )}

      {renameDoc && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl w-full max-w-sm p-4">
            <div className="text-lg font-semibold mb-2">Rename file</div>
            <div>
              <div className="text-xs text-gray-600">Title</div>
              <input className="border rounded px-3 py-2 w-full" value={renameDoc.title} onChange={e=> setRenameDoc({ id: renameDoc.id, title: e.target.value })} />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={()=>setRenameDoc(null)} className="px-3 py-2 rounded border">Cancel</button>
              <button onClick={doRenameDoc} className="px-3 py-2 rounded bg-brand-red text-white">Save</button>
            </div>
          </div>
        </div>
      )}

      {preview && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={()=> setPreview(null)}>
          <div className="bg-white rounded-xl w-[92vw] h-[88vh] p-3 relative" onClick={(e)=> e.stopPropagation()}>
            <div className="flex items-center justify-between mb-2">
              <div className="font-semibold truncate mr-4">{preview.title}</div>
              <button onClick={()=> setPreview(null)} className="px-3 py-1.5 rounded border">Close</button>
            </div>
            <div className="w-full h-[calc(100%-40px)] border rounded overflow-hidden bg-gray-50">
              {['png','jpg','jpeg','webp','gif','bmp','svg'].includes(preview.ext) ? (
                <img src={preview.url} className="w-full h-full object-contain" />
              ) : preview.ext==='pdf' ? (
                <iframe src={preview.url} className="w-full h-full" />
              ) : (
                <div className="p-6 text-sm text-gray-600">Preview not available. <a className="underline" href={preview.url} target="_blank">Download</a></div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

