/**
 * Gallery items for the Add Widget modal. Each item can add a widget with type + config.
 * defaultSize is resolved from widgetRegistry by type.
 */
export type GalleryItem = {
  id: string;
  type: string;
  label: string;
  description: string;
  category: 'KPIs' | 'Charts' | 'Lists' | 'Shortcuts' | 'Calendar';
  config: Record<string, unknown>;
  /** For KPI preview: sample value to show (e.g. "24" or "$1.2M") */
  sampleValue?: string;
  /** Icon name or emoji for KPI/Shortcut */
  icon?: string;
  /** Chart type for preview and config */
  chartType?: 'bar' | 'pie' | 'line' | 'donut';
  /** For list preview: mock line labels */
  mockLines?: string[];
};

export const GALLERY_TABS = ['KPIs', 'Charts', 'Lists', 'Shortcuts', 'Calendar'] as const;

export const GALLERY_ITEMS: GalleryItem[] = [
  {
    id: 'kpi-opportunities',
    type: 'kpi',
    label: 'Opportunities',
    description: 'Total count of opportunities',
    category: 'KPIs',
    config: { metric: 'opportunities', period: 'all', mode: 'quantity' },
    sampleValue: '24',
    icon: '📋',
  },
  {
    id: 'kpi-projects',
    type: 'kpi',
    label: 'Projects',
    description: 'Total Count of Projects',
    category: 'KPIs',
    config: { metric: 'projects', period: 'all', mode: 'quantity' },
    sampleValue: '18',
    icon: '🏗️',
  },
  {
    id: 'kpi-estimated',
    type: 'kpi',
    label: 'Estimated Value • Opportunities',
    description: 'Total estimated value of opportunities',
    category: 'KPIs',
    config: { metric: 'estimated_value', period: 'all', mode: 'value' },
    sampleValue: '$1.2M',
    icon: '💰',
  },
  {
    id: 'kpi-actual',
    type: 'kpi',
    label: 'Actual Value • Projects',
    description: 'Total actual value of projects',
    category: 'KPIs',
    config: { metric: 'actual_value', period: 'all', mode: 'value' },
    sampleValue: '$890K',
    icon: '📊',
  },
  // Charts: only Opportunities and Projects, each with bar, line, pie (green = Opportunities, blue = Projects by default)
  {
    id: 'chart-bar-opp',
    type: 'chart',
    label: 'Bar',
    description: 'Bar chart of opportunities',
    category: 'Charts',
    config: { chartType: 'bar', metric: 'opportunities_by_status', mode: 'quantity', palette: 'green' },
    chartType: 'bar',
  },
  {
    id: 'chart-bar-proj',
    type: 'chart',
    label: 'Bar',
    description: 'Bar chart of projects',
    category: 'Charts',
    config: { chartType: 'bar', metric: 'projects_by_status', mode: 'quantity', palette: 'cool' },
    chartType: 'bar',
  },
  {
    id: 'chart-line-opp',
    type: 'chart',
    label: 'Line',
    description: 'Line chart of opportunities',
    category: 'Charts',
    config: { chartType: 'line', metric: 'opportunities_by_status', mode: 'quantity', palette: 'green' },
    chartType: 'line',
  },
  {
    id: 'chart-line-proj',
    type: 'chart',
    label: 'Line',
    description: 'Line chart of projects',
    category: 'Charts',
    config: { chartType: 'line', metric: 'projects_by_status', mode: 'quantity', palette: 'cool' },
    chartType: 'line',
  },
  {
    id: 'chart-pie-opp',
    type: 'chart',
    label: 'Pie',
    description: 'Pie chart of opportunities',
    category: 'Charts',
    config: { chartType: 'pie', metric: 'opportunities_by_status', mode: 'quantity', palette: 'green' },
    chartType: 'pie',
  },
  {
    id: 'chart-pie-proj',
    type: 'chart',
    label: 'Pie',
    description: 'Pie chart of projects',
    category: 'Charts',
    config: { chartType: 'pie', metric: 'projects_by_status', mode: 'quantity', palette: 'cool' },
    chartType: 'pie',
  },
  {
    id: 'chart-donut-opp',
    type: 'chart',
    label: 'Donut',
    description: 'Donut chart of opportunities',
    category: 'Charts',
    config: { chartType: 'donut', metric: 'opportunities_by_status', mode: 'quantity', palette: 'green' },
    chartType: 'donut',
  },
  {
    id: 'chart-donut-proj',
    type: 'chart',
    label: 'Donut',
    description: 'Donut chart of projects',
    category: 'Charts',
    config: { chartType: 'donut', metric: 'projects_by_status', mode: 'quantity', palette: 'cool' },
    chartType: 'donut',
  },
  {
    id: 'list_tasks',
    type: 'list_tasks',
    label: 'Tasks list',
    description: 'Your tasks with status and priority',
    category: 'Lists',
    config: { limit: 5 },
    icon: '✓',
  },
  {
    id: 'list_projects',
    type: 'list_projects',
    label: 'Projects list',
    description: 'Recent projects with status',
    category: 'Lists',
    config: { limit: 5 },
    icon: '📁',
  },
  {
    id: 'list_opportunities',
    type: 'list_opportunities',
    label: 'Opportunities list',
    description: 'Recent opportunities with status',
    category: 'Lists',
    config: { limit: 5 },
    icon: '📋',
  },
  { id: 'shortcut_tasks', type: 'shortcuts', label: 'Tasks', description: 'Quick link to Tasks', category: 'Shortcuts', config: { items: ['tasks'] }, icon: '✅' },
  { id: 'shortcut_projects', type: 'shortcuts', label: 'Projects', description: 'Quick link to Projects', category: 'Shortcuts', config: { items: ['projects'] }, icon: '🏗️' },
  { id: 'shortcut_schedule', type: 'shortcuts', label: 'Schedule', description: 'Quick link to Schedule', category: 'Shortcuts', config: { items: ['schedule'] }, icon: '📅' },
  { id: 'shortcut_opportunities', type: 'shortcuts', label: 'Opportunities', description: 'Quick link to Opportunities', category: 'Shortcuts', config: { items: ['opportunities'] }, icon: '📋' },
  { id: 'shortcut_customers', type: 'shortcuts', label: 'Customers', description: 'Quick link to Customers', category: 'Shortcuts', config: { items: ['customers'] }, icon: '👥' },
  { id: 'shortcut_clock', type: 'shortcuts', label: 'Clock in/out', description: 'Quick link to Clock in/out', category: 'Shortcuts', config: { items: ['clock'] }, icon: '⏰' },
  { id: 'shortcut_business', type: 'shortcuts', label: 'Dashboard', description: 'Quick link to Business Dashboard', category: 'Shortcuts', config: { items: ['business'] }, icon: '📊' },
  {
    id: 'calendar',
    type: 'calendar',
    label: 'Calendar',
    description: 'Month view with shifts, click day to open Schedule',
    category: 'Calendar',
    config: {},
    icon: '📅',
  },
  {
    id: 'schedule',
    type: 'schedule',
    label: 'Schedule',
    description: 'This week’s shifts at a glance',
    category: 'Calendar',
    config: {},
    icon: '📆',
  },
];
