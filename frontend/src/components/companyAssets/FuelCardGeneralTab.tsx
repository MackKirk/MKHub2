import type { ReactNode } from 'react';
import { formatDateLocal, parseApiDateForDisplay } from '@/lib/dateUtils';
import { formatFuelCardStatus, getFuelCardStatusBadgeVariant } from '@/lib/fuelCardUi';
import type { FuelCardEditSection } from '@/components/companyAssets/EditFuelCardModal';
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

type CardRecord = {
  card_number: string;
  pin: string;
  date_issued: string;
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

function formatDateIssued(dateIssued: string): string {
  const d = parseApiDateForDisplay(dateIssued);
  return d ? formatDateLocal(d) : EM_DASH;
}

type Props = {
  card: CardRecord;
  canEdit?: boolean;
  onEditSection: (section: FuelCardEditSection) => void;
};

export function FuelCardGeneralTab({ card, canEdit = true, onEditSection }: Props) {
  return (
    <div className={uiSpacing.sectionStack}>
      <AppCard>
        <AppSectionHeader
          title="Card record"
          description="Card #, PIN #, and date issued for this fuel card."
          {...appSectionPresetProps('basicInformation')}
          action={
            canEdit ? (
              <AppHeroEditButton title="Edit card record" onClick={() => onEditSection('card')} />
            ) : undefined
          }
        />
        <div className={uiCx('mt-4 grid gap-4 md:grid-cols-2')}>
          <ReadOnlyField label="Card #" value={<span className="font-mono tracking-wider">{card.card_number}</span>} />
          <ReadOnlyField label="PIN #" value={<span className="font-mono tracking-widest">{card.pin}</span>} />
          <ReadOnlyField label="Date card issued" value={formatDateIssued(card.date_issued)} />
          <div className="space-y-1">
            <div className={uiTypography.controlLabel}>Status</div>
            <AppBadge variant={getFuelCardStatusBadgeVariant(card.status)} className="!normal-case">
              {formatFuelCardStatus(card.status)}
            </AppBadge>
          </div>
        </div>
      </AppCard>

      <AppCard>
        <AppSectionHeader
          title="Notes"
          description="Internal notes for this fuel card."
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
