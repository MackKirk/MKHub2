import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import { ApiError, api, formatApiErrorDetail } from '@/lib/api';
import { formModalQuickInfo } from '@/lib/formModalQuickInfo';
import { useConfirm } from '@/components/ConfirmProvider';
import {
  FormCustomListDetailPanel,
  type FormCustomListDetail,
  type FormCustomListItemApi,
  type FormCustomListRow,
  type FormCustomListTreeNode,
} from '@/components/form/FormCustomListDetailPanel';
import {
  AppButton,
  AppEmptyState,
  AppFormModal,
  AppInput,
  AppListCreateItem,
  AppListRowIconButton,
  uiCx,
  uiTypography,
} from '@/components/ui';

type Props = {
  open: boolean;
  onClose: () => void;
  /** Currently linked list id (may be empty). */
  value: string;
  onSave: (customListId: string) => void;
  /** `fieldwork` → POST domain fieldwork; otherwise safety. */
  domain: 'fieldwork' | 'safety';
  fieldLabel?: string;
  /** Allow clearing the linked list (edit field). Default true. */
  allowClear?: boolean;
  /** Require a selection before Done (new dropdown field). */
  requireSelection?: boolean;
  /** Backdrop z-index when stacked on another modal. */
  overlayClassName?: string;
};

const SEEDED_FIELDWORK_LIST_NAMES = new Set(['R&M Observed Conditions', 'R&M Work Performed']);

const pickerQuickInfo = formModalQuickInfo({
  purpose: (
    <>
      Attach a reusable custom list to this dropdown so respondents pick from shared options instead of free text.
    </>
  ),
  howToUse: (
    <>
      Choose a list on the left, edit items on the right the same way as Form Custom Lists — rename, nest, reorder,
      delete, and toggle Include Other. Create a new list when none fit.
    </>
  ),
  behavior: (
    <>
      Edits save to the shared list immediately. Use list only links that list to this field; the template still needs
      a normal Save.
    </>
  ),
  actions: (
    <>
      Use list applies the selection. Clear removes the list from this field. Cancel closes without changing the field.
    </>
  ),
});

