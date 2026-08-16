import type {
  Capabilities,
  ChangeListing,
  KnownEvents,
  ProviderId,
  RemoteEvent,
} from "@keeper.sh/sync-protocol";
import { assertNoRemovalDerivable, derivableRemovals } from "../assertions/no-removal";
import type { ConformanceCase } from "../registry/case";
import {
  caseScope,
  decadeWindow,
  defineCase,
  foreignEvent,
  insist,
  listChanges,
  listingOf,
  markedWith,
  objectsMarked,
  seedWith,
  uidsOf,
} from "./support";

const knownOf = (calendar: KnownEvents["calendar"], uids: readonly string[]): KnownEvents => ({
  calendar,
  ids: new Map(uids.map((uid) => [uid, { kind: "remoteEventId", value: `id-${uid}` }])),
});

const presentIdentities = (listing: ChangeListing): readonly string[] => [
  ...uidsOf(listing),
  ...(listing.withheld ?? []).flatMap((entry) => {
    if (entry.uid === null) {
      return [];
    }
    return [entry.uid.value];
  }),
];

const namedRemovalUids = (listing: ChangeListing): readonly string[] =>
  (listing.removals ?? []).flatMap((removal) => {
    if (removal.kind === "outOfScope") {
      return [];
    }
    return [removal.uid.value];
  });

const withoutUid = (events: readonly RemoteEvent[], uid: string): readonly RemoteEvent[] =>
  events.filter((event) => event.uid.value !== uid);

