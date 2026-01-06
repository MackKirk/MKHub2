import { useState } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import type { Task } from './types';

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
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('normal');
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [selectedDivisionIds, setSelectedDivisionIds] = useState<string[]>([]);
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const [divisionDropdownOpen, setDivisionDropdownOpen] = useState(false);

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

  const createMutation = useMutation({
    mutationFn: () => {
      const payload: any = {
        title: title.trim(),
        description: description.trim() || null,
        priority,
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
      setPriority('normal');
      setSelectedUserIds([]);
      setSelectedDivisionIds([]);
      setUserSearchQuery('');
      onCreated(created);
    },
    onError: (err: any) => toast.error(err.message || 'Failed to create task'),
  });

  if (!open) return null;

  const canSubmit = title.trim().length > 0 && !createMutation.isLoading;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl max-w-xl w-full max-h-[90vh] overflow-hidden flex flex-col shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex-shrink-0 px-6 py-4 border-b border-gray-200/60 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">New task</h2>
            <p className="text-sm text-gray-600">
              {selectedUserIds.length > 0 || selectedDivisionIds.length > 0
                ? `Will create task${selectedUserIds.length > 1 || selectedDivisionIds.length > 0 ? 's' : ''} for selected assignee(s)`
                : 'Create a task for yourself.'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-2xl font-bold text-gray-400 hover:text-gray-600 leading-none px-2"
            aria-label="Close"
            title="Close"
          >
            ×
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What needs to be done?"
              className="w-full rounded-lg border border-gray-200/60 px-3 py-2 text-sm focus:ring-2 focus:ring-brand-red/40 focus:border-brand-red/60"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className="w-full rounded-lg border border-gray-200/60 px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-brand-red/40 focus:border-brand-red/60"
            >
              {priorityOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description (optional)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              placeholder="Add any helpful details…"
              className="w-full rounded-lg border border-gray-200/60 px-3 py-2 text-sm focus:ring-2 focus:ring-brand-red/40 focus:border-brand-red/60"
            />
          </div>

          {/* Assign to Users */}
          <div className="relative">
            <label className="block text-sm font-medium text-gray-700 mb-1">Assign to Users (optional)</label>
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
                  <div className="absolute z-20 w-full mt-1 bg-white border border-gray-200/60 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                    {usersOptions
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
                          className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm"
                        >
                          <div className="font-medium text-gray-900">{user.name || user.username}</div>
                          <div className="text-xs text-gray-500">{user.email}</div>
                        </button>
                      ))}
                    {usersOptions.filter((u) => !selectedUserIds.includes(u.id)).length === 0 && (
                      <div className="px-3 py-2 text-sm text-gray-500">No users found</div>
                    )}
                  </div>
                </>
              )}
            </div>
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

          {/* Assign to Divisions */}
          <div className="relative">
            <label className="block text-sm font-medium text-gray-700 mb-1">Assign to Departments (optional)</label>
            <div className="relative">
              <button
                type="button"
                onClick={() => setDivisionDropdownOpen(!divisionDropdownOpen)}
                className="w-full px-3 py-2 border border-gray-200/60 rounded-lg text-left bg-white flex items-center justify-between focus:ring-2 focus:ring-brand-red/40 focus:border-brand-red/60"
              >
                <span className={selectedDivisionIds.length === 0 ? 'text-gray-400' : ''}>
                  {selectedDivisionIds.length === 0
                    ? 'Select departments...'
                    : selectedDivisionIds
                        .map((id) => divisions.find((d) => d.id === id)?.label)
                        .filter(Boolean)
                        .join(', ') || 'No departments selected'}
                </span>
                <span className="text-gray-400">▼</span>
              </button>
              {divisionDropdownOpen && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setDivisionDropdownOpen(false)}
                  />
                  <div className="absolute z-20 w-full mt-1 bg-white border border-gray-200/60 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                    {divisions.map((div) => (
                      <label
                        key={div.id}
                        className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer"
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
                  </div>
                </>
              )}
            </div>
            {selectedDivisionIds.length > 0 && (
              <div className="mt-2 text-xs text-gray-600">
                Tasks will be created for all active users in the selected department(s).
              </div>
            )}
          </div>
        </div>

        <div className="flex-shrink-0 border-t border-gray-200/60 px-6 py-4 bg-white flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-gray-200/60 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium"
            disabled={createMutation.isLoading}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => createMutation.mutate()}
            disabled={!canSubmit}
            className="px-5 py-2 bg-brand-red text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-semibold disabled:opacity-60"
          >
            {createMutation.isLoading ? 'Creating…' : 'Create task'}
          </button>
        </div>
      </div>
    </div>
  );
}

