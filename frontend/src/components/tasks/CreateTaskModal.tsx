import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import {
  AppButton,
  AppControlLabelRow,
  AppFieldHint,
  AppFormModal,
  AppSelect,
  AppInput,
  AppMultiSelect,
  AppTextarea,
  AppUserSelect,
  uiCx,
  uiLayout,
  uiSpacing,
  uiTypography,
} from '@/components/ui';
import type { Task, TaskStatus } from './types';

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

type DivisionOption = { id: string; label: string };

const statusOptions: { value: TaskStatus; label: string }[] = [
  { value: 'accepted', label: 'To do' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'blocked', label: 'Blocked' },
  { value: 'done', label: 'Done' },
];

export default function CreateTaskModal({ open, onClose, onCreated }: Props) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<TaskStatus | ''>('');
  const [priority, setPriority] = useState('');
  const [assignType, setAssignType] = useState<'user' | 'division'>('user');
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [selectedDivisionIds, setSelectedDivisionIds] = useState<string[]>([]);

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
        status,
      };

      if (selectedUserIds.length > 0) {
        payload.assigned_user_ids = selectedUserIds;
      }
      if (selectedDivisionIds.length > 0) {
        payload.assigned_division_ids = selectedDivisionIds;
      }

      return api<Task>('POST', '/tasks', payload);
    },
    onSuccess: (created) => {
      if (selectedUserIds.length > 1 || selectedDivisionIds.length > 0) {
        toast.success(`Tasks created for ${selectedUserIds.length > 0 ? selectedUserIds.length : 'multiple'} assignee(s)`);
      } else {
        toast.success('Task created');
      }
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      setTitle('');
      setDescription('');
      setStatus('');
      setPriority('');
      setSelectedUserIds([]);
      setSelectedDivisionIds([]);
      setAssignType('user');
      onCreated(created);
    },
    onError: (err: any) => toast.error(err.message || 'Failed to create task'),
  });

  const handleCreate = () => {
    if (!title.trim()) {
      toast.error('Title is required');
      return;
    }
    if (!status) {
      toast.error('Select a status');
      return;
    }
    if (!priority) {
      toast.error('Select a priority');
      return;
    }
    createMutation.mutate();
  };

  const canSubmit =
    title.trim().length > 0 && !!status && !!priority && !createMutation.isPending;

  return (
    <AppFormModal
      open={open}
      onClose={onClose}
      title="New Task"
      description="Add a task to your queue"
      quickInfo={
        <>
          <p>Tasks track work from to do through done.</p>
          <p>Assign to users or divisions to create copies for each assignee.</p>
          <p>Priority and status can be set when creating the task.</p>
        </>
      }
      footer={
        <div className={uiCx(uiLayout.actionsRow, 'w-full justify-end')}>
          <AppButton variant="secondary" size="sm" type="button" onClick={onClose} disabled={createMutation.isPending}>
            Cancel
          </AppButton>
          <AppButton
            size="sm"
            type="button"
            disabled={!canSubmit}
            loading={createMutation.isPending}
            onClick={handleCreate}
          >
            {createMutation.isPending ? 'Creating…' : 'Create task'}
          </AppButton>
        </div>
      }
    >
      <div className={uiCx(uiSpacing.sectionStack, 'space-y-4')}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <AppSelect
            id="create-task-status"
            label="Status *"
            value={status}
            onChange={(e) => setStatus(e.target.value as TaskStatus)}
            options={statusOptions}
            placeholder="Select status…"
            disabled={createMutation.isPending}
            fieldHint="Status\n\nWhere this task sits in your workflow (to do, in progress, blocked, or done). Required before submitting."
          />
          <AppSelect
            id="create-task-priority"
            label="Priority *"
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
            options={priorityOptions}
            placeholder="Select priority…"
            disabled={createMutation.isPending}
            fieldHint="Priority\n\nHow urgent this task is relative to others in your queue. Required before submitting."
          />
        </div>

        <AppInput
          label="Title *"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="What needs to be done?"
          disabled={createMutation.isPending}
          autoFocus
          fieldHint="Title\n\nA short summary shown in lists and notifications."
        />

        <AppTextarea
          label="Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={6}
          placeholder="Add details…"
          disabled={createMutation.isPending}
          fieldHint="Description\n\nOptional detail to clarify scope, context, or acceptance criteria."
        />

        <div className={uiSpacing.sectionStack}>
          <AppControlLabelRow
            label="Assign to (optional)"
            fieldHint={
              <AppFieldHint hint="Assign to\n\nOptional. Assign to users or divisions; each assignee gets their own copy of the task." />
            }
          />
          <div className={uiLayout.actionsRow}>
            <AppButton
              type="button"
              size="sm"
              variant={assignType === 'user' ? 'primary' : 'secondary'}
              className="min-w-0 flex-1"
              onClick={() => {
                setAssignType('user');
                setSelectedDivisionIds([]);
              }}
            >
              Users
            </AppButton>
            <AppButton
              type="button"
              size="sm"
              variant={assignType === 'division' ? 'primary' : 'secondary'}
              className="min-w-0 flex-1"
              onClick={() => {
                setAssignType('division');
                setSelectedUserIds([]);
              }}
            >
              Divisions
            </AppButton>
          </div>

          {assignType === 'user' ? (
            <AppUserSelect
              mode="multiple"
              label="Users"
              value={selectedUserIds}
              onChange={setSelectedUserIds}
              placeholder="Search or select users…"
              disabled={createMutation.isPending}
              fieldHint="Users\n\nOne or more people who own this task. Each selected user gets their own copy."
            />
          ) : (
            <>
              <AppMultiSelect
                label="Divisions"
                value={selectedDivisionIds}
                onChange={setSelectedDivisionIds}
                options={divisions.map((d) => ({ value: d.id, label: d.label }))}
                placeholder="Select divisions..."
                searchable
                disabled={createMutation.isPending}
                fieldHint="Divisions\n\nOne or more divisions. A copy of the task is created for every active user in each selected division."
              />
              {selectedDivisionIds.length > 0 && (
                <p className={uiTypography.helper}>
                  Tasks will be created for all active users in the selected division(s).
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </AppFormModal>
  );
}
