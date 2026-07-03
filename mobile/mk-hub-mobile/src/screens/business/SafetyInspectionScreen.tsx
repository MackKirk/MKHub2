import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  View
} from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ScreenLayout } from "../../components/ScreenLayout";
import { MKPageHeader } from "../../components/MKPageHeader";
import { MKButton } from "../../components/MKButton";
import { MKDynamicSafetyForm } from "../../components/MKDynamicSafetyForm";
import {
  getSafetyInspection,
  updateSafetyInspection
} from "../../services/safety";
import { normalizeDefinition, validateRequiredFields } from "../../lib/safetyFormTemplate";
import { toApiError } from "../../services/api";
import { useAuth } from "../../hooks/useAuth";
import type { RootStackParamList } from "../../navigation/types";
import { colors } from "../../theme/colors";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";

type Route = RouteProp<RootStackParamList, "SafetyInspectionDetail">;
type Nav = NativeStackNavigationProp<RootStackParamList, "SafetyInspectionDetail">;

export const SafetyInspectionScreen: React.FC = () => {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const insets = useSafeAreaInsets();
  const { projectId, inspectionId } = route.params;
  const { token, user } = useAuth();

  const signerDisplayName = useMemo(() => {
    const parts = [user?.first_name, user?.last_name].filter(Boolean);
    if (parts.length > 0) return parts.join(" ");
    return user?.username || user?.email || "";
  }, [user]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [inspection, setInspection] = useState<Awaited<
    ReturnType<typeof getSafetyInspection>
  > | null>(null);
  const [payload, setPayload] = useState<Record<string, unknown>>({});
  const [formOptionsLoading, setFormOptionsLoading] = useState(true);

  const loadInspection = useCallback(async () => {
    try {
      setLoading(true);
      const row = await getSafetyInspection(projectId, inspectionId);
      setInspection(row);
      setPayload(row.form_payload || {});
    } catch (err) {
      Alert.alert("Could not load inspection", toApiError(err).message);
      navigation.goBack();
    } finally {
      setLoading(false);
    }
  }, [projectId, inspectionId, navigation]);

  useEffect(() => {
    loadInspection();
  }, [loadInspection]);

  const definition = useMemo(
    () => normalizeDefinition(inspection?.form_definition_snapshot),
    [inspection?.form_definition_snapshot]
  );

  const readOnly =
    inspection?.status === "finalized" || inspection?.status === "pending_signatures";

  const handleSave = async () => {
    try {
      setSaving(true);
      const row = await updateSafetyInspection(projectId, inspectionId, {
        form_payload: payload
      });
      setInspection(row);
      setPayload(row.form_payload || {});
      Alert.alert("Saved", "Inspection draft saved.");
    } catch (err) {
      Alert.alert("Could not save inspection", toApiError(err).message);
    } finally {
      setSaving(false);
    }
  };

  const handleFinalize = () => {
    const missing = validateRequiredFields(definition, payload);
    if (missing.length > 0) {
      Alert.alert(
        "Missing required fields",
        missing.slice(0, 6).join("\n") + (missing.length > 6 ? "\n..." : "")
      );
      return;
    }

    Alert.alert(
      "Finalize inspection",
      "Submit this inspection? It will be marked finalized and a PDF will be generated.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Finalize",
          onPress: async () => {
            try {
              setFinalizing(true);
              const row = await updateSafetyInspection(projectId, inspectionId, {
                form_payload: payload,
                status: "finalized"
              });
              setInspection(row);
              Alert.alert("Inspection finalized", "The inspection was submitted successfully.");
              navigation.goBack();
            } catch (err) {
              Alert.alert("Could not finalize inspection", toApiError(err).message);
            } finally {
              setFinalizing(false);
            }
          }
        }
      ]
    );
  };

  if (loading || !inspection) {
    return (
      <ScreenLayout>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </ScreenLayout>
    );
  }

  const title =
    inspection.template_name ||
    (inspection.template_version?.startsWith("mki")
      ? "MKI Safety Inspection"
      : "Safety Inspection");

  return (
    <ScreenLayout scroll={false}>
      <MKPageHeader
        title={title}
        subtitle={new Date(inspection.inspection_date).toLocaleString()}
        onBack={() => navigation.goBack()}
      />

      {readOnly ? (
        <View style={styles.readOnlyBanner}>
          <Text style={styles.readOnlyText}>
            This inspection is {inspection.status?.replace("_", " ")} and cannot be edited.
          </Text>
        </View>
      ) : null}

      <View style={styles.formWrap}>
        <MKDynamicSafetyForm
          definition={definition}
          payload={payload}
          onChange={setPayload}
          readOnly={readOnly}
          projectId={projectId}
          inspectionId={inspectionId}
          token={token}
          signerDisplayName={signerDisplayName}
          signerUserId={user?.id}
          onSupportLoadingChange={setFormOptionsLoading}
        />
      </View>

      {!readOnly && !formOptionsLoading ? (
        <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
          <MKButton
            title={saving ? "Saving..." : "Save Draft"}
            variant="secondary"
            onPress={handleSave}
            loading={saving}
            disabled={saving || finalizing}
            style={styles.footerButton}
          />
          <MKButton
            title={finalizing ? "Submitting..." : "Finalize"}
            onPress={handleFinalize}
            loading={finalizing}
            disabled={saving || finalizing}
            style={styles.footerButton}
          />
        </View>
      ) : null}
    </ScreenLayout>
  );
};

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  readOnlyBanner: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: spacing.md,
    marginBottom: spacing.md
  },
  readOnlyText: { ...typography.bodySmall, color: colors.textMuted },
  formWrap: { flex: 1 },
  footer: {
    flexDirection: "row",
    gap: spacing.sm,
    paddingTop: spacing.md
  },
  footerButton: { flex: 1, alignSelf: "stretch" }
});
