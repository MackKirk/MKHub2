import { useState, useMemo } from 'react';
import { getWidgetMeta } from './widgetRegistry';
import { GALLERY_ITEMS, GALLERY_TABS } from './galleryConfig';
import { getChartMetricLabel } from './widgets/chartShared';
import type { GalleryItem } from './galleryConfig';
import type { WidgetDef } from './types';
import type { LayoutItem } from './types';

type AddWidgetModalProps = {
  open: boolean;
  onClose: () => void;
  onAdd: (widget: WidgetDef, layoutItem: LayoutItem) => void;
  existingLayout: LayoutItem[];
};

const TAB_LABELS: Record<(typeof GALLERY_TABS)[number], string> = {
  KPIs: 'KPIs',
  Charts: 'Charts',
  Lists: 'Lists',
  Shortcuts: 'Shortcuts',
  Calendar: 'Calendar',
};

// Dashboard colors: Opportunities = green, Projects = blue (same as /business)
const CHART_COLORS = {
  opportunities: {
    bar: '#14532d',
    pie: ['#14532d', '#166534', '#15803d', '#22c55e'],
    line: '#14532d',
  },
  projects: {
    bar: '#0b1739',
    pie: ['#0b1739', '#0f2a5a', '#1d4ed8', '#2563eb'],
    line: '#1d4ed8',
  },
} as const;

