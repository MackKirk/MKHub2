import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import { api } from '@/lib/api';
import TaskCard from './TaskCard';
import TaskModal from './TaskModal';
import type { Task } from './types';
import {
  AppEmptyState,
  AppInput,
  AppModal,
  AppSelect,
  uiColors,
  uiCx,
  uiSpacing,
  uiTypography,
} from '@/components/ui';

type Props = {
  open: boolean;
  onClose: () => void;
};

const statusFilterOptions = [
  { value: 'all', label: 'All' },
  { value: 'accepted', label: 'To do' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'blocked', label: 'Blocked' },
  { value: 'done', label: 'Done' },
];

const priorityFilterOptions = [
  { value: 'all', label: 'All' },
  { value: 'urgent', label: 'Urgent' },
  { value: 'high', label: 'High' },
  { value: 'normal', label: 'Normal' },
  { value: 'low', label: 'Low' },
];

export default function ArchivedTasksModal({ open, onClose }: Props) {
  const queryClient = useQueryClient();
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  const { data: archivedTasks = [], isLoading } = useQuery({
    queryKey: ['tasks', 'archived'],
    queryFn: () => api<Task[]>('GET', '/tasks/archived'),
    enabled: open,
  });

  const filteredTasks = useMemo(() => {
    let filtered = [...archivedTasks];

    if (statusFilter !== 'all') {
      filtered = filtered.filter((t) => t.status === statusFilter);
    }

    if (priorityFilter !== 'all') {
      filtered = filtered.filter((t) => t.priority === priorityFilter);
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (t) =>
          t.title.toLowerCase().includes(query) ||
          (t.description || '').toLowerCase().includes(query),
      );
    }

    return filtered;
  }, [archivedTasks, statusFilter, priorityFilter, searchQuery]);

  const description = isLoading
    ? 'Loading...'
    : `${filteredTasks.length} of ${archivedTasks.length} task(s)`;

  return (
    <>
      <AppModal
        open={open}
        onClose={onClose}
        title="Archived Tasks"
        description={description}
        size="lg"
        bodyClassName="flex max-h-[60vh] min-h-0 flex-col p-0"
      >
        {archivedTasks.length > 50 && (
          <div className={uiCx(uiSpacing.cardPadding, 'border-b border-amber-100 bg-amber-50')}>
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden />
              <div className={uiCx(uiTypography.helper, 'text-amber-800')}>
                <div className="mb-1 font-semibold text-amber-900">Large list detected</div>
                <div>Loading may take a moment. Use filters to narrow results.</div>
              </div>
            </div>
          </div>
        )}

        <div className={uiCx(uiSpacing.cardPadding, uiColors.surfaceSubtle, uiSpacing.sectionStack, 'border-b border-gray-100')}>
          <AppInput
            label="Search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by title or description..."
          />
          <div className="grid grid-cols-2 gap-3">
            <AppSelect
              label="Status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              options={statusFilterOptions}
            />
            <AppSelect
              label="Priority"
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
              options={priorityFilterOptions}
            />
          </div>
        </div>

        <div className={uiCx('min-h-0 flex-1 overflow-y-auto', uiSpacing.cardPadding, uiSpacing.sectionStack)}>
          {isLoading ? (
            <p className={uiCx('py-12 text-center', uiTypography.helper)}>Loading archived tasks...</p>
          ) : filteredTasks.length === 0 ? (
            <AppEmptyState
              className="py-8"
              title={archivedTasks.length === 0 ? 'No archived tasks yet.' : 'No tasks match your filters.'}
            />
          ) : (
            filteredTasks.map((task) => (
              <TaskCard key={task.id} task={task} onClick={() => setSelectedTaskId(task.id)} showActions={false} />
            ))
          )}
        </div>
      </AppModal>

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
