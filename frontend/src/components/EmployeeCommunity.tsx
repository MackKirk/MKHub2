import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, withFileAccessTokenIfNeeded } from '@/lib/api';
import toast from 'react-hot-toast';
import OverlayPortal from '@/components/OverlayPortal';
import MentionPicker, { type MentionEntity } from '@/components/community/MentionPicker';
import { CommunityPostBody } from '@/components/community/CommunityPostBody';

type CommunityPost = {
  id: string;
  title: string;
  content: string;
  author_id: string;
  author_name?: string;
  author_avatar?: string;
  photo_url?: string;
  document_url?: string;
  document_file_id?: string;
  created_at: string;
  publish_at?: string;
  status?: string;
  priority?: string;
  related_area?: string;
  target_type?: string;
  target_division_ids?: string[];
  tags?: string[];
  likes_count?: number;
  comments_count?: number;
  is_required?: boolean;
  is_unread?: boolean;
  requires_read_confirmation?: boolean;
  user_has_confirmed?: boolean;
  user_has_liked?: boolean;
};

type Comment = {
  id: string;
  user_id: string;
  user_name?: string;
  user_avatar?: string;
  content: string;
  created_at: string;
  updated_at?: string;
  parent_comment_id?: string | null;
};

const AREA_LABELS: Record<string, string> = {
  general: 'General',
  projects: 'Projects',
  opportunities: 'Opportunities',
  repairs_maintenance: 'Repairs & Maintenance',
  safety: 'Safety',
  fleet: 'Fleet',
  hr: 'HR',
  payroll: 'Payroll',
  training: 'Training',
};

function buildPostsQuery(params: Record<string, string | undefined>): string {
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== '') sp.set(k, v);
  });
  const q = sp.toString();
  return q ? `/community/posts?${q}` : '/community/posts';
}

type EmployeeCommunityProps = {
  expanded?: boolean;
  feedMode?: boolean;
};

