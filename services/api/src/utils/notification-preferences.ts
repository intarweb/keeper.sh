import type { MobileNotificationType } from "@/mobile/contracts";

const preferenceColumn = {
  calendar_invite: "invites",
  reauthentication_required: "reauthentication",
  sync_failed: "syncFailures",
} as const;

const isNotificationEnabled = (
  preferences: {
    invites: boolean;
    reauthentication: boolean;
    syncFailures: boolean;
  } | undefined,
  type: MobileNotificationType,
): boolean => preferences?.[preferenceColumn[type]] ?? true;

export { isNotificationEnabled };
