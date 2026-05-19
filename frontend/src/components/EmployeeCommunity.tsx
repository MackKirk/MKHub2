import React, { useState, useMemo, useRef, useEffect } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import type { Editor } from '@tiptap/core';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, withFileAccessTokenIfNeeded } from '@/lib/api';
import toast from 'react-hot-toast';
import OverlayPortal from '@/components/OverlayPortal';
import { CommunityPostBody } from '@/components/community/CommunityPostBody';
import { CommunityFeedPostSnippet } from '@/components/community/CommunityFeedPostSnippet';
import CommunityDirectoryUserPeekModal from '@/components/community/CommunityDirectoryUserPeekModal';
import CommunityCommentRichTextEditor from '@/components/community/CommunityCommentRichTextEditor';
import { useConfirm } from '@/components/ConfirmProvider';
import { extractMentionsFromEditor } from '@/lib/communityPostEditorUtils';
import { isCommunityEditorHtmlEmpty, sanitizeCommunityPostHtml } from '@/lib/communityPostHtml';
import {
  AppBadge,
  AppButton,
  AppEmptyState,
  AppInput,
  AppSelect,
  AppTabs,
  uiBorders,
  uiColors,
  uiCx,
  uiRadius,
  uiSpacing,
  uiTypography,
} from '@/components/ui';
import { Search } from 'lucide-react';

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
  document_original_name?: string | null;
  attachments?: { file_id: string; url: string; original_name: string }[];
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
  onUnreadCountChange?: (count: number) => void;
};

