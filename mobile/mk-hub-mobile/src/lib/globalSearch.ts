import AsyncStorage from "@react-native-async-storage/async-storage";
import { Alert } from "react-native";
import { CommonActions } from "@react-navigation/native";
import { navigationRef } from "../navigation/HubMenuProvider";
import { HUB_MENU_CATEGORIES, type HubMenuItem } from "../navigation/hubMenu";
import { getProjectDetail } from "../services/projects";
import type { GlobalSearchItem, GlobalSearchSection } from "../services/search";
import { hasPermission, isAdminRole } from "./permissions";
import { shouldRegisterHours } from "./hoursRegistration";

const RECENTS_KEY = "mkhub.mobile.globalSearchRecents";
const MAX_RECENTS = 8;

function canAccessProjectLine(
  permissions: Set<string>,
  line: "construction" | "repairs",
  isAdmin: boolean
): boolean {
  if (isAdmin) return true;
  if (line === "construction") {
    return (
      permissions.has("business:construction:projects:read") ||
      permissions.has("business:construction:projects:write") ||
      permissions.has("business:projects:read") ||
      permissions.has("business:projects:write")
    );
  }
  return (
    permissions.has("business:rm:projects:read") ||
    permissions.has("business:rm:projects:write")
  );
}

/** Same visibility rules as web AppShell `canSeeGlobalSearchItem`. */
export function canSeeGlobalSearchItem(
  permissions: Set<string>,
  roles: readonly string[] | null | undefined,
  item: GlobalSearchItem
): boolean {
  const isAdmin = isAdminRole(roles);
  if (item.type === "page") return true;
  if (item.type === "project" || item.type === "opportunity") {
    return (
      canAccessProjectLine(permissions, "construction", isAdmin) ||
      canAccessProjectLine(permissions, "repairs", isAdmin)
    );
  }
  if (item.type === "customer") {
    return hasPermission(permissions, [...(roles ?? [])], "business:customers:read");
  }
  if (item.type === "quote") {
    return hasPermission(permissions, [...(roles ?? [])], "sales:quotations:read");
  }
  if (item.type === "user") {
    return (
      hasPermission(permissions, [...(roles ?? [])], "hr:users:read") ||
      hasPermission(permissions, [...(roles ?? [])], "users:read")
    );
  }
  if (
    item.type === "fleet_asset" ||
    item.type === "equipment" ||
    item.type === "work_order"
  ) {
    return (
      hasPermission(permissions, [...(roles ?? [])], "fleet:access") ||
      hasPermission(permissions, [...(roles ?? [])], "fleet:read")
    );
  }
  if (item.type === "company_credit_card") {
    return hasPermission(permissions, [...(roles ?? [])], "company_cards:read");
  }
  if (item.type === "fuel_card") {
    return hasPermission(permissions, [...(roles ?? [])], "fuel_cards:read");
  }
  return true;
}

function includesInsensitive(hay: string, needle: string): boolean {
  return hay.toLowerCase().includes(needle.toLowerCase());
}

export function localSearchSections(
  query: string,
  permissions: Set<string>,
  roles: readonly string[] | null | undefined,
  opts?: { showClock?: boolean }
): GlobalSearchSection[] {
  const items: GlobalSearchItem[] = [];
  for (const cat of HUB_MENU_CATEGORIES) {
    for (const item of cat.items) {
      if (item.id === "clock" && opts?.showClock === false) continue;
      if (!hasPermission(permissions, [...(roles ?? [])], item.requiredPermission)) {
        continue;
      }
      items.push({
        type: "page",
        id: item.id,
        title: item.label,
        subtitle: cat.label,
        href: `mkhub://menu/${item.id}`
      });
    }
  }
  const q = query.trim();
  const filtered = !q
    ? items
    : items.filter((it) =>
        includesInsensitive(`${it.title} ${it.subtitle || ""}`, q)
      );
  return filtered.length ? [{ id: "pages", label: "Pages", items: filtered }] : [];
}

