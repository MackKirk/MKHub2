import React from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useHubMenu } from "../../navigation/HubMenuProvider";
import type { CompositeNavigationProp } from "@react-navigation/native";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useAuth } from "../../hooks/useAuth";
import { MKPageHeader } from "../../components/MKPageHeader";
import { ScreenLayout } from "../../components/ScreenLayout";
import { colors } from "../../theme/colors";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";
import { radius } from "../../theme/radius";
import type { AppTabParamList, RootStackParamList } from "../../navigation/types";

type HomeNav = CompositeNavigationProp<
  BottomTabNavigationProp<AppTabParamList, "Home">,
  NativeStackNavigationProp<RootStackParamList>
>;

interface Shortcut {
  label: string;
  icon: string;
  onPress: () => void;
}

export const HomeScreen: React.FC = () => {
  const { user } = useAuth();
  const navigation = useNavigation<HomeNav>();

  const firstName =
    (user?.first_name && user.first_name.trim()) ||
    user?.username ||
    "there";

  const { openMenu } = useHubMenu();

  const goStack = (screen: keyof RootStackParamList, params?: object) => {
    const stackNav = navigation.getParent();
    if (stackNav) {
      stackNav.navigate(screen as never, params as never);
    }
  };

  const shortcuts: Shortcut[] = [
    {
      label: "Projects",
      icon: "🏗️",
      onPress: () =>
        goStack("ProjectsList", {
          listKind: "projects",
          businessLine: "construction",
          title: "Projects"
        })
    },
    {
      label: "Opportunities",
      icon: "📋",
      onPress: () =>
        goStack("ProjectsList", {
          listKind: "opportunities",
          businessLine: "construction",
          title: "Opportunities"
        })
    },
    {
      label: "Schedule",
      icon: "📅",
      onPress: () => goStack("Schedule")
    },
    {
      label: "Clock",
      icon: "⏰",
      onPress: () => navigation.navigate("Clock")
    },
    {
      label: "Tasks",
      icon: "✅",
      onPress: () => navigation.navigate("Tasks")
    },
    {
      label: "Upload",
      icon: "📸",
      onPress: () => goStack("Upload")
    },
    {
      label: "R&M Projects",
      icon: "🔧",
      onPress: () =>
        goStack("ProjectsList", {
          listKind: "projects",
          businessLine: "repairs_maintenance",
          title: "R&M Projects"
        })
    },
    {
      label: "Community",
      icon: "💬",
      onPress: () => navigation.navigate("Community")
    }
  ];

  return (
    <ScreenLayout scroll={false} contentStyle={styles.layout}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <MKPageHeader
          title={`Welcome, ${firstName}`}
          subtitle="Quick shortcuts for your day"
          onMenu={openMenu}
        />

        <View style={styles.grid}>
          {shortcuts.map((item) => (
            <TouchableOpacity
              key={item.label}
              style={styles.tile}
              onPress={item.onPress}
              activeOpacity={0.75}
            >
              <Text style={styles.tileIcon}>{item.icon}</Text>
              <Text style={styles.tileLabel} numberOfLines={2}>
                {item.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity style={styles.menuHint} onPress={openMenu}>
          <Text style={styles.menuHintText}>
            Open the full Hub menu for more sections
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </ScreenLayout>
  );
};

const styles = StyleSheet.create({
  layout: {
    flex: 1
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md
  },
  tile: {
    width: "47%",
    minHeight: 110,
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.md,
    gap: spacing.sm
  },
  tileIcon: {
    fontSize: 32
  },
  tileLabel: {
    ...typography.bodySmall,
    fontFamily: typography.button.fontFamily,
    textAlign: "center",
    color: colors.textPrimary
  },
  menuHint: {
    marginTop: spacing.xl,
    padding: spacing.md,
    alignItems: "center"
  },
  menuHintText: {
    ...typography.caption,
    color: colors.primary
  }
});
