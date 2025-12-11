import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { colors } from "../../theme/colors";
import { spacing } from "../../theme/spacing";
import { MKButton } from "../../components/MKButton";
import { MKCard } from "../../components/MKCard";
import { useAuth } from "../../hooks/useAuth";
import { getTodayShiftAndAttendance, postAttendance } from "../../services/shifts";
import { toApiError } from "../../services/api";
import type { TodayShiftInfo } from "../../types/shifts";

type ClockStatus = "not_started" | "in_progress" | "completed";

export const ClockScreen: React.FC = () => {
  const { user } = useAuth();
  const [shiftInfo, setShiftInfo] = useState<TodayShiftInfo | null>(null);
  const [status, setStatus] = useState<ClockStatus>("not_started");
  const [loading, setLoading] = useState<boolean>(false);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  const loadData = useCallback(async () => {
    if (!user) {
      return;
    }
    try {
      setLoading(true);
      const info = await getTodayShiftAndAttendance();
      setShiftInfo(info);
      if (!info) {
        setStatus("not_started");
        return;
      }
      if (info.currentAttendance?.clock_in_time && !info.currentAttendance.clock_out_time) {
        setStatus("in_progress");
      } else if (info.currentAttendance?.clock_in_time && info.currentAttendance.clock_out_time) {
        setStatus("completed");
      } else {
        setStatus("not_started");
      }
    } catch (err) {
      const apiError = toApiError(err);
      Alert.alert("Could not load shift", apiError.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleClock = async () => {
    if (!shiftInfo) {
      return;
    }
    const type = status === "not_started" ? "in" : "out";
    try {
      setLoading(true);
      await postAttendance({
        shift_id: shiftInfo.shift.id,
        type,
        time_selected_local: new Date().toISOString()
      });
      await loadData();
    } catch (err) {
      const apiError = toApiError(err);
      Alert.alert("Clock action failed", apiError.message);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const renderStatusLabel = () => {
    if (!shiftInfo) {
      return "No shift scheduled for today.";
    }
    if (status === "not_started") {
      return "Not clocked in.";
    }
    if (status === "in_progress" && shiftInfo.currentAttendance?.clock_in_time) {
      const t = new Date(shiftInfo.currentAttendance.clock_in_time);
      return `Clocked in at ${t.toLocaleTimeString()}`;
    }
    if (status === "completed" && shiftInfo.currentAttendance?.clock_out_time) {
      const t = new Date(shiftInfo.currentAttendance.clock_out_time);
      return `Clocked out at ${t.toLocaleTimeString()}`;
    }
    return "";
  };

  const primaryLabel =
    status === "not_started"
      ? "Clock In"
      : status === "in_progress"
      ? "Clock Out"
      : "Shift Completed";

  const primaryDisabled = !shiftInfo || status === "completed";

  if (loading && !shiftInfo) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading shift information...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.title}>Clock In / Out</Text>
          <Text style={styles.subtitle}>One-touch attendance tracking</Text>
        </View>

        {shiftInfo ? (
          <MKCard style={styles.shiftCard}>
            <View style={styles.shiftHeader}>
              <Text style={styles.shiftIcon}>⏰</Text>
              <View style={styles.shiftHeaderText}>
                <Text style={styles.shiftDate}>{shiftInfo.shift.date}</Text>
                <Text style={styles.shiftTime}>
                  {shiftInfo.shift.start_time} – {shiftInfo.shift.end_time}
                </Text>
              </View>
            </View>

            <View style={styles.divider} />

            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Project</Text>
              <Text style={styles.infoValue}>
                {shiftInfo.project?.name ?? "Unknown"}
              </Text>
            </View>

            {shiftInfo.project?.address ? (
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Address</Text>
                <Text style={styles.infoValue}>{shiftInfo.project.address}</Text>
              </View>
            ) : null}

            <View style={styles.statusContainer}>
              <LinearGradient
                colors={
                  status === "completed"
                    ? ["#50C878", "#3FAF6B"]
                    : status === "in_progress"
                    ? ["#4A90E2", "#357ABD"]
                    : ["#E0E0E0", "#C0C0C0"]
                }
                style={styles.statusBadge}
              >
                <Text style={styles.statusText}>{renderStatusLabel()}</Text>
              </LinearGradient>
            </View>
          </MKCard>
        ) : (
          <MKCard style={styles.noShiftCard}>
            <Text style={styles.noShiftIcon}>📅</Text>
            <Text style={styles.noShiftText}>
              No scheduled shift found for today.
            </Text>
            <Text style={styles.noShiftSubtext}>
              Check your schedule or contact your supervisor.
            </Text>
          </MKCard>
        )}

        <View style={styles.buttonContainer}>
          <MKButton
            title={primaryLabel}
            onPress={handleClock}
            disabled={primaryDisabled}
            loading={loading}
          />
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
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center"
  },
  loadingText: {
    marginTop: spacing.md,
    color: colors.textMuted,
    fontSize: 14
  },
  header: {
    marginBottom: spacing.xl
  },
  title: {
    fontSize: 28,
    fontWeight: "800",
    color: colors.textPrimary,
    marginBottom: spacing.xs,
    letterSpacing: 0.5
  },
  subtitle: {
    fontSize: 15,
    color: colors.textMuted
  },
  shiftCard: {
    marginBottom: spacing.xl
  },
  shiftHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: spacing.md
  },
  shiftIcon: {
    fontSize: 32,
    marginRight: spacing.md
  },
  shiftHeaderText: {
    flex: 1
  },
  shiftDate: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.textPrimary,
    marginBottom: spacing.xs
  },
  shiftTime: {
    fontSize: 15,
    color: colors.textMuted,
    fontWeight: "500"
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.md
  },
  infoRow: {
    marginBottom: spacing.md
  },
  infoLabel: {
    fontSize: 12,
    color: colors.textMuted,
    marginBottom: spacing.xs,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5
  },
  infoValue: {
    fontSize: 16,
    color: colors.textPrimary,
    fontWeight: "500"
  },
  statusContainer: {
    marginTop: spacing.md
  },
  statusBadge: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: 8,
    alignItems: "center"
  },
  statusText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "600"
  },
  noShiftCard: {
    alignItems: "center",
    paddingVertical: spacing.xxl,
    marginBottom: spacing.xl
  },
  noShiftIcon: {
    fontSize: 48,
    marginBottom: spacing.md
  },
  noShiftText: {
    fontSize: 18,
    fontWeight: "600",
    color: colors.textPrimary,
    marginBottom: spacing.xs,
    textAlign: "center"
  },
  noShiftSubtext: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: "center"
  },
  buttonContainer: {
    marginTop: spacing.md
  }
});


