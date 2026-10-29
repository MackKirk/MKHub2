import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { MKButton } from "../MKButton";
import { listEmployees } from "../../services/users";
import { colors } from "../../theme/colors";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";
import { radius } from "../../theme/radius";
import type { AssetAssignmentAssignRequest } from "../../types/fleet";

interface FleetAssignModalProps {
  visible: boolean;
  title: string;
  showOdometer: boolean;
  showHours: boolean;
  minOdometer?: number | null;
  defaultOdometer?: number | null;
  defaultHours?: number | null;
  loading?: boolean;
  currentUserId?: string | null;
  currentUserName?: string | null;
  onClose: () => void;
  onSubmit: (payload: AssetAssignmentAssignRequest) => void;
}

export const FleetAssignModal: React.FC<FleetAssignModalProps> = ({
  visible,
  title,
  showOdometer,
  showHours,
  minOdometer,
  defaultOdometer,
  defaultHours,
  loading = false,
  currentUserId,
  currentUserName,
  onClose,
  onSubmit
}) => {
  const [odometerOut, setOdometerOut] = useState("");
  const [hoursOut, setHoursOut] = useState("");
  const [notesOut, setNotesOut] = useState("");
  const [personQuery, setPersonQuery] = useState("");
  const [people, setPeople] = useState<Array<{ id: string; name: string }>>([]);
  const [selected, setSelected] = useState<{ id: string; name: string } | null>(null);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setOdometerOut(defaultOdometer != null ? String(defaultOdometer) : "");
    setHoursOut(defaultHours != null ? String(defaultHours) : "");
    setNotesOut("");
    setPersonQuery("");
    setSelected(
      currentUserId
        ? { id: currentUserId, name: currentUserName?.trim() || "You" }
        : null
    );
  }, [visible, defaultOdometer, defaultHours, currentUserId, currentUserName]);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      setSearching(true);
      void listEmployees(personQuery)
        .then((rows) => {
          if (!cancelled) setPeople(rows);
        })
        .catch(() => {
          if (!cancelled) setPeople([]);
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [visible, personQuery]);

  const handleSubmit = () => {
    if (!selected) return;
    onSubmit({
      assigned_to_user_id: selected.id,
      assigned_to_name: selected.name,
      odometer_out: odometerOut.trim() ? Number.parseInt(odometerOut, 10) : null,
      hours_out: hoursOut.trim() ? Number.parseFloat(hoursOut) : null,
      notes_out: notesOut.trim() || null
    });
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.container}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>
          {selected ? `Checking out to ${selected.name}.` : "Choose who receives this asset."}
        </Text>

        <ScrollView style={styles.form} keyboardShouldPersistTaps="handled">
          <View style={styles.field}>
            <Text style={styles.label}>Person</Text>
            <TextInput
              style={styles.input}
              value={personQuery}
              onChangeText={setPersonQuery}
              placeholder="Search by name"
              placeholderTextColor={colors.textMuted}
            />
            {searching ? <ActivityIndicator color={colors.primary} /> : null}
            {people.slice(0, 8).map((person) => {
              const active = selected?.id === person.id;
              return (
                <Pressable
                  key={person.id}
                  style={[styles.personRow, active && styles.personRowActive]}
                  onPress={() => setSelected(person)}
                >
                  <Text style={[styles.personName, active && styles.personNameActive]}>
                    {person.name}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {showOdometer ? (
            <View style={styles.field}>
              <Text style={styles.label}>
                Odometer out{minOdometer != null ? ` (min ${minOdometer})` : ""}
              </Text>
              <TextInput
                style={styles.input}
                value={odometerOut}
                onChangeText={setOdometerOut}
                keyboardType="number-pad"
                placeholder="Current odometer"
                placeholderTextColor={colors.textMuted}
              />
            </View>
          ) : null}

          {showHours ? (
            <View style={styles.field}>
              <Text style={styles.label}>Hours out</Text>
              <TextInput
                style={styles.input}
                value={hoursOut}
                onChangeText={setHoursOut}
                keyboardType="decimal-pad"
                placeholder="Current hours"
                placeholderTextColor={colors.textMuted}
              />
            </View>
          ) : null}

          <View style={styles.field}>
            <Text style={styles.label}>Notes</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={notesOut}
              onChangeText={setNotesOut}
              placeholder="Optional notes"
              placeholderTextColor={colors.textMuted}
              multiline
            />
          </View>
        </ScrollView>

        <View style={styles.actions}>
          <MKButton title="Cancel" variant="secondary" onPress={onClose} disabled={loading} />
          <MKButton
            title="Check out"
            onPress={handleSubmit}
            loading={loading}
            disabled={!selected}
          />
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: spacing.xl,
    paddingTop: spacing.xxl
  },
  title: {
    ...typography.titleSmall,
    color: colors.textPrimary
  },
  subtitle: {
    ...typography.bodySmall,
    color: colors.textMuted,
    marginTop: spacing.xs,
    marginBottom: spacing.lg
  },
  form: {
    flex: 1
  },
  field: {
    marginBottom: spacing.md
  },
  personRow: {
    minHeight: 40,
    justifyContent: "center",
    paddingHorizontal: 10,
    borderRadius: 10
  },
  personRowActive: {
    backgroundColor: "#F0FDF4"
  },
  personName: {
    fontSize: 15,
    color: colors.textPrimary
  },
  personNameActive: {
    fontFamily: typography.button.fontFamily,
    color: colors.homeAccent
  },
  label: {
    ...typography.caption,
    color: colors.textMuted,
    marginBottom: spacing.xs,
    textTransform: "uppercase"
  },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.control,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    ...typography.body,
    color: colors.textPrimary
  },
  textArea: {
    minHeight: 96,
    textAlignVertical: "top"
  },
  actions: {
    gap: spacing.sm,
    paddingTop: spacing.md
  }
});