export default function FormCustomListPickerModal({
  open,
  onClose,
  value,
  onSave,
  domain,
  fieldLabel,
  allowClear = true,
  requireSelection = false,
  overlayClassName,
}: Props) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [selectedId, setSelectedId] = useState(value || '');
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [newListName, setNewListName] = useState('');

  useEffect(() => {
    if (!open) return;
    setSelectedId(value || '');
    setSearch('');
    setCreating(false);
    setNewListName('');
  }, [open, value]);

  const listsQueryKey = ['formCustomLists', domain === 'fieldwork' ? 'fieldwork-picker' : 'default'] as const;

  const { data: listsRaw = [], isLoading: listsLoading } = useQuery({
    queryKey: listsQueryKey,
    queryFn: () =>
      domain === 'fieldwork'
        ? api<FormCustomListRow[]>('GET', '/form-custom-lists?domain=fieldwork')
        : api<FormCustomListRow[]>('GET', '/form-custom-lists'),
    enabled: open,
  });

  const lists = useMemo(() => {
    if (domain === 'fieldwork') return listsRaw;
    return listsRaw.filter((l) => {
      const d = (l.domain || 'shared').toLowerCase();
      return d === 'shared' || d === 'safety';
    });
  }, [listsRaw, domain]);

  const filteredLists = useMemo(() => {
    const sorted = [...lists].sort((a, b) => a.name.localeCompare(b.name));
    const q = search.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter((l) => l.name.toLowerCase().includes(q));
  }, [lists, search]);

  const { data: detail, isLoading: detailLoading } = useQuery({
    queryKey: ['formCustomList', selectedId],
    queryFn: () => api<FormCustomListDetail>('GET', `/form-custom-lists/${encodeURIComponent(selectedId)}`),
    enabled: open && !!selectedId,
  });

  const createMut = useMutation({
    mutationFn: () =>
      api<FormCustomListRow>('POST', '/form-custom-lists', {
        name: newListName.trim(),
        domain,
        description: null,
        status: 'active',
      }),
    onSuccess: (row) => {
      void qc.invalidateQueries({ queryKey: ['formCustomLists'] });
      setSelectedId(row.id);
      setCreating(false);
      setNewListName('');
      toast.success('List created');
    },
    onError: (err) => {
      toast.error(formatApiErrorDetail((err as ApiError)?.detail) || 'Could not create list');
    },
  });

  const patchMut = useMutation({
    mutationFn: (body: { id: string; name?: string; status?: string; include_other?: boolean }) =>
      api('PATCH', `/form-custom-lists/${encodeURIComponent(body.id)}`, {
        name: body.name,
        status: body.status,
        include_other: body.include_other,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['formCustomLists'] });
      void qc.invalidateQueries({ queryKey: ['formCustomList', selectedId] });
      toast.success('Saved');
    },
    onError: () => toast.error('Could not save'),
  });

  const addItemMut = useMutation({
    mutationFn: (body: { listId: string; parent_id: string | null; name: string }) =>
      api<FormCustomListItemApi>('POST', `/form-custom-lists/${encodeURIComponent(body.listId)}/items`, {
        parent_id: body.parent_id,
        name: body.name,
        status: 'active',
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['formCustomList', selectedId] });
    },
    onError: () => toast.error('Could not add item'),
  });

  const patchItemMut = useMutation({
    mutationFn: (body: { itemId: string; name?: string; parent_id?: string | null }) => {
      const pl: Record<string, unknown> = {};
      if (body.name !== undefined) pl.name = body.name;
      if (body.parent_id !== undefined) pl.parent_id = body.parent_id;
      return api<FormCustomListItemApi>(
        'PATCH',
        `/form-custom-lists/items/${encodeURIComponent(body.itemId)}`,
        pl
      );
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['formCustomList', selectedId] });
    },
    onError: () => toast.error('Could not save item'),
  });

  const reorderItemsMut = useMutation({
    mutationFn: (vars: { listId: string; parentId: string | null; orderedIds: string[] }) => {
      const q = vars.parentId == null ? '' : `?parent_id=${encodeURIComponent(vars.parentId)}`;
      return api('POST', `/form-custom-lists/${encodeURIComponent(vars.listId)}/items/reorder${q}`, {
        ordered_ids: vars.orderedIds,
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['formCustomList', selectedId] });
    },
    onError: () => toast.error('Could not reorder items'),
  });

  const deleteItemMut = useMutation({
    mutationFn: (itemId: string) => api('DELETE', `/form-custom-lists/items/${encodeURIComponent(itemId)}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['formCustomList', selectedId] });
      void qc.invalidateQueries({ queryKey: ['formCustomLists'] });
      toast.success('Item removed');
    },
    onError: () => toast.error('Could not remove item'),
  });

  const deleteListMut = useMutation({
    mutationFn: (listId: string) =>
      api<{ ok: boolean }>('DELETE', `/form-custom-lists/${encodeURIComponent(listId)}`),
    onSuccess: (_data, listId) => {
      void qc.invalidateQueries({ queryKey: ['formCustomLists'] });
      void qc.removeQueries({ queryKey: ['formCustomList', listId] });
      if (selectedId === listId) setSelectedId('');
      toast.success('List deleted');
    },
    onError: (err) => {
      toast.error(formatApiErrorDetail((err as ApiError)?.detail) || 'Could not delete list');
    },
  });

  const applyOptimisticItems = useCallback(
    (items: FormCustomListTreeNode[]) => {
      qc.setQueryData(['formCustomList', selectedId], (prev: FormCustomListDetail | undefined) =>
        prev ? { ...prev, items } : prev
      );
    },
    [qc, selectedId]
  );

  const invalidateListDetail = useCallback(() => {
    void qc.invalidateQueries({ queryKey: ['formCustomList', selectedId] });
  }, [qc, selectedId]);

  const canSave = !requireSelection || !!selectedId.trim();
  const selectedMeta = lists.find((l) => l.id === selectedId);

  return (
    <AppFormModal
      open={open}
      onClose={onClose}
      title="Custom list"
      description={
        fieldLabel?.trim()
          ? `Choose and edit the list for “${fieldLabel.trim()}”.`
          : 'Choose and edit which reusable list supplies options for this dropdown.'
      }
      layout="detail"
      size="lg"
      scrollBody={false}
      quickInfo={pickerQuickInfo}
      overlayClassName={overlayClassName}
      dialogClassName="!w-[min(96vw,84rem)] !max-w-[min(96vw,84rem)] !h-[min(94vh,58rem)] !max-h-[min(94vh,58rem)]"
      bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-0"
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <p className={uiCx(uiTypography.helper)}>
            {selectedId
              ? selectedMeta
                ? selectedMeta.name
                : detail?.name || 'Loading list…'
              : 'No list selected'}
          </p>
          <div className="flex flex-wrap gap-2">
            {allowClear && value ? (
              <AppButton
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  onSave('');
                  onClose();
                }}
              >
                Clear
              </AppButton>
            ) : null}
            <AppButton type="button" variant="secondary" size="sm" onClick={onClose}>
              Cancel
            </AppButton>
            <AppButton
              type="button"
              size="sm"
              disabled={!canSave}
              onClick={() => {
                onSave(selectedId.trim());
                onClose();
              }}
            >
              Use list
            </AppButton>
          </div>
        </div>
      }
    >
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden md:flex-row">
        <aside className="flex max-h-[36vh] min-h-0 w-full shrink-0 flex-col border-b border-gray-200 bg-gradient-to-b from-gray-50/90 to-white md:max-h-none md:w-[22rem] md:border-b-0 md:border-r lg:w-[24rem]">
          <div className="shrink-0 space-y-2 border-b border-gray-200 px-3 py-3 sm:px-4">
            {creating ? (
              <div className="space-y-2 rounded-xl border border-dashed border-gray-300 bg-white p-2.5">
                <AppInput
                  label="New list name"
                  value={newListName}
                  onChange={(e) => setNewListName(e.target.value)}
                  placeholder="e.g. Roof types"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      setCreating(false);
                      setNewListName('');
                    }
                    if (e.key === 'Enter' && newListName.trim()) {
                      e.preventDefault();
                      createMut.mutate();
                    }
                  }}
                />
                <div className="flex justify-end gap-2">
                  <AppButton
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setCreating(false);
                      setNewListName('');
                    }}
                  >
                    Cancel
                  </AppButton>
                  <AppButton
                    type="button"
                    size="sm"
                    disabled={!newListName.trim() || createMut.isPending}
                    loading={createMut.isPending}
                    onClick={() => createMut.mutate()}
                  >
                    Create
                  </AppButton>
                </div>
              </div>
            ) : (
              <AppListCreateItem
                label="New list"
                layout="row"
                className="w-full"
                onClick={() => setCreating(true)}
              />
            )}
            <label className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search lists…"
                className="w-full rounded-xl border border-gray-300 py-2 pl-10 pr-3 text-sm outline-none focus:border-brand-red focus:ring-2 focus:ring-brand-red/20"
              />
            </label>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {listsLoading ? (
              <p className={uiCx(uiTypography.helper, 'px-4 py-3')}>Loading lists…</p>
            ) : lists.length === 0 ? (
              <div className="p-4">
                <AppEmptyState
                  title="No custom lists yet."
                  description="Create one above to use in this dropdown."
                  className="border-0 bg-transparent p-0 shadow-none"
                />
              </div>
            ) : filteredLists.length === 0 ? (
              <p className={uiCx(uiTypography.helper, 'px-4 py-3')}>No lists match your search.</p>
            ) : (
              <ul className="list-none">
                {filteredLists.map((list) => {
                  const active = selectedId === list.id;
                  const usedCount = list.used_in_form_count ?? 0;
                  const seededCatalog = SEEDED_FIELDWORK_LIST_NAMES.has((list.name || '').trim());
                  const deleteBlocked = usedCount > 0 || seededCatalog;
                  return (
                    <li key={list.id} className="flex items-stretch min-w-0">
                      <button
                        type="button"
                        onClick={() => setSelectedId(list.id)}
                        className={uiCx(
                          'flex min-w-0 flex-1 items-center gap-2 px-3 py-2.5 text-left text-sm transition-colors hover:bg-white/80',
                          active
                            ? 'bg-red-50 font-semibold text-brand-red'
                            : 'text-gray-800'
                        )}
                      >
                        <span className="min-w-0 flex-1 truncate">{list.name}</span>
                        {active ? <Check className="h-4 w-4 shrink-0" aria-hidden /> : null}
                      </button>
                      <div className="flex shrink-0 items-center pr-2">
                        <AppListRowIconButton
                          preset="delete"
                          label={
                            seededCatalog
                              ? 'Seeded Fieldwork phrase catalog cannot be deleted'
                              : deleteBlocked
                                ? `Delete list (disabled: used in ${usedCount} form template(s))`
                                : `Delete list ${list.name}`
                          }
                          disabled={deleteBlocked || deleteListMut.isPending}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (deleteBlocked) return;
                            void (async () => {
                              const r = await confirm({
                                title: 'Delete list?',
                                message: `Delete list "${list.name}"? All items in this list will be removed. This cannot be undone.`,
                                confirmText: 'Delete',
                                cancelText: 'Cancel',
                              });
                              if (r !== 'confirm') return;
                              deleteListMut.mutate(list.id);
                            })();
                          }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </aside>

        <section className="flex min-h-0 min-w-0 flex-1 flex-col bg-white">
          {!selectedId ? (
            <div className="flex min-h-0 flex-1 items-center justify-center p-6">
              <AppEmptyState
                title="Select a list"
                description="Choose a list on the left to edit items and hierarchy."
                className="border-0 bg-transparent p-0 shadow-none"
              />
            </div>
          ) : detailLoading || !detail ? (
            <p className={uiCx(uiTypography.helper, 'flex flex-1 items-center justify-center p-8')}>
              Loading…
            </p>
          ) : (
            <FormCustomListDetailPanel
              detail={detail}
              onPatch={(patch) => patchMut.mutate({ id: detail.id, ...patch })}
              addItemMut={addItemMut}
              patchItemMut={patchItemMut}
              reorderItemsMut={reorderItemsMut}
              applyOptimisticItems={applyOptimisticItems}
              invalidateListDetail={invalidateListDetail}
              onDeleteItem={(id) => deleteItemMut.mutate(id)}
              isSaving={patchMut.isPending}
            />
          )}
        </section>
      </div>
    </AppFormModal>
  );
}
