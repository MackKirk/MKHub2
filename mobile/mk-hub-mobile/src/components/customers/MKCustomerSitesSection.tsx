import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { MKButton } from "../MKButton";
import { MKCard } from "../MKCard";
import { formatSiteAddress } from "../../lib/customerUi";
import { colors } from "../../theme/colors";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";
import type { CustomerSite } from "../../types/customers";

interface MKCustomerSitesSectionProps {
  sites: CustomerSite[];
  loading: boolean;
  canEdit: boolean;
  onCreate: () => void;
  onEdit: (site: CustomerSite) => void;
  onDelete: (site: CustomerSite) => void;
}

export const MKCustomerSitesSection: React.FC<MKCustomerSitesSectionProps> = ({
  sites,
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
          <Text style={styles.sectionTitle}>Sites</Text>
          <Text style={styles.sectionSubtitle}>
            {loading ? "Loading sites..." : `${sites.length} sites`}
          </Text>
        </View>
        {canEdit ? <MKButton title="New site" size="compact" onPress={onCreate} /> : null}
      </View>

      {sites.length === 0 && !loading ? (
        <MKCard style={styles.emptyCard}>
          <Text style={styles.emptyText}>No sites yet.</Text>
        </MKCard>
      ) : null}

      {sites.map((site) => {
        const address = formatSiteAddress(site);
        return (
          <MKCard key={site.id} style={styles.siteCard}>
            <View style={styles.siteHeader}>
              <View style={styles.siteIcon}>
                <Ionicons name="business-outline" size={20} color={colors.primary} />
              </View>
              <View style={styles.siteTitleWrap}>
                <Text style={styles.siteTitle} numberOfLines={1}>
                  {site.site_name || "Site"}
                </Text>
                {address ? (
                  <Text style={styles.siteAddress} numberOfLines={2}>
                    {address}
                  </Text>
                ) : (
                  <Text style={styles.siteAddress}>No address</Text>
                )}
              </View>
            </View>
            {site.site_notes ? <Text style={styles.notes}>{site.site_notes}</Text> : null}
            {canEdit ? (
              <View style={styles.actions}>
                <TouchableOpacity style={styles.action} onPress={() => onEdit(site)}>
                  <Ionicons name="create-outline" size={16} color={colors.primary} />
                  <Text style={styles.actionText}>Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.action} onPress={() => onDelete(site)}>
                  <Ionicons name="trash-outline" size={16} color={colors.error} />
                  <Text style={[styles.actionText, styles.deleteText]}>Delete</Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </MKCard>
        );
      })}
    </View>
  );
};

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
  siteCard: {
    gap: spacing.sm
  },
  siteHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md
  },
  siteIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fef2f2"
  },
  siteTitleWrap: {
    flex: 1,
    minWidth: 0
  },
  siteTitle: {
    ...typography.body,
    fontFamily: typography.button.fontFamily,
    color: colors.textPrimary
  },
  siteAddress: {
    ...typography.caption,
    color: colors.textMuted
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