const deletionSafetyCases = <Provider extends ProviderId>(
  supports: Capabilities<Provider>,
): readonly ConformanceCase<Provider>[] => [
  defineCase(supports, "CONF-O1", "a truncated read can never produce a removal", async (context) => {
    const scope = caseScope(context);
    const uids = ["alpha", "bravo", "charlie"].map((name) => markedWith("CONF-O1", name));
    await seedWith(
      context,
      uids.map((uid, index) =>
        foreignEvent(scope.calendar, {
          uid,
          start: `2026-03-0${index + 2}T09:00:00.000Z`,
          end: `2026-03-0${index + 2}T10:00:00.000Z`,
        }),
      ),
    );

    const answered = await listChanges(context, scope);
    if (!answered.ok) {
      return;
    }
    const listing = answered.value;
    if (listing.kind === "partial" || listing.kind === "cursorLost") {
      assertNoRemovalDerivable(listing);
      insist("CONF-O1", !listing.cursor, "an incomplete read still handed back a sync cursor");
      return;
    }
    const present = new Set(presentIdentities(listing));
    insist(
      "CONF-O1",
      uids.every((uid) => present.has(uid)),
      "a listing that claims coverage silently dropped events it never proved absent",
    );
  }),

  defineCase(
    supports,
    "CONF-O2",
    "a failed read and an empty calendar are distinguishable",
    async (context) => {
      const scope = caseScope(context);
      await seedWith(context, []);
      context.environment.transport.answerWith({
        kind: "reject",
        failure: { kind: "transport", status: 503, disposition: "transient" },
        times: 4,
      });
      const failed = await listChanges(context, scope);
      context.environment.transport.answerWith({ kind: "pass" });
      const empty = await listChanges(context, scope);

      insist("CONF-O2", !failed.ok, "a transport failure was answered as an authoritative listing");
      insist("CONF-O2", empty.ok, "an empty calendar was answered as a failure");
      insist(
        "CONF-O2",
        listingOf("CONF-O2", empty).kind === "snapshot",
        "an empty calendar must still prove the coverage it read",
      );
    },
  ),

  defineCase(
    supports,
    "CONF-O3",
    "deletion authority follows the declared discriminant",
    async (context) => {
      const scope = caseScope(context);
      const present = markedWith("CONF-O3", "present");
      const ghost = markedWith("CONF-O3", "ghost");
      await seedWith(context, [
        foreignEvent(scope.calendar, {
          uid: present,
          start: "2026-03-02T09:00:00.000Z",
          end: "2026-03-02T10:00:00.000Z",
        }),
      ]);

      const listing = listingOf("CONF-O3", await listChanges(context, scope));
      const derivable = derivableRemovals({
        listing,
        known: knownOf(scope.calendar, [present, ghost]),
        withinWindow: context.withinWindow,
      });

      if (supports.deletionAuthority === "snapshotAbsence") {
        insist(
          "CONF-O3",
          derivable.includes(ghost),
          "an identity absent from a proven snapshot was not treated as removed",
        );
        insist(
          "CONF-O3",
          !derivable.includes(present),
          "an identity the snapshot reported was treated as removed",
        );
        return;
      }
      insist(
        "CONF-O3",
        derivable.length === 0,
        "an adapter that only names its removals derived one from absence",
      );
    },
  ),

  defineCase(
    supports,
    "CONF-O4",
    "a requested window wider than proven coverage is never substituted for it",
    async (context) => {
      const scope = caseScope(context, decadeWindow);
      const seeded = markedWith("CONF-O4", "inside");
      await seedWith(context, [
        foreignEvent(scope.calendar, {
          uid: seeded,
          start: "2026-03-02T09:00:00.000Z",
          end: "2026-03-02T10:00:00.000Z",
        }),
      ]);

      const listing = listingOf("CONF-O4", await listChanges(context, scope));
      insist(
        "CONF-O4",
        listing.coverage?.calendar.calendar.value === scope.calendar.calendar.value,
        "coverage was proven for a calendar other than the one requested",
      );
      insist(
        "CONF-O4",
        listing.coverage?.covered.end.value !== scope.window.end.value,
        "the adapter claimed to cover a decade it never read",
      );
      insist(
        "CONF-O4",
        derivableRemovals({
          listing,
          known: knownOf(scope.calendar, [markedWith("CONF-O4", "ancient")]),
          withinWindow: context.withinWindow,
        }).length === 0,
        "a removal was derived inside a band the listing never covered",
      );
    },
  ),

  defineCase(supports, "CONF-O5", "a withheld event is present, not absent", async (context) => {
    const scope = caseScope(context);
    const withheld = markedWith("CONF-O5", "inverted");
    await seedWith(context, [
      foreignEvent(scope.calendar, {
        uid: withheld,
        start: "2026-03-05T10:00:00.000Z",
        end: "2026-03-05T09:00:00.000Z",
      }),
    ]);

    const listing = listingOf("CONF-O5", await listChanges(context, scope));
    insist(
      "CONF-O5",
      (listing.withheld ?? []).some((entry) => entry.uid?.value === withheld),
      "an unrepresentable event vanished from the listing instead of being withheld",
    );
    insist(
      "CONF-O5",
      derivableRemovals({
        listing,
        known: knownOf(scope.calendar, [withheld]),
        withinWindow: context.withinWindow,
      }).length === 0,
      "a withheld identity was derivable as a removal",
    );
  }),

  defineCase(
    supports,
    "CONF-O12",
    "corrupt known state demands a resync and emits zero removals",
    async (context) => {
      const scope = caseScope(context);
      const uid = markedWith("CONF-O12", "row");
      await seedWith(
        context,
        [
          foreignEvent(scope.calendar, {
            uid,
            start: "2026-03-02T09:00:00.000Z",
            end: "2026-03-02T10:00:00.000Z",
          }),
        ],
        [uid],
      );

      const listing = listingOf("CONF-O12", await listChanges(context, scope));
      await seedWith(context, []);
      insist(
        "CONF-O12",
        listing.kind === "cursorLost",
        "corrupt known state was answered with an authoritative listing",
      );
      insist(
        "CONF-O12",
        (listing.removals ?? []).length === 0,
        "corrupt known state produced removals",
      );
    },
  ),

  defineCase(supports, "CONF-O13", "an ambiguous removal is never a deletion", async (context) => {
    const scope = caseScope(context);
    const kept = markedWith("CONF-O13", "kept");
    const gone = markedWith("CONF-O13", "gone");
    const seeded = [
      foreignEvent(scope.calendar, {
        uid: kept,
        start: "2026-03-02T09:00:00.000Z",
        end: "2026-03-02T10:00:00.000Z",
      }),
      foreignEvent(scope.calendar, {
        uid: gone,
        start: "2026-03-03T09:00:00.000Z",
        end: "2026-03-03T10:00:00.000Z",
      }),
    ];
    await seedWith(context, seeded);
    await listChanges(context, scope);
    await seedWith(context, withoutUid(seeded, gone));

    const listing = listingOf("CONF-O13", await listChanges(context, scope));
    const named = namedRemovalUids(listing);
    if (supports.removalsAreAmbiguous) {
      insist(
        "CONF-O13",
        named.length === 0,
        "an adapter whose removals are ambiguous still emitted an authoritative deletion",
      );
      return;
    }
    insist(
      "CONF-O13",
      named.every((uid) => uid.length > 0),
      "an authoritative removal arrived without the identity it removes",
    );
  }),

  defineCase(
    supports,
    "CONF-O33",
    "a withheld identity does not cost the user its existing mirror",
    async (context) => {
      const scope = caseScope(context);
      const source = markedWith("CONF-O33", "source");
      const mirror = markedWith("CONF-O33", "mirror");
      await seedWith(context, [
        foreignEvent(scope.calendar, {
          uid: source,
          start: "2026-03-05T10:00:00.000Z",
          end: "2026-03-05T09:00:00.000Z",
        }),
        foreignEvent(scope.calendar, {
          uid: mirror,
          start: "2026-03-05T09:00:00.000Z",
          end: "2026-03-05T10:00:00.000Z",
        }),
      ]);

      const listing = listingOf("CONF-O33", await listChanges(context, scope));
      const survivors = await objectsMarked(context.provider, "CONF-O33");

      insist(
        "CONF-O33",
        (listing.withheld ?? []).some((entry) => entry.uid?.value === source),
        "the unrepresentable source was not withheld",
      );
      insist(
        "CONF-O33",
        survivors.some((event) => event.uid.value === mirror),
        "withholding a source destroyed the mirror the user still has",
      );
    },
  ),

  defineCase(
    supports,
    "CONF-O34",
    "cancelled, unnamed and out of scope are three different verdicts",
    async (context) => {
      const scope = caseScope(context);
      const kept = markedWith("CONF-O34", "kept");
      const cancelled = markedWith("CONF-O34", "cancelled");
      const seeded = [
        foreignEvent(scope.calendar, {
          uid: kept,
          start: "2026-03-02T09:00:00.000Z",
          end: "2026-03-02T10:00:00.000Z",
        }),
        foreignEvent(scope.calendar, {
          uid: cancelled,
          start: "2026-03-03T09:00:00.000Z",
          end: "2026-03-03T10:00:00.000Z",
        }),
      ];
      await seedWith(context, seeded);
      await listChanges(context, scope);
      await seedWith(context, withoutUid(seeded, cancelled));

      const listing = listingOf("CONF-O34", await listChanges(context, scope));
      insist(
        "CONF-O34",
        (listing.removals ?? []).every((removal) => removal.kind !== "outOfScope"),
        "an out-of-scope marker was mixed into the authoritative removals",
      );
      insist(
        "CONF-O34",
        namedRemovalUids(listing).includes(cancelled),
        "an identity the source really dropped was not named as removed",
      );
    },
  ),

  defineCase(
    supports,
    "CONF-O41",
    "a truncated page's resumable token is a continuation, never a cursor",
    async (context) => {
      const scope = caseScope(context);
      await seedWith(context, [
        foreignEvent(scope.calendar, {
          uid: markedWith("CONF-O41", "only"),
          start: "2026-03-02T09:00:00.000Z",
          end: "2026-03-02T10:00:00.000Z",
        }),
      ]);

      const first = listingOf("CONF-O41", await listChanges(context, scope));
      if (first.kind !== "partial") {
        insist("CONF-O41", Boolean(first.coverage), "a complete read proved no coverage");
        return;
      }
      insist(
        "CONF-O41",
        first.continuation.kind === "continuation" && !first.cursor,
        "a truncated page handed back a sync cursor instead of a continuation",
      );
      const resumed = listingOf("CONF-O41", await listChanges(context, scope, first.continuation));
      insist(
        "CONF-O41",
        resumed.kind !== "partial",
        "resuming from the continuation never reached a listing that proves coverage",
      );
    },
  ),
];

export { deletionSafetyCases, knownOf, namedRemovalUids, presentIdentities, withoutUid };
