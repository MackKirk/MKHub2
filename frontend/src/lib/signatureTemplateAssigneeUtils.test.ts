import { describe, expect, it } from 'vitest';
import {
  buildSigningFlowLabel,
  getAssigneeOptions,
} from './signatureTemplateAssigneeUtils';

describe('getAssigneeOptions', () => {
  it('onboarding mode uses New Hire label', () => {
    const opts = getAssigneeOptions('onboarding');
    expect(opts.find((o) => o.value === 'employee')?.label).toBe('New Hire');
    expect(opts.some((o) => o.value === 'user')).toBe(true);
  });

  it('generic mode keeps Employee label', () => {
    const opts = getAssigneeOptions('generic');
    expect(opts.find((o) => o.value === 'employee')?.label).toBe('Employee');
  });
});

describe('buildSigningFlowLabel', () => {
  it('shows New Hire only for hire-only onboarding template', () => {
    expect(
      buildSigningFlowLabel([{ type: 'signature', assignee: 'employee' }], { assigneeMode: 'onboarding' }),
    ).toBe('New Hire only');
  });

  it('orders New Hire then named users', () => {
    const u1 = '11111111-1111-1111-1111-111111111111';
    const u2 = '22222222-2222-2222-2222-222222222222';
    expect(
      buildSigningFlowLabel(
        [
          { type: 'signature', assignee: 'employee' },
          { type: 'signature', assignee: 'user', assignee_user_id: u1 },
          { type: 'initials', assignee: 'user', assignee_user_id: u2 },
        ],
        {
          assigneeMode: 'onboarding',
          userLabelById: { [u1]: 'Jane Manager', [u2]: 'Bob HR' },
        },
      ),
    ).toBe('New Hire → Jane Manager → Bob HR');
  });

  it('generic mode says Employee not New Hire', () => {
    expect(
      buildSigningFlowLabel([{ type: 'signature', assignee: 'employee' }], { assigneeMode: 'generic' }),
    ).toBe('Employee only');
  });
});
