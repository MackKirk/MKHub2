import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';

export default function CommunityInsights() {
  const navigate = useNavigate();
  const [dateFrom, setDateFrom] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() - 14);
    return date.toISOString().split('T')[0];
  });
  const [dateTo, setDateTo] = useState(() => {
    return new Date().toISOString().split('T')[0];
  });

  // Fetch insights data - placeholder for now
  const { data: insights, isLoading } = useQuery({
    queryKey: ['community-insights', dateFrom, dateTo],
    queryFn: () => api<any>('GET', `/community/insights?from=${dateFrom}&to=${dateTo}`).catch(() => ({
      posts_made: 0,
      post_views: 0,
      active_members: 0,
      comments_made: 0,
      views_via_website: 0,
      views_via_email: 0,
      views_via_mobile: 0,
      email_opened: 0,
      email_clicked: 0,
      posting_activity: [],
      member_distribution: {
        active_percentage: 0,
        active_count: 0,
        total_members: 0,
        avg_posts_per_user: 0,
        avg_comments_per_user: 0,
      },
    })),
  });

  return (
    <div className="space-y-4">
      <div className="mb-3 rounded-xl border bg-gradient-to-br from-[#7f1010] to-[#a31414] text-white p-4">
        <div className="text-2xl font-extrabold">Insights</div>
        <div className="text-sm opacity-90">Analytics and metrics for community engagement.</div>
      </div>

      <div className="mb-3 flex items-center justify-between">
        <button
          onClick={() => navigate('/community')}
          className="p-2 rounded-lg border hover:bg-gray-50 transition-colors flex items-center gap-2"
          title="Back to Community"
        >
          <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          <span className="text-sm text-gray-700 font-medium">Back to Community</span>
        </button>
      </div>

      {/* Date Range Selector */}
      <div className="rounded-xl border bg-white p-4">
        <div className="flex items-center gap-4 mb-4">
          <div>
            <label className="block text-xs text-gray-600 mb-1">From</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="border rounded px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">To</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="border rounded px-3 py-2 text-sm"
            />
          </div>
          <div className="flex items-end">
            <button className="px-4 py-2 rounded border text-sm hover:bg-gray-50">
              Export Full Data
            </button>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center text-gray-500 py-8">Loading insights...</div>
      ) : (
        <>
          {/* Key Metrics */}
          <div className="grid grid-cols-4 gap-4">
            <div className="rounded-xl border bg-white p-4">
              <div className="text-2xl font-bold text-gray-900">{insights?.posts_made || 0}</div>
              <div className="text-sm text-gray-600">Posts Made</div>
            </div>
            <div className="rounded-xl border bg-white p-4">
              <div className="text-2xl font-bold text-gray-900">{insights?.post_views || 0}</div>
              <div className="text-sm text-gray-600">Post Views</div>
            </div>
            <div className="rounded-xl border bg-white p-4">
              <div className="text-2xl font-bold text-gray-900">{insights?.active_members || 0}</div>
              <div className="text-sm text-gray-600">Active Members</div>
            </div>
            <div className="rounded-xl border bg-white p-4">
              <div className="text-2xl font-bold text-gray-900">{insights?.comments_made || 0}</div>
              <div className="text-sm text-gray-600">Comments Made</div>
            </div>
          </div>

          {/* Post View Distribution */}
          <div className="rounded-xl border bg-white p-4">
            <h3 className="font-semibold mb-4">Post View Distribution</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Total Views</span>
                <span className="font-medium">{insights?.post_views || 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Via Website</span>
                <span className="font-medium">{insights?.views_via_website || 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Via Email</span>
                <span className="font-medium">{insights?.views_via_email || 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Via Mobile</span>
                <span className="font-medium">{insights?.views_via_mobile || 0}</span>
              </div>
            </div>
          </div>

          {/* Email Engagement */}
          <div className="rounded-xl border bg-white p-4">
            <h3 className="font-semibold mb-4">Email Engagement</h3>
            <div className="space-y-3">
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span>Email Opened</span>
                  <span className="font-medium">{insights?.email_opened || 0}</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-brand-red h-2 rounded-full"
                    style={{ width: `${Math.min(100, ((insights?.email_opened || 0) / Math.max(1, insights?.views_via_email || 1)) * 100)}%` }}
                  />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span>Email Clicked</span>
                  <span className="font-medium">{insights?.email_clicked || 0}</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-brand-red h-2 rounded-full"
                    style={{ width: `${Math.min(100, ((insights?.email_clicked || 0) / Math.max(1, insights?.email_opened || 1)) * 100)}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Posting Activity Over Time */}
          <div className="rounded-xl border bg-white p-4">
            <h3 className="font-semibold mb-4">Posting Activity Over Time</h3>
            <div className="text-center text-gray-500 py-8">
              Chart visualization coming soon...
            </div>
          </div>

          {/* Member Distribution */}
          <div className="rounded-xl border bg-white p-4">
            <h3 className="font-semibold mb-4">Member Distribution</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Active Members</span>
                <span className="font-medium">
                  {insights?.member_distribution?.active_percentage || 0}% ({insights?.member_distribution?.active_count || 0}/{insights?.member_distribution?.total_members || 0})
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Avg Posts / User</span>
                <span className="font-medium">{insights?.member_distribution?.avg_posts_per_user?.toFixed(1) || '0.0'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Avg Comments / User</span>
                <span className="font-medium">{insights?.member_distribution?.avg_comments_per_user?.toFixed(1) || '0.0'}</span>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

