import { useMemo, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import FleetReturnModal from '@/components/fleet/FleetReturnModal';
import EquipmentReturnModal from '@/components/companyAssets/EquipmentReturnModal';
import { fmtDate, returnStatusLabel } from './offboardingUtils';
import { AppBadge, AppButton, AppEmptyState, AppTable } from '@/components/ui';

type AssetRow = {
  id: string;
  source_type: string;
  asset_name: string;
  asset_type: string;
  assigned_since?: string | null;
  current_status: string;
  return_status: string;
  fleet_asset_id?: string | null;
  equipment_id?: string | null;
  can_start_return: boolean;
};

export default function OffboardingAssetsTab({ caseId }: { caseId: string }) {
  const queryClient = useQueryClient();
  const [fleetReturn, setFleetReturn] = useState<{
    fleetAssetId: string;
    assetName: string;
    fleetAssetType: string;
    odometerOut?: number;
  } | null>(null);
  const [equipmentReturn, setEquipmentReturn] = useState<{ equipmentId: string; name: string } | null>(null);
  const [fleetSubmitting, setFleetSubmitting] = useState(false);
  const [equipmentSubmitting, setEquipmentSubmitting] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['offboarding-assets', caseId],
    queryFn: () => api<{ items: AssetRow[] }>('GET', `/offboarding/${encodeURIComponent(caseId)}/assets`),
  });

  const rows = data?.items || [];

  const openAssignment = useMemo(
    () => ({ odometer_out: fleetReturn?.odometerOut }),
    [fleetReturn],
  );

  const handleFleetSubmit = async (payload: Record<string, unknown>) => {
    if (!fleetReturn) return;
    setFleetSubmitting(true);
    try {
      await api('POST', `/fleet/assets/${encodeURIComponent(fleetReturn.fleetAssetId)}/return`, payload);
      toast.success('Return recorded');
      setFleetReturn(null);
      await refetch();
      queryClient.invalidateQueries({ queryKey: ['offboarding', caseId] });
    } catch (e: any) {
      toast.error(e?.message || 'Return failed');
    } finally {
      setFleetSubmitting(false);
    }
  };

  const handleEquipmentSubmit = async (payload: Record<string, unknown>) => {
    if (!equipmentReturn) return;
    setEquipmentSubmitting(true);
    try {
      await api('POST', `/fleet/equipment/${encodeURIComponent(equipmentReturn.equipmentId)}/return`, payload);
      toast.success('Return recorded');
      setEquipmentReturn(null);
      await refetch();
      queryClient.invalidateQueries({ queryKey: ['offboarding', caseId] });
    } catch (e: any) {
      toast.error(e?.message || 'Return failed');
    } finally {
      setEquipmentSubmitting(false);
    }
  };

  if (isLoading) return <div className="text-sm text-gray-500 p-4">Loading assets…</div>;
  if (!rows.length) {
    return <AppEmptyState title="No assets were linked at offboarding start" />;
  }

  const tableRows = rows.map((row) => {
    const rs = row.return_status;
    const badgeVariant = rs === 'returned' ? 'success' : rs === 'pending_return' ? 'warning' : 'neutral';
    let action: ReactNode = '—';
    if (row.can_start_return && row.fleet_asset_id) {
      action = (
        <AppButton
          size="sm"
          variant="secondary"
          onClick={() =>
            setFleetReturn({
              fleetAssetId: row.fleet_asset_id!,
              assetName: row.asset_name,
              fleetAssetType: row.asset_type.toLowerCase().includes('vehicle') ? 'vehicle' : 'other',
            })
          }
        >
          Start Return
        </AppButton>
      );
    } else if (row.can_start_return && row.equipment_id) {
      action = (
        <AppButton
          size="sm"
          variant="secondary"
          onClick={() => setEquipmentReturn({ equipmentId: row.equipment_id!, name: row.asset_name })}
        >
          Start Return
        </AppButton>
      );
    } else if (row.fleet_asset_id) {
      action = (
        <Link className="text-brand-red text-xs hover:underline" to={`/fleet/assets/${encodeURIComponent(row.fleet_asset_id)}`}>
          View Return
        </Link>
      );
    } else if (row.equipment_id) {
      action = (
        <Link
          className="text-brand-red text-xs hover:underline"
          to={`/company-assets/equipment/${encodeURIComponent(row.equipment_id)}`}
        >
          View Return
        </Link>
      );
    }

    return [
      row.asset_name,
      row.asset_type,
      fmtDate(row.assigned_since),
      row.current_status,
      <AppBadge key={`${row.id}-badge`} variant={badgeVariant}>{returnStatusLabel(rs)}</AppBadge>,
      action,
    ];
  });

  return (
    <>
      <AppTable
        columns={['Asset', 'Asset Type', 'Assigned Since', 'Current Status', 'Return Status', 'Action']}
        rows={tableRows}
      />

      <FleetReturnModal
        open={!!fleetReturn}
        openAssignment={openAssignment}
        asset={{ asset_type: fleetReturn?.fleetAssetType || 'vehicle' }}
        assetDisplayName={fleetReturn?.assetName}
        onClose={() => setFleetReturn(null)}
        onSubmit={handleFleetSubmit}
        isSubmitting={fleetSubmitting}
      />

      <EquipmentReturnModal
        open={!!equipmentReturn}
        equipmentDisplayName={equipmentReturn?.name}
        onClose={() => setEquipmentReturn(null)}
        onSubmit={handleEquipmentSubmit}
        isSubmitting={equipmentSubmitting}
      />
    </>
  );
}
