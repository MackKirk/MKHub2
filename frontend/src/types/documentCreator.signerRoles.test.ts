import { describe, expect, it } from 'vitest';
import {
  LEGACY_SIGNER_ROLE_IDS,
  createDefaultSignerRoles,
  ensureCoreEmployeeCompanyRoles,
  ensureSignerRolesForDocument,
  pruneUnusedSigners,
} from '@/types/documentCreator';

describe('signer roles core Employee/Company', () => {
  it('defaults to Employee and Company', () => {
    const roles = createDefaultSignerRoles();
    expect(roles.map((r) => r.label)).toEqual(['Employee', 'Company']);
    expect(roles.map((r) => r.id)).toEqual([
      LEGACY_SIGNER_ROLE_IDS.employee,
      LEGACY_SIGNER_ROLE_IDS.company,
    ]);
  });

  it('ensureSignerRolesForDocument always includes Employee and Company on blank pages', () => {
    const roles = ensureSignerRolesForDocument(null, [{ elements: [] }]);
    const labels = roles.map((r) => r.label);
    expect(labels).toContain('Employee');
    expect(labels).toContain('Company');
  });

  it('pruneUnusedSigners keeps Employee and Company when no fields exist', () => {
    const pruned = pruneUnusedSigners(createDefaultSignerRoles(), [{ elements: [] }]);
    expect(pruned.map((r) => r.label).sort()).toEqual(['Company', 'Employee']);
  });

  it('pruneUnusedSigners drops unused custom signers but keeps core', () => {
    const roles = ensureCoreEmployeeCompanyRoles([
      ...createDefaultSignerRoles(),
      {
        id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
        label: 'Vendor',
        sortOrder: 2,
        fillsEmployeeTokens: false,
      },
    ]);
    const pruned = pruneUnusedSigners(roles, [{ elements: [] }]);
    expect(pruned.map((r) => r.label).sort()).toEqual(['Company', 'Employee']);
  });
});
