import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, useRoute, type RouteProp } from "@react-navigation/native";
import { useHubMenu } from "../../navigation/HubMenuProvider";
import { ScreenLayout } from "../../components/ScreenLayout";
import { colors } from "../../theme/colors";
import { spacing } from "../../theme/spacing";
import { radius, shadows } from "../../theme/radius";
import { typography } from "../../theme/typography";
import { formatDateLocal } from "../../lib/dateUtils";
import { formatShortDate } from "../../services/shifts";
import { toApiError } from "../../services/api";
import {
  cancelMyTimeOffRequest,
  fetchMyTimeOffBalances,
  fetchMyTimeOffHistory,
  fetchMyTimeOffRequests,
  hoursToDays,
  isSickPolicy,
  isVacationPolicy,
  resolvePolicyName,
  submitMyTimeOffRequest
} from "../../services/timeOff";
import type { HomeStackParamList } from "../../navigation/types";
import type {
  TimeOffBalance,
  TimeOffHistoryItem,
  TimeOffRequest
} from "../../types/timeOff";
import { TimeOffRequestModal } from "./TimeOffRequestModal";

const VACATION_ACCENT = "#EA580C";
const SICK_ACCENT = "#DC2626";
const RAIL_WIDTH = 6;

function darkenHex(hex: string, amount = 0.28): string {
  const raw = hex.replace("#", "");
  const n = parseInt(raw, 16);
  const r = Math.max(0, Math.round(((n >> 16) & 255) * (1 - amount)));
  const g = Math.max(0, Math.round(((n >> 8) & 255) * (1 - amount)));
  const b = Math.max(0, Math.round((n & 255) * (1 - amount)));
  return `#${[r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

function statusColor(status: string): string {
  if (status === "approved") return "#166534";
  if (status === "rejected") return "#B91C1C";
  if (status === "cancelled") return colors.textMuted;
  return "#A16207";
}

function statusBg(status: string): string {
  if (status === "approved") return "#DCFCE7";
  if (status === "rejected") return "#FEE2E2";
  if (status === "cancelled") return "#F3F4F6";
  return "#FEF9C3";
}

export const TimeOffScreen: React.FC = () => {
  const { openMenu } = useHubMenu();
  const route = useRoute<RouteProp<HomeStackParamList, "TimeOff">>();
  const mode = route.params?.mode === "sick" ? "sick" : "vacation";
  const isSick = mode === "sick";
  const accent = isSick ? SICK_ACCENT : VACATION_ACCENT;
  const today = formatDateLocal(new Date());

  const [balances, setBalances] = useState<TimeOffBalance[]>([]);
  const [requests, setRequests] = useState<TimeOffRequest[]>([]);
  const [history, setHistory] = useState<TimeOffHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    try {
      const [balanceRows, requestRows, historyRows] = await Promise.all([
        fetchMyTimeOffBalances(),
        fetchMyTimeOffRequests(),
        fetchMyTimeOffHistory()
      ]);
      setBalances(balanceRows);
      setRequests(requestRows);
      setHistory(historyRows);
    } catch (err) {
      Alert.alert("Could not load time off", toApiError(err).message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const vacation = balances.find((row) => isVacationPolicy(row.policy_name));
  const sick = balances.find((row) => isSickPolicy(row.policy_name));
  const vacationDays = hoursToDays(vacation?.balance_hours ?? 0);
  const sickDays = hoursToDays(sick?.balance_hours ?? 0);
  const remainingDays = isSick ? sickDays : vacationDays;
  const policyName = resolvePolicyName(balances, mode);

  const upcoming = useMemo(
    () =>
      [...requests]
        .filter(
          (row) =>
            row.status === "pending" ||
            (row.status === "approved" && row.end_date >= today)
        )
        .sort((a, b) => a.start_date.localeCompare(b.start_date)),
    [requests, today]
  );

  const submit = async (input: {
    startDate: string;
    endDate: string;
    hours: number;
    notes: string;
  }) => {
    try {
      setSubmitting(true);
      await submitMyTimeOffRequest({
        policy_name: policyName,
        start_date: input.startDate,
        end_date: input.endDate,
        hours: input.hours,
        notes: input.notes || undefined
      });
      setModalOpen(false);
      await load();
    } catch (err) {
      Alert.alert("Could not submit request", toApiError(err).message);
    } finally {
      setSubmitting(false);
    }
  };

  const cancel = (row: TimeOffRequest) => {
    Alert.alert("Cancel request", "Cancel this pending request?", [
      { text: "Keep", style: "cancel" },
      {
        text: "Cancel request",
        style: "destructive",
        onPress: () => {
          void (async () => {
            try {
              await cancelMyTimeOffRequest(row.id);
              await load();
            } catch (err) {
              Alert.alert("Could not cancel", toApiError(err).message);
            }
          })();
        }
      }
    ]);
  };

  return (
    <ScreenLayout scroll={false} style={styles.screen} contentStyle={styles.layout}>
      <View style={styles.topHeader}>
        <TouchableOpacity
          style={styles.headerIconBtn}
          onPress={openMenu}
          activeOpacity={0.75}
          hitSlop={8}
        >
          <Ionicons name="menu" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {isSick ? "Sick Leave" : "Time Off"}
        </Text>
        <TouchableOpacity
          style={styles.headerIconBtn}
          onPress={() => setModalOpen(true)}
          activeOpacity={0.75}
          hitSlop={8}
        >
          <Ionicons name="add" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={accent} />
          <Text style={styles.loadingText}>Loading time off…</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                void load();
              }}
              tintColor={accent}
            />
          }
        >
          <View style={styles.heroCard}>
            <LinearGradient
              colors={[darkenHex(accent), accent]}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 1 }}
              style={styles.cardRail}
            />
            <View style={styles.heroBody}>
              <View style={styles.heroTagRow}>
                <View style={styles.heroTagChip}>
                  <Ionicons
                    name={isSick ? "medkit-outline" : "sunny-outline"}
                    size={12}
                    color={accent}
                  />
                  <Text style={[styles.heroTag, { color: accent }]}>
                    {isSick ? "SICK LEAVE" : "VACATION"}
                  </Text>
                </View>
                <Text style={styles.yearText}>{new Date().getFullYear()} balance</Text>
              </View>
              <Text style={styles.scoreValue}>{remainingDays.toFixed(1)}</Text>
              <Text style={styles.scoreLabel}>days remaining</Text>
            </View>
          </View>

          <View style={styles.scoreRow}>
            <View style={styles.miniScore}>
              <Text style={[styles.miniValue, { color: VACATION_ACCENT }]}>
                {vacationDays.toFixed(1)}
              </Text>
              <Text style={styles.miniLabel}>Vacation</Text>
            </View>
            <View style={styles.miniScore}>
              <Text style={[styles.miniValue, { color: SICK_ACCENT }]}>
                {sickDays.toFixed(1)}
              </Text>
              <Text style={styles.miniLabel}>Sick leave</Text>
            </View>
          </View>

          <Pressable
            onPress={() => setModalOpen(true)}
            style={[styles.requestBtn, { backgroundColor: accent }]}
          >
            <Ionicons
              name={isSick ? "medkit-outline" : "sunny-outline"}
              size={18}
              color="#fff"
            />
            <Text style={styles.requestBtnText}>
              {isSick ? "Report sick leave" : "Request time off"}
            </Text>
          </Pressable>

          <Text style={styles.sectionTitle}>Upcoming</Text>
          {upcoming.length === 0 ? (
            <Text style={styles.emptyText}>No upcoming time off.</Text>
          ) : (
            upcoming.map((row) => (
              <View key={row.id} style={styles.listCard}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.listTitle}>{row.policy_name}</Text>
                  <Text style={styles.listMeta}>
                    {formatShortDate(row.start_date)} – {formatShortDate(row.end_date)}
                    {" · "}
                    {hoursToDays(row.hours).toFixed(1)} days
                  </Text>
                  {row.notes ? (
                    <Text style={styles.listNotes} numberOfLines={2}>
                      {row.notes}
                    </Text>
                  ) : null}
                </View>
                <View style={styles.listRight}>
                  <View style={[styles.statusChip, { backgroundColor: statusBg(row.status) }]}>
                    <Text style={[styles.statusText, { color: statusColor(row.status) }]}>
                      {row.status}
                    </Text>
                  </View>
                  {row.status === "pending" ? (
                    <Pressable onPress={() => cancel(row)} hitSlop={6}>
                      <Text style={styles.cancelLink}>Cancel</Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>
            ))
          )}

          <Text style={styles.sectionTitle}>History</Text>
          {history.length === 0 ? (
            <Text style={styles.emptyText}>No history yet.</Text>
          ) : (
            history.slice(0, 8).map((row: TimeOffHistoryItem) => (
              <View key={row.id} style={styles.historyRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.listTitle}>{row.policy_name}</Text>
                  <Text style={styles.listMeta}>
                    {formatShortDate(row.transaction_date)}
                    {row.description ? ` · ${row.description}` : ""}
                  </Text>
                </View>
                <Text style={styles.historyBalance}>
                  {Number(row.balance_after).toFixed(1)} days
                </Text>
              </View>
            ))
          )}
        </ScrollView>
      )}

      <TimeOffRequestModal
        visible={modalOpen}
        mode={mode}
        accent={accent}
        policyName={policyName}
        remainingDays={remainingDays}
        submitting={submitting}
        onClose={() => setModalOpen(false)}
        onSubmit={(input) => {
          void submit(input);
        }}
      />
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
    marginBottom: spacing.lg
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
  headerTitle: {
    flex: 1,
    textAlign: "center",
    fontFamily: typography.button.fontFamily,
    fontSize: 18,
    lineHeight: 24,
    color: colors.textPrimary
  },
  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
  loadingText: { marginTop: spacing.md, ...typography.bodySmall, color: colors.textMuted },
  scroll: { flex: 1 },
  content: { paddingBottom: spacing.xxl, gap: spacing.md },
  heroCard: {
    flexDirection: "row",
    backgroundColor: "#fff",
    borderRadius: 16,
    overflow: "hidden",
    ...shadows.card
  },
  cardRail: { width: RAIL_WIDTH, alignSelf: "stretch" },
  heroBody: { flex: 1, padding: 16 },
  heroTagRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  heroTagChip: { flexDirection: "row", alignItems: "center", gap: 6 },
  heroTag: { fontFamily: typography.button.fontFamily, fontSize: 11, letterSpacing: 0.8 },
  yearText: { fontSize: 12, color: colors.textMuted },
  scoreValue: {
    fontFamily: typography.button.fontFamily,
    fontSize: 40,
    lineHeight: 46,
    color: colors.textPrimary,
    marginTop: 8
  },
  scoreLabel: { fontSize: 14, color: colors.textMuted },
  scoreRow: { flexDirection: "row", gap: spacing.md },
  miniScore: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: spacing.md,
    ...shadows.card
  },
  miniValue: { fontFamily: typography.button.fontFamily, fontSize: 22 },
  miniLabel: { marginTop: 2, fontSize: 13, color: colors.textMuted },
  requestBtn: {
    height: 52,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8
  },
  requestBtnText: { fontFamily: typography.button.fontFamily, fontSize: 16, color: "#fff" },
  sectionTitle: {
    fontFamily: typography.button.fontFamily,
    fontSize: 16,
    color: colors.textPrimary,
    marginTop: spacing.sm
  },
  emptyText: { ...typography.bodySmall, color: colors.textMuted },
  listCard: {
    flexDirection: "row",
    gap: spacing.md,
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: spacing.md,
    ...shadows.card
  },
  listTitle: {
    fontFamily: typography.button.fontFamily,
    fontSize: 15,
    color: colors.textPrimary
  },
  listMeta: { marginTop: 2, fontSize: 13, color: colors.textMuted },
  listNotes: { marginTop: 4, fontSize: 13, color: colors.textBody },
  listRight: { alignItems: "flex-end", gap: 8 },
  statusChip: { borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 4 },
  statusText: {
    fontFamily: typography.button.fontFamily,
    fontSize: 11,
    textTransform: "capitalize"
  },
  cancelLink: { fontFamily: typography.button.fontFamily, fontSize: 12, color: colors.error },
  historyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border
  },
  historyBalance: {
    fontFamily: typography.button.fontFamily,
    fontSize: 14,
    color: colors.textPrimary
  }
});
