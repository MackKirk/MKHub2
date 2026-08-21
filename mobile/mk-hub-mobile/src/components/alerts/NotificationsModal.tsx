import React from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { InboxNotification } from "../../types/inbox";
import { colors } from "../../theme/colors";
import { radius, shadows } from "../../theme/radius";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";

type NotificationsModalProps = {
  visible: boolean;
  loading?: boolean;
  unreadCount: number;
  items: InboxNotification[];
  onClose: () => void;
  onOpen: (item: InboxNotification) => void;
  onMarkAllRead: () => void;
};

function formatTimeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.max(0, Math.floor(diffMs / 60000));
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

function iconMeta(type: string): {
  name: keyof typeof Ionicons.glyphMap;
  bg: string;
  color: string;
} {
  switch ((type || "").toLowerCase()) {
    case "shift":
      return { name: "construct-outline", bg: "#FFEDD5", color: "#C2410C" };
    case "task":
      return { name: "checkmark-circle-outline", bg: "#DCFCE7", color: "#15803D" };
    case "message":
      return { name: "chatbubble-outline", bg: "#DBEAFE", color: "#1D4ED8" };
    case "attendance":
      return { name: "time-outline", bg: "#FEF3C7", color: "#B45309" };
    case "community_urgent":
      return { name: "warning-outline", bg: "#FEE2E2", color: "#B91C1C" };
    case "community_required":
      return { name: "clipboard-outline", bg: "#EDE9FE", color: "#6D28D9" };
    default:
      if ((type || "").startsWith("community")) {
        return { name: "megaphone-outline", bg: "#E0E7FF", color: "#4338CA" };
      }
      return { name: "notifications-outline", bg: "#F3F4F6", color: "#4B5563" };
  }
}

export const NotificationsModal: React.FC<NotificationsModalProps> = ({
  visible,
  loading = false,
  unreadCount,
  items,
  onClose,
  onOpen,
  onMarkAllRead
}) => {
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View
          style={[
            styles.card,
            { marginTop: insets.top + 48, marginBottom: insets.bottom + 24 }
          ]}
        >
          <View style={styles.header}>
            <Text style={styles.title}>Notifications</Text>
            {unreadCount > 0 ? (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadBadgeText}>
                  {unreadCount > 99 ? "99+" : unreadCount} unread
                </Text>
              </View>
            ) : null}
          </View>
          <ScrollView
            style={styles.list}
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            {loading && items.length === 0 ? (
              <View style={styles.empty}>
                <ActivityIndicator color={colors.primary} />
              </View>
            ) : items.length === 0 ? (
              <View style={styles.empty}>
                <Ionicons
                  name="notifications-outline"
                  size={22}
                  color={colors.textMuted}
                />
                <Text style={styles.emptyTitle}>No notifications</Text>
              </View>
            ) : (
              items.map((item) => {
                const icon = iconMeta(item.type);
                return (
                  <TouchableOpacity
                    key={item.id}
                    style={[styles.row, !item.read && styles.rowUnread]}
                    onPress={() => onOpen(item)}
                    activeOpacity={0.75}
                  >
                    <View style={[styles.iconWrap, { backgroundColor: icon.bg }]}>
                      <Ionicons name={icon.name} size={16} color={icon.color} />
                    </View>
                    <View style={styles.copy}>
                      <View style={styles.titleRow}>
                        <Text style={styles.itemTitle} numberOfLines={1}>
                          {item.title || "Notification"}
                        </Text>
                        {!item.read ? <View style={styles.unreadDot} /> : null}
                      </View>
                      {item.message ? (
                        <Text style={styles.message} numberOfLines={2}>
                          {item.message}
                        </Text>
                      ) : null}
                      <Text style={styles.time}>
                        {formatTimeAgo(item.created_at)}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })
            )}
          </ScrollView>
          {unreadCount > 0 ? (
            <TouchableOpacity
              style={styles.footerBtn}
              onPress={onMarkAllRead}
              activeOpacity={0.85}
            >
              <Text style={styles.footerBtnText}>Mark all as read</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.dismiss}
              onPress={onClose}
              activeOpacity={0.7}
            >
              <Text style={styles.dismissText}>Close</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-start",
    alignItems: "flex-end",
    paddingHorizontal: 16,
    backgroundColor: "rgba(15, 23, 42, 0.35)"
  },
  card: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: "#fff",
    borderRadius: 16,
    maxHeight: "78%",
    overflow: "hidden",
    ...shadows.cardElevated
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border
  },
  title: {
    fontFamily: typography.button.fontFamily,
    fontSize: 16,
    color: colors.textPrimary
  },
  unreadBadge: {
    backgroundColor: "#DBEAFE",
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 3
  },
  unreadBadgeText: {
    fontFamily: typography.buttonSmall.fontFamily,
    fontSize: 11,
    color: "#1D4ED8"
  },
  list: {
    maxHeight: 420
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border
  },
  rowUnread: {
    backgroundColor: "rgba(209, 22, 22, 0.04)"
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: radius.control,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1
  },
  copy: {
    flex: 1
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8
  },
  itemTitle: {
    flex: 1,
    fontFamily: typography.button.fontFamily,
    fontSize: 14,
    lineHeight: 20,
    color: colors.textPrimary
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
    marginTop: 6
  },
  message: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 18,
    color: colors.textMuted
  },
  time: {
    marginTop: 4,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 0.3,
    color: colors.textMuted,
    textTransform: "uppercase"
  },
  empty: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 36,
    gap: 8
  },
  emptyTitle: {
    ...typography.bodySmall,
    color: colors.textMuted
  },
  footerBtn: {
    margin: spacing.md,
    backgroundColor: colors.primary,
    borderRadius: radius.control,
    paddingVertical: 12,
    alignItems: "center"
  },
  footerBtnText: {
    fontFamily: typography.button.fontFamily,
    fontSize: 15,
    color: "#fff"
  },
  dismiss: {
    alignItems: "center",
    paddingVertical: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border
  },
  dismissText: {
    fontFamily: typography.buttonSmall.fontFamily,
    fontSize: 14,
    color: colors.textMuted
  }
});
