import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

type CommunityPost = {
  id: string;
  title: string;
  content: string;
  author_id: string;
  author_name?: string;
  author_avatar?: string;
  created_at: string;
  tags?: string[];
  likes_count?: number;
  comments_count?: number;
  is_required?: boolean;
  is_unread?: boolean;
};

type EmployeeCommunityProps = {
  expanded?: boolean;
};

export default function EmployeeCommunity({ expanded = false }: EmployeeCommunityProps) {
  const [filter, setFilter] = useState<'all' | 'unread' | 'required' | 'announcements'>('all');
  const [expandedPostId, setExpandedPostId] = useState<string | null>(null);

  // Fetch community posts
  const { data: posts = [] } = useQuery({
    queryKey: ['community-posts', filter],
    queryFn: async () => {
      const result = await api<any>('GET', `/community/posts?filter=${filter || 'all'}`);
      // Ensure we return an array
      if (Array.isArray(result)) {
        return result;
      }
      // If result is an object with a data property, use that
      if (result && Array.isArray(result.data)) {
        return result.data;
      }
      // Default to empty array
      return [];
    },
  });

  const filteredPosts = useMemo(() => {
    // Ensure posts is always an array
    if (!Array.isArray(posts)) return [];
    
    if (filter === 'all') return posts;
    if (filter === 'unread') return posts.filter(p => p.is_unread);
    if (filter === 'required') return posts.filter(p => p.is_required);
    if (filter === 'announcements') return posts.filter(p => p.tags?.includes('Announcement'));
    return posts;
  }, [posts, filter]);

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

  const getTagColor = (tag: string) => {
    switch (tag) {
      case 'Announcement':
        return 'bg-red-100 text-red-800 border-red-300';
      case 'Mack Kirk News':
        return 'bg-blue-100 text-blue-800 border-blue-300';
      case 'Image':
        return 'bg-green-100 text-green-800 border-green-300';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  return (
    <div className={`rounded-xl border bg-white p-4 ${expanded ? 'h-full flex flex-col' : ''}`}>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-semibold">Employee Community</h3>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 mb-4 overflow-x-auto">
        {(['all', 'unread', 'required', 'announcements'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`
              px-4 py-2 rounded-full text-sm whitespace-nowrap transition-colors
              ${filter === f
                ? 'bg-blue-100 text-blue-800 font-medium'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }
            `}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {/* Posts feed */}
      <div className={`space-y-4 overflow-y-auto ${expanded ? 'flex-1 min-h-0' : 'max-h-[600px]'}`}>
        {filteredPosts.length === 0 ? (
          <div className="text-center text-gray-500 py-8">
            {posts.length === 0 ? 'No posts yet' : `No ${filter} posts`}
          </div>
        ) : (
          filteredPosts.map((post) => {
            const isExpanded = expandedPostId === post.id;
            return (
              <div
                key={post.id}
                className="border rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => setExpandedPostId(isExpanded ? null : post.id)}
              >
                <div className="flex items-start gap-3">
                  {/* Avatar */}
                  <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0">
                    {post.author_avatar ? (
                      <img
                        src={post.author_avatar}
                        alt={post.author_name || 'User'}
                        className="w-full h-full rounded-full object-cover"
                      />
                    ) : (
                      <span className="text-gray-500 text-sm">
                        {(post.author_name || 'U')[0].toUpperCase()}
                      </span>
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="font-semibold text-gray-900 truncate">{post.title}</h4>
                      {post.is_unread && (
                        <div className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0"></div>
                      )}
                    </div>

                    <div className="text-sm text-gray-600 mb-2">
                      {post.author_name || 'Unknown'} · {formatTimeAgo(post.created_at)}
                    </div>

                    {/* Tags */}
                    {post.tags && post.tags.length > 0 && (
                      <div className="flex flex-wrap gap-2 mb-2">
                        {post.tags.map((tag) => (
                          <span
                            key={tag}
                            className={`px-2 py-0.5 rounded text-xs border ${getTagColor(tag)}`}
                          >
                            {tag === 'Image' && '📎 '}
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Content preview or full content */}
                    {isExpanded ? (
                      <div className="text-sm text-gray-700 whitespace-pre-wrap mb-2">
                        {post.content}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-700 line-clamp-2 mb-2">
                        {post.content}
                      </p>
                    )}

                    {/* Engagement */}
                    <div className="flex items-center gap-4 text-sm text-gray-500">
                      <span>❤️ {post.likes_count || 0}</span>
                      <span>💬 {post.comments_count || 0}</span>
                      <span className="ml-auto text-xs text-gray-400">
                        {isExpanded ? 'Click to collapse' : 'Click to expand'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

