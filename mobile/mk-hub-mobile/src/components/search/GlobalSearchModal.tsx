import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../../hooks/useAuth";
import {
  canSeeGlobalSearchItem,
  loadSearchRecents,
  localSearchSections,
  openGlobalSearchItem,
  searchShowClock
} from "../../lib/globalSearch";
import { toApiError } from "../../services/api";
import {
  globalSearch,
  type GlobalSearchItem,
  type GlobalSearchSection
} from "../../services/search";
import { colors } from "../../theme/colors";
import { radius, shadows } from "../../theme/radius";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";

type Props = {
  visible: boolean;
  onClose: () => void;
};

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

function iconForType(type: string): keyof typeof Ionicons.glyphMap {
  switch (type) {
    case "page":
      return "grid-outline";
    case "project":
    case "opportunity":
      return "folder-open-outline";
    case "customer":
      return "business-outline";
    case "user":
      return "person-outline";
    case "fleet_asset":
      return "car-outline";
    case "equipment":
      return "construct-outline";
    case "work_order":
      return "clipboard-outline";
    case "company_credit_card":
      return "card-outline";
    case "fuel_card":
      return "flash-outline";
    case "quote":
      return "document-text-outline";
    default:
      return "search-outline";
  }
}

function isProjectLike(type: string): boolean {
  return type === "project" || type === "opportunity";
}

function projectCodeFromTitle(title: string): string | null {
  const match = title.match(/^(MK[-–]?\S+)\s*[—–-]\s*(.+)$/i);
  return match?.[1]?.trim() || null;
}

function projectNameFromTitle(title: string): string {
  const match = title.match(/^(MK[-–]?\S+)\s*[—–-]\s*(.+)$/i);
  return (match?.[2] || title).trim();
}

function SearchResultBody({ item }: { item: GlobalSearchItem }) {
  if (isProjectLike(item.type)) {
    const code = (item.code || projectCodeFromTitle(item.title) || "").trim();
    const name = (item.name || projectNameFromTitle(item.title) || item.title).trim();
    const address = (item.address || item.subtitle || "").trim();
    return (
      <View style={styles.rowText}>
        {code ? (
          <Text style={styles.projectCode} numberOfLines={1}>
            {code}
          </Text>
        ) : null}
        <Text style={styles.projectName} numberOfLines={2}>
          {name}
        </Text>
        {address ? (
          <Text style={styles.projectAddress} numberOfLines={2}>
            {address}
          </Text>
        ) : null}
      </View>
    );
  }

  return (
    <View style={styles.rowText}>
      <Text style={styles.rowTitle} numberOfLines={1}>
        {item.title}
      </Text>
      {item.subtitle ? (
        <Text style={styles.rowSubtitle} numberOfLines={1}>
          {item.subtitle}
        </Text>
      ) : null}
    </View>
  );
}

