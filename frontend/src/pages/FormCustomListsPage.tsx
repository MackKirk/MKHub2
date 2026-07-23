import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  pointerWithin,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ChevronRight, GripVertical, ListTree, Minus, Plus, Search } from 'lucide-react';
import { api } from '@/lib/api';
import { formCustomListNewQuickInfo } from '@/lib/formModalQuickInfo';
import { useConfirm } from '@/components/ConfirmProvider';
import {
  AppBadge,
  AppButton,
  AppCard,
  AppCheckbox,
  AppEmptyState,
  AppFormModal,
  AppInput,
  AppListCreateItem,
  AppListRowIconButton,
  AppPageHeader,
  AppSectionHeader,
  AppTooltip,
  uiBorders,
  uiCx,
  uiLayout,
  uiListRowIconButton,
  uiRadius,
  uiShadows,
  uiSpacing,
  uiTypography,
} from '@/components/ui';

type CustomListRow = {
  id: string;
  name: string;
  description?: string | null;
  status: string;
  /** When true, adding this list to a dropdown in a form template also adds a Long Answer field "Other:" below. */
  include_other?: boolean;
  created_at?: string | null;
  updated_at?: string | null;
  created_by?: string | null;
  used_in_form_count?: number;
  used_in_form_names?: string[];
};

type TreeNode = {
  id: string;
  list_id: string;
  parent_id: string | null;
  name: string;
  sort_order: number;
  depth: number;
  status: string;
  children: TreeNode[];
};

type FormCustomListItemApi = {
  id: string;
  list_id: string;
  parent_id: string | null;
  name: string;
  sort_order: number;
  depth: number;
  status: string;
};

type FormCustomListDetail = CustomListRow & { items: TreeNode[]; leaf_options?: { value: string; label: string }[] };

const MAX_DEPTH = 3;

/** Inline rename fields (DnD tree) — same shell as AppInput, needs native ref for focus/select. */
const inlineControlInputClass = uiCx(
  'w-full text-xs text-gray-900 outline-none transition-colors',
  'focus:border-gray-400 focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-gray-400/35',
  uiSpacing.controlX,
  uiSpacing.controlY,
  uiRadius.control,
  uiBorders.input,
);

function findItemNameInTree(nodes: TreeNode[], id: string): string | null {
  for (const n of nodes) {
    if (n.id === id) return n.name;
    if (n.children?.length) {
      const found = findItemNameInTree(n.children, id);
      if (found !== null) return found;
    }
  }
  return null;
}

function findNodeById(tree: TreeNode[], id: string): TreeNode | null {
  for (const n of tree) {
    if (n.id === id) return n;
    if (n.children?.length) {
      const f = findNodeById(n.children, id);
      if (f) return f;
    }
  }
  return null;
}

/** `null` = root-level item; `undefined` = not found */
function getParentId(tree: TreeNode[], itemId: string): string | null | undefined {
  for (const n of tree) {
    if (n.id === itemId) return null;
  }
  function walk(nodes: TreeNode[]): string | null | undefined {
    for (const n of nodes) {
      if (n.children?.some((c) => c.id === itemId)) return n.id;
      if (n.children?.length) {
        const w = walk(n.children);
        if (w !== undefined) return w;
      }
    }
    return undefined;
  }
  return walk(tree);
}

function getChildrenIds(tree: TreeNode[], parentId: string | null): string[] {
  if (parentId === null) return tree.map((n) => n.id);
  const p = findNodeById(tree, parentId);
  return p?.children?.map((c) => c.id) ?? [];
}

/** True if `testId` is a strict descendant of `ancestorId` (walks up from testId). */
function isStrictDescendantOf(tree: TreeNode[], ancestorId: string, testId: string): boolean {
  let cur = testId;
  for (;;) {
    const p = getParentId(tree, cur);
    if (p === undefined || p === null) return false;
    if (p === ancestorId) return true;
    cur = p;
  }
}

