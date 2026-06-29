import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, withFileAccessToken } from '@/lib/api';
import { sortByLabel } from '@/lib/sortOptions';
import { queryClient } from '@/lib/queryClient';
import { useRef, useState, useMemo, useEffect, type ChangeEvent, type ReactNode } from 'react';
import toast from 'react-hot-toast';
import { useConfirm } from '@/components/ConfirmProvider';
import AddressAutocomplete from '@/components/AddressAutocomplete';
import UserLoans from '@/components/UserLoans';
import UserReports from '@/components/UserReports';
import { useNavigate, useLocation } from 'react-router-dom';
import OverlayPortal from '@/components/OverlayPortal';
import { UserInfoHero, UserInfoHeroSkeleton } from '@/components/users/UserInfoHero';
import UserDocumentsTabEnhanced from '@/components/users/UserDocumentsTabEnhanced';
import { UserEducationSection } from '@/components/users/UserEducationSection';
import { UserEmergencyContactsSection } from '@/components/users/UserEmergencyContactsSection';
import { UserWorkEligibilityDocumentsSection } from '@/components/users/UserWorkEligibilityDocumentsSection';
import {
  ProfileAddressForm,
  ProfileBasicInfoForm,
  ProfileContactForm,
  ProfileLegalDocumentsFields,
  ProfileOrganizationForm,
  ProfileReadOnlyGrid,
} from '@/components/users/ProfileSelfEditForms';
import { User as UserIcon } from 'lucide-react';
import {
  userAddressQuickInfo,
  userBasicInfoQuickInfo,
  userContactQuickInfo,
  userEducationQuickInfo,
  userEmergencyContactsQuickInfo,
  userLegalDocumentsQuickInfo,
  userOrganizationQuickInfo,
} from '@/lib/formModalQuickInfo';
import {
  AppButton,
  AppCard,
  AppEmptyState,
  AppFormModal,
  AppHeroEditButton,
  AppPageHeader,
  AppReadOnlyField,
  AppSectionHeader,
  AppTabs,
  appSectionPresetProps,
  type AppSectionPresetKey,
  uiCx,
  uiLayout,
  uiRadius,
  uiSpacing,
  uiTypography,
} from '@/components/ui';

type ProfileResp = { user:{ username:string, email?:string, email_personal?:string, first_name?:string, last_name?:string, is_active?:boolean, divisions?: Array<{id:string, label:string}> }, profile?: any };

type ProfilePersonalEditSection = 'basic' | 'address' | 'contact' | 'education' | 'legal' | 'emergency';
type ProfileJobEditSection = 'organization';

const PROFILE_TAB_LABELS: Record<string, string> = {
  personal: 'Personal',
  job: 'Job',
  docs: 'Docs',
  loans: 'Loans',
  reports: 'Reports',
};

