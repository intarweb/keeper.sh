export function summarizeInvitationResults<T>(
  results: PromiseSettledResult<T[]>[],
): { items: T[]; failed: number } {
  const items: T[] = [];
  let failed = 0;
  for (const result of results) {
    if (result.status === "fulfilled") items.push(...result.value);
    else failed += 1;
  }
  return { items, failed };
}

export interface InvitationIdentity {
  calendarId: string;
  sourceEventUid: string;
  startTime: string;
}

export function invitationOccurrenceKey(invite: InvitationIdentity): string {
  return `${invite.calendarId}:${invite.sourceEventUid}:${invite.startTime}`;
}

export function removeInvitationOccurrence<T extends InvitationIdentity>(
  items: T[],
  removed: InvitationIdentity,
): T[] {
  const key = invitationOccurrenceKey(removed);
  return items.filter((item) => invitationOccurrenceKey(item) !== key);
}
