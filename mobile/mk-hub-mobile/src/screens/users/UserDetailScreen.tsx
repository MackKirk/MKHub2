import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  useFocusEffect,
  useNavigation,
  useRoute,
  type RouteProp
} from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ScreenLayout } from "../../components/ScreenLayout";
import { useAuth } from "../../hooks/useAuth";
import {
  canEditHrUserPermissions,
  canManageHrUserRoles,
  canViewHrJobCompensation,
  canViewHrUserTab
} from "../../lib/permissions";
import {
  displayValue,
  formatHubUserAddress,
  formatHubUserDate,
  formatHubUserPayRate,
  hubUserDisplayName,
  hubUserInitials,
  hubUserPhotoUrl
} from "../../lib/userUi";
import { getUserProfile } from "../../services/users";
import { toApiError } from "../../services/api";
import { MKUserPermissionsSection } from "../../components/users/MKUserPermissionsSection";
import type { RootStackParamList } from "../../navigation/types";
import type {
  HubUserAccount,
  HubUserProfile,
  HrUserTabKey
} from "../../types/users";
import { colors } from "../../theme/colors";
import { spacing } from "../../theme/spacing";
import { radius, shadows } from "../../theme/radius";
import { typography } from "../../theme/typography";

const ACCENT = colors.homeAccent;

type UserDetailRoute = RouteProp<RootStackParamList, "UserDetail">;
type UserDetailNav = NativeStackNavigationProp<RootStackParamList, "UserDetail">;

interface InfoItem {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  href?: string;
}

async function openHref(href: string) {
  try {
    await Linking.openURL(href);
  } catch {
    Alert.alert("Could not open link");
  }
}

