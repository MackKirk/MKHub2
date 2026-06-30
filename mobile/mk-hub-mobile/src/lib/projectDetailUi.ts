import type { ProjectDetail, ProjectListItem } from "../types/projects";

export function formatProjectDate(value?: string | null): string {
  if (!value) return "—";
  return value.slice(0, 10);
}

export function formatProjectAddress(project: ProjectDetail | ProjectListItem | null): string {
  if (!project) return "—";

  const parts = [
    project.site_address_line1 || project.address,
    project.site_city || project.address_city,
    project.site_province || project.address_province,
    project.site_postal_code || project.address_postal_code,
    project.site_country || project.address_country
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(", ") : "—";
}

export function formatSiteDisplay(project: ProjectDetail | ProjectListItem | null): {
  title: string;
  address?: string;
} {
  if (!project) return { title: "—" };

  const siteName = project.site_name;
  const city = project.site_city || project.address_city;
  const province = project.site_province || project.address_province;
  const address = formatProjectAddress(project);

  const title =
    siteName ||
    (city && province ? `${city}, ${province}` : city || province || "—");

  const showAddress =
    address !== "—" && address !== title && !address.startsWith(`${title},`);

  return {
    title,
    address: showAddress ? address : undefined
  };
}

export function formatRelatedCustomers(
  project: ProjectDetail | ProjectListItem | null
): string {
  if (!project?.related_client_ids?.length) return "—";

  return project.related_client_ids
    .map((id, index) => {
      const name = project.related_client_display_names?.[index];
      return name?.trim() || id;
    })
    .join(", ");
}

export function resolveEmployeeName(
  employeeId: string | null | undefined,
  lookup: Map<string, string>
): string {
  if (!employeeId) return "—";
  return lookup.get(String(employeeId)) || "—";
}

export function resolveEmployeeNames(
  employeeIds: string[] | null | undefined,
  lookup: Map<string, string>
): string {
  const ids = employeeIds?.filter(Boolean) ?? [];
  if (ids.length === 0) return "—";
  return ids
    .map((id) => lookup.get(String(id)) || "Unknown")
    .join(", ");
}
