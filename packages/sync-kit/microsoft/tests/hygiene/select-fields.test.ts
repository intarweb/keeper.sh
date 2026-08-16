import { describe, expect, test } from "vitest";
import { instancesParameters, instancesSelect } from "../../src/listing/request-shape";
import { createHarness, marchWindow, operationContext, scopeOver } from "../support/harness";
import { seedOf, seriesMasterItem } from "../support/items";

const fieldsTheDecoderReads: readonly string[] = [
  "id",
  "iCalUId",
  "subject",
  "body",
  "start",
  "end",
  "isAllDay",
  "isCancelled",
  "type",
  "seriesMasterId",
  "originalStartTimeZone",
  "originalEndTimeZone",
  "lastModifiedDateTime",
  "createdDateTime",
  "changeKey",
];

describe("the instances expansion selects everything the decoder reads", () => {
  test("MS-H1: the instances request selects every field the decoder reads", async () => {
    const harness = createHarness();
    harness.fake.seedFromProvider(seedOf([]));
    harness.fake.putItems([seriesMasterItem("master-select", "2026-03-16T09:00:00.0000000")]);
    harness.fake.putInstances("master-select", []);

    await harness.provider.listChanges(
      { scope: { ...scopeOver(marchWindow), expandRecurrences: true }, resume: null },
      operationContext(harness.environment, { deadlineMs: 5000 }),
    );

    const selected: readonly string[] = instancesSelect;
    const missing = fieldsTheDecoderReads.filter((field) => !selected.includes(field));
    const instanceRequest = harness.fake
      .requests()
      .find((request) => request.path.endsWith("/instances"));
    expect(missing).toEqual([]);
    expect(instanceRequest?.search["$select"]).toBe(instancesSelect.join(","));
    expect(instancesParameters(scopeOver(marchWindow))["$select"]).toBe(instancesSelect.join(","));
  }, 5000);
});
