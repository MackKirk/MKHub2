import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useNavigation } from "@react-navigation/native";
import { useAuth } from "../../hooks/useAuth";
import { MKCard } from "../../components/MKCard";
import { colors } from "../../theme/colors";
import { spacing } from "../../theme/spacing";
import type { HomeStackParamList } from "../../navigation/tabs/AppTabs";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { CompositeNavigationProp } from "@react-navigation/native";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import type { AppTabParamList } from "../../navigation/tabs/AppTabs";

type HomeNavProp = NativeStackNavigationProp<HomeStackParamList>;
type TabNavProp = BottomTabNavigationProp<AppTabParamList>;
type NavProp = CompositeNavigationProp<HomeNavProp, TabNavProp>;

interface ActionCard {
  icon: string;
  title: string;
  subtitle: string;
  gradient: [string, string];
  onPress: () => void;
}

export const HomeScreen: React.FC = () => {
  const { user } = useAuth();
  const navigation = useNavigation<NavProp>();

  const firstName =
    (user?.first_name && user.first_name.trim()) ||
    (user?.username ?? "there");

  const actions: ActionCard[] = [
    {
      icon: "⏰",
      title: "Clock In / Out",
      subtitle: "One-touch attendance",
      gradient: [colors.primary, colors.primaryDark],
      onPress: () => {
        const parent = navigation.getParent();
        if (parent) {
          (parent as any).navigate("Clock");
        }
      }
    },
    {
      icon: "📅",
      title: "Schedule",
      subtitle: "View your shifts",
      gradient: [colors.primary, colors.primaryDark],
      onPress: () => {
        const parent = navigation.getParent();
        if (parent) {
          (parent as any).navigate("Clock");
        }
      }
    },
    {
      icon: "📸",
      title: "Upload to Project",
      subtitle: "Photos and videos",
      gradient: [colors.primary, colors.primaryDark],
      onPress: () => {
        const parent = navigation.getParent();
        if (parent) {
          (parent as any).navigate("Upload");
        }
      }
    },
    {
      icon: "✅",
      title: "My Tasks",
      subtitle: "See what is assigned",
      gradient: [colors.primary, colors.primaryDark],
      onPress: () => {
        const parent = navigation.getParent();
        if (parent) {
          (parent as any).navigate("Tasks");
        }
      }
    },
    {
      icon: "💼",
      title: "Business",
      subtitle: "Projects & opportunities",
      gradient: [colors.primary, colors.primaryDark],
      onPress: () => navigation.navigate("Business")
    }
  ];

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.greeting}>Welcome back,</Text>
          <Text style={styles.name}>{firstName}!</Text>
          <Text style={styles.subtitle}>Quick actions for your day</Text>
        </View>

        <View style={styles.grid}>
          {actions.map((action, index) => (
            <MKCard
              key={index}
              style={styles.actionCard}
              onPress={action.onPress}
              elevated={true}
            >
              <LinearGradient
                colors={action.gradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.cardGradient}
              >
                <Text style={styles.cardIcon}>{action.icon}</Text>
                <Text style={styles.cardTitle}>{action.title}</Text>
                <Text style={styles.cardSubtitle}>{action.subtitle}</Text>
              </LinearGradient>
            </MKCard>
          ))}
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xxl
  },
  header: {
    marginBottom: spacing.xl
  },
  greeting: {
    fontSize: 24,
    fontWeight: "600",
    color: colors.textMuted,
    marginBottom: spacing.xs
  },
  name: {
    fontSize: 32,
    fontWeight: "800",
    color: colors.primary,
    marginBottom: spacing.sm,
    letterSpacing: 0.5
  },
  subtitle: {
    fontSize: 15,
    color: colors.textMuted,
    marginTop: spacing.xs
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between"
  },
  actionCard: {
    width: "48%",
    marginBottom: spacing.lg,
    padding: 0,
    overflow: "hidden"
  },
  cardGradient: {
    padding: spacing.lg,
    borderRadius: 16,
    alignItems: "center",
    minHeight: 140,
    justifyContent: "center"
  },
  cardIcon: {
    fontSize: 40,
    marginBottom: spacing.md
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#ffffff",
    marginBottom: spacing.xs,
    textAlign: "center"
  },
  cardSubtitle: {
    fontSize: 13,
    color: "#ffffff",
    opacity: 0.9,
    textAlign: "center"
  }
});


