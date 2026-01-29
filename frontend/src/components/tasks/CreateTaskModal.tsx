import { useState, useRef, useEffect } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import type { Task, TaskStatus } from './types';
import { getStatusBadgeClass, getStatusLabel, priorityDot, getStatusBorderColor } from './taskUi';

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated: (task: Task) => void;
};

const priorityOptions = [
  { value: 'low', label: 'Low' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
];

type UserOption = { id: string; username: string; email: string; name?: string };
type DivisionOption = { id: string; label: string };

export default function CreateTaskModal({ open, onClose, onCreated }: Props) {
  const queryClient = useQueryClient();
  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<TaskStatus>('accepted');
  const [priority, setPriority] = useState('normal');
  const [assignType, setAssignType] = useState<'user' | 'division'>('user');
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [selectedDivisionIds, setSelectedDivisionIds] = useState<string[]>([]);
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [divisionSearchQuery, setDivisionSearchQuery] = useState('');
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const [divisionDropdownOpen, setDivisionDropdownOpen] = useState(false);
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
  const statusDropdownRef = useRef<HTMLDivElement>(null);

  // Fetch users and divisions
  const { data: usersOptions = [] } = useQuery({
    queryKey: ['usersOptions', userSearchQuery],
    queryFn: () => api<UserOption[]>('GET', `/auth/users/options?limit=500${userSearchQuery ? `&q=${encodeURIComponent(userSearchQuery)}` : ''}`),
    enabled: open,
  });

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api<any>('GET', '/settings'),
    enabled: open,
  });

  const divisions: DivisionOption[] = (settings?.divisions || []) as DivisionOption[];

  const statusOptions: { value: TaskStatus; label: string }[] = [
    { value: 'accepted', label: 'To do' },
    { value: 'in_progress', label: 'In progress' },
    { value: 'blocked', label: 'Blocked' },
    { value: 'done', label: 'Done' },
  ];

  // Handle click outside for status dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (statusDropdownRef.current && !statusDropdownRef.current.contains(event.target as Node)) {
        setStatusDropdownOpen(false);
      }
    };
    if (statusDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [statusDropdownOpen]);

  const createMutation = useMutation({
    mutationFn: () => {
      const payload: any = {
        title: title.trim(),
        description: description.trim() || null,
        priority,
        status,
      };
      
      // Add assignments if specified
      if (selectedUserIds.length > 0) {
        payload.assigned_user_ids = selectedUserIds;
      }
      if (selectedDivisionIds.length > 0) {
        payload.assigned_division_ids = selectedDivisionIds;
      }
      
      return api<Task>('POST', '/tasks', payload);
    },
    onSuccess: (created) => {
      const totalAssigned = selectedUserIds.length + (selectedDivisionIds.length > 0 ? 'multiple' : 0);
      if (selectedUserIds.length > 1 || selectedDivisionIds.length > 0) {
        toast.success(`Tasks created for ${selectedUserIds.length > 0 ? selectedUserIds.length : 'multiple'} assignee(s)`);
      } else {
        toast.success('Task created');
      }
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      setTitle('');
      setDescription('');
      setStatus('accepted');
      setPriority('normal');
      setSelectedUserIds([]);
      setSelectedDivisionIds([]);
      setUserSearchQuery('');
      setDivisionSearchQuery('');
      setAssignType('user');
      onCreated(created);
    },
    onError: (err: any) => toast.error(err.message || 'Failed to create task'),
  });

  if (!open) return null;

  const canSubmit = title.trim().length > 0 && !createMutation.isLoading;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl max-w-[75vw] w-full max-h-[90vh] overflow-hidden flex flex-col shadow-xl border border-gray-200 relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Colored top border line */}
        <div className={`absolute top-0 left-0 right-0 h-1 ${getStatusBorderColor(status)}`} />

        {/* Header */}
        <div className="flex-shrink-0 px-4 py-4 border-b border-gray-200 flex items-start justify-between gap-4">
          <div className="flex-1 flex items-center gap-4">
            {/* Large icon */}
            <div className="w-12 h-12 rounded-xl bg-brand-red/10 flex items-center justify-center flex-shrink-0">
              <svg className="w-6 h-6 text-brand-red" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-semibold text-gray-900">New Task</span>
                {priority && (
                  <span
                    className={`w-2 h-2 rounded-full ${
                      priorityDot[priority] || priorityDot.normal
                    }`}
                    title={`Priority: ${priority}`}
                  />
                )}
              </div>
            </div>

            {/* Status dropdown */}
            <div className="relative" ref={statusDropdownRef}>
              <button
                type="button"
                onClick={() => setStatusDropdownOpen(!statusDropdownOpen)}
                className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors ${
                  getStatusBadgeClass(status)
                }`}
              >
                {getStatusLabel(status)}
              </button>
              {statusDropdownOpen && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setStatusDropdownOpen(false)}
                  />
                  <div className="absolute z-20 right-0 mt-1 bg-white border border-gray-200/60 rounded-lg shadow-lg min-w-[140px] overflow-hidden">
                    {statusOptions.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => {
                          setStatus(option.value);
                          setStatusDropdownOpen(false);
                        }}
                        className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 transition-colors ${
                          status === option.value ? 'bg-gray-100 font-medium' : ''
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="text-2xl font-bold text-gray-400 hover:text-gray-600 leading-none w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors absolute top-4 right-4"
            aria-label="Close"
            title="Close"
          >
            ×
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Title */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Title *</label>
            <input
              ref={titleInputRef}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What needs to be done?"
              disabled={createMutation.isLoading}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-xs focus:ring-2 focus:ring-brand-red/40 focus:border-brand-red/60 bg-white"
              autoFocus
            />
          </div>

          {/* Description */}
          <div className="rounded-xl border border-gray-200 bg-gray-50/50 p-4 space-y-2">
            <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Description</div>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={6}
              placeholder="Add details…"
              disabled={createMutation.isLoading}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-xs focus:ring-2 focus:ring-brand-red/40 focus:border-brand-red/60 bg-white"
            />
          </div>

          {/* Details */}
          <div className="rounded-xl border border-gray-200 bg-white">
            <div className="px-4 py-3 border-b border-gray-200">
              <div className="text-sm font-semibold text-gray-900">Details</div>
            </div>
            <div className="p-4 space-y-4">
              {/* Priority */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  Priority
                </label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                  disabled={createMutation.isLoading}
                  className="w-full rounded-lg border border-gray-200/60 px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-brand-red/30 focus:border-brand-red/50"
                >
                  {priorityOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>

          {/* Assign to */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-2">Assign to (optional)</label>
            <div className="flex gap-2 mb-2">
              <button
                type="button"
                onClick={() => {
                  setAssignType('user');
                  setSelectedDivisionIds([]); // Clear divisions when switching to users
                }}
                className={`flex-1 px-3 py-2 rounded-lg border transition-colors text-xs font-medium ${
                  assignType === 'user' 
                    ? 'bg-brand-red text-white border-brand-red' 
                    : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                }`}
              >
                Users
              </button>
              <button
                type="button"
                onClick={() => {
                  setAssignType('division');
                  setSelectedUserIds([]); // Clear users when switching to divisions
                }}
                className={`flex-1 px-3 py-2 rounded-lg border transition-colors text-xs font-medium ${
                  assignType === 'division' 
                    ? 'bg-brand-red text-white border-brand-red' 
                    : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                }`}
              >
                Divisions
              </button>
            </div>

            {assignType === 'user' ? (
              <div className="relative">
                <input
                  type="text"
                  value={userSearchQuery}
                  onChange={(e) => setUserSearchQuery(e.target.value)}
                  onFocus={() => setUserDropdownOpen(true)}
                  placeholder="Search users..."
                  className="w-full rounded-lg border border-gray-200/60 px-3 py-2 text-sm focus:ring-2 focus:ring-brand-red/40 focus:border-brand-red/60"
                />
                {userDropdownOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-10"
                      onClick={() => setUserDropdownOpen(false)}
                    />
                    <div className="absolute z-20 w-full bottom-full mb-1 bg-white border border-gray-200/60 rounded-lg shadow-lg max-h-80 overflow-hidden flex flex-col">
                      <div className="p-2 border-b border-gray-200/60">
                        <input
                          type="text"
                          value={userSearchQuery}
                          onChange={(e) => setUserSearchQuery(e.target.value)}
                          placeholder="Search by name or email..."
                          className="w-full rounded-lg border border-gray-200/60 px-3 py-1.5 text-sm focus:ring-2 focus:ring-brand-red/40 focus:border-brand-red/60 bg-white"
                          onClick={(e) => e.stopPropagation()}
                          autoFocus
                        />
                      </div>
                      <div className="overflow-y-auto max-h-64">
                        {usersOptions
                          .filter((u) => {
                            if (!userSearchQuery.trim()) return true;
                            const query = userSearchQuery.toLowerCase();
                            const name = (u.name || '').toLowerCase();
                            const username = (u.username || '').toLowerCase();
                            const email = (u.email || '').toLowerCase();
                            return name.includes(query) || username.includes(query) || email.includes(query);
                          })
                          .filter((u) => !selectedUserIds.includes(u.id))
                          .map((user) => (
                            <button
                              key={user.id}
                              type="button"
                              onClick={() => {
                                setSelectedUserIds([...selectedUserIds, user.id]);
                                setUserSearchQuery('');
                                setUserDropdownOpen(false);
                              }}
                              className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm border-b border-gray-100 last:border-b-0"
                            >
                              <div className="font-medium text-gray-900">{user.name || user.username}</div>
                              <div className="text-xs text-gray-500">{user.email}</div>
                            </button>
                          ))}
                        {usersOptions
                          .filter((u) => {
                            if (!userSearchQuery.trim()) return true;
                            const query = userSearchQuery.toLowerCase();
                            const name = (u.name || '').toLowerCase();
                            const username = (u.username || '').toLowerCase();
                            const email = (u.email || '').toLowerCase();
                            return name.includes(query) || username.includes(query) || email.includes(query);
                          })
                          .filter((u) => !selectedUserIds.includes(u.id)).length === 0 && (
                          <div className="px-3 py-2 text-sm text-gray-500">No users found</div>
                        )}
                      </div>
                    </div>
                  </>
                )}
                {selectedUserIds.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {selectedUserIds.map((userId) => {
                      const user = usersOptions.find((u) => u.id === userId);
                      return (
                        <span
                          key={userId}
                          className="inline-flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-700 rounded-full text-xs font-medium border border-blue-200"
                        >
                          {user?.name || user?.username || userId}
                          <button
                            type="button"
                            onClick={() => setSelectedUserIds(selectedUserIds.filter((id) => id !== userId))}
                            className="hover:text-blue-900"
                          >
                            ×
                          </button>
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setDivisionDropdownOpen(!divisionDropdownOpen)}
                  className="w-full px-3 py-2 border border-gray-200/60 rounded-lg text-left bg-white flex items-center justify-between focus:ring-2 focus:ring-brand-red/40 focus:border-brand-red/60"
                >
                  <span className={selectedDivisionIds.length === 0 ? 'text-gray-400' : ''}>
                    {selectedDivisionIds.length === 0
                      ? 'Select divisions...'
                      : selectedDivisionIds
                          .map((id) => divisions.find((d) => d.id === id)?.label)
                          .filter(Boolean)
                          .join(', ') || 'No divisions selected'}
                  </span>
                  <span className="text-gray-400">▼</span>
                </button>
                {divisionDropdownOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-10"
                      onClick={() => {
                        setDivisionDropdownOpen(false);
                        setDivisionSearchQuery('');
                      }}
                    />
                    <div className="absolute z-20 w-full bottom-full mb-1 bg-white border border-gray-200/60 rounded-lg shadow-lg max-h-80 overflow-hidden flex flex-col">
                      <div className="p-2 border-b border-gray-200/60">
                        <input
                          type="text"
                          value={divisionSearchQuery}
                          onChange={(e) => setDivisionSearchQuery(e.target.value)}
                          placeholder="Search by name..."
                          className="w-full rounded-lg border border-gray-200/60 px-3 py-1.5 text-sm focus:ring-2 focus:ring-brand-red/40 focus:border-brand-red/60 bg-white"
                          onClick={(e) => e.stopPropagation()}
                          autoFocus
                        />
                      </div>
                      <div className="overflow-y-auto max-h-64">
                        {divisions
                          .filter((div) => {
                            if (!divisionSearchQuery.trim()) return true;
                            const query = divisionSearchQuery.toLowerCase();
                            const label = (div.label || '').toLowerCase();
                            return label.includes(query);
                          })
                          .map((div) => (
                            <label
                              key={div.id}
                              className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <input
                                type="checkbox"
                                checked={selectedDivisionIds.includes(div.id)}
                                onChange={() => {
                                  if (selectedDivisionIds.includes(div.id)) {
                                    setSelectedDivisionIds(selectedDivisionIds.filter((id) => id !== div.id));
                                  } else {
                                    setSelectedDivisionIds([...selectedDivisionIds, div.id]);
                                  }
                                }}
                                className="rounded border-gray-300 text-brand-red focus:ring-brand-red"
                              />
                              <span className="text-sm">{div.label}</span>
                            </label>
                          ))}
                        {divisions
                          .filter((div) => {
                            if (!divisionSearchQuery.trim()) return true;
                            const query = divisionSearchQuery.toLowerCase();
                            const label = (div.label || '').toLowerCase();
                            return label.includes(query);
                          }).length === 0 && (
                          <div className="px-3 py-2 text-sm text-gray-500">No divisions found</div>
                        )}
                      </div>
                    </div>
                  </>
                )}
                {selectedDivisionIds.length > 0 && (
                  <div className="mt-2 text-xs text-gray-600">
                    Tasks will be created for all active users in the selected division(s).
                  </div>
                )}
              </div>
            )}
              </div>
            </div>
          </div>
        </div>

        <div className="flex-shrink-0 border-t border-gray-200 px-4 py-4 bg-white flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors text-xs font-medium"
            disabled={createMutation.isLoading}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => createMutation.mutate()}
            disabled={!canSubmit}
            className="px-3 py-2 bg-brand-red text-white rounded-lg hover:opacity-90 transition-colors text-xs font-medium disabled:opacity-60"
          >
            {createMutation.isLoading ? 'Creating…' : 'Create task'}
          </button>
        </div>
      </div>
    </div>
  );
}

