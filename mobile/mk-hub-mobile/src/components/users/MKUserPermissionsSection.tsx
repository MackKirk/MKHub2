import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  applyPermissionUncheckCascade,
  canEnablePermission,
  permissionEnableBlockedMessage
} from "../../lib/permissionDependencies";
import { getUser, patchUser } from "../../services/users";
import {
  getUserPermissions,
  listPermissionTemplates,
  updateUserPermissions
} from "../../services/userPermissions";
import { toApiError } from "../../services/api";
import type {
  HubPermissionCategoryGroup,
  HubPermissionTemplate
} from "../../types/users";
import { colors } from "../../theme/colors";
import { spacing } from "../../theme/spacing";
import { radius, shadows } from "../../theme/radius";
import { typography } from "../../theme/typography";

const ACCENT = colors.homeAccent;

const HIDDEN_PERMISSION_KEYS = new Set([
  "inventory:access",
  "company_assets:access",
  "documents:access",
  "hr:access",
  "fleet:access",
  "training:access",
  "training:manage",
  "settings:access",
  "documents:delete",
  "documents:move",
  "fleet:read",
  "fleet:write",
  "fleet:manage",
  "equipment:read",
  "equipment:write",
  "equipment:manage",
  "work_orders:read",
  "work_orders:write",
  "work_orders:assign",
  "inspections:read",
  "inspections:write",
  "users:read",
  "users:write",
  "timesheet:read",
  "timesheet:write",
  "timesheet:approve",
  "timesheet:unrestricted_clock",
  "reviews:read",
  "reviews:admin"
]);

function isHiddenPermissionKey(key: string): boolean {
  return HIDDEN_PERMISSION_KEYS.has(key);
}

function mapsEqual(
  a: Record<string, boolean>,
  b: Record<string, boolean>
): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    if (!!a[key] !== !!b[key]) return false;
  }
  return true;
}

function enableAreaAccess(
  map: Record<string, boolean>,
  key: string
): Record<string, boolean> {
  const next = { ...map };
  if (!key.includes(":")) return next;
  const area = key.split(":")[0];
  const accessKey = `${area}:access`;
  if (Object.prototype.hasOwnProperty.call(next, accessKey)) {
    next[accessKey] = true;
  }
  return next;
}

interface MKUserPermissionsSectionProps {
  userId: string;
  canEdit: boolean;
  canManageRoles: boolean;
  onDirtyChange?: (dirty: boolean) => void;
}

