import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import { Search, Users } from 'lucide-react';
import {
  AppBadge,
  AppButton,
  AppCard,
  AppEmptyState,
  AppFormModal,
  AppInput,
  AppListCreateItem,
  AppListRowIconButton,
  AppSectionHeader,
  AppSelect,
  AppSortableEntityList,
  AppSortableEntityListHeader,
  AppSortableEntityListRow,
  AppTextarea,
  appSectionPresetProps,
  uiCx,
  uiLayout,
  uiSpacing,
  uiTypography,
} from '@/components/ui';
import { useConfirm } from '@/components/ConfirmProvider';

type PropertyEntity = {
  id: string;
  legal_name: string;
  display_name?: string;
  entity_type: string;
  notes?: string;
  active: boolean;
};

type Props = { canEdit: boolean };

const EMPTY_FORM = {
  legal_name: '',
  display_name: '',
  entity_type: 'company',
  notes: '',
};

const OWNERS_GRID = 'grid-cols-[minmax(0,2fr)_minmax(0,2fr)_7rem_6rem_auto]';

export default function SettingsPropertyOwnersPanel({ canEdit }: Props) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<PropertyEntity | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const { data, isLoading } = useQuery({
    queryKey: ['property-entities-settings', search, showInactive],
    queryFn: () => {
      const qs = new URLSearchParams();
      if (search.trim()) qs.set('search', search.trim());
      qs.set('active_only', showInactive ? 'false' : 'true');
      return api<PropertyEntity[]>('GET', `/properties/entities?${qs.toString()}`);
    },
  });

  const rows = useMemo(() => data || [], [data]);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setModalOpen(true);
  };

  const openEdit = (row: PropertyEntity) => {
    setEditing(row);
    setForm({
      legal_name: row.legal_name,
      display_name: row.display_name || '',
      entity_type: row.entity_type || 'company',
      notes: row.notes || '',
    });
    setModalOpen(true);
  };

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!form.legal_name.trim()) throw new Error('Legal name is required');
      if (editing) {
        return api('PATCH', `/properties/entities/${editing.id}`, {
          ...form,
          display_name: form.display_name || null,
          notes: form.notes || null,
        });
      }
      return api('POST', '/properties/entities', {
        ...form,
        display_name: form.display_name || null,
        notes: form.notes || null,
      });
    },
    onSuccess: () => {
      toast.success(editing ? 'Owner updated' : 'Owner created');
      setModalOpen(false);
      qc.invalidateQueries({ queryKey: ['property-entities-settings'] });
      qc.invalidateQueries({ queryKey: ['property-entities'] });
    },
    onError: (e: Error) => toast.error(e.message || 'Save failed'),
  });

  const deactivate = async (row: PropertyEntity) => {
    const result = await confirm({
      title: 'Deactivate owner?',
      message: `${row.display_name || row.legal_name} will be hidden from pickers but kept on existing properties.`,
      confirmText: 'Deactivate',
    });
    if (result !== 'confirm') return;
    try {
      await api('PATCH', `/properties/entities/${row.id}`, { active: false });
      toast.success('Owner deactivated');
      qc.invalidateQueries({ queryKey: ['property-entities-settings'] });
      qc.invalidateQueries({ queryKey: ['property-entities'] });
    } catch (e: any) {
      toast.error(e?.message || 'Failed');
    }
  };

  return (
    <div className={uiSpacing.pageStack}>
      <AppCard>
        <AppSectionHeader
          title="Property owners"
          description="Register companies and people that can own properties (Mack Kirk entities, family members, partners)."
          {...appSectionPresetProps('company')}
        />
        <div className={uiCx(uiLayout.actionsRow, 'mt-4 flex-wrap gap-3')}>
          <div className="min-w-[200px] max-w-md flex-1">
            <AppInput
              placeholder="Search owners…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              leftIcon={<Search className="h-4 w-4" />}
              aria-label="Search owners"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
            Show inactive
          </label>
        </div>
      </AppCard>

      {isLoading ? (
        <AppCard>
          <div className={uiTypography.helper}>Loading…</div>
        </AppCard>
      ) : (
        <AppSortableEntityList layout="stack" className="min-w-0">
          {canEdit ? (
            <AppListCreateItem
              label="Add owner"
              layout="row"
              className={uiCx('w-full', 'min-w-[640px]')}
              onClick={openCreate}
            />
          ) : null}

          {!rows.length ? (
            <AppEmptyState
              title="No owners yet"
              description="Add legal entities and people used as property owners."
              icon={<Users className="h-5 w-5" />}
            />
          ) : (
            <>
              <AppSortableEntityListHeader gridCols={OWNERS_GRID} minWidth="min-w-[640px]">
                <span>Name</span>
                <span>Legal name</span>
                <span>Type</span>
                <span>Status</span>
                <div className="min-w-0 w-20" aria-hidden />
              </AppSortableEntityListHeader>
              {rows.map((r) => (
                <AppSortableEntityListRow
                  key={r.id}
                  as="div"
                  gridCols={OWNERS_GRID}
                  minWidth="min-w-[640px]"
                  className={uiCx('px-4 py-3', !r.active && 'opacity-70')}
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-gray-900">
                      {r.display_name || r.legal_name}
                    </div>
                    {r.display_name && r.display_name !== r.legal_name ? (
                      <div className={uiCx(uiTypography.helper, 'truncate')}>{r.legal_name}</div>
                    ) : null}
                  </div>
                  <span className="truncate text-xs text-gray-700">{r.legal_name}</span>
                  <AppBadge variant="neutral">{r.entity_type === 'person' ? 'Person' : 'Company'}</AppBadge>
                  <AppBadge variant={r.active ? 'success' : 'neutral'}>{r.active ? 'Active' : 'Inactive'}</AppBadge>
                  <div className="flex w-20 shrink-0 items-center justify-end gap-1.5">
                    {canEdit ? (
                      <>
                        <AppListRowIconButton
                          preset="edit"
                          label="Edit owner"
                          onClick={(e) => {
                            e.stopPropagation();
                            openEdit(r);
                          }}
                        />
                        {r.active ? (
                          <AppListRowIconButton
                            preset="delete"
                            label="Deactivate owner"
                            onClick={(e) => {
                              e.stopPropagation();
                              void deactivate(r);
                            }}
                          />
                        ) : null}
                      </>
                    ) : null}
                  </div>
                </AppSortableEntityListRow>
              ))}
            </>
          )}
        </AppSortableEntityList>
      )}

      <AppFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit owner' : 'Add owner'}
        formWidth="comfortable"
        footer={
          <div className={uiCx(uiLayout.actionsRow, 'w-full justify-end')}>
            <AppButton variant="secondary" size="sm" onClick={() => setModalOpen(false)}>
              Cancel
            </AppButton>
            <AppButton size="sm" onClick={() => saveMut.mutate()} disabled={saveMut.isPending} loading={saveMut.isPending}>
              Save
            </AppButton>
          </div>
        }
      >
        <div className="space-y-3">
          <AppInput
            label="Legal name"
            value={form.legal_name}
            onChange={(e) => setForm({ ...form, legal_name: e.target.value })}
            required
          />
          <AppInput
            label="Display name"
            value={form.display_name}
            onChange={(e) => setForm({ ...form, display_name: e.target.value })}
          />
          <AppSelect
            label="Type"
            value={form.entity_type}
            onChange={(e) => setForm({ ...form, entity_type: e.target.value })}
            options={[
              { value: 'company', label: 'Company' },
              { value: 'person', label: 'Person' },
            ]}
          />
          <AppTextarea
            label="Notes"
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            rows={3}
          />
        </div>
      </AppFormModal>
    </div>
  );
}
