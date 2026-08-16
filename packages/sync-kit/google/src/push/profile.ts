const hourMs = 60 * 60 * 1000;

const googleWatchProfile = {
  maximumLifetimeMs: 7 * 24 * hourMs,
  renewalLeadMs: 12 * hourMs,
  staggerWindowMs: 6 * hourMs,
  renewal: "recreate",
} as const;

type GoogleWatchProfile = typeof googleWatchProfile;

export { googleWatchProfile };
export type { GoogleWatchProfile };
