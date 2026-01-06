import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export default function Community() {
  const [showHistory, setShowHistory] = useState(false);

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

  // Fetch user's posts for history
  const { data: myPostsData } = useQuery({
    queryKey: ['my-community-posts'],
    queryFn: () => api<any>('GET', '/community/posts/my-posts').catch(() => []),
  });

  // Ensure myPosts is always an array
  const myPosts: any[] = Array.isArray(myPostsData) ? myPostsData : [];

  const todayLabel = useMemo(() => {
    return new Date().toLocaleDateString('en-CA', {
      weekday: 'long',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }, []);

  return (
    <div className="space-y-4">
      <div className="bg-slate-200/50 rounded-[12px] border border-slate-200 flex items-center justify-between py-4 px-6 mb-6">
        <div>
          <div className="text-xl font-bold text-gray-900 tracking-tight mb-0.5">Community</div>
          <div className="text-sm text-gray-500 font-medium">Manage groups, view insights, and create posts.</div>
        </div>
        <div className="text-right">
          <div className="text-xs text-gray-400 mb-1.5 font-medium uppercase tracking-wide">Today</div>
          <div className="text-sm font-semibold text-gray-700">{todayLabel}</div>
        </div>
      </div>

      {/* Community Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {cards.map((card) => (
          <Link
            key={card.id}
            to={card.path}
            className="rounded-lg border bg-white p-4 hover:shadow-md transition-all text-left group"
          >
            <div className="flex items-center gap-3">
              <div className={`w-12 h-12 rounded-lg ${card.color} flex items-center justify-center text-xl flex-shrink-0 group-hover:scale-110 transition-transform`}>
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

      {/* History Section */}
      <div className="rounded-xl border bg-white">
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-bold">My Announcements</h2>
              <p className="text-sm text-gray-600">View all announcements you've created</p>
            </div>
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="px-4 py-2 rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 transition"
            >
              {showHistory ? 'Hide' : 'Show'} History
            </button>
          </div>

          {showHistory && (
            <div className="space-y-4 mt-4">
              {myPosts.length === 0 ? (
                <div className="text-center text-gray-500 py-8">
                  No announcements created yet
                </div>
              ) : (
                myPosts.map((post: any) => (
                  <PostHistoryItem key={post.id} post={post} />
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PostHistoryItem({ post }: { post: any }) {
  const [showConfirmations, setShowConfirmations] = useState(false);
  const { data: confirmations = [] } = useQuery({
    queryKey: ['post-read-confirmations', post.id],
    queryFn: () => api<any[]>('GET', `/community/posts/${post.id}/read-confirmations`).catch(() => []),
    enabled: post.requires_read_confirmation && showConfirmations,
  });

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);

    if (diffHours < 1) return 'Just now';
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="border rounded-lg p-4">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <h3 className="font-semibold text-gray-900">{post.title}</h3>
            {post.requires_read_confirmation && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-yellow-100 text-yellow-800 border border-yellow-300">
                <span>✓</span>
                <span>Read confirmation required</span>
              </span>
            )}
            {post.is_urgent && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-red-100 text-red-800 border border-red-300">
                Urgent
              </span>
            )}
          </div>
          <p className="text-sm text-gray-600 mb-2 line-clamp-2">{post.content}</p>
          <div className="text-xs text-gray-500">
            Created {formatTimeAgo(post.created_at)} · {post.views_count || 0} total views
            {post.requires_read_confirmation && (
              <> · {post.confirmations_count || 0}{post.total_recipients ? `/${post.total_recipients}` : ''} confirmations</>
            )}
          </div>
        </div>
      </div>

      {post.requires_read_confirmation && (
        <div className="mt-4 pt-4 border-t">
          <button
            onClick={() => setShowConfirmations(!showConfirmations)}
            className="text-sm text-blue-600 hover:text-blue-700 font-medium"
          >
            {showConfirmations ? 'Hide' : 'Show'} who confirmed reading ({post.confirmations_count || 0})
          </button>

          {showConfirmations && confirmations.length > 0 && (
            <div className="mt-3 space-y-2">
              {confirmations.map((conf: any) => (
                <div key={conf.user_id} className="flex items-center gap-2 text-sm">
                  <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0">
                    {conf.user_avatar ? (
                      <img
                        src={conf.user_avatar}
                        alt={conf.user_name || 'User'}
                        className="w-full h-full rounded-full object-cover"
                      />
                    ) : (
                      <span className="text-gray-500 text-xs">
                        {(conf.user_name || 'U')[0].toUpperCase()}
                      </span>
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="font-medium text-gray-900">{conf.user_name || 'Unknown'}</div>
                    <div className="text-xs text-gray-500">
                      Confirmed {formatTimeAgo(conf.confirmed_at)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {showConfirmations && confirmations.length === 0 && (
            <div className="mt-3 text-sm text-gray-500">
              No confirmations yet
            </div>
          )}
        </div>
      )}
    </div>
  );
}

