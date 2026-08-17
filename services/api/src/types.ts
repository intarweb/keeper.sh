import type { BunSQLDatabase } from "drizzle-orm/bun-sql";
import type {
  CalendarPauseResult,
  CalendarSource,
  Event as ApiEvent,
  FreeTimeResult,
  Mapping,
  PendingInvite as ApiPendingInvite,
  RsvpStatus,
  SyncDestinationStatus,
  SyncTriggerResult,
  WorkingHours,
} from "@keeper.sh/api-contracts";

type KeeperDatabase = BunSQLDatabase;

interface KeeperEventRangeInput {
  from: Date | string;
  to: Date | string;
}

interface KeeperEventFilters {
  calendarId?: string[];
  availability?: string[];
  isAllDay?: boolean;
}

type KeeperSource = CalendarSource;

interface KeeperDestination {
  id: string;
  provider: string;
  email: string | null;
  needsReauthentication: boolean;
}

type KeeperMapping = Mapping;

type KeeperEvent = ApiEvent & {
  availability: "busy" | "free";
  isAllDay: boolean;
};

interface KeeperFreeTimeOptions {
  durationMinutes: number;
  timezone: string;
  workingHours: WorkingHours | null;
  ignoreAllDayEvents: boolean;
  limit: number;
}

type KeeperFreeTimeResult = FreeTimeResult;

type KeeperSyncTriggerResult = SyncTriggerResult;

type KeeperCalendarPauseResult = CalendarPauseResult;

type KeeperSyncStatus = SyncDestinationStatus;

interface EventInput {
  calendarId: string;
  title: string;
  description?: string;
  location?: string;
  startTime: string;
  endTime: string;
  isAllDay?: boolean;
  availability?: "busy" | "free";
  startTimeZone?: string;
}

interface EventUpdateInput {
  title?: string;
  description?: string;
  location?: string;
  startTime?: string;
  endTime?: string;
  isAllDay?: boolean;
  availability?: "busy" | "free";
  startTimeZone?: string;
}

interface EventActionResult {
  success: boolean;
  error?: string;
}

interface ProviderEventReference {
  occurrenceStart?: Date | null;
  sourceEventId: string | null;
  sourceEventUid: string;
}

interface EventCreateResult extends EventActionResult {
  event?: KeeperEvent;
}

type PendingInvite = ApiPendingInvite;

interface ProviderCredentials {
  provider: string;
  calendarId: string;
  accountId: string;
  externalCalendarId: string | null;
  calendarUrl: string | null;
  email: string | null;
  oauth?: {
    credentialId: string;
    accessToken: string;
    refreshToken: string;
    expiresAt: Date;
  };
  caldav?: {
    authMethod: string;
    serverUrl: string;
    username: string;
    encryptedPassword: string;
  };
}

interface KeeperApi {
  listSources: (userId: string) => Promise<KeeperSource[]>;
  listDestinations: (userId: string) => Promise<KeeperDestination[]>;
  listMappings: (userId: string) => Promise<KeeperMapping[]>;
  getEventsInRange: (userId: string, range: KeeperEventRangeInput, filters?: KeeperEventFilters) => Promise<KeeperEvent[]>;
  getEvent: (userId: string, eventId: string) => Promise<KeeperEvent | null>;
  getEventCount: (userId: string, options?: { from: Date; to: Date }) => Promise<number>;
  findFreeTime: (
    userId: string,
    range: KeeperEventRangeInput,
    options: KeeperFreeTimeOptions,
    filters?: KeeperEventFilters,
  ) => Promise<KeeperFreeTimeResult>;
  getSyncStatuses: (userId: string) => Promise<KeeperSyncStatus[]>;
  createEvent: (userId: string, input: EventInput) => Promise<EventCreateResult>;
  updateEvent: (userId: string, eventId: string, updates: EventUpdateInput) => Promise<EventActionResult>;
  deleteEvent: (userId: string, eventId: string) => Promise<EventActionResult>;
  rsvpEvent: (userId: string, eventId: string, status: RsvpStatus) => Promise<EventActionResult>;
  rsvpInvite: (
    userId: string,
    calendarId: string,
    sourceEventUid: string,
    sourceEventId: string | null,
    status: RsvpStatus,
    occurrenceStart: Date | null,
  ) => Promise<EventActionResult>;
  getPendingInvites: (userId: string, calendarId: string, from: string, to: string) => Promise<PendingInvite[]>;
}

export type {
  EventActionResult,
  EventCreateResult,
  EventInput,
  EventUpdateInput,
  KeeperApi,
  KeeperCalendarPauseResult,
  KeeperDatabase,
  KeeperDestination,
  KeeperEvent,
  KeeperEventFilters,
  KeeperEventRangeInput,
  KeeperFreeTimeOptions,
  KeeperFreeTimeResult,
  KeeperMapping,
  KeeperSyncTriggerResult,
  KeeperSource,
  KeeperSyncStatus,
  PendingInvite,
  ProviderCredentials,
  ProviderEventReference,
  RsvpStatus,
};