export async function loadSearchRecents(): Promise<GlobalSearchItem[]> {
  try {
    const raw = await AsyncStorage.getItem(RECENTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(Boolean)
      .map((x: Record<string, unknown>) => ({
        type: String(x.type || "recent"),
        id: String(x.id || x.href || ""),
        title: String(x.title || ""),
        subtitle: x.subtitle != null ? String(x.subtitle) : null,
        code: x.code != null ? String(x.code) : null,
        name: x.name != null ? String(x.name) : null,
        address: x.address != null ? String(x.address) : null,
        href: String(x.href || "")
      }))
      .filter((x: GlobalSearchItem) => x.title && x.href)
      .slice(0, MAX_RECENTS);
  } catch {
    return [];
  }
}

export async function saveSearchRecent(item: GlobalSearchItem): Promise<GlobalSearchItem[]> {
  const next = [
    {
      type: item.type,
      id: item.id,
      title: item.title,
      subtitle: item.subtitle || null,
      code: item.code || null,
      name: item.name || null,
      address: item.address || null,
      href: item.href,
      ts: Date.now()
    },
    ...(await loadSearchRecents()).map((r) => ({
      ...r,
      ts: Date.now() - 1
    }))
  ];
  const seen = new Set<string>();
  const deduped = next.filter((r) => {
    const key = String(r.href || "");
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const trimmed = deduped.slice(0, MAX_RECENTS);
  await AsyncStorage.setItem(RECENTS_KEY, JSON.stringify(trimmed));
  return trimmed.map((r) => ({
    type: String(r.type),
    id: String(r.id),
    title: String(r.title),
    subtitle: r.subtitle,
    code: r.code ?? null,
    name: r.name ?? null,
    address: r.address ?? null,
    href: String(r.href)
  }));
}

function findMenuItem(id: string): HubMenuItem | null {
  for (const cat of HUB_MENU_CATEGORIES) {
    const found = cat.items.find((item) => item.id === id);
    if (found) return found;
  }
  return null;
}

function navigateMenuItem(item: HubMenuItem): void {
  if (!navigationRef.isReady()) return;
  const { target } = item;
  if (target.type === "tab") {
    navigationRef.dispatch(
      CommonActions.navigate({
        name: "App",
        params: {
          screen: "MainTabs",
          params:
            target.screen === "Home"
              ? { screen: "Home", params: { screen: "HomeMain" } }
              : { screen: target.screen }
        }
      })
    );
    return;
  }
  navigationRef.dispatch(
    CommonActions.navigate({
      name: "App",
      params: {
        screen: "MainTabs",
        params: {
          screen: "Home",
          params: {
            screen: target.screen,
            params: target.params
          }
        }
      }
    })
  );
}

function navigateRoot(
  screen: string,
  params?: object
): void {
  if (!navigationRef.isReady()) return;
  navigationRef.dispatch(
    CommonActions.navigate({
      name: "App",
      params: {
        screen,
        params
      }
    })
  );
}

export async function openGlobalSearchItem(item: GlobalSearchItem): Promise<void> {
  await saveSearchRecent(item);

  if (item.type === "page" || item.href.startsWith("mkhub://menu/")) {
    const menuId = item.href.replace("mkhub://menu/", "") || item.id;
    const menuItem = findMenuItem(menuId);
    if (menuItem) {
      navigateMenuItem(menuItem);
      return;
    }
  }

  const href = item.href || "";

  if (
    item.type === "project" ||
    item.type === "opportunity" ||
    /\/(projects|opportunities|rm-projects|rm-opportunities)\//.test(href)
  ) {
    try {
      const project = await getProjectDetail(item.id);
      navigateRoot("ProjectDetail", { project });
    } catch {
      Alert.alert("Could not open", "This project could not be loaded.");
    }
    return;
  }

  if (item.type === "customer" || href.startsWith("/customers/")) {
    navigateRoot("CustomerDetail", {
      customerId: item.id,
      title: item.title
    });
    return;
  }

  if (item.type === "user" || href.startsWith("/users/")) {
    navigateRoot("UserDetail", {
      userId: item.id,
      title: item.title
    });
    return;
  }

  if (item.type === "fleet_asset" || href.startsWith("/fleet/assets/")) {
    navigateRoot("FleetAssetDetail", {
      targetType: "fleet",
      assetId: item.id,
      title: item.title
    });
    return;
  }

  if (item.type === "equipment" || href.includes("/company-assets/equipment/")) {
    navigateRoot("FleetAssetDetail", {
      targetType: "equipment",
      assetId: item.id,
      title: item.title
    });
    return;
  }

  if (item.type === "work_order" || href.includes("/work-orders/") || href.includes("/fleet/work-orders/")) {
    navigateRoot("FleetWorkOrderDetail", {
      workOrderId: item.id
    });
    return;
  }

  if (item.type === "company_credit_card" || href.includes("/credit-cards/")) {
    navigateMenuItem({
      id: "corporate-cards",
      label: "Corporate Cards",
      icon: "card-outline",
      requiredPermission: "company_cards:read",
      target: { type: "stack", screen: "CompanyCreditCards" }
    });
    return;
  }

  Alert.alert(
    "Open on web",
    "This result is available in MK Hub on the web."
  );
}

export function searchShowClock(
  payType: string | null | undefined,
  needsRegisterHours: boolean | null | undefined
): boolean {
  return shouldRegisterHours(payType, needsRegisterHours);
}
