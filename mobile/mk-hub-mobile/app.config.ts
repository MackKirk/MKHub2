import type { ExpoConfig } from "expo/config";
import "dotenv/config";

const defineConfig = (): ExpoConfig => ({
  name: "MK Hub Mobile",
  slug: "mk-hub-mobile",
  version: "1.0.2",
  icon: "./assets/icon.png",
  orientation: "portrait",
  userInterfaceStyle: "light",
  ios: {
    bundleIdentifier: "com.mkhub.m54",
    buildNumber: "4",
    icon: "./assets/icon.png",
    supportsTablet: false
  },
  android: {
    package: "com.mkhub.m54",
    versionCode: 4,
    adaptiveIcon: {
      foregroundImage: "./assets/adaptive-icon.png",
      backgroundColor: "#FFFFFF"
    }
  },
  web: {
    bundler: "metro"
  },
  plugins: [
    "expo-font",
    // Required for expo-secure-store native module with SDK 54
    "expo-secure-store",
    [
      "expo-notifications",
      {
        icon: "./assets/icon.png",
        color: "#d11616",
        defaultChannel: "hours-reminders"
      }
    ]
  ],
  extra: {
    // Set EXPO_PUBLIC_API_BASE_URL to your MK Hub backend URL (see README).
    apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL ?? "https://mkhub.example.com"
  }
});

export default defineConfig;

