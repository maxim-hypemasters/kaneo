import type { TimeOffRequest, TimeOffType } from "@/fetchers/time-off/types";

// The member picker's value for "Me": your own request needs no userId.
export const SELF = "me";

// What the request dialog edits. Dates are YYYY-MM-DD, null until picked.
// `member` is SELF or another member's user id, null until chosen.
export type TimeOffFormValues = {
  type: TimeOffType;
  startDate: string | null;
  endDate: string | null;
  note: string;
  member: string | null;
};

export function timeOffFormValues(
  request: TimeOffRequest | null,
  canRequestForSelf: boolean,
): TimeOffFormValues {
  if (request) {
    return {
      type: request.type,
      startDate: request.startDate,
      endDate: request.endDate,
      note: request.note ?? "",
      member: request.userId,
    };
  }
  return {
    type: "vacation",
    startDate: null,
    endDate: null,
    note: "",
    // An approver without time_off:create can only record for others.
    member: canRequestForSelf ? SELF : null,
  };
}
