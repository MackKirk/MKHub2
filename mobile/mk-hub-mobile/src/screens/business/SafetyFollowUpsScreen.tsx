import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { ScreenLayout } from "../../components/ScreenLayout";
import { MKPageHeader } from "../../components/MKPageHeader";
import { listSafetyFollowUps, type SafetyFollowUp } from "../../services/safety";
import { toApiError } from "../../services/api";
import type { RootStackParamList } from "../../navigation/types";
import { colors } from "../../theme/colors";
import { spacing } from "../../theme/spacing";
import { radius } from "../../theme/radius";
import { typography } from "../../theme/typography";

type Nav = NativeStackNavigationProp<RootStackParamList, "SafetyFollowUps">;

export const SafetyFollowUpsScreen: React.FC = () => {
  const navigation = useNavigation<Nav>();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<SafetyFollowUp[]>([]);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      // All statuses for assignees (hub parity); still scoped to current user
      const data = await listSafetyFollowUps({ assigned_to_me: true });
      setRows(data);
    } catch (err) {
      Alert.alert("Could not load follow-ups", toApiError(err).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  return (
    <ScreenLayout scroll={false}>
      <MKPageHeader
        title="My follow-ups"
        subtitle="Safety flags assigned to you"
        onBack={() => navigation.goBack()}
      />
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <Text style={styles.empty}>No follow-ups assigned to you.</Text>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.row}
              onPress={() =>
                navigation.navigate("SafetyInspectionDetail", {
                  projectId: item.project_id,
                  inspectionId: item.source_inspection_id,
                  canWrite: true,
                  initialFollowUpId: item.id,
                  projectName: item.project_name,
                  projectAddress: item.project_address,
                  projectAddressCity: item.project_address_city,
                  projectAddressProvince: item.project_address_province
                })
              }
            >
              <View style={styles.rowBody}>
                <Text style={styles.rowTitle}>{item.template_name || "Follow-up"}</Text>
                {(item.label || "").trim() ? (
                  <Text style={styles.rowLabel} numberOfLines={1}>
                    {item.label}
                  </Text>
                ) : null}
                <Text style={styles.rowMeta} numberOfLines={1}>
                  {(item.status || "").toLowerCase() === "completed" ? "Completed" : "Pending"}
                  {" · "}
                  {item.project_name || item.project_code || "Project"}
                  {item.source_field_label_snapshot
                    ? ` · ${item.source_field_label_snapshot}`
                    : ""}
                </Text>
                {item.due_date ? (
                  <Text style={styles.due}>Due {item.due_date}</Text>
                ) : null}
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        />
      )}
    </ScreenLayout>
  );
};

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  list: { padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.xl },
  empty: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: "center",
    marginTop: spacing.xl
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm
  },
  rowBody: { flex: 1, minWidth: 0, gap: 2 },
  rowTitle: { ...typography.body, fontWeight: "700", color: colors.text },
  rowLabel: { ...typography.bodySmall, color: "#0284C7", fontWeight: "600" },
  rowMeta: { ...typography.bodySmall, color: colors.textMuted },
  due: { ...typography.bodySmall, color: "#B45309", marginTop: 2 }
});