export const UserDetailScreen: React.FC = () => {
  const route = useRoute<UserDetailRoute>();
  const navigation = useNavigation<UserDetailNav>();
  const { token, permissions, roles } = useAuth();
  const permissionsSet = useMemo(() => new Set(permissions), [permissions]);

  const canPersonal = canViewHrUserTab(permissionsSet, roles, "personal");
  const canJob = canViewHrUserTab(permissionsSet, roles, "job");
  const canPermissions = canViewHrUserTab(permissionsSet, roles, "permissions");
  const canEditPermissions = canEditHrUserPermissions(permissionsSet, roles);
  const canManageRoles = canManageHrUserRoles(permissionsSet, roles);
  const canCompensation = canViewHrJobCompensation(permissionsSet, roles);

  const availableTabs = useMemo(() => {
    const tabs: Array<{ key: HrUserTabKey; label: string }> = [];
    if (canPersonal) tabs.push({ key: "personal", label: "Personal" });
    if (canJob) tabs.push({ key: "job", label: "Job" });
    if (canPermissions) tabs.push({ key: "permissions", label: "Permissions" });
    return tabs;
  }, [canPersonal, canJob, canPermissions]);

  const [activeTab, setActiveTab] = useState<HrUserTabKey>(
    availableTabs[0]?.key ?? "personal"
  );
  const [account, setAccount] = useState<HubUserAccount | null>(null);
  const [profile, setProfile] = useState<HubUserProfile | null>(null);
  const [supervisorName, setSupervisorName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [permissionsDirty, setPermissionsDirty] = useState(false);

  useEffect(() => {
    if (availableTabs.length === 0) return;
    if (!availableTabs.some((tab) => tab.key === activeTab)) {
      setActiveTab(availableTabs[0].key);
    }
  }, [availableTabs, activeTab]);

  useEffect(() => {
    const unsubscribe = navigation.addListener("beforeRemove", (event) => {
      if (!permissionsDirty) return;
      event.preventDefault();
      Alert.alert(
        "Unsaved changes",
        "You have unsaved permission changes. Discard them?",
        [
          { text: "Stay", style: "cancel" },
          {
            text: "Discard",
            style: "destructive",
            onPress: () => {
              setPermissionsDirty(false);
              navigation.dispatch(event.data.action);
            }
          }
        ]
      );
    });
    return unsubscribe;
  }, [navigation, permissionsDirty]);

  const load = useCallback(async () => {
    if (availableTabs.length === 0) {
      setLoading(false);
      setForbidden(false);
      return;
    }
    try {
      setLoading(true);
      setForbidden(false);
      const data = await getUserProfile(route.params.userId);
      setAccount(data.user);
      setProfile(data.profile);
      const managerId = data.profile?.manager_user_id;
      if (managerId) {
        try {
          const supervisor = await getUserProfile(managerId);
          setSupervisorName(
            hubUserDisplayName({
              ...supervisor.profile,
              username: supervisor.user.username
            })
          );
        } catch {
          setSupervisorName(null);
        }
      } else {
        setSupervisorName(null);
      }
    } catch (err) {
      const apiErr = toApiError(err);
      if (apiErr.status === 403) {
        setForbidden(true);
      } else {
        Alert.alert("Could not load user", apiErr.message);
      }
    } finally {
      setLoading(false);
    }
  }, [availableTabs.length, route.params.userId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const displayName = hubUserDisplayName({
    ...profile,
    name: route.params.title,
    username: account?.username
  });
  const photoUri = hubUserPhotoUrl(
    profile?.profile_photo_file_id,
    token,
    400
  );
  const jobTitle = displayValue(profile?.job_title);
  const active = account?.is_active !== false;

  const personalItems = useMemo((): InfoItem[] => {
    if (!canPersonal) return [];
    const p = profile ?? {};
    const address = formatHubUserAddress(p);
    const items: Array<InfoItem | null> = [
      {
        icon: "person-outline",
        label: "Preferred name",
        value: displayValue(p.preferred_name) ?? ""
      },
      {
        icon: "person-outline",
        label: "First name",
        value: displayValue(p.first_name) ?? ""
      },
      {
        icon: "person-outline",
        label: "Last name",
        value: displayValue(p.last_name) ?? ""
      },
      {
        icon: "person-outline",
        label: "Middle name",
        value: displayValue(p.middle_name) ?? ""
      },
      {
        icon: "at-outline",
        label: "Username",
        value: displayValue(account?.username) ?? ""
      },
      {
        icon: "mail-outline",
        label: "Personal email",
        value: displayValue(account?.email) ?? "",
        href: account?.email ? `mailto:${account.email}` : undefined
      },
      {
        icon: "male-female-outline",
        label: "Gender",
        value: displayValue(p.gender) ?? ""
      },
      {
        icon: "heart-outline",
        label: "Marital status",
        value: displayValue(p.marital_status) ?? ""
      },
      {
        icon: "gift-outline",
        label: "Date of birth",
        value: formatHubUserDate(p.date_of_birth) ?? ""
      },
      {
        icon: "flag-outline",
        label: "Nationality",
        value: displayValue(p.nationality) ?? ""
      },
      {
        icon: "call-outline",
        label: "Phone",
        value: displayValue(p.phone) ?? "",
        href: p.phone ? `tel:${p.phone}` : undefined
      },
      {
        icon: "phone-portrait-outline",
        label: "Mobile",
        value: displayValue(p.mobile_phone) ?? "",
        href: p.mobile_phone ? `tel:${p.mobile_phone}` : undefined
      },
      {
        icon: "location-outline",
        label: "Address",
        value: address ?? ""
      },
      {
        icon: "alert-circle-outline",
        label: "Emergency contact",
        value: displayValue(p.emergency_contact_name) ?? ""
      },
      {
        icon: "people-outline",
        label: "Relationship",
        value: displayValue(p.emergency_contact_relationship) ?? ""
      },
      {
        icon: "call-outline",
        label: "Emergency phone",
        value: displayValue(p.emergency_contact_phone) ?? "",
        href: p.emergency_contact_phone
          ? `tel:${p.emergency_contact_phone}`
          : undefined
      }
    ];
    return items.filter((item): item is InfoItem => Boolean(item && item.value));
  }, [account, canPersonal, profile]);

  const jobItems = useMemo((): InfoItem[] => {
    if (!canJob) return [];
    const p = profile ?? {};
    const departments =
      account?.divisions?.map((d) => d.label).filter(Boolean).join(", ") ||
      displayValue(p.division);
    const items: Array<InfoItem | null> = [
      {
        icon: "briefcase-outline",
        label: "Job title",
        value: jobTitle ?? ""
      },
      {
        icon: "business-outline",
        label: "Departments",
        value: departments ?? ""
      },
      {
        icon: "person-outline",
        label: "Supervisor",
        value: supervisorName ?? ""
      },
      {
        icon: "calendar-outline",
        label: "Hire date",
        value: formatHubUserDate(p.hire_date) ?? ""
      },
      {
        icon: "calendar-clear-outline",
        label: "Termination date",
        value: formatHubUserDate(p.termination_date) ?? ""
      },
      {
        icon: "mail-outline",
        label: "Work email",
        value: displayValue(p.work_email) ?? "",
        href: p.work_email ? `mailto:${p.work_email}` : undefined
      },
      {
        icon: "call-outline",
        label: "Work phone",
        value: displayValue(p.work_phone) ?? "",
        href: p.work_phone ? `tel:${p.work_phone}` : undefined
      }
    ];
    if (canCompensation) {
      items.push(
        {
          icon: "time-outline",
          label: "Employment type",
          value: displayValue(p.employment_type) ?? ""
        },
        {
          icon: "card-outline",
          label: "Pay type",
          value: displayValue(p.pay_type) ?? ""
        },
        {
          icon: "cash-outline",
          label: "Pay rate",
          value: formatHubUserPayRate(p.pay_rate) ?? ""
        }
      );
    }
    return items.filter((item): item is InfoItem => Boolean(item && item.value));
  }, [
    account,
    canCompensation,
    canJob,
    jobTitle,
    profile,
    supervisorName
  ]);

  const items = activeTab === "job" ? jobItems : personalItems;
  const showPermissions = activeTab === "permissions" && canPermissions;
  const showProfileFields = activeTab === "personal" || activeTab === "job";

  return (
    <ScreenLayout scroll={false} style={styles.screen} contentStyle={styles.layout}>
      <View style={styles.topHeader}>
        <Pressable
          style={styles.headerIconBtn}
          onPress={() => navigation.goBack()}
          hitSlop={8}
        >
          <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>
          User
        </Text>
        <View style={styles.headerIconSpacer} />
      </View>

      {loading && !account ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={ACCENT} />
          <Text style={styles.muted}>Loading profile…</Text>
        </View>
      ) : forbidden || availableTabs.length === 0 ? (
        <View style={styles.center}>
          <View style={styles.emptyIcon}>
            <Ionicons name="lock-closed-outline" size={28} color={ACCENT} />
          </View>
          <Text style={styles.emptyTitle}>Access denied</Text>
          <Text style={styles.emptyText}>
            You do not have permission to view this user's information.
          </Text>
        </View>
      ) : (
        <>
          <View style={[styles.hero, showPermissions && styles.heroCompact]}>
            {photoUri ? (
              <Image
                source={{ uri: photoUri }}
                style={[styles.heroPhoto, showPermissions && styles.heroPhotoCompact]}
              />
            ) : (
              <View
                style={[
                  styles.heroPhotoFallback,
                  showPermissions && styles.heroPhotoCompact
                ]}
              >
                <Text style={styles.heroInitials}>
                  {hubUserInitials(displayName)}
                </Text>
              </View>
            )}
            <View style={showPermissions ? styles.heroCopy : undefined}>
              <Text
                style={[styles.heroName, showPermissions && styles.heroNameCompact]}
              >
                {displayName}
              </Text>
              {jobTitle ? (
                <Text
                  style={[styles.heroJob, showPermissions && styles.heroNameCompact]}
                >
                  {jobTitle}
                </Text>
              ) : null}
              <View
                style={[
                  styles.statusChip,
                  active ? styles.statusChipActive : styles.statusChipInactive,
                  showPermissions && styles.statusChipCompact
                ]}
              >
              <Text
                style={[
                  styles.statusChipText,
                  active ? styles.statusChipTextActive : styles.statusChipTextInactive
                ]}
              >
                {active ? "Active" : "Inactive"}
              </Text>
            </View>
            </View>
          </View>

          {availableTabs.length > 1 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.tabs}
              style={styles.tabsWrap}
            >
              {availableTabs.map((tab) => {
                const selected = tab.key === activeTab;
                return (
                  <Pressable
                    key={tab.key}
                    onPress={() => setActiveTab(tab.key)}
                    style={[styles.tab, selected && styles.tabActive]}
                  >
                    <Text
                      style={[styles.tabText, selected && styles.tabTextActive]}
                    >
                      {tab.label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          ) : null}

          {canPermissions ? (
            <View
              style={[
                styles.tabPanel,
                showPermissions ? styles.tabPanelVisible : styles.tabPanelHidden
              ]}
            >
              <MKUserPermissionsSection
                userId={route.params.userId}
                canEdit={canEditPermissions}
                canManageRoles={canManageRoles}
                onDirtyChange={setPermissionsDirty}
              />
            </View>
          ) : null}

          {showProfileFields ? (
            <ScrollView
              style={styles.scroll}
              contentContainerStyle={styles.content}
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.card}>
                {items.length === 0 ? (
                  <Text style={styles.muted}>No information to show.</Text>
                ) : (
                  items.map((item) => (
                    <Pressable
                      key={`${item.label}-${item.value}`}
                      style={styles.infoRow}
                      onPress={item.href ? () => void openHref(item.href!) : undefined}
                      disabled={!item.href}
                    >
                      <View style={styles.infoIcon}>
                        <Ionicons name={item.icon} size={16} color={colors.textMuted} />
                      </View>
                      <View style={styles.infoCopy}>
                        <Text style={styles.infoLabel}>{item.label}</Text>
                        <Text style={styles.infoValue}>{item.value}</Text>
                      </View>
                      {item.href ? (
                        <Ionicons
                          name="open-outline"
                          size={16}
                          color={colors.textMuted}
                        />
                      ) : null}
                    </Pressable>
                  ))
                )}
              </View>
            </ScrollView>
          ) : null}
        </>
      )}
    </ScreenLayout>
  );
};

const styles = StyleSheet.create({
  screen: { backgroundColor: "#fff" },
  layout: {
    flex: 1,
    backgroundColor: "transparent",
    paddingHorizontal: 16,
    paddingBottom: spacing.md
  },
  topHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginBottom: spacing.md
  },
  headerIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center"
  },
  headerIconSpacer: { width: 40, height: 40 },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    fontFamily: typography.button.fontFamily,
    fontSize: 18,
    color: colors.textPrimary
  },
  scroll: { flex: 1 },
  content: { paddingBottom: spacing.xxl, gap: spacing.md },
  tabsWrap: { flexGrow: 0, marginTop: spacing.md, marginBottom: spacing.sm },
  tabPanel: { flex: 1, minHeight: 0 },
  tabPanelVisible: { display: "flex" },
  tabPanelHidden: { display: "none" },
  hero: {
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
    ...shadows.card
  },
  heroCompact: {
    paddingVertical: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md
  },
  heroPhoto: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: "#ECFDF3"
  },
  heroPhotoCompact: {
    width: 48,
    height: 48,
    borderRadius: 24
  },
  heroPhotoFallback: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: "#ECFDF3",
    alignItems: "center",
    justifyContent: "center"
  },
  heroInitials: {
    fontFamily: typography.button.fontFamily,
    fontSize: 28,
    color: ACCENT
  },
  heroName: {
    fontFamily: typography.button.fontFamily,
    fontSize: 20,
    color: colors.textPrimary,
    textAlign: "center"
  },
  heroCopy: { flex: 1, minWidth: 0, gap: 2 },
  heroNameCompact: { textAlign: "left" },
  statusChipCompact: { alignSelf: "flex-start", marginTop: 4 },
  heroJob: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: "center"
  },
  statusChip: {
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4
  },
  statusChipActive: { backgroundColor: "#ECFDF3" },
  statusChipInactive: { backgroundColor: "#F3F4F6" },
  statusChipText: {
    fontFamily: typography.button.fontFamily,
    fontSize: 12
  },
  statusChipTextActive: { color: ACCENT },
  statusChipTextInactive: { color: colors.textMuted },
  tabs: {
    flexDirection: "row",
    gap: spacing.sm,
    paddingRight: spacing.sm
  },
  tab: {
    alignItems: "center",
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "#fff",
    paddingVertical: 8,
    paddingHorizontal: 14
  },
  tabActive: {
    backgroundColor: ACCENT,
    borderColor: ACCENT
  },
  tabText: {
    fontFamily: typography.button.fontFamily,
    fontSize: 13,
    color: colors.textBody
  },
  tabTextActive: { color: "#fff" },
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    ...shadows.card
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border
  },
  infoIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: colors.iconMutedBg,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1
  },
  infoCopy: { flex: 1, minWidth: 0 },
  infoLabel: {
    fontSize: 11,
    color: colors.textMuted,
    marginBottom: 2
  },
  infoValue: {
    fontSize: 14,
    color: colors.textPrimary
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
    gap: spacing.sm
  },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: "#ECFDF3",
    alignItems: "center",
    justifyContent: "center"
  },
  emptyTitle: {
    fontFamily: typography.button.fontFamily,
    fontSize: 16,
    color: colors.textPrimary
  },
  emptyText: {
    ...typography.bodySmall,
    color: colors.textMuted,
    textAlign: "center"
  },
  muted: {
    ...typography.bodySmall,
    color: colors.textMuted,
    paddingVertical: spacing.md,
    textAlign: "center"
  }
});