export default function EmployeeCommunity({
  expanded = false,
  feedMode = false,
  onUnreadCountChange,
}: EmployeeCommunityProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [filter, setFilter] = useState<'all' | 'unread' | 'required' | 'urgent'>('all');
  const [searchQ, setSearchQ] = useState('');
  const [relatedAreaFilter, setRelatedAreaFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [confirmedOnly, setConfirmedOnly] = useState(false);
  const [modalPost, setModalPost] = useState<CommunityPost | null>(null);
  const [directoryCardUserId, setDirectoryCardUserId] = useState<string | null>(null);
  const [commentDraftHtml, setCommentDraftHtml] = useState('<p></p>');
  const [commentEditorSeq, setCommentEditorSeq] = useState(0);
  const commentEditorRef = useRef<Editor | null>(null);
  const replyInlineEditorRef = useRef<Editor | null>(null);
  const [replyParentId, setReplyParentId] = useState<string | null>(null);
  const [replyDraftHtml, setReplyDraftHtml] = useState('<p></p>');
  const [replyInlineEditorSeq, setReplyInlineEditorSeq] = useState(0);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editDraftHtml, setEditDraftHtml] = useState('<p></p>');
  const [editEditorSeq, setEditEditorSeq] = useState(0);
  const editCommentEditorRef = useRef<Editor | null>(null);
  const [activePostPanel, setActivePostPanel] = useState<'comments' | 'attachments' | null>(null);
  const commentsPanelScrollRef = useRef<HTMLDivElement>(null);
  const attachmentsPanelScrollRef = useRef<HTMLDivElement>(null);
  const prefersReducedMotion = useReducedMotion();
  const [visiblePostsCount, setVisiblePostsCount] = useState(feedMode ? 3 : Infinity);
  const feedContainerRef = useRef<HTMLDivElement>(null);
  const deepLinkHandled = useRef<string | null>(null);
  const lastCommentResetKey = useRef<string>('__init__');

  useEffect(() => {
    const key = modalPost?.id ? String(modalPost.id) : '';
    if (key === lastCommentResetKey.current) return;
    lastCommentResetKey.current = key;
    setCommentDraftHtml('<p></p>');
    setCommentEditorSeq(0);
    commentEditorRef.current = null;
    setReplyParentId(null);
    setReplyDraftHtml('<p></p>');
    setReplyInlineEditorSeq((s) => s + 1);
    replyInlineEditorRef.current = null;
    setEditingCommentId(null);
    setEditDraftHtml('<p></p>');
    setEditEditorSeq((s) => s + 1);
    editCommentEditorRef.current = null;
  }, [modalPost?.id]);

  useEffect(() => {
    if (!modalPost || !activePostPanel) return;
    const snapTop = () => {
      if (activePostPanel === 'comments') {
        commentsPanelScrollRef.current?.scrollTo({ top: 0, behavior: 'auto' });
      }
      if (activePostPanel === 'attachments') {
        attachmentsPanelScrollRef.current?.scrollTo({ top: 0, behavior: 'auto' });
      }
    };
    requestAnimationFrame(() => requestAnimationFrame(snapTop));
  }, [modalPost?.id, activePostPanel]);

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
  const confirm = useConfirm();

  const { data: currentUser } = useQuery({
    queryKey: ['auth-me'],
    queryFn: () => api<{ id?: string }>('GET', '/auth/me'),
    staleTime: 60_000,
  });

  const isOwnComment = (c: Comment) =>
    Boolean(currentUser?.id && String(c.user_id) === String(currentUser.id));

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
      setCommentDraftHtml('<p></p>');
      setCommentEditorSeq((s) => s + 1);
      setReplyParentId(null);
      setReplyDraftHtml('<p></p>');
      setReplyInlineEditorSeq((s) => s + 1);
      replyInlineEditorRef.current = null;
      refetchComments();
      queryClient.invalidateQueries({ queryKey: ['community-posts'] });
      if (modalPost) {
        setModalPost({ ...modalPost, comments_count: data.comments_count });
      }
      setTimeout(() => {
        const el = commentsPanelScrollRef.current;
        if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
      }, 120);
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.detail || 'Failed to create comment');
    },
  });

  const updateCommentMutation = useMutation({
    mutationFn: ({
      postId,
      commentId,
      content,
      mentions,
    }: {
      postId: string;
      commentId: string;
      content: string;
      mentions?: { entity_type: string; entity_id: string }[];
    }) =>
      api<{ comments_count?: number }>('PATCH', `/community/posts/${postId}/comments/${commentId}`, {
        content,
        mentions: mentions?.length ? mentions : [],
      }),
    onSuccess: (data: any) => {
      setEditingCommentId(null);
      setEditDraftHtml('<p></p>');
      setEditEditorSeq((s) => s + 1);
      editCommentEditorRef.current = null;
      refetchComments();
      queryClient.invalidateQueries({ queryKey: ['community-posts'] });
      if (modalPost && typeof data?.comments_count === 'number') {
        setModalPost({ ...modalPost, comments_count: data.comments_count });
      }
      toast.success('Comment updated');
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.detail || 'Failed to update comment');
    },
  });

  const deleteCommentMutation = useMutation({
    mutationFn: ({ postId, commentId }: { postId: string; commentId: string }) =>
      api<{ comments_count: number }>('DELETE', `/community/posts/${postId}/comments/${commentId}`),
    onSuccess: (data) => {
      setEditingCommentId(null);
      setEditDraftHtml('<p></p>');
      setEditEditorSeq((s) => s + 1);
      editCommentEditorRef.current = null;
      setReplyParentId(null);
      setReplyDraftHtml('<p></p>');
      setReplyInlineEditorSeq((s) => s + 1);
      replyInlineEditorRef.current = null;
      refetchComments();
      queryClient.invalidateQueries({ queryKey: ['community-posts'] });
      if (modalPost) {
        setModalPost({ ...modalPost, comments_count: data.comments_count });
      }
      toast.success('Comment deleted');
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.detail || 'Failed to delete comment');
    },
  });

  const commentThreadBusy =
    createCommentMutation.isLoading || updateCommentMutation.isLoading || deleteCommentMutation.isLoading;

  const confirmDeleteComment = async (commentId: string) => {
    if (!modalPost) return;
    const result = await confirm({
      title: 'Delete comment',
      message:
        'Delete this comment? Any replies under it will be removed. This cannot be undone.',
      confirmText: 'Delete',
      cancelText: 'Cancel',
    });
    if (result !== 'confirm') return;
    deleteCommentMutation.mutate({ postId: modalPost.id, commentId });
  };

  const handleOpenModal = (post: CommunityPost, focusComments = false) => {
    setModalPost(post);
    setActivePostPanel(focusComments ? 'comments' : null);
    // Mark post as viewed when modal is opened
    markViewedMutation.mutate(post.id);
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
      setActivePostPanel('comments');
    }
  };

  const handleSubmitComment = (e: React.FormEvent) => {
    e.preventDefault();
    const ed = commentEditorRef.current;
    if (!modalPost || !ed || replyParentId) return;
    const content = sanitizeCommunityPostHtml(ed.getHTML());
    if (isCommunityEditorHtmlEmpty(content)) return;
    const mentions = extractMentionsFromEditor(ed);
    createCommentMutation.mutate({
      postId: modalPost.id,
      content,
      parent_comment_id: undefined,
      mentions: mentions.length ? mentions : undefined,
    });
  };

  const handleSubmitInlineReply = (e: React.FormEvent) => {
    e.preventDefault();
    const ed = replyInlineEditorRef.current;
    if (!modalPost || !ed || !replyParentId) return;
    const content = sanitizeCommunityPostHtml(ed.getHTML());
    if (isCommunityEditorHtmlEmpty(content)) return;
    const mentions = extractMentionsFromEditor(ed);
    createCommentMutation.mutate({
      postId: modalPost.id,
      content,
      parent_comment_id: replyParentId,
      mentions: mentions.length ? mentions : undefined,
    });
  };

  const commentSubmitDisabled =
    !!replyParentId ||
    isCommunityEditorHtmlEmpty(sanitizeCommunityPostHtml(commentDraftHtml)) ||
    commentThreadBusy;

  const replyInlineSubmitDisabled =
    !replyParentId ||
    isCommunityEditorHtmlEmpty(sanitizeCommunityPostHtml(replyDraftHtml)) ||
    commentThreadBusy;

  const editCommentSubmitDisabled =
    !editingCommentId ||
    isCommunityEditorHtmlEmpty(sanitizeCommunityPostHtml(editDraftHtml)) ||
    commentThreadBusy;

  const handleSaveCommentEdit = (e: React.FormEvent) => {
    e.preventDefault();
    const ed = editCommentEditorRef.current;
    if (!modalPost || !editingCommentId || !ed) return;
    const content = sanitizeCommunityPostHtml(ed.getHTML());
    if (isCommunityEditorHtmlEmpty(content)) return;
    const mentions = extractMentionsFromEditor(ed);
    updateCommentMutation.mutate({
      postId: modalPost.id,
      commentId: editingCommentId,
      content,
      mentions: mentions.length ? mentions : undefined,
    });
  };

  const cancelCommentEdit = () => {
    setEditingCommentId(null);
    setEditDraftHtml('<p></p>');
    setEditEditorSeq((s) => s + 1);
    editCommentEditorRef.current = null;
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

  const unreadCount = useMemo(
    () => (Array.isArray(posts) ? posts.filter((p: CommunityPost) => p.is_unread).length : 0),
    [posts]
  );

  useEffect(() => {
    onUnreadCountChange?.(unreadCount);
  }, [unreadCount, onUnreadCountChange]);

  const hasActiveRefinements = Boolean(searchQ.trim() || relatedAreaFilter || priorityFilter || confirmedOnly);

  const clearRefinements = () => {
    setSearchQ('');
    setRelatedAreaFilter('');
    setPriorityFilter('');
    setConfirmedOnly(false);
  };

  const areaSelectOptions = useMemo(
    () => Object.entries(AREA_LABELS).map(([k, lab]) => ({ value: k, label: lab })),
    [],
  );
  const prioritySelectOptions = useMemo(
    () => [
      { value: 'normal', label: 'Normal' },
      { value: 'important', label: 'Important' },
      { value: 'urgent', label: 'Urgent' },
      { value: 'critical', label: 'Critical' },
    ],
    [],
  );

  return (
    <div
      className={uiCx(
        'flex min-w-0 flex-col',
        feedMode || expanded ? 'h-full min-h-0' : '',
        !feedMode && !expanded ? uiCx(uiRadius.card, uiBorders.subtle, uiColors.surface, uiSpacing.cardPadding) : '',
      )}
    >
      {!feedMode ? (
        <header className="mb-4 flex shrink-0 items-start justify-between gap-3">
          <div>
            <h3 className={uiTypography.sectionTitle}>Employee Community</h3>
            <p className={uiTypography.sectionSubtitle}>Company updates and required communications.</p>
          </div>
          <div className={uiCx(uiRadius.control, uiBorders.subtle, uiColors.surfaceSubtle, 'px-2.5 py-1 text-right')}>
            <div className={uiTypography.overline}>Unread</div>
            <div className={uiTypography.sectionTitle}>{unreadCount}</div>
          </div>
        </header>
      ) : null}

      <div
        className={uiCx(
          'mb-3 shrink-0',
          uiRadius.control,
          uiBorders.subtle,
          uiColors.surfaceSubtle,
          uiSpacing.compactCardPadding,
          uiSpacing.sectionStack,
        )}
      >
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
          <AppInput
            type="search"
            placeholder="Search title or content..."
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
            leftIcon={<Search className="h-4 w-4" />}
            className="min-w-[200px] flex-1"
          />
          <AppTabs
            className="shrink-0"
            tabs={[
              { key: 'all', label: 'All' },
              { key: 'unread', label: 'Unread' },
              { key: 'urgent', label: 'Urgent' },
              { key: 'required', label: 'Required' },
            ]}
            value={filter}
            onChange={(key) => setFilter(key as typeof filter)}
          />
        </div>

        <div className="flex flex-col gap-2 md:flex-row md:flex-wrap md:items-end">
          <AppSelect
            value={relatedAreaFilter}
            onChange={(e) => setRelatedAreaFilter(e.target.value)}
            options={areaSelectOptions}
            placeholder="All areas"
            className="min-w-[170px] flex-1"
          />
          <AppSelect
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            options={prioritySelectOptions}
            placeholder="All priorities"
            className="min-w-[170px] flex-1"
          />
          <AppButton
            type="button"
            size="sm"
            variant={confirmedOnly ? 'primary' : 'secondary'}
            onClick={() => setConfirmedOnly((v) => !v)}
          >
            Confirmed by me
          </AppButton>
          {hasActiveRefinements ? (
            <AppButton type="button" size="sm" variant="ghost" className="md:ml-auto" onClick={clearRefinements}>
              Clear filters
            </AppButton>
          ) : null}
        </div>
      </div>

      <div
        ref={feedContainerRef}
        className={uiCx(
          uiSpacing.sectionStack,
          'min-h-0 overflow-y-auto pt-1',
          expanded || feedMode ? 'flex-1' : '',
        )}
        style={feedMode ? {} : !expanded ? { maxHeight: '600px', height: '600px' } : { maxHeight: '100%' }}
      >
        {filteredPosts.length === 0 ? (
          <AppEmptyState
            title={posts.length === 0 ? 'No posts yet' : `No ${filter} posts`}
            className="py-8"
          />
        ) : (
          filteredPosts.map((post) => (
            <CommunityFeedPostSnippet
              key={post.id}
              post={post}
              feedMode={feedMode}
              interactive
              onCardClick={(e) => {
                e.stopPropagation();
                handleOpenModal(post);
              }}
              onAuthorButtonClick={(e) => {
                e.stopPropagation();
                if (post.author_id) setDirectoryCardUserId(post.author_id);
              }}
              onLikeClick={(e) => handleLike(e, post)}
              onCommentClick={(e) => handleCommentClick(e, post)}
              onOpenClick={
                feedMode
                  ? (e) => {
                      e.stopPropagation();
                      handleOpenModal(post);
                    }
                  : undefined
              }
            />
          ))
        )}
      </div>

      {/* Post Detail Modal */}
      {modalPost && (() => {
        const atts =
          Array.isArray(modalPost.attachments) && modalPost.attachments.length > 0
            ? modalPost.attachments
            : modalPost.document_url
              ? [
                  {
                    file_id: modalPost.document_file_id || '',
                    url: modalPost.document_url,
                    original_name: modalPost.document_original_name || 'Attachment',
                  },
                ]
              : [];
        const audienceLabel =
          modalPost.target_type === 'all'
            ? 'Everyone'
            : modalPost.target_type === 'users'
              ? 'Selected employees'
              : 'Division audience';
        const priorityLabel =
          modalPost.priority && modalPost.priority !== 'normal'
            ? modalPost.priority.charAt(0).toUpperCase() + modalPost.priority.slice(1)
            : null;
        const togglePanel = (panel: 'comments' | 'attachments') => {
          setActivePostPanel((current) => (current === panel ? null : panel));
        };

        const dockTransition = prefersReducedMotion
          ? { duration: 0 }
          : { duration: 0.34, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] };
        const dockInnerTransition = prefersReducedMotion
          ? { duration: 0 }
          : { duration: 0.3, ease: [0.22, 1, 0.36, 1] as [number, number, number, number], delay: 0.04 };
        const closeModal = () => {
          setModalPost(null);
          setDirectoryCardUserId(null);
          setCommentDraftHtml('<p></p>');
          setCommentEditorSeq((s) => s + 1);
          setReplyParentId(null);
          setReplyDraftHtml('<p></p>');
          setReplyInlineEditorSeq((s) => s + 1);
          setActivePostPanel(null);
          commentEditorRef.current = null;
          replyInlineEditorRef.current = null;
          setEditingCommentId(null);
          setEditDraftHtml('<p></p>');
          setEditEditorSeq((s) => s + 1);
          editCommentEditorRef.current = null;
        };

        return (
          <OverlayPortal>
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm"
              onClick={closeModal}
            >
              <div
                className="flex h-[min(92dvh,920px)] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
              >
                <div className="shrink-0 border-b border-slate-200 bg-white px-5 py-4">
                  <div className="flex items-start gap-3">
                    <button
                      type="button"
                      className="h-11 w-11 shrink-0 rounded-full bg-slate-100 flex items-center justify-center overflow-hidden ring-offset-2 hover:ring-2 hover:ring-[#7f1010]/35 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7f1010]/45"
                      onClick={() => modalPost.author_id && setDirectoryCardUserId(modalPost.author_id)}
                      aria-label={`View profile: ${modalPost.author_name || 'Author'}`}
                    >
                      {modalPost.author_avatar ? (
                        <img
                          src={withFileAccessTokenIfNeeded(modalPost.author_avatar)}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <span className="text-sm font-semibold text-slate-500">
                          {(modalPost.author_name || 'U')[0].toUpperCase()}
                        </span>
                      )}
                    </button>
                    <div className="min-w-0 flex-1">
                      <h3 className="line-clamp-2 text-lg font-semibold leading-snug text-slate-950">
                        {modalPost.title}
                      </h3>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                        <button
                          type="button"
                          className="font-semibold text-slate-700 hover:text-[#7f1010] hover:underline"
                          onClick={() => modalPost.author_id && setDirectoryCardUserId(modalPost.author_id)}
                        >
                          {modalPost.author_name || 'Unknown'}
                        </button>
                        <span>{formatTimeAgo(modalPost.created_at)}</span>
                        {modalPost.related_area && (
                          <span className="rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-medium text-slate-600">
                            {AREA_LABELS[modalPost.related_area] || modalPost.related_area}
                          </span>
                        )}
                        <span className="rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-medium text-slate-600">
                          {audienceLabel}
                        </span>
                        {priorityLabel && (
                          <span className="rounded-md border border-red-100 bg-red-50 px-1.5 py-0.5 font-semibold text-red-700">
                            {priorityLabel}
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={closeModal}
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                      aria-label="Close post"
                    >
                      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>

                <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white">
                  <motion.div
                    layout
                    transition={{ layout: dockTransition }}
                    className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pt-2 pb-4"
                  >
                    <div className="min-h-full text-sm leading-relaxed text-slate-900">
                      <CommunityPostBody html={modalPost.content} />
                    </div>
                  </motion.div>

                  <AnimatePresence mode="wait" initial={false}>
                    {activePostPanel === 'attachments' && atts.length > 0 && (
                      <motion.div
                        key={`dock-att-${modalPost.id}`}
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={dockTransition}
                        className="shrink-0 overflow-hidden border-t border-slate-100 bg-white"
                      >
                        <motion.div
                          initial={{ y: 18, opacity: 0.88 }}
                          animate={{ y: 0, opacity: 1 }}
                          exit={{ y: 12, opacity: 0 }}
                          transition={dockInnerTransition}
                          ref={attachmentsPanelScrollRef}
                          className="max-h-[min(48dvh,520px)] overflow-y-auto overscroll-contain px-5 pb-4 pt-4"
                        >
                          <section aria-label="Attachments">
                            <div className="mb-3 flex items-center justify-between gap-3">
                              <h4 className="text-sm font-semibold text-slate-950">Attachments</h4>
                              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                                {atts.length}
                              </span>
                            </div>
                            <div className="space-y-2">
                              {atts.map((att) => (
                                <a
                                  key={att.file_id || att.url}
                                  href={withFileAccessTokenIfNeeded(att.url)}
                                  download={att.original_name || undefined}
                                  className="group flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2.5 transition hover:border-slate-300 hover:bg-slate-50"
                                >
                                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-slate-500 ring-1 ring-slate-200">
                                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7V5a2 2 0 012-2h5l5 5v11a2 2 0 01-2 2H9a2 2 0 01-2-2v-2" />
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 3v6h6M5 12h8m0 0l-3-3m3 3l-3 3" />
                                    </svg>
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <div className="truncate text-sm font-medium text-slate-800">
                                      {att.original_name || 'Attachment'}
                                    </div>
                                    <div className="text-xs font-medium text-slate-500 group-hover:text-[#7f1010]">
                                      Download
                                    </div>
                                  </div>
                                </a>
                              ))}
                            </div>
                          </section>
                        </motion.div>
                      </motion.div>
                    )}

                    {activePostPanel === 'comments' && (
                      <motion.div
                        key={`dock-com-${modalPost.id}`}
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={dockTransition}
                        className="shrink-0 overflow-hidden border-t border-slate-100 bg-white"
                      >
                        <motion.div
                          initial={{ y: 18, opacity: 0.88 }}
                          animate={{ y: 0, opacity: 1 }}
                          exit={{ y: 12, opacity: 0 }}
                          transition={dockInnerTransition}
                          ref={commentsPanelScrollRef}
                          className="max-h-[min(48dvh,520px)] overflow-y-auto overscroll-contain px-5 pb-4 pt-4"
                        >
                          <section aria-labelledby={`discussion-${modalPost.id}`}>
                            <div className="rounded-xl bg-slate-50/60 px-3 py-4 ring-1 ring-slate-100/80 sm:px-4">
                              <div className="mb-4 flex items-center justify-between gap-3">
                                <div>
                                  <h3 id={`discussion-${modalPost.id}`} className="text-sm font-semibold text-slate-950">
                                    Discussion
                                  </h3>
                                  <p className="text-xs text-slate-500">
                                    {comments.length} {comments.length === 1 ? 'comment' : 'comments'}
                                  </p>
                                </div>
                              </div>

                              {comments.length === 0 ? (
                                <div className="rounded-xl border border-dashed border-slate-200 bg-white/80 px-4 py-8 text-center">
                                  <p className="text-sm font-medium text-slate-700">No comments yet</p>
                                  <p className="mt-1 text-xs text-slate-500">Start the conversation below.</p>
                                </div>
                              ) : (
                                <div className="space-y-3">
                                  {comments.map((comment: Comment) => (
                                    <div
                                      key={comment.id}
                                      className={`flex gap-2.5 ${comment.parent_comment_id ? 'ml-6 border-l border-slate-200 pl-3' : ''}`}
                                    >
                                      <button
                                        type="button"
                                        className="h-8 w-8 shrink-0 rounded-full bg-slate-100 flex items-center justify-center overflow-hidden ring-offset-2 hover:ring-2 hover:ring-[#7f1010]/35 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7f1010]/45"
                                        onClick={() => comment.user_id && setDirectoryCardUserId(comment.user_id)}
                                        aria-label={`View profile: ${comment.user_name || 'Commenter'}`}
                                      >
                                        {comment.user_avatar ? (
                                          <img
                                            src={withFileAccessTokenIfNeeded(comment.user_avatar)}
                                            alt=""
                                            className="h-full w-full object-cover"
                                          />
                                        ) : (
                                          <span className="text-xs font-semibold text-slate-500">
                                            {(comment.user_name || 'U')[0].toUpperCase()}
                                          </span>
                                        )}
                                      </button>
                                      <div className="min-w-0 flex-1 space-y-2">
                                        <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-sm">
                                          <div className="mb-1 flex flex-wrap items-center gap-2">
                                            <button
                                              type="button"
                                              className="text-left text-sm font-semibold text-slate-900 hover:text-[#7f1010] hover:underline"
                                              onClick={() => comment.user_id && setDirectoryCardUserId(comment.user_id)}
                                            >
                                              {comment.user_name || 'Unknown'}
                                            </button>
                                            <span className="text-xs text-slate-400">{formatTimeAgo(comment.created_at)}</span>
                                            {comment.updated_at &&
                                              comment.created_at &&
                                              new Date(comment.updated_at).getTime() >
                                                new Date(comment.created_at).getTime() + 500 && (
                                                <span className="text-xs font-medium text-slate-400">Edited</span>
                                              )}
                                          </div>

                                          {editingCommentId === comment.id ? (
                                            <form onSubmit={handleSaveCommentEdit} className="space-y-2">
                                              <CommunityCommentRichTextEditor
                                                editorKey={`${modalPost.id}-edit-${comment.id}-${editEditorSeq}`}
                                                initialHtml={editDraftHtml}
                                                onChangeHtml={setEditDraftHtml}
                                                onEditorReady={(ed) => {
                                                  editCommentEditorRef.current = ed;
                                                }}
                                                placeholder="Edit comment…"
                                                className="border-slate-300"
                                              />
                                              <div className="flex flex-wrap gap-2">
                                                <button
                                                  type="submit"
                                                  disabled={editCommentSubmitDisabled}
                                                  className="inline-flex h-9 items-center justify-center rounded-lg bg-gradient-to-r from-[#7f1010] to-[#a31414] px-4 text-xs font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                                                >
                                                  {updateCommentMutation.isLoading ? 'Saving…' : 'Save'}
                                                </button>
                                                <button
                                                  type="button"
                                                  disabled={commentThreadBusy}
                                                  onClick={cancelCommentEdit}
                                                  className="inline-flex h-9 items-center justify-center rounded-lg border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                                                >
                                                  Cancel
                                                </button>
                                              </div>
                                            </form>
                                          ) : (
                                            <>
                                              <CommunityPostBody
                                                html={comment.content}
                                                className="text-sm text-slate-800 leading-relaxed"
                                              />
                                              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
                                                {isOwnComment(comment) && (
                                                  <>
                                                    <button
                                                      type="button"
                                                      className="text-xs font-semibold text-slate-500 hover:text-[#7f1010]"
                                                      onClick={() => {
                                                        setEditingCommentId(comment.id);
                                                        setEditDraftHtml(comment.content);
                                                        setEditEditorSeq((s) => s + 1);
                                                        editCommentEditorRef.current = null;
                                                        if (replyParentId === comment.id) {
                                                          setReplyParentId(null);
                                                          setReplyDraftHtml('<p></p>');
                                                          setReplyInlineEditorSeq((s) => s + 1);
                                                          replyInlineEditorRef.current = null;
                                                        }
                                                      }}
                                                    >
                                                      Edit
                                                    </button>
                                                    <button
                                                      type="button"
                                                      className="text-xs font-semibold text-slate-500 hover:text-red-600"
                                                      disabled={commentThreadBusy}
                                                      onClick={() => void confirmDeleteComment(comment.id)}
                                                    >
                                                      Delete
                                                    </button>
                                                  </>
                                                )}
                                                <button
                                                  type="button"
                                                  className={`text-xs font-semibold hover:text-[#7f1010] ${
                                                    replyParentId === comment.id ? 'text-[#7f1010]' : 'text-slate-500'
                                                  }`}
                                                  aria-expanded={replyParentId === comment.id}
                                                  onClick={() => {
                                                    if (replyParentId === comment.id) {
                                                      setReplyParentId(null);
                                                      setReplyDraftHtml('<p></p>');
                                                      setReplyInlineEditorSeq((s) => s + 1);
                                                      replyInlineEditorRef.current = null;
                                                    } else {
                                                      cancelCommentEdit();
                                                      setReplyParentId(comment.id);
                                                      setReplyDraftHtml('<p></p>');
                                                      setReplyInlineEditorSeq((s) => s + 1);
                                                    }
                                                  }}
                                                >
                                                  Reply
                                                </button>
                                              </div>
                                            </>
                                          )}
                                        </div>

                                        {replyParentId === comment.id && editingCommentId !== comment.id && (
                                          <form
                                            onSubmit={handleSubmitInlineReply}
                                            className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-sm ring-1 ring-slate-100/80"
                                          >
                                            <div className="mb-2 flex items-center justify-between gap-2">
                                              <span className="text-xs text-slate-600">
                                                Replying to{' '}
                                                <span className="font-semibold text-slate-900">
                                                  {comment.user_name || 'Unknown'}
                                                </span>
                                              </span>
                                              <button
                                                type="button"
                                                className="text-xs font-semibold text-slate-500 hover:text-[#7f1010]"
                                                onClick={() => {
                                                  setReplyParentId(null);
                                                  setReplyDraftHtml('<p></p>');
                                                  setReplyInlineEditorSeq((s) => s + 1);
                                                  replyInlineEditorRef.current = null;
                                                }}
                                              >
                                                Cancel
                                              </button>
                                            </div>
                                            <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
                                              <div className="min-w-0 flex-1">
                                                <CommunityCommentRichTextEditor
                                                  editorKey={`${modalPost.id}-reply-${replyParentId}-${replyInlineEditorSeq}`}
                                                  initialHtml={replyDraftHtml}
                                                  onChangeHtml={setReplyDraftHtml}
                                                  onEditorReady={(ed) => {
                                                    replyInlineEditorRef.current = ed;
                                                  }}
                                                  placeholder={`Reply to ${comment.user_name || 'comment'}…`}
                                                  className="border-slate-300"
                                                />
                                              </div>
                                              <button
                                                type="submit"
                                                disabled={replyInlineSubmitDisabled}
                                                className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-[#7f1010] to-[#a31414] px-4 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                                              >
                                                <span>{createCommentMutation.isLoading ? 'Posting…' : 'Post'}</span>
                                              </button>
                                            </div>
                                          </form>
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}

                              {!replyParentId && (
                                <div className="mt-4 border-t border-slate-200/80 pt-4">
                                  <form onSubmit={handleSubmitComment} className="flex flex-col gap-3 sm:flex-row sm:items-start">
                                    <div className="min-w-0 flex-1">
                                      <CommunityCommentRichTextEditor
                                        editorKey={`${modalPost.id}-c-${commentEditorSeq}`}
                                        initialHtml={commentDraftHtml}
                                        onChangeHtml={setCommentDraftHtml}
                                        onEditorReady={(ed) => {
                                          commentEditorRef.current = ed;
                                        }}
                                        placeholder="Add comment... Type @ to mention someone"
                                        className="border-slate-300"
                                      />
                                    </div>
                                    <button
                                      type="submit"
                                      disabled={commentSubmitDisabled}
                                      className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-[#7f1010] to-[#a31414] px-5 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                      <span>{createCommentMutation.isLoading ? 'Posting...' : 'Post'}</span>
                                      {!createCommentMutation.isLoading && (
                                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                                        </svg>
                                      )}
                                    </button>
                                  </form>
                                </div>
                              )}
                            </div>
                          </section>
                        </motion.div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <div className="shrink-0 border-t border-slate-100 bg-white px-5 pb-6 pt-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => likeMutation.mutate(modalPost.id)}
                        className={`inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm font-semibold transition ${
                          modalPost.user_has_liked
                            ? 'bg-red-50 text-red-600'
                            : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                        }`}
                        aria-label="Like post"
                      >
                        {modalPost.user_has_liked ? (
                          <svg className="h-5 w-5 fill-current" viewBox="0 0 24 24">
                            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                          </svg>
                        ) : (
                          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                          </svg>
                        )}
                        <span>{modalPost.likes_count || 0}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => togglePanel('comments')}
                        className={`inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm font-semibold transition ${
                          activePostPanel === 'comments'
                            ? 'bg-slate-900 text-white'
                            : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                        }`}
                        aria-expanded={activePostPanel === 'comments'}
                      >
                        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h8m-8 4h5m8 5l-3.5-3.5A9 9 0 1112 3a9 9 0 019 9 8.97 8.97 0 01-1.5 5z" />
                        </svg>
                        <span>{comments.length}</span>
                      </button>

                      {atts.length > 0 && (
                        <button
                          type="button"
                          onClick={() => togglePanel('attachments')}
                          className={`inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm font-semibold transition ${
                            activePostPanel === 'attachments'
                              ? 'bg-slate-900 text-white'
                              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                          }`}
                          aria-expanded={activePostPanel === 'attachments'}
                        >
                          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.586-6.586a4 4 0 00-5.657-5.657L5.757 10.757a6 6 0 108.486 8.486L20 13.486" />
                          </svg>
                          <span>{atts.length}</span>
                        </button>
                      )}
                    </div>

                    {modalPost.requires_read_confirmation && (
                      <div className="mt-3">
                        {modalPost.user_has_confirmed ? (
                          <div className="inline-flex items-center gap-2 rounded-full border border-green-200 bg-green-50 px-3 py-1.5 text-xs font-semibold text-green-700">
                            <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                            Read confirmed
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => confirmReadMutation.mutate(modalPost.id)}
                            disabled={confirmReadMutation.isLoading}
                            className="rounded-full bg-gradient-to-r from-[#7f1010] to-[#a31414] px-4 py-2 text-xs font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {confirmReadMutation.isLoading ? 'Confirming...' : 'Confirm I have read this'}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </OverlayPortal>
        );
      })()}

      <CommunityDirectoryUserPeekModal
        userId={directoryCardUserId}
        onClose={() => setDirectoryCardUserId(null)}
      />
    </div>
  );
}

