import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { CommonActions, useFocusEffect, useNavigation } from "@react-navigation/native";
import { useHubMenu } from "../../navigation/HubMenuProvider";
import type { CompositeNavigationProp } from "@react-navigation/native";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useAuth } from "../../hooks/useAuth";
import { hasPermission } from "../../lib/permissions";
import { MKHomeStyleHeader } from "../../components/MKHomeStyleHeader";
import { MKCard } from "../../components/MKCard";
import { ScreenLayout } from "../../components/ScreenLayout";
import { getCommunityPosts } from "../../services/community";
import type { CommunityPost } from "../../types/community";
import { stripHtmlToPlain } from "../../utils/stripHtml";
import { colors } from "../../theme/colors";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";
import { radius } from "../../theme/radius";
import type { AppTabParamList, HomeStackParamList, RootStackParamList } from "../../navigation/types";

type HomeNav = CompositeNavigationProp<
  NativeStackNavigationProp<HomeStackParamList, "HomeMain">,
  CompositeNavigationProp<
    BottomTabNavigationProp<AppTabParamList>,
    NativeStackNavigationProp<RootStackParamList>
  >
>;

interface QuickAction {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  accentColor: string;
  onPress: () => void;
}

interface BusinessLink {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  requiredPermission?: string;
  onPress: () => void;
}

interface BusinessCard {
  id: string;
  title: string;
  subtitle: string;
  headerIcon: keyof typeof Ionicons.glyphMap;
  accentColor: string;
  requiredPermission: string;
  links: BusinessLink[];
}

const NOVIDADES_PREVIEW_LIMIT = 3;

