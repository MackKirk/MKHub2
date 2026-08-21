import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState
} from "react";
import {
  Alert,
  Animated,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Constants from "expo-constants";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  createNavigationContainerRef,
  CommonActions
} from "@react-navigation/native";
import { useAuth } from "../hooks/useAuth";
import { useTasksBadge } from "../hooks/useTasksBadge";
import { useCommunityBadge } from "../hooks/useCommunityBadge";
import { hasPermission } from "../lib/permissions";
import { LinearGradient } from "expo-linear-gradient";
import { HUB_MENU_CATEGORIES, type HubMenuItem } from "./hubMenu";
import { spacing } from "../theme/spacing";
import { typography } from "../theme/typography";
import { radius } from "../theme/radius";
import { colors } from "../theme/colors";
import type { NavigatorScreenParams } from "@react-navigation/native";
import type { RootStackParamList } from "./types";

type AppNavigationParamList = {
  Auth: undefined;
  App: NavigatorScreenParams<RootStackParamList> | undefined;
};

export const navigationRef =
  createNavigationContainerRef<AppNavigationParamList>();

interface HubMenuContextValue {
  openMenu: () => void;
  closeMenu: () => void;
}

const HubMenuContext = createContext<HubMenuContextValue | undefined>(
  undefined
);

export const useHubMenu = (): HubMenuContextValue => {
  const ctx = useContext(HubMenuContext);
  if (!ctx) {
    throw new Error("useHubMenu must be used within HubMenuProvider");
  }
  return ctx;
};

const DRAWER_WIDTH = 300;
const ACCENT_RAIL_WIDTH = 8;
const BRAND_RED = "#a31414";
const BRAND_RED_DARK = "#7f1010";

const ROUTE_TO_ITEM: Record<string, string> = {
  HomeMain: "home",
  Clock: "clock",
  Tasks: "tasks",
  Community: "community",
  Schedule: "schedule",
  Upload: "upload",
  CustomersList: "customers-list",
  FleetMyAssets: "fleet-my-assets",
  FleetWorkOrders: "fleet-work-orders",
  FleetSchedule: "fleet-schedule",
  FleetInspections: "fleet-inspections",
  CompanyCreditCards: "corporate-cards"
};

function currentMenuItemId(): string | null {
  if (!navigationRef.isReady()) return null;
  const route = navigationRef.getCurrentRoute();
  if (!route?.name) return null;
  if (route.name === "ProjectsList") {
    const params = route.params as
      | { listKind?: string; businessLine?: string }
      | undefined;
    if (params?.businessLine === "repairs_maintenance") {
      return params.listKind === "opportunities" ? "rm-opportunities" : "rm-projects";
    }
    return params?.listKind === "opportunities" ? "opportunities" : "projects";
  }
  if (route.name === "FleetAssetsList") {
    const params = route.params as { listKind?: string } | undefined;
    return params?.listKind === "equipment" ? "company-equipment" : "fleet-vehicles";
  }
  return ROUTE_TO_ITEM[route.name] ?? null;
}

function userInitials(user: {
  first_name?: string | null;
  last_name?: string | null;
  username?: string;
} | null): string {
  const first = user?.first_name?.trim()?.[0] ?? "";
  const last = user?.last_name?.trim()?.[0] ?? "";
  const fromName = `${first}${last}`.toUpperCase();
  if (fromName) return fromName;
  return (user?.username?.[0] ?? "U").toUpperCase();
}

