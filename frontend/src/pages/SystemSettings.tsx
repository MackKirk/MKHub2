import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useMemo, useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Settings } from 'lucide-react';
import {
  AppPageHeader,
  AppCard,
  AppTabs,
  AppButton,
  AppInput,
  AppTextarea,
  AppEmptyState,
  uiCx,
  uiSpacing,
  uiTypography,
  uiLayout,
  uiBorders,
  uiColors,
  uiRadius,
} from '@/components/ui';
import { useConfirm } from '@/components/ConfirmProvider';
import DocumentTemplatesTab from '@/components/DocumentTemplatesTab';
import DocumentTypesTab from '@/components/DocumentTypesTab';
import SettingsLookupListsPanel from '@/components/settings/SettingsLookupListsPanel';
import SettingsFilesAssetsPanel from '@/components/settings/SettingsFilesAssetsPanel';
import {
  IMPLEMENTED_PERMISSIONS,
  isHiddenPermissionKey,
  isConstructionProjectPermissionKey,
  isRepairsProjectPermissionKey,
} from '@/lib/implementedPermissions';
import {
  applyPermissionUncheckCascadeSet,
  canEnablePermissionSet,
} from '@/lib/permissionDependencies';
import { CustomerPermissionsGrid } from '@/components/CustomerPermissionsGrid';
import { SupplierPermissionsGrid } from '@/components/SupplierPermissionsGrid';
import { ProductPermissionsGrid } from '@/components/ProductPermissionsGrid';
import { FleetPermissionsPanel } from '@/components/FleetPermissionsPanel';
import { CompanyAssetsPermissionsPanel } from '@/components/CompanyAssetsPermissionsPanel';
import { DocumentsPermissionsPanel } from '@/components/DocumentsPermissionsPanel';
import { HrPermissionsPanel } from '@/components/HrPermissionsPanel';
import { TrainingPermissionsPanel } from '@/components/TrainingPermissionsPanel';
import { ProjectLinePermissionsGrid } from '@/components/ProjectLinePermissionsGrid';
import {
  applyCustomerAccessLevelToKeySet,
  type CustomerAccessLevel,
} from '@/lib/customerPermissions';
import {
  applySupplierAccessLevelToKeySet,
  type SupplierAccessLevel,
} from '@/lib/supplierPermissions';
import {
  applyProductAccessLevelToKeySet,
  type ProductAccessLevel,
} from '@/lib/productPermissions';
import {
  applyFleetAccessLevelToKeySet,
  applyFleetAssignToKeySet,
  filterFleetAreaPermissions,
  syncFleetAccessInKeySet,
  type FleetAccessLevel,
} from '@/lib/fleetPermissions';
import {
  applyCompanyAssetsAccessLevelToKeySet,
  filterCompanyAssetsAreaPermissions,
  syncCompanyAssetsAccessInKeySet,
  type CompanyAssetsAccessLevel,
} from '@/lib/companyAssetsPermissions';
import {
  applyDocumentsAccessLevelToKeySet,
  filterDocumentsAreaPermissions,
  syncDocumentsAccessInKeySet,
  type DocumentsAccessLevel,
} from '@/lib/documentsPermissions';
import {
  applyHrAccessLevelToKeySet,
  applyHrWriteOnlyToKeySet,
  syncHrAccessInKeySet,
  type HrAccessLevel,
} from '@/lib/hrPermissions';
import {
  applyTrainingAccessLevelToKeySet,
  filterTrainingAreaPermissions,
  syncTrainingAccessInKeySet,
  type TrainingAccessLevel,
} from '@/lib/trainingPermissions';
import {
  applyProjectLineAccessLevelToKeySet,
  type ProjectLinePermissionRow,
} from '@/lib/projectLinePermissions';
import type { PermissionAccessLevel } from '@/lib/permissionAccessLevel';

type Item = { id:string, label:string, value?:string, sort_index?:number, meta?: any };

type SettingsSection = 'files' | 'templates' | 'lists';

