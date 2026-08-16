import type { CalendarKey } from "@keeper.sh/sync-protocol";
import type { ConformanceEnvironment, ProviderUnderTest } from "../options";

const referenceCalendar: CalendarKey = {
  provider: "reference",
  account: { kind: "accountId", value: "reference-account" },
  calendar: { kind: "calendarId", value: "reference-calendar" },
};

const createReferenceProvider = (
  environment: ConformanceEnvironment,
): Promise<ProviderUnderTest<"reference">> => {
  throw new Error(`unimplemented: createReferenceProvider(${environment.installation.value})`);
};

export { createReferenceProvider, referenceCalendar };
