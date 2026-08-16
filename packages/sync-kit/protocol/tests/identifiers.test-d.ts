import { describe, expectTypeOf, test } from "vitest";
import type {
  Continuation,
  DeleteHandle,
  EventUid,
  Fingerprint,
  IdempotencyKey,
  RemoteEventId,
  RemoteVersion,
  SyncCursor,
} from "../src/index";

declare const remoteEventId: RemoteEventId;
declare const deleteHandle: DeleteHandle;
declare const eventUid: EventUid;
declare const fingerprint: Fingerprint;
declare const syncCursor: SyncCursor;
declare const continuation: Continuation;

declare const acceptRemoteEventId: (identifier: RemoteEventId) => void;
declare const acceptDeleteHandle: (handle: DeleteHandle) => void;
declare const acceptEventUid: (uid: EventUid) => void;
declare const acceptRemoteVersion: (version: RemoteVersion) => void;
declare const acceptIdempotencyKey: (key: IdempotencyKey) => void;
declare const acceptSyncCursor: (cursor: SyncCursor) => void;
declare const acceptContinuation: (token: Continuation) => void;

describe("identifiers are not interchangeable", () => {
  test("a RemoteEventId and a DeleteHandle cannot be swapped", () => {
    // @ts-expect-error the identifier you read an event by is not the handle you delete it by
    acceptDeleteHandle(remoteEventId);
    // @ts-expect-error the handle you delete an event by is not the identifier you read it by
    acceptRemoteEventId(deleteHandle);
  });

  test("an EventUid is not a RemoteEventId", () => {
    // @ts-expect-error the iCalendar UID is not the provider's own resource identifier
    acceptRemoteEventId(eventUid);
    // @ts-expect-error the provider's resource identifier is not the iCalendar UID
    acceptEventUid(remoteEventId);
  });

  test("a Fingerprint is not a RemoteVersion", () => {
    // @ts-expect-error our content hash is not the provider's concurrency token
    acceptRemoteVersion(fingerprint);
  });

  test("a bare string is not an IdempotencyKey", () => {
    // @ts-expect-error an idempotency key is minted and validated, never an arbitrary string
    acceptIdempotencyKey("keeper-mirror-1");
  });

  test("a Continuation is not assignable to a SyncCursor and vice versa", () => {
    // @ts-expect-error resuming a delta with a pagination token silently skips changes
    acceptSyncCursor(continuation);
    // @ts-expect-error persisting a page token as a sync cursor never terminates
    acceptContinuation(syncCursor);
  });

  test("every handle is a tagged object carrying its own discriminant", () => {
    expectTypeOf<RemoteEventId>().toEqualTypeOf<{
      readonly kind: "remoteEventId";
      readonly value: string;
    }>();
    expectTypeOf<DeleteHandle>().toEqualTypeOf<{
      readonly kind: "deleteHandle";
      readonly value: string;
    }>();
    expectTypeOf<IdempotencyKey>().toEqualTypeOf<{
      readonly kind: "idempotencyKey";
      readonly value: string;
    }>();
  });

  test("a version and a fingerprint are separate facts about the same event", () => {
    expectTypeOf<RemoteVersion>().toEqualTypeOf<{
      readonly kind: "remoteVersion";
      readonly value: string;
    }>();
    expectTypeOf<Fingerprint>().toEqualTypeOf<{
      readonly kind: "fingerprint";
      readonly value: string;
    }>();
  });
});
