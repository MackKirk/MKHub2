import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import NationalitySelect from '@/components/NationalitySelect';
import AddressAutocomplete from '@/components/AddressAutocomplete';
import ClothSizeSelect from '@/components/ClothSizeSelect';
import {
  AppControlLabelRow,
  AppDatePicker,
  AppFieldHint,
  AppInput,
  AppReadOnlyField,
  AppSelect,
  uiCx,
  uiSpacing,
  uiTypography,
} from '@/components/ui';
import { UserWorkEligibilityDocumentsSection } from '@/components/users/UserWorkEligibilityDocumentsSection';
import { userProfileFieldHint } from '@/lib/userProfileFieldHints';

const ADDRESS_INPUT_CLASS =
  'w-full rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs text-gray-900 focus:ring-1 focus:ring-gray-400 focus:border-gray-400';

const GENDER_OPTIONS = ['Male', 'Female', 'Other', 'Prefer not to say'].map((v) => ({ value: v, label: v }));
const MARITAL_OPTIONS = ['Single', 'Married', 'Common-law', 'Divorced', 'Widowed', 'Prefer not to say'].map((v) => ({
  value: v,
  label: v,
}));
const EMPLOYMENT_OPTIONS = ['Full-time', 'Hourly', 'Part-time', 'Salary'].map((v) => ({ value: v, label: v }));

function formatPhone(v: string) {
  const d = String(v || '')
    .replace(/\D+/g, '')
    .slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  if (d.length <= 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  return `+${d.slice(0, 1)} (${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7, 11)}`;
}

function formatSIN(v: string) {
  const d = String(v || '')
    .replace(/\D+/g, '')
    .slice(0, 9);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}-${d.slice(3)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
}

type CollectFn = (kv: Record<string, unknown>) => void;

export function ProfileBasicInfoForm({
  p,
  profileData,
  collectChanges,
  showFieldHints,
}: {
  p: Record<string, unknown>;
  profileData?: { profile?: Record<string, unknown> };
  collectChanges: CollectFn;
  showFieldHints?: boolean;
}) {
  const queryClient = useQueryClient();
  const currentProfile = profileData?.profile || p;
  const [form, setForm] = useState(() => ({
    first_name: String(p.first_name || ''),
    last_name: String(p.last_name || ''),
    middle_name: String(p.middle_name || ''),
    prefered_name: String(p.prefered_name || ''),
    gender: String(p.gender || ''),
    marital_status: String(p.marital_status || ''),
    date_of_birth: String(p.date_of_birth || '').slice(0, 10),
    nationality: String(p.nationality || ''),
    cloth_size: String(p.cloth_size || ''),
  }));
  const [customSizes, setCustomSizes] = useState<string[]>(() => {
    const custom = currentProfile.cloth_sizes_custom;
    return custom && Array.isArray(custom) ? custom : [];
  });

  useEffect(() => {
    const custom = currentProfile.cloth_sizes_custom;
    setCustomSizes(custom && Array.isArray(custom) ? custom : []);
  }, [currentProfile.cloth_sizes_custom]);

  const setField = (key: string, value: string) => {
    setForm((s) => ({ ...s, [key]: value }));
    collectChanges({ [key]: value });
  };

  const hint = (key: string) => (showFieldHints && userProfileFieldHint(key) ? userProfileFieldHint(key) : undefined);

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <AppInput label="First name" value={form.first_name} onChange={(e) => setField('first_name', e.target.value)} fieldHint={hint('first_name')} />
      <AppInput label="Last name" value={form.last_name} onChange={(e) => setField('last_name', e.target.value)} fieldHint={hint('last_name')} />
      <AppInput label="Middle name" value={form.middle_name} onChange={(e) => setField('middle_name', e.target.value)} fieldHint={hint('middle_name')} />
      <AppInput label="Prefered name" value={form.prefered_name} onChange={(e) => setField('prefered_name', e.target.value)} fieldHint={hint('preferred_name')} />
      <AppSelect label="Gender *" placeholder="Select..." value={form.gender} onChange={(e) => setField('gender', e.target.value)} options={GENDER_OPTIONS} fieldHint={hint('gender')} />
      <AppSelect label="Marital status *" placeholder="Select..." value={form.marital_status} onChange={(e) => setField('marital_status', e.target.value)} options={MARITAL_OPTIONS} fieldHint={hint('marital_status')} />
      <AppDatePicker label="Date of birth *" value={form.date_of_birth} onChange={(e) => setField('date_of_birth', e.target.value)} fieldHint={hint('date_of_birth')} />
      <div className="space-y-1.5">
        <AppControlLabelRow label="Nationality *" fieldHint={hint('nationality') ? <AppFieldHint hint={hint('nationality')!} /> : undefined} />
        <NationalitySelect value={form.nationality} onChange={(v) => setField('nationality', v)} className="w-full" />
      </div>
      <div className="space-y-1.5">
        <AppControlLabelRow label="Cloth Size" fieldHint={hint('cloth_size') ? <AppFieldHint hint={hint('cloth_size')!} /> : undefined} />
        <ClothSizeSelect
          value={form.cloth_size}
          onChange={(v) => setField('cloth_size', v)}
          allowCustom
          customSizes={customSizes}
          useGlobalCustomSizes
          onRefreshCustomSizes={async () => {
            await queryClient.invalidateQueries({ queryKey: ['meProfile'] });
            await queryClient.refetchQueries({ queryKey: ['meProfile'] });
          }}
          className="w-full"
        />
      </div>
    </div>
  );
}

