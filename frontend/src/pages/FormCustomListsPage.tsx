import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from 'react';
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
import { api } from '@/lib/api';
import { useConfirm } from '@/components/ConfirmProvider';
import OverlayPortal from '@/components/OverlayPortal';
import PageHeaderBar from '@/components/PageHeaderBar';
import {
  SAFETY_MODAL_BTN_CANCEL,
  SAFETY_MODAL_BTN_PRIMARY,
  SAFETY_MODAL_FIELD_LABEL,
  SAFETY_MODAL_OVERLAY,
  SafetyFormModalLayout,
} from '@/components/safety/SafetyModalChrome';

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

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg className={className ?? 'w-5 h-5'} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
    </svg>
  );
}

function MinusIcon({ className }: { className?: string }) {
  return (
    <svg className={className ?? 'w-5 h-5'} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14" />
    </svg>
  );
}

function ChevronExpandIcon({ className, expanded }: { className?: string; expanded: boolean }) {
  return (
    <svg
      className={`${className ?? 'w-5 h-5'} transition-transform duration-150 ${expanded ? 'rotate-90' : ''}`}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      strokeWidth={2}
      aria-hidden
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  );
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg className={className ?? 'w-5 h-5'} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
      />
    </svg>
  );
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
    <div className="flex flex-col gap-4 min-w-0 min-h-0 h-[calc(100dvh-6rem)] max-h-[calc(100dvh-6rem)] overflow-hidden">
      <PageHeaderBar
        title="Form Custom Lists"
        subtitle={
          <>
            Reusable hierarchical lists for drop-down fields in form templates.{' '}
            <Link to="/safety/form-templates" className="text-brand-red hover:underline">
              Form Templates
            </Link>
          </>
        }
        className="shrink-0 !mb-0"
      />

      <div className="flex-1 min-h-0 grid grid-cols-1 gap-6 overflow-hidden grid-rows-[minmax(0,1fr)_minmax(0,1fr)] lg:grid-rows-1 lg:grid-cols-4 lg:items-stretch">
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden min-w-0 min-h-0 lg:col-span-1 flex flex-col h-full max-h-full">
          <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/80 shrink-0">
            <h2 className="text-sm font-semibold text-gray-800">Lists</h2>
          </div>
          <div className="p-2 border-b border-gray-100 space-y-2 shrink-0">
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="px-4 py-2 text-sm border border-dashed border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 w-full"
            >
              + New list
            </button>
            <label className="sr-only" htmlFor="form-custom-lists-search">
              Search lists
            </label>
            <input
              id="form-custom-lists-search"
              type="search"
              value={listsSearch}
              onChange={(e) => setListsSearch(e.target.value)}
              placeholder="Search lists…"
              autoComplete="off"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-red/20 focus:border-brand-red"
            />
          </div>
          {isLoading ? (
            <div className="flex-1 flex items-center justify-center p-8 text-sm text-gray-500 min-h-0">Loading…</div>
          ) : sortedLists.length === 0 ? (
            <div className="flex-1 flex items-center justify-center p-8 text-center text-sm text-gray-500 min-h-0">
              No custom lists yet. Create one above to use in dropdown fields.
            </div>
          ) : filteredLists.length === 0 ? (
            <div className="flex-1 flex items-center justify-center p-6 text-xs text-gray-500 min-h-0">No lists match your search.</div>
          ) : (
            <ul className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
              {filteredLists.map((row) => {
                const usedCount = row.used_in_form_count ?? 0;
                const deleteBlocked = usedCount > 0;
                return (
                  <li key={row.id} className="flex items-stretch min-w-0">
                    <button
                      type="button"
                      onClick={() => setSelectedId(row.id)}
                      className={`flex-1 min-w-0 text-left px-4 py-2.5 hover:bg-gray-50 ${
                        selectedId === row.id ? 'bg-blue-50/80' : ''
                      }`}
                    >
                      <span className="text-[13px] font-bold text-gray-900 truncate block leading-snug">{row.name}</span>
                    </button>
                    <div className="flex shrink-0 items-center pr-2">
                      <button
                        type="button"
                        disabled={deleteBlocked || deleteListMut.isPending}
                        title={
                          deleteBlocked
                            ? `Cannot delete: used in ${usedCount} form template(s). Remove references in Form Templates first.`
                            : 'Delete list'
                        }
                        aria-label={deleteBlocked ? 'Delete list (disabled: in use)' : 'Delete list'}
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
                        className={`shrink-0 h-9 w-9 inline-flex items-center justify-center rounded-lg border-0 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-red/25 ${
                          deleteBlocked
                            ? 'text-gray-300 cursor-not-allowed'
                            : 'text-gray-400 hover:text-red-600 cursor-pointer'
                        } disabled:opacity-50`}
                      >
                        <TrashIcon className="w-5 h-5" />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden min-w-0 min-h-0 lg:col-span-3 flex flex-col h-full max-h-full">
          {!selectedId ? (
            <div className="flex-1 flex items-center justify-center p-8 text-center text-sm text-gray-500 min-h-0">
              Select a list to edit items and hierarchy.
            </div>
          ) : detailLoading || !detail ? (
            <div className="flex-1 flex items-center justify-center p-8 text-sm text-gray-500 min-h-0">Loading…</div>
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
        </div>
      </div>

      {createOpen && (
        <OverlayPortal>
          <div className={SAFETY_MODAL_OVERLAY} onClick={() => setCreateOpen(false)} role="presentation">
            <SafetyFormModalLayout
              widthClass="w-full max-w-md"
              titleId="form-custom-list-create-title"
              title="New custom list"
              subtitle="Used as options source for dropdown fields in form templates."
              onClose={() => setCreateOpen(false)}
              footer={
                <>
                  <button type="button" className={SAFETY_MODAL_BTN_CANCEL} onClick={() => setCreateOpen(false)}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={!newName.trim() || createMut.isPending}
                    onClick={() => createMut.mutate()}
                    className={SAFETY_MODAL_BTN_PRIMARY}
                  >
                    {createMut.isPending ? 'Creating…' : 'Create'}
                  </button>
                </>
              }
            >
              <label className={SAFETY_MODAL_FIELD_LABEL}>Name</label>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-red/20 focus:border-brand-red"
                placeholder="e.g. Hazard Types"
              />
            </SafetyFormModalLayout>
          </div>
        </OverlayPortal>
      )}
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

      // Collision can still hit the parent row; that would promote a child to sibling of its parent.
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
      <div className="px-4 py-3 border-b border-gray-100 shrink-0">
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
                className="w-full text-lg font-semibold text-gray-900 border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-red/20 focus:border-brand-red"
              />
            ) : (
              <button
                type="button"
                onClick={beginEditListName}
                className="text-left w-full text-lg font-semibold text-gray-900 truncate rounded-lg px-1 py-1 -mx-1 hover:bg-gray-100/80"
              >
                {localName || detail.name}
              </button>
            )}
            <p className="text-xs text-gray-500 mt-1 leading-relaxed">
              {detail.used_in_form_names && detail.used_in_form_names.length > 0 ? (
                <>
                  Used in: {detail.used_in_form_names.join(', ')}
                </>
              ) : (
                <>Not used in any form template.</>
              )}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-4 self-end sm:self-auto flex-wrap justify-end">
            <label className="flex items-center gap-2 cursor-pointer select-none text-xs text-gray-700">
              <input
                type="checkbox"
                className="rounded border-gray-300 text-brand-red focus:ring-brand-red/30"
                checked={localIncludeOther}
                disabled={isSaving}
                onChange={(e) => {
                  const next = e.target.checked;
                  setLocalIncludeOther(next);
                  onPatch({ include_other: next });
                }}
              />
              <span>Include &quot;Other&quot;</span>
            </label>
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
              <span className="text-xs text-gray-700">{localStatus === 'active' ? 'Active' : 'Inactive'}</span>
              <button
                type="button"
                role="switch"
                aria-checked={localStatus === 'active'}
                disabled={isSaving}
                title={localStatus === 'active' ? 'Active' : 'Inactive'}
                aria-label={localStatus === 'active' ? 'List is active. Click to deactivate.' : 'List is inactive. Click to activate.'}
                onClick={() => {
                  const next = localStatus === 'active' ? 'inactive' : 'active';
                  setLocalStatus(next);
                  onPatch({ status: next });
                }}
                className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border transition-colors focus:outline-none focus:ring-2 focus:ring-gray-300 focus:ring-offset-1 disabled:opacity-50 ${
                  localStatus === 'active' ? 'bg-gray-900 border-gray-900' : 'bg-gray-200 border-gray-300'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform mt-0.5 ${
                    localStatus === 'active' ? 'translate-x-5 ml-0.5' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </label>
            {isSaving && <span className="text-xs text-gray-400 whitespace-nowrap">Saving…</span>}
          </div>
        </div>
      </div>
      <div className="p-2 border-b border-gray-50 shrink-0">
        <button
          type="button"
          onClick={() => void handleAddRoot()}
          disabled={addItemMut.isPending}
          className="px-4 py-2 text-sm border border-dashed border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 w-full disabled:opacity-50"
        >
          + Add Item
        </button>
      </div>
      <div className="p-4 flex-1 min-h-0 overflow-y-auto overscroll-contain">
        {detail.items.length === 0 ? (
          <p className="text-sm text-gray-500">No items yet. Use + Add Item above to start.</p>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={pointerThenClosestCenter}
            onDragStart={(e: DragStartEvent) => setDragActiveId(String(e.active.id))}
            onDragEnd={(e) => void handleItemDragEnd(e)}
            onDragCancel={() => setDragActiveId(null)}
          >
            <SortableContext items={detail.items.map((n) => n.id)} strategy={verticalListSortingStrategy}>
              <ul className="space-y-1">
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
                <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 shadow-lg max-w-md truncate">
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

  const rowBtn =
    'shrink-0 h-9 w-9 inline-flex items-center justify-center rounded-lg bg-transparent border-0 cursor-pointer transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-red/25';

  const toggleCell = hasChildren ? (
    <button
      type="button"
      className={`${rowBtn} text-gray-500 hover:text-gray-800`}
      aria-expanded={expanded}
      title={expanded ? 'Collapse' : 'Expand'}
      aria-label={expanded ? 'Collapse nested items' : 'Expand nested items'}
      onClick={(e) => {
        e.stopPropagation();
        setExpanded((v) => !v);
      }}
    >
      <ChevronExpandIcon expanded={expanded} className="w-5 h-5" />
    </button>
  ) : (
    <span className="shrink-0 w-9 h-9 inline-block" aria-hidden />
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
      className="text-sm text-gray-900 min-w-0 flex-1 border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-red/20 focus:border-brand-red"
    />
  ) : (
    <button
      type="button"
      className="text-left text-sm text-gray-900 min-w-0 flex-1 truncate rounded-lg px-1 py-1 -mx-1 hover:bg-gray-100/80"
      onClick={() => onBeginEdit(node.id, node.name)}
    >
      {node.name}
    </button>
  );

  return (
    <li>
      <div ref={setNodeRef} style={style} className="flex flex-wrap items-center gap-2 py-1.5 border-b border-gray-50">
        <span className="flex min-w-0 flex-1 items-center gap-1">
          <button
            type="button"
            ref={setActivatorNodeRef}
            className="cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-700 px-0.5 shrink-0 touch-none inline-flex h-9 w-7 items-center justify-center rounded-lg border-0 bg-transparent focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-red/25 disabled:opacity-40"
            aria-label="Drag to reorder or change level"
            title="Drag to reorder or change level"
            disabled={reorderPending}
            {...listeners}
            {...attributes}
          >
            ⋮⋮
          </button>
          {toggleCell}
          {nameEl}
        </span>
        <span className="text-[10px] uppercase text-gray-400">{node.status === 'active' ? '' : 'off'}</span>
        <span className="flex shrink-0 items-center gap-0.5">
          {canAddChild && (
            <button
              type="button"
              aria-label="Add child item"
              title="Add child item"
              disabled={addItemPending}
              onClick={(e) => {
                e.stopPropagation();
                setExpanded(true);
                void onAddChild(node.id);
              }}
              className="shrink-0 h-9 w-9 inline-flex items-center justify-center text-gray-400 hover:text-blue-600 rounded-lg bg-transparent border-0 cursor-pointer transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-red/25 disabled:opacity-40"
            >
              <PlusIcon className="w-5 h-5" />
            </button>
          )}
          <button
            type="button"
            aria-label="Remove item"
            title="Remove item"
            onClick={(e) => {
              e.stopPropagation();
              onDeleteItem(node.id);
            }}
            className="shrink-0 h-9 w-9 inline-flex items-center justify-center text-gray-400 hover:text-red-600 rounded-lg bg-transparent border-0 cursor-pointer transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-red/25"
          >
            <MinusIcon className="w-5 h-5" />
          </button>
        </span>
      </div>
      {hasChildren && expanded && (
        <SortableContext items={childIds} strategy={verticalListSortingStrategy}>
          <ul className="mt-0.5 ml-1 border-l-2 border-gray-200 pl-3 sm:pl-4 list-none">
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
