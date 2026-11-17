import type { HolidayCalendarCode } from "./catalog";
import { sameHolidayCalendar } from "./same-holiday-calendar";

export type HolidayCalendarChoicePlan = {
  // Write the target as the member's calendar row.
  write: boolean;
  // What happens to the member's pending request: "keep" leaves it as is,
  // "none" means there is none before or after.
  request: "none" | "keep" | "create" | "update" | "cancel" | "approve";
  status: "applied" | "pending";
};

// What one calendar choice does, given the change mode. A row of any kind is
// the choice made; without one, even "No calendar" is a choice to record.
// A member re-sending their current calendar withdraws their own request; an
// approver re-saving another member's unchanged calendar leaves it alone, and
// an approver applying exactly the target asked for approves it.
export function planHolidayCalendarChoice(input: {
  mode: "apply" | "request";
  forSelf: boolean;
  canApprove: boolean;
  chosen: boolean;
  current: HolidayCalendarCode | null;
  // The pending request's target, or undefined without a pending request.
  pending: HolidayCalendarCode | null | undefined;
  target: HolidayCalendarCode | null;
}): HolidayCalendarChoicePlan {
  const { mode, forSelf, canApprove, chosen, current, pending, target } = input;
  const hasPending = pending !== undefined;
  const unchanged = chosen && sameHolidayCalendar(current, target);
  if (mode === "apply") {
    if (unchanged)
      return {
        write: false,
        status: "applied",
        request: !hasPending ? "none" : forSelf ? "cancel" : "keep",
      };
    return {
      write: true,
      status: "applied",
      request: !hasPending
        ? "none"
        : canApprove && sameHolidayCalendar(pending, target)
          ? "approve"
          : "cancel",
    };
  }
  if (unchanged)
    return {
      write: false,
      status: "applied",
      request: hasPending ? "cancel" : "none",
    };
  if (!hasPending)
    return { write: false, status: "pending", request: "create" };
  return {
    write: false,
    status: "pending",
    request: sameHolidayCalendar(pending, target) ? "keep" : "update",
  };
}
