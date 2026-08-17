import { useEffect, useState } from "react";
import { router } from "expo-router";
import { BodyText as Text } from "@/components/typography";

import { LoadingState } from "@/components/states";
import { Screen } from "@/components/screen";
import { colors } from "@/design/colors";
import { consumePendingIntent } from "@/navigation/pending-intent";
import { useApp } from "@/providers/app-provider";

export default function CallbackRoute() {
  const { refreshSession } = useApp();
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    refreshSession()
      .then((session) => {
        if (!live) return;
        if (!session) {
          setError(
            "Sign in did not complete. Return to the sign-in screen and try again.",
          );
          return;
        }
        router.replace((consumePendingIntent() ?? "/(tabs)/today") as never);
      })
      .catch((reason: unknown) => {
        if (live)
          setError(
            reason instanceof Error
              ? reason.message
              : "Sign in did not complete.",
          );
      });
    return () => {
      live = false;
    };
  }, [refreshSession]);
  return (
    <Screen>
      {error ? (
        <Text
          selectable
          accessibilityRole="alert"
          style={{ color: colors.danger }}
        >
          {error}
        </Text>
      ) : (
        <LoadingState label="Finishing sign in…" />
      )}
    </Screen>
  );
}
