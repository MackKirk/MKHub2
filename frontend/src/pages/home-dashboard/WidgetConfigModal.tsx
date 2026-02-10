import { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { WidgetDef } from './types';
import { getWidgetMeta } from './widgetRegistry';
import { getChartMetricLabel, CHART_PALETTE_OPTIONS, CHART_PALETTES } from './widgets/chartShared';

const OPPORTUNITY_STATUS_LABELS = ['Prospecting', 'Sent to Customer', 'Refused'];

function KpiStatusSelector({
  config,
  setConfig,
  settings,
  metric,
}: {
  config: Record<string, unknown>;
  setConfig: (fn: (prev: Record<string, unknown>) => Record<string, unknown>) => void;
  settings: Record<string, unknown> | undefined;
  metric: string;
}) {
  const isOpportunityMetric = metric === 'opportunities' || metric === 'estimated_value';
  const statusOptions = useMemo(() => {
    const all = (settings?.project_statuses as { id: string; label: string }[]) ?? [];
    let filtered: { id: string; label: string }[];
    if (isOpportunityMetric) {
      const allowed = OPPORTUNITY_STATUS_LABELS.map((l) => l.toLowerCase().trim());
      filtered = all.filter((s) => allowed.includes(String(s.label || '').toLowerCase().trim()));
    } else {
      const excluded = OPPORTUNITY_STATUS_LABELS.map((l) => l.toLowerCase().trim());
      filtered = all.filter((s) => !excluded.includes(String(s.label || '').toLowerCase().trim()));
    }
    return filtered;
  }, [settings?.project_statuses, isOpportunityMetric]);

  const selectedLabels = (config.status_labels as string[]) ?? [];
  const isAllStatus = selectedLabels.length === 0;

  const toggleAllStatus = () => {
    setConfig((prev) => ({ ...prev, status_labels: undefined }));
  };

  const toggleStatus = (label: string) => {
    setConfig((prev) => {
      const current = (prev.status_labels as string[]) ?? [];
      const next = current.includes(label)
        ? current.filter((l) => l !== label)
        : [...current, label];
      return { ...prev, status_labels: next.length > 0 ? next : undefined };
    });
  };

  return (
    <div>
      <label className="block text-xs font-semibold text-gray-700 mb-2">Status</label>
      <div className="space-y-2">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={isAllStatus}
            onChange={toggleAllStatus}
            className="rounded border-gray-300 text-brand-red focus:ring-brand-red/40"
          />
          <span className="text-sm">All status</span>
        </label>
        {statusOptions.map((s) => {
          const label = String(s.label || '');
          const checked = selectedLabels.includes(label);
          return (
            <label key={s.id} className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={checked}
                onChange={() => toggleStatus(label)}
                className="rounded border-gray-300 text-brand-red focus:ring-brand-red/40"
              />
              <span className="text-sm">{label}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

const SHORTCUT_OPTIONS = [
  { id: 'tasks', label: 'Tasks' },
  { id: 'projects', label: 'Projects' },
  { id: 'schedule', label: 'Schedule' },
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
  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api<Record<string, unknown>>('GET', '/settings'),
    enabled: widget?.type === 'kpi',
  });

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
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl max-w-md w-full max-h-[90vh] overflow-hidden flex flex-col border border-gray-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header - same style as Create Request */}
        <div className="p-4 border-b border-gray-200 flex-shrink-0">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-brand-red/10 flex items-center justify-center">
                <svg className="w-5 h-5 text-brand-red" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <div>
                <h2 className="text-sm font-semibold text-gray-900">Widget settings</h2>
                <p className="text-xs text-gray-500 mt-0.5">Customize this widget</p>
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

        <div className="p-4 overflow-auto space-y-4 flex-1 min-h-0">
          {widget.type !== 'chart' && (
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-xs focus:ring-2 focus:ring-brand-red/40 focus:border-brand-red/60"
                placeholder={meta?.label}
              />
            </div>
          )}

          {widget.type === 'kpi' && (
            <>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Period</label>
                <select
                  value={String(config.period ?? 'all')}
                  onChange={(e) => setConfig({ ...config, period: e.target.value })}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-xs focus:ring-2 focus:ring-brand-red/40 focus:border-brand-red/60"
                >
                  <option value="all">All time</option>
                  <option value="last_year">Last year</option>
                  <option value="last_6_months">Last 6 months</option>
                  <option value="last_3_months">Last 3 months</option>
                  <option value="last_month">Last month</option>
                </select>
              </div>
              <KpiStatusSelector
                config={config}
                setConfig={setConfig}
                settings={settings}
                metric={String(config.metric ?? 'opportunities')}
              />
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
                <label className="block text-xs font-semibold text-gray-700 mb-1">Data</label>
                <select
                  value={validMetric}
                  onChange={(e) => setConfig({ ...config, metric: e.target.value })}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-xs focus:ring-2 focus:ring-brand-red/40 focus:border-brand-red/60"
                >
                  {dataOptions.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Chart type</label>
                <select
                  value={String(config.chartType ?? 'bar')}
                  onChange={(e) => setConfig({ ...config, chartType: e.target.value })}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-xs focus:ring-2 focus:ring-brand-red/40 focus:border-brand-red/60"
                >
                  <option value="bar">Bar</option>
                  <option value="pie">Pie</option>
                  <option value="donut">Donut</option>
                  <option value="line">Line</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Period</label>
                <select
                  value={String(config.period ?? 'all')}
                  onChange={(e) => setConfig({ ...config, period: e.target.value })}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-xs focus:ring-2 focus:ring-brand-red/40 focus:border-brand-red/60"
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
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Start date</label>
                    <input
                      type="date"
                      value={String(config.customStart ?? '')}
                      onChange={(e) => setConfig({ ...config, customStart: e.target.value })}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-xs focus:ring-2 focus:ring-brand-red/40 focus:border-brand-red/60"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">End date</label>
                    <input
                      type="date"
                      value={String(config.customEnd ?? '')}
                      onChange={(e) => setConfig({ ...config, customEnd: e.target.value })}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-xs focus:ring-2 focus:ring-brand-red/40 focus:border-brand-red/60"
                    />
                  </div>
                </>
              )}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Display</label>
                <select
                  value={String(config.mode ?? 'quantity')}
                  onChange={(e) => setConfig({ ...config, mode: e.target.value })}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-xs focus:ring-2 focus:ring-brand-red/40 focus:border-brand-red/60"
                >
                  <option value="quantity">Count</option>
                  <option value="value">Value</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-2">Color palette</label>
                <div className="flex flex-wrap gap-2">
                  {CHART_PALETTE_OPTIONS.map((opt) => {
                    const isOpp = (config.metric as string)?.startsWith?.('opportunities');
                    const defaultPalette = isOpp ? 'green' : 'cool';
                    const isSelected = String(config.palette ?? defaultPalette) === opt.value;
                    const colors = CHART_PALETTES[opt.value];
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setConfig({ ...config, palette: opt.value })}
                        className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg border-2 transition-colors ${
                          isSelected
                            ? 'border-brand-red bg-brand-red/5'
                            : 'border-gray-200 hover:border-gray-300 bg-white'
                        }`}
                        title={opt.label}
                      >
                        <div className="flex gap-0.5">
                          {colors.slice(0, 6).map((c, i) => (
                            <span
                              key={i}
                              className="w-3 h-3 rounded-sm shrink-0"
                              style={{ backgroundColor: c }}
                            />
                          ))}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
            );
          })()}

          {(widget.type === 'list_tasks' || widget.type === 'list_projects' || widget.type === 'list_opportunities') && (
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Number of items</label>
              <input
                type="number"
                min={1}
                max={20}
                value={Number(config.limit) || 5}
                onChange={(e) => setConfig({ ...config, limit: Math.max(1, Math.min(20, parseInt(e.target.value, 10) || 5)) })}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-xs focus:ring-2 focus:ring-brand-red/40 focus:border-brand-red/60"
              />
            </div>
          )}

          {widget.type === 'shortcuts' && (
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-2">Shortcuts</label>
              <div className="space-y-2">
                {SHORTCUT_OPTIONS.map((opt) => {
                  const items = (config.items as string[]) ?? ['tasks', 'projects', 'schedule'];
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
                        className="rounded border-gray-300 text-brand-red focus:ring-brand-red/40"
                      />
                      <span className="text-sm">{opt.label}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}
        </div>
        <div className="p-4 border-t border-gray-200 bg-gray-50/50 flex items-center justify-end gap-2 flex-shrink-0">
          <button type="button" onClick={onClose} className="px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors text-xs font-medium">
            Cancel
          </button>
          <button type="button" onClick={handleSave} className="px-3 py-2 rounded-lg bg-brand-red text-white hover:opacity-90 transition-colors text-xs font-medium">
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
