import { router } from "expo-router";

import { Row, Section } from "@/components/native-list";
import { Screen } from "@/components/screen";

const providers = [
  { id: "google", label: "Google Calendar", provider: "google" },
  { id: "outlook", label: "Outlook.com", provider: "outlook" },
  { id: "microsoft", label: "Microsoft 365", provider: "microsoft" },
  { id: "icloud", label: "iCloud", provider: "icloud" },
  { id: "fastmail", label: "Fastmail", provider: "fastmail" },
  { id: "caldav", label: "CalDAV / Nextcloud / Radicale", icon: "server.rack" },
  { id: "ical", label: "Remote iCal Feed", icon: "link" },
] as const;

export function ConnectScreen() {
  return (
    <Screen>
      <Section
        title="Calendar Provider"
        footer="Provider credentials and OAuth tokens are sent only to your configured Keeper server."
      >
        {providers.map(({ id, label, ...visual }) => (
          <Row
            key={id}
            label={label}
            {...visual}
            onPress={() =>
              router.push(`/(tabs)/calendars/connect-provider?provider=${id}`)
            }
          />
        ))}
      </Section>
    </Screen>
  );
}
