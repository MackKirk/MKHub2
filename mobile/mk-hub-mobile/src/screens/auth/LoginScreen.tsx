import React, { useMemo, useState } from "react";
import {
  Alert,
  ImageBackground,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";
import Constants from "expo-constants";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import LogoLight from "../../../assets/login/logo-light.svg";
import { useAuth } from "../../hooks/useAuth";
import { MKButton } from "../../components/MKButton";
import { api, toApiError } from "../../services/api";
import { colors } from "../../theme/colors";
import { radius, shadows } from "../../theme/radius";
import { spacing } from "../../theme/spacing";
import { fontFamily, typography } from "../../theme/typography";

const HERO_SUBTITLE =
  "Mack Kirk Operations Hub — customers, proposals, inventory, and projects in one secure place.";

export const LoginScreen: React.FC = () => {
  const { login, isLoading } = useAuth();
  const insets = useSafeAreaInsets();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [backgroundFailed, setBackgroundFailed] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotIdentifier, setForgotIdentifier] = useState("");
  const [forgotSent, setForgotSent] = useState(false);
  const [forgotSubmitting, setForgotSubmitting] = useState(false);

  const apiBaseUrl =
    (Constants.expoConfig?.extra as { apiBaseUrl?: string } | undefined)?.apiBaseUrl ??
    "https://mkhub.example.com";
  const backgroundUri = `${apiBaseUrl.replace(/\/$/, "")}/ui/assets/login/background.jpg`;

  const backgroundSource = useMemo(
    () => (backgroundFailed ? undefined : { uri: backgroundUri }),
    [backgroundFailed, backgroundUri]
  );

  const handleSubmit = async () => {
    setError(null);
    if (!identifier || !password) {
      setError("Please enter both email and password.");
      return;
    }
    try {
      await login(identifier, password);
    } catch (err) {
      const apiError = toApiError(err);
      const errorMessage =
        apiError.message || "Login failed. Please check your credentials and try again.";
      setError(errorMessage);
      Alert.alert("Login Failed", errorMessage);
    }
  };

  const closeForgotModal = () => {
    setForgotOpen(false);
    setForgotIdentifier("");
    setForgotSent(false);
  };

  const sendRecoveryEmail = async () => {
    if (!forgotIdentifier.trim()) {
      Alert.alert("Password Recovery", "Please enter your email or username.");
      return;
    }
    setForgotSubmitting(true);
    try {
      await api.post(
        `/auth/password/forgot?identifier=${encodeURIComponent(forgotIdentifier.trim())}`
      );
      setForgotSent(true);
    } catch {
      setForgotSent(true);
    } finally {
      setForgotSubmitting(false);
    }
  };

  const renderBackground = (children: React.ReactNode) => {
    if (backgroundSource) {
      return (
        <ImageBackground
          source={backgroundSource}
          style={styles.background}
          imageStyle={styles.backgroundImage}
          onError={() => setBackgroundFailed(true)}
        >
          <View style={styles.backgroundOverlay} />
          {children}
        </ImageBackground>
      );
    }

    return (
      <LinearGradient
        colors={["#0b0b0c", "#1a1a1c", "#0b0b0c"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.background}
      >
        <View style={styles.backgroundOverlay} />
        {children}
      </LinearGradient>
    );
  };

  return (
    <View style={styles.root}>
      {renderBackground(
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <ScrollView
            contentContainerStyle={[
              styles.scrollContent,
              {
                paddingTop: insets.top + spacing.lg,
                paddingBottom: insets.bottom + spacing.lg
              }
            ]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.card}>
              <LinearGradient
                colors={["#7f1010", "#a31414"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.hero}
              >
                <View style={styles.brandRow}>
                  <LogoLight width={44} height={26} accessibilityLabel="Mack Kirk logo" />
                  <Text style={styles.brandName}>MKHub</Text>
                </View>
                <Text style={styles.heroTitle}>Welcome back!</Text>
                <Text style={styles.heroSubtitle}>{HERO_SUBTITLE}</Text>
              </LinearGradient>

              <View style={styles.formSection}>
                <Text style={styles.formTitle}>Sign in</Text>

                <View style={styles.fieldGroup}>
                  <TextInput
                    style={[styles.input, error ? styles.inputError : null]}
                    placeholder="Email or username"
                    placeholderTextColor={colors.textMuted}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="email-address"
                    textContentType="username"
                    autoComplete="username"
                    value={identifier}
                    onChangeText={setIdentifier}
                    returnKeyType="next"
                  />
                </View>

                <View style={styles.fieldGroup}>
                  <TextInput
                    style={[styles.input, error ? styles.inputError : null]}
                    placeholder="Password"
                    placeholderTextColor={colors.textMuted}
                    secureTextEntry
                    textContentType="password"
                    autoComplete="password"
                    value={password}
                    onChangeText={setPassword}
                    returnKeyType="done"
                    onSubmitEditing={handleSubmit}
                  />
                  {error ? <Text style={styles.errorText}>{error}</Text> : null}
                </View>

                <MKButton
                  title={isLoading ? "Signing in…" : "Login"}
                  onPress={handleSubmit}
                  loading={isLoading}
                  style={styles.loginButton}
                />

                <TouchableOpacity
                  style={styles.forgotLinkWrap}
                  onPress={() => setForgotOpen(true)}
                  accessibilityRole="button"
                >
                  <Text style={styles.forgotLink}>Forgot your password? Click here</Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      )}

      <Modal visible={forgotOpen} transparent animationType="fade" onRequestClose={closeForgotModal}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Password Recovery</Text>
            {!forgotSent ? (
              <>
                <Text style={styles.modalDescription}>
                  Enter your email or username to receive a password reset link.
                </Text>
                <Text style={styles.modalLabel}>Email or Username</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Enter your email or username"
                  placeholderTextColor={colors.textMuted}
                  autoCapitalize="none"
                  autoCorrect={false}
                  value={forgotIdentifier}
                  onChangeText={setForgotIdentifier}
                />
                <View style={styles.modalActions}>
                  <MKButton
                    title="Cancel"
                    variant="secondary"
                    onPress={closeForgotModal}
                    style={styles.modalActionButton}
                  />
                  <MKButton
                    title="Send Recovery Email"
                    onPress={sendRecoveryEmail}
                    loading={forgotSubmitting}
                    style={styles.modalActionButton}
                  />
                </View>
              </>
            ) : (
              <>
                <Text style={styles.modalSuccess}>Password reset email sent</Text>
                <Text style={styles.modalDescription}>
                  If the email or username exists in our system, you will receive an email with
                  instructions to reset your password.
                </Text>
                <View style={styles.modalActions}>
                  <MKButton title="Close" onPress={closeForgotModal} style={styles.modalClose} />
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1
  },
  flex: {
    flex: 1
  },
  background: {
    flex: 1
  },
  backgroundImage: {
    resizeMode: "cover"
  },
  backgroundOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.4)"
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: spacing.lg
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.cardElevated
  },
  hero: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xl
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm
  },
  brandName: {
    fontFamily: fontFamily.bold,
    fontSize: 22,
    color: "#ffffff",
    letterSpacing: 0.2
  },
  heroTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 30,
    lineHeight: 36,
    color: "#ffffff",
    marginTop: spacing.xl
  },
  heroSubtitle: {
    fontFamily: fontFamily.regular,
    fontSize: 16,
    lineHeight: 24,
    color: "rgba(255, 255, 255, 0.9)",
    marginTop: spacing.md
  },
  formSection: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xl
  },
  formTitle: {
    ...typography.titleSmall,
    marginBottom: spacing.lg
  },
  fieldGroup: {
    marginBottom: spacing.md
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.control,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: 16,
    fontFamily: fontFamily.regular,
    color: colors.textPrimary,
    backgroundColor: "#ffffff"
  },
  inputError: {
    borderColor: colors.error
  },
  errorText: {
    marginTop: spacing.xs,
    fontSize: 12,
    fontFamily: fontFamily.regular,
    color: colors.error
  },
  loginButton: {
    marginTop: spacing.sm
  },
  forgotLinkWrap: {
    marginTop: spacing.lg,
    alignItems: "center"
  },
  forgotLink: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    color: colors.textMuted,
    textDecorationLine: "underline"
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.45)",
    justifyContent: "center",
    paddingHorizontal: spacing.lg
  },
  modalCard: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    padding: spacing.xl,
    ...shadows.cardElevated
  },
  modalTitle: {
    ...typography.titleSmall,
    marginBottom: spacing.sm
  },
  modalDescription: {
    ...typography.bodySmall,
    color: colors.textBody,
    marginBottom: spacing.lg
  },
  modalLabel: {
    ...typography.bodySmall,
    fontFamily: fontFamily.bold,
    marginBottom: spacing.xs
  },
  modalSuccess: {
    fontFamily: fontFamily.bold,
    fontSize: 16,
    color: colors.success,
    marginBottom: spacing.sm
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: spacing.sm,
    marginTop: spacing.lg
  },
  modalActionButton: {
    flex: 1
  },
  modalClose: {
    alignSelf: "flex-end",
    minWidth: 120
  }
});
