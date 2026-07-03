import React from "react";
import { Text } from "react-native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { getFocusedRouteNameFromRoute } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { HomeStackNavigator } from "../stacks/HomeStack";
import { ClockScreen } from "../../screens/clock/ClockScreen";
import { TasksScreen } from "../../screens/tasks/TasksScreen";
import { CommunityScreen } from "../../screens/community/CommunityScreen";
import { colors } from "../../theme/colors";
import { typography } from "../../theme/typography";
import type { AppTabParamList } from "../types";

const Tab = createBottomTabNavigator<AppTabParamList>();

const tabLabelStyle = {
  fontSize: 12,
  fontFamily: typography.buttonSmall.fontFamily
};

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
        tabBarLabelStyle: tabLabelStyle
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeStackNavigator}
        listeners={({ navigation }) => ({
          tabPress: () => {
            navigation.navigate("Home", { screen: "HomeMain" });
          }
        })}
        options={({ route }) => {
          const nestedRoute = getFocusedRouteNameFromRoute(route) ?? "HomeMain";
          const isHomeMain = nestedRoute === "HomeMain";

          return {
            tabBarLabel: ({ focused }) => (
              <Text
                style={[
                  tabLabelStyle,
                  {
                    color:
                      focused && isHomeMain ? colors.primary : colors.textMuted
                  }
                ]}
              >
                Home
              </Text>
            ),
            tabBarIcon: ({ size, focused }) => (
              <Ionicons
                name="home"
                size={size ?? 24}
                color={
                  focused && isHomeMain ? colors.primary : colors.textMuted
                }
              />
            )
          };
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
