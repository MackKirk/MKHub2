import { TextStyle } from "react-native";
import { colors } from "./colors";

/**
 * Typography aligned with web (Montserrat). Use these font families after loading
 * Montserrat via useFonts in App (Montserrat_400Regular, Montserrat_700Bold).
 */
export const fontFamily = {
  regular: "Montserrat_400Regular",
  bold: "Montserrat_700Bold"
} as const;

export const typography: Record<string, TextStyle> = {
  title: {
    fontFamily: fontFamily.bold,
    fontSize: 24,
    lineHeight: 32,
    color: colors.textPrimary,
    letterSpacing: 0.25
  },
  titleSmall: {
    fontFamily: fontFamily.bold,
    fontSize: 20,
    lineHeight: 28,
    color: colors.textPrimary,
    letterSpacing: 0.2
  },
  subtitle: {
    fontFamily: fontFamily.bold,
    fontSize: 17,
    lineHeight: 24,
    color: colors.textPrimary,
    letterSpacing: 0.15
  },
  body: {
    fontFamily: fontFamily.regular,
    fontSize: 16,
    lineHeight: 24,
    color: colors.textPrimary,
    letterSpacing: 0.1
  },
  bodySmall: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    lineHeight: 20,
    color: colors.textPrimary,
    letterSpacing: 0.1
  },
  caption: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    lineHeight: 16,
    color: colors.textMuted,
    letterSpacing: 0.2
  },
  button: {
    fontFamily: fontFamily.bold,
    fontSize: 17,
    letterSpacing: 0.5
  },
  buttonSmall: {
    fontFamily: fontFamily.bold,
    fontSize: 15,
    letterSpacing: 0.3
  }
};
