import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { AppTabs } from "./tabs/AppTabs";
import { ProjectDetailScreen } from "../screens/business/ProjectDetailScreen";
import { SafetyInspectionScreen } from "../screens/business/SafetyInspectionScreen";
import { CustomerDetailScreen } from "../screens/customers/CustomerDetailScreen";
import { FleetAssetDetailScreen } from "../screens/fleet/FleetAssetDetailScreen";
import { FleetWorkOrderDetailScreen } from "../screens/fleet/FleetWorkOrderDetailScreen";
import type { RootStackParamList } from "./types";

const Stack = createNativeStackNavigator<RootStackParamList>();

export const RootStackNavigator: React.FC = () => {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="MainTabs" component={AppTabs} />
      <Stack.Screen name="ProjectDetail" component={ProjectDetailScreen} />
      <Stack.Screen name="SafetyInspectionDetail" component={SafetyInspectionScreen} />
      <Stack.Screen name="CustomerDetail" component={CustomerDetailScreen} />
      <Stack.Screen name="FleetAssetDetail" component={FleetAssetDetailScreen} />
      <Stack.Screen name="FleetWorkOrderDetail" component={FleetWorkOrderDetailScreen} />
    </Stack.Navigator>
  );
};
