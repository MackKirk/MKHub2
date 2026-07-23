import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api, withFileAccessToken } from '@/lib/api';
import { sortByLabel } from '@/lib/sortOptions';
import OverlayPortal from '@/components/OverlayPortal';
import { useNavigate, useLocation } from 'react-router-dom';
import { FileText } from 'lucide-react';
import {
  AppBadge,
  AppButton,
  AppCard,
  AppEmptyState,
  AppDatePicker,
  AppInput,
  AppListCreateItem,
  AppControlLabelRow,
  AppFieldHint,
  AppFormModal,
  AppSelect,
  AppModal,
  AppPageHeader,
  AppProjectSelect,
  AppUserSelect,
  AppTabs,
  AppTextarea,
  uiBorders,
  uiColors,
  uiCx,
  uiLayout,
  uiRadius,
  uiShadows,
  uiSpacing,
  uiTypography,
} from '@/components/ui';

type TaskRequestMessage = {
  id: string;
  sender_id?: string | null;
  sender_name?: string | null;
  message_type: string;
  body: string;
  created_at: string;
};

type TaskRequest = {
  id: string;
  title: string;
  description?: string;
  status: string;
  status_label: string;
  priority: string;
  due_date?: string | null;
  requested_by: { id?: string | null; name?: string | null };
  target: {
    type: 'user' | 'division';
    user_id?: string | null;
    user_name?: string | null;
    division_id?: string | null;
    division_label?: string | null;
  };
  project?: { id?: string | null; name?: string | null; code?: string | null } | null;
  created_at: string;
  updated_at: string;
  accepted_task_id?: string | null;
  messages?: TaskRequestMessage[];
  task?: { id: string; status: string; title: string } | null;
  permissions: {
    can_request_info: boolean;
    can_accept: boolean;
    can_refuse: boolean;
    can_provide_info: boolean;
  };
};

type TaskRequestListResponse = {
  sent: TaskRequest[];
  received: TaskRequest[];
};

type UserOption = { id: string; name?: string; username?: string };
type DivisionOption = { id: string; label: string };
type ProjectOption = { id: string; name: string; code?: string };

type TaskRequestBadgeVariant = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

function getStatusBadgeConfig(status: string): { variant: TaskRequestBadgeVariant; label: string } {
  if (status === 'new') return { variant: 'info', label: 'New' };
  if (status === 'needs_info') return { variant: 'warning', label: 'Awaiting Info' };
  if (status === 'accepted') return { variant: 'success', label: 'Completed' };
  if (status === 'refused') return { variant: 'danger', label: 'Rejected' };
  return { variant: 'neutral', label: status };
}

function getPriorityBadgeVariant(priority: string): TaskRequestBadgeVariant {
  if (priority === 'urgent') return 'danger';
  if (priority === 'high') return 'warning';
  if (priority === 'normal') return 'info';
  return 'neutral';
}

const requestTabItems = [
  { key: 'all', label: 'All' },
  { key: 'received', label: 'Received' },
  { key: 'sent', label: 'Sent' },
  { key: 'needs_info', label: 'Awaiting Info' },
  { key: 'completed', label: 'Completed' },
] as const;

