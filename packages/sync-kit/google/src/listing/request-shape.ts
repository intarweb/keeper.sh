import { googleListingLimits } from "../limits";

const sharedListingParameters = {
  singleEvents: false,
  showDeleted: true,
  maxResults: googleListingLimits.maxResults,
} as const;

const snapshotListingParameters = {
  ...sharedListingParameters,
  timeMin: null,
  timeMax: null,
} as const;

const deltaListingParameters = {
  ...sharedListingParameters,
  syncToken: null,
} as const;

export { deltaListingParameters, sharedListingParameters, snapshotListingParameters };
