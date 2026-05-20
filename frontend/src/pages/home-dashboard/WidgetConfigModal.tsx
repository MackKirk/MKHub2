import { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useBusinessLine } from '@/context/BusinessLineContext';
import type { WidgetDef } from './types';
import { getWidgetMeta } from './widgetRegistry';
import { getChartMetricLabel, CHART_PALETTE_OPTIONS, CHART_PALETTES } from './widgets/chartShared';
import {
  AppButton,
  AppDatePicker,
  AppFormModal,
  AppInput,
  AppSelect,
  uiBorders,
  uiColors,
  uiCx,
  uiLayout,
  uiRadius,
  uiSpacing,
  uiTypography,
} from '@/components/ui';
import type { MeForHomeWidgets } from './widgetVisibility';
import {
  canAccessBusinessLineForHome,
  canReadCustomersForHome,
  isShortcutItemAllowed,
  normalizeBusinessLineForHome,
} from './widgetVisibility';
import { filterStatusesForOpportunity, filterStatusesForProject } from '@/lib/projectStatusVisibility';

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
    const all = (settings?.project_statuses as { id: string; label: string; meta?: Record<string, unknown> }[]) ?? [];
    return isOpportunityMetric ? filterStatusesForOpportunity(all) : filterStatusesForProject(all);
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
      <span className={uiCx(uiTypography.controlLabel, 'mb-2 block')}>Status</span>
      <div className={uiSpacing.sectionStack}>
        <label className={uiCx(uiLayout.actionsRow, 'cursor-pointer')}>
          <input
            type="checkbox"
            checked={isAllStatus}
            onChange={toggleAllStatus}
            className="rounded border-gray-300 text-brand-red focus:ring-brand-red/40"
          />
          <span className={uiTypography.body}>All status</span>
        </label>
        {statusOptions.map((s) => {
          const label = String(s.label || '');
          const checked = selectedLabels.includes(label);
          return (
            <label key={s.id} className={uiCx(uiLayout.actionsRow, 'cursor-pointer')}>
              <input
                type="checkbox"
                checked={checked}
                onChange={() => toggleStatus(label)}
                className="rounded border-gray-300 text-brand-red focus:ring-brand-red/40"
              />
              <span className={uiTypography.body}>{label}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

const PERIOD_OPTIONS = [
  { value: 'all', label: 'All time' },
  { value: 'last_year', label: 'Last year' },
  { value: 'last_6_months', label: 'Last 6 months' },
  { value: 'last_3_months', label: 'Last 3 months' },
  { value: 'last_month', label: 'Last month' },
];

const CHART_PERIOD_OPTIONS = [
  ...PERIOD_OPTIONS,
  { value: 'custom', label: 'Custom range' },
];

const CHART_TYPE_OPTIONS = [
  { value: 'bar', label: 'Bar' },
  { value: 'pie', label: 'Pie' },
  { value: 'donut', label: 'Donut' },
  { value: 'line', label: 'Line' },
];

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
  const ctxLine = useBusinessLine();
  const { data: me } = useQuery({
    queryKey: ['me'],
    queryFn: () => api<MeForHomeWidgets>('GET', '/auth/me'),
  });

  const lineForPermissions = useMemo(() => {
    const bl = widget?.config?.business_line;
    if (typeof bl === 'string' && bl.trim()) return normalizeBusinessLineForHome(bl);
    return normalizeBusinessLineForHome(ctxLine);
  }, [widget?.config?.business_line, ctxLine]);

  const allowServicesWidgets = me !== undefined && canAccessBusinessLineForHome(me, lineForPermissions);
  const allowCustomersFilter = me !== undefined && canReadCustomersForHome(me);

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api<Record<string, unknown>>('GET', '/settings'),
    enabled: widget?.type === 'kpi',
  });

  const { data: clientsData } = useQuery({
    queryKey: ['clients', 'widget-chart-customers'],
    queryFn: () => api<{ items: { id: string; name?: string; display_name?: string }[] }>('GET', '/clients?limit=100'),
    enabled: widget?.type === 'chart' && allowCustomersFilter,
  });
  const customersList = useMemo(() => {
    const items = clientsData?.items ?? [];
    return [...items].sort((a, b) => {
      const na = (a.display_name || a.name || '').toLowerCase();
      const nb = (b.display_name || b.name || '').toLowerCase();
      return na.localeCompare(nb);
    });
  }, [clientsData?.items]);

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

  useEffect(() => {
    if (widget?.type !== 'chart' || me === undefined) return;
    if (!allowServicesWidgets && String(config.mode ?? 'quantity') === 'value') {
      setConfig((prev) => ({ ...prev, mode: 'quantity' }));
    }
  }, [widget?.type, widget?.id, allowServicesWidgets, me, config.mode]);

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
    <AppFormModal
      open
      onClose={onClose}
      title="Widget settings"
      description="Customize this widget"
      footer={
        <div className={uiCx(uiLayout.actionsRow, 'w-full justify-end')}>
          <AppButton type="button" variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </AppButton>
          <AppButton type="button" size="sm" onClick={handleSave}>
            Save
          </AppButton>
        </div>
      }
    >
      <div className={uiSpacing.sectionStack}>
          {widget.type !== 'chart' && (
            <AppInput
              label="Title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={meta?.label}
            />
          )}

          {widget.type === 'kpi' && (
            <>
              <AppSelect
                label="Period"
                value={String(config.period ?? 'all')}
                onChange={(e) => setConfig({ ...config, period: e.target.value })}
                options={PERIOD_OPTIONS}
              />
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
              <label className={uiCx(uiLayout.actionsRow, 'cursor-pointer')}>
                <input
                  type="checkbox"
                  checked={Boolean(config.related_to_me)}
                  onChange={(e) => setConfig({ ...config, related_to_me: e.target.checked })}
                  className="rounded border-gray-300 text-brand-red focus:ring-brand-red/40"
                />
                <span className={uiTypography.body}>
                  {isOpportunitiesChart
                    ? 'Show only Opportunities related to me'
                    : 'Show only Projects related to me'}
                </span>
              </label>
              {allowCustomersFilter && (
              <AppSelect
                label="Project Owner / Source"
                value={config.customer_id !== undefined && config.customer_id !== '' ? String(config.customer_id) : ''}
                onChange={(e) => setConfig({ ...config, customer_id: e.target.value || undefined })}
                placeholder="All project owners / sources"
                options={[
                  { value: '', label: 'All project owners / sources' },
                  ...customersList.map((c) => ({
                    value: c.id,
                    label: c.display_name || c.name || c.id,
                  })),
                ]}
                helperText="Filter chart by project owner / source (projects or opportunities linked to that record only)."
              />
              )}
              <AppSelect
                label="Data"
                value={validMetric}
                onChange={(e) => setConfig({ ...config, metric: e.target.value })}
                options={dataOptions}
              />
              <AppSelect
                label="Chart type"
                value={String(config.chartType ?? 'bar')}
                onChange={(e) => setConfig({ ...config, chartType: e.target.value })}
                options={CHART_TYPE_OPTIONS}
              />
              <AppSelect
                label="Period"
                value={String(config.period ?? 'all')}
                onChange={(e) => setConfig({ ...config, period: e.target.value })}
                options={CHART_PERIOD_OPTIONS}
              />
              {config.period === 'custom' && (
                <>
                  <AppDatePicker
                    label="Start date"
                    value={String(config.customStart ?? '')}
                    onChange={(e) => setConfig({ ...config, customStart: e.target.value })}
                  />
                  <AppDatePicker
                    label="End date"
                    value={String(config.customEnd ?? '')}
                    onChange={(e) => setConfig({ ...config, customEnd: e.target.value })}
                  />
                </>
              )}
              <AppSelect
                label="Display"
                value={allowServicesWidgets ? String(config.mode ?? 'quantity') : 'quantity'}
                onChange={(e) => setConfig({ ...config, mode: e.target.value })}
                options={
                  allowServicesWidgets
                    ? [
                        { value: 'quantity', label: 'Count' },
                        { value: 'value', label: 'Value' },
                      ]
                    : [{ value: 'quantity', label: 'Count' }]
                }
              />
              <div>
                <span className={uiCx(uiTypography.controlLabel, 'mb-2 block')}>Color palette</span>
                <div className={uiLayout.actionsRow}>
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
                        className={uiCx(
                          'flex items-center gap-1.5 px-2 py-1.5 transition-colors',
                          uiRadius.control,
                          isSelected
                            ? 'border-2 border-brand-red bg-brand-red/5'
                            : uiCx(uiBorders.strong, uiColors.surface, 'hover:border-gray-300'),
                        )}
                        title={opt.label}
                      >
                        <div className="flex gap-0.5">
                          {colors.slice(0, 6).map((c, i) => (
                            <span
                              key={i}
                              className="h-3 w-3 shrink-0 rounded-sm"
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
            <AppInput
              label="Number of items"
              type="number"
              min={1}
              max={20}
              value={String(Number(config.limit) || 5)}
              onChange={(e) =>
                setConfig({
                  ...config,
                  limit: Math.max(1, Math.min(20, parseInt(e.target.value, 10) || 5)),
                })
              }
            />
          )}

          {widget.type === 'shortcuts' && (
            <div>
              <span className={uiCx(uiTypography.controlLabel, 'mb-2 block')}>Shortcuts</span>
              <div className={uiSpacing.sectionStack}>
                {SHORTCUT_OPTIONS.filter((opt) => isShortcutItemAllowed(opt.id, me, lineForPermissions)).map((opt) => {
                  const items = (config.items as string[]) ?? ['tasks', 'projects', 'schedule'];
                  const checked = items.includes(opt.id);
                  return (
                    <label key={opt.id} className={uiCx(uiLayout.actionsRow, 'cursor-pointer')}>
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
                      <span className={uiTypography.body}>{opt.label}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}
      </div>
    </AppFormModal>
  );
}