// Pie slice path helper (donut uses annular arc)
const pieSlicePath = (cx: number, cy: number, rOut: number, rIn: number, startDeg: number, endDeg: number) => {
  const rad = (d: number) => ((d - 90) * Math.PI) / 180;
  const x1 = cx + rOut * Math.cos(rad(startDeg));
  const y1 = cy + rOut * Math.sin(rad(startDeg));
  const x2 = cx + rOut * Math.cos(rad(endDeg));
  const y2 = cy + rOut * Math.sin(rad(endDeg));
  const x3 = cx + rIn * Math.cos(rad(endDeg));
  const y3 = cy + rIn * Math.sin(rad(endDeg));
  const x4 = cx + rIn * Math.cos(rad(startDeg));
  const y4 = cy + rIn * Math.sin(rad(startDeg));
  const large = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${x1} ${y1} A ${rOut} ${rOut} 0 ${large} 1 ${x2} ${y2} L ${x3} ${y3} A ${rIn} ${rIn} 0 ${large} 0 ${x4} ${y4} Z`;
};

function MiniBarChart({ variant }: { variant: 'opportunities' | 'projects' }) {
  const values = [35, 60, 45, 75, 50, 65];
  const max = Math.max(...values);
  const color = CHART_COLORS[variant].bar;
  return (
    <div className="flex items-end gap-1 h-11 w-full px-1">
      {values.map((v, i) => (
        <div
          key={i}
          className="flex-1 min-w-[4px] rounded-t transition-all"
          style={{ height: `${(v / max) * 100}%`, minHeight: 6, backgroundColor: color }}
        />
      ))}
    </div>
  );
}

function MiniPieChart({ variant }: { variant: 'opportunities' | 'projects' }) {
  const cx = 24; const cy = 24; const r = 20;
  const slices = [{ start: 0, end: 100 }, { start: 100, end: 180 }, { start: 180, end: 260 }, { start: 260, end: 360 }];
  const colors = CHART_COLORS[variant].pie;
  const path = (s: number, e: number) => {
    const x1 = cx + r * Math.cos(((s - 90) * Math.PI) / 180);
    const y1 = cy + r * Math.sin(((s - 90) * Math.PI) / 180);
    const x2 = cx + r * Math.cos(((e - 90) * Math.PI) / 180);
    const y2 = cy + r * Math.sin(((e - 90) * Math.PI) / 180);
    const large = e - s > 180 ? 1 : 0;
    return `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`;
  };
  return (
    <svg viewBox="0 0 48 48" className="w-12 h-12 shrink-0" aria-hidden>
      {slices.map((s, i) => (
        <path key={i} d={path(s.start, s.end)} fill={colors[i]} stroke="white" strokeWidth={0.5} />
      ))}
    </svg>
  );
}

function MiniDonutChart({ variant }: { variant: 'opportunities' | 'projects' }) {
  const cx = 24; const cy = 24; const rOut = 20; const rIn = 10;
  const slices = [{ start: 0, end: 90 }, { start: 90, end: 180 }, { start: 180, end: 260 }, { start: 260, end: 360 }];
  const colors = CHART_COLORS[variant].pie;
  return (
    <svg viewBox="0 0 48 48" className="w-12 h-12 shrink-0" aria-hidden>
      {slices.map((s, i) => (
        <path key={i} d={pieSlicePath(cx, cy, rOut, rIn, s.start, s.end)} fill={colors[i]} stroke="white" strokeWidth={0.5} />
      ))}
    </svg>
  );
}

function MiniLineChart({ variant }: { variant: 'opportunities' | 'projects' }) {
  const pts = [35, 25, 45, 30, 50, 40];
  const w = 80; const h = 36;
  const path = pts.map((v, i) => {
    const x = 8 + (i / (pts.length - 1)) * (w - 16);
    const y = h - 6 - (v / 60) * (h - 12);
    return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
  }).join(' ');
  const stroke = CHART_COLORS[variant].line;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-11 shrink-0" preserveAspectRatio="xMidYMid meet" aria-hidden>
      <path d={path} fill="none" stroke={stroke} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function GalleryCard({
  item,
  onSelect,
}: {
  item: GalleryItem;
  onSelect: () => void;
}) {
  const isKpi = item.category === 'KPIs';
  const isChart = item.category === 'Charts';
  const isList = item.category === 'Lists';
  const isShortcut = item.category === 'Shortcuts';
  const isCalendar = item.category === 'Calendar';

  return (
    <button
      type="button"
      onClick={onSelect}
      className="w-full text-left rounded-xl border-2 border-gray-200 bg-white p-4 shadow-sm transition-all duration-150 hover:border-brand-red hover:shadow-md hover:bg-gray-50/50 active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-brand-red focus:ring-offset-2"
    >
      {isKpi && (
        <>
          <div className="flex items-start justify-between gap-2">
            <span className="text-2xl" aria-hidden>{item.icon}</span>
          </div>
          <div className="mt-2 font-medium text-gray-800">{item.label}</div>
          <p className="mt-0.5 text-xs text-gray-500 line-clamp-2">{item.description}</p>
        </>
      )}
      {isChart && (() => {
        const chartVariant =
          (item.config?.metric as string)?.includes('opportunities') ? 'opportunities' : 'projects';
        return (
          <>
            <div className="flex items-center justify-center h-14 mb-2">
              {item.chartType === 'bar' && <MiniBarChart variant={chartVariant} />}
              {item.chartType === 'pie' && <MiniPieChart variant={chartVariant} />}
              {item.chartType === 'donut' && <MiniDonutChart variant={chartVariant} />}
              {item.chartType === 'line' && <MiniLineChart variant={chartVariant} />}
            </div>
            <div className="font-medium text-gray-800">{item.label}</div>
            <p className="mt-0.5 text-xs text-gray-500 line-clamp-2">{item.description}</p>
          </>
        );
      })()}
      {isList && (
        <>
          <div className="flex items-start justify-between gap-2">
            <span className="text-2xl" aria-hidden>{item.icon ?? '📋'}</span>
          </div>
          <div className="mt-2 font-medium text-gray-800">{item.label}</div>
          <p className="mt-0.5 text-xs text-gray-500 line-clamp-2">{item.description}</p>
        </>
      )}
      {isShortcut && (
        <>
          <div className="flex flex-col items-center justify-center gap-2">
            <span className="flex items-center justify-center w-14 h-14 text-3xl shrink-0" aria-hidden>
              {item.icon}
            </span>
            <span className="font-medium text-gray-800 text-center text-sm">{item.label}</span>
          </div>
        </>
      )}
      {isCalendar && (
        <>
          <div className="flex flex-col items-center justify-center gap-2">
            <span className="flex items-center justify-center w-14 h-14 text-3xl shrink-0" aria-hidden>
              {item.icon ?? '📅'}
            </span>
            <span className="font-medium text-gray-800 text-center text-sm">{item.label}</span>
            <p className="mt-0.5 text-xs text-gray-500 line-clamp-2">{item.description}</p>
          </div>
        </>
      )}
    </button>
  );
}

export function AddWidgetModal({ open, onClose, onAdd, existingLayout }: AddWidgetModalProps) {
  const [activeTab, setActiveTab] = useState<(typeof GALLERY_TABS)[number]>('KPIs');

  const itemsByTab = useMemo(() => {
    return GALLERY_ITEMS.filter((item) => item.category === activeTab);
  }, [activeTab]);

  const chartGroups = useMemo(() => {
    if (activeTab !== 'Charts') return null;
    const opp = itemsByTab.filter((it) => (it.config?.metric as string)?.includes('opportunities'));
    const proj = itemsByTab.filter((it) => (it.config?.metric as string)?.includes('projects'));
    const order: Array<NonNullable<GalleryItem['chartType']>> = ['bar', 'pie', 'line', 'donut'];
    const sortByType = (a: GalleryItem, b: GalleryItem) =>
      order.indexOf(a.chartType as any) - order.indexOf(b.chartType as any);
    return {
      opportunities: [...opp].sort(sortByType),
      projects: [...proj].sort(sortByType),
    };
  }, [activeTab, itemsByTab]);

  const handleSelect = (item: GalleryItem) => {
    const meta = getWidgetMeta(item.type);
    const defaultSize = meta?.defaultSize ?? { w: 2, h: 1 };
    const id =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `w-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const title =
      item.type === 'chart' && item.config?.metric
        ? getChartMetricLabel(String(item.config.metric))
        : item.label;
    const widget: WidgetDef = {
      id,
      type: item.type,
      title,
      config: { ...item.config },
    };
    const { w, h } = defaultSize;
    const maxY = existingLayout.length ? Math.max(...existingLayout.map((l) => l.y + l.h), 0) : 0;
    const layoutItem: LayoutItem = { i: id, x: 0, y: maxY, w, h };
    onAdd(widget, layoutItem);
    onClose();
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden border border-gray-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header - same style as Create Request */}
        <div className="p-4 border-b border-gray-200 flex-shrink-0">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-brand-red/10 flex items-center justify-center">
                <svg className="w-5 h-5 text-brand-red" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </div>
              <div>
                <h2 className="text-sm font-semibold text-gray-900">Add Widget</h2>
                <p className="text-xs text-gray-500 mt-0.5">Choose a widget to add to your dashboard. Click any card to add it.</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-2xl font-bold text-gray-400 hover:text-gray-600 w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors"
            >
              ×
            </button>
          </div>
        </div>

        <div className="border-b border-gray-200 shrink-0">
          <nav className="flex gap-0 px-4" role="tablist">
            {GALLERY_TABS.map((tab) => (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={activeTab === tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-3 text-xs font-medium border-b-2 transition-colors -mb-px ${
                  activeTab === tab
                    ? 'border-brand-red text-brand-red'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {TAB_LABELS[tab]}
              </button>
            ))}
          </nav>
        </div>

        <div className="flex-1 overflow-auto p-4 min-h-0">
          {itemsByTab.length === 0 ? (
            <p className="text-xs text-gray-500 py-8 text-center">
              No widgets in this category.
            </p>
          ) : (
            <>
              {activeTab === 'Charts' && chartGroups ? (
                <div className="space-y-6">
                  <div>
                    <div className="text-xs font-semibold text-gray-700 mb-2">Opportunities</div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                      {chartGroups.opportunities.map((item) => (
                        <GalleryCard key={item.id} item={item} onSelect={() => handleSelect(item)} />
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-gray-700 mb-2">Projects</div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                      {chartGroups.projects.map((item) => (
                        <GalleryCard key={item.id} item={item} onSelect={() => handleSelect(item)} />
                      ))}
                    </div>
                  </div>
                </div>
              ) : activeTab === 'Shortcuts' ? (
                <div className="grid grid-cols-4 sm:grid-cols-4 gap-3">
                  {itemsByTab.map((item) => (
                    <GalleryCard key={item.id} item={item} onSelect={() => handleSelect(item)} />
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  {itemsByTab.map((item) => (
                    <GalleryCard key={item.id} item={item} onSelect={() => handleSelect(item)} />
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        <div className="p-4 border-t border-gray-200 bg-gray-50/50 flex items-center justify-end gap-2 flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors text-xs font-medium"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
