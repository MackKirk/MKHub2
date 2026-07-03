import React, { useEffect, useState } from "react";
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";
import { MKButton } from "../MKButton";
import { colors } from "../../theme/colors";
import { radius, shadows } from "../../theme/radius";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";
import type { Customer, CustomerPayload } from "../../types/customers";

interface CustomerFormModalProps {
  visible: boolean;
  customer?: Customer | null;
  loading?: boolean;
  onClose: () => void;
  onSubmit: (payload: CustomerPayload) => void;
}

const emptyPayload: CustomerPayload = {
  name: "",
  client_status: "active",
  client_type: "",
  billing_same_as_address: false,
  po_required: false
};

const clean = (value: string) => value.trim() || null;

export const CustomerFormModal: React.FC<CustomerFormModalProps> = ({
  visible,
  customer,
  loading,
  onClose,
  onSubmit
}) => {
  const [form, setForm] = useState<CustomerPayload>(emptyPayload);

  useEffect(() => {
    if (!visible) return;
    if (customer) {
      setForm({
        name: customer.name ?? "",
        legal_name: customer.legal_name ?? "",
        display_name: customer.display_name ?? "",
        client_type: customer.client_type ?? "",
        client_status: customer.client_status ?? "active",
        lead_source: customer.lead_source ?? "",
        description: customer.description ?? "",
        address_line1: customer.address_line1 ?? "",
        address_line2: customer.address_line2 ?? "",
        city: customer.city ?? "",
        province: customer.province ?? "",
        postal_code: customer.postal_code ?? "",
        country: customer.country ?? "",
        billing_address_line1: customer.billing_address_line1 ?? "",
        billing_address_line2: customer.billing_address_line2 ?? "",
        billing_city: customer.billing_city ?? "",
        billing_province: customer.billing_province ?? "",
        billing_postal_code: customer.billing_postal_code ?? "",
        billing_country: customer.billing_country ?? "",
        billing_email: customer.billing_email ?? "",
        tax_number: customer.tax_number ?? "",
        billing_same_as_address: Boolean(customer.billing_same_as_address),
        po_required: Boolean(customer.po_required)
      });
      return;
    }
    setForm(emptyPayload);
  }, [customer, visible]);

  const setField = (key: keyof CustomerPayload, value: string | boolean) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const submit = () => {
    if (!form.name.trim()) {
      Alert.alert("Customer name required", "Please enter a customer name.");
      return;
    }
    onSubmit({
      ...form,
      name: form.name.trim(),
      legal_name: clean(String(form.legal_name ?? "")),
      display_name: clean(String(form.display_name ?? "")),
      client_type: clean(String(form.client_type ?? "")),
      client_status: clean(String(form.client_status ?? "")) ?? "active",
      lead_source: clean(String(form.lead_source ?? "")),
      description: clean(String(form.description ?? "")),
      address_line1: clean(String(form.address_line1 ?? "")),
      address_line2: clean(String(form.address_line2 ?? "")),
      city: clean(String(form.city ?? "")),
      province: clean(String(form.province ?? "")),
      postal_code: clean(String(form.postal_code ?? "")),
      country: clean(String(form.country ?? "")),
      billing_address_line1: clean(String(form.billing_address_line1 ?? "")),
      billing_address_line2: clean(String(form.billing_address_line2 ?? "")),
      billing_city: clean(String(form.billing_city ?? "")),
      billing_province: clean(String(form.billing_province ?? "")),
      billing_postal_code: clean(String(form.billing_postal_code ?? "")),
      billing_country: clean(String(form.billing_country ?? "")),
      billing_email: clean(String(form.billing_email ?? "")),
      tax_number: clean(String(form.tax_number ?? ""))
    });
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={styles.backdropFill} onPress={loading ? undefined : onClose} />
        <View style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <Text style={styles.title}>{customer ? "Edit customer" : "New customer"}</Text>
            <Text style={styles.subtitle}>Company, address, and billing basics</Text>
          </View>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <Field label="Name *" value={form.name} onChangeText={(value) => setField("name", value)} />
            <Field label="Display name" value={String(form.display_name ?? "")} onChangeText={(value) => setField("display_name", value)} />
            <Field label="Legal name" value={String(form.legal_name ?? "")} onChangeText={(value) => setField("legal_name", value)} />
            <View style={styles.row}>
              <Field label="Type" value={String(form.client_type ?? "")} onChangeText={(value) => setField("client_type", value)} style={styles.rowField} />
              <Field label="Status" value={String(form.client_status ?? "")} onChangeText={(value) => setField("client_status", value)} style={styles.rowField} />
            </View>
            <Field label="Lead source" value={String(form.lead_source ?? "")} onChangeText={(value) => setField("lead_source", value)} />
            <Field label="Address line 1" value={String(form.address_line1 ?? "")} onChangeText={(value) => setField("address_line1", value)} />
            <Field label="Address line 2" value={String(form.address_line2 ?? "")} onChangeText={(value) => setField("address_line2", value)} />
            <View style={styles.row}>
              <Field label="City" value={String(form.city ?? "")} onChangeText={(value) => setField("city", value)} style={styles.rowField} />
              <Field label="Province" value={String(form.province ?? "")} onChangeText={(value) => setField("province", value)} style={styles.rowField} />
            </View>
            <View style={styles.row}>
              <Field label="Postal code" value={String(form.postal_code ?? "")} onChangeText={(value) => setField("postal_code", value)} style={styles.rowField} />
              <Field label="Country" value={String(form.country ?? "")} onChangeText={(value) => setField("country", value)} style={styles.rowField} />
            </View>
            <Field label="Billing email" value={String(form.billing_email ?? "")} onChangeText={(value) => setField("billing_email", value)} keyboardType="email-address" />
            <Field label="Tax number" value={String(form.tax_number ?? "")} onChangeText={(value) => setField("tax_number", value)} />
            <ToggleRow
              label="Billing same as address"
              value={Boolean(form.billing_same_as_address)}
              onChange={(value) => setField("billing_same_as_address", value)}
            />
            <ToggleRow
              label="PO required"
              value={Boolean(form.po_required)}
              onChange={(value) => setField("po_required", value)}
            />
            <Field
              label="Description"
              value={String(form.description ?? "")}
              onChangeText={(value) => setField("description", value)}
              multiline
            />
          </ScrollView>
          <View style={styles.actions}>
            <MKButton title="Cancel" variant="secondary" onPress={onClose} disabled={loading} style={styles.actionButton} />
            <MKButton title={customer ? "Save" : "Create"} onPress={submit} loading={loading} style={styles.actionButton} />
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
  keyboardType,
  multiline
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  style?: object;
  keyboardType?: "default" | "email-address" | "phone-pad";
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
        keyboardType={keyboardType}
        multiline={multiline}
        textAlignVertical={multiline ? "top" : "center"}
      />
    </View>
  );
}

function ToggleRow({
  label,
  value,
  onChange
}: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <TouchableOpacity style={styles.toggleRow} onPress={() => onChange(!value)}>
      <Text style={styles.toggleLabel}>{label}</Text>
      <View style={[styles.toggle, value && styles.toggleActive]}>
        <Text style={[styles.toggleText, value && styles.toggleTextActive]}>
          {value ? "Yes" : "No"}
        </Text>
      </View>
    </TouchableOpacity>
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
    maxHeight: "92%",
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
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.control,
    padding: spacing.md,
    backgroundColor: colors.background
  },
  toggleLabel: {
    ...typography.bodySmall,
    color: colors.textPrimary,
    flex: 1
  },
  toggle: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    backgroundColor: "#f3f4f6"
  },
  toggleActive: {
    backgroundColor: "#dcfce7"
  },
  toggleText: {
    ...typography.caption,
    color: colors.textMuted,
    fontFamily: typography.button.fontFamily
  },
  toggleTextActive: {
    color: colors.success
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
