import { useMemo } from 'react';
import { AppBadge } from '@/components/ui/AppBadge';
import { AppDatePicker } from '@/components/ui/AppDatePicker';
import { AppInput } from '@/components/ui/AppInput';
import { AppSelect } from '@/components/ui/AppSelect';
import { AppTextarea } from '@/components/ui/AppTextarea';
import { userProfileFieldHint } from '@/lib/userProfileFieldHints';
import { uiCx, uiSpacing, uiTypography } from '@/components/ui/tokens';

/** Canadian provinces & territories (licence-issuing jurisdictions). */
export const CANADIAN_DL_JURISDICTIONS: { code: string; label: string }[] = [
  { code: '', label: '— Select —' },
  { code: 'AB', label: 'Alberta' },
  { code: 'BC', label: 'British Columbia' },
  { code: 'MB', label: 'Manitoba' },
  { code: 'NB', label: 'New Brunswick' },
  { code: 'NL', label: 'Newfoundland and Labrador' },
  { code: 'NS', label: 'Nova Scotia' },
  { code: 'NT', label: 'Northwest Territories' },
  { code: 'NU', label: 'Nunavut' },
  { code: 'ON', label: 'Ontario' },
  { code: 'PE', label: 'Prince Edward Island' },
  { code: 'QC', label: 'Quebec' },
  { code: 'SK', label: 'Saskatchewan' },
  { code: 'YT', label: 'Yukon' },
];

function ymd(iso: string | null | undefined): string {
  if (!iso) return '';
  const s = String(iso);
  return s.length >= 10 ? s.slice(0, 10) : s;
}

function fmtLong(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-CA', { dateStyle: 'medium' });
  } catch {
    return ymd(iso) || '—';
  }
}

function jurisdictionLabel(code: string | null | undefined): string {
  if (!code) return '—';
  const row = CANADIAN_DL_JURISDICTIONS.find((j) => j.code === code);
  return row ? `${row.label} (${code})` : code;
}

type DriversLicenseVisualCardProps = {
  displayName: string;
  dateOfBirth: string | null | undefined;
  num: string;
  jur: string;
  cls: string;
  expiry: string | null | undefined;
  conditions: string;
  expired: boolean;
  expirySoon: boolean;
  hasRecord: boolean;
  className?: string;
};

function DriversLicenseVisualCard({
  displayName,
  dateOfBirth,
  num,
  jur,
  cls,
  expiry,
  conditions,
  expired,
  expirySoon,
  hasRecord,
  className,
}: DriversLicenseVisualCardProps) {
  return (
    <div
      className={uiCx(
        'relative overflow-hidden rounded-lg border border-slate-500/90 bg-gradient-to-b from-sky-900 to-slate-950 p-3 text-white shadow-md',
        className,
      )}
    >
      <div className="absolute right-3 top-3 z-10">
        <DriversLicenseStatusBadge expired={expired} expirySoon={expirySoon} hasRecord={hasRecord} />
      </div>
      <p className="pr-24 text-[8px] font-bold uppercase tracking-[0.18em] text-sky-200/95">Licence / Permis</p>
      <p className="mt-1.5 line-clamp-2 text-base font-bold leading-tight text-white">{displayName}</p>
      <p className="mt-0.5 text-[10px] text-sky-100/90">
        DOB <span className="font-bold text-white">{fmtLong(dateOfBirth)}</span>
      </p>
      <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 border-t border-white/15 pt-3">
        <div>
          <p className="text-[9px] font-medium uppercase tracking-wide text-sky-300/90">No.</p>
          <p className="font-mono text-sm font-bold leading-tight text-white">{num || '—'}</p>
        </div>
        <div>
          <p className="text-[9px] font-medium uppercase tracking-wide text-sky-300/90">Expires</p>
          <p className={`text-sm font-bold leading-tight ${expired ? 'text-red-300' : 'text-white'}`}>
            {fmtLong(expiry)}
          </p>
        </div>
        <div className="min-w-0">
          <p className="text-[9px] font-medium uppercase tracking-wide text-sky-300/90">Jurisdiction</p>
          <p className="line-clamp-2 text-xs font-bold leading-snug text-white">{jurisdictionLabel(jur)}</p>
        </div>
        <div>
          <p className="text-[9px] font-medium uppercase tracking-wide text-sky-300/90">Class</p>
          <p className="text-sm font-bold text-white">{cls || '—'}</p>
        </div>
      </div>
      {conditions.trim() ? (
        <p className="mt-3 border-t border-white/10 pt-2 text-[9px] leading-snug text-sky-50">
          <span className="font-bold text-sky-200">Cond.: </span>
          {conditions.trim()}
        </p>
      ) : null}
    </div>
  );
}

type StatusBadgeProps = {
  expired: boolean;
  expirySoon: boolean;
  hasRecord: boolean;
};

function DriversLicenseStatusBadge({ expired, expirySoon, hasRecord }: StatusBadgeProps) {
  if (expired) return <AppBadge variant="danger">Expired</AppBadge>;
  if (expirySoon) return <AppBadge variant="warning">Expiring soon</AppBadge>;
  if (hasRecord) return <AppBadge variant="success">On file</AppBadge>;
  return null;
}

