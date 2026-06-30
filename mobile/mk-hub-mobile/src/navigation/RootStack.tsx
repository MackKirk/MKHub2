import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { AppTabs } from "./tabs/AppTabs";
import { ProjectsListScreen } from "../screens/projects/ProjectsListScreen";
import { ProjectDetailScreen } from "../screens/business/ProjectDetailScreen";
import { ScheduleScreen } from "../screens/schedule/ScheduleScreen";
import { UploadScreen } from "../screens/upload/UploadScreen";
import { PlaceholderScreen } from "../screens/common/PlaceholderScreen";
import type { RootStackParamList } from "./types";

const Stack = createNativeStackNavigator<RootStackParamList>();

export const RootStackNavigator: React.FC = () => {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="MainTabs" component={AppTabs} />
      <Stack.Screen name="ProjectsList" component={ProjectsListScreen} />
      <Stack.Screen name="ProjectDetail" component={ProjectDetailScreen} />
      <Stack.Screen name="Schedule" component={ScheduleScreen} />
      <Stack.Screen name="Upload" component={UploadScreen} />
      <Stack.Screen name="Placeholder" component={PlaceholderScreen} />
    </Stack.Navigator>
  );
};