const priorityOptions = [
  { value: 'low', label: 'Low' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
];

/** One request row in the left list (p-4 + title/badge + meta + time). */
const REQUEST_LIST_ROW_HEIGHT_REM = 5.75;
const REQUEST_LIST_VISIBLE_ROWS = 6;
const requestListScrollMaxHeight = `calc(${REQUEST_LIST_ROW_HEIGHT_REM}rem * ${REQUEST_LIST_VISIBLE_ROWS})`;

/** Same request can appear in both sent and received lists from the API; keep one row per id. */
function dedupeRequestsById(requests: TaskRequest[]): TaskRequest[] {
  const seen = new Set<string>();
  return requests.filter((r) => {
    if (seen.has(r.id)) return false;
    seen.add(r.id);
    return true;
  });
}

export default function TaskRequestsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const fromHome = location.state?.fromHome === true;
  const deepLinkRequestId = (location.state as any)?.requestId as string | undefined;
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['task-requests'],
    queryFn: () => api<TaskRequestListResponse>('GET', '/task-requests'),
  });
  const [activeTab, setActiveTab] = useState<'all' | 'received' | 'sent' | 'needs_info' | 'completed'>('all');
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [viewModalRequestId, setViewModalRequestId] = useState<string | null>(null);

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['task-requests'] });
  };

  // Calculate notification metrics
  const notifications = useMemo(() => {
    const received = data?.received || [];
    const sent = data?.sent || [];

    // Separate active (in process) and history (accepted/refused)
    const activeReceived = received.filter((r) => r.status !== 'accepted' && r.status !== 'refused');
    const activeSent = sent.filter((r) => r.status !== 'accepted' && r.status !== 'refused');
    const historyReceived = received.filter((r) => r.status === 'accepted' || r.status === 'refused');
    const historySent = sent.filter((r) => r.status === 'accepted' || r.status === 'refused');

    const newReceived = activeReceived.filter((r) => r.status === 'new').length;
    const needsInfoSent = activeSent.filter((r) => r.status === 'needs_info').length;
    const acceptedSent = historySent.filter((r) => r.status === 'accepted').length;
    const refusedSent = historySent.filter((r) => r.status === 'refused').length;
    
    // Total counts for active requests only
    const totalActiveReceived = activeReceived.length;
    const totalActiveSent = activeSent.length;

    // Get all recent activity (including history for activity feed)
    const recentActivity = dedupeRequestsById([...received, ...sent]).sort((a, b) => {
      const aTime = new Date(b.updated_at || b.created_at).getTime();
      const bTime = new Date(a.updated_at || a.created_at).getTime();
      return aTime - bTime;
    });

    return {
      newReceived,
      needsInfoSent,
      acceptedSent,
      refusedSent,
      totalActiveReceived,
      totalActiveSent,
      totalHistoryReceived: historyReceived.length,
      totalHistorySent: historySent.length,
      recentActivity,
    };
  }, [data]);

  // Filter requests based on active tab
  const filteredRequests = useMemo(() => {
    const received = data?.received || [];
    const sent = data?.sent || [];
    
    if (activeTab === 'all') {
      return dedupeRequestsById(notifications.recentActivity);
    }
    if (activeTab === 'received') {
      return received.sort((a, b) => {
        const aTime = new Date(b.updated_at || b.created_at).getTime();
        const bTime = new Date(a.updated_at || a.created_at).getTime();
        return aTime - bTime;
      });
    }
    if (activeTab === 'sent') {
      return sent.sort((a, b) => {
        const aTime = new Date(b.updated_at || b.created_at).getTime();
        const bTime = new Date(a.updated_at || a.created_at).getTime();
        return aTime - bTime;
      });
    }
    if (activeTab === 'needs_info') {
      return dedupeRequestsById(notifications.recentActivity.filter((r) => r.status === 'needs_info'));
    }
    if (activeTab === 'completed') {
      return dedupeRequestsById(
        notifications.recentActivity.filter((r) => r.status === 'accepted' || r.status === 'refused'),
      );
    }
    return dedupeRequestsById(notifications.recentActivity);
  }, [notifications.recentActivity, activeTab, data]);

  const requestTabCounts = useMemo(() => {
    const received = data?.received || [];
    const sent = data?.sent || [];
    const all = dedupeRequestsById([...received, ...sent]);
    return {
      all: all.length,
      received: received.length,
      sent: sent.length,
      needs_info: all.filter((r) => r.status === 'needs_info').length,
      completed: all.filter((r) => r.status === 'accepted' || r.status === 'refused').length,
    };
  }, [data]);

  const requestTabs = useMemo(
    () =>
      requestTabItems.map((tab) => ({
        ...tab,
        count: requestTabCounts[tab.key],
      })),
    [requestTabCounts],
  );

  // Format relative time
  const formatTimeAgo = (dateStr: string) => {
    const now = new Date();
    const updated = new Date(dateStr);
    const diffMs = now.getTime() - updated.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return updated.toLocaleDateString();
  };

  useEffect(() => {
    if (deepLinkRequestId) {
      setSelectedRequestId(deepLinkRequestId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deepLinkRequestId]);

  // Handle request click - select in right panel; open modal on small screens only
  const handleRequestClick = (requestId: string) => {
    setSelectedRequestId(requestId);
    if (window.innerWidth < 1024) {
      setViewModalRequestId(requestId);
      setShowViewModal(true);
    } else {
      setShowViewModal(false);
      setViewModalRequestId(null);
    }
  };



  return (
    <div className={uiCx(uiSpacing.pageStack, 'min-w-0 overflow-x-hidden')}>
      <AppPageHeader
        title="Requests"
        subtitle="Conversations that may become tasks"
        icon={<FileText className="h-4 w-4" />}
      />

      <div className="grid min-h-[calc(100vh-220px)] min-w-0 grid-cols-[4fr_6fr] items-stretch gap-2">
        <AppCard className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden" bodyClassName="flex h-full min-h-0 flex-1 flex-col p-0">
          <div className="shrink-0 border-b border-gray-100">
            <div className={uiSpacing.cardPadding}>
              <AppTabs
                tabs={requestTabs}
                value={activeTab}
                onChange={(key) => setActiveTab(key as typeof activeTab)}
              />
            </div>
          </div>

          <div className={uiCx('shrink-0', uiSpacing.cardPadding)}>
            <AppListCreateItem
              label="New Request"
              layout="row"
              className="w-full"
              onClick={() => setShowCreateModal(true)}
            />
          </div>

          <div
            className="min-h-0 shrink-0 overflow-y-auto overflow-x-hidden"
            style={{ maxHeight: requestListScrollMaxHeight }}
          >
            {isLoading ? (
              <div className={uiCx(uiSpacing.cardPadding, 'text-center', uiTypography.helper)}>Loading requests...</div>
            ) : filteredRequests.length === 0 ? (
              <div className={uiCx(uiSpacing.cardPadding, 'text-center', uiTypography.helper)}>
                {activeTab === 'all'
                  ? 'No requests yet. Use New Request above to get started.'
                  : `No ${activeTab === 'needs_info' ? 'awaiting info' : activeTab} requests.`}
              </div>
            ) : (
              filteredRequests.map((req) => {
                const isReceived = data?.received?.some((r) => r.id === req.id);
                const statusConfig = getStatusBadgeConfig(req.status);
                const isSelected = selectedRequestId === req.id;

                return (
                  <button
                    key={req.id}
                    type="button"
                    onClick={() => handleRequestClick(req.id)}
                    className={uiCx(
                      'relative w-full min-h-[5.75rem] cursor-pointer text-left transition-all duration-200',
                      uiSpacing.cardPadding,
                      'border-b border-gray-100 last:border-b-0',
                      isSelected
                        ? 'z-[1] border border-brand-red bg-brand-red/5 shadow-md hover:shadow-lg'
                        : uiCx(
                            uiColors.surface,
                            'border border-transparent',
                            'hover:border-gray-300 hover:bg-gray-50/50 hover:shadow-sm hover:-translate-y-0.5 active:scale-[0.98]',
                          ),
                    )}
                  >
                    <div
                      className={uiCx(
                        'absolute bottom-0 left-0 top-0 w-0.5 rounded-l-lg',
                        isSelected ? 'bg-brand-red' : 'bg-gray-300',
                      )}
                      aria-hidden
                    />
                    <div className="flex items-start justify-between gap-3 pl-2">
                      <div className="min-w-0 flex-1">
                        <div className="mb-1 flex flex-wrap items-center gap-2">
                          <h3 className={uiTypography.sectionTitle}>{req.title}</h3>
                          <AppBadge variant={statusConfig.variant} className="shrink-0">
                            {statusConfig.label}
                          </AppBadge>
                        </div>
                        <div className={uiCx(uiTypography.helper, 'mb-1')}>
                          {isReceived ? (
                            <span>
                              From <span className="font-medium text-gray-900">{req.requested_by?.name || 'Unknown'}</span>
                            </span>
                          ) : (
                            <span>
                              To{' '}
                              <span className="font-medium text-gray-900">
                                {req.target.type === 'user'
                                  ? req.target.user_name || 'User'
                                  : req.target.division_label || 'Division'}
                              </span>
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-gray-400">{formatTimeAgo(req.updated_at || req.created_at)}</div>
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </AppCard>

        <div className="flex h-full min-h-0 min-w-0 flex-col">
          <RequestDetailsPanel
            requestId={selectedRequestId}
            onRefresh={invalidateAll}
          />
        </div>
      </div>

      {/* Create Request Modal */}
      {showCreateModal && (
        <CreateRequestModal
          onClose={() => setShowCreateModal(false)}
          onCreated={() => {
            setShowCreateModal(false);
            invalidateAll();
          }}
        />
      )}

      {/* View Request Modal */}
      {showViewModal && viewModalRequestId && (
        <ViewRequestModal
          requestId={viewModalRequestId}
          onClose={() => {
            setShowViewModal(false);
            setViewModalRequestId(null);
          }}
          onRefresh={invalidateAll}
        />
      )}
    </div>
  );
}

// Request Details Panel (Right Side)
function RequestDetailsPanel({
  requestId,
  onRefresh,
}: {
  requestId: string | null;
  onRefresh: () => void;
}) {
  const queryClient = useQueryClient();
  const { data: request, isLoading } = useQuery({
    queryKey: ['task-request', requestId],
    queryFn: () => api<TaskRequest>('GET', `/task-requests/${requestId}`),
    enabled: !!requestId,
  });

  const [infoMessage, setInfoMessage] = useState('');
  const [clarificationMessage, setClarificationMessage] = useState('');
  const [refuseMessage, setRefuseMessage] = useState('');
  const [showRefuseForm, setShowRefuseForm] = useState(false);

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['task-requests'] });
    queryClient.invalidateQueries({ queryKey: ['task-request', requestId] });
    onRefresh();
  };

  const askInfoMutation = useMutation({
    mutationFn: (message: string) =>
      api('POST', `/task-requests/${requestId}/ask-info`, { message }),
    onSuccess: () => {
      toast.success('Information request sent');
      setInfoMessage('');
      invalidateAll();
    },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Failed to request information'),
  });

  const provideInfoMutation = useMutation({
    mutationFn: (message: string) =>
      api('POST', `/task-requests/${requestId}/provide-info`, { message }),
    onSuccess: () => {
      toast.success('Clarification sent');
      setClarificationMessage('');
      invalidateAll();
    },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Failed to send clarification'),
  });

  const refuseMutation = useMutation({
    mutationFn: (message: string) =>
      api('POST', `/task-requests/${requestId}/refuse`, { message }),
    onSuccess: () => {
      toast.success('Request refused');
      setRefuseMessage('');
      setShowRefuseForm(false);
      invalidateAll();
    },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Failed to refuse request'),
  });

  const acceptMutation = useMutation({
    mutationFn: () => api('POST', `/task-requests/${requestId}/accept`, {}),
    onSuccess: () => {
      toast.success('Task created from request');
      invalidateAll();
    },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Failed to accept request'),
  });

  if (!requestId) {
    return (
      <AppCard
        className="flex h-full min-h-0 min-w-0 items-center justify-center"
        bodyClassName="flex w-full items-center justify-center"
      >
        <AppEmptyState title="Select a request to view details" className="py-6" />
      </AppCard>
    );
  }

  if (isLoading) {
    return (
      <AppCard className="flex h-full min-h-0 min-w-0 flex-1 flex-col" bodyClassName={uiTypography.helper}>
        Loading request details...
      </AppCard>
    );
  }

  if (!request) {
    return (
      <AppCard className="flex h-full min-h-0 min-w-0 flex-1 flex-col" bodyClassName={uiTypography.helper}>
        Request not found
      </AppCard>
    );
  }

  const statusConfig = getStatusBadgeConfig(request.status);

  return (
    <AppCard
      className="flex h-full min-h-0 min-w-0 flex-1 flex-col"
      bodyClassName="flex min-h-0 flex-1 flex-col p-0"
    >
      <div className={uiCx('border-b border-gray-100', uiSpacing.cardPadding, 'min-w-0')}>
        <div className="mb-3 flex min-w-0 items-start justify-between gap-3">
          <h2 className={uiCx(uiTypography.sectionTitle, 'min-w-0 flex-1 truncate')}>{request.title}</h2>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <AppBadge variant={statusConfig.variant}>{statusConfig.label}</AppBadge>
            <AppBadge variant={getPriorityBadgeVariant(request.priority)}>{request.priority}</AppBadge>
          </div>
        </div>
        <div className={uiCx(uiTypography.helper, 'space-y-1')}>
          <div>Requested by: <span className="font-medium text-gray-900">{request.requested_by?.name || 'Unknown'}</span></div>
          <div>Target: <span className="font-medium text-gray-900">
            {request.target.type === 'user'
              ? request.target.user_name || 'Specific user'
              : request.target.division_label || 'Division'}
          </span></div>
          {request.project?.name && (
            <div>Project: <span className="font-medium text-gray-900">
              {request.project.code ? `${request.project.code} • ` : ''}
              {request.project.name}
            </span></div>
          )}
          {request.due_date && (
            <div>Desired date: <span className="font-medium text-gray-900">
              {new Date(request.due_date).toLocaleDateString()}
            </span></div>
          )}
        </div>
      </div>

      <div className={uiCx('min-h-0 flex-1 space-y-4 overflow-y-auto overflow-x-hidden', uiSpacing.cardPadding)}>
        {request.description && (
          <div className={uiCx(uiRadius.card, uiBorders.subtle, uiColors.surfaceSubtle, uiSpacing.compactCardPadding)}>
            <div className={uiCx(uiTypography.overline, 'mb-1')}>Initial Request</div>
            <div className={uiCx(uiTypography.body, 'whitespace-pre-wrap')}>{request.description}</div>
          </div>
        )}

        {request.messages && request.messages.length > 0 ? (
          <div className={uiSpacing.sectionStack}>
            {request.messages.map((msg) => (
              <div key={msg.id} className={uiCx(uiRadius.card, uiBorders.subtle, uiColors.surface, uiSpacing.compactCardPadding)}>
                <div className={uiCx('mb-2 flex items-center justify-between', uiTypography.overline)}>
                  <span>{msg.sender_name || 'System'}</span>
                  <span>{new Date(msg.created_at).toLocaleString()}</span>
                </div>
                <div className={uiCx(uiTypography.body, 'whitespace-pre-wrap')}>{msg.body}</div>
              </div>
            ))}
          </div>
        ) : (
          <p className={uiCx(uiTypography.helper, 'py-4 text-center')}>No messages yet</p>
        )}
      </div>

      <div className={uiCx('space-y-4 border-t border-gray-100 bg-gray-50/50', uiSpacing.cardPadding)}>
        {request.permissions.can_request_info && (
          <div className={uiSpacing.sectionStack}>
            <AppTextarea
              label="Request more information"
              value={infoMessage}
              onChange={(e) => setInfoMessage(e.target.value)}
              rows={2}
              placeholder="What information do you need?"
            />
            <AppButton
              size="sm"
              onClick={() => askInfoMutation.mutate(infoMessage)}
              disabled={askInfoMutation.isLoading || !infoMessage.trim()}
              loading={askInfoMutation.isLoading}
            >
              {askInfoMutation.isLoading ? 'Sending...' : 'Send Request'}
            </AppButton>
          </div>
        )}

        {request.permissions.can_provide_info && (
          <div className={uiSpacing.sectionStack}>
            <AppTextarea
              label="Provide clarification"
              value={clarificationMessage}
              onChange={(e) => setClarificationMessage(e.target.value)}
              rows={2}
              placeholder="Add the requested information..."
            />
            <AppButton
              size="sm"
              onClick={() => provideInfoMutation.mutate(clarificationMessage)}
              disabled={provideInfoMutation.isLoading || !clarificationMessage.trim()}
              loading={provideInfoMutation.isLoading}
            >
              {provideInfoMutation.isLoading ? 'Sending...' : 'Send Clarification'}
            </AppButton>
          </div>
        )}

        <div className={uiCx('flex flex-wrap items-center justify-end gap-2 border-t border-gray-100 pt-2')}>
          {request.permissions.can_refuse && (
            <>
              {!showRefuseForm ? (
                <AppButton
                  variant="danger"
                  size="sm"
                  onClick={() => setShowRefuseForm(true)}
                  disabled={refuseMutation.isLoading || acceptMutation.isLoading}
                >
                  Refuse
                </AppButton>
              ) : (
                <div className="min-w-0 flex-1 space-y-2">
                  <AppTextarea
                    value={refuseMessage}
                    onChange={(e) => setRefuseMessage(e.target.value)}
                    rows={2}
                    placeholder="Reason (optional)"
                  />
                  <div className={uiLayout.actionsRow}>
                    <AppButton
                      variant="danger"
                      size="sm"
                      onClick={() => refuseMutation.mutate(refuseMessage)}
                      disabled={refuseMutation.isLoading}
                      loading={refuseMutation.isLoading}
                    >
                      Confirm Refusal
                    </AppButton>
                    <AppButton
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setShowRefuseForm(false);
                        setRefuseMessage('');
                      }}
                    >
                      Cancel
                    </AppButton>
                  </div>
                </div>
              )}
            </>
          )}
          {request.permissions.can_accept && !showRefuseForm && (
            <AppButton
              size="sm"
              onClick={() => acceptMutation.mutate()}
              disabled={acceptMutation.isLoading}
              loading={acceptMutation.isLoading}
            >
              {acceptMutation.isLoading ? 'Creating...' : 'Accept & Create Task'}
            </AppButton>
          )}
        </div>
      </div>
    </AppCard>
  );
}

// View Request Modal (Premium Centered)
function ViewRequestModal({
  requestId,
  onClose,
  onRefresh,
}: {
  requestId: string;
  onClose: () => void;
  onRefresh: () => void;
}) {
  const queryClient = useQueryClient();
  const { data: request, isLoading } = useQuery({
    queryKey: ['task-request', requestId],
    queryFn: () => api<TaskRequest>('GET', `/task-requests/${requestId}`),
    enabled: !!requestId,
  });

  const [infoMessage, setInfoMessage] = useState('');
  const [clarificationMessage, setClarificationMessage] = useState('');
  const [refuseMessage, setRefuseMessage] = useState('');
  const [showRefuseForm, setShowRefuseForm] = useState(false);

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['task-requests'] });
    queryClient.invalidateQueries({ queryKey: ['task-request', requestId] });
    onRefresh();
  };

  const askInfoMutation = useMutation({
    mutationFn: (message: string) =>
      api('POST', `/task-requests/${requestId}/ask-info`, { message }),
    onSuccess: () => {
      toast.success('Information request sent');
      setInfoMessage('');
      invalidateAll();
    },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Failed to request information'),
  });

  const provideInfoMutation = useMutation({
    mutationFn: (message: string) =>
      api('POST', `/task-requests/${requestId}/provide-info`, { message }),
    onSuccess: () => {
      toast.success('Clarification sent');
      setClarificationMessage('');
      invalidateAll();
    },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Failed to send clarification'),
  });

  const refuseMutation = useMutation({
    mutationFn: (message: string) =>
      api('POST', `/task-requests/${requestId}/refuse`, { message }),
    onSuccess: () => {
      toast.success('Request refused');
      setRefuseMessage('');
      setShowRefuseForm(false);
      invalidateAll();
    },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Failed to refuse request'),
  });

  const acceptMutation = useMutation({
    mutationFn: () => api('POST', `/task-requests/${requestId}/accept`, {}),
    onSuccess: () => {
      toast.success('Task created from request');
      invalidateAll();
    },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Failed to accept request'),
  });

  if (isLoading) {
                return (
                  <OverlayPortal>
                  <div
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
        onClick={onClose}
      >
        <div 
          className="bg-white rounded-xl shadow-xl w-full max-w-[75vw] max-h-[90vh] overflow-hidden flex flex-col border border-gray-200"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="p-8 text-center text-xs text-gray-500">Loading request details...</div>
        </div>
      </div>
                  </OverlayPortal>
    );
  }

  if (!request) {
    return (
      <OverlayPortal>
      <div 
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
        onClick={onClose}
      >
        <div 
          className="bg-white rounded-xl shadow-xl w-full max-w-[75vw] max-h-[90vh] overflow-hidden flex flex-col border border-gray-200"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="p-8 text-center text-xs text-gray-500">Request not found</div>
        </div>
      </div>
      </OverlayPortal>
    );
  }

  const statusConfig = getStatusBadgeConfig(request.status);

  return (
    <OverlayPortal>
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div 
        className={uiCx('flex max-h-[90vh] w-full max-w-[75vw] flex-col overflow-hidden', uiRadius.modal, uiBorders.subtle, uiColors.surface, uiShadows.elevated)}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 border-b border-gray-200 flex-shrink-0">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-xl bg-brand-red/10 flex items-center justify-center">
                  <svg className="w-5 h-5 text-brand-red" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h2 className="text-sm font-semibold text-gray-900">{request.title}</h2>
                  <p className="text-xs text-gray-500 mt-0.5">Request details and conversation</p>
                </div>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-2xl font-bold text-gray-400 hover:text-gray-600 w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors"
            >
              ×
            </button>
          </div>
        </div>

        {/* Body - Two Column Layout */}
        <div className="flex-1 overflow-hidden flex">
          {/* Left: Main Content */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {request.description && (
              <div className="rounded-xl border border-gray-200 bg-gray-50/50 p-4">
                <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-2">Initial Request</div>
                <div className="text-xs text-gray-700 whitespace-pre-wrap">{request.description}</div>
              </div>
            )}

            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Conversation</h3>
              {request.messages && request.messages.length > 0 ? (
                <div className="space-y-3">
                  {request.messages.map((msg) => (
                    <div key={msg.id} className="rounded-xl border border-gray-200 bg-white p-4">
                      <div className="flex items-center justify-between text-[10px] text-gray-500 mb-2">
                        <span className="font-medium">{msg.sender_name || 'System'}</span>
                        <span>{new Date(msg.created_at).toLocaleString()}</span>
                      </div>
                      <div className="text-xs text-gray-800 whitespace-pre-wrap">{msg.body}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-xs text-gray-500 text-center py-8 border border-gray-200 rounded-xl bg-gray-50/50">
                  No messages yet
                </div>
              )}
            </div>

            {/* Action Inputs */}
            {request.permissions.can_request_info && (
              <div className="rounded-xl border border-gray-200 bg-gray-50/50 p-4 space-y-2">
                <label className="block text-xs font-semibold text-gray-700">Request more information</label>
                <textarea
                  value={infoMessage}
                  onChange={(e) => setInfoMessage(e.target.value)}
                  rows={3}
                  placeholder="What information do you need?"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-xs focus:ring-2 focus:ring-brand-red/40 focus:border-brand-red/60"
                />
                <button
                  onClick={() => askInfoMutation.mutate(infoMessage)}
                  disabled={askInfoMutation.isLoading || !infoMessage.trim()}
                  className="px-3 py-2 bg-brand-red text-white rounded-lg hover:opacity-90 transition-colors text-xs font-medium disabled:opacity-60"
                >
                  {askInfoMutation.isLoading ? 'Sending...' : 'Send Request'}
                </button>
              </div>
            )}

            {request.permissions.can_provide_info && (
              <div className="rounded-xl border border-gray-200 bg-gray-50/50 p-4 space-y-2">
                <label className="block text-xs font-semibold text-gray-700">Provide clarification</label>
                <textarea
                  value={clarificationMessage}
                  onChange={(e) => setClarificationMessage(e.target.value)}
                  rows={3}
                  placeholder="Add the requested information..."
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-xs focus:ring-2 focus:ring-brand-red/40 focus:border-brand-red/60"
                />
                <button
                  onClick={() => provideInfoMutation.mutate(clarificationMessage)}
                  disabled={provideInfoMutation.isLoading || !clarificationMessage.trim()}
                  className="px-3 py-2 bg-brand-red text-white rounded-lg hover:opacity-90 transition-colors text-xs font-medium disabled:opacity-60"
                >
                  {provideInfoMutation.isLoading ? 'Sending...' : 'Send Clarification'}
                </button>
              </div>
            )}
          </div>

          {/* Right: Context Panel */}
          <div className="w-80 border-l border-gray-200 bg-gray-50/30 p-4 space-y-4 flex-shrink-0 overflow-y-auto">
            <div>
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Status</div>
              <div className="flex flex-wrap gap-2">
                <AppBadge variant={statusConfig.variant}>{statusConfig.label}</AppBadge>
                <AppBadge variant={getPriorityBadgeVariant(request.priority)}>{request.priority}</AppBadge>
              </div>
            </div>

            <div>
              <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-2">Details</div>
              <div className="space-y-3 text-xs">
                <div>
                  <div className="text-gray-500 mb-1">Requested by</div>
                  <div className="font-medium text-gray-900">{request.requested_by?.name || 'Unknown'}</div>
                </div>
                <div>
                  <div className="text-gray-500 mb-1">Target</div>
                  <div className="font-medium text-gray-900">
                    {request.target.type === 'user'
                      ? request.target.user_name || 'Specific user'
                      : request.target.division_label || 'Division'}
                  </div>
                </div>
                {request.project?.name && (
                  <div>
                    <div className="text-gray-500 mb-1">Project</div>
                    <div className="font-medium text-gray-900">
                      {request.project.code ? `${request.project.code} • ` : ''}
                      {request.project.name}
                    </div>
                  </div>
                )}
                {request.due_date && (
                  <div>
                    <div className="text-gray-500 mb-1">Desired date</div>
                    <div className="font-medium text-gray-900">
                      {new Date(request.due_date).toLocaleDateString()}
                    </div>
                  </div>
                )}
                <div>
                  <div className="text-gray-500 mb-1">Created</div>
                  <div className="font-medium text-gray-900">
                    {new Date(request.created_at).toLocaleDateString()}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className={uiCx('flex shrink-0 items-center justify-end gap-2 border-t border-gray-100 bg-gray-50/50', uiSpacing.cardPadding, uiLayout.actionsRow)}>
          <AppButton variant="secondary" size="sm" onClick={onClose}>
            Close
          </AppButton>
          {request.permissions.can_refuse && !showRefuseForm && (
            <AppButton
              variant="danger"
              size="sm"
              onClick={() => setShowRefuseForm(true)}
              disabled={refuseMutation.isLoading || acceptMutation.isLoading}
            >
              Refuse
            </AppButton>
          )}
          {showRefuseForm && request.permissions.can_refuse && (
            <div className="flex-1 space-y-2">
              <textarea
                value={refuseMessage}
                onChange={(e) => setRefuseMessage(e.target.value)}
                rows={2}
                placeholder="Reason (optional)"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-xs"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => refuseMutation.mutate(refuseMessage)}
                  disabled={refuseMutation.isLoading}
                  className="px-3 py-2 bg-rose-600 text-white rounded-lg hover:bg-rose-700 transition-colors text-xs font-medium disabled:opacity-60"
                >
                  Confirm Refusal
                </button>
                <button
                  onClick={() => {
                    setShowRefuseForm(false);
                    setRefuseMessage('');
                  }}
                  className="px-3 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors text-xs font-medium"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
          {request.permissions.can_accept && (
            <AppButton
              size="sm"
              onClick={() => acceptMutation.mutate()}
              disabled={acceptMutation.isLoading || (showRefuseForm && refuseMutation.isLoading)}
              loading={acceptMutation.isLoading}
            >
              {acceptMutation.isLoading ? 'Creating...' : 'Accept & Create Task'}
            </AppButton>
          )}
        </div>
      </div>
    </div>
    </OverlayPortal>
  );
}

// Create Request Modal (Premium Centered)
function CreateRequestModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [targetType, setTargetType] = useState<'user' | 'division'>('user');
  const [targetUserId, setTargetUserId] = useState('');
  const [targetDivisionId, setTargetDivisionId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [projectId, setProjectId] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [priority, setPriority] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api<any>('GET', '/settings'),
  });
  const divisions: DivisionOption[] = (settings?.divisions || []) as DivisionOption[];

  const divisionSelectOptions = useMemo(
    () =>
      sortByLabel(
        divisions.map((division) => ({ value: division.id, label: division.label })),
        (o) => o.label,
      ),
    [divisions],
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      toast.error('Title is required');
      return;
    }
    if (targetType === 'user' && !targetUserId) {
      toast.error('Select a recipient');
      return;
    }
    if (targetType === 'division' && !targetDivisionId) {
      toast.error('Select a division');
      return;
    }
    if (!priority) {
      toast.error('Select a priority');
      return;
    }
    setIsSubmitting(true);
    try {
      await api('POST', '/task-requests', {
        title: title.trim(),
        description: description.trim() || null,
        target_type: targetType,
        target_user_id: targetType === 'user' ? targetUserId : null,
        target_division_id: targetType === 'division' ? targetDivisionId : null,
        project_id: projectId || null,
        due_date: dueDate || null,
        priority,
      });
      toast.success('Task request created');
      onCreated();
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to create request');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AppFormModal
      open
      onClose={onClose}
      title="Create Request"
      description="Start a conversation that may become a task"
      quickInfo={
        <>
          <p>Requests let you start a conversation before it becomes a task.</p>
          <p>Recipients can ask for more information; you can clarify before someone accepts.</p>
          <p>Send to a specific user or a whole division — only one recipient path per request.</p>
        </>
      }
      footer={
        <div className={uiCx(uiLayout.actionsRow, 'w-full justify-end')}>
          <AppButton variant="secondary" size="sm" type="button" onClick={onClose}>
            Cancel
          </AppButton>
          <AppButton
            size="sm"
            type="submit"
            form="create-request-form"
            disabled={isSubmitting}
            loading={isSubmitting}
          >
            {isSubmitting ? 'Creating...' : 'Create Request'}
          </AppButton>
        </div>
      }
    >
      <form id="create-request-form" onSubmit={handleSubmit} className={uiCx('space-y-4', uiSpacing.sectionStack)}>
        <AppInput
          label="Title *"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Short summary"
          fieldHint="Title\n\nA short summary shown in lists and notifications."
        />

        <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
          <div className="space-y-1.5 min-w-0">
            <AppControlLabelRow
              label="Send to"
              fieldHint={
                <AppFieldHint hint="Send to\n\nChoose whether this request goes to one person or everyone in a division." />
              }
            />
            <div className="flex flex-nowrap gap-2">
              <AppButton
                type="button"
                size="sm"
                variant={targetType === 'user' ? 'primary' : 'secondary'}
                className="min-w-0 flex-1 whitespace-nowrap px-2"
                onClick={() => setTargetType('user')}
              >
                Specific user
              </AppButton>
              <AppButton
                type="button"
                size="sm"
                variant={targetType === 'division' ? 'primary' : 'secondary'}
                className="min-w-0 shrink-0 whitespace-nowrap px-2"
                onClick={() => {
                  setTargetType('division');
                  setTargetUserId('');
                }}
              >
                Division
              </AppButton>
            </div>
          </div>
          <AppSelect
            id="create-request-priority"
            label="Priority *"
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
            options={priorityOptions}
            placeholder="Select priority…"
            fieldHint="Priority\n\nHow urgent this request is for the recipient. Required before submitting."
          />
        </div>

        {targetType === 'user' ? (
          <AppUserSelect
            mode="single"
            label="Choose a user *"
            value={targetUserId}
            onChange={setTargetUserId}
            placeholder="Search or select user…"
            showSelectedChip={false}
            fieldHint="Choose a user\n\nWho should receive this task request."
          />
        ) : (
          <AppSelect
            id="create-request-division"
            label="Select division *"
            value={targetDivisionId}
            onChange={(e) => setTargetDivisionId(e.target.value)}
            options={divisionSelectOptions}
            placeholder="Select division…"
            fieldHint="Select division\n\nEveryone in this division will see the request until someone accepts it."
          />
        )}

        <AppProjectSelect
          label="Project (optional)"
          value={projectId}
          onChange={setProjectId}
          allowEmpty
          emptyOptionLabel="No project"
          placeholder="Search by name, code, or address…"
          fieldHint="Project (optional)\n\nLink this request to a job site when relevant."
        />

        <AppDatePicker
          label="Due date (optional)"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          fieldHint="Due date\n\nOptional deadline for the recipient."
        />

        <AppTextarea
          label="Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          placeholder="Explain what needs to be done..."
          fieldHint="Description\n\nOptional detail for the recipient before the request becomes a task."
        />
      </form>
    </AppFormModal>
  );
}

function RequestsListModal({
  title,
  requests,
  isLoading,
  onClose,
  onRefresh,
  initialSelectedId,
}: {
  title: string;
  requests: TaskRequest[];
  isLoading: boolean;
  onClose: () => void;
  onRefresh: () => void;
  initialSelectedId?: string | null;
}) {
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(initialSelectedId || null);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [infoMessage, setInfoMessage] = useState('');
  const [refuseMessage, setRefuseMessage] = useState('');
  const [showRefuseForm, setShowRefuseForm] = useState(false);
  const [clarificationMessage, setClarificationMessage] = useState('');

  // Filter only active requests (not accepted or refused)
  const activeRequests = useMemo(() => {
    return requests.filter((req) => req.status !== 'accepted' && req.status !== 'refused');
  }, [requests]);

  // Get history requests
  const historyRequests = useMemo(() => {
    return requests.filter((req) => req.status === 'accepted' || req.status === 'refused');
  }, [requests]);

  useEffect(() => {
    // If initialSelectedId is provided and exists in active requests, use it
    if (initialSelectedId && activeRequests.some((r) => r.id === initialSelectedId)) {
      setSelectedRequestId(initialSelectedId);
      return;
    }
    // Otherwise, use default selection logic
    if (!selectedRequestId && activeRequests.length > 0) {
      setSelectedRequestId(activeRequests[0].id);
    } else if (activeRequests.length === 0) {
      setSelectedRequestId(null);
    } else if (selectedRequestId && !activeRequests.some((r) => r.id === selectedRequestId)) {
      // If selected request is no longer in active list, select first one
      setSelectedRequestId(activeRequests[0].id);
    }
  }, [activeRequests, selectedRequestId, initialSelectedId]);

  useEffect(() => {
    setInfoMessage('');
    setRefuseMessage('');
    setClarificationMessage('');
    setShowRefuseForm(false);
  }, [selectedRequestId]);

  const queryClient = useQueryClient();

  const { data: detail, isLoading: loadingDetail } = useQuery({
    queryKey: ['task-request', selectedRequestId],
    queryFn: () => api<TaskRequest>('GET', `/task-requests/${selectedRequestId}`),
    enabled: !!selectedRequestId,
  });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['task-requests'] });
    queryClient.invalidateQueries({ queryKey: ['task-request', selectedRequestId] });
    onRefresh();
  };

  const askInfoMutation = useMutation({
    mutationFn: (message: string) =>
      api('POST', `/task-requests/${selectedRequestId}/ask-info`, { message }),
    onSuccess: () => {
      toast.success('Information request sent');
      setInfoMessage('');
      invalidateAll();
    },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Failed to request information'),
  });

  const provideInfoMutation = useMutation({
    mutationFn: (message: string) =>
      api('POST', `/task-requests/${selectedRequestId}/provide-info`, { message }),
    onSuccess: () => {
      toast.success('Clarification sent');
      setClarificationMessage('');
      invalidateAll();
    },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Failed to send clarification'),
  });

  const refuseMutation = useMutation({
    mutationFn: (message: string) =>
      api('POST', `/task-requests/${selectedRequestId}/refuse`, { message }),
    onSuccess: () => {
      toast.success('Request refused');
      setRefuseMessage('');
      setShowRefuseForm(false);
      // Request will move to history after refusal
      // After refresh, select first active request if available
      invalidateAll();
      // Reset selection - it will be set to first active request by useEffect
      setSelectedRequestId(null);
    },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Failed to refuse request'),
  });

  const acceptMutation = useMutation({
    mutationFn: () => api('POST', `/task-requests/${selectedRequestId}/accept`, {}),
    onSuccess: () => {
      toast.success('Task created from request');
      // Request will move to history after acceptance
      // After refresh, select first active request if available
      invalidateAll();
      // Reset selection - it will be set to first active request by useEffect
      setSelectedRequestId(null);
    },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Failed to accept request'),
  });
  const selected = detail;

  return (
    <>
      <OverlayPortal>
      <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl max-w-7xl w-full max-h-[90vh] overflow-hidden flex flex-col border border-gray-200">
          <div className="sticky top-0 bg-white border-b border-gray-200 p-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowHistoryModal(true)}
                className="px-3 py-2 text-xs font-medium rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
              >
                History
                {historyRequests.length > 0 && (
                  <span className="ml-2 px-1.5 py-0.5 bg-brand-red text-white text-[10px] font-semibold rounded-full">
                    {historyRequests.length}
                  </span>
                )}
              </button>
              <button onClick={onClose} className="text-2xl font-bold text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 w-8 h-8 flex items-center justify-center">
                ×
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-hidden flex">
            {/* Left side - List */}
            <div className="w-80 border-r border-gray-200 bg-gray-50 overflow-y-auto flex flex-col">
              <div className="p-3 border-b border-gray-200 bg-white">
                <div className="text-xs font-medium text-gray-700">
                  {activeRequests.length} request{activeRequests.length !== 1 ? 's' : ''}{' '}
                  <span className="text-[10px] text-gray-500">(in process)</span>
                </div>
              </div>
              <div className="divide-y divide-gray-200 flex-1">
                {isLoading ? (
                  <div className="p-4 text-xs text-gray-500">Loading...</div>
                ) : activeRequests.length === 0 ? (
                  <div className="p-4 text-xs text-gray-500">No active requests</div>
                ) : (
                  activeRequests.map((req) => (
                  <button
                    key={req.id}
                    onClick={() => setSelectedRequestId(req.id)}
                    className={`w-full text-left p-4 hover:bg-gray-100 transition flex flex-col gap-2 ${
                      selectedRequestId === req.id ? 'bg-blue-50 border-l-4 border-l-brand-red' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-medium text-sm text-gray-900 truncate">{req.title}</div>
                      <AppBadge variant={getStatusBadgeConfig(req.status).variant} className="shrink-0">
                        {req.status_label}
                      </AppBadge>
                    </div>
                    <div className="text-xs text-gray-500 flex flex-wrap gap-2">
                      <span className="capitalize">{req.priority || 'normal'}</span>
                      {req.due_date && (
                        <span>Due: {new Date(req.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                      )}
                    </div>
                    <div className="text-xs text-gray-400">
                      {req.requested_by?.name || req.requested_by?.id || 'Unknown'} •{' '}
                      {new Date(req.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Right side - Details */}
          <div className="flex-1 overflow-y-auto bg-white">
            {loadingDetail ? (
              <div className="p-6 text-sm text-gray-500">Loading request...</div>
            ) : !selected ? (
              <div className="p-6 text-sm text-gray-500">Select a request to see details.</div>
            ) : (
              <div className="p-6 space-y-6">
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-3 flex-wrap">
                    <h2 className="text-sm font-semibold text-gray-900">{selected.title}</h2>
                    <AppBadge variant={getStatusBadgeConfig(selected.status).variant}>
                      {selected.status_label}
                    </AppBadge>
                    <AppBadge variant={getPriorityBadgeVariant(selected.priority)}>
                      Priority: {selected.priority}
                    </AppBadge>
                  </div>
                  <div className="text-sm text-gray-600 flex flex-wrap gap-4">
                    <span>
                      Requested by:{' '}
                      <strong>{selected.requested_by?.name || selected.requested_by?.id || 'Unknown'}</strong>
                    </span>
                    <span>
                      Target:{' '}
                      <strong>
                        {selected.target.type === 'user'
                          ? selected.target.user_name || 'Specific user'
                          : `${selected.target.division_label || 'Division'}`}
                      </strong>
                    </span>
                    {selected.project?.name && (
                      <span>
                        Project:{' '}
                        <strong>
                          {selected.project.code ? `${selected.project.code} • ` : ''}
                          {selected.project.name}
                        </strong>
                      </span>
                    )}
                    {selected.due_date && (
                      <span>
                        Desired date:{' '}
                        <strong>{new Date(selected.due_date).toLocaleDateString()}</strong>
                      </span>
                    )}
                  </div>
                </div>

                {selected.description && (
                  <div className="bg-gray-50 border rounded-lg p-4 text-sm text-gray-700 whitespace-pre-wrap">
                    {selected.description}
                  </div>
                )}

                <div className="space-y-3">
                  <h3 className="font-semibold">Messages</h3>
                  {selected.messages && selected.messages.length > 0 ? (
                    <div className="space-y-3">
                      {selected.messages.map((msg) => (
                        <div key={msg.id} className="rounded border p-3 bg-gray-50">
                          <div className="flex items-center justify-between text-xs text-gray-500">
                            <span>{msg.sender_name || 'System'}</span>
                            <span>{new Date(msg.created_at).toLocaleString()}</span>
                          </div>
                          <div className="mt-1 text-sm text-gray-800 whitespace-pre-wrap">{msg.body}</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-sm text-gray-500">No messages yet.</div>
                  )}
                </div>

                {/* Action buttons for active requests */}
                <div className="space-y-4">
                  {selected.permissions.can_request_info && (
                    <ActionCard
                      title="Ask for more information"
                      description="Let the requester know what details are missing."
                      textareaValue={infoMessage}
                      onChange={setInfoMessage}
                      actionLabel="Send request"
                      disabled={askInfoMutation.isLoading}
                      onSubmit={() => askInfoMutation.mutate(infoMessage)}
                    />
                  )}

                  {selected.permissions.can_provide_info && (
                    <ActionCard
                      title="Provide clarification"
                      description="Reply with the information requested."
                      textareaValue={clarificationMessage}
                      onChange={setClarificationMessage}
                      actionLabel="Send clarification"
                      disabled={provideInfoMutation.isLoading}
                      onSubmit={() => provideInfoMutation.mutate(clarificationMessage)}
                    />
                  )}

                  {(selected.permissions.can_accept || selected.permissions.can_refuse) && (
                    <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                        <div>
                          {selected.permissions.can_accept && (
                            <>
                              <div className="font-semibold text-gray-900">Ready to accept?</div>
                              <p className="text-sm text-gray-600">
                                This will create a Task in the Tasks module and notify the requester.
                              </p>
                            </>
                          )}
                          {!selected.permissions.can_accept && selected.permissions.can_refuse && (
                            <div>
                              <div className="font-semibold text-gray-900">Request Actions</div>
                              <p className="text-sm text-gray-600">
                                You can refuse this request if it cannot be completed.
                              </p>
                            </div>
                          )}
                        </div>
                        <div className={uiCx(uiLayout.actionsRow, 'justify-end')}>
                          {selected.permissions.can_refuse && (
                            <AppButton
                              variant="danger"
                              size="sm"
                              onClick={() => setShowRefuseForm(!showRefuseForm)}
                              disabled={refuseMutation.isLoading || acceptMutation.isLoading}
                            >
                              Refuse request
                            </AppButton>
                          )}
                          {selected.permissions.can_accept && (
                            <AppButton
                              size="sm"
                              onClick={() => acceptMutation.mutate()}
                              disabled={acceptMutation.isLoading || (showRefuseForm && refuseMutation.isLoading)}
                              loading={acceptMutation.isLoading}
                            >
                              {acceptMutation.isLoading ? 'Creating...' : 'Accept & Create Task'}
                            </AppButton>
                          )}
                        </div>
                      </div>
                      {showRefuseForm && selected.permissions.can_refuse && (
                        <div className="mt-4 pt-4 border-t border-gray-200">
                          <div className="space-y-3">
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">
                                Reason (optional)
                              </label>
                              <textarea
                                value={refuseMessage}
                                onChange={(e) => setRefuseMessage(e.target.value)}
                                rows={3}
                                placeholder="Share why this request cannot be completed..."
                                className="w-full rounded border px-3 py-2 text-sm"
                              />
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => refuseMutation.mutate(refuseMessage)}
                                disabled={refuseMutation.isLoading}
                                className="px-4 py-2 rounded bg-red-600 text-white hover:bg-red-700 transition disabled:opacity-60"
                              >
                                {refuseMutation.isLoading ? 'Refusing...' : 'Confirm Refusal'}
                              </button>
                              <button
                                onClick={() => {
                                  setShowRefuseForm(false);
                                  setRefuseMessage('');
                                }}
                                disabled={refuseMutation.isLoading}
                                className="px-4 py-2 rounded border bg-white hover:bg-gray-50 transition disabled:opacity-60"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
          </div>
        </div>
      </div>
      </OverlayPortal>

      {showHistoryModal && (
        <RequestsHistoryModal
          title={`${title} - History`}
          requests={historyRequests}
          isLoading={isLoading}
          onClose={() => setShowHistoryModal(false)}
          onRefresh={onRefresh}
        />
      )}
    </>
  );
}

function RequestsHistoryModal({
  title,
  requests,
  isLoading,
  onClose,
  onRefresh,
}: {
  title: string;
  requests: TaskRequest[];
  isLoading: boolean;
  onClose: () => void;
  onRefresh: () => void;
}) {
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedRequestId && requests.length > 0) {
      setSelectedRequestId(requests[0].id);
    } else if (requests.length === 0) {
      setSelectedRequestId(null);
    } else if (selectedRequestId && !requests.some((r) => r.id === selectedRequestId)) {
      setSelectedRequestId(requests[0].id);
    }
  }, [requests, selectedRequestId]);

  const { data: detail, isLoading: loadingDetail } = useQuery({
    queryKey: ['task-request', selectedRequestId],
    queryFn: () => api<TaskRequest>('GET', `/task-requests/${selectedRequestId}`),
    enabled: !!selectedRequestId,
  });

  const selected = detail;

  return (
    <OverlayPortal>
    <div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl max-w-7xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="sticky top-0 bg-white border-b p-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
          <button onClick={onClose} className="text-2xl font-bold text-gray-400 hover:text-gray-600">
            ×
          </button>
        </div>
        <div className="flex-1 overflow-hidden flex">
          {/* Left side - List */}
          <div className="w-80 border-r bg-gray-50 overflow-y-auto flex flex-col">
            <div className="p-3 border-b bg-white">
              <div className="text-sm font-medium text-gray-700">
                {requests.length} request{requests.length !== 1 ? 's' : ''}{' '}
                <span className="text-xs text-gray-500">(completed)</span>
              </div>
            </div>
            <div className="divide-y flex-1">
              {isLoading ? (
                <div className="p-4 text-sm text-gray-500">Loading...</div>
              ) : requests.length === 0 ? (
                <div className="p-4 text-sm text-gray-500">No completed requests in history</div>
              ) : (
                requests.map((req) => (
                  <button
                    key={req.id}
                    onClick={() => setSelectedRequestId(req.id)}
                    className={`w-full text-left p-4 hover:bg-gray-100 transition flex flex-col gap-2 ${
                      selectedRequestId === req.id ? 'bg-blue-50 border-l-4 border-l-brand-red' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-medium text-sm text-gray-900 truncate">{req.title}</div>
                      <AppBadge variant={getStatusBadgeConfig(req.status).variant} className="shrink-0">
                        {req.status_label}
                      </AppBadge>
                    </div>
                    <div className="text-xs text-gray-500 flex flex-wrap gap-2">
                      <span className="capitalize">{req.priority || 'normal'}</span>
                      {req.due_date && (
                        <span>Due: {new Date(req.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                      )}
                    </div>
                    <div className="text-xs text-gray-400">
                      {req.requested_by?.name || req.requested_by?.id || 'Unknown'} •{' '}
                      {new Date(req.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Right side - Details */}
          <div className="flex-1 overflow-y-auto bg-white">
            {loadingDetail ? (
              <div className="p-6 text-sm text-gray-500">Loading request...</div>
            ) : !selected ? (
              <div className="p-6 text-sm text-gray-500">Select a request to see details.</div>
            ) : (
              <div className="p-6 space-y-6">
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-3 flex-wrap">
                    <h2 className="text-sm font-semibold text-gray-900">{selected.title}</h2>
                    <AppBadge variant={getStatusBadgeConfig(selected.status).variant}>
                      {selected.status_label}
                    </AppBadge>
                    <AppBadge variant={getPriorityBadgeVariant(selected.priority)}>
                      Priority: {selected.priority}
                    </AppBadge>
                  </div>
                  <div className="text-sm text-gray-600 flex flex-wrap gap-4">
                    <span>
                      Requested by:{' '}
                      <strong>{selected.requested_by?.name || selected.requested_by?.id || 'Unknown'}</strong>
                    </span>
                    <span>
                      Target:{' '}
                      <strong>
                        {selected.target.type === 'user'
                          ? selected.target.user_name || 'Specific user'
                          : `${selected.target.division_label || 'Division'}`}
                      </strong>
                    </span>
                    {selected.project?.name && (
                      <span>
                        Project:{' '}
                        <strong>
                          {selected.project.code ? `${selected.project.code} • ` : ''}
                          {selected.project.name}
                        </strong>
                      </span>
                    )}
                    {selected.due_date && (
                      <span>
                        Desired date:{' '}
                        <strong>{new Date(selected.due_date).toLocaleDateString()}</strong>
                      </span>
                    )}
                  </div>
                </div>

                {selected.description && (
                  <div className="bg-gray-50 border rounded-lg p-4 text-sm text-gray-700 whitespace-pre-wrap">
                    {selected.description}
                  </div>
                )}

                <div className="space-y-3">
                  <h3 className="font-semibold">Messages</h3>
                  {selected.messages && selected.messages.length > 0 ? (
                    <div className="space-y-3">
                      {selected.messages.map((msg) => (
                        <div key={msg.id} className="rounded border p-3 bg-gray-50">
                          <div className="flex items-center justify-between text-xs text-gray-500">
                            <span>{msg.sender_name || 'System'}</span>
                            <span>{new Date(msg.created_at).toLocaleString()}</span>
                          </div>
                          <div className="mt-1 text-sm text-gray-800 whitespace-pre-wrap">{msg.body}</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-sm text-gray-500">No messages yet.</div>
                  )}
                </div>

                {/* Show completion info */}
                <div className="rounded-lg border p-4 bg-gray-50">
                  <div className="text-sm">
                    {selected.status === 'accepted' && (
                      <div className="space-y-1">
                        <div className="font-semibold text-green-700">✓ Request Accepted</div>
                        <p className="text-gray-600">
                          This request has been accepted and converted into a task.{' '}
                          {selected.task && (
                            <span>
                              Task ID: <strong>{selected.task.id}</strong>
                            </span>
                          )}
                        </p>
                        {selected.accepted_task_id && (
                          <p className="text-xs text-gray-500">
                            Task created on{' '}
                            {selected.updated_at
                              ? new Date(selected.updated_at).toLocaleDateString()
                              : 'N/A'}
                          </p>
                        )}
                      </div>
                    )}
                    {selected.status === 'refused' && (
                      <div className="space-y-1">
                        <div className="font-semibold text-rose-700">✗ Request Refused</div>
                        <p className="text-gray-600">
                          This request has been refused and will not be converted into a task.
                        </p>
                        {selected.updated_at && (
                          <p className="text-xs text-gray-500">
                            Refused on {new Date(selected.updated_at).toLocaleDateString()}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
    </OverlayPortal>
  );
}

function ActionCard({
  title,
  description,
  textareaValue,
  onChange,
  actionLabel,
  onSubmit,
  disabled,
  variant = 'default',
  requireText = true,
}: {
  title: string;
  description: string;
  textareaValue: string;
  onChange: (v: string) => void;
  actionLabel: string;
  onSubmit: () => void;
  disabled?: boolean;
  variant?: 'default' | 'danger';
  requireText?: boolean;
}) {
  return (
    <AppCard
      className={variant === 'danger' ? 'border-rose-200 bg-rose-50' : uiColors.surfaceSubtle}
      bodyClassName={uiSpacing.sectionStack}
    >
      <div>
        <div className={uiTypography.sectionTitle}>{title}</div>
        <p className={uiTypography.sectionSubtitle}>{description}</p>
      </div>
      <AppTextarea
        value={textareaValue}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        placeholder="Type your message..."
      />
      <AppButton
        variant={variant === 'danger' ? 'danger' : 'primary'}
        size="sm"
        onClick={onSubmit}
        disabled={disabled || (requireText && !textareaValue.trim())}
        disabled={disabled}
      >
        {actionLabel}
      </AppButton>
    </AppCard>
  );
}

function CreateTaskRequestModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [targetType, setTargetType] = useState<'user' | 'division'>('user');
  const [targetUserId, setTargetUserId] = useState('');
  const [userSearch, setUserSearch] = useState('');
  const [targetDivisionId, setTargetDivisionId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [projectId, setProjectId] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [priority, setPriority] = useState('normal');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [workerDropdownOpen, setWorkerDropdownOpen] = useState(false);
  const workerDropdownRef = useRef<HTMLDivElement>(null);
  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api<any>('GET', '/settings'),
  });
  const { data: usersOptions } = useQuery({
    queryKey: ['usersOptions'],
    queryFn: () => api<UserOption[]>('GET', '/auth/users/options?limit=500'),
  });
  const { data: projects } = useQuery({
    queryKey: ['projects-all'],
    queryFn: () => api<ProjectOption[]>('GET', '/projects'),
  });
  const { data: employees } = useQuery({
    queryKey: ['employees'],
    queryFn: () => api<any[]>('GET', '/employees'),
  });

  const divisions: DivisionOption[] = (settings?.divisions || []) as DivisionOption[];

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (workerDropdownRef.current && !workerDropdownRef.current.contains(event.target as Node)) {
        setWorkerDropdownOpen(false);
      }
    };

    if (workerDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [workerDropdownOpen]);

  const filteredUsers = useMemo(() => {
    if (!usersOptions) return [];
    if (!userSearch.trim()) return usersOptions;
    const searchLower = userSearch.toLowerCase();
    return usersOptions.filter((u) => {
      const name = `${u.name || ''} ${u.username || ''}`.toLowerCase();
      return name.includes(searchLower);
    });
  }, [usersOptions, userSearch]);

  const toggleUser = (userId: string) => {
    // Single selection - if same user, deselect; otherwise select new user
    setTargetUserId(prev => prev === userId ? '' : userId);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      toast.error('Title is required');
      return;
    }
    if (targetType === 'user' && !targetUserId) {
      toast.error('Select a recipient');
      return;
    }
    if (targetType === 'division' && !targetDivisionId) {
      toast.error('Select a division');
      return;
    }
    setIsSubmitting(true);
    try {
      await api('POST', '/task-requests', {
        title: title.trim(),
        description: description.trim() || null,
        target_type: targetType,
        target_user_id: targetType === 'user' ? targetUserId : null,
        target_division_id: targetType === 'division' ? targetDivisionId : null,
        project_id: projectId || null,
        due_date: dueDate || null,
        priority,
      });
      toast.success('Task request created');
      onCreated();
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to create request');
    } finally {
      setIsSubmitting(false);
    }
  };

  const canSubmit = title.trim() && (targetType === 'user' ? !!targetUserId : !!targetDivisionId);

  return (
    <OverlayPortal>
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl max-h-[90vh] flex flex-col rounded-xl border border-gray-200 bg-gray-100 shadow-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex-shrink-0 rounded-t-xl border-b border-gray-200 bg-white p-4">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-lg hover:bg-gray-100 text-gray-600"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div>
              <h2 className="text-sm font-semibold text-gray-900">New Request</h2>
              <p className="text-xs text-gray-500 mt-0.5">Share the context and choose who should receive it.</p>
            </div>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          <form
            id="create-task-request-form"
            onSubmit={handleSubmit}
            className="rounded-xl border border-gray-200 bg-white p-4 space-y-4"
          >
            <div>
              <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide block mb-1">Title *</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-300 focus:border-gray-300"
                placeholder="Short summary"
              />
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide block mb-1">Send to</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setTargetType('user')}
                    className={`flex-1 px-3 py-2 rounded-lg border text-sm font-medium ${
                      targetType === 'user'
                        ? 'bg-brand-red text-white border-brand-red'
                        : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    Specific user
                  </button>
                  <button
                    type="button"
                    onClick={() => setTargetType('division')}
                    className={`flex-1 px-3 py-2 rounded-lg border text-sm font-medium ${
                      targetType === 'division'
                        ? 'bg-brand-red text-white border-brand-red'
                        : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    Division
                  </button>
                </div>
              </div>
              <div>
                <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide block mb-1">Priority</label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-300 focus:border-gray-300"
                >
                  {priorityOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {targetType === 'user' ? (
              <div>
                <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide block mb-1">
                  Choose a user {targetUserId && '(1 selected)'}
                </label>
                <div className="relative" ref={workerDropdownRef}>
                  <button
                    type="button"
                    onClick={() => setWorkerDropdownOpen(!workerDropdownOpen)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-left bg-white flex items-center justify-between focus:outline-none focus:ring-1 focus:ring-gray-300 focus:border-gray-300"
                  >
                  <span className="text-sm text-gray-600">
                    {!targetUserId
                      ? 'Select user...'
                      : (() => {
                          const selectedUser = usersOptions?.find((u) => u.id === targetUserId);
                          return selectedUser?.name || selectedUser?.username || 'Selected';
                        })()}
                  </span>
                  <span className="text-gray-400">{workerDropdownOpen ? '▲' : '▼'}</span>
                </button>
                {workerDropdownOpen && (
                  <div
                    className="absolute z-50 mt-1 w-full rounded-lg border bg-white shadow-lg max-h-60 overflow-auto"
                    onMouseDown={(e) => e.stopPropagation()}
                  >
                    <div className="p-2 border-b space-y-2">
                      <input
                        type="text"
                        placeholder="Search user..."
                        value={userSearch}
                        onChange={(e) => setUserSearch(e.target.value)}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-300 focus:border-gray-300"
                        onMouseDown={(e) => e.stopPropagation()}
                      />
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onMouseDown={(e) => e.stopPropagation()}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            if (filteredUsers.length > 0) {
                              // Select first filtered user (single selection)
                              setTargetUserId(filteredUsers[0].id);
                            }
                          }}
                          className="text-xs px-2 py-1 rounded border hover:bg-gray-50"
                        >
                          Select First
                        </button>
                        <button
                          type="button"
                          onMouseDown={(e) => e.stopPropagation()}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setTargetUserId('');
                          }}
                          className="text-xs px-2 py-1 rounded border hover:bg-gray-50"
                        >
                          Clear
                        </button>
                      </div>
                    </div>
                    <div className="p-2">
                      {filteredUsers.length > 0 ? (
                        filteredUsers.map((user) => {
                          // Find employee data for profile photo
                          const employee = employees?.find((e: any) => e.id === user.id);
                          return (
                            <label
                              key={user.id}
                              className="flex items-center gap-2 p-2 hover:bg-gray-50 cursor-pointer rounded"
                              onMouseDown={(e) => e.stopPropagation()}
                            >
                              <input
                                type="checkbox"
                                checked={targetUserId === user.id}
                                onChange={() => toggleUser(user.id)}
                                className="rounded"
                                onMouseDown={(e) => e.stopPropagation()}
                              />
                              <div className="flex items-center gap-2 flex-1">
                                {employee?.profile_photo_file_id ? (
                                  <img
                                    src={withFileAccessToken(`/files/${employee.profile_photo_file_id}/thumbnail?w=64`)}
                                    className="w-6 h-6 rounded-full object-cover"
                                    alt=""
                                  />
                                ) : (
                                  <span className="w-6 h-6 rounded-full bg-gray-200 inline-block" />
                                )}
                                <span className="text-sm">{user.name || user.username}</span>
                              </div>
                            </label>
                          );
                        })
                      ) : (
                        <div className="p-2 text-sm text-gray-600">No users found</div>
                      )}
                    </div>
                  </div>
                )}
              </div>
              {targetUserId && (
                <div className="mt-2">
                  {(() => {
                    const selectedUser = usersOptions?.find((u) => u.id === targetUserId);
                    const employee = employees?.find((e: any) => e.id === targetUserId);
                    if (!selectedUser) return null;
                    return (
                      <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-800 rounded text-sm">
                        {employee?.profile_photo_file_id ? (
                          <img
                            src={withFileAccessToken(`/files/${employee.profile_photo_file_id}/thumbnail?w=64`)}
                            className="w-4 h-4 rounded-full object-cover"
                            alt=""
                          />
                        ) : (
                          <span className="w-4 h-4 rounded-full bg-gray-300 inline-block" />
                        )}
                        {selectedUser.name || selectedUser.username}
                        <button
                          type="button"
                          onClick={() => toggleUser(targetUserId)}
                          className="text-blue-600 hover:text-blue-800"
                        >
                          ×
                        </button>
                      </span>
                    );
                  })()}
                </div>
              )}
            </div>
          ) : (
            <div>
              <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide block mb-1">Select division</label>
              <select
                value={targetDivisionId}
                onChange={(e) => setTargetDivisionId(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-300 focus:border-gray-300"
              >
                <option value="">Choose division...</option>
                {divisions.map((division) => (
                  <option key={division.id} value={division.id}>
                    {division.label}
                  </option>
                ))}
              </select>
              <p className="text-[10px] text-gray-500 mt-1">
                Everyone in this division will see the request until someone accepts it.
              </p>
            </div>
          )}

            <div>
              <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide block mb-1">Project (optional)</label>
              <select
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-300 focus:border-gray-300"
              >
                <option value="">No project</option>
                {(projects || []).map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.code ? `${project.code} • ` : ''}
                    {project.name}
                  </option>
                ))}
              </select>
            </div>

            <AppDatePicker
              label="Due date (optional)"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />

            <div>
              <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide block mb-1">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-300 focus:border-gray-300"
                placeholder="Explain what needs to be done..."
              />
            </div>
          </form>
        </div>
        <div className="flex-shrink-0 px-4 py-4 border-t border-gray-200 bg-white flex items-center justify-end gap-3 rounded-b-xl">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-sm font-medium text-gray-700 border border-gray-200 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="create-task-request-form"
            disabled={!canSubmit || isSubmitting}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-brand-red hover:bg-[#aa1212] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? 'Creating...' : 'Create request'}
          </button>
        </div>
      </div>
    </div>
    </OverlayPortal>
  );
}

