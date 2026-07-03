import React, { useEffect, useState } from "react";
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { MKButton } from "../MKButton";
import { colors } from "../../theme/colors";
import { radius, shadows } from "../../theme/radius";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";
import type { CustomerSite, CustomerSitePayload } from "../../types/customers";

interface CustomerSiteFormModalProps {
  visible: boolean;
  site?: CustomerSite | null;
  loading?: boolean;
  onClose: () => void;
  onSubmit: (payload: CustomerSitePayload) => void;
}

const clean = (value: string) => value.trim() || null;

export const CustomerSiteFormModal: React.FC<CustomerSiteFormModalProps> = ({
  visible,
  site,
  loading,
  onClose,
  onSubmit
}) => {
  const [siteName, setSiteName] = useState("");
  const [line1, setLine1] = useState("");
  const [line2, setLine2] = useState("");
  const [city, setCity] = useState("");
  const [province, setProvince] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [country, setCountry] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!visible) return;
    setSiteName(site?.site_name ?? "");
    setLine1(site?.site_address_line1 ?? "");
    setLine2(site?.site_address_line2 ?? "");
    setCity(site?.site_city ?? "");
    setProvince(site?.site_province ?? "");
    setPostalCode(site?.site_postal_code ?? "");
    setCountry(site?.site_country ?? "");
    setNotes(site?.site_notes ?? "");
  }, [site, visible]);

  const submit = () => {
    if (!siteName.trim()) {
      Alert.alert("Site name required", "Please enter a site name.");
      return;
    }
    onSubmit({
      site_name: siteName.trim(),
      site_address_line1: clean(line1),
      site_address_line2: clean(line2),
      site_city: clean(city),
      site_province: clean(province),
      site_postal_code: clean(postalCode),
      site_country: clean(country),
      site_notes: clean(notes)
    });
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={styles.backdropFill} onPress={loading ? undefined : onClose} />
        <View style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <Text style={styles.title}>{site ? "Edit site" : "New site"}</Text>
            <Text style={styles.subtitle}>Site name, address and notes</Text>
          </View>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <Field label="Site name *" value={siteName} onChangeText={setSiteName} />
            <Field label="Address line 1" value={line1} onChangeText={setLine1} />
            <Field label="Address line 2" value={line2} onChangeText={setLine2} />
            <View style={styles.row}>
              <Field label="City" value={city} onChangeText={setCity} style={styles.rowField} />
              <Field label="Province" value={province} onChangeText={setProvince} style={styles.rowField} />
            </View>
            <View style={styles.row}>
              <Field label="Postal code" value={postalCode} onChangeText={setPostalCode} style={styles.rowField} />
              <Field label="Country" value={country} onChangeText={setCountry} style={styles.rowField} />
            </View>
            <Field label="Notes" value={notes} onChangeText={setNotes} multiline />
          </ScrollView>
          <View style={styles.actions}>
            <MKButton title="Cancel" variant="secondary" onPress={onClose} disabled={loading} style={styles.actionButton} />
            <MKButton title={site ? "Save" : "Create"} onPress={submit} loading={loading} style={styles.actionButton} />
          </View>
        </View>
      </View>
    </Modal>
  );
};

function Field({
  label,
  value,
  onChangeText,
  style,
  multiline
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  style?: object;
  multiline?: boolean;
}) {
  return (
    <View style={[styles.field, style]}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        style={[styles.input, multiline && styles.textArea]}
        placeholderTextColor={colors.textMuted}
        multiline={multiline}
        textAlignVertical={multiline ? "top" : "center"}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end"
  },
  backdropFill: {
    flex: 1
  },
  sheet: {
    maxHeight: "88%",
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    ...shadows.cardElevated
  },
  sheetHeader: {
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border
  },
  title: {
    ...typography.titleSmall,
    color: colors.textPrimary
  },
  subtitle: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: spacing.xs
  },
  content: {
    padding: spacing.lg,
    gap: spacing.md
  },
  row: {
    flexDirection: "row",
    gap: spacing.md
  },
  rowField: {
    flex: 1
  },
  field: {
    gap: spacing.xs
  },
  label: {
    ...typography.caption,
    color: colors.textMuted,
    textTransform: "uppercase"
  },
  input: {
    ...typography.body,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.control,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.background,
    minHeight: 44
  },
  textArea: {
    minHeight: 90
  },
  actions: {
    flexDirection: "row",
    gap: spacing.sm,
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border
  },
  actionButton: {
    flex: 1
  }
});
