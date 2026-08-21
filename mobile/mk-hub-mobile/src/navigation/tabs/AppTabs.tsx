import React from "react";
import { Text, View, StyleSheet } from "react-native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { getFocusedRouteNameFromRoute } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { HomeStackNavigator } from "../stacks/HomeStack";
import { ClockScreen } from "../../screens/clock/ClockScreen";
import { TasksScreen } from "../../screens/tasks/TasksScreen";
import { CommunityScreen } from "../../screens/community/CommunityScreen";
import { useTasksBadge } from "../../hooks/useTasksBadge";
import { useCommunityBadge } from "../../hooks/useCommunityBadge";
import { useHubMenu } from "../HubMenuProvider";
import { colors } from "../../theme/colors";
import { typography } from "../../theme/typography";
import type { AppTabParamList } from "../types";

const Tab = createBottomTabNavigator<AppTabParamList>();
const ACCENT = colors.homeAccent;

const tabLabelStyle = {
  fontSize: 11,
  fontFamily: typography.buttonSmall.fontFamily
};

function badgeValue(count: number): string | number | undefined {
  if (count <= 0) return undefined;
  return count > 99 ? "99+" : count;
}

const badgeStyle = {
  backgroundColor: colors.primary,
  color: "#fff",
  fontSize: 10,
  fontFamily: typography.buttonSmall.fontFamily,
  minWidth: 18,
  height: 18,
  lineHeight: 18,
  borderRadius: 9
};

const MorePlaceholder: React.FC = () => <View style={{ flex: 1, backgroundColor: "#fff" }} />;

function TabGlyph({
  focused,
  color,
  size,
  filled,
  outline
}: {
  focused: boolean;
  color: string;
  size?: number;
  filled: keyof typeof Ionicons.glyphMap;
  outline: keyof typeof Ionicons.glyphMap;
}) {
  return (
    <View style={{ alignItems: "center" }}>
      <View
        style={{
          width: 18,
          height: 3,
          borderRadius: 2,
          marginBottom: 3,
          backgroundColor: focused ? ACCENT : "transparent"
        }}
      />
      <Ionicons
        name={focused ? filled : outline}
        size={size ?? 22}
        color={color}
      />
    </View>
  );
}

export const AppTabs: React.FC = () => {
  const insets = useSafeAreaInsets();
  const { openMenu } = useHubMenu();
  const { openCount: tasksOpenCount } = useTasksBadge();
  const { unreadCount: communityUnreadCount } = useCommunityBadge();

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: ACCENT,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: "#fff",
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: colors.border,
          height: 62 + insets.bottom,
          paddingBottom: insets.bottom + 6,
          paddingTop: 4,
          elevation: 0,
          shadowOpacity: 0
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
          const active = isHomeMain;

          return {
              tabBarLabel: ({ focused }) => (
                <Text
                  style={[
                    tabLabelStyle,
                    {
                      color:
                        focused && active ? ACCENT : colors.textMuted
                    }
                  ]}
                >
                  Home
                </Text>
              ),
              tabBarIcon: ({ size, focused }) => (
                <TabGlyph
                  focused={focused && active}
                  color={focused && active ? ACCENT : colors.textMuted}
                  size={size}
                  filled="home"
                  outline="home-outline"
                />
              )
          };
        }}
      />
      <Tab.Screen
        name="Clock"
        component={ClockScreen}
        options={{
          tabBarLabel: "Time",
          tabBarIcon: ({ color, size, focused }) => (
            <TabGlyph
              focused={focused}
              color={color}
              size={size}
              filled="time"
              outline="time-outline"
            />
          )
        }}
      />
      <Tab.Screen
        name="Tasks"
        component={TasksScreen}
        options={{
          tabBarLabel: "My Tasks",
          tabBarIcon: ({ color, size, focused }) => (
            <TabGlyph
              focused={focused}
              color={color}
              size={size}
              filled="checkmark-done"
              outline="checkmark-done-outline"
            />
          ),
          tabBarBadge: badgeValue(tasksOpenCount),
          tabBarBadgeStyle: badgeStyle
        }}
      />
      <Tab.Screen
        name="Community"
        component={CommunityScreen}
        options={{
          tabBarLabel: "Community",
          tabBarIcon: ({ color, size, focused }) => (
            <TabGlyph
              focused={focused}
              color={color}
              size={size}
              filled="people"
              outline="people-outline"
            />
          ),
          tabBarBadge: badgeValue(communityUnreadCount),
          tabBarBadgeStyle: badgeStyle
        }}
      />
      <Tab.Screen
        name="More"
        component={MorePlaceholder}
        listeners={{
          tabPress: (event) => {
            event.preventDefault();
            openMenu();
          }
        }}
        options={{
          tabBarLabel: "More",
          tabBarIcon: ({ color, size, focused }) => (
            <TabGlyph
              focused={focused}
              color={color}
              size={size}
              filled="ellipsis-horizontal"
              outline="ellipsis-horizontal"
            />
          )
        }}
      />
    </Tab.Navigator>
  );
};
