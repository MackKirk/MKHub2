import type { ReactNode } from 'react';
import { ShortcutsWidget } from './widgets/ShortcutsWidget';
import { KpiWidget } from './widgets/KpiWidget';
import { ChartWidget } from './widgets/ChartWidget';
import { ListTasksWidget } from './widgets/ListTasksWidget';
import { ListProjectsWidget } from './widgets/ListProjectsWidget';
import { ListOpportunitiesWidget } from './widgets/ListOpportunitiesWidget';
import { CalendarWidget } from './widgets/CalendarWidget';
import { ScheduleWidget } from './widgets/ScheduleWidget';
import { ClockInOutWidget } from './widgets/ClockInOutWidget';

export const WIDGET_CATEGORIES = ['KPIs', 'Charts', 'Lists', 'Shortcuts', 'Calendar'] as const;

export type WidgetMeta = {
  id: string;
  label: string;
  category: (typeof WIDGET_CATEGORIES)[number];
  defaultSize: { w: number; h: number };
  defaultConfig?: Record<string, unknown>;
};

export type WidgetRegistryEntry = WidgetMeta & {
  component: (props: { config?: Record<string, unknown> }) => ReactNode;
};

const registry: WidgetRegistryEntry[] = [
  {
    id: 'shortcuts',
    label: 'Shortcuts',
    category: 'Shortcuts',
    defaultSize: { w: 2, h: 1 },
    defaultConfig: { items: ['tasks', 'projects', 'schedule'] },
    component: ({ config }) => <ShortcutsWidget config={config} />,
  },
  {
    id: 'kpi',
    label: 'KPI Card',
    category: 'KPIs',
    defaultSize: { w: 2, h: 1 },
    defaultConfig: { metric: 'opportunities', period: 'all', mode: 'quantity' },
    component: ({ config }) => <KpiWidget config={config} />,
  },
  {
    id: 'chart',
    label: 'Chart',
    category: 'Charts',
    defaultSize: { w: 6, h: 2 },
    defaultConfig: { chartType: 'bar', metric: 'opportunities_by_status', mode: 'quantity' },
    component: ({ config }) => <ChartWidget config={config} />,
  },
  {
    id: 'list_tasks',
    label: 'Tasks List',
    category: 'Lists',
    defaultSize: { w: 4, h: 2 },
    defaultConfig: { limit: 5 },
    component: ({ config }) => <ListTasksWidget config={config} />,
  },
  {
    id: 'list_projects',
    label: 'Projects List',
    category: 'Lists',
    defaultSize: { w: 4, h: 2 },
    defaultConfig: { limit: 5 },
    component: ({ config }) => <ListProjectsWidget config={config} />,
  },
  {
    id: 'list_opportunities',
    label: 'Opportunities List',
    category: 'Lists',
    defaultSize: { w: 4, h: 2 },
    defaultConfig: { limit: 5 },
    component: ({ config }) => <ListOpportunitiesWidget config={config} />,
  },
  {
    id: 'calendar',
    label: 'Calendar',
    category: 'Calendar',
    defaultSize: { w: 3, h: 2 },
    defaultConfig: {},
    component: ({ config }) => <CalendarWidget config={config} />,
  },
  {
    id: 'schedule',
    label: 'Schedule',
    category: 'Calendar',
    defaultSize: { w: 4, h: 2 },
    defaultConfig: {},
    component: ({ config }) => <ScheduleWidget config={config} />,
  },
  {
    id: 'clock_in_out',
    label: 'Clock in/out',
    category: 'Calendar',
    defaultSize: { w: 3, h: 2 },
    defaultConfig: {},
    component: ({ config }) => <ClockInOutWidget config={config} />,
  },
];

export function getWidgetMeta(type: string): WidgetMeta | undefined {
  return registry.find((e) => e.id === type);
}

export function getWidgetComponent(type: string): WidgetRegistryEntry['component'] | undefined {
  return registry.find((e) => e.id === type)?.component;
}

export function getAllWidgets(): WidgetRegistryEntry[] {
  return registry;
}

const KPI_ICONS: Record<string, string> = {
  opportunities: '📋',
  projects: '🏗️',
  estimated_value: '💰',
  actual_value: '📊',
};

const CHART_ICONS: Record<string, string> = {
  opportunities_by_status: '📋',
  opportunities_by_division: '📋',
  projects_by_status: '🏗️',
  projects_by_division: '🏗️',
};

const SHORTCUT_ICONS: Record<string, string> = {
  tasks: '✅',
  projects: '🏗️',
  schedule: '📅',
  opportunities: '📋',
  customers: '👥',
  clock: '⏰',
  business: '📊',
};

const WIDGET_TYPE_ICONS: Record<string, string> = {
  shortcuts: '⚡',
  kpi: '📊',
  chart: '📈',
  list_tasks: '✅',
  list_projects: '🏗️',
  list_opportunities: '📋',
  calendar: '📅',
  schedule: '📆',
  clock_in_out: '⏰',
};

export function getWidgetIcon(widget: { type: string; config?: Record<string, unknown> }): string {
  const { type, config } = widget;
  if (type === 'kpi' && config?.metric) {
    return KPI_ICONS[String(config.metric)] ?? WIDGET_TYPE_ICONS.kpi;
  }
  if (type === 'chart' && config?.metric) {
    return CHART_ICONS[String(config.metric)] ?? WIDGET_TYPE_ICONS.chart;
  }
  if (type === 'shortcuts' && config?.items) {
    const items = config.items as string[];
    const first = items[0];
    if (first && SHORTCUT_ICONS[first]) return SHORTCUT_ICONS[first];
  }
  return WIDGET_TYPE_ICONS[type] ?? '📦';
}

export function renderWidget(type: string, config?: Record<string, unknown>): ReactNode {
  const Comp = getWidgetComponent(type);
  if (!Comp) return <div className="text-sm text-gray-400">Unknown: {type}</div>;
  return <Comp config={config} />;
}