export const MKUserPermissionsSection: React.FC<MKUserPermissionsSectionProps> = ({
  userId,
  canEdit,
  canManageRoles,
  onDirtyChange
}) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [categories, setCategories] = useState<HubPermissionCategoryGroup[]>([]);
  const [permissions, setPermissions] = useState<Record<string, boolean>>({});
  const [initialPermissions, setInitialPermissions] = useState<Record<string, boolean>>({});
  const [isAdmin, setIsAdmin] = useState(false);
  const [initialIsAdmin, setInitialIsAdmin] = useState(false);
  const [userRoles, setUserRoles] = useState<string[]>([]);
  const [userLoaded, setUserLoaded] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [templates, setTemplates] = useState<HubPermissionTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [perms, user] = await Promise.all([
        getUserPermissions(userId),
        getUser(userId).catch(() => null)
      ]);
      const map: Record<string, boolean> = {};
      (perms.permissions_by_category || []).forEach((group) => {
        group.permissions.forEach((perm) => {
          map[perm.key] = !!perm.is_granted;
        });
      });
      setCategories(perms.permissions_by_category || []);
      setPermissions(map);
      setInitialPermissions({ ...map });
      if (user) {
        const roles = user.roles ?? [];
        const admin = roles.some((role) => String(role).toLowerCase() === "admin");
        setUserRoles(roles);
        setIsActive(user.is_active !== false);
        setIsAdmin(admin);
        setInitialIsAdmin(admin);
        setUserLoaded(true);
      } else {
        setUserLoaded(false);
      }
      const nextTemplates = await listPermissionTemplates().catch(() => []);
      setTemplates(nextTemplates);
    } catch (err) {
      Alert.alert("Could not load permissions", toApiError(err).message);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const dirty =
    isAdmin !== initialIsAdmin || !mapsEqual(permissions, initialPermissions);

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  const visibleCategories = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return categories
      .map((group) => {
        const permissionsVisible = group.permissions.filter((perm) => {
          if (isHiddenPermissionKey(perm.key)) return false;
          if (!needle) return true;
          return (
            perm.label.toLowerCase().includes(needle) ||
            perm.key.toLowerCase().includes(needle)
          );
        });
        return { ...group, permissions: permissionsVisible };
      })
      .filter((group) => group.permissions.length > 0);
  }, [categories, query]);

  const toggleCategory = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleToggle = (key: string) => {
    if (!canEdit) return;
    setPermissions((prev) => {
      const turningOn = !prev[key];
      if (turningOn && !canEnablePermission(key, prev)) {
        Alert.alert(
          "Permission required",
          permissionEnableBlockedMessage(key) ||
            "Turn on the required permission first."
        );
        return prev;
      }
      if (!turningOn) {
        return applyPermissionUncheckCascade(key, { ...prev, [key]: false });
      }
      return enableAreaAccess({ ...prev, [key]: true }, key);
    });
  };

  const applyTemplate = (mode: "merge" | "replace") => {
    const template = templates.find((item) => item.id === selectedTemplateId);
    if (!template) return;
    const templateKeys = new Set(template.permission_keys || []);
    setPermissions((prev) => {
      const next: Record<string, boolean> = { ...prev };
      if (mode === "replace") {
        Object.keys(next).forEach((key) => {
          next[key] = false;
        });
      }
      templateKeys.forEach((key) => {
        next[key] = true;
      });
      Object.keys(next).forEach((key) => {
        if (next[key]) Object.assign(next, enableAreaAccess(next, key));
      });
      return next;
    });
  };

  const confirmApplyTemplate = () => {
    if (!selectedTemplateId) {
      Alert.alert("Select a template first");
      return;
    }
    Alert.alert(
      "Apply template",
      "Merge adds these permissions. Replace overwrites the current set.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Merge", onPress: () => applyTemplate("merge") },
        { text: "Replace", style: "destructive", onPress: () => applyTemplate("replace") }
      ]
    );
  };

  const handleSave = async () => {
    try {
      setSaving(true);
          if (canManageRoles && userLoaded && isAdmin !== initialIsAdmin) {
        const nextRoles = isAdmin
          ? Array.from(new Set([...userRoles, "admin"]))
          : userRoles.filter((role) => String(role).toLowerCase() !== "admin");
        const updated = await patchUser(userId, {
          roles: nextRoles,
          is_active: isActive
        });
        setUserRoles(updated.roles ?? nextRoles);
      }
      const payload: Record<string, boolean> = {};
      categories.forEach((group) => {
        group.permissions.forEach((perm) => {
          payload[perm.key] = !!permissions[perm.key];
        });
      });
      await updateUserPermissions(userId, payload);
      setInitialPermissions({ ...permissions });
      setInitialIsAdmin(isAdmin);
      Alert.alert("Saved", "Permissions were updated.");
    } catch (err) {
      Alert.alert("Could not save permissions", toApiError(err).message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={ACCENT} />
        <Text style={styles.muted}>Loading permissions…</Text>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {canManageRoles && userLoaded ? (
          <View style={styles.adminCard}>
            <View style={styles.row}>
              <View style={styles.rowCopy}>
                <Text style={styles.rowTitle}>Administrator access</Text>
                <Text style={styles.rowHint}>
                  Grants access to every area. Only turn this on for trusted people.
                </Text>
              </View>
              <Switch
                value={isAdmin}
                onValueChange={setIsAdmin}
                disabled={!canEdit}
                trackColor={{ false: "#e5e7eb", true: "#86efac" }}
                thumbColor={isAdmin ? ACCENT : "#f4f4f5"}
              />
            </View>
            {isAdmin ? (
              <Text style={styles.adminNote}>
                Individual permissions below are ignored while admin is on.
              </Text>
            ) : null}
          </View>
        ) : null}

        {canEdit && templates.length > 0 ? (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Permission template</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.templateRow}
            >
              {templates.map((template) => {
                const selected = selectedTemplateId === template.id;
                return (
                  <Pressable
                    key={template.id}
                    onPress={() => setSelectedTemplateId(template.id)}
                    style={[styles.chip, selected && styles.chipActive]}
                  >
                    <Text
                      style={[styles.chipText, selected && styles.chipTextActive]}
                    >
                      {template.name}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            <Pressable style={styles.templateBtn} onPress={confirmApplyTemplate}>
              <Text style={styles.templateBtnText}>Apply template</Text>
            </Pressable>
          </View>
        ) : null}

        <View style={styles.searchWrap}>
          <Ionicons name="search" size={18} color={colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search permissions…"
            placeholderTextColor={colors.textMuted}
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {query ? (
            <Pressable onPress={() => setQuery("")} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color={colors.textMuted} />
            </Pressable>
          ) : null}
        </View>

        {visibleCategories.length === 0 ? (
          <Text style={styles.muted}>No permissions match this search.</Text>
        ) : (
          visibleCategories.map((group) => {
            const open = expanded.has(group.category.id) || Boolean(query.trim());
            const granted = group.permissions.filter(
              (perm) => permissions[perm.key]
            ).length;
            return (
              <View key={group.category.id} style={styles.card}>
                <Pressable
                  onPress={() => toggleCategory(group.category.id)}
                  style={styles.categoryHeader}
                >
                  <Ionicons
                    name={open ? "chevron-down" : "chevron-forward"}
                    size={18}
                    color={colors.textMuted}
                  />
                  <View style={styles.categoryCopy}>
                    <Text style={styles.categoryTitle}>{group.category.label}</Text>
                    <Text style={styles.categoryMeta}>
                      {granted} of {group.permissions.length} on
                    </Text>
                  </View>
                </Pressable>
                {open
                  ? group.permissions.map((perm) => (
                      <View key={perm.key} style={styles.permRow}>
                        <View style={styles.rowCopy}>
                          <Text style={styles.permLabel}>{perm.label}</Text>
                          {perm.description ? (
                            <Text style={styles.rowHint} numberOfLines={2}>
                              {perm.description}
                            </Text>
                          ) : null}
                        </View>
                        <Switch
                          value={!!permissions[perm.key]}
                          onValueChange={() => handleToggle(perm.key)}
                          disabled={!canEdit}
                          trackColor={{ false: "#e5e7eb", true: "#86efac" }}
                          thumbColor={
                            permissions[perm.key] ? ACCENT : "#f4f4f5"
                          }
                        />
                      </View>
                    ))
                  : null}
              </View>
            );
          })
        )}
      </ScrollView>

      {canEdit ? (
        <View style={styles.footer}>
          <Text style={[styles.footerHint, dirty && styles.footerHintDirty]}>
            {dirty ? "You have unsaved changes" : "All changes saved"}
          </Text>
          <Pressable
            onPress={() => void handleSave()}
            disabled={!dirty || saving}
            style={[styles.saveBtn, (!dirty || saving) && styles.saveBtnDisabled]}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.saveBtnText}>Save permissions</Text>
            )}
          </Pressable>
        </View>
      ) : (
        <Text style={styles.viewOnly}>View only — you cannot change permissions.</Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { flex: 1, minHeight: 0 },
  scroll: { flex: 1 },
  content: { paddingBottom: spacing.xl, gap: spacing.sm },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
    gap: spacing.sm
  },
  muted: {
    ...typography.bodySmall,
    color: colors.textMuted,
    textAlign: "center",
    paddingVertical: spacing.md
  },
  adminCard: {
    backgroundColor: "#FFFBEB",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#FDE68A",
    padding: spacing.md,
    gap: spacing.sm
  },
  adminNote: {
    fontSize: 12,
    color: "#92400E"
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    ...shadows.card
  },
  sectionTitle: {
    fontFamily: typography.button.fontFamily,
    fontSize: 14,
    color: colors.textPrimary,
    marginBottom: spacing.sm
  },
  templateRow: { gap: spacing.sm, paddingRight: spacing.sm },
  chip: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "#fff",
    paddingHorizontal: 12,
    paddingVertical: 7
  },
  chipActive: {
    backgroundColor: ACCENT,
    borderColor: ACCENT
  },
  chipText: {
    fontFamily: typography.button.fontFamily,
    fontSize: 12,
    color: colors.textBody
  },
  chipTextActive: { color: "#fff" },
  templateBtn: {
    marginTop: spacing.sm,
    alignSelf: "flex-start",
    backgroundColor: ACCENT,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 8
  },
  templateBtnText: {
    fontFamily: typography.button.fontFamily,
    fontSize: 13,
    color: "#fff"
  },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    paddingHorizontal: 12,
    minHeight: 44,
    ...shadows.card
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    paddingVertical: 10,
    color: colors.textPrimary
  },
  categoryHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm
  },
  categoryCopy: { flex: 1, minWidth: 0 },
  categoryTitle: {
    fontFamily: typography.button.fontFamily,
    fontSize: 15,
    color: colors.textPrimary
  },
  categoryMeta: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 1
  },
  permRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    marginTop: spacing.md
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm
  },
  rowCopy: { flex: 1, minWidth: 0 },
  rowTitle: {
    fontFamily: typography.button.fontFamily,
    fontSize: 15,
    color: colors.textPrimary
  },
  permLabel: {
    fontSize: 14,
    color: colors.textPrimary
  },
  rowHint: {
    marginTop: 2,
    fontSize: 12,
    color: colors.textMuted
  },
  footer: {
    gap: spacing.sm,
    paddingTop: spacing.sm
  },
  footerHint: {
    fontSize: 12,
    color: colors.textMuted,
    textAlign: "center"
  },
  footerHintDirty: { color: "#B45309" },
  saveBtn: {
    backgroundColor: ACCENT,
    borderRadius: 14,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center"
  },
  saveBtnDisabled: { opacity: 0.45 },
  saveBtnText: {
    fontFamily: typography.button.fontFamily,
    fontSize: 15,
    color: "#fff"
  },
  viewOnly: {
    ...typography.bodySmall,
    color: colors.textMuted,
    textAlign: "center",
    paddingTop: spacing.sm
  }
});
