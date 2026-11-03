import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { MKHomeStyleHeader } from "../../components/MKHomeStyleHeader";
import { MKBadge } from "../../components/MKBadge";
import { MKCard } from "../../components/MKCard";
import { ScreenLayout } from "../../components/ScreenLayout";
import { useHubMenu } from "../../navigation/HubMenuProvider";
import { shareLocalFile } from "../../services/files";
import {
  downloadSignedPreviewToCache,
  listMySignatures
} from "../../services/signatures";
import { toApiError } from "../../services/api";
import type { HomeStackParamList } from "../../navigation/types";
import type { SignatureInboxItem } from "../../types/signatures";
import { colors } from "../../theme/colors";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";

type Nav = NativeStackNavigationProp<HomeStackParamList, "Signatures">;
type TabKey = "pending" | "completed";

function formatDue(iso?: string | null): string | null {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric"
    });
  } catch {
    return null;
  }
}

function sourceLabel(item: SignatureInboxItem): string {
  const override = (item.source_label || "").trim();
  if (override) return override;
  return item.source === "onboarding" ? "Onboarding" : "Document";
}

export const SignaturesListScreen: React.FC = () => {
  const navigation = useNavigation<Nav>();
  const { openMenu } = useHubMenu();
  const [tab, setTab] = useState<TabKey>("pending");
  const [items, setItems] = useState<SignatureInboxItem[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const data = await listMySignatures();
      setItems(Array.isArray(data.items) ? data.items : []);
    } catch (err) {
      Alert.alert("Could not load signatures", toApiError(err).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const pending = useMemo(
    () =>
      items.filter((i) => i.status === "action_required" || i.status === "waiting"),
    [items]
  );
  const completed = useMemo(
    () => items.filter((i) => i.status === "signed" || i.status === "cancelled"),
    [items]
  );
  const rows = tab === "pending" ? pending : completed;

  const openSignedPdf = async (item: SignatureInboxItem) => {
    try {
      const file = await downloadSignedPreviewToCache({
        source: item.source,
        id: item.id,
        signedFileId: item.signed_file_id,
        title: item.title
      });
      await shareLocalFile(file, {
        mimeType: "application/pdf",
        dialogTitle: `${item.title || "Document"} (signed)`
      });
    } catch (err) {
      Alert.alert("Could not open signed PDF", toApiError(err).message);
    }
  };

  const openItem = (item: SignatureInboxItem) => {
    if (item.status === "action_required") {
      navigation.navigate("DocumentSign", {
        source: item.source,
        id: item.id,
        title: item.title
      });
      return;
    }
    if (item.status === "signed" && item.signed_file_id) {
      void openSignedPdf(item);
      return;
    }
    Alert.alert(
      item.title,
      item.status === "waiting"
        ? "Waiting for another signer."
        : item.status === "signed"
          ? "Signed PDF is not available yet."
          : "This request was cancelled."
    );
  };

  const renderRow = ({ item }: { item: SignatureInboxItem }) => {
    const due = formatDue(item.deadline_at);
    const canSign = item.status === "action_required";
    return (
      <TouchableOpacity activeOpacity={0.75} onPress={() => openItem(item)}>
        <MKCard style={styles.card}>
          <View style={styles.cardTop}>
            <Text style={styles.title} numberOfLines={2}>
              {item.title}
            </Text>
            <Ionicons
              name={canSign ? "create-outline" : "document-text-outline"}
              size={18}
              color={canSign ? colors.homeAccent : colors.textMuted}
            />
          </View>
          <View style={styles.metaRow}>
            <MKBadge
              variant={
                item.status === "action_required"
                  ? "warning"
                  : item.status === "signed"
                    ? "success"
                    : "neutral"
              }
            >
              {item.status === "action_required"
                ? "Your turn"
                : item.status === "waiting"
                  ? "Waiting"
                  : item.status === "signed"
                    ? "Signed"
                    : "Cancelled"}
            </MKBadge>
            <Text style={styles.meta}>{sourceLabel(item)}</Text>
          </View>
          {item.requested_by_name || item.my_role_label || due ? (
            <Text style={styles.subtitle} numberOfLines={2}>
              {[
                item.requested_by_name ? `From ${item.requested_by_name}` : null,
                item.my_role_label,
                due ? `Due ${due}` : null,
                item.is_overdue ? "Overdue" : null
              ]
                .filter(Boolean)
                .join(" · ")}
            </Text>
          ) : null}
          {canSign ? <Text style={styles.cta}>Tap to review and sign</Text> : null}
          {item.status === "signed" && item.signed_file_id ? (
            <Text style={styles.cta}>Tap to open signed PDF</Text>
          ) : null}
        </MKCard>
      </TouchableOpacity>
    );
  };

  return (
    <ScreenLayout scroll={false}>
      <MKHomeStyleHeader
        title="Signatures"
        subtitle={
          pending.length > 0
            ? `${pending.length} waiting on you`
            : "Review and sign documents"
        }
        onLeftPress={openMenu}
      />

      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, tab === "pending" && styles.tabActive]}
          onPress={() => setTab("pending")}
        >
          <Text style={[styles.tabText, tab === "pending" && styles.tabTextActive]}>
            Pending ({pending.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, tab === "completed" && styles.tabActive]}
          onPress={() => setTab("completed")}
        >
          <Text style={[styles.tabText, tab === "completed" && styles.tabTextActive]}>
            Completed ({completed.length})
          </Text>
        </TouchableOpacity>
      </View>

      {loading && rows.length === 0 ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.homeAccent} />
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => `${item.source}-${item.id}`}
          renderItem={renderRow}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
          ListEmptyComponent={
            !loading ? (
              <View style={styles.empty}>
                <Text style={styles.emptyText}>
                  {tab === "pending"
                    ? "Nothing waiting for your signature."
                    : "No completed signatures yet."}
                </Text>
              </View>
            ) : null
          }
        />
      )}
    </ScreenLayout>
  );
};

const styles = StyleSheet.create({
  tabs: {
    flexDirection: "row",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm
  },
  tab: {
    flex: 1,
    minHeight: 40,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.iconMutedBg
  },
  tabActive: {
    backgroundColor: "#DCFCE7"
  },
  tabText: {
    ...typography.bodySmall,
    color: colors.textMuted,
    fontFamily: typography.button.fontFamily
  },
  tabTextActive: {
    color: colors.homeAccent
  },
  list: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.sm
  },
  card: {
    gap: spacing.xs
  },
  cardTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.sm
  },
  title: {
    ...typography.titleSmall,
    color: colors.textPrimary,
    flex: 1
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    flexWrap: "wrap"
  },
  meta: {
    ...typography.caption,
    color: colors.textMuted
  },
  subtitle: {
    ...typography.bodySmall,
    color: colors.textMuted
  },
  cta: {
    ...typography.bodySmall,
    color: colors.homeAccent,
    fontFamily: typography.button.fontFamily,
    marginTop: 2
  },
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center"
  },
  empty: {
    paddingTop: spacing.xxl,
    alignItems: "center"
  },
  emptyText: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: "center"
  }
});
