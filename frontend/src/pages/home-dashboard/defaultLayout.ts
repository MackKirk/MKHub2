import type { HomeDashboardState } from './types';

/**
 * Legacy reference: the full Estimator template is defined on the server
 * (`app/services/home_dashboard_templates.py`). Kept for documentation / diff only.
 */
export const DEFAULT_HOME_DASHBOARD: HomeDashboardState = {
  layout: [
    { i: 'c2254934-160b-4070-a028-718a665840e9', x: 0, y: 2, w: 4, h: 3 },
    { i: 'bdbd3133-e111-47a9-8de5-50922190a1a6', x: 0, y: 0, w: 3, h: 2 },
    { i: '528e8d23-de3f-4899-8b40-745624d81032', x: 4, y: 0, w: 4, h: 3 },
    { i: '812d0c76-2965-46ed-a784-ca76dd94ac78', x: 4, y: 3, w: 4, h: 2 },
    { i: 'c49d961c-810b-455a-be0d-fecf7794b061', x: 3, y: 0, w: 1, h: 1 },
    { i: 'c0e99158-5c4f-4fa3-9210-a0d0837a919f', x: 3, y: 1, w: 1, h: 1 },
    { i: '42acd220-d2c5-494d-8c70-e9c60ae2c6ec', x: 1, y: 5, w: 1, h: 1 },
    { i: '9765209a-e911-4a1e-b461-1eb3257b9827', x: 0, y: 5, w: 1, h: 1 },
    { i: '660cb5fd-ec7b-499d-ba68-886b57645b39', x: 5, y: 8, w: 3, h: 3 },
    { i: 'bb5f6a51-0733-4d29-9d9c-441713f82fbe', x: 5, y: 5, w: 3, h: 3 },
    { i: '8e845b23-9390-4930-a143-dd5a5d829dd8', x: 2, y: 6, w: 1, h: 1 },
    { i: 'ef3d9dac-adc0-47ad-ac9c-457ee7ae85f9', x: 2, y: 5, w: 1, h: 1 },
    { i: 'df8991f3-138a-4fa7-9c81-b4cca8f7770f', x: 1, y: 6, w: 1, h: 1 },
    { i: 'f063ecf5-aeb8-4a9e-96ea-c608b996ee43', x: 0, y: 6, w: 1, h: 1 },
    { i: '2d78ec9c-0c76-49da-9819-c4a03ef3f753', x: 0, y: 7, w: 3, h: 4 },
    { i: 'a2d76703-89ec-4d90-8539-d517ec1701c9', x: 3, y: 5, w: 2, h: 2 },
    { i: '70732f90-3d96-43e0-b5ab-b8e48dd7b907', x: 3, y: 10, w: 2, h: 1 },
    { i: 'c55e0580-ee23-46fb-809d-c4535ff8bb6f', x: 3, y: 7, w: 2, h: 3 },
  ],
  widgets: [
    { id: 'c2254934-160b-4070-a028-718a665840e9', type: 'chart', title: 'Opportunities by division', config: { chartType: 'line', metric: 'opportunities_by_division', mode: 'quantity', period: 'last_6_months', palette: 'green' } },
    { id: 'bdbd3133-e111-47a9-8de5-50922190a1a6', type: 'chart', title: 'Projects by division', config: { chartType: 'bar', metric: 'projects_by_division', mode: 'value', period: 'last_6_months', palette: 'green' } },
    { id: '528e8d23-de3f-4899-8b40-745624d81032', type: 'chart', title: 'Opportunities by status', config: { chartType: 'pie', metric: 'opportunities_by_status', mode: 'value', palette: 'cool', period: 'last_3_months' } },
    { id: '812d0c76-2965-46ed-a784-ca76dd94ac78', type: 'chart', title: 'Opportunities by status', config: { chartType: 'bar', metric: 'opportunities_by_status', mode: 'quantity', palette: 'cool' } },
    { id: 'c49d961c-810b-455a-be0d-fecf7794b061', type: 'kpi', title: 'Projects', config: { metric: 'projects', period: 'last_6_months', mode: 'quantity', status_labels: ['On hold', 'In Progress'] } },
    { id: 'c0e99158-5c4f-4fa3-9210-a0d0837a919f', type: 'kpi', title: 'Opportunities', config: { metric: 'opportunities', period: 'all', mode: 'quantity' } },
    { id: '42acd220-d2c5-494d-8c70-e9c60ae2c6ec', type: 'kpi', title: 'Estimated Value • Opportunities', config: { metric: 'estimated_value', period: 'last_3_months', mode: 'value', status_labels: ['Prospecting'] } },
    { id: '9765209a-e911-4a1e-b461-1eb3257b9827', type: 'kpi', title: 'Actual Value • Projects', config: { metric: 'actual_value', period: 'all', mode: 'value' } },
    { id: '660cb5fd-ec7b-499d-ba68-886b57645b39', type: 'list_projects', title: 'Projects list', config: { limit: 5 } },
    { id: 'bb5f6a51-0733-4d29-9d9c-441713f82fbe', type: 'list_opportunities', title: 'Opportunities list', config: { limit: 5 } },
    { id: '8e845b23-9390-4930-a143-dd5a5d829dd8', type: 'shortcuts', title: 'Projects', config: { items: ['projects'] } },
    { id: 'ef3d9dac-adc0-47ad-ac9c-457ee7ae85f9', type: 'shortcuts', title: 'Schedule', config: { items: ['schedule'] } },
    { id: 'df8991f3-138a-4fa7-9c81-b4cca8f7770f', type: 'shortcuts', title: 'Dashboard', config: { items: ['business'] } },
    { id: 'f063ecf5-aeb8-4a9e-96ea-c608b996ee43', type: 'shortcuts', title: 'Customers', config: { items: ['customers'] } },
    { id: '2d78ec9c-0c76-49da-9819-c4a03ef3f753', type: 'calendar', title: 'Calendar', config: {} },
    { id: 'a2d76703-89ec-4d90-8539-d517ec1701c9', type: 'chart', title: 'Projects by division', config: { chartType: 'donut', metric: 'projects_by_division', mode: 'quantity', palette: 'cool' } },
    { id: '70732f90-3d96-43e0-b5ab-b8e48dd7b907', type: 'shortcuts', title: 'Clock in/out', config: { items: ['clock'] } },
    { id: 'c55e0580-ee23-46fb-809d-c4535ff8bb6f', type: 'schedule', title: 'Schedule', config: {} },
  ],
};
