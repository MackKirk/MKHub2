import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import TaskCard from './TaskCard';
import TaskModal from './TaskModal';
import type { Task } from './types';

type Props = {
  open: boolean;
  onClose: () => void;
};

export default function ArchivedTasksModal({ open, onClose }: Props) {
  const queryClient = useQueryClient();
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const { data: archivedTasks = [], isLoading } = useQuery({
    queryKey: ['tasks', 'archived'],
    queryFn: () => api<Task[]>('GET', '/tasks/archived'),
    enabled: open,
  });

  const filteredTasks = useMemo(() => {
    let filtered = [...archivedTasks];

    // Filter by status
    if (statusFilter !== 'all') {
      filtered = filtered.filter((t) => t.status === statusFilter);
    }

    // Filter by priority
    if (priorityFilter !== 'all') {
      filtered = filtered.filter((t) => t.priority === priorityFilter);
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (t) =>
          t.title.toLowerCase().includes(query) ||
          (t.description || '').toLowerCase().includes(query)
      );
    }

    return filtered;
  }, [archivedTasks, statusFilter, priorityFilter, searchQuery]);

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
        <div
          className="bg-white rounded-xl max-w-4xl w-full max-h-[90vh] flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="px-6 py-4 border-b border-gray-200/60 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Archived Tasks</h2>
              <p className="text-sm text-gray-500 mt-1">
                {isLoading ? 'Loading...' : `${filteredTasks.length} of ${archivedTasks.length} task(s)`}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="text-2xl font-bold text-gray-400 hover:text-gray-600 transition-colors"
            >
              ×
            </button>
          </div>

          {/* Warning */}
          {archivedTasks.length > 50 && (
            <div className="mx-6 mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <div className="flex items-start gap-2">
                <svg className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <div className="text-sm text-amber-800">
                  <div className="font-medium mb-1">Large list detected</div>
                  <div>Loading may take a moment. Use filters to narrow results.</div>
                </div>
              </div>
            </div>
          )}

          {/* Filters */}
          <div className="px-6 py-4 border-b border-gray-200/60 space-y-3 bg-gray-50/50">
            {/* Search */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Search</label>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by title or description..."
                className="w-full px-3 py-2 border border-gray-200/60 rounded-lg text-sm focus:ring-2 focus:ring-brand-red/40 focus:border-brand-red/60"
              />
            </div>

            {/* Status and Priority filters */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Status</label>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200/60 rounded-lg text-sm focus:ring-2 focus:ring-brand-red/40 focus:border-brand-red/60 bg-white"
                >
                  <option value="all">All</option>
                  <option value="accepted">To do</option>
                  <option value="in_progress">In progress</option>
                  <option value="blocked">Blocked</option>
                  <option value="done">Done</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Priority</label>
                <select
                  value={priorityFilter}
                  onChange={(e) => setPriorityFilter(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200/60 rounded-lg text-sm focus:ring-2 focus:ring-brand-red/40 focus:border-brand-red/60 bg-white"
                >
                  <option value="all">All</option>
                  <option value="urgent">Urgent</option>
                  <option value="high">High</option>
                  <option value="normal">Normal</option>
                  <option value="low">Low</option>
                </select>
              </div>
            </div>
          </div>

          {/* Tasks List */}
          <div className="flex-1 overflow-y-auto p-6 space-y-3">
            {isLoading ? (
              <div className="text-center py-12">
                <div className="text-sm text-gray-500 mb-2">Loading archived tasks...</div>
                {archivedTasks.length > 50 && (
                  <div className="text-xs text-gray-400">This may take a moment</div>
                )}
              </div>
            ) : filteredTasks.length === 0 ? (
              <div className="text-center py-12">
                <div className="text-sm text-gray-500">
                  {archivedTasks.length === 0
                    ? 'No archived tasks yet.'
                    : 'No tasks match your filters.'}
                </div>
              </div>
            ) : (
              filteredTasks.map((task) => (
                <TaskCard key={task.id} task={task} onClick={() => setSelectedTaskId(task.id)} />
              ))
            )}
          </div>
        </div>
      </div>

      {/* Task Detail Modal */}
      <TaskModal
        open={!!selectedTaskId}
        taskId={selectedTaskId}
        onClose={() => setSelectedTaskId(null)}
        onUpdated={() => {
          queryClient.invalidateQueries({ queryKey: ['tasks', 'archived'] });
        }}
      />
    </>
  );
}
