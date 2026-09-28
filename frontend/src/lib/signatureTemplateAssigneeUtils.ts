/** Assignee labels + signing-flow summary for SignatureTemplateEditor. */

export type TemplateAssigneeMode = 'onboarding' | 'generic';

export const ASSIGNEE_OPTIONS_GENERIC = [
  { value: 'employee' as const, label: 'Employee' },
  { value: 'user' as const, label: 'User' },
];

export const ASSIGNEE_OPTIONS_ONBOARDING = [
  { value: 'employee' as const, label: 'New Hire' },
  { value: 'user' as const, label: 'User' },
];

export function getAssigneeOptions(mode: TemplateAssigneeMode = 'generic') {
  return mode === 'onboarding' ? ASSIGNEE_OPTIONS_ONBOARDING : ASSIGNEE_OPTIONS_GENERIC;
}

const SIGNING_TYPES = new Set(['signature', 'initials', 'date']);

export type FlowField = {
  type: string;
  assignee?: string;
  assignee_user_id?: string | null;
};

/** Live "New Hire → Jane → Bob" summary from signing fields. */
export function buildSigningFlowLabel(
  fields: FlowField[],
  opts: {
    assigneeMode?: TemplateAssigneeMode;
    userLabelById?: Map<string, string> | Record<string, string>;
  } = {},
): string {
  const isOnboarding = (opts.assigneeMode || 'generic') === 'onboarding';
  const labelMap = opts.userLabelById;
  const getLabel = (uid: string) => {
    if (!labelMap) return 'User';
    if (labelMap instanceof Map) return labelMap.get(uid) || 'User';
    return labelMap[uid] || 'User';
  };

  const signing = fields.filter((f) => SIGNING_TYPES.has((f.type || '').toLowerCase()));
  if (signing.length === 0) return 'No signature fields yet';

  const parts: string[] = [];
  const seenUsers = new Set<string>();
  let hasHire = false;
  for (const f of signing) {
    if ((f.assignee || 'employee') === 'employee') {
      if (!hasHire) {
        parts.push(isOnboarding ? 'New Hire' : 'Employee');
        hasHire = true;
      }
    } else {
      const uid = (f.assignee_user_id || '').trim();
      if (!uid) {
        if (!seenUsers.has('__missing__')) {
          parts.push('User (pick someone)');
          seenUsers.add('__missing__');
        }
      } else if (!seenUsers.has(uid)) {
        seenUsers.add(uid);
        parts.push(getLabel(uid));
      }
    }
  }
  if (parts.length === 0) return 'No signature fields yet';
  if (parts.length === 1) return `${parts[0]} only`;
  return parts.join(' → ');
}
