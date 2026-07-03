import type { ProjectStatusBadgeVariant } from "./projectUi";
import type { FleetAsset } from "../types/fleet";
import { fleetAssetLabel } from "../services/fleet";

export function formatFleetAssetType(value?: string | null): string {
  if (!value) return "Asset";
  return value.replace(/_/g, " ");
}

export function getFleetAssetStatusVariant(status?: string | null): ProjectStatusBadgeVariant {
  switch (status) {
    case "active":
      return "success";
    case "maintenance":
      return "warning";
    case "inactive":
    case "retired":
      return "neutral";
    default:
      return "neutral";
  }
}

export function buildFleetAssetTitle(asset: Pick<FleetAsset, "make" | "model" | "name">): string {
  const makeModel = [asset.make, asset.model].filter(Boolean).join(" ").trim();
  return makeModel || asset.name?.trim() || fleetAssetLabel(asset);
}

export function buildFleetAssetSubtitle(
  asset: Pick<FleetAsset, "unit_number" | "license_plate" | "asset_type">
): string {
  const parts = [
    asset.unit_number ? `Unit #${asset.unit_number}` : null,
    asset.license_plate?.trim() || null,
    formatFleetAssetType(asset.asset_type)
  ].filter(Boolean);
  return parts.join(" · ");
}

export function formatFleetAssetStatus(status?: string | null): string {
  if (!status) return "—";
  return status.replace(/_/g, " ");
}

export const FLEET_AVAILABLE_ACCENT = "#059669";
export const FLEET_ASSIGNED_ACCENT = "#dc2626";

export function fleetAvailabilityAccentColor(isAssigned: boolean): string {
  return isAssigned ? FLEET_ASSIGNED_ACCENT : FLEET_AVAILABLE_ACCENT;
}

export function isFleetAssetAssigned(
  asset: Pick<FleetAsset, "assigned_to_name"> & { assigned_to_user_id?: string | null }
): boolean {
  return Boolean(asset.assigned_to_name?.trim() || asset.assigned_to_user_id);
}
