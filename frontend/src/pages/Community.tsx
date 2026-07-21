import { useState, useEffect, useCallback, useMemo, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Megaphone } from 'lucide-react';
import { api } from '@/lib/api';
import { MyAnnouncementsPanel } from '@/components/community/MyAnnouncementsPanel';
import {
  ChartBarIcon,
  ChevronRightIcon,
  MegaphoneIcon,
  UsersGroupIcon,
} from '@/components/community/communityIcons';
import {
  AppCard,
  AppPageHeader,
  AppTabs,
  uiBorders,
  uiCx,
  uiSpacing,
  uiTypography,
} from '@/components/ui';

type CommunityTab = 'overview' | 'announcements';

const shortcutCardClass =
  'group rounded-lg border border-gray-200 bg-white p-4 transition-colors hover:bg-gray-50 hover:border-gray-300 flex items-center gap-3 text-left min-h-[4.5rem] outline-none focus-visible:ring-2 focus-visible:ring-red-100 focus-visible:ring-offset-2';

type SecondaryCard = {
  id: string;
  label: string;
  description: string;
  path: string;
  icon: ReactNode;
};

const secondaryCards: SecondaryCard[] = [
  {
    id: 'groups',
    label: 'Groups',
    description: 'View and manage groups with members',
    path: '/community/groups',
    icon: <UsersGroupIcon className="h-5 w-5" />,
  },
  {
    id: 'insights',
    label: 'Insights',
    description: 'Analytics and engagement metrics',
    path: '/community/insights',
    icon: <ChartBarIcon className="h-5 w-5" />,
  },
];

export default function Community() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<CommunityTab>(() =>
    typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('myAnnouncements') === '1'
      ? 'announcements'
      : 'overview',
  );

  useEffect(() => {
    if (searchParams.get('myAnnouncements') === '1') {
      setActiveTab('announcements');
    }
  }, [searchParams]);

  const goToTab = useCallback(
    (tab: CommunityTab) => {
      setActiveTab(tab);
      const next = new URLSearchParams(searchParams);
      if (tab === 'announcements') {
        next.set('myAnnouncements', '1');
      } else {
        next.delete('myAnnouncements');
      }
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  const { data: myPostsData, isError, isPending, error, refetch } = useQuery({
    queryKey: ['my-community-posts'],
    queryFn: () => api<any[]>('GET', '/community/posts/my-posts'),
  });

  const myPosts: any[] = Array.isArray(myPostsData) ? myPostsData : [];


  const tabItems = useMemo(
    () => [
      { key: 'overview', label: 'Overview' },
      { key: 'announcements', label: 'My announcements', count: myPosts.length > 0 ? myPosts.length : undefined },
    ],
    [myPosts.length],
  );

  return (
    <div className={uiCx('w-full min-w-0 overflow-x-hidden', uiSpacing.pageStack, 'min-h-full bg-gray-50')}>
      <AppPageHeader
        title="Community"
        subtitle="Create announcements, manage groups, and review engagement."
        icon={<Megaphone className="h-4 w-4" />}
      />

      <AppCard bodyClassName="p-0 overflow-hidden">
        <div className={uiSpacing.cardPadding}>
          <AppTabs
            tabs={tabItems}
            value={activeTab}
            onChange={(key) => goToTab(key as CommunityTab)}
          />
        </div>

        {activeTab === 'overview' ? (
          <div className={uiCx(uiSpacing.cardPadding, 'border-t', uiBorders.subtle, 'space-y-5')}>
            <section aria-labelledby="community-create-heading">
              <Link
                to="/community/new-post"
                className={shortcutCardClass}
                aria-labelledby="community-create-heading"
              >
                <div
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-gray-200 bg-gray-50 text-gray-700 group-hover:border-gray-300"
                  aria-hidden
                >
                  <MegaphoneIcon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <h2 id="community-create-heading" className="text-sm font-semibold text-gray-900">
                    Create an announcement
                  </h2>
                  <p className="mt-0.5 line-clamp-2 text-xs text-gray-500">
                    Reach groups, track read confirmations, and schedule for later.
                  </p>
                </div>
                <ChevronRightIcon className="h-5 w-5 shrink-0 text-gray-400 group-hover:text-gray-600" />
              </Link>
            </section>

            <section aria-labelledby="community-shortcuts-heading">
              <h3 id="community-shortcuts-heading" className="sr-only">
                Shortcuts
              </h3>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {secondaryCards.map((card) => (
                  <Link key={card.id} to={card.path} className={shortcutCardClass}>
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-gray-200 bg-gray-50 text-gray-700 group-hover:border-gray-300">
                      {card.icon}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-gray-900">{card.label}</div>
                      <div className="mt-0.5 line-clamp-2 text-xs text-gray-500">{card.description}</div>
                    </div>
                    <ChevronRightIcon className="h-5 w-5 shrink-0 text-gray-400 group-hover:text-gray-600" />
                  </Link>
                ))}
              </div>
            </section>
          </div>
        ) : (
          <div className={uiCx(uiSpacing.cardPadding, 'border-t', uiBorders.subtle)}>
            <MyAnnouncementsPanel
              posts={myPosts}
              isPending={isPending}
              isError={isError}
              error={error}
              refetch={refetch}
            />
          </div>
        )}
      </AppCard>
    </div>
  );
}
