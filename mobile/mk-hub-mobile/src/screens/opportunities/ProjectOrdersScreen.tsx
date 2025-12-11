import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "../../theme/colors";
import { spacing } from "../../theme/spacing";
import { MKButton } from "../../components/MKButton";
import { MKCard } from "../../components/MKCard";
import { getProjectOrders, createOrder, approveOrderReceipt } from "../../services/orders";
import { toApiError } from "../../services/api";
import type { ProjectListItem } from "../../types/projects";
import type { ProjectOrder, CreateOrderRequest } from "../../services/orders";

interface ProjectOrdersScreenProps {
  project: ProjectListItem;
  onBack: () => void;
}

interface OrderItem {
  description: string;
  quantity: number;
  unit?: string;
  unit_price?: number;
}

export const ProjectOrdersScreen: React.FC<ProjectOrdersScreenProps> = ({
  project,
  onBack
}) => {
  const insets = useSafeAreaInsets();
  const [orders, setOrders] = useState<ProjectOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [orderType, setOrderType] = useState("material");
  const [orderItems, setOrderItems] = useState<OrderItem[]>([
    { description: "", quantity: 1 }
  ]);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    loadOrders();
  }, []);

  const loadOrders = async () => {
    try {
      setLoading(true);
      const data = await getProjectOrders(project.id);
      setOrders(data);
    } catch (err) {
      console.error("[ProjectOrders] Error:", err);
      const apiError = toApiError(err);
      // Silently fail
    } finally {
      setLoading(false);
    }
  };

  const handleApproveReceipt = async (orderId: string) => {
    try {
      await approveOrderReceipt(orderId);
      Alert.alert("Success", "Order receipt approved");
      loadOrders();
    } catch (err) {
      const apiError = toApiError(err);
      Alert.alert("Error", apiError.message);
    }
  };

  const handleAddItem = () => {
    setOrderItems([...orderItems, { description: "", quantity: 1 }]);
  };

  const handleRemoveItem = (index: number) => {
    setOrderItems(orderItems.filter((_, i) => i !== index));
  };

  const handleUpdateItem = (index: number, field: keyof OrderItem, value: any) => {
    const updated = [...orderItems];
    updated[index] = { ...updated[index], [field]: value };
    setOrderItems(updated);
  };

  const handleCreateOrder = async () => {
    if (orderItems.some((item) => !item.description.trim())) {
      Alert.alert("Error", "Please fill in all item descriptions");
      return;
    }

    try {
      setCreating(true);
      const payload: CreateOrderRequest = {
        project_id: project.id,
        order_type: orderType,
        notes: notes.trim() || undefined,
        items: orderItems.map((item) => ({
          description: item.description.trim(),
          quantity: item.quantity,
          unit: item.unit?.trim(),
          unit_price: item.unit_price
        }))
      };

      await createOrder(payload);
      Alert.alert("Success", "Order created successfully");
      setShowCreateModal(false);
      setOrderItems([{ description: "", quantity: 1 }]);
      setNotes("");
      loadOrders();
    } catch (err) {
      const apiError = toApiError(err);
      Alert.alert("Error", apiError.message);
    } finally {
      setCreating(false);
    }
  };

  const formatCurrency = (amount?: number) => {
    if (!amount) return "—";
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
        <Text style={styles.title}>Orders</Text>
        <Text style={styles.subtitle}>{project.name}</Text>
      </View>

      <View style={styles.actionsBar}>
        <MKButton
          title="➕ Create Order"
          onPress={() => setShowCreateModal(true)}
          style={styles.createButton}
        />
      </View>

      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
          {orders.map((order) => (
            <MKCard key={order.id} style={styles.orderCard} elevated={true}>
              <View style={styles.orderHeader}>
                <Text style={styles.orderCode}>{order.order_code || "Order"}</Text>
                <Text style={styles.orderStatus}>{order.status}</Text>
              </View>
              <Text style={styles.orderType}>Type: {order.order_type}</Text>
              {order.supplier_name && (
                <Text style={styles.orderSupplier}>Supplier: {order.supplier_name}</Text>
              )}
              {order.notes && (
                <Text style={styles.orderNotes}>{order.notes}</Text>
              )}
              {order.items && order.items.length > 0 && (
                <View style={styles.orderItems}>
                  <Text style={styles.itemsTitle}>Items:</Text>
                  {order.items.map((item, idx) => (
                    <Text key={idx} style={styles.itemText}>
                      • {item.description} ({item.quantity} {item.unit || "units"})
                    </Text>
                  ))}
                </View>
              )}
              {(order.status === "awaiting_delivery" || order.status === "pending_receipt") && (
                <MKButton
                  title="✓ Approve Receipt"
                  onPress={() => handleApproveReceipt(order.id)}
                  style={styles.approveButton}
                />
              )}
            </MKCard>
          ))}
          {orders.length === 0 && (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No orders found</Text>
            </View>
          )}
        </ScrollView>
      )}

      <Modal
        visible={showCreateModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowCreateModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Create Order</Text>
              <TouchableOpacity onPress={() => setShowCreateModal(false)}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalScrollContent}>
              <View style={styles.formGroup}>
                <Text style={styles.label}>Order Type</Text>
                <View style={styles.typeButtons}>
                  {["material", "subcontractor", "shop"].map((type) => (
                    <TouchableOpacity
                      key={type}
                      style={[
                        styles.typeButton,
                        orderType === type && styles.typeButtonActive
                      ]}
                      onPress={() => setOrderType(type)}
                    >
                      <Text
                        style={[
                          styles.typeButtonText,
                          orderType === type && styles.typeButtonTextActive
                        ]}
                      >
                        {type.charAt(0).toUpperCase() + type.slice(1)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Items</Text>
                {orderItems.map((item, index) => (
                  <View key={index} style={styles.itemRow}>
                    <TextInput
                      style={[styles.input, styles.itemDescription]}
                      value={item.description}
                      onChangeText={(text) =>
                        handleUpdateItem(index, "description", text)
                      }
                      placeholder="Item description"
                      placeholderTextColor={colors.textMuted}
                    />
                    <TextInput
                      style={[styles.input, styles.itemQuantity]}
                      value={item.quantity.toString()}
                      onChangeText={(text) =>
                        handleUpdateItem(index, "quantity", parseInt(text) || 1)
                      }
                      placeholder="Qty"
                      keyboardType="numeric"
                      placeholderTextColor={colors.textMuted}
                    />
                    <TextInput
                      style={[styles.input, styles.itemUnit]}
                      value={item.unit}
                      onChangeText={(text) => handleUpdateItem(index, "unit", text)}
                      placeholder="Unit"
                      placeholderTextColor={colors.textMuted}
                    />
                    <TouchableOpacity
                      onPress={() => handleRemoveItem(index)}
                      style={styles.removeItemButton}
                    >
                      <Text style={styles.removeItemText}>✕</Text>
                    </TouchableOpacity>
                  </View>
                ))}
                <MKButton
                  title="➕ Add Item"
                  onPress={handleAddItem}
                  variant="secondary"
                  style={styles.addItemButton}
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Notes (optional)</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  value={notes}
                  onChangeText={setNotes}
                  placeholder="Additional notes..."
                  placeholderTextColor={colors.textMuted}
                  multiline
                  numberOfLines={3}
                />
              </View>
            </ScrollView>

            <View style={styles.modalActions}>
              <MKButton
                title="Cancel"
                onPress={() => setShowCreateModal(false)}
                variant="secondary"
                style={styles.modalButton}
              />
              <MKButton
                title={creating ? "Creating..." : "Create"}
                onPress={handleCreateOrder}
                loading={creating}
                style={styles.modalButton}
              />
            </View>
          </View>
        </View>
      </Modal>
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
  actionsBar: {
    padding: spacing.md,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border
  },
  createButton: {
    width: "100%"
  },
  scrollView: {
    flex: 1
  },
  scrollContent: {
    padding: spacing.md,
    gap: spacing.md
  },
  orderCard: {
    padding: spacing.md
  },
  orderHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.xs
  },
  orderCode: {
    fontSize: 18,
    fontWeight: "600",
    color: colors.textPrimary
  },
  orderStatus: {
    fontSize: 12,
    color: colors.textMuted,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    backgroundColor: colors.background,
    borderRadius: 4
  },
  orderType: {
    fontSize: 14,
    color: colors.textMuted,
    marginBottom: spacing.xs
  },
  orderSupplier: {
    fontSize: 14,
    color: colors.textMuted,
    marginBottom: spacing.xs
  },
  orderNotes: {
    fontSize: 14,
    color: colors.textMuted,
    marginTop: spacing.xs,
    fontStyle: "italic"
  },
  orderItems: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border
  },
  itemsTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.textPrimary,
    marginBottom: spacing.xs
  },
  itemText: {
    fontSize: 14,
    color: colors.textMuted,
    marginBottom: spacing.xs
  },
  approveButton: {
    marginTop: spacing.md
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
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end"
  },
  modalContent: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "90%"
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.textPrimary
  },
  modalClose: {
    fontSize: 24,
    color: colors.textMuted
  },
  modalScroll: {
    flex: 1
  },
  modalScrollContent: {
    padding: spacing.lg
  },
  formGroup: {
    marginBottom: spacing.lg
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.textPrimary,
    marginBottom: spacing.sm
  },
  typeButtons: {
    flexDirection: "row",
    gap: spacing.sm
  },
  typeButton: {
    flex: 1,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    alignItems: "center"
  },
  typeButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary
  },
  typeButtonText: {
    fontSize: 14,
    color: colors.textPrimary
  },
  typeButtonTextActive: {
    color: "white",
    fontWeight: "600"
  },
  itemRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginBottom: spacing.sm,
    alignItems: "center"
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 14,
    color: colors.textPrimary,
    backgroundColor: colors.card
  },
  itemDescription: {
    flex: 2
  },
  itemQuantity: {
    flex: 1
  },
  itemUnit: {
    flex: 1
  },
  removeItemButton: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center"
  },
  removeItemText: {
    fontSize: 20,
    color: colors.error
  },
  addItemButton: {
    marginTop: spacing.sm
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: "top"
  },
  modalActions: {
    flexDirection: "row",
    gap: spacing.md,
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border
  },
  modalButton: {
    flex: 1
  }
});