export const HubMenuProvider: React.FC<{ children: React.ReactNode }> = ({
  children
}) => {
  const [visible, setVisible] = useState(false);
  const slide = useRef(new Animated.Value(-DRAWER_WIDTH)).current;
  const insets = useSafeAreaInsets();
  const { permissions, roles, user, logout } = useAuth();
  const { openCount: tasksOpenCount } = useTasksBadge();
  const { unreadCount: communityUnreadCount } = useCommunityBadge();
  const permissionsSet = useMemo(() => new Set(permissions), [permissions]);
  const activeItemId = visible ? currentMenuItemId() : null;
  const appVersion = Constants.expoConfig?.version ?? "1.0.1";

  const openMenu = useCallback(() => {
    setVisible(true);
    Animated.timing(slide, {
      toValue: 0,
      duration: 220,
      useNativeDriver: true
    }).start();
  }, [slide]);

  const closeMenu = useCallback(() => {
    Animated.timing(slide, {
      toValue: -DRAWER_WIDTH,
      duration: 180,
      useNativeDriver: true
    }).start(({ finished }) => {
      if (finished) setVisible(false);
    });
  }, [slide]);

  const canSeeItem = (item: HubMenuItem) =>
    hasPermission(permissionsSet, roles, item.requiredPermission);

  const navigateTarget = (item: HubMenuItem) => {
    closeMenu();
    if (!navigationRef.isReady()) return;
    const { target } = item;
    if (target.type === "tab") {
      navigationRef.dispatch(
        CommonActions.navigate({
          name: "App",
          params: {
            screen: "MainTabs",
            params:
              target.screen === "Home"
                ? { screen: "Home", params: { screen: "HomeMain" } }
                : { screen: target.screen }
          }
        })
      );
      return;
    }
    navigationRef.dispatch(
      CommonActions.navigate({
        name: "App",
        params: {
          screen: "MainTabs",
          params: {
            screen: "Home",
            params: {
              screen: target.screen,
              params: target.params
            }
          }
        }
      })
    );
  };

  const handleLogout = () => {
    Alert.alert("Log out", "Are you sure you want to log out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Log out",
        style: "destructive",
        onPress: () => {
          closeMenu();
          void logout();
        }
      }
    ]);
  };

  const displayName = [user?.first_name, user?.last_name]
    .filter((part) => part && part.trim())
    .join(" ")
    .trim() || user?.username || "User";

  const value = useMemo(
    () => ({ openMenu, closeMenu }),
    [openMenu, closeMenu]
  );

  return (
    <HubMenuContext.Provider value={value}>
      {children}
      <Modal
        visible={visible}
        transparent
        animationType="none"
        onRequestClose={closeMenu}
        statusBarTranslucent
      >
        <View style={styles.overlay}>
          <Animated.View
            style={[
              styles.panel,
              {
                width: DRAWER_WIDTH,
                transform: [{ translateX: slide }]
              }
            ]}
          >
            <LinearGradient
              colors={[BRAND_RED_DARK, BRAND_RED, BRAND_RED_DARK]}
              locations={[0, 0.45, 1]}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 1 }}
              style={styles.accentRail}
            />
            <View
              style={[
                styles.panelBody,
                {
                  paddingTop: Math.max(insets.top, spacing.md),
                  paddingBottom: Math.max(insets.bottom, spacing.md)
                }
              ]}
            >
            <View style={styles.brand}>
              <Text style={styles.brandTitle}>MK HUB</Text>
              <TouchableOpacity
                style={styles.closeBtn}
                onPress={closeMenu}
                hitSlop={8}
              >
                <Ionicons name="close" size={20} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.scroll}
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
            >
              {HUB_MENU_CATEGORIES.map((category) => {
                const visibleItems = category.items.filter(canSeeItem);
                if (visibleItems.length === 0) return null;
                return (
                  <View key={category.id} style={styles.category}>
                    <Text style={styles.categoryLabel}>{category.label}</Text>
                    {visibleItems.map((item) => {
                      const active = item.id === activeItemId;
                      return (
                        <TouchableOpacity
                          key={item.id}
                          style={[styles.item, active && styles.itemActive]}
                          onPress={() => navigateTarget(item)}
                        >
                          <Ionicons
                            name={
                              item.icon as keyof typeof Ionicons.glyphMap
                            }
                            size={18}
                            color={active ? colors.primary : colors.textBody}
                          />
                          <Text
                            style={[
                              styles.itemLabel,
                              active && styles.itemLabelActive
                            ]}
                          >
                            {item.label}
                          </Text>
                          {item.id === "tasks" && tasksOpenCount > 0 ? (
                            <View style={styles.menuBadge}>
                              <Text style={styles.menuBadgeText}>
                                {tasksOpenCount > 99 ? "99+" : tasksOpenCount}
                              </Text>
                            </View>
                          ) : null}
                          {item.id === "community" && communityUnreadCount > 0 ? (
                            <View style={styles.menuBadge}>
                              <Text style={styles.menuBadgeText}>
                                {communityUnreadCount > 99
                                  ? "99+"
                                  : communityUnreadCount}
                              </Text>
                            </View>
                          ) : null}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                );
              })}
            </ScrollView>

            <View style={styles.footer}>
              <View style={styles.userCard}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{userInitials(user)}</Text>
                </View>
                <View style={styles.userCopy}>
                  <Text style={styles.userName} numberOfLines={1}>
                    {displayName}
                  </Text>
                  <Text style={styles.userHint} numberOfLines={1}>
                    {user?.email || user?.username || ""}
                  </Text>
                </View>
              </View>

              <TouchableOpacity style={styles.logoutItem} onPress={handleLogout}>
                <Ionicons
                  name="log-out-outline"
                  size={18}
                  color={colors.primary}
                />
                <Text style={styles.logoutLabel}>Logout</Text>
              </TouchableOpacity>

              <Text style={styles.version}>MK Hub v{appVersion}</Text>
            </View>
            </View>
          </Animated.View>
          <Pressable style={styles.backdrop} onPress={closeMenu} />
        </View>
      </Modal>
    </HubMenuContext.Provider>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    flexDirection: "row",
    backgroundColor: "rgba(15, 23, 42, 0.4)"
  },
  backdrop: {
    flex: 1
  },
  panel: {
    backgroundColor: colors.card,
    height: "100%",
    flexDirection: "row",
    overflow: "hidden"
  },
  accentRail: {
    width: ACCENT_RAIL_WIDTH,
    height: "100%"
  },
  panelBody: {
    flex: 1
  },
  brand: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md
  },
  brandTitle: {
    ...typography.titleSmall,
    color: colors.textPrimary,
    letterSpacing: 0.6
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.iconMutedBg,
    alignItems: "center",
    justifyContent: "center"
  },
  scroll: {
    flex: 1
  },
  scrollContent: {
    paddingBottom: spacing.md
  },
  category: {
    paddingTop: spacing.md,
    paddingHorizontal: spacing.md
  },
  categoryLabel: {
    ...typography.caption,
    color: colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 1,
    paddingHorizontal: spacing.sm,
    marginBottom: spacing.sm
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    marginBottom: 2
  },
  itemActive: {
    backgroundColor: colors.drawerActiveBg
  },
  itemLabel: {
    ...typography.bodySmall,
    color: colors.textPrimary,
    flex: 1
  },
  itemLabelActive: {
    color: colors.primary,
    fontFamily: typography.button.fontFamily
  },
  menuBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 6,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center"
  },
  menuBadgeText: {
    color: "#fff",
    fontSize: 10,
    fontFamily: typography.button.fontFamily,
    lineHeight: 13
  },
  footer: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    gap: spacing.sm
  },
  userCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.background,
    borderRadius: radius.md,
    padding: spacing.md
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.drawerActiveBg,
    alignItems: "center",
    justifyContent: "center"
  },
  avatarText: {
    ...typography.bodySmall,
    fontFamily: typography.button.fontFamily,
    color: colors.primary
  },
  userCopy: {
    flex: 1,
    minWidth: 0
  },
  userName: {
    ...typography.bodySmall,
    fontFamily: typography.button.fontFamily,
    color: colors.textPrimary
  },
  userHint: {
    ...typography.caption,
    color: colors.textMuted
  },
  logoutItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm
  },
  logoutLabel: {
    ...typography.bodySmall,
    fontFamily: typography.button.fontFamily,
    color: colors.primary
  },
  version: {
    ...typography.caption,
    color: colors.textMuted,
    paddingHorizontal: spacing.sm
  }
});
