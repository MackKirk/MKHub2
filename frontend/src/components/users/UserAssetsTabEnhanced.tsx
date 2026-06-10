import { useMemo, useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import { useConfirm } from '@/components/ConfirmProvider';
import {
  employeeEquipmentCheckinQuickInfo,
  employeeEquipmentCheckoutQuickInfo,
  employeeFleetReturnQuickInfo,
  employeeVehicleCheckoutQuickInfo,
  USER_ASSETS_FIELD_HINTS,
} from '@/lib/formModalQuickInfo';
import {
  AppBadge,
  AppButton,
  AppCard,
  AppDatePicker,
  AppEmptyState,
  AppFormModal,
  AppInput,
  AppListRowIconButton,
  AppSectionHeader,
  AppSelect,
  AppSortableEntityList,
  AppSortableEntityListFlatBody,
  AppSortableEntityListHeader,
  AppSortableEntityListRow,
  AppSortableEntityListSortColumn,
  AppTextarea,
  appSectionPresetProps,
  resolveAppSortableListPreset,
  sortListByAppColumn,
  uiCx,
  uiLayout,
  uiSpacing,
  uiTypography,
  useLocalAppListSort,
} from '@/components/ui';

/** Format API date/datetime for asset tables; avoids showing one calendar day early when the API stores UTC midnight for a business date. */
function formatAssetDisplayDate(iso: string | null | undefined): string {
  if (iso == null || iso === '') return '—';
  const s = String(iso).trim();
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return '—';
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, day] = s.split('-').map(Number);
    return new Date(y, m - 1, day).toLocaleDateString('en-US', { dateStyle: 'short' });
  }
  if (
    d.getUTCHours() === 0 &&
    d.getUTCMinutes() === 0 &&
    d.getUTCSeconds() === 0 &&
    d.getUTCMilliseconds() === 0
  ) {
    return d.toLocaleDateString('en-US', { timeZone: 'UTC', year: 'numeric', month: 'short', day: 'numeric' });
  }
  return d.toLocaleDateString('en-US', { dateStyle: 'short' });
}

function assetHistoryStatusBadge(status: string | null | undefined, returned?: boolean) {
  if (returned) return <AppBadge variant="success">Returned</AppBadge>;
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'active') return <AppBadge variant="info">Active</AppBadge>;
  if (normalized === 'returned') return <AppBadge variant="success">Returned</AppBadge>;
  return <AppBadge variant="neutral">{status || '—'}</AppBadge>;
}

