const CALDAV_MULTIGET_BATCH_SIZE = 250;

const withTrailingSlash = (path: string): string => {
  if (path.endsWith("/")) {
    return path;
  }
  return `${path}/`;
};

/*
 * RFC 4791 lets the client name the resource, so a `.ics` suffix is a convention and not
 * a rule. Treating its absence as "not a calendar object" hid a copy the server plainly
 * returned, and the delete probe read that silence as an absence. Everything the
 * collection lists below itself is a calendar object; only the collection's own href is
 * not.
 */
const isCalendarObjectPath = (path: string, collectionPath: string): boolean =>
  path.length > 0 && withTrailingSlash(path) !== withTrailingSlash(collectionPath);

const toCalDAVTimestamp = (value: string): string =>
  `${new Date(value).toISOString().slice(0, 19).replaceAll(/[-:.]/gu, "")}Z`;

const buildCalendarObjectFilters = (timeRange?: { start: string; end: string }): unknown[] => [
  {
    "comp-filter": {
      _attributes: { name: "VCALENDAR" },
      "comp-filter": {
        _attributes: { name: "VEVENT" },
        ...(timeRange && {
          "time-range": {
            _attributes: {
              start: toCalDAVTimestamp(timeRange.start),
              end: toCalDAVTimestamp(timeRange.end),
            },
          },
        }),
      },
    },
  },
];

export { buildCalendarObjectFilters, CALDAV_MULTIGET_BATCH_SIZE, isCalendarObjectPath };