export function ProfileAddressForm({
  p,
  collectChanges,
  showFieldHints,
}: {
  p: Record<string, unknown>;
  collectChanges: CollectFn;
  showFieldHints?: boolean;
}) {
  const [form, setForm] = useState(() => ({
    address_line1: String(p.address_line1 || ''),
    address_line1_complement: String(p.address_line1_complement || ''),
    address_line2: String(p.address_line2 || ''),
    address_line2_complement: String(p.address_line2_complement || ''),
    city: String(p.city || ''),
    province: String(p.province || ''),
    postal_code: String(p.postal_code || ''),
    country: String(p.country || ''),
  }));

  const patch = (kv: Record<string, string>) => {
    setForm((s) => ({ ...s, ...kv }));
    collectChanges(kv);
  };

  const hint = (key: string) => (showFieldHints && userProfileFieldHint(key) ? userProfileFieldHint(key) : undefined);

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="space-y-1.5 md:col-span-2">
        <AppControlLabelRow label="Address line 1 *" fieldHint={hint('address_line1') ? <AppFieldHint hint={hint('address_line1')!} /> : undefined} />
        <AddressAutocomplete
          value={form.address_line1}
          onChange={(value) => patch({ address_line1: value })}
          onAddressSelect={(address) => {
            patch({
              address_line1: address.address_line1 ?? form.address_line1,
              ...(address.city !== undefined ? { city: address.city } : {}),
              ...(address.province !== undefined ? { province: address.province } : {}),
              ...(address.postal_code !== undefined ? { postal_code: address.postal_code } : {}),
              ...(address.country !== undefined ? { country: address.country } : {}),
            });
          }}
          placeholder="Start typing an address..."
          className={ADDRESS_INPUT_CLASS}
        />
      </div>
      <AppInput
        label="Complement (e.g., Apt, Unit, Basement)"
        value={form.address_line1_complement}
        onChange={(e) => patch({ address_line1_complement: e.target.value })}
        placeholder="Apt 101, Unit 2, Basement, etc."
      />
      <AppInput label="City *" value={form.city} onChange={(e) => patch({ city: e.target.value })} fieldHint={hint('city')} />
      <AppInput label="Province/State *" value={form.province} onChange={(e) => patch({ province: e.target.value })} fieldHint={hint('province')} />
      <AppInput label="Postal code *" value={form.postal_code} onChange={(e) => patch({ postal_code: e.target.value })} fieldHint={hint('postal_code')} />
      <AppInput label="Country *" value={form.country} onChange={(e) => patch({ country: e.target.value })} fieldHint={hint('country')} />
      <div className="space-y-1.5 md:col-span-2">
        <AppControlLabelRow label="Address line 2" fieldHint={hint('address_line2') ? <AppFieldHint hint={hint('address_line2')!} /> : undefined} />
        <AddressAutocomplete
          value={form.address_line2}
          onChange={(value) => patch({ address_line2: value })}
          placeholder="Start typing an address..."
          className={ADDRESS_INPUT_CLASS}
        />
      </div>
      <AppInput
        label="Complement (e.g., Apt, Unit, Basement)"
        value={form.address_line2_complement}
        onChange={(e) => patch({ address_line2_complement: e.target.value })}
        placeholder="Apt 101, Unit 2, Basement, etc."
      />
    </div>
  );
}

