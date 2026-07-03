import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { MKButton } from "../MKButton";
import { MKCard } from "../MKCard";
import { formatFleetDateTime } from "../../lib/fleetLabels";
import type { AssetAssignment, FleetAsset } from "../../types/fleet";
import { colors } from "../../theme/colors";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";

interface MKFleetAssetGeneralSectionProps {
  asset: FleetAsset;
  openAssignment?: AssetAssignment | null;
  canWrite: boolean;
  onCheckOut: () => void;
  onCheckIn: () => void;
}

const InfoField: React.FC<{ label: string; value?: string | null; multiline?: boolean }> = ({
  label,
  value,
  multiline
}) => {
  if (!value?.trim()) return null;
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={styles.fieldValue} numberOfLines={multiline ? undefined : 3}>
        {value}
      </Text>
    </View>
  );
};

export const MKFleetAssetGeneralSection: React.FC<MKFleetAssetGeneralSectionProps> = ({
  asset,
  openAssignment,
  canWrite,
  onCheckOut,
  onCheckIn
}) => {
  const isVehicle = asset.asset_type === "vehicle";
  const showHours = asset.asset_type !== "vehicle";

  return (
    <View style={styles.wrap}>
      <MKCard style={styles.card} elevated>
        <Text style={styles.sectionTitle}>Basic information</Text>
        <InfoField label="Name" value={asset.name} />
        <InfoField label="Unit number" value={asset.unit_number} />
        <InfoField label="VIN" value={asset.vin} />
        <InfoField label="License plate" value={asset.license_plate} />
        <InfoField label="Make / model" value={[asset.make, asset.model].filter(Boolean).join(" ")} />
        <InfoField label="Year" value={asset.year?.toString()} />
        <InfoField label="Condition" value={asset.condition} />
        <InfoField label="Fuel type" value={asset.fuel_type} />
        <InfoField label="Vehicle type" value={asset.vehicle_type} />
        <InfoField label="Yard location" value={asset.yard_location} />
        <InfoField label="Driver" value={asset.driver_name} />
        <InfoField label="Driver phone" value={asset.driver_contact_phone} />
      </MKCard>

      <MKCard style={styles.card} elevated>
        <Text style={styles.sectionTitle}>Registration</Text>
        <InfoField label="ICBC registration" value={asset.icbc_registration_no} />
        <InfoField
          label="Vancouver decals"
          value={asset.vancouver_decals?.length ? asset.vancouver_decals.join(", ") : null}
        />
        <InfoField label="Ferry length" value={asset.ferry_length} />
        <InfoField
          label="GVW"
          value={
            asset.gvw_kg != null
              ? `${asset.gvw_kg} kg`
              : asset.gvw_value != null
                ? `${asset.gvw_value} ${asset.gvw_unit ?? ""}`.trim()
                : null
          }
        />
        <InfoField label="Propane cert" value={asset.propane_sticker_cert} />
        <InfoField
          label="Propane date"
          value={asset.propane_sticker_date ? formatFleetDateTime(asset.propane_sticker_date) : null}
        />
      </MKCard>

      {(isVehicle || showHours) && (
        <MKCard style={styles.card} elevated>
          <Text style={styles.sectionTitle}>Usage readings</Text>
          {isVehicle ? (
            <>
              <InfoField label="Current odometer" value={asset.odometer_current?.toString()} />
              <InfoField label="Last service odometer" value={asset.odometer_last_service?.toString()} />
              <InfoField label="Next due odometer" value={asset.odometer_next_due_at?.toString()} />
              <InfoField label="Noted issues" value={asset.odometer_noted_issues} multiline />
            </>
          ) : null}
          {showHours ? (
            <>
              <InfoField label="Current hours" value={asset.hours_current?.toString()} />
              <InfoField label="Last service hours" value={asset.hours_last_service?.toString()} />
              <InfoField label="Next due hours" value={asset.hours_next_due_at?.toString()} />
              <InfoField label="Noted issues" value={asset.hours_noted_issues} multiline />
            </>
          ) : null}
        </MKCard>
      )}

      <MKCard style={styles.card} elevated>
        <Text style={styles.sectionTitle}>Assignment</Text>
        {openAssignment ? (
          <>
            <InfoField label="Assigned to" value={openAssignment.assigned_to_name} />
            <InfoField
              label="Since"
              value={
                openAssignment.assigned_at ? formatFleetDateTime(openAssignment.assigned_at) : null
              }
            />
            <InfoField label="Odometer out" value={openAssignment.odometer_out?.toString()} />
            <InfoField label="Hours out" value={openAssignment.hours_out?.toString()} />
          </>
        ) : (
          <Text style={styles.emptyText}>No active assignment.</Text>
        )}

        {canWrite ? (
          <View style={styles.actions}>
            {openAssignment ? (
              <MKButton title="Check in / Return" onPress={onCheckIn} />
            ) : (
              <MKButton title="Check out" onPress={onCheckOut} />
            )}
          </View>
        ) : null}
      </MKCard>

      {asset.notes ? (
        <MKCard style={styles.card} elevated>
          <Text style={styles.sectionTitle}>Notes</Text>
          <Text style={styles.notes}>{asset.notes}</Text>
        </MKCard>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.md
  },
  card: {
    gap: spacing.sm,
    padding: spacing.md
  },
  sectionTitle: {
    ...typography.bodySmall,
    fontFamily: typography.button.fontFamily,
    color: colors.textPrimary,
    marginBottom: spacing.xs
  },
  field: {
    gap: 2,
    marginBottom: spacing.sm
  },
  fieldLabel: {
    ...typography.caption,
    color: colors.textMuted,
    textTransform: "uppercase"
  },
  fieldValue: {
    ...typography.body,
    color: colors.textPrimary,
    textTransform: "capitalize"
  },
  emptyText: {
    ...typography.bodySmall,
    color: colors.textMuted
  },
  actions: {
    marginTop: spacing.sm
  },
  notes: {
    ...typography.body,
    color: colors.textPrimary
  }
});
