import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, Pause, Pencil, Play, Plus, Trash2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  AppBadge,
  AppButton,
  AppDatePicker,
  AppEmptyState,
  AppFormModal,
  AppInput,
  AppSelect,
  AppTextarea,
  AppUserAvatar,
  AppUserSelect,
  FORM_MODAL_COMFORTABLE_DIALOG_COLLAPSED,
  FORM_MODAL_WIDE_DIALOG_COLLAPSED,
  uiBorders,
  uiColors,
  uiCx,
  uiLayout,
  uiRadius,
  uiTypography,
} from '@/components/ui';
import { AppControlLabelRow } from '@/components/ui/AppControlLabel';
import { useAppUserSelectCatalog } from '@/components/ui/useAppUserSelectCatalog';
import { api } from '@/lib/api';
import { useConfirm } from '@/components/ConfirmProvider';
import { getUserDisplayName } from '@/lib/userDisplay';

export type ProjectStartReminder = {
  id: string;
  project_id: string;
  recipient_user_ids: string[];
  start_mode?: 'relative' | 'absolute' | string;
  absolute_start_date?: string | null;
  offset_direction: 'before' | 'after' | string;
  offset_unit: 'days' | 'weeks' | 'months' | string;
  offset_value: number;
  recurrence: 'once' | 'daily' | 'weekly' | 'every_n_days' | string;
  recurrence_interval?: number | null;
  ends: 'on_anchor' | 'after_count' | 'on_date' | string;
  end_count?: number | null;
  end_date?: string | null;
  message?: string | null;
  is_active: boolean;
  window_start?: string | null;
  window_end?: string | null;
  next_occurrence?: string | null;
};

type OffsetPreset = 'same_day' | '1w' | '2w' | '1m' | '2m' | '3m' | 'custom';

type FormState = {
  recipient_user_ids: string[];
  start_mode: 'relative' | 'absolute';
  absolute_start_date: string;
  offsetPreset: OffsetPreset;
  offset_direction: 'before' | 'after';
  offset_unit: 'days' | 'weeks' | 'months';
  offset_value: number;
  recurrence: 'once' | 'daily' | 'weekly' | 'every_n_days';
  recurrence_interval: number;
  ends: 'on_anchor' | 'after_count' | 'on_date';
  end_count: number;
  end_date: string;
  message: string;
  is_active: boolean;
};

/** Chronological by first send (furthest before → start day); custom last. */
const OFFSET_PRESETS: {
  value: OffsetPreset;
  label: string;
  unit?: FormState['offset_unit'];
  amount?: number;
}[] = [
  { value: '3m', label: '3 months', unit: 'months', amount: 3 },
  { value: '2m', label: '2 months', unit: 'months', amount: 2 },
  { value: '1m', label: '1 month', unit: 'months', amount: 1 },
  { value: '2w', label: '2 weeks', unit: 'weeks', amount: 2 },
  { value: '1w', label: '1 week', unit: 'weeks', amount: 1 },
  { value: 'same_day', label: 'Same day', unit: 'days', amount: 0 },
  { value: 'custom', label: 'Custom offset' },
];

const RECURRENCE_OPTIONS: { value: FormState['recurrence']; label: string }[] = [
  { value: 'once', label: 'Once' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'every_n_days', label: 'Every N days' },
];

/** Selected state matches calendar daySelected / division picker (darker inset ring). */
function ChoiceChip({
  selected,
  onClick,
  children,
  disabled,
}: {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={uiCx(
        'rounded-lg border px-3 py-1.5 text-sm font-semibold transition-colors',
        selected
          ? 'border-brand-red bg-brand-red/10 text-brand-red ring-1 ring-inset ring-brand-red/35'
          : uiCx(uiBorders.subtle, uiColors.surface, uiColors.textBody, 'hover:bg-gray-50'),
        disabled && 'cursor-not-allowed opacity-50',
      )}
    >
      {children}
    </button>
  );
}