export function UserAssetsSection({
  userId,
  canEditEquipment,
  canEditFleet,
}: {
  userId: string;
  canEditEquipment: boolean;
  canEditFleet: boolean;
}) {
  const { data: me } = useQuery({ queryKey: ['me'], queryFn: () => api<any>('GET', '/auth/me') });
  const isAdmin = useMemo(() => {
    if (!me) return false;
    return (me?.roles || []).some((r: string) => String(r || '').toLowerCase() === 'admin');
  }, [me]);
  const confirm = useConfirm();
  const { data: assetsData, refetch: refetchAssets } = useQuery({
    queryKey: ['user-assets', userId],
    queryFn: () => api<any>('GET', `/fleet/users/${encodeURIComponent(userId)}/assets`),
    enabled: !!userId,
  });
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  const [showVehicleCheckoutModal, setShowVehicleCheckoutModal] = useState(false);
  const [showCheckinModal, setShowCheckinModal] = useState(false);
  const [checkinEquipmentId, setCheckinEquipmentId] = useState<string | null>(null);
  const [returnFleetContext, setReturnFleetContext] = useState<{
    fleetAssetId: string;
    fleetAssetType: string | null;
    minOdometerIn: number | null;
    minHoursIn: number | null;
  } | null>(null);
  const [checkoutSubmitting, setCheckoutSubmitting] = useState(false);
  const [checkinSubmitting, setCheckinSubmitting] = useState(false);
  const [fleetReturnSubmitting, setFleetReturnSubmitting] = useState(false);

  const current_checkouts = assetsData?.current_checkouts ?? [];
  const current_assignments = assetsData?.current_assignments ?? [];
  const checkout_history = assetsData?.checkout_history ?? [];
  const assignment_history = assetsData?.assignment_history ?? [];

  const { data: availableEquipment, isLoading: loadingAvailable } = useQuery({
    queryKey: ['fleet-equipment-available'],
    queryFn: () => api<any>('GET', '/fleet/equipment?assigned=false&status=active&limit=100'),
    enabled: showCheckoutModal && !!userId,
  });
  const availableList = availableEquipment?.items ?? availableEquipment ?? [];

  const { data: availableFleetVehicles, isLoading: loadingFleetAvailable } = useQuery({
    queryKey: ['fleet-vehicles-unassigned'],
    queryFn: () =>
      api<any>('GET', '/fleet/assets?asset_type=vehicle&assigned=false&limit=100'),
    enabled: showVehicleCheckoutModal && !!userId,
  });
  const fleetVehicleList = availableFleetVehicles?.items ?? [];

  const handleCheckin = (equipmentId: string) => {
    setCheckinEquipmentId(equipmentId);
    setShowCheckinModal(true);
  };

  const handleFleetReturn = (
    fleetAssetId: string,
    row?: { fleet_asset_type?: string | null; odometer_out?: number | null; hours_out?: number | null },
  ) => {
    const t = row?.fleet_asset_type ?? null;
    const minOdom =
      t === 'vehicle' && row?.odometer_out != null && !Number.isNaN(Number(row.odometer_out))
        ? Number(row.odometer_out)
        : null;
    const minHrs =
      (t === 'heavy_machinery' || t === 'other') &&
      row?.hours_out != null &&
      !Number.isNaN(Number(row.hours_out))
        ? Number(row.hours_out)
        : null;
    setReturnFleetContext({
      fleetAssetId,
      fleetAssetType: t,
      minOdometerIn: minOdom,
      minHoursIn: minHrs,
    });
  };

  const handleFleetReturnSubmit = async (payload: {
    odometer_in?: number;
    hours_in?: number;
    notes_in?: string;
  }) => {
    if (!returnFleetContext) return;
    setFleetReturnSubmitting(true);
    try {
      await api('POST', `/fleet/assets/${returnFleetContext.fleetAssetId}/return`, payload);
      toast.success(
        returnFleetContext.fleetAssetType === 'vehicle' ? 'Vehicle returned' : 'Return recorded',
      );
      setReturnFleetContext(null);
      refetchAssets();
    } catch (e: any) {
      toast.error(e?.message || 'Return failed');
    } finally {
      setFleetReturnSubmitting(false);
    }
  };

  const handleDeleteCheckout = async (checkoutId: string) => {
    if (!isAdmin) return;
    const result = await confirm({
      title: 'Delete checkout?',
      message: 'This will permanently delete this checkout record. This action cannot be undone.',
      confirmText: 'Delete',
      cancelText: 'Cancel',
    });
    if (result !== 'confirm') return;
    try {
      await api('DELETE', `/fleet/equipment/checkouts/${checkoutId}`);
      toast.success('Checkout deleted');
      refetchAssets();
    } catch (e: any) {
      toast.error(e?.message || 'Failed to delete checkout');
    }
  };

  const handleDeleteAssignment = async (assignmentId: string) => {
    if (!isAdmin) return;
    const result = await confirm({
      title: 'Delete assignment?',
      message: 'This will permanently delete this assignment record. This action cannot be undone.',
      confirmText: 'Delete',
      cancelText: 'Cancel',
    });
    if (result !== 'confirm') return;
    try {
      await api('DELETE', `/fleet/assets/assignments/${assignmentId}`);
      toast.success('Assignment deleted');
      refetchAssets();
    } catch (e: any) {
      toast.error(e?.message || 'Failed to delete assignment');
    }
  };
  const handleCheckinSubmit = async (payload: { actual_return_date: string; condition_in: string; notes_in?: string }) => {
    if (!checkinEquipmentId) return;
    setCheckinSubmitting(true);
    try {
      await api('POST', `/fleet/equipment/${checkinEquipmentId}/checkin`, payload);
      toast.success('Equipment checked in');
      setShowCheckinModal(false);
      setCheckinEquipmentId(null);
      refetchAssets();
    } catch (e: any) {
      toast.error(e?.message || 'Check-in failed');
    } finally {
      setCheckinSubmitting(false);
    }
  };

  type CurrentAssetRow = {
    id: string;
    typeLabel: string;
    name: string;
    checkedOut: string | null | undefined;
    expectedReturn: string | null | undefined;
    equipmentId?: string;
    fleetAssetId?: string;
    fleetRow?: {
      fleet_asset_type?: string | null;
      odometer_out?: number | null;
      hours_out?: number | null;
    };
  };

  type HistoryAssetRow = {
    id: string;
    kind: 'checkout' | 'assignment';
    typeLabel: string;
    name: string;
    checkedOut: string | null | undefined;
    returned: string | null | undefined;
    status: string | null | undefined;
    returnedFlag: boolean;
  };

  const currentRows = useMemo<CurrentAssetRow[]>(
    () => [
      ...current_checkouts.map((c: any) => ({
        id: `checkout-${c.id}`,
        typeLabel: 'Equipment',
        name: c.equipment_name || c.equipment_id,
        checkedOut: c.checked_out_at,
        expectedReturn: c.expected_return_date,
        equipmentId: c.equipment_id,
      })),
      ...current_assignments.map((a: any) => ({
        id: `assignment-${a.id}`,
        typeLabel: a.target_type === 'fleet' ? 'Fleet' : 'Equipment',
        name: a.asset_name || a.equipment_id || a.fleet_asset_id,
        checkedOut: a.assigned_at,
        expectedReturn: a.expected_return_at,
        fleetAssetId: a.fleet_asset_id,
        fleetRow: a,
      })),
    ],
    [current_checkouts, current_assignments],
  );

  const historyRows = useMemo<HistoryAssetRow[]>(
    () => [
      ...checkout_history.map((c: any) => ({
        id: `checkout-${c.id}`,
        kind: 'checkout' as const,
        typeLabel: 'Equipment',
        name: c.equipment_name || c.equipment_id,
        checkedOut: c.checked_out_at,
        returned: c.actual_return_date,
        status: c.status,
        returnedFlag: Boolean(c.actual_return_date),
      })),
      ...assignment_history.map((a: any) => ({
        id: `assignment-${a.id}`,
        kind: 'assignment' as const,
        typeLabel: a.target_type === 'fleet' ? 'Fleet' : 'Equipment',
        name: a.asset_name || a.equipment_id || a.fleet_asset_id,
        checkedOut: a.assigned_at,
        returned: a.returned_at,
        status: a.returned_at ? 'Returned' : 'Active',
        returnedFlag: Boolean(a.returned_at),
      })),
    ],
    [checkout_history, assignment_history],
  );

  type CurrentSortColumn = 'type' | 'name' | 'checkedOut' | 'expectedReturn';
  const { sortBy: currentSortBy, sortDir: currentSortDir, setSort: setCurrentSort } =
    useLocalAppListSort<CurrentSortColumn>('checkedOut', 'desc');

  type HistorySortColumn = 'type' | 'name' | 'checkedOut' | 'returned' | 'status';
  const { sortBy: historySortBy, sortDir: historySortDir, setSort: setHistorySort } =
    useLocalAppListSort<HistorySortColumn>('checkedOut', 'desc');

  const sortedCurrentRows = useMemo(
    () =>
      sortListByAppColumn(currentRows, currentSortBy, currentSortDir, {
        type: (r) => r.typeLabel,
        name: (r) => r.name,
        checkedOut: (r) => (r.checkedOut ? Date.parse(String(r.checkedOut)) : null),
        expectedReturn: (r) => (r.expectedReturn ? Date.parse(String(r.expectedReturn)) : null),
      }),
    [currentRows, currentSortBy, currentSortDir],
  );

  const sortedHistoryRows = useMemo(
    () =>
      sortListByAppColumn(historyRows, historySortBy, historySortDir, {
        type: (r) => r.typeLabel,
        name: (r) => r.name,
        checkedOut: (r) => (r.checkedOut ? Date.parse(String(r.checkedOut)) : null),
        returned: (r) => (r.returned ? Date.parse(String(r.returned)) : null),
        status: (r) => r.status || '',
      }),
    [historyRows, historySortBy, historySortDir],
  );

  const showCurrentActions = canEditEquipment || canEditFleet;

  return (
    <div className="space-y-6 pb-24">
      <AppCard bodyClassName={uiSpacing.cardPadding}>
        <AppSectionHeader
          title="Assets"
          description="Equipment checkouts and fleet vehicles assigned to this employee."
          {...appSectionPresetProps('workload')}
          action={
            <div className={uiCx(uiLayout.actionsRow, 'gap-2')}>
              {canEditEquipment ? (
                <AppButton type="button" size="sm" onClick={() => setShowCheckoutModal(true)}>
                  Assign equipment
                </AppButton>
              ) : null}
              {canEditFleet ? (
                <AppButton type="button" variant="secondary" size="sm" onClick={() => setShowVehicleCheckoutModal(true)}>
                  Assign vehicle
                </AppButton>
              ) : null}
            </div>
          }
        />

        <div className="mt-6 space-y-6">
          <div>
            <AppSectionHeader
              title="Currently with this employee"
              description="Active equipment checkouts and fleet assignments."
            />
            <div className={uiCx('mt-3 rounded-xl border bg-white', uiSpacing.cardPadding)}>
              {currentRows.length === 0 ? (
                <AppEmptyState
                  title="No assets currently assigned"
                  className="border-0 bg-transparent p-0 py-6 shadow-none"
                />
              ) : (
                <div className="flex flex-col gap-2 overflow-x-auto">
                  <AppSortableEntityList layout="flat">
                    <AppSortableEntityListHeader preset="employeeAssetsCurrent" variant="flat">
                      <AppSortableEntityListSortColumn
                        label="Type"
                        column="type"
                        sortBy={currentSortBy}
                        sortDir={currentSortDir}
                        onSort={setCurrentSort}
                      />
                      <AppSortableEntityListSortColumn
                        label="Name"
                        column="name"
                        sortBy={currentSortBy}
                        sortDir={currentSortDir}
                        onSort={setCurrentSort}
                      />
                      <AppSortableEntityListSortColumn
                        label="Checked out"
                        column="checkedOut"
                        sortBy={currentSortBy}
                        sortDir={currentSortDir}
                        onSort={setCurrentSort}
                      />
                      <AppSortableEntityListSortColumn
                        label="Expected return"
                        column="expectedReturn"
                        sortBy={currentSortBy}
                        sortDir={currentSortDir}
                        onSort={setCurrentSort}
                      />
                      {showCurrentActions ? <div className="min-w-0 w-28" aria-hidden /> : null}
                    </AppSortableEntityListHeader>
                    <AppSortableEntityListFlatBody preset="employeeAssetsCurrent">
                      {sortedCurrentRows.map((row) => (
                        <AppSortableEntityListRow
                          key={row.id}
                          as="div"
                          variant="flat"
                          preset="employeeAssetsCurrent"
                        >
                          <span className={uiCx(uiTypography.helper, 'min-w-0 truncate text-gray-700')}>
                            {row.typeLabel}
                          </span>
                          <span className={uiCx(uiTypography.body, 'min-w-0 truncate font-semibold text-gray-900')}>
                            {row.name}
                          </span>
                          <span className={uiCx(uiTypography.helper, 'min-w-0 whitespace-nowrap text-gray-700')}>
                            {formatAssetDisplayDate(row.checkedOut)}
                          </span>
                          <span className={uiCx(uiTypography.helper, 'min-w-0 whitespace-nowrap text-gray-700')}>
                            {formatAssetDisplayDate(row.expectedReturn)}
                          </span>
                          {showCurrentActions ? (
                            <div className="flex w-28 shrink-0 items-center justify-end">
                              {canEditEquipment && row.equipmentId ? (
                                <AppButton
                                  type="button"
                                  variant="secondary"
                                  size="sm"
                                  onClick={() => handleCheckin(row.equipmentId!)}
                                >
                                  Check in
                                </AppButton>
                              ) : canEditFleet && row.fleetAssetId ? (
                                <AppButton
                                  type="button"
                                  variant="secondary"
                                  size="sm"
                                  onClick={() =>
                                    handleFleetReturn(String(row.fleetAssetId), {
                                      fleet_asset_type: row.fleetRow?.fleet_asset_type,
                                      odometer_out: row.fleetRow?.odometer_out,
                                      hours_out: row.fleetRow?.hours_out,
                                    })
                                  }
                                >
                                  Return
                                </AppButton>
                              ) : (
                                <span className={uiTypography.helper}>—</span>
                              )}
                            </div>
                          ) : null}
                        </AppSortableEntityListRow>
                      ))}
                    </AppSortableEntityListFlatBody>
                  </AppSortableEntityList>
                </div>
              )}
            </div>
          </div>

          <div>
            <AppSectionHeader title="History" description="Past equipment checkouts and fleet assignments." />
            <div className={uiCx('mt-3 rounded-xl border bg-white', uiSpacing.cardPadding)}>
              {historyRows.length === 0 ? (
                <AppEmptyState
                  title="No history yet"
                  className="border-0 bg-transparent p-0 py-6 shadow-none"
                />
              ) : (
                <div className="flex flex-col gap-2 overflow-x-auto">
                  <AppSortableEntityList layout="flat">
                    <AppSortableEntityListHeader preset="employeeAssetsHistory" variant="flat">
                      <AppSortableEntityListSortColumn
                        label="Type"
                        column="type"
                        sortBy={historySortBy}
                        sortDir={historySortDir}
                        onSort={setHistorySort}
                      />
                      <AppSortableEntityListSortColumn
                        label="Name"
                        column="name"
                        sortBy={historySortBy}
                        sortDir={historySortDir}
                        onSort={setHistorySort}
                      />
                      <AppSortableEntityListSortColumn
                        label="Checked out"
                        column="checkedOut"
                        sortBy={historySortBy}
                        sortDir={historySortDir}
                        onSort={setHistorySort}
                      />
                      <AppSortableEntityListSortColumn
                        label="Returned"
                        column="returned"
                        sortBy={historySortBy}
                        sortDir={historySortDir}
                        onSort={setHistorySort}
                      />
                      <AppSortableEntityListSortColumn
                        label="Status"
                        column="status"
                        sortBy={historySortBy}
                        sortDir={historySortDir}
                        onSort={setHistorySort}
                      />
                      {isAdmin ? <div className="min-w-0 w-12" aria-hidden /> : null}
                    </AppSortableEntityListHeader>
                    <AppSortableEntityListFlatBody preset="employeeAssetsHistory">
                      {sortedHistoryRows.map((row) => (
                        <AppSortableEntityListRow
                          key={row.id}
                          as="div"
                          variant="flat"
                          preset="employeeAssetsHistory"
                        >
                          <span className={uiCx(uiTypography.helper, 'min-w-0 truncate text-gray-700')}>
                            {row.typeLabel}
                          </span>
                          <span className={uiCx(uiTypography.helper, 'min-w-0 truncate text-gray-900')}>
                            {row.name}
                          </span>
                          <span className={uiCx(uiTypography.helper, 'min-w-0 whitespace-nowrap text-gray-700')}>
                            {formatAssetDisplayDate(row.checkedOut)}
                          </span>
                          <span className={uiCx(uiTypography.helper, 'min-w-0 whitespace-nowrap text-gray-700')}>
                            {formatAssetDisplayDate(row.returned)}
                          </span>
                          <div className="min-w-0">
                            {assetHistoryStatusBadge(row.status, row.returnedFlag)}
                          </div>
                          {isAdmin ? (
                            <div className="flex w-12 shrink-0 items-center justify-end">
                              <AppListRowIconButton
                                preset="delete"
                                label={
                                  row.kind === 'checkout' ? 'Delete checkout record' : 'Delete assignment record'
                                }
                                onClick={() =>
                                  row.kind === 'checkout'
                                    ? void handleDeleteCheckout(row.id.replace('checkout-', ''))
                                    : void handleDeleteAssignment(row.id.replace('assignment-', ''))
                                }
                              />
                            </div>
                          ) : null}
                        </AppSortableEntityListRow>
                      ))}
                    </AppSortableEntityListFlatBody>
                  </AppSortableEntityList>
                </div>
              )}
            </div>
          </div>
        </div>
      </AppCard>

      {/* Checkout modal */}
      {showCheckoutModal && (
        <UserAssetsCheckoutModal
          userId={userId}
          availableEquipment={Array.isArray(availableList) ? availableList : []}
          loading={loadingAvailable}
          onClose={() => setShowCheckoutModal(false)}
          onSuccess={() => {
            setShowCheckoutModal(false);
            refetchAssets();
          }}
        />
      )}

      {/* Check-in modal */}
      {showCheckinModal && checkinEquipmentId && (
        <UserAssetsCheckinModal
          equipmentId={checkinEquipmentId}
          onClose={() => {
            setShowCheckinModal(false);
            setCheckinEquipmentId(null);
          }}
          onSubmit={handleCheckinSubmit}
          submitting={checkinSubmitting}
        />
      )}

      {/* Vehicle assign (checkout) modal */}
      {showVehicleCheckoutModal && (
        <UserFleetVehicleCheckoutModal
          userId={userId}
          availableVehicles={Array.isArray(fleetVehicleList) ? fleetVehicleList : []}
          loading={loadingFleetAvailable}
          onClose={() => setShowVehicleCheckoutModal(false)}
          onSuccess={() => {
            setShowVehicleCheckoutModal(false);
            refetchAssets();
          }}
        />
      )}

      {/* Fleet return modal */}
      {returnFleetContext && (
        <UserFleetReturnModal
          key={returnFleetContext.fleetAssetId}
          fleetAssetType={returnFleetContext.fleetAssetType}
          minOdometerIn={returnFleetContext.minOdometerIn}
          minHoursIn={returnFleetContext.minHoursIn}
          onClose={() => setReturnFleetContext(null)}
          onSubmit={handleFleetReturnSubmit}
          submitting={fleetReturnSubmitting}
        />
      )}
    </div>
  );
}

