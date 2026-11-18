import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState
} from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  getFieldworkPhraseCatalogs,
  getPhraseLeafOptions
} from "../services/fieldwork";
import type { FieldworkEntryType, FieldworkPhraseOption } from "../types/fieldwork";
import { colors } from "../theme/colors";
import { spacing } from "../theme/spacing";
import { radius } from "../theme/radius";
import { typography } from "../theme/typography";

type ParsedPhrase = {
  id: string;
  roof: string;
  category: string;
  phrase: string;
  pathLabel: string;
};

type WizardStep = "roofs" | "categories" | "phrases";

function parseLeaves(leaves: FieldworkPhraseOption[]): ParsedPhrase[] {
  return leaves.map((o) => {
    const parts = String(o.label || "")
      .split(" › ")
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.length >= 3) {
      return {
        id: o.value,
        roof: parts[0],
        category: parts[1],
        phrase: parts.slice(2).join(" › "),
        pathLabel: o.label
      };
    }
    if (parts.length === 2) {
      return {
        id: o.value,
        roof: parts[0],
        category: "General",
        phrase: parts[1],
        pathLabel: o.label
      };
    }
    return {
      id: o.value,
      roof: "Other",
      category: "General",
      phrase: parts[0] || o.label,
      pathLabel: o.label
    };
  });
}

export type MKFieldworkPhraseLibraryPanelHandle = {
  /** Inserts any selected phrases via onInsert. Returns how many were inserted. */
  commitSelection: () => number;
  selectedCount: () => number;
};

type Props = {
  active?: boolean;
  disabled?: boolean;
  onInsert: (phraseText: string) => void;
  onSelectionCountChange?: (count: number) => void;
};

export const MKFieldworkPhraseLibraryPanel = forwardRef<
  MKFieldworkPhraseLibraryPanelHandle,
  Props
