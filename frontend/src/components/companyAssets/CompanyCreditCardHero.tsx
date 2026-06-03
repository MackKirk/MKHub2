import { type ReactNode } from 'react';
import {
  expiryLabel,
  expiresWithinDays,
  getExpiryBadgeVariant,
  isCardExpired,
} from '@/lib/companyCreditCardExpiry';
import {
  formatCorporateCardStatus,
  getCorporateCardStatusBadgeVariant,
} from '@/lib/companyCreditCardUi';
import { AppBadge, AppCard, uiCx, uiLayout, uiTypography } from '@/components/ui';

const NETWORK_LABEL: Record<string, string> = {
  visa: 'Visa',
  mastercard: 'Mastercard',
  amex: 'Amex',
  other: 'Other',
};

export function CompanyCreditCardHeroVisual({
  network,
  lastFour,
}: {
  network: string;
  lastFour: string;
}) {
  const n = (network || 'other').toLowerCase();
  const grad =
    n === 'amex'
      ? 'from-blue-800 via-blue-900 to-slate-950'
      : n === 'mastercard'
        ? 'from-zinc-800 via-stone-900 to-neutral-950'
        : n === 'visa'
          ? 'from-slate-800 via-indigo-950 to-slate-950'
          : 'from-gray-700 via-gray-800 to-gray-950';
  const netDisplay = NETWORK_LABEL[n] || 'Card';
  return (
    <div
      className={`relative flex h-[4.75rem] w-[7.5rem] shrink-0 flex-col justify-between rounded-xl bg-gradient-to-br ${grad} p-2.5 shadow-lg shadow-black/20 ring-1 ring-white/15`}
    >
      <div className="flex items-start justify-between gap-1">
        <div className="h-5 w-8 rounded bg-gradient-to-br from-amber-100 to-amber-200/90 shadow-inner" aria-hidden />
        <span className="max-w-[4rem] truncate text-[8px] font-bold uppercase tracking-wider text-white/75">
          {netDisplay}
        </span>
      </div>
      <div className="font-mono text-[13px] font-medium tracking-[0.18em] text-white drop-shadow-sm">
        •••• {lastFour}
      </div>
    </div>
  );
}

type HeroCard = {
  label: string;
  network: string;
  last_four: string;
  expiry_month: number;
  expiry_year: number;
  status: string;
};

export function CompanyCreditCardHero({
  card,
  actions,
}: {
  card: HeroCard;
  actions?: ReactNode;
}) {
  const networkKey = (card.network || 'other').toLowerCase();
  const expired = isCardExpired(card.expiry_month, card.expiry_year);
  const expiringSoon = !expired && expiresWithinDays(card.expiry_month, card.expiry_year, 60);

  return (
    <AppCard bodyClassName="p-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 gap-4">
          <CompanyCreditCardHeroVisual network={card.network} lastFour={card.last_four} />
          <div className="min-w-0 flex-1">
            <h2 className={uiCx(uiTypography.sectionTitle, 'text-gray-900')}>{card.label}</h2>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <AppBadge variant={getCorporateCardStatusBadgeVariant(card.status)} className="!normal-case">
                {formatCorporateCardStatus(card.status)}
              </AppBadge>
              <AppBadge variant="neutral" className="!normal-case">
                {NETWORK_LABEL[networkKey] || card.network}
              </AppBadge>
              <AppBadge
                variant={getExpiryBadgeVariant(card.expiry_month, card.expiry_year)}
                className="!normal-case"
              >
                Expires {expiryLabel(card.expiry_month, card.expiry_year)}
              </AppBadge>
              {expired ? (
                <AppBadge variant="danger" className="!normal-case">
                  Expired
                </AppBadge>
              ) : null}
              {!expired && expiringSoon ? (
                <AppBadge variant="warning" className="!normal-case">
                  Renews soon
                </AppBadge>
              ) : null}
            </div>
          </div>
        </div>
        {actions ? (
          <div className={uiCx(uiLayout.actionsRow, 'shrink-0 flex-wrap items-center gap-2')}>{actions}</div>
        ) : null}
      </div>
    </AppCard>
  );
}

export function CompanyCreditCardHeroSkeleton() {
  return (
    <AppCard bodyClassName="p-4">
      <div className="flex gap-4">
        <div className="h-[4.75rem] w-[7.5rem] shrink-0 animate-pulse rounded-xl bg-gray-100" />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="h-6 w-48 animate-pulse rounded bg-gray-100" />
          <div className="h-5 w-64 animate-pulse rounded bg-gray-100" />
        </div>
      </div>
    </AppCard>
  );
}
