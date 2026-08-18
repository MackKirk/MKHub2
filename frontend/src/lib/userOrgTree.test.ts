import { describe, expect, it } from 'vitest';
import {
  buildUserOrgForest,
  collectOrgNodeIdsWithChildren,
  countOrgForestPeople,
  countOrgNodeReports,
  filterOrgForestByQuery,
  orgAncestorIdsToExpand,
  personMatchesOrgQuery,
  type OrgPerson,
} from '@/lib/userOrgTree';

function person(id: string, extra: Partial<OrgPerson> = {}): OrgPerson {
  return { id, username: id, name: extra.name ?? id, ...extra };
}

describe('buildUserOrgForest', () => {
  it('nests direct reports under their supervisor', () => {
    const forest = buildUserOrgForest([
      person('ceo', { name: 'Ada' }),
      person('lead', { name: 'Lin', manager_user_id: 'ceo' }),
      person('dev', { name: 'Dev', manager_user_id: 'lead' }),
    ]);
    expect(forest.unassigned).toHaveLength(0);
    expect(forest.teams).toHaveLength(1);
    expect(forest.teams[0].id).toBe('ceo');
    expect(forest.teams[0].children.map((c) => c.id)).toEqual(['lead']);
    expect(forest.teams[0].children[0].children.map((c) => c.id)).toEqual(['dev']);
  });

  it('puts people with no supervisor and no reports in unassigned', () => {
    const forest = buildUserOrgForest([
      person('solo', { name: 'Sam' }),
      person('ceo', { name: 'Ada' }),
      person('lead', { name: 'Lin', manager_user_id: 'ceo' }),
    ]);
    expect(forest.unassigned.map((n) => n.id)).toEqual(['solo']);
    expect(forest.teams.map((n) => n.id)).toEqual(['ceo']);
  });

  it('treats a missing supervisor as a root', () => {
    const forest = buildUserOrgForest([
      person('lead', { name: 'Lin', manager_user_id: 'gone' }),
      person('dev', { name: 'Dev', manager_user_id: 'lead' }),
    ]);
    expect(forest.teams[0].id).toBe('lead');
    expect(forest.teams[0].children.map((c) => c.id)).toEqual(['dev']);
  });

  it('breaks supervisor cycles without dropping people', () => {
    const forest = buildUserOrgForest([
      person('a', { name: 'A', manager_user_id: 'b' }),
      person('b', { name: 'B', manager_user_id: 'a' }),
    ]);
    expect(countOrgForestPeople(forest)).toBe(2);
    const ids = new Set<string>();
    const walk = (nodes: { id: string; children: typeof nodes }[]) => {
      for (const node of nodes) {
        expect(ids.has(node.id)).toBe(false);
        ids.add(node.id);
        walk(node.children);
      }
    };
    walk([...forest.teams, ...forest.unassigned]);
    expect(ids.size).toBe(2);
  });

  it('ignores self-as-supervisor', () => {
    const forest = buildUserOrgForest([person('me', { name: 'Me', manager_user_id: 'me' })]);
    expect(forest.unassigned.map((n) => n.id)).toEqual(['me']);
  });
});

describe('org search', () => {
  const forest = buildUserOrgForest([
    person('ceo', { name: 'Ada Lovelace', job_title: 'CEO' }),
    person('lead', { name: 'Lin', job_title: 'Lead', manager_user_id: 'ceo' }),
    person('dev', { name: 'Dev Patel', email: 'dev@mk.com', manager_user_id: 'lead' }),
  ]);

  it('keeps ancestors of a matching person', () => {
    const filtered = filterOrgForestByQuery(forest, 'patel');
    expect(filtered.teams).toHaveLength(1);
    expect(filtered.teams[0].id).toBe('ceo');
    expect(filtered.teams[0].children[0].id).toBe('lead');
    expect(filtered.teams[0].children[0].children[0].id).toBe('dev');
  });

  it('matches job title and email', () => {
    expect(personMatchesOrgQuery(forest.teams[0], 'ceo')).toBe(true);
    expect(personMatchesOrgQuery(forest.teams[0].children[0].children[0], 'dev@mk.com')).toBe(true);
  });

  it('marks ancestors for expand', () => {
    const ids = orgAncestorIdsToExpand(forest.teams, 'patel');
    expect([...ids].sort()).toEqual(['ceo', 'lead']);
  });
});

describe('org forest helpers', () => {
  it('counts people and nodes with children', () => {
    const forest = buildUserOrgForest([
      person('ceo', { name: 'Ada' }),
      person('lead', { name: 'Lin', manager_user_id: 'ceo' }),
      person('solo', { name: 'Sam' }),
    ]);
    expect(countOrgForestPeople(forest)).toBe(3);
    expect(collectOrgNodeIdsWithChildren(forest.teams)).toEqual(['ceo']);
    expect(countOrgNodeReports(forest.teams[0])).toBe(1);
  });
});
