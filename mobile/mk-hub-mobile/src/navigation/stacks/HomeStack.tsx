import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { HomeScreen } from "../../screens/home/HomeScreen";
import { ProjectsListScreen } from "../../screens/projects/ProjectsListScreen";
import { ScheduleScreen } from "../../screens/schedule/ScheduleScreen";
import { UploadScreen } from "../../screens/upload/UploadScreen";
import { PlaceholderScreen } from "../../screens/common/PlaceholderScreen";
import { FleetMyAssetsScreen } from "../../screens/fleet/FleetMyAssetsScreen";
import { FleetAssetsListScreen } from "../../screens/fleet/FleetAssetsListScreen";
import { FleetWorkOrdersListScreen } from "../../screens/fleet/FleetWorkOrdersListScreen";
import { FleetScheduleScreen } from "../../screens/fleet/FleetScheduleScreen";
import { FleetInspectionsListScreen } from "../../screens/fleet/FleetInspectionsListScreen";
import { FleetInspectionDetailScreen } from "../../screens/fleet/FleetInspectionDetailScreen";
import { CompanyCreditCardsListScreen } from "../../screens/companyAssets/CompanyCreditCardsListScreen";
import { CustomersListScreen } from "../../screens/customers/CustomersListScreen";
import type { HomeStackParamList } from "../types";

const Stack = createNativeStackNavigator<HomeStackParamList>();

export const HomeStackNavigator: React.FC = () => {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="HomeMain" component={HomeScreen} />
      <Stack.Screen name="Schedule" component={ScheduleScreen} />
      <Stack.Screen name="ProjectsList" component={ProjectsListScreen} />
      <Stack.Screen name="Upload" component={UploadScreen} />
      <Stack.Screen name="Placeholder" component={PlaceholderScreen} />
      <Stack.Screen name="FleetMyAssets" component={FleetMyAssetsScreen} />
      <Stack.Screen name="FleetAssetsList" component={FleetAssetsListScreen} />
      <Stack.Screen name="FleetWorkOrders" component={FleetWorkOrdersListScreen} />
      <Stack.Screen name="FleetSchedule" component={FleetScheduleScreen} />
      <Stack.Screen name="FleetInspections" component={FleetInspectionsListScreen} />
      <Stack.Screen name="CompanyCreditCards" component={CompanyCreditCardsListScreen} />
      <Stack.Screen name="CustomersList" component={CustomersListScreen} />
      <Stack.Screen name="FleetInspectionDetail" component={FleetInspectionDetailScreen} />
    </Stack.Navigator>
  );
};
