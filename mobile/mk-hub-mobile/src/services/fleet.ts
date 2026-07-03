import { api } from "./api";
import type {
  AssetAssignment,
  AssetAssignmentAssignRequest,
  AssetAssignmentReturnRequest,
  EquipmentCheckinRequest,
  EquipmentItem,
  EquipmentListResponse,
  FleetAsset,
  FleetAssetListResponse,
  FleetAssetType,
  FleetComplianceRecord,
  FleetHistoryItem,
  FleetInspection,
  FleetListKind,
  UserAssetsResponse,
  WorkOrder
} from "../types/fleet";

export function fleetAssetLabel(asset: Pick<FleetAsset, "name" | "unit_number" | "license_plate">): string {
  return asset.name?.trim() || asset.unit_number?.trim() || asset.license_plate?.trim() || "Asset";
}

export function equipmentLabel(item: Pick<EquipmentItem, "name" | "unit_number">): string {
  return item.name?.trim() || item.unit_number?.trim() || "Equipment";
}

export async function getUserAssets(userId: string): Promise<UserAssetsResponse> {
  const response = await api.get<UserAssetsResponse>(`/fleet/users/${userId}/assets`);
  return response.data;
}

export async function listFleetAssets(params: {
  asset_type?: FleetAssetType;
  assigned?: boolean;
  search?: string;
  page?: number;
  limit?: number;
  sort?: string;
  dir?: "asc" | "desc";
}): Promise<FleetAssetListResponse> {
  const response = await api.get<FleetAssetListResponse>("/fleet/assets", { params });
  return response.data;
}

export async function listEquipment(params: {
  assigned?: boolean;
  search?: string;
  page?: number;
  limit?: number;
  sort?: string;
  dir?: "asc" | "desc";
}): Promise<EquipmentListResponse> {
  const response = await api.get<EquipmentListResponse>("/fleet/equipment", { params });
  return response.data;
}

export async function getFleetAsset(assetId: string): Promise<FleetAsset> {
  const response = await api.get<FleetAsset>(`/fleet/assets/${assetId}`);
  return response.data;
}

export async function getEquipment(equipmentId: string): Promise<EquipmentItem> {
  const response = await api.get<EquipmentItem>(`/fleet/equipment/${equipmentId}`);
  return response.data;
}

export async function getFleetAssetAssignments(assetId: string): Promise<AssetAssignment[]> {
  const response = await api.get<AssetAssignment[]>(`/fleet/assets/${assetId}/assignments`);
  return response.data;
}

export async function getFleetAssetInspections(assetId: string): Promise<FleetInspection[]> {
  const response = await api.get<FleetInspection[]>(`/fleet/assets/${assetId}/inspections`);
  return response.data;
}

export async function getFleetAssetWorkOrders(assetId: string): Promise<WorkOrder[]> {
  const response = await api.get<WorkOrder[]>(`/fleet/assets/${assetId}/work-orders`);
  return response.data;
}

export async function getFleetAssetCompliance(assetId: string): Promise<FleetComplianceRecord[]> {
  const response = await api.get<FleetComplianceRecord[]>(`/fleet/assets/${assetId}/compliance`);
  return response.data;
}

export async function getFleetAssetHistory(assetId: string): Promise<FleetHistoryItem[]> {
  const response = await api.get<FleetHistoryResponse>(`/fleet/assets/${assetId}/history`);
  return response.data.items ?? [];
}

export async function getEquipmentAssignments(equipmentId: string): Promise<AssetAssignment[]> {
  const response = await api.get<AssetAssignment[]>(`/fleet/equipment/${equipmentId}/assignments`);
  return response.data;
}

export async function assignFleetAsset(
  assetId: string,
  body: AssetAssignmentAssignRequest
): Promise<AssetAssignment> {
  const response = await api.post<AssetAssignment>(`/fleet/assets/${assetId}/assign`, body);
  return response.data;
}

export async function returnFleetAsset(
  assetId: string,
  body: AssetAssignmentReturnRequest
): Promise<AssetAssignment> {
  const response = await api.post<AssetAssignment>(`/fleet/assets/${assetId}/return`, body);
  return response.data;
}

export async function assignEquipment(
  equipmentId: string,
  body: AssetAssignmentAssignRequest
): Promise<AssetAssignment> {
  const response = await api.post<AssetAssignment>(`/fleet/equipment/${equipmentId}/assign`, body);
  return response.data;
}

export async function returnEquipment(
  equipmentId: string,
  body: AssetAssignmentReturnRequest
): Promise<AssetAssignment> {
  const response = await api.post<AssetAssignment>(`/fleet/equipment/${equipmentId}/return`, body);
  return response.data;
}

export async function checkinEquipment(
  equipmentId: string,
  body: EquipmentCheckinRequest
): Promise<unknown> {
  const response = await api.post(`/fleet/equipment/${equipmentId}/checkin`, body);
  return response.data;
}

export function listKindToAssetType(listKind: FleetListKind): FleetAssetType | undefined {
  if (listKind === "vehicles") return "vehicle";
  return undefined;
}