export default function SystemSettings(){
  const [searchParams, setSearchParams] = useSearchParams();

  const todayLabel = useMemo(() => {
    return new Date().toLocaleDateString('en-CA', {
      weekday: 'long',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }, []);

  const [section, setSection] = useState<SettingsSection>('lists');

  useEffect(() => {
    const raw = (searchParams.get('section') || '').toLowerCase();
    if (raw === 'templates' || raw === 'files' || raw === 'lists') {
      setSection(raw as SettingsSection);
    } else if (!raw) {
      setSection('lists');
    }
  }, [searchParams]);

  const handleSectionTab = (id: SettingsSection) => {
    setSection(id);
    const next = new URLSearchParams(searchParams);
    if (id === 'lists') {
      next.delete('section');
    } else {
      next.set('section', id);
      next.delete('list');
    }
    if (id !== 'files') next.delete('view');
    setSearchParams(next, { replace: true });
  };

  const sectionTabs: { id: SettingsSection; label: string }[] = [
    { id: 'lists', label: 'Lookup lists' },
    { id: 'files', label: 'Files & assets' },
    { id: 'templates', label: 'Templates' },
  ];

  return (
    <div className={uiCx(uiSpacing.pageStack, 'bg-gray-50')}>
      <AppPageHeader
        title="System settings"
        subtitle="Administration for lookup lists, files & assets, and templates used across MKHub."
        icon={<Settings className="h-4 w-4" />}
        actions={
          <div className="text-right shrink-0">
            <div className={uiTypography.overline}>Today</div>
            <div className={uiCx('text-xs font-semibold', uiColors.textBody)}>{todayLabel}</div>
          </div>
        }
      />

      <AppCard bodyClassName={uiSpacing.compactCardPadding}>
        <AppTabs
          tabs={sectionTabs.map((t) => ({ key: t.id, label: t.label }))}
          value={section}
          onChange={(key) => handleSectionTab(key as SettingsSection)}
        />
      </AppCard>

      {section === 'lists' && <SettingsLookupListsPanel />}

      {section === 'files' && <SettingsFilesAssetsPanel />}

      {section === 'templates' && (
        <div className={uiSpacing.pageStack}>
          <div className="grid gap-4 xl:grid-cols-2 xl:items-start">
            <AppCard
              title="Permission templates"
              subtitle="Apply bundles of permissions from a user's Permissions tab."
              className="min-w-0"
            >
              <PermissionTemplatesSection />
            </AppCard>
            <AppCard
              title="Terms templates"
              subtitle="Preset terms for proposals and quotes."
              className="min-w-0"
            >
              <TermsTemplatesSection />
            </AppCard>
          </div>
          <AppCard
            title="Document creator — background templates"
            subtitle="Page backgrounds (images) used when building documents in the Document creator (sidebar → Documents)."
            className="min-w-0"
          >
            <DocumentTemplatesTab />
          </AppCard>
          <AppCard
            title="Document creator — document templates"
            subtitle="Preset layouts (ordered pages with backgrounds and fields) offered when creating a new document."
            className="min-w-0"
          >
            <DocumentTypesTab />
          </AppCard>
        </div>
      )}
    </div>
  );
}

// Permission Templates Section Component
type PermTemplate = { id: string; name: string; permission_keys: string[] };
type PermDefItem = { id: string; key: string; label: string; description?: string };
type PermDefCategory = { id: string; name: string; label: string; description?: string; permissions: PermDefItem[] };

function PermissionTemplatesSection() {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const { data: templates = [], isLoading: loadingTemplates } = useQuery({
    queryKey: ['permission-templates'],
    queryFn: () => api<PermTemplate[]>('GET', '/permissions/templates'),
  });
  const { data: definitions = [] } = useQuery({
    queryKey: ['permission-definitions'],
    queryFn: () => api<PermDefCategory[]>('GET', '/permissions/definitions'),
  });
  const [newName, setNewName] = useState('');
  const [newSelectedKeys, setNewSelectedKeys] = useState<Set<string>>(new Set());
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, { name: string; selectedKeys: Set<string> }>>({});
  // Expandable categories for permission list (same as UserInfo): start collapsed
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  // Process definitions like UserInfo: Construction + Repairs + Business + Quotations.
  const processedDefinitions = useMemo(() => {
    const raw = (definitions || []) as PermDefCategory[];
    const processed: PermDefCategory[] = [];
    let businessCat: PermDefCategory | null = null;
    let inventoryCat: PermDefCategory | null = null;
    let quotationsCat: PermDefCategory | null = null;
    raw.forEach((cat) => {
      if (cat.name === 'business') {
        const constructionPerms = (cat.permissions || []).filter((p) => isConstructionProjectPermissionKey(p.key));
        const repairsPerms = (cat.permissions || []).filter((p) => isRepairsProjectPermissionKey(p.key));
        const hasCustomers = (cat.permissions || []).some((p) => p.key.includes('business:customers'));
        if (constructionPerms.length > 0) {
          processed.push({
            ...cat,
            id: 'construction',
            name: 'construction',
            label: 'Production (Sales)',
            description: cat.description || 'Permissions for Business area. Blocking access blocks all sub-permissions.',
            permissions: constructionPerms,
          });
        }
        if (repairsPerms.length > 0) {
          processed.push({
            ...cat,
            id: 'repairs_maintenance',
            name: 'repairs_maintenance',
            label: 'Repairs & Maintenance',
            description: cat.description || 'Permissions for Business area. Blocking access blocks all sub-permissions.',
            permissions: repairsPerms,
          });
        }
        if (hasCustomers) {
          businessCat = { ...cat, permissions: (cat.permissions || []).filter((p) => p.key.includes('business:customers')) };
        }
      } else if (cat.name === 'inventory') {
        inventoryCat = cat;
      } else if (cat.name === 'sales') {
        quotationsCat = cat;
      } else if (cat.name === 'fleet') {
        const fleetOnlyPerms = filterFleetAreaPermissions(cat.permissions || []);
        if (fleetOnlyPerms.length > 0) {
          processed.push({
            ...cat,
            id: 'fleet',
            name: 'fleet',
            label: 'Fleet',
            description: 'Fleet dashboard, assets, work orders, and inspections.',
            permissions: fleetOnlyPerms,
          });
        }
      } else if (cat.name === 'company_assets') {
        processed.push({
          ...cat,
          id: 'company_assets',
          name: 'company_assets',
          label: 'Company Assets',
          description: 'Equipment and corporate cards.',
          permissions: filterCompanyAssetsAreaPermissions(cat.permissions || []),
        });
      } else if (cat.name === 'documents') {
        processed.push({
          ...cat,
          id: 'documents',
          name: 'documents',
          label: 'Company Files',
          description: 'Company files library — view, upload, move, and delete.',
          permissions: filterDocumentsAreaPermissions(cat.permissions || []),
        });
      } else if (cat.name === 'training') {
        processed.push({
          ...cat,
          label: 'Training & Learning',
          description: 'Organization training dashboard and LMS administration.',
          permissions: filterTrainingAreaPermissions(cat.permissions || []),
        });
      } else if (cat.name === 'work_orders' || cat.name === 'inspections') {
        // Legacy categories — superseded by fleet:* keys in UI
      } else {
        processed.push(cat);
      }
    });
    if (businessCat || inventoryCat) {
      const combined = [
        ...(businessCat?.permissions || []),
        ...(inventoryCat?.permissions || []),
      ].filter((p) => p.key !== 'business:access' && !isHiddenPermissionKey(p.key));
      if (combined.length > 0) {
        const insert = {
          id: 'business',
          name: 'business',
          label: 'Business',
          description: inventoryCat?.description || 'Customers, suppliers, and products permissions.',
          permissions: combined,
        };
        processed.push(insert);
      }
    }
    const normalizedQuotations: PermDefCategory = {
      id: 'quotations',
      name: 'quotations',
      label: 'Quotations',
      description:
        quotationsCat?.description ||
        'Permissions for Quotations area. Blocking access blocks all sub-permissions.',
      permissions: quotationsCat?.permissions || [],
    };
    processed.push(normalizedQuotations);
    const orderedPrimaryNames = ['construction', 'repairs_maintenance', 'business', 'quotations'];
    const primaryCategories = orderedPrimaryNames
      .map((name) => processed.find((c) => c.name === name))
      .filter(Boolean) as PermDefCategory[];
    const remainingCategories = processed.filter((c) => !orderedPrimaryNames.includes(c.name));
    return [...primaryCategories, ...remainingCategories];
  }, [definitions]);


  const toggleKey = (key: string, set: Set<string>) => {
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  };

  // Same as UserInfo: whether this permission can be enabled given current selection (dependencies met)
  const canEnableEditPermission = (permKey: string, selectedKeys: Set<string>): boolean =>
    canEnablePermissionSet(permKey, selectedKeys);

  const applyCascadeUncheck = (uncheckedKey: string, current: Set<string>): Set<string> =>
    applyPermissionUncheckCascadeSet(uncheckedKey, current);

  const createMutation = useMutation({
    mutationFn: (payload: { name: string; permission_keys: string[] }) =>
      api('POST', '/permissions/templates', payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['permission-templates'] });
      setNewName('');
      setNewSelectedKeys(new Set());
      toast.success('Permission template created');
    },
    onError: (e: any) => toast.error(e?.message || 'Failed to create'),
  });

  const updateMutation = useMutation({
    mutationFn: (payload: { id: string; name?: string; permission_keys?: string[] }) =>
      api('PUT', `/permissions/templates/${payload.id}`, { name: payload.name, permission_keys: payload.permission_keys }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['permission-templates'] });
      setEdits({});
      setExpandedId(null);
      toast.success('Updated');
    },
    onError: (e: any) => toast.error(e?.message || 'Failed to update'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api('DELETE', `/permissions/templates/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['permission-templates'] });
      setExpandedId(null);
      setEdits({});
      toast.success('Deleted');
    },
    onError: (e: any) => toast.error(e?.message || 'Failed to delete'),
  });

  const duplicateMutation = useMutation({
    mutationFn: (id: string) => api('POST', `/permissions/templates/${id}/duplicate`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['permission-templates'] });
      toast.success('Template duplicated');
    },
    onError: (e: any) => toast.error(e?.message || 'Failed to duplicate'),
  });

  const getEdit = (t: PermTemplate) => {
    const e = edits[t.id];
    if (e) return e;
    return {
      name: t.name,
      selectedKeys: syncTrainingAccessInKeySet(syncHrAccessInKeySet(
        syncDocumentsAccessInKeySet(
          syncFleetAccessInKeySet(
            syncCompanyAssetsAccessInKeySet(new Set(t.permission_keys || [])),
          ),
        ),
      )),
    };
  };

  // Same layout as UserInfo permissions: expandable sections with chevron, VIEW/EDIT columns, same classes
  const renderPermissionCheckboxes = (
    selectedKeys: Set<string>,
    onChange: (next: Set<string>) => void,
    disabled?: boolean
  ) => {
    const toggleExpand = (categoryId: string) => {
      setExpandedCategories((prev) => {
        const next = new Set(prev);
        if (next.has(categoryId)) next.delete(categoryId);
        else next.add(categoryId);
        return next;
      });
    };
    const handlePermToggle = (key: string) => {
      let next = toggleKey(key, selectedKeys);
      if (!next.has(key)) next = applyCascadeUncheck(key, next);
      next = syncCompanyAssetsAccessInKeySet(next);
      next = syncDocumentsAccessInKeySet(next);
      next = syncFleetAccessInKeySet(next);
      next = syncHrAccessInKeySet(next);
      next = syncTrainingAccessInKeySet(next);
      onChange(next);
    };
    const permRow = (perm: PermDefItem, indent = false) => {
      const isChecked = selectedKeys.has(perm.key);
      const canEnable = canEnableEditPermission(perm.key, selectedKeys);
      const checkboxDisabled = disabled || (!isChecked && !canEnable);
      return (
        <label
          key={perm.id}
          className={`flex items-start gap-1.5 p-1.5 rounded bg-white ${checkboxDisabled ? 'cursor-default' : 'hover:bg-gray-50 cursor-pointer'} ${indent ? 'ml-4' : ''}`}
        >
          <input
            type="checkbox"
            checked={isChecked}
            onChange={() => handlePermToggle(perm.key)}
            disabled={checkboxDisabled}
            className="mt-0.5 w-3.5 h-3.5 rounded border-gray-300 text-brand-red focus:ring-brand-red flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
          />
          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium text-gray-900 flex items-center gap-1.5">
              <span className="truncate">{perm.label}</span>
              {!IMPLEMENTED_PERMISSIONS.has(perm.key) && (
                <span className="text-[10px] px-1 py-0.5 bg-yellow-100 text-yellow-800 rounded border border-yellow-300 flex-shrink-0">[WIP]</span>
              )}
            </div>
            {perm.description && (
              <div className="text-[10px] text-gray-500 mt-0.5 line-clamp-1">{perm.description}</div>
            )}
          </div>
        </label>
      );
    };
    const viewEditBlock = (viewPerms: PermDefItem[], editPerms: PermDefItem[], subViewIndent = false, subEditIndent = false) => (
      <div className="grid md:grid-cols-2 gap-2.5">
        {viewPerms.length > 0 && (
          <div className="space-y-1.5">
            <div className="text-[10px] font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">View</div>
            {viewPerms.map((p) => permRow(p, subViewIndent))}
          </div>
        )}
        {editPerms.length > 0 && (
          <div className="space-y-1.5">
            <div className="text-[10px] font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">Edit</div>
            {editPerms.map((p) => permRow(p, subEditIndent))}
          </div>
        )}
      </div>
    );

    return (
      <div className="space-y-6">
        {processedDefinitions.map((cat) => {
          const areaAccessPerm = (cat.permissions || []).find(
            (p) =>
              p.key.endsWith(':access') &&
              p.key !== 'business:access' &&
              !isHiddenPermissionKey(p.key)
          );
          const subPermissions = (cat.permissions || []).filter(
            (p) =>
              p.key !== 'business:access' &&
              !p.key.endsWith(':access') &&
              !isHiddenPermissionKey(p.key)
          );
          const isExpanded = expandedCategories.has(cat.id);

          return (
            <div key={cat.id} className="border rounded-lg overflow-hidden">
              {/* Expandable header with chevron (same as UserInfo) */}
              <div
                className="p-3 cursor-pointer hover:bg-gray-50 transition-colors flex items-center gap-2"
                onClick={() => toggleExpand(cat.id)}
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
                  <h4 className="text-xs font-semibold text-gray-900">{cat.label}</h4>
                  {cat.description && (
                    <p className="text-[10px] text-gray-500 mt-0.5">{cat.description}</p>
                  )}
                </div>
              </div>

              {isExpanded && subPermissions.length > 0 && (
                <div className="px-4 pb-4 border-t border-gray-200 pt-3 mt-0">
                  {cat.name === 'construction' ? (
                    (() => {
                      const areaPerms = subPermissions.filter((p) =>
                        p.key.startsWith('business:construction:projects')
                      );
                      if (areaPerms.length === 0) return null;
                      const scopeKeys = areaPerms.map((p) => p.key);
                      const permRecord = Object.fromEntries([...selectedKeys].map((k) => [k, true]));
                      return (
                        <ProjectLinePermissionsGrid
                          line="construction"
                          areaPerms={areaPerms}
                          permissions={permRecord}
                          canEdit={!disabled}
                          onAccessLevelChange={(row, level) => {
                            onChange(
                              applyProjectLineAccessLevelToKeySet(
                                selectedKeys,
                                scopeKeys,
                                'construction',
                                areaPerms,
                                row,
                                level
                              )
                            );
                          }}
                        />
                      );
                    })()
                  ) : cat.name === 'repairs_maintenance' ? (
                    (() => {
                      const areaPerms = subPermissions.filter((p) =>
                        p.key.startsWith('business:rm:projects')
                      );
                      if (areaPerms.length === 0) return null;
                      const scopeKeys = areaPerms.map((p) => p.key);
                      const permRecord = Object.fromEntries([...selectedKeys].map((k) => [k, true]));
                      return (
                        <ProjectLinePermissionsGrid
                          line="repairs"
                          areaPerms={areaPerms}
                          permissions={permRecord}
                          canEdit={!disabled}
                          onAccessLevelChange={(row, level) => {
                            onChange(
                              applyProjectLineAccessLevelToKeySet(
                                selectedKeys,
                                scopeKeys,
                                'repairs',
                                areaPerms,
                                row,
                                level
                              )
                            );
                          }}
                        />
                      );
                    })()
                  ) : cat.name === 'business' ? (
                    <div className="space-y-4">
                      {areaAccessPerm && permRow(areaAccessPerm)}
                      {(() => {
                        const areaPerms = subPermissions.filter((p) =>
                          p.key.startsWith('business:customers:')
                        );
                        const permRecord = Object.fromEntries(
                          [...selectedKeys].map((k) => [k, true])
                        );
                        const customerKeys = areaPerms.map((p) => p.key);
                        return (
                          <CustomerPermissionsGrid
                            areaPerms={areaPerms}
                            permissions={permRecord}
                            canEdit={!disabled}
                            onAccessLevelChange={(readKey, writeKey, level: CustomerAccessLevel) => {
                              onChange(
                                applyCustomerAccessLevelToKeySet(
                                  selectedKeys,
                                  customerKeys,
                                  readKey,
                                  writeKey,
                                  level
                                )
                              );
                            }}
                          />
                        );
                      })()}
                      {(() => {
                        const areaPerms = subPermissions.filter((p) =>
                          p.key.startsWith('inventory:suppliers:')
                        );
                        if (areaPerms.length === 0) return null;
                        const permRecord = Object.fromEntries([...selectedKeys].map((k) => [k, true]));
                        const supplierKeys = areaPerms.map((p) => p.key);
                        return (
                          <SupplierPermissionsGrid
                            areaPerms={areaPerms}
                            permissions={permRecord}
                            canEdit={!disabled}
                            onAccessLevelChange={(readKey, writeKey, level: SupplierAccessLevel) => {
                              onChange(
                                applySupplierAccessLevelToKeySet(
                                  selectedKeys,
                                  supplierKeys,
                                  readKey,
                                  writeKey,
                                  level
                                )
                              );
                            }}
                          />
                        );
                      })()}
                      {(() => {
                        const areaPerms = subPermissions.filter((p) =>
                          p.key.startsWith('inventory:products:')
                        );
                        if (areaPerms.length === 0) return null;
                        const permRecord = Object.fromEntries([...selectedKeys].map((k) => [k, true]));
                        const productKeys = areaPerms.map((p) => p.key);
                        return (
                          <ProductPermissionsGrid
                            areaPerms={areaPerms}
                            permissions={permRecord}
                            canEdit={!disabled}
                            onAccessLevelChange={(readKey, writeKey, level: ProductAccessLevel) => {
                              onChange(
                                applyProductAccessLevelToKeySet(
                                  selectedKeys,
                                  productKeys,
                                  readKey,
                                  writeKey,
                                  level
                                )
                              );
                            }}
                          />
                        );
                      })()}
                    </div>
                  ) : cat.name === 'human_resources' ? (
                    (() => {
                      const allHrKeys = (cat.permissions || []).map((p) => p.key);
                      const permRecord = Object.fromEntries([...selectedKeys].map((k) => [k, true]));
                      return (
                        <HrPermissionsPanel
                          areaPerms={subPermissions}
                          permissions={permRecord}
                          canEdit={!disabled}
                          onAccessLevelChange={(readKey, writeKey, level: HrAccessLevel) => {
                            onChange(
                              applyHrAccessLevelToKeySet(
                                selectedKeys,
                                allHrKeys,
                                readKey,
                                writeKey,
                                level
                              )
                            );
                          }}
                          onWriteOnlyChange={(key, level: HrAccessLevel) => {
                            onChange(applyHrWriteOnlyToKeySet(selectedKeys, key, level));
                          }}
                        />
                      );
                    })()
                  ) : cat.name === 'training' ? (
                    (() => {
                      const permRecord = Object.fromEntries([...selectedKeys].map((k) => [k, true]));
                      return (
                        <TrainingPermissionsPanel
                          areaPerms={subPermissions}
                          permissions={permRecord}
                          canEdit={!disabled}
                          onAccessLevelChange={(readKey, writeKey, level: TrainingAccessLevel) => {
                            onChange(
                              applyTrainingAccessLevelToKeySet(
                                selectedKeys,
                                readKey,
                                writeKey,
                                level,
                              ),
                            );
                          }}
                        />
                      );
                    })()
                  ) : cat.name === 'fleet' ? (
                    (() => {
                      const allFleetKeys = (cat.permissions || []).map((p) => p.key);
                      const permRecord = Object.fromEntries([...selectedKeys].map((k) => [k, true]));
                      return (
                        <FleetPermissionsPanel
                          areaPerms={subPermissions}
                          permissions={permRecord}
                          canEdit={!disabled}
                          onAccessLevelChange={(readKey, writeKey, level: FleetAccessLevel) => {
                            onChange(
                              applyFleetAccessLevelToKeySet(
                                selectedKeys,
                                allFleetKeys,
                                readKey,
                                writeKey,
                                level
                              )
                            );
                          }}
                          onAssignChange={(level: FleetAccessLevel) => {
                            onChange(applyFleetAssignToKeySet(selectedKeys, level));
                          }}
                        />
                      );
                    })()
                  ) : cat.name === 'company_assets' ? (
                    (() => {
                      const allKeys = (cat.permissions || []).map((p) => p.key);
                      const permRecord = Object.fromEntries([...selectedKeys].map((k) => [k, true]));
                      return (
                        <CompanyAssetsPermissionsPanel
                          areaPerms={subPermissions}
                          permissions={permRecord}
                          canEdit={!disabled}
                          onAccessLevelChange={(readKey, writeKey, level: CompanyAssetsAccessLevel) => {
                            onChange(
                              applyCompanyAssetsAccessLevelToKeySet(
                                selectedKeys,
                                allKeys,
                                readKey,
                                writeKey,
                                level
                              )
                            );
                          }}
                        />
                      );
                    })()
                  ) : cat.name === 'documents' ? (
                    (() => {
                      const allKeys = (cat.permissions || []).map((p) => p.key);
                      const permRecord = Object.fromEntries([...selectedKeys].map((k) => [k, true]));
                      return (
                        <DocumentsPermissionsPanel
                          areaPerms={subPermissions}
                          permissions={permRecord}
                          canEdit={!disabled}
                          onAccessLevelChange={(readKey, writeKey, level: DocumentsAccessLevel) => {
                            onChange(
                              applyDocumentsAccessLevelToKeySet(
                                selectedKeys,
                                allKeys,
                                readKey,
                                writeKey,
                                level
                              )
                            );
                          }}
                        />
                      );
                    })()
                  ) : cat.name === 'quotations' ? (
                    /* Quotations */
                    <div className="space-y-4">
                      {['quotations'].map((area) => {
                        const areaPerms = subPermissions.filter((p) => p.key.includes(`sales:${area}`));
                        if (areaPerms.length === 0) return null;
                        const viewPerms = areaPerms.filter((p) => p.key.includes(':read'));
                        const editPerms = areaPerms.filter((p) => p.key.includes(':write'));
                        return (
                          <div key={area} className="border rounded-lg p-2.5 bg-gray-50">
                            <div className="text-xs font-semibold text-gray-700 mb-2">Quotations</div>
                            {viewEditBlock(viewPerms, editPerms)}
                          </div>
                        );
                      })}
                      {subPermissions.length === 0 && (
                        <div className="text-[10px] text-gray-500">No permissions in this category.</div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {subPermissions.map((perm) => permRow(perm))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className={uiSpacing.sectionStack}>
      <div className={uiCx(uiRadius.control, uiBorders.subtle, uiColors.surfaceSubtle, uiSpacing.cardPadding)}>
        <h4 className={uiCx(uiTypography.sectionTitle, 'mb-3')}>Create New Template</h4>
        <div className={uiSpacing.sectionStack}>
          <AppInput
            label="Template Name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="e.g., Sales, Field Technician"
          />
          <div>
            <div className={uiCx(uiTypography.controlLabel, 'mb-1 block')}>Permissions (select all that apply)</div>
            {renderPermissionCheckboxes(newSelectedKeys, setNewSelectedKeys)}
          </div>
          <div className="flex justify-end">
            <AppButton
              loading={createMutation.isPending}
              disabled={createMutation.isPending}
              onClick={() => {
                if (!newName.trim()) {
                  toast.error('Template name is required');
                  return;
                }
                createMutation.mutate({
                  name: newName.trim(),
                  permission_keys: Array.from(newSelectedKeys),
                });
              }}
            >
              Create Template
            </AppButton>
          </div>
        </div>
      </div>

      <div>
        <h4 className={uiCx(uiTypography.sectionTitle, 'mb-3')}>Existing Templates</h4>
        {loadingTemplates ? (
          <div className={uiCx('p-4', uiTypography.helper, uiRadius.control, uiBorders.subtle)}>Loading...</div>
        ) : (templates as PermTemplate[]).length === 0 ? (
          <AppEmptyState title="No permission templates yet" />
        ) : (
          <div className={uiSpacing.sectionStack}>
            {(templates as PermTemplate[]).map((t) => {
              const isExpanded = expandedId === t.id;
              const e = getEdit(t);
              return (
                <div key={t.id} className={uiCx('overflow-hidden', uiRadius.control, uiBorders.subtle, uiColors.surface)}>
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : t.id)}
                    className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors text-left"
                  >
                    <span className={uiTypography.sectionTitle}>{t.name}</span>
                    <span className={uiTypography.helper}>
                      {(t.permission_keys || []).length} permission(s)
                    </span>
                    <svg
                      className={`w-5 h-5 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {isExpanded && (
                    <div className={uiCx('px-4 pb-4 border-t', uiColors.surfaceSubtle)}>
                      <div className={uiCx('pt-3', uiSpacing.sectionStack)}>
                        <AppInput
                          label="Template Name"
                          value={e.name}
                          onChange={(ev) =>
                            setEdits((s) => ({
                              ...s,
                              [t.id]: { ...(s[t.id] || e), name: ev.target.value },
                            }))
                          }
                        />
                        <div>
                          <div className={uiCx(uiTypography.controlLabel, 'mb-1 block')}>Permissions</div>
                          {renderPermissionCheckboxes(
                            e.selectedKeys,
                            (next) =>
                              setEdits((s) => ({
                                ...s,
                                [t.id]: { ...(s[t.id] || e), selectedKeys: next },
                              }))
                          )}
                        </div>
                        <div className={uiCx('flex justify-end gap-2', uiLayout.actionsRow)}>
                          <AppButton
                            loading={updateMutation.isPending}
                            disabled={updateMutation.isPending}
                            onClick={() =>
                              updateMutation.mutate({
                                id: t.id,
                                name: e.name,
                                permission_keys: Array.from(e.selectedKeys),
                              })
                            }
                          >
                            Save
                          </AppButton>
                          <AppButton
                            variant="secondary"
                            loading={duplicateMutation.isPending}
                            disabled={duplicateMutation.isPending}
                            onClick={() => duplicateMutation.mutate(t.id)}
                          >
                            Duplicate
                          </AppButton>
                          <AppButton
                            variant="secondary"
                            loading={deleteMutation.isPending}
                            disabled={deleteMutation.isPending}
                            onClick={async () => {
                              if (!(await confirm({ title: 'Delete template?', description: 'This action cannot be undone.' })))
                                return;
                              deleteMutation.mutate(t.id);
                            }}
                          >
                            Delete
                          </AppButton>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// Terms Templates Section Component
function TermsTemplatesSection(){
  const qc = useQueryClient();
  const confirm = useConfirm();
  const { data: settings, isLoading, refetch } = useQuery({ 
    queryKey:['settings-bundle'], 
    queryFn: ()=>api<Record<string, Item[]>>('GET','/settings') 
  });
  const templates = (settings?.['terms-templates'] || []) as Item[];
  const [newTemplateName, setNewTemplateName] = useState('');
  const [newTemplateDescription, setNewTemplateDescription] = useState('');
  const [edits, setEdits] = useState<Record<string, Item>>({});
  const [expandedTemplates, setExpandedTemplates] = useState<Set<string>>(new Set());
  
  const toggleTemplate = (templateId: string) => {
    setExpandedTemplates(prev => {
      const next = new Set(prev);
      if (next.has(templateId)) {
        next.delete(templateId);
      } else {
        next.add(templateId);
      }
      return next;
    });
  };

  const createMutation = useMutation({
    mutationFn: (payload: { name: string; description: string })=>{
      return api('POST', `/settings/terms-templates?label=${encodeURIComponent(payload.name)}&description=${encodeURIComponent(payload.description)}`);
    },
    onSuccess: ()=>{
      qc.invalidateQueries({ queryKey: ['settings-bundle'] });
      setNewTemplateName('');
      setNewTemplateDescription('');
      toast.success('Terms template created');
    },
    onError: (e: any)=>toast.error(e?.message || 'Failed to create')
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string)=>api('DELETE', `/settings/terms-templates/${encodeURIComponent(id)}`),
    onSuccess: ()=>{
      qc.invalidateQueries({ queryKey: ['settings-bundle'] });
      toast.success('Deleted');
    },
    onError: (e: any)=>toast.error(e?.message || 'Failed to delete')
  });

  const updateMutation = useMutation({
    mutationFn: (payload: { id:string; label?:string; description?:string })=>{
      const params = new URLSearchParams();
      if (payload.label !== undefined) params.set('label', payload.label);
      if (payload.description !== undefined) params.set('description', payload.description);
      return api('PUT', `/settings/terms-templates/${encodeURIComponent(payload.id)}?${params.toString()}`);
    },
    onSuccess: ()=>{
      qc.invalidateQueries({ queryKey: ['settings-bundle'] });
      toast.success('Updated');
    },
    onError: (e: any)=>toast.error(e?.message || 'Failed to update')
  });

  const getEdit = (it: Item): Item => edits[it.id] || it;

  return (
    <div className={uiSpacing.sectionStack}>
      <div className={uiCx(uiRadius.control, uiBorders.subtle, uiColors.surfaceSubtle, uiSpacing.cardPadding)}>
        <h4 className={uiCx(uiTypography.sectionTitle, 'mb-3')}>Create New Template</h4>
        <div className={uiSpacing.sectionStack}>
          <AppInput
            label="Template Name"
            value={newTemplateName}
            onChange={e=>setNewTemplateName(e.target.value)}
            placeholder="e.g., Standard Terms, Commercial Terms"
          />
          <AppTextarea
            label="Terms Description"
            value={newTemplateDescription}
            onChange={e=>setNewTemplateDescription(e.target.value)}
            placeholder="Enter the full terms text..."
            rows={6}
          />
          <div className="flex justify-end">
            <AppButton
              loading={createMutation.isPending}
              disabled={createMutation.isPending}
              onClick={()=>{
                if(!newTemplateName.trim()){
                  toast.error('Template name is required');
                  return;
                }
                createMutation.mutate({ name: newTemplateName.trim(), description: newTemplateDescription });
              }}
            >
              Create Template
            </AppButton>
          </div>
        </div>
      </div>

      <div>
        <h4 className={uiCx(uiTypography.sectionTitle, 'mb-3')}>Existing Templates</h4>
        {isLoading ? (
          <div className={uiCx('p-4', uiTypography.helper, uiRadius.control, uiBorders.subtle)}>Loading...</div>
        ) : templates.length === 0 ? (
          <AppEmptyState title="No templates created yet" />
        ) : (
          <div className={uiSpacing.sectionStack}>
            {templates.map((template) => {
              const e = getEdit(template);
              const isExpanded = expandedTemplates.has(template.id);
              return (
                <div key={template.id} className={uiCx('overflow-hidden', uiRadius.control, uiBorders.subtle, uiColors.surface)}>
                  <button
                    onClick={() => toggleTemplate(template.id)}
                    className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors text-left"
                  >
                    <span className={uiTypography.sectionTitle}>{template.label || 'Unnamed Template'}</span>
                    <svg 
                      className={`w-5 h-5 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                      fill="none" 
                      stroke="currentColor" 
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  
                  {isExpanded && (
                    <div className={uiCx('px-4 pb-4 border-t', uiColors.surfaceSubtle)}>
                      <div className={uiCx('pt-3', uiSpacing.sectionStack)}>
                        <AppInput
                          label="Template Name"
                          value={e.label}
                          onChange={ev=> setEdits(s=>({ ...s, [template.id]: { ...(s[template.id]||template), label: ev.target.value } }))}
                        />
                        <AppTextarea
                          label="Terms Description"
                          value={e.meta?.description||''}
                          onChange={ev=> setEdits(s=>({ ...s, [template.id]: { ...(s[template.id]||template), meta: { ...(s[template.id]?.meta||template.meta||{}), description: ev.target.value } } }))}
                          rows={6}
                        />
                        <div className={uiCx('flex justify-end gap-2', uiLayout.actionsRow)}>
                          <AppButton
                            loading={updateMutation.isPending}
                            disabled={updateMutation.isPending}
                            onClick={async()=>{
                              try{
                                await updateMutation.mutateAsync({
                                  id: template.id,
                                  label: e.label,
                                  description: e.meta?.description||''
                                });
                                setEdits(s=>{ const {[template.id]:_, ...rest} = s; return rest; });
                              }catch(_e){}
                            }}
                          >
                            Save
                          </AppButton>
                          <AppButton
                            variant="secondary"
                            loading={deleteMutation.isPending}
                            disabled={deleteMutation.isPending}
                            onClick={async()=>{
                              if(!(await confirm({ title: 'Delete template?', description: 'This action cannot be undone.' }))) return;
                              deleteMutation.mutate(template.id);
                            }}
                          >
                            Delete
                          </AppButton>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
