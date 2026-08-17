type MobilePlatform = "android" | "ios";
type MobileNotificationType =
  | "calendar_invite"
  | "reauthentication_required"
  | "sync_failed";

interface MobileDeepLink {
  path: "/accounts" | "/accounts/[id]" | "/calendar" | "/invitations";
  params?: Record<string, string>;
}

interface ReauthenticationNotificationPayload {
  accountId: string;
  deepLink: MobileDeepLink;
  provider: string;
}

interface SyncFailedNotificationPayload {
  accountId?: string;
  calendarId?: string;
  deepLink: MobileDeepLink;
}

interface CalendarInviteNotificationPayload {
  calendarId: string;
  deepLink: MobileDeepLink;
  sourceEventUid: string;
}

type MobileNotificationPayload =
  | CalendarInviteNotificationPayload
  | ReauthenticationNotificationPayload
  | SyncFailedNotificationPayload;

export type {
  CalendarInviteNotificationPayload,
  MobileDeepLink,
  MobileNotificationPayload,
  MobileNotificationType,
  MobilePlatform,
  ReauthenticationNotificationPayload,
  SyncFailedNotificationPayload,
};
