import { describe, expect, it } from 'vitest';
import {
  applyCreatedWithinPreset,
  detectCreatedWithinPreset,
  isAllStatusMode,
  isNoneStatusMode,
  normalizeUserListPreferences,
  opportunityPrefLineFromBusinessLine,
  setAllStatusSelection,
  toggleStatusSelection,
} from '@/lib/opportunityListPreferences';
import {
  BUSINESS_LINE_CONSTRUCTION,
  BUSINESS_LINE_REPAIRS_MAINTENANCE,
} from '@/lib/businessLine';
import { formatDateLocal } from '@/lib/dateUtils';

describe('opportunityListPreferences', () => {
  it('maps business lines to pref keys', () => {
    expect(opportunityPrefLineFromBusinessLine(BUSINESS_LINE_CONSTRUCTION)).toBe('construction');
    expect(opportunityPrefLineFromBusinessLine(BUSINESS_LINE_REPAIRS_MAINTENANCE)).toBe('repairs');
  });

  it('normalizes null as all and [] as none for opportunity and project buckets', () => {
    const prefs = normalizeUserListPreferences({
      opportunity_status_ids: { construction: null, repairs: [] },
      project_status_ids: { construction: [], repairs: null },
    });
    expect(prefs.opportunity_status_ids.construction).toBeNull();
    expect(prefs.opportunity_status_ids.repairs).toEqual([]);
    expect(prefs.project_status_ids.construction).toEqual([]);
    expect(prefs.project_status_ids.repairs).toBeNull();
    expect(isAllStatusMode(prefs.opportunity_status_ids.construction)).toBe(true);
    expect(isNoneStatusMode(prefs.opportunity_status_ids.repairs)).toBe(true);
    expect(isNoneStatusMode(prefs.project_status_ids.construction)).toBe(true);
    expect(isAllStatusMode(prefs.project_status_ids.repairs)).toBe(true);
  });

  it('toggles out of all-mode and collapses back when all selected', () => {
    const all = ['a', 'b', 'c'];
    expect(toggleStatusSelection(null, 'b', all)).toEqual(['a', 'c']);
    expect(toggleStatusSelection(['a', 'c'], 'b', all)).toBeNull();
    expect(setAllStatusSelection(true)).toBeNull();
    expect(setAllStatusSelection(false)).toEqual([]);
  });

  it('applies and detects created-within presets', () => {
    const params = new URLSearchParams();
    applyCreatedWithinPreset(params, '90');
    expect(params.get('date_end')).toBe(formatDateLocal(new Date()));
    expect(detectCreatedWithinPreset(params)).toBe('90');
    applyCreatedWithinPreset(params, null);
    expect(params.get('date_start')).toBeNull();
    expect(detectCreatedWithinPreset(params)).toBeNull();
  });
});
