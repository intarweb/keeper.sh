import type { CalendarProvider, ChangeListing, Result } from "@keeper.sh/sync-protocol";
import type { RequestSeam } from "./client/request";
import type { MailboxSemaphore } from "./client/semaphore";
import type { SingleFlight } from "./client/single-flight";
import type { MicrosoftDependencies } from "./dependencies";
import { unimplemented } from "./unimplemented";

interface MicrosoftInternals {
  readonly provider: CalendarProvider<"microsoft">;
  readonly requests: RequestSeam;
  readonly permits: MailboxSemaphore;
  readonly flights: SingleFlight<Result<ChangeListing>>;
  readonly inFlightKeys: () => readonly string[];
  readonly deletionCalendars: () => readonly string[];
}

const createMicrosoftInternals = (dependencies: MicrosoftDependencies): MicrosoftInternals =>
  unimplemented(dependencies);

export { createMicrosoftInternals };
export type { MicrosoftInternals };
