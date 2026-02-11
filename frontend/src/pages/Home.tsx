import '@/styles/react-grid-layout.css';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import ReactGridLayout, { WidthProvider } from 'react-grid-layout/legacy';
import type { Layout as RGLLayout } from 'react-grid-layout/legacy';
import { api } from '@/lib/api';

const GridLayout = WidthProvider(ReactGridLayout);
import toast from 'react-hot-toast';
import { useConfirm } from '@/components/ConfirmProvider';
import { DEFAULT_HOME_DASHBOARD } from './home-dashboard/defaultLayout';
import type { HomeDashboardState, LayoutItem, WidgetDef } from './home-dashboard/types';
import { WidgetWrapper } from './home-dashboard/WidgetWrapper';
import { renderWidget } from './home-dashboard/widgetRegistry';
import { AddWidgetModal } from './home-dashboard/AddWidgetModal';
import { WidgetConfigModal } from './home-dashboard/WidgetConfigModal';

const COLUMNS = 8;
const ROW_HEIGHT = 100;
const MARGIN: [number, number] = [16, 16];

/** Migrate layout from 4-col to 8-col scale (double x and w). */
function migrateLayoutTo8Col(items: LayoutItem[]): LayoutItem[] {
  if (items.length === 0) return items;
  const maxW = Math.max(...items.map((l) => l.w));
  if (maxW > 4) return items; // already 8-col scale
  return items.map((l) => ({ ...l, x: l.x * 2, w: l.w * 2 }));
}

export default function Home() {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const { data: saved, isLoading } = useQuery({
    queryKey: ['home-dashboard'],
    queryFn: () => api<HomeDashboardState | null>('GET', '/users/me/home-dashboard'),
  });

  const [layout, setLayout] = useState<LayoutItem[]>(DEFAULT_HOME_DASHBOARD.layout);
  const [widgets, setWidgets] = useState<WidgetDef[]>(DEFAULT_HOME_DASHBOARD.widgets);
  const [isEditMode, setIsEditMode] = useState(false);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [configWidgetId, setConfigWidgetId] = useState<string | null>(null);

  useEffect(() => {
    if (saved === undefined || saved === null) return;
    if (Array.isArray(saved.layout) && Array.isArray(saved.widgets)) {
      setLayout(migrateLayoutTo8Col(saved.layout));
      setWidgets(saved.widgets);
    }
  }, [saved]);

  const saveDashboard = useCallback(async (nextLayout: LayoutItem[], nextWidgets: WidgetDef[]) => {
    try {
      await api('PUT', '/users/me/home-dashboard', { layout: nextLayout, widgets: nextWidgets });
      queryClient.setQueryData(['home-dashboard'], { layout: nextLayout, widgets: nextWidgets });
      toast.success('Dashboard saved');
    } catch {
      toast.error('Failed to save dashboard');
    }
  }, [queryClient]);

  const handleLayoutChange = useCallback((newLayout: RGLLayout) => {
    setLayout(newLayout.map(({ i, x, y, w, h }) => ({ i, x, y, w, h })));
  }, []);

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
    setWidgets((prev) => {
      const next = prev.map((w) => (w.id === widgetId ? { ...w, config: nextConfig, ...(title !== undefined ? { title } : {}) } : w));
      saveDashboard(layout, next);
      return next;
    });
    setConfigWidgetId(null);
  }, [layout, saveDashboard]);

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="rounded-xl border bg-white p-8 flex items-center justify-center text-gray-500">
          Loading dashboard…
        </div>
      </div>
    );
  }

  return (
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
  );
}
