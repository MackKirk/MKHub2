import type { LucideIcon } from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';
import {
  BarChart3,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  ChartSpline,
  Clock3,
  DollarSign,
  FolderKanban,
  LayoutDashboard,
  LayoutGrid,
  ListChecks,
  Package,
  Users,
  Zap,
} from 'lucide-react';
import { uiCx } from '@/components/ui';

const KPI_ICONS: Record<string, LucideIcon> = {
  opportunities: BriefcaseBusiness,
  projects: Building2,
  estimated_value: DollarSign,
  actual_value: BarChart3,
};

const CHART_ICONS: Record<string, LucideIcon> = {
  opportunities_by_status: BriefcaseBusiness,
  opportunities_by_division: BriefcaseBusiness,
  projects_by_status: Building2,
  projects_by_division: Building2,
};

const SHORTCUT_ICONS: Record<string, LucideIcon> = {
  tasks: ListChecks,
  projects: Building2,
  schedule: CalendarDays,
  opportunities: BriefcaseBusiness,
  customers: Users,
  clock: Clock3,
  business: LayoutDashboard,
};

const WIDGET_TYPE_ICONS: Record<string, LucideIcon> = {
  shortcuts: Zap,
  kpi: ChartSpline,
  chart: BarChart3,
  list_tasks: ListChecks,
  list_projects: FolderKanban,
  list_opportunities: BriefcaseBusiness,
  calendar: CalendarDays,
  schedule: CalendarDays,
  clock_in_out: Clock3,
};

export function getShortcutIcon(id: string): LucideIcon {
  return SHORTCUT_ICONS[id] ?? LayoutGrid;
}

export function resolveWidgetLucideIcon(widget: {
  type: string;
  config?: Record<string, unknown>;
}): LucideIcon {
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
  return WIDGET_TYPE_ICONS[type] ?? Package;
}

type IconSize = 'sm' | 'md' | 'lg' | 'gallery';

const ICON_CLASS: Record<IconSize, string> = {
  sm: 'h-[clamp(0.875rem,4.5cqh,1.125rem)] w-[clamp(0.875rem,4.5cqh,1.125rem)]',
  md: 'h-[clamp(1.25rem,18cqh,2.25rem)] w-[clamp(1.25rem,18cqh,2.25rem)]',
  lg: 'h-[clamp(1.5rem,22cqh,2.75rem)] w-[clamp(1.5rem,22cqh,2.75rem)]',
  gallery: 'h-7 w-7',
};

export function WidgetIcon({
  icon: Icon,
  size = 'sm',
  className,
  style,
}: {
  icon: LucideIcon;
  size?: IconSize;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <Icon
      className={uiCx('shrink-0 text-gray-700', ICON_CLASS[size], className)}
      style={style}
      strokeWidth={1.75}
      aria-hidden
    />
  );
}

/** @deprecated use WidgetIcon — kept for imports */
export function WidgetIconTile(props: Parameters<typeof WidgetIcon>[0]) {
  return <WidgetIcon {...props} />;
}

/** Presentation-only widget icon for headers / gallery. */
export function getWidgetIcon(widget: {
  type: string;
  config?: Record<string, unknown>;
}): ReactNode {
  const Icon = resolveWidgetLucideIcon(widget);
  return <WidgetIcon icon={Icon} size="sm" className="text-gray-600" />;
}

export function getGalleryIconNode(item: {
  type: string;
  config?: Record<string, unknown>;
}): ReactNode {
  const Icon = resolveWidgetLucideIcon({ type: item.type, config: item.config });
  return <WidgetIcon icon={Icon} size="gallery" className="text-gray-700" />;
}
