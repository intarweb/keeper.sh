import Constants from "expo-constants";

import { Row, Section } from "@/components/native-list";
import { Screen } from "@/components/screen";
import { useApp } from "@/providers/app-provider";

export function SettingsScreen() {
  const { capabilities, profile, session } = useApp();
  return (
    <Screen>
      <Section title={session?.user.name ?? "Keeper Account"}>
        <Row
          icon="person.crop.circle"
          label="Profile & Account"
          detail={session?.user.email ?? session?.user.username ?? profile.name}
          href="/(tabs)/settings/profile"
        />
        <Row
          icon="lock.shield"
          label="Security"
          href="/(tabs)/settings/security"
        />
        <Row icon="key" label="API Tokens" href="/(tabs)/settings/api-tokens" />
      </Section>
      <Section title="Calendar">
        <Row icon="link" label="iCal Feed" href="/(tabs)/settings/ical" />
        <Row
          icon="bell"
          label="Notifications"
          href="/(tabs)/settings/notifications"
        />
        <Row
          icon="hand.raised"
          label="Privacy & Analytics"
          href="/(tabs)/settings/privacy"
        />
      </Section>
      {capabilities?.commercialMode ? (
        <Section title="Plan">
          <Row
            icon="star"
            label="Plan & Billing"
            href="/(tabs)/settings/plan"
          />
        </Section>
      ) : null}
      <Section title="Support">
        <Row
          icon="bubble.left.and.bubble.right"
          label="Send Feedback"
          href="/(tabs)/settings/feedback"
        />
        <Row
          icon="ladybug"
          label="Report a Problem"
          href="/(tabs)/settings/report"
        />
        <Row
          icon="info.circle"
          label="About Keeper.sh"
          detail={`Mobile ${Constants.expoConfig?.version ?? "development"}`}
          href="/(tabs)/settings/about"
        />
      </Section>
      <Section title="Server">
        <Row
          icon="server.rack"
          label={profile.name}
          detail={profile.baseUrl}
          href="/(tabs)/settings/server"
        />
      </Section>
    </Screen>
  );
}