export const HomeScreen: React.FC = () => {
  const { user, permissions, roles } = useAuth();
  const navigation = useNavigation<HomeNav>();
  const { openMenu } = useHubMenu();

  const permissionsSet = useMemo(() => new Set(permissions), [permissions]);

  const [novidades, setNovidades] = useState<CommunityPost[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loadingNovidades, setLoadingNovidades] = useState(false);

  const firstName =
    (user?.first_name && user.first_name.trim()) ||
    user?.username ||
    "there";

  const goStack = useCallback(
    (screen: keyof HomeStackParamList, params?: object) => {
      navigation.dispatch(CommonActions.navigate({ name: screen, params }));
    },
    [navigation]
  );

  const businessCards: BusinessCard[] = useMemo(
    () => [
      {
        id: "production",
        title: "Production",
        subtitle: "Sales",
        headerIcon: "briefcase-outline",
        accentColor: "#2563eb",
        requiredPermission: "business:construction:projects:read",
        links: [
          {
            label: "Opportunities",
            icon: "document-text-outline",
            onPress: () =>
              goStack("ProjectsList", {
                listKind: "opportunities",
                businessLine: "construction",
                title: "Opportunities"
              })
          },
          {
            label: "Projects",
            icon: "folder-open-outline",
            onPress: () =>
              goStack("ProjectsList", {
                listKind: "projects",
                businessLine: "construction",
                title: "Projects"
              })
          }
        ]
      },
      {
        id: "rm",
        title: "Repairs & Maintenance",
        subtitle: "",
        headerIcon: "construct-outline",
        accentColor: "#d97706",
        requiredPermission: "business:rm:projects:read",
        links: [
          {
            label: "Opportunities",
            icon: "document-text-outline",
            onPress: () =>
              goStack("ProjectsList", {
                listKind: "opportunities",
                businessLine: "repairs_maintenance",
                title: "R&M Opportunities"
              })
          },
          {
            label: "Projects",
            icon: "folder-open-outline",
            onPress: () =>
              goStack("ProjectsList", {
                listKind: "projects",
                businessLine: "repairs_maintenance",
                title: "R&M Projects"
              })
          }
        ]
      },
      {
        id: "customers",
        title: "Customers",
        subtitle: "Customers, contacts & sites",
        headerIcon: "people-outline",
        accentColor: "#be123c",
        requiredPermission: "business:customers:read",
        links: [
          {
            label: "Customers",
            icon: "people-outline",
            requiredPermission: "business:customers:read",
            onPress: () => goStack("CustomersList")
          }
        ]
      },
      {
        id: "fleet-shop",
        title: "Fleet Shop",
        subtitle: "Work orders & vehicles",
        headerIcon: "build-outline",
        accentColor: "#115e59",
        requiredPermission: "fleet:shop:access",
        links: [
          {
            label: "Work Orders",
            icon: "clipboard-outline",
            requiredPermission: "work_orders:read",
            onPress: () => goStack("FleetWorkOrders")
          },
          {
            label: "Schedule",
            icon: "calendar-outline",
            requiredPermission: "work_orders:read",
            onPress: () => goStack("FleetSchedule")
          },
          {
            label: "Inspections",
            icon: "checkbox-outline",
            requiredPermission: "inspections:read",
            onPress: () => goStack("FleetInspections")
          },
          {
            label: "Vehicles",
            icon: "car-outline",
            requiredPermission: "fleet:vehicles:read",
            onPress: () =>
              goStack("FleetAssetsList", {
                listKind: "vehicles",
                title: "Vehicles"
              })
          }
        ]
      },
      {
        id: "company-assets",
        title: "Company Assets",
        subtitle: "Equipment & corporate cards",
        headerIcon: "cube-outline",
        accentColor: "#7c3aed",
        requiredPermission: "company_assets:access",
        links: [
          {
            label: "Equipment",
            icon: "construct-outline",
            requiredPermission: "equipment:read",
            onPress: () =>
              goStack("FleetAssetsList", {
                listKind: "equipment",
                title: "Equipment"
              })
          },
          {
            label: "Corporate Cards",
            icon: "card-outline",
            requiredPermission: "company_cards:read",
            onPress: () => goStack("CompanyCreditCards")
          }
        ]
      }
    ],
    [goStack]
  );

  const visibleBusinessCards = useMemo(
    () =>
      businessCards
        .filter((card) => hasPermission(permissionsSet, roles, card.requiredPermission))
        .filter((card) =>
          card.links.some(
            (link) =>
              !link.requiredPermission ||
              hasPermission(permissionsSet, roles, link.requiredPermission)
          )
        ),
    [businessCards, permissionsSet, roles]
  );

  const quickActions: QuickAction[] = useMemo(() => {
    const actions: QuickAction[] = [
      {
        label: "Schedule",
        icon: "calendar-outline",
        accentColor: "#2563eb",
        onPress: () => goStack("Schedule")
      },
      {
        label: "Clock",
        icon: "time-outline",
        accentColor: "#059669",
        onPress: () => navigation.navigate("Clock")
      },
      {
        label: "Tasks",
        icon: "checkmark-circle-outline",
        accentColor: "#7c3aed",
        onPress: () => navigation.navigate("Tasks")
      },
      {
        label: "Community",
        icon: "chatbubbles-outline",
        accentColor: colors.primary,
        onPress: () => navigation.navigate("Community")
      }
    ];

    if (hasPermission(permissionsSet, roles, "fleet:access")) {
      actions.push({
        label: "My Assets",
        icon: "person-circle-outline",
        accentColor: "#0f766e",
        onPress: () => goStack("FleetMyAssets")
      });
    }

    actions.push({
      label: "Profile",
      icon: "person-outline",
      accentColor: "#64748b",
      onPress: () =>
        goStack("Placeholder", {
          title: "Profile",
          message: "Your profile will be available here soon."
        })
    });

    return actions;
  }, [goStack, navigation, permissionsSet, roles]);

  const loadNovidades = useCallback(async () => {
    try {
      setLoadingNovidades(true);
      const unread = await getCommunityPosts("unread");
      setUnreadCount(unread.length);
      setNovidades(unread.slice(0, NOVIDADES_PREVIEW_LIMIT));
    } catch {
      setNovidades([]);
      setUnreadCount(0);
    } finally {
      setLoadingNovidades(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadNovidades();
    }, [loadNovidades])
  );

  const renderQuickAction = (item: QuickAction) => (
    <TouchableOpacity
      key={item.label}
      style={[styles.shortcut, styles.shortcutCompact]}
      onPress={item.onPress}
      activeOpacity={0.75}
    >
      <View style={[styles.cardAccent, { backgroundColor: item.accentColor }]} />
      <View style={styles.shortcutCompactBody}>
        <Ionicons name={item.icon} size={30} color={item.accentColor} />
        <Text style={styles.shortcutLine1Compact} numberOfLines={1}>
          {item.label}
        </Text>
      </View>
    </TouchableOpacity>
  );

  const renderBusinessCard = (card: BusinessCard) => (
    <View key={card.id} style={styles.businessCard}>
      <View style={[styles.cardAccent, { backgroundColor: card.accentColor }]} />
      <View style={styles.businessCardBody}>
        <View style={styles.businessCardHeader}>
          <Ionicons name={card.headerIcon} size={22} color={card.accentColor} />
          <View style={styles.businessCardTitles}>
            <Text style={styles.businessCardTitle} numberOfLines={1}>
              {card.title}
            </Text>
            {card.subtitle ? (
              <Text style={styles.businessCardSubtitle} numberOfLines={1}>
                {card.subtitle}
              </Text>
            ) : null}
          </View>
        </View>

        <View style={styles.businessLinksRow}>
          {card.links
            .filter(
              (link) =>
                !link.requiredPermission ||
                hasPermission(permissionsSet, roles, link.requiredPermission)
            )
            .map((link) => (
            <TouchableOpacity
              key={link.label}
              style={styles.businessLink}
              onPress={link.onPress}
              activeOpacity={0.75}
            >
              <Ionicons name={link.icon} size={28} color={colors.textPrimary} />
              <Text style={styles.businessLinkLabel} numberOfLines={1}>
                {link.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </View>
  );

  return (
    <ScreenLayout scroll={false} contentStyle={styles.layout}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <MKHomeStyleHeader
          title={`Welcome, ${firstName}`}
          subtitle="Quick shortcuts for your day"
          onLeftPress={openMenu}
        />

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Quick actions</Text>
          <View style={styles.quickGrid}>
            {quickActions.map(renderQuickAction)}
          </View>
        </View>

        {visibleBusinessCards.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Work Areas</Text>
            <View style={styles.businessCardsList}>
              {visibleBusinessCards.map(renderBusinessCard)}
            </View>
          </View>
        ) : null}

        <View style={styles.section}>
          <View style={styles.novidadesHeader}>
            <Text style={styles.sectionTitle}>Community updates</Text>
            {unreadCount > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>
                  {unreadCount > 99 ? "99+" : unreadCount}
                </Text>
              </View>
            )}
          </View>

          {loadingNovidades ? (
            <View style={styles.novidadesLoading}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : novidades.length === 0 ? (
            <View style={styles.novidadesEmpty}>
              <Text style={styles.novidadesEmptyText}>No new community posts</Text>
            </View>
          ) : (
            <View style={styles.novidadesList}>
              {novidades.map((post) => (
                <MKCard
                  key={post.id}
                  style={styles.novidadeCard}
                  onPress={() => navigation.navigate("Community")}
                  elevated
                >
                  <View style={styles.novidadeHeader}>
                    <Text style={styles.novidadeTitle} numberOfLines={1}>
                      {post.title}
                    </Text>
                    <View style={styles.unreadDot} />
                  </View>
                  <Text style={styles.novidadePreview} numberOfLines={2}>
                    {stripHtmlToPlain(post.content)}
                  </Text>
                  <Text style={styles.novidadeMeta}>
                    {post.author_name || "Unknown"} ·{" "}
                    {new Date(post.created_at).toLocaleDateString()}
                  </Text>
                </MKCard>
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </ScreenLayout>
  );
};

const styles = StyleSheet.create({
  layout: {
    flex: 1
  },
  businessCardsList: {
    gap: spacing.md
  },
  businessCard: {
    flexDirection: "row",
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden"
  },
  cardAccent: {
    width: 4
  },
  businessCardBody: {
    flex: 1,
    padding: spacing.md,
    gap: spacing.md
  },
  businessCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm
  },
  businessCardTitles: {
    flex: 1,
    minWidth: 0
  },
  businessCardTitle: {
    ...typography.body,
    fontFamily: typography.button.fontFamily,
    color: colors.textPrimary
  },
  businessCardSubtitle: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 1
  },
  businessLinksRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  businessLink: {
    width: "31%",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    backgroundColor: colors.background,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    minHeight: 88
  },
  businessLinkLabel: {
    ...typography.bodySmall,
    fontFamily: typography.button.fontFamily,
    color: colors.textPrimary,
    textAlign: "center"
  },
  shortcut: {
    width: "47%",
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    minHeight: 72
  },
  shortcutCompact: {
    width: "31%",
    flexDirection: "row",
    alignItems: "stretch",
    overflow: "hidden",
    padding: 0,
    minHeight: 88
  },
  shortcutCompactBody: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    gap: spacing.xs
  },
  shortcutLine1Compact: {
    textTransform: "none",
    letterSpacing: 0,
    ...typography.bodySmall,
    fontFamily: typography.button.fontFamily,
    color: colors.textPrimary,
    textAlign: "center"
  },
  section: {
    marginBottom: spacing.lg
  },
  sectionTitle: {
    ...typography.bodySmall,
    fontFamily: typography.button.fontFamily,
    color: colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: spacing.sm
  },
  quickGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  novidadesHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.sm
  },
  badge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.xs
  },
  badgeText: {
    ...typography.caption,
    color: colors.card,
    fontFamily: typography.button.fontFamily
  },
  novidadesLoading: {
    paddingVertical: spacing.lg,
    alignItems: "center"
  },
  novidadesEmpty: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    alignItems: "center"
  },
  novidadesEmptyText: {
    ...typography.bodySmall,
    color: colors.textMuted
  },
  novidadesList: {
    gap: spacing.sm
  },
  novidadeCard: {
    padding: spacing.md
  },
  novidadeHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    marginBottom: spacing.xs
  },
  novidadeTitle: {
    ...typography.body,
    fontFamily: typography.button.fontFamily,
    color: colors.textPrimary,
    flex: 1
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary
  },
  novidadePreview: {
    ...typography.bodySmall,
    color: colors.textMuted,
    marginBottom: spacing.xs
  },
  novidadeMeta: {
    ...typography.caption,
    color: colors.textMuted
  },
});