export default function EmployeeCommunity({ expanded = false, feedMode = false }: EmployeeCommunityProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [filter, setFilter] = useState<'all' | 'unread' | 'required' | 'announcements' | 'urgent'>('all');
  const [searchQ, setSearchQ] = useState('');
  const [relatedAreaFilter, setRelatedAreaFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [confirmedOnly, setConfirmedOnly] = useState(false);
  const [modalPost, setModalPost] = useState<CommunityPost | null>(null);
  const [commentText, setCommentText] = useState('');
  const [commentMentions, setCommentMentions] = useState<MentionEntity[]>([]);
  const [replyParentId, setReplyParentId] = useState<string | null>(null);
  const commentsRef = useRef<HTMLDivElement>(null);
  const [visiblePostsCount, setVisiblePostsCount] = useState(feedMode ? 3 : Infinity);
  const feedContainerRef = useRef<HTMLDivElement>(null);
  const deepLinkHandled = useRef<string | null>(null);

  const listParams = useMemo(() => {
    const p: Record<string, string | undefined> = { filter: filter === 'urgent' ? 'urgent' : filter };
    if (searchQ.trim()) p.q = searchQ.trim();
    if (relatedAreaFilter) p.related_area = relatedAreaFilter;
    if (priorityFilter) p.priority = priorityFilter;
    if (confirmedOnly) p.confirmed_only = 'true';
    return p;
  }, [filter, searchQ, relatedAreaFilter, priorityFilter, confirmedOnly]);

  const { data: posts = [], refetch: refetchPosts } = useQuery({
    queryKey: ['community-posts', listParams],
    queryFn: async () => {
      const result = await api<any>('GET', buildPostsQuery(listParams));
      if (Array.isArray(result)) return result;
      if (result && Array.isArray(result.data)) return result.data;
      return [];
    },
  });

  useEffect(() => {
    if (!Array.isArray(posts) || posts.length === 0) return;
    let raw: string[] = [];
    try {
      raw = JSON.parse(sessionStorage.getItem('communityHighPriToastIds') || '[]');
    } catch {
      raw = [];
    }
    const seen = new Set(raw);
    for (const p of posts as CommunityPost[]) {
      const pr = p.priority || '';
      if ((pr === 'urgent' || pr === 'critical') && p.is_unread && !seen.has(p.id)) {
        toast(pr === 'critical' ? `Critical: ${p.title}` : `Urgent: ${p.title}`, { duration: 6500 });
        seen.add(p.id);
      }
    }
    sessionStorage.setItem('communityHighPriToastIds', JSON.stringify([...seen].slice(-120)));
  }, [posts]);

  const filteredPosts = useMemo(() => {
    if (!Array.isArray(posts)) return [];
    if (feedMode && visiblePostsCount < posts.length) {
      return posts.slice(0, visiblePostsCount);
    }
    return posts;
  }, [posts, feedMode, visiblePostsCount]);

  // Reset visible posts count when filter changes
  useEffect(() => {
    if (feedMode) {
      setVisiblePostsCount(3);
    }
  }, [filter, feedMode, searchQ, relatedAreaFilter, priorityFilter, confirmedOnly]);

  // Infinite scroll handler for feed mode
  useEffect(() => {
    if (!feedMode || !feedContainerRef.current) return;

    const container = feedContainerRef.current;
    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      // Load more when user scrolls to within 100px of the bottom
      if (scrollHeight - scrollTop - clientHeight < 100) {
        setVisiblePostsCount(prev => Math.min(prev + 3, posts.length));
      }
    };

    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, [feedMode, posts, listParams]);

  const queryClient = useQueryClient();

  const markViewedMutation = useMutation({
    mutationFn: (postId: string) => api('POST', `/community/posts/${postId}/mark-viewed`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['community-posts'] });
      queryClient.invalidateQueries({ queryKey: ['my-community-posts'] });
    },
    onError: (err: any) => {
      console.error('Failed to mark post as viewed:', err);
    },
  });

  useEffect(() => {
    const pid = searchParams.get('communityPost');
    if (!pid || deepLinkHandled.current === pid) return;
    const run = async () => {
      try {
        const found = (posts as CommunityPost[]).find((p) => p.id === pid);
        if (found) {
          deepLinkHandled.current = pid;
          setModalPost(found);
          markViewedMutation.mutate(found.id);
          setSearchParams((prev) => {
            const next = new URLSearchParams(prev);
            next.delete('communityPost');
            return next;
          }, { replace: true });
          return;
        }
        const one = await api<CommunityPost>('GET', `/community/posts/${pid}`);
        deepLinkHandled.current = pid;
        setModalPost(one);
        markViewedMutation.mutate(one.id);
        setSearchParams((prev) => {
          const next = new URLSearchParams(prev);
          next.delete('communityPost');
          return next;
        }, { replace: true });
      } catch {
        /* ignore */
      }
    };
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- stable mutate
  }, [searchParams, posts, setSearchParams]);

  const confirmReadMutation = useMutation({
    mutationFn: (postId: string) => api('POST', `/community/posts/${postId}/confirm-read`),
    onSuccess: () => {
      toast.success('Read confirmation recorded');
      queryClient.invalidateQueries({ queryKey: ['community-posts'] });
      if (modalPost) {
        // Update modal post state
        setModalPost({ ...modalPost, user_has_confirmed: true });
      }
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.detail || 'Failed to confirm read');
    },
  });

  const likeMutation = useMutation({
    mutationFn: (postId: string) => api('POST', `/community/posts/${postId}/like`),
    onSuccess: (data: any, postId: string) => {
      queryClient.invalidateQueries({ queryKey: ['community-posts'] });
      if (modalPost && modalPost.id === postId) {
        setModalPost({ ...modalPost, likes_count: data.likes_count, user_has_liked: data.user_has_liked });
      }
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.detail || 'Failed to toggle like');
    },
  });

  // Fetch comments when modal is open
  const { data: comments = [], refetch: refetchComments } = useQuery({
    queryKey: ['post-comments', modalPost?.id],
    queryFn: () => api<Comment[]>('GET', `/community/posts/${modalPost?.id}/comments`),
    enabled: !!modalPost,
  });

  const createCommentMutation = useMutation({
    mutationFn: ({
      postId,
      content,
      parent_comment_id,
      mentions,
    }: {
      postId: string;
      content: string;
      parent_comment_id?: string | null;
      mentions?: { entity_type: string; entity_id: string }[];
    }) =>
      api('POST', `/community/posts/${postId}/comments`, {
        content,
        parent_comment_id: parent_comment_id || undefined,
        mentions: mentions?.length ? mentions : undefined,
      }),
    onSuccess: (data: any) => {
      setCommentText('');
      setCommentMentions([]);
      setReplyParentId(null);
      refetchComments();
      queryClient.invalidateQueries({ queryKey: ['community-posts'] });
      if (modalPost) {
        setModalPost({ ...modalPost, comments_count: data.comments_count });
      }
      // Scroll to bottom of comments
      setTimeout(() => {
        if (commentsRef.current) {
          commentsRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
        }
      }, 100);
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.detail || 'Failed to create comment');
    },
  });

  const handleOpenModal = (post: CommunityPost, focusComments = false) => {
    setModalPost(post);
    // Mark post as viewed when modal is opened
    markViewedMutation.mutate(post.id);
    // If focusing on comments, scroll to comments section after modal opens
    if (focusComments) {
      setTimeout(() => {
        if (commentsRef.current) {
          commentsRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 300);
    }
  };

  const handleLike = (e: React.MouseEvent, post: CommunityPost) => {
    e.stopPropagation();
    likeMutation.mutate(post.id);
  };

  const handleCommentClick = (e: React.MouseEvent, post: CommunityPost) => {
    e.stopPropagation();
    if (!modalPost || modalPost.id !== post.id) {
      handleOpenModal(post, true);
    } else {
      setTimeout(() => {
        if (commentsRef.current) {
          commentsRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 100);
    }
  };

  const handleSubmitComment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!modalPost || !commentText.trim()) return;
    createCommentMutation.mutate({
      postId: modalPost.id,
      content: commentText.trim(),
      parent_comment_id: replyParentId,
      mentions: commentMentions.map((m) => ({ entity_type: m.entity_type, entity_id: m.entity_id })),
    });
  };

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
        return 'bg-red-50 text-red-700';
      case 'Urgent':
        return 'bg-red-50 text-red-700';
      case 'Required':
        return 'bg-red-50 text-red-700';
      case 'Image':
        return 'bg-green-50 text-green-700';
      case 'Document':
        return 'bg-green-50 text-green-700';
      case 'Groups':
        return 'bg-blue-50 text-blue-700';
      case 'Mack Kirk News':
        return 'bg-blue-50 text-blue-700';
      default:
        return 'bg-gray-50 text-gray-700';
    }
  };

  const getTagPriority = (tag: string): number => {
    switch (tag) {
      case 'Urgent':
        return 1;
      case 'Required':
        return 2;
      case 'Announcement':
        return 3;
      case 'Groups':
        return 4;
      case 'Image':
      case 'Document':
        return 5;
      default:
        return 99;
    }
  };

  const sortTagsByPriority = (tags: string[]): string[] => {
    if (!Array.isArray(tags)) return [];
    return [...tags].sort((a, b) => getTagPriority(a) - getTagPriority(b));
  };

  return (
    <div className={`rounded-[12px] border border-gray-200/80 bg-white shadow-sm p-5 ${expanded ? 'h-full flex flex-col' : feedMode ? 'h-full flex flex-col min-w-0' : ''}`}>
      <div className="mb-5 flex items-center justify-between flex-shrink-0">
        <h3 className="text-lg font-bold text-gray-900 tracking-tight">Employee Community</h3>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 mb-3 overflow-x-auto flex-shrink-0">
        {(['all', 'unread', 'urgent', 'required', 'announcements'] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`
              px-4 py-2 rounded-lg text-sm whitespace-nowrap transition-all duration-150 font-medium
              ${filter === f
                ? 'bg-blue-600 text-white shadow-sm active:scale-[0.98]'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200 active:bg-gray-300 active:scale-[0.98] border border-gray-200/60'
              }
            `}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 mb-4 items-end flex-shrink-0">
        <input
          type="search"
          placeholder="Search title or content…"
          value={searchQ}
          onChange={(e) => setSearchQ(e.target.value)}
          className="min-w-[140px] flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
        />
        <select
          value={relatedAreaFilter}
          onChange={(e) => setRelatedAreaFilter(e.target.value)}
          className="rounded-lg border border-gray-300 px-2 py-2 text-sm"
        >
          <option value="">All areas</option>
          {Object.entries(AREA_LABELS).map(([k, lab]) => (
            <option key={k} value={k}>
              {lab}
            </option>
          ))}
        </select>
        <select
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value)}
          className="rounded-lg border border-gray-300 px-2 py-2 text-sm"
        >
          <option value="">All priorities</option>
          <option value="normal">Normal</option>
          <option value="important">Important</option>
          <option value="urgent">Urgent</option>
          <option value="critical">Critical</option>
        </select>
        <label className="flex items-center gap-1 text-xs text-gray-600 whitespace-nowrap">
          <input type="checkbox" checked={confirmedOnly} onChange={(e) => setConfirmedOnly(e.target.checked)} />
          Confirmed by me
        </label>
      </div>

      {/* Posts feed */}
      <div 
        ref={feedContainerRef}
        className={`space-y-4 overflow-y-auto ${expanded ? 'flex-1 min-h-0' : feedMode ? 'flex-1 min-h-0' : ''}`} 
        style={feedMode ? {} : (!expanded ? { maxHeight: '600px', height: '600px' } : { maxHeight: '100%' })}
      >
        {filteredPosts.length === 0 ? (
          <div className="text-center text-gray-500 py-8">
            {posts.length === 0 ? 'No posts yet' : `No ${filter} posts`}
          </div>
        ) : (
          filteredPosts.map((post) => {
            const pr = post.priority || '';
            const isUrgent =
              pr === 'urgent' || pr === 'critical' || post.tags?.includes('Urgent') || false;
            const isCritical = pr === 'critical';
            const isRequired = post.requires_read_confirmation || post.tags?.includes('Required') || false;

            return (
              <div
                key={post.id}
                className={`group border rounded-[12px] p-4 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 cursor-pointer overflow-hidden ${
                  isCritical
                    ? 'border-red-700/50 bg-red-100/40 shadow-md ring-1 ring-red-200'
                    : isUrgent
                      ? 'border-red-300/60 bg-red-50/50 shadow-sm'
                      : isRequired
                        ? 'border-orange-300/60 bg-orange-50/50 shadow-sm'
                        : 'border-gray-200/50 bg-gray-50/30 shadow-sm'
                }`}
                onClick={(e) => {
                  e.stopPropagation();
                  handleOpenModal(post);
                }}
              >
                <div className="flex items-start gap-3">
                  {/* Avatar */}
                  <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0">
                    {post.author_avatar ? (
                      <img
                        src={withFileAccessTokenIfNeeded(post.author_avatar)}
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
                  <div className="flex-1 min-w-0 overflow-hidden">
                    <div className="flex items-center gap-2 mb-1.5">
                      <h4 className={`font-bold text-base truncate tracking-tight ${
                        isUrgent ? 'text-red-900' :
                        isRequired ? 'text-orange-900' :
                        'text-gray-700'
                      }`}>
                        {post.title}
                      </h4>
                      {post.is_unread && (
                        <div className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0"></div>
                      )}
                      {(isCritical || isUrgent || isRequired) && (
                        <span
                          className={`px-2 py-0.5 rounded text-xs font-bold flex-shrink-0 tracking-wide ${
                            isCritical ? 'bg-red-900 text-white' : isUrgent ? 'bg-red-600 text-white' : 'bg-orange-600 text-white'
                          }`}
                        >
                          {isCritical ? 'CRITICAL' : isUrgent ? 'URGENT' : 'REQUIRED'}
                        </span>
                      )}
                      {post.related_area && (
                        <span className="text-[10px] px-2 py-0.5 rounded bg-blue-50 text-blue-800 border border-blue-100">
                          {AREA_LABELS[post.related_area] || post.related_area}
                        </span>
                      )}
                    </div>

                    <div className={`text-xs mb-2.5 font-medium ${
                      isUrgent || isRequired ? 'text-gray-500' : 'text-gray-400'
                    }`}>
                      {post.author_name || 'Unknown'} · {formatTimeAgo(post.created_at)}
                      {post.target_type === 'all' ? ' · All employees' : ' · Divisions'}
                      {post.user_has_confirmed && (
                        <span className="ml-2 text-green-700 font-semibold">· Confirmed</span>
                      )}
                    </div>

                    {/* Tags */}
                    {Array.isArray(post.tags) && post.tags.length > 0 && (
                      <div className="flex flex-wrap gap-2 mb-2">
                        {sortTagsByPriority(post.tags).map((tag) => (
                          <span
                            key={tag}
                            className={`px-2 py-0.5 rounded text-xs ${getTagColor(tag)}`}
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Content preview - 2 lines max in feed mode */}
                    <div
                      className={`text-sm mb-3 leading-relaxed max-w-full overflow-hidden ${
                        feedMode ? 'line-clamp-2' : 'line-clamp-1'
                      } ${isUrgent || isRequired ? 'text-gray-600' : 'text-gray-500'}`}
                    >
                      <CommunityPostBody html={post.content} />
                    </div>

                    {/* Engagement */}
                    <div className="flex items-center gap-4 text-sm">
                      <button
                        onClick={(e) => handleLike(e, post)}
                        className={`flex items-center gap-1.5 hover:opacity-80 active:opacity-60 transition-all ${post.user_has_liked ? 'text-red-600' : 'text-gray-500'}`}
                      >
                        {post.user_has_liked ? '❤️' : '🤍'}
                        <span className="font-medium">{post.likes_count || 0}</span>
                      </button>
                      <button
                        onClick={(e) => handleCommentClick(e, post)}
                        className="flex items-center gap-1.5 hover:opacity-80 active:opacity-60 transition-all text-gray-500"
                      >
                        💬
                        <span className="font-medium">{post.comments_count || 0}</span>
                      </button>
                      {feedMode && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenModal(post);
                          }}
                          className="ml-auto px-3 py-1.5 text-xs font-semibold text-blue-600 hover:text-blue-700 hover:bg-blue-50 active:bg-blue-100 rounded-lg transition-all duration-150 active:scale-[0.98]"
                        >
                          View post →
                        </button>
                      )}
                      {!feedMode && (
                        <span className="ml-auto text-xs text-gray-400 font-medium">
                          Click to view full post
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Post Detail Modal */}
      {modalPost && (
        <OverlayPortal><div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setModalPost(null)}>
          <div className="bg-white w-full max-w-2xl max-h-[90vh] flex flex-col rounded-xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto">
              <div className="p-4">
                {/* Author profile with close button */}
                <div className="flex items-start gap-3 mb-4 relative">
                  <div className="w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0">
                    {modalPost.author_avatar ? (
                      <img
                        src={withFileAccessTokenIfNeeded(modalPost.author_avatar)}
                        alt={modalPost.author_name || 'User'}
                        className="w-full h-full rounded-full object-cover"
                      />
                    ) : (
                      <span className="text-gray-500 text-lg font-medium">
                        {(modalPost.author_name || 'U')[0].toUpperCase()}
                      </span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-base font-semibold text-gray-900 leading-tight pr-8">{modalPost.title}</h3>
                      <button
                        onClick={() => {
                          setModalPost(null);
                          setCommentText('');
                          setCommentMentions([]);
                          setReplyParentId(null);
                        }}
                        className="text-gray-400 hover:text-gray-600 transition flex-shrink-0 mt-0.5"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                    <div className="text-sm text-gray-600 mt-0.5 flex flex-wrap gap-2 items-center">
                      <span>
                        {modalPost.author_name || 'Unknown'} · {formatTimeAgo(modalPost.created_at)}
                      </span>
                      {modalPost.related_area && (
                        <span className="text-xs px-2 py-0.5 rounded bg-blue-50 text-blue-800 border border-blue-100">
                          {AREA_LABELS[modalPost.related_area] || modalPost.related_area}
                        </span>
                      )}
                      <span className="text-xs text-gray-500">
                        {modalPost.target_type === 'all' ? 'Everyone' : 'Division audience'}
                      </span>
                      {modalPost.priority && modalPost.priority !== 'normal' && (
                        <span className="text-xs font-semibold text-red-800 capitalize">{modalPost.priority}</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Photo - with padding */}
                {modalPost.photo_url && (
                  <div className="mb-4">
                    <img
                      src={withFileAccessTokenIfNeeded(modalPost.photo_url)}
                      alt={modalPost.title}
                      className="w-full h-auto rounded-lg object-contain"
                    />
                  </div>
                )}

                {/* Content text - right after photo */}
                <div className="text-base text-gray-900 mb-4 leading-relaxed">
                  <CommunityPostBody html={modalPost.content} />
                </div>

                {/* Document - after text, with small icon on the right */}
                {modalPost.document_url && (
                  <div className="mb-4 flex justify-end">
                    <a
                      href={withFileAccessTokenIfNeeded(modalPost.document_url)}
                      download
                      className="flex items-center gap-2 text-sm text-gray-700 hover:text-gray-900 transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                      </svg>
                      <span className="font-medium">Download Document</span>
                    </a>
                  </div>
                )}

                {/* Engagement - likes count */}
                <div className="flex items-center gap-4 mb-4 pb-4 border-b border-gray-200">
                  <button
                    onClick={() => likeMutation.mutate(modalPost.id)}
                    className={`flex items-center gap-1.5 hover:opacity-70 transition ${modalPost.user_has_liked ? 'text-red-600' : 'text-gray-600'}`}
                  >
                    {modalPost.user_has_liked ? (
                      <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                        <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                      </svg>
                    ) : (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                      </svg>
                    )}
                    <span className="text-sm font-medium">{modalPost.likes_count || 0}</span>
                  </button>
                </div>

                {/* Comments Section */}
                <div ref={commentsRef} className="pt-2">
                  <h3 className="text-base font-semibold text-gray-900 mb-4">
                    {comments.length} {comments.length === 1 ? 'Comment' : 'Comments'}
                  </h3>
                  
                  {/* Comments List */}
                  <div className="space-y-4 mb-4">
                    {comments.length === 0 ? (
                      <div className="text-sm text-gray-500 text-center py-6">
                        No comments yet. Be the first to comment!
                      </div>
                    ) : (
                      comments.map((comment: Comment) => (
                        <div
                          key={comment.id}
                          className={`flex gap-3 ${comment.parent_comment_id ? 'ml-6 pl-3 border-l-2 border-gray-100' : ''}`}
                        >
                          <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0">
                            {comment.user_avatar ? (
                              <img
                                src={withFileAccessTokenIfNeeded(comment.user_avatar)}
                                alt={comment.user_name || 'User'}
                                className="w-full h-full rounded-full object-cover"
                              />
                            ) : (
                              <span className="text-gray-500 text-sm font-medium">
                                {(comment.user_name || 'U')[0].toUpperCase()}
                              </span>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-semibold text-sm text-gray-900">{comment.user_name || 'Unknown'}</span>
                            </div>
                            <p className="text-sm text-gray-900 mb-1 whitespace-pre-wrap leading-relaxed">{comment.content}</p>
                            <div className="flex items-center gap-3 text-xs text-gray-500">
                              <span>{formatTimeAgo(comment.created_at)}</span>
                              <button
                                type="button"
                                className="text-blue-600 hover:underline"
                                onClick={() => {
                                  setReplyParentId(comment.id);
                                  toast.success('Replying — add your message below');
                                }}
                              >
                                Reply
                              </button>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Read Confirmation */}
                {modalPost.requires_read_confirmation && (
                  <div className="pt-4 border-t border-gray-200 mb-4">
                    {modalPost.user_has_confirmed ? (
                      <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 px-4 py-3 rounded-lg border border-green-200">
                        <span>✓</span>
                        <span>You have confirmed reading this post</span>
                      </div>
                    ) : (
                      <button
                        onClick={() => confirmReadMutation.mutate(modalPost.id)}
                        disabled={confirmReadMutation.isLoading}
                        className="w-full px-4 py-3 rounded-lg bg-gradient-to-r from-[#7f1010] to-[#a31414] text-white hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                      >
                        {confirmReadMutation.isLoading ? 'Confirming...' : 'Confirm I have read this message'}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Fixed comment input at bottom */}
            <div className="border-t border-gray-200 p-4 bg-white space-y-3">
              {replyParentId && (
                <div className="flex items-center justify-between text-xs text-gray-600 bg-gray-50 px-2 py-1 rounded">
                  <span>Replying to thread</span>
                  <button type="button" className="text-blue-600" onClick={() => setReplyParentId(null)}>
                    Cancel
                  </button>
                </div>
              )}
              <MentionPicker mentions={commentMentions} onChange={setCommentMentions} />
              <form onSubmit={handleSubmitComment} className="flex gap-2 items-start">
                <div className="flex-1">
                  <textarea
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    placeholder="Add Comment"
                    rows={1}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#7f1010] focus:border-transparent resize-none text-sm"
                    style={{ minHeight: '40px', maxHeight: '120px' }}
                    onInput={(e) => {
                      const target = e.target as HTMLTextAreaElement;
                      target.style.height = 'auto';
                      target.style.height = `${target.scrollHeight}px`;
                    }}
                  />
                </div>
                <button
                  type="submit"
                  disabled={!commentText.trim() || createCommentMutation.isLoading}
                  className="px-6 py-2.5 bg-gradient-to-r from-[#7f1010] to-[#a31414] text-white rounded-lg hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed font-medium text-sm flex items-center gap-2"
                  style={{ height: '40px', marginTop: '0' }}
                >
                  <span>{createCommentMutation.isLoading ? 'Posting...' : 'Post'}</span>
                  {!createCommentMutation.isLoading && (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                    </svg>
                  )}
                </button>
              </form>
            </div>
          </div>
        </div></OverlayPortal>
      )}
    </div>
  );
}

