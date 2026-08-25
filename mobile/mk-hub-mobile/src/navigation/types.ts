import type { NavigatorScreenParams } from "@react-navigation/native";
import type { CustomerDetailTabKey } from "../types/customers";
import type { FleetAssetDetailTabKey, FleetListKind, WorkOrderDetailTabKey } from "../types/fleet";
import type { ProjectListItem, ProjectListKind } from "../types/projects";
import type { ProjectQuickTab } from "../components/MKProjectCard";
import type { TaskItem } from "../types/tasks";

export type TimeOffMode = "vacation" | "sick";

export type HomeStackParamList = {
  HomeMain: undefined;
  Schedule: undefined;
  TimeOff: { mode?: TimeOffMode };
  ProjectsList: {
    listKind: ProjectListKind;
    businessLine?: string;
    title: string;
  };
  Placeholder: { title: string; message?: string };
  FleetMyAssets: undefined;
  FleetAssetsList: {
    listKind: FleetListKind;
    title: string;
  };
  FleetWorkOrders: undefined;
  FleetSchedule: undefined;
  FleetInspections: undefined;
  CompanyCreditCards: undefined;
  CustomersList: undefined;
  UsersList: undefined;
  FleetInspectionDetail: {
    scheduleId: string;
  };
};

export type AppTabParamList = {
  Home: NavigatorScreenParams<HomeStackParamList> | undefined;
  Clock: undefined;
  Tasks: undefined;
  Community: undefined;
  More: undefined;
};

export type RootStackParamList = {
  MainTabs: NavigatorScreenParams<AppTabParamList> | undefined;
  ProjectDetail: {
    project: ProjectListItem;
    initialTab?: ProjectQuickTab | "notes" | "documents" | "safety";
  };
  SafetyInspectionDetail: {
    projectId: string;
    inspectionId: string;
  };
  FleetAssetDetail: {
    targetType: "fleet" | "equipment";
    assetId: string;
    title?: string;
    initialTab?: FleetAssetDetailTabKey;
  };
  FleetWorkOrderDetail: {
    workOrderId: string;
    initialTab?: WorkOrderDetailTabKey;
  };
  CustomerDetail: {
    customerId: string;
    title?: string;
    initialTab?: CustomerDetailTabKey;
  };
  TaskDetail: {
    taskId: string;
    task?: TaskItem;
  };
  UserDetail: {
    userId: string;
    title?: string;
  };
};
