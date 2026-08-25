/**
 * Documents hub permission row builder + settings filter (no document_* under Settings).
 */
import { describe, expect, it } from 'vitest';
import {
  buildDocumentHubPermissionRows,
  canViewDocumentBuilder,
  DOCUMENT_HUB_BLOCK_ACCESS,
  DOCUMENT_HUB_BUILDER_READ,
  DOCUMENT_HUB_BUILDER_WRITE,
  DOCUMENT_HUB_SIGNATURE_REQUESTS_READ,
  getDocumentHubAccessLevel,
  applyDocumentHubAccessLevel,
} from '@/lib/documentHubPermissions';
import {
  SETTINGS_CHILD_READ_KEYS,
  SETTINGS_CHILD_WRITE_KEYS,
  buildSettingsPermissionRows,
  filterSettingsAreaPermissions,
} from '@/lib/settingsPermissions';
import { canViewDocuments } from '@/lib/documentsPermissions';

describe('documentHubPermissions', () => {
  const areaPerms = [
    { id: '1', key: DOCUMENT_HUB_BUILDER_READ, label: 'Document Builder', description: 'View' },
    { id: '2', key: DOCUMENT_HUB_BUILDER_WRITE, label: 'Document Builder', description: 'Edit' },
    {
      id: '3',
      key: DOCUMENT_HUB_SIGNATURE_REQUESTS_READ,
      label: 'Signature Requests',
      description: 'View requests',
    },
    {
      id: '4',
      key: 'document_hub:signature_requests:write',
      label: 'Signature Requests',
      description: 'Manage',
    },
    {
      id: '5',
      key: DOCUMENT_HUB_BLOCK_ACCESS,
      label: 'Signature — Block Hub Access',
      description: 'Block',
    },
  ];

  it('builds expected read/write rows including indented block_access', () => {
    const rows = buildDocumentHubPermissionRows(areaPerms);
    expect(rows.map((r) => r.readKey)).toEqual([
      DOCUMENT_HUB_BUILDER_READ,
      DOCUMENT_HUB_SIGNATURE_REQUESTS_READ,
      DOCUMENT_HUB_BLOCK_ACCESS,
    ]);
    expect(rows[0].writeKey).toBe(DOCUMENT_HUB_BUILDER_WRITE);
    expect(rows[2].indent).toBe(true);
    expect(rows[2].writeKey).toBeUndefined();
  });

  it('treats block_access as blocked/view only', () => {
    expect(getDocumentHubAccessLevel({}, DOCUMENT_HUB_BLOCK_ACCESS)).toBe('blocked');
    expect(
      getDocumentHubAccessLevel({ [DOCUMENT_HUB_BLOCK_ACCESS]: true }, DOCUMENT_HUB_BLOCK_ACCESS),
    ).toBe('view');
    const next = applyDocumentHubAccessLevel({}, DOCUMENT_HUB_BLOCK_ACCESS, undefined, 'view');
    expect(next[DOCUMENT_HUB_BLOCK_ACCESS]).toBe(true);
  });

  it('builder hub keys are independent from company files documents:read', () => {
    const hubOnly = new Set([DOCUMENT_HUB_BUILDER_READ]);
    expect(canViewDocumentBuilder(false, hubOnly)).toBe(true);
    expect(canViewDocuments(false, hubOnly)).toBe(false);

    const filesOnly = new Set(['documents:read']);
    expect(canViewDocuments(false, filesOnly)).toBe(true);
    expect(canViewDocumentBuilder(false, filesOnly)).toBe(false);
  });
});

describe('settingsPermissions exclude document defs', () => {
  it('child key lists omit document backgrounds/templates', () => {
    expect(SETTINGS_CHILD_READ_KEYS).not.toContain('settings:document_backgrounds:read');
    expect(SETTINGS_CHILD_READ_KEYS).not.toContain('settings:document_templates:read');
    expect(SETTINGS_CHILD_WRITE_KEYS).not.toContain('settings:document_backgrounds:write');
    expect(SETTINGS_CHILD_WRITE_KEYS).not.toContain('settings:document_templates:write');
  });

  it('filter and rows do not expose document backgrounds/templates', () => {
    const area = [
      { id: 'a', key: 'settings:permission_templates:read', label: 'Permission templates' },
      { id: 'b', key: 'settings:permission_templates:write', label: 'Permission templates' },
      { id: 'c', key: 'settings:document_backgrounds:read', label: 'Backgrounds' },
      { id: 'd', key: 'settings:document_templates:read', label: 'Doc templates' },
      { id: 'e', key: 'settings:terms_templates:read', label: 'Terms' },
      { id: 'f', key: 'settings:terms_templates:write', label: 'Terms' },
    ];
    const filtered = filterSettingsAreaPermissions(area);
    expect(filtered.map((p) => p.key)).toEqual([
      'settings:permission_templates:read',
      'settings:permission_templates:write',
      'settings:terms_templates:read',
      'settings:terms_templates:write',
    ]);
    const rows = buildSettingsPermissionRows(filtered);
    expect(rows.every((r) => !r.readKey.includes('document_'))).toBe(true);
  });
});
