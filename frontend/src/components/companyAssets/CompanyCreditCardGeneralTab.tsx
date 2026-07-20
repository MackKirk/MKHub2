import type { ReactNode } from 'react';
import { expiryLabel } from '@/lib/companyCreditCardExpiry';
import {
  formatCorporateCardStatus,
  getCorporateCardStatusBadgeVariant,
} from '@/lib/companyCreditCardUi';
import type { CompanyCreditCardEditSection } from '@/components/companyAssets/EditCompanyCreditCardModal';
import {
  AppBadge,
  AppCard,
  AppHeroEditButton,
  AppSectionHeader,
  appSectionPresetProps,
  uiCx,
  uiSpacing,
  uiTypography,
} from '@/components/ui';

const EM_DASH = '\u2014';

const NETWORK_LABEL: Record<string, string> = {
  visa: 'Visa',
  mastercard: 'Mastercard',
  amex: 'Amex',
  other: 'Other',
};

type CardRecord = {
  label: string;
  network: string;
  last_four: string;
  expiry_month: number;
  expiry_year: number;
  cardholder_name?: string | null;
  issuer?: string | null;
  billing_entity?: string | null;
  status: string;
  notes?: string | null;
};

function ReadOnlyField({ label, value }: { label: ReactNode; value?: ReactNode }) {
  const display =
    value === null || value === undefined || (typeof value === 'string' && !value.trim()) ? EM_DASH : value;
  return (
    <div className="space-y-1">
      <div className={uiTypography.controlLabel}>{label}</div>
      <div className={uiCx(uiTypography.helper, 'break-words font-medium text-gray-900')}>{display}</div>
    </div>
  );
}

type Props = {
  card: CardRecord;
  canEdit?: boolean;
  onEditSection: (section: CompanyCreditCardEditSection) => void;
};

export function CompanyCreditCardGeneralTab({ card, canEdit = true, onEditSection }: Props) {
  const networkKey = (card.network || 'other').toLowerCase();

  return (
    <div className={uiSpacing.sectionStack}>
      <AppCard>
        <AppSectionHeader
          title="Card record"
          description="Last four digits and expiry only — never store full PAN or CVV."
          {...appSectionPresetProps('basicInformation')}
          action={
            canEdit ? (
              <AppHeroEditButton title="Edit card record" onClick={() => onEditSection('card')} />
            ) : undefined
          }
        />
        <div className={uiCx('mt-4 grid gap-4 md:grid-cols-2')}>
          <ReadOnlyField label="Internal label" value={card.label} />
          <div className="space-y-1">
            <div className={uiTypography.controlLabel}>Status</div>
            <AppBadge variant={getCorporateCardStatusBadgeVariant(card.status)} className="!normal-case">
              {formatCorporateCardStatus(card.status)}
            </AppBadge>
          </div>
          <ReadOnlyField label="Network" value={NETWORK_LABEL[networkKey] || card.network} />
          <ReadOnlyField label="Last four digits" value={`•••• ${card.last_four}`} />
          <ReadOnlyField label="Expiry" value={expiryLabel(card.expiry_month, card.expiry_year)} />
          <ReadOnlyField label="Name on card" value={card.cardholder_name} />
          <ReadOnlyField label="Issuer / bank" value={card.issuer} />
          <ReadOnlyField label="Billing entity" value={card.billing_entity} />
        </div>
      </AppCard>

      <AppCard>
        <AppSectionHeader
          title="Notes"
          description="Internal notes for this corporate card."
          {...appSectionPresetProps('description')}
          action={
            canEdit ? (
              <AppHeroEditButton title="Edit notes" onClick={() => onEditSection('notes')} />
            ) : undefined
          }
        />
        <div className={uiCx(uiTypography.helper, 'mt-4 whitespace-pre-wrap break-words font-medium text-gray-900')}>
          {card.notes?.trim() ? card.notes : EM_DASH}
        </div>
      </AppCard>
    </div>
  );
}
