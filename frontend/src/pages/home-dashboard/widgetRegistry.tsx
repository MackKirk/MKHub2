import type { ReactNode } from 'react';
import { ShortcutsWidget } from './widgets/ShortcutsWidget';
import { KpiWidget } from './widgets/KpiWidget';
import { ChartWidget } from './widgets/ChartWidget';
import { ListTasksWidget } from './widgets/ListTasksWidget';
import { ListProjectsWidget } from './widgets/ListProjectsWidget';

export const WIDGET_CATEGORIES = ['KPIs', 'Charts', 'Lists', 'Shortcuts'] as const;

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
    defaultConfig: { items: ['tasks', 'projects', 'schedule', 'quotes'] },
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
    defaultSize: { w: 4, h: 2 },
    defaultConfig: { chartType: 'bar', metric: 'opportunities_by_status', mode: 'quantity' },
    component: ({ config }) => <ChartWidget config={config} />,
  },
  {
    id: 'list_tasks',
    label: 'Tasks List',
    category: 'Lists',
    defaultSize: { w: 2, h: 2 },
    defaultConfig: { limit: 5 },
    component: ({ config }) => <ListTasksWidget config={config} />,
  },
  {
    id: 'list_projects',
    label: 'Projects List',
    category: 'Lists',
    defaultSize: { w: 2, h: 2 },
    defaultConfig: { limit: 5 },
    component: ({ config }) => <ListProjectsWidget config={config} />,
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

export function renderWidget(type: string, config?: Record<string, unknown>): ReactNode {
  const Comp = getWidgetComponent(type);
  if (!Comp) return <div className="text-sm text-gray-400">Unknown: {type}</div>;
  return <Comp config={config} />;
}
