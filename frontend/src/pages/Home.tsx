import { useQuery } from '@tanstack/react-query';
import { Home as HomeIcon } from 'lucide-react';
import { api } from '@/lib/api';
import { AppPageHeader, uiCx, uiSpacing } from '@/components/ui';
import HomeDashboardPage from '@/pages/home-dashboard/HomeDashboardPage';
import { HomeQuickAccess } from '@/pages/home/PersonalHome';

function getTimeBasedGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

type MeProfilePayload = {
  profile?: {
    preferred_name?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    job_title?: string | null;
  };
  user?: { username?: string | null };
};

function firstNameFromProfile(payload: MeProfilePayload | undefined): string {
  const profile = payload?.profile || {};
  const user = payload?.user || {};
  const preferred = (profile.preferred_name || '').trim().split(/\s+/)[0];
  const first = (profile.first_name || '').trim();
  return preferred || first || user.username || 'there';
}

export default function Home() {
  const { data: meProfile } = useQuery({
    queryKey: ['me-profile'],
    queryFn: () => api<MeProfilePayload>('GET', '/auth/me/profile'),
  });

  const greeting = `${getTimeBasedGreeting()}, ${firstNameFromProfile(meProfile)}`;
  const jobTitle = meProfile?.profile?.job_title || '';

  return (
    <div className={uiCx('relative w-full min-w-0 overflow-hidden', 'min-h-full bg-gray-50')}>
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden" aria-hidden>
        <div
          className="absolute right-[-32%] bottom-[-8%] h-[min(48rem,95vw)] w-[min(48rem,95vw)] bg-[#c22033] opacity-[0.07]"
          style={{
            WebkitMaskImage: 'url(/assets/brand/globe.png)',
            maskImage: 'url(/assets/brand/globe.png)',
            WebkitMaskRepeat: 'no-repeat',
            maskRepeat: 'no-repeat',
            WebkitMaskSize: 'contain',
            maskSize: 'contain',
            WebkitMaskPosition: 'center',
            maskPosition: 'center',
          }}
        />
      </div>
      <div className={uiCx('relative z-[1] min-w-0', uiSpacing.pageStack)}>
        <AppPageHeader
          title={greeting}
          subtitle={jobTitle || 'Your day at a glance'}
          icon={<HomeIcon className="h-4 w-4" />}
        />
        <HomeQuickAccess />
        <HomeDashboardPage />
      </div>
    </div>
  );
}
