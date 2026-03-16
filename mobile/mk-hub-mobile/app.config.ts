import type { ExpoConfig } from "expo/config";
import "dotenv/config";

const defineConfig = (): ExpoConfig => ({
  name: "MK Hub Mobile",
  slug: "mk-hub-mobile",
  version: "1.0.0",
  orientation: "portrait",
  userInterfaceStyle: "light",
  ios: {
    supportsTablet: false
  },
  android: {},
  web: {
    bundler: "metro"
  },
  plugins: [
    "expo-font",
    // Required for expo-secure-store native module with SDK 54
    "expo-secure-store"
  ],
  extra: {
    // Set EXPO_PUBLIC_API_BASE_URL to your MK Hub backend URL (see README).
    apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL ?? "https://mkhub.example.com"
  }
});

export default defineConfig;

