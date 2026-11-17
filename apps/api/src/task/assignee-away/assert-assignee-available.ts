import { inArray } from "drizzle-orm";
import { projectTable } from "../../database/schema";
import type { TimeOffTransaction } from "../../time-off/access";
import { readBlockedDays } from "../../time-off/read-blocked-days";
import { availabilityChecks, type DatedWork } from "./availability-checks";
import { type CheckedDay, checkedDays, yearWindows } from "./checked-days";
import { taskAssigneeAwayError } from "./task-assignee-away-error";

export type AvailabilityChange = {
  taskId: string;
  projectId: string;
  before: DatedWork;
  after: DatedWork;
};

// Refuses writes that put a start or due date set by hand on a day the
// assignee is away: approved time off of any type, or a public holiday of
// their calendar. Pending requests never block, so the error never reveals
// one. A date is read on the calendar of `timeZone`, the zone it was picked
// in (the web app sends the browser's), else the project's planning zone,
// else UTC.
//
// Runs on the caller's `tx` only, inside its locked transaction. It takes no
// time-off lock: an approval committed right after this check leaves the
// same state as approving time off over existing work, which is allowed, and
// locking the member here would add a lock order against the task row locks
// for no gain.
export async function assertAssigneeAvailable(
  tx: TimeOffTransaction,
  changes: readonly AvailabilityChange[],
  timeZone?: string,
) {
  const checks = changes.flatMap((change) => {
    const check = availabilityChecks(change.before, change.after);
    return check ? [{ ...change, ...check }] : [];
  });
  if (!checks.length) return;

  const projects = new Map(
    (
      await tx
        .select({
          id: projectTable.id,
          workspaceId: projectTable.workspaceId,
          planningTimeZone: projectTable.planningTimeZone,
        })
        .from(projectTable)
        .where(
          inArray(projectTable.id, [
            ...new Set(checks.map((c) => c.projectId)),
          ]),
        )
    ).map((project) => [project.id, project]),
  );
  const daysByWorkspace = new Map<string, CheckedDay[]>();
  for (const check of checks) {
    const project = projects.get(check.projectId);
    if (!project) continue;
    const days = checkedDays({
      ...check,
      timeZone: timeZone ?? project.planningTimeZone ?? "UTC",
    });
    daysByWorkspace.set(project.workspaceId, [
      ...(daysByWorkspace.get(project.workspaceId) ?? []),
      ...days,
    ]);
  }

  const conflicts: CheckedDay[] = [];
  for (const [workspaceId, days] of daysByWorkspace) {
    for (const window of yearWindows(days.map((day) => day.day))) {
      const inWindow = days.filter(
        (day) => day.day >= window.from && day.day <= window.to,
      );
      const blocked = await readBlockedDays(
        tx,
        workspaceId,
        inWindow.map((day) => day.assigneeId),
        window,
      );
      conflicts.push(
        ...inWindow.filter((day) => blocked.get(day.assigneeId)?.has(day.day)),
      );
    }
  }
  if (conflicts.length) throw taskAssigneeAwayError(conflicts);
}
