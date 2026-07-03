import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { MKBadge } from "../MKBadge";
import { MKButton } from "../MKButton";
import {
  customerDisplayName,
  formatCustomerAddress,
  formatCustomerStatus,
  getCustomerStatusVariant
} from "../../lib/customerUi";
import { colors } from "../../theme/colors";
import { radius } from "../../theme/radius";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";
import type { Customer } from "../../types/customers";

interface MKCustomerHeroProps {
  customer: Customer;
  canEdit: boolean;
  onEdit: () => void;
}

export const MKCustomerHero: React.FC<MKCustomerHeroProps> = ({
  customer,
  canEdit,
  onEdit
}) => {
  const title = customerDisplayName(customer);
  const initials = title
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
  const address = formatCustomerAddress(customer);

  return (
    <View style={styles.hero}>
      <View style={styles.headerRow}>
        <View style={styles.logoCircle}>
          <Text style={styles.logoText}>{initials || "C"}</Text>
        </View>
        <View style={styles.titleWrap}>
          <Text style={styles.title} numberOfLines={2}>
            {title}
          </Text>
          <View style={styles.badgeRow}>
            <MKBadge variant={getCustomerStatusVariant(customer.client_status)}>
              {formatCustomerStatus(customer.client_status)}
            </MKBadge>
            {customer.client_type ? (
              <MKBadge variant="info">{customer.client_type}</MKBadge>
            ) : null}
          </View>
        </View>
      </View>

      {address ? (
        <View style={styles.metaRow}>
          <Ionicons name="location-outline" size={16} color={colors.textMuted} />
          <Text style={styles.metaText} numberOfLines={2}>
            {address}
          </Text>
        </View>
      ) : null}

      {customer.code ? (
        <View style={styles.metaRow}>
          <Ionicons name="barcode-outline" size={16} color={colors.textMuted} />
          <Text style={styles.metaText}>Customer code: {customer.code}</Text>
        </View>
      ) : null}

      {canEdit ? (
        <MKButton title="Edit customer" size="compact" variant="secondary" onPress={onEdit} />
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  hero: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md
  },
  logoCircle: {
    width: 58,
    height: 58,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fef2f2"
  },
  logoText: {
    ...typography.titleSmall,
    color: colors.primary
  },
  titleWrap: {
    flex: 1,
    minWidth: 0,
    gap: spacing.xs
  },
  title: {
    ...typography.title,
    color: colors.textPrimary
  },
  badgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm
  },
  metaText: {
    ...typography.bodySmall,
    color: colors.textBody,
    flex: 1
  }
});
