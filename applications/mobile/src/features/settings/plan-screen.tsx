import * as WebBrowser from "expo-web-browser";
import { useState } from "react";

import type { Entitlements } from "@/api/domain";
import { useApiResource } from "@/api/use-api-resource";
import { UpgradeCard } from "@/components/brand";
import { PrimaryButton } from "@/components/form-controls";
import { Row, Section } from "@/components/native-list";
import { Screen } from "@/components/screen";
import { BodyText, EditorialHeading, MutedText } from "@/components/typography";
import { colors } from "@/design/colors";
import { useApp } from "@/providers/app-provider";

export function PlanScreen() {
  const { api, capabilities, profile } = useApp();
  const resource = useApiResource<Entitlements>("/api/entitlements", {
    load: (signal) => api.client.getEntitlements(signal),
  });
  const [message, setMessage] = useState<string | null>(null);
  const commercial = capabilities?.commercialMode === true;
  const isPro = resource.data?.plan === "pro";
  const manage = async () => {
    try {
      const url = await api.client.getMobilePlanManagementUrl();
      if (!url)
        throw new Error("Plan management is unavailable on this server.");
      if (new URL(url).protocol !== "https:")
        throw new Error("The server returned an unsafe plan-management URL.");
      await WebBrowser.openBrowserAsync(url);
    } catch (reason) {
      setMessage(
        reason instanceof Error
          ? reason.message
          : "Plan management is unavailable.",
      );
    }
  };

  return (
    <Screen>
      {!isPro ? (
        <UpgradeCard>
          <EditorialHeading level={2} style={{ color: "#fafafa" }}>
            Keep every calendar in step.
          </EditorialHeading>
          <MutedText style={{ color: "#a3a3a3" }}>
            Pro unlocks fast syncs, advanced privacy controls, and unlimited
            mappings.
          </MutedText>
          {commercial ? (
            <PrimaryButton
              variant="inverse"
              label="Explore Keeper Pro"
              onPress={manage}
            />
          ) : null}
        </UpgradeCard>
      ) : null}
      <Section title={`${isPro ? "Pro" : "Free"} plan`}>
        <Row
          label="Calendar accounts"
          detail={`${resource.data?.accounts.current ?? "—"} of ${resource.data?.accounts.limit ?? "unlimited"}`}
        />
        <Row
          label="Calendar mappings"
          detail={`${resource.data?.mappings.current ?? "—"} of ${resource.data?.mappings.limit ?? "unlimited"}`}
        />
        <Row
          label="Advanced privacy controls"
          trailing={
            <BodyText style={{ color: colors.secondaryLabel }}>
              {resource.data?.canUseEventFilters ? "Included" : "Pro"}
            </BodyText>
          }
        />
        <Row
          label="Custom iCal privacy"
          trailing={
            <BodyText style={{ color: colors.secondaryLabel }}>
              {resource.data?.canCustomizeIcalFeed ? "Included" : "Pro"}
            </BodyText>
          }
        />
      </Section>
      <MutedText>
        {commercial && profile.hosted
          ? "Plan changes open in Keeper’s secure account page."
          : "This server manages entitlements directly. Billing is not shown in the mobile app."}
      </MutedText>
      {commercial && isPro ? (
        <PrimaryButton
          variant="elevated"
          label="Manage plan"
          onPress={manage}
        />
      ) : null}
      {message ? (
        <BodyText style={{ color: colors.danger }}>{message}</BodyText>
      ) : null}
    </Screen>
  );
}
