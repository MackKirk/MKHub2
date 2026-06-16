import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pagesDir = path.join(__dirname, '../src/pages');
const userInfo = fs.readFileSync(path.join(pagesDir, 'UserInfo.tsx'), 'utf8');
const profile = fs.readFileSync(path.join(pagesDir, 'Profile.tsx'), 'utf8');

function extractFn(src, name) {
  const start = src.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`Missing function ${name}`);
  let depth = 0;
  let started = false;
  for (let i = start; i < src.length; i++) {
    const ch = src[i];
    if (ch === '{') {
      depth++;
      started = true;
    } else if (ch === '}') {
      depth--;
      if (started && depth === 0) {
        return src.slice(start, i + 1);
      }
    }
  }
  throw new Error(`Unbalanced braces for ${name}`);
}

function adaptSubComponent(code) {
  return code
    .replace(/UserInfoSectionCard/g, 'ProfileSectionCard')
    .replace(/UserInfoRecordCard/g, 'ProfileRecordCard')
    .replace(/UserInfoReadOnlyField/g, 'ProfileReadOnlyField');
}

const header = `import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, withFileAccessToken } from '@/lib/api';
import { queryClient } from '@/lib/queryClient';
import { useRef, useState, useMemo, useEffect, type ReactNode } from 'react';
import toast from 'react-hot-toast';
import { useConfirm } from '@/components/ConfirmProvider';
import NationalitySelect from '@/components/NationalitySelect';
import AddressAutocomplete from '@/components/AddressAutocomplete';
import ClothSizeSelect from '@/components/ClothSizeSelect';
import { useUnsavedChangesGuard } from '@/hooks/useUnsavedChangesGuard';
import UserLoans from '@/components/UserLoans';
import UserReports from '@/components/UserReports';
import { useNavigate, useLocation } from 'react-router-dom';
import { CanadianDriversLicenseSection } from '@/components/CanadianDriversLicenseSection';
import { UserInfoHero, UserInfoHeroSkeleton } from '@/components/users/UserInfoHero';
import UserDocumentsTabEnhanced from '@/components/users/UserDocumentsTabEnhanced';
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
  AppListCreateItem,
  AppListRowIconButton,
  AppModal,
  AppPageHeader,
  AppReadOnlyField,
  AppSectionHeader,
  AppSelect,
  AppTable,
  AppTabs,
  AppTextarea,
  type AppSectionPresetKey,
  appSectionPresetProps,
  uiBorders,
  uiColors,
  uiCx,
  uiLayout,
  uiRadius,
  uiShadows,
  uiSpacing,
  uiTypography,
} from '@/components/ui';
import { Mail, MapPin, Phone, User as UserIcon } from 'lucide-react';
import {
  userEducationQuickInfo,
  userEmergencyContactsQuickInfo,
  userTimeOffBalanceAdjustQuickInfo,
  userVisaEntryQuickInfo,
} from '@/lib/formModalQuickInfo';

type ProfileResp = { user:{ username:string, email:string, first_name?:string, last_name?:string, divisions?: Array<{id:string, label:string}> }, profile?: any };

const PROFILE_TAB_LABELS: Record<string, string> = {
  personal: 'Personal',
  job: 'Job',
  docs: 'Docs',
  loans: 'Loans',
  reports: 'Reports',
};

const genderOptions = ['Male', 'Female', 'Other', 'Prefer not to say'];
const maritalStatusOptions = ['Single', 'Married', 'Common-law', 'Divorced', 'Widowed', 'Prefer not to say'];
const workEligibilityOptions = [
  'Canadian Citizen',
  'Permanent Resident',
  'Temporary Resident (with work authorization)',
  'Other',
];
const employmentTypeOptions = [
  { value: 'Full-time', label: 'Full-time' },
  { value: 'Hourly', label: 'Hourly' },
  { value: 'Part-time', label: 'Part-time' },
  { value: 'Salary', label: 'Salary' },
];

function ProfileReadOnlyField({ label, value }: { label: string; value: ReactNode }) {
  return <AppReadOnlyField label={label} value={value} />;
}

function ProfileRecordCard({ children }: { children: ReactNode }) {
  return <div className={uiCx('rounded-lg border border-gray-200 bg-white p-4')}>{children}</div>;
}

function ProfileSectionCard({
  preset,
  title,
  description,
  editTitle,
  showEdit,
  onEditClick,
  headerAction,
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
  headerAction?: ReactNode;
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
          headerAction ??
          (showEdit && onEditClick ? (
            <AppHeroEditButton onClick={onEditClick} title={editTitle || \`Edit \${title}\`} />
          ) : null)
        }
      />
      <div className={uiCx('mt-4', uiSpacing.sectionStack)}>{children}</div>
    </AppCard>
  );
}

function invalidClass(invalid: boolean) {
  return invalid ? 'ring-2 ring-red-400 rounded-lg' : '';
}

`;

