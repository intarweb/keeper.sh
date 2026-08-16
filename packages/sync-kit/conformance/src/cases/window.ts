import type { Capabilities, EventTime, ProviderId, RemoteEvent } from "@keeper.sh/sync-protocol";
import { derivableRemovals } from "../assertions/no-removal";
import type { ConformanceCase } from "../registry/case";
import { knownOf } from "./deletion-safety";
import {
  caseScope,
  defineCase,
  foreignEvent,
  insist,
  invertedWindow,
  listChanges,
  listingOf,
  markedWith,
  seedWith,
  uidsOf,
} from "./support";

const timeOf = (event: RemoteEvent): EventTime | null => event.content.time ?? null;

const windowCases = <Provider extends ProviderId>(
  supports: Capabilities<Provider>,
): readonly ConformanceCase<Provider>[] => [
  defineCase(
    supports,
    "CONF-O26",
    "an event outside the requested window is returned and never removed",
    async (context) => {
      const scope = caseScope(context);
      const outside = markedWith("CONF-O26", "outside");
      await seedWith(context, [
        foreignEvent(scope.calendar, {
          uid: outside,
          start: "2026-05-02T09:00:00.000Z",
          end: "2026-05-02T10:00:00.000Z",
        }),
      ]);

      const listing = listingOf("CONF-O26", await listChanges(context, scope));
      insist(
        "CONF-O26",
        uidsOf(listing).includes(outside),
        "an event the source still holds outside the window was dropped from the listing",
      );
      insist(
        "CONF-O26",
        derivableRemovals({
          listing,
          known: knownOf(scope.calendar, [outside]),
          withinWindow: context.withinWindow,
        }).length === 0,
        "an event outside the requested window was derivable as a removal",
      );
    },
  ),

  defineCase(
    supports,
    "CONF-O27",
    "one window predicate, agreeing at every boundary",
    async (context) => {
      const scope = caseScope(context);
      const lower = markedWith("CONF-O27", "lower");
      const upper = markedWith("CONF-O27", "upper");
      const edges = [
        foreignEvent(scope.calendar, {
          uid: lower,
          start: "2026-03-01T00:00:00.000Z",
          end: "2026-03-01T01:00:00.000Z",
        }),
        foreignEvent(scope.calendar, {
          uid: upper,
          start: "2026-03-31T23:00:00.000Z",
          end: "2026-04-01T00:00:00.000Z",
        }),
      ];
      await seedWith(context, edges);

      const listing = listingOf("CONF-O27", await listChanges(context, scope));
      const listed = new Set(uidsOf(listing));
      for (const event of edges) {
        const time = timeOf(event);
        if (time === null) {
          continue;
        }
        insist(
          "CONF-O27",
          !context.withinWindow(scope.window, time) || listed.has(event.uid.value),
          "an event the window predicate admits was left out of the listing that predicate scoped",
        );
      }

      const degenerate = listingOf(
        "CONF-O27",
        await listChanges(context, caseScope(context, invertedWindow)),
      );
      insist(
        "CONF-O27",
        (degenerate.events ?? []).length === 0,
        "an inverted window admitted events it could never have proven",
      );
    },
  ),

  defineCase(
    supports,
    "CONF-O28",
    "a degenerate range is preserved rather than silently widened",
    async (context) => {
      const scope = caseScope(context);
      const uid = markedWith("CONF-O28", "degenerate");
      await seedWith(context, [
        foreignEvent(scope.calendar, {
          uid,
          start: "2026-03-10T09:00:00.000Z",
          end: "2026-03-10T09:00:00.000Z",
        }),
      ]);

      const listing = listingOf("CONF-O28", await listChanges(context, scope));
      if (supports.representableRange.zeroDuration === "accept") {
        insist(
          "CONF-O28",
          uidsOf(listing).includes(uid),
          "a zero-duration event the adapter accepts was dropped from the listing",
        );
        return;
      }
      insist(
        "CONF-O28",
        (listing.withheld ?? []).some((entry) => entry.uid?.value === uid),
        "a zero-duration event the adapter cannot represent was silently widened",
      );
    },
  ),
];

export { windowCases };
