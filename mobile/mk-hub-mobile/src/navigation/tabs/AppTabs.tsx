import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { HomeScreen } from "../../screens/home/HomeScreen";
import { ClockScreen } from "../../screens/clock/ClockScreen";
import { UploadScreen } from "../../screens/upload/UploadScreen";
import { TasksScreen } from "../../screens/tasks/TasksScreen";
import { CommunityScreen } from "../../screens/community/CommunityScreen";
import { BusinessScreen } from "../../screens/business/BusinessScreen";
import { ProjectDetailScreen } from "../../screens/business/ProjectDetailScreen";
import { ScheduleScreen } from "../../screens/schedule/ScheduleScreen";
import { colors } from "../../theme/colors";
import { typography } from "../../theme/typography";
import type { ProjectListItem } from "../../types/projects";

export type AppTabParamList = {
  Home: undefined;
  Clock: undefined;
  Upload: undefined;
  Tasks: undefined;
  Community: undefined;
  Business: undefined;
};

export type HomeStackParamList = {
  HomeMain: undefined;
  Business: undefined;
  Schedule: undefined;
  ProjectDetail: { project: ProjectListItem };
};

const HomeStack = createNativeStackNavigator<HomeStackParamList>();

const HomeStackNavigator = () => {
  return (
    <HomeStack.Navigator screenOptions={{ headerShown: false }}>
      <HomeStack.Screen name="HomeMain" component={HomeScreen} />
      <HomeStack.Screen name="Business" component={BusinessScreen} />
      <HomeStack.Screen name="Schedule" component={ScheduleScreen} />
      <HomeStack.Screen name="ProjectDetail" component={ProjectDetailScreen} />
    </HomeStack.Navigator>
  );
};

const Tab = createBottomTabNavigator<AppTabParamList>();

export const AppTabs: React.FC = () => {
  const insets = useSafeAreaInsets();
  
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopWidth: 1,
          borderTopColor: colors.border,
          height: 60 + insets.bottom,
          paddingBottom: insets.bottom + 8,
          paddingTop: 8
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontFamily: typography.buttonSmall.fontFamily
        }
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeStackNavigator}
        options={{
          tabBarLabel: "Home",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home" size={size ?? 24} color={color} />
          )
        }}
      />
      <Tab.Screen
        name="Clock"
        component={ClockScreen}
        options={{
          tabBarLabel: "Clock",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="time" size={size ?? 24} color={color} />
          )
        }}
      />
      <Tab.Screen
        name="Upload"
        component={UploadScreen}
        options={{
          tabBarLabel: "Upload",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="camera" size={size ?? 24} color={color} />
          )
        }}
      />
      <Tab.Screen
        name="Tasks"
        component={TasksScreen}
        options={{
          tabBarLabel: "Tasks",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="checkmark-done" size={size ?? 24} color={color} />
          )
        }}
      />
      <Tab.Screen
        name="Community"
        component={CommunityScreen}
        options={{
          tabBarLabel: "Community",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="people" size={size ?? 24} color={color} />
          )
        }}
      />
    </Tab.Navigator>
  );
};