export function ProfileContactForm({
  p,
  collectChanges,
  showFieldHints,
}: {
  p: Record<string, unknown>;
  collectChanges: CollectFn;
  showFieldHints?: boolean;
}) {
  const [form, setForm] = useState({
    phone: String(p.phone || ''),
    mobile_phone: String(p.mobile_phone || ''),
  });

  const setField = (key: 'phone' | 'mobile_phone', value: string) => {
    const formatted = formatPhone(value);
    setForm((s) => ({ ...s, [key]: formatted }));
    collectChanges({ [key]: formatted });
  };

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <AppInput
        label="Phone 1 *"
        value={form.phone}
        onChange={(e) => setField('phone', e.target.value)}
        fieldHint={showFieldHints ? userProfileFieldHint('phone') : undefined}
      />
      <AppInput
        label="Phone 2"
        value={form.mobile_phone}
        onChange={(e) => setField('mobile_phone', e.target.value)}
        fieldHint={showFieldHints ? userProfileFieldHint('mobile_phone') : undefined}
      />
    </div>
  );
}

export function ProfileLegalFieldsForm({
  p,
  pending,
  collectChanges,
  showFieldHints,
}: {
  p: Record<string, unknown>;
  pending?: Record<string, unknown>;
  collectChanges: CollectFn;
  showFieldHints?: boolean;
}) {
  const merged = { ...p, ...(pending || {}) };
  const [form, setForm] = useState({
    sin_number: String(merged.sin_number || ''),
    work_eligibility_status: String(merged.work_eligibility_status || ''),
  });

  const setField = (key: string, value: string) => {
    const next = key === 'sin_number' ? formatSIN(value) : value;
    setForm((s) => ({ ...s, [key]: next }));
    collectChanges({ [key]: next });
  };

  const workOptions = [
    'Canadian Citizen',
    'Permanent Resident',
    'Temporary Resident (with work authorization)',
    'Other',
  ].map((v) => ({ value: v, label: v }));

  return (
    <div className={uiSpacing.sectionStack}>
      <div className="grid gap-4 md:grid-cols-2">
        <AppInput
          label="SIN/SSN *"
          value={form.sin_number}
          onChange={(e) => setField('sin_number', e.target.value)}
          maxLength={11}
          placeholder="123-456-789"
          fieldHint={showFieldHints ? userProfileFieldHint('sin_number') : undefined}
        />
        <AppSelect
          label="Work Eligibility Status *"
          placeholder="Select..."
          value={form.work_eligibility_status}
          onChange={(e) => setField('work_eligibility_status', e.target.value)}
          options={workOptions}
          fieldHint={showFieldHints ? userProfileFieldHint('work_eligibility_status') : undefined}
        />
      </div>
    </div>
  );
}