// Extract Profile component body from existing file (before Field helper)
const profileStart = profile.indexOf('export default function Profile()');
const profileEnd = profile.indexOf('\nfunction Field(');
if (profileStart < 0 || profileEnd < 0) throw new Error('Could not locate Profile component');
let profileComponent = profile.slice(profileStart, profileEnd);

// Patch profile component: rename fileRef to photoInputRef for hero, remove old hero inline code via return replacement
// We'll replace from "return (" to end of component separately using markers

const returnStart = profileComponent.indexOf('  return (');
const logicPart = profileComponent.slice(0, returnStart);

const newReturn = `  const pageHeaderSubtitle = useMemo(
    () =>
      \`Personal details, employment, and documents.\${totalMissing > 0 ? \` Missing \${totalMissing} required fields.\` : ''}\`,
    [totalMissing],
  );

  const pageHeaderToday = (
    <div className="text-right">
      <div className="text-[10px] font-medium uppercase tracking-wide text-gray-500">Today</div>
      <div className="mt-0.5 text-xs font-semibold text-gray-700">{todayLabel}</div>
    </div>
  );

  const heroPrimaryTitle = useMemo(() => {
    const name = displayName;
    return u?.username ? \`\${name} (\${u.username})\` : name;
  }, [displayName, u?.username]);

  const heroPhotoUrl = useMemo(
    () =>
      p.profile_photo_file_id
        ? withFileAccessToken(\`/files/\${p.profile_photo_file_id}/thumbnail?w=400\`)
        : '/ui/assets/placeholders/user.png',
    [p.profile_photo_file_id],
  );

  const heroHireDateDisplay = useMemo(() => {
    if (!p.hire_date) return null;
    const date = String(p.hire_date).slice(0, 10);
    const t = tenure(p.hire_date);
    return t ? \`\${date} (\${t})\` : date;
  }, [p.hire_date]);

  const employeeSubtitle =
    \`\${p.job_title || '—'}\${
      u?.divisions?.length
        ? \` • \${u.divisions.map((d: any) => d.label).join(', ')}\`
        : p.division
          ? \` • \${p.division}\`
          : ''
    }\`;

  const profileTabItems = useMemo(
    () =>
      (['personal', 'job', 'docs', 'loans', 'reports'] as const)
        .filter((k) => (k === 'loans' ? hasLoans : k === 'reports' ? hasReports : true))
        .map((k) => ({ key: k, label: PROFILE_TAB_LABELS[k] || k })),
    [hasLoans, hasReports],
  );

  const handlePhotoFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      setUploading(true);
      const up: any = await api('POST', '/files/upload', {
        project_id: null,
        client_id: null,
        employee_id: null,
        category_id: 'profile-photo',
        original_name: f.name,
        content_type: f.type || 'image/jpeg',
      });
      const put = await fetch(up.upload_url, {
        method: 'PUT',
        headers: { 'Content-Type': f.type || 'image/jpeg', 'x-ms-blob-type': 'BlockBlob' },
        body: f,
      });
      if (!put.ok) throw new Error('upload failed');
      const conf: any = await api('POST', '/files/confirm', {
        key: up.key,
        size_bytes: f.size,
        checksum_sha256: 'na',
        content_type: f.type || 'image/jpeg',
      });
      await api('PUT', '/auth/me/profile', { profile_photo_file_id: conf.id });
      await queryClient.invalidateQueries({ queryKey: ['meProfile'] });
      toast.success('Profile photo updated');
    } catch (err) {
      console.error(err);
      toast.error('Failed to update photo');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const startPersonalEdit = () => setIsEditingPersonal(true);

  return (
    <div className={uiCx('w-full min-w-0', uiSpacing.pageStack, 'min-h-full bg-gray-50')}>
      <AppPageHeader
        title="My Information"
        subtitle={pageHeaderSubtitle}
        icon={<UserIcon className="h-4 w-4" />}
        onBack={fromHome ? () => navigate('/overview') : undefined}
        backLabel="Back to Overview"
        actions={pageHeaderToday}
      />

      <div className={uiCx('flex flex-col', isEmployeeCardMinimized ? 'gap-1.5' : 'gap-2')}>
        {isLoading ? (
          <UserInfoHeroSkeleton />
        ) : (
          <UserInfoHero
            primaryTitle={heroPrimaryTitle}
            subtitleLine={employeeSubtitle || null}
            photoUrl={heroPhotoUrl}
            photoInputRef={fileRef}
            onPhotoFileChange={handlePhotoFileChange}
            photoUploading={uploading}
            phone={p.phone || p.mobile_phone || ''}
            personalEmail={u?.email || u?.email_personal || ''}
            workEmail={p.work_email || ''}
            hireDateDisplay={heroHireDateDisplay}
            supervisor={supervisorName || ''}
            age={calcAge(p.date_of_birth) || ''}
            isActive={u?.is_active}
            isCollapsed={isEmployeeCardMinimized}
            onToggleCollapsed={() => setIsEmployeeCardMinimized((v) => !v)}
          />
        )}

        <div className={!isEmployeeCardMinimized ? '-mt-0.5' : undefined}>
          <AppCard bodyClassName={isEmployeeCardMinimized ? 'p-2.5' : '!py-3'}>
            <AppTabs tabs={profileTabItems} value={tab} onChange={(key) => setTab(key as typeof tab)} />
          </AppCard>
        </div>
      </div>

      <AppCard bodyClassName={uiSpacing.cardPadding}>
        {isLoading ? (
          <div className={uiCx('h-24 animate-pulse rounded bg-gray-100', uiRadius.control)} />
        ) : (
          <>
            {tab === 'personal' && (
              <div className={uiCx(uiSpacing.sectionStack, 'pb-24')}>
                <ProfileSectionCard
                  preset="basicInformation"
                  title="Basic Information"
                  description="Core personal details."
                  showEdit={!isEditingPersonal}
                  onEditClick={startPersonalEdit}
                  editTitle="Edit Basic Information"
                >
                  <div className="grid gap-4 md:grid-cols-2">
                    {isEditingPersonal ? (
                      <>
                        <AppInput label="First name" value={form.first_name || ''} onChange={(e) => set('first_name', e.target.value)} />
                        <AppInput label="Last name" value={form.last_name || ''} onChange={(e) => set('last_name', e.target.value)} />
                        <AppInput label="Middle name" value={form.middle_name || ''} onChange={(e) => set('middle_name', e.target.value)} />
                        <AppInput label="Prefered name" value={form.prefered_name || ''} onChange={(e) => set('prefered_name', e.target.value)} />
                        <div className={invalidClass(missingPersonal.includes('gender'))}>
                          <AppSelect
                            label="Gender *"
                            placeholder="Select..."
                            value={form.gender || ''}
                            onChange={(e) => set('gender', e.target.value)}
                            options={genderOptions.map((opt) => ({ value: opt, label: opt }))}
                          />
                        </div>
                        <div className={invalidClass(missingPersonal.includes('marital_status'))}>
                          <AppSelect
                            label="Marital status *"
                            placeholder="Select..."
                            value={form.marital_status || ''}
                            onChange={(e) => set('marital_status', e.target.value)}
                            options={maritalStatusOptions.map((opt) => ({ value: opt, label: opt }))}
                          />
                        </div>
                        <div className={invalidClass(missingPersonal.includes('date_of_birth'))}>
                          <AppDatePicker
                            label="Date of birth *"
                            value={form.date_of_birth ? String(form.date_of_birth).slice(0, 10) : ''}
                            onChange={(e) => set('date_of_birth', e.target.value)}
                          />
                        </div>
                        <div className={invalidClass(missingPersonal.includes('nationality'))}>
                          <div className="space-y-1.5">
                            <AppControlLabelRow label="Nationality *" />
                            <NationalitySelect value={form.nationality || ''} onChange={(v) => set('nationality', v)} className="w-full" />
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          <AppControlLabelRow label="Cloth Size" />
                          <ClothSizeSelect
                            value={form.cloth_size || ''}
                            onChange={(v) => set('cloth_size', v)}
                            allowCustom={false}
                            customSizes={p.cloth_sizes_custom && Array.isArray(p.cloth_sizes_custom) ? p.cloth_sizes_custom : []}
                            className="w-full"
                          />
                        </div>
                      </>
                    ) : (
                      <>
                        <ProfileReadOnlyField label="First name" value={p.first_name || data?.user?.first_name || '—'} />
                        <ProfileReadOnlyField label="Last name" value={p.last_name || data?.user?.last_name || '—'} />
                        <ProfileReadOnlyField label="Middle name" value={p.middle_name || '—'} />
                        <ProfileReadOnlyField label="Prefered name" value={p.prefered_name || '—'} />
                        <ProfileReadOnlyField label="Gender" value={p.gender || '—'} />
                        <ProfileReadOnlyField label="Marital status" value={p.marital_status || '—'} />
                        <ProfileReadOnlyField
                          label="Date of birth"
                          value={p.date_of_birth ? String(p.date_of_birth).slice(0, 10) : '—'}
                        />
                        <ProfileReadOnlyField label="Nationality" value={p.nationality || '—'} />
                        <ProfileReadOnlyField label="Cloth Size" value={p.cloth_size || '—'} />
                      </>
                    )}
                  </div>
                </ProfileSectionCard>

                <ProfileSectionCard
                  preset="address"
                  title="Address"
                  description="Home address for contact and records."
                  showEdit={!isEditingPersonal}
                  onEditClick={startPersonalEdit}
                  editTitle="Edit Address"
                >
                  <div className="grid gap-4 md:grid-cols-2">
                    {isEditingPersonal ? (
                      <>
                        <div className={invalidClass(missingPersonal.includes('address_line1'))}>
                          <div className="space-y-1.5">
                            <AppControlLabelRow label="Address line 1 *" />
                            <AddressAutocomplete
                              value={form.address_line1 || ''}
                              onChange={(value) => set('address_line1', value)}
                              onAddressSelect={(address) => {
                                set('address_line1', address.address_line1 || form.address_line1);
                                if (address.city !== undefined) set('city', address.city);
                                if (address.province !== undefined) set('province', address.province);
                                if (address.postal_code !== undefined) set('postal_code', address.postal_code);
                                if (address.country !== undefined) set('country', address.country);
                              }}
                              placeholder="Start typing an address..."
                              className="w-full rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs text-gray-900 focus:ring-1 focus:ring-gray-400 focus:border-gray-400"
                            />
                          </div>
                        </div>
                        <AppInput
                          label="Complement (e.g., Apt, Unit, Basement)"
                          value={form.address_line1_complement || ''}
                          onChange={(e) => set('address_line1_complement', e.target.value)}
                          placeholder="Apt 101, Unit 2, Basement, etc."
                        />
                        <AppInput label="City *" value={form.city || ''} readOnly inputClassName="bg-gray-50 cursor-not-allowed" />
                        <AppInput label="Province/State *" value={form.province || ''} readOnly inputClassName="bg-gray-50 cursor-not-allowed" />
                        <AppInput label="Postal code *" value={form.postal_code || ''} readOnly inputClassName="bg-gray-50 cursor-not-allowed" />
                        <AppInput label="Country *" value={form.country || ''} readOnly inputClassName="bg-gray-50 cursor-not-allowed" />
                        <div className="space-y-1.5">
                          <AppControlLabelRow label="Address line 2" />
                          <AddressAutocomplete
                            value={form.address_line2 || ''}
                            onChange={(value) => set('address_line2', value)}
                            placeholder="Start typing an address..."
                            className="w-full rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs text-gray-900 focus:ring-1 focus:ring-gray-400 focus:border-gray-400"
                          />
                        </div>
                        <AppInput
                          label="Complement (e.g., Apt, Unit, Basement)"
                          value={form.address_line2_complement || ''}
                          onChange={(e) => set('address_line2_complement', e.target.value)}
                          placeholder="Apt 101, Unit 2, Basement, etc."
                        />
                      </>
                    ) : (
                      <>
                        <ProfileReadOnlyField label="Address line 1" value={p.address_line1 || '—'} />
                        <ProfileReadOnlyField label="Complement" value={p.address_line1_complement || '—'} />
                        <ProfileReadOnlyField label="City" value={p.city || '—'} />
                        <ProfileReadOnlyField label="Province/State" value={p.province || '—'} />
                        <ProfileReadOnlyField label="Postal code" value={p.postal_code || '—'} />
                        <ProfileReadOnlyField label="Country" value={p.country || '—'} />
                        <ProfileReadOnlyField label="Address line 2" value={p.address_line2 || '—'} />
                        <ProfileReadOnlyField label="Complement" value={p.address_line2_complement || '—'} />
                      </>
                    )}
                  </div>
                </ProfileSectionCard>

                <ProfileSectionCard
                  preset="contact"
                  title="Contact"
                  description="How we can reach you."
                  showEdit={!isEditingPersonal}
                  onEditClick={startPersonalEdit}
                  editTitle="Edit Contact"
                >
                  <div className="grid gap-4 md:grid-cols-2">
                    {isEditingPersonal ? (
                      <>
                        <div className={invalidClass(missingPersonal.includes('phone'))}>
                          <AppInput label="Phone 1 *" value={form.phone || ''} onChange={(e) => set('phone', formatPhone(e.target.value))} />
                        </div>
                        <AppInput label="Phone 2" value={form.mobile_phone || ''} onChange={(e) => set('mobile_phone', formatPhone(e.target.value))} />
                      </>
                    ) : (
                      <>
                        <ProfileReadOnlyField label="Phone 1" value={p.phone || '—'} />
                        <ProfileReadOnlyField label="Phone 2" value={p.mobile_phone || '—'} />
                      </>
                    )}
                  </div>
                </ProfileSectionCard>

                {userId ? (
                  <>
                    <ProfileSectionCard
                      preset="education"
                      title="Education"
                      description="Academic history."
                      showEdit={!isEditingPersonal}
                      onEditClick={startPersonalEdit}
                      editTitle="Edit Education"
                    >
                      <EducationSection userId={userId} canEdit={isEditingPersonal} embedded />
                    </ProfileSectionCard>

                    <ProfileSectionCard
                      preset="documents"
                      title="Legal & Documents"
                      description="Legal status and identification."
                      showEdit={!isEditingPersonal}
                      onEditClick={startPersonalEdit}
                      editTitle="Edit Legal & Documents"
                    >
                      <div className="grid gap-4 md:grid-cols-2">
                        {isEditingPersonal ? (
                          <>
                            <div className={invalidClass(missingPersonal.includes('sin_number'))}>
                              <AppInput
                                label="SIN/SSN *"
                                value={form.sin_number || ''}
                                onChange={(e) => set('sin_number', formatSIN(e.target.value))}
                                maxLength={11}
                                placeholder="123-456-789"
                              />
                            </div>
                            <div className={invalidClass(missingPersonal.includes('work_eligibility_status'))}>
                              <AppSelect
                                label="Work Eligibility Status *"
                                placeholder="Select..."
                                value={form.work_eligibility_status || ''}
                                onChange={(e) => set('work_eligibility_status', e.target.value)}
                                options={workEligibilityOptions.map((opt) => ({ value: opt, label: opt }))}
                              />
                            </div>
                          </>
                        ) : (
                          <>
                            <ProfileReadOnlyField label="SIN/SSN" value={p.sin_number || '—'} />
                            <ProfileReadOnlyField label="Work Eligibility Status" value={p.work_eligibility_status || '—'} />
                          </>
                        )}
                      </div>
                      <WorkEligibilityDocumentsSection
                        userId={userId}
                        canEdit={isEditingPersonal}
                        profile={isEditingPersonal ? { ...p, ...form } : p}
                        onProfileFieldsChange={(kv) => {
                          Object.entries(kv).forEach(([k, v]) => set(k, v));
                        }}
                        key={\`work-eligibility-\${p.work_eligibility_status || ''}-\${form.work_eligibility_status || ''}\`}
                      />
                    </ProfileSectionCard>

                    <ProfileSectionCard
                      preset="emergency"
                      title="Emergency Contacts"
                      description="People to contact in case of emergency."
                      showEdit={!isEditingPersonal}
                      onEditClick={startPersonalEdit}
                      editTitle="Edit Emergency Contacts"
                    >
                      <EmergencyContactsSection userId={userId} canEdit={isEditingPersonal} />
                    </ProfileSectionCard>
                  </>
                ) : null}

                {totalMissing > 0 ? (
                  <AppCard className={uiCx(uiBorders.subtle, 'border-red-200 bg-red-50')} bodyClassName={uiSpacing.cardPadding}>
                    <div className={uiTypography.helper}>
                      <div className="mb-1 font-semibold text-red-700">Missing required fields</div>
                      <ul className="list-disc pl-5 text-red-700">
                        {missingPersonalWithContact.map((k) => (
                          <li key={k}>{labelMap[k] || k}</li>
                        ))}
                      </ul>
                    </div>
                  </AppCard>
                ) : null}
              </div>
            )}

            {tab === 'job' && (
              <div className={uiCx(uiSpacing.sectionStack, 'pb-24')}>
                <ProfileSectionCard
                  preset="organization"
                  title="Organization"
                  description="Reporting and work contacts."
                  showEdit={!isEditingPersonal}
                  onEditClick={startPersonalEdit}
                  editTitle="Edit Organization"
                >
                  <div className="grid gap-4 md:grid-cols-2">
                    {isEditingPersonal ? (
                      <>
                        <AppInput
                          label="Job Title"
                          value={form.job_title || ''}
                          onChange={(e) => set('job_title', e.target.value)}
                          placeholder="e.g. Project Manager"
                        />
                        <AppSelect
                          label="Employment Type"
                          placeholder="Select..."
                          value={form.employment_type || ''}
                          onChange={(e) => set('employment_type', e.target.value)}
                          options={employmentTypeOptions}
                        />
                        <ProfileReadOnlyField label="Supervisor" value={supervisorName || '—'} />
                        <AppDatePicker
                          label="Hire Date"
                          value={(form.hire_date || '').slice(0, 10)}
                          onChange={(e) => set('hire_date', e.target.value)}
                        />
                        <ProfileReadOnlyField
                          label="Department"
                          value={
                            data?.user?.divisions && data.user.divisions.length > 0
                              ? data.user.divisions.map((d: any) => d.label).join(', ')
                              : p.division || '—'
                          }
                        />
                        <AppDatePicker
                          label="Termination Date"
                          value={(form.termination_date || '').slice(0, 10)}
                          onChange={(e) => set('termination_date', e.target.value)}
                        />
                        <AppInput label="Work email" value={form.work_email || ''} onChange={(e) => set('work_email', e.target.value)} />
                        <AppInput label="Work phone" value={form.work_phone || ''} onChange={(e) => set('work_phone', e.target.value)} />
                      </>
                    ) : (
                      <>
                        <ProfileReadOnlyField label="Job Title" value={p.job_title || '—'} />
                        <ProfileReadOnlyField label="Employment Type" value={p.employment_type || '—'} />
                        <ProfileReadOnlyField label="Supervisor" value={supervisorName || '—'} />
                        <ProfileReadOnlyField
                          label="Hire Date"
                          value={p.hire_date ? String(p.hire_date).slice(0, 10) : '—'}
                        />
                        <ProfileReadOnlyField
                          label="Department"
                          value={
                            data?.user?.divisions && data.user.divisions.length > 0
                              ? data.user.divisions.map((d: any) => d.label).join(', ')
                              : p.division || '—'
                          }
                        />
                        <ProfileReadOnlyField
                          label="Termination Date"
                          value={p.termination_date ? String(p.termination_date).slice(0, 10) : '—'}
                        />
                        <ProfileReadOnlyField label="Work email" value={p.work_email || '—'} />
                        <ProfileReadOnlyField label="Work phone" value={p.work_phone || '—'} />
                      </>
                    )}
                  </div>
                </ProfileSectionCard>
                {userId ? <TimeOffSection userId={userId} canEdit={true} /> : null}
              </div>
            )}

            {tab === 'docs' &&
              (userId ? (
                <UserDocumentsTabEnhanced userId={userId} canEdit={true} />
              ) : (
                <div className={uiTypography.helper}>Loading...</div>
              ))}

            {tab === 'loans' && hasLoans && userId ? <UserLoans userId={userId} canEdit={false} /> : null}
            {tab === 'reports' && hasReports && userId ? <UserReports userId={userId} canEdit={false} /> : null}
          </>
        )}
      </AppCard>

      {isEditingPersonal ? (
        <div className="fixed bottom-0 left-0 right-0 z-40">
          <div className="mx-auto max-w-[1200px] px-4">
            <AppCard className={uiCx('mb-3', uiShadows.hero)} bodyClassName={uiCx(uiSpacing.cardPadding, uiLayout.actionsRow)}>
              <div className={uiCx(uiTypography.helper, totalMissing > 0 ? 'text-amber-700' : 'text-green-700')}>
                {totalMissing > 0 ? (
                  <>
                    Missing {totalMissing} required field{totalMissing > 1 ? 's' : ''}
                  </>
                ) : (
                  'All required fields completed'
                )}
              </div>
              <div className={uiCx(uiLayout.actionsRow, 'ml-auto')}>
                <AppButton
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={async () => {
                    await queryClient.refetchQueries({ queryKey: ['meProfile'] });
                    setIsEditingPersonal(false);
                  }}
                >
                  Cancel
                </AppButton>
                <AppButton
                  type="button"
                  size="sm"
                  disabled={totalMissing > 0 || isSavingProfile}
                  loading={isSavingProfile}
                  onClick={async () => {
                    if (totalMissing > 0) {
                      toast.error('Please complete required fields');
                      return;
                    }
                    await handleSave();
                  }}
                >
                  Save
                </AppButton>
              </div>
            </AppCard>
          </div>
        </div>
      ) : null}
    </div>
  );
}
`;

