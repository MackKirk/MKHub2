import '@/styles/react-grid-layout.css';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import ReactGridLayout, { WidthProvider } from 'react-grid-layout/legacy';
import type { Layout as RGLLayout } from 'react-grid-layout/legacy';
import { api } from '@/lib/api';

const GridLayout = WidthProvider(ReactGridLayout);
import toast from 'react-hot-toast';
import { useConfirm } from '@/components/ConfirmProvider';
import LoadingOverlay from '@/components/LoadingOverlay';
import { AnimationReadyProvider } from '@/contexts/AnimationReadyContext';
import { DEFAULT_HOME_DASHBOARD } from './home-dashboard/defaultLayout';
import type { HomeDashboardState, LayoutItem, WidgetDef } from './home-dashboard/types';
import { WidgetWrapper } from './home-dashboard/WidgetWrapper';
import { renderWidget } from './home-dashboard/widgetRegistry';
import { AddWidgetModal } from './home-dashboard/AddWidgetModal';
import { WidgetConfigModal } from './home-dashboard/WidgetConfigModal';

const COLUMNS = 8;
const ROW_HEIGHT = 100;
const MARGIN: [number, number] = [16, 16];

function sanitizeLayout(items: LayoutItem[]): LayoutItem[] {
  // Clamp items to the grid bounds to avoid distorted layouts on load.
  return items.map((l) => {
    const w = Math.min(Math.max(1, l.w), COLUMNS);
    const h = Math.max(1, l.h);
    let x = Math.max(0, l.x);
    if (x + w > COLUMNS) x = Math.max(0, COLUMNS - w);
    const y = Math.max(0, l.y);
    return { ...l, x, y, w, h };
  });
}

/** Migrate layout from 4-col to 8-col scale (double x and w). */
function migrateLayoutTo8Col(items: LayoutItem[]): LayoutItem[] {
  if (items.length === 0) return items;
  // 4-col layouts always fit within 0..4 (x+w<=4). If any item exceeds that,
  // it's already using the 8-col scale and must NOT be migrated.
  const maxXPlusW = Math.max(...items.map((l) => l.x + l.w));
  const maxX = Math.max(...items.map((l) => l.x));
  const maxW = Math.max(...items.map((l) => l.w));
  const looksLike4Col = maxXPlusW <= 4 && maxX < 4 && maxW <= 4;
  if (!looksLike4Col) return items; // already 8-col scale
  return items.map((l) => ({ ...l, x: l.x * 2, w: l.w * 2 }));
}

