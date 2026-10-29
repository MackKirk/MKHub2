import { Alert } from "react-native";
import { CommonActions } from "@react-navigation/native";
import { navigationRef } from "../navigation/HubMenuProvider";
import { formatProjectAddress } from "./projectDetailUi";
import { getProjectDetail } from "../services/projects";
import { toApiError } from "../services/api";
import type { HomeStackParamList } from "../navigation/types";
import type { InboxNotification } from "../types/inbox";
import type { ProjectDetailTabKey } from "../components/MKProjectDetailTabBar";

const UUID =
  "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";

export function goToAppTab(
  screen: "Clock" | "Tasks" | "Community",
  params?: object
): void {
  if (!navigationRef.isReady()) return;
  navigationRef.dispatch(
    CommonActions.navigate({
      name: "App",
      params: {
        screen: "MainTabs",
        params: params ? { screen, params } : { screen }
      }
    })
  );
}

export function goToHomeScreen<T extends keyof HomeStackParamList>(
  screen: T,
  params?: HomeStackParamList[T]
): void {
  if (!navigationRef.isReady()) return;
  navigationRef.dispatch(
    CommonActions.navigate({
      name: "App",
      params: {
        screen: "MainTabs",
        params: {
          screen: "Home",
          params: { screen, params }
        }
      }
    })
  );
}

function goToRoot(screen: string, params?: object): void {
  if (!navigationRef.isReady()) return;
  navigationRef.dispatch(
    CommonActions.navigate({
      name: "App",
      params: { screen, params }
    })
  );
}

export function goToSignPlaceholder(): void {
  goToHomeScreen("Placeholder", {
    title: "To sign",
    message: "Open MK Hub on the web to sign this document."
  });
}

function goToWebPlaceholder(title?: string | null): void {
  goToHomeScreen("Placeholder", {
    title: title?.trim() || "Open on web",
    message: "Open MK Hub on the web for this item."
  });
}

function parseLink(link: string): { pathname: string; search: URLSearchParams } {
  const raw = link.trim();
  const hashless = raw.split("#")[0] || "";
  const [pathPart, queryPart] = hashless.split("?");
  const pathname = (pathPart || "").replace(/\/+$/, "") || "/";
  return { pathname, search: new URLSearchParams(queryPart || "") };
}

