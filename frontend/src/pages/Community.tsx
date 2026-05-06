import { useState, useEffect, useCallback, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { CommunityPageHeader } from '@/components/community/CommunityPageHeader';
import { MyAnnouncementsPanel } from '@/components/community/MyAnnouncementsPanel';
import { ChartBarIcon, ChevronRightIcon, MegaphoneIcon, UsersGroupIcon } from '@/components/community/communityIcons';

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
      : 'overview'
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
    [searchParams, setSearchParams]
  );

  const { data: myPostsData, isError, isPending, error, refetch } = useQuery({
    queryKey: ['my-community-posts'],
    queryFn: () => api<any[]>('GET', '/community/posts/my-posts'),
  });

  const myPosts: any[] = Array.isArray(myPostsData) ? myPostsData : [];

  const tabBtn = (active: boolean) =>
    `snap-start shrink-0 px-4 py-3 sm:px-6 text-sm font-medium transition-colors border-b-2 -mb-px outline-none focus-visible:ring-2 focus-visible:ring-red-100 focus-visible:ring-offset-2 rounded-t-md ${
      active ? 'text-brand-red border-brand-red' : 'text-gray-600 hover:text-gray-900 border-transparent'
    }`;

  return (
    <div className="space-y-5 sm:space-y-6">
      <CommunityPageHeader
        title="Community"
        subtitle="Create announcements, manage groups, and review engagement."
      />

      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm">
        <div
          className="flex border-b border-gray-200 overflow-x-auto snap-x snap-mandatory"
          role="tablist"
          aria-label="Community sections"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'overview'}
            id="community-tab-overview"
            aria-controls="community-panel-overview"
            tabIndex={activeTab === 'overview' ? 0 : -1}
            onClick={() => goToTab('overview')}
            className={tabBtn(activeTab === 'overview')}
          >
            Overview
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'announcements'}
            id="community-tab-announcements"
            aria-controls="community-panel-announcements"
            tabIndex={activeTab === 'announcements' ? 0 : -1}
            onClick={() => goToTab('announcements')}
            className={`${tabBtn(activeTab === 'announcements')} whitespace-nowrap`}
          >
            My announcements
          </button>
        </div>

        <div
          id="community-panel-overview"
          role="tabpanel"
          aria-labelledby="community-tab-overview"
          hidden={activeTab !== 'overview'}
          className={activeTab === 'overview' ? 'p-4 sm:p-6 space-y-5' : 'hidden'}
        >
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
                <h2 id="community-create-heading" className="font-semibold text-sm text-gray-900">
                  Create an announcement
                </h2>
                <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {secondaryCards.map((card) => (
                <Link key={card.id} to={card.path} className={shortcutCardClass}>
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-gray-200 bg-gray-50 text-gray-700 group-hover:border-gray-300">
                    {card.icon}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-sm text-gray-900">{card.label}</div>
                    <div className="text-xs text-gray-500 mt-0.5 line-clamp-2">{card.description}</div>
                  </div>
                  <ChevronRightIcon className="h-5 w-5 shrink-0 text-gray-400 group-hover:text-gray-600" />
                </Link>
              ))}
            </div>
          </section>
        </div>

        <div
          id="community-panel-announcements"
          role="tabpanel"
          aria-labelledby="community-tab-announcements"
          hidden={activeTab !== 'announcements'}
          className={activeTab === 'announcements' ? 'p-4 sm:p-6' : 'hidden'}
        >
          <MyAnnouncementsPanel
            posts={myPosts}
            isPending={isPending}
            isError={isError}
            error={error}
            refetch={refetch}
          />
        </div>
      </div>
    </div>
  );
}
