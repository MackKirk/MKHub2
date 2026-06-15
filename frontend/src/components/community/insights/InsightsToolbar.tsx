import { useMemo } from 'react';
import { Download, RefreshCw } from 'lucide-react';
import {
  AppButton,
  AppCard,
  AppDatePicker,
  getAppTabButtonClassName,
  uiCx,
  uiLayout,
  uiSpacing,
  uiTypography,
} from '@/components/ui';

export type DatePresetId = '7d' | '14d' | '30d' | '90d' | 'qtd' | 'custom';

const PRESETS: Array<{ id: DatePresetId; label: string }> = [
  { id: '7d', label: 'Last 7 days' },
  { id: '14d', label: 'Last 14 days' },
  { id: '30d', label: 'Last 30 days' },
  { id: '90d', label: 'Last 90 days' },
  { id: 'qtd', label: 'Quarter to date' },
  { id: 'custom', label: 'Custom' },
];

function isoLocalDate(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function presetToRange(preset: DatePresetId): { from: string; to: string } {
  const today = new Date();
  const to = isoLocalDate(today);
  if (preset === 'qtd') {
    const month = today.getMonth();
    const quarterStartMonth = month - (month % 3);
    const start = new Date(today.getFullYear(), quarterStartMonth, 1);
    return { from: isoLocalDate(start), to };
  }
  const days = preset === '7d' ? 7 : preset === '14d' ? 14 : preset === '30d' ? 30 : 90;
  const start = new Date(today);
  start.setDate(start.getDate() - (days - 1));
  return { from: isoLocalDate(start), to };
}

export function InsightsToolbar({
  preset,
  onPresetChange,
  dateFrom,
  dateTo,
  onDateFromChange,
  onDateToChange,
  onExport,
  isExporting,
  onRefresh,
  isRefreshing,
}: {
  preset: DatePresetId;
  onPresetChange: (p: DatePresetId) => void;
  dateFrom: string;
  dateTo: string;
  onDateFromChange: (v: string) => void;
  onDateToChange: (v: string) => void;
  onExport: () => void;
  isExporting?: boolean;
  onRefresh: () => void;
  isRefreshing?: boolean;
}) {
  const summary = useMemo(() => {
    if (preset === 'custom') return `${dateFrom} → ${dateTo}`;
    const found = PRESETS.find((p) => p.id === preset);
    return found ? found.label : `${dateFrom} → ${dateTo}`;
  }, [preset, dateFrom, dateTo]);

  return (
    <div className="sticky top-0 z-20 min-w-0 max-w-full">
      <AppCard bodyClassName={uiSpacing.cardPadding}>
        <div className={uiCx('flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between')}>
          <div className={uiCx(uiLayout.actionsRow, 'flex-wrap')}>
            {PRESETS.map((p) => {
              const active = p.id === preset;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => onPresetChange(p.id)}
                  className={getAppTabButtonClassName(active)}
                  aria-pressed={active}
                >
                  {p.label}
                </button>
              );
            })}
          </div>

          <div className={uiCx(uiLayout.actionsRow, 'flex-wrap items-end')}>
            {preset === 'custom' ? (
              <>
                <AppDatePicker
                  label="From"
                  value={dateFrom}
                  max={dateTo}
                  onChange={(e) => onDateFromChange(e.target.value)}
                  className="min-w-[10rem]"
                />
                <AppDatePicker
                  label="To"
                  value={dateTo}
                  min={dateFrom}
                  onChange={(e) => onDateToChange(e.target.value)}
                  className="min-w-[10rem]"
                />
              </>
            ) : (
              <span className={uiCx(uiTypography.helper, 'hidden sm:inline-block')}>{summary}</span>
            )}

            <AppButton
              type="button"
              variant="secondary"
              size="sm"
              leftIcon={<RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />}
              onClick={onRefresh}
              disabled={isRefreshing}
              title="Refresh data"
            >
              Refresh
            </AppButton>

            <AppButton
              type="button"
              variant="secondary"
              size="sm"
              leftIcon={<Download className="h-3.5 w-3.5" />}
              onClick={onExport}
              disabled={isExporting}
              title="Export CSV"
            >
              Export CSV
            </AppButton>
          </div>
        </div>
      </AppCard>
    </div>
  );
}
