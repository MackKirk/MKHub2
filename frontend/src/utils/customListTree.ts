/** Runtime tree node from GET /form-custom-lists/:id?for_runtime=true */
export type FormCustomListTreeNode = {
  id: string;
  name: string;
  children?: FormCustomListTreeNode[];
};

export function treeIsHierarchical(nodes: FormCustomListTreeNode[]): boolean {
  for (const n of nodes) {
    const c = n.children ?? [];
    if (c.length > 0) return true;
    if (treeIsHierarchical(c)) return true;
  }
  return false;
}

/** Children visible at `pathIds` (each id is an ancestor from root to parent). */
export function getChildrenAtPath(
  roots: FormCustomListTreeNode[],
  pathIds: string[]
): FormCustomListTreeNode[] {
  let cur = roots;
  for (const id of pathIds) {
    const n = cur.find((x) => x.id === id);
    if (!n) return [];
    cur = n.children ?? [];
  }
  return cur;
}

export function findNodeById(
  nodes: FormCustomListTreeNode[],
  id: string
): FormCustomListTreeNode | null {
  for (const n of nodes) {
    if (n.id === id) return n;
    const sub = findNodeById(n.children ?? [], id);
    if (sub) return sub;
  }
  return null;
}
