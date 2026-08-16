interface ZoneCache {
  readonly kind: "zoneCache";
}

interface ZoneCacheStatistics {
  readonly offsetProbes: number;
  readonly formatterConstructions: number;
  readonly projectedYears: number;
}

const createZoneCache = (): ZoneCache => ({ kind: "zoneCache" });

const zoneCacheStatistics = (_zones: ZoneCache): ZoneCacheStatistics => {
  throw new Error("unimplemented");
};

export { createZoneCache, zoneCacheStatistics };
export type { ZoneCache, ZoneCacheStatistics };
