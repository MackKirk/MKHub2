import { useCallback, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { ListTree, Search } from 'lucide-react';
import { api } from '@/lib/api';
import { formCustomListNewQuickInfo } from '@/lib/formModalQuickInfo';
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
  AppCard,
  AppEmptyState,
  AppFormModal,
  AppInput,
  AppListCreateItem,
  AppListRowIconButton,
  AppPageHeader,
  AppSectionHeader,
  uiCx,
  uiLayout,
  uiShadows,
  uiSpacing,
  uiTypography,
} from '@/components/ui';

type CustomListRow = FormCustomListRow;
type TreeNode = FormCustomListTreeNode;

export type FormCustomListsPageVariant = 'safety' | 'fieldwork';

type FormCustomListsPageProps = {
  variant?: FormCustomListsPageVariant;
};

const SEEDED_FIELDWORK_LIST_NAMES = new Set(['R&M Observed Conditions', 'R&M Work Performed']);

export default function FormCustomListsPage({ variant = 'safety' }: FormCustomListsPageProps) {
  const confirm = useConfirm();
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [listsSearch, setListsSearch] = useState('');
  const isFieldwork = variant === 'fieldwork';
  const location = useLocation();
  const templatesLink = isFieldwork
    ? location.pathname.startsWith('/fieldwork/')
      ? '/fieldwork/form-templates'
      : '/rm-fieldwork/form-templates'
    : '/documents/form-templates';
  const createDomain = isFieldwork ? 'fieldwork' : 'safety';

  const { data: listsRaw, isLoading } = useQuery({
    queryKey: ['formCustomLists', variant],
    queryFn: () =>
      isFieldwork
        ? api<CustomListRow[]>('GET', '/form-custom-lists?domain=fieldwork')
        : api<CustomListRow[]>('GET', '/form-custom-lists'),
  });

  const lists = useMemo(() => {
    const rows = listsRaw || [];
    if (isFieldwork) return rows;
    // Safety Documents hub: shared + safety only (never Fieldwork / HR exclusive lists).
    return rows.filter((r) => {
      const d = (r.domain || 'shared').toLowerCase();
      return d === 'shared' || d === 'safety';
    });
  }, [listsRaw, isFieldwork]);

  const { data: detail, isLoading: detailLoading } = useQuery({
    queryKey: ['formCustomList', selectedId],
    queryFn: () =>
      api<FormCustomListDetail>('GET', `/form-custom-lists/${encodeURIComponent(selectedId!)}`),
    enabled: !!selectedId,
  });

  const createMut = useMutation({
    mutationFn: () =>
      api<CustomListRow>('POST', '/form-custom-lists', {
        name: newName.trim(),
        domain: createDomain,
        description: null,
        status: 'active',
      }),
    onSuccess: (row) => {
      qc.invalidateQueries({ queryKey: ['formCustomLists'] });
      toast.success('List created');
      setCreateOpen(false);
      setNewName('');
      setSelectedId(row.id);
    },
    onError: () => toast.error('Could not create list'),
  });

  const patchMut = useMutation({
    mutationFn: (body: { id: string; name?: string; status?: string; include_other?: boolean }) =>
      api('PATCH', `/form-custom-lists/${encodeURIComponent(body.id)}`, {
        name: body.name,
        status: body.status,
        include_other: body.include_other,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['formCustomLists'] });
      qc.invalidateQueries({ queryKey: ['formCustomList', selectedId] });
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
      qc.invalidateQueries({ queryKey: ['formCustomList', selectedId] });
    },
    onError: () => toast.error('Could not add item'),
  });

  const patchItemMut = useMutation({
    mutationFn: (body: { itemId: string; name?: string; parent_id?: string | null }) => {
      const pl: Record<string, unknown> = {};
      if (body.name !== undefined) pl.name = body.name;
      if (body.parent_id !== undefined) pl.parent_id = body.parent_id;
      return api<FormCustomListItemApi>('PATCH', `/form-custom-lists/items/${encodeURIComponent(body.itemId)}`, pl);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['formCustomList', selectedId] });
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
      qc.invalidateQueries({ queryKey: ['formCustomList', selectedId] });
    },
    onError: () => toast.error('Could not reorder items'),
  });

  const deleteItemMut = useMutation({
    mutationFn: (itemId: string) => api('DELETE', `/form-custom-lists/items/${encodeURIComponent(itemId)}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['formCustomList', selectedId] });
      qc.invalidateQueries({ queryKey: ['formCustomLists'] });
      toast.success('Item removed');
    },
    onError: () => toast.error('Could not remove item'),
  });

  const deleteListMut = useMutation({
    mutationFn: (listId: string) => api<{ ok: boolean }>('DELETE', `/form-custom-lists/${encodeURIComponent(listId)}`),
    onSuccess: (_data, listId) => {
      qc.invalidateQueries({ queryKey: ['formCustomLists'] });
      qc.removeQueries({ queryKey: ['formCustomList', listId] });
      if (selectedId === listId) setSelectedId(null);
      toast.success('List deleted');
    },
    onError: (err) => {
      const msg = err instanceof Error ? err.message : 'Could not delete list';
      toast.error(msg);
    },
  });

  const sortedLists = useMemo(() => [...(lists || [])].sort((a, b) => a.name.localeCompare(b.name)), [lists]);

  const filteredLists = useMemo(() => {
    const q = listsSearch.trim().toLowerCase();
    if (!q) return sortedLists;
    return sortedLists.filter((row) => (row.name || '').toLowerCase().includes(q));
  }, [sortedLists, listsSearch]);

  const applyOptimisticItems = useCallback(
    (items: TreeNode[]) => {
      qc.setQueryData(['formCustomList', selectedId], (prev: FormCustomListDetail | undefined) =>
        prev ? { ...prev, items } : prev
      );
    },
    [qc, selectedId]
  );

  const invalidateListDetail = useCallback(() => {
    void qc.invalidateQueries({ queryKey: ['formCustomList', selectedId] });
  }, [qc, selectedId]);

  return (
    <div
      className={uiCx(
        'w-full min-w-0 flex flex-col min-h-0',
        uiSpacing.pageStack,
        'min-h-full bg-gray-50',
        'h-[calc(100dvh-6rem)] max-h-[calc(100dvh-6rem)] overflow-hidden',
      )}
    >
      <AppPageHeader
        className="shrink-0"
        title={isFieldwork ? 'Fieldwork phrase libraries' : 'Form Custom Lists'}
        subtitle={
          isFieldwork ? (
            <>
              R&amp;M Observed Conditions and R&amp;M Work Performed catalogs (Form Engine lists). Organize categories,
              search, add, edit, and deactivate phrases — no separate list system.{' '}
              <Link to={templatesLink} className="text-brand-red hover:underline">
                Fieldwork templates
              </Link>
            </>
          ) : (
            <>
              Reusable hierarchical lists for drop-down fields in form templates.{' '}
              <Link to={templatesLink} className="text-brand-red hover:underline">
                Form Templates
              </Link>
            </>
          )
        }
        icon={<ListTree className="h-4 w-4" />}
      />

      <div className="flex-1 min-h-0 grid grid-cols-1 gap-4 overflow-hidden grid-rows-[minmax(0,1fr)_minmax(0,1fr)] lg:grid-rows-1 lg:grid-cols-4 lg:items-stretch lg:gap-6">
        <AppCard
          className={uiCx(uiShadows.card, 'lg:col-span-1 flex flex-col h-full max-h-full min-h-0 min-w-0')}
          bodyClassName="!p-0 flex flex-col min-h-0 flex-1"
        >
          <div className={uiCx('shrink-0 border-b border-gray-100', uiSpacing.cardPadding)}>
            <AppSectionHeader title="Lists" />
          </div>
          <div className={uiCx('shrink-0 space-y-2 border-b border-gray-100', uiSpacing.cardPadding)}>
            <AppListCreateItem label="New list" layout="row" className="w-full" onClick={() => setCreateOpen(true)} />
            <AppInput
              id="form-custom-lists-search"
              type="search"
              value={listsSearch}
              onChange={(e) => setListsSearch(e.target.value)}
              placeholder="Search lists…"
              leftIcon={<Search className="h-4 w-4" />}
              aria-label="Search lists"
              autoComplete="off"
            />
          </div>
          {isLoading ? (
            <div className={uiCx(uiTypography.helper, 'flex-1 flex items-center justify-center p-8 min-h-0')}>
              Loading…
            </div>
          ) : sortedLists.length === 0 ? (
            <div className={uiCx(uiSpacing.cardPadding, 'flex-1 min-h-0')}>
              <AppEmptyState
                title="No custom lists yet."
                description="Create one above to use in dropdown fields."
                className="border-0 bg-transparent p-0 shadow-none"
              />
            </div>
          ) : filteredLists.length === 0 ? (
            <div className={uiCx(uiTypography.helper, 'flex-1 flex items-center justify-center p-6 min-h-0')}>
              No lists match your search.
            </div>
          ) : (
            <ul className="flex-1 min-h-0 overflow-y-auto overscroll-contain list-none">
              {filteredLists.map((row) => {
                const usedCount = row.used_in_form_count ?? 0;
                const seededCatalog = SEEDED_FIELDWORK_LIST_NAMES.has((row.name || '').trim());
                const deleteBlocked = usedCount > 0 || seededCatalog;
                const selected = selectedId === row.id;
                return (
                  <li key={row.id} className="flex items-stretch min-w-0">
                    <button
                      type="button"
                      onClick={() => setSelectedId(row.id)}
                      className={uiCx(
                        'flex-1 min-w-0 text-left px-4 py-2.5 transition-colors hover:bg-gray-50',
                        selected && 'bg-gray-50 font-semibold',
                      )}
                    >
                      <span className={uiCx(uiTypography.body, 'truncate block')}>{row.name}</span>
                    </button>
                    <div className="flex shrink-0 items-center pr-2">
                      <AppListRowIconButton
                        preset="delete"
                        label={
                          seededCatalog
                            ? 'Seeded Fieldwork phrase catalog cannot be deleted'
                            : deleteBlocked
                              ? `Delete list (disabled: used in ${usedCount} form template(s))`
                              : `Delete list ${row.name}`
                        }
                        disabled={deleteBlocked || deleteListMut.isPending}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (deleteBlocked) return;
                          void (async () => {
                            const r = await confirm({
                              title: 'Delete list?',
                              message: `Delete list "${row.name}"? All items in this list will be removed. This cannot be undone.`,
                              confirmText: 'Delete',
                              cancelText: 'Cancel',
                            });
                            if (r !== 'confirm') return;
                            deleteListMut.mutate(row.id);
                          })();
                        }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </AppCard>

        <AppCard
          className={uiCx(uiShadows.card, 'lg:col-span-3 flex flex-col h-full max-h-full min-h-0 min-w-0')}
          bodyClassName="!p-0 flex flex-col min-h-0 flex-1"
        >
          {!selectedId ? (
            <div className={uiCx(uiSpacing.cardPadding, 'flex-1 flex items-center justify-center min-h-0')}>
              <AppEmptyState
                title="Select a list"
                description="Choose a list on the left to edit items and hierarchy."
                className="border-0 bg-transparent p-0 shadow-none"
              />
            </div>
          ) : detailLoading || !detail ? (
            <div className={uiCx(uiTypography.helper, 'flex-1 flex items-center justify-center p-8 min-h-0')}>
              Loading…
            </div>
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
        </AppCard>
      </div>

      <AppFormModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="New custom list"
        description="Used as options source for dropdown fields in form templates."
        quickInfo={formCustomListNewQuickInfo}
        footer={
          <div className={uiCx(uiLayout.actionsRow, 'w-full justify-end')}>
            <AppButton type="button" variant="secondary" size="sm" onClick={() => setCreateOpen(false)}>
              Cancel
            </AppButton>
            <AppButton
              type="button"
              size="sm"
              disabled={!newName.trim() || createMut.isPending}
              loading={createMut.isPending}
              onClick={() => createMut.mutate()}
            >
              {createMut.isPending ? 'Creating…' : 'Create'}
            </AppButton>
          </div>
        }
      >
        <AppInput
          label="Name *"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="e.g. Hazard Types"
          autoFocus
          fieldHint="Name\n\nShort label for this list. It appears when you pick this list in Form Templates and in the list on the left."
        />
      </AppFormModal>
    </div>
  );
}

