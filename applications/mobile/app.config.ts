import type { ExpoConfig, ConfigContext } from "expo/config";

const defaultServerUrl =
  process.env.EXPO_PUBLIC_KEEPER_SERVER_URL ?? "https://www.keeper.sh";
const associatedHost = new URL(defaultServerUrl).hostname;

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "Keeper.sh",
  slug: "keeper-sh",
  owner: process.env.EXPO_PUBLIC_EAS_OWNER ?? "ridafkih",
  version: "0.1.0",
  orientation: "default",
  icon: "./assets/icon.png",
  scheme: "keeper",
  userInterfaceStyle: "automatic",
  newArchEnabled: true,
  ios: {
    supportsTablet: true,
    bundleIdentifier: "sh.keeper.mobile",
    associatedDomains: [
      `applinks:${associatedHost}`,
      `webcredentials:${associatedHost}`,
    ],
    infoPlist: {
      NSFaceIDUsageDescription:
        "Use Face ID to unlock Keeper.sh on this device.",
    },
  },
  android: {
    package: "sh.keeper.mobile",
    adaptiveIcon: {
      foregroundImage: "./assets/adaptive-icon.png",
      backgroundColor: "#f7f7f5",
    },
    intentFilters: [
      {
        action: "VIEW",
        autoVerify: true,
        data: [{ scheme: "https", host: associatedHost, pathPrefix: "/open" }],
        category: ["BROWSABLE", "DEFAULT"],
      },
    ],
  },
  web: { bundler: "metro" },
  plugins: [
    "expo-router",
    "expo-font",
    [
      "expo-splash-screen",
      {
        image: "./assets/splash-icon.png",
        imageWidth: 160,
        resizeMode: "contain",
        backgroundColor: "#f7f7f5",
        dark: {
          image: "./assets/splash-icon-dark.png",
          backgroundColor: "#111111",
        },
      },
    ],
    "expo-secure-store",
    [
      "expo-local-authentication",
      { faceIDPermission: "Use Face ID to unlock Keeper.sh." },
    ],
    ["expo-notifications", { defaultChannel: "keeper-updates" }],
  ],
  experiments: { typedRoutes: true },
  extra: {
    defaultServerUrl,
    eas: {
      projectId:
        process.env.EXPO_PUBLIC_EAS_PROJECT_ID ??
        "a3bcbf47-5f52-44c1-968f-29e4b51a84b9",
    },
  },
});
