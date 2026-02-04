/** Single item for react-grid-layout (i = widget id). */
export type LayoutItem = {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
};

/** Widget instance: id, type, optional title, config. */
export type WidgetDef = {
  id: string;
  type: string;
  title?: string;
  config?: Record<string, unknown>;
};

/** Full dashboard state persisted to backend. */
export type HomeDashboardState = {
  layout: LayoutItem[];
  widgets: WidgetDef[];
};