export const GlobalSearchModal: React.FC<Props> = ({ visible, onClose }) => {
  const insets = useSafeAreaInsets();
  const { permissions, roles, user } = useAuth();
  const permissionsSet = useMemo(() => new Set(permissions), [permissions]);
  const inputRef = useRef<TextInput>(null);

  const [q, setQ] = useState("");
  const debouncedQ = useDebouncedValue(q, 250);
  const [recents, setRecents] = useState<GlobalSearchItem[]>([]);
  const [remoteSections, setRemoteSections] = useState<GlobalSearchSection[]>([]);
  const [loading, setLoading] = useState(false);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const showClock = searchShowClock(user?.pay_type, user?.needs_register_hours);

  useEffect(() => {
    if (!visible) return;
    setQ("");
    setRemoteSections([]);
    setError(null);
    void loadSearchRecents().then(setRecents);
    const t = setTimeout(() => inputRef.current?.focus(), 120);
    return () => clearTimeout(t);
  }, [visible]);

  const localSections = useMemo(() => {
    const query = debouncedQ.trim();
    if (!query) {
      const allowed = recents.filter((it) =>
        canSeeGlobalSearchItem(permissionsSet, roles, it)
      );
      return allowed.length
        ? [{ id: "recents", label: "Recent", items: allowed }]
        : [];
    }
    return localSearchSections(query, permissionsSet, roles, { showClock }).map(
      (section) => ({
        ...section,
        items: section.items.filter((it) =>
          canSeeGlobalSearchItem(permissionsSet, roles, it)
        )
      })
    );
  }, [debouncedQ, permissionsSet, roles, recents, showClock]);

  useEffect(() => {
    const query = debouncedQ.trim();
    if (!visible || query.length < 2) {
      setRemoteSections([]);
      setLoading(false);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    void globalSearch(query, 10)
      .then((data) => {
        if (cancelled) return;
        const sections = (data.sections || [])
          .map((section) => ({
            ...section,
            items: (section.items || []).filter((it) =>
              canSeeGlobalSearchItem(permissionsSet, roles, it)
            )
          }))
          .filter((section) => section.items.length > 0);
        setRemoteSections(sections);
      })
      .catch((err) => {
        if (cancelled) return;
        setRemoteSections([]);
        setError(toApiError(err).message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedQ, visible, permissionsSet, roles]);

  const sections = useMemo(() => {
    if (debouncedQ.trim().length >= 2) {
      return [...localSections, ...remoteSections].filter(
        (s) => (s.items || []).length > 0
      );
    }
    return localSections;
  }, [debouncedQ, localSections, remoteSections]);

  const flatItems = useMemo(() => {
    const out: Array<GlobalSearchItem & { sectionLabel: string }> = [];
    for (const section of sections) {
      for (const item of section.items) {
        out.push({ ...item, sectionLabel: section.label });
      }
    }
    return out;
  }, [sections]);

  const handleOpen = async (item: GlobalSearchItem) => {
    if (opening) return;
    setOpening(true);
    try {
      onClose();
      await openGlobalSearchItem(item);
    } finally {
      setOpening(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
        <View style={styles.searchRow}>
          <View style={styles.inputWrap}>
            <Ionicons name="search" size={18} color={colors.textMuted} />
            <TextInput
              ref={inputRef}
              value={q}
              onChangeText={setQ}
              placeholder="Search"
              placeholderTextColor={colors.textMuted}
              style={styles.input}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              clearButtonMode="while-editing"
            />
            {loading ? <ActivityIndicator size="small" color={colors.primary} /> : null}
          </View>
          <Pressable onPress={onClose} hitSlop={8} style={styles.cancelBtn}>
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
        </View>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <FlatList
          data={flatItems}
          keyExtractor={(item, index) => `${item.type}:${item.id}:${item.href}:${index}`}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: insets.bottom + spacing.lg }
          ]}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>
                {debouncedQ.trim().length < 2
                  ? "Search pages, people, projects, and more"
                  : loading
                    ? "Searching…"
                    : "No results"}
              </Text>
              {debouncedQ.trim().length > 0 && debouncedQ.trim().length < 2 ? (
                <Text style={styles.emptyHint}>Type at least 2 characters.</Text>
              ) : null}
            </View>
          }
          renderItem={({ item, index }) => {
            const prev = index > 0 ? flatItems[index - 1] : null;
            const showSection = !prev || prev.sectionLabel !== item.sectionLabel;
            return (
              <View>
                {showSection ? (
                  <Text style={styles.sectionLabel}>{item.sectionLabel}</Text>
                ) : null}
                <Pressable
                  style={({ pressed }) => [
                    styles.row,
                    isProjectLike(item.type) && styles.rowTall,
                    pressed && styles.rowPressed
                  ]}
                  onPress={() => void handleOpen(item)}
                  disabled={opening}
                >
                  <View
                    style={[
                      styles.iconBubble,
                      isProjectLike(item.type) && styles.iconBubbleTall
                    ]}
                  >
                    <Ionicons
                      name={iconForType(item.type)}
                      size={18}
                      color={colors.primary}
                    />
                  </View>
                  <SearchResultBody item={item} />
                  <Ionicons
                    name="chevron-forward"
                    size={16}
                    color={colors.textMuted}
                    style={isProjectLike(item.type) ? { marginTop: 10 } : undefined}
                  />
                </Pressable>
              </View>
            );
          }}
        />
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm
  },
  inputWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: "#fff",
    borderRadius: radius.control,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    minHeight: 44,
    ...shadows.card
  },
  input: {
    flex: 1,
    ...typography.body,
    color: colors.textPrimary,
    paddingVertical: 10
  },
  cancelBtn: {
    paddingVertical: 8,
    paddingHorizontal: 4
  },
  cancelText: {
    ...typography.buttonSmall,
    color: colors.primary
  },
  errorText: {
    ...typography.caption,
    color: colors.error,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm
  },
  listContent: {
    paddingHorizontal: spacing.md
  },
  sectionLabel: {
    ...typography.caption,
    color: colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
    marginLeft: 4
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: "#fff",
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    marginBottom: 8
  },
  rowTall: {
    alignItems: "flex-start",
    paddingVertical: 14
  },
  rowPressed: {
    backgroundColor: "#f9fafb"
  },
  iconBubble: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.drawerActiveBg,
    alignItems: "center",
    justifyContent: "center"
  },
  iconBubbleTall: {
    marginTop: 2
  },
  rowText: {
    flex: 1,
    minWidth: 0
  },
  rowTitle: {
    ...typography.bodySmall,
    fontFamily: typography.buttonSmall.fontFamily,
    color: colors.textPrimary
  },
  rowSubtitle: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 2
  },
  projectCode: {
    ...typography.caption,
    fontSize: 11,
    lineHeight: 14,
    color: colors.textMuted,
    letterSpacing: 0.3,
    textTransform: "uppercase"
  },
  projectName: {
    ...typography.bodySmall,
    fontFamily: typography.buttonSmall.fontFamily,
    color: colors.textPrimary,
    marginTop: 2
  },
  projectAddress: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 4
  },
  empty: {
    paddingTop: spacing.xl,
    paddingHorizontal: spacing.md,
    alignItems: "center"
  },
  emptyTitle: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: "center"
  },
  emptyHint: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: spacing.xs,
    textAlign: "center"
  }
});
