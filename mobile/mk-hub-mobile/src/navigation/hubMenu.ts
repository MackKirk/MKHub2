import type { RootStackParamList } from "./types";

export type HubMenuTarget =
  | { type: "stack"; screen: keyof RootStackParamList; params?: object }
  | { type: "tab"; screen: "Home" | "Clock" | "Tasks" | "Community" };

export interface HubMenuItem {
  id: string;
  label: string;
  icon: string;
  requiredPermission?: string;
  target: HubMenuTarget;
}

export interface HubMenuCategory {
  id: string;
  label: string;
  icon: string;
  items: HubMenuItem[];
}

export const HUB_MENU_CATEGORIES: HubMenuCategory[] = [
  {
    id: "home",
    label: "Home",
    icon: "home-outline",
    items: [
      {
        id: "home",
        label: "Home",
        icon: "home-outline",
        target: { type: "tab", screen: "Home" }
      }
    ]
  },
  {
    id: "personal",
    label: "Personal",
    icon: "person-outline",
    items: [
      {
        id: "schedule",
        label: "Schedule",
        icon: "calendar-outline",
        target: { type: "stack", screen: "Schedule" }
      },
      {
        id: "clock",
        label: "Clock In/Out",
        icon: "time-outline",
        target: { type: "tab", screen: "Clock" }
      },
      {
        id: "tasks",
        label: "Tasks",
        icon: "checkmark-done-outline",
        target: { type: "tab", screen: "Tasks" }
      },
      {
        id: "upload",
        label: "Upload to Project",
        icon: "camera-outline",
        target: { type: "stack", screen: "Upload" }
      }
    ]
  },
  {
    id: "production",
    label: "Production (Sales)",
    icon: "briefcase-outline",
    items: [
      {
        id: "opportunities",
        label: "Opportunities",
        icon: "document-text-outline",
        requiredPermission: "business:construction:projects:read",
        target: {
          type: "stack",
          screen: "ProjectsList",
          params: {
            listKind: "opportunities",
            businessLine: "construction",
            title: "Opportunities"
          }
        }
      },
      {
        id: "projects",
        label: "Projects",
        icon: "folder-open-outline",
        requiredPermission: "business:construction:projects:read",
        target: {
          type: "stack",
          screen: "ProjectsList",
          params: {
            listKind: "projects",
            businessLine: "construction",
            title: "Projects"
          }
        }
      }
    ]
  },
  {
    id: "repairs",
    label: "Repairs & Maintenance",
    icon: "construct-outline",
    items: [
      {
        id: "rm-opportunities",
        label: "Opportunities",
        icon: "document-text-outline",
        requiredPermission: "business:rm:projects:read",
        target: {
          type: "stack",
          screen: "ProjectsList",
          params: {
            listKind: "opportunities",
            businessLine: "repairs_maintenance",
            title: "R&M Opportunities"
          }
        }
      },
      {
        id: "rm-projects",
        label: "Projects",
        icon: "folder-open-outline",
        requiredPermission: "business:rm:projects:read",
        target: {
          type: "stack",
          screen: "ProjectsList",
          params: {
            listKind: "projects",
            businessLine: "repairs_maintenance",
            title: "R&M Projects"
          }
        }
      }
    ]
  },
  {
    id: "hr",
    label: "Human Resources",
    icon: "people-outline",
    items: [
      {
        id: "community",
        label: "Community",
        icon: "chatbubbles-outline",
        target: { type: "tab", screen: "Community" }
      }
    ]
  }
];
