import React from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import {
  extractProposalPricingItems,
  pricingItemAmount,
  pricingItemLabel,
  type ProposalPricingItem
} from "../lib/projectFeatures";
import { MKCard } from "./MKCard";
import { colors } from "../theme/colors";
import { spacing } from "../theme/spacing";
import { typography } from "../theme/typography";

interface MKProjectPricingSectionProps {
  loading: boolean;
  proposalDetail: { data?: { additional_costs?: ProposalPricingItem[] } } | null;
}

const formatCurrency = (value: number): string =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(value);

export const MKProjectPricingSection: React.FC<MKProjectPricingSectionProps> = ({
  loading,
  proposalDetail
}) => {
  const items = extractProposalPricingItems(proposalDetail);
  const total = items.reduce((sum, item) => sum + pricingItemAmount(item), 0);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Pricing</Text>
        <Text style={styles.subtitle}>
          Pricing line items from the latest proposal. Read only on mobile.
        </Text>
      </View>

      <MKCard style={styles.card} elevated>
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="small" color={colors.primary} />
          </View>
        ) : items.length === 0 ? (
          <Text style={styles.emptyText}>No pricing items yet.</Text>
        ) : (
          <>
            {items.map((item, index) => (
              <View key={`${pricingItemLabel(item)}-${index}`} style={styles.row}>
                <View style={styles.meta}>
                  <Text style={styles.itemName}>{pricingItemLabel(item)}</Text>
                  <Text style={styles.itemMeta}>
                    Qty {item.quantity ?? 1}
                    {item.pst ? " · PST" : ""}
                    {item.gst ? " · GST" : ""}
                  </Text>
                </View>
                <Text style={styles.itemValue}>{formatCurrency(pricingItemAmount(item))}</Text>
              </View>
            ))}
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Total</Text>
              <Text style={styles.totalValue}>{formatCurrency(total)}</Text>
            </View>
          </>
        )}
      </MKCard>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { gap: spacing.md },
  header: { gap: spacing.xs },
  title: { ...typography.subtitle },
  subtitle: { ...typography.bodySmall, color: colors.textMuted },
  card: { marginBottom: spacing.md },
  center: { padding: spacing.xl, alignItems: "center" },
  emptyText: { ...typography.bodySmall, color: colors.textMuted },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border
  },
  meta: { flex: 1 },
  itemName: { ...typography.bodySmall, marginBottom: spacing.xs },
  itemMeta: { ...typography.caption },
  itemValue: { ...typography.bodySmall, color: colors.primary },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: spacing.md,
    marginTop: spacing.sm
  },
  totalLabel: { ...typography.subtitle },
  totalValue: { ...typography.subtitle, color: colors.primary }
});
