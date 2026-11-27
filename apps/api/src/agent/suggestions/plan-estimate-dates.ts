import db from "../../database";
import { addDays, localDate } from "../../scheduling/engine/zoned-time";
import {
  FIT_HORIZON_DAYS,
  type FittedDates,
  fitTaskDates,
} from "../../scheduling/fit-task-dates";
import { readAssigneeReservations } from "../../scheduling/read-assignee-reservations";
import { readBlockedDays } from "../../time-off/read-blocked-days";

// Start and due dates for `minutes` of the assignee's working effort from
// now: Monday–Friday 09:00–17:00 in `timeZone` (the project's planning zone),
// around their days away (approved time off and public holidays) and their
// other open, dated work. Null when it doesn't fit within a year.
export async function planEstimateDates({
  workspaceId,
  assigneeId,
  minutes,
  timeZone = "UTC",
  excludeTaskId,
  now = new Date(),
}: {
  workspaceId: string;
  assigneeId: string;
  minutes: number;
  timeZone?: string;
  excludeTaskId?: string;
  now?: Date;
}): Promise<FittedDates | null> {
  if (!(minutes > 0)) return null;
  // The whole horizon, with a day either side for local days around it.
  const from = addDays(localDate(now.getTime(), timeZone), -1);
  return db.transaction(
    async (tx) => {
      const blocked = await readBlockedDays(tx, workspaceId, [assigneeId], {
        from,
        to: addDays(from, FIT_HORIZON_DAYS + 2),
      });
      const reservations = await readAssigneeReservations(tx, {
        workspaceId,
        assigneeId,
        excludeTaskId,
        now,
      });
      return fitTaskDates({
        minutes,
        now,
        timeZone,
        blockedDays: blocked.get(assigneeId) ?? [],
        reservations,
      });
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}
