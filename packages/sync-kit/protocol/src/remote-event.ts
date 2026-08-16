import type {
  DeleteHandle,
  EventUid,
  Fingerprint,
  InstallationId,
  RemoteEventId,
  RemoteVersion,
  Revision,
} from "./handles";
import type { CalendarKey } from "./calendar-ref";
import type { EventTime } from "./time";

const availabilityKinds = ["busy", "free"] as const;
type Availability = (typeof availabilityKinds)[number];

const visibilityKinds = ["default", "private", "public"] as const;
type Visibility = (typeof visibilityKinds)[number];

const recurrenceDialects = ["rfc5545", "providerNative"] as const;
type RecurrenceDialect = (typeof recurrenceDialects)[number];

interface RecurrencePayload {
  readonly dialect: RecurrenceDialect;
  readonly value: string;
  readonly exceptions: readonly string[];
}

interface EditableContent {
  readonly title: string;
  readonly description: string | null;
  readonly location: string | null;
  readonly time: EventTime;
  readonly availability: Availability;
  readonly visibility: Visibility;
  readonly recurrence: RecurrencePayload | null;
}

type Provenance =
  | { readonly kind: "foreign" }
  | { readonly kind: "ours"; readonly installation: InstallationId };

interface RemoteEvent {
  readonly id: RemoteEventId;
  readonly deleteHandle: DeleteHandle;
  readonly uid: EventUid;
  readonly calendar: CalendarKey;
  readonly revision: Revision;
  readonly version: RemoteVersion;
  readonly content: EditableContent;
  readonly fingerprint: Fingerprint;
  readonly provenance: Provenance;
}

type ForeignEvent = RemoteEvent;
type OwnEvent = RemoteEvent;
type IndeterminateEvent = RemoteEvent;
type MirrorSource = RemoteEvent;

export { availabilityKinds, recurrenceDialects, visibilityKinds };
export type {
  Availability,
  EditableContent,
  ForeignEvent,
  IndeterminateEvent,
  MirrorSource,
  OwnEvent,
  Provenance,
  RecurrenceDialect,
  RecurrencePayload,
  RemoteEvent,
  Visibility,
};
