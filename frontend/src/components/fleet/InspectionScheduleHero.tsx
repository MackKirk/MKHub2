import { Truck } from 'lucide-react';
import { formatDateLocal } from '@/lib/dateUtils';
import { CATEGORY_LABELS, SCHEDULE_STATUS_LABELS, URGENCY_LABELS } from '@/lib/fleetBadges';
import {
  getInspectionScheduleStatusBadgeVariant,
  getUrgencyBadgeVariant,
} from '@/lib/fleetUi';
import { FleetHeroStat } from '@/components/fleet/FleetAssetHero';
import { AppBadge, AppButton, AppCard, uiBorders, uiCx, uiRadius } from '@/components/ui';

type ScheduleHeroSchedule = {
  fleet_asset_id: string;
  fleet_asset_name?: string;
  scheduled_at: string;
  urgency: string;
  category: string;
  status: string;
  created_at?: string;
};

type ScheduleHeroAsset = {
  name?: string;
  unit_number?: string;
};

type Props = {
  schedule: ScheduleHeroSchedule;
  asset?: ScheduleHeroAsset | null;
  assetPhotoUrl: string | null;
  onViewAsset?: () => void;
};

export function InspectionScheduleHero({ schedule, asset, assetPhotoUrl, onViewAsset }: Props) {
  const vehicleLabel = asset?.unit_number || schedule.fleet_asset_name || schedule.fleet_asset_id || '—';

  return (
    <AppCard bodyClassName="p-4">
      <div className="flex items-start gap-4">
        <div className="w-48 shrink-0">
          <div className={uiCx('h-36 w-48 overflow-hidden', uiRadius.card, uiBorders.subtle, 'bg-gray-100')}>
            {assetPhotoUrl ? (
              <img src={assetPhotoUrl} alt={asset?.name || 'Vehicle'} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-gray-400">
                <Truck className="h-12 w-12" strokeWidth={1.5} aria-hidden />
              </div>
            )}
          </div>
          {schedule.fleet_asset_id && onViewAsset ? (
            <AppButton
              variant="ghost"
              size="sm"
              className="mt-2 h-auto px-0 py-0 text-brand-red hover:bg-transparent hover:underline"
              onClick={onViewAsset}
            >
              View asset
            </AppButton>
          ) : null}
        </div>
        <div className="grid min-w-0 flex-1 grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
          <FleetHeroStat label="Status">
            <AppBadge variant={getInspectionScheduleStatusBadgeVariant(schedule.status)}>
              {SCHEDULE_STATUS_LABELS[schedule.status] ?? schedule.status}
            </AppBadge>
          </FleetHeroStat>
          <FleetHeroStat label="Category">
            <span className="text-xs font-semibold text-gray-900">
              {CATEGORY_LABELS[schedule.category] ?? schedule.category}
            </span>
          </FleetHeroStat>
          <FleetHeroStat label="Urgency">
            <AppBadge variant={getUrgencyBadgeVariant(schedule.urgency)}>
              {URGENCY_LABELS[schedule.urgency] ?? schedule.urgency}
            </AppBadge>
          </FleetHeroStat>
          <FleetHeroStat label="Vehicle">
            <span className="truncate text-xs font-semibold text-gray-900" title={vehicleLabel}>
              {vehicleLabel}
            </span>
          </FleetHeroStat>
          <FleetHeroStat label="Scheduled">
            <span className="text-xs font-semibold text-gray-900">
              {formatDateLocal(new Date(schedule.scheduled_at))}
            </span>
          </FleetHeroStat>
          <FleetHeroStat label="Created">
            <span className="text-xs font-semibold text-gray-900">
              {schedule.created_at ? new Date(schedule.created_at).toLocaleDateString() : '—'}
            </span>
          </FleetHeroStat>
        </div>
      </div>
    </AppCard>
  );
}

export function InspectionScheduleHeroSkeleton() {
  return (
    <AppCard bodyClassName="p-4">
      <div className="h-36 animate-pulse rounded-lg bg-gray-100" />
    </AppCard>
  );
}