function UserAssetsCheckoutModal({
  userId,
  availableEquipment,
  loading,
  onClose,
  onSuccess,
}: {
  userId: string;
  availableEquipment: any[];
  loading: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [selectedId, setSelectedId] = useState('');
  const [condition, setCondition] = useState<'new' | 'good' | 'fair' | 'poor'>('good');
  const [expectedReturnDate, setExpectedReturnDate] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedId) {
      toast.error('Select equipment');
      return;
    }
    setSubmitting(true);
    try {
      await api('POST', `/fleet/equipment/${selectedId}/checkout`, {
        checked_out_by_user_id: userId,
        checked_out_at: new Date().toISOString(),
        expected_return_date: expectedReturnDate || undefined,
        condition_out: condition,
        notes_out: notes || undefined,
      });
      toast.success('Equipment assigned');
      onSuccess();
    } catch (err: any) {
      toast.error(err?.message || 'Checkout failed');
    } finally {
      setSubmitting(false);
    }
  };

  const formId = 'user-assets-equipment-checkout-form';

  return (
    <AppFormModal
      open
      onClose={onClose}
      title="Assign equipment"
      description="Assign equipment from inventory to this employee."
      quickInfo={employeeEquipmentCheckoutQuickInfo}
      footer={
        <div className={uiCx(uiLayout.actionsRow, 'w-full justify-end')}>
          <AppButton type="button" variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </AppButton>
          <AppButton type="submit" form={formId} size="sm" disabled={submitting} loading={submitting}>
            {submitting ? 'Saving...' : 'Assign equipment'}
          </AppButton>
        </div>
      }
    >
      <form id={formId} className={uiSpacing.sectionStack} onSubmit={handleSubmit}>
        <AppSelect
          label="Equipment *"
          required
          disabled={loading}
          placeholder="Select..."
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          fieldHint={USER_ASSETS_FIELD_HINTS.equipment}
          options={availableEquipment.map((eq: any) => ({
            value: String(eq.id),
            label: String(eq.name || eq.serial_number || eq.id),
          }))}
        />
        <AppSelect
          label="Condition"
          value={condition}
          onChange={(e) => setCondition(e.target.value as typeof condition)}
          fieldHint={USER_ASSETS_FIELD_HINTS.condition_out}
          options={[
            { value: 'new', label: 'New' },
            { value: 'good', label: 'Good' },
            { value: 'fair', label: 'Fair' },
            { value: 'poor', label: 'Poor' },
          ]}
        />
        <AppDatePicker
          label="Expected return date"
          value={expectedReturnDate}
          onChange={(e) => setExpectedReturnDate(e.target.value)}
          fieldHint={USER_ASSETS_FIELD_HINTS.expected_return_date}
        />
        <AppTextarea
          label="Notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          fieldHint={USER_ASSETS_FIELD_HINTS.notes_out}
        />
      </form>
    </AppFormModal>
  );
}

