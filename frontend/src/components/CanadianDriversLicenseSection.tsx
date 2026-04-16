import { useMemo } from 'react';

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

/** Date + time for audit fields */
function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('en-CA', { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return fmtLong(iso);
  }
}

function jurisdictionLabel(code: string | null | undefined): string {
  if (!code) return '—';
  const row = CANADIAN_DL_JURISDICTIONS.find((j) => j.code === code);
  return row ? `${row.label} (${code})` : code;
}

type Props = {
  editable: boolean;
  profile: Record<string, any>;
  onFieldsChange: (kv: Record<string, any>) => void;
};

const inputClass =
  'w-full rounded-lg border border-gray-300 bg-white px-2.5 py-2 text-sm text-gray-900 focus:border-sky-500 focus:ring-1 focus:ring-sky-500/30';

const labelClass = 'mb-1 block text-[10px] font-semibold uppercase tracking-wide text-gray-600';

export function CanadianDriversLicenseSection({ editable, profile, onFieldsChange }: Props) {
  const patch = (kv: Record<string, any>) => onFieldsChange(kv);

  const logVerificationRequest = () => {
    patch({ drivers_license_last_requested_at: new Date().toISOString() });
  };

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

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-sky-100">
            <svg className="h-4 w-4 text-sky-800" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 104 0m-5 8a2 2 0 100-4 2 2 0 000 4zm0 0c1.306 0 2.417.835 2.83 2M9 14a3.001 3.001 0 00-2.83 2M15 11h3m-3 4h2"
              />
            </svg>
          </div>
          <div className="min-w-0">
            <h5 className="text-sm font-semibold leading-tight text-slate-900">Driver&apos;s licence (Canada)</h5>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-gray-500">
              <span>
                <span className="text-gray-400">Last update</span>{' '}
                <span className="font-medium tabular-nums text-gray-700">
                  {fmtDateTime(profile.drivers_license_updated_at)}
                </span>
              </span>
              <span className="text-gray-300">·</span>
              <span>
                <span className="text-gray-400">Last request</span>{' '}
                <span className="font-medium tabular-nums text-gray-700">
                  {fmtDateTime(profile.drivers_license_last_requested_at)}
                </span>
              </span>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {editable ? (
            <button
              type="button"
              onClick={logVerificationRequest}
              className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 shadow-sm hover:bg-slate-50"
              title="Records that a copy or verification was requested (save profile to persist)"
            >
              Log verification request
            </button>
          ) : null}
          {expired ? (
            <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-medium text-red-800">Expired</span>
          ) : expirySoon ? (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-900">
              Expiring soon
            </span>
          ) : num && jur ? (
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-800">
              On file
            </span>
          ) : null}
        </div>
      </div>

      {/* Left: form grid | Right: wider licence card */}
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:gap-8">
        <div className="min-w-0 flex-1 space-y-3">
          {editable ? (
            <>
              <div>
                <label className={labelClass}>Licence number</label>
                <input
                  className={inputClass}
                  value={profile.drivers_license_number || ''}
                  onChange={(e) => patch({ drivers_license_number: e.target.value })}
                  placeholder="As on card"
                  autoComplete="off"
                />
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                <div className="min-w-0">
                  <label className={labelClass}>Province / territory</label>
                  <select
                    className={inputClass}
                    value={profile.drivers_license_jurisdiction || ''}
                    onChange={(e) => patch({ drivers_license_jurisdiction: e.target.value })}
                  >
                    {CANADIAN_DL_JURISDICTIONS.map((j) => (
                      <option key={j.code || 'none'} value={j.code}>
                        {j.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="min-w-0">
                  <label className={labelClass}>Class / level</label>
                  <input
                    className={inputClass}
                    value={profile.drivers_license_class || ''}
                    onChange={(e) => patch({ drivers_license_class: e.target.value })}
                    placeholder="e.g. G, Class 5"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                <div className="min-w-0">
                  <label className={labelClass}>Issue date</label>
                  <input
                    type="date"
                    className={inputClass}
                    value={ymd(profile.drivers_license_issue_date)}
                    onChange={(e) => patch({ drivers_license_issue_date: e.target.value || null })}
                  />
                </div>
                <div className="min-w-0">
                  <label className={labelClass}>Expiry date</label>
                  <input
                    type="date"
                    className={inputClass}
                    value={ymd(profile.drivers_license_expiry_date)}
                    onChange={(e) => patch({ drivers_license_expiry_date: e.target.value || null })}
                  />
                </div>
              </div>
              <div>
                <label className={labelClass}>Conditions (optional)</label>
                <textarea
                  className={`${inputClass} min-h-[72px] resize-y`}
                  value={profile.drivers_license_conditions || ''}
                  onChange={(e) => patch({ drivers_license_conditions: e.target.value })}
                  placeholder="e.g. Corrective lenses; automatic only"
                  rows={3}
                />
              </div>
            </>
          ) : (
            <div className="space-y-3">
              <div>
                <p className={labelClass}>Licence number</p>
                <p className="font-mono text-base font-semibold text-gray-900">{num || '—'}</p>
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                <div className="min-w-0">
                  <p className={labelClass}>Province / territory</p>
                  <p className="text-base font-semibold text-gray-900">{jurisdictionLabel(jur)}</p>
                </div>
                <div className="min-w-0">
                  <p className={labelClass}>Class / level</p>
                  <p className="text-base font-semibold text-gray-900">{cls || '—'}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                <div className="min-w-0">
                  <p className={labelClass}>Issue date</p>
                  <p className="text-base font-semibold tabular-nums text-gray-900">
                    {fmtLong(profile.drivers_license_issue_date)}
                  </p>
                </div>
                <div className="min-w-0">
                  <p className={labelClass}>Expiry date</p>
                  <p
                    className={`text-base font-semibold tabular-nums ${expired ? 'text-red-700' : 'text-gray-900'}`}
                  >
                    {fmtLong(profile.drivers_license_expiry_date)}
                  </p>
                </div>
              </div>
              <div>
                <p className={labelClass}>Conditions (optional)</p>
                <p className="text-sm font-medium text-gray-800">
                  {(profile.drivers_license_conditions || '').trim() || '—'}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Wider card — right column */}
        <div className="w-full shrink-0 overflow-hidden rounded-lg border border-slate-500/90 bg-gradient-to-b from-sky-900 to-slate-950 p-3 text-white shadow-md lg:ml-auto lg:w-[min(100%,420px)] lg:min-w-[300px] xl:min-w-[340px]">
          <p className="text-[8px] font-bold uppercase tracking-[0.18em] text-sky-200/95">Licence / Permis</p>
          <p className="mt-1.5 line-clamp-2 text-base font-bold leading-tight text-white">{displayName}</p>
          <p className="mt-0.5 text-[10px] text-sky-100/90">
            DOB <span className="font-bold text-white">{fmtLong(profile.date_of_birth)}</span>
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
          {(profile.drivers_license_conditions || '').trim() ? (
            <p className="mt-3 border-t border-white/10 pt-2 text-[9px] leading-snug text-sky-50">
              <span className="font-bold text-sky-200">Cond.: </span>
              {String(profile.drivers_license_conditions).trim()}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
