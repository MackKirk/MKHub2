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
import type { CustomerContact, CustomerContactPayload } from "../../types/customers";

interface CustomerContactFormModalProps {
  visible: boolean;
  contact?: CustomerContact | null;
  loading?: boolean;
  onClose: () => void;
  onSubmit: (payload: CustomerContactPayload) => void;
}

const clean = (value: string) => value.trim() || null;

export const CustomerContactFormModal: React.FC<CustomerContactFormModalProps> = ({
  visible,
  contact,
  loading,
  onClose,
  onSubmit
}) => {
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [department, setDepartment] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [mobilePhone, setMobilePhone] = useState("");
  const [notes, setNotes] = useState("");
  const [primary, setPrimary] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setName(contact?.name ?? "");
    setRole(contact?.role_title ?? "");
    setDepartment(contact?.department ?? "");
    setEmail(contact?.email ?? "");
    setPhone(contact?.phone ?? "");
    setMobilePhone(contact?.mobile_phone ?? "");
    setNotes(contact?.notes ?? "");
    setPrimary(Boolean(contact?.is_primary));
  }, [contact, visible]);

  const submit = () => {
    if (!name.trim()) {
      Alert.alert("Contact name required", "Please enter a contact name.");
      return;
    }
    onSubmit({
      name: name.trim(),
      role_title: clean(role),
      department: clean(department),
      email: clean(email),
      phone: clean(phone),
      mobile_phone: clean(mobilePhone),
      notes: clean(notes),
      is_primary: primary
    });
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={styles.backdropFill} onPress={loading ? undefined : onClose} />
        <View style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <Text style={styles.title}>{contact ? "Edit contact" : "New contact"}</Text>
            <Text style={styles.subtitle}>Name, role, phone, email and primary contact</Text>
          </View>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <Field label="Name *" value={name} onChangeText={setName} />
            <View style={styles.row}>
              <Field label="Role/title" value={role} onChangeText={setRole} style={styles.rowField} />
              <Field label="Department" value={department} onChangeText={setDepartment} style={styles.rowField} />
            </View>
            <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" />
            <View style={styles.row}>
              <Field label="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" style={styles.rowField} />
              <Field label="Mobile" value={mobilePhone} onChangeText={setMobilePhone} keyboardType="phone-pad" style={styles.rowField} />
            </View>
            <TouchableOpacity style={styles.toggleRow} onPress={() => setPrimary((prev) => !prev)}>
              <Text style={styles.toggleLabel}>Primary contact</Text>
              <View style={[styles.toggle, primary && styles.toggleActive]}>
                <Text style={[styles.toggleText, primary && styles.toggleTextActive]}>
                  {primary ? "Yes" : "No"}
                </Text>
              </View>
            </TouchableOpacity>
            <Field label="Notes" value={notes} onChangeText={setNotes} multiline />
          </ScrollView>
          <View style={styles.actions}>
            <MKButton title="Cancel" variant="secondary" onPress={onClose} disabled={loading} style={styles.actionButton} />
            <MKButton title={contact ? "Save" : "Create"} onPress={submit} loading={loading} style={styles.actionButton} />
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
