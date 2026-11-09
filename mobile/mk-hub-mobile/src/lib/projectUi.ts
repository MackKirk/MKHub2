export type ProjectStatusBadgeVariant =
  | "neutral"
  | "success"
  | "warning"
  | "danger"
  | "info";

export type ProjectStatusColorSetting = {
  id?: string | null;
  label?: string | null;
  value?: string | null;
};

/** Settings hex → badge variant (Hub project_statuses.value palette). */
const STATUS_HEX_TO_VARIANT: Record<string, ProjectStatusBadgeVariant> = {
  "#fee2e2": "danger",
  "#fecaca": "danger",
  "#fef3c7": "warning",
  "#fde68a": "warning",
  "#dbeafe": "info",
  "#bfdbfe": "info",
  "#d1fae5": "success",
  "#bbf7d0": "success",
  "#cccccc": "neutral",
  "#e5e7eb": "neutral",
  "#4287e0": "info",
};

function normalizeHex(value?: string | null): string | null {
  const raw = String(value || "").trim().toLowerCase();
  if (!/^#([0-9a-f]{3}|[0-9a-f]{6})$/.test(raw)) return null;
  if (raw.length === 4) {
    return `#${raw[1]}${raw[1]}${raw[2]}${raw[2]}${raw[3]}${raw[3]}`;
  }
  return raw;
}

function variantFromSettingsHex(hex: string): ProjectStatusBadgeVariant | null {
  const known = STATUS_HEX_TO_VARIANT[hex];
  if (known) return known;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return null;
  if (r >= 220 && g <= 230 && b <= 230 && r > g && r > b) return "danger";
  if (r >= 220 && g >= 200 && b <= 180) return "warning";
  if (g >= r && g >= b && g - r >= 20) return "success";
  if (b >= r && b >= g && b - r >= 20) return "info";
  return "neutral";
}

function variantFromStatusLabel(status?: string | null): ProjectStatusBadgeVariant {
  const s = String(status || "")
    .trim()
    .toLowerCase();
  if (!s) return "neutral";

  if (s === "prospecting" || s === "estimating") return "info";
  if (s === "sent to customer") return "warning";
  if (
    s === "refused" ||
    s === "lost" ||
    s === "cancelled" ||
    s === "canceled" ||
    s === "not awarded" ||
    s === "not bidding"
  ) {
    return "danger";
  }
  if (s === "conflict" || s === "schedule conflict") return "neutral";
  if (
    s === "low & unawarded" ||
    s === "low and unawarded" ||
    s === "low & awarded" ||
    s === "low and awarded" ||
    s === "new & unawarded" ||
    s === "new and unawarded"
  ) {
    return "info";
  }
  if (s === "in progress" || s === "active" || s === "ongoing") return "success";
  if (
    s === "won" ||
    s === "awarded" ||
    s === "approved" ||
    s === "completed" ||
    s === "complete" ||
    s === "closed won" ||
    s === "finished"
  ) {
    return "success";
  }
  if (s === "on hold" || s.includes("hold") || s === "pending") return "warning";

  return "neutral";
}

/** Map project/opportunity status_label to badge variant (ported from Hub web). */
export function getProjectStatusBadgeVariant(
  status?: string | null,
  statuses?: ProjectStatusColorSetting[] | null
): ProjectStatusBadgeVariant {
  const label = String(status || "").trim();
  if (label && statuses?.length) {
    const needle = label.toLowerCase();
    const item = statuses.find(
      (s) => String(s.label || "").trim().toLowerCase() === needle
    );
    const hex = normalizeHex(item?.value);
    if (hex) {
      const fromHex = variantFromSettingsHex(hex);
      if (fromHex) return fromHex;
    }
  }
  return variantFromStatusLabel(status);
}

export function getProjectStatusRail(
  status?: string | null,
  statuses?: ProjectStatusColorSetting[] | null
): readonly [string, string] {
  const variant = getProjectStatusBadgeVariant(status, statuses);
  if (variant === "success") return ["#166534", "#4ADE80"];
  if (variant === "warning") return ["#D97706", "#FBBF24"];
  if (variant === "danger") return ["#B91C1C", "#F87171"];
  if (variant === "info") return ["#1D4ED8", "#60A5FA"];
  return ["#6B7280", "#D1D5DB"];
}

export function resolveProjectCoverPath(project: {
  cover_image_url?: string | null;
  image_file_object_id?: string | null;
}): string | null {
  const cover = project.cover_image_url?.trim() || "";
  if (cover.startsWith("http://") || cover.startsWith("https://") || cover.includes("/files/")) {
    return cover;
  }
  if (project.image_file_object_id) {
    return `/files/${project.image_file_object_id}/thumbnail?w=800`;
  }
  return null;
}