>(function MKFieldworkPhraseLibraryPanel(
  { active = true, disabled = false, onInsert, onSelectionCountChange },
  ref
) {
  const [entryType, setEntryType] = useState<FieldworkEntryType>("observation");
  const [loading, setLoading] = useState(false);
  const [options, setOptions] = useState<FieldworkPhraseOption[]>([]);
  const [search, setSearch] = useState("");
  const [step, setStep] = useState<WizardStep>("roofs");
  const [roof, setRoof] = useState<string | null>(null);
  const [category, setCategory] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const onInsertRef = useRef(onInsert);
  onInsertRef.current = onInsert;

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const catalogs = await getFieldworkPhraseCatalogs();
        const listId =
          entryType === "work_performed"
            ? catalogs.work_performed?.list_id
            : catalogs.observation?.list_id;
        const leaves = listId ? await getPhraseLeafOptions(listId) : [];
        if (!cancelled) {
          setOptions(leaves);
          setSelectedIds([]);
          setSearch("");
          setRoof(null);
          setCategory(null);
          setStep("roofs");
        }
      } catch {
        if (!cancelled) setOptions([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [active, entryType]);

  const phrases = useMemo(() => parseLeaves(options), [options]);
  const phrasesById = useMemo(() => {
    const map = new Map<string, ParsedPhrase>();
    for (const p of phrases) map.set(p.id, p);
    return map;
  }, [phrases]);

  const tree = useMemo(() => {
    const roofs = new Map<string, Map<string, number>>();
    for (const p of phrases) {
      if (!roofs.has(p.roof)) roofs.set(p.roof, new Map());
      const cats = roofs.get(p.roof)!;
      cats.set(p.category, (cats.get(p.category) || 0) + 1);
    }
    return Array.from(roofs.entries()).map(([roofName, cats]) => ({
      roof: roofName,
      categories: Array.from(cats.entries()).map(([name, count]) => ({ name, count })),
      count: Array.from(cats.values()).reduce((a, b) => a + b, 0)
    }));
  }, [phrases]);

  // Single roof → skip straight to categories when data loads.
  useEffect(() => {
    if (!active || loading || search.trim()) return;
    if (step !== "roofs") return;
    if (tree.length === 1 && !roof) {
      setRoof(tree[0].roof);
      setCategory(null);
      setStep("categories");
    }
  }, [active, loading, tree, step, roof, search]);

  const q = search.trim().toLowerCase();
  const searching = q.length > 0;

  const currentRoofNode = useMemo(
    () => tree.find((t) => t.roof === roof) || null,
    [tree, roof]
  );

  const visiblePhrases = useMemo(() => {
    if (searching) {
      return phrases.filter(
        (p) =>
          p.phrase.toLowerCase().includes(q) ||
          p.category.toLowerCase().includes(q) ||
          p.roof.toLowerCase().includes(q) ||
          p.pathLabel.toLowerCase().includes(q)
      );
    }
    if (roof && category) {
      return phrases.filter((p) => p.roof === roof && p.category === category);
    }
    return [];
  }, [phrases, searching, q, roof, category]);

  const selectedCount = selectedIds.length;
  const visibleSelectedCount = visiblePhrases.filter((p) => selectedIds.includes(p.id)).length;
  const allVisibleSelected =
    visiblePhrases.length > 0 && visibleSelectedCount === visiblePhrases.length;

  useEffect(() => {
    onSelectionCountChange?.(selectedCount);
  }, [selectedCount, onSelectionCountChange]);

  const commitSelection = (): number => {
    if (!selectedIds.length || disabled) return 0;
    const texts = selectedIds
      .map((id) => phrasesById.get(id)?.phrase)
      .filter((t): t is string => !!t && t.trim().length > 0);
    if (!texts.length) return 0;
    onInsertRef.current(texts.join("\n"));
    setSelectedIds([]);
    return texts.length;
  };

  useImperativeHandle(
    ref,
    () => ({
      commitSelection,
      selectedCount: () => selectedIds.length
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- commit reads latest via state/refs
    [selectedIds, disabled, phrasesById]
  );

  const toggleId = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const toggleVisible = (selectAll: boolean) => {
    const ids = visiblePhrases.map((p) => p.id);
    setSelectedIds((prev) => {
      if (selectAll) {
        const set = new Set(prev);
        for (const id of ids) set.add(id);
        return Array.from(set);
      }
      const drop = new Set(ids);
      return prev.filter((id) => !drop.has(id));
    });
  };

  const goBack = () => {
    if (searching) {
      setSearch("");
      if (roof && category) setStep("phrases");
      else if (roof) setStep("categories");
      else setStep("roofs");
      return;
    }
    if (step === "phrases") {
      setCategory(null);
      setStep("categories");
      return;
    }
    if (step === "categories") {
      if (tree.length <= 1) return;
      setRoof(null);
      setCategory(null);
      setStep("roofs");
    }
  };

  const canGoBack =
    searching ||
    step === "phrases" ||
    (step === "categories" && tree.length > 1);

  const stepTitle = searching
    ? `Search (${visiblePhrases.length})`
    : step === "roofs"
      ? "Choose roof type"
      : step === "categories"
        ? roof || "Choose category"
        : category || "Phrases";

  const stepHint = searching
    ? "Tap phrases to select, then tap Done."
    : step === "roofs"
      ? "Pick a roof type to continue."
      : step === "categories"
        ? "Pick a category to see phrases."
        : "Select phrases, then tap Done.";

  const onSearchChange = (value: string) => {
    setSearch(value);
    if (value.trim()) {
      // Search jumps to a full-width phrase list.
      setStep("phrases");
    }
  };

  const renderNavRow = (
    key: string,
    title: string,
    count: number,
    onPress: () => void
  ) => (
    <TouchableOpacity key={key} style={styles.navRow} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.navRowBody}>
        <Text style={styles.navRowTitle}>{title}</Text>
        <Text style={styles.navRowMeta}>{count} phrase{count === 1 ? "" : "s"}</Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
    </TouchableOpacity>
  );

  return (
    <View style={styles.wrap}>
      <View style={styles.topRow}>
        {(["observation", "work_performed"] as FieldworkEntryType[]).map((t) => (
          <TouchableOpacity
            key={t}
            style={[styles.kindChip, entryType === t && styles.kindChipActive]}
            onPress={() => setEntryType(t)}
          >
            <Text style={[styles.kindChipText, entryType === t && styles.kindChipTextActive]}>
              {t === "work_performed" ? "Work Performed" : "Observed Conditions"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <TextInput
        style={styles.search}
        value={search}
        onChangeText={onSearchChange}
        placeholder="Search phrases…"
        placeholderTextColor={colors.textMuted}
        returnKeyType="search"
      />

      <View style={styles.stepHeader}>
        {canGoBack ? (
          <TouchableOpacity style={styles.backBtn} onPress={goBack} hitSlop={8}>
            <Ionicons name="chevron-back" size={22} color={colors.primary} />
            <Text style={styles.backText}>Back</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.backPlaceholder} />
        )}
        <View style={styles.stepTitles}>
          <Text style={styles.stepTitle} numberOfLines={1}>
            {stepTitle}
          </Text>
          <Text style={styles.stepHint} numberOfLines={1}>
            {stepHint}
          </Text>
        </View>
        {!searching && step === "phrases" && roof ? (
          <Text style={styles.crumb} numberOfLines={1}>
            {roof}
          </Text>
        ) : null}
      </View>

      <View style={styles.body}>
        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.lg }} />
        ) : searching || step === "phrases" ? (
          <>
            <View style={styles.listHeader}>
              <Text style={styles.listCount}>
                {visiblePhrases.length} phrase{visiblePhrases.length === 1 ? "" : "s"}
              </Text>
              {visiblePhrases.length > 0 ? (
                <TouchableOpacity onPress={() => toggleVisible(!allVisibleSelected)}>
                  <Text style={styles.selectVisible}>
                    {allVisibleSelected ? "Clear visible" : "Select visible"}
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>
            <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
              {visiblePhrases.length === 0 ? (
                <Text style={styles.empty}>No phrases here.</Text>
              ) : (
                visiblePhrases.map((p) => {
                  const checked = selectedIds.includes(p.id);
                  return (
                    <TouchableOpacity
                      key={p.id}
                      style={[styles.phraseRow, checked && styles.phraseRowChecked]}
                      onPress={() => toggleId(p.id)}
                      disabled={disabled}
                      activeOpacity={0.7}
                    >
                      <Ionicons
                        name={checked ? "checkbox" : "square-outline"}
                        size={22}
                        color={checked ? colors.primary : colors.textMuted}
                      />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.phraseText}>{p.phrase}</Text>
                        {searching ? (
                          <Text style={styles.phraseMeta}>
                            {p.roof} › {p.category}
                          </Text>
                        ) : null}
                      </View>
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>
          </>
        ) : step === "categories" ? (
          <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
            {!currentRoofNode || currentRoofNode.categories.length === 0 ? (
              <Text style={styles.empty}>No categories here.</Text>
            ) : (
              currentRoofNode.categories.map((cat) =>
                renderNavRow(cat.name, cat.name, cat.count, () => {
                  setSearch("");
                  setCategory(cat.name);
                  setStep("phrases");
                })
              )
            )}
          </ScrollView>
        ) : (
          <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
            {tree.length === 0 ? (
              <Text style={styles.empty}>No phrases in this catalog yet.</Text>
            ) : (
              tree.map((node) =>
                renderNavRow(node.roof, node.roof, node.count, () => {
                  setSearch("");
                  setRoof(node.roof);
                  setCategory(null);
                  setStep("categories");
                })
              )
            )}
          </ScrollView>
        )}
      </View>

      {selectedCount > 0 ? (
        <View style={styles.footer}>
          <Text style={styles.footerMeta}>
            {selectedCount} selected · will insert when you tap Done
          </Text>
        </View>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    minHeight: 320,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.card,
    overflow: "hidden",
    backgroundColor: colors.card
  },
  topRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, padding: spacing.sm },
  kindChip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs
  },
  kindChipActive: { borderColor: colors.primary, backgroundColor: colors.drawerActiveBg },
  kindChipText: { ...typography.caption, color: colors.textBody, fontWeight: "600" },
  kindChipTextActive: { color: colors.primary },
  search: {
    marginHorizontal: spacing.sm,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    ...typography.body
  },
  stepHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border
  },
  backBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.xs,
    paddingRight: spacing.xs
  },
  backText: { ...typography.bodySmall, color: colors.primary, fontWeight: "700" },
  backPlaceholder: { width: 4 },
  stepTitles: { flex: 1, minWidth: 0 },
  stepTitle: { ...typography.body, fontWeight: "700", color: colors.textBody },
  stepHint: { ...typography.caption, color: colors.textMuted, marginTop: 1 },
  crumb: {
    ...typography.caption,
    color: colors.textMuted,
    maxWidth: 88,
    textAlign: "right"
  },
  body: { flex: 1, minHeight: 200 },
  listHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs
  },
  listCount: { ...typography.caption, color: colors.textMuted },
  selectVisible: { ...typography.caption, color: colors.primary, fontWeight: "700" },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: spacing.md },
  navRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.card
  },
  navRowBody: { flex: 1, minWidth: 0 },
  navRowTitle: { ...typography.body, fontWeight: "700", color: colors.textBody },
  navRowMeta: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
  phraseRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border
  },
  phraseRowChecked: { backgroundColor: colors.drawerActiveBg },
  phraseText: { ...typography.bodySmall, color: colors.textBody },
  phraseMeta: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
  footer: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    padding: spacing.sm,
    gap: spacing.xs,
    backgroundColor: colors.background
  },
  footerMeta: { ...typography.caption, color: colors.textMuted },
  empty: { ...typography.caption, color: colors.textMuted, padding: spacing.md }
});