function defaultForm(): FormState {
  return {
    recipient_user_ids: [],
    start_mode: 'relative',
    absolute_start_date: '',
    offsetPreset: '1w',
    offset_direction: 'before',
    offset_unit: 'weeks',
    offset_value: 1,
    recurrence: 'once',
    recurrence_interval: 2,
    ends: 'on_anchor',
    end_count: 3,
    end_date: '',
    message: '',
    is_active: true,
  };
}

function detectPreset(reminder: ProjectStartReminder): OffsetPreset {
  if (reminder.offset_direction === 'after' && reminder.offset_value > 0) return 'custom';
  if (reminder.offset_value === 0) return 'same_day';
  if (reminder.offset_direction !== 'before') return 'custom';
  const match = OFFSET_PRESETS.find(
    (p) =>
      p.value !== 'custom' &&
      p.value !== 'same_day' &&
      p.unit === reminder.offset_unit &&
      p.amount === reminder.offset_value,
  );
  return match?.value ?? 'custom';
}

function formFromReminder(reminder: ProjectStartReminder): FormState {
  const startMode = reminder.start_mode === 'absolute' ? 'absolute' : 'relative';
  return {
    recipient_user_ids: [...(reminder.recipient_user_ids || [])],
    start_mode: startMode,
    absolute_start_date: reminder.absolute_start_date
      ? String(reminder.absolute_start_date).slice(0, 10)
      : '',
    offsetPreset: detectPreset(reminder),
    offset_direction: (reminder.offset_direction as FormState['offset_direction']) || 'before',
    offset_unit: (reminder.offset_unit as FormState['offset_unit']) || 'days',
    offset_value: Number(reminder.offset_value ?? 0),
    recurrence: (reminder.recurrence as FormState['recurrence']) || 'once',
    recurrence_interval: Number(reminder.recurrence_interval ?? 2),
    ends: (reminder.ends as FormState['ends']) || 'on_anchor',
    end_count: Number(reminder.end_count ?? 3),
    end_date: reminder.end_date ? String(reminder.end_date).slice(0, 10) : '',
    message: reminder.message || '',
    is_active: Boolean(reminder.is_active),
  };
}

function resolveOffset(
  form: FormState,
): Pick<FormState, 'offset_direction' | 'offset_unit' | 'offset_value'> {
  if (form.offsetPreset === 'custom') {
    return {
      offset_direction: form.offset_direction,
      offset_unit: form.offset_unit,
      offset_value: Math.max(0, Number(form.offset_value) || 0),
    };
  }
  const preset = OFFSET_PRESETS.find((p) => p.value === form.offsetPreset);
  if (!preset || form.offsetPreset === 'same_day') {
    return { offset_direction: 'before', offset_unit: 'days', offset_value: 0 };
  }
  return {
    offset_direction: 'before',
    offset_unit: preset.unit || 'days',
    offset_value: preset.amount ?? 0,
  };
}

function offsetLabel(reminder: ProjectStartReminder): string {
  if (reminder.start_mode === 'absolute') {
    return reminder.absolute_start_date
      ? `From ${String(reminder.absolute_start_date).slice(0, 10)}`
      : 'Custom date';
  }
  if (!reminder.offset_value) return 'On start date';
  const unit =
    reminder.offset_value === 1
      ? String(reminder.offset_unit || 'days').replace(/s$/, '')
      : String(reminder.offset_unit || 'days');
  return `${reminder.offset_value} ${unit} ${reminder.offset_direction}`;
}

function recurrenceLabel(reminder: ProjectStartReminder): string {
  switch (reminder.recurrence) {
    case 'daily':
      return 'Daily';
    case 'weekly':
      return 'Weekly';
    case 'every_n_days':
      return `Every ${reminder.recurrence_interval || 1} days`;
    default:
      return 'Once';
  }
}

