import { api } from "./api";

export interface FleetAssetOption {
  id: string;
  label: string;
}

export interface FormCustomListRuntimeDetail {
  items: Array<{ id: string; label: string; children?: unknown[] }>;
  leaf_options: Array<{ value: string; label: string }>;
}

export async function getFleetAssetsForSafety(): Promise<FleetAssetOption[]> {
  const response = await api.get<FleetAssetOption[]>(
    "/form-templates/support/fleet-assets",
    { params: { limit: 200 } }
  );
  return response.data;
}

export async function getFormCustomListRuntime(
  listId: string
): Promise<FormCustomListRuntimeDetail> {
  const response = await api.get<FormCustomListRuntimeDetail>(
    `/form-custom-lists/${encodeURIComponent(listId)}`,
    { params: { for_runtime: true } }
  );
  return response.data;
}
