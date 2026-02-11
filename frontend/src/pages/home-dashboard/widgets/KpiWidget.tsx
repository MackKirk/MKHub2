import { useQuery } from '@tanstack/react-query';
import FadeInOnMount from '@/components/FadeInOnMount';
import LoadingOverlay from '@/components/LoadingOverlay';
import { useAnimationReady } from '@/contexts/AnimationReadyContext';
import { api } from '@/lib/api';

type DashboardResponse = {
  total_opportunities: number;
  total_projects: number;
  total_estimated_value: number;
  total_actual_value: number;
};

type DateFilter = 'all' | 'last_year' | 'last_6_months' | 'last_3_months' | 'last_month' | 'custom';

const PERIOD_LABELS: Record<DateFilter, string> = {
  all: 'All time',
  last_year: 'Last year',
  last_6_months: 'Last 6 months',
  last_3_months: 'Last 3 months',
  last_month: 'Last month',
  custom: 'Custom',
};

function getDateRange(period: DateFilter, customStart?: string, customEnd?: string): { date_from?: string; date_to?: string } {
  if (period === 'custom' && customStart && customEnd) {
    return { date_from: customStart, date_to: customEnd };
  }
  if (period === 'all') return {};
  const now = new Date();
  const dateTo = now.toISOString().split('T')[0];
  let dateFrom: string;
  switch (period) {
    case 'last_year':
      dateFrom = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate()).toISOString().split('T')[0];
      break;
    case 'last_6_months':
      dateFrom = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      break;
    case 'last_3_months':
      dateFrom = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      break;
    case 'last_month':
      dateFrom = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      break;
    default:
      return {};
  }
  return { date_from: dateFrom, date_to: dateTo };
}

type KpiWidgetProps = {
  config?: {
    metric?: 'opportunities' | 'projects' | 'estimated_value' | 'actual_value';
    period?: DateFilter;
    customStart?: string;
    customEnd?: string;
    division_id?: string;
    mode?: 'quantity' | 'value';
    status_labels?: string[];
  };
};

export function KpiWidget({ config }: KpiWidgetProps) {
  const { ready } = useAnimationReady();
  const metric = config?.metric ?? 'opportunities';
  const period = (config?.period as DateFilter) ?? 'all';
  const divisionId = config?.division_id;
  const mode = config?.mode ?? 'quantity';
  const statusLabels = config?.status_labels;
  const { date_from, date_to } = getDateRange(period, config?.customStart, config?.customEnd);

  const isOpportunityMetric = metric === 'opportunities' || metric === 'estimated_value';
  const statusParam = statusLabels && statusLabels.length > 0
    ? (isOpportunityMetric ? 'opportunity_status_labels' : 'project_status_labels')
    : null;

  const { data, isLoading, error } = useQuery<DashboardResponse>({
    queryKey: ['home-kpi', metric, period, divisionId, date_from, date_to, mode, statusLabels],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (divisionId) params.set('division_id', divisionId);
      if (date_from) params.set('date_from', date_from);
      if (date_to) params.set('date_to', date_to);
      params.set('mode', mode);
      if (statusParam && statusLabels) {
        statusLabels.forEach((l) => params.append(statusParam, l));
      }
      return api('GET', `/projects/business/dashboard?${params.toString()}`);
    },
    staleTime: 60_000,
  });

  const periodLabel = period === 'custom' && config?.customStart && config?.customEnd
    ? `${String(config.customStart)} – ${String(config.customEnd)}`
    : PERIOD_LABELS[period] ?? 'All time';
  const statusLabel = statusLabels && statusLabels.length > 0 ? statusLabels.join(', ') : null;
  const filterParts = [periodLabel];
  if (statusLabel) filterParts.push(statusLabel);
  const chartSubtitle = filterParts.join(' · ');
  const Subtitle = () => (
    <p className="text-gray-500 shrink-0 text-[10px]" style={{ fontSize: 'clamp(0.5rem, 4cqh, 0.625rem)', marginBottom: 'clamp(0.125rem, 1cqh, 0.25rem)' }} aria-hidden>{chartSubtitle}</p>
  );

  if (isLoading) {
    return (
      <div className="flex flex-col min-h-0 h-full w-full">
        <Subtitle />
        <LoadingOverlay isLoading minHeight="min-h-[120px]" className="flex-1 min-h-0">
          <div className="min-h-[120px]" />
        </LoadingOverlay>
      </div>
    );
  }
  if (error) return <div className="flex flex-col min-h-0 h-full w-full"><Subtitle /><div className="flex-1 min-h-0 flex items-center justify-center text-sm text-red-500">Failed to load</div></div>;

  let value: number;
  let formatter: (n: number) => string = (n) => String(n);

  switch (metric) {
    case 'opportunities':
      value = data?.total_opportunities ?? 0;
      break;
    case 'projects':
      value = data?.total_projects ?? 0;
      break;
    case 'estimated_value':
      value = data?.total_estimated_value ?? 0;
      formatter = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
      break;
    case 'actual_value':
      value = data?.total_actual_value ?? 0;
      formatter = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
      break;
    default:
      value = 0;
  }

  return (
    <FadeInOnMount enabled={ready} className="flex flex-col min-h-0 h-full w-full">
      <Subtitle />
      <div className="flex-1 min-h-0 flex items-center justify-center overflow-hidden min-w-0">
        <div className="flex items-center min-w-0 w-full" style={{ gap: 'clamp(0.25rem, 1.5cqh, 0.5rem)' }}>
          <div
            className="rounded-full shrink-0 bg-brand-red/30 self-stretch min-h-[1rem]"
            style={{ width: 'clamp(2px, 0.4cqw, 5px)' }}
            aria-hidden
          />
          <div
            className="font-bold text-gray-900 tabular-nums truncate min-w-0 text-lg leading-none"
            style={{ fontSize: 'clamp(0.75rem, 22cqh, 2.75rem)' }}
          >
            {formatter(value)}
          </div>
        </div>
      </div>
    </FadeInOnMount>
  );
}
