import { Loader2 } from 'lucide-react';
import { AppButton, uiCx, uiLayout, uiTypography } from '@/components/ui';
import type { MapViewLabels } from './projectMap.types';
import { PROJECT_MAP_LABELS } from '../../lib/mapViewLabels';

type Props = {
  mappedCount: number;
  unmappedCount: number;
  totalMatching: number;
  labels?: MapViewLabels;
  isFetching?: boolean;
  hasData?: boolean;
  onFitToResults: () => void;
  errorMessage?: string | null;
  onRetry?: () => void;
};

export function ProjectMapStatusBar({
  mappedCount,
  unmappedCount,
  totalMatching,
  labels = PROJECT_MAP_LABELS,
  isFetching,
  hasData,
  onFitToResults,
  errorMessage,
  onRetry,
}: Props) {
  const entitySingular = labels.entitySingular;
  const entityPlural = labels.entityPlural;
  let message = '';
  if (errorMessage) {
    message = errorMessage;
  } else if (totalMatching === 0) {
    message = labels.noMatchFilters;
  } else if (mappedCount === 0) {
    message = labels.noValidLocations;
  } else {
    message = `Showing ${mappedCount} mapped ${mappedCount === 1 ? entitySingular : entityPlural}`;
    if (unmappedCount > 0) {
      message += ` · ${unmappedCount} without a valid location`;
    }
  }

  const fetchingLabel = hasData ? 'Updating map…' : 'Loading map…';

  return (
    <div className={uiCx(uiLayout.actionsRow, 'flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-3 py-2')}>
      <p
        className={uiCx(
          uiTypography.helper,
          'flex min-w-0 items-center gap-1.5',
          errorMessage ? 'text-red-600' : undefined,
        )}
        aria-live="polite"
      >
        {isFetching ? (
          <>
            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden />
            <span>{fetchingLabel}</span>
          </>
        ) : (
          message
        )}
      </p>
      <div className="flex shrink-0 items-center gap-2">
        {errorMessage && onRetry ? (
          <AppButton type="button" variant="secondary" size="sm" onClick={onRetry}>
            Try again
          </AppButton>
        ) : null}
        {mappedCount > 0 && !errorMessage && !isFetching ? (
          <AppButton type="button" variant="secondary" size="sm" onClick={onFitToResults}>
            Fit to results
          </AppButton>
        ) : null}
      </div>
    </div>
  );
}
