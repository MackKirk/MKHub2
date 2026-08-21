import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  ImageBackground,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import LogoLight from "../../../assets/login/logo-light.svg";
import { useAuth } from "../../hooks/useAuth";
import { MKButton } from "../../components/MKButton";
import { resolveFileUrl } from "../../lib/fileUrls";
import { api, toApiError } from "../../services/api";
import { colors } from "../../theme/colors";
import { radius, shadows } from "../../theme/radius";
import { spacing } from "../../theme/spacing";
import { fontFamily, typography } from "../../theme/typography";

const IDENTIFIER_KEY = "MK_HUB_LOGIN_IDENTIFIER";
const BRAND_RED = "#a31414";
const BRAND_RED_DARK = "#7f1010";
const LOGO_VIEWBOX = "0 80 1768.52 920";
const LOGO_ASPECT = 1768.52 / 920;
const LOGIN_ERROR_CREDENTIALS = "Incorrect username or password.";
const LOGIN_ERROR_DEACTIVATED =
  "This account has been deactivated. Please contact your company administration.";
const LOGIN_ERROR_GENERIC = "Login failed. Please try again.";

function loginErrorMessage(raw: string): string {
  const lower = raw.toLowerCase();
  if (lower.includes("too many login attempts") || lower.includes("too many requests")) {
    return raw;
  }
  if (!raw || lower === "unauthorized" || lower === "invalid credentials") {
    return LOGIN_ERROR_CREDENTIALS;
  }
  if (
    lower.includes("deactivated") ||
    lower.includes("not active") ||
    lower.includes("inactive")
  ) {
    return LOGIN_ERROR_DEACTIVATED;
  }
  return raw || LOGIN_ERROR_GENERIC;
}

