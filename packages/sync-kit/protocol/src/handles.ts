type ProviderId = string;
type AccountId = string;
type CalendarId = string;
type InstallationId = string;
type Instant = string;
type CalendarDate = string;
type ZoneId = string;
type Revision = number;

interface RemoteEventId {
  readonly kind: "remoteEventId";
  readonly value: string;
}

interface DeleteHandle {
  readonly kind: "deleteHandle";
  readonly value: string;
}

interface EventUid {
  readonly kind: "eventUid";
  readonly value: string;
}

interface RemoteVersion {
  readonly kind: "remoteVersion";
  readonly value: string;
}

interface Fingerprint {
  readonly kind: "fingerprint";
  readonly value: string;
}

interface IdempotencyKey {
  readonly kind: "idempotencyKey";
  readonly value: string;
}

export type {
  AccountId,
  CalendarDate,
  CalendarId,
  DeleteHandle,
  EventUid,
  Fingerprint,
  IdempotencyKey,
  InstallationId,
  Instant,
  ProviderId,
  RemoteEventId,
  RemoteVersion,
  Revision,
  ZoneId,
};