function UserAssetsCheckinModal({
  equipmentId,
  onClose,
  onSubmit,
  submitting,
}: {
  equipmentId: string;
  onClose: () => void;
  onSubmit: (p: { actual_return_date: string; condition_in: string; notes_in?: string }) => Promise<void>;
  submitting: boolean;
}) {
  const [actualReturnDate, setActualReturnDate] = useState(new Date().toISOString().split('T')[0]);
  const [condition, setCondition] = useState<'new' | 'good' | 'fair' | 'poor'>('good');
  const [notes, setNotes] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    await onSubmit({
      actual_return_date: new Date(actualReturnDate).toISOString(),
      condition_in: condition,
      notes_in: notes || undefined,
    });
  };

  const formId = 'user-assets-equipment-checkin-form';

  return (
    <AppFormModal
      open
      onClose={onClose}
      title="Check in equipment"
      description="Record that this equipment was returned."
      quickInfo={employeeEquipmentCheckinQuickInfo}
      footer={
        <div className={uiCx(uiLayout.actionsRow, 'w-full justify-end')}>
          <AppButton type="button" variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </AppButton>
          <AppButton type="submit" form={formId} size="sm" disabled={submitting} loading={submitting}>
            {submitting ? 'Saving...' : 'Check in'}
          </AppButton>
        </div>
      }
    >
      <form id={formId} className={uiSpacing.sectionStack} onSubmit={handleSubmit}>
        <AppDatePicker
          label="Return date *"
          required
          value={actualReturnDate}
          onChange={(e) => setActualReturnDate(e.target.value)}
          fieldHint={USER_ASSETS_FIELD_HINTS.return_date}
        />
        <AppSelect
          label="Condition in"
          value={condition}
          onChange={(e) => setCondition(e.target.value as typeof condition)}
          fieldHint={USER_ASSETS_FIELD_HINTS.condition_in}
          options={[
            { value: 'new', label: 'New' },
            { value: 'good', label: 'Good' },
            { value: 'fair', label: 'Fair' },
            { value: 'poor', label: 'Poor' },
          ]}
        />
        <AppTextarea
          label="Notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          fieldHint={USER_ASSETS_FIELD_HINTS.notes_in}
        />
      </form>
    </AppFormModal>
  );
}

