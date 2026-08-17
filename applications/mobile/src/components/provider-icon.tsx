import { Image } from "expo-image";
import { View } from "react-native";

export type KeeperProvider =
  | "google"
  | "outlook"
  | "microsoft"
  | "microsoft-365"
  | "icloud"
  | "fastmail"
  | "nextcloud"
  | "radicale";

const providerSources: Record<KeeperProvider, number> = {
  google: require("../../assets/providers/google-calendar.svg"),
  outlook: require("../../assets/providers/outlook.svg"),
  microsoft: require("../../assets/providers/microsoft-365.svg"),
  "microsoft-365": require("../../assets/providers/microsoft-365.svg"),
  icloud: require("../../assets/providers/icloud.svg"),
  fastmail: require("../../assets/providers/fastmail.svg"),
  nextcloud: require("../../assets/providers/nextcloud.svg"),
  radicale: require("../../assets/providers/radicale.svg"),
};

export function ProviderIcon({
  provider,
  size = 22,
}: {
  provider: KeeperProvider;
  size?: number;
}) {
  return (
    <Image
      accessible={false}
      source={providerSources[provider]}
      contentFit="contain"
      style={{ width: size, height: size }}
    />
  );
}

export function asKeeperProvider(provider: string): KeeperProvider | null {
  const normalized = provider.toLowerCase();
  if (normalized === "microsoft") return "microsoft";
  if (normalized === "microsoft365" || normalized === "office365")
    return "microsoft-365";
  return normalized in providerSources ? (normalized as KeeperProvider) : null;
}

export function ProviderIconStack({
  providers,
  size = 24,
}: {
  providers: string[];
  size?: number;
}) {
  const unique = [
    ...new Set(
      providers
        .map(asKeeperProvider)
        .filter((provider): provider is KeeperProvider => provider !== null),
    ),
  ];
  return (
    <View
      style={{
        flexDirection: "row",
        paddingRight: Math.max(0, unique.length - 1) * 8,
      }}
    >
      {unique.slice(0, 4).map((provider, index) => (
        <View
          key={provider}
          style={{
            marginRight: -8,
            width: size + 4,
            height: size + 4,
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 999,
            backgroundColor: "white",
            zIndex: unique.length - index,
          }}
        >
          <ProviderIcon provider={provider} size={size} />
        </View>
      ))}
    </View>
  );
}
