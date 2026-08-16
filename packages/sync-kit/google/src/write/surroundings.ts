import type { GoogleDependencies } from "../dependencies";
import type { RequestSeam } from "../client/request";

interface WriteSurroundings {
  readonly dependencies: GoogleDependencies;
  readonly requests: RequestSeam;
}

export type { WriteSurroundings };
