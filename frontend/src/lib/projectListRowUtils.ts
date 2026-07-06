import { createElement, type ReactNode } from 'react';
import { DivisionIcon } from '@/components/DivisionIcon';
import { formatSiteHeroAddress } from '@/lib/addressUtils';

export type ProjectListAddressFields = {
  site_address_line1?: string;
  site_address_line2?: string;
  site_city?: string;
  site_postal_code?: string;
  address?: string;
  address_city?: string;
  address_postal_code?: string;
};

export type ProjectDivisionIconEntry = { id: string; label: string; icon: ReactNode };

export const LIST_DIVISION_ICON_SIZE = 20;

const getDivisionIcon = (label: string): ReactNode =>
  createElement(DivisionIcon, { label, size: LIST_DIVISION_ICON_SIZE, suppressNativeTitle: true });

export function normalizeProjectDivisionIds(...sources: unknown[]): string[] {
  for (const raw of sources) {
    if (Array.isArray(raw)) {
      const ids = raw.map((id) => String(id)).filter(Boolean);
      if (ids.length > 0) return ids;
    }
    if (typeof raw === 'string' && raw.trim()) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          const ids = parsed.map((id) => String(id)).filter(Boolean);
          if (ids.length > 0) return ids;
        }
      } catch {
        // ignore invalid JSON
      }
    }
  }
  return [];
}

/** Effective list "Start" date (matches backend COALESCE + DATE sort and card display). */
export function getProjectListStartDate(project: {
  date_start?: string | null;
  created_at?: string | null;
}): string {
  const raw = project.date_start || project.created_at;
  if (!raw) return '';
  const s = String(raw);
  if (s.length >= 10 && s[4] === '-' && s[7] === '-') return s.slice(0, 10);
  const parsed = new Date(s);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return s.slice(0, 10);
}

export function getProjectListHeroAddress(project: ProjectListAddressFields): string | null {
  return formatSiteHeroAddress({
    address_line1: project.site_address_line1 || project.address,
    address_line2: project.site_address_line2,
    city: project.site_city || project.address_city,
    postal_code: project.site_postal_code || project.address_postal_code,
  });
}

export function resolveProjectDivisionIcons(
  projectDivIds: string[] | undefined,
  projectDivisions?: any[],
): ProjectDivisionIconEntry[] {
  if (!Array.isArray(projectDivIds) || projectDivIds.length === 0 || !projectDivisions) return [];
  const icons: ProjectDivisionIconEntry[] = [];
  for (const divId of projectDivIds) {
    if (icons.length >= 5) break;
    let found = false;
    for (const div of projectDivisions) {
      if (String(div.id) === String(divId)) {
        icons.push({
          id: String(div.id),
          label: div.label,
          icon: getDivisionIcon(div.label),
        });
        found = true;
        break;
      }
      for (const sub of div.subdivisions || []) {
        if (String(sub.id) === String(divId)) {
          icons.push({
            id: String(sub.id),
            label: `${div.label} - ${sub.label}`,
            // Icon map is keyed by parent division label (same as card view).
            icon: getDivisionIcon(div.label),
          });
          found = true;
          break;
        }
      }
      if (found) break;
    }
  }
  return icons;
}
