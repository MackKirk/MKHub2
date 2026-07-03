import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MKButton } from "./MKButton";
import { colors } from "../theme/colors";
import { spacing } from "../theme/spacing";
import { radius } from "../theme/radius";
import { typography } from "../theme/typography";

export type SelectOption = { value: string; label: string };

interface MKSafetySelectModalProps {
  visible: boolean;
  title: string;
  options: SelectOption[];
  value: string | string[];
  multi?: boolean;
  loading?: boolean;
  loadingLabel?: string;
  onClose: () => void;
  onConfirm: (value: string | string[]) => void;
}

export const MKSafetySelectModal: React.FC<MKSafetySelectModalProps> = ({
  visible,
  title,
  options,
  value,
  multi = false,
  loading = false,
  loadingLabel = "Loading…",
  onClose,
  onConfirm
}) => {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<string | string[]>(value);

  React.useEffect(() => {
    if (visible) {
      setDraft(value);
      setQuery("");
    }
  }, [visible, value]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  const selectedSet = useMemo(() => {
    return new Set(Array.isArray(draft) ? draft : draft ? [draft] : []);
  }, [draft]);

  const toggle = (optionValue: string) => {
    if (multi) {
      const current = Array.isArray(draft) ? draft : [];
      setDraft(
        current.includes(optionValue)
          ? current.filter((v) => v !== optionValue)
          : [...current, optionValue]
      );
    } else {
      setDraft(optionValue);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Text style={styles.title}>{title}</Text>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close" size={24} color={colors.text} />
          </TouchableOpacity>
        </View>
        <TextInput
          style={styles.search}
          value={query}
          onChangeText={setQuery}
          placeholder="Search…"
        />
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.value}
          renderItem={({ item }) => {
            const active = selectedSet.has(item.value);
            return (
              <TouchableOpacity
                style={styles.row}
                onPress={() => toggle(item.value)}
                disabled={loading}
              >
                <Text style={styles.rowLabel}>{item.label}</Text>
                {active ? (
                  <Ionicons name="checkmark-circle" size={22} color={colors.primary} />
                ) : (
                  <Ionicons name="ellipse-outline" size={22} color={colors.textMuted} />
                )}
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            loading ? (
              <View style={styles.loadingWrap}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={styles.loadingText}>{loadingLabel}</Text>
              </View>
            ) : (
              <Text style={styles.empty}>No options found.</Text>
            )
          }
        />
        <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
          <MKButton title="Cancel" variant="secondary" onPress={onClose} style={styles.btn} />
          <MKButton
            title="Done"
            onPress={() => {
              onConfirm(draft);
              onClose();
            }}
            disabled={loading}
            style={styles.btn}
          />
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md
  },
  title: { ...typography.subtitle },
  search: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.card,
    backgroundColor: colors.card,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    ...typography.body
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border
  },
  rowLabel: { ...typography.body, flex: 1, marginRight: spacing.md },
  empty: {
    ...typography.bodySmall,
    color: colors.textMuted,
    textAlign: "center",
    padding: spacing.xl
  },
  loadingWrap: {
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
    gap: spacing.sm
  },
  loadingText: {
    ...typography.bodySmall,
    color: colors.textMuted
  },
  footer: {
    flexDirection: "row",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md
  },
  btn: { flex: 1, alignSelf: "stretch" }
});
