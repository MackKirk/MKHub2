import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState
} from "react";
import {
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
import {
  createNavigationContainerRef,
  CommonActions
} from "@react-navigation/native";
import { useAuth } from "../hooks/useAuth";
import { hasPermission } from "../lib/permissions";
import { HUB_MENU_CATEGORIES, type HubMenuItem } from "./hubMenu";
import { spacing } from "../theme/spacing";
import { typography } from "../theme/typography";
import { radius } from "../theme/radius";
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

const DRAWER_WIDTH = 280;

export const HubMenuProvider: React.FC<{ children: React.ReactNode }> = ({
  children
}) => {
  const [visible, setVisible] = useState(false);
  const slide = useRef(new Animated.Value(-DRAWER_WIDTH)).current;
  const { permissions, roles, user } = useAuth();
  const permissionsSet = useMemo(() => new Set(permissions), [permissions]);

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

  const displayName =
    user?.first_name?.trim() || user?.username || "User";

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
              { width: DRAWER_WIDTH, transform: [{ translateX: slide }] }
            ]}
          >
            <ScrollView
              contentContainerStyle={styles.scroll}
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.brand}>
                <Text style={styles.brandTitle}>MK Hub</Text>
                <Text style={styles.brandUser}>{displayName}</Text>
              </View>

              {HUB_MENU_CATEGORIES.map((category) => {
                const visibleItems = category.items.filter(canSeeItem);
                if (visibleItems.length === 0) return null;
                return (
                  <View key={category.id} style={styles.category}>
                    <View style={styles.categoryHeader}>
                      <Ionicons
                        name={
                          category.icon as keyof typeof Ionicons.glyphMap
                        }
                        size={16}
                        color="#9ca3af"
                      />
                      <Text style={styles.categoryLabel}>
                        {category.label}
                      </Text>
                    </View>
                    {visibleItems.map((item) => (
                      <TouchableOpacity
                        key={item.id}
                        style={styles.item}
                        onPress={() => navigateTarget(item)}
                      >
                        <Ionicons
                          name={
                            item.icon as keyof typeof Ionicons.glyphMap
                          }
                          size={18}
                          color="#e5e7eb"
                        />
                        <Text style={styles.itemLabel}>{item.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                );
              })}
            </ScrollView>
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
    backgroundColor: "rgba(0,0,0,0.45)"
  },
  backdrop: {
    flex: 1
  },
  panel: {
    backgroundColor: "#111827"
  },
  scroll: {
    paddingBottom: spacing.xxl
  },
  brand: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
    borderBottomWidth: 1,
    borderBottomColor: "#374151"
  },
  brandTitle: {
    ...typography.titleSmall,
    color: "#fff"
  },
  brandUser: {
    ...typography.bodySmall,
    color: "#9ca3af",
    marginTop: spacing.xs
  },
  category: {
    paddingTop: spacing.lg,
    paddingHorizontal: spacing.md
  },
  categoryHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    marginBottom: spacing.sm
  },
  categoryLabel: {
    ...typography.caption,
    color: "#9ca3af",
    textTransform: "uppercase",
    letterSpacing: 1
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radius.control,
    marginBottom: 2
  },
  itemLabel: {
    ...typography.bodySmall,
    color: "#f3f4f6"
  }
});
