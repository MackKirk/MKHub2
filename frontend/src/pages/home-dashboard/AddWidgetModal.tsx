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
};

// Dashboard colors: Opportunities = green, Projects = blue (same as /business)
const CHART_COLORS = {
  opportunities: {
    bar: '#22c55e',
    pie: ['#14532d', '#166534', '#15803d', '#22c55e'],
    line: '#14532d',
  },
  projects: {
    bar: '#1d4ed8',
    pie: ['#0b1739', '#0f2a5a', '#1d4ed8', '#2563eb'],
    line: '#1d4ed8',
  },
} as const;

function MiniBarChart({ variant }: { variant: 'opportunities' | 'projects' }) {
  const values = [40, 65, 45, 80, 55];
  const max = Math.max(...values);
  const color = CHART_COLORS[variant].bar;
  return (
    <div className="flex items-end gap-0.5 h-10 w-full">
      {values.map((v, i) => (
        <div
          key={i}
          className="flex-1 min-w-[3px] rounded-t"
          style={{ height: `${(v / max) * 100}%`, minHeight: 4, backgroundColor: color }}
        />
      ))}
    </div>
  );
}

function MiniPieChart({ variant }: { variant: 'opportunities' | 'projects' }) {
  const cx = 24;
  const cy = 24;
  const r = 20;
  const slices = [
    { start: 0, end: 100 },
    { start: 100, end: 180 },
    { start: 180, end: 260 },
    { start: 260, end: 360 },
  ];
  const colors = CHART_COLORS[variant].pie;
  const path = (s: number, e: number) => {
    const x1 = cx + r * Math.cos((s - 90) * (Math.PI / 180));
    const y1 = cy + r * Math.sin((s - 90) * (Math.PI / 180));
    const x2 = cx + r * Math.cos((e - 90) * (Math.PI / 180));
    const y2 = cy + r * Math.sin((e - 90) * (Math.PI / 180));
    const large = e - s > 180 ? 1 : 0;
    return `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`;
  };
  return (
    <svg viewBox="0 0 48 48" className="w-12 h-12 shrink-0">
      {slices.map((s, i) => (
        <path key={i} d={path(s.start, s.end)} fill={colors[i]} />
      ))}
    </svg>
  );
}

function MiniLineChart({ variant }: { variant: 'opportunities' | 'projects' }) {
  const pts = [20, 45, 30, 25, 55, 35, 70, 50];
  const path = pts.map((y, i) => `${i === 0 ? 'M' : 'L'} ${20 + i * 20} ${y}`).join(' ');
  const stroke = CHART_COLORS[variant].line;
  return (
    <svg viewBox="0 0 180 60" className="w-full h-10 shrink-0" preserveAspectRatio="none">
      <path d={path} fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
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

  return (
    <button
      type="button"
      onClick={onSelect}
      className="w-full text-left rounded-xl border-2 border-gray-200 bg-white p-4 shadow-sm transition-all duration-150 hover:border-[#7f1010] hover:shadow-md hover:bg-gray-50/50 active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-[#7f1010] focus:ring-offset-2"
    >
      {isKpi && (
        <>
          <div className="flex items-start justify-between gap-2">
            <span className="text-2xl" aria-hidden>{item.icon}</span>
            <span className="text-lg font-semibold text-gray-900 tabular-nums">{item.sampleValue ?? '—'}</span>
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
            <div className="flex items-center justify-center h-14 mb-2 bg-gray-50 rounded-lg">
              {item.chartType === 'bar' && <MiniBarChart variant={chartVariant} />}
              {item.chartType === 'pie' && <MiniPieChart variant={chartVariant} />}
              {item.chartType === 'line' && <MiniLineChart variant={chartVariant} />}
            </div>
            <div className="font-medium text-gray-800">{item.label}</div>
            <p className="mt-0.5 text-xs text-gray-500 line-clamp-2">{item.description}</p>
          </>
        );
      })()}
      {isList && (
        <>
          <div className="font-medium text-gray-800 mb-2">{item.label}</div>
          <ul className="space-y-1 text-sm text-gray-600 bg-gray-50 rounded-lg p-2 min-h-[72px]">
            {(item.mockLines ?? []).slice(0, 4).map((line, i) => (
              <li key={i} className="truncate flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-gray-400 shrink-0" />
                {line}
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-xs text-gray-500 line-clamp-1">{item.description}</p>
        </>
      )}
      {isShortcut && (
        <>
          <div className="flex items-center justify-center w-14 h-14 rounded-xl bg-[#7f1010]/10 text-3xl mb-3">
            {item.icon}
          </div>
          <div className="font-medium text-gray-800">{item.label}</div>
          <p className="mt-0.5 text-xs text-gray-500 line-clamp-2">{item.description}</p>
        </>
      )}
    </button>
  );
}

export function AddWidgetModal({ open, onClose, onAdd, existingLayout }: AddWidgetModalProps) {
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<(typeof GALLERY_TABS)[number]>('KPIs');

  const filteredBySearch = useMemo(() => {
    if (!search.trim()) return GALLERY_ITEMS;
    const q = search.trim().toLowerCase();
    return GALLERY_ITEMS.filter(
      (item) =>
        item.label.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q)
    );
  }, [search]);

  const itemsByTab = useMemo(() => {
    return filteredBySearch.filter((item) => item.category === activeTab);
  }, [filteredBySearch, activeTab]);

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
    setSearch('');
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 pt-6 pb-2 shrink-0">
          <h2 className="text-xl font-semibold text-gray-900">Add Widget</h2>
          <p className="mt-1 text-sm text-gray-500">
            Choose a widget to add to your dashboard. Click any card to add it.
          </p>
          <div className="mt-4">
            <input
              type="text"
              placeholder="Search widgets..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm placeholder:text-gray-400 focus:border-[#7f1010] focus:ring-1 focus:ring-[#7f1010]"
            />
          </div>
        </div>

        <div className="border-b border-gray-200 shrink-0">
          <nav className="flex gap-0 px-6" role="tablist">
            {GALLERY_TABS.map((tab) => (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={activeTab === tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors -mb-px ${
                  activeTab === tab
                    ? 'border-[#7f1010] text-[#7f1010]'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {TAB_LABELS[tab]}
              </button>
            ))}
          </nav>
        </div>

        <div className="flex-1 overflow-auto p-6 min-h-0">
          {itemsByTab.length === 0 ? (
            <p className="text-sm text-gray-500 py-8 text-center">
              No widgets match your search. Try a different term or clear the search.
            </p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {itemsByTab.map((item) => (
                <GalleryCard key={item.id} item={item} onSelect={() => handleSelect(item)} />
              ))}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 shrink-0 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-gray-300 text-gray-700 hover:bg-gray-50 text-sm font-medium"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