export function ProfileOrganizationForm({
  p,
  collectChanges,
  showFieldHints,
}: {
  p: Record<string, unknown>;
  collectChanges: CollectFn;
  showFieldHints?: boolean;
}) {
  const [form, setForm] = useState({
    job_title: String(p.job_title || ''),
    employment_type: String(p.employment_type || ''),
    hire_date: String(p.hire_date || '').slice(0, 10),
    termination_date: String(p.termination_date || '').slice(0, 10),
    work_email: String(p.work_email || ''),
    work_phone: String(p.work_phone || ''),
  });
  const prevOpen = useRef(true);

  useEffect(() => {
    if (prevOpen.current) {
      setForm({
        job_title: String(p.job_title || ''),
        employment_type: String(p.employment_type || ''),
        hire_date: String(p.hire_date || '').slice(0, 10),
        termination_date: String(p.termination_date || '').slice(0, 10),
        work_email: String(p.work_email || ''),
        work_phone: String(p.work_phone || ''),
      });
    }
  }, [p.job_title, p.employment_type, p.hire_date, p.termination_date, p.work_email, p.work_phone]);

  const setField = (key: string, value: string) => {
    setForm((s) => ({ ...s, [key]: value }));
    collectChanges({ [key]: value });
  };

  const hint = (key: string) => (showFieldHints ? userProfileFieldHint(key) : undefined);

  return (
    <div className={uiSpacing.sectionStack}>
      <div className="grid gap-4 md:grid-cols-2">
        <AppInput label="Job Title" value={form.job_title} onChange={(e) => setField('job_title', e.target.value)} placeholder="e.g. Project Manager" fieldHint={hint('job_title')} />
        <AppSelect label="Employment Type" placeholder="Select..." value={form.employment_type} onChange={(e) => setField('employment_type', e.target.value)} options={EMPLOYMENT_OPTIONS} fieldHint={hint('employment_type')} />
        <AppDatePicker label="Hire Date" value={form.hire_date} onChange={(e) => setField('hire_date', e.target.value)} fieldHint={hint('hire_date')} />
        <AppDatePicker label="Termination Date" value={form.termination_date} onChange={(e) => setField('termination_date', e.target.value)} fieldHint={hint('termination_date')} />
        <AppInput label="Work email" value={form.work_email} onChange={(e) => setField('work_email', e.target.value)} fieldHint={hint('work_email')} />
        <AppInput label="Work phone" value={form.work_phone} onChange={(e) => setField('work_phone', e.target.value)} fieldHint={hint('work_phone')} />
      </div>
    </div>
  );
}

export function ProfileLegalDocumentsFields({
  p,
  pending,
  userId,
  collectChanges,
  showFieldHints,
  selfProfile,
}: {
  p: Record<string, unknown>;
  pending?: Record<string, unknown>;
  userId: string;
  collectChanges: CollectFn;
  showFieldHints?: boolean;
  selfProfile?: boolean;
}) {
  const mergedProfile = { ...p, ...(pending || {}) };
  const workEligibility = String(mergedProfile.work_eligibility_status || '').trim();

  return (
    <div className={uiSpacing.sectionStack}>
      <ProfileLegalFieldsForm p={p} pending={pending} collectChanges={collectChanges} showFieldHints={showFieldHints} />
      {!workEligibility ? (
        <p className={uiCx(uiTypography.helper, '-mt-2')}>Select work eligibility to see required document sections.</p>
      ) : null}
      <UserWorkEligibilityDocumentsSection
        userId={userId}
        canEdit
        profile={mergedProfile}
        onProfileFieldsChange={collectChanges}
        showFieldHints={showFieldHints}
        selfProfile={selfProfile}
      />
    </div>
  );
}

export function ProfileReadOnlyGrid({ fields }: { fields: { label: string; value: unknown }[] }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {fields.map(({ label, value }) => (
        <AppReadOnlyField key={label} label={label} value={value != null && String(value).trim() ? String(value) : undefined} />
      ))}
    </div>
  );
}
