import type { NavigatorScreenParams } from "@react-navigation/native";
import type { ProjectListItem, ProjectListKind } from "../types/projects";
import type { ProjectQuickTab } from "../components/MKProjectCard";

export type AppTabParamList = {
  Home: undefined;
  Clock: undefined;
  Tasks: undefined;
  Community: undefined;
};

export type RootStackParamList = {
  MainTabs: NavigatorScreenParams<AppTabParamList> | undefined;
  ProjectsList: {
    listKind: ProjectListKind;
    businessLine?: string;
    title: string;
  };
  ProjectDetail: {
    project: ProjectListItem;
    initialTab?: ProjectQuickTab | "notes";
  };
  Schedule: undefined;
  Upload: undefined;
  Placeholder: { title: string; message?: string };
};
