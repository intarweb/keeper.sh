import type { Event as GraphEvent } from "@microsoft/microsoft-graph-types";
import { unimplemented } from "../unimplemented";

interface BodyRegions {
  readonly authored: string;
  readonly providerOwned: string | null;
}

const splitBodyRegions = (event: GraphEvent): BodyRegions => unimplemented(event);

const withPreservedRegion = (authored: string, providerOwned: string | null): string =>
  unimplemented(authored, providerOwned);

export { splitBodyRegions, withPreservedRegion };
export type { BodyRegions };
