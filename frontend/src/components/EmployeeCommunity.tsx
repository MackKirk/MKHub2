import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';

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
};

type EmployeeCommunityProps = {
  expanded?: boolean;
  feedMode?: boolean;
};

export default function EmployeeCommunity({ expanded = false, feedMode = false }: EmployeeCommunityProps) {
  const [filter, setFilter] = useState<'all' | 'unread' | 'required' | 'announcements' | 'urgent'>('all');
  const [modalPost, setModalPost] = useState<CommunityPost | null>(null);
  const [commentText, setCommentText] = useState('');
  const commentsRef = useRef<HTMLDivElement>(null);
  const [visiblePostsCount, setVisiblePostsCount] = useState(feedMode ? 3 : Infinity);
  const feedContainerRef = useRef<HTMLDivElement>(null);

  // Fetch community posts
  const { data: posts = [], refetch: refetchPosts } = useQuery({
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
    
    let filtered: CommunityPost[] = [];
    if (filter === 'all') filtered = posts;
    else if (filter === 'unread') filtered = posts.filter(p => p.is_unread);
    else if (filter === 'required') filtered = posts.filter(p => p.requires_read_confirmation);
    else if (filter === 'announcements') filtered = posts.filter(p => p.tags?.includes('Announcement'));
    else if (filter === 'urgent') filtered = posts.filter(p => p.tags?.includes('Urgent'));
    else filtered = posts;
    
    // In feed mode, limit visible posts
    if (feedMode && visiblePostsCount < filtered.length) {
      return filtered.slice(0, visiblePostsCount);
    }
    return filtered;
  }, [posts, filter, feedMode, visiblePostsCount]);

  // Reset visible posts count when filter changes
  useEffect(() => {
    if (feedMode) {
      setVisiblePostsCount(3);
    }
  }, [filter, feedMode]);

  // Infinite scroll handler for feed mode
  useEffect(() => {
    if (!feedMode || !feedContainerRef.current) return;

    const container = feedContainerRef.current;
    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      // Load more when user scrolls to within 100px of the bottom
      if (scrollHeight - scrollTop - clientHeight < 100) {
        setVisiblePostsCount(prev => {
          const filtered = filter === 'all' ? posts : 
            filter === 'unread' ? posts.filter((p: CommunityPost) => p.is_unread) :
            filter === 'required' ? posts.filter((p: CommunityPost) => p.requires_read_confirmation) :
            filter === 'announcements' ? posts.filter((p: CommunityPost) => p.tags?.includes('Announcement')) :
            posts;
          // Load 3 more posts at a time
          return Math.min(prev + 3, filtered.length);
        });
      }
    };

    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, [feedMode, posts, filter]);

  const queryClient = useQueryClient();

  const markViewedMutation = useMutation({
    mutationFn: (postId: string) => api('POST', `/community/posts/${postId}/mark-viewed`),
    onSuccess: () => {
      // Mark as viewed silently, don't show toast
      queryClient.invalidateQueries({ queryKey: ['community-posts'] });
      // Also invalidate my-posts to update views count in My Announcements
      queryClient.invalidateQueries({ queryKey: ['my-community-posts'] });
    },
    onError: (err: any) => {
      // Silently fail, don't show error
      console.error('Failed to mark post as viewed:', err);
    },
  });

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
    mutationFn: ({ postId, content }: { postId: string; content: string }) =>
      api('POST', `/community/posts/${postId}/comments`, { content }),
    onSuccess: (data: any) => {
      setCommentText('');
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
    createCommentMutation.mutate({ postId: modalPost.id, content: commentText.trim() });
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
      <div className="flex gap-2 mb-5 overflow-x-auto flex-shrink-0">
        {(['all', 'unread', 'urgent', 'required', 'announcements'] as const).map((f) => (
          <button
            key={f}
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
            // Check if post is Urgent or Required
            const isUrgent = post.tags?.includes('Urgent') || false;
            const isRequired = post.requires_read_confirmation || post.tags?.includes('Required') || false;
            
            return (
              <div
                key={post.id}
                className={`group border rounded-[12px] p-4 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 cursor-pointer overflow-hidden ${
                  isUrgent ? 'border-red-300/60 bg-red-50/50 shadow-sm' :
                  isRequired ? 'border-orange-300/60 bg-orange-50/50 shadow-sm' :
                  'border-gray-200/50 bg-gray-50/30 shadow-sm'
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
                      {(isUrgent || isRequired) && (
                        <span className={`px-2 py-0.5 rounded text-xs font-bold flex-shrink-0 tracking-wide ${
                          isUrgent ? 'bg-red-600 text-white' :
                          'bg-orange-600 text-white'
                        }`}>
                          {isUrgent ? 'URGENT' : 'REQUIRED'}
                        </span>
                      )}
                    </div>

                    <div className={`text-xs mb-2.5 font-medium ${
                      isUrgent || isRequired ? 'text-gray-500' : 'text-gray-400'
                    }`}>
                      {post.author_name || 'Unknown'} · {formatTimeAgo(post.created_at)}
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
                    <p className={`text-sm mb-3 leading-relaxed ${feedMode ? 'line-clamp-2' : 'truncate'} ${
                      isUrgent || isRequired ? 'text-gray-600' : 'text-gray-500'
                    }`}>
                      {post.content}
                    </p>

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
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setModalPost(null)}>
          <div className="bg-white w-full max-w-2xl max-h-[90vh] flex flex-col rounded-xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto">
              <div className="p-4">
                {/* Author profile with close button */}
                <div className="flex items-start gap-3 mb-4 relative">
                  <div className="w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0">
                    {modalPost.author_avatar ? (
                      <img
                        src={modalPost.author_avatar}
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
                        }}
                        className="text-gray-400 hover:text-gray-600 transition flex-shrink-0 mt-0.5"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                    <div className="text-sm text-gray-600 mt-0.5">
                      {modalPost.author_name || 'Unknown'} · {formatTimeAgo(modalPost.created_at)}
                      {Array.isArray(modalPost.tags) && modalPost.tags.length > 0 && modalPost.tags.includes('Announcement') && ' in '}
                      {Array.isArray(modalPost.tags) && modalPost.tags.length > 0 && modalPost.tags.includes('Announcement') && modalPost.tags.find(t => t !== 'Announcement' && t !== 'Image' && t !== 'Document' && t !== 'Urgent' && t !== 'Required') && (
                        <span className="capitalize">{modalPost.tags.find(t => t !== 'Announcement' && t !== 'Image' && t !== 'Document' && t !== 'Urgent' && t !== 'Required')}</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Photo - with padding */}
                {modalPost.photo_url && (
                  <div className="mb-4">
                    <img
                      src={modalPost.photo_url}
                      alt={modalPost.title}
                      className="w-full h-auto rounded-lg object-contain"
                    />
                  </div>
                )}

                {/* Content text - right after photo */}
                <div className="text-base text-gray-900 whitespace-pre-wrap mb-4 leading-relaxed">
                  {modalPost.content}
                </div>

                {/* Document - after text, with small icon on the right */}
                {modalPost.document_url && (
                  <div className="mb-4 flex justify-end">
                    <a
                      href={modalPost.document_url}
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
                        <div key={comment.id} className="flex gap-3">
                          <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0">
                            {comment.user_avatar ? (
                              <img
                                src={comment.user_avatar}
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
            <div className="border-t border-gray-200 p-4 bg-white">
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
        </div>
      )}
    </div>
  );
}

