import { Redirect, useLocalSearchParams } from "expo-router";
import { BodyText as Text } from "@/components/typography";
import { PrimaryButton } from "@/components/form-controls";
import { router } from "expo-router";

import { Screen } from "@/components/screen";
import { colors } from "@/design/colors";
import { resolveOpenRequest } from "@/navigation/deep-links";
import { useApp } from "@/providers/app-provider";

export default function OpenRoute() {
  const { path, ticket } = useLocalSearchParams<{
    path?: string[] | string;
    ticket?: string | string[];
  }>();
  const { session } = useApp();
  const segments = Array.isArray(path) ? path : path ? [path] : [];
  const request = resolveOpenRequest(segments, ticket);
  if (request.kind === "error")
    return (
      <Screen>
        <Text
          selectable
          accessibilityRole="alert"
          style={{ color: colors.danger }}
        >
          {request.error}
        </Text>
        <PrimaryButton
          variant="elevated"
          label="Return to Keeper.sh"
          onPress={() =>
            router.replace(session ? "/(tabs)/today" : "/(auth)/login")
          }
        />
      </Screen>
    );
  if (request.kind === "oauth")
    return <Redirect href={request.destination as never} />;
  return (
    <Redirect
      href={
        (session
          ? request.destination
          : `/(auth)/login?redirect=${encodeURIComponent(request.destination)}`) as never
      }
    />
  );
}
