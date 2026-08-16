import type { CalendarProvider } from "@keeper.sh/sync-protocol";
import type { GoogleDependencies } from "./dependencies";
import { unimplemented } from "./unimplemented";

const createGoogleProvider = (
  dependencies: GoogleDependencies,
): CalendarProvider<"google"> => unimplemented(dependencies);

export { createGoogleProvider };
