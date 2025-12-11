import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "../../theme/colors";
import { spacing } from "../../theme/spacing";
import { MKCard } from "../../components/MKCard";
import { getProjectEstimates, getEstimate, getEstimateItems } from "../../services/estimates";
import { toApiError } from "../../services/api";
import type { ProjectListItem } from "../../types/projects";
import type { EstimateItem } from "../../services/estimates";

interface ProjectEstimateScreenProps {
  project: ProjectListItem;
  onBack: () => void;
}

export const ProjectEstimateScreen: React.FC<ProjectEstimateScreenProps> = ({
  project,
  onBack
}) => {
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<EstimateItem[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadEstimate();
  }, []);

  const loadEstimate = async () => {
    try {
      setLoading(true);
      const estimates = await getProjectEstimates(project.id);
      if (estimates.length > 0) {
        const estimate = await getEstimate(estimates[0].id);
        const estimateItems = await getEstimateItems(estimates[0].id);
        setItems(estimateItems);
        
        // Calculate total from items
        const calculatedTotal = estimateItems.reduce((sum, item) => {
          return sum + (item.total || 0);
        }, 0);
        setTotal(calculatedTotal || estimate.total_cost || 0);
      }
    } catch (err) {
      console.error("[ProjectEstimate] Error:", err);
      const apiError = toApiError(err);
      // Silently fail
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD"
    }).format(amount);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Estimate</Text>
        <Text style={styles.subtitle}>{project.name}</Text>
      </View>

      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
          {items.map((item) => (
            <MKCard key={item.id} style={styles.itemCard} elevated={true}>
              <Text style={styles.itemDescription}>{item.description || "Item"}</Text>
              <View style={styles.itemDetails}>
                <Text style={styles.itemDetail}>
                  {item.quantity} {item.unit || "units"} × {formatCurrency(item.unit_price || 0)}
                </Text>
                <Text style={styles.itemTotal}>{formatCurrency(item.total || 0)}</Text>
              </View>
              {item.item_type && (
                <Text style={styles.itemType}>Type: {item.item_type}</Text>
              )}
            </MKCard>
          ))}
          
          {items.length > 0 && (
            <MKCard style={styles.totalCard} elevated={true}>
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Total:</Text>
                <Text style={styles.totalAmount}>{formatCurrency(total)}</Text>
              </View>
            </MKCard>
          )}

          {items.length === 0 && (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No estimate items found</Text>
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background
  },
  header: {
    padding: spacing.lg,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border
  },
  backButton: {
    marginBottom: spacing.sm
  },
  backButtonText: {
    fontSize: 16,
    color: colors.primary,
    fontWeight: "600"
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: colors.textPrimary,
    marginBottom: spacing.xs
  },
  subtitle: {
    fontSize: 14,
    color: colors.textMuted
  },
  scrollView: {
    flex: 1
  },
  scrollContent: {
    padding: spacing.md,
    gap: spacing.md
  },
  itemCard: {
    padding: spacing.md
  },
  itemDescription: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.textPrimary,
    marginBottom: spacing.xs
  },
  itemDetails: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.xs
  },
  itemDetail: {
    fontSize: 14,
    color: colors.textMuted
  },
  itemTotal: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.primary
  },
  itemType: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: spacing.xs
  },
  totalCard: {
    padding: spacing.lg,
    backgroundColor: colors.primary,
    marginTop: spacing.md
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center"
  },
  totalLabel: {
    fontSize: 20,
    fontWeight: "700",
    color: "white"
  },
  totalAmount: {
    fontSize: 24,
    fontWeight: "700",
    color: "white"
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center"
  },
  emptyContainer: {
    padding: spacing.xl,
    alignItems: "center"
  },
  emptyText: {
    fontSize: 16,
    color: colors.textMuted
  }
});

