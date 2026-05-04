import { useState, useEffect, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { CommunityPageHeader } from '@/components/community/CommunityPageHeader';
import { MyAnnouncementsPanel } from '@/components/community/MyAnnouncementsPanel';

type CommunityTab = 'overview' | 'announcements';

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

  const cards = [
    {
      id: 'groups',
      label: 'Groups',
      icon: '👥',
      description: 'View and manage groups with members',
      color: 'bg-blue-100 text-blue-600',
      path: '/community/groups',
    },
    {
      id: 'insights',
      label: 'Insights',
      icon: '📊',
      description: 'Analytics and engagement metrics',
      color: 'bg-purple-100 text-purple-600',
      path: '/community/insights',
    },
    {
      id: 'new-post',
      label: 'New Post',
      icon: '📝',
      description: 'Create announcements and updates',
      color: 'bg-green-100 text-green-600',
      path: '/community/new-post',
    },
  ];

  const { data: myPostsData, isError, isPending, error, refetch } = useQuery({
    queryKey: ['my-community-posts'],
    queryFn: () => api<any[]>('GET', '/community/posts/my-posts'),
  });

  const myPosts: any[] = Array.isArray(myPostsData) ? myPostsData : [];

  return (
    <div className="space-y-4">
      <CommunityPageHeader
        title="Community"
        subtitle="Manage groups, view insights, and create posts."
      />

      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm">
        <div
          className="flex border-b border-gray-200 bg-gray-50 overflow-x-auto snap-x snap-mandatory"
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
            className={`snap-start shrink-0 px-4 py-3 sm:px-6 text-sm font-medium transition-colors ${
              activeTab === 'overview'
                ? 'bg-white text-brand-red border-b-2 border-brand-red'
                : 'text-gray-600 hover:text-gray-900 border-b-2 border-transparent'
            }`}
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
            className={`snap-start shrink-0 px-4 py-3 sm:px-6 text-sm font-medium transition-colors whitespace-nowrap ${
              activeTab === 'announcements'
                ? 'bg-white text-brand-red border-b-2 border-brand-red'
                : 'text-gray-600 hover:text-gray-900 border-b-2 border-transparent'
            }`}
          >
            My announcements
          </button>
        </div>

        <div
          id="community-panel-overview"
          role="tabpanel"
          aria-labelledby="community-tab-overview"
          hidden={activeTab !== 'overview'}
          className={activeTab === 'overview' ? 'p-4 sm:p-6' : 'hidden'}
        >
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {cards.map((card) => (
              <Link
                key={card.id}
                to={card.path}
                className="rounded-lg border border-gray-200 bg-white p-4 hover:shadow-md transition-all text-left group"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-12 h-12 rounded-lg ${card.color} flex items-center justify-center text-xl flex-shrink-0 group-hover:scale-110 transition-transform`}
                  >
                    {card.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-base text-gray-900 mb-0.5">{card.label}</div>
                    <div className="text-xs text-gray-500 line-clamp-1">{card.description}</div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
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
