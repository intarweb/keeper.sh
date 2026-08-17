import { describe, expect, it } from "vitest";
import {
  accountSchema,
  calendarSourceReadSchema,
  calendarPatchSchema,
  freeTimeResultSchema,
  notificationPreferencesPatchSchema,
  entitlementsSchema,
  entitlementsReadSchema,
  eventCreateSchema,
  eventReadSchema,
  eventSchema,
  deviceRegistrationSchema,
  inviteRsvpRequestSchema,
  pendingInviteSchema,
  safeSessionResponseSchema,
  reauthenticationAccountSchema,
  oauthTicketResultSchema,
  socketUrlSchema,
} from "../src";

describe("client API contracts", () => {
  it("accepts a complete account and rejects server-only fields", () => {
    const account = {
      id: "account-1",
      provider: "google",
      providerName: "Google",
      providerIcon: null,
      displayName: null,
      email: "person@example.com",
      accountLabel: "person@example.com",
      accountIdentifier: "person@example.com",
      authType: "oauth",
      needsReauthentication: false,
      calendarCount: 2,
      createdAt: "2026-08-14T00:00:00.000Z",
    };

    expect(accountSchema.assert(account)).toEqual(account);
    expect(accountSchema.allows({ ...account, oauthCredentialId: "secret" })).toBe(false);
  });

  it("rejects unsupported calendar settings and incomplete entitlements", () => {
    expect(calendarPatchSchema.allows({ excludeEventName: true })).toBe(true);
    expect(calendarPatchSchema.allows({ disabled: true })).toBe(false);
    expect(calendarPatchSchema.allows({})).toBe(false);
    expect(entitlementsSchema.allows({ plan: "pro" })).toBe(false);
  });

  it("normalizes hosted calendar and entitlement read compatibility fields", () => {
    const calendar = {
      id: "calendar-1",
      name: "Work",
      calendarType: "source",
      capabilities: ["pull"],
      accountId: "account-1",
      provider: "google",
      providerName: "Google Calendar",
      providerIcon: null,
      displayName: null,
      email: null,
      accountLabel: "Account",
      accountIdentifier: "account-1",
      needsReauthentication: false,
      includeInIcalFeed: true,
    };
    expect(calendarSourceReadSchema.assert(calendar)).toEqual({
      ...calendar,
      disabled: false,
    });

    const entitlements = {
      plan: "pro" as const,
      accounts: { current: 2, limit: null },
      mappings: { current: 3, limit: null },
      canCustomizeIcalFeed: true,
      canUseEventFilters: true,
    };
    expect(entitlementsReadSchema.assert({
      ...entitlements,
      feeds: { current: 1, limit: null },
    })).toEqual(entitlements);
  });

  it("validates event writes and socket URL alternatives", () => {
    expect(eventCreateSchema.allows({
      calendarId: "calendar-1",
      title: "Planning",
      startTime: "2026-08-14T10:00:00.000Z",
      endTime: "2026-08-14T11:00:00.000Z",
    })).toBe(true);
    expect(eventCreateSchema.allows({ title: "Missing required fields" })).toBe(false);
    expect(socketUrlSchema.allows({ socketPath: "/api/socket?token=x" })).toBe(true);
    expect(socketUrlSchema.allows({})).toBe(false);
  });

  it("accepts bounded native OAuth results without credentials", () => {
    const result = {
      flow: "destination",
      provider: "google",
      resourceId: "account-1",
      status: "success",
      expiresAt: Date.now() + 60_000,
    };
    expect(oauthTicketResultSchema.allows(result)).toBe(true);
    expect(oauthTicketResultSchema.allows({ ...result, accessToken: "secret" })).toBe(false);
  });

  it("matches nullable sessions, free-slot keys, and non-empty preference patches", () => {
    expect(safeSessionResponseSchema.allows(null)).toBe(true);
    expect(freeTimeResultSchema.allows({
      from: "2026-08-14T00:00:00.000Z",
      to: "2026-08-15T00:00:00.000Z",
      timezone: "America/Edmonton",
      durationMinutes: 30,
      slots: [{
        start: "2026-08-14T16:00:00.000Z",
        end: "2026-08-14T16:30:00.000Z",
        durationMinutes: 30,
      }],
    })).toBe(true);
    expect(notificationPreferencesPatchSchema.allows({})).toBe(false);
    expect(notificationPreferencesPatchSchema.allows({ invites: false })).toBe(true);
  });

  it("matches editable event fields, invite RSVP, and both recovery variants", () => {
    expect(eventSchema.allows({
      id: "event-1",
      eventStateId: null,
      startTime: "2026-08-14T16:00:00.000Z",
      endTime: "2026-08-14T16:30:00.000Z",
      title: "Planning",
      description: null,
      location: null,
      calendarId: "calendar-1",
      calendarName: "Work",
      calendarProvider: "google",
      calendarUrl: null,
      availability: "busy",
      isAllDay: false,
    })).toBe(true);
    expect(inviteRsvpRequestSchema.allows({
      rsvpStatus: "tentative",
      occurrenceStart: "2026-08-14T16:00:00.000Z",
      sourceEventId: "provider-instance-2",
    })).toBe(true);
    expect(pendingInviteSchema.allows({
      calendarId: "calendar-1",
      description: null,
      endTime: "2026-08-14T17:00:00.000Z",
      isAllDay: false,
      location: null,
      organizer: null,
      provider: "google",
      sourceEventId: "provider-instance-2",
      sourceEventUid: "shared-series@example.com",
      startTime: "2026-08-14T16:00:00.000Z",
      title: null,
    })).toBe(true);

    const account = {
      authType: "oauth",
      accountIdentifier: "person@example.com",
      displayName: null,
      email: "person@example.com",
      id: "account-1",
      provider: "google",
      reauthenticationSource: "refresh-token",
      providerName: "Google",
      providerIcon: null,
      accountLabel: "person@example.com",
      needsReauthentication: true,
    };
    expect(reauthenticationAccountSchema.allows({
      ...account,
      recovery: { method: "GET", authorizePath: "/api/destinations/authorize?provider=google" },
    })).toBe(true);
    expect(reauthenticationAccountSchema.allows({
      ...account,
      authType: "caldav",
      recovery: {
        method: "POST",
        connectPath: "/api/destinations/caldav",
        accountId: "account-1",
      },
    })).toBe(true);
  });

  it("normalizes legacy event reads that predate availability fields", () => {
    const legacyEvent = {
      id: "event-legacy",
      eventStateId: "state-legacy",
      startTime: "2026-08-14T16:00:00.000Z",
      endTime: "2026-08-14T16:30:00.000Z",
      title: "Planning",
      description: null,
      location: null,
      calendarId: "calendar-1",
      calendarName: "Work",
      calendarProvider: "google",
      calendarUrl: null,
    };

    expect(eventReadSchema.assert(legacyEvent)).toEqual({
      ...legacyEvent,
      availability: "busy",
      isAllDay: false,
    });
    expect(eventSchema.allows(legacyEvent)).toBe(false);
  });

  it("mirrors native device registration bounds", () => {
    expect(deviceRegistrationSchema.allows({
      installationId: "installation-1",
      platform: "ios",
      appVersion: "1.0.0",
    })).toBe(true);
    expect(deviceRegistrationSchema.allows({
      installationId: "x".repeat(257),
      platform: "ios",
    })).toBe(false);
    expect(deviceRegistrationSchema.allows({
      installationId: "installation-1",
      platform: "android",
      appVersion: "x".repeat(129),
    })).toBe(false);
  });
});
