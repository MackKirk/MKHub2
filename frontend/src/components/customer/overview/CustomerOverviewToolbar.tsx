import { useEffect, useMemo, useState } from 'react';
import type { OverviewDatePreset, OverviewDisplayMode } from './customerOverviewTypes';
import { presetToRange } from './customerOverviewUtils';

const PRESETS: Array<{ id: OverviewDatePreset; label: string }> = [
  { id: '7d', label: '7d' },
  { id: '14d', label: '14d' },
  { id: '30d', label: '30d' },
  { id: '90d', label: '90d' },
  { id: '12mo', label: '12mo' },
  { id: 'all', label: 'All' },
  { id: 'custom', label: 'Custom' },
];

export function CustomerOverviewToolbar({
  preset,
  onPresetChange,
  dateFrom,
  dateTo,
  onDateFromChange,
  onDateToChange,
  displayMode,
  onDisplayModeChange,
  onRefresh,
  isRefreshing,
}: {
  preset: OverviewDatePreset;
  onPresetChange: (p: OverviewDatePreset) => void;
  dateFrom: string;
  dateTo: string;
  onDateFromChange: (v: string) => void;
  onDateToChange: (v: string) => void;
  displayMode: OverviewDisplayMode;
  onDisplayModeChange: (m: OverviewDisplayMode) => void;
  onRefresh: () => void;
  isRefreshing?: boolean;
}) {
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
            {PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  onPresetChange(p.id);
                  if (p.id !== 'custom') {
                    const range = presetToRange(p.id);
                    if (range.date_from) onDateFromChange(range.date_from);
                    if (range.date_to) onDateToChange(range.date_to);
                    if (p.id === 'all') {
                      onDateFromChange('');
                      onDateToChange('');
                    }
                  }
                }}
                className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                  preset === p.id ? 'bg-brand-red text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {p.label}
              </button>
            ))}
            <span className="text-[11px] text-gray-500 hidden sm:inline">{summary}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2 justify-end">
            {preset === 'custom' ? (
              <div className="flex items-center gap-1.5 flex-wrap">
                <input
                  type="date"
                  value={localFrom}
                  onChange={(e) => setLocalFrom(e.target.value)}
                  onBlur={() => onDateFromChange(localFrom)}
                  className="text-xs border border-gray-200 rounded px-2 py-1"
                  aria-label="From date"
                />
                <span className="text-gray-400 text-xs">→</span>
                <input
                  type="date"
                  value={localTo}
                  onChange={(e) => setLocalTo(e.target.value)}
                  onBlur={() => onDateToChange(localTo)}
                  className="text-xs border border-gray-200 rounded px-2 py-1"
                  aria-label="To date"
                />
              </div>
            ) : null}
            <div className="flex rounded-full bg-gray-100 p-0.5">
              {(['quantity', 'value'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => onDisplayModeChange(m)}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium capitalize ${
                    displayMode === m ? 'bg-white shadow-sm text-gray-900' : 'text-gray-600'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={onRefresh}
              disabled={isRefreshing}
              className="text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              {isRefreshing ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
