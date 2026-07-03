import { WORK_ORDER_STATUS_LABELS } from "./fleetLabels";
import type { WorkOrderActivityEntry } from "../types/fleet";

export function formatWorkOrderActivityMessage(entry: WorkOrderActivityEntry): string {
  const d = entry.details ?? {};
  switch (entry.action) {
    case "work_order_created_from_inspection":
      return `Created automatically from ${String(d.inspection_type ?? "inspection")} inspection`;
    case "work_order_created":
      return `Work order created (${String(d.work_order_number ?? "N/A")})`;
    case "work_order_updated":
      if (Array.isArray(d.changed_fields) && d.changed_fields.length > 0) {
        return `Updated fields: ${(d.changed_fields as string[]).join(", ")}`;
      }
      return "Work order details updated";
    case "assignment_changed":
      return "Assignment updated";
    case "check_in":
      return "Check-in recorded";
    case "check_out":
      return "Check-out recorded";
    case "work_order_reopened":
      return `Work order reopened to ${
        WORK_ORDER_STATUS_LABELS[String(d.new_status ?? "open")] ?? String(d.new_status ?? "open")
      }`;
    case "file_updated":
      return "File metadata updated";
    case "file_attached":
      return `Attached file "${String(d.original_name ?? "file")}" to ${String(d.category ?? "").toLowerCase()}`;
    case "file_removed":
      return `Removed file "${String(d.original_name ?? d.file_object_id ?? "file")}" from ${String(d.category ?? "").toLowerCase()}`;
    case "status_changed": {
      const oldL = WORK_ORDER_STATUS_LABELS[String(d.old_status)] ?? String(d.old_status);
      const newL = WORK_ORDER_STATUS_LABELS[String(d.new_status)] ?? String(d.new_status);
      const reason = d.reason ? ` (${String(d.reason)})` : "";
      return `Status changed from ${oldL} to ${newL}${reason}`;
    }
    case "cost_added":
      return `Added cost: ${String(d.description ?? "—")} (${String(d.category)}) $${Number(d.amount ?? 0).toFixed(2)}`;
    case "cost_removed":
      return `Removed cost: ${String(d.description ?? "—")} (${String(d.category)}) $${Number(d.amount ?? 0).toFixed(2)}`;
    default:
      return entry.action.replace(/_/g, " ");
  }
}

export function getWorkOrderActivityBadge(action: string): string {
  switch (action) {
    case "work_order_created_from_inspection":
      return "Inspection";
    case "work_order_created":
      return "Created";
    case "work_order_updated":
      return "Updated";
    case "assignment_changed":
      return "Assignment";
    case "check_in":
      return "Check-in";
    case "check_out":
      return "Check-out";
    case "work_order_reopened":
      return "Reopened";
    case "file_updated":
      return "File update";
    case "status_changed":
      return "Status";
    case "file_attached":
      return "Attachment";
    case "file_removed":
      return "Removal";
    case "cost_added":
      return "Cost added";
    case "cost_removed":
      return "Cost removed";
    default:
      return "Log";
  }
}
