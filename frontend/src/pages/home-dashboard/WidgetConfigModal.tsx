import { useState, useEffect } from 'react';
import type { WidgetDef } from './types';
import { getWidgetMeta } from './widgetRegistry';
import { getChartMetricLabel } from './widgets/chartShared';

const SHORTCUT_OPTIONS = [
  { id: 'tasks', label: 'Tasks' },
  { id: 'projects', label: 'Projects' },
  { id: 'schedule', label: 'Schedule' },
  { id: 'quotes', label: 'Quotes' },
  { id: 'opportunities', label: 'Opportunities' },
  { id: 'customers', label: 'Customers' },
  { id: 'clock', label: 'Clock in/out' },
  { id: 'business', label: 'Dashboard' },
];

type WidgetConfigModalProps = {
  widget: WidgetDef | null;
  onClose: () => void;
  onSave: (widgetId: string, config: Record<string, unknown>, title?: string) => void;
};

export function WidgetConfigModal({ widget, onClose, onSave }: WidgetConfigModalProps) {
  const [config, setConfig] = useState<Record<string, unknown>>({});
  const [title, setTitle] = useState('');

  useEffect(() => {
    if (widget) {
      setConfig({ ...widget.config });
      const defaultTitle =
        widget.type === 'chart' && widget.config?.metric
          ? getChartMetricLabel(String(widget.config.metric))
          : getWidgetMeta(widget.type)?.label ?? '';
      setTitle(widget.title ?? defaultTitle);
    }
  }, [widget]);

  if (!widget) return null;

  const meta = getWidgetMeta(widget.type);
  const handleSave = () => {
    const savedTitle =
      widget.type === 'chart'
        ? getChartMetricLabel(String(config.metric ?? 'opportunities_by_status'))
        : title || undefined;
    onSave(widget.id, config, savedTitle);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4 max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b font-semibold text-gray-900">Widget settings</div>
        <div className="p-4 overflow-auto space-y-4">
          {widget.type !== 'chart' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                placeholder={meta?.label}
              />
            </div>
          )}

          {widget.type === 'kpi' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Metric</label>
                <select
                  value={String(config.metric ?? 'opportunities')}
                  onChange={(e) => setConfig({ ...config, metric: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                >
                  <option value="opportunities">Opportunities</option>
                  <option value="projects">Projects</option>
                  <option value="estimated_value">Estimated value</option>
                  <option value="actual_value">Actual value</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Period</label>
                <select
                  value={String(config.period ?? 'all')}
                  onChange={(e) => setConfig({ ...config, period: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                >
                  <option value="all">All time</option>
                  <option value="last_year">Last year</option>
                  <option value="last_6_months">Last 6 months</option>
                  <option value="last_3_months">Last 3 months</option>
                  <option value="last_month">Last month</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Display</label>
                <select
                  value={String(config.mode ?? 'quantity')}
                  onChange={(e) => setConfig({ ...config, mode: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                >
                  <option value="quantity">Count</option>
                  <option value="value">Value</option>
                </select>
              </div>
            </>
          )}

          {widget.type === 'chart' && (() => {
            const currentMetric = String(config.metric ?? 'opportunities_by_status');
            const isOpportunitiesChart = currentMetric.startsWith('opportunities');
            const dataOptions = isOpportunitiesChart
              ? [
                  { value: 'opportunities_by_status', label: 'Opportunities by status' },
                  { value: 'opportunities_by_division', label: 'Opportunities by division' },
                ]
              : [
                  { value: 'projects_by_status', label: 'Projects by status' },
                  { value: 'projects_by_division', label: 'Projects by division' },
                ];
            const validMetric = dataOptions.some((o) => o.value === currentMetric)
              ? currentMetric
              : dataOptions[0].value;
            return (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Data</label>
                <select
                  value={validMetric}
                  onChange={(e) => setConfig({ ...config, metric: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                >
                  {dataOptions.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Chart type</label>
                <select
                  value={String(config.chartType ?? 'bar')}
                  onChange={(e) => setConfig({ ...config, chartType: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                >
                  <option value="bar">Bar</option>
                  <option value="pie">Pie</option>
                  <option value="donut">Donut</option>
                  <option value="line">Line</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Period</label>
                <select
                  value={String(config.period ?? 'all')}
                  onChange={(e) => setConfig({ ...config, period: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                >
                  <option value="all">All time</option>
                  <option value="last_year">Last year</option>
                  <option value="last_6_months">Last 6 months</option>
                  <option value="last_3_months">Last 3 months</option>
                  <option value="last_month">Last month</option>
                  <option value="custom">Custom range</option>
                </select>
              </div>
              {config.period === 'custom' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Start date</label>
                    <input
                      type="date"
                      value={String(config.customStart ?? '')}
                      onChange={(e) => setConfig({ ...config, customStart: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">End date</label>
                    <input
                      type="date"
                      value={String(config.customEnd ?? '')}
                      onChange={(e) => setConfig({ ...config, customEnd: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    />
                  </div>
                </>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Display</label>
                <select
                  value={String(config.mode ?? 'quantity')}
                  onChange={(e) => setConfig({ ...config, mode: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                >
                  <option value="quantity">Count</option>
                  <option value="value">Value</option>
                </select>
              </div>
            </>
            );
          })()}

          {(widget.type === 'list_tasks' || widget.type === 'list_projects') && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Number of items</label>
              <input
                type="number"
                min={1}
                max={20}
                value={Number(config.limit) || 5}
                onChange={(e) => setConfig({ ...config, limit: Math.max(1, Math.min(20, parseInt(e.target.value, 10) || 5)) })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
          )}

          {widget.type === 'shortcuts' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Shortcuts</label>
              <div className="space-y-2">
                {SHORTCUT_OPTIONS.map((opt) => {
                  const items = (config.items as string[]) ?? ['tasks', 'projects', 'schedule', 'quotes'];
                  const checked = items.includes(opt.id);
                  return (
                    <label key={opt.id} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          const next = e.target.checked
                            ? [...items, opt.id]
                            : items.filter((x) => x !== opt.id);
                          setConfig({ ...config, items: next.length ? next : ['tasks'] });
                        }}
                        className="rounded border-gray-300"
                      />
                      <span className="text-sm">{opt.label}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}
        </div>
        <div className="p-3 border-t flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50">
            Cancel
          </button>
          <button type="button" onClick={handleSave} className="px-4 py-2 rounded-lg bg-[#7f1010] text-white hover:bg-[#a31414]">
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
