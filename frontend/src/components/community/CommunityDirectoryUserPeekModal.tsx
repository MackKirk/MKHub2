import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, withFileAccessTokenIfNeeded } from '@/lib/api';
import { AppModal } from '@/components/ui';

export type DirectoryCardPayload = {
  id: string;
  username: string;
  name: string;
  job_title?: string | null;
  department?: string | null;
  phone?: string | null;
  work_phone?: string | null;
  work_email?: string | null;
  email_corporate?: string | null;
  email?: string | null;
  profile_photo_file_id?: string | null;
  divisions?: { id: string; label: string }[];
};

type Props = {
  userId: string | null;
  onClose: () => void;
};

const EM_DASH = '\u2014';

function Row({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  const muted = value === EM_DASH;
  return (
    <div className="flex gap-3 border-b border-slate-100 py-2.5 last:border-0">
      <div className="flex h-[2.875rem] w-[2.875rem] shrink-0 items-center justify-center rounded-xl bg-slate-50 text-slate-500">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</div>
        <div
          className={`break-words text-sm ${muted ? 'font-normal text-slate-400' : 'font-medium text-slate-900'}`}
        >
          {value}
        </div>
      </div>
    </div>
  );
}

export default function CommunityDirectoryUserPeekModal({ userId, onClose }: Props) {
  const open = !!userId;

  const { data, isLoading, isError } = useQuery({
    queryKey: ['employee-directory-card', userId],
    queryFn: () => api<DirectoryCardPayload>('GET', `/employees/${userId}/directory-card`),
    enabled: open,
    staleTime: 60_000,
  });

  if (!open) return null;

  const photoUrl = data?.profile_photo_file_id
    ? withFileAccessTokenIfNeeded(`/files/${data.profile_photo_file_id}/thumbnail?w=160`)
    : null;

  const displayEmail = data?.work_email || data?.email_corporate || data?.email || null;
  const displayPhone = data?.work_phone || data?.phone || null;
  const divisionLine =
    data?.department ||
    (data?.divisions?.length ? data.divisions.map((d) => d.label).filter(Boolean).join(' · ') : null);

  return (
    <AppModal open onClose={onClose} showHeader={false} size="sm" bodyClassName="relative p-0">
      <div className="relative flex h-[5.75rem] shrink-0 items-center justify-center overflow-hidden border-b border-slate-800/40 px-5 sm:px-8">
        <div className="absolute inset-0 bg-gradient-to-b from-slate-600 via-slate-700 to-slate-800" aria-hidden />
        <div
          className="absolute inset-0 bg-[radial-gradient(ellipse_100%_150%_at_50%_-40%,rgba(255,255,255,0.12),transparent_52%)]"
          aria-hidden
        />
        <div
          className="absolute inset-0 bg-[linear-gradient(180deg,transparent_0%,rgba(0,0,0,0.12)_100%)]"
          aria-hidden
        />
        <img
          src="/ui/assets/login/logo-light.svg"
          alt="Mack Kirk"
          className="relative z-[1] h-[3.25rem] w-auto max-w-[min(320px,88vw)] object-contain object-center brightness-[1.08] contrast-[1.06] drop-shadow-[0_0_1px_rgba(255,255,255,0.85)] drop-shadow-[0_0_14px_rgba(255,255,255,0.28)] sm:h-[3.5rem]"
        />
      </div>

      <button
        type="button"
        onClick={onClose}
        className="absolute right-2 top-2 z-[2] rounded-full bg-white/15 p-1.5 text-white shadow-sm ring-1 ring-white/25 backdrop-blur-[2px] transition hover:bg-white/25"
        aria-label="Close"
      >
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      <div className="relative px-6 pb-6 pt-0">
        <div className="absolute -top-12 left-6 flex h-[5.5rem] w-[5.5rem] items-center justify-center rounded-2xl border-4 border-white bg-slate-100 shadow-lg ring-1 ring-slate-200/80">
          {photoUrl ? (
            <img src={photoUrl} alt="" className="h-full w-full rounded-[0.85rem] object-cover" />
          ) : (
            <span className="text-2xl font-semibold text-slate-400">
              {(data?.name || '?').trim().charAt(0).toUpperCase()}
            </span>
          )}
        </div>

        <div className="ml-[6.75rem] min-h-[4.5rem] pt-1">
          {isLoading ? (
            <div className="space-y-2 pt-2">
              <div className="h-5 w-40 animate-pulse rounded bg-slate-200" />
              <div className="h-4 w-28 animate-pulse rounded bg-slate-100" />
            </div>
          ) : isError ? (
            <p className="pt-2 text-sm text-red-600">Could not load this profile.</p>
          ) : data ? (
            <>
              <h2 id="directory-user-peek-title" className="text-lg font-semibold leading-tight text-slate-900">
                {data.name}
              </h2>
              <p className="mt-0.5 text-sm text-slate-500">@{data.username}</p>
            </>
          ) : null}
        </div>

        {!isLoading && !isError && data && (
          <div className="mt-6 rounded-xl border border-slate-100 bg-slate-50/60 px-1">
            <Row
              label="Job Title"
              value={(data.job_title || '').trim() || EM_DASH}
              icon={
                <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.55}>
                  <rect x="4" y="5" width="16" height="14" rx="2" fill="none" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 4.25V3.5a.75.75 0 01.75-.75h6.5a.75.75 0 01.75.75v.75" />
                  <path strokeLinecap="round" d="M8 10h8M8 13h8M8 16h5" />
                </svg>
              }
            />
            <Row
              label="Department"
              value={(divisionLine || '').trim() || EM_DASH}
              icon={
                <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.55}>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                  />
                </svg>
              }
            />
            <Row
              label="Phone"
              value={(displayPhone || '').trim() || EM_DASH}
              icon={
                <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.55}>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
                  />
                </svg>
              }
            />
            <Row
              label="Email"
              value={(displayEmail || '').trim() || EM_DASH}
              icon={
                <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.55}>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                  />
                </svg>
              }
            />
          </div>
        )}
      </div>
    </AppModal>
  );
}
