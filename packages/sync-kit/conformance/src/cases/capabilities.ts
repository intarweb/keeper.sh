import type {
  Capabilities,
  EditableContent,
  ProviderId,
  RepresentabilityConstraint,
  Result,
  WriteOutcome,
} from "@keeper.sh/sync-protocol";
import type { ConformanceCase } from "../registry/case";
import { createIntent } from "./intents";
import {
  caseScope,
  contentOf,
  defineCase,
  insist,
  listChanges,
  listingOf,
  markedWith,
  objectsMarked,
  seedWith,
  write,
} from "./support";

const refusedWith = (
  answered: Result<WriteOutcome>,
  constraint: RepresentabilityConstraint,
): boolean => {
  if (!answered.ok) {
    return answered.failure.kind === "unrepresentable" && answered.failure.constraint === constraint;
  }
  return (
    answered.value.kind === "unrepresentable" && answered.value.constraint === constraint
  );
};

const nativeRecurrence = (uid: string): EditableContent => ({
  title: uid,
  description: null,
  location: null,
  availability: "busy",
  visibility: "default",
  recurrence: { dialect: "providerNative", value: "EVERY_WEEKDAY", exceptions: [] },
  anchor: {
    kind: "timed",
    start: { kind: "instant", value: "2026-03-02T09:00:00.000Z" },
    zone: { kind: "zoneId", value: "UTC" },
    duration: { kind: "exact", seconds: 3600 },
  },
});

const zonedAs = (uid: string, zone: string): EditableContent => ({
  title: uid,
  description: null,
  location: null,
  availability: "busy",
  visibility: "default",
  recurrence: null,
  time: {
    kind: "timed",
    start: { kind: "instant", value: "2026-03-02T09:00:00.000Z" },
    end: { kind: "instant", value: "2026-03-02T10:00:00.000Z" },
    zone: { kind: "zoneId", value: zone },
  },
});

const acceptedByIntl = (zone: string): boolean => {
  try {
    return (
      new Intl.DateTimeFormat("en-US", { timeZone: zone }).resolvedOptions().timeZone.length > 0
    );
  } catch {
    return false;
  }
};

const capabilityCases = <Provider extends ProviderId>(
  supports: Capabilities<Provider>,
): readonly ConformanceCase<Provider>[] => [
  defineCase(
    supports,
    "CONF-O29",
    "a declared refusal actually refuses",
    async (context) => {
      const scope = caseScope(context);
      const key = markedWith("CONF-O29", "inverted");
      await seedWith(context, []);
      const answered = await write(
        context,
        createIntent(
          supports,
          scope.calendar,
          context.environment.installation,
          key,
          contentOf({
            uid: key,
            start: "2026-03-02T10:00:00.000Z",
            end: "2026-03-02T09:00:00.000Z",
          }),
        ),
      );
      const stored = await objectsMarked(context.provider, "CONF-O29");

      if (supports.representableRange.invertedRange === "reject") {
        insist(
          "CONF-O29",
          refusedWith(answered, "invertedRange"),
          "an adapter that declares it rejects inverted ranges accepted one",
        );
        insist(
          "CONF-O29",
          stored.length === 0,
          "a refused write still left an object on the calendar",
        );
        return;
      }
      insist(
        "CONF-O29",
        answered.ok,
        "an adapter that declares it clamps inverted ranges refused one instead",
      );
    },
  ),

  defineCase(
    supports,
    "CONF-O35",
    "an unsupported construct is withheld and counted, never approximated",
    async (context) => {
      const scope = caseScope(context);
      const key = markedWith("CONF-O35", "native");
      await seedWith(context, []);

      const answered = await write(
        context,
        createIntent(
          supports,
          scope.calendar,
          context.environment.installation,
          key,
          nativeRecurrence(key),
        ),
      );
      const stored = await objectsMarked(context.provider, "CONF-O35");

      if (supports.recurrenceWrite === "providerNative") {
        insist("CONF-O35", answered.ok, "an adapter that speaks its own dialect refused it");
        return;
      }
      insist(
        "CONF-O35",
        refusedWith(answered, "recurrenceDialect"),
        "a recurrence dialect the adapter cannot speak was approximated instead of refused",
      );
      insist(
        "CONF-O35",
        stored.length === 0,
        "an approximation of an unsupported recurrence was written anyway",
      );
    },
  ),

  defineCase(
    supports,
    "CONF-O43",
    "a non-IANA zone identifier never reaches a canonical event",
    async (context) => {
      const scope = caseScope(context);
      const refused = markedWith("CONF-O43", "windows");
      const accepted = markedWith("CONF-O43", "iana");
      await seedWith(context, []);

      const windows = await write(
        context,
        createIntent(
          supports,
          scope.calendar,
          context.environment.installation,
          refused,
          zonedAs(refused, "Pacific Standard Time"),
        ),
      );
      insist(
        "CONF-O43",
        refusedWith(windows, "zoneIdentifier"),
        "a Windows zone identifier was accepted as if it were an IANA zone",
      );

      await write(
        context,
        createIntent(
          supports,
          scope.calendar,
          context.environment.installation,
          accepted,
          zonedAs(accepted, "UTC"),
        ),
      );
      const listing = listingOf("CONF-O43", await listChanges(context, scope));
      const zones = (listing.events ?? []).flatMap((event) => {
        const { time } = event.content;
        if (!time || time.kind === "allDay" || time.zone === null) {
          return [];
        }
        return [time.zone.value];
      });
      insist(
        "CONF-O43",
        zones.every((zone) => acceptedByIntl(zone)),
        "a zone identifier no runtime can resolve reached a canonical event",
      );
    },
  ),
];

export { acceptedByIntl, capabilityCases, nativeRecurrence, refusedWith, zonedAs };