export type DriversLicenseLayout = 'split' | 'preview';

type Props = {
  editable: boolean;
  profile: Record<string, any>;
  onFieldsChange: (kv: Record<string, any>) => void;
  /** Read-only: visual card only. Edit: form + live preview. */
  layout?: DriversLicenseLayout;
  showFieldHints?: boolean;
};

export function CanadianDriversLicenseSection({
  editable,
  profile,
  onFieldsChange,
  layout,
  showFieldHints,
}: Props) {
  const resolvedLayout: DriversLicenseLayout = layout ?? (editable ? 'split' : 'preview');
  const patch = (kv: Record<string, any>) => onFieldsChange(kv);
  const hint = (key: string) => (showFieldHints ? userProfileFieldHint(key) : undefined);

  const displayName = useMemo(() => {
    const pref = (profile.preferred_name || '').trim();
    const first = (profile.first_name || '').trim();
    const last = (profile.last_name || '').trim();
    if (pref) return pref;
    return [first, last].filter(Boolean).join(' ') || '—';
  }, [profile.preferred_name, profile.first_name, profile.last_name]);

  const expiry = profile.drivers_license_expiry_date;
  const expirySoon = useMemo(() => {
    if (!expiry) return false;
    const d = new Date(expiry);
    if (Number.isNaN(d.getTime())) return false;
    const days = (d.getTime() - Date.now()) / 86400000;
    return days >= 0 && days <= 60;
  }, [expiry]);

  const expired = useMemo(() => {
    if (!expiry) return false;
    const d = new Date(expiry);
    if (Number.isNaN(d.getTime())) return false;
    return d.getTime() < Date.now();
  }, [expiry]);

  const num = (profile.drivers_license_number || '').trim();
  const jur = (profile.drivers_license_jurisdiction || '').trim();
  const cls = (profile.drivers_license_class || '').trim();
  const conditions = String(profile.drivers_license_conditions || '');
  const hasRecord = !!(num && jur);

  const licenseCardClassName = 'w-[440px] max-w-full shrink-0';

  const visualCard = (
    <DriversLicenseVisualCard
      displayName={displayName}
      dateOfBirth={profile.date_of_birth}
      num={num}
      jur={jur}
      cls={cls}
      expiry={expiry}
      conditions={conditions}
      expired={expired}
      expirySoon={expirySoon}
      hasRecord={hasRecord}
      className={licenseCardClassName}
    />
  );

  const editForm = (
    <div className={uiSpacing.sectionStack}>
      <AppInput
        label="Licence number"
        value={profile.drivers_license_number || ''}
        onChange={(e) => patch({ drivers_license_number: e.target.value })}
        placeholder="As on card"
        autoComplete="off"
        fieldHint={hint('drivers_license_number')}
      />
      <div className="grid gap-4 md:grid-cols-2">
        <AppSelect
          label="Province / territory"
          placeholder="Select..."
          value={profile.drivers_license_jurisdiction || ''}
          onChange={(e) => patch({ drivers_license_jurisdiction: e.target.value })}
          options={CANADIAN_DL_JURISDICTIONS.map((j) => ({ value: j.code, label: j.label }))}
          fieldHint={hint('drivers_license_jurisdiction')}
        />
        <AppInput
          label="Class / level"
          value={profile.drivers_license_class || ''}
          onChange={(e) => patch({ drivers_license_class: e.target.value })}
          placeholder="e.g. G, Class 5"
          fieldHint={hint('drivers_license_class')}
        />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <AppDatePicker
          label="Issue date"
          value={ymd(profile.drivers_license_issue_date)}
          onChange={(e) => patch({ drivers_license_issue_date: e.target.value || null })}
          fieldHint={hint('drivers_license_issue_date')}
        />
        <AppDatePicker
          label="Expiry date"
          value={ymd(profile.drivers_license_expiry_date)}
          onChange={(e) => patch({ drivers_license_expiry_date: e.target.value || null })}
          fieldHint={hint('drivers_license_expiry_date')}
        />
      </div>
      <AppTextarea
        label="Conditions (optional)"
        value={profile.drivers_license_conditions || ''}
        onChange={(e) => patch({ drivers_license_conditions: e.target.value })}
        placeholder="e.g. Corrective lenses; automatic only"
        rows={3}
        fieldHint={hint('drivers_license_conditions')}
      />
    </div>
  );

  return (
    <div>
      <div className={uiTypography.controlLabel}>Driver&apos;s License</div>

      {resolvedLayout === 'preview' ? (
        <div className="mt-3 w-fit max-w-full">{visualCard}</div>
      ) : (
        <div className="mt-3 grid gap-4 lg:grid-cols-2 lg:items-start">
          <div className="min-w-0">{editForm}</div>
          <div className="min-w-0 w-fit max-w-full lg:justify-self-end">{visualCard}</div>
        </div>
      )}
    </div>
  );
}
