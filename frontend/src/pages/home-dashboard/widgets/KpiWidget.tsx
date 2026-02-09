import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

type DashboardResponse = {
  total_opportunities: number;
  total_projects: number;
  total_estimated_value: number;
  total_actual_value: number;
};

type DateFilter = 'all' | 'last_year' | 'last_6_months' | 'last_3_months' | 'last_month' | 'custom';

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
  };
};

export function KpiWidget({ config }: KpiWidgetProps) {
  const metric = config?.metric ?? 'opportunities';
  const period = (config?.period as DateFilter) ?? 'all';
  const divisionId = config?.division_id;
  const mode = config?.mode ?? 'quantity';
  const { date_from, date_to } = getDateRange(period, config?.customStart, config?.customEnd);

  const { data, isLoading, error } = useQuery<DashboardResponse>({
    queryKey: ['home-kpi', metric, period, divisionId, date_from, date_to, mode],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (divisionId) params.set('division_id', divisionId);
      if (date_from) params.set('date_from', date_from);
      if (date_to) params.set('date_to', date_to);
      params.set('mode', mode);
      return api('GET', `/projects/business/dashboard?${params.toString()}`);
    },
    staleTime: 60_000,
  });

  if (isLoading) return <div className="text-sm text-gray-400">Loading…</div>;
  if (error) return <div className="text-sm text-red-500">Failed to load</div>;

  let value: number;
  let label: string;
  let formatter: (n: number) => string = (n) => String(n);

  switch (metric) {
    case 'opportunities':
      value = data?.total_opportunities ?? 0;
      label = 'Opportunities';
      break;
    case 'projects':
      value = data?.total_projects ?? 0;
      label = 'Projects';
      break;
    case 'estimated_value':
      value = data?.total_estimated_value ?? 0;
      label = 'Est. value';
      formatter = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
      break;
    case 'actual_value':
      value = data?.total_actual_value ?? 0;
      label = 'Actual value';
      formatter = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
      break;
    default:
      value = 0;
      label = '—';
  }

  return (
    <div className="flex flex-col justify-center h-full">
      <div className="text-2xl font-semibold text-gray-900">{formatter(value)}</div>
      <div className="text-xs text-gray-500 mt-0.5">{label}</div>
    </div>
  );
}