/** Prefer the element under the pointer so nested rows beat the parent row’s hit box. */
const pointerThenClosestCenter: CollisionDetection = (args) => {
  const hit = pointerWithin(args);
  if (hit.length > 0) return hit;
  return closestCenter(args);
};

function pluckNode(nodes: TreeNode[], id: string): TreeNode | null {
  const i = nodes.findIndex((n) => n.id === id);
  if (i >= 0) {
    return nodes.splice(i, 1)[0]!;
  }
  for (const n of nodes) {
    if (n.children?.length) {
      const p = pluckNode(n.children, id);
      if (p) return p;
    }
  }
  return null;
}

function applyDepthRecursive(n: TreeNode, depth: number, parentId: string | null) {
  n.depth = depth;
  n.parent_id = parentId;
  for (const c of n.children || []) {
    applyDepthRecursive(c, depth + 1, n.id);
  }
}

function setChildrenNodes(tree: TreeNode[], parentId: string | null, children: TreeNode[]) {
  if (parentId === null) {
    tree.splice(0, tree.length, ...children);
    return;
  }
  const p = findNodeById(tree, parentId);
  if (p) p.children = children;
}

function applyOptimisticReorderItems(items: TreeNode[], parentId: string | null, orderedIds: string[]): TreeNode[] {
  const next = structuredClone(items) as TreeNode[];
  if (parentId === null) {
    const m = new Map(next.map((n) => [n.id, n]));
    const list = orderedIds.map((id) => m.get(id)).filter((n): n is TreeNode => n != null);
    next.splice(0, next.length, ...list);
    return next;
  }
  const parent = findNodeById(next, parentId);
  if (!parent) return items;
  const m = new Map(parent.children.map((c) => [c.id, c]));
  parent.children = orderedIds.map((id) => m.get(id)).filter((c): c is TreeNode => c != null);
  return next;
}

function applyOptimisticMoveItems(
  items: TreeNode[],
  activeId: string,
  destParent: string | null,
  newDestOrder: string[],
  sourceParent: string | null,
  sourceOrderedIds: string[]
): TreeNode[] {
  const next = structuredClone(items) as TreeNode[];
  const taken = pluckNode(next, activeId);
  if (!taken) return items;

  if (destParent === null) {
    applyDepthRecursive(taken, 1, null);
  } else {
    const p = findNodeById(next, destParent);
    const pd = p?.depth ?? 0;
    applyDepthRecursive(taken, pd + 1, destParent);
  }

  const resolveDest = (id: string): TreeNode | undefined => {
    if (id === activeId) return taken;
    return findNodeById(next, id) ?? undefined;
  };
  const destChildren = newDestOrder.map(resolveDest).filter((n): n is TreeNode => n != null);
  setChildrenNodes(next, destParent, destChildren);

  const srcChildren = sourceOrderedIds
    .map((id) => findNodeById(next, id))
    .filter((n): n is TreeNode => n != null);
  setChildrenNodes(next, sourceParent, srcChildren);

  return next;
}

function listStatusBadge(status: string) {
  if (status === 'active') {
    return <AppBadge variant="success">Active</AppBadge>;
  }
  return <AppBadge variant="neutral">Inactive</AppBadge>;
}