function UserFleetVehicleCheckoutModal({
  userId,
  availableVehicles,
  loading,
  onClose,
  onSuccess,
}: {
  userId: string;
  availableVehicles: any[];
  loading: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [selectedId, setSelectedId] = useState('');
  const [expectedReturnDate, setExpectedReturnDate] = useState('');
  const [notes, setNotes] = useState('');
  const [odometerOut, setOdometerOut] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedId) {
      toast.error('Select a vehicle');
      return;
    }
    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        assigned_to_user_id: userId,
        notes_out: notes || undefined,
      };
      if (expectedReturnDate) {
        payload.expected_return_at = new Date(`${expectedReturnDate}T12:00:00`).toISOString();
      }
      if (odometerOut.trim() !== '') {
        const n = parseInt(odometerOut, 10);
        if (!Number.isNaN(n)) payload.odometer_out = n;
      }
      await api('POST', `/fleet/assets/${selectedId}/assign`, payload);
      toast.success('Vehicle assigned');
      onSuccess();
    } catch (err: any) {
      toast.error(err?.message || 'Assignment failed');
    } finally {
      setSubmitting(false);
    }
  };

  const vehicleLabel = (v: any) => {
    const parts = [v.name, v.license_plate, v.make && v.model ? `${v.make} ${v.model}` : v.make || v.model].filter(Boolean);
    return parts.length ? parts.join(' · ') : v.id;
  };

  const formId = 'user-fleet-vehicle-checkout-form';

  return (
    <AppFormModal
      open
      onClose={onClose}
      title="Assign vehicle"
      description="Assign a fleet vehicle to this employee."
      quickInfo={employeeVehicleCheckoutQuickInfo}
      footer={
        <div className={uiCx(uiLayout.actionsRow, 'w-full justify-end')}>
          <AppButton type="button" variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </AppButton>
          <AppButton
            type="submit"
            form={formId}
            size="sm"
            disabled={submitting || loading}
            loading={submitting}
          >
            {submitting ? 'Saving...' : 'Assign vehicle'}
          </AppButton>
        </div>
      }
    >
      <form id={formId} className={uiSpacing.sectionStack} onSubmit={handleSubmit}>
        <AppSelect
          label="Vehicle *"
          required
          disabled={loading}
          placeholder="Select..."
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          fieldHint={USER_ASSETS_FIELD_HINTS.vehicle}
          options={availableVehicles.map((v: any) => ({
            value: String(v.id),
            label: vehicleLabel(v),
          }))}
          helperText={
            !loading && availableVehicles.length === 0
              ? 'No unassigned vehicles. Assign a driver elsewhere or return a vehicle first.'
              : undefined
          }
        />
        <AppInput
          label="Odometer (out)"
          type="number"
          min={0}
          value={odometerOut}
          onChange={(e) => setOdometerOut(e.target.value)}
          placeholder="Optional"
          fieldHint={USER_ASSETS_FIELD_HINTS.odometer_out}
        />
        <AppDatePicker
          label="Expected return date"
          value={expectedReturnDate}
          onChange={(e) => setExpectedReturnDate(e.target.value)}
          fieldHint={USER_ASSETS_FIELD_HINTS.expected_return_date}
        />
        <AppTextarea
          label="Notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          fieldHint={USER_ASSETS_FIELD_HINTS.notes_out}
        />
      </form>
    </AppFormModal>
  );
}