profileComponent = logicPart + newReturn;

// Sub-components from UserInfo
const formatEducationPeriod = extractFn(userInfo, 'formatEducationPeriod');
let educationSection = adaptSubComponent(extractFn(userInfo, 'EducationSection'));
let timeOffSection = adaptSubComponent(extractFn(userInfo, 'TimeOffSection'));

// Profile EmergencyContacts has different API logic - keep from Profile but we'll use UserInfo version
// User asked to follow UserInfo - Profile had extra address fields; keep Profile version with UI migration via UserInfo as base
// For now use UserInfo EmergencyContactsSection (simpler) - Profile had more validation. User said don't change API logic.
// Keep Profile EmergencyContacts - extract from profile file
let emergencySection = profile.slice(
  profile.indexOf('function EmergencyContactsSection'),
  profile.indexOf('function requiresVisaAndImmigration'),
);

// Adapt Work eligibility sections from UserInfo but patch Immigration for /auth/me/profile
let workEligibility = adaptSubComponent(extractFn(userInfo, 'WorkEligibilityDocumentsSection'));
let prCard = adaptSubComponent(extractFn(userInfo, 'PRCardUploadSection'));
let immigration = adaptSubComponent(extractFn(userInfo, 'ImmigrationStatusDocumentSection'));
let visa = adaptSubComponent(extractFn(userInfo, 'VisaInformationSection'));

