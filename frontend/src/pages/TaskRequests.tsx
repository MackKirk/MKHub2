import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import { useNavigate, useLocation } from 'react-router-dom';

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

const priorityBadge: Record<string, string> = {
  urgent: 'bg-red-100 text-red-700 border-red-200',
  high: 'bg-orange-100 text-orange-700 border-orange-200',
  normal: 'bg-blue-100 text-blue-700 border-blue-200',
  low: 'bg-slate-100 text-slate-600 border-slate-200',
};

const statusColors: Record<string, string> = {
  new: 'bg-slate-100 text-slate-600 border-slate-200',
  needs_info: 'bg-amber-100 text-amber-700 border-amber-200',
  accepted: 'bg-green-100 text-green-700 border-green-200',
  refused: 'bg-rose-100 text-rose-700 border-rose-200',
};

const priorityOptions = [
  { value: 'low', label: 'Low' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
];

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
    const allRequests = [...received, ...sent];
    const recentActivity = allRequests.sort((a, b) => {
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
      return notifications.recentActivity;
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
      return notifications.recentActivity.filter((r) => r.status === 'needs_info');
    }
    if (activeTab === 'completed') {
      return notifications.recentActivity.filter((r) => r.status === 'accepted' || r.status === 'refused');
    }
    return notifications.recentActivity;
  }, [notifications.recentActivity, activeTab, data]);

  // Get status color system
  const getStatusConfig = (status: string) => {
    if (status === 'new') return { bg: 'bg-blue-100', text: 'text-blue-700', border: 'border-blue-200', label: 'New' };
    if (status === 'needs_info') return { bg: 'bg-amber-100', text: 'text-amber-700', border: 'border-amber-200', label: 'Awaiting Info' };
    if (status === 'accepted') return { bg: 'bg-green-100', text: 'text-green-700', border: 'border-green-200', label: 'Completed' };
    if (status === 'refused') return { bg: 'bg-rose-100', text: 'text-rose-700', border: 'border-rose-200', label: 'Rejected' };
    return { bg: 'bg-gray-100', text: 'text-gray-600', border: 'border-gray-200', label: status };
  };

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
    <div className="space-y-6">
      {/* Page Header */}
      <div className="bg-slate-200/50 rounded-[12px] border border-slate-200 py-4 px-6 mb-6">
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight mb-1.5">Requests</h1>
        <p className="text-sm text-gray-600 font-medium">Conversations that may become tasks</p>
      </div>
      
      {/* Tabs and Action Button */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-1 border-b border-gray-200">
          <button
            onClick={() => setActiveTab('all')}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-[1px] ${
              activeTab === 'all'
                ? 'border-brand-red text-brand-red'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            All
          </button>
          <button
            onClick={() => setActiveTab('received')}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-[1px] ${
              activeTab === 'received'
                ? 'border-brand-red text-brand-red'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            Received
          </button>
          <button
            onClick={() => setActiveTab('sent')}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-[1px] ${
              activeTab === 'sent'
                ? 'border-brand-red text-brand-red'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            Sent
          </button>
          <button
            onClick={() => setActiveTab('needs_info')}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-[1px] ${
              activeTab === 'needs_info'
                ? 'border-brand-red text-brand-red'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            Awaiting Info
          </button>
          <button
            onClick={() => setActiveTab('completed')}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-[1px] ${
              activeTab === 'completed'
                ? 'border-brand-red text-brand-red'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            Completed
          </button>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 bg-brand-red text-white rounded-lg hover:bg-red-700 transition-colors font-medium text-sm shadow-sm flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          New Request
          </button>
        </div>

      {/* Two-Column Layout */}
      <div className="grid grid-cols-[1fr_1.5fr] gap-6">
        {/* Left: Requests List */}
        <div className="bg-white rounded-lg border border-gray-200/60 shadow-sm overflow-hidden">
          {isLoading ? (
            <div className="p-8 text-center text-sm text-gray-500">Loading requests...</div>
          ) : filteredRequests.length === 0 ? (
            <div className="p-12 text-center">
              <div className="text-sm text-gray-500 mb-2">
                {activeTab === 'all'
                  ? 'No requests yet. Create your first request to get started.'
                  : `No ${activeTab === 'needs_info' ? 'awaiting info' : activeTab} requests.`}
              </div>
              {activeTab === 'all' && (
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="mt-4 px-4 py-2 bg-brand-red text-white rounded-lg hover:bg-red-700 transition-colors font-medium text-sm"
                >
                  Create Request
                </button>
              )}
            </div>
          ) : (
            <div className="divide-y divide-gray-200/60 max-h-[calc(100vh-300px)] overflow-y-auto">
              {filteredRequests.map((req) => {
                const isReceived = data?.received?.some((r) => r.id === req.id);
                const statusConfig = getStatusConfig(req.status);
                const isSelected = selectedRequestId === req.id;
                
                // Get status border color
                const statusBorderColor = 
                  req.status === 'new' ? 'border-l-blue-500' :
                  req.status === 'needs_info' ? 'border-l-amber-500' :
                  req.status === 'accepted' ? 'border-l-green-500' :
                  req.status === 'refused' ? 'border-l-rose-500' :
                  'border-l-gray-400';

                return (
        <button
                    key={req.id}
                    onClick={() => handleRequestClick(req.id)}
                    className={`w-full text-left p-4 transition-all duration-200 cursor-pointer group relative ${
                      isSelected 
                        ? 'bg-brand-red/5 border-l-4 border-l-brand-red' 
                        : `hover:bg-gray-50 border-l-4 ${statusBorderColor}`
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <h3 className={`text-sm font-semibold ${isSelected ? 'text-brand-red' : 'text-gray-900 group-hover:text-brand-red'} transition-colors`}>
                            {req.title}
                          </h3>
                          <span className={`text-[10px] uppercase tracking-wide rounded-full border px-2 py-0.5 font-semibold shrink-0 ${statusConfig.bg} ${statusConfig.text} ${statusConfig.border}`}>
                            {statusConfig.label}
                          </span>
            </div>
                        <div className="text-xs text-gray-600 mb-1">
                          {isReceived ? (
                            <span>From <span className="font-medium text-gray-900">{req.requested_by?.name || 'Unknown'}</span></span>
                          ) : (
                            <span>To <span className="font-medium text-gray-900">
                              {req.target.type === 'user' 
                                ? req.target.user_name || 'User'
                                : req.target.division_label || 'Division'}
                            </span></span>
                          )}
          </div>
                        <div className="text-xs text-gray-400">{formatTimeAgo(req.updated_at || req.created_at)}</div>
                </div>
              </div>
                  </button>
                );
              })}
            </div>
          )}
            </div>

        {/* Right: Request Details Panel */}
        <RequestDetailsPanel
          requestId={selectedRequestId}
          onRefresh={invalidateAll}
        />
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

  const getStatusConfig = (status: string) => {
    if (status === 'new') return { bg: 'bg-blue-100', text: 'text-blue-700', border: 'border-blue-200', label: 'New' };
    if (status === 'needs_info') return { bg: 'bg-amber-100', text: 'text-amber-700', border: 'border-amber-200', label: 'Awaiting Info' };
    if (status === 'accepted') return { bg: 'bg-green-100', text: 'text-green-700', border: 'border-green-200', label: 'Completed' };
    if (status === 'refused') return { bg: 'bg-rose-100', text: 'text-rose-700', border: 'border-rose-200', label: 'Rejected' };
    return { bg: 'bg-gray-100', text: 'text-gray-600', border: 'border-gray-200', label: status };
  };

  if (!requestId) {
    return (
      <div className="bg-white rounded-lg border border-gray-200/60 shadow-sm p-8 flex items-center justify-center">
        <div className="text-center">
          <div className="text-sm text-gray-500">Select a request to view details</div>
          </div>
                </div>
    );
  }

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg border border-gray-200/60 shadow-sm p-8">
        <div className="text-sm text-gray-500">Loading request details...</div>
              </div>
    );
  }

  if (!request) {
    return (
      <div className="bg-white rounded-lg border border-gray-200/60 shadow-sm p-8">
        <div className="text-sm text-gray-500">Request not found</div>
            </div>
    );
  }

  const statusConfig = getStatusConfig(request.status);

  return (
    <div className="bg-white rounded-lg border border-gray-200/60 shadow-sm flex flex-col" style={{ maxHeight: 'calc(100vh - 300px)' }}>
      {/* Header */}
      <div className="p-6 border-b border-gray-200/60">
        <div className="flex items-start justify-between gap-3 mb-3">
          <h2 className="text-lg font-semibold text-gray-900">{request.title}</h2>
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs uppercase tracking-wide rounded-full border px-2 py-1 font-semibold ${statusConfig.bg} ${statusConfig.text} ${statusConfig.border}`}>
              {statusConfig.label}
            </span>
            <span className={`text-xs uppercase tracking-wide rounded-full border px-2 py-1 font-semibold ${priorityBadge[request.priority] || priorityBadge.normal}`}>
              {request.priority}
            </span>
            </div>
          </div>
        <div className="text-sm text-gray-600 space-y-1">
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

      {/* Body: Conversation Timeline */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {request.description && (
          <div className="rounded-lg border border-gray-200/60 bg-gray-50/50 p-4">
            <div className="text-xs text-gray-500 mb-1">Initial Request</div>
            <div className="text-sm text-gray-700 whitespace-pre-wrap">{request.description}</div>
          </div>
        )}

        {request.messages && request.messages.length > 0 ? (
          <div className="space-y-3">
            {request.messages.map((msg) => (
              <div key={msg.id} className="rounded-lg border border-gray-200/60 bg-white p-4">
                <div className="flex items-center justify-between text-xs text-gray-500 mb-2">
                  <span className="font-medium">{msg.sender_name || 'System'}</span>
                  <span>{new Date(msg.created_at).toLocaleString()}</span>
                </div>
                <div className="text-sm text-gray-800 whitespace-pre-wrap">{msg.body}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-sm text-gray-500 text-center py-4">No messages yet</div>
        )}
      </div>

      {/* Footer: Actions */}
      <div className="p-6 border-t border-gray-200/60 space-y-4 bg-gray-50/50">
        {request.permissions.can_request_info && (
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">Request more information</label>
            <textarea
              value={infoMessage}
              onChange={(e) => setInfoMessage(e.target.value)}
              rows={2}
              placeholder="What information do you need?"
              className="w-full rounded-lg border border-gray-200/60 px-3 py-2 text-sm focus:ring-2 focus:ring-brand-red/40 focus:border-brand-red/60"
            />
        <button
              onClick={() => askInfoMutation.mutate(infoMessage)}
              disabled={askInfoMutation.isLoading || !infoMessage.trim()}
              className="px-4 py-2 bg-brand-red text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-medium disabled:opacity-60"
        >
              {askInfoMutation.isLoading ? 'Sending...' : 'Send Request'}
            </button>
          </div>
        )}

        {request.permissions.can_provide_info && (
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">Provide clarification</label>
            <textarea
              value={clarificationMessage}
              onChange={(e) => setClarificationMessage(e.target.value)}
              rows={2}
              placeholder="Add the requested information..."
              className="w-full rounded-lg border border-gray-200/60 px-3 py-2 text-sm focus:ring-2 focus:ring-brand-red/40 focus:border-brand-red/60"
            />
            <button
              onClick={() => provideInfoMutation.mutate(clarificationMessage)}
              disabled={provideInfoMutation.isLoading || !clarificationMessage.trim()}
              className="px-4 py-2 bg-brand-red text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-medium disabled:opacity-60"
            >
              {provideInfoMutation.isLoading ? 'Sending...' : 'Send Clarification'}
        </button>
      </div>
        )}

        <div className="flex items-center gap-2 pt-2 border-t border-gray-200/60">
          {request.permissions.can_accept && (
            <button
              onClick={() => acceptMutation.mutate()}
              disabled={acceptMutation.isLoading}
              className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium disabled:opacity-60"
            >
              {acceptMutation.isLoading ? 'Creating...' : 'Accept & Create Task'}
            </button>
          )}
          {request.permissions.can_refuse && (
            <>
              {!showRefuseForm ? (
                <button
                  onClick={() => setShowRefuseForm(true)}
                  disabled={refuseMutation.isLoading || acceptMutation.isLoading}
                  className="px-4 py-2 bg-rose-600 text-white rounded-lg hover:bg-rose-700 transition-colors text-sm font-medium disabled:opacity-60"
                >
                  Refuse
                </button>
              ) : (
                <div className="flex-1 space-y-2">
                  <textarea
                    value={refuseMessage}
                    onChange={(e) => setRefuseMessage(e.target.value)}
                    rows={2}
                    placeholder="Reason (optional)"
                    className="w-full rounded-lg border border-gray-200/60 px-3 py-2 text-sm"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => refuseMutation.mutate(refuseMessage)}
                      disabled={refuseMutation.isLoading}
                      className="px-4 py-2 bg-rose-600 text-white rounded-lg hover:bg-rose-700 transition-colors text-sm font-medium disabled:opacity-60"
                    >
                      Confirm Refusal
                    </button>
                    <button
                      onClick={() => {
                        setShowRefuseForm(false);
                        setRefuseMessage('');
                      }}
                      className="px-4 py-2 border border-gray-200/60 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium"
                    >
                      Cancel
                    </button>
        </div>
            </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
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

  const getStatusConfig = (status: string) => {
    if (status === 'new') return { bg: 'bg-blue-100', text: 'text-blue-700', border: 'border-blue-200', label: 'New' };
    if (status === 'needs_info') return { bg: 'bg-amber-100', text: 'text-amber-700', border: 'border-amber-200', label: 'Awaiting Info' };
    if (status === 'accepted') return { bg: 'bg-green-100', text: 'text-green-700', border: 'border-green-200', label: 'Completed' };
    if (status === 'refused') return { bg: 'bg-rose-100', text: 'text-rose-700', border: 'border-rose-200', label: 'Rejected' };
    return { bg: 'bg-gray-100', text: 'text-gray-600', border: 'border-gray-200', label: status };
  };

  if (isLoading) {
                return (
                  <div
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
        onClick={onClose}
      >
        <div 
          className="bg-white rounded-2xl shadow-xl w-full max-w-[75vw] max-h-[90vh] overflow-hidden flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="p-8 text-center text-gray-500">Loading request details...</div>
                    </div>
                  </div>
                );
  }

  if (!request) {
    return (
      <div 
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
        onClick={onClose}
      >
        <div 
          className="bg-white rounded-2xl shadow-xl w-full max-w-[75vw] max-h-[90vh] overflow-hidden flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="p-8 text-center text-gray-500">Request not found</div>
        </div>
      </div>
    );
  }

  const statusConfig = getStatusConfig(request.status);

  return (
    <div 
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div 
        className="bg-white rounded-2xl shadow-xl w-full max-w-[75vw] max-h-[90vh] overflow-hidden flex flex-col border border-gray-200/60"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 border-b border-gray-200/60 flex-shrink-0">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-lg bg-brand-red/10 flex items-center justify-center">
                  <svg className="w-5 h-5 text-brand-red" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h2 className="text-xl font-semibold text-gray-900">{request.title}</h2>
                  <p className="text-sm text-gray-600 mt-1">Request details and conversation</p>
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
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {request.description && (
              <div className="rounded-xl border border-gray-200/60 bg-gray-50/50 p-5">
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Initial Request</div>
                <div className="text-sm text-gray-700 whitespace-pre-wrap">{request.description}</div>
            </div>
          )}

            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-4">Conversation</h3>
              {request.messages && request.messages.length > 0 ? (
                <div className="space-y-4">
                  {request.messages.map((msg) => (
                    <div key={msg.id} className="rounded-xl border border-gray-200/60 bg-white p-4">
                      <div className="flex items-center justify-between text-xs text-gray-500 mb-2">
                        <span className="font-medium">{msg.sender_name || 'System'}</span>
                        <span>{new Date(msg.created_at).toLocaleString()}</span>
        </div>
                      <div className="text-sm text-gray-800 whitespace-pre-wrap">{msg.body}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-gray-500 text-center py-8 border border-gray-200/60 rounded-xl bg-gray-50/50">
                  No messages yet
                </div>
              )}
      </div>

            {/* Action Inputs */}
            {request.permissions.can_request_info && (
              <div className="rounded-xl border border-gray-200/60 bg-gray-50/50 p-5 space-y-3">
                <label className="block text-sm font-medium text-gray-700">Request more information</label>
                <textarea
                  value={infoMessage}
                  onChange={(e) => setInfoMessage(e.target.value)}
                  rows={3}
                  placeholder="What information do you need?"
                  className="w-full rounded-lg border border-gray-200/60 px-4 py-2 text-sm focus:ring-2 focus:ring-brand-red/40 focus:border-brand-red/60"
                />
                <button
                  onClick={() => askInfoMutation.mutate(infoMessage)}
                  disabled={askInfoMutation.isLoading || !infoMessage.trim()}
                  className="px-4 py-2 bg-brand-red text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-medium disabled:opacity-60"
                >
                  {askInfoMutation.isLoading ? 'Sending...' : 'Send Request'}
                </button>
              </div>
            )}

            {request.permissions.can_provide_info && (
              <div className="rounded-xl border border-gray-200/60 bg-gray-50/50 p-5 space-y-3">
                <label className="block text-sm font-medium text-gray-700">Provide clarification</label>
                <textarea
                  value={clarificationMessage}
                  onChange={(e) => setClarificationMessage(e.target.value)}
                  rows={3}
                  placeholder="Add the requested information..."
                  className="w-full rounded-lg border border-gray-200/60 px-4 py-2 text-sm focus:ring-2 focus:ring-brand-red/40 focus:border-brand-red/60"
                />
                <button
                  onClick={() => provideInfoMutation.mutate(clarificationMessage)}
                  disabled={provideInfoMutation.isLoading || !clarificationMessage.trim()}
                  className="px-4 py-2 bg-brand-red text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-medium disabled:opacity-60"
                >
                  {provideInfoMutation.isLoading ? 'Sending...' : 'Send Clarification'}
                </button>
              </div>
            )}
          </div>

          {/* Right: Context Panel */}
          <div className="w-80 border-l border-gray-200/60 bg-gray-50/30 p-6 space-y-5 flex-shrink-0 overflow-y-auto">
            <div>
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Status</div>
              <div className="flex flex-wrap gap-2">
                <span className={`text-xs uppercase tracking-wide rounded-full border px-3 py-1.5 font-semibold ${statusConfig.bg} ${statusConfig.text} ${statusConfig.border}`}>
                  {statusConfig.label}
                </span>
                <span className={`text-xs uppercase tracking-wide rounded-full border px-3 py-1.5 font-semibold ${priorityBadge[request.priority] || priorityBadge.normal}`}>
                  {request.priority}
                </span>
              </div>
            </div>

            <div>
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Details</div>
              <div className="space-y-3 text-sm">
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
        <div className="p-6 border-t border-gray-200/60 bg-gray-50/50 flex items-center justify-end gap-3 flex-shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-gray-200/60 hover:bg-gray-50 transition-colors text-sm font-medium"
          >
            Close
          </button>
          {request.permissions.can_refuse && !showRefuseForm && (
            <button
              onClick={() => setShowRefuseForm(true)}
              disabled={refuseMutation.isLoading || acceptMutation.isLoading}
              className="px-4 py-2 bg-rose-600 text-white rounded-lg hover:bg-rose-700 transition-colors text-sm font-medium disabled:opacity-60"
            >
              Refuse
            </button>
          )}
          {showRefuseForm && request.permissions.can_refuse && (
            <div className="flex-1 space-y-2">
              <textarea
                value={refuseMessage}
                onChange={(e) => setRefuseMessage(e.target.value)}
                rows={2}
                placeholder="Reason (optional)"
                className="w-full rounded-lg border border-gray-200/60 px-3 py-2 text-sm"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => refuseMutation.mutate(refuseMessage)}
                  disabled={refuseMutation.isLoading}
                  className="px-4 py-2 bg-rose-600 text-white rounded-lg hover:bg-rose-700 transition-colors text-sm font-medium disabled:opacity-60"
                >
                  Confirm Refusal
                </button>
                <button
                  onClick={() => {
                    setShowRefuseForm(false);
                    setRefuseMessage('');
                  }}
                  className="px-4 py-2 border border-gray-200/60 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
          {request.permissions.can_accept && (
            <button
              onClick={() => acceptMutation.mutate()}
              disabled={acceptMutation.isLoading || (showRefuseForm && refuseMutation.isLoading)}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium disabled:opacity-60"
            >
              {acceptMutation.isLoading ? 'Creating...' : 'Accept & Create Task'}
            </button>
          )}
        </div>
      </div>
    </div>
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

  return (
    <div 
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div 
        className="bg-white rounded-2xl shadow-xl w-full max-w-[75vw] max-h-[90vh] overflow-hidden flex flex-col border border-gray-200/60"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 border-b border-gray-200/60 flex-shrink-0">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-brand-red/10 flex items-center justify-center">
                <svg className="w-5 h-5 text-brand-red" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </div>
              <div>
                <h2 className="text-xl font-semibold text-gray-900">Create Request</h2>
                <p className="text-sm text-gray-600 mt-1">Start a conversation that may become a task</p>
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
        <form onSubmit={handleSubmit} className="flex-1 overflow-hidden flex">
          {/* Left: Main Form */}
          <div className="flex-1 overflow-y-auto p-6 space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-lg border border-gray-200/60 px-3 py-2 focus:ring-2 focus:ring-brand-red/40 focus:border-brand-red/60"
              placeholder="Short summary"
            />
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Send to</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setTargetType('user')}
                  className={`flex-1 px-3 py-2 rounded-lg border transition-colors ${
                    targetType === 'user' 
                      ? 'bg-brand-red text-white border-brand-red' 
                      : 'bg-white text-gray-700 border-gray-200/60 hover:bg-gray-50'
                  }`}
                >
                  Specific user
                </button>
                <button
                  type="button"
                  onClick={() => setTargetType('division')}
                  className={`flex-1 px-3 py-2 rounded-lg border transition-colors ${
                    targetType === 'division' 
                      ? 'bg-brand-red text-white border-brand-red' 
                      : 'bg-white text-gray-700 border-gray-200/60 hover:bg-gray-50'
                  }`}
                >
                  Division
                </button>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="w-full rounded-lg border border-gray-200/60 px-3 py-2 focus:ring-2 focus:ring-brand-red/40 focus:border-brand-red/60"
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
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Choose a user {targetUserId && '(1 selected)'}
              </label>
              <div className="relative" ref={workerDropdownRef}>
                <button
                  type="button"
                  onClick={() => setWorkerDropdownOpen(!workerDropdownOpen)}
                  className="w-full border border-gray-200/60 rounded-lg px-3 py-2 text-left bg-white flex items-center justify-between hover:bg-gray-50"
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
                  <div className="absolute z-50 mt-1 w-full rounded-lg border border-gray-200/60 bg-white shadow-lg max-h-60 overflow-auto">
                    <div className="p-2 border-b border-gray-200/60">
                      <input
                        type="text"
                        placeholder="Search user..."
                        value={userSearch}
                        onChange={(e) => setUserSearch(e.target.value)}
                        className="w-full border border-gray-200/60 rounded-lg px-2 py-1 text-sm"
                      />
                    </div>
                    <div className="p-2">
                      {filteredUsers.length > 0 ? (
                        filteredUsers.map((user) => {
                          const employee = employees?.find((e: any) => e.id === user.id);
                          return (
                            <label
                              key={user.id}
                              className="flex items-center gap-2 p-2 hover:bg-gray-50 cursor-pointer rounded"
                            >
                              <input
                                type="checkbox"
                                checked={targetUserId === user.id}
                                onChange={() => toggleUser(user.id)}
                                className="rounded"
                              />
                              <div className="flex items-center gap-2 flex-1">
                                {employee?.profile_photo_file_id ? (
                                  <img
                                    src={`/files/${employee.profile_photo_file_id}/thumbnail?w=64`}
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
            </div>
          ) : (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Select division</label>
              <select
                value={targetDivisionId}
                onChange={(e) => setTargetDivisionId(e.target.value)}
                className="w-full rounded-lg border border-gray-200/60 px-3 py-2 focus:ring-2 focus:ring-brand-red/40 focus:border-brand-red/60"
              >
                <option value="">Choose division...</option>
                {divisions.map((division) => (
                  <option key={division.id} value={division.id}>
                    {division.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Project (optional)</label>
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="w-full rounded-lg border border-gray-200/60 px-3 py-2 focus:ring-2 focus:ring-brand-red/40 focus:border-brand-red/60"
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

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Due date (optional)</label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full rounded-lg border border-gray-200/60 px-3 py-2 focus:ring-2 focus:ring-brand-red/40 focus:border-brand-red/60"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              className="w-full rounded-lg border border-gray-200/60 px-3 py-2 focus:ring-2 focus:ring-brand-red/40 focus:border-brand-red/60"
              placeholder="Explain what needs to be done..."
            />
          </div>
          </div>

          {/* Right: Context Panel */}
          <div className="w-80 border-l border-gray-200/60 bg-gray-50/30 p-6 space-y-5 flex-shrink-0 overflow-y-auto">
            <div>
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Quick Info</div>
              <div className="text-sm text-gray-600 space-y-2">
                <p>Requests allow you to start conversations before creating tasks.</p>
                <p>You can exchange information and clarify requirements before accepting.</p>
              </div>
            </div>
          </div>
        </form>

        {/* Footer */}
        <div className="p-6 border-t border-gray-200/60 bg-gray-50/50 flex items-center justify-end gap-3 flex-shrink-0">
          <button 
            type="button" 
            onClick={onClose} 
            className="px-4 py-2 rounded-lg border border-gray-200/60 hover:bg-gray-50 transition-colors text-sm font-medium"
          >
            Cancel
          </button>
          <button
            type="submit"
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="px-4 py-2 rounded-lg bg-brand-red text-white hover:bg-red-700 transition-colors text-sm font-medium disabled:opacity-60"
          >
            {isSubmitting ? 'Creating...' : 'Create Request'}
          </button>
        </div>
      </div>
    </div>
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
      <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl max-w-7xl w-full max-h-[90vh] overflow-hidden flex flex-col">
          <div className="sticky top-0 bg-white border-b p-4 flex items-center justify-between">
            <h2 className="text-xl font-semibold">{title}</h2>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowHistoryModal(true)}
                className="px-4 py-2 text-sm font-medium rounded border border-gray-300 hover:bg-gray-50 transition-colors"
              >
                History
                {historyRequests.length > 0 && (
                  <span className="ml-2 px-1.5 py-0.5 bg-brand-red text-white text-xs font-semibold rounded-full">
                    {historyRequests.length}
                  </span>
                )}
              </button>
              <button onClick={onClose} className="text-2xl font-bold text-gray-400 hover:text-gray-600">
                ×
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-hidden flex">
            {/* Left side - List */}
            <div className="w-80 border-r bg-gray-50 overflow-y-auto flex flex-col">
              <div className="p-3 border-b bg-white">
                <div className="text-sm font-medium text-gray-700">
                  {activeRequests.length} request{activeRequests.length !== 1 ? 's' : ''}{' '}
                  <span className="text-xs text-gray-500">(in process)</span>
                </div>
              </div>
              <div className="divide-y flex-1">
                {isLoading ? (
                  <div className="p-4 text-sm text-gray-500">Loading...</div>
                ) : activeRequests.length === 0 ? (
                  <div className="p-4 text-sm text-gray-500">No active requests</div>
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
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full border shrink-0 ${
                          statusColors[req.status] || 'bg-gray-100 text-gray-600 border-gray-200'
                        }`}
                      >
                        {req.status_label}
                      </span>
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
                    <h2 className="text-xl font-semibold">{selected.title}</h2>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full border ${
                        statusColors[selected.status] || 'bg-gray-100 text-gray-600 border-gray-200'
                      }`}
                    >
                      {selected.status_label}
                    </span>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full border ${
                        priorityBadge[selected.priority] || priorityBadge.normal
                      }`}
                    >
                      Priority: {selected.priority}
                    </span>
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
                        <div className="flex items-center gap-2">
                          {selected.permissions.can_refuse && (
                            <button
                              onClick={() => setShowRefuseForm(!showRefuseForm)}
                              disabled={refuseMutation.isLoading || acceptMutation.isLoading}
                              className="px-4 py-2 rounded bg-red-600 text-white hover:bg-red-700 transition disabled:opacity-60"
                            >
                              Refuse request
                            </button>
                          )}
                          {selected.permissions.can_accept && (
                            <button
                              onClick={() => acceptMutation.mutate()}
                              disabled={acceptMutation.isLoading || (showRefuseForm && refuseMutation.isLoading)}
                              className="px-4 py-2 rounded bg-green-600 text-white hover:bg-green-700 transition disabled:opacity-60"
                            >
                              {acceptMutation.isLoading ? 'Creating...' : 'Accept and create Task'}
                            </button>
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
    <div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl max-w-7xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="sticky top-0 bg-white border-b p-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold">{title}</h2>
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
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full border shrink-0 ${
                          statusColors[req.status] || 'bg-gray-100 text-gray-600 border-gray-200'
                        }`}
                      >
                        {req.status_label}
                      </span>
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
                    <h2 className="text-xl font-semibold">{selected.title}</h2>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full border ${
                        statusColors[selected.status] || 'bg-gray-100 text-gray-600 border-gray-200'
                      }`}
                    >
                      {selected.status_label}
                    </span>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full border ${
                        priorityBadge[selected.priority] || priorityBadge.normal
                      }`}
                    >
                      Priority: {selected.priority}
                    </span>
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
    <div
      className={`rounded-lg border p-4 ${
        variant === 'danger' ? 'border-rose-200 bg-rose-50' : 'border-gray-200 bg-gray-50'
      }`}
    >
      <div className="space-y-2">
        <div>
          <div className="font-semibold text-gray-900">{title}</div>
          <p className="text-sm text-gray-600">{description}</p>
        </div>
        <textarea
          value={textareaValue}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          placeholder="Type your message..."
          className="w-full rounded border px-3 py-2 text-sm"
        />
        <button
          onClick={onSubmit}
          disabled={disabled || (requireText && !textareaValue.trim())}
          className={`px-4 py-2 rounded text-white transition ${
            variant === 'danger' ? 'bg-rose-600 hover:bg-rose-700' : 'bg-brand-red hover:bg-red-700'
          } disabled:opacity-60`}
        >
          {actionLabel}
        </button>
      </div>
    </div>
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

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        <div className="p-5 border-b flex items-center justify-between">
          <div>
            <div className="text-lg font-semibold text-gray-900">Create Task Request</div>
            <p className="text-sm text-gray-600">Share the context and choose who should receive it.</p>
          </div>
          <button onClick={onClose} className="text-2xl leading-none text-gray-500 hover:text-gray-700">
            ×
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded border px-3 py-2"
              placeholder="Short summary"
            />
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Send to</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setTargetType('user')}
                  className={`flex-1 px-3 py-2 rounded border ${
                    targetType === 'user' ? 'bg-brand-red text-white border-brand-red' : 'bg-white text-gray-700'
                  }`}
                >
                  Specific user
                </button>
                <button
                  type="button"
                  onClick={() => setTargetType('division')}
                  className={`flex-1 px-3 py-2 rounded border ${
                    targetType === 'division' ? 'bg-brand-red text-white border-brand-red' : 'bg-white text-gray-700'
                  }`}
                >
                  Division
                </button>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="w-full rounded border px-3 py-2"
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
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Choose a user {targetUserId && '(1 selected)'}
              </label>
              <div className="relative" ref={workerDropdownRef}>
                <button
                  type="button"
                  onClick={() => setWorkerDropdownOpen(!workerDropdownOpen)}
                  className="w-full border rounded px-3 py-2 text-left bg-white flex items-center justify-between"
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
                        className="w-full border rounded px-2 py-1 text-sm"
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
                                    src={`/files/${employee.profile_photo_file_id}/thumbnail?w=64`}
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
                            src={`/files/${employee.profile_photo_file_id}/thumbnail?w=64`}
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
              <label className="block text-sm font-medium text-gray-700 mb-1">Select division</label>
              <select
                value={targetDivisionId}
                onChange={(e) => setTargetDivisionId(e.target.value)}
                className="w-full rounded border px-3 py-2"
              >
                <option value="">Choose division...</option>
                {divisions.map((division) => (
                  <option key={division.id} value={division.id}>
                    {division.label}
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-500 mt-1">
                Everyone in this division will see the request until someone accepts it.
              </p>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Project (optional)</label>
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="w-full rounded border px-3 py-2"
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

          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Due date (optional)</label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full rounded border px-3 py-2"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              className="w-full rounded border px-3 py-2"
              placeholder="Explain what needs to be done..."
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded border">
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 rounded bg-brand-red text-white hover:bg-red-700 transition disabled:opacity-60"
            >
              {isSubmitting ? 'Creating...' : 'Create request'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