export const LoginScreen: React.FC = () => {
  const { login, isLoading } = useAuth();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const logoWidth = Math.round(Math.min(340, windowWidth * 0.82) * 0.7);
  const logoHeight = Math.round(logoWidth / LOGO_ASPECT);
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [backgroundFailed, setBackgroundFailed] = useState(false);
  const [panelPhotoFailed, setPanelPhotoFailed] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotIdentifier, setForgotIdentifier] = useState("");
  const [forgotSent, setForgotSent] = useState(false);
  const [forgotSubmitting, setForgotSubmitting] = useState(false);

  const backgroundUri = resolveFileUrl("/ui/assets/login/background.jpg", null);
  const panelPhotoUri = resolveFileUrl("/ui/assets/login/panel-photo.jpg", null);
  const privacyUrl = resolveFileUrl("/privacy-policy", null);

  const backgroundSource = useMemo(
    () =>
      backgroundFailed || !backgroundUri ? undefined : { uri: backgroundUri },
    [backgroundFailed, backgroundUri]
  );
  const panelPhotoSource = useMemo(
    () =>
      panelPhotoFailed || !panelPhotoUri ? undefined : { uri: panelPhotoUri },
    [panelPhotoFailed, panelPhotoUri]
  );

  useEffect(() => {
    void AsyncStorage.getItem(IDENTIFIER_KEY).then((saved) => {
      if (saved) {
        setIdentifier(saved);
        setRememberMe(true);
      }
    });
  }, []);

  const persistIdentifier = async (value: string, remember: boolean) => {
    if (remember && value.trim()) {
      await AsyncStorage.setItem(IDENTIFIER_KEY, value.trim());
    } else {
      await AsyncStorage.removeItem(IDENTIFIER_KEY);
    }
  };

  const handleSubmit = async () => {
    setError(null);
    if (!identifier.trim() || !password) {
      setError(LOGIN_ERROR_CREDENTIALS);
      return;
    }
    try {
      await persistIdentifier(identifier, rememberMe);
      await login(identifier.trim(), password);
    } catch (err) {
      const apiError = toApiError(err);
      setError(loginErrorMessage(apiError.message));
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

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />
      <LinearGradient
        colors={[BRAND_RED_DARK, BRAND_RED]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.hero}
      >
        {panelPhotoSource ? (
          <Image
            source={panelPhotoSource}
            style={styles.panelPhoto}
            resizeMode="cover"
            onError={() => setPanelPhotoFailed(true)}
          />
        ) : null}
        <LinearGradient
          colors={["rgba(127,16,16,0.2)", "transparent", "rgba(92,12,12,0.7)"]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        <LogoLight
          width={logoWidth}
          height={logoHeight}
          viewBox={LOGO_VIEWBOX}
          preserveAspectRatio="xMidYMid meet"
          accessibilityLabel="Mack Kirk logo"
          style={styles.logo}
        />
      </LinearGradient>

      <View style={styles.formPane}>
        {backgroundSource ? (
          <ImageBackground
            source={backgroundSource}
            style={StyleSheet.absoluteFill}
            imageStyle={styles.formBgImage}
            onError={() => setBackgroundFailed(true)}
          />
        ) : null}
        <LinearGradient
          colors={[
            "rgba(255,255,255,0.70)",
            "rgba(255,255,255,0.45)",
            "rgba(247,244,243,0.55)"
          ]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />

        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <ScrollView
            contentContainerStyle={[
              styles.scrollContent,
              { paddingBottom: insets.bottom + spacing.xl }
            ]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.formInner}>
              <Text style={styles.title}>MKHub Sign in</Text>
              <Text style={styles.subtitle}>
                Enter your credentials to continue.
              </Text>

              <Text style={styles.label}>Email or username</Text>
              <View style={[styles.inputWrap, error ? styles.inputWrapError : null]}>
                <Ionicons
                  name="person-outline"
                  size={18}
                  color={colors.textMuted}
                />
                <TextInput
                  style={styles.input}
                  placeholder="you@company.com"
                  placeholderTextColor={colors.textMuted}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  textContentType="username"
                  autoComplete="username"
                  value={identifier}
                  onChangeText={(value) => {
                    setIdentifier(value);
                    if (error) setError(null);
                  }}
                  onBlur={() => {
                    if (rememberMe) void persistIdentifier(identifier, true);
                  }}
                  returnKeyType="next"
                />
              </View>

              <Text style={styles.label}>Password</Text>
              <View style={[styles.inputWrap, error ? styles.inputWrapError : null]}>
                <Ionicons
                  name="lock-closed-outline"
                  size={18}
                  color={colors.textMuted}
                />
                <TextInput
                  style={styles.input}
                  placeholder="Enter your password"
                  placeholderTextColor={colors.textMuted}
                  secureTextEntry={!showPassword}
                  textContentType="password"
                  autoComplete="password"
                  value={password}
                  onChangeText={(value) => {
                    setPassword(value);
                    if (error) setError(null);
                  }}
                  returnKeyType="done"
                  onSubmitEditing={handleSubmit}
                />
                <Pressable
                  onPress={() => setShowPassword((v) => !v)}
                  hitSlop={8}
                  accessibilityLabel={
                    showPassword ? "Hide password" : "Show password"
                  }
                >
                  <Ionicons
                    name={showPassword ? "eye-off-outline" : "eye-outline"}
                    size={18}
                    color={colors.textMuted}
                  />
                </Pressable>
              </View>

              <View style={styles.rowBetween}>
                <Pressable
                  style={styles.rememberRow}
                  onPress={() => {
                    const next = !rememberMe;
                    setRememberMe(next);
                    void persistIdentifier(identifier, next);
                  }}
                >
                  <View
                    style={[
                      styles.checkbox,
                      rememberMe && styles.checkboxChecked
                    ]}
                  >
                    {rememberMe ? (
                      <Ionicons name="checkmark" size={12} color="#fff" />
                    ) : null}
                  </View>
                  <Text style={styles.rememberText}>Remember me</Text>
                </Pressable>
                <TouchableOpacity onPress={() => setForgotOpen(true)}>
                  <Text style={styles.forgotLink}>Forgot password?</Text>
                </TouchableOpacity>
              </View>

              {error ? (
                <View style={styles.errorBox}>
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              ) : null}

              <TouchableOpacity
                style={[styles.signInBtn, isLoading && styles.signInBtnDisabled]}
                onPress={handleSubmit}
                disabled={isLoading}
                activeOpacity={0.85}
              >
                {isLoading ? (
                  <>
                    <ActivityIndicator color="#fff" size="small" />
                    <Text style={styles.signInText}>Signing in…</Text>
                  </>
                ) : (
                  <>
                    <Ionicons name="log-in-outline" size={18} color="#fff" />
                    <Text style={styles.signInText}>Sign in</Text>
                  </>
                )}
              </TouchableOpacity>

              <View style={styles.privacyWrap}>
                <TouchableOpacity
                  onPress={() => {
                    if (privacyUrl) void Linking.openURL(privacyUrl);
                  }}
                >
                  <Text style={styles.privacyLink}>Privacy Policy</Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>

      <Modal
        visible={forgotOpen}
        transparent
        animationType="fade"
        onRequestClose={closeForgotModal}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Password Recovery</Text>
            {!forgotSent ? (
              <>
                <Text style={styles.modalDescription}>
                  Enter your email or username to receive a password reset link.
                </Text>
                <Text style={styles.label}>Email or Username</Text>
                <View style={styles.inputWrap}>
                  <Ionicons
                    name="person-outline"
                    size={18}
                    color={colors.textMuted}
                  />
                  <TextInput
                    style={styles.input}
                    placeholder="Enter your email or username"
                    placeholderTextColor={colors.textMuted}
                    autoCapitalize="none"
                    autoCorrect={false}
                    value={forgotIdentifier}
                    onChangeText={setForgotIdentifier}
                  />
                </View>
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
                <Text style={styles.modalSuccess}>
                  ✓ Password reset email sent
                </Text>
                <Text style={styles.modalDescription}>
                  If the email or username exists in our system, you will receive
                  an email with instructions to reset your password.
                </Text>
                <View style={styles.modalActions}>
                  <MKButton
                    title="Close"
                    onPress={closeForgotModal}
                    style={styles.modalClose}
                  />
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
    flex: 1,
    backgroundColor: "#f7f4f3"
  },
  flex: {
    flex: 1
  },
  hero: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden"
  },
  panelPhoto: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.28,
    mixBlendMode: "luminosity"
  },
  logo: {
    zIndex: 1
  },
  formPane: {
    flex: 1,
    overflow: "hidden"
  },
  formBgImage: {
    resizeMode: "cover"
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: spacing.lg,
    justifyContent: "flex-start"
  },
  formInner: {
    width: "100%",
    maxWidth: 400,
    alignSelf: "center"
  },
  title: {
    fontFamily: fontFamily.bold,
    fontSize: 20,
    lineHeight: 28,
    color: colors.textPrimary
  },
  subtitle: {
    ...typography.bodySmall,
    color: colors.textMuted,
    marginTop: 4,
    marginBottom: spacing.lg
  },
  label: {
    fontFamily: fontFamily.bold,
    fontSize: 13,
    color: colors.textPrimary,
    marginBottom: 6
  },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.control,
    paddingHorizontal: spacing.md,
    backgroundColor: "#fff",
    marginBottom: spacing.md,
    minHeight: 48
  },
  inputWrapError: {
    borderColor: "#fecaca"
  },
  input: {
    flex: 1,
    fontSize: 16,
    fontFamily: fontFamily.regular,
    color: colors.textPrimary,
    paddingVertical: spacing.sm
  },
  rowBetween: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.md
  },
  rememberRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff"
  },
  checkboxChecked: {
    backgroundColor: colors.primary,
    borderColor: colors.primary
  },
  rememberText: {
    ...typography.bodySmall,
    color: colors.textBody
  },
  forgotLink: {
    fontFamily: fontFamily.bold,
    fontSize: 13,
    color: colors.primary
  },
  errorBox: {
    borderWidth: 1,
    borderColor: "#fecaca",
    backgroundColor: "#fef2f2",
    borderRadius: radius.control,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.md
  },
  errorText: {
    fontSize: 13,
    fontFamily: fontFamily.regular,
    color: "#991b1b"
  },
  signInBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.primary,
    borderRadius: radius.xl,
    minHeight: 48,
    ...shadows.buttonPrimary
  },
  signInBtnDisabled: {
    opacity: 0.75
  },
  signInText: {
    color: "#fff",
    ...typography.button
  },
  privacyWrap: {
    marginTop: spacing.xl,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    alignItems: "center"
  },
  privacyLink: {
    fontSize: 12,
    fontFamily: fontFamily.regular,
    color: colors.textMuted,
    textDecorationLine: "underline"
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.45)",
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
    marginTop: spacing.sm
  },
  modalActionButton: {
    flex: 1
  },
  modalClose: {
    alignSelf: "flex-end",
    minWidth: 120
  }
});
