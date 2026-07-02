import type { FilterRule } from '@/components/FilterBuilder/types';

export const OPPORTUNITY_FIELD_LABELS: Record<string, string> = {
  status: 'Status',
  division: 'Division',
  client: 'Client',
  estimator: 'Estimator',
  start_date: 'Start Date',
  eta: 'End Date',
  value: 'Value',
};

/** Matches Business Dashboard / chart widgets (`related_to_me=true`). */
export function isRelatedToMeParamActive(params: URLSearchParams): boolean {
  const v = params.get('related_to_me');
  return v === 'true' || v === '1';
}

export function setRelatedToMeParam(params: URLSearchParams, active: boolean): void {
  if (active) params.set('related_to_me', 'true');
  else params.delete('related_to_me');
}

/** Align list + quick-filter count queries (always includes current business line). */
export function buildOpportunityListSearchParams(
  searchParams: URLSearchParams,
  businessLine: string,
  options?: { omitQuickFilters?: boolean; page?: number; limit?: number },
): URLSearchParams {
  const params = new URLSearchParams(searchParams);
  params.set('business_line', businessLine);
  if (options?.omitQuickFilters) {
    params.delete('status');
    params.delete('status_not');
    params.delete('related_to_me');
    params.delete('view');
    params.delete('sort');
    params.delete('dir');
  }
  if (options?.page != null) params.set('page', String(options.page));
  if (options?.limit != null) params.set('limit', String(options.limit));
  return params;
}

export function statusIdByLabel(statuses: unknown[] | undefined, label: string): string | undefined {
  const t = label.toLowerCase().trim();
  for (const s of statuses || []) {
    const row = s as { id?: unknown; label?: unknown };
    if (String(row.label || '').toLowerCase().trim() === t && row.id != null) {
      return String(row.id);
    }
  }
  return undefined;
}

/** First matching status id among candidate labels (settings may vary by casing/spelling). */
export function statusIdByLabels(statuses: unknown[] | undefined, ...labels: string[]): string | undefined {
  for (const label of labels) {
    const id = statusIdByLabel(statuses, label);
    if (id) return id;
  }
  return undefined;
}

export type ListQuickStatusFilter = { key: string; label: string; statusId: string };

function resolveQuickStatusFilters(
  statuses: unknown[] | undefined,
  specs: Array<{ key: string; label: string; labels: string[] }>,
): ListQuickStatusFilter[] {
  const out: ListQuickStatusFilter[] = [];
  for (const spec of specs) {
    const statusId = statusIdByLabels(statuses, ...spec.labels);
    if (statusId) out.push({ key: spec.key, label: spec.label, statusId });
  }
  return out;
}

/** Projects list quick filters (not opportunity pipeline statuses). */
export function resolveProjectQuickStatusFilters(statuses: unknown[] | undefined): ListQuickStatusFilter[] {
  return resolveQuickStatusFilters(statuses, [
    { key: 'in_progress', label: 'In Progress', labels: ['in progress', 'on progress'] },
    { key: 'on_hold', label: 'On Hold', labels: ['on hold'] },
    { key: 'finished', label: 'Finished', labels: ['finished'] },
    { key: 'conflict', label: 'Conflict', labels: ['conflict', 'schedule conflict'] },
  ]);
}

/** Opportunities / leak investigations list quick filters. */
export function resolveOpportunityQuickStatusFilters(statuses: unknown[] | undefined): ListQuickStatusFilter[] {
  return resolveQuickStatusFilters(statuses, [
    { key: 'prospecting', label: 'Prospecting', labels: ['prospecting'] },
    { key: 'refused', label: 'Refused', labels: ['refused'] },
    { key: 'sent_to_customer', label: 'Sent to Customer', labels: ['sent to customer'] },
    { key: 'conflict', label: 'Conflict', labels: ['conflict', 'schedule conflict'] },
    {
      key: 'low_and_awarded',
      label: 'Low & Awarded',
      labels: ['low & awarded', 'lost & awarded', 'lost and awarded'],
    },
  ]);
}