function UserFleetReturnModal({
  fleetAssetType,
  minOdometerIn,
  minHoursIn,
  onClose,
  onSubmit,
  submitting,
}: {
  fleetAssetType: string | null;
  minOdometerIn: number | null;
  minHoursIn: number | null;
  onClose: () => void;
  onSubmit: (p: { odometer_in?: number; hours_in?: number; notes_in?: string }) => Promise<void>;
  submitting: boolean;
}) {
  const [odometerIn, setOdometerIn] = useState('');
  const [hoursIn, setHoursIn] = useState('');
  const [notes, setNotes] = useState('');

  const isVehicle = fleetAssetType === 'vehicle';
  const isHoursAsset = fleetAssetType === 'heavy_machinery' || fleetAssetType === 'other';
  const title =
    isVehicle ? 'Return vehicle' : isHoursAsset ? 'Return fleet asset' : 'Return fleet asset';

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const payload: { odometer_in?: number; hours_in?: number; notes_in?: string } = {};
    if (odometerIn.trim() !== '') {
      const n = parseInt(odometerIn, 10);
      if (!Number.isNaN(n)) {
        if (minOdometerIn != null && n < minOdometerIn) {
          toast.error(
            `Odometer in must be at least ${minOdometerIn.toLocaleString()} (reading at check-out).`,
          );
          return;
        }
        payload.odometer_in = n;
      }
    }
    if (hoursIn.trim() !== '') {
      const h = parseFloat(hoursIn);
      if (!Number.isNaN(h)) {
        if (minHoursIn != null && h < minHoursIn) {
          toast.error(
            `Hours in must be at least ${minHoursIn.toLocaleString()} (reading at check-out).`,
          );
          return;
        }
        payload.hours_in = h;
      }
    }
    if (notes.trim()) payload.notes_in = notes.trim();
    await onSubmit(payload);
  };

  const formId = 'user-fleet-return-form';

  return (
    <AppFormModal
      open
      onClose={onClose}
      title={title}
      description="Record return readings and close the fleet assignment."
      quickInfo={employeeFleetReturnQuickInfo}
      footer={
        <div className={uiCx(uiLayout.actionsRow, 'w-full justify-end')}>
          <AppButton type="button" variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </AppButton>
          <AppButton type="submit" form={formId} size="sm" disabled={submitting} loading={submitting}>
            {submitting ? 'Saving...' : 'Confirm return'}
          </AppButton>
        </div>
      }
    >
      <form id={formId} className={uiSpacing.sectionStack} onSubmit={handleSubmit}>
        {(isVehicle || (!isHoursAsset && !isVehicle)) && (
          <AppInput
            label="Odometer (in)"
            type="number"
            min={minOdometerIn != null ? minOdometerIn : 0}
            value={odometerIn}
            onChange={(e) => setOdometerIn(e.target.value)}
            placeholder={minOdometerIn != null ? `Min ${minOdometerIn.toLocaleString()}` : 'Optional'}
            fieldHint={USER_ASSETS_FIELD_HINTS.odometer_in}
            helperText={
              minOdometerIn != null
                ? `Must be at least ${minOdometerIn.toLocaleString()} (check-out).`
                : undefined
            }
          />
        )}
        {(isHoursAsset || (!isHoursAsset && !isVehicle)) && (
          <AppInput
            label="Hours (in)"
            type="number"
            step="any"
            min={minHoursIn != null ? minHoursIn : 0}
            value={hoursIn}
            onChange={(e) => setHoursIn(e.target.value)}
            placeholder={minHoursIn != null ? `Min ${minHoursIn.toLocaleString()}` : 'Optional'}
            fieldHint={USER_ASSETS_FIELD_HINTS.hours_in}
            helperText={
              minHoursIn != null ? `Must be at least ${minHoursIn.toLocaleString()} (check-out).` : undefined
            }
          />
        )}
        <AppTextarea
          label="Notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          fieldHint={USER_ASSETS_FIELD_HINTS.notes_in}
        />
      </form>
    </AppFormModal>
  );
}

export default UserAssetsSection;
