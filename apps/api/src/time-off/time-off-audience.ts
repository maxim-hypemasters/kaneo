import type { TimeOffStatus } from "./time-off-kinds";

// Who refetches time off after a change. Approved time off is the public
// who-and-when, so a change into or out of approved reaches the whole
// workspace, as do settings and applied holiday calendar changes. Pending and
// declined requests, and every holiday calendar request, stay with the
// requester and approvers.
export type TimeOffAudience = "workspace" | "approvers";

export type TimeOffAudienceChange =
  | { kind: "settings" }
  | { kind: "holiday-calendar" }
  | { kind: "holiday-calendar-request" }
  | {
      kind: "request";
      previousStatus: TimeOffStatus | null;
      status: TimeOffStatus;
    };

export function timeOffAudience(
  change: TimeOffAudienceChange,
): TimeOffAudience {
  if (change.kind === "holiday-calendar-request") return "approvers";
  if (change.kind !== "request") return "workspace";
  return change.previousStatus === "approved" || change.status === "approved"
    ? "workspace"
    : "approvers";
}

// The unique user ids to tell. `memberIds` are the current members, so a
// requester who was just removed is left out.
export function timeOffAudienceRecipients(input: {
  audience: TimeOffAudience;
  memberIds: readonly string[];
  approverIds: readonly string[];
  requesterId: string | null;
}): string[] {
  const { audience, memberIds, approverIds, requesterId } = input;
  if (audience === "workspace") return [...new Set(memberIds)];
  const recipients = new Set(approverIds);
  if (requesterId && memberIds.includes(requesterId))
    recipients.add(requesterId);
  return [...recipients];
}
