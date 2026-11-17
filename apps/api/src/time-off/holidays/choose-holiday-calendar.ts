import db from "../../database";
import { retryTransaction } from "../../utils/retry-transaction";
import { assertWorkspaceMember, lockTimeOffMember } from "../access";
import {
  publishHolidayCalendarChange,
  publishHolidayCalendarRequestChange,
} from "../publish-time-off-change";
import { readHolidayCalendarDeadline } from "../settings/read-holiday-calendar-deadline";
import type { TimeOffViewer } from "../viewer";
import type { HolidayCalendarCode } from "./catalog";
import { holidayCalendarChangeMode } from "./holiday-calendar-change-mode";
import { holidayCalendarCode } from "./holiday-calendar-code";
import { planHolidayCalendarChoice } from "./plan-holiday-calendar-choice";
import { presentHolidayCalendar } from "./present-holiday-calendar";
import { readHolidayCalendarChoice } from "./read-holiday-calendar-choice";
import { presentHolidayCalendarRequest } from "./requests/present-holiday-calendar-request";
import { readPendingHolidayCalendarRequest } from "./requests/read-pending-holiday-calendar-request";
import { writeHolidayCalendarRequest } from "./requests/write-holiday-calendar-request";
import { writeHolidayCalendar } from "./write-holiday-calendar";

// Sets or clears (null) a member's calendar, or turns the change into a
// pending request when it needs approval. The caller has checked who may act
// and that the codes exist. The member lock orders it with time off writes,
// which check working days against the calendar, and with request decisions.
export async function chooseHolidayCalendar(
  viewer: TimeOffViewer,
  userId: string,
  target: HolidayCalendarCode | null,
  lang?: string,
) {
  const { workspaceId } = viewer;
  const outcome = await retryTransaction(() =>
    db.transaction(async (tx) => {
      await lockTimeOffMember(tx, workspaceId, userId);
      await assertWorkspaceMember(tx, workspaceId, userId);
      const choice = await readHolidayCalendarChoice(tx, workspaceId, userId);
      const pending = await readPendingHolidayCalendarRequest(
        tx,
        workspaceId,
        userId,
      );
      const deadline = await readHolidayCalendarDeadline(tx, workspaceId);
      const forSelf = userId === viewer.userId;
      const plan = planHolidayCalendarChoice({
        mode: holidayCalendarChangeMode({
          forSelf,
          canApprove: viewer.canApprove,
          chosen: choice.chosen,
          deadline,
          today: viewer.today,
        }),
        forSelf,
        canApprove: viewer.canApprove,
        chosen: choice.chosen,
        current: choice.calendar,
        pending: pending ? holidayCalendarCode(pending) : undefined,
        target,
      });
      if (plan.write)
        await writeHolidayCalendar(tx, workspaceId, userId, target);
      const request = await writeHolidayCalendarRequest(tx, {
        workspaceId,
        userId,
        actorId: viewer.userId,
        pending,
        action: plan.request,
        target,
      });
      return {
        plan,
        request,
        calendar: plan.write ? target : choice.calendar,
      };
    }),
  );
  const { plan, request, calendar } = outcome;
  if (plan.write) await publishHolidayCalendarChange(workspaceId, userId);
  if (request.changed)
    await publishHolidayCalendarRequestChange({
      workspaceId,
      requestId: request.changed.row.id,
      userId,
      actorId: viewer.userId,
      previousStatus: request.changed.previousStatus,
      status: request.changed.row.status,
    });
  return {
    workspaceId,
    userId,
    status: plan.status,
    calendar: presentHolidayCalendar(calendar, lang),
    pendingRequest: request.pending
      ? presentHolidayCalendarRequest(request.pending, lang)
      : null,
  };
}
