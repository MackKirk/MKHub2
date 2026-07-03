import { api } from "./api";
import type { ProjectStatusRow } from "../lib/projectStatusVisibility";

export interface ProjectStatus extends ProjectStatusRow {
  id: string;
}

export interface ProjectDivision {
  id: string;
  label: string;
  subdivisions?: ProjectDivision[];
}

export interface ClientListItem {
  id: string;
  name?: string;
  display_name?: string;
}

export interface EmployeeListItem {
  id: string;
  name?: string;
  first_name?: string;
  last_name?: string;
  department?: string;
  division?: string;
  divisions?: Array<{ label?: string }>;
}

export interface SettingsResponse {
  project_statuses?: ProjectStatus[];
}

export async function fetchSettings(): Promise<SettingsResponse> {
  const response = await api.get<SettingsResponse>("/settings");
  return response.data;
}

export async function fetchProjectDivisions(): Promise<ProjectDivision[]> {
  const response = await api.get<ProjectDivision[]>(
    "/settings/project-divisions"
  );
  return response.data;
}

export async function fetchClientsForFilter(): Promise<ClientListItem[]> {
  const response = await api.get<{ items?: ClientListItem[] } | ClientListItem[]>(
    "/clients",
    { params: { limit: 100 } }
  );
  const data = response.data;
  if (Array.isArray(data)) return data;
  return data.items ?? [];
}

export async function fetchEmployees(): Promise<EmployeeListItem[]> {
  const response = await api.get<EmployeeListItem[]>("/employees");
  return response.data;
}

export function employeesInEstimatingDept(
  employees: EmployeeListItem[]
): EmployeeListItem[] {
  const target = "sales / estimating";
  return employees.filter((emp) => {
    if (Array.isArray(emp.divisions) && emp.divisions.length > 0) {
      return emp.divisions.some(
        (d) => String(d?.label || "").trim().toLowerCase() === target
      );
    }
    const dept = String(emp.department || emp.division || "").trim();
    return dept.toLowerCase().includes(target);
  });
}

export function employeeDisplayName(emp: EmployeeListItem): string {
  if (emp.name) return emp.name;
  return [emp.first_name, emp.last_name].filter(Boolean).join(" ").trim() || "Unknown";
}

export function sortEmployeesByDisplayName(
  employees: EmployeeListItem[]
): EmployeeListItem[] {
  return [...employees].sort((a, b) =>
    employeeDisplayName(a).localeCompare(employeeDisplayName(b), undefined, {
      sensitivity: "base"
    })
  );
}

export function clientDisplayName(client: ClientListItem): string {
  return client.display_name || client.name || "Unknown";
}

export function flattenDivisions(
  divisions: ProjectDivision[]
): Array<{ id: string; label: string }> {
  const out: Array<{ id: string; label: string }> = [];
  for (const div of divisions) {
    out.push({ id: String(div.id), label: div.label });
    for (const sub of div.subdivisions || []) {
      out.push({
        id: String(sub.id),
        label: `${div.label} - ${sub.label}`
      });
    }
  }
  return out;
}
