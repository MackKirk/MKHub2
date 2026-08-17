import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Pencil } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '@/lib/api';
import {
  AppBadge,
  AppButton,
  AppCard,
  AppCheckbox,
  AppEmptyState,
  AppFormModal,
  AppInput,
  AppMultiSelect,
  AppSelect,
  AppTable,
  AppTabs,
  AppTextarea,
  AppUserSelect,
  uiCx,
  uiSpacing,
  uiTypography,
} from '@/components/ui';
import { autoTaskRouteQuickInfo } from '@/lib/formModalQuickInfo';
import { getStatusLabel } from '@/components/tasks/taskUi';
import type { TaskStatus } from '@/components/tasks/types';

type RecipientUser = { id: string; name: string };
type RecipientDivision = { id: string; label: string };

type AutoTaskTrigger = {
  key: string;
  category: string;
  category_label: string;
  name: string;
  when: string;
  task_title: string;
  task_description: string;
  enabled: boolean;
  due_in_days: number | null;
  notify_push: boolean;
  has_recipients: boolean;
  chain_only: boolean;
  starts_after_key: string | null;
  starts_after_name: string | null;
  starts_after_title: string | null;
  recipients: { users: RecipientUser[]; divisions: RecipientDivision[] };
};

type AutoTaskLog = {
  id: string;
  trigger_key: string;
  trigger_name: string;
  origin_label: string | null;
  status: string;
  created_at: string | null;
  error_message?: string | null;
  task_title?: string | null;
  tasks: {
    id: string;
    title: string;
    status: string;
    assigned_to?: string | null;
    assigned_division?: string | null;
  }[];
};

type DivisionOption = { id: string; label: string };

type Props = { canEdit: boolean };

const PLACEHOLDER_HINT =
  'You can use {name}, {email}, {job_title}, {hire_date}, and {equipment_list}. They are filled in when the task is created.';

function logStatusBadge(status: string) {
  if (status === 'created') return <AppBadge variant="success">Created</AppBadge>;
  if (status === 'waiting') return <AppBadge variant="info">Waiting</AppBadge>;
  if (status === 'skipped_no_recipients') return <AppBadge variant="warning">No recipients</AppBadge>;
  if (status === 'error') return <AppBadge variant="danger">Error</AppBadge>;
  return <AppBadge>{status}</AppBadge>;
}

function recipientLine(item: AutoTaskTrigger): string {
  const names = [
    ...item.recipients.users.map((u) => u.name),
    ...item.recipients.divisions.map((d) => d.label),
  ];
  return names.length ? names.join(', ') : 'No recipients';
}