export default function FormCustomListsPage() {
  const confirm = useConfirm();
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [listsSearch, setListsSearch] = useState('');

  const { data: lists, isLoading } = useQuery({
    queryKey: ['formCustomLists'],
    queryFn: () => api<CustomListRow[]>('GET', '/form-custom-lists'),
  });

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
        title="Form Custom Lists"
        subtitle={
          <>
            Reusable hierarchical lists for drop-down fields in form templates.{' '}
            <Link to="/safety/form-templates" className="text-brand-red hover:underline">
              Form Templates
            </Link>
          </>
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
                const deleteBlocked = usedCount > 0;
                const selected = selectedId === row.id;
                return (
                  <li key={row.id} className="flex items-stretch min-w-0">
                    <button
                      type="button"
                      onClick={() => setSelectedId(row.id)}
                      className={uiCx(
                        'flex-1 min-w-0 text-left px-4 py-2.5 transition-colors hover:bg-gray-50',
                        selected && 'bg-gray-50 font-medium',
                      )}
                    >
                      <span className={uiCx(uiTypography.body, 'truncate block')}>{row.name}</span>
                    </button>
                    <div className="flex shrink-0 items-center pr-2">
                      <AppListRowIconButton
                        preset="delete"
                        label={
                          deleteBlocked
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
            <ListDetailPanel
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

function ListDetailPanel({
  detail,
  onPatch,
  addItemMut,
  patchItemMut,
  reorderItemsMut,
  applyOptimisticItems,
  invalidateListDetail,
  onDeleteItem,
  isSaving,
}: {
  detail: CustomListRow & { items: TreeNode[]; leaf_options?: { value: string; label: string }[] };
  onPatch: (p: { name?: string; status?: string; include_other?: boolean }) => void;
  addItemMut: {
    mutateAsync: (body: { listId: string; parent_id: string | null; name: string }) => Promise<FormCustomListItemApi>;
    isPending: boolean;
  };
  patchItemMut: {
    mutateAsync: (body: { itemId: string; name?: string; parent_id?: string | null }) => Promise<FormCustomListItemApi>;
    isPending: boolean;
  };
  reorderItemsMut: {
    mutateAsync: (vars: { listId: string; parentId: string | null; orderedIds: string[] }) => Promise<unknown>;
    isPending: boolean;
  };
  applyOptimisticItems: (items: TreeNode[]) => void;
  invalidateListDetail: () => void;
  onDeleteItem: (id: string) => void;
  isSaving: boolean;
}) {
  const confirm = useConfirm();
  const qc = useQueryClient();
  const [localName, setLocalName] = useState(detail.name);
  const [localStatus, setLocalStatus] = useState(detail.status);
  const [localIncludeOther, setLocalIncludeOther] = useState(Boolean(detail.include_other));
  const [editingListName, setEditingListName] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');
  const editInputRef = useRef<HTMLInputElement>(null);
  const listNameInputRef = useRef<HTMLInputElement>(null);
  const skipNextCommitRef = useRef(false);
  const skipListNameCommitRef = useRef(false);

  useEffect(() => {
    setLocalName(detail.name);
    setLocalStatus(detail.status);
    setLocalIncludeOther(Boolean(detail.include_other));
  }, [detail.id, detail.name, detail.status, detail.include_other]);

  useEffect(() => {
    setEditingListName(false);
    setEditingItemId(null);
    setDraftName('');
  }, [detail.id]);

  useLayoutEffect(() => {
    if (!editingItemId) return;
    const el = editInputRef.current;
    if (!el) return;
    el.focus();
    el.select();
  }, [editingItemId]);

  useEffect(() => {
    if (!editingListName) return;
    const t = window.setTimeout(() => {
      listNameInputRef.current?.focus();
      listNameInputRef.current?.select();
    }, 0);
    return () => window.clearTimeout(t);
  }, [editingListName]);

  const commitListName = () => {
    if (skipListNameCommitRef.current) {
      skipListNameCommitRef.current = false;
      return;
    }
    const trimmed = localName.trim();
    if (!trimmed) {
      toast.error('List name cannot be empty');
      setLocalName(detail.name);
      window.setTimeout(() => {
        listNameInputRef.current?.focus();
        listNameInputRef.current?.select();
      }, 0);
      return;
    }
    setEditingListName(false);
    if (trimmed !== detail.name) onPatch({ name: trimmed });
  };

  const cancelListNameEdit = () => {
    skipListNameCommitRef.current = true;
    setLocalName(detail.name);
    setEditingListName(false);
  };

  const beginEditListName = () => {
    setLocalName(detail.name);
    setEditingListName(true);
  };

  const beginEdit = (id: string, name: string) => {
    setEditingItemId(id);
    setDraftName(name);
  };

  const commitEdit = async () => {
    if (skipNextCommitRef.current) {
      skipNextCommitRef.current = false;
      return;
    }
    if (!editingItemId) return;
    const id = editingItemId;
    const trimmed = draftName.trim();
    if (!trimmed) {
      const prev = findItemNameInTree(detail.items, id);
      setDraftName(prev ?? '');
      toast.error('Item name cannot be empty');
      window.setTimeout(() => editInputRef.current?.focus(), 0);
      return;
    }
    const prev = findItemNameInTree(detail.items, id);
    if (prev !== null && trimmed !== prev) {
      try {
        await patchItemMut.mutateAsync({ itemId: id, name: trimmed });
      } catch {
        return;
      }
    }
    setEditingItemId(null);
  };

  const cancelEdit = () => {
    skipNextCommitRef.current = true;
    setEditingItemId(null);
  };

  const handleAddRoot = async () => {
    const row = await addItemMut.mutateAsync({
      listId: detail.id,
      parent_id: null,
      name: 'New item',
    });
    await qc.refetchQueries({ queryKey: ['formCustomList', detail.id] });
    setEditingItemId(row.id);
    setDraftName(row.name);
  };

  const handleAddChild = async (parentId: string) => {
    const row = await addItemMut.mutateAsync({
      listId: detail.id,
      parent_id: parentId,
      name: 'New item',
    });
    await qc.refetchQueries({ queryKey: ['formCustomList', detail.id] });
    setEditingItemId(row.id);
    setDraftName(row.name);
  };

  const handleDeleteItem = (id: string) => {
    void (async () => {
      const itemName = findItemNameInTree(detail.items, id) ?? 'this item';
      const r = await confirm({
        title: 'Remove item?',
        message: `Remove "${itemName}"? Child items will be removed too. This cannot be undone.`,
        confirmText: 'Remove',
        cancelText: 'Cancel',
      });
      if (r !== 'confirm') return;
      if (editingItemId === id) setEditingItemId(null);
      onDeleteItem(id);
    })();
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const [dragActiveId, setDragActiveId] = useState<string | null>(null);

  const handleItemDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;
      setDragActiveId(null);
      if (!over) return;
      const activeId = String(active.id);
      const overId = String(over.id);
      if (activeId === overId) return;

      const tree = detail.items;
      const parentA = getParentId(tree, activeId);
      const parentO = getParentId(tree, overId);
      if (parentA === undefined || parentO === undefined) return;

      if (parentA !== null && overId === parentA) return;

      const destParent = parentO;

      if (destParent === activeId || isStrictDescendantOf(tree, activeId, destParent)) {
        toast.error('Cannot move an item under itself or its descendants');
        return;
      }

      if (parentA === destParent) {
        const ids = getChildrenIds(tree, parentA);
        const oldIndex = ids.indexOf(activeId);
        const newIndex = ids.indexOf(overId);
        if (oldIndex < 0 || newIndex < 0) return;
        const newOrder = arrayMove(ids, oldIndex, newIndex);
        applyOptimisticItems(applyOptimisticReorderItems(detail.items, parentA, newOrder));
        try {
          await reorderItemsMut.mutateAsync({
            listId: detail.id,
            parentId: parentA,
            orderedIds: newOrder,
          });
        } catch {
          invalidateListDetail();
        }
        return;
      }

      const destSiblings = getChildrenIds(tree, destParent).filter((id) => id !== activeId);
      const insertAt = destSiblings.indexOf(overId);
      if (insertAt < 0) return;
      const newDestOrder = [...destSiblings];
      newDestOrder.splice(insertAt, 0, activeId);

      const sourceSiblings = getChildrenIds(tree, parentA).filter((id) => id !== activeId);

      applyOptimisticItems(
        applyOptimisticMoveItems(detail.items, activeId, destParent, newDestOrder, parentA, sourceSiblings)
      );
      try {
        await patchItemMut.mutateAsync({ itemId: activeId, parent_id: destParent });
        await reorderItemsMut.mutateAsync({
          listId: detail.id,
          parentId: destParent,
          orderedIds: newDestOrder,
        });
        if (sourceSiblings.length > 0) {
          await reorderItemsMut.mutateAsync({
            listId: detail.id,
            parentId: parentA,
            orderedIds: sourceSiblings,
          });
        }
      } catch {
        invalidateListDetail();
      }
    },
    [detail.items, detail.id, patchItemMut, reorderItemsMut, applyOptimisticItems, invalidateListDetail]
  );

  return (
    <div key={detail.id} className="flex flex-col h-full min-h-0 flex-1">
      <div className={uiCx('shrink-0 border-b border-gray-100', uiSpacing.cardPadding)}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-4 min-w-0">
          <div className="flex-1 min-w-0">
            {editingListName ? (
              <input
                ref={listNameInputRef}
                value={localName}
                onChange={(e) => setLocalName(e.target.value)}
                onBlur={() => commitListName()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    (e.target as HTMLInputElement).blur();
                  }
                  if (e.key === 'Escape') {
                    e.preventDefault();
                    cancelListNameEdit();
                  }
                }}
                aria-label="List name"
                className={uiCx(inlineControlInputClass, uiTypography.sectionTitle, 'font-semibold')}
              />
            ) : (
              <button
                type="button"
                onClick={beginEditListName}
                className={uiCx(
                  'text-left w-full truncate rounded-lg px-1 py-1 -mx-1 hover:bg-gray-100/80',
                  uiTypography.sectionTitle,
                )}
              >
                {localName || detail.name}
              </button>
            )}
            <p className={uiCx(uiTypography.helper, 'mt-1')}>
              {detail.used_in_form_names && detail.used_in_form_names.length > 0 ? (
                <>Used in: {detail.used_in_form_names.join(', ')}</>
              ) : (
                <>Not used in any form template.</>
              )}
            </p>
          </div>
          <div
            className={uiCx(
              'flex shrink-0 flex-wrap items-center gap-y-2 w-full sm:w-auto sm:min-w-[17rem] lg:min-w-[20rem]',
              'justify-between gap-x-4 sm:gap-x-8',
            )}
          >
            <AppCheckbox
              label='Include "Other"'
              checked={localIncludeOther}
              disabled={isSaving}
              className="shrink-0"
              fieldHint='Include "Other"\n\nWhen enabled, any drop-down in a form template that uses this list also adds a long-answer field labeled Other: below it, so users can type a value that is not in the list.'
              onChange={(next) => {
                setLocalIncludeOther(next);
                onPatch({ include_other: next });
              }}
            />
            <div className={uiCx(uiLayout.actionsRow, 'shrink-0 items-center')}>
              {listStatusBadge(localStatus)}
              <label
                className="flex items-center gap-2.5 cursor-pointer select-none"
                onClick={(e) => {
                  if ((e.target as HTMLElement).closest('button')) return;
                  if (isSaving) return;
                  const next = localStatus === 'active' ? 'inactive' : 'active';
                  setLocalStatus(next);
                  onPatch({ status: next });
                }}
              >
                <button
                  type="button"
                  role="switch"
                  aria-checked={localStatus === 'active'}
                  disabled={isSaving}
                  title={localStatus === 'active' ? 'Active' : 'Inactive'}
                  aria-label={
                    localStatus === 'active'
                      ? 'List is active. Click to deactivate.'
                      : 'List is inactive. Click to activate.'
                  }
                  onClick={() => {
                    const next = localStatus === 'active' ? 'inactive' : 'active';
                    setLocalStatus(next);
                    onPatch({ status: next });
                  }}
                  className={uiCx(
                    'relative inline-flex h-6 w-11 shrink-0 rounded-full border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-300 focus-visible:ring-offset-1 disabled:opacity-50',
                    localStatus === 'active' ? 'border-gray-900 bg-gray-900' : 'border-gray-300 bg-gray-200',
                  )}
                >
                  <span
                    className={uiCx(
                      'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform mt-0.5',
                      localStatus === 'active' ? 'translate-x-5 ml-0.5' : 'translate-x-0.5',
                    )}
                  />
                </button>
              </label>
              {isSaving ? <span className={uiTypography.helper}>Saving…</span> : null}
            </div>
          </div>
        </div>
      </div>
      <div className={uiCx('shrink-0 border-b border-gray-100', uiSpacing.cardPadding)}>
        <AppListCreateItem
          label="Add item"
          layout="row"
          className="w-full"
          disabled={addItemMut.isPending}
          onClick={() => void handleAddRoot()}
        />
      </div>
      <div className={uiCx(uiSpacing.cardPadding, 'flex-1 min-h-0 overflow-y-auto overscroll-contain')}>
        {detail.items.length === 0 ? (
          <AppEmptyState
            title="No items yet."
            description="Use Add item above to start building this list."
            className="border-0 bg-transparent p-0 shadow-none"
          />
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={pointerThenClosestCenter}
            onDragStart={(e: DragStartEvent) => setDragActiveId(String(e.active.id))}
            onDragEnd={(e) => void handleItemDragEnd(e)}
            onDragCancel={() => setDragActiveId(null)}
          >
            <SortableContext items={detail.items.map((n) => n.id)} strategy={verticalListSortingStrategy}>
              <ul className="space-y-1 list-none">
                {detail.items.map((n) => (
                  <SortableTreeRows
                    key={n.id}
                    node={n}
                    editingItemId={editingItemId}
                    draftName={draftName}
                    onDraftName={setDraftName}
                    onBeginEdit={beginEdit}
                    onCommitEdit={() => void commitEdit()}
                    onCancelEdit={cancelEdit}
                    editInputRef={editInputRef}
                    onAddChild={handleAddChild}
                    onDeleteItem={handleDeleteItem}
                    addItemPending={addItemMut.isPending}
                    reorderPending={reorderItemsMut.isPending || patchItemMut.isPending}
                  />
                ))}
              </ul>
            </SortableContext>
            <DragOverlay>
              {dragActiveId ? (
                <div
                  className={uiCx(
                    uiRadius.control,
                    uiBorders.subtle,
                    'bg-white px-3 py-2 text-sm text-gray-900 shadow-lg max-w-md truncate',
                  )}
                >
                  {findItemNameInTree(detail.items, dragActiveId) ?? '…'}
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        )}
      </div>
    </div>
  );
}

function TreeRowIconButton({
  label,
  onClick,
  disabled,
  children,
  className,
}: {
  label: string;
  onClick: (e: MouseEvent<HTMLButtonElement>) => void;
  disabled?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <AppTooltip content={label} placement="top" disabled={disabled}>
      <button
        type="button"
        aria-label={label}
        disabled={disabled}
        onClick={onClick}
        className={uiCx(uiListRowIconButton.base, className)}
      >
        {children}
      </button>
    </AppTooltip>
  );
}

function SortableTreeRows({
  node,
  editingItemId,
  draftName,
  onDraftName,
  onBeginEdit,
  onCommitEdit,
  onCancelEdit,
  editInputRef,
  onAddChild,
  onDeleteItem,
  addItemPending,
  reorderPending,
}: {
  node: TreeNode;
  editingItemId: string | null;
  draftName: string;
  onDraftName: (s: string) => void;
  onBeginEdit: (id: string, name: string) => void;
  onCommitEdit: () => void;
  onCancelEdit: () => void;
  editInputRef: RefObject<HTMLInputElement | null>;
  onAddChild: (parentId: string) => Promise<void>;
  onDeleteItem: (id: string) => void;
  addItemPending: boolean;
  reorderPending: boolean;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: node.id,
    disabled: reorderPending,
    animateLayoutChanges: () => false,
  });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition: isDragging ? transition : undefined,
    opacity: isDragging ? 0.55 : undefined,
  };

  const canAddChild = node.depth < MAX_DEPTH;
  const hasChildren = Boolean(node.children?.length);
  const [expanded, setExpanded] = useState(true);
  const isEditing = editingItemId === node.id;
  const childIds = node.children?.map((c) => c.id) ?? [];

  const toggleCell = hasChildren ? (
    <TreeRowIconButton
      label={expanded ? 'Collapse nested items' : 'Expand nested items'}
      onClick={(e) => {
        e.stopPropagation();
        setExpanded((v) => !v);
      }}
    >
      <ChevronRight
        className={uiCx('h-4 w-4 text-gray-600 transition-transform duration-150', expanded && 'rotate-90')}
        aria-hidden
      />
    </TreeRowIconButton>
  ) : (
    <span className="inline-flex h-8 w-8 shrink-0" aria-hidden />
  );

  const nameEl = isEditing ? (
    <input
      ref={editInputRef}
      value={draftName}
      onChange={(e) => onDraftName(e.target.value)}
      onBlur={() => onCommitEdit()}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          (e.target as HTMLInputElement).blur();
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          onCancelEdit();
        }
      }}
      aria-label="Item name"
      className={uiCx(inlineControlInputClass, 'min-w-0 flex-1')}
    />
  ) : (
    <button
      type="button"
      className={uiCx(
        'text-left min-w-0 flex-1 truncate rounded-lg px-1 py-1 -mx-1 hover:bg-gray-100/80',
        uiTypography.body,
      )}
      onClick={() => onBeginEdit(node.id, node.name)}
    >
      {node.name}
    </button>
  );

  return (
    <li>
      <div
        ref={setNodeRef}
        style={style}
        className={uiCx('flex flex-wrap items-center gap-2 py-1.5 border-b border-gray-100')}
      >
        <span className="flex min-w-0 flex-1 items-center gap-1">
          <button
            type="button"
            ref={setActivatorNodeRef}
            className={uiCx(
              uiListRowIconButton.base,
              'h-8 w-7 cursor-grab active:cursor-grabbing touch-none border-0 bg-transparent hover:bg-gray-100',
            )}
            aria-label="Drag to reorder or change level"
            title="Drag to reorder or change level"
            disabled={reorderPending}
            {...listeners}
            {...attributes}
          >
            <GripVertical className="h-4 w-4 text-gray-500" aria-hidden />
          </button>
          {toggleCell}
          {nameEl}
        </span>
        {node.status !== 'active' ? <AppBadge variant="neutral">off</AppBadge> : null}
        <span className={uiCx(uiLayout.actionsRow, 'shrink-0')}>
          {canAddChild ? (
            <TreeRowIconButton
              label="Add child item"
              disabled={addItemPending}
              onClick={(e) => {
                e.stopPropagation();
                setExpanded(true);
                void onAddChild(node.id);
              }}
            >
              <Plus className="h-4 w-4 text-gray-600" aria-hidden />
            </TreeRowIconButton>
          ) : null}
          <TreeRowIconButton
            label="Remove item"
            onClick={(e) => {
              e.stopPropagation();
              onDeleteItem(node.id);
            }}
          >
            <Minus className="h-4 w-4 text-gray-600" aria-hidden />
          </TreeRowIconButton>
        </span>
      </div>
      {hasChildren && expanded && (
        <SortableContext items={childIds} strategy={verticalListSortingStrategy}>
          <ul className={uiCx('mt-0.5 ml-1 border-l-2 border-gray-200 pl-3 sm:pl-4 list-none')}>
            {node.children!.map((c) => (
              <SortableTreeRows
                key={c.id}
                node={c}
                editingItemId={editingItemId}
                draftName={draftName}
                onDraftName={onDraftName}
                onBeginEdit={onBeginEdit}
                onCommitEdit={onCommitEdit}
                onCancelEdit={onCancelEdit}
                editInputRef={editInputRef}
                onAddChild={onAddChild}
                onDeleteItem={onDeleteItem}
                addItemPending={addItemPending}
                reorderPending={reorderPending}
              />
            ))}
          </ul>
        </SortableContext>
      )}
    </li>
  );
}
