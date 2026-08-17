import { Observe, type ObserveConfig } from "expo-observe";

import { preferences } from "@/storage/preferences";

export const ANALYTICS_CONSENT_KEY = "analytics-consent";
export const DIAGNOSTICS_CONSENT_KEY = "diagnostic-consent";

export function observeConfig(diagnosticsEnabled: boolean): ObserveConfig {
  return {
    dispatchInDebug: false,
    dispatchingEnabled: diagnosticsEnabled,
    integrations: {
      "expo-router": {
        filteredParams: [
          "accountId",
          "calendarId",
          "eventId",
          "id",
          "redirect",
          "ticket",
          "token",
        ],
      },
    },
  };
}

export function configureObservability(
  diagnosticsEnabled = preferences.get(DIAGNOSTICS_CONSENT_KEY, false),
): void {
  Observe.configure(observeConfig(diagnosticsEnabled));
}

export function logProductEvent(
  name: string,
  attributes?: Record<string, string | number | boolean>,
): boolean {
  if (!preferences.get(ANALYTICS_CONSENT_KEY, false)) return false;
  Observe.logEvent(name, attributes ? { attributes } : undefined);
  return true;
}
