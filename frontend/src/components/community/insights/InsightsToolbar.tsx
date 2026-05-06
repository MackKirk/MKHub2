import { useEffect, useMemo, useState } from 'react';

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

/**
 * Sticky toolbar for the Insights page: preset chips on the left, optional
 * custom date inputs (only when Custom is selected), and the Export action on
 * the right. Brand-red accent for the active preset matches CommunityPageHeader.
 */
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
  // Local mirror of the date inputs so the typed value isn't sent on every keystroke.
  const [localFrom, setLocalFrom] = useState(dateFrom);
  const [localTo, setLocalTo] = useState(dateTo);
  useEffect(() => setLocalFrom(dateFrom), [dateFrom]);
  useEffect(() => setLocalTo(dateTo), [dateTo]);

  const summary = useMemo(() => {
    if (preset === 'custom') return `${dateFrom} → ${dateTo}`;
    const found = PRESETS.find((p) => p.id === preset);
    return found ? found.label : `${dateFrom} → ${dateTo}`;
  }, [preset, dateFrom, dateTo]);

  return (
    <div className="sticky top-0 z-20 min-w-0 max-w-full">
      <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm min-w-0 max-w-full overflow-hidden">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-2 flex-wrap">
            {PRESETS.map((p) => {
              const active = p.id === preset;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => onPresetChange(p.id)}
                  className={
                    active
                      ? 'px-3 py-1.5 text-xs font-semibold rounded-full bg-brand-red text-white shadow-sm transition-colors'
                      : 'px-3 py-1.5 text-xs font-medium rounded-full text-gray-600 bg-gray-50 hover:bg-gray-100 border border-transparent transition-colors'
                  }
                >
                  {p.label}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {preset === 'custom' ? (
              <>
                <div className="flex items-center gap-1.5">
                  <label className="text-[10px] uppercase tracking-wide text-gray-500" htmlFor="insights-date-from">
                    From
                  </label>
                  <input
                    id="insights-date-from"
                    type="date"
                    value={localFrom}
                    max={localTo}
                    onChange={(e) => setLocalFrom(e.target.value)}
                    onBlur={(e) => onDateFromChange(e.target.value)}
                    className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-brand-red/40"
                  />
                </div>
                <div className="flex items-center gap-1.5">
                  <label className="text-[10px] uppercase tracking-wide text-gray-500" htmlFor="insights-date-to">
                    To
                  </label>
                  <input
                    id="insights-date-to"
                    type="date"
                    value={localTo}
                    min={localFrom}
                    onChange={(e) => setLocalTo(e.target.value)}
                    onBlur={(e) => onDateToChange(e.target.value)}
                    className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-brand-red/40"
                  />
                </div>
              </>
            ) : (
              <span className="text-xs text-gray-500 hidden sm:inline-block">{summary}</span>
            )}

            <button
              type="button"
              onClick={onRefresh}
              disabled={isRefreshing}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 transition-colors"
              title="Refresh data"
            >
              <svg
                className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v6h6M20 20v-6h-6M5 13a7 7 0 0011.95 4.95M19 11a7 7 0 00-11.95-4.95" />
              </svg>
              Refresh
            </button>

            <button
              type="button"
              onClick={onExport}
              disabled={isExporting}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 transition-colors"
              title="Export CSV"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h6l5 5v9a2 2 0 01-2 2z" />
              </svg>
              Export CSV
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
