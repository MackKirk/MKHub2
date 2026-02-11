import type { HomeDashboardState } from './types';

/** Default dashboard used when user has no saved layout and for "Reset to default". (8-col grid.) */
export const DEFAULT_HOME_DASHBOARD: HomeDashboardState = {
  layout: [
    { i: 'default-kpi-1', x: 0, y: 0, w: 2, h: 1 },
    { i: 'default-kpi-2', x: 2, y: 0, w: 2, h: 1 },
    { i: 'default-shortcuts', x: 0, y: 1, w: 2, h: 1 },
    { i: 'default-list-tasks', x: 4, y: 1, w: 4, h: 2 },
  ],
  widgets: [
    { id: 'default-kpi-1', type: 'kpi', title: 'Opportunities', config: { metric: 'opportunities', period: 'all', mode: 'quantity' } },
    { id: 'default-kpi-2', type: 'kpi', title: 'Projects', config: { metric: 'projects', period: 'all', mode: 'quantity' } },
    { id: 'default-shortcuts', type: 'shortcuts', title: 'Shortcuts', config: { items: ['tasks', 'projects', 'schedule'] } },
    { id: 'default-list-tasks', type: 'list_tasks', title: 'My Tasks', config: { limit: 5 } },
  ],
};
