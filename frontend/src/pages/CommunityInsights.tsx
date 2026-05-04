import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import { CommunityPageHeader } from '@/components/community/CommunityPageHeader';

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

  const { data: insights, isLoading, isError } = useQuery({
    queryKey: ['community-insights', dateFrom, dateTo],
    queryFn: () => api<any>('GET', `/community/insights?from=${dateFrom}&to=${dateTo}`),
  });

  return (
    <div className="space-y-4">
      <CommunityPageHeader
        title="Insights"
        subtitle="Analytics and metrics for community engagement."
        onBack={() => navigate('/community')}
      />

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
      ) : isError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 text-red-800 p-4 text-sm">
          Unable to load insights. You need <strong>hr:community:write</strong> permission.
        </div>
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
            <div className="space-y-1 text-sm max-h-48 overflow-y-auto">
              {(insights?.posting_activity || []).length === 0 ? (
                <p className="text-gray-500">No posts in this range.</p>
              ) : (
                (insights.posting_activity as { date: string; count: number }[]).map((row) => (
                  <div key={row.date} className="flex justify-between border-b border-gray-100 py-1">
                    <span className="text-gray-600">{row.date}</span>
                    <span className="font-medium">{row.count}</span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Top posts */}
          <div className="rounded-xl border bg-white p-4 overflow-x-auto">
            <h3 className="font-semibold mb-4">Top posts (engagement)</h3>
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b">
                  <th className="py-2 pr-4">Title</th>
                  <th className="py-2 pr-4">Area</th>
                  <th className="py-2 pr-2">Views</th>
                  <th className="py-2 pr-2">Likes</th>
                  <th className="py-2 pr-2">Comments</th>
                  <th className="py-2">Read %</th>
                </tr>
              </thead>
              <tbody>
                {(insights?.top_posts || []).map((row: any) => (
                  <tr key={row.post_id} className="border-b border-gray-50">
                    <td className="py-2 pr-4 max-w-xs truncate">{row.title}</td>
                    <td className="py-2 pr-4">{row.related_area}</td>
                    <td className="py-2 pr-2">{row.views}</td>
                    <td className="py-2 pr-2">{row.likes}</td>
                    <td className="py-2 pr-2">{row.comments}</td>
                    <td className="py-2">{row.read_rate_pct}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Engagement by area */}
          <div className="rounded-xl border bg-white p-4">
            <h3 className="font-semibold mb-4">Engagement by area</h3>
            <div className="space-y-2 text-sm">
              {Object.entries(insights?.engagement_by_area || {}).map(([area, stats]: [string, any]) => (
                <div key={area} className="flex justify-between border-b border-gray-100 py-1">
                  <span className="text-gray-700 capitalize">{area.replace(/_/g, ' ')}</span>
                  <span className="text-gray-600">
                    {stats.posts} posts · {stats.views} views · {stats.likes} likes · {stats.comments} comments
                  </span>
                </div>
              ))}
              {Object.keys(insights?.engagement_by_area || {}).length === 0 && (
                <p className="text-gray-500">No data.</p>
              )}
            </div>
          </div>

          {/* Posts needing confirmations */}
          <div className="rounded-xl border bg-white p-4">
            <h3 className="font-semibold mb-4">Required-read posts with pending confirmations</h3>
            <ul className="text-sm space-y-1">
              {(insights?.ignored_posts || []).length === 0 ? (
                <li className="text-gray-500">None in this date range.</li>
              ) : (
                insights.ignored_posts.map((row: any) => (
                  <li key={row.post_id} className="flex justify-between gap-2">
                    <span className="truncate">{row.title}</span>
                    <span className="text-gray-600 whitespace-nowrap">{row.pending_confirmations} pending</span>
                  </li>
                ))
              )}
            </ul>
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

