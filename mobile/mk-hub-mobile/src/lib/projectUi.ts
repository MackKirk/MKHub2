export type ProjectStatusBadgeVariant =
  | "neutral"
  | "success"
  | "warning"
  | "danger"
  | "info";

/** Map project/opportunity status_label to badge variant (ported from Hub web). */
export function getProjectStatusBadgeVariant(
  status?: string | null
): ProjectStatusBadgeVariant {
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
    s === "canceled"
  ) {
    return "danger";
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

export function getProjectStatusRail(
  status?: string | null
): readonly [string, string] {
  const variant = getProjectStatusBadgeVariant(status);
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
