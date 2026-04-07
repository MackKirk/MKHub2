import '@/styles/react-grid-layout.css';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactGridLayout, { WidthProvider } from 'react-grid-layout/legacy';
import type { Layout as RGLLayout } from 'react-grid-layout/legacy';
import { api } from '@/lib/api';

const GridLayout = WidthProvider(ReactGridLayout);
import toast from 'react-hot-toast';
import { useConfirm } from '@/components/ConfirmProvider';
import LoadingOverlay from '@/components/LoadingOverlay';
import { AnimationReadyProvider } from '@/contexts/AnimationReadyContext';
import { useBusinessLine } from '@/context/BusinessLineContext';
import type { HomeDashboardState, LayoutItem, WidgetDef } from './home-dashboard/types';
import { WidgetWrapper } from './home-dashboard/WidgetWrapper';
import { renderWidget } from './home-dashboard/widgetRegistry';
import { AddWidgetModal } from './home-dashboard/AddWidgetModal';
import { WidgetConfigModal } from './home-dashboard/WidgetConfigModal';
import type { MeForHomeWidgets } from './home-dashboard/widgetVisibility';
import { filterLayoutForWidgets, filterWidgetsForHome } from './home-dashboard/widgetVisibility';

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
  const todayLabel = useMemo(
    () =>
      new Date().toLocaleDateString('en-CA', {
        weekday: 'long',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      }),
    []
  );

  const activeBusinessLine = useBusinessLine();
  const { data: me } = useQuery({
    queryKey: ['me'],
    queryFn: () => api<MeForHomeWidgets>('GET', '/auth/me'),
  });

  const { data: saved, isLoading, isFetched } = useQuery({
    queryKey: ['home-dashboard'],
    queryFn: () => api<HomeDashboardState>('GET', '/users/me/home-dashboard'),
    refetchOnWindowFocus: false,
    staleTime: 2 * 60 * 1000,
  });

  const [layout, setLayout] = useState<LayoutItem[]>([]);
  const [widgets, setWidgets] = useState<WidgetDef[]>([]);
  const [isEditMode, setIsEditMode] = useState(false);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [configWidgetId, setConfigWidgetId] = useState<string | null>(null);
  const hasHydratedFromServer = useRef(false);
  const [hasResolvedInitial, setHasResolvedInitial] = useState(false);

  // Apply server state on initial load (and after full page reload); avoid overwriting when refetch returns stale data
  useEffect(() => {
    if (!isFetched) return;
    if (!hasResolvedInitial) setHasResolvedInitial(true);
    if (saved === undefined) return;
    const rawLayout = saved.layout;
    const rawWidgets = saved.widgets;
    const layoutList = Array.isArray(rawLayout) ? rawLayout : (typeof rawLayout === 'string' ? (() => { try { const p = JSON.parse(rawLayout); return Array.isArray(p) ? p : []; } catch { return []; } })() : []);
    const widgetsList = Array.isArray(rawWidgets) ? rawWidgets : (typeof rawWidgets === 'string' ? (() => { try { const p = JSON.parse(rawWidgets); return Array.isArray(p) ? p : []; } catch { return []; } })() : []);
    if (hasHydratedFromServer.current) return;
    hasHydratedFromServer.current = true;
    setLayout(sanitizeLayout(migrateLayoutTo8Col(layoutList as LayoutItem[])));
    setWidgets(widgetsList as WidgetDef[]);
  }, [saved, isFetched]);

  const visibleWidgets = useMemo(
    () => filterWidgetsForHome(widgets, me, activeBusinessLine),
    [widgets, me, activeBusinessLine]
  );
  const visibleLayout = useMemo(
    () => filterLayoutForWidgets(layout, visibleWidgets) as LayoutItem[],
    [layout, visibleWidgets]
  );

  const showTemplatesMenu = useMemo(() => {
    const roles = (me?.roles ?? []).map((r) => String(r).toLowerCase());
    return roles.includes('admin') || roles.includes('estimator');
  }, [me]);

  const [templatesMenuOpen, setTemplatesMenuOpen] = useState(false);
  const templatesMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!templatesMenuOpen) return;
    const onDoc = (e: MouseEvent) => {
      const el = templatesMenuRef.current;
      if (el && !el.contains(e.target as Node)) setTemplatesMenuOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [templatesMenuOpen]);

  const saveDashboard = useCallback(async (nextLayout: LayoutItem[], nextWidgets: WidgetDef[]) => {
    try {
      const safeLayout = sanitizeLayout(nextLayout);
      const res = await api<HomeDashboardState>('PUT', '/users/me/home-dashboard', { layout: safeLayout, widgets: nextWidgets });
      queryClient.setQueryData(['home-dashboard'], res);
      const rl = res.layout;
      const rw = res.widgets;
      const layoutList = Array.isArray(rl) ? rl : [];
      const widgetsList = Array.isArray(rw) ? rw : [];
      setLayout(sanitizeLayout(layoutList as LayoutItem[]));
      setWidgets(widgetsList as WidgetDef[]);
      toast.success('Dashboard saved');
    } catch {
      toast.error('Failed to save dashboard');
    }
  }, [queryClient]);

  // Only apply layout changes from the grid when in edit mode. On load, the grid compacts
  // (compactType="vertical") and fires onLayoutChange, which would overwrite the saved layout.
  const handleLayoutChange = useCallback((newLayout: RGLLayout) => {
    if (!isEditMode) return;
    setLayout((prev) => {
      const idxByI = new Map(prev.map((c, idx) => [c.i, idx]));
      const next = [...prev];
      for (const nl of newLayout) {
        const idx = idxByI.get(nl.i);
        if (idx !== undefined) {
          next[idx] = { ...next[idx], x: nl.x, y: nl.y, w: nl.w, h: nl.h };
        }
      }
      return next;
    });
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
    try {
      const data = await api<HomeDashboardState>('POST', '/users/me/home-dashboard/reset-template');
      queryClient.setQueryData(['home-dashboard'], data);
      const layoutList = Array.isArray(data.layout) ? data.layout : [];
      const widgetsList = Array.isArray(data.widgets) ? data.widgets : [];
      setLayout(sanitizeLayout(migrateLayoutTo8Col(layoutList as LayoutItem[])));
      setWidgets(widgetsList as WidgetDef[]);
      toast.success('Dashboard reset');
    } catch {
      toast.error('Failed to reset dashboard');
    }
  }, [confirm, queryClient]);

  const handleApplyEstimatorTemplate = useCallback(async () => {
    setTemplatesMenuOpen(false);
    const result = await confirm({
      title: 'Apply Estimator template',
      message: 'Replace your current dashboard with the Estimator template? This cannot be undone.',
      confirmText: 'Apply',
      cancelText: 'Cancel',
    });
    if (result !== 'confirm') return;
    try {
      const data = await api<HomeDashboardState>('POST', '/users/me/home-dashboard/apply-template', {
        template: 'estimator',
      });
      queryClient.setQueryData(['home-dashboard'], data);
      const layoutList = Array.isArray(data.layout) ? data.layout : [];
      const widgetsList = Array.isArray(data.widgets) ? data.widgets : [];
      setLayout(sanitizeLayout(migrateLayoutTo8Col(layoutList as LayoutItem[])));
      setWidgets(widgetsList as WidgetDef[]);
      toast.success('Estimator template applied');
    } catch {
      toast.error('Failed to apply template');
    }
  }, [confirm, queryClient]);

  const handleDoneEdit = useCallback(() => {
    setIsEditMode(false);
    saveDashboard(layout, widgets);
  }, [layout, widgets, saveDashboard]);

  const handleCancelEdit = useCallback(() => {
    const saved = queryClient.getQueryData(['home-dashboard']) as HomeDashboardState | undefined;
    if (saved != null && saved.layout != null && saved.widgets != null) {
      const rawLayout = saved.layout;
      const rawWidgets = saved.widgets;
      const layoutList = Array.isArray(rawLayout) ? rawLayout : (typeof rawLayout === 'string' ? (() => { try { const p = JSON.parse(rawLayout); return Array.isArray(p) ? p : []; } catch { return []; } })() : []);
      const widgetsList = Array.isArray(rawWidgets) ? rawWidgets : (typeof rawWidgets === 'string' ? (() => { try { const p = JSON.parse(rawWidgets); return Array.isArray(p) ? p : []; } catch { return []; } })() : []);
      setLayout(sanitizeLayout(layoutList as LayoutItem[]));
      setWidgets(widgetsList as WidgetDef[]);
    }
    setIsEditMode(false);
    setConfigWidgetId(null);
  }, [queryClient]);

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
    <div className="max-w-[1600px] mx-auto space-y-4">
      {/* Title Bar - same as Overview (personal) */}
      <div className="rounded-xl border bg-white p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 flex-1">
            <div>
              <div className="text-xl font-semibold text-gray-900">My Dashboard</div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">Today</div>
            <div className="text-xs font-semibold text-gray-700 mt-0.5">{todayLabel}</div>
          </div>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-start gap-2">
          {isEditMode ? (
            <>
              <button
                type="button"
                onClick={() => setAddModalOpen(true)}
                className="px-3 py-2 rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 text-sm font-medium"
              >
                Add Widget
              </button>
              {showTemplatesMenu && (
                <div className="relative" ref={templatesMenuRef}>
                  <button
                    type="button"
                    onClick={() => setTemplatesMenuOpen((o) => !o)}
                    className="px-3 py-2 rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 text-sm font-medium inline-flex items-center gap-1"
                    aria-expanded={templatesMenuOpen}
                    aria-haspopup="true"
                  >
                    Templates
                    <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {templatesMenuOpen && (
                    <div
                      className="absolute left-0 mt-1 min-w-[10rem] rounded-lg border border-gray-200 bg-white py-1 shadow-lg z-20"
                      role="menu"
                    >
                      <button
                        type="button"
                        role="menuitem"
                        className="w-full text-left px-3 py-2 text-sm text-gray-800 hover:bg-gray-50"
                        onClick={() => void handleApplyEstimatorTemplate()}
                      >
                        Estimator
                      </button>
                    </div>
                  )}
                </div>
              )}
              <button
                type="button"
                onClick={handleReset}
                className="px-3 py-2 rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 text-sm font-medium"
              >
                Reset to default
              </button>
              <button
                type="button"
                onClick={handleCancelEdit}
                className="px-3 py-2 rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 text-sm font-medium"
              >
                Cancel
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

      {visibleWidgets.length === 0 ? (
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
        layout={visibleLayout}
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
        {visibleWidgets.map((widget) => (
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
        me={me}
        activeBusinessLine={activeBusinessLine}
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
