/**
 * Gallery items for the Add Widget modal. Each item can add a widget with type + config.
 * defaultSize is resolved from widgetRegistry by type.
 */
export type GalleryItem = {
  id: string;
  type: string;
  label: string;
  description: string;
  category: 'KPIs' | 'Charts' | 'Lists' | 'Shortcuts';
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

export const GALLERY_TABS = ['KPIs', 'Charts', 'Lists', 'Shortcuts'] as const;

export const GALLERY_ITEMS: GalleryItem[] = [
  {
    id: 'kpi-opportunities',
    type: 'kpi',
    label: 'Opportunities',
    description: 'Total count or value of opportunities',
    category: 'KPIs',
    config: { metric: 'opportunities', period: 'all', mode: 'quantity' },
    sampleValue: '24',
    icon: '📋',
  },
  {
    id: 'kpi-projects',
    type: 'kpi',
    label: 'Projects',
    description: 'Active projects count or value',
    category: 'KPIs',
    config: { metric: 'projects', period: 'all', mode: 'quantity' },
    sampleValue: '18',
    icon: '🏗️',
  },
  {
    id: 'kpi-estimated',
    type: 'kpi',
    label: 'Estimated value',
    description: 'Total estimated value of opportunities',
    category: 'KPIs',
    config: { metric: 'estimated_value', period: 'all', mode: 'value' },
    sampleValue: '$1.2M',
    icon: '💰',
  },
  {
    id: 'kpi-actual',
    type: 'kpi',
    label: 'Actual value',
    description: 'Total actual value of projects',
    category: 'KPIs',
    config: { metric: 'actual_value', period: 'all', mode: 'value' },
    sampleValue: '$890K',
    icon: '📊',
  },
  // Charts: only Opportunities and Projects, each with bar, line, pie (same colors as dashboard: green = Opportunities, blue = Projects)
  {
    id: 'chart-bar-opp',
    type: 'chart',
    label: 'Opportunities (bar)',
    description: 'Bar chart of opportunities',
    category: 'Charts',
    config: { chartType: 'bar', metric: 'opportunities_by_status', mode: 'quantity' },
    chartType: 'bar',
  },
  {
    id: 'chart-bar-proj',
    type: 'chart',
    label: 'Projects (bar)',
    description: 'Bar chart of projects',
    category: 'Charts',
    config: { chartType: 'bar', metric: 'projects_by_status', mode: 'quantity' },
    chartType: 'bar',
  },
  {
    id: 'chart-line-opp',
    type: 'chart',
    label: 'Opportunities (line)',
    description: 'Line chart of opportunities',
    category: 'Charts',
    config: { chartType: 'line', metric: 'opportunities_by_status', mode: 'quantity' },
    chartType: 'line',
  },
  {
    id: 'chart-line-proj',
    type: 'chart',
    label: 'Projects (line)',
    description: 'Line chart of projects',
    category: 'Charts',
    config: { chartType: 'line', metric: 'projects_by_status', mode: 'quantity' },
    chartType: 'line',
  },
  {
    id: 'chart-pie-opp',
    type: 'chart',
    label: 'Opportunities (pie)',
    description: 'Pie chart of opportunities',
    category: 'Charts',
    config: { chartType: 'pie', metric: 'opportunities_by_status', mode: 'quantity' },
    chartType: 'pie',
  },
  {
    id: 'chart-pie-proj',
    type: 'chart',
    label: 'Projects (pie)',
    description: 'Pie chart of projects',
    category: 'Charts',
    config: { chartType: 'pie', metric: 'projects_by_status', mode: 'quantity' },
    chartType: 'pie',
  },
  {
    id: 'list_tasks',
    type: 'list_tasks',
    label: 'Tasks list',
    description: 'Your tasks with status and priority',
    category: 'Lists',
    config: { limit: 5 },
    mockLines: ['Review proposal', 'Site inspection', 'Update schedule', 'Call client'],
  },
  {
    id: 'list_projects',
    type: 'list_projects',
    label: 'Projects list',
    description: 'Recent projects with status',
    category: 'Lists',
    config: { limit: 5 },
    mockLines: ['Riverside Tower', 'West Mall Phase 2', 'Office Fit-out'],
  },
  {
    id: 'shortcuts',
    type: 'shortcuts',
    label: 'Shortcuts',
    description: 'Quick links to Tasks, Projects, Schedule & more',
    category: 'Shortcuts',
    config: { items: ['tasks', 'projects', 'schedule', 'quotes'] },
    icon: '⚡',
  },
];