export default function Home() {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const { data: saved, isLoading, isFetched } = useQuery({
    queryKey: ['home-dashboard'],
    queryFn: () => api<HomeDashboardState | null>('GET', '/users/me/home-dashboard'),
    refetchOnWindowFocus: false,
    staleTime: 2 * 60 * 1000,
  });

  const [layout, setLayout] = useState<LayoutItem[]>(DEFAULT_HOME_DASHBOARD.layout);
  const [widgets, setWidgets] = useState<WidgetDef[]>(DEFAULT_HOME_DASHBOARD.widgets);
  const [isEditMode, setIsEditMode] = useState(false);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [configWidgetId, setConfigWidgetId] = useState<string | null>(null);
  const hasHydratedFromServer = useRef(false);
  const [hasResolvedInitial, setHasResolvedInitial] = useState(false);

  // Apply server state on initial load (and after full page reload); avoid overwriting when refetch returns stale data
  useEffect(() => {
    if (!isFetched) return;
    if (!hasResolvedInitial) setHasResolvedInitial(true);
    if (saved === undefined || saved === null) return;
    const rawLayout = saved.layout;
    const rawWidgets = saved.widgets;
    const layoutList = Array.isArray(rawLayout) ? rawLayout : (typeof rawLayout === 'string' ? (() => { try { const p = JSON.parse(rawLayout); return Array.isArray(p) ? p : []; } catch { return []; } })() : []);
    const widgetsList = Array.isArray(rawWidgets) ? rawWidgets : (typeof rawWidgets === 'string' ? (() => { try { const p = JSON.parse(rawWidgets); return Array.isArray(p) ? p : []; } catch { return []; } })() : []);
    if (hasHydratedFromServer.current) return;
    hasHydratedFromServer.current = true;
    setLayout(sanitizeLayout(migrateLayoutTo8Col(layoutList as LayoutItem[])));
    setWidgets(widgetsList as WidgetDef[]);
  }, [saved, isFetched]);

  const saveDashboard = useCallback(async (nextLayout: LayoutItem[], nextWidgets: WidgetDef[]) => {
    try {
      const safeLayout = sanitizeLayout(nextLayout);
      await api('PUT', '/users/me/home-dashboard', { layout: safeLayout, widgets: nextWidgets });
      queryClient.setQueryData(['home-dashboard'], { layout: safeLayout, widgets: nextWidgets });
      toast.success('Dashboard saved');
    } catch {
      toast.error('Failed to save dashboard');
    }
  }, [queryClient]);

  // Only apply layout changes from the grid when in edit mode. On load, the grid compacts
  // (compactType="vertical") and fires onLayoutChange, which would overwrite the saved layout.
  const handleLayoutChange = useCallback((newLayout: RGLLayout) => {
    if (!isEditMode) return;
    setLayout(newLayout.map(({ i, x, y, w, h }) => ({ i, x, y, w, h })));
  }, [isEditMode]);

  const handleRemoveWidget = useCallback(async (id: string) => {
    const result = await confirm({
      title: 'Remove widget',
      message: 'Remove this widget from your dashboard?',
      confirmText: 'Remove',
      cancelText: 'Cancel',
    });
    if (result !== 'confirm') return;
    setLayout((prev) => prev.filter((l) => l.i !== id));
    setWidgets((prev) => prev.filter((w) => w.id !== id));
  }, [confirm]);

  const handleAddWidget = useCallback((widget: WidgetDef, layoutItem: LayoutItem) => {
    setWidgets((prev) => [...prev, widget]);
    setLayout((prev) => [...prev, layoutItem]);
  }, []);

  const handleReset = useCallback(async () => {
    const result = await confirm({
      title: 'Reset dashboard',
      message: 'Reset dashboard to default layout? This cannot be undone.',
      confirmText: 'Reset',
      cancelText: 'Cancel',
    });
    if (result !== 'confirm') return;
    setLayout(DEFAULT_HOME_DASHBOARD.layout);
    setWidgets(DEFAULT_HOME_DASHBOARD.widgets);
    saveDashboard(DEFAULT_HOME_DASHBOARD.layout, DEFAULT_HOME_DASHBOARD.widgets);
  }, [confirm, saveDashboard]);

  const handleDoneEdit = useCallback(() => {
    setIsEditMode(false);
    saveDashboard(layout, widgets);
  }, [layout, widgets, saveDashboard]);

  const openConfig = useCallback((id: string) => setConfigWidgetId(id), []);
  const closeConfig = useCallback(() => setConfigWidgetId(null), []);

  const configWidget = configWidgetId ? widgets.find((w) => w.id === configWidgetId) ?? null : null;
  const handleSaveConfig = useCallback((widgetId: string, nextConfig: Record<string, unknown>, title?: string) => {
    const nextWidgets = widgets.map((w) =>
      w.id === widgetId ? { ...w, config: nextConfig, ...(title !== undefined ? { title } : {}) } : w
    );
    setWidgets(nextWidgets);
    saveDashboard(layout, nextWidgets);
    setConfigWidgetId(null);
  }, [layout, widgets, saveDashboard]);

  const showLoading = isLoading || !hasResolvedInitial;

  return (
    <LoadingOverlay isLoading={showLoading} text="Loading dashboard…" minHeight="min-h-[50vh]">
    <AnimationReadyProvider loaded={!isLoading} delay={80}>
    <div className="p-4 md:p-6 max-w-[1600px] mx-auto">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-gray-900">My Dashboard</h1>
        <div className="flex items-center gap-2">
          {isEditMode ? (
            <>
              <button
                type="button"
                onClick={() => setAddModalOpen(true)}
                className="px-3 py-2 rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 text-sm font-medium"
              >
                Add Widget
              </button>
              <button
                type="button"
                onClick={handleReset}
                className="px-3 py-2 rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 text-sm font-medium"
              >
                Reset to default
              </button>
              <button
                type="button"
                onClick={handleDoneEdit}
                className="px-3 py-2 rounded-lg bg-[#7f1010] text-white hover:bg-[#a31414] text-sm font-medium"
              >
                Done
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setIsEditMode(true)}
              className="px-3 py-2 rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 text-sm font-medium"
            >
              Customize / Edit dashboard
            </button>
          )}
        </div>
      </div>

      {widgets.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50/50 p-12 text-center">
          <p className="text-gray-500 mb-4">No widgets yet. Add widgets to build your dashboard.</p>
          {isEditMode && (
            <button
              type="button"
              onClick={() => setAddModalOpen(true)}
              className="px-4 py-2 rounded-lg bg-[#7f1010] text-white hover:bg-[#a31414]"
            >
              Add Widget
            </button>
          )}
        </div>
      ) : (
      <GridLayout
        className="layout"
        layout={layout}
        onLayoutChange={handleLayoutChange}
        cols={COLUMNS}
        rowHeight={ROW_HEIGHT}
        margin={MARGIN}
        containerPadding={[0, 0]}
        isDraggable={isEditMode}
        isResizable={isEditMode}
        compactType="vertical"
        preventCollision={false}
      >
        {widgets.map((widget) => (
          <div key={widget.id} className="h-full min-h-0">
            <WidgetWrapper
              widget={widget}
              isEditMode={isEditMode}
              onRemove={() => handleRemoveWidget(widget.id)}
              onOpenConfig={() => openConfig(widget.id)}
            >
              {renderWidget(widget.type, widget.config)}
            </WidgetWrapper>
          </div>
        ))}
      </GridLayout>
      )}

      <AddWidgetModal
        open={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        onAdd={handleAddWidget}
        existingLayout={layout}
      />

      <WidgetConfigModal
        widget={configWidget}
        onClose={closeConfig}
        onSave={handleSaveConfig}
      />
    </div>
    </AnimationReadyProvider>
    </LoadingOverlay>
  );
}