function ProfileSectionCard({
  preset,
  title,
  description,
  editTitle,
  showEdit,
  onEditClick,
  children,
}: {
  preset: AppSectionPresetKey;
  title: string;
  description?: string;
  editTitle?: string;
  showEdit?: boolean;
  onEditClick?: () => void;
  children: ReactNode;
}) {
  return (
    <AppCard bodyClassName={uiSpacing.cardPadding}>
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

export default function Profile(){
  const navigate = useNavigate();
  const location = useLocation();
  const fromHome = location.state?.fromHome === true;
  const { data, isLoading } = useQuery({ queryKey:['meProfile'], queryFn: ()=>api<ProfileResp>('GET','/auth/me/profile') });
  const p = data?.profile || {};
  const u = (data?.user ?? {}) as ProfileResp['user'];
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [tab, setTab] = useState<'personal'|'job'|'docs'|'loans'|'reports'>('personal');
  const [personalEditSection, setPersonalEditSection] = useState<ProfilePersonalEditSection | null>(null);
  const [jobEditSection, setJobEditSection] = useState<ProfileJobEditSection | null>(null);
  const [sectionModalPending, setSectionModalPending] = useState<Record<string, unknown>>({});
  const [sectionModalSaving, setSectionModalSaving] = useState(false);
  const [isEmployeeCardMinimized, setIsEmployeeCardMinimized] = useState(false);
  // Get current user ID for components
  const { data:me } = useQuery({ queryKey:['me'], queryFn: ()=> api<any>('GET','/auth/me') });
  const userId = me?.id ? String(me.id) : '';
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
    queryFn: () => api<any>('GET', `/auth/users/${p?.manager_user_id}/profile`),
    enabled: !!p?.manager_user_id,
  });
  const supervisorName = useMemo(() => {
    if (supervisorProfile?.profile) {
      const fn = supervisorProfile.profile.first_name || '';
      const ln = supervisorProfile.profile.last_name || '';
      const full = `${fn} ${ln}`.trim();
      if (full) return full;
    }
    if (!p?.manager_user_id) return '';
    const row = (usersOptions || []).find((x: any) => String(x.id) === String(p.manager_user_id));
    return row ? String(row.name || row.username || row.email || '') : '';
  }, [usersOptions, p?.manager_user_id, supervisorProfile]);
  function calcAge(dob?: string) {
    if (!dob) return '';
    try { const d = new Date(dob); const now = new Date(); let a = now.getFullYear() - d.getFullYear(); const m = now.getMonth() - d.getMonth(); if (m < 0 || (m === 0 && now.getDate() < d.getDate())) a--; return a > 0 ? `${a}y` : '—'; } catch { return ''; }
  }
  function tenure(from?: string) {
    if (!from) return '';
    try { const s = new Date(from); const now = new Date(); let months = (now.getFullYear() - s.getFullYear()) * 12 + (now.getMonth() - s.getMonth()); if (now.getDate() < s.getDate()) months--; const y = Math.floor(months / 12); const m = months % 12; return y > 0 ? `${y}y ${m}m` : `${m}m`; } catch { return ''; }
  }
  const todayLabel = useMemo(() => new Date().toLocaleDateString('en-CA', { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric' }), []);
  
  // Check if user has any loans to show the Loans tab
  const { data: userLoans } = useQuery({
    queryKey: ['loans', userId],
    queryFn: () => api<any[]>('GET', `/employees/${userId}/loans`),
    enabled: !!userId,
  });
  const hasLoans = userLoans && userLoans.length > 0;
  
  // Check if user has any reports to show the Reports tab
  const { data: userReports } = useQuery({
    queryKey: ['reports', 'user', userId],
    queryFn: () => api<any[]>('GET', `/employees/${userId}/reports`),
    enabled: !!userId,
  });
  const hasReports = userReports && userReports.length > 0;

  const { data: visasData } = useQuery({ 
    queryKey:['employee-visas', userId], 
    queryFn: ()=> api<any[]>('GET', `/auth/users/${encodeURIComponent(userId)}/visas`).catch(() => []),
    enabled: !!userId
  });
  const hasVisas = visasData && visasData.length > 0;
  
  // Auto-fill work_eligibility_status if user has visas but no status
  useEffect(() => {
    const hasNoStatus = !p.work_eligibility_status || p.work_eligibility_status.trim() === '';
    if (hasVisas && hasNoStatus && userId && personalEditSection !== 'legal') {
      const autoFillStatus = 'Temporary Resident (with work authorization)';
      api('PUT', '/auth/me/profile', { work_eligibility_status: autoFillStatus })
        .then(() => {
          queryClient.invalidateQueries({ queryKey:['meProfile'] });
          queryClient.refetchQueries({ queryKey:['meProfile'] });
        })
        .catch((e) => {
          console.error('Failed to auto-fill work_eligibility_status:', e);
        });
    }
  }, [hasVisas, p.work_eligibility_status, userId, personalEditSection, queryClient]);

  const closePersonalEditModal = () => {
    setPersonalEditSection(null);
    setSectionModalPending({});
  };

  const closeJobEditModal = () => {
    setJobEditSection(null);
    setSectionModalPending({});
  };

  const openPersonalEditModal = (section: ProfilePersonalEditSection) => {
    setSectionModalPending({});
    setPersonalEditSection(section);
  };

  const openJobEditModal = (section: ProfileJobEditSection) => {
    setSectionModalPending({});
    setJobEditSection(section);
  };

  const collectSectionModalChanges = (kv: Record<string, unknown>) => {
    setSectionModalPending((s) => ({ ...s, ...kv }));
  };

  const refreshMeProfile = async () => {
    await queryClient.invalidateQueries({ queryKey: ['meProfile'] });
    await queryClient.invalidateQueries({ queryKey: ['me-profile'] });
    await queryClient.invalidateQueries({ queryKey: ['emergency-contacts'] });
    await queryClient.refetchQueries({ queryKey: ['meProfile'] });
  };

  const saveSectionModalProfile = async () => {
    if (sectionModalSaving) return;
    if (!Object.keys(sectionModalPending).length) {
      closePersonalEditModal();
      return;
    }
    try {
      setSectionModalSaving(true);
      await api('PUT', '/auth/me/profile', sectionModalPending);
      toast.success('Saved');
      await refreshMeProfile();
      closePersonalEditModal();
    } catch (e: unknown) {
      const err = e as { message?: string };
      toast.error(err?.message || 'Failed to save');
    } finally {
      setSectionModalSaving(false);
    }
  };

  const saveJobSectionModal = async () => {
    if (sectionModalSaving) return;
    if (!Object.keys(sectionModalPending).length) {
      closeJobEditModal();
      return;
    }
    try {
      setSectionModalSaving(true);
      await api('PUT', '/auth/me/profile', sectionModalPending);
      toast.success('Saved');
      await refreshMeProfile();
      closeJobEditModal();
    } catch (e: unknown) {
      const err = e as { message?: string };
      toast.error(err?.message || 'Failed to save');
    } finally {
      setSectionModalSaving(false);
    }
  };

  // Missing required indicators by category
  const reqPersonal = ['gender','date_of_birth','marital_status','nationality','phone','address_line1','city','province','postal_code','country','sin_number','work_eligibility_status'];
  const missingPersonal = reqPersonal.filter(k => !String((p as Record<string, unknown>)[k]||'').trim());
  
  // Check if at least one emergency contact exists
  const { data: emergencyContactsData } = useQuery({ 
    queryKey:['emergency-contacts', userId], 
    queryFn: ()=> api<any[]>('GET', `/auth/users/${encodeURIComponent(userId)}/emergency-contacts`),
    enabled: !!userId
  });
  const hasEmergencyContact = emergencyContactsData && emergencyContactsData.length > 0;
  const missingPersonalWithContact = [...missingPersonal];
  if (!hasEmergencyContact && userId) {
    missingPersonalWithContact.push('emergency_contact');
  }
  
  const totalMissing = missingPersonalWithContact.length;

  const modalFooter = (onCancel: () => void, onSave: () => void, saveLabel = 'Save') => (
    <div className={uiCx(uiLayout.actionsRow, 'w-full justify-end')}>
      <AppButton type="button" variant="secondary" size="sm" onClick={onCancel}>
        Cancel
      </AppButton>
      <AppButton type="button" size="sm" loading={sectionModalSaving} disabled={sectionModalSaving} onClick={onSave}>
        {saveLabel}
      </AppButton>
    </div>
  );

  const doneFooter = (onClose: () => void) => (
    <div className={uiCx(uiLayout.actionsRow, 'w-full justify-end')}>
      <AppButton type="button" variant="secondary" size="sm" onClick={onClose}>
        Done
      </AppButton>
    </div>
  );
  
  const labelMap: Record<string,string> = {
    gender:'Gender', date_of_birth:'Date of birth', marital_status:'Marital status', nationality:'Nationality',
    phone:'Phone 1', address_line1:'Address line 1', city:'City', province:'Province/State', postal_code:'Postal code', country:'Country',
    sin_number:'SIN/SSN',
    emergency_contact:'At least one emergency contact'
  };
  const displayName = [p.first_name || u?.first_name, p.last_name || u?.last_name].filter(Boolean).join(' ') || u?.username || 'My Information';

  const pageHeaderToday = (
    <div className="text-right">
      <div className="text-[10px] font-medium uppercase tracking-wide text-gray-500">Today</div>
      <div className="mt-0.5 text-xs font-semibold text-gray-700">{todayLabel}</div>
    </div>
  );

  const profileSubtitle =
    `Personal details, employment, and documents.${
      totalMissing > 0 ? ` Missing ${totalMissing} required field${totalMissing > 1 ? 's' : ''}.` : ''
    }`;

  const profileTabItems = useMemo(
    () =>
      (['personal', 'job', 'docs', 'loans', 'reports'] as const)
        .filter((k) => (k === 'loans' ? hasLoans : k === 'reports' ? hasReports : true))
        .map((k) => ({ key: k, label: PROFILE_TAB_LABELS[k] || k })),
    [hasLoans, hasReports],
  );

  const heroPrimaryTitle = useMemo(() => {
    const name = displayName;
    return u?.username ? `${name} (${u.username})` : name;
  }, [displayName, u?.username]);

  const heroPhotoUrl = useMemo(
    () =>
      p.profile_photo_file_id
        ? withFileAccessToken(`/files/${p.profile_photo_file_id}/thumbnail?w=400`)
        : '/ui/assets/placeholders/user.png',
    [p.profile_photo_file_id],
  );

  const employeeSubtitle = useMemo(
    () =>
      `${p.job_title || '—'}${
        u?.divisions?.length
          ? ` • ${u.divisions.map((d: { label: string }) => d.label).join(', ')}`
          : p.division
            ? ` • ${p.division}`
            : ''
      }`,
    [p.job_title, p.division, u?.divisions],
  );

  const heroHireDateDisplay = useMemo(() => {
    if (!p.hire_date) return null;
    const date = String(p.hire_date).slice(0, 10);
    const t = tenure(p.hire_date);
    return t ? `${date} (${t})` : date;
  }, [p.hire_date]);

  const handlePhotoFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
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

  return (
    <div className={uiCx('w-full min-w-0', uiSpacing.pageStack, 'min-h-full bg-gray-50')}>
      <AppPageHeader
        title="My Information"
        subtitle={profileSubtitle}
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

      {isLoading ? (
        <AppCard bodyClassName={uiSpacing.cardPadding}>
          <div className={uiCx('h-24 animate-pulse rounded bg-gray-100', uiRadius.control)} />
        </AppCard>
      ) : tab === 'docs' && userId ? (
        <UserDocumentsTabEnhanced userId={userId} canEdit variant="profile" />
      ) : (
        <AppCard bodyClassName={uiSpacing.cardPadding}>
          <div>
            <>
              {tab==='personal' && (
                <div className={uiSpacing.sectionStack}>
                  <ProfileSectionCard
                    preset="basicInformation"
                    title="Basic Information"
                    description="Core personal details."
                    showEdit
                    onEditClick={() => openPersonalEditModal('basic')}
                    editTitle="Edit Basic Information"
                  >
                    <ProfileReadOnlyGrid
                      fields={[
                        { label: 'First name', value: p.first_name || data?.user?.first_name },
                        { label: 'Last name', value: p.last_name || data?.user?.last_name },
                        { label: 'Middle name', value: p.middle_name },
                        { label: 'Prefered name', value: p.prefered_name },
                        { label: 'Gender', value: p.gender },
                        { label: 'Marital status', value: p.marital_status },
                        { label: 'Date of birth', value: p.date_of_birth ? String(p.date_of_birth).slice(0, 10) : '' },
                        { label: 'Nationality', value: p.nationality },
                        { label: 'Cloth Size', value: p.cloth_size },
                      ]}
                    />
                  </ProfileSectionCard>

                  <ProfileSectionCard
                    preset="address"
                    title="Address"
                    description="Home address for contact and records."
                    showEdit
                    onEditClick={() => openPersonalEditModal('address')}
                    editTitle="Edit Address"
                  >
                    <ProfileReadOnlyGrid
                      fields={[
                        { label: 'Address line 1', value: p.address_line1 },
                        { label: 'Complement', value: p.address_line1_complement },
                        { label: 'City', value: p.city },
                        { label: 'Province/State', value: p.province },
                        { label: 'Postal code', value: p.postal_code },
                        { label: 'Country', value: p.country },
                        { label: 'Address line 2', value: p.address_line2 },
                        { label: 'Complement', value: p.address_line2_complement },
                      ]}
                    />
                  </ProfileSectionCard>

                  <ProfileSectionCard
                    preset="contact"
                    title="Contact"
                    description="How we can reach you."
                    showEdit
                    onEditClick={() => openPersonalEditModal('contact')}
                    editTitle="Edit Contact"
                  >
                    <ProfileReadOnlyGrid
                      fields={[
                        { label: 'Phone 1', value: p.phone },
                        { label: 'Phone 2', value: p.mobile_phone },
                      ]}
                    />
                  </ProfileSectionCard>

                  {userId && (
                    <>
                      <ProfileSectionCard
                        preset="education"
                        title="Education"
                        description="Academic history."
                        showEdit
                        onEditClick={() => openPersonalEditModal('education')}
                        editTitle="Edit Education"
                      >
                        <UserEducationSection userId={userId} canEdit={false} />
                      </ProfileSectionCard>

                      <ProfileSectionCard
                        preset="documents"
                        title="Legal & Documents"
                        description="Legal status and identification."
                        showEdit
                        onEditClick={() => openPersonalEditModal('legal')}
                        editTitle="Edit Legal & Documents"
                      >
                        <ProfileReadOnlyGrid
                          fields={[
                            { label: 'SIN/SSN', value: p.sin_number },
                            { label: 'Work Eligibility Status', value: p.work_eligibility_status },
                          ]}
                        />
                        <UserWorkEligibilityDocumentsSection
                          userId={userId}
                          canEdit={false}
                          profile={p}
                          onProfileFieldsChange={() => undefined}
                          selfProfile
                          key={`work-eligibility-read-${p.work_eligibility_status || ''}`}
                        />
                      </ProfileSectionCard>

                      <ProfileSectionCard
                        preset="emergency"
                        title="Emergency Contacts"
                        description="People to contact in case of emergency."
                        showEdit
                        onEditClick={() => openPersonalEditModal('emergency')}
                        editTitle="Edit Emergency Contacts"
                      >
                        <UserEmergencyContactsSection userId={userId} canEdit={false} />
                      </ProfileSectionCard>
                    </>
                  )}
                  {totalMissing > 0 && (
                    <div className="mt-6">
                      <div className="rounded border border-red-200 bg-red-50 p-3">
                        <div className="text-sm text-gray-700">
                          <div className="mb-1 font-semibold text-red-700">Missing required fields</div>
                          <ul className="list-disc pl-5 text-red-700">
                            {missingPersonalWithContact.map((k) => (
                              <li key={k}>{labelMap[k] || k}</li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
              {tab==='job' && (
                <div className={uiSpacing.sectionStack}>
                  <ProfileSectionCard
                    preset="employment"
                    title="Organization"
                    description="Reporting and work contacts."
                    showEdit
                    onEditClick={() => openJobEditModal('organization')}
                    editTitle="Edit Organization"
                  >
                    <ProfileReadOnlyGrid
                      fields={[
                        { label: 'Job Title', value: p.job_title },
                        { label: 'Employment Type', value: p.employment_type },
                        { label: 'Supervisor', value: supervisorName },
                        { label: 'Hire Date', value: p.hire_date ? String(p.hire_date).slice(0, 10) : '' },
                        {
                          label: 'Department',
                          value:
                            data?.user?.divisions && data.user.divisions.length > 0
                              ? data.user.divisions.map((d: { label: string }) => d.label).join(', ')
                              : p.division,
                        },
                        { label: 'Termination Date', value: p.termination_date ? String(p.termination_date).slice(0, 10) : '' },
                        { label: 'Work email', value: p.work_email },
                        { label: 'Work phone', value: p.work_phone },
                      ]}
                    />
                  </ProfileSectionCard>
                  {userId && (
                    <ProfileSectionCard
                      preset="timesheet"
                      title="Time Off"
                      description="View your balances, upcoming time off, and history."
                    >
                      <TimeOffSection userId={userId} canEdit={false} />
                    </ProfileSectionCard>
                  )}
                </div>
              )}
              {tab==='loans' && hasLoans && userId && (
                <UserLoans userId={userId} canEdit={false} />
              )}
              {tab==='reports' && hasReports && userId && (
                <UserReports userId={userId} canEdit={false} />
              )}
            </>
          </div>
        </AppCard>
      )}

      <AppFormModal
        open={personalEditSection === 'basic'}
        onClose={closePersonalEditModal}
        title="Edit Basic Information"
        description="Legal name and identity details."
        formWidth="comfortable"
        quickInfo={userBasicInfoQuickInfo}
        footer={modalFooter(closePersonalEditModal, saveSectionModalProfile)}
      >
        <ProfileBasicInfoForm p={p} profileData={data} collectChanges={collectSectionModalChanges} showFieldHints />
      </AppFormModal>

      <AppFormModal
        open={personalEditSection === 'address'}
        onClose={closePersonalEditModal}
        title="Edit Address"
        description="Primary mailing and location address."
        formWidth="wide"
        quickInfo={userAddressQuickInfo}
        footer={modalFooter(closePersonalEditModal, saveSectionModalProfile)}
      >
        <ProfileAddressForm p={p} collectChanges={collectSectionModalChanges} showFieldHints />
      </AppFormModal>

      <AppFormModal
        open={personalEditSection === 'contact'}
        onClose={closePersonalEditModal}
        title="Edit Contact"
        description="Personal phone numbers for reaching you."
        formWidth="comfortable"
        quickInfo={userContactQuickInfo}
        footer={modalFooter(closePersonalEditModal, saveSectionModalProfile)}
      >
        <ProfileContactForm p={p} collectChanges={collectSectionModalChanges} showFieldHints />
      </AppFormModal>

      <AppFormModal
        open={personalEditSection === 'education'}
        onClose={closePersonalEditModal}
        title="Edit Education"
        description="Degrees and institutions on file."
        formWidth="wide"
        quickInfo={userEducationQuickInfo}
        footer={doneFooter(closePersonalEditModal)}
      >
        {userId ? <UserEducationSection userId={userId} canEdit embedded showFieldHints /> : null}
      </AppFormModal>

      <AppFormModal
        open={personalEditSection === 'legal'}
        onClose={closePersonalEditModal}
        title="Edit Legal & Documents"
        description="SIN, work eligibility, and supporting documents."
        formWidth="wide"
        quickInfo={userLegalDocumentsQuickInfo}
        footer={modalFooter(closePersonalEditModal, saveSectionModalProfile)}
      >
        {userId ? (
          <ProfileLegalDocumentsFields
            p={p}
            pending={sectionModalPending}
            userId={userId}
            collectChanges={collectSectionModalChanges}
            showFieldHints
            selfProfile
            key={`legal-modal-${p.work_eligibility_status || ''}-${String(sectionModalPending.work_eligibility_status || '')}`}
          />
        ) : null}
      </AppFormModal>

      <AppFormModal
        open={personalEditSection === 'emergency'}
        onClose={closePersonalEditModal}
        title="Edit Emergency Contacts"
        description="People to contact in an emergency."
        formWidth="wide"
        quickInfo={userEmergencyContactsQuickInfo}
        footer={doneFooter(closePersonalEditModal)}
      >
        {userId ? <UserEmergencyContactsSection userId={userId} canEdit showFieldHints /> : null}
      </AppFormModal>

      <AppFormModal
        open={jobEditSection === 'organization'}
        onClose={closeJobEditModal}
        title="Edit Organization"
        description="Job title and work contact details."
        formWidth="wide"
        quickInfo={userOrganizationQuickInfo}
        footer={modalFooter(closeJobEditModal, saveJobSectionModal)}
      >
        <ProfileOrganizationForm p={p} collectChanges={collectSectionModalChanges} showFieldHints />
      </AppFormModal>
    </div>
  );
}


function TimeOffSection({ userId, canEdit }:{ userId:string, canEdit:boolean }){
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
    if (r.status !== 'pending') return false;
    const endDate = new Date(r.end_date);
    return endDate < new Date() || r.status !== 'approved';
  }) || [];
  
  const hoursToDays = (hours: number) => {
    return (hours / 8).toFixed(1);
  };
  
  return (
    <div className="space-y-4">
      <div className="grid md:grid-cols-2 gap-4">
        <div className="rounded-lg border bg-white p-4">
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
                    {canEdit && (
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
        
        <div className="rounded-lg border bg-white p-4">
          <div className="flex items-center justify-between mb-3">
            <h5 className="font-semibold flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Upcoming Time Off
            </h5>
            {canEdit && availablePolicies.length > 0 && (
              <button
              onClick={() => setShowRequestForm(true)}
              className="px-2 py-1 rounded bg-brand-red text-white text-xs hover:bg-red-700"
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
            <AppEmptyState
              title="No upcoming time off"
              description="No approved or pending requests scheduled."
              className="border-0 bg-transparent p-0 py-6 shadow-none"
            />
          )}
        </div>
      </div>
      
      <div className="rounded-lg border bg-white p-4">
        <div className="flex items-center justify-between mb-3">
          <h5 className="font-semibold flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            History
          </h5>
          {canEdit && (
            <button
              onClick={handleSyncHistory}
              disabled={syncingHistory}
              className="px-3 py-1.5 rounded border text-sm disabled:opacity-50 hover:bg-gray-50"
              title="Sync history from BambooHR"
            >
              {syncingHistory ? 'Syncing...' : 'Sync History'}
            </button>
          )}
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
            {canEdit ? 'No history available. Click "Sync History" to load from BambooHR.' : 'No history available.'}
          </div>
        )}
      </div>
      
      {canEdit && showRequestForm && (
        <OverlayPortal><div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
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
        </div></OverlayPortal>
      )}
      
      {canEdit && showAdjustModal && adjustingBalance && (
        <OverlayPortal><div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setShowAdjustModal(false)}>
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
        </div></OverlayPortal>
      )}
    </div>
  );
}


