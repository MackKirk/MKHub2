import { AppCard, uiCx, uiSpacing, uiTypography } from '@/components/ui';

type Props = {
  label: string;
  value: string;
  onClick?: () => void;
};

export function WarrantySummaryKpiCard({ label, value, onClick }: Props) {
  const card = (
    <AppCard
      className={uiCx(
        'h-full min-w-0',
        onClick && 'transition-all hover:border-brand-red/40 hover:shadow-sm',
      )}
      bodyClassName={uiSpacing.compactCardPadding}
    >
      <div className={uiCx(uiTypography.overline, 'truncate')}>{label}</div>
      <div className="mt-1 truncate text-sm font-semibold tabular-nums text-gray-900">{value}</div>
    </AppCard>
  );

  if (!onClick) return card;

  return (
    <button type="button" onClick={onClick} className="min-w-0 text-left">
      {card}
    </button>
  );
}