function metaString(meta: InboxNotification["metadata"], key: string): string | null {
  if (!meta || typeof meta !== "object") return null;
  const value = meta[key];
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function metaRecord(
  meta: InboxNotification["metadata"],
  key: string
): Record<string, unknown> | null {
  if (!meta || typeof meta !== "object") return null;
  const value = meta[key];
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function isoDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = value.trim().match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

const MONTH_INDEX: Record<string, number> = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12
};

/** "on March 12, 2026" from the shift notification message. */
function dateFromShiftMessage(message?: string | null): string | null {
  if (!message) return null;
  const match = message.match(/\bon\s+([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})\b/);
  if (!match) return null;
  const month = MONTH_INDEX[match[1].toLowerCase()];
  const day = Number(match[2]);
  const year = Number(match[3]);
  if (!month || day < 1 || day > 31 || year < 2000) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function shiftFocusDate(notif: InboxNotification): string | undefined {
  const shift = metaRecord(notif.metadata, "shift");
  return isoDate(shift?.date) || dateFromShiftMessage(notif.message) || undefined;
}

function projectTab(search: URLSearchParams): ProjectDetailTabKey | undefined {
  const tab = (search.get("tab") || "").toLowerCase();
  if (tab === "safety") return "safety";
  if (tab === "notes" || tab === "history") return "notes";
  if (tab === "files") return "files";
  if (tab === "documents") return "documents";
  if (tab === "pricing") return "pricing";
  return undefined;
}

async function openProject(
  projectId: string,
  search: URLSearchParams
): Promise<void> {
  try {
    const project = await getProjectDetail(projectId);
    const inspectionId = search.get("safety_inspection");
    if (inspectionId) {
      const address = formatProjectAddress(project);
      goToRoot("SafetyInspectionDetail", {
        projectId,
        inspectionId,
        projectName: project.name,
        projectAddress: address === "—" ? undefined : address,
        projectAddressCity: project.site_city || project.address_city,
        projectAddressProvince: project.site_province || project.address_province
      });
      return;
    }
    goToRoot("ProjectDetail", {
      project,
      initialTab: projectTab(search)
    });
  } catch (err) {
    Alert.alert("Could not open project", toApiError(err).message);
  }
}

function isSignaturePath(pathname: string): boolean {
  return (
    pathname.startsWith("/personal/signatures") ||
    pathname.startsWith("/documents/to-sign") ||
    pathname.startsWith("/onboarding")
  );
}

function isClockPath(pathname: string, search: URLSearchParams, type: string): boolean {
  if (type === "attendance" || type === "hours_reminder") return true;
  if (pathname === "/clock-in-out" || pathname === "/log-hours") return true;
  if (pathname === "/home" && (search.get("open") || "").toLowerCase() === "hours") {
    return true;
  }
  return false;
}

export async function openNotificationTarget(notif: InboxNotification): Promise<void> {
  const type = (notif.type || "").toLowerCase();
  const rawLink = notif.link || "";
  const { pathname, search } = parseLink(rawLink);
  const meta = notif.metadata;

  const communityPostId =
    search.get("communityPost") ||
    search.get("community_post") ||
    metaString(meta, "community_post_id");
  if (communityPostId) {
    goToAppTab("Community", { postId: communityPostId });
    return;
  }

  const projectMatch = pathname.match(
    new RegExp(`^/(?:projects|opportunities|rm-projects|rm-opportunities)/(${UUID})$`, "i")
  );
  if (projectMatch) {
    await openProject(projectMatch[1], search);
    return;
  }

  const inspectionMatch = pathname.match(new RegExp(`^/fleet/inspections/(${UUID})$`, "i"));
  const scheduleId =
    inspectionMatch?.[1] ||
    (type.startsWith("fleet_inspection") ? metaString(meta, "schedule_id") : null);
  if (scheduleId) {
    goToHomeScreen("FleetInspectionDetail", { scheduleId });
    return;
  }

  const workOrderMatch = pathname.match(
    new RegExp(`^/(?:fleet/work-orders|company-assets/work-orders|work-orders)/(${UUID})$`, "i")
  );
  if (workOrderMatch) {
    goToRoot("FleetWorkOrderDetail", { workOrderId: workOrderMatch[1] });
    return;
  }

  const fleetAssetMatch = pathname.match(new RegExp(`^/fleet/assets/(${UUID})$`, "i"));
  if (fleetAssetMatch) {
    goToRoot("FleetAssetDetail", {
      targetType: "fleet",
      assetId: fleetAssetMatch[1]
    });
    return;
  }

  const equipmentMatch = pathname.match(
    new RegExp(`^/company-assets/equipment/(${UUID})$`, "i")
  );
  if (equipmentMatch) {
    goToRoot("FleetAssetDetail", {
      targetType: "equipment",
      assetId: equipmentMatch[1]
    });
    return;
  }

  const customerMatch = pathname.match(new RegExp(`^/customers/(${UUID})`, "i"));
  if (customerMatch) {
    goToRoot("CustomerDetail", {
      customerId: customerMatch[1],
      initialTab: pathname.includes("/sites/") ? "sites" : undefined
    });
    return;
  }

  const userMatch = pathname.match(new RegExp(`^/users/(${UUID})$`, "i"));
  if (userMatch) {
    goToRoot("UserDetail", { userId: userMatch[1] });
    return;
  }

  if (pathname === "/safety/follow-ups") {
    goToRoot("SafetyFollowUps");
    return;
  }

  if (isSignaturePath(pathname)) {
    goToSignPlaceholder();
    return;
  }

  if (pathname === "/schedule" || type === "shift") {
    goToHomeScreen("Schedule", {
      focusDate: shiftFocusDate(notif),
      openedAt: Date.now()
    });
    return;
  }

  const taskFromPath = pathname.match(new RegExp(`^/tasks/(${UUID})$`, "i"));
  const taskId = taskFromPath?.[1] || (type === "task" ? metaString(meta, "task_id") : null);
  if (pathname === "/tasks" || pathname.startsWith("/tasks/") || type === "task") {
    if (taskId) goToRoot("TaskDetail", { taskId });
    else goToAppTab("Tasks");
    return;
  }

  if (isClockPath(pathname, search, type)) {
    goToAppTab("Clock");
    return;
  }

  if (
    type.startsWith("community") ||
    pathname === "/community" ||
    pathname.startsWith("/community/") ||
    pathname === "/announcements" ||
    pathname === "/overview"
  ) {
    goToAppTab("Community");
    return;
  }

  if (rawLink.trim()) {
    goToWebPlaceholder(notif.title);
  }
}
