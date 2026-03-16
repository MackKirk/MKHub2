import React from "react";
import {
  View,
  StyleSheet,
  ViewStyle,
  ScrollView,
  KeyboardAvoidingView,
  Platform
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "react-native";
import { colors } from "../theme/colors";
import { spacing } from "../theme/spacing";
import { typography } from "../theme/typography";

interface ScreenLayoutProps {
  children: React.ReactNode;
  title?: string;
  /** Use scroll for long content; default true */
  scroll?: boolean;
  /** Optional style for the inner content container */
  contentStyle?: ViewStyle;
  /** Optional style for the outer wrapper */
  style?: ViewStyle;
}

/**
 * Standard screen layout: safe area, optional title, consistent horizontal padding (spacing.xl).
 * Use for main app screens to align with web and simplify hierarchy.
 */
export const ScreenLayout: React.FC<ScreenLayoutProps> = ({
  children,
  title,
  scroll = true,
  contentStyle,
  style
}) => {
  const insets = useSafeAreaInsets();
  const paddingTop = Math.max(insets.top, spacing.lg);
  const paddingBottom = Math.max(insets.bottom, spacing.lg);
  const paddingHorizontal = spacing.xl;

  const content = (
    <View
      style={[
        styles.content,
        {
          paddingTop,
          paddingBottom,
          paddingHorizontal
        },
        contentStyle
      ]}
    >
      {title ? (
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
      ) : null}
      <View style={styles.childrenWrap}>{children}</View>
    </View>
  );

  if (scroll) {
    return (
      <View style={[styles.wrapper, style]}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {content}
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={[styles.wrapper, style]}>
      <KeyboardAvoidingView
        style={styles.keyboard}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        {content}
      </KeyboardAvoidingView>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    backgroundColor: colors.background
  },
  scroll: {
    flex: 1
  },
  scrollContent: {
    flexGrow: 1
  },
  keyboard: {
    flex: 1
  },
  content: {
    flex: 1
  },
  childrenWrap: {
    flex: 1
  },
  title: {
    ...typography.title,
    marginBottom: spacing.lg
  }
});
