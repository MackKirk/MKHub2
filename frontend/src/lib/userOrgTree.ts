export type OrgPerson = {
  id: string;
  username: string;
  name?: string | null;
  email?: string | null;
  job_title?: string | null;
  is_active?: boolean;
  roles?: string[];
  profile_photo_file_id?: string | null;
  manager_user_id?: string | null;
};

export type OrgTreeNode = OrgPerson & {
  children: OrgTreeNode[];
  depth: number;
};

export type OrgForest = {
  teams: OrgTreeNode[];
  unassigned: OrgTreeNode[];
};

function personSortKey(person: OrgPerson): string {
  return (person.name || person.username || '').toLowerCase();
}

function sortPeople(people: OrgPerson[]): OrgPerson[] {
  return [...people].sort((a, b) =>
    personSortKey(a).localeCompare(personSortKey(b), undefined, { sensitivity: 'base' }),
  );
}

/**
 * Build a supervisor forest from `manager_user_id`.
 * Cycles and missing managers become roots. Roots with reports go in `teams`;
 * people with neither a supervisor nor reports go in `unassigned`.
 */
export function buildUserOrgForest(people: OrgPerson[]): OrgForest {
  const byId = new Map(people.map((person) => [person.id, person]));
  const parentOf = new Map<string, string | null>();

  for (const person of people) {
    const managerId = person.manager_user_id || null;
    if (managerId && byId.has(managerId) && managerId !== person.id) {
      parentOf.set(person.id, managerId);
    } else {
      parentOf.set(person.id, null);
    }
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();

  const resolveParent = (id: string): void => {
    if (visited.has(id)) return;
    if (visiting.has(id)) {
      parentOf.set(id, null);
      return;
    }
    visiting.add(id);
    const parent = parentOf.get(id);
    if (parent) resolveParent(parent);
    visiting.delete(id);
    visited.add(id);
  };

  for (const person of people) resolveParent(person.id);

  const childrenIds = new Map<string, string[]>();
  for (const person of people) childrenIds.set(person.id, []);
  for (const person of people) {
    const parent = parentOf.get(person.id);
    if (parent) childrenIds.get(parent)?.push(person.id);
  }

  const toNode = (id: string, depth: number): OrgTreeNode => {
    const person = byId.get(id)!;
    const childIds = sortPeople(
      (childrenIds.get(id) || []).map((childId) => byId.get(childId)!).filter(Boolean),
    ).map((child) => child.id);
    return {
      ...person,
      depth,
      children: childIds.map((childId) => toNode(childId, depth + 1)),
    };
  };

  const rootPeople = sortPeople(people.filter((person) => !parentOf.get(person.id)));
  const teams: OrgTreeNode[] = [];
  const unassigned: OrgTreeNode[] = [];
  for (const person of rootPeople) {
    const node = toNode(person.id, 0);
    if (node.children.length > 0) teams.push(node);
    else unassigned.push(node);
  }
  return { teams, unassigned };
}

export function personMatchesOrgQuery(person: OrgPerson, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return [person.name, person.username, person.email, person.job_title].some((value) =>
    (value || '').toLowerCase().includes(needle),
  );
}

export function filterOrgNodesByQuery(nodes: OrgTreeNode[], query: string): OrgTreeNode[] {
  if (!query.trim()) return nodes;
  const kept: OrgTreeNode[] = [];
  for (const node of nodes) {
    const children = filterOrgNodesByQuery(node.children, query);
    if (personMatchesOrgQuery(node, query) || children.length > 0) {
      kept.push({ ...node, children });
    }
  }
  return kept;
}

export function filterOrgForestByQuery(forest: OrgForest, query: string): OrgForest {
  if (!query.trim()) return forest;
  return {
    teams: filterOrgNodesByQuery(forest.teams, query),
    unassigned: filterOrgNodesByQuery(forest.unassigned, query),
  };
}

/** Node ids that have a matching descendant (should stay expanded during search). */
export function orgAncestorIdsToExpand(nodes: OrgTreeNode[], query: string): Set<string> {
  const ids = new Set<string>();
  if (!query.trim()) return ids;

  const walk = (node: OrgTreeNode): boolean => {
    const childHit = node.children.some(walk);
    const selfHit = personMatchesOrgQuery(node, query);
    if (childHit) ids.add(node.id);
    return selfHit || childHit;
  };

  nodes.forEach(walk);
  return ids;
}

export function collectOrgNodeIdsWithChildren(nodes: OrgTreeNode[]): string[] {
  const ids: string[] = [];
  const walk = (node: OrgTreeNode) => {
    if (node.children.length > 0) ids.push(node.id);
    node.children.forEach(walk);
  };
  nodes.forEach(walk);
  return ids;
}

export function countOrgForestPeople(forest: OrgForest): number {
  const walk = (nodes: OrgTreeNode[]): number =>
    nodes.reduce((sum, node) => sum + 1 + walk(node.children), 0);
  return walk(forest.teams) + walk(forest.unassigned);
}

/** People below this node (direct + nested). */
export function countOrgNodeReports(node: OrgTreeNode): number {
  return node.children.reduce((sum, child) => sum + 1 + countOrgNodeReports(child), 0);
}
