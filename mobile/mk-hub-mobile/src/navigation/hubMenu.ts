import type { HomeStackParamList } from "./types";

export type HubMenuTarget =
  | { type: "stack"; screen: keyof HomeStackParamList; params?: object }
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
        id: "time-off",
        label: "Time Off",
        icon: "sunny-outline",
        target: { type: "stack", screen: "TimeOff", params: { mode: "vacation" } }
      },
      {
        id: "sick-leave",
        label: "Sick Leave",
        icon: "medkit-outline",
        target: { type: "stack", screen: "TimeOff", params: { mode: "sick" } }
      },
      {
        id: "clock",
        label: "Clock In/Out",
        icon: "time-outline",
        target: { type: "tab", screen: "Clock" }
      },
      {
        id: "tasks",
        label: "My Tasks",
        icon: "checkmark-done-outline",
        target: { type: "tab", screen: "Tasks" }
      },
      {
        id: "community",
        label: "Community",
        icon: "chatbubbles-outline",
        target: { type: "tab", screen: "Community" }
      },
      {
        id: "fleet-my-assets",
        label: "My Assets",
        icon: "person-circle-outline",
        requiredPermission: "fleet:access",
        target: { type: "stack", screen: "FleetMyAssets" }
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
    id: "customers",
    label: "Customers",
    icon: "people-outline",
    items: [
      {
        id: "customers-list",
        label: "Customers",
        icon: "people-outline",
        requiredPermission: "business:customers:read",
        target: { type: "stack", screen: "CustomersList" }
      }
    ]
  },
  {
    id: "human-resources",
    label: "Human Resources",
    icon: "people-circle-outline",
    items: [
      {
        id: "users",
        label: "Users",
        icon: "people-outline",
        requiredPermission: "hr:users:read",
        target: { type: "stack", screen: "UsersList" }
      }
    ]
  },
  {
    id: "fleet",
    label: "Fleet Shop",
    icon: "car-outline",
    items: [
      {
        id: "fleet-work-orders",
        label: "Work Orders",
        icon: "clipboard-outline",
        requiredPermission: "work_orders:read",
        target: { type: "stack", screen: "FleetWorkOrders" }
      },
      {
        id: "fleet-schedule",
        label: "Schedule",
        icon: "calendar-outline",
        requiredPermission: "work_orders:read",
        target: { type: "stack", screen: "FleetSchedule" }
      },
      {
        id: "fleet-inspections",
        label: "Inspections",
        icon: "checkbox-outline",
        requiredPermission: "inspections:read",
        target: { type: "stack", screen: "FleetInspections" }
      },
      {
        id: "fleet-vehicles",
        label: "Vehicles",
        icon: "car-outline",
        requiredPermission: "fleet:vehicles:read",
        target: {
          type: "stack",
          screen: "FleetAssetsList",
          params: { listKind: "vehicles", title: "Vehicles" }
        }
      }
    ]
  },
  {
    id: "company-assets",
    label: "Company Assets",
    icon: "cube-outline",
    items: [
      {
        id: "company-equipment",
        label: "Equipment",
        icon: "construct-outline",
        requiredPermission: "equipment:read",
        target: {
          type: "stack",
          screen: "FleetAssetsList",
          params: { listKind: "equipment", title: "Equipment" }
        }
      },
      {
        id: "corporate-cards",
        label: "Corporate Cards",
        icon: "card-outline",
        requiredPermission: "company_cards:read",
        target: { type: "stack", screen: "CompanyCreditCards" }
      }
    ]
  }
];
