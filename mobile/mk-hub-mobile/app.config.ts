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
    // Required for expo-secure-store native module with SDK 54
    "expo-secure-store"
  ],
  extra: {
    // TODO: Configure real API base URL via EXPO_PUBLIC_API_BASE_URL or similar env variable.
    apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL ?? "https://mkhub.example.com"
  }
});

export default defineConfig;