// Patch PR card and immigration for me profile invalidation
prCard = prCard
  .replace(/queryClient\.invalidateQueries\(\{ queryKey: \['userProfile', userId\] \}\)/g, "queryClient.invalidateQueries({ queryKey: ['meProfile'] }); await queryClient.invalidateQueries({ queryKey: ['me-profile'] })");

immigration = immigration
  .replace(
    "queryFn: () => api<any>('GET', `/auth/users/${encodeURIComponent(userId)}/profile`),",
    "queryFn: () => api<any>('GET', '/auth/me/profile'),",
  )
  .replace(
    "await api('PUT', `/auth/users/${encodeURIComponent(userId)}/profile`, {\n        permit_file_id: conf.id,\n      });",
    "await api('PUT', '/auth/me/profile', {\n        permit_file_id: conf.id,\n      });",
  )
  .replace(
    "await api('PUT', `/auth/users/${encodeURIComponent(userId)}/profile`, { permit_file_id: null });",
    "await api('PUT', '/auth/me/profile', { permit_file_id: null });",
  )
  .replace(/queryClient\.invalidateQueries\(\{ queryKey: \['userProfile', userId\] \}\)/g, "queryClient.invalidateQueries({ queryKey: ['meProfile'] }); await queryClient.invalidateQueries({ queryKey: ['me-profile'] })");

// Migrate Profile EmergencyContacts UI - use UserInfo version instead since user asked to follow UserInfo
emergencySection = adaptSubComponent(extractFn(userInfo, 'EmergencyContactsSection'));

const helpers = [
  formatEducationPeriod,
  extractFn(userInfo, 'requiresVisaAndImmigration'),
  extractFn(userInfo, 'getOrCreatePersonalDocumentsFolder'),
  `function immigrationFileIdentity(f: File): string {
  return \`\${f.name}\\0\${f.size}\\0\${f.lastModified}\`;
}`,
  adaptSubComponent(extractFn(userInfo, 'ProfileStoredFilePreviewCard')),
].join('\n\n');

const output = header + profileComponent + '\n\n' + helpers + '\n\n' + educationSection + '\n\n' + timeOffSection + '\n\n' + emergencySection + '\n\n' + workEligibility + '\n\n' + prCard + '\n\n' + immigration + '\n\n' + visa + '\n';

fs.writeFileSync(path.join(pagesDir, 'Profile.tsx'), output);
console.log('Wrote Profile.tsx, length:', output.length);
