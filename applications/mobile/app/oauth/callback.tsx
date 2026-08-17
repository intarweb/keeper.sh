import { useEffect, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { BodyText as Text } from "@/components/typography";

import { resolveOAuthTicketDestination } from "@/auth/oauth-return";
import { parseOAuthTicketParam } from "@/navigation/deep-links";
import { Screen } from "@/components/screen";
import { LoadingState } from "@/components/states";
import { colors } from "@/design/colors";
import { useApp } from "@/providers/app-provider";

export default function OAuthCallbackRoute() {
  const { ticket } = useLocalSearchParams<{ ticket?: string | string[] }>();
  const { api } = useApp();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    const parsedTicket = parseOAuthTicketParam(ticket);
    if (!parsedTicket) {
      setError("The provider did not return a connection ticket.");
      return;
    }
    api.client
      .redeemMobileOAuthTicket(parsedTicket)
      .then((result) => {
        if (live)
          router.replace(resolveOAuthTicketDestination(result) as never);
      })
      .catch((reason: unknown) => {
        if (live)
          setError(
            reason instanceof Error
              ? reason.message
              : "Could not finish provider authorization.",
          );
      });
    return () => {
      live = false;
    };
  }, [api.client, ticket]);

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
        <LoadingState label="Finishing calendar connection…" />
      )}
    </Screen>
  );
}
