import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View
} from "react-native";
import { WebView } from "react-native-webview";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MKButton } from "../../components/MKButton";
import { MKPageHeader } from "../../components/MKPageHeader";
import { MKSignaturePad } from "../../components/signatures/MKSignaturePad";
import { ScreenLayout } from "../../components/ScreenLayout";
import { buildPdfJsViewerHtml } from "../../lib/filePreview";
import {
  fieldHasValue,
  fieldLabel,
  formatSignDateLong,
  localDateYYYYMMDD,
  sortFields
} from "../../lib/signatureFields";
import { File } from "expo-file-system";
import { readCachedFileAsBase64, shareLocalFile } from "../../services/files";
import {
  downloadSignaturePreviewToCache,
  getSigningContext,
  signDocument
} from "../../services/signatures";
import { toApiError } from "../../services/api";
import { useHubMenu } from "../../navigation/HubMenuProvider";
import type { HomeStackParamList } from "../../navigation/types";
import type { SignatureTemplateField, SigningContext } from "../../types/signatures";
import { colors } from "../../theme/colors";
import { radius } from "../../theme/radius";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";

type Nav = NativeStackNavigationProp<HomeStackParamList, "DocumentSign">;
type Route = RouteProp<HomeStackParamList, "DocumentSign">;

export const DocumentSignScreen: React.FC = () => {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { openMenu } = useHubMenu();
  const insets = useSafeAreaInsets();
  const { source, id, title } = route.params;

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [ctx, setCtx] = useState<SigningContext | null>(null);
  const [pdfHtml, setPdfHtml] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [cachedPdf, setCachedPdf] = useState<File | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [blockedReason, setBlockedReason] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [agree, setAgree] = useState(false);
  const [values, setValues] = useState<Record<string, string | boolean>>({});
  const [legacySig, setLegacySig] = useState<string | null>(null);

  const usesTemplate = Boolean(ctx?.uses_template && ctx.signature_template?.fields?.length);
  const fields = useMemo(
    () => sortFields(ctx?.signature_template?.fields ?? []),
    [ctx]
  );

  const openCachedPdf = useCallback(async () => {
    if (!cachedPdf) {
      Alert.alert("PDF unavailable", "Could not open this document on the device.");
      return;
    }
    try {
      await shareLocalFile(cachedPdf, {
        mimeType: "application/pdf",
        dialogTitle: title || ctx?.document_name || "Document"
      });
    } catch (err) {
      Alert.alert("Could not open PDF", toApiError(err).message);
    }
  }, [cachedPdf, ctx?.document_name, title]);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setBlockedReason(null);
      setPreviewError(null);
      setCachedPdf(null);
      const context = await getSigningContext(source, id);
      setCtx(context);
      const hasFields = Boolean(
        context.uses_template && context.signature_template?.fields?.length
      );
      if (source === "document_builder" && !hasFields) {
        setBlockedReason(
          "This document has no signature fields for your role. Ask the sender to fix the template, or open it on the web."
        );
      }
      try {
        const file = await downloadSignaturePreviewToCache(
          source,
          id,
          title || context.document_name
        );
        setCachedPdf(file);
        if (Platform.OS === "ios") {
          setPreviewUrl(file.uri);
          setPdfHtml(null);
        } else {
          try {
            const base64 = await readCachedFileAsBase64(file);
            setPdfHtml(buildPdfJsViewerHtml(base64));
            setPreviewUrl(null);
          } catch {
            setPdfHtml(null);
            setPreviewUrl(null);
            setPreviewError("In-app preview needs network. Use Open PDF instead.");
          }
        }
      } catch {
        setPreviewError("Could not load the PDF preview.");
      }
      const initial: Record<string, string | boolean> = {};
      for (const field of context.signature_template?.fields ?? []) {
        if (field.type === "date") {
          initial[field.id] = localDateYYYYMMDD();
        }
      }
      setValues(initial);
      setLegacySig(null);
      setAgree(false);
    } catch (err) {
      Alert.alert("Could not open document", toApiError(err).message, [
        { text: "OK", onPress: () => navigation.goBack() }
      ]);
    } finally {
      setLoading(false);
    }
  }, [id, navigation, source, title]);

  useEffect(() => {
    void load();
  }, [load]);

  const setField = (fieldId: string, value: string | boolean | null) => {
    setValues((prev) => {
      const next = { ...prev };
      if (value === null || value === undefined) delete next[fieldId];
      else next[fieldId] = value;
      return next;
    });
  };

  const missingRequired = useMemo(() => {
    if (!usesTemplate) return legacySig ? [] : [{ id: "legacy", field_name: "Signature" } as SignatureTemplateField];
    return fields.filter((f) => f.required && !fieldHasValue(f, values));
  }, [fields, legacySig, usesTemplate, values]);

  const handleSign = async () => {
    if (!agree) {
      Alert.alert("Agreement required", 'Check "I have read and agree" before signing.');
      return;
    }
    if (missingRequired.length > 0) {
      Alert.alert(
        "Complete required fields",
        `Still need: ${missingRequired.map((f) => fieldLabel(f)).join(", ")}`
      );
      return;
    }
    try {
      setSubmitting(true);
      if (usesTemplate) {
        const payload: Record<string, unknown> = { ...values };
        for (const field of fields) {
          if (field.type === "date") {
            const raw = String(payload[field.id] ?? "").trim();
            const iso = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : localDateYYYYMMDD();
            payload[field.id] = formatSignDateLong(iso);
          }
          if (field.type === "employee_info") {
            // Let the server fill from profile when blank.
            const raw = payload[field.id];
            if (typeof raw !== "string" || !raw.trim()) delete payload[field.id];
          }
        }
        await signDocument({ source, id, fieldValues: payload });
      } else {
        if (!legacySig) {
          Alert.alert("Signature required", "Add your signature before signing.");
          return;
        }
        await signDocument({
          source,
          id,
          fieldValues: {},
          signatureBase64: legacySig
        });
      }
      Alert.alert("Signed", "Document signed successfully.", [
        { text: "OK", onPress: () => navigation.goBack() }
      ]);
    } catch (err) {
      Alert.alert("Could not sign", toApiError(err).message);
    } finally {
      setSubmitting(false);
    }
  };

  const renderField = (field: SignatureTemplateField) => {
    const label = `${fieldLabel(field)}${field.required ? " *" : ""}`;
    if (field.type === "signature" || field.type === "initials") {
      const current = typeof values[field.id] === "string" ? (values[field.id] as string) : null;
      return (
        <View key={field.id} style={styles.fieldCard}>
          <MKSignaturePad
            label={label}
            value={current}
            onChange={(dataUrl) => setField(field.id, dataUrl)}
          />
        </View>
      );
    }
    if (field.type === "checkbox") {
      return (
        <View key={field.id} style={styles.fieldCard}>
          <View style={styles.agreeRow}>
            <Switch
              value={values[field.id] === true}
              onValueChange={(v) => setField(field.id, v)}
              trackColor={{ true: colors.homeAccent }}
            />
            <Text style={styles.agreeText}>{label}</Text>
          </View>
        </View>
      );
    }
    if (field.type === "employee_info") {
      return (
        <View key={field.id} style={styles.fieldCard}>
          <Text style={styles.fieldLabel}>{label}</Text>
          <Text style={styles.helper}>Filled from your profile when you sign.</Text>
          <TextInput
            style={styles.input}
            value={typeof values[field.id] === "string" ? (values[field.id] as string) : ""}
            onChangeText={(text) => setField(field.id, text)}
            placeholder="Optional override"
            placeholderTextColor={colors.textMuted}
          />
        </View>
      );
    }
    if (field.type === "date") {
      return (
        <View key={field.id} style={styles.fieldCard}>
          <Text style={styles.fieldLabel}>{label}</Text>
          <TextInput
            style={styles.input}
            value={typeof values[field.id] === "string" ? (values[field.id] as string) : ""}
            onChangeText={(text) => setField(field.id, text)}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
          />
        </View>
      );
    }
    return (
      <View key={field.id} style={styles.fieldCard}>
        <Text style={styles.fieldLabel}>{label}</Text>
        <TextInput
          style={[styles.input, field.type === "paragraph" && styles.textArea]}
          value={typeof values[field.id] === "string" ? (values[field.id] as string) : ""}
          onChangeText={(text) => setField(field.id, text)}
          placeholder={field.type === "value" ? "Amount" : "Enter value"}
          placeholderTextColor={colors.textMuted}
          multiline={field.type === "paragraph"}
          keyboardType={field.type === "value" ? "decimal-pad" : "default"}
        />
      </View>
    );
  };

  if (loading) {
    return (
      <ScreenLayout scroll={false}>
        <View style={styles.loading}>
          <ActivityIndicator color={colors.homeAccent} />
          <Text style={styles.loadingText}>Loading document…</Text>
        </View>
      </ScreenLayout>
    );
  }

  return (
    <ScreenLayout scroll={false} contentStyle={styles.screen}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
        keyboardShouldPersistTaps="handled"
      >
        <MKPageHeader
          title="Sign document"
          subtitle={title || ctx?.document_name || "Document"}
          onBack={() => navigation.goBack()}
          onMenu={openMenu}
        />

        <View style={styles.previewActions}>
          <Pressable style={styles.previewToggle} onPress={() => setShowPreview((v) => !v)}>
            <Text style={styles.previewToggleText}>
              {showPreview ? "Hide document preview" : "Review document PDF"}
            </Text>
          </Pressable>
          {cachedPdf ? (
            <Pressable style={styles.previewToggle} onPress={() => void openCachedPdf()}>
              <Text style={styles.previewToggleText}>Open PDF</Text>
            </Pressable>
          ) : null}
        </View>

        {showPreview ? (
          <View style={styles.previewBox}>
            {previewUrl || pdfHtml ? (
              <WebView
                originWhitelist={["*"]}
                source={
                  previewUrl
                    ? { uri: previewUrl }
                    : { html: pdfHtml || "" }
                }
                style={styles.previewWeb}
                allowFileAccess
                allowingReadAccessToURL={previewUrl || undefined}
                onError={() =>
                  setPreviewError("In-app preview failed. Use Open PDF instead.")
                }
              />
            ) : (
              <Text style={styles.helper}>
                {previewError || "Preview unavailable. Use Open PDF."}
              </Text>
            )}
          </View>
        ) : null}
        {previewError && showPreview ? (
          <Text style={styles.helper}>{previewError}</Text>
        ) : null}

        {ctx?.signer_role_label ? (
          <Text style={styles.role}>Signing as {ctx.signer_role_label}</Text>
        ) : null}

        {blockedReason ? (
          <View style={styles.fieldCard}>
            <Text style={styles.blockedTitle}>Cannot sign in the app</Text>
            <Text style={styles.helper}>{blockedReason}</Text>
            <MKButton
              title="Back to signatures"
              variant="accent"
              onPress={() => navigation.navigate("Signatures")}
            />
          </View>
        ) : (
          <>
            {usesTemplate ? (
              fields.map(renderField)
            ) : (
              <View style={styles.fieldCard}>
                <MKSignaturePad
                  label="Your signature *"
                  value={legacySig}
                  onChange={setLegacySig}
                />
              </View>
            )}

            <View style={styles.fieldCard}>
              <View style={styles.agreeRow}>
                <Switch
                  value={agree}
                  onValueChange={setAgree}
                  trackColor={{ true: colors.homeAccent }}
                />
                <Text style={styles.agreeText}>I have read and agree to this document.</Text>
              </View>
            </View>

            <MKButton
              title="Sign document"
              variant="accent"
              onPress={() => void handleSign()}
              loading={submitting}
              disabled={submitting}
            />
          </>
        )}
      </ScrollView>
    </ScreenLayout>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1, paddingBottom: 0 },
  content: { gap: spacing.md },
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm
  },
  loadingText: {
    ...typography.body,
    color: colors.textMuted
  },
  previewActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md
  },
  previewToggle: {
    paddingVertical: spacing.sm
  },
  previewToggleText: {
    ...typography.button,
    color: colors.homeAccent
  },
  blockedTitle: {
    ...typography.titleSmall,
    color: colors.textPrimary
  },
  previewBox: {
    height: 360,
    borderRadius: radius.card,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "#111827"
  },
  previewWeb: { flex: 1 },
  role: {
    ...typography.bodySmall,
    color: colors.textMuted
  },
  fieldCard: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm
  },
  fieldLabel: {
    ...typography.caption,
    color: colors.textMuted,
    textTransform: "uppercase"
  },
  helper: {
    ...typography.bodySmall,
    color: colors.textMuted
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.control,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    ...typography.body,
    color: colors.textPrimary,
    backgroundColor: "#fff"
  },
  textArea: {
    minHeight: 96,
    textAlignVertical: "top"
  },
  agreeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm
  },
  agreeText: {
    ...typography.body,
    color: colors.textPrimary,
    flex: 1
  }
});