function addMonths(d: Date, months: number): Date {
  const out = new Date(d.getFullYear(), d.getMonth() + months, d.getDate());
  if (out.getMonth() !== (((d.getMonth() + months) % 12) + 12) % 12) {
    return new Date(d.getFullYear(), d.getMonth() + months + 1, 0);
  }
  return out;
}

function parseLocalDate(iso: string): Date | null {
  if (!iso) return null;
  const [y, m, day] = iso.split('-').map(Number);
  if (!y || !m || !day) return null;
  return new Date(y, m - 1, day);
}

function applyOffsetLocal(
  startDate: string,
  offset: Pick<FormState, 'offset_direction' | 'offset_unit' | 'offset_value'>,
): Date | null {
  const anchor = parseLocalDate(startDate);
  if (!anchor) return null;
  const value = Math.abs(offset.offset_value || 0);
  const sign = offset.offset_direction === 'after' ? 1 : -1;
  if (offset.offset_unit === 'months') return addMonths(anchor, sign * value);
  if (offset.offset_unit === 'weeks') {
    const out = new Date(anchor);
    out.setDate(out.getDate() + sign * value * 7);
    return out;
  }
  const out = new Date(anchor);
  out.setDate(out.getDate() + sign * value);
  return out;
}

function formatPreviewDate(d: Date | null): string {
  if (!d || Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function projectStartRemindersQueryKey(projectId: string) {
  return ['project-start-reminders', projectId] as const;
}

type Props = {
  open: boolean;
  projectId: string;
  startDate: string;
  onClose: () => void;
};

function RecipientsSummary({ ids }: { ids: string[] }) {
  const catalog = useAppUserSelectCatalog({
    search: '',
    enabled: ids.length > 0,
    fetchList: false,
    selectedIds: ids,
  });
  if (ids.length === 0) return <span>—</span>;
  const names = catalog.selectedUsers.map((u) => getUserDisplayName(u)).filter(Boolean);
  if (names.length === 0) {
    return (
      <span>
        {ids.length} recipient{ids.length === 1 ? '' : 's'}
      </span>
    );
  }
  if (names.length <= 2) return <span>{names.join(', ')}</span>;
  return (
    <span>
      {names.slice(0, 2).join(', ')} +{names.length - 2}
    </span>
  );
}

function SelectedRecipientsList({
  ids,
  onRemove,
  onClear,
}: {
  ids: string[];
  onRemove: (id: string) => void;
  onClear: () => void;
}) {
  const catalog = useAppUserSelectCatalog({
    search: '',
    enabled: ids.length > 0,
    fetchList: false,
    selectedIds: ids,
  });

  if (ids.length === 0) return null;

  return (
    <div className="mt-2">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className={uiTypography.helper}>{ids.length} selected</span>
        <button
          type="button"
          className={uiCx(uiTypography.helper, 'font-semibold text-brand-red hover:text-brand-red/80')}
          onClick={onClear}
        >
          Clear all
        </button>
      </div>
      <ul
        className={uiCx(
          'max-h-28 space-y-1 overflow-y-auto p-1.5',
          uiBorders.subtle,
          uiRadius.control,
          uiColors.surface,
        )}
      >
        {ids.map((id) => {
          const user = catalog.selectedUsers.find((u) => String(u.id) === String(id));
          return (
            <li
              key={id}
              className={uiCx('flex items-center gap-2 px-1.5 py-1 hover:bg-gray-50', uiRadius.control)}
            >
              <AppUserAvatar user={user || { id }} size="sm" />
              <span className={uiCx('min-w-0 flex-1 truncate', uiTypography.controlValue)}>
                {user ? getUserDisplayName(user) : 'Loading…'}
              </span>
              <button
                type="button"
                className={uiCx(
                  'p-0.5 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800',
                  uiRadius.control,
                )}
                aria-label="Remove"
                onClick={() => onRemove(id)}
              >
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function ProjectStartRemindersModal({ open, projectId, startDate, onClose }: Props) {
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const [view, setView] = useState<'list' | 'form'>('list');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(defaultForm);

  const { data: reminders = [], isLoading } = useQuery({
    queryKey: projectStartRemindersQueryKey(projectId),
    queryFn: async () => {
      const rows = await api('GET', `/projects/${projectId}/start-reminders`);
      return (Array.isArray(rows) ? rows : []) as ProjectStartReminder[];
    },
    enabled: open && Boolean(projectId),
  });

  useEffect(() => {
    if (!open) {
      setView('list');
      setEditingId(null);
      setForm(defaultForm());
    }
  }, [open]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const offset = resolveOffset(form);
      const body: Record<string, unknown> = {
        recipient_user_ids: form.recipient_user_ids,
        start_mode: form.start_mode,
        absolute_start_date:
          form.start_mode === 'absolute' ? form.absolute_start_date || null : null,
        ...(form.start_mode === 'relative'
          ? offset
          : { offset_direction: 'before', offset_unit: 'days', offset_value: 0 }),
        recurrence: form.recurrence,
        recurrence_interval: form.recurrence === 'every_n_days' ? form.recurrence_interval : null,
        ends: form.recurrence === 'once' ? 'on_anchor' : form.ends,
        end_count: form.ends === 'after_count' && form.recurrence !== 'once' ? form.end_count : null,
        end_date: form.ends === 'on_date' && form.recurrence !== 'once' ? form.end_date || null : null,
        message: form.message.trim() || null,
        is_active: form.is_active,
      };
      if (editingId) {
        return api('PATCH', `/projects/${projectId}/start-reminders/${editingId}`, body);
      }
      return api('POST', `/projects/${projectId}/start-reminders`, body);
    },
    onSuccess: async () => {
      toast.success(editingId ? 'Reminder updated' : 'Reminder created');
      await queryClient.invalidateQueries({ queryKey: projectStartRemindersQueryKey(projectId) });
      setView('list');
      setEditingId(null);
      setForm(defaultForm());
    },
    onError: (e: any) => {
      toast.error(e?.response?.data?.detail || 'Failed to save reminder');
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) =>
      api('PATCH', `/projects/${projectId}/start-reminders/${id}`, { is_active }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: projectStartRemindersQueryKey(projectId) });
    },
    onError: (e: any) => {
      toast.error(e?.response?.data?.detail || 'Failed to update reminder');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => api('DELETE', `/projects/${projectId}/start-reminders/${id}`),
    onSuccess: async () => {
      toast.success('Reminder deleted');
      await queryClient.invalidateQueries({ queryKey: projectStartRemindersQueryKey(projectId) });
    },
    onError: (e: any) => {
      toast.error(e?.response?.data?.detail || 'Failed to delete reminder');
    },
  });

  const preview = useMemo(() => {
    let first: Date | null = null;
    if (form.start_mode === 'absolute') {
      first = parseLocalDate(form.absolute_start_date);
      if (!first) return 'Pick a custom start date for the reminder.';
    } else {
      first = applyOffsetLocal(startDate, resolveOffset(form));
      if (!first) return 'Set a project start date to preview the schedule.';
    }
    if (form.recurrence === 'once') {
      return `Sends once on ${formatPreviewDate(first)}.`;
    }
    let until = startDate ? 'the project start date' : 'the schedule end';
    if (form.ends === 'after_count') {
      until = `${form.end_count} occurrence${form.end_count === 1 ? '' : 's'}`;
    }
    if (form.ends === 'on_date' && form.end_date) until = form.end_date;
    const cadence =
      form.recurrence === 'daily'
        ? 'daily'
        : form.recurrence === 'weekly'
          ? 'weekly'
          : `every ${form.recurrence_interval} days`;
    return `First: ${formatPreviewDate(first)} · Then ${cadence} until ${until}.`;
  }, [form, startDate]);

  const canCreateRelative = Boolean(startDate);
  const saveDisabled =
    saveMutation.isPending ||
    form.recipient_user_ids.length === 0 ||
    (form.start_mode === 'absolute' && !form.absolute_start_date) ||
    (form.start_mode === 'relative' && !startDate);

  const openCreate = () => {
    if (!startDate) {
      // Absolute-only create still allowed without project start date
      setEditingId(null);
      setForm({ ...defaultForm(), start_mode: 'absolute' });
      setView('form');
      return;
    }
    setEditingId(null);
    setForm(defaultForm());
    setView('form');
  };

  const openEdit = (reminder: ProjectStartReminder) => {
    setEditingId(reminder.id);
    setForm(formFromReminder(reminder));
    setView('form');
  };

  const handleDelete = async (reminder: ProjectStartReminder) => {
    const ok = await confirm({
      title: 'Delete reminder?',
      message: 'This cannot be undone.',
      confirmText: 'Delete',
      cancelText: 'Cancel',
    });
    if (ok !== 'confirm') return;
    deleteMutation.mutate(reminder.id);
  };

  if (!open) return null;

  return (
    <AppFormModal
      open={open}
      onClose={onClose}
      title={view === 'list' ? 'Start date reminders' : editingId ? 'Edit reminder' : 'New reminder'}
      description={
        view === 'list'
          ? 'Notify people before (or after) this project starts'
          : 'Choose who gets notified and when'
      }
      formWidth={view === 'form' ? 'wide' : 'comfortable'}
      // AppFormModal always adds a width transition; without disabling it, open/list↔form
      // animates from max-w-md → target (stretch) then settles (compress).
      dialogClassName={uiCx(
        '!transition-none',
        view === 'form' ? FORM_MODAL_WIDE_DIALOG_COLLAPSED : FORM_MODAL_COMFORTABLE_DIALOG_COLLAPSED,
      )}
      footer={
        view === 'list' ? (
          <div className={uiCx(uiLayout.actionsRow, 'justify-between')}>
            <AppButton type="button" variant="secondary" size="sm" onClick={onClose}>
              Close
            </AppButton>
            <AppButton type="button" size="sm" onClick={openCreate}>
              <Plus className="h-3.5 w-3.5" aria-hidden />
              New reminder
            </AppButton>
          </div>
        ) : (
          <div className={uiCx(uiLayout.actionsRow, 'justify-end')}>
            <AppButton
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                setView('list');
                setEditingId(null);
              }}
              disabled={saveMutation.isPending}
            >
              Back
            </AppButton>
            <AppButton
              type="button"
              size="sm"
              onClick={() => saveMutation.mutate()}
              disabled={saveDisabled}
              loading={saveMutation.isPending}
            >
              {saveMutation.isPending ? 'Saving…' : 'Save'}
            </AppButton>
          </div>
        )
      }
    >
      {view === 'list' ? (
        <div className="space-y-3">
          {!startDate ? (
            <p
              className={uiCx(
                uiTypography.helper,
                uiRadius.control,
                'border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800',
              )}
            >
              No project start date yet — you can still create reminders with a custom date.
            </p>
          ) : null}
          {isLoading ? (
            <p className={uiTypography.helper}>Loading…</p>
          ) : reminders.length === 0 ? (
            <AppEmptyState
              icon={<Bell className="h-5 w-5" aria-hidden />}
              title="No reminders yet"
              description="Schedule notifications for people who need to prepare for the start date."
            />
          ) : (
            <ul className="space-y-2">
              {reminders.map((reminder) => (
                <li
                  key={reminder.id}
                  className={uiCx(
                    'p-3',
                    uiRadius.control,
                    uiBorders.subtle,
                    uiColors.surface,
                    !reminder.is_active && 'opacity-70',
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 space-y-1">
                      <div className={uiCx('flex flex-wrap items-center gap-2', uiTypography.sectionTitle)}>
                        <RecipientsSummary ids={reminder.recipient_user_ids || []} />
                        {!reminder.is_active ? <AppBadge variant="warning">Paused</AppBadge> : null}
                      </div>
                      <div className={uiTypography.helper}>
                        {offsetLabel(reminder)} · {recurrenceLabel(reminder)}
                      </div>
                      <div className={uiTypography.helper}>
                        Next: {reminder.next_occurrence || '—'}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <AppButton
                        type="button"
                        variant="secondary"
                        size="sm"
                        title={reminder.is_active ? 'Pause' : 'Resume'}
                        onClick={() =>
                          toggleMutation.mutate({ id: reminder.id, is_active: !reminder.is_active })
                        }
                      >
                        {reminder.is_active ? (
                          <Pause className="h-3.5 w-3.5" aria-hidden />
                        ) : (
                          <Play className="h-3.5 w-3.5" aria-hidden />
                        )}
                      </AppButton>
                      <AppButton
                        type="button"
                        variant="secondary"
                        size="sm"
                        title="Edit"
                        onClick={() => openEdit(reminder)}
                      >
                        <Pencil className="h-3.5 w-3.5" aria-hidden />
                      </AppButton>
                      <AppButton
                        type="button"
                        variant="secondary"
                        size="sm"
                        title="Delete"
                        onClick={() => handleDelete(reminder)}
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden />
                      </AppButton>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          {/* Left column */}
          <div className="space-y-4">
            <div>
              <AppUserSelect
                mode="multiple"
                label="Who"
                value={form.recipient_user_ids}
                onChange={(ids) => setForm((f) => ({ ...f, recipient_user_ids: ids }))}
                placeholder="Search people…"
                showSelectedChips={false}
                helperText="Everyone selected receives the same schedule."
              />
              <SelectedRecipientsList
                ids={form.recipient_user_ids}
                onRemove={(id) =>
                  setForm((f) => ({
                    ...f,
                    recipient_user_ids: f.recipient_user_ids.filter((x) => x !== id),
                  }))
                }
                onClear={() => setForm((f) => ({ ...f, recipient_user_ids: [] }))}
              />
            </div>

            <AppTextarea
              label="Message (optional)"
              value={form.message}
              onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
              rows={4}
              placeholder="Leave blank to use the default project start message"
            />

            <p
              className={uiCx(
                uiTypography.helper,
                uiRadius.control,
                uiBorders.subtle,
                uiColors.surfaceSubtle,
                'px-3 py-2',
              )}
            >
              {preview}
            </p>
          </div>

          {/* Right column */}
          <div className="space-y-4">
            <div>
              <div className="mb-2">
                <AppControlLabelRow label="When it starts" />
              </div>
              <div className="mb-2 flex flex-wrap gap-2">
                <ChoiceChip
                  selected={form.start_mode === 'relative'}
                  disabled={!canCreateRelative}
                  onClick={() => {
                    if (!canCreateRelative) {
                      toast.error('Set a project start date to use relative scheduling');
                      return;
                    }
                    setForm((f) => ({ ...f, start_mode: 'relative' }));
                  }}
                >
                  Related to start date
                </ChoiceChip>
                <ChoiceChip
                  selected={form.start_mode === 'absolute'}
                  onClick={() => setForm((f) => ({ ...f, start_mode: 'absolute' }))}
                >
                  Custom date
                </ChoiceChip>
              </div>

              {form.start_mode === 'relative' ? (
                <div className="space-y-3">
                  <AppSelect
                    label="Offset"
                    value={form.offsetPreset}
                    onChange={(e) => {
                      const preset = e.target.value as OffsetPreset;
                      const match = OFFSET_PRESETS.find((p) => p.value === preset);
                      setForm((f) => ({
                        ...f,
                        offsetPreset: preset,
                        ...(preset !== 'custom' && match?.unit
                          ? {
                              offset_direction: 'before' as const,
                              offset_unit: match.unit!,
                              offset_value: match.amount ?? 0,
                            }
                          : {}),
                      }));
                    }}
                    sortOptions={false}
                    options={OFFSET_PRESETS.map((p) => ({
                      value: p.value,
                      label:
                        p.value === 'same_day'
                          ? 'Same day'
                          : p.value === 'custom'
                            ? 'Custom offset'
                            : `${p.label} before`,
                    }))}
                  />
                  {form.offsetPreset === 'custom' ? (
                    <div className="grid grid-cols-3 gap-2">
                      <AppInput
                        label="Amount"
                        type="number"
                        min={0}
                        value={String(form.offset_value)}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            offset_value: Math.max(0, Number(e.target.value) || 0),
                          }))
                        }
                      />
                      <AppSelect
                        label="Unit"
                        value={form.offset_unit}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            offset_unit: e.target.value as FormState['offset_unit'],
                          }))
                        }
                        options={[
                          { value: 'days', label: 'Days' },
                          { value: 'weeks', label: 'Weeks' },
                          { value: 'months', label: 'Months' },
                        ]}
                      />
                      <AppSelect
                        label="Direction"
                        value={form.offset_direction}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            offset_direction: e.target.value as FormState['offset_direction'],
                          }))
                        }
                        options={[
                          { value: 'before', label: 'Before' },
                          { value: 'after', label: 'After' },
                        ]}
                      />
                    </div>
                  ) : null}
                </div>
              ) : (
                <AppDatePicker
                  label="First reminder date"
                  value={form.absolute_start_date}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, absolute_start_date: e.target.value }))
                  }
                />
              )}
            </div>

            <div className="space-y-3">
              <div>
                <div className="mb-2">
                  <AppControlLabelRow label="Recurrence" />
                </div>
                <div className="flex flex-wrap gap-2">
                  {RECURRENCE_OPTIONS.map((opt) => (
                    <ChoiceChip
                      key={opt.value}
                      selected={form.recurrence === opt.value}
                      onClick={() => setForm((f) => ({ ...f, recurrence: opt.value }))}
                    >
                      {opt.label}
                    </ChoiceChip>
                  ))}
                </div>
              </div>

              {form.recurrence === 'once' ? (
                <p className={uiTypography.helper}>Sends one time on the first reminder date.</p>
              ) : (
                <>
                  {form.recurrence === 'every_n_days' ? (
                    <AppInput
                      label="Every N days"
                      type="number"
                      min={1}
                      value={String(form.recurrence_interval)}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          recurrence_interval: Math.max(1, Number(e.target.value) || 1),
                        }))
                      }
                    />
                  ) : (
                    <p className={uiTypography.helper}>
                      {form.recurrence === 'daily'
                        ? 'Repeats every day from the first reminder date.'
                        : 'Repeats every 7 days from the first reminder date.'}
                    </p>
                  )}

                  <AppSelect
                    label="Ends"
                    value={form.ends}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        ends: e.target.value as FormState['ends'],
                      }))
                    }
                    options={[
                      { value: 'on_anchor', label: 'Until start date' },
                      { value: 'after_count', label: 'After N occurrences' },
                      { value: 'on_date', label: 'On a date' },
                    ]}
                  />
                  {form.ends === 'after_count' ? (
                    <AppInput
                      label="Occurrences"
                      type="number"
                      min={1}
                      value={String(form.end_count)}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          end_count: Math.max(1, Number(e.target.value) || 1),
                        }))
                      }
                    />
                  ) : null}
                  {form.ends === 'on_date' ? (
                    <AppDatePicker
                      label="End date"
                      value={form.end_date}
                      onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))}
                    />
                  ) : null}
                  {form.ends === 'on_anchor' ? (
                    <p className={uiTypography.helper}>
                      Stops on the project start date
                      {startDate ? ` (${startDate})` : ' (set a start date on the project)'}.
                    </p>
                  ) : null}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </AppFormModal>
  );
}
