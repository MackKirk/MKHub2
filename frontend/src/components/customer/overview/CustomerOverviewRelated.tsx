import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { InsightsSection } from '@/components/insights';

export function CustomerOverviewRelated({
  stats,
  onViewDetails,
}: {
  stats: {
    projectsTotal: number;
    projectsAwarded: number;
    opportunitiesTotal: number;
    opportunitiesAwarded: number;
  };
  onViewDetails: () => void;
}) {
  const [open, setOpen] = useState(false);
  const total = stats.projectsTotal + stats.opportunitiesTotal;
  if (total === 0) return null;

  return (
    <InsightsSection
      title="Related participation"
      subtitle="Where this customer appears as related (not owner)"
      actions={
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-1 text-xs text-gray-600 hover:text-gray-900"
        >
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          {open ? 'Collapse' : 'Expand'}
        </button>
      }
      bodyClassName="p-4"
    >
      <div className="flex flex-wrap gap-6 text-sm">
        <div>
          <span className="text-gray-500">Projects:</span>{' '}
          <span className="font-semibold tabular-nums">{stats.projectsTotal}</span>
          <span className="text-gray-500 text-xs ml-1">({stats.projectsAwarded} awarded)</span>
        </div>
        <div>
          <span className="text-gray-500">Opportunities:</span>{' '}
          <span className="font-semibold tabular-nums">{stats.opportunitiesTotal}</span>
          <span className="text-gray-500 text-xs ml-1">({stats.opportunitiesAwarded} awarded)</span>
        </div>
        <button type="button" onClick={onViewDetails} className="text-xs font-medium text-brand-red hover:underline">
          View all →
        </button>
      </div>
      {open ? (
        <p className="text-xs text-gray-500 mt-3">
          Related memberships track when this customer is tied to work owned by another account.
        </p>
      ) : null}
    </InsightsSection>
  );
}
