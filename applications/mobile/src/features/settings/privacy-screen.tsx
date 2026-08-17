import { NativePreferences } from "@/components/native-preferences";
import { Screen } from "@/components/screen";
import {
  ANALYTICS_CONSENT_KEY,
  DIAGNOSTICS_CONSENT_KEY,
} from "@/observability/consent";
import { usePreference } from "@/storage/preferences";

export function PrivacyScreen() {
  const [analytics, setAnalytics] = usePreference(ANALYTICS_CONSENT_KEY, false);
  const [diagnostics, setDiagnostics] = usePreference(
    DIAGNOSTICS_CONSENT_KEY,
    false,
  );
  return (
    <Screen>
      <NativePreferences
        title="Privacy"
        footer="Both controls are opt-in. Neither includes event titles, descriptions, locations, account names, or credentials."
        items={[
          {
            key: "analytics",
            label: "Anonymous product analytics",
            value: analytics,
          },
          {
            key: "diagnostics",
            label: "Performance diagnostics",
            value: diagnostics,
          },
        ]}
        onChange={(key, value) =>
          key === "analytics" ? setAnalytics(value) : setDiagnostics(value)
        }
      />
    </Screen>
  );
}
