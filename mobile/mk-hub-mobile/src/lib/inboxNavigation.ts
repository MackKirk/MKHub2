import { CommonActions } from "@react-navigation/native";
import { navigationRef } from "../navigation/HubMenuProvider";
import type { InboxNotification } from "../types/inbox";

export function goToAppTab(screen: "Clock" | "Tasks" | "Community"): void {
  if (!navigationRef.isReady()) return;
  navigationRef.dispatch(
    CommonActions.navigate({
      name: "App",
      params: {
        screen: "MainTabs",
        params: { screen }
      }
    })
  );
}

export function goToHomeScreen(
  screen: "Schedule" | "Placeholder",
  params?: object
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

export function goToSignPlaceholder(): void {
  goToHomeScreen("Placeholder", {
    title: "To sign",
    message: "Open MK Hub on the web to sign this document."
  });
}

export function openNotificationTarget(notif: InboxNotification): void {
  const type = (notif.type || "").toLowerCase();
  const link = (notif.link || "").toLowerCase();
  if (type === "shift" || link.includes("/schedule")) {
    goToHomeScreen("Schedule");
    return;
  }
  if (type === "task" || link.includes("/tasks")) {
    goToAppTab("Tasks");
    return;
  }
  if (type === "attendance" || link.includes("clock") || link.includes("attendance")) {
    goToAppTab("Clock");
    return;
  }
  if (
    type.startsWith("community") ||
    link.includes("/community")
  ) {
    goToAppTab("Community");
    return;
  }
  if (link.includes("to-sign") || link.includes("onboarding") || link.includes("document")) {
    goToSignPlaceholder();
  }
}