export function convertRulesToParams(rules: FilterRule[]): URLSearchParams {
  const params = new URLSearchParams();

  const fieldsToClear: Record<string, string[]> = {
    status: ['status', 'status_not'],
    division: ['division_id', 'division_id_not'],
    client: ['client_id', 'client_id_not'],
    estimator: ['estimator_id', 'estimator_id_not'],
  };

  Object.values(fieldsToClear)
    .flat()
    .forEach((param) => {
      params.delete(param);
    });

  for (const rule of rules) {
    if (!rule.value || (Array.isArray(rule.value) && (!rule.value[0] || !rule.value[1]))) {
      continue;
    }

    switch (rule.field) {
      case 'status':
        if (typeof rule.value === 'string') {
          if (rule.operator === 'is') {
            params.set('status', rule.value);
          } else if (rule.operator === 'is_not') {
            params.set('status_not', rule.value);
          }
        }
        break;

      case 'division':
        if (typeof rule.value === 'string') {
          if (rule.operator === 'is') {
            params.set('division_id', rule.value);
          } else if (rule.operator === 'is_not') {
            params.set('division_id_not', rule.value);
          }
        }
        break;

      case 'client':
        if (typeof rule.value === 'string') {
          if (rule.operator === 'is') {
            params.set('client_id', rule.value);
          } else if (rule.operator === 'is_not') {
            params.set('client_id_not', rule.value);
          }
        }
        break;

      case 'estimator':
        if (typeof rule.value === 'string') {
          if (rule.operator === 'is') {
            params.set('estimator_id', rule.value);
          } else if (rule.operator === 'is_not') {
            params.set('estimator_id_not', rule.value);
          }
        }
        break;

      case 'start_date':
        if (typeof rule.value === 'string') {
          if (rule.operator === 'is_before') {
            params.set('date_end', rule.value);
          } else if (rule.operator === 'is_after') {
            params.set('date_start', rule.value);
          } else if (rule.operator === 'is' && rule.value) {
            params.set('date_start', rule.value);
            params.set('date_end', rule.value);
          }
        } else if (Array.isArray(rule.value) && rule.operator === 'is_between') {
          params.set('date_start', rule.value[0]);
          params.set('date_end', rule.value[1]);
        }
        break;

      case 'eta':
        if (typeof rule.value === 'string') {
          if (rule.operator === 'is_before') {
            params.set('eta_end', rule.value);
          } else if (rule.operator === 'is_after') {
            params.set('eta_start', rule.value);
          } else if (rule.operator === 'is' && rule.value) {
            params.set('eta_start', rule.value);
            params.set('eta_end', rule.value);
          }
        } else if (Array.isArray(rule.value) && rule.operator === 'is_between') {
          params.set('eta_start', rule.value[0]);
          params.set('eta_end', rule.value[1]);
        }
        break;

      case 'value':
        if (typeof rule.value === 'string') {
          if (rule.operator === 'greater_than') {
            params.set('value_min', rule.value);
          } else if (rule.operator === 'less_than') {
            params.set('value_max', rule.value);
          } else if (rule.operator === 'is_equal_to') {
            params.set('value_min', rule.value);
            params.set('value_max', rule.value);
          }
        } else if (Array.isArray(rule.value) && rule.operator === 'between') {
          params.set('value_min', rule.value[0]);
          params.set('value_max', rule.value[1]);
        }
        break;
    }
  }

  return params;
}

export function convertParamsToRules(params: URLSearchParams): FilterRule[] {
  const rules: FilterRule[] = [];
  let idCounter = 1;

  const status = params.get('status');
  const statusNot = params.get('status_not');
  if (status) {
    rules.push({ id: `rule-${idCounter++}`, field: 'status', operator: 'is', value: status });
  } else if (statusNot) {
    rules.push({ id: `rule-${idCounter++}`, field: 'status', operator: 'is_not', value: statusNot });
  }

  const division = params.get('division_id');
  const divisionNot = params.get('division_id_not');
  if (division) {
    rules.push({ id: `rule-${idCounter++}`, field: 'division', operator: 'is', value: division });
  } else if (divisionNot) {
    rules.push({ id: `rule-${idCounter++}`, field: 'division', operator: 'is_not', value: divisionNot });
  }

  const client = params.get('client_id');
  const clientNot = params.get('client_id_not');
  if (client) {
    rules.push({ id: `rule-${idCounter++}`, field: 'client', operator: 'is', value: client });
  } else if (clientNot) {
    rules.push({ id: `rule-${idCounter++}`, field: 'client', operator: 'is_not', value: clientNot });
  }

  const estimator = params.get('estimator_id');
  const estimatorNot = params.get('estimator_id_not');
  if (estimator) {
    rules.push({ id: `rule-${idCounter++}`, field: 'estimator', operator: 'is', value: estimator });
  } else if (estimatorNot) {
    rules.push({ id: `rule-${idCounter++}`, field: 'estimator', operator: 'is_not', value: estimatorNot });
  }

  const dateStart = params.get('date_start');
  const dateEnd = params.get('date_end');
  if (dateStart && dateEnd) {
    if (dateStart === dateEnd) {
      rules.push({ id: `rule-${idCounter++}`, field: 'start_date', operator: 'is', value: dateStart });
    } else {
      rules.push({ id: `rule-${idCounter++}`, field: 'start_date', operator: 'is_between', value: [dateStart, dateEnd] });
    }
  } else if (dateStart) {
    rules.push({ id: `rule-${idCounter++}`, field: 'start_date', operator: 'is_after', value: dateStart });
  } else if (dateEnd) {
    rules.push({ id: `rule-${idCounter++}`, field: 'start_date', operator: 'is_before', value: dateEnd });
  }

  const etaStart = params.get('eta_start');
  const etaEnd = params.get('eta_end');
  if (etaStart && etaEnd) {
    if (etaStart === etaEnd) {
      rules.push({ id: `rule-${idCounter++}`, field: 'eta', operator: 'is', value: etaStart });
    } else {
      rules.push({ id: `rule-${idCounter++}`, field: 'eta', operator: 'is_between', value: [etaStart, etaEnd] });
    }
  } else if (etaStart) {
    rules.push({ id: `rule-${idCounter++}`, field: 'eta', operator: 'is_after', value: etaStart });
  } else if (etaEnd) {
    rules.push({ id: `rule-${idCounter++}`, field: 'eta', operator: 'is_before', value: etaEnd });
  }

  const valueMin = params.get('value_min');
  const valueMax = params.get('value_max');
  if (valueMin && valueMax) {
    if (valueMin === valueMax) {
      rules.push({ id: `rule-${idCounter++}`, field: 'value', operator: 'is_equal_to', value: valueMin });
    } else {
      rules.push({ id: `rule-${idCounter++}`, field: 'value', operator: 'between', value: [valueMin, valueMax] });
    }
  } else if (valueMin) {
    rules.push({ id: `rule-${idCounter++}`, field: 'value', operator: 'greater_than', value: valueMin });
  } else if (valueMax) {
    rules.push({ id: `rule-${idCounter++}`, field: 'value', operator: 'less_than', value: valueMax });
  }

  return rules;
}
