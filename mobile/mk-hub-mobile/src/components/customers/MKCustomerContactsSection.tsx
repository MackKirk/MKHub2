import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { MKBadge } from "../MKBadge";
import { MKButton } from "../MKButton";
import { MKCard } from "../MKCard";
import { colors } from "../../theme/colors";
import { radius } from "../../theme/radius";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";
import type { CustomerContact } from "../../types/customers";

interface MKCustomerContactsSectionProps {
  contacts: CustomerContact[];
  loading: boolean;
  canEdit: boolean;
  onCreate: () => void;
  onEdit: (contact: CustomerContact) => void;
  onDelete: (contact: CustomerContact) => void;
}

export const MKCustomerContactsSection: React.FC<MKCustomerContactsSectionProps> = ({
  contacts,
  loading,
  canEdit,
  onCreate,
  onEdit,
  onDelete
}) => {
  return (
    <View style={styles.stack}>
      <View style={styles.sectionHeader}>
        <View>
          <Text style={styles.sectionTitle}>Contacts</Text>
          <Text style={styles.sectionSubtitle}>
            {loading ? "Loading contacts..." : `${contacts.length} contacts`}
          </Text>
        </View>
        {canEdit ? <MKButton title="New contact" size="compact" onPress={onCreate} /> : null}
      </View>

      {contacts.length === 0 && !loading ? (
        <MKCard style={styles.emptyCard}>
          <Text style={styles.emptyText}>No contacts yet.</Text>
        </MKCard>
      ) : null}

      {contacts.map((contact) => (
        <MKCard key={contact.id} style={styles.contactCard}>
          <View style={styles.contactHeader}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{contact.name.charAt(0).toUpperCase()}</Text>
            </View>
            <View style={styles.contactTitleWrap}>
              <View style={styles.nameRow}>
                <Text style={styles.contactName} numberOfLines={1}>
                  {contact.name}
                </Text>
                {contact.is_primary ? <MKBadge variant="success">Primary</MKBadge> : null}
              </View>
              <Text style={styles.contactRole} numberOfLines={1}>
                {[contact.role_title, contact.department].filter(Boolean).join(" - ") || "Contact"}
              </Text>
            </View>
          </View>

          <ContactLine icon="mail-outline" value={contact.email} />
          <ContactLine icon="call-outline" value={contact.phone} />
          <ContactLine icon="phone-portrait-outline" value={contact.mobile_phone} />
          {contact.notes ? <Text style={styles.notes}>{contact.notes}</Text> : null}

          {canEdit ? (
            <View style={styles.actions}>
              <TouchableOpacity style={styles.action} onPress={() => onEdit(contact)}>
                <Ionicons name="create-outline" size={16} color={colors.primary} />
                <Text style={styles.actionText}>Edit</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.action} onPress={() => onDelete(contact)}>
                <Ionicons name="trash-outline" size={16} color={colors.error} />
                <Text style={[styles.actionText, styles.deleteText]}>Delete</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </MKCard>
      ))}
    </View>
  );
};

function ContactLine({
  icon,
  value
}: {
  icon: keyof typeof Ionicons.glyphMap;
  value?: string | null;
}) {
  if (!value) return null;
  return (
    <View style={styles.contactLine}>
      <Ionicons name={icon} size={15} color={colors.textMuted} />
      <Text style={styles.contactLineText} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: spacing.md
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md
  },
  sectionTitle: {
    ...typography.body,
    fontFamily: typography.button.fontFamily,
    color: colors.textPrimary
  },
  sectionSubtitle: {
    ...typography.caption,
    color: colors.textMuted
  },
  emptyCard: {
    alignItems: "center"
  },
  emptyText: {
    ...typography.bodySmall,
    color: colors.textMuted
  },
  contactCard: {
    gap: spacing.sm
  },
  contactHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fef2f2"
  },
  avatarText: {
    ...typography.subtitle,
    color: colors.primary
  },
  contactTitleWrap: {
    flex: 1,
    minWidth: 0
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs
  },
  contactName: {
    ...typography.body,
    fontFamily: typography.button.fontFamily,
    color: colors.textPrimary,
    flex: 1
  },
  contactRole: {
    ...typography.caption,
    color: colors.textMuted
  },
  contactLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm
  },
  contactLineText: {
    ...typography.bodySmall,
    color: colors.textBody,
    flex: 1
  },
  notes: {
    ...typography.bodySmall,
    color: colors.textMuted
  },
  actions: {
    flexDirection: "row",
    gap: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm
  },
  action: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs
  },
  actionText: {
    ...typography.bodySmall,
    color: colors.primary,
    fontFamily: typography.button.fontFamily
  },
  deleteText: {
    color: colors.error
  }
});
