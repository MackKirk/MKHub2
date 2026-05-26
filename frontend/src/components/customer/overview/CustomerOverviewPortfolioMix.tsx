import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Donut, InsightsEmptyState, InsightsSection } from '@/components/insights';
import { api } from '@/lib/api';
import type { OverviewDisplayMode } from './customerOverviewTypes';
import {
  PROJECT_STATUS_COLORS,
  buildProjectDivisionLabelMap,
  formatCurrency,
  resolveProjectDivisionLabel,
  type ProjectDivisionSetting,
} from './customerOverviewUtils';

type PortfolioRow = { status?: string; id?: string; label?: string; count: number; value: number };

const DIVISION_COLORS = ['#6366f1', '#0ea5e9', '#14b8a6', '#f59e0b', '#ec4899', '#8b5cf6'];

export function CustomerOverviewPortfolioMix({
  byStatus,
  byDivision,
  displayMode,
}: {
  byStatus: PortfolioRow[];
  byDivision: PortfolioRow[];
  displayMode: OverviewDisplayMode;
}) {
  const [view, setView] = useState<'status' | 'division'>('status');

  const { data: projectDivisions } = useQuery({
    queryKey: ['project-divisions'],
    queryFn: () => api<ProjectDivisionSetting[]>('GET', '/settings/project-divisions'),
    staleTime: 300_000,
  });

  const divisionLabelMap = useMemo(
    () => buildProjectDivisionLabelMap(projectDivisions),
    [projectDivisions],
  );

  const activeRows = useMemo(() => {
    if (view === 'status') {
      return byStatus.map((item) => ({
        id: item.status || 'Unknown',
        label: item.status || 'Unknown',
        count: item.count,
        value: item.value,
        color: PROJECT_STATUS_COLORS[item.status || ''] || '#64748b',
      }));
    }
    return byDivision.map((item, index) => {
      const rawId = String(item.id || item.label || 'unknown');
      return {
        id: rawId,
        label: resolveProjectDivisionLabel(rawId, divisionLabelMap),
        count: item.count,
        value: item.value,
        color: DIVISION_COLORS[index % DIVISION_COLORS.length],
      };
    });
  }, [view, byStatus, byDivision, divisionLabelMap]);

  const metric = displayMode === 'value' ? 'value' : 'count';
  const slices = activeRows.map((item) => ({
    id: item.id,
    label: item.label,
    value: item[metric],
    color: item.color,
  }));
  const total = slices.reduce((s, x) => s + x.value, 0);

  return (
    <InsightsSection
      title="Portfolio mix"
      subtitle={view === 'status' ? 'Projects by status' : 'Projects by division'}
      actions={
        <div className="inline-flex rounded-lg border border-gray-200 p-0.5 text-xs">
          <button
            type="button"
            onClick={() => setView('status')}
            className={`px-2 py-0.5 rounded-md ${view === 'status' ? 'bg-gray-900 text-white' : 'text-gray-600'}`}
          >
            Status
          </button>
          <button
            type="button"
            onClick={() => setView('division')}
            className={`px-2 py-0.5 rounded-md ${view === 'division' ? 'bg-gray-900 text-white' : 'text-gray-600'}`}
          >
            Division
          </button>
        </div>
      }
    >
      {total === 0 ? (
        <InsightsEmptyState title="No projects" hint="Active projects appear here regardless of period filters." />
      ) : (
        <div className="flex flex-col sm:flex-row gap-4 items-center sm:items-start">
          <Donut
            slices={slices}
            size={168}
            centerLabel={displayMode === 'value' ? formatCurrency(total) : String(total)}
            centerSubLabel="total"
            formatValue={(v, pct) =>
              displayMode === 'value' ? `${formatCurrency(v)} (${pct.toFixed(0)}%)` : `${v} (${pct.toFixed(0)}%)`
            }
          />
          <ul className="flex-1 space-y-2 text-xs min-w-0 w-full">
            {slices.map((s) => (
              <li key={s.id} className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                <span className="text-gray-600 flex-1 truncate">{s.label}</span>
                <span className="font-semibold text-gray-900 tabular-nums">
                  {displayMode === 'value' ? formatCurrency(s.value) : s.value}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </InsightsSection>
  );
}
