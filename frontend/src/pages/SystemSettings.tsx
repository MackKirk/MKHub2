import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, withFileAccessToken } from '@/lib/api';
import { uploadOrganizationLogoFile, uploadCertificateBackgroundFile } from '@/lib/trainingFileUpload';
import { useMemo, useState, useEffect, useRef } from 'react';
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
  AppSectionHeader,
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
    setSearchParams(next, { replace: true });
  };

  const sectionTabs: { id: SettingsSection; label: string }[] = [
    { id: 'lists', label: 'Lookup lists' },
    { id: 'files', label: 'Files & categories' },
    { id: 'templates', label: 'Templates' },
  ];

  return (
    <div className={uiCx(uiSpacing.pageStack, 'bg-gray-50')}>
      <AppPageHeader
        title="System settings"
        subtitle="Administration for lookup lists, file categories, and templates used across MKHub."
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

      {section === 'files' && (
        <AppCard
          title="Files & categories"
          subtitle="Company-wide folders and standard upload categories used across projects."
          bodyClassName={uiSpacing.sectionStack}
        >
          <div className="grid gap-10 xl:grid-cols-2">
            <div className="min-w-0">
              <AppSectionHeader
                title="Company file categories"
                description="Top-level areas in Company Files (e.g. HR, Operations)."
                className="mb-4"
              />
              <CompanyFilesDepartments />
            </div>
            <div className="min-w-0">
              <AppSectionHeader
                title="Standard file categories"
                description="Labels for uploads and names of default project subfolders."
                className="mb-4"
              />
              <StandardFileCategories />
            </div>
          </div>
          <div className={uiCx('mt-10 border-t border-gray-100 pt-8', uiSpacing.sectionStack)}>
            <AppSectionHeader
              title="Organization logos"
              description="Upload large PNG or JPEG logos once; reuse them in LMS certificates and other surfaces. Each entry needs a label and an image file."
            />
            <OrganizationLogosSection />
          </div>
          <div className={uiCx('mt-10 border-t border-gray-100 pt-8', uiSpacing.sectionStack)}>
            <AppSectionHeader
              title="Certificate backgrounds"
              description="Landscape images (PNG, JPEG, WebP) for LMS completion certificates. Authors pick these in the course Certificate tab; upload high-resolution artwork here."
            />
            <CertificateBackgroundsSection />
          </div>
        </AppCard>
      )}

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

function OrganizationLogosSection() {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const fileRef = useRef<HTMLInputElement>(null);
  const { data, isLoading } = useQuery({
    queryKey: ['settings-bundle'],
    queryFn: () => api<Record<string, Item[]>>('GET', '/settings'),
  });
  const logos = (data?.organization_logos || []) as Item[];
  const [newLabel, setNewLabel] = useState('');
  const [busy, setBusy] = useState(false);

  const addFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    try {
      const arr = Array.from(files);
      for (let i = 0; i < arr.length; i++) {
        const f = arr[i];
        const stem = f.name.replace(/\.[^.]+$/, '') || 'Logo';
        const label = i === 0 ? (newLabel.trim() || stem) : stem;
        const fid = await uploadOrganizationLogoFile(f);
        const params = new URLSearchParams({ label, file_object_id: fid });
        await api('POST', `/settings/organization_logos?${params.toString()}`);
      }
      await qc.invalidateQueries({ queryKey: ['settings-bundle'] });
      await qc.invalidateQueries({ queryKey: ['training-organization-logo-presets'] });
      toast.success(arr.length > 1 ? 'Logos added' : 'Logo added');
      setNewLabel('');
      if (fileRef.current) fileRef.current.value = '';
    } catch {
      toast.error('Upload failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={uiCx('mt-4', uiSpacing.sectionStack)}>
      <div className={uiCx('flex flex-wrap items-end gap-3', uiRadius.control, uiBorders.subtle, uiColors.surfaceSubtle, uiSpacing.cardPadding)}>
        <AppInput
          className="min-w-[200px] flex-1"
          label="Default label (first file)"
          placeholder="e.g. Primary mark — full color"
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
        />
        <div>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            multiple
            className="sr-only"
            id="org-logo-multi"
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = '';
            }}
          />
          <AppButton
            type="button"
            disabled={busy}
            loading={busy}
            onClick={() => fileRef.current?.click()}
          >
            {busy ? 'Uploading…' : 'Choose image(s)…'}
          </AppButton>
        </div>
      </div>

      <div className={uiCx('overflow-hidden', uiRadius.control, uiBorders.subtle)}>
        <div className="max-h-[24rem] overflow-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className={uiCx('sticky top-0 z-[1] border-b border-gray-200 bg-gray-50 text-left', uiTypography.overline)}>
              <tr>
                <th className="w-24 px-3 py-2.5">Preview</th>
                <th className="min-w-[180px] px-3 py-2.5">Label</th>
                <th className="px-3 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {isLoading ? (
                <tr>
                  <td colSpan={3} className={uiCx('px-3 py-8 text-center', uiTypography.helper)}>
                    Loading…
                  </td>
                </tr>
              ) : logos.length === 0 ? (
                <tr>
                  <td colSpan={3} className="p-0">
                    <AppEmptyState
                      title="No logos yet."
                      description="Upload one or more images above."
                      className="border-0 bg-transparent shadow-none"
                    />
                  </td>
                </tr>
              ) : (
                logos.map((it) => {
                  const fid = it.meta?.file_object_id as string | undefined;
                  return (
                    <tr key={it.id} className="align-middle hover:bg-gray-50/50">
                      <td className="px-3 py-2">
                        {fid ? (
                          <img
                            src={withFileAccessToken(`/files/${fid}`)}
                            alt=""
                            className={uiCx('h-14 w-20 object-contain bg-white', uiRadius.control, uiBorders.subtle)}
                          />
                        ) : (
                          <span className={uiTypography.helper}>—</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <AppInput
                          defaultValue={it.label}
                          key={it.id + it.label}
                          onBlur={async (e) => {
                            const v = e.target.value.trim();
                            if (v && v !== it.label) {
                              try {
                                await api(
                                  'PUT',
                                  `/settings/organization_logos/${encodeURIComponent(it.id)}?label=${encodeURIComponent(v)}`,
                                );
                                await qc.invalidateQueries({ queryKey: ['settings-bundle'] });
                                await qc.invalidateQueries({ queryKey: ['training-organization-logo-presets'] });
                                toast.success('Saved');
                              } catch {
                                toast.error('Failed to save label');
                              }
                            }
                          }}
                        />
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        <label className="mr-2 inline-block cursor-pointer text-xs font-medium text-brand-red hover:underline">
                          Replace
                          <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp,image/gif"
                            className="sr-only"
                            onChange={async (ev) => {
                              const f = ev.target.files?.[0];
                              ev.target.value = '';
                              if (!f || !fid) return;
                              setBusy(true);
                              try {
                                const newId = await uploadOrganizationLogoFile(f);
                                const params = new URLSearchParams({ file_object_id: newId });
                                await api(
                                  'PUT',
                                  `/settings/organization_logos/${encodeURIComponent(it.id)}?${params.toString()}`,
                                );
                                await qc.invalidateQueries({ queryKey: ['settings-bundle'] });
                                await qc.invalidateQueries({ queryKey: ['training-organization-logo-presets'] });
                                toast.success('Image replaced');
                              } catch {
                                toast.error('Replace failed');
                              } finally {
                                setBusy(false);
                              }
                            }}
                          />
                        </label>
                        <AppButton
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-red-600 hover:text-red-700"
                          onClick={async () => {
                            if (!(await confirm({ title: 'Remove logo?', description: it.label }))) return;
                            try {
                              await api('DELETE', `/settings/organization_logos/${encodeURIComponent(it.id)}`);
                              await qc.invalidateQueries({ queryKey: ['settings-bundle'] });
                              await qc.invalidateQueries({ queryKey: ['training-organization-logo-presets'] });
                              toast.success('Removed');
                            } catch {
                              toast.error('Delete failed');
                            }
                          }}
                        >
                          Delete
                        </AppButton>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function CertificateBackgroundsSection() {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const fileRef = useRef<HTMLInputElement>(null);
  const { data, isLoading } = useQuery({
    queryKey: ['settings-bundle'],
    queryFn: () => api<Record<string, Item[]>>('GET', '/settings'),
  });
  const rows = (data?.certificate_backgrounds || []) as Item[];
  const [newLabel, setNewLabel] = useState('');
  const [busy, setBusy] = useState(false);

  const addFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    try {
      const arr = Array.from(files);
      for (let i = 0; i < arr.length; i++) {
        const f = arr[i];
        const stem = f.name.replace(/\.[^.]+$/, '') || 'Background';
        const label = i === 0 ? (newLabel.trim() || stem) : stem;
        const fid = await uploadCertificateBackgroundFile(f);
        const params = new URLSearchParams({ label, file_object_id: fid });
        await api('POST', `/settings/certificate_backgrounds?${params.toString()}`);
      }
      await qc.invalidateQueries({ queryKey: ['settings-bundle'] });
      await qc.invalidateQueries({ queryKey: ['training-certificate-bg-presets'] });
      toast.success(arr.length > 1 ? 'Backgrounds added' : 'Background added');
      setNewLabel('');
      if (fileRef.current) fileRef.current.value = '';
    } catch {
      toast.error('Upload failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={uiCx('mt-4', uiSpacing.sectionStack)}>
      <div className={uiCx('flex flex-wrap items-end gap-3', uiRadius.control, uiBorders.subtle, uiColors.surfaceSubtle, uiSpacing.cardPadding)}>
        <AppInput
          className="min-w-[200px] flex-1"
          label="Default label (first file)"
          placeholder="e.g. Corporate landscape — v2"
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
        />
        <div>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            multiple
            className="sr-only"
            id="cert-bg-multi"
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = '';
            }}
          />
          <AppButton
            type="button"
            disabled={busy}
            loading={busy}
            onClick={() => fileRef.current?.click()}
          >
            {busy ? 'Uploading…' : 'Choose image(s)…'}
          </AppButton>
        </div>
      </div>

      <div className={uiCx('overflow-hidden', uiRadius.control, uiBorders.subtle)}>
        <div className="max-h-[24rem] overflow-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className={uiCx('sticky top-0 z-[1] border-b border-gray-200 bg-gray-50 text-left', uiTypography.overline)}>
              <tr>
                <th className="w-28 px-3 py-2.5">Preview</th>
                <th className="min-w-[180px] px-3 py-2.5">Label</th>
                <th className="px-3 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {isLoading ? (
                <tr>
                  <td colSpan={3} className={uiCx('px-3 py-8 text-center', uiTypography.helper)}>
                    Loading…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={3} className="p-0">
                    <AppEmptyState
                      title="No certificate backgrounds yet."
                      description="Upload landscape images above."
                      className="border-0 bg-transparent shadow-none"
                    />
                  </td>
                </tr>
              ) : (
                rows.map((it) => {
                  const fid = it.meta?.file_object_id as string | undefined;
                  const pubPreview = fid ? `/training/certificate-background-library/${it.id}` : '';
                  return (
                    <tr key={it.id} className="align-middle hover:bg-gray-50/50">
                      <td className="px-3 py-2">
                        {fid ? (
                          <img
                            src={pubPreview}
                            alt=""
                            className={uiCx('h-12 w-20 object-cover bg-white', uiRadius.control, uiBorders.subtle)}
                          />
                        ) : (
                          <span className={uiTypography.helper}>—</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <AppInput
                          defaultValue={it.label}
                          key={it.id + it.label}
                          onBlur={async (e) => {
                            const v = e.target.value.trim();
                            if (v && v !== it.label) {
                              try {
                                await api(
                                  'PUT',
                                  `/settings/certificate_backgrounds/${encodeURIComponent(it.id)}?label=${encodeURIComponent(v)}`,
                                );
                                await qc.invalidateQueries({ queryKey: ['settings-bundle'] });
                                await qc.invalidateQueries({ queryKey: ['training-certificate-bg-presets'] });
                                toast.success('Saved');
                              } catch {
                                toast.error('Failed to save label');
                              }
                            }
                          }}
                        />
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        <label className="mr-2 inline-block cursor-pointer text-xs font-medium text-brand-red hover:underline">
                          Replace
                          <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp,image/gif"
                            className="sr-only"
                            onChange={async (ev) => {
                              const f = ev.target.files?.[0];
                              ev.target.value = '';
                              if (!f || !fid) return;
                              setBusy(true);
                              try {
                                const newId = await uploadCertificateBackgroundFile(f);
                                const params = new URLSearchParams({ file_object_id: newId });
                                await api(
                                  'PUT',
                                  `/settings/certificate_backgrounds/${encodeURIComponent(it.id)}?${params.toString()}`,
                                );
                                await qc.invalidateQueries({ queryKey: ['settings-bundle'] });
                                await qc.invalidateQueries({ queryKey: ['training-certificate-bg-presets'] });
                                toast.success('Image replaced');
                              } catch {
                                toast.error('Replace failed');
                              } finally {
                                setBusy(false);
                              }
                            }}
                          />
                        </label>
                        <AppButton
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-red-600 hover:text-red-700"
                          onClick={async () => {
                            if (!(await confirm({ title: 'Remove background?', description: it.label }))) return;
                            try {
                              await api('DELETE', `/settings/certificate_backgrounds/${encodeURIComponent(it.id)}`);
                              await qc.invalidateQueries({ queryKey: ['settings-bundle'] });
                              await qc.invalidateQueries({ queryKey: ['training-certificate-bg-presets'] });
                              toast.success('Removed');
                            } catch {
                              toast.error('Delete failed');
                            }
                          }}
                        >
                          Delete
                        </AppButton>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
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

// Company Files Departments Component
function CompanyFilesDepartments(){
  const qc = useQueryClient();
  const { data: departments, isLoading } = useQuery({
    queryKey: ['departments'],
    queryFn: ()=>api<Item[]>('GET', '/settings/departments')
  });
  const [newDept, setNewDept] = useState('');
  const [edits, setEdits] = useState<Record<string, Item>>({});

  const createMutation = useMutation({
    mutationFn: (label: string)=>api('POST', `/settings/departments?label=${encodeURIComponent(label)}`),
    onSuccess: ()=>{
      qc.invalidateQueries({ queryKey: ['departments'] });
      qc.invalidateQueries({ queryKey: ['settings-bundle'] });
      setNewDept('');
      toast.success('File category created');
    },
    onError: (e: any)=>toast.error(e?.message || 'Failed to create')
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string)=>api('DELETE', `/settings/departments/${encodeURIComponent(id)}`),
    onSuccess: ()=>{
      qc.invalidateQueries({ queryKey: ['departments'] });
      qc.invalidateQueries({ queryKey: ['settings-bundle'] });
      toast.success('Deleted');
    },
    onError: (e: any)=>toast.error(e?.message || 'Failed to delete')
  });

  const updateMutation = useMutation({
    mutationFn: (payload: { id:string; label?:string; sort_index?:number })=>{
      const params = new URLSearchParams();
      if (payload.label !== undefined) params.set('label', payload.label);
      if (payload.sort_index !== undefined) params.set('sort_index', String(payload.sort_index));
      return api('PUT', `/settings/departments/${encodeURIComponent(payload.id)}?${params.toString()}`);
    },
    onSuccess: ()=>{
      qc.invalidateQueries({ queryKey: ['departments'] });
      qc.invalidateQueries({ queryKey: ['settings-bundle'] });
      toast.success('Updated');
    },
    onError: (e: any)=>toast.error(e?.message || 'Failed to update')
  });

  const sortedDepartments = useMemo(()=>{
    return (departments||[]).slice().sort((a,b)=>(a.sort_index||0)-(b.sort_index||0));
  },[departments]);

  const move = (idx: number, dir: -1|1)=>{
    if (!sortedDepartments) return;
    const next = idx + dir;
    if (next < 0 || next >= sortedDepartments.length) return;
    const a = sortedDepartments[idx], b = sortedDepartments[next];
    updateMutation.mutate({ id: a.id, sort_index: (b.sort_index??0) });
    updateMutation.mutate({ id: b.id, sort_index: (a.sort_index??0) });
  };

  const getEdit = (it: Item): Item => edits[it.id] || it;

  return (
    <div className={uiSpacing.sectionStack}>
      <div className={uiCx('flex flex-wrap gap-2', uiLayout.actionsRow)}>
        <AppInput
          className="min-w-[200px] flex-1"
          value={newDept}
          onChange={e=>setNewDept(e.target.value)}
          placeholder="New category name"
          onKeyDown={e=>{ if(e.key==='Enter' && newDept.trim()){ createMutation.mutate(newDept.trim()); } }}
        />
        <AppButton
          loading={createMutation.isPending}
          disabled={createMutation.isPending}
          onClick={()=>newDept.trim() && createMutation.mutate(newDept.trim())}
        >
          Add
        </AppButton>
      </div>
      <div className={uiCx('overflow-hidden', uiRadius.control, uiBorders.subtle)}>
        <div className="max-h-72 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className={uiCx('sticky top-0 z-[1] border-b border-gray-200 bg-gray-50 text-left', uiTypography.overline)}>
              <tr>
                <th className="w-10 px-2 py-2.5">Order</th>
                <th className="px-3 py-2.5">Name</th>
                <th className="w-24 px-3 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading ? (
                <tr><td colSpan={3} className={uiCx('px-3 py-8 text-center', uiTypography.helper)}>Loading…</td></tr>
              ) : sortedDepartments.length === 0 ? (
                <tr><td colSpan={3} className="p-0"><AppEmptyState title="No categories yet." className="border-0 bg-transparent shadow-none" /></td></tr>
              ) : (
                sortedDepartments.map((d, i)=> {
                  const e = getEdit(d);
                  return (
                    <tr key={d.id} className="bg-white hover:bg-gray-50/80">
                      <td className="whitespace-nowrap px-2 py-2 align-middle">
                        <div className="flex flex-col gap-0.5">
                          <AppButton
                            type="button"
                            variant="secondary"
                            size="sm"
                            className="h-auto px-1 py-0 text-[10px] leading-none"
                            disabled={i===0}
                            onClick={()=>move(i,-1)}
                            title="Move up"
                          >↑</AppButton>
                          <AppButton
                            type="button"
                            variant="secondary"
                            size="sm"
                            className="h-auto px-1 py-0 text-[10px] leading-none"
                            disabled={i===sortedDepartments.length-1}
                            onClick={()=>move(i,1)}
                            title="Move down"
                          >↓</AppButton>
                        </div>
                      </td>
                      <td className="px-2 py-2 align-middle">
                        <AppInput
                          value={e.label}
                          onChange={ev=> setEdits(s=>({ ...s, [d.id]: { ...(s[d.id]||d), label: ev.target.value } }))}
                          onBlur={()=>{
                            const v = edits[d.id]?.label?.trim();
                            if(v && v !== d.label){
                              updateMutation.mutate({ id: d.id, label: v });
                              setEdits(s=>{ const {[d.id]:_, ...rest} = s; return rest; });
                            }
                          }}
                        />
                      </td>
                      <td className="px-3 py-2 text-right align-middle">
                        <AppButton
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-red-600 hover:text-red-700"
                          loading={deleteMutation.isPending}
                          disabled={deleteMutation.isPending}
                          onClick={()=>{
                            if(confirm(`Delete file category "${d.label}"?`)){
                              deleteMutation.mutate(d.id);
                            }
                          }}
                        >
                          Delete
                        </AppButton>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// Standard File Categories — stored as settings list `standard_file_categories` (slug, name, meta.icon, meta.description)
function StandardFileCategories(){
  const confirmDlg = useConfirm();
  const qc = useQueryClient();
  const { data: categories, isLoading } = useQuery({
    queryKey: ['file-categories'],
    queryFn: ()=>api<any[]>('GET', '/clients/file-categories')
  });
  const [edits, setEdits] = useState<Record<string, { name?: string; icon?: string; description?: string }>>({});
  const [newSlug, setNewSlug] = useState('');
  const [newName, setNewName] = useState('');
  const [newIcon, setNewIcon] = useState('📁');
  const [newDesc, setNewDesc] = useState('');

  const sorted = useMemo(()=>{
    return (categories||[]).slice().sort((a:any,b:any)=>(a.sortIndex??0)-(b.sortIndex??0));
  }, [categories]);

  const getEdit = (row: any) => edits[row.itemId] || {};

  const updateMutation = useMutation({
    mutationFn: (payload: { itemId: string; value?: string; icon?: string; description?: string; sort_index?: number })=>{
      const params = new URLSearchParams();
      if (payload.value !== undefined) params.set('value', payload.value);
      if (payload.icon !== undefined) params.set('icon', payload.icon);
      if (payload.description !== undefined) params.set('description', payload.description);
      if (payload.sort_index !== undefined) params.set('sort_index', String(payload.sort_index));
      return api('PUT', `/settings/standard_file_categories/${encodeURIComponent(payload.itemId)}?${params.toString()}`);
    },
    onSuccess: ()=>{
      qc.invalidateQueries({ queryKey: ['file-categories'] });
      qc.invalidateQueries({ queryKey: ['settings-bundle'] });
      toast.success('Saved');
    },
    onError: ()=> toast.error('Failed to save'),
  });

  const createMutation = useMutation({
    mutationFn: (vars: { slug: string; name: string; icon: string; desc: string })=>{
      const slug = vars.slug.trim().toLowerCase();
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)){
        throw new Error('Invalid id: use lowercase letters, numbers and hyphens only.');
      }
      const params = new URLSearchParams({
        label: slug,
        value: (vars.name.trim() || slug),
      });
      if (vars.icon.trim()) params.set('icon', vars.icon.trim());
      if (vars.desc.trim()) params.set('description', vars.desc.trim());
      return api('POST', `/settings/standard_file_categories?${params.toString()}`);
    },
    onSuccess: ()=>{
      qc.invalidateQueries({ queryKey: ['file-categories'] });
      qc.invalidateQueries({ queryKey: ['settings-bundle'] });
      setNewSlug(''); setNewName(''); setNewIcon('📁'); setNewDesc('');
      toast.success('Category added');
    },
    onError: (e: any)=> toast.error(e?.message || 'Failed to add'),
  });

  const deleteMutation = useMutation({
    mutationFn: (itemId: string)=> api('DELETE', `/settings/standard_file_categories/${encodeURIComponent(itemId)}`),
    onSuccess: ()=>{
      qc.invalidateQueries({ queryKey: ['file-categories'] });
      qc.invalidateQueries({ queryKey: ['settings-bundle'] });
      toast.success('Deleted');
    },
    onError: ()=> toast.error('Failed to delete'),
  });

  const move = (idx: number, dir: -1|1)=>{
    if (!sorted.length) return;
    const j = idx + dir;
    if (j < 0 || j >= sorted.length) return;
    const a = sorted[idx], b = sorted[j];
    updateMutation.mutate({ itemId: a.itemId, sort_index: (b.sortIndex ?? 0) });
    updateMutation.mutate({ itemId: b.itemId, sort_index: (a.sortIndex ?? 0) });
  };

  const saveRow = (row: any)=>{
    const e = getEdit(row);
    const name = e.name !== undefined ? e.name : row.name;
    const icon = e.icon !== undefined ? e.icon : row.icon;
    const description = e.description !== undefined ? e.description : (row.description || '');
    updateMutation.mutate({
      itemId: row.itemId,
      value: String(name ?? '').trim() || row.id,
      icon: String(icon ?? '').trim() || '📁',
      description,
    }, {
      onSuccess: ()=> setEdits(s=>{ const { [row.itemId]: _, ...rest } = s; return rest; }),
    });
  };

  return (
    <div className={uiSpacing.sectionStack}>
      <div className={uiCx(uiRadius.control, uiBorders.subtle, uiColors.surfaceSubtle, uiSpacing.cardPadding)}>
        <div className={uiTypography.sectionTitle}>Add category</div>
        <div className={uiCx('mt-3 grid gap-3 sm:grid-cols-2', uiLayout.sectionGrid2)}>
          <AppInput label="Id (slug)" placeholder="e.g. as-built-docs" value={newSlug} onChange={e=>setNewSlug(e.target.value)} />
          <AppInput label="Display / folder name" placeholder="Shown in UI and folder name" value={newName} onChange={e=>setNewName(e.target.value)} />
        </div>
        <div className={uiCx('mt-3 flex flex-wrap gap-3 items-end', uiLayout.actionsRow)}>
          <AppInput className="w-14" label="Icon" title="Emoji" inputClassName="text-center" value={newIcon} onChange={e=>setNewIcon(e.target.value)} />
          <AppInput className="min-w-[180px] flex-1" label="Description (optional)" value={newDesc} onChange={e=>setNewDesc(e.target.value)} />
          <AppButton
            loading={createMutation.isPending}
            disabled={createMutation.isPending || !newSlug.trim()}
            onClick={()=> createMutation.mutate({ slug: newSlug, name: newName, icon: newIcon, desc: newDesc })}
          >
            Add category
          </AppButton>
        </div>
      </div>

      <div className={uiCx('overflow-hidden', uiRadius.control, uiBorders.subtle)}>
        <div className="max-h-[28rem] overflow-x-auto overflow-y-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className={uiCx('sticky top-0 z-[1] border-b border-gray-200 bg-gray-50 text-left', uiTypography.overline)}>
              <tr>
                <th className="w-10 px-2 py-2.5"> </th>
                <th className="w-12 px-2 py-2.5">Icon</th>
                <th className="min-w-[140px] px-3 py-2.5">Name</th>
                <th className="min-w-[100px] px-3 py-2.5">Id</th>
                <th className="min-w-[180px] px-3 py-2.5">Description</th>
                <th className="w-28 px-3 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {isLoading ? (
                <tr><td colSpan={6} className={uiCx('px-3 py-8 text-center', uiTypography.helper)}>Loading…</td></tr>
              ) : sorted.length === 0 ? (
                <tr><td colSpan={6} className="p-0"><AppEmptyState title="No categories." className="border-0 bg-transparent shadow-none" /></td></tr>
              ) : (
                sorted.map((row: any, i: number)=>{
                  const e = getEdit(row);
                  const name = e.name !== undefined ? e.name : row.name;
                  const icon = e.icon !== undefined ? e.icon : row.icon;
                  const description = e.description !== undefined ? e.description : (row.description || '');
                  return (
                    <tr key={row.itemId} className="align-top hover:bg-gray-50/50">
                      <td className="whitespace-nowrap px-2 py-2">
                        <div className="flex flex-col gap-0.5">
                          <AppButton type="button" variant="secondary" size="sm" className="h-auto px-1 py-0 text-[10px] leading-none" disabled={i===0} onClick={()=>move(i,-1)} title="Move up">↑</AppButton>
                          <AppButton type="button" variant="secondary" size="sm" className="h-auto px-1 py-0 text-[10px] leading-none" disabled={i===sorted.length-1} onClick={()=>move(i,1)} title="Move down">↓</AppButton>
                        </div>
                      </td>
                      <td className="px-2 py-2">
                        <AppInput className="w-11" inputClassName="text-center px-1" value={icon} onChange={ev=> setEdits(s=>({ ...s, [row.itemId]: { ...getEdit(row), icon: ev.target.value } }))} />
                      </td>
                      <td className="px-3 py-2">
                        <AppInput value={name} onChange={ev=> setEdits(s=>({ ...s, [row.itemId]: { ...getEdit(row), name: ev.target.value } }))} />
                      </td>
                      <td className="px-3 py-2">
                        <span className={uiCx('font-mono break-all', uiTypography.helper)}>{row.id}</span>
                      </td>
                      <td className="px-3 py-2">
                        <AppTextarea
                          textareaClassName="min-h-[2.5rem] text-xs"
                          rows={2}
                          placeholder="—"
                          value={description}
                          onChange={ev=> setEdits(s=>({ ...s, [row.itemId]: { ...getEdit(row), description: ev.target.value } }))}
                        />
                      </td>
                      <td className={uiCx('px-3 py-2 text-right whitespace-nowrap', uiLayout.actionsRow)}>
                        <AppButton
                          className="mr-2"
                          loading={updateMutation.isPending}
                          disabled={updateMutation.isPending}
                          onClick={()=> saveRow(row)}
                        >
                          Save
                        </AppButton>
                        <AppButton
                          variant="ghost"
                          size="sm"
                          className="text-red-600 hover:text-red-700"
                          loading={deleteMutation.isPending}
                          disabled={deleteMutation.isPending}
                          onClick={async ()=>{
                            const result = await confirmDlg({
                              title: 'Delete category?',
                              message: `Remove "${row.name}" (${row.id}) from the list? Existing files still reference this category id.`,
                              confirmText: 'Delete',
                              cancelText: 'Cancel',
                            });
                            if (result === 'confirm') deleteMutation.mutate(row.itemId);
                          }}
                        >
                          Delete
                        </AppButton>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
      <p className={uiTypography.helper}>
        The id is stored on uploaded files; changing display name does not rewrite existing file rows.
      </p>
    </div>
  );
}


