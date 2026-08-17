import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { sql } from "drizzle-orm";
import { cancelOutstandingDeviceDeliveries } from "../../src/utils/device-deliveries";
import { createPushOutboxRepository } from "../../../worker/src/push/outbox-repository";

const OLD_INSTALLATION_ID = "00000000-0000-4000-8000-000000000001";
const NEW_INSTALLATION_ID = "00000000-0000-4000-8000-000000000002";
const client = new PGlite();
const database = drizzle(client);

beforeEach(async () => {
  await client.exec(`
    drop table if exists "push_notification_deliveries";
    drop table if exists "device_installations";
    create table "device_installations" (
      "id" uuid primary key,
      "enabled" boolean not null,
      "pushToken" text
    );
    create table "push_notification_deliveries" (
      "id" uuid primary key,
      "installationId" uuid not null,
      "attempts" integer not null default 0,
      "deliveredAt" timestamp,
      "lastError" text,
      "nextAttemptAt" timestamp not null default now(),
      "receiptId" text,
      "status" text not null,
      "updatedAt" timestamp not null default now()
    );
  `);
});

afterAll(() => client.close());

const readDeliveryStatuses = async (): Promise<{ id: string; status: string }[]> => {
  const result = await database.execute<{ id: string; status: string }>(sql`
    select "id", "status" from "push_notification_deliveries" order by "id"
  `);
  return [...result.rows];
};

describe("device delivery cancellation", () => {
  it("keeps revoked delivery generations dead after the installation is re-enabled", async () => {
    await client.exec(`
      insert into "device_installations" values
        ('${OLD_INSTALLATION_ID}', true, 'ExponentPushToken[old]');
      insert into "push_notification_deliveries" ("id", "installationId", "lastError", "status") values
        ('10000000-0000-4000-8000-000000000001', '${OLD_INSTALLATION_ID}', null, 'pending'),
        ('10000000-0000-4000-8000-000000000002', '${OLD_INSTALLATION_ID}', null, 'processing'),
        ('10000000-0000-4000-8000-000000000003', '${OLD_INSTALLATION_ID}', null, 'receipt_pending');
    `);

    await cancelOutstandingDeviceDeliveries(
      database as never,
      [OLD_INSTALLATION_ID],
      "Device registration revoked",
    );
    await client.exec(`
      update "device_installations"
      set "enabled" = true, "pushToken" = 'ExponentPushToken[new]'
      where "id" = '${OLD_INSTALLATION_ID}';
    `);

    expect(await readDeliveryStatuses()).toEqual([
      { id: "10000000-0000-4000-8000-000000000001", status: "dead" },
      { id: "10000000-0000-4000-8000-000000000002", status: "dead" },
      { id: "10000000-0000-4000-8000-000000000003", status: "dead" },
    ]);
  });

  it("dead-letters both the old token owner and an existing target registration on transfer", async () => {
    await client.exec(`
      insert into "device_installations" values
        ('${OLD_INSTALLATION_ID}', true, 'ExponentPushToken[transfer]'),
        ('${NEW_INSTALLATION_ID}', false, null);
      insert into "push_notification_deliveries" ("id", "installationId", "lastError", "status") values
        ('10000000-0000-4000-8000-000000000001', '${OLD_INSTALLATION_ID}', null, 'pending'),
        ('10000000-0000-4000-8000-000000000002', '${NEW_INSTALLATION_ID}', null, 'processing');
    `);

    await cancelOutstandingDeviceDeliveries(
      database as never,
      [OLD_INSTALLATION_ID, NEW_INSTALLATION_ID],
      "Device registration replaced",
    );
    await client.exec(`
      update "device_installations" set "enabled" = false, "pushToken" = null
      where "id" = '${OLD_INSTALLATION_ID}';
      update "device_installations" set "enabled" = true, "pushToken" = 'ExponentPushToken[transfer]'
      where "id" = '${NEW_INSTALLATION_ID}';
    `);

    expect(await readDeliveryStatuses()).toEqual([
      { id: "10000000-0000-4000-8000-000000000001", status: "dead" },
      { id: "10000000-0000-4000-8000-000000000002", status: "dead" },
    ]);
  });

  it("does not let a late worker completion resurrect a tombstoned delivery", async () => {
    await client.exec(`
      insert into "device_installations" values
        ('${OLD_INSTALLATION_ID}', true, 'ExponentPushToken[old]');
      insert into "push_notification_deliveries" ("id", "installationId", "lastError", "status") values
        ('10000000-0000-4000-8000-000000000001', '${OLD_INSTALLATION_ID}', null, 'processing');
    `);
    await cancelOutstandingDeviceDeliveries(
      database as never,
      [OLD_INSTALLATION_ID],
      "Device registration revoked",
    );
    const repository = createPushOutboxRepository(database as never);

    await repository.markReceiptPending(
      "10000000-0000-4000-8000-000000000001",
      "late-receipt",
      new Date("2026-08-14T16:00:00.000Z"),
    );
    await repository.retryDelivery(
      "10000000-0000-4000-8000-000000000001",
      1,
      "late retry",
      new Date("2026-08-14T16:01:00.000Z"),
    );
    await repository.markDelivered(
      "10000000-0000-4000-8000-000000000001",
      new Date("2026-08-14T16:02:00.000Z"),
    );

    expect(await readDeliveryStatuses()).toEqual([{
      id: "10000000-0000-4000-8000-000000000001",
      status: "dead",
    }]);
  });
});
