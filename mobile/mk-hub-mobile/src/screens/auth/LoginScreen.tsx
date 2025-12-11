import React, { useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { useAuth } from "../../hooks/useAuth";
import { MKButton } from "../../components/MKButton";
import { MKCard } from "../../components/MKCard";
import { colors } from "../../theme/colors";
import { spacing } from "../../theme/spacing";
import { toApiError } from "../../services/api";

export const LoginScreen: React.FC = () => {
  const { login, isLoading } = useAuth();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setError(null);
    if (!identifier || !password) {
      setError("Please enter both email and password.");
      return;
    }
    try {
      console.log("[Login] Attempting login for:", identifier);
      await login(identifier, password);
      console.log("[Login] Login successful");
    } catch (err) {
      console.error("[Login] Login error:", err);
      const apiError = toApiError(err);
      const errorMessage = apiError.message || "Login failed. Please check your credentials and try again.";
      setError(errorMessage);
      Alert.alert("Login Failed", errorMessage);
    }
  };

  return (
    <View style={styles.container}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <Text style={styles.logo}>MK</Text>
            <Text style={styles.title}>MK Hub Mobile</Text>
            <Text style={styles.subtitle}>Field access for your shifts and tasks</Text>
          </View>

          <MKCard style={styles.card}>
            <Text style={styles.sectionTitle}>Sign In</Text>

            <View style={styles.inputContainer}>
              <Text style={styles.label}>Email or Username</Text>
              <TextInput
                style={[styles.input, error && styles.inputError]}
                placeholder="Enter your email or username"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                value={identifier}
                onChangeText={setIdentifier}
                returnKeyType="next"
              />
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.label}>Password</Text>
              <TextInput
                style={[styles.input, error && styles.inputError]}
                placeholder="Enter your password"
                placeholderTextColor={colors.textMuted}
                secureTextEntry
                value={password}
                onChangeText={setPassword}
                returnKeyType="done"
                onSubmitEditing={handleSubmit}
              />
            </View>

            {error ? (
              <View style={styles.errorContainer}>
                <Text style={styles.error}>{error}</Text>
              </View>
            ) : null}

            <View style={styles.buttonContainer}>
              <MKButton
                title="Sign In"
                onPress={handleSubmit}
                loading={isLoading}
              />
            </View>
          </MKCard>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl
  },
  header: {
    alignItems: "center",
    marginBottom: spacing.xl
  },
  logo: {
    fontSize: 48,
    fontWeight: "900",
    color: colors.primary,
    marginBottom: spacing.sm,
    letterSpacing: 2
  },
  title: {
    fontSize: 28,
    fontWeight: "800",
    color: colors.textPrimary,
    marginBottom: spacing.xs,
    letterSpacing: 0.5
  },
  subtitle: {
    fontSize: 15,
    color: colors.textMuted,
    textAlign: "center",
    paddingHorizontal: spacing.lg
  },
  card: {
    marginTop: spacing.lg
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.textPrimary,
    marginBottom: spacing.lg
  },
  inputContainer: {
    marginBottom: spacing.lg
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.textPrimary,
    marginBottom: spacing.xs
  },
  input: {
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: 16,
    color: colors.textPrimary,
    backgroundColor: "#fafafa"
  },
  inputError: {
    borderColor: colors.error
  },
  errorContainer: {
    backgroundColor: "#ffebee",
    borderRadius: 8,
    padding: spacing.md,
    marginBottom: spacing.md
  },
  error: {
    color: colors.error,
    fontSize: 14,
    fontWeight: "500"
  },
  buttonContainer: {
    marginTop: spacing.md
  }
});