export default function SettingsAutoTasksPanel({ canEdit }: Props) {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<'triggers' | 'activity'>('triggers');
  const [editing, setEditing] = useState<AutoTaskTrigger | null>(null);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDescription, setTaskDescription] = useState('');
  const [userIds, setUserIds] = useState<string[]>([]);
  const [divisionIds, setDivisionIds] = useState<string[]>([]);
  const [enabled, setEnabled] = useState(true);
  const [dueInDays, setDueInDays] = useState('');
  const [startsAfterKey, setStartsAfterKey] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['settings-auto-tasks'],
    queryFn: () => api<{ items: AutoTaskTrigger[] }>('GET', '/settings/auto-tasks'),
  });

  const { data: logsData, isLoading: logsLoading } = useQuery({
    queryKey: ['settings-auto-tasks-logs'],
    queryFn: () => api<{ items: AutoTaskLog[]; total: number }>('GET', '/settings/auto-tasks/logs?limit=50'),
    enabled: tab === 'activity',
  });

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api<{ divisions?: DivisionOption[] }>('GET', '/settings'),
  });

  const triggers = data?.items || [];
  const groups = useMemo(() => {
    const map = new Map<string, { label: string; items: AutoTaskTrigger[] }>();
    for (const item of triggers) {
      const existing = map.get(item.category);
      if (existing) existing.items.push(item);
      else map.set(item.category, { label: item.category_label, items: [item] });
    }
    return [...map.values()];
  }, [triggers]);

  const divisionOptions = (settings?.divisions || []).map((d) => ({ value: d.id, label: d.label }));
  const startsAfterOptions = useMemo(
    () => [
      { value: '', label: 'Starts immediately' },
      ...triggers
        .filter((item) => item.key !== editing?.key)
        .map((item) => ({ value: item.key, label: item.name })),
    ],
    [triggers, editing?.key],
  );

  const saveMutation = useMutation({
    mutationFn: (payload: {
      key: string;
      enabled: boolean;
      task_title: string;
      task_description: string;
      recipient_user_ids: string[];
      recipient_division_ids: string[];
      due_in_days: number | null;
      notify_push: boolean;
      starts_after_key: string | null;
    }) =>
      api('PUT', `/settings/auto-tasks/${encodeURIComponent(payload.key)}`, {
        enabled: payload.enabled,
        task_title: payload.task_title,
        task_description: payload.task_description,
        recipient_user_ids: payload.recipient_user_ids,
        recipient_division_ids: payload.recipient_division_ids,
        due_in_days: payload.due_in_days,
        notify_push: payload.notify_push,
        notify_email: false,
        starts_after_key: payload.starts_after_key,
      }),
    onSuccess: () => {
      toast.success('Auto task updated');
      queryClient.invalidateQueries({ queryKey: ['settings-auto-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['settings-auto-tasks-logs'] });
      setEditing(null);
    },
    onError: (err: any) => toast.error(err?.message || 'Failed to save'),
  });

  const openEdit = (item: AutoTaskTrigger) => {
    setEditing(item);
    setTaskTitle(item.task_title);
    setTaskDescription(item.task_description);
    setUserIds(item.recipients.users.map((u) => u.id));
    setDivisionIds(item.recipients.divisions.map((d) => d.id));
    setEnabled(item.enabled);
    setDueInDays(item.due_in_days != null ? String(item.due_in_days) : '');
    setStartsAfterKey(item.starts_after_key || '');
  };

  const handleSave = () => {
    if (!editing) return;
    const title = taskTitle.trim();
    if (!title) {
      toast.error('Task title is required');
      return;
    }
    const trimmed = dueInDays.trim();
    let due: number | null = null;
    if (trimmed) {
      const parsed = Number(trimmed);
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > 365) {
        toast.error('Expected completion must be 1–365 days, or empty');
        return;
      }
      due = parsed;
    }
    if (editing.chain_only && !startsAfterKey) {
      toast.error('This task must start after another auto task');
      return;
    }
    saveMutation.mutate({
      key: editing.key,
      enabled,
      task_title: title,
      task_description: taskDescription,
      recipient_user_ids: userIds,
      recipient_division_ids: divisionIds,
      due_in_days: due,
      notify_push: editing.notify_push,
      starts_after_key: startsAfterKey || null,
    });
  };

  return (
    <div className={uiSpacing.pageStack}>
      <AppCard bodyClassName={uiSpacing.compactCardPadding}>
        <AppTabs
          tabs={[
            { key: 'triggers', label: 'Triggers' },
            { key: 'activity', label: 'Activity' },
          ]}
          value={tab}
          onChange={(key) => setTab(key as 'triggers' | 'activity')}
        />
      </AppCard>

      {tab === 'triggers' ? (
        isLoading ? (
          <AppCard>
            <AppEmptyState title="Loading…" description="Loading auto-task triggers." />
          </AppCard>
        ) : (
          groups.map((group) => (
            <AppCard key={group.label} title={group.label} bodyClassName="!p-0">
              <ul className="divide-y divide-gray-100">
                {group.items.map((item) => (
                  <li key={item.key} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <p className={uiCx(uiTypography.body, 'font-medium text-gray-900')}>{item.task_title}</p>
                      <p className={uiCx(uiTypography.helper, 'mt-0.5 truncate')}>
                        {recipientLine(item)}
                        {item.starts_after_name ? ` · after ${item.starts_after_name}` : ''}
                        {item.due_in_days
                          ? ` · ${item.due_in_days} day${item.due_in_days === 1 ? '' : 's'}`
                          : ''}
                        {!item.enabled ? ' · Off' : ''}
                      </p>
                    </div>
                    {canEdit ? (
                      <AppButton
                        type="button"
                        size="sm"
                        variant="secondary"
                        leftIcon={<Pencil className="h-3.5 w-3.5" />}
                        onClick={() => openEdit(item)}
                      >
                        Edit
                      </AppButton>
                    ) : null}
                  </li>
                ))}
              </ul>
            </AppCard>
          ))
        )
      ) : logsLoading ? (
        <AppCard>
          <AppEmptyState title="Loading…" description="Loading auto-task activity." />
        </AppCard>
      ) : (
        <AppCard title="Activity">
          <AppTable
            columns={['When', 'Task', 'For', 'Status']}
            emptyState="No auto tasks have fired yet."
            rows={(logsData?.items || []).map((row) => [
              row.created_at ? new Date(row.created_at).toLocaleString() : '—',
              row.tasks[0]?.title || row.task_title || row.trigger_name,
              row.origin_label || '—',
              row.tasks.length ? (
                <Link to="/tasks" className="font-medium text-brand-red hover:underline">
                  {getStatusLabel((row.tasks[0].status as TaskStatus) || 'accepted')}
                </Link>
              ) : (
                logStatusBadge(row.status)
              ),
            ])}
          />
        </AppCard>
      )}

      <AppFormModal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing ? editing.name : 'Edit auto task'}
        description={editing?.when}
        quickInfo={autoTaskRouteQuickInfo}
        footer={
          <>
            <AppButton type="button" variant="secondary" onClick={() => setEditing(null)} disabled={saveMutation.isPending}>
              Cancel
            </AppButton>
            <AppButton type="button" onClick={handleSave} disabled={saveMutation.isPending || !canEdit}>
              Save
            </AppButton>
          </>
        }
      >
        {editing ? (
          <div className={uiSpacing.sectionStack}>
            <AppInput
              label="Task title"
              value={taskTitle}
              onChange={(e) => setTaskTitle(e.target.value)}
              disabled={!canEdit || saveMutation.isPending}
              fieldHint={`Task title\n\n${PLACEHOLDER_HINT}`}
            />
            <AppTextarea
              label="Task description"
              value={taskDescription}
              onChange={(e) => setTaskDescription(e.target.value)}
              rows={5}
              disabled={!canEdit || saveMutation.isPending}
              fieldHint={`Task description\n\n${PLACEHOLDER_HINT}`}
            />
            <AppUserSelect
              mode="multiple"
              label="People"
              value={userIds}
              onChange={setUserIds}
              disabled={!canEdit || saveMutation.isPending}
              placeholder="Select people…"
              fieldHint="People\n\nEach selected person gets their own copy of the task. Use this when the same person always handles this action."
            />
            <AppMultiSelect
              label="Divisions"
              value={divisionIds}
              onChange={setDivisionIds}
              options={divisionOptions}
              disabled={!canEdit || saveMutation.isPending}
              placeholder="Select divisions…"
              searchable
              fieldHint="Divisions\n\nCreates one shared task for the division. Anyone on that team can pick it up."
            />
            <AppSelect
              label="Starts after"
              options={startsAfterOptions}
              value={startsAfterKey}
              onChange={(e) => setStartsAfterKey(e.target.value)}
              disabled={!canEdit || saveMutation.isPending}
              sortOptions={false}
              fieldHint={
                editing.chain_only
                  ? 'Starts after\n\nThis task is not created from an invite checkbox. It is created when the selected task is completed for the same hire.'
                  : 'Starts after\n\nWait until this other auto task is done before creating this one. If that task was not created for the same hire (for example the invite checkbox was off), this task starts immediately.'
              }
            />
            <AppInput
              label="Expected completion (days)"
              type="number"
              min={1}
              max={365}
              value={dueInDays}
              onChange={(e) => setDueInDays(e.target.value)}
              placeholder="Optional"
              disabled={!canEdit || saveMutation.isPending}
              fieldHint="Expected completion\n\nOptional. Number of days from when the task is created until it is due."
            />
            <AppCheckbox
              label="Enabled"
              checked={enabled}
              onChange={setEnabled}
              disabled={!canEdit || saveMutation.isPending}
              fieldHint="Enabled\n\nWhen off, this trigger does nothing even if recipients are set."
            />
          </div>
        ) : null}
      </AppFormModal>
    </div>
  );
}
